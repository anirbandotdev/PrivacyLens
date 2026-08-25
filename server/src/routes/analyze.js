import { randomUUID } from "node:crypto";
import express from "express";

const router = express.Router();

router.post("/", (request, response) => {
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

  return response.status(202).json({
    success: true,
    requestId,
    status: "received",
    redactionSummary: redactionSummary || {},
    message: "Sanitized context received and accepted for analysis.",
  });
});

export default router;