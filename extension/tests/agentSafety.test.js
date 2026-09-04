import test from "node:test";
import assert from "node:assert/strict";

import { validateAgentActions } from "../src/agent/actionValidator.js";
import { routeLocalPrompt } from "../src/agent/localIntentRouter.js";
import { runPrivacyAgent } from "../src/agent/orchestrator.js";
import { executeActionsInActiveTab } from "../src/agent/actionExecutor.js";
import { analyzeSanitizedContext } from "../src/api/analyzeClient.js";

test("shipping-address typing is accepted", () => {
  const actions = [
    {
      type: "type",
      targetId: "shipping-address",
      value: "123 Main St, Suite 400"
    }
  ];

  const validated = validateAgentActions(actions);
  assert.equal(validated.length, 1);
  assert.equal(validated[0].targetId, "shipping-address");
  assert.equal(validated[0].value, "123 Main St, Suite 400");
});

test("otp-field typing is rejected", () => {
  const actions = [
    {
      type: "type",
      targetId: "otp-field",
      value: "987654"
    }
  ];

  assert.throws(
    () => validateAgentActions(actions),
    /typing into sensitive fields is not permitted/i
  );
});

test("Password typing with valueToken is rejected", () => {
  const actions = [
    {
      type: "type",
      targetId: "user-password",
      valueToken: "SECURE_TOKEN_REF_123"
    }
  ];

  assert.throws(
    () => validateAgentActions(actions),
    /typing into sensitive fields is not permitted/i
  );
});

test("A select action without value is rejected", () => {
  const actions = [
    {
      type: "select",
      targetId: "country-select"
    }
  ];

  assert.throws(
    () => validateAgentActions(actions),
    /select action requires a non-empty value string/i
  );
});

test("“Please scroll down” routes locally", () => {
  const result = routeLocalPrompt("Please scroll down");
  assert.equal(result.decision, "local");
  assert.equal(result.confidence, 1);
  assert.equal(result.message, "Scrolling down.");
  assert.deepEqual(result.actions, [
    { type: "scroll", direction: "down", amount: 700 }
  ]);
});

test("“Do not scroll down” routes to server", () => {
  const result = routeLocalPrompt("Do not scroll down");
  assert.equal(result.decision, "server");
  assert.equal(result.confidence, 0);
});

test("“Scroll down and summarize this page” routes to server", () => {
  const result = routeLocalPrompt("Scroll down and summarize this page");
  assert.equal(result.decision, "server");
  assert.equal(result.confidence, 0);
});

test("The orchestrator handles “scroll down” without buildPrivateContext", async () => {
  let contextCalled = false;
  const buildPrivateContext = async () => {
    contextCalled = true;
    return { decision: "blocked" };
  };

  const result = await runPrivacyAgent({
    prompt: "scroll down",
    buildPrivateContext
  });

  assert.equal(contextCalled, false);
  assert.equal(result.source, "local");
  assert.equal(result.message, "Scrolling down.");
  assert.equal(result.actions.length, 1);
  assert.equal(result.actions[0].direction, "down");
});

test("An out-of-range confirmedActionIndexes value is rejected before browser execution", async () => {
  const actions = [
    {
      type: "click",
      targetId: "submit-button"
    }
  ];

  await assert.rejects(
    async () => {
      await executeActionsInActiveTab(actions, {
        confirmedActionIndexes: [5]
      });
    },
    /Invalid confirmedActionIndexes/i
  );
});

test("requiresConfirmation: true survives validation across action types", () => {
  const actions = [
    { type: "click", targetId: "btn-confirm", requiresConfirmation: true },
    { type: "type", targetId: "user-name", value: "Alice", requiresConfirmation: true },
    { type: "scroll", direction: "down", amount: 300, requiresConfirmation: true },
    { type: "focus", targetId: "input-box", requiresConfirmation: true },
    { type: "select", targetId: "country-select", value: "US", requiresConfirmation: true }
  ];

  const validated = validateAgentActions(actions);
  assert.equal(validated.length, 5);
  for (const action of validated) {
    assert.equal(action.requiresConfirmation, true);
  }
});

