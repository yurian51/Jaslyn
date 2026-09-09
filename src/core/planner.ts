import type { AgentGoal, Plan, PlanStep, LLMProvider } from "../types.js";

export class Planner {
  constructor(private readonly provider: LLMProvider) {}

  async create(goal: AgentGoal): Promise<Plan> {
    const reasoning = await this.provider.reason({
      instruction: goal.instruction,
      context: goal.metadata ?? {}
    });

    const steps: PlanStep[] = reasoning.proposedSteps.map((description, index) => ({
      id: `step-${index + 1}`,
      description,
      requiresApproval: false
    }));

    return { id: crypto.randomUUID(), goalId: goal.id, steps, createdAt: new Date().toISOString() };
  }
}
