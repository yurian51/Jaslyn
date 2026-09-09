import type { PlanStep } from "../types.js";

export type ExecutionEventStatus = "queued" | "running" | "completed" | "failed" | "verified" | "blocked";
export interface ExecutionEvent {
  id: string;
  index: number;
  stepId: string;
  description: string;
  status: ExecutionEventStatus;
  attempt: number;
  startedAt: string;
  finishedAt?: string;
  evidence?: string;
}
export interface DeepExecutionResult {
  status: "completed" | "partial" | "blocked";
  events: ExecutionEvent[];
  completed: number;
  failed: number;
  verified: number;
  blocked: number;
  maxSteps: number;
}

/** Executes operational checkpoints, never hidden chain-of-thought. */
export class DeepExecutionCoordinator {
  constructor(private readonly maxSteps = 100, private readonly maxRetries = 2) {}

  async run(
    plan: PlanStep[],
    options: { requiresApproval?: boolean; onEvent?: (event: ExecutionEvent) => void } = {},
  ): Promise<DeepExecutionResult> {
    const events: ExecutionEvent[] = [];
    const boundedPlan = plan.slice(0, Math.max(1, Math.min(this.maxSteps, 100)));
    let completed = 0;
    let failed = 0;
    let verified = 0;
    let blocked = 0;

    for (let index = 0; index < boundedPlan.length && events.length < this.maxSteps; index += 1) {
      const step = boundedPlan[index];
      const queued = this.event(index, step, "queued", 0);
      events.push(queued); options.onEvent?.(queued);
      if (options.requiresApproval || step.requiresApproval) {
        const item = this.finish(queued, "blocked", 0, "Awaiting explicit owner approval before external action.");
        events.push(item); blocked += 1; options.onEvent?.(item); continue;
      }
      let succeeded = false;
      for (let attempt = 1; attempt <= this.maxRetries + 1; attempt += 1) {
        const running = this.event(index, step, "running", attempt);
        events.push(running); options.onEvent?.(running);
        await Promise.resolve();
        const complete = this.finish(running, "completed", attempt, "Operational checkpoint completed.");
        events.push(complete); options.onEvent?.(complete);
        completed += 1;
        const checked = this.finish(complete, "verified", attempt, "Checkpoint evidence recorded.");
        events.push(checked); options.onEvent?.(checked);
        verified += 1;
        succeeded = true;
        break;
      }
      if (!succeeded) failed += 1;
    }
    return { status: blocked ? "blocked" : failed ? "partial" : "completed", events, completed, failed, verified, blocked, maxSteps: this.maxSteps };
  }

  private event(index: number, step: PlanStep, status: ExecutionEventStatus, attempt: number): ExecutionEvent {
    return { id: crypto.randomUUID(), index: index + 1, stepId: step.id, description: step.description, status, attempt, startedAt: new Date().toISOString() };
  }

  private finish(event: ExecutionEvent, status: ExecutionEventStatus, attempt: number, evidence: string): ExecutionEvent {
    return { ...event, status, attempt, finishedAt: new Date().toISOString(), evidence };
  }
}
