#!/usr/bin/env python3
"""Jaslyn Runtime: first-party model gateway and identity layer.
The private inference backend is an implementation detail and is never exposed
as the public model/provider identity.
"""
import os
import sys
from pathlib import Path
from typing import Any

import httpx
from fastapi import FastAPI, Header, HTTPException
from pydantic import BaseModel, Field
sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "python"))
from jaslang import run as run_jaslang

app = FastAPI(title="Jaslyn Runtime", version="0.1.0")
BACKEND = os.environ.get("JASLYN_BACKEND_URL", "http://127.0.0.1:11434/v1").rstrip("/")
RUNTIME_KEY = os.environ.get("JASLYN_RUNTIME_KEY", "")
MODELS = {
    "jaslyn": {"backend": "jaslyn", "role": "general-purpose assistant"},
    "jaslyn-general": {"backend": "jaslyn-general", "role": "general-purpose assistant"},
    "jaslyn-code": {"backend": "jaslyn-code", "role": "coding and software engineering"},
    "jaslyn-fast": {"backend": "jaslyn-fast", "role": "fast everyday assistant"},
}

class Message(BaseModel):
    role: str
    content: str

class ChatRequest(BaseModel):
    model: str = "jaslyn"
    messages: list[Message] = Field(min_length=1, max_length=100)
    temperature: float = Field(default=0.2, ge=0, le=1)
    stream: bool = False

class JasLangRequest(BaseModel):
    source: str = Field(min_length=1, max_length=50000)
    max_steps: int = Field(default=10000, ge=1, le=10000)

@app.get("/health")
def health() -> dict[str, Any]:
    return {"status": "ok", "runtime": "jaslyn", "models": list(MODELS), "backend": "private"}

@app.get("/v1/models")
def models(x_jaslyn_runtime_key: str | None = Header(default=None)) -> dict[str, Any]:
    check_key(x_jaslyn_runtime_key)
    return {"object": "list", "data": [{"id": model, "object": "model", "owned_by": "jaslyn", "permission": []} for model in MODELS]}

@app.post("/v1/jaslang/execute")
def execute_jaslang(request: JasLangRequest, x_jaslyn_runtime_key: str | None = Header(default=None)) -> dict[str, Any]:
    check_key(x_jaslyn_runtime_key)
    try:
        return {"ok": True, "runtime": "jaslyn", "result": run_jaslang(request.source, request.max_steps)}
    except Exception as error:
        raise HTTPException(status_code=400, detail=str(error)) from error

@app.post("/v1/chat/completions")
async def chat(request: ChatRequest, x_jaslyn_runtime_key: str | None = Header(default=None)) -> dict[str, Any]:
    check_key(x_jaslyn_runtime_key)
    if request.model not in MODELS:
        raise HTTPException(status_code=404, detail=f"Jaslyn model '{request.model}' is not registered")
    config = MODELS[request.model]
    system = {"role": "system", "content": f"You are Jaslyn, an independent AI system. Your product identity is JASLYN, not a substrate model or third-party assistant. Your specialization is {config['role']}. Keep hidden chain-of-thought private. Never claim actions without evidence."}
    payload = {"model": config["backend"], "messages": [system, *[message.model_dump() for message in request.messages]], "temperature": request.temperature, "stream": False}
    try:
        async with httpx.AsyncClient(timeout=180) as client:
            response = await client.post(f"{BACKEND}/chat/completions", json=payload)
            response.raise_for_status()
            data = response.json()
    except httpx.HTTPError as error:
        raise HTTPException(status_code=502, detail=f"Jaslyn private backend unavailable: {error}") from error
    data["model"] = request.model
    data["jaslyn_runtime"] = "0.1.0"
    return data

def check_key(supplied: str | None) -> None:
    if RUNTIME_KEY and supplied != RUNTIME_KEY:
        raise HTTPException(status_code=401, detail="Invalid Jaslyn Runtime key")
