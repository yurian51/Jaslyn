import json
import os
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

MODEL_NAME = os.getenv("JASLYN_MODEL", "jaslyn")
HOST = os.getenv("HOST", "0.0.0.0")
PORT = int(os.getenv("PORT", "8000"))

class Handler(BaseHTTPRequestHandler):
    def _send(self, status, payload):
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path == "/health":
            return self._send(200, {"status": "ok", "model": MODEL_NAME, "inference": "not_loaded"})
        if self.path == "/v1/models":
            return self._send(200, {"object": "list", "data": [{"id": MODEL_NAME, "object": "model", "owned_by": "jaslyn"}]})
        return self._send(404, {"error": "not_found"})

    def do_POST(self):
        if self.path != "/v1/chat/completions":
            return self._send(404, {"error": "not_found"})
        length = int(self.headers.get("Content-Length", "0"))
        if length > 2 * 1024 * 1024:
            return self._send(413, {"error": "request_too_large"})
        try:
            payload = json.loads(self.rfile.read(length) or b"{}")
            messages = payload.get("messages") or []
            user = next((m.get("content", "") for m in reversed(messages) if m.get("role") == "user"), "")
            return self._send(503, {"error": {"message": "Jaslyn inference model is not loaded yet.", "type": "model_unavailable", "model": MODEL_NAME, "received": bool(user)}})
        except Exception:
            return self._send(400, {"error": "invalid_json"})

    def log_message(self, format, *args):
        print(format % args, flush=True)

if __name__ == "__main__":
    print(f"Jaslyn inference service listening on {HOST}:{PORT}", flush=True)
    ThreadingHTTPServer((HOST, PORT), Handler).serve_forever()
