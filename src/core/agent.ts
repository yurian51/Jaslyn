import type { AgentGoal, ToolContext } from "../types.js";
import { Planner } from "./planner.js";
import { Executor } from "./executor.js";
import { VerificationEngine } from "./verification.js";

export class JaslynAgent {
  constructor(
    private readonly planner: Planner,
    private readonly executor: Executor,
    private readonly verifier: VerificationEngine
  ) {}

  async run(instruction: string) {
    const goal: AgentGoal = {
      id: crypto.randomUUID(),
      instruction,
      createdAt: new Date().toISOString()
    };

    const plan = await this.planner.create(goal);
    const context: ToolContext = { runId: crypto.randomUUID(), agentId: "jaslyn-core" };
    const results = await this.executor.execute(plan, context);
    const verification = this.verifier.verify(plan, results);

    return { goal, plan, results, verification };
  }
}
