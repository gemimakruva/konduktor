# Konduktor -- Shared Understanding

> Finalized: 2026-10-06 via grilling session (25 questions, all answered)

## What Is Konduktor?

Open-source web dashboard that wraps Claude Code CLI (subscription only, no API). Legal alternative to Hermes Agent -- no browser automation, no ToS violations.

**Tagline:** "Open-source orchestrator for Claude Code. No hacks. No bots. No ToS violations."

## USPs

1. **Legal compliance** -- runs on Claude Code CLI subscription, not browser automation
2. **Chat-first setup** -- user chats what they want, Konduktor configures everything (MCP servers, plugins, settings)
3. **Artifact integration** -- output becomes shareable Claude Artifacts

## Identity

- **Name:** Konduktor (Indonesian spelling, avoids collision with conductor.build)
- **Design:** Deep purple (#7c3aed) + cyan (#06b6d4), independent from Makruva branding
- **Footer:** "by Makruva"
- **License:** MIT
- **GitHub:** gemimakruva/konduktor
- **npm:** @konduktor/cli (scoped packages)

## Technical Decisions

| Decision | Answer |
|----------|--------|
| CLI interface | `claude -p --output-format stream-json --verbose` for streaming |
| Session listing | `claude agents --json` |
| Background sessions | `claude --bg` |
| MCP management | `claude mcp add/remove/list/get` |
| Plugin management | `claude plugin list/install/uninstall/enable/disable` |
| Package manager | pnpm workspaces |
| Backend | Express 5 + TypeScript 5.5 |
| Frontend | React 19 (Vite) |
| Database | better-sqlite3 (SQLite) |
| WebSocket | ws library |
| Tests | Vitest |
| Default port | 4170 |
| Max concurrent sessions | 3 (configurable, max 10) |

## Claude Code Detection

- On `konduktor start`, detect existing Claude Code CLI via `which claude`
- If found: use it, skip install
- If not found: guide user through installation
- Check authentication status via `claude auth status`

## Capability Registry

- Track installed MCP servers, plugins, tools
- Discover via `claude mcp list --json` and `claude plugin list --json`
- Phase 1: schema + types + discovery on startup
- Phase 2+: gap detection, auto-install guidance via chat

## Deployment Modes

- Phase 1: local + LAN (PIN code for LAN access)
- Future: cloud-deployable

## Tab Categories (UI)

1. **Capabilities** -- skills, tools, MCP servers, plugins
2. **Messaging** -- chat sessions, history
3. **Schedules & Artifacts** -- cron jobs, artifact output
4. **Chat Session** -- primary chat interface

## 5-Phase Roadmap

1. **Foundation** -- monorepo, CLI wrapper, streaming chat, basic UI (this plan)
2. **Orchestration** -- kanban, subagent watch, capabilities management
3. **Automation** -- cron jobs, artifact integration, analytics
4. **Advanced** -- browser automation (Playwright MCP), chat-first setup engine
5. **Distribution** -- npm publish, docs site, community

## Hermes Feature Parity

12/15 Hermes features natively available in Claude Code, 2 with workarounds, 1 gap (browser automation solvable via Playwright MCP in Phase 4).

## Competitive Landscape

No exact competitor exists. Closest alternatives:
- Hermes Agent (ToS violation)
- Claudia (AGPL, API-only)
- Open Hands (general purpose, not Claude-specific)

Konduktor's unique combination: Claude Code CLI wrapper + legal + open-source + chat-first setup + artifact integration.
