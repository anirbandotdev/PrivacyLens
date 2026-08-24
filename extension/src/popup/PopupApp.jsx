import React, { useState, useCallback } from 'react';
import StatusBadge from '../components/StatusBadge.jsx';
import ConnectionIndicator from '../components/ConnectionIndicator.jsx';

const PRIVACY_LEVELS = [
  { key: 'low', label: 'Low', desc: 'Token replacement only' },
  { key: 'medium', label: 'Medium', desc: 'Tokens + face blur' },
  { key: 'high', label: 'High', desc: 'Full PII redaction' },
];

export default function PopupApp() {
  const [agentActive, setAgentActive] = useState(false);
  const [status, setStatus] = useState('idle');
  const [privacyLevel, setPrivacyLevel] = useState('medium');
  const [serverStatus] = useState('connected');
  const [latency] = useState(42);

  const handleToggleAgent = useCallback(() => {
    setAgentActive(prev => {
      const next = !prev;
      setStatus(next ? 'observing' : 'idle');
      return next;
    });
  }, []);

  const openDashboard = useCallback(() => {
    const url = chrome?.runtime?.getURL
      ? chrome.runtime.getURL('dashboard.html')
      : 'dashboard.html';
    window.open(url, '_blank');
  }, []);

  return (
    <div className="popup">
      {/* Header */}
      <header className="popup__header">
        <div className="popup__brand">
          <span className="popup__logo">🔒</span>
          <div className="popup__brand-text">
            <h1 className="popup__title">PrivacyLens</h1>
            <span className="popup__subtitle">Vision Agent</span>
          </div>
        </div>
        <StatusBadge status={status} />
      </header>

      {/* Main Toggle */}
      <div className="popup__section">
        <button
          className={`popup__agent-btn ${agentActive ? 'popup__agent-btn--active' : ''}`}
          onClick={handleToggleAgent}
        >
          <span className="popup__agent-btn-icon">{agentActive ? '⏸' : '▶'}</span>
          <span className="popup__agent-btn-label">{agentActive ? 'Stop Agent' : 'Start Agent'}</span>
        </button>
      </div>

      {/* Privacy Level */}
      <div className="popup__section">
        <span className="popup__section-title">Privacy Level</span>
        <div className="popup__privacy-levels">
          {PRIVACY_LEVELS.map(level => (
            <button
              key={level.key}
              className={`popup__privacy-btn ${privacyLevel === level.key ? 'popup__privacy-btn--active' : ''}`}
              onClick={() => setPrivacyLevel(level.key)}
              title={level.desc}
            >
              <span className="popup__privacy-label">{level.label}</span>
              <span className="popup__privacy-desc">{level.desc}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Connection */}
      <div className="popup__section">
        <span className="popup__section-title">Server</span>
        <ConnectionIndicator
          status={serverStatus}
          endpoint="wss://api.privacylens.local"
          latency={latency}
        />
      </div>

      {/* Dashboard Link */}
      <div className="popup__footer">
        <button className="popup__dashboard-btn" onClick={openDashboard}>
          Open Dashboard
          <span className="popup__dashboard-arrow">→</span>
        </button>
      </div>
    </div>
  );
}
