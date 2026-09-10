# Jaslyn Architecture

## Agent lifecycle

1. Accept a goal.
2. Normalize and validate input.
3. Load relevant context and recent memory.
4. Produce a bounded plan.
5. Evaluate policy and risk.
6. Create an exact approval record where required.
7. Select a healthy provider and invoke registered tools.
8. Observe tool results.
9. Recover from transient provider/tool failures.
10. Verify the intended outcome.
11. Persist useful memory and run history.
12. Report verified, blocked, failed, or unverified status.

## Runtime boundaries

- The agent runtime is JavaScript ESM.
- The Next.js control surface is JavaScript/JSX.
- Python is a secondary bridge for specialized tools, not the agent orchestration layer.
- Model inference is accessed through a self-hosted OpenAI-compatible protocol boundary.
- Tool calls use a provider-neutral Jaslyn tool envelope.

## Non-negotiable invariants

- No tool may execute outside the registry.
- Every tool receives a run context.
- Policy evaluation happens before execution.
- Protected actions require a persisted, exact-action approval.
- A generic `approve=true` flag can never bypass policy.
- Approved actions are one-time claims and are audited as runs.
- Verification is separate from execution.
- Provider implementations are replaceable.
- Provider failure triggers bounded failover rather than unbounded retries.
- Tool execution has timeout and cancellation boundaries.
- Secrets never belong in source control.
- Persistent JSON stores use atomic replacement and local filesystem locking.
- A successful response must be grounded in a verification result.

## Persistence

The self-hosted single-node runtime currently persists episodic memory, run history, and approval state in local JSON stores. Each store reloads current state under a filesystem lock before mutation and writes through a temporary file followed by atomic rename. This prevents common lost-update and partial-write failures on a single host.

For multi-instance production deployments, replace the local stores with shared transactional infrastructure such as PostgreSQL and Redis while preserving the same runtime contracts.

## Security boundary

Browser/session capabilities must be implemented as explicitly authorized provider integrations. Credential harvesting, arbitrary session scraping, and hidden bypasses are outside the Jaslyn security model.
