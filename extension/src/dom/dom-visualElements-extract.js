import { domToScreenshotBox } from "./coordinates";
import { getOCR } from "../vision-paddle/paddleocr";
import { getPIIModel } from "../vision-paddle/pii-ner";
import { aggregatePIIEntities } from "../vision-paddle/aggregateEntities";

const MIN_DIMENSION = 20;



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

async function cropImage(bitmap, box) {
  const canvas = new OffscreenCanvas(box.width, box.height);

  const ctx = canvas.getContext("2d", { willReadFrequently: true });

  ctx.drawImage(
    bitmap,
    box.x,
    box.y,
    box.width,
    box.height,
    0,
    0,
    box.width,
    box.height,
  );

  const imageData = ctx.getImageData(0, 0, box.width, box.height);

  return {
    width: box.width,
    height: box.height,
    data: new Uint8Array(imageData.data),
  };
}



export async function extractVisualElementsText(
  visualElements,
  viewport,
  screenshot,
  { onlyPII = true } = {},
) {
  if (!Array.isArray(visualElements) || visualElements.length === 0) {
    return [];
  }

  const response = await fetch(screenshot);
  const blob = await response.blob();
  const bitmap = await createImageBitmap(blob);

  const screenshotSize = { width: bitmap.width, height: bitmap.height };
  const ocr = await getOCR();
  const piiModel = await getPIIModel();
  const results = [];

  for (const visualElement of visualElements) {
    if (visualElement.type === "video") continue;

    const box = await domToScreenshotBox(visualElement, viewport, screenshotSize);

    if (box.width < MIN_DIMENSION || box.height < MIN_DIMENSION) continue;

    const cropX = Math.max(0, box.x);
    const cropY = Math.max(0, box.y);
    const cropW = Math.min(box.width, bitmap.width - cropX);
    const cropH = Math.min(box.height, bitmap.height - cropY);

    if (cropW < MIN_DIMENSION || cropH < MIN_DIMENSION) continue;

    const clampedBox = { x: cropX, y: cropY, width: cropW, height: cropH };
    const pixels = await cropImage(bitmap, clampedBox);

    const ocrResults = await ocr.recognize(pixels, {
      detection: {
        textPixelThreshold: 0.4,
        boxScoreThreshold: 0.6,
        maxSideLimit: 1600,
      },
    });

    console.log("OCR Results: ", ocrResults);
    

    if (!Array.isArray(ocrResults) || ocrResults.length === 0) continue;

    for (const result of ocrResults) {
      if (!result || typeof result.text !== "string" || !result.text.trim()) {
        continue;
      }

      const points = result.box && Array.isArray(result.box.points)
        ? result.box.points.map((pt) => ({
            x: pt.x + cropX,
            y: pt.y + cropY,
          }))
        : [
            { x: cropX, y: cropY },
            { x: cropX + cropW, y: cropY },
            { x: cropX + cropW, y: cropY + cropH },
            { x: cropX, y: cropY + cropH },
          ];

      const xs = points.map((p) => p.x);
      const ys = points.map((p) => p.y);
      const minX = Math.min(...xs);
      const maxX = Math.max(...xs);
      const minY = Math.min(...ys);
      const maxY = Math.max(...ys);

      const remappedBox = {
        x: minX,
        y: minY,
        width: maxX - minX,
        height: maxY - minY,
        points,
      };

      const tokens = await piiModel(result.text);

      console.log("Visual OCR token: ", tokens);
      
      let piiEntities = aggregatePIIEntities(tokens, NER_THRESHOLD);

      if (piiEntities.length === 0) {
        const fallback = detectDeterministicPII(result.text);
        if (fallback.length > 0) {
          piiEntities = fallback;
        }
      }

      if (onlyPII && piiEntities.length === 0) {
        continue;
      }

      results.push({
        text: result.text,
        box: remappedBox,
        pii: piiEntities,
        source: "visual",
      });
    }
  }

  bitmap.close();
  
  return results;
}
