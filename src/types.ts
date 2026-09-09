export type AgentId = string;
export type ToolName = string;
export type RunId = string;

export interface AgentGoal {
  id: string;
  instruction: string;
  createdAt: string;
  metadata?: Record<string, unknown>;
}

export interface PlanStep {
  id: string;
  description: string;
  tool?: ToolName;
  input?: Record<string, unknown>;
  requiresApproval: boolean;
}

export interface Plan {
  id: string;
  goalId: string;
  steps: PlanStep[];
  createdAt: string;
}

export interface ToolContext {
  runId: RunId;
  agentId: AgentId;
  signal?: AbortSignal;
}

export interface ToolDefinition<TInput = unknown, TOutput = unknown> {
  name: ToolName;
  description: string;
  execute(input: TInput, context: ToolContext): Promise<TOutput>;
}

export interface ReasoningRequest {
  instruction: string;
  context: Record<string, unknown>;
}

export interface ReasoningResult {
  summary: string;
  proposedSteps: string[];
}

export interface LLMProvider {
  name: string;
  reason(request: ReasoningRequest): Promise<ReasoningResult>;
}

export interface MemoryRecord {
  id: string;
  namespace: string;
  content: string;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface MemoryStore {
  put(record: MemoryRecord): Promise<void>;
  search(namespace: string, query: string, limit?: number): Promise<MemoryRecord[]>;
}
