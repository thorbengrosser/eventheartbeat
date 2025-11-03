import React, { useState, useEffect } from 'react';
import './SettingsPanel.css';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:5001';

function SettingsPanel({ 
  isOpen, 
  onClose, 
  currentApiKey, 
  currentEventId, 
  currentEventName,
  currentWebhookBaseUrl,
  currentSoundEnabled,
  currentSoundMode,
  currentSymphonySong,
  currentBubblesEnabled,
  currentStatsEnabled,
  currentSessionCountsEnabled,
  onSettingsUpdate 
}) {
  const [apiKey, setApiKey] = useState(currentApiKey || '');
  const [events, setEvents] = useState([]);
  const [selectedEventId, setSelectedEventId] = useState(currentEventId || '');
  const [webhookBaseUrl, setWebhookBaseUrl] = useState(currentWebhookBaseUrl || '');
  const [soundEnabled, setSoundEnabled] = useState(currentSoundEnabled);
  const [soundMode, setSoundMode] = useState(currentSoundMode || (localStorage.getItem('eventmobi_sound_mode') || 'Heartbeat'));
  const [songs, setSongs] = useState([]);
  const [selectedSong, setSelectedSong] = useState(currentSymphonySong || (localStorage.getItem('eventmobi_symphony_song') || ''));
  const [bubblesEnabled, setBubblesEnabled] = useState(currentBubblesEnabled !== false);
  const [statsEnabled, setStatsEnabled] = useState(currentStatsEnabled !== false);
  const [sessionCountsEnabled, setSessionCountsEnabled] = useState(currentSessionCountsEnabled !== false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [eventsLoaded, setEventsLoaded] = useState(false);
  
  // Color customization state
  const [primaryColor, setPrimaryColor] = useState('#667eea');
  const [secondaryColor, setSecondaryColor] = useState('#764ba2');
  const [textColor, setTextColor] = useState('#ffffff');

  // Load saved colors on mount
  useEffect(() => {
    const savedColors = localStorage.getItem('eventmobi_colors');
    if (savedColors) {
      try {
        const colors = JSON.parse(savedColors);
        setPrimaryColor(colors.primary || '#667eea');
        setSecondaryColor(colors.secondary || '#764ba2');
        setTextColor(colors.text || '#ffffff');
        applyColors(colors);
      } catch (e) {
        console.error('Error loading colors:', e);
      }
    }
  }, []);

  // Attempt to unlock/resume audio context when user interacts here
  const unlockAudio = async () => {
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      let ctx = window.__heartbeatAudioContext;
      if (!ctx || ctx.state === 'closed') {
        ctx = new Ctx();
        window.__heartbeatAudioContext = ctx;
      }
      if (ctx.state === 'suspended') {
        await ctx.resume();
      }
      // Optionally play a very short, inaudible blip to cement permission
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      gain.gain.value = 0.0001;
      osc.connect(gain);
      gain.connect(ctx.destination);
      const now = ctx.currentTime;
      osc.start(now);
      osc.stop(now + 0.02);
    } catch (_e) {
      // ignore
    }
  };

  // Reset form fields when panel opens
  useEffect(() => {
    if (isOpen) {
      setApiKey(currentApiKey || '');
      setSelectedEventId(currentEventId || '');
      setWebhookBaseUrl(currentWebhookBaseUrl || '');
      setSoundEnabled(currentSoundEnabled);
      setSoundMode(currentSoundMode || (localStorage.getItem('eventmobi_sound_mode') || 'Heartbeat'));
      setSelectedSong(currentSymphonySong || (localStorage.getItem('eventmobi_symphony_song') || ''));
      setBubblesEnabled(currentBubblesEnabled !== false);
      setStatsEnabled(currentStatsEnabled !== false);
      setSessionCountsEnabled(currentSessionCountsEnabled !== false);
      setError('');
      setSuccess('');
      // Reset events - will be loaded when user clicks "Validate & Load Events"
      setEvents([]);
      setEventsLoaded(false);
      // Preload songs list
      fetch(`${API_BASE_URL}/api/songs`).then(r => r.json()).then(list => {
        if (Array.isArray(list)) setSongs(list);
      }).catch(() => {});
    }
  }, [isOpen]);

  const applyColors = (colors) => {
    document.documentElement.style.setProperty('--primary-color', colors.primary || '#667eea');
    document.documentElement.style.setProperty('--secondary-color', colors.secondary || '#764ba2');
    document.documentElement.style.setProperty('--text-color', colors.text || '#ffffff');
  };

  const handleFetchEvents = async () => {
    if (!apiKey) {
      setError('Please enter an API key first');
      return;
    }

    setError('');
    setSuccess('');
    setLoading(true);

    try {
      // Add timeout to prevent hanging
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout
      
      const response = await fetch(`${API_BASE_URL}/api/setup`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ api_key: apiKey }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to validate API key');
      }

      setEvents(data.events || []);
      setEventsLoaded(true);
      setSuccess('API key validated! Events loaded.');
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      if (err.name === 'AbortError') {
        setError('Request timed out. Please try again.');
      } else {
        setError(err.message);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setError('');
    setSuccess('');
    setLoading(true);

    try {
      // Validate API key first (quick check)
      if (!apiKey || !selectedEventId) {
        setError('API key and event are required');
        setLoading(false);
        return;
      }

      // Save colors first (instant)
      const colors = {
        primary: primaryColor,
        secondary: secondaryColor,
        text: textColor
      };
      localStorage.setItem('eventmobi_colors', JSON.stringify(colors));
      applyColors(colors);

      // Find selected event name
      const selectedEvent = events.find(e => (e.id || e.event_id) === selectedEventId);
      const eventName = selectedEvent ? (selectedEvent.name || selectedEvent.title || selectedEvent.event_name) : currentEventName;

      // Save other settings (instant)
      localStorage.setItem('eventmobi_api_key', apiKey);
      localStorage.setItem('eventmobi_event_id', selectedEventId);
      localStorage.setItem('eventmobi_event_name', eventName || '');
      if (webhookBaseUrl) {
        localStorage.setItem('eventmobi_webhook_base_url', webhookBaseUrl);
      }
      localStorage.setItem('eventmobi_sound_enabled', soundEnabled.toString());
      localStorage.setItem('eventmobi_bubbles_enabled', bubblesEnabled.toString());
      localStorage.setItem('eventmobi_stats_enabled', statsEnabled.toString());
      localStorage.setItem('eventmobi_session_counts_enabled', sessionCountsEnabled.toString());
      localStorage.setItem('eventmobi_sound_mode', soundMode);
      if (selectedSong) {
        localStorage.setItem('eventmobi_symphony_song', selectedSong);
      }

      // Notify parent of changes immediately (don't wait for webhook)
      onSettingsUpdate({
        apiKey,
        eventId: selectedEventId,
        eventName: eventName || currentEventName,
        webhookBaseUrl,
        soundEnabled,
        soundMode,
        symphonySong: selectedSong,
        bubblesEnabled,
        statsEnabled,
        sessionCountsEnabled,
        colors
      });

      setSuccess('Settings saved successfully!');
      
      // Register webhook in background (don't wait for it)
      if (selectedEventId && selectedEventId !== currentEventId) {
        const webhookUrl = webhookBaseUrl.trim() || API_BASE_URL;
        fetch(`${API_BASE_URL}/api/event/${selectedEventId}/register-webhook`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            api_key: apiKey,
            webhook_base_url: webhookUrl,
          }),
        }).then(response => {
          if (!response.ok) {
            return response.json().then(webhookData => {
              console.warn('Webhook registration failed:', webhookData.error || webhookData.message);
            });
          }
          return response.json();
        }).then(webhookData => {
          if (webhookData && !webhookData.success) {
            console.warn('Webhook registration failed:', webhookData.error || webhookData.message);
          }
        }).catch(err => {
          console.warn('Webhook registration error:', err);
        });
      }

      // Close panel immediately after showing success
      setTimeout(() => {
        setSuccess('');
        onClose();
        setLoading(false);
      }, 1000);
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  };

  const handleColorChange = (type, value) => {
    if (type === 'primary') {
      setPrimaryColor(value);
    } else if (type === 'secondary') {
      setSecondaryColor(value);
    } else if (type === 'text') {
      setTextColor(value);
    }

    // Preview colors immediately
    applyColors({
      primary: type === 'primary' ? value : primaryColor,
      secondary: type === 'secondary' ? value : secondaryColor,
      text: type === 'text' ? value : textColor
    });
  };

  if (!isOpen) return null;

  return (
    <div className="settings-overlay" onClick={onClose}>
      <div className="settings-panel" onClick={(e) => e.stopPropagation()}>
        <div className="settings-header">
          <h2>Settings</h2>
          <button className="settings-close-btn" onClick={onClose}>✕</button>
        </div>

        <div className="settings-content">
          {error && <div className="settings-error">{error}</div>}
          {success && <div className="settings-success">{success}</div>}

          <div className="settings-section">
            <h3>API Configuration</h3>
            
            <div className="settings-field">
              <label>EventMobi API Key</label>
              <input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="Enter your EventMobi API key"
                disabled={loading}
              />
              <button 
                onClick={handleFetchEvents} 
                disabled={loading || !apiKey}
                className="btn-secondary btn-sm"
              >
                {loading ? 'Validating...' : 'Validate & Load Events'}
              </button>
            </div>

            <div className="settings-field">
              <label>Event</label>
              <select
                value={selectedEventId}
                onChange={(e) => setSelectedEventId(e.target.value)}
                disabled={loading || events.length === 0}
              >
                <option value="">-- Select an event --</option>
                {events.map((event) => {
                  const id = event.id || event.event_id;
                  const name = event.name || event.title || event.event_name || `Event ${id}`;
                  return (
                    <option key={id} value={id}>
                      {name}
                    </option>
                  );
                })}
              </select>
              {events.length === 0 && apiKey && (
                <small>Click "Validate & Load Events" to load available events</small>
              )}
            </div>

            <div className="settings-field">
              <label>Webhook Base URL (Optional)</label>
              <input
                type="text"
                value={webhookBaseUrl}
                onChange={(e) => setWebhookBaseUrl(e.target.value)}
                placeholder={API_BASE_URL}
                disabled={loading}
              />
              <small>If using ngrok or custom deployment, enter the base URL here</small>
            </div>
          </div>

          <div className="settings-section">
            <h3>Preferences</h3>
            
            <div className="settings-field">
              <label>
                <input
                  type="checkbox"
                  checked={soundEnabled}
                  onChange={async (e) => {
                    setSoundEnabled(e.target.checked);
                    if (e.target.checked) {
                      await unlockAudio();
                    }
                  }}
                  disabled={loading}
                />
                Enable sound notifications
              </label>
            </div>

          <div className="settings-field">
            <label>Sound mode</label>
            <select
              value={soundMode}
              onChange={(e) => setSoundMode(e.target.value)}
              disabled={loading}
            >
              <option value="Heartbeat">Heartbeat</option>
              <option value="Symphony">Symphony</option>
            </select>
          </div>

          {soundMode === 'Symphony' && (
            <div className="settings-field">
              <label>Symphony song</label>
              <select
                value={selectedSong}
                onChange={(e) => setSelectedSong(e.target.value)}
                disabled={loading}
              >
                <option value="">-- Select a song --</option>
                {songs.map((s) => (
                  <option key={s.filename} value={s.filename}>{s.name || s.filename}</option>
                ))}
              </select>
              {(!songs || songs.length === 0) && (
                <small>No songs found. Add .abc files to backend/abc</small>
              )}
            </div>
          )}

          {soundMode === 'Symphony' && (
            <>
              <div className="settings-field">
                <label>
                  <input
                    type="checkbox"
                    defaultChecked={localStorage.getItem('eventmobi_envelope_enabled') !== 'false'}
                    onChange={(e) => localStorage.setItem('eventmobi_envelope_enabled', e.target.checked.toString())}
                    disabled={loading}
                  />
                  Softer piano envelope
                </label>
                <small>Gentle attack/release to smooth note edges</small>
              </div>

              <div className="settings-field">
                <label>
                  <input
                    type="checkbox"
                    defaultChecked={localStorage.getItem('eventmobi_reverb_enabled') === 'true'}
                    onChange={(e) => localStorage.setItem('eventmobi_reverb_enabled', e.target.checked.toString())}
                    disabled={loading}
                  />
                  Enable reverb (room ambience)
                </label>
              </div>

              <div className="settings-field">
                <label>Reverb amount</label>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  defaultValue={localStorage.getItem('eventmobi_reverb_wet') ?? '0.15'}
                  onChange={(e) => localStorage.setItem('eventmobi_reverb_wet', e.target.value)}
                  disabled={loading}
                />
                <small>Adjust wet/dry mix</small>
              </div>
            </>
          )}
         </div>

          <div className="settings-section">
            <h3>Display Features</h3>
            
            <div className="settings-field">
              <label>
                <input
                  type="checkbox"
                  checked={bubblesEnabled}
                  onChange={(e) => setBubblesEnabled(e.target.checked)}
                  disabled={loading}
                />
                Show check-in bubbles
              </label>
              <small>Display animated bubbles when check-ins occur</small>
            </div>

            <div className="settings-field">
              <label>
                <input
                  type="checkbox"
                  checked={statsEnabled}
                  onChange={(e) => setStatsEnabled(e.target.checked)}
                  disabled={loading}
                />
                Show total counts (stats display)
              </label>
              <small>Display total attendees, event check-ins, and session check-ins</small>
            </div>

            <div className="settings-field">
              <label>
                <input
                  type="checkbox"
                  checked={sessionCountsEnabled}
                  onChange={(e) => setSessionCountsEnabled(e.target.checked)}
                  disabled={loading}
                />
                Show session check-in numbers
              </label>
              <small>Display check-in counts on session pills</small>
            </div>
          </div>

          <div className="settings-section">
            <h3>Design Customization</h3>
            
            <div className="settings-field">
              <label>Primary Color</label>
              <div className="color-input-group">
                <input
                  type="color"
                  value={primaryColor}
                  onChange={(e) => handleColorChange('primary', e.target.value)}
                  disabled={loading}
                />
                <input
                  type="text"
                  value={primaryColor}
                  onChange={(e) => handleColorChange('primary', e.target.value)}
                  placeholder="#667eea"
                  disabled={loading}
                  className="color-text-input"
                />
              </div>
            </div>

            <div className="settings-field">
              <label>Secondary Color</label>
              <div className="color-input-group">
                <input
                  type="color"
                  value={secondaryColor}
                  onChange={(e) => handleColorChange('secondary', e.target.value)}
                  disabled={loading}
                />
                <input
                  type="text"
                  value={secondaryColor}
                  onChange={(e) => handleColorChange('secondary', e.target.value)}
                  placeholder="#764ba2"
                  disabled={loading}
                  className="color-text-input"
                />
              </div>
            </div>

            <div className="settings-field">
              <label>Text Color</label>
              <div className="color-input-group">
                <input
                  type="color"
                  value={textColor}
                  onChange={(e) => handleColorChange('text', e.target.value)}
                  disabled={loading}
                />
                <input
                  type="text"
                  value={textColor}
                  onChange={(e) => handleColorChange('text', e.target.value)}
                  placeholder="#ffffff"
                  disabled={loading}
                  className="color-text-input"
                />
              </div>
            </div>
          </div>

          <div className="settings-actions">
            <button
              onClick={onClose}
              disabled={loading}
              className="btn-secondary"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={loading || !apiKey || !selectedEventId}
              className="btn-primary"
            >
              {loading ? 'Saving...' : 'Save Settings'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default SettingsPanel;

