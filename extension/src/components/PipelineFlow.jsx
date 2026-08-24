import React from 'react';
import './PipelineFlow.css';

const CLIENT_NODES = [
  { id: 'screen', label: 'Active Tab / Screen', sub: 'tabCapture · getDisplayMedia', icon: '🖥', x: 60, y: 30 },
  { id: 'vit', label: 'Local ViT Screen Reader', sub: 'WebGPU / WASM · UI + PII detection', icon: '👁', x: 40, y: 140 },
  { id: 'filter', label: 'Privacy Filter', sub: 'blur faces · mask PII · {TOKEN}s', icon: '🛡', x: 40, y: 250 },
  { id: 'executor', label: 'Action Executor', sub: 'click · type · scroll · re-map tokens', icon: '⚡', x: 160, y: 310 },
];

const SERVER_NODES = [
  { id: 'gateway', label: 'Secure API Gateway', sub: 'HTTPS/WSS · auth · rate limit', icon: '🔒', x: 380, y: 30 },
  { id: 'vlm', label: 'Open-Weights VLM / LLM', sub: 'Qwen2-VL · LLaVA · Llama-3', icon: '🧠', x: 380, y: 150 },
  { id: 'planner', label: 'Action Planner', sub: 'JSON command sequence', icon: '📋', x: 380, y: 270 },
];

const FLOW_PATHS = [
  { from: 'screen', to: 'vit', label: '' },
  { from: 'vit', to: 'filter', label: '' },
  { from: 'filter', to: 'gateway', label: 'sanitized context', curved: true },
  { from: 'gateway', to: 'vlm', label: '' },
  { from: 'vlm', to: 'planner', label: '' },
  { from: 'planner', to: 'executor', label: 'action JSON', curved: true },
  { from: 'executor', to: 'screen', label: 'execute & re-observe', curved: true },
];

function getNodeCenter(node) {
  return {
    x: node.x + 80,
    y: node.y + 35,
  };
}

export default function PipelineFlow({ agentStatus = 'idle' }) {
  const allNodes = [...CLIENT_NODES, ...SERVER_NODES];
  const isActive = agentStatus !== 'idle';

  return (
    <div className={`pipeline-flow ${isActive ? 'pipeline-flow--active' : ''}`}>
      <svg className="pipeline-flow__svg" viewBox="0 0 560 380" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <marker id="arrowTeal" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
            <path d="M0,0 L8,3 L0,6" fill="none" stroke="var(--teal-bright)" strokeWidth="1.5" />
          </marker>
          <marker id="arrowPlum" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
            <path d="M0,0 L8,3 L0,6" fill="none" stroke="var(--plum-bright)" strokeWidth="1.5" />
          </marker>
        </defs>

        {/* Divider line */}
        <line x1="330" y1="10" x2="330" y2="370" stroke="var(--border-subtle)" strokeWidth="1" strokeDasharray="4,4" />
        <text x="165" y="375" fill="var(--cream-muted)" fontSize="9" textAnchor="middle" fontFamily="var(--font-sans)">CLIENT</text>
        <text x="440" y="375" fill="var(--cream-muted)" fontSize="9" textAnchor="middle" fontFamily="var(--font-sans)">SERVER</text>

        {/* Flow paths */}
        {FLOW_PATHS.map((path, i) => {
          const fromNode = allNodes.find(n => n.id === path.from);
          const toNode = allNodes.find(n => n.id === path.to);
          if (!fromNode || !toNode) return null;
          const from = getNodeCenter(fromNode);
          const to = getNodeCenter(toNode);
          const isCrossing = path.curved;
          const isPlum = path.from === 'planner' || path.from === 'executor';
          const marker = isPlum ? 'url(#arrowPlum)' : 'url(#arrowTeal)';
          const color = isPlum ? 'var(--plum-bright)' : 'var(--teal-bright)';

          let d;
          if (isCrossing) {
            const mx = (from.x + to.x) / 2;
            const my = (from.y + to.y) / 2;
            const cx = mx + (from.x < to.x ? 30 : -30);
            d = `M${from.x},${from.y} Q${cx},${my} ${to.x},${to.y}`;
          } else {
            d = `M${from.x},${from.y} L${to.x},${to.y}`;
          }

          return (
            <g key={i}>
              <path
                d={d}
                fill="none"
                stroke={color}
                strokeWidth="1.5"
                strokeDasharray={isActive ? '6,4' : 'none'}
                className={isActive ? 'flow-path--animated' : ''}
                markerEnd={marker}
                opacity="0.7"
              />
              {path.label && (
                <text
                  x={(from.x + to.x) / 2}
                  y={(from.y + to.y) / 2 - 8}
                  fill="var(--cream-muted)"
                  fontSize="7.5"
                  textAnchor="middle"
                  fontFamily="var(--font-sans)"
                  fontStyle="italic"
                >
                  {path.label}
                </text>
              )}
            </g>
          );
        })}
      </svg>

      {/* Node cards overlaid on SVG */}
      <div className="pipeline-flow__nodes">
        {CLIENT_NODES.map(node => (
          <div key={node.id} className="pipeline-node pipeline-node--client" style={{ left: node.x, top: node.y }}>
            <span className="pipeline-node__icon">{node.icon}</span>
            <div className="pipeline-node__text">
              <span className="pipeline-node__label">{node.label}</span>
              <span className="pipeline-node__sub">{node.sub}</span>
            </div>
          </div>
        ))}
        {SERVER_NODES.map(node => (
          <div key={node.id} className="pipeline-node pipeline-node--server" style={{ left: node.x, top: node.y }}>
            <span className="pipeline-node__icon">{node.icon}</span>
            <div className="pipeline-node__text">
              <span className="pipeline-node__label">{node.label}</span>
              <span className="pipeline-node__sub">{node.sub}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
