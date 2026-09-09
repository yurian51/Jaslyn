#!/usr/bin/env python3
"""Small, allow-listed Python tool worker for Jaslyn.
Protocol: one JSON object on stdin, one JSON object on stdout.
"""
import json
import os
import platform
import sys
import sqlite3
import uuid
import hashlib
import secrets
from datetime import datetime, timezone
from pathlib import Path
from jaslyn_code import detect as detect_code_language, create_language
from jaslang import run as run_jaslang

ROOT = Path(os.environ.get("JASLYN_WORKSPACE", os.getcwd())).resolve()
MEMORY_DB = Path(os.environ.get("JASLYN_MEMORY_DB", ROOT / "data" / "jaslyn_memory.sqlite3")).resolve()

def memory_connection():
    MEMORY_DB.parent.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(MEMORY_DB)
    connection.row_factory = sqlite3.Row
    connection.execute("""CREATE TABLE IF NOT EXISTS memories (id TEXT PRIMARY KEY, content TEXT NOT NULL, category TEXT NOT NULL, importance INTEGER NOT NULL DEFAULT 3, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)""")
    connection.commit()
    return connection

def memory_store(content, category="semantic", importance=3):
    content = str(content).strip()
    if not content: raise ValueError("Memory content is required")
    now = datetime.now(timezone.utc).isoformat()
    memory_id = str(uuid.uuid4())
    with memory_connection() as db:
        db.execute("INSERT INTO memories (id, content, category, importance, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)", (memory_id, content, str(category), max(1, min(int(importance), 5)), now, now))
    return {"id": memory_id, "content": content, "category": str(category), "importance": max(1, min(int(importance), 5)), "created_at": now, "updated_at": now}

def memory_search(query, limit=10):
    terms = [term.lower() for term in str(query).split() if term.strip()]
    with memory_connection() as db:
        rows = db.execute("SELECT * FROM memories ORDER BY importance DESC, updated_at DESC LIMIT 100").fetchall()
    matches = [dict(row) for row in rows if not terms or all(term in row["content"].lower() or term in row["category"].lower() for term in terms)]
    return matches[:min(max(int(limit), 1), 50)]

def memory_list(limit=25):
    with memory_connection() as db:
        rows = db.execute("SELECT * FROM memories ORDER BY updated_at DESC LIMIT ?", (min(max(int(limit), 1), 100),)).fetchall()
    return [dict(row) for row in rows]

def api_key_connection():
    MEMORY_DB.parent.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(MEMORY_DB)
    connection.row_factory = sqlite3.Row
    connection.execute("""CREATE TABLE IF NOT EXISTS api_keys (id TEXT PRIMARY KEY, label TEXT NOT NULL, key_prefix TEXT NOT NULL, key_hash TEXT NOT NULL UNIQUE, created_at TEXT NOT NULL, revoked_at TEXT)""")
    connection.commit()
    return connection

def api_key_create(label="Jaslyn client"):
    raw = "jsk_" + secrets.token_urlsafe(32)
    key_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    key_hash = hashlib.sha256(raw.encode()).hexdigest()
    prefix = raw[:12]
    with api_key_connection() as db:
        db.execute("INSERT INTO api_keys (id, label, key_prefix, key_hash, created_at) VALUES (?, ?, ?, ?, ?)", (key_id, str(label), prefix, key_hash, now))
    return {"id": key_id, "label": str(label), "key": raw, "prefix": prefix, "created_at": now, "warning": "Store this key now. Jaslyn will not show the secret again."}

def api_key_list():
    with api_key_connection() as db:
        rows = db.execute("SELECT id, label, key_prefix, created_at, revoked_at FROM api_keys ORDER BY created_at DESC").fetchall()
    return [dict(row) for row in rows]

def api_key_revoke(key_id):
    now = datetime.now(timezone.utc).isoformat()
    with api_key_connection() as db:
        result = db.execute("UPDATE api_keys SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL", (now, str(key_id)))
    return result.rowcount > 0

def api_key_verify(raw_key):
    if not raw_key: return False
    digest = hashlib.sha256(str(raw_key).encode()).hexdigest()
    with api_key_connection() as db:
        row = db.execute("SELECT id FROM api_keys WHERE key_hash = ? AND revoked_at IS NULL", (digest,)).fetchone()
    return row is not None

def memory_delete(memory_id):
    with memory_connection() as db:
        result = db.execute("DELETE FROM memories WHERE id = ?", (str(memory_id),))
        return result.rowcount > 0


def response(ok, **payload):
    return {"ok": ok, **payload}


def workspace_list(limit=25):
    items = []
    for path in sorted(ROOT.iterdir(), key=lambda p: p.name.lower()):
        if path.name.startswith(".") or path.name in {"node_modules", ".next"}:
            continue
        items.append({"name": path.name, "kind": "directory" if path.is_dir() else "file"})
        if len(items) >= min(max(int(limit), 1), 100):
            break
    return items


def main(request):
    tool = request.get("tool")
    args = request.get("args") or {}
    if tool == "system_snapshot":
        return response(True, tool=tool, snapshot={
            "python": platform.python_version(),
            "platform": platform.platform(),
            "cwd": str(ROOT),
            "utc": datetime.now(timezone.utc).isoformat(),
        })
    if tool == "workspace_list":
        return response(True, tool=tool, items=workspace_list(args.get("limit", 25)))
    if tool == "text_stats":
        text = str(args.get("text", ""))
        return response(True, tool=tool, stats={"characters": len(text), "words": len(text.split()), "lines": len(text.splitlines())})
    if tool == "memory_store":
        return response(True, tool=tool, memory=memory_store(args.get("content", ""), args.get("category", "semantic"), args.get("importance", 3)))
    if tool == "memory_search":
        return response(True, tool=tool, memories=memory_search(args.get("query", ""), args.get("limit", 10)))
    if tool == "memory_list":
        return response(True, tool=tool, memories=memory_list(args.get("limit", 25)))
    if tool == "memory_delete":
        return response(True, tool=tool, deleted=memory_delete(args.get("id", "")))
    if tool == "api_key_create":
        return response(True, tool=tool, api_key=api_key_create(args.get("label", "Jaslyn client")))
    if tool == "api_key_list":
        return response(True, tool=tool, api_keys=api_key_list())
    if tool == "api_key_revoke":
        return response(True, tool=tool, revoked=api_key_revoke(args.get("id", "")))
    if tool == "api_key_verify":
        return response(True, tool=tool, valid=api_key_verify(args.get("key", "")))
    if tool == "detect_language":
        return response(True, tool=tool, detection=detect_code_language(args.get("source", ""), args.get("filename", "")))
    if tool == "create_language":
        return response(True, tool=tool, language=create_language(args.get("name", "Jaslyn Language"), args.get("description", "A language designed with Jaslyn"), args.get("keywords"), ROOT / "data" / "languages"))
    if tool == "run_jaslang":
        return response(True, tool=tool, result=run_jaslang(str(args.get("source", "")), int(args.get("max_steps", 10000))))
    return response(False, error=f"Python tool '{tool}' is not registered")


if __name__ == "__main__":
    try:
        request = json.loads(sys.stdin.read() or "{}")
        print(json.dumps(main(request), separators=(",", ":")))
    except Exception as exc:
        print(json.dumps(response(False, error=str(exc)), separators=(",", ":")))
        sys.exit(1)
