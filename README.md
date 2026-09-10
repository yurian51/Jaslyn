# Jaslyn

Jaslyn is an independent, JARVIS-class autonomous AI agent runtime and control surface.

## Vision

Jaslyn is designed to understand a goal, build a plan, select tools, execute work, verify outcomes, recover from failures, and remember useful context. It is an agent runtime, not a cosmetic chatbot shell.

## Architecture

- **Runtime:** JavaScript ESM agent loop with bounded iterations, timeouts, failover, verification and recovery
- **Control surface:** Next.js + React using JavaScript/JSX
- **Intelligence:** self-hosted inference provider boundary with provider-neutral tool calling
- **Memory:** persistent local episodic memory with atomic writes and concurrency protection
- **Execution:** registered tools with policy gates, approval records, timeout boundaries and audit history
- **Control:** permissions, approvals, policies, guardrails, risk and audit
- **Interfaces:** web control center, API and CLI
- **Secondary tools:** Python bridge for specialized execution, invoked from the JavaScript runtime
- **Infrastructure:** health checks, run history, observability hooks and CI/CD

## Runtime principle

Understand → Context → Plan → Policy → Approve → Execute → Observe → Verify → Recover → Remember

## JavaScript boundary

The application and runtime are intentionally JavaScript-first:

- `.js`, `.jsx`, and `.mjs` are the supported application/runtime source formats.
- TypeScript compiler configuration and TypeScript source files are not part of the active application boundary.
- `npm run language:audit` fails if `.ts`, `.tsx`, `.d.ts`, or `tsconfig.json` files are introduced.
- Python remains available only as a secondary tool-execution bridge where it provides a clear capability advantage.

## Development

```bash
npm install
npm run language:audit
npm run build
npm test
npm run benchmark:selftest
npm run benchmark:security
npm run dev
```

## Self-hosted inference

Configure the runtime with a self-hosted OpenAI-compatible inference endpoint:

```bash
JASLYN_INFERENCE_URL=http://127.0.0.1:8000
JASLYN_MODEL=your-model
```

The protocol is OpenAI-compatible, but Jaslyn is not presented as GPT, Claude, Gemini, or another vendor's identity. The endpoint is an infrastructure boundary for model inference; the agent runtime, policy, memory, tool protocol, approvals, verification, and execution control remain Jaslyn-owned code.

## Security boundary

Approval is exact-action and durable. Protected actions cannot be unlocked by a generic `approve=true` request. Approved actions are claimed once, executed from the persisted action record, and written to run history. Browser/session integrations must remain behind explicitly authorized provider boundaries; credential harvesting and session scraping are not part of Jaslyn.

For single-host self-hosted deployments, the local JSON stores use atomic file operations and filesystem locks. Multi-instance deployments should replace these stores with shared transactional infrastructure such as PostgreSQL/Redis.
