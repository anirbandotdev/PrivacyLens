import { getFaceDetector } from "../mediapipe/face-detector.js";


export async function drawRedactBox(dataUrl, resultArr) {
  const response = await fetch(dataUrl);
  const blob = await response.blob();

  const bitmap = await createImageBitmap(blob);

  const canvas = document.createElement("canvas");

  canvas.width = bitmap.width;
  canvas.height = bitmap.height;

  const ctx = canvas.getContext("2d");

  ctx.drawImage(bitmap, 0, 0);

  // Detect faces on clean image first
  const faceDetector = await getFaceDetector();
  console.log("detector:", faceDetector);

  const faceResults = faceDetector.detect(canvas);
  console.log("result:", faceResults);
  console.log("detections:", faceResults.detections);

  // Draw PII boxes (tightened to text glyphs, removing CSS line-height padding)
  ctx.fillStyle = "#181818";
  for (const result of resultArr) {
    const box = result.box;
    if (box) {
      const vTrim = Math.max(0, Math.round(box.height * 0.18));
      ctx.fillRect(
        box.x,
        box.y + vTrim,
        box.width,
        Math.max(2, box.height - vTrim * 2),
      );
    }
  }

  // Blur entire face without edge fade
  for (const detection of faceResults?.detections || []) {
    const box = detection.boundingBox;
    if (box) {
      const padX = box.width * 0.15;
      const padY = box.height * 0.2;
      const x = Math.max(0, box.originX - padX);
      const y = Math.max(0, box.originY - padY);
      const w = Math.min(canvas.width - x, box.width + padX * 2);
      const h = Math.min(canvas.height - y, box.height + padY * 2);

      ctx.save();
      ctx.beginPath();
      ctx.rect(x, y, w, h);
      ctx.clip();
      ctx.filter = "blur(22px)";
      ctx.drawImage(bitmap, 0, 0);
      ctx.restore();
    }
  }


  return canvas.toDataURL("image/png");
}
