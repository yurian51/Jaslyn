import { normalizeProviderCapabilities } from "./contract.mjs";

function asList(value) {
  if (Array.isArray(value)) return value;
  return value == null ? [] : [value];
}

export class OmadaOpenApiProvider {
  constructor({ baseUrl, omadacId, clientId, clientSecret, timeoutMs = 7000, tokenGrantType = "client_credentials" }) {
    if (!baseUrl || !omadacId || !clientId || !clientSecret) throw new Error("Omada Open API provider requires baseUrl, omadacId, clientId and clientSecret");
    this.name = "omada-openapi";
    this.baseUrl = baseUrl.replace(/\/$/, "");
    this.omadacId = String(omadacId);
    this.clientId = String(clientId);
    this.clientSecret = String(clientSecret);
    this.timeoutMs = timeoutMs;
    this.tokenGrantType = tokenGrantType;
    this.accessToken = null;
    this.tokenExpiresAt = 0;
  }

  getCapabilities() {
    return normalizeProviderCapabilities({
      health: true,
      identity: true,
      devices: true,
      interfaces: false,
      metrics: true,
      clients: false,
      sessions: false,
      hotspot: false,
      pppoe: false,
      disconnect: false,
      policy: false,
      configuration: false,
      backup: false,
      firmware: false,
      reconcile: false,
    });
  }

  async rawRequest(path, { method = "GET", body, authorization = null } = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await fetch(`${this.baseUrl}${path}`, {
        method,
        headers: {
          Accept: "application/json",
          ...(body ? { "Content-Type": "application/json" } : {}),
          ...(authorization ? { Authorization: authorization } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
        cache: "no-store",
      });
      const text = await response.text();
      let data = null;
      try { data = text ? JSON.parse(text) : null; } catch { data = text; }
      if (!response.ok) throw new Error(`Omada Open API HTTP ${response.status}`);
      if (data && typeof data === "object" && data.errorCode != null && Number(data.errorCode) !== 0) {
        throw new Error(`Omada Open API error ${data.errorCode}: ${data.msg ?? "request rejected"}`);
      }
      return data;
    } finally {
      clearTimeout(timer);
    }
  }

  async authenticate(force = false) {
    if (!force && this.accessToken && Date.now() < this.tokenExpiresAt - 60_000) return this.accessToken;
    const response = await this.rawRequest(`/openapi/authorize/token?grant_type=${encodeURIComponent(this.tokenGrantType)}`, {
      method: "POST",
      body: { client_id: this.clientId, client_secret: this.clientSecret },
    });
    const token = response?.result?.accessToken;
    if (!token) throw new Error("Omada Open API did not return an access token");
    const expiresIn = Number(response?.result?.expiresIn ?? 7200);
    this.accessToken = String(token);
    this.tokenExpiresAt = Date.now() + (Number.isFinite(expiresIn) && expiresIn > 0 ? expiresIn * 1000 : 7200 * 1000);
    return this.accessToken;
  }

  async request(path, options = {}, retry = true) {
    const token = await this.authenticate();
    try {
      return await this.rawRequest(path, { ...options, authorization: `AccessToken=${token}` });
    } catch (error) {
      if (retry && /401|token|auth/i.test(error instanceof Error ? error.message : String(error))) {
        await this.authenticate(true);
        return this.request(path, options, false);
      }
      throw error;
    }
  }

  async getIdentity() {
    return this.rawRequest("/api/info");
  }

  async getSites() {
    const response = await this.request(`/openapi/v1/${encodeURIComponent(this.omadacId)}/sites?page=1&pageSize=100`);
    return asList(response?.result?.data).map((site) => ({ id: String(site.siteId ?? site.id), name: site.name ?? null, raw: site }));
  }

  async getDevices(siteId) {
    if (!siteId) throw new Error("Omada siteId is required for device discovery");
    const response = await this.request(`/openapi/v1/${encodeURIComponent(this.omadacId)}/sites/${encodeURIComponent(siteId)}/devices?page=1&pageSize=100`);
    return asList(response?.result?.data).map((device) => ({
      provider: this.name,
      siteId: String(siteId),
      id: device.mac ?? device.id ?? null,
      type: device.type ?? null,
      name: device.name ?? null,
      ip: device.ip ?? null,
      model: device.model ?? null,
      firmwareVersion: device.firmwareVersion ?? null,
      status: device.status ?? null,
      cpuUtil: device.cpuUtil ?? null,
      memUtil: device.memUtil ?? null,
      uptime: device.uptime ?? null,
      lastSeen: device.lastSeen ?? null,
      raw: device,
    }));
  }

  async getAllDevices() {
    const sites = await this.getSites();
    const devices = [];
    for (const site of sites) devices.push(...await this.getDevices(site.id));
    return devices;
  }

  async getMetrics() {
    const sites = await this.getSites();
    if (!sites.length) return { provider: this.name, sites: [], statistics: null };
    const response = await this.request(`/openapi/v1/${encodeURIComponent(this.omadacId)}/sites/statistic`, {
      method: "POST",
      body: { omadaAndSiteIds: sites.map((site) => ({ omadacId: this.omadacId, siteId: site.id })) },
    });
    return { provider: this.name, sites, statistics: response?.result ?? null };
  }

  async health() {
    const started = Date.now();
    try {
      const identity = await this.getIdentity();
      const sites = await this.getSites();
      return { ok: true, provider: this.name, latencyMs: Date.now() - started, controller: identity?.result ?? identity, siteCount: sites.length };
    } catch (error) {
      return { ok: false, provider: this.name, latencyMs: Date.now() - started, error: error instanceof Error ? error.message : String(error) };
    }
  }
}
