import { analyzeSanitizedContext } from "../api/analyzeClient.js";
import { validateAgentActions } from "./actionValidator.js";
import { routeLocalPrompt } from "./localIntentRouter.js";
import { normalizeTaskState } from "./taskState.js";
import { isTypedValueAuthorized } from "./textAuthorization.js";

const FORBIDDEN_RAW_KEYS = ["rawScreenshot", "originalScreenshot", "rawText", "originalText"];

function hasForbiddenRawData(value, visited = new WeakSet()) {
  if (!value || typeof value !== "object") {
    return false;
  }

  if (visited.has(value)) {
    return false;
  }

  visited.add(value);

  for (const [key, nestedValue] of Object.entries(value)) {
    if (FORBIDDEN_RAW_KEYS.includes(key)) {
      return true;
    }

    if (hasForbiddenRawData(nestedValue, visited)) {
      return true;
    }
  }

  return false;
}

export async function runPrivacyAgent({ prompt, buildPrivateContext, taskState }) {
  if (typeof prompt !== "string" || prompt.trim().length === 0) {
    throw new Error("A non-empty prompt string is required.");
  }

  const normalizedTaskState = normalizeTaskState(taskState);
  const isMultiStep = normalizedTaskState !== undefined;

  const cleanedPrompt = prompt.trim();
  const localRouteResult = routeLocalPrompt(cleanedPrompt);

  if (localRouteResult?.decision === "local") {
    const validatedActions = validateAgentActions(localRouteResult.actions ?? []);
    for (const action of validatedActions) {
      if ((action.type === "type" || action.type === "search") && typeof action.value === "string") {
        if (!isTypedValueAuthorized(cleanedPrompt, action.value)) {
          return {
            source: "local",
            message: "The proposed text was not authorized.",
            actions: [],
            ...(isMultiStep ? { taskComplete: true } : {}),
          };
        }
      }
    }
    if (isMultiStep) {
      if (normalizedTaskState.stepIndex === 0) {
        return {
          source: "local",
          message: localRouteResult.message,
          actions: validatedActions,
          taskComplete: false,
        };
      }
      return {
        source: "local",
        message: localRouteResult.message || "Task completed",
        actions: [],
        taskComplete: true,
      };
    }
    return {
      source: "local",
      message: localRouteResult.message,
      actions: validatedActions,
    };
  }

  if (typeof buildPrivateContext !== "function") {
    throw new Error("buildPrivateContext must be a function.");
  }

  const contextResult = await buildPrivateContext({
    prompt: cleanedPrompt,
  });

  if (!contextResult || typeof contextResult !== "object") {
    throw new Error("Invalid context result received from buildPrivateContext.");
  }

  if (hasForbiddenRawData(contextResult)) {
    throw new Error("Raw and unredacted fields are strictly forbidden.");
  }

  const { decision } = contextResult;

  if (decision === "local") {
    const validatedActions = validateAgentActions(contextResult.actions ?? []);
    const promptToCheck = contextResult.sanitizedPrompt || cleanedPrompt;
    for (const action of validatedActions) {
      if ((action.type === "type" || action.type === "search") && typeof action.value === "string") {
        if (!isTypedValueAuthorized(promptToCheck, action.value)) {
          return {
            source: "local",
            message: "The proposed text was not authorized.",
            actions: [],
            ...(isMultiStep ? { taskComplete: true } : {}),
          };
        }
      }
    }
    if (isMultiStep) {
      if (normalizedTaskState.stepIndex === 0) {
        return {
          source: "local",
          message: contextResult.message,
          actions: validatedActions,
          taskComplete: false,
        };
      }
      return {
        source: "local",
        message: contextResult.message || "Task completed",
        actions: [],
        taskComplete: true,
      };
    }
    return {
      source: "local",
      message: contextResult.message,
      actions: validatedActions,
    };
  }

  if (decision === "blocked") {
    throw new Error("Privacy verification blocked the request.");
  }

  if (decision === "server") {
    if (contextResult.privacyVerified !== true) {
      throw new Error("Privacy verification failed: privacyVerified must strictly equal true for server analysis.");
    }

    if (
      typeof contextResult.sanitizedPrompt !== "string" ||
      contextResult.sanitizedPrompt.trim().length === 0
    ) {
      throw new Error("Server processing requires a non-empty sanitizedPrompt.");
    }

    if (
      typeof contextResult.sanitizedText !== "string" ||
      contextResult.sanitizedText.trim().length === 0
    ) {
      throw new Error("Server processing requires a non-empty sanitizedText.");
    }

    const analyzePayload = {
      prompt: contextResult.sanitizedPrompt.trim(),
      sanitizedText: contextResult.sanitizedText,
      redactionSummary: {
        ...(contextResult.redactionSummary ?? {}),
        screenshotIncluded: false,
      },
      privacyVerified: true,
    };

    if (isMultiStep) {
      analyzePayload.taskState = normalizedTaskState;
    }

    const serverResult = await analyzeSanitizedContext(analyzePayload);

    if (isMultiStep) {
      if (typeof serverResult?.taskComplete !== "boolean") {
        throw new Error("Server response missing boolean taskComplete in multi-step mode.");
      }
    }

    const validatedActions = validateAgentActions(serverResult?.actions ?? []);

    if (isMultiStep) {
      if (serverResult.taskComplete === true && validatedActions.length !== 0) {
        throw new Error("Multi-step task complete requires zero actions.");
      }
      if (serverResult.taskComplete === false && validatedActions.length !== 1) {
        throw new Error("Multi-step incomplete task requires exactly one action.");
      }
    }

    for (const action of validatedActions) {
      if ((action.type === "type" || action.type === "search") && typeof action.value === "string") {
        if (!isTypedValueAuthorized(contextResult.sanitizedPrompt, action.value)) {
          const result = {
            source: "server",
            message: "The proposed text was not authorized.",
            actions: [],
          };
          if (isMultiStep) {
            result.taskComplete = true;
          }
          return result;
        }
      }
    }

    const allowedTargetIds = new Set(
      Array.isArray(contextResult.allowedTargetIds)
        ? contextResult.allowedTargetIds
        : (contextResult.allowedTargetIds || [])
    );

    for (const action of validatedActions) {
      if (action.targetId !== undefined && !allowedTargetIds.has(action.targetId)) {
        throw new Error("Action targetId is not allowed.");
      }
    }

    const result = {
      ...serverResult,
      actions: validatedActions,
      source: "server",
    };

    if (isMultiStep) {
      result.taskComplete = serverResult.taskComplete;
    }

    return result;
  }

  throw new Error(`Unknown decision: ${decision}`);
}
