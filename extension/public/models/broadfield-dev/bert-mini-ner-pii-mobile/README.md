---
base_model: broadfield-dev/bert-mini-ner-pii-training-tuned-12270113
library_name: transformers
tags:
- onnx
- onnxruntime
- tokenizers
- optimum
- token-classification
language: en
pipeline_tag: token-classification
---

# ONNX Export: broadfield-dev/bert-mini-ner-pii-mobile

This is a version of [broadfield-dev/bert-mini-ner-pii-training-tuned-12270113](https://huggingface.co/broadfield-dev/bert-mini-ner-pii-training-tuned-12270113) that has been converted to ONNX and optimized.

## Model Details
- **Base Model:** `broadfield-dev/bert-mini-ner-pii-training-tuned-12270113`
- **Task:** `token-classification`
- **Opset Version:** `17`
- **Optimization:** `FP32 (No Quantization)`

## Usage

### Installation
For a lightweight mobile/serverless setup, you only need `onnxruntime` and `tokenizers`.
```bash
pip install onnxruntime tokenizers
```

### Python Example
```python

from tokenizers import Tokenizer
import onnxruntime as ort
import numpy as np

# 1. Load the lightweight tokenizer (No Transformers dependency needed)
tokenizer = Tokenizer.from_pretrained("broadfield-dev/bert-mini-ner-pii-mobile")

# 2. Load the ONNX model
session = ort.InferenceSession("model.onnx")

# 3. Preprocess (Simple text encoding)
text = "Run inference on mobile!"
encoding = tokenizer.encode(text)

# Prepare inputs (Exact names vary by model, usually input_ids + attention_mask)
inputs = {
    "input_ids": np.array([encoding.ids], dtype=np.int64),
    "attention_mask": np.array([encoding.attention_mask], dtype=np.int64)
}

# 4. Run Inference
outputs = session.run(None, inputs)
print("Output logits shape:", outputs[0].shape)

```

## About this Export
This model was exported using [Optimum](https://huggingface.co/docs/optimum/index). 
It includes the `FP32 (No Quantization)` quantization settings and a pre-compiled `tokenizer.json` for fast loading.
