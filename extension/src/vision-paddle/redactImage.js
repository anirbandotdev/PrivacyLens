import { getFaceDetector } from "../mediapipe/face-detector.js";

export async function redactImage(imageDataUrl, piiResults) {
  const response = await fetch(imageDataUrl);
  const blob = await response.blob();

  const bitmap = await createImageBitmap(blob);

  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);

  const ctx = canvas.getContext("2d");

  ctx.drawImage(bitmap, 0, 0);

  for (const result of piiResults) {
    if (!result.pii || result.pii.length === 0) {
      continue;
    }

    const points = result.box.points;

    if (!points || points.length < 4) {
      continue;
    }

    const xs = points.map((p) => p.x);
    const ys = points.map((p) => p.y);

    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);

    console.log("REDACTING:", {
      text: result.text,
      pii: result.pii,
      points: result.box.points,
    });

    const padding = 2;

    ctx.fillStyle = "#181818";

    ctx.fillRect(
      minX - padding,
      minY - padding,
      maxX - minX + padding * 2,
      maxY - minY + padding * 2,
    );
  }

  const faceDetector = await getFaceDetector();

  console.log("detector:", faceDetector);

  const faceResults = faceDetector.detect(canvas);

  console.log("result:", faceResults);
  console.log("detections:", faceResults.detections);

  for (const detection of faceResults.detections) {
    const box = detection.boundingBox;
    ctx.fillStyle = "#181818";

    ctx.fillRect(box.originX, box.originY, box.width, box.height);
  }

  const outputBlob = await canvas.convertToBlob({
    type: "image/png",
  });

  bitmap.close();

  return outputBlob;
}
