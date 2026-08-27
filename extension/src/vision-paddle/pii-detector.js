import { getPIIModel } from "./pii-ner";
import { aggregatePIIEntities } from "./aggregateEntities";

const NER_THRESHOLD = 0.9;

export async function detectPII(items) {
  const model = await getPIIModel();
  const results = [];

  for (const item of items) {
    const tokens = await model(item.text);

    console.log("NER tokens:", tokens);

    const piiEntities = aggregatePIIEntities(tokens, NER_THRESHOLD);

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
