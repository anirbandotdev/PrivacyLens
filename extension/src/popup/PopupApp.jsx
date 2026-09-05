import { useCallback, useRef, useState } from "react";
import { executeActionsInActiveTab } from "../agent/actionExecutor.js";
import { collectSafeDomContextInActiveTab } from "../agent/domContextCollector.js";
import { isCommunicationIntent } from "../agent/localIntentRouter.js";
import { runMultiStepTask } from "../agent/multiStepController.js";
import { runPrivacyAgent } from "../agent/orchestrator.js";
import { waitForActiveTabReady } from "../agent/pageReadiness.js";
import ActionConfirmation from "../components/ActionPerm.jsx";
import ConnectionIndicator from "../components/ConnectionIndicator.jsx";
import PromptBox from "../components/PromptBox.jsx";
import StatusBadge from "../components/StatusBadge.jsx";
import { base64ToPixels } from "../dom_vision-paddle/base64ToPixels.js";
import { buildPrivateContext } from "../dom_vision-paddle/buildPrivateContext.js";
import { detectPII_DOM } from "../dom_vision-paddle/dom-pii-detect.js";
import { extractVisualElementsText } from "../dom_vision-paddle/dom-visualElements-extract.js";
import { drawRedactBox } from "../dom_vision-paddle/drawRedactBox.js";

