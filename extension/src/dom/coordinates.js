export async function domToScreenshotBox(element, viewport, screenshot) {
  //screenshot -> pixels


  console.log("Ss width: ", screenshot.width);
  console.log("Ss height: ", screenshot.height);


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
