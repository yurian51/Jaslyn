import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { ProviderRegistry } from "../../src/benchmark/provider-registry.mjs";
import { ConcurrentEngine } from "../../src/benchmark/concurrent-engine.mjs";
import { JsonMemory } from "../../src/benchmark/memory.mjs";
import { JsonRunStore } from "../../src/benchmark/run-store.mjs";
import { JsonApprovalStore } from "../../src/benchmark/approval-store.mjs";
import { buildToolPrompt, parseToolCalls } from "../../src/benchmark/tool-protocol.mjs";
import { BenchmarkRuntime } from "../../src/benchmark/runtime.mjs";

const provider = (id, value) => ({ id, name: id, model: id, health: async () => {}, reason: async () => ({ summary: value, proposedSteps: ["verify the result"], needsApproval: false }) });

async function tempRuntime(options = {}) {
  const dir = await mkdtemp(join(os.tmpdir(), "jaslyn-runtime-"));
  const runtime = new BenchmarkRuntime({ memory: new JsonMemory(join(dir, "memory.json")), runStore: new JsonRunStore(join(dir, "runs.json")), approvalStore: new JsonApprovalStore(join(dir, "approvals.json")), ...options });
  await runtime.initialize();
  return { dir, runtime };
}

test("provider registry registers and reports providers", async () => {
  const registry = new ProviderRegistry();
  registry.register(provider("a", "A")); registry.register(provider("b", "B"));
  assert.equal(registry.list().length, 2);
  assert.deepEqual((await registry.health()).map((x) => x.ok), [true, true]);
});

test("concurrent engine fans out across providers", async () => {
  const registry = new ProviderRegistry(); registry.register(provider("a", "A")); registry.register(provider("b", "B"));
  const result = await new ConcurrentEngine({ registry }).run({ instruction: "test", context: {} });
  assert.equal(result.successCount, 2); assert.equal(result.errorCount, 0);
});

test("tool protocol is deterministic and malformed calls are ignored", () => {
  const prompt = buildToolPrompt([{ name: "echo", description: "Echo input", inputSchema: { type: "object" } }]);
  assert.match(prompt, /JASLYN TOOL PROTOCOL/);
  const calls = parseToolCalls('<jaslyn_tool_call>{"name":"echo","input":{"x":1}}</jaslyn_tool_call><jaslyn_tool_call>bad</jaslyn_tool_call>');
  assert.equal(calls.length, 1); assert.equal(calls[0].name, "echo");
});

