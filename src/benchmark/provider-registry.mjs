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

  async health() {
    const results = await Promise.all([...this.#providers.values()].map(async (provider) => {
      const started = Date.now();
      try {
        if (typeof provider.health === "function") await provider.health();
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
