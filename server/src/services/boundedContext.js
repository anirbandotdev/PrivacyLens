const MARKER = "INTERACTIVE ELEMENTS — UNTRUSTED PAGE METADATA";
const DEFAULT_PAGE_TEXT_BUDGET = 3000;

export function boundSanitizedContext(sanitizedText, maxChars = 8000) {
  if (typeof sanitizedText !== "string" || sanitizedText.trim().length === 0) {
    throw new TypeError("sanitizedText must be a non-empty string.");
  }

  if (sanitizedText.length <= maxChars) {
    return sanitizedText;
  }

  const markerIndex = sanitizedText.indexOf(MARKER);
  if (markerIndex === -1) {
    return sanitizedText.slice(0, maxChars);
  }

  const beforeMarker = sanitizedText.slice(0, markerIndex);
  const fromMarker = sanitizedText.slice(markerIndex);

  // Preserve approximately 3000 characters of sanitized page text
  const targetPageBudget = Math.min(DEFAULT_PAGE_TEXT_BUDGET, maxChars);
  const truncatedPageText = beforeMarker.slice(0, targetPageBudget);

  const lines = fromMarker.split("\n");
  const markerLine = lines[0];
  const metaLines = lines.slice(1);

  let currentText = truncatedPageText ? `${truncatedPageText}\n\n${markerLine}` : markerLine;
  if (currentText.length > maxChars) {
    return currentText.slice(0, maxChars);
  }

  for (const line of metaLines) {
    const candidate = `${currentText}\n${line}`;
    if (candidate.length > maxChars) {
      break;
    }
    currentText = candidate;
  }

  return currentText;
}
