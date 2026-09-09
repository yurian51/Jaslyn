import type { Plan } from "../types.js";
import type { ExecutionResult } from "./executor.js";

export interface VerificationReport {
  success: boolean;
  completed: number;
  failed: number;
  blocked: number;
  details: string;
}

export class VerificationEngine {
  verify(plan: Plan, results: ExecutionResult[]): VerificationReport {
    const completed = results.filter((r) => r.status === "completed").length;
    const failed = results.filter((r) => r.status === "failed").length;
    const blocked = results.filter((r) => r.status === "blocked").length;
    return {
      success: results.length === plan.steps.length && failed === 0 && blocked === 0,
      completed, failed, blocked,
      details: `${completed}/${plan.steps.length} steps completed; ${failed} failed; ${blocked} blocked.`
    };
  }
}
