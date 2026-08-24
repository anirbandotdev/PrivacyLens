import React, { useState, useCallback } from 'react';
import StatusBadge from '../components/StatusBadge.jsx';
import PipelineFlow from '../components/PipelineFlow.jsx';
import ActionLog from '../components/ActionLog.jsx';
import ToggleCard from '../components/ToggleCard.jsx';
import ConnectionIndicator from '../components/ConnectionIndicator.jsx';
import PrivacyPreview from '../components/PrivacyPreview.jsx';

const MOCK_LOG = [
  { id: 1, type: 'observe', label: 'Screen captured', detail: 'viewport 1920×1080', time: '17:32:01' },
  { id: 2, type: 'mask', label: 'PII detected & masked', detail: '3 fields → {TOKEN}', time: '17:32:02' },
  { id: 3, type: 'click', label: 'Clicked element', detail: 'button#submit-form', time: '17:32:04' },
  { id: 4, type: 'type', label: 'Typed text', detail: '{NAME_TOKEN} into input#name', time: '17:32:05' },
  { id: 5, type: 'scroll', label: 'Scrolled page', detail: 'down 320px', time: '17:32:06' },
  { id: 6, type: 'observe', label: 'Screen re-captured', detail: 'viewport 1920×1080', time: '17:32:07' },
  { id: 7, type: 'navigate', label: 'Navigation detected', detail: '/profile → /dashboard', time: '17:32:09' },
  { id: 8, type: 'mask', label: 'Face detected & blurred', detail: '1 face region', time: '17:32:10' },
];

const TABS = [
  { key: 'pipeline', label: 'Pipeline', icon: '⚡' },
  { key: 'activity', label: 'Activity', icon: '📋' },
  { key: 'privacy', label: 'Privacy', icon: '🛡' },
  { key: 'connection', label: 'Connection', icon: '🔗' },
  { key: 'model', label: 'Screen Reader', icon: '👁' },
];

