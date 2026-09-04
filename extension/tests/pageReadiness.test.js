import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { waitForActiveTabReady } from "../src/agent/pageReadiness.js";

describe("waitForActiveTabReady", () => {
  let originalChrome;
  let originalBrowser;

  beforeEach(() => {
    originalChrome = globalThis.chrome;
    originalBrowser = globalThis.browser;
  });

  afterEach(() => {
    globalThis.chrome = originalChrome;
    globalThis.browser = originalBrowser;
  });

  function setupMockBrowser(sampleSequence, { tabId = 123 } = {}) {
    let callCount = 0;
    const executeScriptCalls = [];

    globalThis.chrome = {
      tabs: {
        query: async () => (tabId !== null ? [{ id: tabId }] : []),
      },
      scripting: {
        executeScript: async (args) => {
          executeScriptCalls.push(args);
          const currentCall = callCount++;
          const sampleOrError =
            currentCall < sampleSequence.length
              ? sampleSequence[currentCall]
              : sampleSequence[sampleSequence.length - 1];

          if (sampleOrError instanceof Error) {
            throw sampleOrError;
          }
          return [{ result: sampleOrError }];
        },
      },
    };

    return { getCalls: () => executeScriptCalls };
  }

  // 1. Immediate stability
  it("returns true when two consecutive samples are identical and load-ready", async () => {
    const sample = {
      readyState: "complete",
      interactiveElementCount: 15,
      totalElementCount: 120,
    };
    setupMockBrowser([sample, sample]);

    const result = await waitForActiveTabReady({
      timeoutMs: 1000,
      pollIntervalMs: 50,
      settleDelayMs: 0,
    });

    assert.equal(result, true);
  });

  // 2. Changing counts before stabilizing
  it("stabilizes after elements finish changing and returns true", async () => {
    const samples = [
      { readyState: "interactive", interactiveElementCount: 5, totalElementCount: 50 },
      { readyState: "interactive", interactiveElementCount: 10, totalElementCount: 80 },
      { readyState: "complete", interactiveElementCount: 12, totalElementCount: 100 },
      { readyState: "complete", interactiveElementCount: 12, totalElementCount: 100 },
    ];
    setupMockBrowser(samples);

    const result = await waitForActiveTabReady({
      timeoutMs: 2000,
      pollIntervalMs: 50,
      settleDelayMs: 0,
    });

    assert.equal(result, true);
  });

  // 3. Temporary injection failure
  it("retries through temporary injection failures during navigation and succeeds", async () => {
    const samples = [
      new Error("Cannot access contents of the page"),
      new Error("Frame was detached"),
      { readyState: "interactive", interactiveElementCount: 8, totalElementCount: 60 },
      { readyState: "interactive", interactiveElementCount: 8, totalElementCount: 60 },
    ];
    setupMockBrowser(samples);

    const result = await waitForActiveTabReady({
      timeoutMs: 2000,
      pollIntervalMs: 50,
      settleDelayMs: 0,
    });

    assert.equal(result, true);
  });

  // 4. Timeout
  it("throws a generic readiness timeout error when stability deadline expires", async () => {
    let count = 0;
    // Samples constantly change so stability is never reached
    globalThis.chrome = {
      tabs: { query: async () => [{ id: 1 }] },
      scripting: {
        executeScript: async () => [
          {
            result: {
              readyState: "complete",
              interactiveElementCount: count++,
              totalElementCount: count * 10,
            },
          },
        ],
      },
    };

    await assert.rejects(
      async () => {
        await waitForActiveTabReady({
          timeoutMs: 500,
          pollIntervalMs: 50,
          settleDelayMs: 0,
        });
      },
      (err) => {
        assert.equal(err.message, "Page readiness timed out.");
        return true;
      }
    );
  });

  // 5. Abort before starting
  it("aborts immediately when signal is already aborted", async () => {
    const ac = new AbortController();
    ac.abort();

    setupMockBrowser([
      { readyState: "complete", interactiveElementCount: 1, totalElementCount: 10 },
      { readyState: "complete", interactiveElementCount: 1, totalElementCount: 10 },
    ]);

    await assert.rejects(
      async () => {
        await waitForActiveTabReady({
          timeoutMs: 1000,
          pollIntervalMs: 50,
          settleDelayMs: 0,
          signal: ac.signal,
        });
      },
      (err) => {
        assert.equal(err.name, "AbortError");
        return true;
      }
    );
  });

  // 6. Abort while waiting between polls
  it("aborts cleanly while sleeping between polls", async () => {
    const ac = new AbortController();

    let call = 0;
    globalThis.chrome = {
      tabs: { query: async () => [{ id: 1 }] },
      scripting: {
        executeScript: async () => {
          call++;
          if (call === 1) {
            // Abort during the subsequent sleep
            setTimeout(() => ac.abort(), 20);
          }
          return [
            {
              result: {
                readyState: "interactive",
                interactiveElementCount: 1,
                totalElementCount: 10,
              },
            },
          ];
        },
      },
    };

    await assert.rejects(
      async () => {
        await waitForActiveTabReady({
          timeoutMs: 2000,
          pollIntervalMs: 300,
          settleDelayMs: 0,
          signal: ac.signal,
        });
      },
      (err) => {
        assert.equal(err.name, "AbortError");
        return true;
      }
    );
  });

  // 7. Missing APIs
  it("throws when browser APIs are missing", async () => {
    globalThis.chrome = undefined;
    globalThis.browser = undefined;

    await assert.rejects(
      async () => {
        await waitForActiveTabReady({ timeoutMs: 500 });
      },
      /Browser tabs and scripting APIs are required\./
    );

    globalThis.chrome = { tabs: {} }; // missing scripting
    await assert.rejects(
      async () => {
        await waitForActiveTabReady({ timeoutMs: 500 });
      },
      /Browser tabs and scripting APIs are required\./
    );
  });

  // 8. Missing active tab
  it("retries and times out when no active tab exists", async () => {
    setupMockBrowser([], { tabId: null });

    await assert.rejects(
      async () => {
        await waitForActiveTabReady({
          timeoutMs: 500,
          pollIntervalMs: 50,
          settleDelayMs: 0,
        });
      },
      /Page readiness timed out\./
    );
  });

  // 9. Invalid timing options validation
  it("validates timeoutMs range (500-15000)", async () => {
    await assert.rejects(
      () => waitForActiveTabReady({ timeoutMs: 499 }),
      RangeError
    );
    await assert.rejects(
      () => waitForActiveTabReady({ timeoutMs: 15001 }),
      RangeError
    );
    await assert.rejects(
      () => waitForActiveTabReady({ timeoutMs: 500.5 }),
      RangeError
    );
  });

  it("validates pollIntervalMs range (50-1000)", async () => {
    await assert.rejects(
      () => waitForActiveTabReady({ timeoutMs: 1000, pollIntervalMs: 49 }),
      RangeError
    );
    await assert.rejects(
      () => waitForActiveTabReady({ timeoutMs: 1000, pollIntervalMs: 1001 }),
      RangeError
    );
  });

  it("validates settleDelayMs range (0-2000)", async () => {
    await assert.rejects(
      () => waitForActiveTabReady({ timeoutMs: 1000, settleDelayMs: -1 }),
      RangeError
    );
    await assert.rejects(
      () => waitForActiveTabReady({ timeoutMs: 1000, settleDelayMs: 2001 }),
      RangeError
    );
  });

  // 10. Privacy: injected function returns only permitted metrics
  it("injected function extracts only readyState, interactiveElementCount, and totalElementCount", async () => {
    const mockTracker = setupMockBrowser([
      { readyState: "complete", interactiveElementCount: 3, totalElementCount: 20 },
      { readyState: "complete", interactiveElementCount: 3, totalElementCount: 20 },
    ]);

    await waitForActiveTabReady({
      timeoutMs: 1000,
      pollIntervalMs: 50,
      settleDelayMs: 0,
    });

    const calls = mockTracker.getCalls();
    assert.ok(calls.length >= 2);
    const injectedFunc = calls[0].func;
    assert.equal(typeof injectedFunc, "function");

    // Test injected function against a mock DOM environment
    const fakeDoc = {
      readyState: "complete",
      querySelectorAll: (sel) => {
        if (sel === "*") return [{}, {}, {}];
        return [{}];
      },
    };

    const originalDoc = globalThis.document;
    try {
      globalThis.document = fakeDoc;
      const metrics = injectedFunc();
      assert.deepEqual(Object.keys(metrics).sort(), [
        "interactiveElementCount",
        "readyState",
        "totalElementCount",
      ]);
      assert.equal(metrics.readyState, "complete");
      assert.equal(metrics.interactiveElementCount, 1);
      assert.equal(metrics.totalElementCount, 3);
    } finally {
      globalThis.document = originalDoc;
    }
  });
});