test("runtime executes an authorized tool and persists an auditable run", async () => {
  const { dir, runtime } = await tempRuntime({
    providers: [{ id: "local", model: "local", health: async () => {}, reason: async () => ({ summary: "tool executed", proposedSteps: [], needsApproval: false, toolCalls: [{ name: "echo", input: { ok: true } }] }) }],
    tools: [{ name: "echo", description: "Echo", execute: async (input) => input }], maxIterations: 2,
  });
  try {
    const result = await runtime.run("run a safe tool", { providerId: "local" });
    assert.equal(result.verified, true); assert.equal(result.outcome.completed, 1);
    assert.equal(runtime.history({ limit: 1 })[0].id, result.goal.id);
    assert.equal(runtime.getRun(result.goal.id).id, result.goal.id);
    const persisted = JSON.parse(await readFile(join(dir, "runs.json"), "utf8")); assert.equal(persisted.length, 1);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test("runtime creates a durable exact-action approval and executes only that stored input", async () => {
  const executed = [];
  const { dir, runtime } = await tempRuntime({
    providers: [{ id: "local", model: "local", health: async () => {}, reason: async () => ({ summary: "approval needed", proposedSteps: [], needsApproval: false, toolCalls: [{ name: "write", input: { path: "safe.txt", content: "approved-content" } }] }) }],
    tools: [{ name: "write", description: "Write file", requiresApproval: true, execute: async (input) => { executed.push(input); return "written"; } }],
  });
  try {
    const blocked = await runtime.run("write a file", { providerId: "local" });
    assert.equal(blocked.outcome.blocked, 1);
    assert.equal(blocked.approvals.length, 1);
    const approvalId = blocked.approvals[0].id;
    const approval = await runtime.approvalStore.decide(approvalId, "approved");
    assert.equal(approval.input.content, "approved-content");
    const execution = await runtime.executeApprovedApproval(approvalId);
    assert.equal(execution.ok, true);
    assert.deepEqual(executed, [{ path: "safe.txt", content: "approved-content" }]);
    await assert.rejects(() => runtime.executeApprovedApproval(approvalId), /consumed|not approved/i);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test("runtime cannot bypass a protected tool with a generic approve flag", async () => {
  let calls = 0;
  const { dir, runtime } = await tempRuntime({
    providers: [{ id: "local", model: "local", health: async () => {}, reason: async () => ({ summary: "approval needed", proposedSteps: [], needsApproval: false, toolCalls: [{ name: "danger", input: { action: "delete" } }] }) }],
    tools: [{ name: "danger", description: "Protected operation", requiresApproval: true, execute: async () => { calls += 1; return "should not run"; } }],
  });
  try {
    const result = await runtime.run("protected operation", { providerId: "local", approve: true });
    assert.equal(calls, 0);
    assert.equal(result.outcome.blocked, 1);
    assert.equal(result.approvals.length, 1);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test("runtime blocks approval-required tools without approval", async () => {
  const { dir, runtime } = await tempRuntime({
    providers: [{ id: "local", model: "local", health: async () => {}, reason: async () => ({ summary: "approval needed", proposedSteps: [], needsApproval: false, toolCalls: [{ name: "danger", input: {} }] }) }],
    tools: [{ name: "danger", description: "Protected operation", requiresApproval: true, execute: async () => "should not run" }],
  });
  try { const result = await runtime.run("protected operation", { providerId: "local" }); assert.equal(result.outcome.blocked, 1); assert.equal(result.outcome.completed, 0); assert.equal(result.verified, false); }
  finally { await rm(dir, { recursive: true, force: true }); }
});

test("runtime suppresses duplicate tool side effects within one run", async () => {
  let calls = 0;
  const { dir, runtime } = await tempRuntime({
    providers: [{ id: "local", model: "local", health: async () => {}, reason: async () => ({ summary: "done", proposedSteps: [], needsApproval: false, toolCalls: [{ name: "counter", input: { key: "same" } }] }) }],
    tools: [{ name: "counter", description: "Count once", execute: async () => { calls += 1; return calls; } }], maxIterations: 5,
  });
  try { const result = await runtime.run("avoid repeated side effects", { providerId: "local" }); assert.equal(calls, 1); assert.equal(result.outcome.completed, 1); }
  finally { await rm(dir, { recursive: true, force: true }); }
});

test("runtime marks timed-out tools as failed and persists the result", async () => {
  const { dir, runtime } = await tempRuntime({
    providers: [{ id: "local", model: "local", health: async () => {}, reason: async () => ({ summary: "attempted", proposedSteps: [], needsApproval: false, toolCalls: [{ name: "slow", input: {} }] }) }],
    tools: [{ name: "slow", description: "Slow operation", execute: async () => new Promise((resolve) => setTimeout(() => resolve("late"), 500)) }],
    toolTimeoutMs: 250, maxIterations: 1,
  });
  try { const result = await runtime.run("run timeout test", { providerId: "local" }); assert.equal(result.status, "failed"); assert.equal(result.outcome.failed, 1); assert.equal(runtime.getRun(result.goal.id).status, "failed"); }
  finally { await rm(dir, { recursive: true, force: true }); }
});

test("run history is bounded by requested list limit", async () => {
  const { dir, runtime } = await tempRuntime({ providers: [provider("local", "complete")] });
  try { for (let i = 0; i < 3; i++) await runtime.run(`history ${i}`, { providerId: "local" }); assert.equal(runtime.history({ limit: 2 }).length, 2); }
  finally { await rm(dir, { recursive: true, force: true }); }
});
