import {
  FilesetResolver,
  FaceDetector,
  ObjectDetector,
} from "@mediapipe/tasks-vision";

const browserApi = globalThis.browser ?? globalThis.chrome;

let faceDetectorPromise = null;

async function createFaceDetector() {
  const wasmFileSet = browserApi.runtime.getURL("models/mediapipe/wasm");
  const modelPath = browserApi.runtime.getURL(
    // "models/mediapipe/blaze_face_short_range.tflite", // Use FaceDetector class for this
    "models/mediapipe/efficientdet-lite2.tflite", // Use ObjectDetector class for this
  );

  const vision = await FilesetResolver.forVisionTasks(wasmFileSet);
  return await ObjectDetector.createFromOptions(vision, {
    baseOptions: {
      modelAssetPath: modelPath,
      delegate: "CPU",
    },
    scoreThreshold: 0.1, // use for ObjectDetector class only
    categoryAllowlist: ["person", "clock"],
    runningMode: "IMAGE",
  });
}

export async function getFaceDetector() {
  if (!faceDetectorPromise) {
    faceDetectorPromise = createFaceDetector();
  }

  return faceDetectorPromise;
}
