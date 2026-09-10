import os
from functools import lru_cache

from fastapi import FastAPI, HTTPException
from fastapi.responses import JSONResponse
from huggingface_hub import hf_hub_download
from llama_cpp import Llama

MODEL_NAME = os.getenv("JASLYN_MODEL", "jaslyn")
MODEL_REPO = os.getenv("JASLYN_MODEL_REPO", "bartowski/SmolLM2-135M-Instruct-GGUF")
MODEL_FILE = os.getenv("JASLYN_MODEL_FILE", "SmolLM2-135M-Instruct-Q4_K_M.gguf")
MODEL_DIR = os.getenv("JASLYN_MODEL_DIR", "/tmp/jaslyn-model")
N_CTX = max(512, min(4096, int(os.getenv("JASLYN_CONTEXT", "2048"))))
N_THREADS = max(1, int(os.getenv("JASLYN_THREADS", str(os.cpu_count() or 2))))
MAX_TOKENS = max(32, min(1024, int(os.getenv("JASLYN_MAX_TOKENS", "512"))))

app = FastAPI(title="Jaslyn Self-Hosted Inference", version="0.1.0")

@lru_cache(maxsize=1)
def model():
    path = hf_hub_download(repo_id=MODEL_REPO, filename=MODEL_FILE, local_dir=MODEL_DIR)
    return Llama(model_path=path, n_ctx=N_CTX, n_threads=N_THREADS, verbose=False)

def messages_to_prompt(messages):
    return "\n".join(f"{m.get('role', 'user').upper()}: {m.get('content', '')}" for m in messages)

@app.get("/health")
def health():
    try:
        model()
        return {"status": "ok", "model": MODEL_NAME, "inference": "ready"}
    except Exception as exc:
        return JSONResponse(status_code=503, content={"status": "degraded", "model": MODEL_NAME, "inference": "unavailable", "error": str(exc)})

@app.get("/v1/models")
def models():
    return {"object": "list", "data": [{"id": MODEL_NAME, "object": "model", "owned_by": "jaslyn"}]}

@app.post("/v1/chat/completions")
def chat(payload: dict):
    messages = payload.get("messages") or []
    if not messages:
        raise HTTPException(status_code=400, detail="messages is required")
    prompt = messages_to_prompt(messages)
    try:
        result = model().create_completion(
            prompt=prompt,
            max_tokens=min(MAX_TOKENS, int(payload.get("max_tokens", MAX_TOKENS))),
            temperature=float(payload.get("temperature", 0.2)),
            stop=["USER:", "SYSTEM:"],
        )
        text = result["choices"][0]["text"].strip()
        return {
            "id": "jaslyn-local",
            "object": "chat.completion",
            "model": MODEL_NAME,
            "choices": [{"index": 0, "message": {"role": "assistant", "content": text}, "finish_reason": result["choices"][0].get("finish_reason", "stop")}],
        }
    except Exception as exc:
        raise HTTPException(status_code=503, detail=f"Inference failed: {exc}") from exc
