import React, { useState, useEffect } from 'react';
import Setup from './components/Setup';
import StartPage from './components/StartPage';
import VideoModal from './components/VideoModal';
import QuestionsDrawer from './components/QuestionsDrawer';
import ImprintDialog from './components/ImprintDialog';
import Dashboard from './components/Dashboard';
import './styles/App.css';

function App() {
  const [isSetup, setIsSetup] = useState(false);
  const [apiKey, setApiKey] = useState('');
  const [eventId, setEventId] = useState('');
  const [eventName, setEventName] = useState('');
  const [webhookBaseUrl, setWebhookBaseUrl] = useState('');
  const [webhookWarning, setWebhookWarning] = useState('');
  const [showVideo, setShowVideo] = useState(false);
  const [showFAQ, setShowFAQ] = useState(false);
  const [showImprint, setShowImprint] = useState(false);
  const [startAtEventSelection, setStartAtEventSelection] = useState(false);

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
    try { sessionStorage.removeItem('eventHeartbeat:key'); } catch (_) {}
    try { localStorage.removeItem('eventHeartbeat:key'); } catch (_) {}
    setStartAtEventSelection(false);
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
        (() => {
          const storedEphemeral = sessionStorage.getItem('eventHeartbeat:key');
          const storedPersistent = localStorage.getItem('eventHeartbeat:key');
          // If a key exists from StartPage, jump to event selection
          if (startAtEventSelection || storedEphemeral || storedPersistent) {
            const key = storedPersistent || storedEphemeral || '';
            return (
              <Setup
                onSetupComplete={handleSetupComplete}
                initialApiKey={key}
                initialStep={2}
              />
            );
          }
          return (
            <>
              <StartPage
                onContinue={({ apiKey: k, remember }) => {
                  try {
                    const storage = remember ? localStorage : sessionStorage;
                    const other = remember ? sessionStorage : localStorage;
                    storage.setItem('eventHeartbeat:key', k);
                    try { other.removeItem('eventHeartbeat:key'); } catch (_) {}
                  } catch (_) {}
                  setStartAtEventSelection(true);
                }}
                onOpenVideo={() => setShowVideo(true)}
                onOpenFAQ={() => setShowFAQ(true)}
                onOpenImprint={() => setShowImprint(true)}
              />
              {showVideo && (
                <VideoModal
                  onClose={() => setShowVideo(false)}
                  videos={[{
                    id: 'demo',
                    title: 'EventMobi Heartbeat — 45s',
                    provider: 'youtube',
                    src: 'https://www.youtube-nocookie.com/embed/-oWwMIJPX_g?autoplay=1',
                    thumbnail: '/thumbs/heartbeat-demo.jpg',
                    durationLabel: '45s'
                  }]}
                />
              )}
              {showFAQ && (
                <QuestionsDrawer onClose={() => setShowFAQ(false)} />
              )}
              {showImprint && (
                <ImprintDialog onClose={() => setShowImprint(false)} />
              )}
            </>
          );
        })()
      )}
    </div>
  );
}

export default App;

