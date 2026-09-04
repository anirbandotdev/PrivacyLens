import { domToScreenshotBox } from "./coordinates";
import { getPIIModel } from "./pii-ner";
import { aggregatePIIEntities } from "./aggregateEntities";
import { detectDeterministicPII } from "./pii-detector";

const NER_THRESHOLD = 0.7;

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
