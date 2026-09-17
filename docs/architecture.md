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

## Jaslyn Net boundary

Jaslyn Net is implemented as a modular network operating surface beside the agent core. Its current boundaries are:

- Commercial state: plans, payments and subscriptions.
- Identity/AAA state: customers, devices and sessions.
- Network control: vendor-neutral policies plus provider adapters.
- Durable entitlement state: verified payment activates a subscription and creates a pending network authorization record in one PostgreSQL transaction.
- Observability: health, telemetry and accounting evidence.
- Reconciliation: deterministic comparison of financial, entitlement and network state.
- Audit: durable commands/events and operator actions.

The durable data model is PostgreSQL-oriented and is defined under `db/migrations/`. Migration `002_jaslyn_net_operational_state.sql` adds networks, device roles/links, durable network authorizations and deterministic incidents. The runtime uses transactional boundaries in `src/net/db.mjs` and does not silently fall back to fabricated production data when `DATABASE_URL` is absent.

A payment callback is deliberately not an authorization decision. A trusted payment verifier must first establish `VERIFIED` or `SETTLED` state, then the guarded activation boundary can lock the payment/subscription, verify amount and currency against the plan, extend the entitlement, compile the network policy, persist `PENDING` network authorization, emit an auditable event and return `PENDING_NETWORK_APPLY`. It does not claim that the router has already authorized the customer.

MikroTik RouterOS v7 REST is an optional real provider integration. Network commands require a separate `JASLYN_NET_COMMAND_KEY`, and destructive HotSpot disconnects are verified against the router after execution.

RADIUS transport is intentionally not marked as configured until an actual RADIUS service and credentials are supplied. The policy compiler can produce verified MikroTik/RADIUS attributes without coupling commercial plans to vendor-specific storage.
