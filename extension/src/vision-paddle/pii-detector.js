import { getPIIModel } from "./pii-ner";
import { aggregatePIIEntities } from "./aggregateEntities";

const NER_THRESHOLD = 0.9;

const PIN_REGEX = /\b[1-9][0-9]{5}\b/;
const CONTEXTUAL_NAME_REGEX =
  /\b(?:hello|welcome|deliver\s+to|ship\s+to)(?:\s*[,:]\s*|\s+)[a-zA-Z]+(?:['’–-][a-zA-Z]+)*(?:\s+[a-zA-Z]+(?:['’–-][a-zA-Z]+)*){0,3}\b/i;

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

    console.log("NER tokens:", tokens);

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

  console.log("Final PII results:", results);

  return results;
}

