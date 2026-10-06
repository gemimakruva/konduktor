# Konduktor

Open-source orchestrator for Claude Code. No hacks. No bots. No ToS violations.

## Stack

- **Monorepo:** pnpm workspaces
- **Backend:** Express 5 + TypeScript 5.5 + better-sqlite3 + ws
- **Frontend:** React 19 + Vite
- **CLI:** @konduktor/cli (bin: `konduktor`)
- **Tests:** Vitest

## Architecture

```
packages/
  shared/    @konduktor/shared   -- types, constants
  server/    @konduktor/server   -- Express + WebSocket + SQLite
  client/    @konduktor/client   -- React dashboard
  cli/       @konduktor/cli      -- CLI entry (start/stop/status)
```

## Standards

- Makruva Engineering Standard: `~/.claude/standards/makruva/`
- Project Class: B (open-source product)
- All files < 300 lines
- TypeScript strict mode
- No secrets in source -- config via `~/.konduktor/`

## Key Documents

- Shared Understanding: `docs/grilling/shared-understanding.md`
- Phase 1 Plan: `docs/plans/phase1-foundation.md`
- Competitive Analysis: `docs/research/competitive-analysis.md`

## Development

```bash
pnpm install
pnpm dev          # all packages in parallel
pnpm build        # build all
pnpm test         # test all
```

## Ports

- Server: 4170
- Client dev: 4171 (proxies to server)
