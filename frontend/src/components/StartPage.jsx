import React, { useEffect, useRef, useState } from 'react';
import './StartPage.css';

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onChange = () => setReduced(!!mq.matches);
    onChange();
    try { mq.addEventListener('change', onChange); } catch (_) { mq.addListener(onChange); }
    return () => {
      try { mq.removeEventListener('change', onChange); } catch (_) { mq.removeListener(onChange); }
    };
  }, []);
  return reduced;
}

export default function StartPage({ onContinue, onOpenVideo, onOpenFAQ, onOpenImprint }) {
  const [apiKey, setApiKey] = useState('');
  const [reveal, setReveal] = useState(false);
  const [remember, setRemember] = useState(false);
  const [error, setError] = useState('');
  const reducedMotion = usePrefersReducedMotion();
  const videoBtnRef = useRef(null);

  useEffect(() => {
    // Gentle pulse for the demo button once on first render
    if (reducedMotion) return;
    const btn = videoBtnRef.current;
    if (!btn) return;
    btn.classList.add('pulse-once');
    const t = setTimeout(() => btn.classList.remove('pulse-once'), 1200);
    return () => clearTimeout(t);
  }, [reducedMotion]);

  const handleSubmit = (e) => {
    e.preventDefault();
    const trimmed = (apiKey || '').trim();
    if (!trimmed) {
      setError('Please enter an API key to continue.');
      return;
    }
    setError('');
    try {
      const selectedStorage = remember ? window.localStorage : window.sessionStorage;
      const otherStorage = remember ? window.sessionStorage : window.localStorage;
      selectedStorage.setItem('eventHeartbeat:key', trimmed);
      // Clear from the other storage to avoid ambiguity
      try { otherStorage.removeItem('eventHeartbeat:key'); } catch (_) {}
    } catch (_) {}
    if (typeof onContinue === 'function') {
      onContinue({ apiKey: trimmed, remember });
    }
  };

  return (
    <div className="start-app" role="application">
      <div className="gradient" aria-hidden="true" />
      <main className="start-main">
        <header className="brand-header">
          <h1>EventMobi Heartbeat</h1>
          <p className="tagline">A living dashboard that plays a heartbeat or musical notes for every check-in.</p>
          <p className="sub">Blend art with live event data. Your API key remains in your browser and is sent only with requests.</p>
        </header>

        <form className="setup-card" onSubmit={handleSubmit}>
          <div className="form-row">
            <label htmlFor="key">EventMobi API Key</label>
            <div className="input-row">
              <input
                id="key"
                type={reveal ? 'text' : 'password'}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                aria-describedby="key-help key-err"
                autoComplete="off"
                required
              />
              <button type="button" className="btn-ghost" aria-pressed={reveal}
                aria-label={reveal ? 'Hide API key' : 'Show API key'}
                onClick={() => setReveal(v => !v)}>
                {reveal ? 'Hide' : 'Show'}
              </button>
              <button type="button" className="btn-ghost" onClick={async () => {
                try { const t = await navigator.clipboard.readText(); if (t) setApiKey(t); } catch (_) {}
              }}>Paste</button>
              {apiKey ? <button type="button" className="btn-ghost" onClick={() => setApiKey('')}>Clear</button> : null}
            </div>
            <p id="key-help" className="helper">Find your key in EventMobi’s Experience Manager → Integrations.</p>
            {error ? <p id="key-err" role="alert" className="error">{error}</p> : null}
          </div>

          <label className="remember">
            <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
            Keep my key on this device
          </label>

          <div className="actions">
            <button type="submit" className="btn-primary">Continue</button>
            <button type="button" ref={videoBtnRef} className="btn-secondary" onClick={() => onOpenVideo?.()} aria-haspopup="dialog">
              Watch a 45-second demo
            </button>
          </div>

          <p className="audio-note">We’ll ask to enable sound after you continue; browsers need a click to play audio.</p>
        </form>

        <footer className="footer-links">
          <button type="button" className="linklike" onClick={() => onOpenFAQ?.()}>Questions</button>
          <button type="button" className="linklike" onClick={() => onOpenImprint?.()}>Imprint & Contact</button>
        </footer>
      </main>
    </div>
  );
}


