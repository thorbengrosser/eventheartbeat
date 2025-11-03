/* eslint-disable no-console */
// Lightweight step player for ABC tunes. Uses abcjs only to parse notes, then
// plays a simple WebAudio tone per note when playNextNote is called.

import ABCJS from 'abcjs';
import Soundfont from 'soundfont-player';

const API_BASE_URL = process.env.REACT_APP_API_URL || window.location.origin;

// Singleton state
const state = {
  audioContext: null,
  volume: 0.25,
  notes: [], // array of { midi: number, seconds: number }
  cursor: 0,
  currentSong: null,
  piano: null,
  // FX chain
  masterGain: null,
  dryGain: null,
  wetGain: null,
  convolver: null,
};
function getSettingBool(key, fallback) {
  const v = localStorage.getItem(key);
  if (v === null) return fallback;
  return v === 'true';
}

function getSettingNumber(key, fallback, min = 0, max = 1) {
  const v = localStorage.getItem(key);
  if (v === null) return fallback;
  const n = parseFloat(v);
  if (Number.isNaN(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function ensureFxChain(ctx) {
  if (!state.masterGain) {
    state.masterGain = ctx.createGain();
    state.masterGain.gain.value = 1;
    state.masterGain.connect(ctx.destination);
  }
  if (!state.dryGain) {
    state.dryGain = ctx.createGain();
    state.dryGain.gain.value = 1;
    state.dryGain.connect(state.masterGain);
  }
  if (!state.wetGain) {
    state.wetGain = ctx.createGain();
    state.wetGain.gain.value = 0; // default off
    state.wetGain.connect(state.masterGain);
  }
  if (!state.convolver) {
    state.convolver = ctx.createConvolver();
    state.convolver.normalize = true;
    // Generate a tiny room impulse response (mono) programmatically
    const seconds = 1.2;
    const rate = ctx.sampleRate;
    const len = Math.floor(seconds * rate);
    const ir = ctx.createBuffer(2, len, rate);
    for (let ch = 0; ch < 2; ch++) {
      const data = ir.getChannelData(ch);
      for (let i = 0; i < len; i++) {
        // Exponential decay white noise
        const decay = Math.pow(1 - i / len, 3.0);
        data[i] = (Math.random() * 2 - 1) * decay * 0.6;
      }
    }
    state.convolver.buffer = ir;
    state.convolver.connect(state.wetGain);
  }
}

function applyFxSettingsFromStorage() {
  const reverbEnabled = getSettingBool('eventmobi_reverb_enabled', false);
  const reverbWet = getSettingNumber('eventmobi_reverb_wet', 0.15, 0, 1);
  if (state.wetGain) state.wetGain.gain.value = reverbEnabled ? reverbWet : 0;
}

function createPerNoteEnvelope(ctx, baseNode, durationSec) {
  // Wrap the note output with its own gain for ADSR
  const gain = ctx.createGain();
  gain.gain.value = 0.0001;
  baseNode.connect(gain);
  // Envelope (soft attack/release) – optional toggle
  const envelopeEnabled = getSettingBool('eventmobi_envelope_enabled', true);
  const now = ctx.currentTime;
  const attack = envelopeEnabled ? 0.01 : 0.0;
  const release = envelopeEnabled ? Math.min(0.4, Math.max(0.08, durationSec * 0.6)) : 0.0;
  // Attack
  if (attack > 0) {
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.001, state.volume), now + attack);
  } else {
    gain.gain.setValueAtTime(Math.max(0.001, state.volume), now);
  }
  // Release starting near note end
  const endTime = now + Math.max(0.05, durationSec);
  if (release > 0) {
    gain.gain.setValueAtTime(Math.max(0.001, state.volume), endTime - release);
    gain.gain.exponentialRampToValueAtTime(0.0001, endTime);
  }
  return gain;
}

function getOrCreateAudioContext() {
  if (typeof window === 'undefined') return null;
  if (window.__heartbeatAudioContext && window.__heartbeatAudioContext.state !== 'closed') {
    return window.__heartbeatAudioContext;
  }
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    const ctx = new Ctx();
    window.__heartbeatAudioContext = ctx;
    return ctx;
  } catch (_e) {
    return null;
  }
}

