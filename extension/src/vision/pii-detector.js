const EMAIL_REGEX = /@gmail\b/i;

const PHONE_REGEX = /(?:\+91[\s-]?)?[6-9]\d{4}[\s-]?\d{5}/;

export function detectPII(lines) {
  const findings = [];

  for (const line of lines) {
    const text = line.text.trim();
    if (!text) continue;

    if (EMAIL_REGEX.test(text)) {
      if (line.words.length == 1) {
        findings.push({
          type: "EMAIL",
          value: text,
          bbox: line.words[0].bbox,
          confidence: line.words[0].confidence,
        });
      } else {
        for (const word of line.words) {
          if (EMAIL_REGEX.test(word.text)) {
            findings.push({
              type: "EMAIL",
              value: word.text,
              bbox: word.bbox,
              confidence: word.confidence,
            });
          }
        }
      }
    }
  }

  return findings;
}
