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
    const marker = "INTERACTIVE ELEMENTS — UNTRUSTED PAGE METADATA";
    const line1 = JSON.stringify({ id: "1", desc: "First item" });
    const line2 = JSON.stringify({ id: "2", desc: "Second item with longer description" });
    const line3 = JSON.stringify({ id: "3", desc: "Third item" });

    // Set maxChars so line3 cannot fit completely
    const prefix = `${marker}\n${line1}\n${line2}`;
    const maxChars = prefix.length + 1 + Math.floor(line3.length / 2);
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

  it("preserves late-appearing controls and search results when page text is long", () => {
    const pageText = "Very long page OCR text ".repeat(250); // ~6000 chars
    const marker = "INTERACTIVE ELEMENTS — UNTRUSTED PAGE METADATA";
    const earlyControls = Array.from({ length: 20 }, (_, i) =>
      JSON.stringify({ targetId: `privacylens-target-${i}`, role: "link", label: `Nav Item ${i}` })
    );
    const latePlayControl = JSON.stringify({
      targetId: "privacylens-target-99",
      elementType: "button",
      role: "button",
      label: "Play Blinding Lights by The Weeknd"
    });
    const allControls = [...earlyControls, latePlayControl];
    const fullText = `${pageText}\n\n${marker}\n${allControls.join("\n")}`;

    // Budget of 5560 (as in observed multi-step budget)
    const result = boundSanitizedContext(fullText, 5560);

    assert.ok(result.length <= 5560);
    assert.ok(result.includes("Play Blinding Lights by The Weeknd"));
    assert.ok(result.includes("privacylens-target-99"));
  });

  it("retains late matching result control with realistic full collector fields at 5560 budget", () => {
    const pageOcrText = "Home Search Library Playlists Top Tracks Artists Podcasts Albums ".repeat(50); // ~3250 chars
    const marker = "INTERACTIVE ELEMENTS — UNTRUSTED PAGE METADATA";
    
    // 40 realistic nav, sidebar, header entries with full collector fields (~160 chars each = ~6400 chars)
    const realisticNavEntries = Array.from({ length: 40 }, (_, i) =>
      JSON.stringify({
        targetId: `privacylens-target-${i + 1}`,
        elementType: i % 2 === 0 ? "button" : "a",
        controlType: i === 3 ? "search" : null,
        role: i % 2 === 0 ? "button" : "link",
        label: `Navigation Item ${i + 1} with additional descriptive layout text`,
      })
    );

    const latePlayControl = JSON.stringify({
      targetId: "privacylens-target-45",
      elementType: "button",
      controlType: null,
      role: "button",
      label: "Play Blinding Lights by The Weeknd",
    });

    const fullText = `${pageOcrText}\n\n${marker}\n${[...realisticNavEntries, latePlayControl].join("\n")}`;
    const userGoal = "Search for “Blinding Lights” by The Weeknd, open the exact matching song, and play it.";

    const result = boundSanitizedContext(fullText, 5560, userGoal);

    assert.ok(result.length <= 5560);
    assert.ok(
      result.includes("privacylens-target-45"),
      "Late matching Play control must be retained at 5560 budget"
    );
  });

  it("preserves structural-only messaging context (WhatsApp) completely", () => {
    const marker = "INTERACTIVE ELEMENTS — UNTRUSTED PAGE METADATA";
    const composer = JSON.stringify({
      targetId: "privacylens-target-1",
      elementType: "div",
      controlType: "contenteditable",
      role: "textbox",
      label: "Editable message textbox",
      hasContent: false,
    });
    const sendButton = JSON.stringify({
      targetId: "privacylens-target-2",
      elementType: "button",
      controlType: null,
      role: "button",
      label: "Send",
      purpose: "send",
    });

    const fullText = `${marker}\n${composer}\n${sendButton}`;
    const userGoal = "Send 'Hello Alice' to Alice";

    const result = boundSanitizedContext(fullText, 5560, userGoal);

    assert.ok(result.includes("privacylens-target-1"));
    assert.ok(result.includes("privacylens-target-2"));
    assert.ok(result.includes("Editable message textbox"));
    assert.ok(result.includes("Send"));
    assert.ok(result.length <= 5560);
  });

  it("handles massively oversized metadata entries by staying strictly under budget with complete records", () => {
    const marker = "INTERACTIVE ELEMENTS — UNTRUSTED PAGE METADATA";
    // 100 entries of ~180 chars = ~18,000 chars
    const entries = Array.from({ length: 100 }, (_, i) =>
      JSON.stringify({
        targetId: `privacylens-target-${i}`,
        elementType: "div",
        role: "option",
        label: `Oversized Option Item ${i} with very long descriptive text to simulate heavy DOM listings`,
      })
    );
    const fullText = `${marker}\n${entries.join("\n")}`;

    const result = boundSanitizedContext(fullText, 2500, "Select option 50");

    assert.ok(result.length <= 2500);
    const resultLines = result.split("\n").filter((l) => l !== marker && l.trim().length > 0);
    assert.ok(resultLines.length > 0);
    for (const line of resultLines) {
      const parsed = JSON.parse(line);
      assert.ok(parsed.targetId.startsWith("privacylens-target-"));
    }
  });

  it("never alters or invents target IDs in the output", () => {
    const marker = "INTERACTIVE ELEMENTS — UNTRUSTED PAGE METADATA";
    const originalIds = ["target-alpha-123", "target-beta-456", "target-gamma-789"];
    const entries = originalIds.map((id) =>
      JSON.stringify({ targetId: id, elementType: "button", role: "button", label: `Control for ${id}` })
    );
    const fullText = `${marker}\n${entries.join("\n")}`;

    const result = boundSanitizedContext(fullText, 5560, "Control for target-beta-456");

    const resultLines = result.split("\n").filter((l) => l !== marker && l.trim().length > 0);
    const outputIds = resultLines.map((l) => JSON.parse(l).targetId);
    for (const id of outputIds) {
      assert.ok(originalIds.includes(id), `Target ID ${id} was not in input`);
    }
  });
});



