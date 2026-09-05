const MARKER = "INTERACTIVE ELEMENTS — UNTRUSTED PAGE METADATA";
const DEFAULT_PAGE_TEXT_BUDGET = 3000;

const STOP_WORDS = new Set([
  "the", "a", "an", "and", "or", "to", "in", "on", "at", "for", "by",
  "with", "from", "of", "it", "is", "that", "this", "my", "your", "into",
  "as", "be", "so", "then", "if", "but", "about", "above", "after"
]);

function extractGoalTerms(userGoal) {
  if (typeof userGoal !== "string" || !userGoal.trim()) {
    return {
      phrases: [],
      keywords: [],
      actionTypes: { hasPlay: false, hasSearch: false, hasSend: false, hasSelect: false, hasDelete: false },
    };
  }

  const clean = userGoal.trim();

  const phrases = [];
  const phraseRegex = /[“"']([^“”"']+)["”']/g;
  let match;
  while ((match = phraseRegex.exec(clean)) !== null) {
    const p = match[1].toLowerCase().trim();
    if (p.length >= 2) {
      phrases.push(p);
    }
  }

  const words = clean
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 2 && !STOP_WORDS.has(w));

  const actionTypes = {
    hasPlay: /\b(?:play|listen|song|track|music|audio|video|stream)\b/i.test(clean),
    hasSearch: /\b(?:search|find|query|lookup)\b/i.test(clean),
    hasSend: /\b(?:send|message|chat|reply|post|publish|compose|email)\b/i.test(clean),
    hasSelect: /\b(?:select|choose|pick|option)\b/i.test(clean),
    hasDelete: /\b(?:delete|remove|clear)\b/i.test(clean),
  };

  return { phrases, keywords: words, actionTypes };
}

function scoreEntry(parsed, terms, index) {
  if (!parsed || typeof parsed !== "object") {
    return -index;
  }

  let score = 0;
  const label = typeof parsed.label === "string" ? parsed.label.toLowerCase() : "";
  const controlType = typeof parsed.controlType === "string" ? parsed.controlType.toLowerCase() : "";
  const role = typeof parsed.role === "string" ? parsed.role.toLowerCase() : "";
  const elementType = typeof parsed.elementType === "string" ? parsed.elementType.toLowerCase() : "";
  const purpose = typeof parsed.purpose === "string" ? parsed.purpose.toLowerCase() : "";

  const combined = `${label} ${controlType} ${role} ${elementType} ${purpose}`;

  for (const phrase of terms.phrases) {
    if (phrase && label.includes(phrase)) {
      score += 100;
    }
  }

  for (const kw of terms.keywords) {
    if (kw && label.includes(kw)) {
      score += 15;
    }
  }

  if (terms.actionTypes.hasPlay) {
    if (/\bplay\b/i.test(combined)) {
      score += 60;
    } else if (/\b(?:track|song|audio|video|album|artist)\b/i.test(combined)) {
      score += 30;
    }
  }

  if (terms.actionTypes.hasSearch) {
    if (controlType === "search" || purpose === "search" || /\b(?:search|searchbox)\b/i.test(combined)) {
      score += 50;
    }
  }

  if (terms.actionTypes.hasSend) {
    if (
      controlType === "contenteditable" ||
      purpose === "send" ||
      purpose === "reply" ||
      purpose === "post" ||
      purpose === "publish" ||
      /\b(?:send|post|publish|reply|textbox|message)\b/i.test(combined)
    ) {
      score += 50;
    }
  }

  if (controlType === "contenteditable" || elementType === "input" || elementType === "textarea") {
    score += 20;
  } else if (elementType === "button" || role === "button" || elementType === "select") {
    score += 10;
  }

  score += Math.max(0, 100 - index) * 0.01;

  return score;
}

export function boundSanitizedContext(sanitizedText, maxChars = 8000, userGoal = "") {
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

  const beforeMarker = sanitizedText.slice(0, markerIndex).trimEnd();
  const fromMarker = sanitizedText.slice(markerIndex);

  const lines = fromMarker.split("\n");
  const markerLine = lines[0];
  const metaLines = lines.slice(1).filter((l) => l.trim().length > 0);

  const allMetaText = metaLines.length > 0
    ? `${markerLine}\n${metaLines.join("\n")}`
    : markerLine;

  let selectedMetaLines = metaLines;

  if (allMetaText.length > maxChars) {
    const goalTerms = extractGoalTerms(userGoal);

    const parsedEntries = metaLines.map((line, index) => {
      let parsed = null;
      try {
        parsed = JSON.parse(line);
      } catch {}
      return {
        line,
        parsed,
        index,
        score: scoreEntry(parsed, goalTerms, index),
      };
    });

    parsedEntries.sort((a, b) => b.score - a.score);

    const chosen = [];
    let currentMetaChars = markerLine.length;

    for (const entry of parsedEntries) {
      const neededChars = 1 + entry.line.length;
      if (currentMetaChars + neededChars <= maxChars) {
        chosen.push(entry);
        currentMetaChars += neededChars;
      }
    }

    chosen.sort((a, b) => a.index - b.index);
    selectedMetaLines = chosen.map((e) => e.line);
  }

  const selectedMetaText = selectedMetaLines.length > 0
    ? `${markerLine}\n${selectedMetaLines.join("\n")}`
    : markerLine;

  if (selectedMetaText.length > maxChars) {
    return selectedMetaText.slice(0, maxChars);
  }

  const separator = beforeMarker ? "\n\n" : "";
  const remainingForOcr = maxChars - selectedMetaText.length - separator.length;
  const allowedPageBudget = Math.max(0, Math.min(DEFAULT_PAGE_TEXT_BUDGET, remainingForOcr));
  const truncatedPageText = beforeMarker ? beforeMarker.slice(0, allowedPageBudget).trimEnd() : "";

  const result = truncatedPageText
    ? `${truncatedPageText}\n\n${selectedMetaText}`
    : selectedMetaText;

  if (process.env.NODE_ENV !== "production") {
    console.log("SERVER_CONTEXT_BUDGET_DIAGNOSTICS:", {
      metadataCountBefore: metaLines.length,
      metadataCountAfter: selectedMetaLines.length,
      ocrLengthBefore: beforeMarker.length,
      ocrLengthAfter: truncatedPageText.length,
      boundedTotalLength: result.length,
      maxChars,
    });
  }

  return result;
}




