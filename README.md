# Jaslyn

Jaslyn is a JARVIS-class autonomous AI agent runtime.

## Vision

Jaslyn is designed to understand a goal, build a plan, select tools, execute work, verify outcomes, recover from failures, and remember useful context.

## Architecture

- **Core:** agent runtime, reasoning, planning, decisions, execution, verification, recovery
- **Intelligence:** provider abstraction, context, memory, knowledge and retrieval
- **Agents:** general, developer, research, browser, business, data and automation
- **Tools:** browser, files, GitHub, terminal, database, APIs and messaging
- **Control:** permissions, approvals, policies, guardrails, risk and audit
- **Automation:** tasks, scheduler, workflows, events and background jobs
- **Interfaces:** web, mobile, WhatsApp, voice, API and CLI
- **Infrastructure:** queues, WebSockets, event bus, observability, health checks and CI/CD

## Runtime principle

Understand → Context → Plan → Policy → Approve → Execute → Observe → Verify → Recover → Remember

## Development

```bash
npm install
npm run typecheck
npm run build
npm run dev
```

The current repository intentionally starts with a small dependency footprint. Infrastructure adapters are added behind interfaces instead of coupling the core to a provider or vendor.
