const STANDALONE_SCROLL_REGEX = /^(?:(?:please|kindly)\s+)?(?:scroll|move|go)\s+(up|down)(?:\s+(?:please|kindly))?[\.!\?]*$/i;
const NEGATION_REGEX = /\b(?:not|don't|dont|never|stop|avoid|no)\b/i;

export function routeLocalPrompt(prompt) {
  if (typeof prompt !== "string" || prompt.trim().length === 0) {
    throw new Error("A non-empty prompt string is required.");
  }

  const trimmed = prompt.trim();

  if (NEGATION_REGEX.test(trimmed)) {
    return { decision: "server", confidence: 0 };
  }

  const match = trimmed.match(STANDALONE_SCROLL_REGEX);
  if (!match) {
    return { decision: "server", confidence: 0 };
  }

  const direction = match[1].toLowerCase();
  const directionText = direction === "down" ? "down" : "up";

  return {
    decision: "local",
    confidence: 1,
    message: `Scrolling ${directionText}.`,
    actions: [
      {
        type: "scroll",
        direction: directionText,
        amount: 700
      }
    ]
  };
}
