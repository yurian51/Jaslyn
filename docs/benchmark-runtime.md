# Jaslyn benchmark runtime

Jaslyn now adopts the strongest architectural patterns from the uploaded OpenClaw Zero Token benchmark without making Jaslyn dependent on OpenClaw.

## Adopted patterns

1. **Provider abstraction**: every model backend implements `id`, `model`, `reason(request)` and optional `health()`.
2. **Concurrent model execution**: `ConcurrentEngine` provides AskOnce-style fan-out with bounded concurrency and per-provider timeouts.
3. **Stream/tool compatibility boundary**: `tool-protocol.mjs` defines a provider-neutral tool-call envelope. Malformed tool output is never executed.
4. **Agent loop**: `BenchmarkRuntime` follows Understand → Context → Plan → Policy → Approve → Execute → Observe → Verify → Recover → Remember.
5. **Persistent episodic memory**: `JsonMemory` keeps a bounded local memory with atomic writes and restrictive file permissions.
6. **Runtime events**: each goal, reasoning pass, tool transition and verification result produces an inspectable event.
7. **Provider health**: providers expose an explicit health contract rather than being assumed available.

## What is deliberately not copied

Jaslyn does not copy OpenClaw's browser credential harvesting or provider-specific session scraping. Web-session integrations can be added behind the provider contract only when they are authorized, secure, and compliant with the provider's terms.

## Current execution boundary

The benchmark layer is written in JavaScript ESM (`.mjs`) and is consumed by the existing Next.js/TypeScript control surface. This lets Jaslyn evolve the runtime without forcing a TypeScript rewrite of the agent engine.

## API behavior

`POST /api/chat` now executes through the benchmark runtime. The response includes:

- `reasoning`
- `plan`
- `toolResults`
- `outcome`
- `verified`
- runtime `events`

The `fanout` request flag enables the concurrent provider path when multiple providers are registered.
