import Tesseract from "tesseract.js";
import { createWorker } from "tesseract.js";

const browserAPI = globalThis.browser || globalThis.chrome;

export async function textReader(link) {
  const worker = await createWorker("eng", 1, {
    workerPath: browserAPI.runtime.getURL("js/worker.min.js"), // Path to your local worker file
    langPath: browserAPI.runtime.getURL("tessdata/"), // Path to your local tessdata folder
    corePath: browserAPI.runtime.getURL("tesseract-core/"), // Path to your local core file
    workerBlobURL: false,
  });

  const ret = await worker.recognize(
    link,
    {},
    {
        blocks: true
    }
    );

  console.log(ret.data.blocks[0].paragraphs[0].lines);

  const line = ret.data.blocks[0].paragraphs[0].lines

  await worker.terminate();
  return line
}