import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ProviderRegistry } from "../../src/benchmark/provider-registry.mjs";
import { ConcurrentEngine } from "../../src/benchmark/concurrent-engine.mjs";
import { JsonMemory } from "../../src/benchmark/memory.mjs";
import { JsonRunStore } from "../../src/benchmark/run-store.mjs";
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
  const dir = await mkdtemp(join(tmpdir(), "jaslyn-runtime-"));
  const memory = new JsonMemory(join(dir, "memory.json"));
  const runStore = new JsonRunStore(join(dir, "runs.json"));
  try {
    const runtime = new BenchmarkRuntime({
      providers: [{ id: "local", model: "local", health: async () => {}, reason: async () => ({ summary: "tool executed", proposedSteps: [], needsApproval: false, toolCalls: [{ name: "echo", input: { ok: true } }] }) }],
      memory,
      runStore,
      tools: [{ name: "echo", description: "Echo", execute: async (input) => input }],
      maxIterations: 2,
    });
    await runtime.initialize();
    const result = await runtime.run("run a safe tool", { providerId: "local" });
    assert.equal(result.verified, true);
    assert.equal(result.outcome.completed, 1);
    assert.equal(runtime.history({ limit: 1 })[0].id, result.goal.id);
    const persisted = JSON.parse(await readFile(join(dir, "runs.json"), "utf8"));
    assert.equal(persisted.length, 1);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("runtime blocks approval-required tools without approval", async () => {
  const memory = new JsonMemory("/tmp/jaslyn-approval-memory.json");
  const runtime = new BenchmarkRuntime({
    providers: [{ id: "local", model: "local", health: async () => {}, reason: async () => ({ summary: "approval needed", proposedSteps: [], needsApproval: false, toolCalls: [{ name: "danger", input: {} }] }) }],
    memory,
    tools: [{ name: "danger", description: "Protected operation", requiresApproval: true, execute: async () => "should not run" }],
  });
  await runtime.initialize();
  const result = await runtime.run("protected operation", { providerId: "local" });
  assert.equal(result.outcome.blocked, 1);
  assert.equal(result.outcome.completed, 0);
  assert.equal(result.verified, false);
});
