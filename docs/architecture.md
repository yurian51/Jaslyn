# Jaslyn Architecture

## Agent lifecycle

1. Accept a goal.
2. Normalize and validate input.
3. Load relevant context.
4. Produce a plan.
5. Evaluate policy and risk.
6. Request approval where required.
7. Select and invoke tools.
8. Observe tool results.
9. Recover from transient failures.
10. Verify the intended outcome.
11. Persist useful memory.
12. Report verified status.

## Non-negotiable invariants

- No tool may execute outside the registry.
- Every tool receives a run context.
- Policy evaluation happens before execution.
- Verification is separate from execution.
- Provider implementations are replaceable.
- Secrets never belong in source control.
- A successful response must be grounded in a verification result.

## Future production boundaries

The first implementation uses in-memory stores. PostgreSQL, Redis, queues, WebSockets, provider adapters, authentication, and external tool connectors should implement the same contracts rather than leak infrastructure concerns into the agent core.
