import type { AgentGoal, ToolContext } from "../types.js";
import { Planner } from "./planner.js";
import { Executor } from "./executor.js";
import { VerificationEngine } from "./verification.js";
import { DecisionEngine, IntentEngine, MindSelfCheck, ObjectiveEngine } from "../mind/index.js";

export class JaslynAgent {
  private readonly intent = new IntentEngine();
  private readonly objectives = new ObjectiveEngine();
  private readonly decisions = new DecisionEngine();
  private readonly selfCheck = new MindSelfCheck();

  constructor(
    private readonly planner: Planner,
    private readonly executor: Executor,
    private readonly verifier: VerificationEngine
  ) {}

  async run(instruction: string) {
    const goal: AgentGoal = { id: crypto.randomUUID(), instruction: instruction.trim(), createdAt: new Date().toISOString() };
    const mindGoal = this.intent.normalize(instruction);
    const mindObjectives = this.objectives.derive(mindGoal);
    const decision = this.decisions.decide({ goal: mindGoal, objectives: mindObjectives, constraints: [], facts: {} });
    const check = this.selfCheck.inspect({ goal: mindGoal, objectives: mindObjectives, constraints: [], facts: {} }, decision);
    if (!check.valid) throw new Error(`Mind self-check failed: ${check.issues.join("; ")}`);

    const plan = await this.planner.create(goal);
    const context: ToolContext = { runId: crypto.randomUUID(), agentId: "jaslyn-core" };
    const results = decision.requiresApproval ? [] : await this.executor.execute(plan, context);
    const verification = decision.requiresApproval
      ? { verified: false, reason: "Approval required before external side effects.", evidence: [] }
      : this.verifier.verify(plan, results);

    return { goal, mind: { objectives: mindObjectives, decision, selfCheck: check }, plan, results, verification };
  }
}
