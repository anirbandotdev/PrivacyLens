const ANALYZE_ENDPOINT = "http://localhost:3000/api/analyze";
const REQUEST_TIMEOUT_MS = 120000;

export async function analyzeSanitizedContext(payload) {
  if (!payload || typeof payload !== "object") {
    throw new Error("Invalid request payload.");
  }

  const {
    prompt,
    sanitizedText,
    sanitizedScreenshot,
    redactionSummary,
    privacyVerified,
    rawScreenshot,
    originalScreenshot,
    rawText,
    originalText,
  } = payload;

  if (
    rawScreenshot !== undefined ||
    originalScreenshot !== undefined ||
    rawText !== undefined ||
    originalText !== undefined ||
    "rawScreenshot" in payload ||
    "originalScreenshot" in payload ||
    "rawText" in payload ||
    "originalText" in payload
  ) {
    throw new Error("Raw and unredacted fields are strictly forbidden.");
  }

  if (sanitizedScreenshot !== undefined || "sanitizedScreenshot" in payload) {
    throw new Error("Screenshot transport is currently disabled.");
  }

  if (privacyVerified !== true) {
    throw new Error("Privacy verification failed. privacyVerified must strictly equal true.");
  }

  if (typeof prompt !== "string" || prompt.trim().length === 0) {
    throw new Error("A non-empty prompt string is required.");
  }

  if (typeof sanitizedText !== "string" || sanitizedText.trim().length === 0) {
    throw new Error("A non-empty sanitizedText string is required.");
  }

  const requestBody = {
    prompt: prompt.trim(),
    sanitizedText: sanitizedText.trim(),
    redactionSummary: redactionSummary ?? {},
    privacyVerified: true,
  };

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(ANALYZE_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
      signal: controller.signal,
    });

    let data;
    try {
      data = await response.json();
    } catch {
      data = null;
    }

    if (!response.ok) {
      const serverErrorMessage = data?.error || data?.message;
      throw new Error(serverErrorMessage || `Analysis request failed with status ${response.status}.`);
    }

    return data;
  } catch (error) {
    if (error.name === "AbortError") {
      throw new Error("Analysis request timed out after 120 seconds.");
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}
