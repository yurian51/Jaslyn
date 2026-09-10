import { BenchmarkRuntime } from "./runtime.mjs";
import { createSelfHostedProvider } from "./self-hosted-provider.mjs";

export function createJaslynBenchmarkRuntime(options = {}) {
  const provider = createSelfHostedProvider(options.provider || {});
  return new BenchmarkRuntime({
    providers: [provider],
    tools: options.tools || [],
    policy: options.policy || {},
    maxIterations: options.maxIterations || 8,
    memory: options.memory,
  });
}

export { BenchmarkRuntime } from "./runtime.mjs";
export { ProviderRegistry } from "./provider-registry.mjs";
export { ConcurrentEngine } from "./concurrent-engine.mjs";
export { JsonMemory } from "./memory.mjs";
export { buildToolPrompt, parseToolCalls, stripToolCalls } from "./tool-protocol.mjs";