function midiToFreq(midi) {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

// Simple ABC note parser (lightweight fallback) to extract pitches and basic durations.
function parseAbcSimple(abcText) {
  const lines = abcText.split(/\r?\n/);
  let defaultLen = { num: 1, den: 8 }; // L:1/8 default
  // Tempo defaults: Q: 1/4=120 if not provided
  let qNote = { num: 1, den: 4 };
  let qBpm = 120;
  // Try to read L: header
  for (const ln of lines) {
    if (ln.startsWith('L:')) {
      const m = ln.slice(2).trim().match(/(\d+)\/(\d+)/);
      if (m) {
        defaultLen = { num: parseInt(m[1], 10), den: parseInt(m[2], 10) };
      }
    }
    if (ln.startsWith('Q:')) {
      const qraw = ln.slice(2).trim();
      // Patterns: "1/4=90" or just "90"
      let m1 = qraw.match(/(\d+)\/(\d+)\s*=\s*(\d+)/);
      if (m1) {
        qNote = { num: parseInt(m1[1], 10), den: parseInt(m1[2], 10) };
        qBpm = parseInt(m1[3], 10);
      } else {
        let m2 = qraw.match(/(\d+)/);
        if (m2) {
          qNote = { num: 1, den: 4 };
          qBpm = parseInt(m2[1], 10);
        }
      }
    }
  }

  const content = lines.filter(l => !/^[A-Z]:/.test(l.trim())).join(' ');
  const tokenRe = /([_=^]{1,2}|=)?([A-Ga-g])([',]*)(\d+(?:\/\d+)?|\/\d+|\/+)?/g;
  const baseMidi = { C:60, D:62, E:64, F:65, G:67, A:69, B:71 };
  const notes = [];

  function durationFromToken(tok) {
    // Very rough: scale around a base of ~0.3s using default L
    if (!tok) return 0.3;
    if (tok === '/') return 0.15;
    if (/^\/+$/ .test(tok)) return 0.15 / tok.length;
    const m = tok.match(/^(\d+)(?:\/(\d+))?$/);
    if (!m) return 0.3;
    const n = parseInt(m[1], 10);
    const d = m[2] ? parseInt(m[2], 10) : 1;
    const frac = n / d;
    const base = defaultLen.num / defaultLen.den; // relative to whole note
    // Compute seconds per whole note using Q: note = bpm
    const qFraction = qNote.num / qNote.den; // e.g., 1/4 = 0.25
    const secPerQNote = 60 / Math.max(30, Math.min(300, qBpm)); // clamp to sane range
    const secPerWhole = (1 / qFraction) * secPerQNote;
    return Math.max(0.08, Math.min(1.5, secPerWhole * base * frac));
  }

  let m;
  while ((m = tokenRe.exec(content)) !== null) {
    const accidental = m[1] || '';
    const letter = m[2];
    const octMods = m[3] || '';
    const durTok = m[4] || '';
    const isLower = letter === letter.toLowerCase();
    const base = baseMidi[letter.toUpperCase()];
    if (base == null) continue;
    let midi = base + (isLower ? 12 : 0);
    // Apostrophes up, commas down
    for (const ch of octMods) {
      if (ch === "'") midi += 12;
      else if (ch === ',') midi -= 12;
    }
    // Accidentals
    if (accidental === '^') midi += 1;
    else if (accidental === '^^') midi += 2;
    else if (accidental === '_') midi -= 1;
    else if (accidental === '__') midi -= 2;
    // '=' natural: no change from base

    const seconds = durationFromToken(durTok);
    notes.push({ midi, seconds });
  }

  return notes;
}

async function loadAbcFromFilename(filename) {
  const url = `${API_BASE_URL}/api/songs/${encodeURIComponent(filename)}`;
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`Failed to load song: ${resp.status}`);
  return resp.text();
}

async function parseAbcToNotes(abcText) {
  // Prefer simple parser to avoid heavy synth init; fallback to ABCJS visual if simple parse fails
  const simple = parseAbcSimple(abcText);
  if (simple && simple.length > 0) return simple;
  // If simple parsing yields nothing, return empty list (skip heavy synth path)
  return [];
}

function playTone(midi, durationSec) {
  const ctx = state.audioContext || getOrCreateAudioContext();
  if (!ctx) return;
  state.audioContext = ctx;
  if (ctx.state === 'suspended') {
    try { ctx.resume(); } catch (_e) {}
  }
  const now = ctx.currentTime;
  const oscillator = ctx.createOscillator();
  const gain = ctx.createGain();
  oscillator.type = 'sine';
  oscillator.frequency.value = midiToFreq(midi);
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.linearRampToValueAtTime(state.volume, now + 0.01);
  // quick decay to emulate a plucked/piano-like envelope
  const length = Math.max(0.1, Math.min(1.0, durationSec || 0.3));
  gain.gain.exponentialRampToValueAtTime(0.0001, now + length);
  oscillator.connect(gain);
  gain.connect(ctx.destination);
  oscillator.start(now);
  oscillator.stop(now + length + 0.02);
}

const SymphonyPlayer = {
  async init(filename) {
    try {
      state.audioContext = getOrCreateAudioContext();
      ensureFxChain(state.audioContext);
      applyFxSettingsFromStorage();
      // Lazy-load a grand piano instrument
      try {
        if (!state.piano) {
          // Use MusyngKite soundfont set; fallback handled by library
          state.piano = await Soundfont.instrument(state.audioContext, 'acoustic_grand_piano', {
            soundfont: 'MusyngKite',
            gain: 1,
          });
        }
      } catch (instErr) {
        console.warn('Piano instrument load failed, using sine fallback:', instErr);
        state.piano = null;
      }
      const abc = await loadAbcFromFilename(filename);
      const notes = await parseAbcToNotes(abc);
      state.notes = notes;
      state.cursor = 0;
      state.currentSong = filename;
      console.log(`SymphonyPlayer loaded ${notes.length} notes from`, filename);
      return notes.length > 0;
    } catch (e) {
      console.error('SymphonyPlayer init failed:', e);
      state.notes = [];
      state.cursor = 0;
      return false;
    }
  },
  async playNextNote() {
    if (!state.notes || state.notes.length === 0) return;
    const idx = state.cursor % state.notes.length;
    const { midi, seconds } = state.notes[idx];
    state.cursor = (idx + 1) % state.notes.length;
    if (typeof midi === 'number') {
      const ctx = state.audioContext || getOrCreateAudioContext();
      state.audioContext = ctx;
      if (ctx && ctx.state === 'suspended') {
        try { await ctx.resume(); } catch (_e) {}
      }
      ensureFxChain(ctx);
      applyFxSettingsFromStorage();
      if (state.piano && ctx) {
        try {
          const when = ctx.currentTime;
          const dur = Math.max(0.1, seconds || 0.3);
          // Route through per-note envelope and FX
          const player = state.piano.play(midi, when, { gain: 1 });
          // player has connect() – treat as AudioNode-like
          const noteGain = createPerNoteEnvelope(ctx, player, dur);
          // Split to dry and wet paths
          noteGain.connect(state.dryGain);
          noteGain.connect(state.convolver);
          // Schedule stop
          try { if (player.stop) player.stop(when + dur + 0.05); } catch (_e) {}
          try { console.log('SymphonyPlayer piano note', { idx, midi, seconds, volume: state.volume }); } catch (_e) {}
        } catch (_e) {
          playTone(midi, seconds || 0.3);
        }
      } else {
        playTone(midi, seconds || 0.3);
      }
      try { console.log('SymphonyPlayer play note', { idx, midi, seconds }); } catch (_e) {}
    }
  },
  setVolume(v) {
    const clamped = Math.max(0, Math.min(1, v));
    state.volume = clamped;
    // soundfont-player notes use passed gain per note; nothing persistent to update
  },
  getState() {
    return { ...state };
  }
};

export default SymphonyPlayer;