test("requiresConfirmation: false survives validation across action types", () => {
  const actions = [
    { type: "click", targetId: "btn-next", requiresConfirmation: false },
    { type: "type", targetId: "user-name", value: "Bob", requiresConfirmation: false },
    { type: "scroll", direction: "up", amount: 100, requiresConfirmation: false },
    { type: "focus", targetId: "input-box", requiresConfirmation: false },
    { type: "select", targetId: "country-select", value: "CA", requiresConfirmation: false }
  ];

  const validated = validateAgentActions(actions);
  assert.equal(validated.length, 5);
  for (const action of validated) {
    assert.equal(action.requiresConfirmation, false);
  }
});

test("A non-boolean requiresConfirmation value is rejected", () => {
  const nonBooleans = ["true", "false", 1, 0, null, {}, []];

  for (const val of nonBooleans) {
    assert.throws(
      () => validateAgentActions([{ type: "click", targetId: "btn-submit", requiresConfirmation: val }]),
      /requiresConfirmation must be a boolean/i
    );
  }
});

test("An action without requiresConfirmation property remains valid without adding confirmation", () => {
  const actions = [
    { type: "click", targetId: "btn-next" },
    { type: "type", targetId: "search-field", value: "hello" },
    { type: "scroll", direction: "down", amount: 200 },
    { type: "focus", targetId: "search-field" },
    { type: "select", targetId: "country-select", value: "US" }
  ];

  const validated = validateAgentActions(actions);
  assert.equal(validated.length, 5);
  for (const action of validated) {
    assert.equal("requiresConfirmation" in action, false);
    assert.equal(action.requiresConfirmation, undefined);
  }
});

