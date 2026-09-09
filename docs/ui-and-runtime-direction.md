# Jaslyn UI and Runtime Direction

## Product position

Jaslyn is an independent agent workspace. It may learn from the interaction quality of leading AI workspaces and coding agents, but it must retain its own identity, terminology, visual system, and information hierarchy. The product is an operating console for autonomous work, not a generic chat clone.

## Runtime stack

The web application uses Next.js and React in the JavaScript ecosystem. The current source uses TypeScript syntax, which compiles to JavaScript and provides safer contracts for agent state, API payloads, tools, and approvals. Python is the execution language for local automation and data-oriented tools. The JavaScript server invokes the allow-listed Python worker through a structured JSON bridge.

| Layer | Technology | Responsibility |
|---|---|---|
| Workspace UI | Next.js + React | Conversation, command composer, memory browser, objectives, inspector, approvals, and activity views |
| Agent API | JavaScript/Next.js route handlers | Request validation, provider calls, tool orchestration, and response shaping |
| Agent runtime | Jaslyn core modules | Intent, planning, policy, execution, verification, governance, and recovery |
| Automation tools | Python 3 | Safe local tools, system inspection, workspace utilities, text analysis, and long-term memory operations |
| Long-term memory | Python `sqlite3` | Persistent explicit memories with categories, importance, timestamps, search, and deletion controls |

## UI direction

Jaslyn uses a dark, restrained, editorial control-room aesthetic: near-black surfaces, quiet borders, high-contrast typography, a single violet/lilac identity accent, and semantic status colors only when they communicate state. The UI is inspired by the clarity and interaction quality of modern AI workspaces, but it does not reuse their names, logos, copy, icons, or distinctive layouts.

The central distinction is operational: conversation is separate from execution trace, memory, tool calls, approvals, background work, and verification evidence. Jaslyn never exposes chain-of-thought. It shows concise operational summaries, plans, policy decisions, and evidence instead.

## Interaction principles

1. **Command first:** the persistent composer is the primary control surface.
2. **Visible boundaries:** every tool advertises a scope such as read-only, pure, persistent-write, or external-action.
3. **Approval before consequence:** external or consequential actions stop in an approval state.
4. **Evidence over claims:** completed work must show a result or verification signal.
5. **Owner control:** memory can be explicitly stored, searched, and deleted by the workspace owner.
6. **Responsive by default:** the desktop three-zone layout collapses into a mobile navigation drawer and focused command surface.
