import React, { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import StatsDisplay from './StatsDisplay';
import BubbleAnimation from './BubbleAnimation';
import SessionList from './SessionList';
import SettingsPanel from './SettingsPanel';
import './Dashboard.css';
import SymphonyPlayer from './SymphonyPlayer';

const API_BASE_URL = process.env.REACT_APP_API_URL || window.location.origin;
const IS_DEV = process.env.NODE_ENV !== 'production';

function Dashboard({ apiKey, eventId, eventName, webhookBaseUrl, webhookWarning, onReset }) {
  // Load from localStorage if props not provided or empty
  // Check both prop value and localStorage, preferring prop but falling back to localStorage
  const [currentApiKey, setCurrentApiKey] = useState(() => {
    const fromProp = apiKey || '';
    const fromStorage = localStorage.getItem('eventmobi_api_key') || '';
    return fromProp || fromStorage;
  });
  const [currentEventId, setCurrentEventId] = useState(() => {
    const fromProp = eventId || '';
    const fromStorage = localStorage.getItem('eventmobi_event_id') || '';
    return fromProp || fromStorage;
  });
  const [currentEventName, setCurrentEventName] = useState(() => {
    // Always check localStorage first (it's the source of truth)
    // Props might be empty initially if App.jsx hasn't loaded from localStorage yet
    const fromStorage = localStorage.getItem('eventmobi_event_name') || '';
    const fromProp = (eventName && eventName.trim()) ? eventName.trim() : '';
    // Prefer localStorage if both exist, since it's more reliable
    return fromStorage || fromProp || '';
  });
  const [currentWebhookBaseUrl, setCurrentWebhookBaseUrl] = useState(() => {
    const fromProp = webhookBaseUrl || '';
    const fromStorage = localStorage.getItem('eventmobi_webhook_base_url') || '';
    return fromProp || fromStorage;
  });
  
  // Sync with props when they change (e.g., when App.jsx loads from localStorage)
  // This handles the case where App.jsx loads data asynchronously and updates props later
  useEffect(() => {
    const trimmedEventName = eventName && eventName.trim() ? eventName.trim() : '';
    const savedEventName = localStorage.getItem('eventmobi_event_name') || '';
    const trimmedSaved = savedEventName.trim();
    
    if (IS_DEV) console.log('Event name sync check:', {
      propEventName: eventName,
      trimmedProp: trimmedEventName,
      currentState: currentEventName,
      savedInStorage: trimmedSaved
    });
    
    // Priority: prop > localStorage > current state
    if (trimmedEventName && trimmedEventName !== currentEventName) {
      if (IS_DEV) console.log('Setting event name from prop:', trimmedEventName);
      setCurrentEventName(trimmedEventName);
    } else if (!trimmedEventName && trimmedSaved && trimmedSaved !== currentEventName) {
      if (IS_DEV) console.log('Setting event name from localStorage:', trimmedSaved);
      setCurrentEventName(trimmedSaved);
    }
  }, [eventName]); // Only depend on eventName prop, not currentEventName (to avoid loops)
  
  // Always check localStorage on mount - this is the source of truth
  // This ensures we get the event name even if props haven't loaded yet
  // Also fetch event details from API if event name is missing
  useEffect(() => {
    const savedEventName = localStorage.getItem('eventmobi_event_name');
    if (IS_DEV) console.log('Mount useEffect - localStorage event name:', savedEventName);
    if (IS_DEV) console.log('Mount useEffect - current state:', currentEventName);
    if (IS_DEV) console.log('Mount useEffect - prop eventName:', eventName);
    
    if (savedEventName && savedEventName.trim()) {
      const trimmedName = savedEventName.trim();
      if (IS_DEV) console.log('Setting event name from localStorage on mount:', trimmedName);
      setCurrentEventName(trimmedName);
    } else {
      if (IS_DEV) console.log('No event name in localStorage, current value:', currentEventName || '(empty)');
      
      // If we have event ID and API key but no event name, fetch it from API
      const savedEventId = localStorage.getItem('eventmobi_event_id');
      const savedApiKey = localStorage.getItem('eventmobi_api_key');
      
      if (savedEventId && savedApiKey && !currentEventName) {
        if (IS_DEV) console.log('Fetching event details to get event name...');
        fetch(`${API_BASE_URL}/api/event/${savedEventId}/details?api_key=${encodeURIComponent(savedApiKey)}`)
          .then(response => {
            if (response.ok) {
              return response.json();
            }
            throw new Error('Failed to fetch event details');
          })
          .then(data => {
            const fetchedName = data.name || '';
            if (fetchedName && fetchedName.trim()) {
              if (IS_DEV) console.log('Fetched event name from API:', fetchedName);
              const trimmedName = fetchedName.trim();
              setCurrentEventName(trimmedName);
              localStorage.setItem('eventmobi_event_name', trimmedName);
            } else {
              if (IS_DEV) console.warn('Event details fetched but no name found:', data);
            }
          })
          .catch(err => {
            if (IS_DEV) console.warn('Could not fetch event details:', err);
          });
      }
    }
  }, []); // Run once on mount
  const [stats, setStats] = useState({
    total_attendees: 0,
    event_checkins: 0,
    session_checkins: 0,
  });
  const [sessionIncrement, setSessionIncrement] = useState(0);
  const [eventIncrement, setEventIncrement] = useState(0);
  const [soundEnabled, setSoundEnabled] = useState(() => {
    const saved = localStorage.getItem('eventmobi_sound_enabled');
    return saved !== null ? saved === 'true' : true;
  });
  const [soundMode, setSoundMode] = useState(() => {
    const saved = localStorage.getItem('eventmobi_sound_mode');
    return saved || 'Heartbeat';
  });
  const [symphonySong, setSymphonySong] = useState(() => {
    return localStorage.getItem('eventmobi_symphony_song') || '';
  });
  const [bubblesEnabled, setBubblesEnabled] = useState(() => {
    const saved = localStorage.getItem('eventmobi_bubbles_enabled');
    return saved !== null ? saved === 'true' : true;
  });
  const [statsEnabled, setStatsEnabled] = useState(() => {
    const saved = localStorage.getItem('eventmobi_stats_enabled');
    return saved !== null ? saved === 'true' : true;
  });
  const [sessionCountsEnabled, setSessionCountsEnabled] = useState(() => {
    const saved = localStorage.getItem('eventmobi_session_counts_enabled');
    return saved !== null ? saved === 'true' : true;
  });
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [currentBubbleMessage, setCurrentBubbleMessage] = useState(null);
  const messageCounterRef = useRef(0);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState('');
  const [showWebhookWarning, setShowWebhookWarning] = useState(!!webhookWarning);
  const [activeSessions, setActiveSessions] = useState([]);
  const [recentCheckinSessionId, setRecentCheckinSessionId] = useState(null);
  const socketRef = useRef(null);
  const dashboardRef = useRef(null);
  const statsIntervalRef = useRef(null);
  const sessionsIntervalRef = useRef(null);
  const reconnectTimeoutRef = useRef(null);
  const consecutiveFailuresRef = useRef(0);
  const pendingStatsRefreshRef = useRef(null);

  // Load and apply saved colors on mount
  useEffect(() => {
    const savedColors = localStorage.getItem('eventmobi_colors');
    if (savedColors) {
      try {
        const colors = JSON.parse(savedColors);
        document.documentElement.style.setProperty('--primary-color', colors.primary || '#667eea');
        document.documentElement.style.setProperty('--secondary-color', colors.secondary || '#764ba2');
        document.documentElement.style.setProperty('--text-color', colors.text || '#ffffff');
      } catch (e) {
        console.error('Error loading colors:', e);
      }
    }
  }, []);

  // Update document title when event name changes
  useEffect(() => {
    if (currentEventName) {
      document.title = `Heartbeat for ${currentEventName}`;
    } else {
      document.title = 'Heartbeat';
    }
  }, [currentEventName]);

  // Initialize Symphony player when mode/song changes
  useEffect(() => {
    if (soundMode === 'Symphony' && symphonySong) {
      SymphonyPlayer.init(symphonySong);
    }
  }, [soundMode, symphonySong]);

  const fetchStats = React.useCallback(async (signal) => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/event/${currentEventId}/stats?api_key=${encodeURIComponent(currentApiKey)}`, { signal });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Failed to fetch stats' }));
        throw new Error(errorData.error || `HTTP ${response.status}: Failed to fetch stats`);
      }
      const data = await response.json();
      if (IS_DEV) console.log('Stats received:', data);
      setStats(data);
      // Reset increments when we get fresh stats
      setEventIncrement(0);
      setSessionIncrement(0);
      setError(''); // Clear any previous errors
    } catch (err) {
      if (signal && signal.aborted) return;
      console.error('Error fetching stats:', err);
      setError(`Error loading stats: ${err.message}`);
      // Retry after 5 seconds
      setTimeout(() => {
        if (signal && signal.aborted) return;
        fetchStats(signal);
      }, 5000);
    }
  }, [currentApiKey, currentEventId]);

  const fetchActiveSessions = React.useCallback(async (signal) => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/event/${currentEventId}/active-sessions?api_key=${encodeURIComponent(currentApiKey)}`, { signal });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Failed to fetch sessions' }));
        throw new Error(errorData.error || `HTTP ${response.status}: Failed to fetch sessions`);
      }
      const data = await response.json();
      const sessionsArray = Array.isArray(data) ? data : [];
      if (IS_DEV) console.log('Fetched active sessions:', sessionsArray.length, sessionsArray);
      if (sessionsArray.length === 0) {
        if (IS_DEV) console.warn('No active sessions found. Response:', data);
      }
      setActiveSessions(sessionsArray);
    } catch (err) {
      if (signal && signal.aborted) return;
      console.error('Error fetching active sessions:', err);
      // Don't show error to user, just log it
      setActiveSessions([]); // Set to empty array on error
    }
  }, [currentApiKey, currentEventId]);

  useEffect(() => {
    // Only fetch if we have valid API key and event ID
    if (!currentApiKey || !currentEventId) {
      return;
    }
    
    // Fetch initial stats once on mount or when settings change
    // Delay slightly to let socket connect first
    const controller = new AbortController();
    const initialFetchTimeout = setTimeout(() => {
      fetchStats(controller.signal);
      fetchActiveSessions(controller.signal);
    }, 500);

    // Also refresh stats periodically (every 3 minutes) to keep counts accurate
    // Reduced frequency to avoid constant server load with many sessions
    statsIntervalRef.current = setInterval(() => {
      fetchStats();
    }, 180000); // 3 minutes

    // Refresh active sessions periodically (every 10 minutes) to keep them up to date
    // Webhooks handle real-time updates, this just reconciles counts
    sessionsIntervalRef.current = setInterval(() => {
      fetchActiveSessions();
    }, 600000); // 10 minutes

    // Connect to Socket.IO for real-time updates
    // Only connect if we have valid API key and event ID
    if (!currentApiKey || !currentEventId) {
      console.log('Skipping socket connection - missing API key or event ID');
      return;
    }

    // Clean up any existing socket first
    if (socketRef.current) {
      try {
        socketRef.current.removeAllListeners();
        socketRef.current.disconnect();
      } catch (e) {
        console.warn('Error cleaning up old socket:', e);
      }
      socketRef.current = null;
    }

    const socket = io(API_BASE_URL, {
      path: '/socket.io/',
      transports: ['websocket'],
      upgrade: false,
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 20000,
      forceNew: true, // Force new connection when settings change
      autoConnect: true,
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      console.log('Connected to server');
      setConnected(true);
      setError('');
      
      // Subscribe to event updates
      socket.emit('subscribe', {
        event_id: currentEventId,
        api_key: currentApiKey,
      });
    });

    socket.on('connected', (data) => {
      console.log('Server connection confirmed:', data);
    });

    socket.on('subscribed', (data) => {
      console.log('Subscribed to event:', data);
    });

    socket.on('checkin_event', (data) => {
      console.log('Check-in/scan event received:', data);
      
      // Always show the bubble message, even if connection was briefly interrupted
      // Use a unique key to ensure React processes each message separately
      if (data.message) {
        messageCounterRef.current += 1;
        // Create a unique message object to force React to process it
        setCurrentBubbleMessage({
          text: data.message,
          id: messageCounterRef.current,
          timestamp: Date.now(),
          event_type: data.event_type || 'checkin'
        });
      }
      
      // Handle check-in events
      if (data.event_type === 'checkin') {
        // Update increments for display (incremental count since last stats refresh)
        if (data.checkin_type === 'event') {
          setEventIncrement((prev) => prev + 1);
        } else if (data.checkin_type === 'session') {
          setSessionIncrement((prev) => prev + 1);
          
          // Track which session got a check-in for the "+1" animation
          if (data.session_id) {
            setRecentCheckinSessionId(data.session_id);
            // Clear after animation duration (2 seconds)
            setTimeout(() => {
              setRecentCheckinSessionId(null);
            }, 2000);
          }
        }
      }

      // Symphony mode: play next note per check-in
      if (soundEnabled && soundMode === 'Symphony') {
        SymphonyPlayer.playNextNote();
        try { console.log('Symphony mode: requested next note'); } catch (_e) {}
      }
      
      // Debounce stats refresh - only refresh once after a batch of check-ins
      // Since we're already incrementing counts in the UI, we don't need to refresh immediately
      // Only refresh periodically to keep counts accurate (frontend increments are just estimates)
      if (pendingStatsRefreshRef.current) {
        clearTimeout(pendingStatsRefreshRef.current);
      }
      
      // Schedule a refresh after a longer delay to avoid excessive API calls
      // This allows multiple check-ins to batch together
      pendingStatsRefreshRef.current = setTimeout(() => {
        fetchStats();
        fetchActiveSessions(); // Also refresh session list to update check-in counts
        pendingStatsRefreshRef.current = null;
      }, 10000); // Increased to 10 seconds - allows batching multiple check-ins
    });

    // Lightweight poke: when received, refresh data and fetch enriched message for bubble
    socket.on('checkin_poke', (data) => {
      if (!data || String(data.event_id) !== String(currentEventId)) {
        return;
      }
      const resourceIds = Array.isArray(data.resource_ids) ? data.resource_ids : [];
      if (resourceIds.length > 0) {
        const id = resourceIds[0];
        fetch(`${API_BASE_URL}/api/event/${currentEventId}/checkin-message?id=${encodeURIComponent(id)}&api_key=${encodeURIComponent(currentApiKey)}`)
          .then(res => res.ok ? res.json() : res.json().then(j => Promise.reject(new Error(j.error || 'Failed to build message'))))
          .then(msg => {
            if (msg && msg.message) {
              messageCounterRef.current += 1;
              setCurrentBubbleMessage({
                text: msg.message,
                id: messageCounterRef.current,
                timestamp: Date.now(),
                event_type: msg.event_type || 'checkin'
              });
              // Increment UI counters heuristically
              if (msg.checkin_type === 'event') {
                setEventIncrement((prev) => prev + 1);
              } else if (msg.checkin_type === 'session') {
                setSessionIncrement((prev) => prev + 1);
                if (msg.session_id) {
                  setRecentCheckinSessionId(msg.session_id);
                  setTimeout(() => setRecentCheckinSessionId(null), 2000);
                }
              }
              if (soundEnabled && soundMode === 'Symphony') {
                SymphonyPlayer.playNextNote();
              }
            }
          })
          .catch(() => {});
      }
      if (pendingStatsRefreshRef.current) {
        clearTimeout(pendingStatsRefreshRef.current);
      }
      pendingStatsRefreshRef.current = setTimeout(() => {
        fetchStats();
        fetchActiveSessions();
        pendingStatsRefreshRef.current = null;
      }, 3000);
    });

    socket.on('disconnect', (reason) => {
      console.log('Disconnected from server:', reason);
      setConnected(false);
      
      // Only show error for unexpected disconnects, not intentional ones
      if (reason === 'io server disconnect') {
        // Server disconnected the client, might need to reconnect manually
        // Socket.IO will auto-reconnect, just trigger it
        setTimeout(() => {
          if (socketRef.current && !socketRef.current.connected) {
            socketRef.current.connect();
          }
        }, 1000);
      } else if (reason === 'io client disconnect') {
        // Client manually disconnected (e.g., when changing settings)
        // Don't show error or try to reconnect
        return;
      }
      
      // Clear any existing timeout
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      
      // Only show error message after multiple failures
      if (consecutiveFailuresRef.current > 3) {
        setError('Connection lost. Reconnecting...');
      }
    });

    socket.on('connect_error', (err) => {
      console.error('Connection error:', err);
      consecutiveFailuresRef.current++;
      
      // Only show persistent errors, not transient ones
      if (consecutiveFailuresRef.current > 5) {
        setError('Connection issues. Will keep trying to reconnect...');
      }
    });

    socket.on('reconnect', (attemptNumber) => {
      console.log('Reconnected after', attemptNumber, 'attempts');
      consecutiveFailuresRef.current = 0; // Reset failure count on successful reconnect
      setError(''); // Clear any error messages
      setConnected(true);
      
      // Clear any timeout
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
      
      // Resubscribe after reconnection
      if (currentEventId && currentApiKey) {
        socket.emit('subscribe', {
          event_id: currentEventId,
          api_key: currentApiKey,
        });
      }
    });

    socket.on('reconnect_attempt', (attemptNumber) => {
      console.log('Reconnection attempt', attemptNumber);
      // Don't show error on every attempt, only after several failures
      if (attemptNumber > 5 && !reconnectTimeoutRef.current) {
        reconnectTimeoutRef.current = setTimeout(() => {
          setError('Reconnecting...');
        }, 2000);
      }
    });

    socket.on('reconnect_failed', () => {
      console.error('Reconnection failed after all attempts');
      consecutiveFailuresRef.current = 0; // Reset to allow new attempts
      setError('Connection lost. Please refresh the page.');
    });

    socket.on('reconnect_error', (err) => {
      console.error('Reconnection error:', err);
      consecutiveFailuresRef.current++;
    });

    // Cleanup on unmount or when dependencies change
    return () => {
      if (statsIntervalRef.current) {
        clearInterval(statsIntervalRef.current);
      }
      if (sessionsIntervalRef.current) {
        clearInterval(sessionsIntervalRef.current);
      }
      if (pendingStatsRefreshRef.current) {
        clearTimeout(pendingStatsRefreshRef.current);
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      clearTimeout(initialFetchTimeout);
      if (socketRef.current) {
        try {
          socketRef.current.removeAllListeners();
          socketRef.current.disconnect();
        } catch (e) {
          if (IS_DEV) console.warn('Error cleaning up socket:', e);
        }
        socketRef.current = null;
      }
      try { controller.abort(); } catch (_) {}
    };
  }, [currentApiKey, currentEventId, fetchStats, fetchActiveSessions]);

  const handleSettingsUpdate = (settings) => {
    // Update all settings first
    setCurrentApiKey(settings.apiKey);
    setCurrentEventId(settings.eventId);
    setCurrentEventName(settings.eventName);
    setCurrentWebhookBaseUrl(settings.webhookBaseUrl);
    setSoundEnabled(settings.soundEnabled);
    setSoundMode(settings.soundMode || 'Heartbeat');
    setSymphonySong(settings.symphonySong || '');
    setBubblesEnabled(settings.bubblesEnabled !== false);
    setStatsEnabled(settings.statsEnabled !== false);
    setSessionCountsEnabled(settings.sessionCountsEnabled !== false);
    
    // Close settings panel immediately - don't wait for slow API calls
    setIsSettingsOpen(false);
    
    // Disconnect socket properly - mark it as intentional disconnect
    if (socketRef.current) {
      try {
        socketRef.current.removeAllListeners();
        socketRef.current.disconnect();
      } catch (e) {
        console.warn('Error disconnecting socket:', e);
      }
      socketRef.current = null;
    }
    
    // Note: The useEffect will automatically:
    // 1. Recreate the socket with new settings
    // 2. Call fetchStats and fetchActiveSessions after a short delay
    // This happens because currentApiKey/currentEventId changed
  };

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      if (dashboardRef.current?.requestFullscreen) {
        dashboardRef.current.requestFullscreen().then(() => {
          setIsFullscreen(true);
        }).catch((err) => {
          console.error('Error entering fullscreen:', err);
        });
      }
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen().then(() => {
          setIsFullscreen(false);
        }).catch((err) => {
          console.error('Error exiting fullscreen:', err);
        });
      }
    }
  };

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
    };
  }, []);

  const handleBubbleComplete = () => {
    setCurrentBubbleMessage(null);
  };

  return (
    <div className="dashboard" ref={dashboardRef}>
      {bubblesEnabled && (
        <BubbleAnimation
          message={currentBubbleMessage}
          onBubbleComplete={handleBubbleComplete}
          soundEnabled={soundEnabled && soundMode !== 'Symphony'}
        />
      )}

      <SessionList 
        sessions={activeSessions} 
        recentCheckinSessionId={recentCheckinSessionId}
        showCounts={sessionCountsEnabled}
      />

      <div className="dashboard-header">
        <div className="header-left">
          <h1>
            Heartbeat
            {(() => {
              // Always check localStorage directly in render as fallback
              // This ensures we display the name even if state hasn't updated
              const savedName = localStorage.getItem('eventmobi_event_name');
              const displayName = (currentEventName && currentEventName.trim()) 
                ? currentEventName.trim() 
                : (savedName && savedName.trim() ? savedName.trim() : '');
              
              // Debug logging
              if (!currentEventName && savedName) {
                console.log('Event name in localStorage but not in state:', savedName, 'Displaying directly');
              }
              
              return displayName ? ` for ${displayName}` : '';
            })()}
          </h1>
          <div className="connection-status">
            <span className={`status-indicator ${connected ? 'connected' : 'disconnected'}`}></span>
            {connected ? 'Connected' : 'Disconnected'}
          </div>
        </div>
        <div className="header-controls">
          <button
            onClick={toggleFullscreen}
            className="control-btn fullscreen-btn"
            title={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
          >
            {isFullscreen ? '⤓' : '⤢'}
          </button>
          <button onClick={() => setIsSettingsOpen(true)} className="control-btn reset-btn" title="Settings">
            ⚙️
          </button>
          <button
            onClick={() => {
              try {
                if (socketRef.current) {
                  socketRef.current.emit('unsubscribe', { event_id: currentEventId });
                  socketRef.current.removeAllListeners();
                  socketRef.current.disconnect();
                }
              } catch (e) {
                console.warn('Error during unsubscribe/disconnect:', e);
              }
              // Clear local storage and reset via parent
              localStorage.removeItem('eventmobi_api_key');
              localStorage.removeItem('eventmobi_event_id');
              localStorage.removeItem('eventmobi_event_name');
              localStorage.removeItem('eventmobi_webhook_base_url');
              if (typeof onReset === 'function') {
                onReset();
              }
            }}
            className="control-btn reset-btn"
            title="Disconnect and reset"
          >
            ⎋
          </button>
        </div>
      </div>

      {showWebhookWarning && webhookWarning && (
        <div className="warning-banner">
          ⚠️ {webhookWarning}
          <button onClick={() => setShowWebhookWarning(false)}>✕</button>
        </div>
      )}
      {error && (
        <div className="error-banner">
          {error}
          <button onClick={() => setError('')}>✕</button>
        </div>
      )}

      {statsEnabled && (
        <div className="dashboard-content">
          <StatsDisplay
            stats={stats}
            sessionIncrement={sessionIncrement}
            eventIncrement={eventIncrement}
          />
        </div>
      )}

      <div className="dashboard-footer">
        <p>Real-time updates via EventMobi webhooks</p>
      </div>

      <SettingsPanel
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        currentApiKey={currentApiKey}
        currentEventId={currentEventId}
        currentEventName={currentEventName}
        currentWebhookBaseUrl={currentWebhookBaseUrl}
        currentSoundEnabled={soundEnabled}
        currentBubblesEnabled={bubblesEnabled}
        currentStatsEnabled={statsEnabled}
        currentSessionCountsEnabled={sessionCountsEnabled}
        onSettingsUpdate={handleSettingsUpdate}
      />
    </div>
  );
}

export default Dashboard;

