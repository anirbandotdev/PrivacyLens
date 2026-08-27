import { pipeline, env } from "@huggingface/transformers";

const browserAPI = globalThis.browser || globalThis.chrome;

env.allowLocalModels = true;
env.allowRemoteModels = false;
env.localModelPath = browserAPI.runtime.getURL("models/");

env.backends.onnx.wasm.wasmPaths = browserAPI.runtime.getURL("ort/");

const device = navigator.gpu ? "webgpu" : "wasm";

const MODEL = "broadfield-dev/bert-mini-ner-pii-mobile";

let classifier = null;

export async function getPIIModel() {
  if (!classifier) {
    console.log("Loading PII NER model...");

    classifier = await pipeline("token-classification", MODEL, {
      device,
      dtype: "fp32",
      local_files_only: true,
    });

    console.log("PII NER model loaded.");
  }

  return classifier;
}
