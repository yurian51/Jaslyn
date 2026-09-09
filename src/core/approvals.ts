export interface ApprovalRequest {
  id: string;
  runId: string;
  stepId: string;
  reason: string;
  createdAt: string;
  expiresAt?: string;
}

export interface ApprovalDecision {
  approved: boolean;
  decidedAt: string;
  decidedBy: string;
  comment?: string;
}

export interface ApprovalStore {
  create(request: ApprovalRequest): Promise<void>;
  decide(id: string, decision: ApprovalDecision): Promise<void>;
}

export class InMemoryApprovalStore implements ApprovalStore {
  private readonly requests = new Map<string, { request: ApprovalRequest; decision?: ApprovalDecision }>();

  async create(request: ApprovalRequest): Promise<void> {
    this.requests.set(request.id, { request });
  }

  async decide(id: string, decision: ApprovalDecision): Promise<void> {
    const item = this.requests.get(id);
    if (!item) throw new Error(`Approval not found: ${id}`);
    item.decision = decision;
  }
}
