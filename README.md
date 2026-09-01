# PrivacyLens

PrivacyLens is a privacy-preserving browser vision agent developed for Smart India Hackathon problem statement **SIH26171 — On-device Visual Perception for Light-weight Browser Agents**.

The extension evaluates the current browser screen locally, removes sensitive information, and sends only sanitized context to a reasoning model. The model returns a structured response or browser action plan, which is validated and executed by the extension under the user's control.

> Status: active prototype. PrivacyLens is intended for controlled demonstrations and testing with dummy data. It is not ready for production use on banking, payment, identity, or other highly sensitive pages.

## Problem

Browser agents can assist with tasks such as understanding a page, navigating interfaces, completing forms, and carrying out multi-step workflows. Giving a remote AI unrestricted access to screenshots or page content, however, can expose names, addresses, account details, credentials, and other personal information.

PrivacyLens places a local privacy boundary between the webpage and the reasoning model. Raw visual context is processed inside the extension before any server request is allowed.

## How it works

```text
Webpage
  -> local screenshot capture and DOM collection
  -> local OCR and PII detection
  -> text and image redaction
  -> sanitized context sent to the server
  -> structured response or action plan
  -> local validation and confirmation
  -> controlled browser execution
```

The server never receives direct control of the webpage. It can only return actions that conform to the supported schema, and targeted actions must reference an element collected locally for that request.

## Current capabilities

- Captures the visible portion of the active browser tab.
- Runs PaddleOCR locally to extract visible text.
- Uses a local token-classification model and deterministic rules to identify PII.
- Redacts detected regions before a screenshot can be transmitted.
- Replaces sensitive OCR regions with `[REDACTED]` in the text context.
- Collects restricted metadata for visible, enabled interactive elements.
- Omits password, OTP, PIN, CVV, payment-card, and other sensitive input fields from DOM context.
- Routes simple scrolling commands locally without contacting the server.
- Supports structured `click`, `focus`, `scroll`, `select`, and `type` actions.
- Rejects malformed actions and targets that were not present in the collected DOM context.
- Blocks typing into sensitive fields even after confirmation.
- Requires user confirmation for consequential actions such as deletion, payment, ordering, transfer, messaging, upload, booking, and application submission.
- Supports Gemini-based reasoning and includes an experimental Qwen/Ollama integration.

## Privacy boundary

The following data is intended to remain on the user's device:

- Original screenshot
- Raw OCR output
- Detected PII before redaction
- Live form values
- Password, OTP, PIN, CVV, and payment-card fields
- Browser action execution state

Only the following may be sent to the configured server:

- Sanitized user prompt
- Sanitized OCR text
- Redacted screenshot, when local verification succeeds
- Restricted interactive-element metadata
- Redaction counts and processing status

If OCR produces unusable regions, PrivacyLens omits the screenshot and uses a sanitized text-only fallback. If privacy verification cannot produce safe context, the request is blocked.

## Action safety

Server-generated actions pass through several local checks:

1. **Schema validation** — unsupported or malformed actions are rejected.
2. **Target scoping** — target IDs must match the DOM elements collected for the same request.
3. **Element checks** — the target must exist, be visible, and be enabled.
4. **Sensitive-field blocking** — credentials and payment-related values are never typed.
5. **Impact detection** — consequential clicks require confirmation even if the model omits the confirmation flag.
6. **User approval** — only the specific confirmed action is resumed.

The executor locates targets by exact element ID and does not execute model-provided JavaScript or arbitrary CSS selectors.

## Project structure

```text
PrivacyLens/
├── extension/
│   ├── public/
│   │   ├── manifest.json
│   │   ├── background.js
│   │   └── models/
│   ├── src/
│   │   ├── agent/
│   │   │   ├── actionExecutor.js
│   │   │   ├── actionValidator.js
│   │   │   ├── domContextCollector.js
│   │   │   ├── localIntentRouter.js
│   │   │   └── orchestrator.js
│   │   ├── api/
│   │   ├── components/
│   │   ├── popup/
│   │   └── vision-paddle/
│   │       ├── buildPrivateContext.js
│   │       ├── paddleocr.js
│   │       ├── pii-detector.js
│   │       └── redactImage.js
│   └── tests/
└── server/
    └── src/
        ├── routes/
        └── services/
```

