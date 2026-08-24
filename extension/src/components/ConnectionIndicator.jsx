import React from 'react';
import './ConnectionIndicator.css';

export default function ConnectionIndicator({ status = 'disconnected', endpoint = '', latency = null }) {
  const isConnected = status === 'connected';
  return (
    <div className={`conn-indicator ${isConnected ? 'conn-indicator--connected' : 'conn-indicator--disconnected'}`}>
      <div className="conn-indicator__header">
        <span className={`conn-indicator__dot ${isConnected ? 'conn-dot--on' : 'conn-dot--off'}`} />
        <span className="conn-indicator__status">{isConnected ? 'Connected' : 'Disconnected'}</span>
        {latency !== null && isConnected && (
          <span className="conn-indicator__latency">{latency}ms</span>
        )}
      </div>
      {endpoint && (
        <span className="conn-indicator__endpoint">{endpoint}</span>
      )}
    </div>
  );
}
