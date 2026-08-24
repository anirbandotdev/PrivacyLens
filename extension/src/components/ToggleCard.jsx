import React from 'react';
import './ToggleCard.css';

export default function ToggleCard({ icon, title, description, enabled, onToggle, accent = 'teal' }) {
  return (
    <div className={`toggle-card ${enabled ? `toggle-card--active toggle-card--${accent}` : ''}`}>
      <div className="toggle-card__icon">{icon}</div>
      <div className="toggle-card__content">
        <span className="toggle-card__title">{title}</span>
        {description && <span className="toggle-card__desc">{description}</span>}
      </div>
      <button
        className={`toggle-switch ${enabled ? 'toggle-switch--on' : ''}`}
        onClick={onToggle}
        aria-label={`Toggle ${title}`}
      >
        <span className="toggle-switch__thumb" />
      </button>
    </div>
  );
}
