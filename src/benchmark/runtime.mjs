import { ProviderRegistry } from "./provider-registry.mjs";
import { JsonMemory } from "./memory.mjs";
import { ConcurrentEngine } from "./concurrent-engine.mjs";
import { buildToolPrompt, parseToolCalls } from "./tool-protocol.mjs";

export class BenchmarkRuntime {
  constructor({ providers = [], tools = [], memory = new JsonMemory(), policy = {}, maxIterations = 8 } = {}) {
    this.registry = new ProviderRegistry();
    for (const provider of providers) this.registry.register(provider);
    this.tools = new Map(tools.map((tool) => [tool.name, tool]));
    this.memory = memory;
    this.policy = { approvalRequired: new Set(policy.approvalRequired || []), deny: new Set(policy.deny || []) };
    this.maxIterations = Math.max(1, Math.min(32, Number(maxIterations) || 8));
    this.events = [];
  }

  async initialize() {
    await this.memory.load();
    return this;
  }

  async run(instruction, { providerId, fanout = false, context = {}, approve = false } = {}) {
    const goal = { id: crypto.randomUUID(), instruction: String(instruction || "").trim(), createdAt: new Date().toISOString() };
    if (!goal.instruction) throw new Error("Jaslyn requires a non-empty goal.");
    this.#emit("goal.created", { goalId: goal.id, instruction: goal.instruction });

    const memories = this.memory.search(goal.instruction, { namespace: "episodic", limit: 8 });
    const toolPrompt = buildToolPrompt([...this.tools.values()]);
    const request = { instruction: goal.instruction, context: { ...context, memories, toolProtocol: toolPrompt } };

    if (fanout) {
      const comparison = await new ConcurrentEngine({ registry: this.registry }).run(request);
      this.#emit("reasoning.fanout", { providers: comparison.results.length, successCount: comparison.successCount });
      await this.memory.remember({ namespace: "episodic", content: goal.instruction, metadata: { mode: "fanout", successCount: comparison.successCount } });
      return { goal, mode: "fanout", comparison, events: this.events.slice() };
    }

    const provider = this.#selectProvider(providerId);
    let currentContext = request.context;
    const steps = [];
    const toolResults = [];
    const executedCallKeys = new Set();
    let finalReasoning = null;

    for (let iteration = 1; iteration <= this.maxIterations; iteration++) {
      this.#emit("reasoning.started", { goalId: goal.id, iteration, provider: provider.id });
      const reasoning = await provider.reason({ instruction: goal.instruction, context: currentContext });
      finalReasoning = normalizeReasoning(reasoning);
      steps.push(...finalReasoning.proposedSteps.map((description) => ({ id: crypto.randomUUID(), description, iteration })));
      this.#emit("reasoning.completed", { goalId: goal.id, iteration, needsApproval: finalReasoning.needsApproval });

      if (finalReasoning.needsApproval && !approve && !(finalReasoning.toolCalls?.length || parseToolCalls(finalReasoning.raw || "").length)) {
        toolResults.push({ id: crypto.randomUUID(), tool: "approval", ok: false, blocked: true, error: finalReasoning.approvalReason || "Approval required" });
        this.#emit("run.blocked", { goalId: goal.id, reason: finalReasoning.approvalReason || "Approval required" });
        break;
      }

      const calls = dedupeCalls([...(finalReasoning.toolCalls || []), ...parseToolCalls(finalReasoning.raw || "")]);
      const newCalls = calls.filter((call) => {
        const key = `${call.name}:${JSON.stringify(call.input || {})}`;
        if (executedCallKeys.has(key)) return false;
        executedCallKeys.add(key);
        return true;
      });
      if (!newCalls.length) break;

      for (const call of newCalls) {
        const tool = this.tools.get(call.name);
        if (!tool) {
          toolResults.push({ id: call.id, tool: call.name, ok: false, error: "Unknown tool" });
          continue;
        }
        const denied = this.policy.deny.has(call.name);
        const requiresApproval = this.policy.approvalRequired.has(call.name) || tool.requiresApproval === true;
        if (denied || (requiresApproval && !approve)) {
          const result = { id: call.id, tool: call.name, ok: false, blocked: true, error: denied ? "Tool denied by policy" : "Approval required" };
          toolResults.push(result);
          this.#emit("tool.blocked", result);
          continue;
        }
        try {
          const value = await tool.execute(call.input, { runId: goal.id, agentId: "jaslyn", iteration });
          const result = { id: call.id, tool: call.name, ok: true, output: value };
          toolResults.push(result);
          this.#emit("tool.completed", { id: call.id, tool: call.name });
        } catch (error) {
          const result = { id: call.id, tool: call.name, ok: false, error: error instanceof Error ? error.message : String(error) };
          toolResults.push(result);
          this.#emit("tool.failed", result);
        }
        currentContext = { ...currentContext, toolResults: toolResults.slice(-12) };
      }
    }

    const verified = verifyOutcome(finalReasoning, toolResults, steps);
    const outcome = { verified, completed: toolResults.filter((r) => r.ok).length, failed: toolResults.filter((r) => !r.ok && !r.blocked).length, blocked: toolResults.filter((r) => r.blocked).length };
    await this.memory.remember({ namespace: "episodic", content: goal.instruction, metadata: { provider: provider.id, verified, outcome, steps: steps.length } });
    this.#emit("run.verified", { goalId: goal.id, ...outcome });
    return { goal, provider: provider.id, reasoning: finalReasoning, steps, toolResults, outcome, verified, events: this.events.slice() };
  }

  async health() {
    return this.registry.health();
  }

  #selectProvider(id) {
    const provider = id ? this.registry.get(id) : this.registry.get(this.registry.list()[0]?.id);
    if (!provider) throw new Error("No Jaslyn provider is registered.");
    return provider;
  }

  #emit(type, data) {
    this.events.push({ id: crypto.randomUUID(), type, timestamp: new Date().toISOString(), data });
    if (this.events.length > 500) this.events.shift();
  }
}

function normalizeReasoning(value) {
  if (!value || typeof value !== "object") return { summary: String(value || ""), proposedSteps: [], needsApproval: false, approvalReason: "", toolCalls: [], raw: String(value || "") };
  return { summary: String(value.summary || value.content || ""), proposedSteps: Array.isArray(value.proposedSteps) ? value.proposedSteps.map(String) : [], intent: String(value.intent || ""), decision: String(value.decision || ""), needsApproval: Boolean(value.needsApproval), approvalReason: String(value.approvalReason || ""), toolCalls: Array.isArray(value.toolCalls) ? value.toolCalls : [], raw: typeof value.raw === "string" ? value.raw : "" };
}

function dedupeCalls(calls) {
  const seen = new Set();
  return calls.filter((call) => {
    const key = `${call.name}:${JSON.stringify(call.input || {})}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function verifyOutcome(reasoning, toolResults, steps) {
  if (!reasoning) return false;
  if (reasoning.needsApproval && toolResults.some((r) => r.blocked)) return false;
  if (toolResults.some((r) => !r.ok && !r.blocked)) return false;
  return Boolean(reasoning.summary || reasoning.decision || steps.length);
}
