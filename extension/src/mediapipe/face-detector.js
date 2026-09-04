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
    "models/mediapipe/blaze_face_full_range.tflite",
  );

  const vision = await FilesetResolver.forVisionTasks(wasmFileSet);
  return await FaceDetector.createFromOptions(vision, {
    baseOptions: {
      modelAssetPath: modelPath,
      delegate: "CPU",
    },
    minDetectionConfidence: 0.2,
    runningMode: "IMAGE",
  });
}

export async function getFaceDetector() {
  if (!faceDetectorPromise) {
    faceDetectorPromise = createFaceDetector();
  }

  return faceDetectorPromise;
}
