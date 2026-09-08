import React from 'react';
import './StatusBadge.css';

const STATUS_CONFIG = {
  idle: { label: 'Idle', color: 'var(--slate-400)', dot: 'badge-idle' },
  observing: { label: 'Observing', color: 'var(--slate-300)', dot: 'badge-observing' },
  acting: { label: 'Acting', color: 'var(--slate-200)', dot: 'badge-acting' },
  error: { label: 'Error', color: '#e06c75', dot: 'badge-error' },
  connected: { label: 'Connected', color: 'var(--slate-300)', dot: 'badge-observing' },
  disconnected: { label: 'Disconnected', color: '#e06c75', dot: 'badge-error' },
};

export default function StatusBadge({ status = 'idle', size = 'md' }) {
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.idle;
  return (
    <span className={`status-badge status-badge--${size}`}>
      <span className={`status-badge__dot ${cfg.dot}`} style={{ '--dot-color': cfg.color }} />
      <span className="status-badge__label">{cfg.label}</span>
    </span>
  );
}
