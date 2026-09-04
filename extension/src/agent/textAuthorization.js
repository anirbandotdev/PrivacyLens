export function isTypedValueAuthorized(prompt, value) {
  if (typeof prompt !== "string" || typeof value !== "string") {
    return false;
  }

  const normalizedPrompt = prompt
    .normalize("NFKC")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

  const normalizedValue = value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

  if (normalizedValue.length === 0 || normalizedPrompt.length === 0) {
    return false;
  }

  return normalizedPrompt.includes(normalizedValue);
}
