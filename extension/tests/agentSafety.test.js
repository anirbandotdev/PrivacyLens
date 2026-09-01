import test from "node:test";
import assert from "node:assert/strict";

import { validateAgentActions } from "../src/agent/actionValidator.js";
import { routeLocalPrompt } from "../src/agent/localIntentRouter.js";
import { runPrivacyAgent } from "../src/agent/orchestrator.js";
import { executeActionsInActiveTab } from "../src/agent/actionExecutor.js";

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

