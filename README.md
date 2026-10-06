# Konduktor

Open-source orchestrator for Claude Code. No hacks. No bots. No ToS violations.

> Powered by Claude Code CLI subscription. Legal. Open-source. MIT licensed.

## What is Konduktor?

Konduktor is a web dashboard that wraps the official Claude Code CLI, giving you a visual interface for orchestrating AI-powered development workflows -- all within Anthropic's Terms of Service.

## Features

- Streaming chat interface with real-time output
- Session management (view, stop, resume Claude Code sessions)
- Multi-session orchestration (up to 10 concurrent)
- Dark/light theme with deep purple + cyan identity
- Settings management via web UI
- LAN access with PIN code authentication
- Dynamic capability discovery (MCP servers, plugins)

## Quick Start

```bash
npm install -g @konduktor/cli
konduktor start
```

Open http://localhost:4170 in your browser.

## Prerequisites

- Node.js >= 20
- Claude Code CLI (detected automatically, guided install if missing)
- Active Claude subscription (Pro, Team, or Enterprise)

## Development

```bash
git clone https://github.com/gemimakruva/konduktor.git
cd konduktor
pnpm install
pnpm dev
```

## License

MIT - PT Makruva Teknologi Nusantara

## Roadmap

- Phase 2: Kanban board, subagent watch, capabilities management
- Phase 3: Cron jobs, artifact integration, analytics
- Phase 4: Browser automation (Playwright MCP), chat-first setup engine
- Phase 5: npm publish, docs site, community
