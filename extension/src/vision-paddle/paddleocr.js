import { PaddleOcrService } from "paddleocr";
import * as ort from "onnxruntime-web";

const browserAPI = globalThis.browser || globalThis.chrome;

let ocrInstance = null;

async function loadArrayBuffer(url) {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Failed to load model: ${url} (${response.status})`);
  }

  return await response.arrayBuffer();
}

async function loadDictionary(url) {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Failed to load dictionary: ${url} (${response.status})`);
  }

  const text = await response.text();

  const dictionary = text.replace(/\r?\n$/, "").split(/\r?\n/);

  // PP-OCRv5 multilingual model has an additional ASCII space token
  if (dictionary[dictionary.length - 1] !== " ") {
    dictionary.push(" ");
  }

  console.log("Dictionary entries:", dictionary.length);

  console.log(
    "Last dictionary entry:",
    JSON.stringify(dictionary[dictionary.length - 1]),
  );

  return dictionary;
}

async function base64ToPixels(dataUrl) {
  const response = await fetch(dataUrl);
  const blob = await response.blob();

  const bitmap = await createImageBitmap(blob);

  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);

  const ctx = canvas.getContext("2d", {
    willReadFrequently: true,
  });

  ctx.drawImage(bitmap, 0, 0);

  const imageData = ctx.getImageData(0, 0, bitmap.width, bitmap.height);

  return {
    width: bitmap.width,
    height: bitmap.height,
    data: new Uint8Array(imageData.data),
  };
}

export async function getOCR() {
  try {
    if (ocrInstance) {
      return ocrInstance;
    }

    console.log("Initializing OpenCV-free PaddleOCR...");

    const detectionURL = browserAPI.runtime.getURL(
      "models/paddleocr/detection.onnx",
    );

    const recognitionURL = browserAPI.runtime.getURL(
      "models/paddleocr/recognition.onnx",
    );

    const dictionaryURL = browserAPI.runtime.getURL(
      "models/paddleocr/dictionary.txt",
    );

    console.log("Dictionary:", dictionaryURL);

    const [detectionModel, recognitionModel, dictionary] = await Promise.all([
      loadArrayBuffer(detectionURL),

      loadArrayBuffer(recognitionURL),

      loadDictionary(dictionaryURL),
    ]);

    console.log("Detection model loaded:", detectionModel.byteLength, "bytes");

    console.log(
      "Recognition model loaded:",
      recognitionModel.byteLength,
      "bytes",
    );

    console.log("Dictionary entries:", dictionary.length);

    ocrInstance = await PaddleOcrService.createInstance({
      ort,

      modelPreset: "PP-OCRv5_mobile",

      detection: {
        modelBuffer: detectionModel,
      },

      recognition: {
        modelBuffer: recognitionModel,

        charactersDictionary: dictionary,
      },
    });

    console.log("PaddleOCR initialized successfully!", ocrInstance);

    return ocrInstance;
  } catch (error) {
    console.error("PaddleOCR CREATE FAILED:", error);

    throw error;
  }
}

export async function extractText(image) {
  const ocr = await getOCR();

  const pixels = await base64ToPixels(image);

  console.log("Running OCR...");

  const results = await ocr.recognize(pixels, {
    detection: {
      textPixelThreshold: 0.4,
      boxScoreThreshold: 0.6,
      maxSideLimit: 1600,
    },
  });

  // console.log("OCR results:", results);

  return results;
}
