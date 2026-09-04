import { getPIIModel } from "./pii-ner.js";
import { aggregatePIIEntities } from "./aggregateEntities.js";

const NER_THRESHOLD = 0.9;

const PIN_REGEX = /\b[1-9][0-9]{5}\b/;

const CONTEXTUAL_NAME_REGEX =
  /\b(?:hello|welcome|deliver\s+to|ship\s+to)(?:\s*[,:]\s*|\s+)[a-zA-Z]+(?:['’–-][a-zA-Z]+)*(?:\s+[a-zA-Z]+(?:['’–-][a-zA-Z]+)*){0,3}\b/i;

const CONTEXTUAL_PIN_REGEX =
  /\b(?:(?:pin|passcode)[\s:\-–—]+\d{4,6}|\d{4,6}[\s:\-–—]+(?:pin|passcode))\b/i;

const CONTEXTUAL_OTP_REGEX =
  /\b(?:(?:otp|one[- ]?time[- ]?code|verification[- ]?code)[\s:\-–—]+\d{4,8}|\d{4,8}[\s:\-–—]+(?:otp|one[- ]?time[- ]?code|verification[- ]?code))\b/i;

const CONTEXTUAL_CVV_REGEX =
  /\b(?:(?:cvv|cvc|cid|security[- ]?code)[\s:\-–—]+\d{3,4}|\d{3,4}[\s:\-–—]+(?:cvv|cvc|cid|security[- ]?code))\b/i;

export function detectDeterministicPII(text) {
  if (typeof text !== "string" || !text.trim()) {
    return [];
  }

  const entities = [];

  if (PIN_REGEX.test(text)) {
    entities.push({
      entity: "PINCODE",
      score: 1.0,
    });
  }

  if (CONTEXTUAL_PIN_REGEX.test(text)) {
    entities.push({
      entity: "PIN",
      score: 1.0,
    });
  }

  if (CONTEXTUAL_OTP_REGEX.test(text)) {
    entities.push({
      entity: "OTP",
      score: 1.0,
    });
  }

  if (CONTEXTUAL_CVV_REGEX.test(text)) {
    entities.push({
      entity: "CVV",
      score: 1.0,
    });
  }

  if (CONTEXTUAL_NAME_REGEX.test(text)) {
    entities.push({
      entity: "NAME",
      score: 1.0,
    });
  }

  return entities;
}

export async function detectPII(items) {
  const model = await getPIIModel();
  const results = [];

  for (const item of items) {
    const tokens = await model(item.text);

    let piiEntities = aggregatePIIEntities(tokens, NER_THRESHOLD);

    if (piiEntities.length === 0) {
      const fallbackEntities = detectDeterministicPII(item.text);
      if (fallbackEntities.length > 0) {
        piiEntities = fallbackEntities;
      }
    }

    if (piiEntities.length === 0) {
      continue;
    }

    results.push({
      text: item.text,
      ocrConfidence: item.confidence,
      box: item.box,
      pii: piiEntities,
    });
  }

  return results;
}