export default function DashboardApp() {
  const [activeTab, setActiveTab] = useState('pipeline');
  const [agentStatus, setAgentStatus] = useState('idle');

  // Privacy toggles
  const [faceBlur, setFaceBlur] = useState(true);
  const [piiMask, setPiiMask] = useState(true);
  const [tokenReplace, setTokenReplace] = useState(true);
  const [screenshotRedact, setScreenshotRedact] = useState(false);

  // Connection settings
  const [apiEndpoint, setApiEndpoint] = useState('wss://api.privacylens.local');
  const [serverStatus] = useState('connected');
  const [latency] = useState(42);

  // Model status
  const [modelLoaded] = useState(true);
  const [modelFps] = useState(12.4);
  const [detectionCount] = useState(847);

  const handleToggleAgent = useCallback(() => {
    setAgentStatus(prev => prev === 'idle' ? 'observing' : 'idle');
  }, []);

  return (
    <div className="dashboard">
      {/* Sidebar */}
      <aside className="dashboard__sidebar">
        <div className="dashboard__sidebar-header">
          <span className="dashboard__logo">🔒</span>
          <div>
            <h1 className="dashboard__brand">PrivacyLens</h1>
            <span className="dashboard__version">v0.1.0</span>
          </div>
        </div>

        <nav className="dashboard__nav">
          {TABS.map(tab => (
            <button
              key={tab.key}
              className={`dashboard__nav-item ${activeTab === tab.key ? 'dashboard__nav-item--active' : ''}`}
              onClick={() => setActiveTab(tab.key)}
            >
              <span className="dashboard__nav-icon">{tab.icon}</span>
              <span className="dashboard__nav-label">{tab.label}</span>
            </button>
          ))}
        </nav>

        <div className="dashboard__sidebar-footer">
          <StatusBadge status={agentStatus} size="lg" />
          <button
            className={`dashboard__agent-toggle ${agentStatus !== 'idle' ? 'dashboard__agent-toggle--active' : ''}`}
            onClick={handleToggleAgent}
          >
            {agentStatus !== 'idle' ? '⏸ Stop' : '▶ Start'}
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="dashboard__main">
        <header className="dashboard__topbar">
          <h2 className="dashboard__page-title">
            {TABS.find(t => t.key === activeTab)?.icon}{' '}
            {TABS.find(t => t.key === activeTab)?.label}
          </h2>
          <div className="dashboard__topbar-right">
            <ConnectionIndicator status={serverStatus} latency={latency} />
          </div>
        </header>

        <div className="dashboard__content animate-fade-in" key={activeTab}>
          {activeTab === 'pipeline' && (
            <div className="dashboard__panel">
              <div className="panel-section">
                <h3 className="panel-section__title">Architecture Pipeline</h3>
                <p className="panel-section__desc">
                  Real-time data flow between client and server components
                </p>
                <PipelineFlow agentStatus={agentStatus} />
              </div>
              <div className="panel-section">
                <h3 className="panel-section__title">Recent Activity</h3>
                <ActionLog entries={MOCK_LOG.slice(0, 4)} />
              </div>
            </div>
          )}

          {activeTab === 'activity' && (
            <div className="dashboard__panel">
              <div className="panel-section">
                <h3 className="panel-section__title">Action History</h3>
                <p className="panel-section__desc">
                  Chronological log of all agent actions performed on the active tab
                </p>
                <ActionLog entries={MOCK_LOG} />
              </div>
              <div className="panel-section">
                <h3 className="panel-section__title">Statistics</h3>
                <div className="stats-grid">
                  <div className="stat-card">
                    <span className="stat-card__value">23</span>
                    <span className="stat-card__label">Total Actions</span>
                  </div>
                  <div className="stat-card">
                    <span className="stat-card__value">12</span>
                    <span className="stat-card__label">PII Masked</span>
                  </div>
                  <div className="stat-card">
                    <span className="stat-card__value">8</span>
                    <span className="stat-card__label">Clicks</span>
                  </div>
                  <div className="stat-card">
                    <span className="stat-card__value">3</span>
                    <span className="stat-card__label">Navigations</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'privacy' && (
            <div className="dashboard__panel">
              <div className="panel-section">
                <h3 className="panel-section__title">Privacy Filter Configuration</h3>
                <p className="panel-section__desc">
                  Control how PII is detected and redacted before data leaves the browser
                </p>
                <div className="toggle-list">
                  <ToggleCard
                    icon="👤"
                    title="Face Blur"
                    description="Detect and blur human faces in screen captures using local ViT model"
                    enabled={faceBlur}
                    onToggle={() => setFaceBlur(v => !v)}
                  />
                  <ToggleCard
                    icon="🔤"
                    title="PII Text Masking"
                    description="Detect names, emails, phone numbers, SSNs, and replace with {TOKEN}s"
                    enabled={piiMask}
                    onToggle={() => setPiiMask(v => !v)}
                  />
                  <ToggleCard
                    icon="🏷"
                    title="Token Replacement"
                    description="Replace sensitive values with reversible tokens for server-side reasoning"
                    enabled={tokenReplace}
                    onToggle={() => setTokenReplace(v => !v)}
                    accent="plum"
                  />
                  <ToggleCard
                    icon="📸"
                    title="Screenshot Redaction"
                    description="Apply black bars over detected sensitive regions in screenshots"
                    enabled={screenshotRedact}
                    onToggle={() => setScreenshotRedact(v => !v)}
                    accent="plum"
                  />
                </div>
              </div>
              <div className="panel-section">
                <h3 className="panel-section__title">Masking Preview</h3>
                <PrivacyPreview />
              </div>
            </div>
          )}

          {activeTab === 'connection' && (
            <div className="dashboard__panel">
              <div className="panel-section">
                <h3 className="panel-section__title">Server Connection</h3>
                <p className="panel-section__desc">
                  Configure the reasoning backend API endpoint
                </p>
                <div className="connection-config">
                  <div className="config-field">
                    <label className="config-field__label" htmlFor="api-endpoint">API Endpoint</label>
                    <input
                      id="api-endpoint"
                      className="config-field__input"
                      type="text"
                      value={apiEndpoint}
                      onChange={e => setApiEndpoint(e.target.value)}
                      placeholder="wss://your-server.com"
                      disabled
                    />
                  </div>
                  <div className="config-field">
                    <label className="config-field__label">Status</label>
                    <ConnectionIndicator
                      status={serverStatus}
                      endpoint={apiEndpoint}
                      latency={latency}
                    />
                  </div>
                  <div className="config-field">
                    <label className="config-field__label">Protocol Features</label>
                    <div className="config-tags">
                      <span className="config-tag config-tag--active">HTTPS/WSS</span>
                      <span className="config-tag config-tag--active">Auth Token</span>
                      <span className="config-tag config-tag--active">Rate Limiting</span>
                      <span className="config-tag">Compression</span>
                    </div>
                  </div>
                </div>
              </div>
              <div className="panel-section">
                <h3 className="panel-section__title">Connection Health</h3>
                <div className="stats-grid">
                  <div className="stat-card">
                    <span className="stat-card__value">{latency}<small>ms</small></span>
                    <span className="stat-card__label">Latency</span>
                  </div>
                  <div className="stat-card">
                    <span className="stat-card__value">99.8<small>%</small></span>
                    <span className="stat-card__label">Uptime</span>
                  </div>
                  <div className="stat-card">
                    <span className="stat-card__value">1.2<small>MB</small></span>
                    <span className="stat-card__label">Data Sent</span>
                  </div>
                  <div className="stat-card">
                    <span className="stat-card__value">156</span>
                    <span className="stat-card__label">Requests</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'model' && (
            <div className="dashboard__panel">
              <div className="panel-section">
                <h3 className="panel-section__title">Local ViT Screen Reader</h3>
                <p className="panel-section__desc">
                  On-device vision transformer running via WebGPU/WASM for UI understanding and PII detection
                </p>
                <div className="model-status-card">
                  <div className="model-status__header">
                    <span className={`model-status__indicator ${modelLoaded ? 'model-status__indicator--loaded' : ''}`} />
                    <span className="model-status__state">{modelLoaded ? 'Model Loaded' : 'Not Loaded'}</span>
                  </div>
                  <div className="model-status__details">
                    <div className="model-detail">
                      <span className="model-detail__label">Runtime</span>
                      <span className="model-detail__value">WebGPU</span>
                    </div>
                    <div className="model-detail">
                      <span className="model-detail__label">Model</span>
                      <span className="model-detail__value">ViT-B/16 (quantized)</span>
                    </div>
                    <div className="model-detail">
                      <span className="model-detail__label">Size</span>
                      <span className="model-detail__value">86 MB</span>
                    </div>
                  </div>
                </div>
              </div>
              <div className="panel-section">
                <h3 className="panel-section__title">Performance</h3>
                <div className="stats-grid">
                  <div className="stat-card">
                    <span className="stat-card__value">{modelFps}<small>fps</small></span>
                    <span className="stat-card__label">Inference Rate</span>
                  </div>
                  <div className="stat-card">
                    <span className="stat-card__value">{detectionCount}</span>
                    <span className="stat-card__label">Total Detections</span>
                  </div>
                  <div className="stat-card">
                    <span className="stat-card__value">82<small>ms</small></span>
                    <span className="stat-card__label">Avg Latency</span>
                  </div>
                  <div className="stat-card">
                    <span className="stat-card__value">340<small>MB</small></span>
                    <span className="stat-card__label">GPU Memory</span>
                  </div>
                </div>
              </div>
              <div className="panel-section">
                <h3 className="panel-section__title">Detection Capabilities</h3>
                <div className="toggle-list">
                  <ToggleCard icon="👤" title="Face Detection" description="Detect and locate human faces in screenshots" enabled={true} onToggle={() => { }} />
                  <ToggleCard icon="📝" title="Text Recognition" description="OCR for on-screen text extraction" enabled={true} onToggle={() => { }} />
                  <ToggleCard icon="🖱" title="UI Element Detection" description="Identify buttons, inputs, links, and interactive elements" enabled={true} onToggle={() => { }} />
                  <ToggleCard icon="📊" title="Layout Analysis" description="Understand page structure and element relationships" enabled={false} onToggle={() => { }} accent="plum" />
                </div>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