## Technology

- JavaScript and React
- Vite
- Chrome/Firefox WebExtension APIs
- WebAssembly and browser-side ONNX inference
- PaddleOCR
- Transformers.js
- Node.js and Express
- Gemini API
- Qwen through Ollama

## Local setup

### Requirements

- Node.js and npm
- A Chromium-based browser for the currently tested extension build
- Required PaddleOCR and PII model assets under `extension/public/models/`
- Either a Gemini API key or an accessible Ollama server, depending on the selected server integration

### Install the server

```bash
cd server
npm install
```

Create `server/.env` locally and add only the configuration required by the active provider. Never commit this file.

Gemini development configuration:

```env
GEMINI_API_KEY=your_api_key
```

Qwen/Ollama development configuration:

```env
OLLAMA_BASE_URL=http://127.0.0.1:11434
OLLAMA_MODEL=qwen3-vl:4b-instruct
```

Start the server:

```bash
npm start
```

### Build the extension

```bash
cd extension
npm install
npm run build
```

Load the generated `extension/dist` folder as an unpacked extension:

1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Select **Load unpacked**.
4. Choose the generated `extension/dist` directory.

Reload the unpacked extension after every new build.

## Usage

1. Open a test webpage.
2. Open PrivacyLens from the browser toolbar.
3. Enter a request such as `Summarize this page` or `Scroll down`.
4. Review the sanitized preview and returned action plan.
5. Approve or reject actions when confirmation is requested.

Use dummy pages and synthetic information while the project remains under development.

## Tests

Run the extension safety tests with:

```bash
cd extension
node --test "tests/*.test.js"
```

The current tests cover action validation, confirmation propagation, sensitive-field restrictions, local routing, target scoping, and selected PII regression cases.

## SIH26171 alignment

The problem statement requires a browser-based, privacy-preserving vision agent that combines local visual processing with server-side reasoning. PrivacyLens implements this split as follows:

| Evaluation area | PrivacyLens implementation |
| --- | --- |
| Visual-context accuracy | Local OCR plus restricted DOM metadata |
| Sensitive-data recall and precision | Local NER with deterministic and contextual validation |
| Redaction precision | Bounding-box image masking and text replacement |
| Client resource use | Lightweight browser-side models using WASM/ONNX |
| End-to-end latency | Local routing for simple commands and bounded server requests |

The privacy-critical perception pipeline runs on the client. The reasoning model may run on a controlled server and receives only sanitized context. An offline-deployable Qwen/Ollama server is the intended open-weights path; Gemini is currently useful as a development integration.

## Known limitations

- PII detection is probabilistic and can still produce false positives or false negatives.
- Development logs may contain OCR or PII details and must be disabled or gated before release.
- Generated element IDs can be affected by highly dynamic webpages.
- Actions may become stale if a page changes during the server request.
- Full multi-page workflows require a repeated observe-plan-execute cycle that is not yet complete.
- Icon-only controls, cross-origin frames, shadow DOM, canvas-rendered interfaces, and browser-protected pages may not be fully supported.
- Provider selection is not yet exposed as a clean runtime configuration switch.
- Firefox compatibility has not been verified to the same level as Chromium.
- The prototype must not be treated as a password manager, payment agent, or security guarantee.

## Security notes

- Do not commit `server/.env` or API keys.
- Do not publish screenshots or console logs containing real personal information.
- Do not commit `node_modules` or generated build output unless a deployment process explicitly requires it.
- Review the licence and redistribution terms of all model assets before publishing them.
- Perform demonstrations on controlled websites using synthetic data.

## Development priorities

1. Improve PII evaluation using a representative, synthetic benchmark set.
2. Add re-observation after navigation and significant DOM changes.
3. Harden prompt-injection boundaries for untrusted page metadata.
4. Add explicit Gemini/Qwen provider configuration without silent fallback.
5. Disable content-bearing debug logs for production builds.
6. Measure redaction precision, PII recall, client resource use, and end-to-end latency against the SIH evaluation criteria.

## Licence

No project licence has been specified yet. Add a licence before distributing or accepting external contributions.
