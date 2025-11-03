import React, { useEffect, useState } from 'react';
import './Setup.css';

const API_BASE_URL = process.env.REACT_APP_API_URL || window.location.origin;

function Setup({ onSetupComplete, initialApiKey, initialStep }) {
  const [apiKey, setApiKey] = useState(initialApiKey || '');
  const [events, setEvents] = useState([]);
  const [selectedEventId, setSelectedEventId] = useState('');
  const [webhookBaseUrl, setWebhookBaseUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [step, setStep] = useState(initialStep === 2 ? 2 : 1); // 1: API key, 2: Event selection

  // If we jump directly to step 2 (StartPage path), fetch events here using stored key
  useEffect(() => {
    if (step !== 2) return;
    const key = (initialApiKey || '').trim() || localStorage.getItem('eventHeartbeat:key') || sessionStorage.getItem('eventHeartbeat:key') || '';
    if (!key) return;
    if (events && events.length > 0) return;
    setApiKey(key);
    setLoading(true);
    setError('');
    fetch(`${API_BASE_URL}/api/setup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ api_key: key })
    })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(data.error || 'Failed to validate API key');
        }
        setEvents(data.events || []);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [step]);

  const handleApiKeySubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const response = await fetch(`${API_BASE_URL}/api/setup`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ api_key: apiKey }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to validate API key');
      }

      setEvents(data.events || []);
      setStep(2);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleEventSelect = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    if (!selectedEventId) {
      setError('Please select an event');
      setLoading(false);
      return;
    }

    // Try to get event name from selected event first
    const selectedEvent = events.find(e => (e.id || e.event_id) === selectedEventId);
    let eventName = selectedEvent ? (selectedEvent.name || selectedEvent.title || selectedEvent.event_name) : '';

    // If we don't have a name, fetch event details from API
    if (!eventName && selectedEventId) {
      try {
        const detailsResponse = await fetch(`${API_BASE_URL}/api/event/${selectedEventId}/details?api_key=${encodeURIComponent(apiKey)}`);
        if (detailsResponse.ok) {
          const detailsData = await detailsResponse.json();
          eventName = detailsData.name || eventName;
        }
      } catch (detailsErr) {
        console.warn('Could not fetch event details:', detailsErr);
        // Continue anyway - we'll use empty name or try to extract from selected event
      }
    }

    try {
      // Register webhook
      const webhookUrl = webhookBaseUrl.trim() || API_BASE_URL;
      const webhookResponse = await fetch(`${API_BASE_URL}/api/event/${selectedEventId}/register-webhook`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          api_key: apiKey,
          webhook_base_url: webhookUrl,
        }),
      });

      const webhookData = await webhookResponse.json();

      // Webhook registration is optional - don't fail setup if it fails
      let webhookWarning = '';
      if (!webhookResponse.ok || !webhookData.success) {
        console.warn('Webhook registration failed:', webhookData.error || webhookData.message);
        console.warn('Webhook response:', webhookData);
        webhookWarning = webhookData.message || 'Webhook registration failed. Real-time updates may not work. You can configure webhooks manually in EventMobi.';
      } else {
        console.log('Webhook registered successfully:', webhookData);
      }

      // Complete setup even if webhook registration failed
      onSetupComplete({
        apiKey,
        eventId: selectedEventId,
        eventName,
        webhookBaseUrl: webhookUrl,
        webhookWarning,
      });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="setup-container">
      <div className="setup-card">
        <h1>EventMobi Heartbeat Setup</h1>
        <p className="setup-subtitle">Configure your real-time event experience</p>
        <div className="setup-info" style={{ marginBottom: '1rem' }}>
          <p>
            This project blends art and live data. Your API key stays in your browser and is sent with each request; it is not stored on the server.
          </p>
          <p style={{ display: 'flex', gap: '0.5rem' }}>
            <a href="#" onClick={(e) => { e.preventDefault(); try { document.querySelector('button.linklike:nth-of-type(2)')?.click(); } catch (_) {} }}>Imprint & Contact</a>
            <span>·</span>
            <a href="#" onClick={(e) => { e.preventDefault(); try { document.querySelector('button.linklike:nth-of-type(1)')?.click(); } catch (_) {} }}>Questions</a>
          </p>
        </div>

        {error && <div className="error-message">{error}</div>}

        {step === 1 && (
          <form onSubmit={handleApiKeySubmit} className="setup-form">
            <div className="form-group">
              <label htmlFor="api-key">EventMobi API Key</label>
              <input
                id="api-key"
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="Enter your EventMobi API key"
                required
                disabled={loading}
              />
              <small>
                You can find your API key in EventMobi's Experience Manager under Integrations
              </small>
            </div>

            <button type="submit" disabled={loading} className="btn-primary">
              {loading ? 'Validating...' : 'Continue'}
            </button>
          </form>
        )}

        {step === 2 && (
          <form onSubmit={handleEventSelect} className="setup-form">
            <div className="form-group">
              <label htmlFor="webhook-url">Webhook Base URL (Optional)</label>
              <input
                id="webhook-url"
                type="text"
                value={webhookBaseUrl}
                onChange={(e) => setWebhookBaseUrl(e.target.value)}
                placeholder={API_BASE_URL}
                disabled={loading}
              />
              <small>
                If using ngrok or custom deployment, enter the base URL here. 
                Defaults to {API_BASE_URL}
              </small>
            </div>

            <div className="form-group">
              <label htmlFor="event-select">Select Event</label>
              <select
                id="event-select"
                value={selectedEventId}
                onChange={(e) => setSelectedEventId(e.target.value)}
                required
                disabled={loading}
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
            </div>

            <div className="form-actions">
              <button
                type="button"
                onClick={() => setStep(1)}
                disabled={loading}
                className="btn-secondary"
              >
                Back
              </button>
              <button type="submit" disabled={loading} className="btn-primary">
                {loading ? 'Setting up...' : 'Start Dashboard'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

export default Setup;

