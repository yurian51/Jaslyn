export type RunStatus = "queued" | "planning" | "awaiting_approval" | "executing" | "verifying" | "completed" | "failed";

export interface RunState {
  runId: string;
  status: RunStatus;
  goalId: string;
  updatedAt: string;
}

export class RunStateStore {
  private readonly states = new Map<string, RunState>();

  set(state: RunState): void { this.states.set(state.runId, state); }
  get(runId: string): RunState | undefined { return this.states.get(runId); }
}
