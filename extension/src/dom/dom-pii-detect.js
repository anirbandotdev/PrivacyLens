import { domToScreenshotBox } from "./coordinates";
import { getPIIModel } from "../vision-paddle/pii-ner";
import { aggregatePIIEntities } from "../vision-paddle/aggregateEntities";

const NER_THRESHOLD = 0.7;

const PIN_REGEX = /\b[1-9][0-9]{5}\b/;

const CONTEXTUAL_NAME_REGEX =
  /\b(?:hello|welcome|deliver\s+to|ship\s+to)(?:\s*[,:]\s*|\s+)[a-zA-Z]+(?:['’–-][a-zA-Z]+)*(?:\s+[a-zA-Z]+(?:['’–-][a-zA-Z]+)*){0,3}\b/i;

const CONTEXTUAL_PIN_REGEX =
  /\b(?:(?:pin|passcode)[\s:\-–—]+\d{4,6}|\d{4,6}[\s:\-–—]+(?:pin|passcode))\b/i;

const CONTEXTUAL_OTP_REGEX =
  /\b(?:(?:otp|one[- ]?time[- ]?code|verification[- ]?code)[\s:\-–—]+\d{4,8}|\d{4,8}[\s:\-–—]+(?:otp|one[- ]?time[- ]?code|verification[- ]?code))\b/i;

const CONTEXTUAL_CVV_REGEX =
  /\b(?:(?:cvv|cvc|cid|security[- ]?code)[\s:\-–—]+\d{3,4}|\d{3,4}[\s:\-–—]+(?:cvv|cvc|cid|security[- ]?code))\b/i;

function detectDeterministicPII(text) {
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

export async function detectPII_DOM(elementArr, viewport, screenshot) {
  const model = await getPIIModel();
  const results = [];

  for (const element of elementArr) {
    const source = element?.source ?? "DOM";
    const text = typeof element?.text === "string" ? element.text : "";
    const tokens = await model(text);

    console.log("Element: ", element);
    // console.log("NER tokens:", tokens);

    let piiEntities = aggregatePIIEntities(tokens, NER_THRESHOLD);

    const box = await domToScreenshotBox(element, viewport, screenshot);

    // let piiEntities = aggregatePIIEntities(tokens, NER_THRESHOLD);

    // console.log("PII Entities: ", piiEntities);

    if (piiEntities.length === 0 && source !== "form") {
      const fallbackEntities = detectDeterministicPII(element.text);
      if (fallbackEntities.length > 0) {
        piiEntities = fallbackEntities;
      }
    }

    if (piiEntities.length === 0 && source !== "form") {
      continue;
    }

    results.push({
      text,
      box,
      pii: piiEntities,
      source,
    });
  }

  return results;
}
