import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { boundSanitizedContext } from "../src/services/boundedContext.js";

describe("boundSanitizedContext", () => {
  it("returns original text when within maxChars limit", () => {
    const text = "Sample generic text with simple content.";
    const result = boundSanitizedContext(text, 8000);
    assert.equal(result, text);
  });

  it("truncates text without marker to maxChars limit", () => {
    const longText = "A".repeat(10000);
    const result = boundSanitizedContext(longText, 8000);
    assert.equal(result.length, 8000);
    assert.equal(result, "A".repeat(8000));
  });

  it("preserves ~3000 chars of page text and full metadata lines when marker is present", () => {
    const pageText = "Paragraph content ".repeat(300); // ~5400 chars
    const marker = "INTERACTIVE ELEMENTS — UNTRUSTED PAGE METADATA";
    const metaLines = Array.from({ length: 150 }, (_, i) =>
      JSON.stringify({ targetId: `syn-target-${i}`, role: "button", label: `Action Button ${i}` })
    );
    const fullText = `${pageText}\n\n${marker}\n${metaLines.join("\n")}`;

    assert.ok(fullText.length > 8000);

    const result = boundSanitizedContext(fullText, 8000);

    assert.ok(result.length <= 8000);
    assert.ok(result.includes(marker));

    // Check that all lines in the metadata portion are complete valid JSON
    const markerIdx = result.indexOf(marker);
    const metaSection = result.slice(markerIdx + marker.length).trim();
    const resultMetaLines = metaSection.split("\n").filter(Boolean);

    assert.ok(resultMetaLines.length > 0);
    for (const line of resultMetaLines) {
      assert.doesNotThrow(() => JSON.parse(line));
    }
  });

  it("does not cut JSON metadata lines in half", () => {
    const pageText = "P".repeat(2000);
    const marker = "INTERACTIVE ELEMENTS — UNTRUSTED PAGE METADATA";
    const line1 = JSON.stringify({ id: "1", desc: "First item" });
    const line2 = JSON.stringify({ id: "2", desc: "Second item with longer description" });
    const line3 = JSON.stringify({ id: "3", desc: "Third item" });

    // Set maxChars so line3 cannot fit completely
    const prefix = `${pageText}\n\n${marker}\n${line1}\n${line2}`;
    const maxChars = prefix.length + Math.floor(line3.length / 2);
    const fullText = `${prefix}\n${line3}`;

    const result = boundSanitizedContext(fullText, maxChars);
    assert.ok(result.length <= maxChars);
    assert.ok(result.includes(line1));
    assert.ok(result.includes(line2));
    assert.ok(!result.includes(line3));
  });

  it("respects custom maxChars parameter", () => {
    const text = "1234567890".repeat(20);
    const result = boundSanitizedContext(text, 50);
    assert.equal(result.length, 50);
  });

  it("rejects non-string or empty input", () => {
    assert.throws(() => boundSanitizedContext(""), TypeError);
    assert.throws(() => boundSanitizedContext("   "), TypeError);
    assert.throws(() => boundSanitizedContext(null), TypeError);
    assert.throws(() => boundSanitizedContext(undefined), TypeError);
    assert.throws(() => boundSanitizedContext(12345), TypeError);
  });
});
