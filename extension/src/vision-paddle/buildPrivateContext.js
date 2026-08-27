import { blobToDataURL } from "./blobToDataUrl.js";
import { extractText } from "./paddleocr.js";
import { detectPII } from "./pii-detector.js";
import { redactImage } from "./redactImage.js";

const BASE64_IMAGE_DATA_URL_REGEX =
  /^data:image\/[a-zA-Z0-9.+_-]+;base64,[A-Za-z0-9+/=]+$/;

function isValidPiiBox(box) {
  return (
    box &&
    Array.isArray(box.points) &&
    box.points.length >= 4 &&
    box.points.every(
      (pt) =>
        pt &&
        typeof pt.x === "number" &&
        Number.isFinite(pt.x) &&
        typeof pt.y === "number" &&
        Number.isFinite(pt.y)
    )
  );
}

export async function buildPrivateContext({ prompt, screenshot } = {}) {
  if (typeof prompt !== "string" || prompt.trim().length === 0) {
    throw new Error("A non-empty prompt string is required.");
  }

  if (
    typeof screenshot !== "string" ||
    !BASE64_IMAGE_DATA_URL_REGEX.test(screenshot)
  ) {
    throw new Error("A valid screenshot is required.");
  }

  const promptPiiResults = await detectPII([{ text: prompt.trim() }]);
  if (promptPiiResults && promptPiiResults.length > 0) {
    return {
      decision: "blocked",
      message: "Please remove any type personal information from the prompt",
    };
  }

  const ocrResults = await extractText(screenshot);

  if (
    !Array.isArray(ocrResults) ||
    ocrResults.length === 0 ||
    !ocrResults.every(
      (item) =>
        item && typeof item.text === "string" && item.text.trim().length > 0
    )
  ) {
    return {
      decision: "blocked",
      message: "Privacy verification could not be completed.",
    };
  }

  const piiResults = (await detectPII(ocrResults)) || [];

  if (!piiResults.every((item) => isValidPiiBox(item?.box))) {
    return {
      decision: "blocked",
      message: "Privacy verification could not be completed.",
    };
  }

  const piiBoxSet = new Set(piiResults.map((r) => r.box));

  const sanitizedText = ocrResults
    .map((item) => (piiBoxSet.has(item.box) ? "[REDACTED]" : item.text))
    .join("\n");

  const redactedBlob = await redactImage(screenshot, piiResults);
  const sanitizedScreenshot = await blobToDataURL(redactedBlob);

  if (
    typeof sanitizedScreenshot !== "string" ||
    !BASE64_IMAGE_DATA_URL_REGEX.test(sanitizedScreenshot)
  ) {
    return {
      decision: "blocked",
      message: "Privacy verification could not be completed.",
    };
  }

  return {
    decision: "server",
    sanitizedPrompt: prompt.trim(),
    sanitizedText,
    sanitizedScreenshot,
    redactionSummary: {
      detectedRegions: piiResults.length,
      redactedRegions: piiResults.length,
    },
    privacyVerified: true,
  };
}
