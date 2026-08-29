import { FilesetResolver, FaceDetector } from "@mediapipe/tasks-vision";

const browserApi = globalThis.browser ?? globalThis.chrome;

async function createFaceDetector() {
  const wasmFileSet = browserApi.runtime.getURL("models/mediapipe/wasm");
  const modelPath = browserApi.runtime.getURL(
    "models/mediapipe/blaze_face_short_range.tflite",
  );

  const vision = await FilesetResolver.forVisionTasks(wasmFileSet);
  return await FaceDetector.createFromOptions(vision, {
    baseOptions: {
      modelAssetPath: modelPath,
    },
    runningMode: "IMAGE",
  });
}

export async function getFaceDetector() {
  if (!faceDetectorPromise) {
    faceDetectorPromise = createFaceDetector();
  }

  return faceDetectorPromise;
}