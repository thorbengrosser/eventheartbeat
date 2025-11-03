import React from 'react';
import './StatsDisplay.css';

function StatsDisplay({ stats, sessionIncrement, eventIncrement }) {
  return (
    <div className="stats-display">
      <div className="stat-card">
        <div className="stat-value">{stats.total_attendees || 0}</div>
        <div className="stat-label">Total Attendees</div>
      </div>
      <div className="stat-card highlight">
        <div className="stat-value">
          {(stats.event_checkins || 0) + (eventIncrement || 0)}
          {eventIncrement > 0 && <span className="increment">+{eventIncrement}</span>}
        </div>
        <div className="stat-label">Event Check-ins</div>
      </div>
      <div className="stat-card highlight">
        <div className="stat-value">
          {(stats.session_checkins || 0) + (sessionIncrement || 0)}
          {sessionIncrement > 0 && <span className="increment">+{sessionIncrement}</span>}
        </div>
        <div className="stat-label">Session Check-ins</div>
      </div>
    </div>
  );
}

export default StatsDisplay;

