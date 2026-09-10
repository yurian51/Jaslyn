import { BenchmarkRuntime } from "./runtime.mjs";
import { createSelfHostedProvider } from "./self-hosted-provider.mjs";
import { JsonMemory } from "./memory.mjs";

export function createJaslynBenchmarkRuntime(options = {}) {
  const memory = options.memory || new JsonMemory();
  const models = options.models || String(process.env.JASLYN_MODELS || process.env.JASLYN_MODEL || "jaslyn").split(",").map((x) => x.trim()).filter(Boolean);
  const providers = models.map((model, index) => createSelfHostedProvider({
    ...(options.provider || {}),
    id: models.length === 1 ? (options.provider?.id || "jaslyn-local") : `jaslyn-local-${index + 1}`,
    model,
  }));
  const tools = options.tools || createBuiltinTools(memory);
  return new BenchmarkRuntime({ providers, tools, policy: options.policy || {}, maxIterations: options.maxIterations || 8, memory });
}

function createBuiltinTools(memory) {
  return [
    { name: "clock.now", description: "Return the current ISO timestamp.", execute: async () => new Date().toISOString() },
    { name: "echo", description: "Return the supplied JSON input unchanged.", execute: async (input) => input },
    { name: "memory.search", description: "Search Jaslyn's persistent episodic memory.", inputSchema: { type: "object", properties: { query: { type: "string" }, limit: { type: "number" } }, required: ["query"] }, execute: async (input) => memory.search(input?.query || "", { limit: Number(input?.limit) || 8 }) },
    { name: "memory.remember", description: "Persist a useful fact or completed outcome to Jaslyn's episodic memory.", inputSchema: { type: "object", properties: { content: { type: "string" }, metadata: { type: "object" } }, required: ["content"] }, execute: async (input) => memory.remember({ namespace: "episodic", content: input?.content || "", metadata: input?.metadata || {} }) },
  ];
}

export { BenchmarkRuntime } from "./runtime.mjs";
export { ProviderRegistry } from "./provider-registry.mjs";
export { ConcurrentEngine } from "./concurrent-engine.mjs";
export { JsonMemory } from "./memory.mjs";
export { buildToolPrompt, parseToolCalls, stripToolCalls } from "./tool-protocol.mjs";
