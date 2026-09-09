export interface RecoveryDecision {
  retry: boolean;
  reason: string;
  maxAttempts: number;
}

export class RecoveryEngine {
  decide(error: unknown, attempt: number): RecoveryDecision {
    if (attempt >= 3) {
      return { retry: false, reason: "Maximum retry attempts reached.", maxAttempts: 3 };
    }
    return {
      retry: true,
      reason: error instanceof Error ? `Retry after failure: ${error.message}` : "Retry after unknown failure.",
      maxAttempts: 3
    };
  }
}
