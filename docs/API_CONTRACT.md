# PrivacyLens API Contract

## Endpoint

`POST http://localhost:3000/api/analyze`

## Request Headers

- `Content-Type: application/json`

## Request Body

| Field | Type | Required | Description |
|---|---|---|---|
| `prompt` | string | Yes | User instruction. Max 2000 characters. |
| `sanitizedText` | string | Optional* | Sanitized OCR/DOM text. |
| `sanitizedScreenshot` | string | Optional* | Redacted image data URL (`data:image/...`). |
| `redactionSummary` | object | Optional | Redaction type counts (e.g. `{ "email": 1 }`). |
| `privacyVerified` | boolean | Yes | Must strictly equal `true`. |

\* *At least one of `sanitizedText` or `sanitizedScreenshot` must be provided.*

### Example Request

```json
{
  "prompt": "Click the Search button",
  "sanitizedText": "Visible button: Search, targetId=search-button",
  "sanitizedScreenshot": null,
  "redactionSummary": { "email": 1 },
  "privacyVerified": true
}
```

## Response

### Success (200 OK)

Fields returned:
- `success` (boolean): `true`
- `requestId` (string): Unique UUID for the request
- `status` (string): `"completed"`
- `message` (string): Explanation from the model
- `actions` (array): List of action objects
- `redactionSummary` (object): Echoed redaction summary

#### Example Response

```json
{
  "success": true,
  "requestId": "e1f98d72-b75d-4f1e-9276-8051a667823f",
  "status": "completed",
  "message": "Clicking the Search button.",
  "actions": [
    {
      "type": "click",
      "targetId": "search-button",
      "intent": "Submit query"
    }
  ],
  "redactionSummary": { "email": 1 }
}
```

### Supported Action Types

- `click`
- `type`
- `scroll`
- `focus`
- `select`

### Error Responses

- **400 Bad Request**: Invalid payload or unverified input (`privacyVerified !== true`, missing prompt, prompt > 2000 chars, or neither context provided).
- **502 Bad Gateway**: AI model analysis failure (after retries exhausted).

## Privacy Rules

- Never transmit original screenshots.
- Never transmit raw PII.
- Preserve placeholders (e.g., `{EMAIL_1}`, `{TOKEN}`).
- Never log screenshots, OCR text, prompts, API keys, or model responses.
- `privacyVerified` must only be set to `true` after local client-side redaction completes.
- `targetId` values must correspond to real browser elements.
