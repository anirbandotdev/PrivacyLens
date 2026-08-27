import { useCallback, useState } from "react";
import ConnectionIndicator from "../components/ConnectionIndicator.jsx";
import StatusBadge from "../components/StatusBadge.jsx";
import PromptBox from "../components/PromptBox.jsx";
import ActionConfirmation from "../components/ActionPerm.jsx";
import { extractText } from "../vision-paddle/paddleocr.js";
import { detectPII } from "../vision-paddle/pii-detector.js";
import { redactImage } from "../vision-paddle/redactImage.js";
import { blobToDataURL } from "../vision-paddle/blobToDataUrl.js";

// const PRIVACY_LEVELS = [
//   { key: "low", label: "Low", desc: "Token replacement only" },
//   { key: "medium", label: "Medium", desc: "Tokens + face blur" },
//   { key: "high", label: "High", desc: "Full PII redaction" },
// ];

export default function PopupApp() {
  const [agentActive, setAgentActive] = useState(false);
  const [status, setStatus] = useState("idle");
  const [privacyLevel, setPrivacyLevel] = useState("medium");
  const [serverStatus] = useState("connected");
  const [latency] = useState(42);
  const [captureError, setCaptureError] = useState(null);
  const [capturing, setCapturing] = useState(false);
  const [screenshot, setScreenshot] = useState(null);
  const [redactedImage, setRedactedImage] = useState(null);
  const [processing, setProcessing] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [pendingAction, setPendingAction] = useState(null);

  const startAgentFlow = useCallback(async () => {
    setAgentActive(true);
    setStatus("observing");
    setCaptureError(null);
    setCapturing(true);
    setRedactedImage(null);
    setProcessing(true);

    try {
      const browserAPI = globalThis.browser || globalThis.chrome;

      const response = await browserAPI.runtime.sendMessage({
        type: "CAPTURE_SCREEN",
      });

      if (!response?.success) {
        throw new Error(response?.error || "Screen capture failed");
      }
      setScreenshot(response.screenshot);

      console.log("Screenshot captured successfully");

      console.log(response.screenshot);
      const extractTextFromImg = await extractText(response.screenshot);
      const piiResults = await detectPII(extractTextFromImg);
      const redactedBlob = await redactImage(response.screenshot, piiResults);
      const redactedDataURL = await blobToDataURL(redactedBlob);
      setRedactedImage(redactedDataURL);
      setProcessing(false);
      console.log(redactedDataURL);
    } catch (error) {
      console.error("Screen capture error:", error);

      setCaptureError(error.message);
      setStatus("error");
      setAgentActive(false);
      setProcessing(false);
    } finally {
      setCapturing(false);
    }
  }, []);

  const handleToggleAgent = useCallback(async () => {
    if (agentActive) {
      setAgentActive(false);
      setStatus("idle");
      return;
    }

    startAgentFlow();
  }, [agentActive, startAgentFlow]);

  const handlePromptSubmit = useCallback(() => {
    if (!agentActive) {
      startAgentFlow();
    }
  }, [agentActive, startAgentFlow]);

  const openDashboard = useCallback(() => {
    const url = chrome?.runtime?.getURL
      ? chrome.runtime.getURL("dashboard.html")
      : "dashboard.html";
    window.open(url, "_blank");
  }, []);

  const handleDownload = useCallback(() => {
    if (!redactedImage) return;
    const a = document.createElement("a");
    a.href = redactedImage;
    a.download = `privacylens-redacted-${Date.now()}.png`;
    a.click();
  }, [redactedImage]);

  return (
    <div className="popup">
      {/* Agent Running Indicator */}
      {agentActive && processing && <div className="popup__agent-indicator" />}

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

      {/* User Prompt */}
      <div className="popup__section">
        <PromptBox
          prompt={prompt}
          onPromptChange={setPrompt}
          onSubmit={handlePromptSubmit}
          disabled={capturing}
        />
      </div>

      {/* Main Toggle */}
      <div className="popup__section">
        <button
          className={`popup__agent-btn ${agentActive ? "popup__agent-btn--active" : ""}`}
          onClick={handleToggleAgent}
        >
          <span className="popup__agent-btn-icon">
            {agentActive ? "⏸" : "▶"}
          </span>
          <span className="popup__agent-btn-label">
            {agentActive ? "Stop Agent" : "Start Agent"}
          </span>
        </button>
      </div>

      <div>
        {screenshot && (
          <div className="popup__section">
            <div className="popup__screen-header">
              <h2 className="popup__section-title">
                {redactedImage ? "Redacted Screen" : "Current Screen"}
              </h2>
              {(agentActive || processing) && (
                <div className="popup__running-badge">
                  <span className="popup__running-dot" />
                  <span className="popup__running-text">Running</span>
                </div>
              )}
            </div>

            <div className="popup__preview-wrap">
              <img
                src={redactedImage || screenshot}
                alt={
                  redactedImage
                    ? "Redacted browser screen"
                    : "Current browser screen"
                }
                className="popup__preview-img"
              />
              {(agentActive || processing) && (
                <div
                  className="popup__screen-live-indicator"
                  title="Agent is running"
                >
                  <span className="popup__blinking-dot" />
                </div>
              )}
            </div>

            {redactedImage && (
              <button className="popup__download-btn" onClick={handleDownload}>
                <span className="popup__download-icon">📥</span>
                Download Redacted Image
              </button>
            )}
          </div>
        )}
      </div>

      {/* Privacy Level */}
      {/* <div className="popup__section">
        <span className="popup__section-title">Privacy Level</span>
        <div className="popup__privacy-levels">
          {PRIVACY_LEVELS.map((level) => (
            <button
              key={level.key}
              className={`popup__privacy-btn ${privacyLevel === level.key ? "popup__privacy-btn--active" : ""}`}
              onClick={() => setPrivacyLevel(level.key)}
              title={level.desc}
            >
              <span className="popup__privacy-label">{level.label}</span>
              <span className="popup__privacy-desc">{level.desc}</span>
            </button>
          ))}
        </div>
      </div> */}

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

      {/* Action Permission Dialog */}
      {pendingAction && (
        <ActionConfirmation
          action={pendingAction}
          onApprove={() => setPendingAction(null)}
          onReject={() => setPendingAction(null)}
        />
      )}
    </div>
  );
}
