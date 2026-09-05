import express from "express";
import { randomUUID } from "node:crypto";
import { analyzeWithQwen } from "../services/qwen.js";
import { normalizeTaskState } from "../validation/taskState.js";

const router = express.Router();

function classifyError(error) {
  const status = Number(error?.status || error?.statusCode);
  const name = error?.name || "";
  const msg = (error?.message || "").toLowerCase();

  if (name === "ZodError" || msg.includes("schema validation failed") || msg.includes("validation failed")) {
    return "SCHEMA_VALIDATION_FAILED";
  }

  if (name === "SyntaxError" || msg.includes("failed to parse") || msg.includes("parse error") || msg.includes("json")) {
    return "RESPONSE_PARSE_FAILED";
  }

  if (name === "AbortError" || name === "TimeoutError" || status === 408 || msg.includes("timed out") || msg.includes("timeout")) {
    return "REQUEST_TIMEOUT";
  }

  if (status === 429 || msg.includes("rate limit") || msg.includes("quota") || msg.includes("resource_exhausted") || msg.includes("too many requests")) {
    return "RATE_LIMITED";
  }

  if (status === 401 || status === 403 || msg.includes("api key") || msg.includes("unauthorized") || msg.includes("unauthenticated") || msg.includes("permission_denied") || msg.includes("forbidden")) {
    return "AUTHENTICATION_FAILED";
  }

  if (status === 400 || status === 422 || msg.includes("invalid_argument") || msg.includes("rejected") || msg.includes("bad request")) {
    return "PROVIDER_REQUEST_REJECTED";
  }

  if (msg.includes("failed to connect") || msg.includes("econnrefused") || msg.includes("enotfound") || msg.includes("fetch failed") || name === "FetchError") {
    return "CONNECTION_FAILED";
  }

  if ((status >= 500 && status <= 599) || msg.includes("unavailable") || msg.includes("overloaded") || msg.includes("server error")) {
    return "PROVIDER_UNAVAILABLE";
  }

  return "UNKNOWN_PROVIDER_FAILURE";
}

router.post("/", async (request, response) => {
  const {
    prompt,
    sanitizedText,
    sanitizedScreenshot,
    redactionSummary,
    privacyVerified,
    taskState,
  } = request.body || {};

  if (privacyVerified !== true) {
    return response.status(400).json({
      success: false,
      error: "Privacy verification failed. privacyVerified must strictly equal true.",
    });
  }

  if (typeof prompt !== "string" || prompt.trim().length === 0) {
    return response.status(400).json({
      success: false,
      error: "Prompt is required and must be a non-empty string.",
    });
  }

  if (prompt.length > 2000) {
    return response.status(400).json({
      success: false,
      error: "Prompt must not exceed 2000 characters.",
    });
  }

  const hasText = typeof sanitizedText === "string" && sanitizedText.trim().length > 0;
  const hasScreenshot = typeof sanitizedScreenshot === "string" && sanitizedScreenshot.trim().length > 0;

  if (!hasText && !hasScreenshot) {
    return response.status(400).json({
      success: false,
      error: "At least one of sanitizedText or sanitizedScreenshot must be provided.",
    });
  }

  if (sanitizedText !== undefined && typeof sanitizedText !== "string") {
    return response.status(400).json({
      success: false,
      error: "sanitizedText must be a string if provided.",
    });
  }

  if (sanitizedScreenshot !== undefined && (typeof sanitizedScreenshot !== "string" || !sanitizedScreenshot.startsWith("data:image/"))) {
    return response.status(400).json({
      success: false,
      error: "sanitizedScreenshot must be a valid image data URL if provided.",
    });
  }

  if (redactionSummary !== undefined && (typeof redactionSummary !== "object" || redactionSummary === null || Array.isArray(redactionSummary))) {
    return response.status(400).json({
      success: false,
      error: "redactionSummary must be an object if provided.",
    });
  }

  let normalizedTaskState;
  try {
    normalizedTaskState = normalizeTaskState(taskState);
  } catch {
    return response.status(400).json({
      success: false,
      error: "Invalid task state.",
    });
  }

  const requestId = randomUUID();

  try {
    const analysis = await analyzeWithQwen({
      prompt,
      sanitizedText,
      sanitizedScreenshot,
      taskState: normalizedTaskState,
    });

    if (process.env.NODE_ENV !== "production") {
      console.log(
        JSON.stringify({
          requestId,
          stepIndex: normalizedTaskState?.stepIndex ?? null,
          taskComplete: analysis.taskComplete ?? null,
          actions: Array.isArray(analysis.actions)
            ? analysis.actions.map((action) => ({
                type: action?.type ?? null,
                targetId: action?.targetId ?? null,
              }))
            : [],
        }),
      );
    }

    const responsePayload = {
      success: true,
      requestId,
      status: "completed",
      message: analysis.message,
      actions: analysis.actions,
      redactionSummary: redactionSummary || {},
    };

    if (typeof analysis.taskComplete === "boolean") {
      responsePayload.taskComplete = analysis.taskComplete;
    }

    return response.status(200).json(responsePayload);
  } catch (error) {
    if (process.env.NODE_ENV !== "production") {
      const errorCode = classifyError(error);
      console.error(
        JSON.stringify({
          requestId,
          errorCode,
          errorName: error?.name || "Error",
          statusCode: error?.status || error?.statusCode || "N/A",
        })
      );
    }

    // Generic response to the client without exposing internal details
    return response.status(502).json({
      success: false,
      requestId,
      status: "failed",
      error: "AI analysis failed. Please try again.",
    });
  }
});

export default router;