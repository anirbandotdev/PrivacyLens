/**
 * Waits for the active tab to reach a stable, load-ready state.
 * Samples readyState and element counts using privacy-safe numeric metrics only.
 */

function sleep(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      const error = new Error("This operation was aborted");
      error.name = "AbortError";
      return reject(error);
    }

    let timer;
    const onAbort = () => {
      clearTimeout(timer);
      const error = new Error("This operation was aborted");
      error.name = "AbortError";
      reject(error);
    };

    timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);

    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

function getPageMetrics() {
  const readyState = document.readyState;
  const interactiveElements = document.querySelectorAll(
    'a, button, input, select, textarea, [role="button"], [role="link"], [role="checkbox"], [role="menuitem"], [tabindex]:not([tabindex="-1"])'
  );
  const totalElements = document.querySelectorAll("*");
  return {
    readyState,
    interactiveElementCount: interactiveElements.length,
    totalElementCount: totalElements.length,
  };
}

export async function waitForActiveTabReady({
  timeoutMs = 8000,
  pollIntervalMs = 250,
  settleDelayMs = 350,
  signal,
} = {}) {
  if (!Number.isInteger(timeoutMs) || timeoutMs < 500 || timeoutMs > 15000) {
    throw new RangeError("timeoutMs must be an integer between 500 and 15000.");
  }

  if (!Number.isInteger(pollIntervalMs) || pollIntervalMs < 50 || pollIntervalMs > 1000) {
    throw new RangeError("pollIntervalMs must be an integer between 50 and 1000.");
  }

  if (!Number.isInteger(settleDelayMs) || settleDelayMs < 0 || settleDelayMs > 2000) {
    throw new RangeError("settleDelayMs must be an integer between 0 and 2000.");
  }

  if (signal?.aborted) {
    const error = new Error("This operation was aborted");
    error.name = "AbortError";
    throw error;
  }

  const browserApi = globalThis.browser ?? globalThis.chrome;
  if (!browserApi?.tabs?.query || !browserApi?.scripting?.executeScript) {
    throw new Error("Browser tabs and scripting APIs are required.");
  }

  if (settleDelayMs > 0) {
    await sleep(settleDelayMs, signal);
  }

  const deadline = Date.now() + timeoutMs;
  let previousSample = null;

  while (Date.now() < deadline) {
    if (signal?.aborted) {
      const error = new Error("This operation was aborted");
      error.name = "AbortError";
      throw error;
    }

    let sample = null;

    try {
      const tabs = await browserApi.tabs.query({ active: true, currentWindow: true });
      const activeTab = tabs?.[0];

      if (activeTab?.id !== undefined) {
        const results = await browserApi.scripting.executeScript({
          target: { tabId: activeTab.id },
          func: getPageMetrics,
        });

        const rawResult = results?.[0]?.result;
        if (
          rawResult &&
          typeof rawResult === "object" &&
          (rawResult.readyState === "interactive" || rawResult.readyState === "complete") &&
          typeof rawResult.interactiveElementCount === "number" &&
          typeof rawResult.totalElementCount === "number"
        ) {
          sample = {
            readyState: rawResult.readyState,
            interactiveElementCount: rawResult.interactiveElementCount,
            totalElementCount: rawResult.totalElementCount,
          };
        }
      }
    } catch {
      // Injection or query failures during navigation are retried until timeout.
      sample = null;
    }

    if (sample) {
      if (
        previousSample &&
        previousSample.interactiveElementCount === sample.interactiveElementCount &&
        previousSample.totalElementCount === sample.totalElementCount
      ) {
        return true;
      }
      previousSample = sample;
    } else {
      previousSample = null;
    }

    const remainingTime = deadline - Date.now();
    if (remainingTime <= 0) {
      break;
    }

    const nextSleepMs = Math.min(pollIntervalMs, remainingTime);
    await sleep(nextSleepMs, signal);
  }

  throw new Error("Page readiness timed out.");
}
