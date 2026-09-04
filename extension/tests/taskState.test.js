import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { normalizeTaskState } from "../src/agent/taskState.js";

describe("extension normalizeTaskState", () => {
  it("returns undefined when taskState is undefined", () => {
    assert.equal(normalizeTaskState(undefined), undefined);
  });

  it("normalizes valid initial taskState at step 0 without mutating input", () => {
    const original = Object.freeze({
      stepIndex: 0,
      history: Object.freeze([]),
    });
    const result = normalizeTaskState(original);
    assert.deepEqual(result, {
      stepIndex: 0,
      history: [],
    });
    assert.notEqual(result, original);
  });

  it("normalizes valid multi-step taskState with all allowed action types", () => {
    const validState = {
      stepIndex: 5,
      history: [
        { stepIndex: 0, actionType: "click", status: "executed" },
        { stepIndex: 1, actionType: "type", status: "executed" },
        { stepIndex: 2, actionType: "scroll", status: "executed" },
        { stepIndex: 3, actionType: "focus", status: "executed" },
        { stepIndex: 4, actionType: "select", status: "executed" },
      ],
    };
    const result = normalizeTaskState(validState);
    assert.deepEqual(result, validState);
    assert.notEqual(result, validState);
    assert.notEqual(result.history, validState.history);
  });

  it("normalizes valid state at max stepIndex 9 with 9 history entries", () => {
    const history = Array.from({ length: 9 }, (_, i) => ({
      stepIndex: i,
      actionType: "click",
      status: "executed",
    }));
    const result = normalizeTaskState({ stepIndex: 9, history });
    assert.equal(result.stepIndex, 9);
    assert.equal(result.history.length, 9);
  });

  it("rejects null, non-objects, and primitives", () => {
    assert.throws(() => normalizeTaskState(null), /Invalid task state\./);
    assert.throws(() => normalizeTaskState("state"), /Invalid task state\./);
    assert.throws(() => normalizeTaskState(123), /Invalid task state\./);
    assert.throws(() => normalizeTaskState(true), /Invalid task state\./);
    assert.throws(() => normalizeTaskState([]), /Invalid task state\./);
  });

  it("rejects stepIndex out of bounds or non-integer", () => {
    assert.throws(() => normalizeTaskState({ stepIndex: -1, history: [] }), /Invalid task state\./);
    assert.throws(() => normalizeTaskState({ stepIndex: 10, history: [] }), /Invalid task state\./);
    assert.throws(() => normalizeTaskState({ stepIndex: 1.5, history: [] }), /Invalid task state\./);
    assert.throws(() => normalizeTaskState({ stepIndex: "0", history: [] }), /Invalid task state\./);
  });

  it("rejects history length mismatch with stepIndex", () => {
    assert.throws(
      () => normalizeTaskState({ stepIndex: 1, history: [] }),
      /Invalid task state\./
    );
    assert.throws(
      () =>
        normalizeTaskState({
          stepIndex: 0,
          history: [{ stepIndex: 0, actionType: "click", status: "executed" }],
        }),
      /Invalid task state\./
    );
  });

  it("rejects non-sequential history stepIndex", () => {
    assert.throws(
      () =>
        normalizeTaskState({
          stepIndex: 2,
          history: [
            { stepIndex: 0, actionType: "click", status: "executed" },
            { stepIndex: 2, actionType: "click", status: "executed" },
          ],
        }),
      /Invalid task state\./
    );
  });

  it("rejects unsupported action types", () => {
    assert.throws(
      () =>
        normalizeTaskState({
          stepIndex: 1,
          history: [{ stepIndex: 0, actionType: "hover", status: "executed" }],
        }),
      /Invalid task state\./
    );
  });

  it("rejects non-executed status", () => {
    assert.throws(
      () =>
        normalizeTaskState({
          stepIndex: 1,
          history: [{ stepIndex: 0, actionType: "click", status: "failed" }],
        }),
      /Invalid task state\./
    );
  });

  it("rejects extra keys on root (targetId, value, labels, screenshots)", () => {
    assert.throws(
      () =>
        normalizeTaskState({
          stepIndex: 0,
          history: [],
          targetId: "btn-1",
        }),
      /Invalid task state\./
    );
    assert.throws(
      () =>
        normalizeTaskState({
          stepIndex: 0,
          history: [],
          value: "secret",
        }),
      /Invalid task state\./
    );
  });

  it("rejects extra keys on history entries", () => {
    assert.throws(
      () =>
        normalizeTaskState({
          stepIndex: 1,
          history: [
            {
              stepIndex: 0,
              actionType: "click",
              status: "executed",
              targetId: "btn-1",
            },
          ],
        }),
      /Invalid task state\./
    );
  });

  it("uses generic error message that does not leak submitted data", () => {
    try {
      normalizeTaskState({
        stepIndex: 0,
        history: [],
        sensitiveField: "super-secret-user-data",
      });
      assert.fail("Should have thrown");
    } catch (err) {
      assert.equal(err.message, "Invalid task state.");
      assert.ok(!err.message.includes("super-secret-user-data"));
    }
  });
});
