import { normalizeProviderCapabilities } from "./contract.mjs";

function asList(value) {
  if (Array.isArray(value)) return value;
  if (value == null) return [];
  return [value];
}

function first(value) {
  return asList(value)[0] ?? null;
}

function stringValue(value) {
  return value == null ? null : String(value);
}

export class MikroTikRestProvider {
  constructor({ baseUrl, username, password, timeoutMs = 5000 }) {
    if (!baseUrl || !username || !password) throw new Error("MikroTik REST provider requires baseUrl, username and password");
    this.name = "mikrotik-rest";
    this.baseUrl = baseUrl.replace(/\/$/, "");
    this.auth = `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`;
    this.timeoutMs = timeoutMs;
  }

  getCapabilities() {
    return normalizeProviderCapabilities({
      health: true,
      identity: true,
      sessions: true,
      hotspot: true,
      pppoe: true,
      clients: true,
      devices: true,
      interfaces: true,
      metrics: true,
      disconnect: true,
    });
  }

  async request(path, { method = "GET", body } = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await fetch(`${this.baseUrl}/rest/${path.replace(/^\//, "")}`, {
        method,
        headers: {
          Authorization: this.auth,
          Accept: "application/json",
          ...(body ? { "Content-Type": "application/json" } : {}),
        },
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
      const resource = first(await this.request("system/resource"));
      return { ok: true, provider: this.name, latencyMs: Date.now() - started, resource };
    } catch (error) {
      return { ok: false, provider: this.name, latencyMs: Date.now() - started, error: error instanceof Error ? error.message : String(error) };
    }
  }

  async getIdentity() {
    return first(await this.request("system/identity"));
  }

  async getResource() {
    return first(await this.request("system/resource"));
  }

  async listHotspotActive() {
    return asList(await this.request("ip/hotspot/active"));
  }

  async listPppoeActive() {
    return asList(await this.request("ppp/active"));
  }

  async listDhcpLeases() {
    return asList(await this.request("ip/dhcp-server/lease"));
  }

  async listInterfaces() {
    return asList(await this.request("interface"));
  }

  async getSessions() {
    const [hotspot, pppoe] = await Promise.all([this.listHotspotActive(), this.listPppoeActive()]);
    return {
      provider: this.name,
      hotspot: hotspot.map((row) => ({
        source: "hotspot",
        id: stringValue(row[".id"]),
        sessionId: stringValue(row[".id"]),
        username: stringValue(row.user),
        macAddress: stringValue(row["mac-address"]),
        ipAddress: stringValue(row.address),
        uptime: stringValue(row.uptime),
        bytesIn: stringValue(row["bytes-in"]),
        bytesOut: stringValue(row["bytes-out"]),
      })),
      pppoe: pppoe.map((row) => ({
        source: "pppoe",
        id: stringValue(row[".id"]),
        sessionId: stringValue(row[".id"]),
        username: stringValue(row.name),
        service: stringValue(row.service),
        callerId: stringValue(row["caller-id"]),
        address: stringValue(row.address),
        uptime: stringValue(row.uptime),
        bytesIn: stringValue(row["bytes-in"]),
        bytesOut: stringValue(row["bytes-out"]),
      })),
    };
  }

  async getClients() {
    const [hotspot, leases] = await Promise.all([this.listHotspotActive(), this.listDhcpLeases()]);
    return {
      provider: this.name,
      hotspot: hotspot.map((row) => ({
        username: stringValue(row.user),
        macAddress: stringValue(row["mac-address"]),
        ipAddress: stringValue(row.address),
        server: stringValue(row.server),
      })),
      dhcp: leases
        .filter((row) => String(row.status ?? "").toLowerCase() === "bound")
        .map((row) => ({
          macAddress: stringValue(row["mac-address"]),
          ipAddress: stringValue(row.address),
          hostname: stringValue(row["host-name"]),
          server: stringValue(row.server),
        })),
    };
  }

  async getDevices() {
    const [identity, resource] = await Promise.all([this.getIdentity(), this.getResource()]);
    return [{
      provider: this.name,
      type: "router",
      identity: stringValue(identity?.name),
      platform: stringValue(resource?.platform),
      board: stringValue(resource?.["board-name"]),
      version: stringValue(resource?.version),
      uptime: stringValue(resource?.uptime),
    }];
  }

  async getMetrics() {
    const [resource, interfaces] = await Promise.all([this.getResource(), this.listInterfaces()]);
    const activeInterfaces = interfaces.filter((row) => String(row.disabled ?? "false") !== "true");
    return {
      provider: this.name,
      resource: resource ?? null,
      interfaces: activeInterfaces.map((row) => ({
        id: stringValue(row[".id"]),
        name: stringValue(row.name),
        running: String(row.running ?? "false") === "true",
        rxBytes: stringValue(row["rx-byte"]),
        txBytes: stringValue(row["tx-byte"]),
        rxPackets: stringValue(row["rx-packet"]),
        txPackets: stringValue(row["tx-packet"]),
        rxDrops: stringValue(row["rx-drop"]),
        txDrops: stringValue(row["tx-drop"]),
        rxErrors: stringValue(row["rx-error"]),
        txErrors: stringValue(row["tx-error"]),
      })),
    };
  }

  async disconnectHotspotSession(id) {
    if (!id) throw new Error("HotSpot active session id is required");
    return this.request("ip/hotspot/active/remove", { method: "POST", body: { ".id": id } });
  }

  async disconnectPppoeSession(id) {
    if (!id) throw new Error("PPPoE active session id is required");
    return this.request("ppp/active/remove", { method: "POST", body: { ".id": id } });
  }

  async disconnect({ type, id } = {}) {
    if (type === "hotspot") return this.disconnectHotspotSession(id);
    if (type === "pppoe") return this.disconnectPppoeSession(id);
    throw new Error("Disconnect requires a supported session type: hotspot or pppoe");
  }
}
