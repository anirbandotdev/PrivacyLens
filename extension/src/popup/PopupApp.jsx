import { useCallback, useState } from "react";
import { executeActionsInActiveTab } from "../agent/actionExecutor.js";
import { collectSafeDomContextInActiveTab } from "../agent/domContextCollector.js";
import { runPrivacyAgent } from "../agent/orchestrator.js";
import ActionConfirmation from "../components/ActionPerm.jsx";
import ConnectionIndicator from "../components/ConnectionIndicator.jsx";
import PromptBox from "../components/PromptBox.jsx";
import StatusBadge from "../components/StatusBadge.jsx";
import { blobToDataURL } from "../vision-paddle/blobToDataUrl.js";
import { buildPrivateContext } from "../vision-paddle/buildPrivateContext.js";
import { extractText } from "../vision-paddle/paddleocr.js";
import { detectPII } from "../vision-paddle/pii-detector.js";
import { redactImage } from "../vision-paddle/redactImage.js";

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
  const [agentMessage, setAgentMessage] = useState(null);
  const [plannedActions, setPlannedActions] = useState([]);

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

  const executeActionsSequentially = useCallback(
    async (actions, startIndex = 0) => {
      if (!Array.isArray(actions) || actions.length === 0) return;

      for (let i = startIndex; i < actions.length; i++) {
        const action = actions[i];
        const executionResults = await executeActionsInActiveTab([action]);
        const status = executionResults?.[0]?.status;

        if (status === "executed") {
          continue;
        }

        if (status === "requires_confirmation") {
          setPendingAction({
            action,
            allActions: actions,
            actionIndex: i,
          });
          return;
        }

        const safeStatus = status || "failed";
        setCaptureError(`Action execution status: ${safeStatus}`);
        setAgentMessage(`Action execution status: ${safeStatus}`);
        setStatus("error");
        setAgentActive(false);
        return;
      }

      setStatus("idle");
    },
    [],
  );

  const handleApproveAction = useCallback(async () => {
    if (!pendingAction) return;

    const { action, allActions, actionIndex } = pendingAction;
    setPendingAction(null);

    try {
      const executionResults = await executeActionsInActiveTab([action], {
        confirmedActionIndexes: [0],
      });
      const status = executionResults?.[0]?.status;

      if (status === "executed") {
        await executeActionsSequentially(allActions, actionIndex + 1);
      } else if (status === "requires_confirmation") {
        setPendingAction({
          action,
          allActions,
          actionIndex,
        });
      } else {
        const safeStatus = status || "failed";
        setCaptureError(`Action execution status: ${safeStatus}`);
        setAgentMessage(`Action execution status: ${safeStatus}`);
        setStatus("error");
        setAgentActive(false);
      }
    } catch (error) {
      console.error("Action execution error:", error);
      setCaptureError(error.message);
      setAgentMessage("Failed to process request. Please try again.");
      setStatus("error");
      setAgentActive(false);
    }
  }, [pendingAction, executeActionsSequentially]);

  const handleRejectAction = useCallback(() => {
    setPendingAction(null);
    setAgentMessage("Action cancelled.");
    setStatus("idle");
  }, []);

  const handlePromptSubmit = useCallback(
    async (cleanedPrompt) => {
      const targetPrompt =
        typeof cleanedPrompt === "string" ? cleanedPrompt : prompt.trim();
      if (!targetPrompt) return;

      setAgentActive(true);
      setStatus("observing");
      setCaptureError(null);
      setAgentMessage(null);
      setPlannedActions([]);
      setProcessing(true);

      try {
        const result = await runPrivacyAgent({
          prompt: targetPrompt,
          buildPrivateContext: async ({ prompt: contextPrompt }) => {
            setCapturing(true);
            try {
              const browserAPI = globalThis.browser || globalThis.chrome;
              const response = await browserAPI.runtime.sendMessage({
                type: "CAPTURE_SCREEN",
              });

              if (!response?.success) {
                throw new Error(response?.error || "Screen capture failed");
              }

              setScreenshot(response.screenshot);

              let domContext = [];
              try {
                domContext = await collectSafeDomContextInActiveTab();
              } catch (error) {
                console.warn(
                  "DOM context collection failed:",
                  error instanceof Error
                    ? error.message
                    : "Unknown collector error.",
                );
                domContext = [];
              }

              const contextResult = await buildPrivateContext({
                prompt: contextPrompt,
                screenshot: response.screenshot,
                domContext,
              });

              if (contextResult?.sanitizedScreenshot) {
                setRedactedImage(contextResult.sanitizedScreenshot);
              }

              return contextResult;
            } finally {
              setCapturing(false);
            }
          },
        });

        if (result?.message) {
          setAgentMessage(result.message);
        }
        if (result?.actions) {
          setPlannedActions(result.actions);
        }

        if (result?.source === "local") {
          const executionResults = await executeActionsInActiveTab(
            result.actions || [],
          );
          for (const execResult of executionResults || []) {
            if (execResult?.status !== "executed") {
              throw new Error(
                `Action execution status: ${execResult?.status || "failed"}`,
              );
            }
          }
          setStatus("idle");
        } else if (result?.source === "server") {
          if (Array.isArray(result.actions) && result.actions.length > 0) {
            await executeActionsSequentially(result.actions, 0);
          } else {
            setStatus("idle");
          }
        } else {
          setStatus("idle");
        }
      } catch (error) {
        console.error("Agent execution error:", error);
        setCaptureError(error.message);
        setAgentMessage("Failed to process request. Please try again.");
        setStatus("error");
        setAgentActive(false);
      } finally {
        setProcessing(false);
        setCapturing(false);
      }
    },
    [prompt, executeActionsSequentially],
  );

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

      {/* User Prompt */}
      <div className="popup__section">
        <PromptBox
          prompt={prompt}
          onPromptChange={setPrompt}
          onSubmit={handlePromptSubmit}
          disabled={capturing || processing}
        />
        {agentMessage && (
          <div className="popup__agent-message" role="status">
            {agentMessage}
          </div>
        )}
      </div>

      {/* Main Toggle */}
      {/* <div className="popup__section">
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
      </div> */}

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
          action={pendingAction.action}
          onApprove={handleApproveAction}
          onReject={handleRejectAction}
        />
      )}
    </div>
  );
}
