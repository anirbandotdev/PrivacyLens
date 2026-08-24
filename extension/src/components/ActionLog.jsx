import React from 'react';
import './ActionLog.css';

const ACTION_ICONS = {
  click: '🖱',
  type: '⌨',
  scroll: '↕',
  observe: '👁',
  mask: '🛡',
  navigate: '🧭',
};

export default function ActionLog({ entries = [] }) {
  if (entries.length === 0) {
    return (
      <div className="action-log action-log--empty">
        <span className="action-log__empty-icon">📋</span>
        <span className="action-log__empty-text">No actions recorded yet</span>
      </div>
    );
  }
  return (
    <div className="action-log">
      {entries.map((entry, i) => (
        <div
          key={entry.id || i}
          className="action-log__entry animate-fade-in"
          style={{ animationDelay: `${i * 40}ms` }}
        >
          <span className="action-log__icon">{ACTION_ICONS[entry.type] || '•'}</span>
          <div className="action-log__body">
            <span className="action-log__action">{entry.label}</span>
            {entry.detail && <span className="action-log__detail">{entry.detail}</span>}
          </div>
          <span className="action-log__time">{entry.time}</span>
        </div>
      ))}
    </div>
  );
}
