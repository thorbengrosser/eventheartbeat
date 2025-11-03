import React, { useState, useEffect } from 'react';
import Setup from './components/Setup';
import Dashboard from './components/Dashboard';
import './styles/App.css';

function App() {
  const [isSetup, setIsSetup] = useState(false);
  const [apiKey, setApiKey] = useState('');
  const [eventId, setEventId] = useState('');
  const [eventName, setEventName] = useState('');
  const [webhookBaseUrl, setWebhookBaseUrl] = useState('');
  const [webhookWarning, setWebhookWarning] = useState('');

  useEffect(() => {
    // Check if we have saved setup data
    const savedApiKey = localStorage.getItem('eventmobi_api_key');
    const savedEventId = localStorage.getItem('eventmobi_event_id');
    const savedEventName = localStorage.getItem('eventmobi_event_name');
    const savedWebhookUrl = localStorage.getItem('eventmobi_webhook_base_url');

    if (savedApiKey && savedEventId) {
      setApiKey(savedApiKey);
      setEventId(savedEventId);
      setEventName(savedEventName || '');
      setWebhookBaseUrl(savedWebhookUrl || '');
      setIsSetup(true);
    }
  }, []);

  const handleSetupComplete = (data) => {
    setApiKey(data.apiKey);
    setEventId(data.eventId);
    setEventName(data.eventName);
    setWebhookBaseUrl(data.webhookBaseUrl || '');
    setWebhookWarning(data.webhookWarning || '');
    setIsSetup(true);

    // Save to localStorage
    localStorage.setItem('eventmobi_api_key', data.apiKey);
    localStorage.setItem('eventmobi_event_id', data.eventId);
    localStorage.setItem('eventmobi_event_name', data.eventName || '');
    if (data.webhookBaseUrl) {
      localStorage.setItem('eventmobi_webhook_base_url', data.webhookBaseUrl);
    }
  };

  const handleReset = () => {
    setIsSetup(false);
    setApiKey('');
    setEventId('');
    setEventName('');
    setWebhookBaseUrl('');
    localStorage.removeItem('eventmobi_api_key');
    localStorage.removeItem('eventmobi_event_id');
    localStorage.removeItem('eventmobi_event_name');
    localStorage.removeItem('eventmobi_webhook_base_url');
  };

  return (
    <div className="App">
      {isSetup ? (
        <Dashboard
          apiKey={apiKey}
          eventId={eventId}
          eventName={eventName}
          webhookBaseUrl={webhookBaseUrl}
          webhookWarning={webhookWarning}
          onReset={handleReset}
        />
      ) : (
        <Setup onSetupComplete={handleSetupComplete} />
      )}
    </div>
  );
}

export default App;

