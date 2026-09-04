import express from "express";
import { randomUUID } from "node:crypto";
import { analyzeWithQwen } from "../services/qwen.js";
import { analyzeWithGemini } from "../services/gemini.js";
import { normalizeTaskState } from "../validation/taskState.js";

const router = express.Router();

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
    const analysis = await analyzeWithGemini({
      prompt,
      sanitizedText,
      sanitizedScreenshot,
      taskState: normalizedTaskState,
    });

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