test("An action using a collected ID is accepted", async () => {
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () => ({
      ok: true,
      json: async () => ({
        message: "Clicking submit button",
        actions: [{ type: "click", targetId: "btn-submit" }]
      })
    });

    const buildPrivateContext = async () => ({
      decision: "server",
      privacyVerified: true,
      sanitizedPrompt: "click submit",
      sanitizedText: "Submit button present",
      allowedTargetIds: ["btn-submit"]
    });

    const result = await runPrivacyAgent({
      prompt: "click submit",
      buildPrivateContext
    });

    assert.equal(result.source, "server");
    assert.equal(result.actions.length, 1);
    assert.equal(result.actions[0].type, "click");
    assert.equal(result.actions[0].targetId, "btn-submit");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("An action using an unlisted ID is rejected", async () => {
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () => ({
      ok: true,
      json: async () => ({
        message: "Clicking unlisted element",
        actions: [{ type: "click", targetId: "unlisted-element-id" }]
      })
    });

    const buildPrivateContext = async () => ({
      decision: "server",
      privacyVerified: true,
      sanitizedPrompt: "click element",
      sanitizedText: "Some text",
      allowedTargetIds: ["allowed-btn-1", "allowed-btn-2"]
    });

    await assert.rejects(
      async () => {
        await runPrivacyAgent({
          prompt: "click element",
          buildPrivateContext
        });
      },
      (err) => {
        assert.doesNotMatch(err.message, /unlisted-element-id/);
        return true;
      }
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Untargeted scrolling remains accepted", async () => {
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () => ({
      ok: true,
      json: async () => ({
        message: "Scrolling down",
        actions: [{ type: "scroll", direction: "down", amount: 500 }]
      })
    });

    const buildPrivateContext = async () => ({
      decision: "server",
      privacyVerified: true,
      sanitizedPrompt: "scroll the page",
      sanitizedText: "Page content",
      allowedTargetIds: []
    });

    const result = await runPrivacyAgent({
      prompt: "scroll the page",
      buildPrivateContext
    });

    assert.equal(result.source, "server");
    assert.equal(result.actions.length, 1);
    assert.equal(result.actions[0].type, "scroll");
    assert.equal(result.actions[0].direction, "down");
    assert.equal(result.actions[0].amount, 500);
    assert.equal(result.actions[0].targetId, undefined);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Targeted scrolling using an allowed ID is accepted and unlisted ID is rejected", async () => {
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () => ({
      ok: true,
      json: async () => ({
        message: "Scrolling pane",
        actions: [{ type: "scroll", direction: "down", amount: 300, targetId: "scrollable-pane" }]
      })
    });

    const buildPrivateContext = async () => ({
      decision: "server",
      privacyVerified: true,
      sanitizedPrompt: "scroll pane",
      sanitizedText: "Page content",
      allowedTargetIds: ["scrollable-pane"]
    });

    const result = await runPrivacyAgent({
      prompt: "scroll pane",
      buildPrivateContext
    });

    assert.equal(result.source, "server");
    assert.equal(result.actions.length, 1);
    assert.equal(result.actions[0].targetId, "scrollable-pane");

    const unlistedContext = async () => ({
      decision: "server",
      privacyVerified: true,
      sanitizedPrompt: "scroll pane",
      sanitizedText: "Page content",
      allowedTargetIds: ["other-pane"]
    });

    await assert.rejects(
      async () => {
        await runPrivacyAgent({
          prompt: "scroll pane",
          buildPrivateContext: unlistedContext
        });
      },
      (err) => {
        assert.doesNotMatch(err.message, /scrollable-pane/);
        return true;
      }
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Local routing still works without an allowlist", async () => {
  let contextCalled = false;
  const buildPrivateContext = async () => {
    contextCalled = true;
    return { decision: "server", allowedTargetIds: [] };
  };

  const result = await runPrivacyAgent({
    prompt: "Please scroll down",
    buildPrivateContext
  });

  assert.equal(contextCalled, false);
  assert.equal(result.source, "local");
  assert.equal(result.message, "Scrolling down.");
  assert.equal(result.actions.length, 1);
  assert.equal(result.actions[0].direction, "down");
});

test("analyzeSanitizedContext includes taskState in request body when supplied", async () => {
  const originalFetch = globalThis.fetch;
  let capturedBody = null;
  try {
    globalThis.fetch = async (_url, options) => {
      capturedBody = JSON.parse(options.body);
      return {
        ok: true,
        json: async () => ({ message: "ok", actions: [], taskComplete: true })
      };
    };

    const taskState = {
      stepIndex: 1,
      history: [{ stepIndex: 0, actionType: "click", status: "executed" }]
    };

    await analyzeSanitizedContext({
      prompt: "do task",
      sanitizedText: "page content",
      privacyVerified: true,
      taskState
    });

    assert.ok(capturedBody !== null);
    assert.deepEqual(capturedBody.taskState, taskState);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("analyzeSanitizedContext omits taskState from request body when absent", async () => {
  const originalFetch = globalThis.fetch;
  let capturedBody = null;
  try {
    globalThis.fetch = async (_url, options) => {
      capturedBody = JSON.parse(options.body);
      return {
        ok: true,
        json: async () => ({ message: "ok", actions: [] })
      };
    };

    await analyzeSanitizedContext({
      prompt: "do task",
      sanitizedText: "page content",
      privacyVerified: true
    });

    assert.ok(capturedBody !== null);
    assert.equal("taskState" in capturedBody, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("analyzeSanitizedContext rejects malformed taskState", async () => {
  await assert.rejects(
    async () => {
      await analyzeSanitizedContext({
        prompt: "do task",
        sanitizedText: "page content",
        privacyVerified: true,
        taskState: { stepIndex: -1, history: [] }
      });
    },
    /Invalid task state\./
  );
});

test("runPrivacyAgent rejects malformed taskState before routing", async () => {
  await assert.rejects(
    async () => {
      await runPrivacyAgent({
        prompt: "scroll down",
        buildPrivateContext: async () => {},
        taskState: { stepIndex: 1, history: [] }
      });
    },
    /Invalid task state\./
  );
});

test("runPrivacyAgent local routing multi-step flow (step 0 vs step 1)", async () => {
  // Step 0: returns action and taskComplete: false
  const step0Result = await runPrivacyAgent({
    prompt: "scroll down",
    buildPrivateContext: async () => {},
    taskState: { stepIndex: 0, history: [] }
  });

  assert.equal(step0Result.source, "local");
  assert.equal(step0Result.taskComplete, false);
  assert.equal(step0Result.actions.length, 1);
  assert.equal(step0Result.actions[0].type, "scroll");

  // Step 1 (after execution): returns 0 actions and taskComplete: true
  const step1Result = await runPrivacyAgent({
    prompt: "scroll down",
    buildPrivateContext: async () => {},
    taskState: {
      stepIndex: 1,
      history: [{ stepIndex: 0, actionType: "scroll", status: "executed" }]
    }
  });

  assert.equal(step1Result.source, "local");
  assert.equal(step1Result.taskComplete, true);
  assert.equal(step1Result.actions.length, 0);
});

test("runPrivacyAgent never passes history to buildPrivateContext", async () => {
  const originalFetch = globalThis.fetch;
  let receivedContextArgs = null;
  try {
    globalThis.fetch = async () => ({
      ok: true,
      json: async () => ({
        message: "Step 1 action",
        taskComplete: false,
        actions: [{ type: "click", targetId: "btn-next" }]
      })
    });

    const buildPrivateContext = async (args) => {
      receivedContextArgs = args;
      return {
        decision: "server",
        privacyVerified: true,
        sanitizedPrompt: "click next",
        sanitizedText: "Page text",
        allowedTargetIds: ["btn-next"]
      };
    };

    await runPrivacyAgent({
      prompt: "click next",
      buildPrivateContext,
      taskState: {
        stepIndex: 1,
        history: [{ stepIndex: 0, actionType: "type", status: "executed" }]
      }
    });

    assert.ok(receivedContextArgs !== null);
    assert.deepEqual(Object.keys(receivedContextArgs), ["prompt"]);
    assert.equal("history" in receivedContextArgs, false);
    assert.equal("taskState" in receivedContextArgs, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("runPrivacyAgent multi-step enforces fresh allowlist and rejects previous step allowlist", async () => {
  const originalFetch = globalThis.fetch;
  try {
    // Step 0: allowed ["btn-step0"]
    globalThis.fetch = async () => ({
      ok: true,
      json: async () => ({
        message: "Action",
        taskComplete: false,
        actions: [{ type: "click", targetId: "btn-step0" }]
      })
    });

    const step0Context = async () => ({
      decision: "server",
      privacyVerified: true,
      sanitizedPrompt: "step 0",
      sanitizedText: "text",
      allowedTargetIds: ["btn-step0"]
    });

    const res0 = await runPrivacyAgent({
      prompt: "step 0",
      buildPrivateContext: step0Context,
      taskState: { stepIndex: 0, history: [] }
    });
    assert.equal(res0.actions[0].targetId, "btn-step0");

    // Step 1: new observation only allows ["btn-step1"]. Server tries to use old ID "btn-step0".
    globalThis.fetch = async () => ({
      ok: true,
      json: async () => ({
        message: "Action",
        taskComplete: false,
        actions: [{ type: "click", targetId: "btn-step0" }]
      })
    });

    const step1Context = async () => ({
      decision: "server",
      privacyVerified: true,
      sanitizedPrompt: "step 1",
      sanitizedText: "text",
      allowedTargetIds: ["btn-step1"]
    });

    await assert.rejects(
      async () => {
        await runPrivacyAgent({
          prompt: "step 1",
          buildPrivateContext: step1Context,
          taskState: {
            stepIndex: 1,
            history: [{ stepIndex: 0, actionType: "click", status: "executed" }]
          }
        });
      },
      /Action targetId is not allowed\./
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("runPrivacyAgent multi-step server response validation (taskComplete boolean, actions length consistency)", async () => {
  const originalFetch = globalThis.fetch;
  try {
    const buildContext = async () => ({
      decision: "server",
      privacyVerified: true,
      sanitizedPrompt: "test",
      sanitizedText: "text",
      allowedTargetIds: ["btn-1"]
    });

    // Missing taskComplete
    globalThis.fetch = async () => ({
      ok: true,
      json: async () => ({ message: "ok", actions: [{ type: "click", targetId: "btn-1" }] })
    });

    await assert.rejects(
      async () => {
        await runPrivacyAgent({
          prompt: "test",
          buildPrivateContext: buildContext,
          taskState: { stepIndex: 0, history: [] }
        });
      },
      /Server response missing boolean taskComplete in multi-step mode\./
    );

    // taskComplete: true with actions > 0
    globalThis.fetch = async () => ({
      ok: true,
      json: async () => ({
        message: "done",
        taskComplete: true,
        actions: [{ type: "click", targetId: "btn-1" }]
      })
    });

    await assert.rejects(
      async () => {
        await runPrivacyAgent({
          prompt: "test",
          buildPrivateContext: buildContext,
          taskState: { stepIndex: 0, history: [] }
        });
      },
      /Multi-step task complete requires zero actions\./
    );

    // taskComplete: false with actions !== 1
    globalThis.fetch = async () => ({
      ok: true,
      json: async () => ({
        message: "incomplete",
        taskComplete: false,
        actions: []
      })
    });

    await assert.rejects(
      async () => {
        await runPrivacyAgent({
          prompt: "test",
          buildPrivateContext: buildContext,
          taskState: { stepIndex: 0, history: [] }
        });
      },
      /Multi-step incomplete task requires exactly one action\./
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});


