import test from "node:test";
import assert from "node:assert/strict";
import { ProviderRegistry } from "../../src/benchmark/provider-registry.mjs";
import { ConcurrentEngine } from "../../src/benchmark/concurrent-engine.mjs";
import { JsonMemory } from "../../src/benchmark/memory.mjs";
import { buildToolPrompt, parseToolCalls } from "../../src/benchmark/tool-protocol.mjs";
import { BenchmarkRuntime } from "../../src/benchmark/runtime.mjs";

const provider = (id, value) => ({ id, name: id, model: id, health: async () => {}, reason: async () => ({ summary: value, proposedSteps: ["verify the result"], needsApproval: false }) });

test("provider registry registers and reports providers", async () => {
  const registry = new ProviderRegistry();
  registry.register(provider("a", "A"));
  registry.register(provider("b", "B"));
  assert.equal(registry.list().length, 2);
  assert.deepEqual((await registry.health()).map((x) => x.ok), [true, true]);
});

test("concurrent engine fans out across providers", async () => {
  const registry = new ProviderRegistry();
  registry.register(provider("a", "A"));
  registry.register(provider("b", "B"));
  const result = await new ConcurrentEngine({ registry }).run({ instruction: "test", context: {} });
  assert.equal(result.successCount, 2);
  assert.equal(result.errorCount, 0);
});

test("tool protocol is deterministic and malformed calls are ignored", () => {
  const prompt = buildToolPrompt([{ name: "echo", description: "Echo input", inputSchema: { type: "object" } }]);
  assert.match(prompt, /JASLYN TOOL PROTOCOL/);
  const calls = parseToolCalls('<jaslyn_tool_call>{"name":"echo","input":{"x":1}}</jaslyn_tool_call><jaslyn_tool_call>bad</jaslyn_tool_call>');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].name, "echo");
});

test("runtime executes an authorized tool and remembers the outcome", async () => {
  const memory = new JsonMemory("/tmp/jaslyn-benchmark-test-memory.json");
  const runtime = new BenchmarkRuntime({
    providers: [{ id: "local", model: "local", health: async () => {}, reason: async () => ({ summary: "tool executed", proposedSteps: [], needsApproval: false, toolCalls: [{ name: "echo", input: { ok: true } }] }) }],
    memory,
    tools: [{ name: "echo", description: "Echo", execute: async (input) => input }],
    maxIterations: 2,
  });
  await runtime.initialize();
  const result = await runtime.run("run a safe tool", { providerId: "local" });
  assert.equal(result.verified, true);
  assert.equal(result.outcome.completed, 1);
  assert.ok(memory.search("run a safe tool").length > 0);
});
