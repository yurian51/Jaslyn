export class ConcurrentEngine {
  constructor({ registry, concurrency = 6, timeoutMs = 45_000 } = {}) {
    if (!registry) throw new TypeError("ConcurrentEngine requires a provider registry.");
    this.registry = registry;
    this.concurrency = Math.max(1, Number(concurrency) || 1);
    this.timeoutMs = Math.max(1_000, Number(timeoutMs) || 45_000);
  }

  async run(request, providerIds = []) {
    const ids = providerIds.length ? providerIds : this.registry.list().map((p) => p.id);
    const queue = [...ids];
    const results = [];
    const worker = async () => {
      while (queue.length) {
        const id = queue.shift();
        const provider = this.registry.get(id);
        if (!provider) {
          results.push({ provider: id, ok: false, error: "Provider not found" });
          continue;
        }
        const started = Date.now();
        try {
          const value = await withTimeout(Promise.resolve(provider.reason(request)), this.timeoutMs);
          results.push({ provider: id, model: provider.model, ok: true, latencyMs: Date.now() - started, result: value });
        } catch (error) {
          results.push({ provider: id, model: provider.model, ok: false, latencyMs: Date.now() - started, error: error instanceof Error ? error.message : String(error) });
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(this.concurrency, queue.length || 1) }, worker));
    return {
      request,
      results: results.sort((a, b) => a.provider.localeCompare(b.provider)),
      successCount: results.filter((r) => r.ok).length,
      errorCount: results.filter((r) => !r.ok).length,
    };
  }
}

function withTimeout(promise, timeoutMs) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(`Provider timeout after ${timeoutMs}ms`)), timeoutMs)),
  ]);
}
