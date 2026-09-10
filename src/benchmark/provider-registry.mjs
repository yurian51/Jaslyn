export class ProviderRegistry {
  #providers = new Map();

  register(provider) {
    if (!provider || typeof provider.id !== "string" || typeof provider.reason !== "function") {
      throw new TypeError("A provider requires an id and reason(request) function.");
    }
    this.#providers.set(provider.id, Object.freeze({ ...provider }));
    return this;
  }

  unregister(id) {
    return this.#providers.delete(id);
  }

  get(id) {
    return this.#providers.get(id);
  }

  list() {
    return [...this.#providers.values()].map(({ reason, ...metadata }) => metadata);
  }

  async health({ timeoutMs = 5_000 } = {}) {
    const timeout = Math.max(250, Math.min(30_000, Number(timeoutMs) || 5_000));
    const results = await Promise.all([...this.#providers.values()].map(async (provider) => {
      const started = Date.now();
      try {
        if (typeof provider.health === "function") {
          const controller = new AbortController();
          await withTimeout(Promise.resolve(provider.health({ signal: controller.signal })), timeout, controller);
        }
        return { id: provider.id, ok: true, latencyMs: Date.now() - started };
      } catch (error) {
        return { id: provider.id, ok: false, latencyMs: Date.now() - started, error: error instanceof Error ? error.message : String(error) };
      }
    }));
    return results;
  }
}

export function createProvider({ id, name = id, model = id, reason, health }) {
  return { id, name, model, reason, health };
}

function withTimeout(promise, timeoutMs, controller) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => { timer = setTimeout(() => { controller?.abort(); reject(new Error(`Provider health timeout after ${timeoutMs}ms`)); }, timeoutMs); }),
  ]).finally(() => clearTimeout(timer));
}