export default function PopupApp() {
  const [agentActive, setAgentActive] = useState(false);
  const [status, setStatus] = useState("idle");
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

  const isTaskRunningRef = useRef(false);
  const confirmationResolverRef = useRef(null);
  const prevObservationFingerprintRef = useRef(null);

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
        type: "PROCESS_CURRENT_PAGE",
      });

      if (!response?.success) {
        throw new Error(response?.error || "Extracting current screen failed");
      }
      setScreenshot(response.screenshot);

      console.log("Screenshot captured successfully");

      const pixels = await base64ToPixels(response.screenshot);

      const visualElementsText = await extractVisualElementsText(
        response.dom.data.visualElements,
        response.dom.data.viewport,
        response.screenshot,
      );

      const resultArr = await detectPII_DOM(
        response.dom.data.elements,
        response.dom.data.viewport,
        pixels,
      );

      const redactedImage = await drawRedactBox(response.screenshot, [
        ...resultArr,
        ...visualElementsText,
      ]);

      setScreenshot(redactedImage);
      setRedactedImage(redactedImage);
      setStatus("idle");
      setAgentActive(false);
      setProcessing(false);
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

  const handleApproveAction = useCallback(() => {
    const resolver = confirmationResolverRef.current;
    confirmationResolverRef.current = null;
    setPendingAction(null);
    if (resolver) {
      resolver(true);
    }
  }, []);

  const handleRejectAction = useCallback(() => {
    const resolver = confirmationResolverRef.current;
    confirmationResolverRef.current = null;
    setPendingAction(null);
    if (resolver) {
      resolver(false);
    }
  }, []);

  const handlePromptSubmit = useCallback(
    async (cleanedPrompt) => {
      if (import.meta.env.DEV) {
        console.log({ event: "submit_attempt", alreadyRunning: isTaskRunningRef.current });
      }

      const targetPrompt =
        typeof cleanedPrompt === "string" ? cleanedPrompt : prompt.trim();
      if (!targetPrompt) {
        startAgentFlow();
        return;
      }

      if (isTaskRunningRef.current) {
        return;
      }
      isTaskRunningRef.current = true;

      const taskRunId = crypto.randomUUID();
      if (import.meta.env.DEV) {
        console.log({ event: "task_start", taskRunId });
      }

      setAgentActive(true);
      setStatus("observing");
      setCaptureError(null);
      setAgentMessage(null);
      setRedactedImage(null);
      setProcessing(true);

      try {
        const result = await runMultiStepTask({
          prompt: targetPrompt,
          maxSteps: 6,
          observeAndPlan: ({ stepIndex, history }) => {
            if (import.meta.env.DEV) {
              console.log({
                event: "observe",
                taskRunId,
                stepIndex,
                historyLength: history.length,
              });
            }
            return runPrivacyAgent({
              prompt: targetPrompt,
              taskState: { stepIndex, history },
              buildPrivateContext: async ({ prompt: contextPrompt }) => {
                setCapturing(true);
                try {
                  const browserAPI = globalThis.browser || globalThis.chrome;
                  const response = await browserAPI.runtime.sendMessage({
                    type: "PROCESS_CURRENT_PAGE",
                  });

                  if (!response?.success) {
                    throw new Error(
                      response?.error || "Extracting current screen failed",
                    );
                  }

                  setScreenshot(response.screenshot);

                  let domContext = [];
                  try {
                    const isStructuralOnly = isCommunicationIntent(contextPrompt);
                    domContext = await collectSafeDomContextInActiveTab({
                      structuralOnly: isStructuralOnly,
                    });
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
                    visualElements: response?.dom?.data?.visualElements || [],
                    viewport: response?.dom?.data?.viewport || null,
                  });

                  if (contextResult?.sanitizedScreenshot) {
                    setRedactedImage(contextResult.sanitizedScreenshot);
                  }

                  const isDiagnosticsOptedIn =
                    (typeof window !== "undefined" &&
                      (window.__PRIVACYLENS_DIAGNOSTICS__ === true ||
                        window.localStorage?.getItem("PRIVACYLENS_DIAGNOSTICS") === "true")) ||
                    Boolean(import.meta.env?.DEV);

                  if (isDiagnosticsOptedIn) {
                    const currentFingerprint = `${contextResult?.allowedTargetIds?.length || 0}:${contextResult?.sanitizedText?.length || 0}:${(contextResult?.allowedTargetIds || []).join(",")}`;
                    const observationChanged =
                      prevObservationFingerprintRef.current !== null
                        ? prevObservationFingerprintRef.current !== currentFingerprint
                        : true;
                    prevObservationFingerprintRef.current = currentFingerprint;

                    const RELEVANT_CONTROL_REGEX =
                      /\b(?:play|track|result|song|media|video|audio|item)\b/i;
                    const allowedSet = new Set(contextResult?.allowedTargetIds || []);
                    const relevantControlRetained = Boolean(
                      domContext.some(
                        (el) =>
                          allowedSet.has(el?.targetId) &&
                          (RELEVANT_CONTROL_REGEX.test(el?.label || "") ||
                            RELEVANT_CONTROL_REGEX.test(el?.role || "") ||
                            RELEVANT_CONTROL_REGEX.test(el?.controlType || ""))
                      )
                    );

                    const searchSubmittedPresent = Boolean(
                      history.some((h) => h.effect === "search_submitted")
                    );

                    console.log({
                      event: "observation_diagnostics",
                      taskRunId,
                      stepIndex,
                      observationChanged,
                      beforeFilterCount: domContext.length,
                      afterFilterCount:
                        contextResult?.redactionSummary?.includedDomElements ?? 0,
                      searchSubmittedPresent,
                      relevantControlRetained,
                    });
                  }

                  return contextResult;
                } finally {
                  setCapturing(false);
                }
              },
            });
          },
          executeAction: async (action, { confirmed } = {}) => {
            if (import.meta.env.DEV) {
              console.log({
                event: "execute",
                taskRunId,
                actionType: action.type,
              });
            }
            const options = confirmed
              ? { confirmedActionIndexes: [0] }
              : undefined;
            const results = await executeActionsInActiveTab([action], options);
            return results?.[0] || { status: "failed" };
          },
          requestConfirmation: (action) => {
            return new Promise((resolve) => {
              confirmationResolverRef.current = resolve;
              setPendingAction({ action });
            });
          },
          waitForReady: ({ actionType, signal }) =>
            waitForActiveTabReady({
              settleDelayMs:
                actionType === "search" || actionType === "submit_search" || actionType === "click"
                  ? 2000
                  : 500,
              signal,
            }),
        });

        if (result?.message) {
          setAgentMessage(result.message);
        }

        const NON_ERROR_STATUSES = new Set([
          "completed",
          "cancelled",
          "aborted",
        ]);

        if (NON_ERROR_STATUSES.has(result?.status)) {
          setStatus("idle");
        } else {
          setStatus("error");
          setCaptureError(
            result?.message || `Task failed with status: ${result?.status}`,
          );
        }
      } catch (error) {
        console.error("Agent execution error:", error);
        setCaptureError(error.message);
        setAgentMessage("Failed to process request. Please try again.");
        setStatus("error");
      } finally {
        if (import.meta.env.DEV) {
          console.log({ event: "task_finish", taskRunId });
        }
        setProcessing(false);
        setCapturing(false);
        setAgentActive(false);
        isTaskRunningRef.current = false;
        prevObservationFingerprintRef.current = null;
        if (confirmationResolverRef.current) {
          confirmationResolverRef.current(false);
          confirmationResolverRef.current = null;
        }
      }
    },
    [prompt, startAgentFlow],
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
          disabled={processing || capturing}
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
