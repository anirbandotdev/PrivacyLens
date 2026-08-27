# PrivacyLens Browser Extension

Privacy-preserving browser vision agent that runs local OCR and Named Entity Recognition (NER) to detect and redact Personally Identifiable Information (PII) before any screen data leaves the device.

---

## 1. Architecture & Pipeline

```
[ Active Tab ] 
       │
       ▼ (chrome.tabs.captureVisibleTab)
[ Background Service Worker ]
       │
       ▼ (Base64 PNG)
[ Popup App / Vision Pipeline ]
       │
       ├──► 1. PaddleOCR Engine (WASM/ONNX Runtime Web)
       │         └── Extracts text boxes & coordinates
       │
       ├──► 2. PII NER Token Classification (HuggingFace Transformers.js / ONNX)
       │         └── Identifies PII entities (Names, Emails, Phones, Keys, etc.)
       │
       ├──► 3. In-Memory Canvas Redaction
       │         └── Masks detected sensitive bounding boxes with padding
       │
       └──► 4. Output Render & Export
                 └── Display sanitized preview, blinking live status, and one-click download
```

---

## 2. Prerequisites

- **Node.js**: v18.0.0 or higher
- **npm**: v9.0.0 or higher
- **Git**: with [Git LFS](https://git-lfs.com/) installed (required to pull ONNX weights from Hugging Face)
- **Chromium-based Browser**: Chrome, Brave, Edge, Opera

---

## 3. Required Models Setup (Manual Git Clone)

The extension performs 100% on-device local inference. The ONNX models must be cloned into `extension/public/models/`.

### Directory Target

```
extension/
└── public/
    └── models/
        ├── broadfield-dev/
        │   └── bert-mini-ner-pii-mobile/
        ├── Xenova/
        │   └── bert-base-NER/
        ├── joneauxedgar/
        │   └── pasteproof-pii-detector-onnx/
        ├── rulesentry-io/
        │   └── ettin-32m-nemotron-pii-onnx/
        └── paddleocr/
            ├── detection.onnx
            ├── recognition.onnx
            └── dictionary.txt
```

### Step-by-Step Model Download Commands

Ensure Git LFS is initialized once:
```bash
git lfs install
```

Navigate to the `extension/public/models` directory:
```bash
cd extension/public/models
```

#### A. Active Primary PII NER Model (`broadfield-dev`)
```bash
mkdir -p broadfield-dev
cd broadfield-dev
git clone https://huggingface.co/broadfield-dev/bert-mini-ner-pii-mobile
cd ..
```

#### B. Additional Supported / Alternative NER Models
```bash
# Xenova BERT Base NER
mkdir -p Xenova
cd Xenova
git clone https://huggingface.co/Xenova/bert-base-NER
cd ..

# Pasteproof PII Detector
mkdir -p joneauxedgar
cd joneauxedgar
git clone https://huggingface.co/joneauxedgar/pasteproof-pii-detector-onnx
cd ..

# RuleSentry Ettin Nemotron PII
mkdir -p rulesentry-io
cd rulesentry-io
git clone https://huggingface.co/rulesentry-io/ettin-32m-nemotron-pii-onnx
cd ..
```

#### C. PaddleOCR Models
Ensure `paddleocr/` directory contains:
- `detection.onnx` (PP-OCR text detector model)
- `recognition.onnx` (PP-OCR text recognizer model)
- `dictionary.txt` (character vocabulary mapping)

---

## 4. Build & Installation

### Step 1: Install Dependencies
```bash
cd extension
npm install
```

### Step 2: Build Extension Bundle
```bash
npm run build
```
The production bundle will be generated in `extension/dist/`.

### Step 3: Load into Browser
1. Open your browser and navigate to `chrome://extensions/` (or `edge://extensions/`, `brave://extensions/`).
2. Toggle on **Developer mode** in the top-right corner.
3. Click **Load unpacked**.
4. Select the `extension/dist` folder (or `extension/` for development).
5. Pin the **PrivacyLens** extension icon to your toolbar.

---

## 5. Usage

1. Open any webpage you want to inspect or redact.
2. Click the **PrivacyLens** icon in the browser toolbar.
3. Click **Start Agent** or enter a prompt:
   - The extension captures the visible tab.
   - PaddleOCR detects text bounding boxes.
   - The on-device PII model flags sensitive entities.
   - The top-right of the preview shows a **green pulsing indicator** while processing.
4. Once redaction is complete:
   - The screen preview updates to show the masked/redacted image.
   - Click **Download Redacted Image** to save the sanitized screenshot as a PNG.

---

## 6. Directory Structure

```
extension/
├── public/
│   ├── background.js       # Manifest V3 service worker for tab capture
│   ├── manifest.json       # Chrome extension configuration & permissions
│   ├── models/             # Local ONNX model weights and configs
│   ├── ort/                # ONNX Runtime Web WASM binaries and glue code
│   ├── popup.html          # Extension popup HTML entrypoint
│   └── dashboard.html      # Extended monitoring dashboard entrypoint
├── src/
│   ├── components/         # Reusable UI widgets (PromptBox, StatusBadge, etc.)
│   ├── popup/
│   │   ├── PopupApp.jsx    # Main popup interactive controller
│   │   └── popup.css       # Extension popup layout & visual styling
│   ├── vision-paddle/
│   │   ├── paddleocr.js    # PaddleOCR engine runner via ONNX Runtime Web
│   │   ├── pii-ner.js      # HuggingFace Transformers.js local pipeline loader
│   │   ├── pii-detector.js # Orchestration between OCR text & NER entities
│   │   ├── redactImage.js  # OffscreenCanvas pixel mask rendering
│   │   └── blobToDataUrl.js# Format conversion helpers
│   └── styles/
│       └── index.css       # Global design tokens and animations
├── package.json
└── vite.config.js
```

---

## 7. Security & Privacy Model

- **Zero-Cloud Text/Image Processing**: All OCR and NER inference is performed within the user's browser sandbox using WebAssembly (WASM) and ONNX Runtime Web.
- **Content Security Policy**: `manifest.json` restricts script execution strictly to local sources (`script-src 'self' 'wasm-unsafe-eval'`).
- **Data Isolation**: Screenshots and intermediate embeddings remain in memory and are discarded when the popup closes or the session resets.
