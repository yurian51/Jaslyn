const DEFAULT_TIMEOUT_MS = 10_000;

function assertNonEmptyString(value, field) {
  const normalized = String(value ?? "").trim();
  if (!normalized) throw new TypeError(`${field} is required`);
  return normalized;
}

function normalizeBaseUrl(value) {
  const raw = assertNonEmptyString(value, "baseUrl").replace(/\/+$/, "");
  const url = new URL(raw);
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new TypeError("baseUrl must use http or https");
  return `${url.origin}${url.pathname.replace(/\/+$/, "")}`;
}

function encodeBasicAuth(username, password) {
  return `Basic ${Buffer.from(`${username}:${password}`, "utf8").toString("base64")}`;
}

function assertIpClient(client) {
  if (!client?.ipAddress) throw new TypeError("MikroTik bandwidth enforcement requires client.ipAddress");
  return client.ipAddress;
}

function toRateLimitKbps(kbps, field) {
  if (kbps == null) return "0";
  if (!Number.isSafeInteger(kbps) || kbps <= 0) throw new TypeError(`${field} must be a positive integer`);
  return `${kbps}k`;
}

function queueNameForIp(ipAddress) {
  return `jaslyn-${ipAddress.replace(/[^0-9a-f:.]/gi, "-").replace(/:+/g, "-")}`.slice(0, 63);
}

function parseJsonText(text) {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    throw Object.assign(new Error("RouterOS returned invalid JSON"), { code: "INVALID_ROUTER_RESPONSE" });
  }
}

export function createMikrotikRestAdapter({
  baseUrl,
  username,
  password,
  fetchImpl = globalThis.fetch,
  timeoutMs = DEFAULT_TIMEOUT_MS
} = {}) {
  const normalizedBaseUrl = normalizeBaseUrl(baseUrl);
  const normalizedUsername = assertNonEmptyString(username, "username");
  if (password == null) throw new TypeError("password is required");
  if (typeof fetchImpl !== "function") throw new TypeError("fetchImpl must be a function");
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0) throw new TypeError("timeoutMs must be a positive integer");

  async function request(path, { method = "GET", body } = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(`${normalizedBaseUrl}/rest/${path.replace(/^\/+/, "")}`, {
        method,
        headers: {
          accept: "application/json",
          authorization: encodeBasicAuth(normalizedUsername, password),
          ...(body === undefined ? {} : { "content-type": "application/json" })
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: controller.signal
      });
      const text = await response.text();
      const data = parseJsonText(text);
      if (!response.ok) {
        throw Object.assign(new Error(`RouterOS request failed with HTTP ${response.status}`), {
          code: `HTTP_${response.status}`,
          status: response.status
        });
      }
      return data;
    } catch (error) {
      if (error?.name === "AbortError") {
        throw Object.assign(new Error("RouterOS request timed out"), { code: "TIMEOUT" });
      }
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }

  return Object.freeze({
    async health() {
      try {
        const resource = await request("system/resource");
        return { ok: true, status: "online", version: resource?.[0]?.version ?? null };
      } catch (error) {
        return { ok: false, status: "offline", code: error?.code ?? "NETWORK_ERROR" };
      }
    },

    async enforcePolicy({ client, policy }) {
      const ipAddress = assertIpClient(client);
      const queueName = queueNameForIp(ipAddress);
      const upload = toRateLimitKbps(policy?.bandwidth?.uploadKbps, "uploadKbps");
      const download = toRateLimitKbps(policy?.bandwidth?.downloadKbps, "downloadKbps");
      if (upload === "0" && download === "0") throw Object.assign(new Error("A bandwidth policy must define uploadKbps or downloadKbps"), { code: "BANDWIDTH_POLICY_EMPTY" });

      const queue = {
        name: queueName,
        target: `${ipAddress}/32`,
        "max-limit": `${upload}/${download}`,
        comment: `Jaslyn Net ${policy.planId}`
      };
      const existing = await request(`queue/simple?name=${encodeURIComponent(queueName)}`);
      if (Array.isArray(existing) && existing.length > 0 && existing[0]?.[".id"]) {
        const id = encodeURIComponent(existing[0][".id"]);
        const updated = await request(`queue/simple/${id}`, { method: "PATCH", body: queue });
        return { ok: true, action: "updated", remotePolicyId: existing[0][".id"], response: updated ?? null };
      }

      const created = await request("queue/simple", { method: "PUT", body: queue });
      return { ok: true, action: "created", remotePolicyId: created?.[".id"] ?? null, response: created ?? null };
    }
  });
}
