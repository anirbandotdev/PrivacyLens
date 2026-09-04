export async function domToScreenshotBox(element, viewport, screenshot) {
  //screenshot -> pixels

    let rect = element.rect;

    const scaleX = screenshot.width / viewport.width;

    const scaleY = screenshot.height / viewport.height;

    return {
      x: Math.round(rect.x * scaleX),

      y: Math.round(rect.y * scaleY),

      width: Math.round(rect.width * scaleX),

      height: Math.round(rect.height * scaleY),
    };

}
