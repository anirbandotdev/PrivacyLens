export async function base64ToPixels(dataUrl) {
  const response = await fetch(dataUrl);
  const blob = await response.blob();

  const bitmap = await createImageBitmap(blob);

  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);

  const ctx = canvas.getContext("2d", {
    willReadFrequently: true,
  });

  ctx.drawImage(bitmap, 0, 0);

  const imageData = ctx.getImageData(0, 0, bitmap.width, bitmap.height);

  return {
    width: bitmap.width,
    height: bitmap.height,
    data: new Uint8Array(imageData.data),
  };
}