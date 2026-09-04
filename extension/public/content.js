const browserAPI = globalThis.browser || globalThis.chrome;

function isVisible(element) {
  const style = window.getComputedStyle(element);

  if (
    style.display === "none" ||
    style.visibility === "hidden" ||
    style.opacity === "0"
  ) {
    return false;
  }

  const rect = element.getBoundingClientRect();

  return rect.width > 0 && rect.height > 0;
}

function extractDOMText() {
  const results = [];

  const walker = document.createTreeWalker(
    document.body,
    NodeFilter.SHOW_TEXT
  );

  let node;

  while ((node = walker.nextNode())) {
    const text = node.textContent?.trim();

    if (!text) continue;

    const parent = node.parentElement;

    if (!parent) continue;

    if (!isVisible(parent)) continue;

    const tag = parent.tagName;

    // Ignore elements that aren't useful webpage text
    if (
      tag === "SCRIPT" ||
      tag === "STYLE" ||
      tag === "NOSCRIPT"
    ) {
      continue;
    }

    const range = document.createRange();
    range.selectNodeContents(node);

    const rects = Array.from(range.getClientRects());

    for (const rect of rects) {
      if (rect.width === 0 || rect.height === 0) {
        continue;
      }

      // Only keep text currently visible in the viewport
      if (
        rect.bottom < 0 ||
        rect.top > window.innerHeight ||
        rect.right < 0 ||
        rect.left > window.innerWidth
      ) {
        continue;
      }

      results.push({
        text,

        rect: {
          x: rect.left,
          y: rect.top,
          width: rect.width,
          height: rect.height
        }
      });
    }
  }

  return results;
}


function extractFormFields() {
  const results = [];

  const fields = document.querySelectorAll(
    "input, textarea, select"
  );

  for (const element of fields) {

    if (!isVisible(element)) {
      continue;
    }

    const value = element.value;

    if (!value) {
      continue;
    }

    const rect = element.getBoundingClientRect();

    if (rect.width === 0 || rect.height === 0) {
      continue;
    }

    results.push({
      text: value,

      rect: {
        x: rect.left,
        y: rect.top,
        width: rect.width,
        height: rect.height
      },

      source: "form"
    });
  }

  return results;
}

function extractVisualElements() {
  const elements = document.querySelectorAll(
    "img, canvas, video, svg"
  );

  return Array.from(elements)
    .filter(isVisible)
    .map((element) => {
      const rect = element.getBoundingClientRect();

      return {
        type: element.tagName.toLowerCase(),

        rect: {
          x: rect.left,
          y: rect.top,
          width: rect.width,
          height: rect.height,
        },
      };
    });
}

function extractDOM() {
  return {
    viewport: {
      width: window.innerWidth,
      height: window.innerHeight,
      devicePixelRatio: window.devicePixelRatio
    },

    elements: [
      ...extractDOMText(),
      ...extractFormFields()
    ],

    visualElements: extractVisualElements(),
  };
}


browserAPI.runtime.onMessage.addListener(
  (message, sender, sendResponse) => {

    if (message.type === "GET_DOM_TEXT") {
      try {
        const data = extractDOM();

        sendResponse({
          success: true,
          data
        });

      } catch (error) {
        console.error("DOM extraction failed:", error);

        sendResponse({
          success: false,
          error: error.message
        });
      }

      return true;
    }
  }
);