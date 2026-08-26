import { pipeline } from "@huggingface/transformers"

const device =
        navigator.gpu
            ? "webgpu"
            : "wasm";

const MODEL =
    "broadfield-dev/bert-mini-ner-pii-mobile";

let classifier = null;

export async function getPIIModel(){
    if(!classifier){
        console.log(
            "Loading PII NER model..."
        );

        classifier = await pipeline(
            "token-classification",
            MODEL,
            {
                device,
            }
        );

        console.log(
            "PII NER model loaded."
        );
        
    }
    return classifier;
}

