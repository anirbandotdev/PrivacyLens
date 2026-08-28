import express from "express";
import { randomUUID } from "node:crypto";
import { analyzeWithQwen } from "../services/qwen.js";

const router = express.Router();

router.post("/", async (request, response) => {
  const { prompt, sanitizedText, sanitizedScreenshot, redactionSummary, privacyVerified } = request.body || {};

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

  const requestId = randomUUID();
  console.log(`[Request ID] ${requestId}`);

  try {
    const analysis = await analyzeWithQwen({
      prompt,
      sanitizedText,
      sanitizedScreenshot,
    });

    return response.status(200).json({
      success: true,
      requestId,
      status: "completed",
      message: analysis.message,
      actions: analysis.actions,
      redactionSummary: redactionSummary || {},
    });
  } catch (error) {
      // Temporary privacy-safe diagnostic log
      console.error(JSON.stringify({
        requestId,
        errorName: error.name,
        errorMessage: error.message,
        statusCode: error.status || error.statusCode || "N/A"
      }));

      // Generic response to the client
      response.status(502).json({
        success: false,
        requestId,
        status: "failed",
        error: "AI analysis failed. Please try again."
      });
  }
});

export default router;