import { analyzeSanitizedContext } from "../api/analyzeClient.js";
import { validateAgentActions } from "./actionValidator.js";
import { routeLocalPrompt } from "./localIntentRouter.js";

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

export async function runPrivacyAgent({ prompt, buildPrivateContext }) {
  if (typeof prompt !== "string" || prompt.trim().length === 0) {
    throw new Error("A non-empty prompt string is required.");
  }

  const cleanedPrompt = prompt.trim();
  const localRouteResult = routeLocalPrompt(cleanedPrompt);

  if (localRouteResult?.decision === "local") {
    const validatedActions = validateAgentActions(localRouteResult.actions ?? []);
    return {
      source: "local",
      message: localRouteResult.message,
      actions: validatedActions
    };
  }

  if (typeof buildPrivateContext !== "function") {
    throw new Error("buildPrivateContext must be a function.");
  }

  const contextResult = await buildPrivateContext({
    prompt: cleanedPrompt
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
    return {
      source: "local",
      message: contextResult.message,
      actions: validatedActions
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

    const hasSanitizedText =
      typeof contextResult.sanitizedText === "string" &&
      contextResult.sanitizedText.trim().length > 0;
    const hasSanitizedScreenshot =
      typeof contextResult.sanitizedScreenshot === "string" &&
      contextResult.sanitizedScreenshot.trim().length > 0;

    if (!hasSanitizedText && !hasSanitizedScreenshot) {
      throw new Error("Server processing requires at least sanitizedText or sanitizedScreenshot.");
    }

    const serverResult = await analyzeSanitizedContext({
      prompt: contextResult.sanitizedPrompt.trim(),
      sanitizedText: contextResult.sanitizedText,
      sanitizedScreenshot: contextResult.sanitizedScreenshot,
      redactionSummary: contextResult.redactionSummary ?? {},
      privacyVerified: contextResult.privacyVerified
    });

    const validatedActions = validateAgentActions(serverResult?.actions ?? []);

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

    return {
      ...serverResult,
      actions: validatedActions,
      source: "server"
    };
  }

  throw new Error(`Unknown decision: ${decision}`);
}
