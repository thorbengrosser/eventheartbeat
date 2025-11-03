import React from 'react';
import './SessionList.css';

function SessionList({ sessions, recentCheckinSessionId, showCounts = true }) {
  // Debug: log when component renders
  React.useEffect(() => {
    const IS_DEV = process.env.NODE_ENV !== 'production';
    if (IS_DEV) console.log('SessionList rendered with sessions:', sessions?.length || 0, sessions);
    if ((!sessions || sessions.length === 0) && IS_DEV) {
      console.warn('SessionList: No sessions provided or empty array');
    }
  }, [sessions]);
  
  const formatTime = (datetimeStr) => {
    if (!datetimeStr) return '';
    try {
      const date = new Date(datetimeStr);
      return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
    } catch {
      return '';
    }
  };

  const getPercentage = (count, capacity) => {
    if (!capacity || capacity === 0) return 0;
    return Math.min(Math.round((count / capacity) * 100), 100);
  };

  const getUtilizationClass = (percentage, overflow) => {
    if (overflow) return 'util-overflow';
    if (percentage >= 90) return 'util-hot';
    if (percentage >= 60) return 'util-warn';
    return 'util-ok';
  };

  // Sort by start time (newest first), then take top 15
  const displaySessions = [...(sessions || [])]
    .sort((a, b) => {
      const timeA = a.start_datetime ? new Date(a.start_datetime).getTime() : 0;
      const timeB = b.start_datetime ? new Date(b.start_datetime).getTime() : 0;
      return timeB - timeA; // Reverse order: newest first
    })
    .slice(0, 15);

  return (
    <div className="session-list-rail">
      {displaySessions.length === 0 ? (
        <div className="session-list-empty">
          <p>No active sessions</p>
        </div>
      ) : (
        displaySessions.map((session) => {
        const capacity = session.capacity;
        const checkinCount = session.checkin_count || 0;
        const overflow = capacity && checkinCount > capacity;
        const percentage = capacity ? getPercentage(checkinCount, capacity) : 0;
        const utilClass = capacity ? getUtilizationClass(percentage, overflow) : 'util-unknown';
        
        // Truncate session name for single line
        const truncatedName = session.name || 'Unnamed Session';
        
        const hasRecentCheckin = recentCheckinSessionId === session.id;
        
        return (
          <button
            key={session.id}
            className={`session-pill compact ${utilClass} ${hasRecentCheckin ? 'just-checked-in' : ''}`}
            title={`${session.name}${session.location ? ` · ${session.location}` : ''}${capacity ? ` · ${checkinCount}/${capacity} (${percentage}%)` : ''}`}
            aria-label={`${session.name}, starts ${formatTime(session.start_datetime)}, ${checkinCount} checked in${capacity ? `, capacity ${capacity}${overflow ? ', capacity exceeded' : ''}` : ''}`}
          >
            {/* Progress background - left % filled based on capacity */}
            {capacity && (
              <span className="session-progress-bg" aria-hidden>
                <span 
                  className="session-progress-fill"
                  style={{ width: `${Math.min(percentage, 100)}%` }}
                />
                {overflow && (
                  <span className="session-progress-overflow" />
                )}
              </span>
            )}
            {!capacity && (
              <span className="session-progress-baseline" aria-hidden />
            )}

            {/* Content layer */}
            <span className="session-pill-content">
              <time className="session-time-badge">
                {formatTime(session.start_datetime)}
              </time>
              <span className="session-title" title={session.name}>
                {truncatedName}
              </span>
              {showCounts && (
                <span className="session-count">
                  {capacity ? `${checkinCount}/${capacity}` : checkinCount}
                </span>
              )}
            </span>
            
            {/* +1 animation when someone checks in */}
            {hasRecentCheckin && (
              <span className="checkin-pop" aria-hidden>
                +1
              </span>
            )}
          </button>
        );
      })
      )}
    </div>
  );
}

export default SessionList;
