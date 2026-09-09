import type { PlanStep } from "../types.js";

export interface PolicyDecision {
  allowed: boolean;
  requiresApproval: boolean;
  reason: string;
}

export interface PolicyEngine {
  evaluate(step: PlanStep): Promise<PolicyDecision>;
}

export class DefaultPolicyEngine implements PolicyEngine {
  async evaluate(step: PlanStep): Promise<PolicyDecision> {
    if (step.requiresApproval) {
      return { allowed: true, requiresApproval: true, reason: "Step explicitly requires approval." };
    }
    return { allowed: true, requiresApproval: false, reason: "Allowed by default policy." };
  }
}
