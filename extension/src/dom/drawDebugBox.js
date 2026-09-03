export async function drawDebugBox(dataUrl, resultArr) {
  const response = await fetch(dataUrl);
  const blob = await response.blob();

  const bitmap = await createImageBitmap(blob);

  const canvas = document.createElement("canvas");

  canvas.width = bitmap.width;
  canvas.height = bitmap.height;

  const ctx = canvas.getContext("2d");

  ctx.drawImage(bitmap, 0, 0);

  ctx.strokeStyle = "black";
  ctx.lineWidth = 2;

  for (const result of resultArr) {
    const box = result.box;
    ctx.fillStyle = "#181818";
    ctx.fillRect(box.x, box.y, box.width, box.height);
  }

  return canvas.toDataURL("image/png");
}
