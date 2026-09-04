const browserAPI = globalThis.browser || globalThis.chrome;

async function getActiveTab() {
  const window = await browserAPI.windows.getCurrent();

  const tabs = await browserAPI.tabs.query({
    active: true,
    windowId: window.id,
  });

  const activeTab = tabs[0];

  if (!activeTab) {
    throw new Error("No active tab found");
  }

  return activeTab;
}


// async function getDOMData(tabId) {
//   try {
//     const response = await browserAPI.tabs.sendMessage(
//       tabId,
//       {
//         type: "GET_DOM_TEXT",
//       }
//     );

//     return response;

//   } catch (error) {
//     console.error("Could not extract DOM:", error);

//     return {
//       success: false,
//       data: [],
//       error: error.message,
//     };
//   }
// }


async function getDOMData(tabId) {
  try {
    return await browserAPI.tabs.sendMessage(tabId, { type: "GET_DOM_TEXT" });
  } catch {
    try {
      await browserAPI.scripting.executeScript({
        target: { tabId },
        files: ["content.js"],
      });
      return await browserAPI.tabs.sendMessage(tabId, { type: "GET_DOM_TEXT" });
    } catch (injectError) {
      console.error("Could not extract DOM:", injectError);
      return { success: false, data: [], error: injectError.message };
    }
  }
}



browserAPI.runtime.onMessage.addListener(
  (message, sender, sendResponse) => {

    if (message.type === "CAPTURE_SCREEN") {
      (async () => {
        try {
          const activeTab = await getActiveTab();
          const screenshot = await browserAPI.tabs.captureVisibleTab(
            activeTab.windowId,
            { format: "png" }
          );
          sendResponse({
            success: true,
            screenshot,
          });
        } catch (error) {
          console.error("CAPTURE_SCREEN failed:", error);
          sendResponse({
            success: false,
            error: error.message,
          });
        }
      })();
      return true;
    }

    if (message.type === "PROCESS_CURRENT_PAGE") {
      (async () => {
        try {
          // Get active tab
          const activeTab = await getActiveTab();
          console.log("Active tab:", activeTab);

          // IMPORTANT: use activeTab.id
          const domResult = await getDOMData(activeTab.id);
          console.log("DOM:", domResult);

          // Capture screenshot
          const screenshot =
            await browserAPI.tabs.captureVisibleTab(
              activeTab.windowId,
              {
                format: "png",
              }
            );

          console.log("Screenshot captured");

          sendResponse({
            success: true,
            dom: domResult,
            screenshot,
          });
        } catch (error) {
          console.error(
            "PROCESS_CURRENT_PAGE failed:",
            error
          );
          sendResponse({
            success: false,
            error: error.message,
          });
        }
      })();
      return true;
    }
  }
);