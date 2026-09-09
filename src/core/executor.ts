import type { Plan, ToolContext } from "../types.js";
import { ToolRegistry } from "./tool-registry.js";
import type { PolicyEngine } from "./policy.js";

export interface ExecutionResult {
  stepId: string;
  status: "completed" | "failed" | "blocked";
  output?: unknown;
  error?: string;
}

export class Executor {
  constructor(private readonly tools: ToolRegistry, private readonly policy: PolicyEngine) {}

  async execute(plan: Plan, context: ToolContext): Promise<ExecutionResult[]> {
    const results: ExecutionResult[] = [];

    for (const step of plan.steps) {
      const decision = await this.policy.evaluate(step);
      if (!decision.allowed || decision.requiresApproval) {
        results.push({ stepId: step.id, status: "blocked", error: decision.reason });
        continue;
      }

      if (!step.tool) {
        results.push({ stepId: step.id, status: "completed", output: { description: step.description } });
        continue;
      }

      try {
        const output = await this.tools.get(step.tool).execute(step.input ?? {}, context);
        results.push({ stepId: step.id, status: "completed", output });
      } catch (error) {
        results.push({
          stepId: step.id,
          status: "failed",
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }
    return results;
  }
}
