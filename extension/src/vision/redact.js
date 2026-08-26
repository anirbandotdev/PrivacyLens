export async function redactRegion(image, regions) {
  const bitmap = await createImageBitmap(image);

  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);

  const context = canvas.getContext("2d");
  context.drawImage(bitmap, 0, 0);

  for (const region of regions) {
    const { x0, y0, x1, y1 } = region.bbox;
    const padding = 6;

    context.fillStyle = "#000000";

    context.fillRect(
      Math.max(0, x0 - padding),
      Math.max(0, y0 - padding),
      x1 - x0 + padding * 2,
      y1 - y0 + padding * 2,
    );
  }

  return canvas.convertToBlob({
    type: "image/png",
  });
}
