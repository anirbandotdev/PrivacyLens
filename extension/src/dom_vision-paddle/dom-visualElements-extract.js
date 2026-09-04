import { domToScreenshotBox } from "./coordinates";
import { getOCR } from "./paddleocr";
import { getPIIModel } from "./pii-ner";
import { aggregatePIIEntities } from "./aggregateEntities";
import { detectDeterministicPII } from "./pii-detector";

const MIN_DIMENSION = 20;

const NER_THRESHOLD = 0.7;

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

    const box = await domToScreenshotBox(
      visualElement,
      viewport,
      screenshotSize,
    );

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

      const points =
        result.box && Array.isArray(result.box.points)
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
