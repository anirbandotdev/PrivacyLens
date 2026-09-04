import test from "node:test";
import assert from "node:assert/strict";

import { isTypedValueAuthorized } from "../src/agent/textAuthorization.js";

test("exact match is authorized", () => {
  assert.equal(isTypedValueAuthorized("sample item", "sample item"), true);
});

test("contiguous phrase within longer prompt is authorized", () => {
  assert.equal(
    isTypedValueAuthorized("Find sample item in the catalog", "sample item"),
    true
  );
});

test("invented additions not present in prompt are rejected", () => {
  assert.equal(
    isTypedValueAuthorized("sample item", "sample item premium"),
    false
  );
  assert.equal(
    isTypedValueAuthorized("search for sample item", "sample item 2026"),
    false
  );
});

test("case differences are normalized and authorized", () => {
  assert.equal(
    isTypedValueAuthorized("SAMPLE ITEM", "sample item"),
    true
  );
  assert.equal(
    isTypedValueAuthorized("find sample item", "SAMPLE ITEM"),
    true
  );
});

test("repeated whitespace and newlines are normalized", () => {
  assert.equal(
    isTypedValueAuthorized("sample   \n\t  item", "sample item"),
    true
  );
  assert.equal(
    isTypedValueAuthorized("search   sample item   now", "sample   item"),
    true
  );
});

test("unicode variations are normalized", () => {
  assert.equal(
    isTypedValueAuthorized("caf\u0065\u0301 item", "caf\u00E9 item"),
    true
  );
});

test("non-contiguous or scrambled terms are rejected", () => {
  assert.equal(
    isTypedValueAuthorized("sample and item", "sample item"),
    false
  );
});

test("empty or invalid inputs are rejected safely", () => {
  assert.equal(isTypedValueAuthorized("", "sample item"), false);
  assert.equal(isTypedValueAuthorized("sample item", ""), false);
  assert.equal(isTypedValueAuthorized("   ", "sample item"), false);
  assert.equal(isTypedValueAuthorized("sample item", "   "), false);
  assert.equal(isTypedValueAuthorized(null, "sample item"), false);
  assert.equal(isTypedValueAuthorized("sample item", null), false);
  assert.equal(isTypedValueAuthorized(undefined, "sample item"), false);
  assert.equal(isTypedValueAuthorized("sample item", undefined), false);
  assert.equal(isTypedValueAuthorized(123, "sample item"), false);
  assert.equal(isTypedValueAuthorized("sample item", 123), false);
});
