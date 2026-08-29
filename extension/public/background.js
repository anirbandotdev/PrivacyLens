const browserAPI = this.browser || this.chrome;

browserAPI.runtime.onMessage.addListener(async (message) => {
  if (message.type == "CAPTURE_SCREEN") {
    try {
      const window = await browserAPI.windows.getCurrent();

      const tabs = await browserAPI.tabs.query({
        active: true,
        windowId: window.id,
      });

      const activeTab = tabs[0];

      if (!activeTab) {
        throw new Error("No active tabs found");
      }

      const screenshot = await browserAPI.tabs.captureVisibleTab(
        activeTab.windowId,
        {
          format: "png",
        },
      );

      return {
        success: true,
        screenshot,
      };
    } catch (error) {
      console.error("Screen capture failed: ", error);

      return {
        success: false,
        error: error.message,
      };
    }
  }
});
