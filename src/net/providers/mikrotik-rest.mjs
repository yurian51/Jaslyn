export class MikroTikRestProvider {
  constructor({ baseUrl, username, password, timeoutMs = 5000 }) {
    if (!baseUrl || !username || !password) throw new Error("MikroTik REST provider requires baseUrl, username and password");
    this.baseUrl = baseUrl.replace(/\/$/, "");
    this.auth = `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`;
    this.timeoutMs = timeoutMs;
  }

  async request(path, { method = "GET", body } = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await fetch(`${this.baseUrl}/rest/${path.replace(/^\//, "")}`, {
        method,
        headers: { Authorization: this.auth, Accept: "application/json", ...(body ? { "Content-Type": "application/json" } : {}) },
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
        cache: "no-store",
      });
      const text = await response.text();
      let data = null;
      try { data = text ? JSON.parse(text) : null; } catch { data = text; }
      if (!response.ok) throw new Error(`MikroTik REST ${response.status}: ${typeof data === "string" ? data : JSON.stringify(data)}`);
      return data;
    } finally {
      clearTimeout(timer);
    }
  }

  async health() {
    const started = Date.now();
    try {
      const resource = await this.request("system/resource");
      return { ok: true, provider: "mikrotik-rest", latencyMs: Date.now() - started, resource: Array.isArray(resource) ? resource[0] ?? null : resource };
    } catch (error) {
      return { ok: false, provider: "mikrotik-rest", latencyMs: Date.now() - started, error: error instanceof Error ? error.message : String(error) };
    }
  }

  async listHotspotActive() {
    return this.request("ip/hotspot/active");
  }

  async disconnectHotspotSession(id) {
    if (!id) throw new Error("HotSpot active session id is required");
    return this.request("ip/hotspot/active/remove", { method: "POST", body: { ".id": id } });
  }

  async listInterfaces() {
    return this.request("interface");
  }
}
