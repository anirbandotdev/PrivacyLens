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
        Number.isFinite(pt.y),
    )
  );
}

export async function buildPrivateContext({
  prompt,
  screenshot,
  domContext = [],
} = {}) {
  if (typeof prompt !== "string" || prompt.trim().length === 0) {
    throw new Error("A non-empty prompt string is required.");
  }

  if (
    typeof screenshot !== "string" ||
    !BASE64_IMAGE_DATA_URL_REGEX.test(screenshot)
  ) {
    throw new Error("A valid screenshot is required.");
  }

  if (!Array.isArray(domContext) || domContext.length > 100) {
    throw new Error(
      "A valid domContext array with at most 100 entries is required.",
    );
  }

  const promptPiiResults = await detectPII([{ text: prompt.trim() }]);
  if (promptPiiResults && promptPiiResults.length > 0) {
    return {
      decision: "blocked",
      message: "Please remove any type personal information from the prompt",
    };
  }

  const ocrResults = await extractText(screenshot);

  if (!Array.isArray(ocrResults) || ocrResults.length === 0) {
    return {
      decision: "blocked",
      message: "Privacy verification could not be completed.",
    };
  }

  const usableOcrResults = ocrResults.filter(
    (item) =>
      item && typeof item.text === "string" && item.text.trim().length > 0,
  );

  if (usableOcrResults.length === 0) {
    return {
      decision: "blocked",
      message: "Privacy verification could not be completed.",
    };
  }

  const discardedOcrRegions = ocrResults.length - usableOcrResults.length;

  const piiResults = (await detectPII(usableOcrResults)) || [];

  if (!piiResults.every((item) => isValidPiiBox(item?.box))) {
    return {
      decision: "blocked",
      message: "Privacy verification could not be completed.",
    };
  }

  const seenTargetIds = new Set();
  const candidateDomEntries = [];

  for (let i = 0; i < domContext.length; i++) {
    const entry = domContext[i];
    if (!entry || typeof entry !== "object") {
      continue;
    }

    if (
      typeof entry.targetId !== "string" ||
      entry.targetId.trim().length === 0 ||
      entry.targetId.trim().length > 200
    ) {
      continue;
    }

    if (
      typeof entry.elementType !== "string" ||
      entry.elementType.trim().length === 0
    ) {
      continue;
    }

    if (
      entry.controlType !== null &&
      entry.controlType !== undefined &&
      typeof entry.controlType !== "string"
    ) {
      continue;
    }

    if (
      entry.role !== null &&
      entry.role !== undefined &&
      typeof entry.role !== "string"
    ) {
      continue;
    }

    if (
      entry.label !== null &&
      entry.label !== undefined &&
      (typeof entry.label !== "string" || entry.label.trim().length > 120)
    ) {
      continue;
    }

    const targetId = entry.targetId.trim();
    if (seenTargetIds.has(targetId)) {
      continue;
    }
    seenTargetIds.add(targetId);

    const elementType = entry.elementType.trim();
    const controlType =
      typeof entry.controlType === "string" ? entry.controlType.trim() : null;
    const role = typeof entry.role === "string" ? entry.role.trim() : null;
    const label = typeof entry.label === "string" ? entry.label.trim() : null;

    candidateDomEntries.push({
      entry: {
        targetId,
        elementType,
        controlType,
        role,
        label,
      },
      index: i,
    });
  }

  const domPiiItems = [];
  for (const candidate of candidateDomEntries) {
    if (candidate.entry.targetId) {
      domPiiItems.push({
        text: candidate.entry.targetId,
        box: candidate.index,
      });
    }
    if (candidate.entry.label) {
      domPiiItems.push({
        text: candidate.entry.label,
        box: candidate.index,
      });
    }
  }

  const piiDomIndices = new Set();
  if (domPiiItems.length > 0) {
    const domPiiResults = (await detectPII(domPiiItems)) || [];
    for (const res of domPiiResults) {
      if (res && res.box !== undefined) {
        piiDomIndices.add(res.box);
      }
    }
  }

  const includedDomEntries = [];
  for (const candidate of candidateDomEntries) {
    if (!piiDomIndices.has(candidate.index)) {
      includedDomEntries.push(candidate.entry);
    }
  }

  const includedDomElements = includedDomEntries.length;
  const omittedDomElements = domContext.length - includedDomElements;

  const piiBoxSet = new Set(piiResults.map((r) => r.box));

  let sanitizedText = usableOcrResults
    .map((item) => (piiBoxSet.has(item.box) ? "[REDACTED]" : item.text))
    .join("\n");

  if (includedDomEntries.length > 0) {
    const domLines = includedDomEntries.map((e) => JSON.stringify(e));
    sanitizedText += `\n\nINTERACTIVE ELEMENTS — UNTRUSTED PAGE METADATA\n${domLines.join("\n")}`;
  }

  let sanitizedScreenshot;
  if (discardedOcrRegions === 0) {
    const redactedBlob = await redactImage(screenshot, piiResults);
    sanitizedScreenshot = await blobToDataURL(redactedBlob);

    if (
      typeof sanitizedScreenshot !== "string" ||
      !BASE64_IMAGE_DATA_URL_REGEX.test(sanitizedScreenshot)
    ) {
      return {
        decision: "blocked",
        message: "Privacy verification could not be completed.",
      };
    }
  }

  const result = {
    decision: "server",
    sanitizedPrompt: prompt.trim(),
    sanitizedText,
    allowedTargetIds: includedDomEntries.map((entry) => entry.targetId),
    redactionSummary: {
      detectedRegions: piiResults.length,
      redactedRegions: piiResults.length,
      discardedOcrRegions,
      screenshotIncluded: discardedOcrRegions === 0,
      includedDomElements,
      omittedDomElements,
    },
    privacyVerified: true,
  };

  if (discardedOcrRegions === 0) {
    result.sanitizedScreenshot = sanitizedScreenshot;
  }

  return result;
}
