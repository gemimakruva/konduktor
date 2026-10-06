# Konduktor -- Master Plan

> Visi lengkap produk dari Phase 1 sampai kondisi ideal.
> Setiap fase punya detail plan sendiri di `docs/plans/phase{N}-*.md`.

## Visi

Konduktor adalah web dashboard open-source yang membungkus Claude Code CLI, memberikan pengalaman visual orchestration yang setara dengan Hermes Agent -- tetapi 100% legal, berjalan di atas langganan Claude Code resmi.

Kondisi ideal: seorang developer atau tim cukup menjalankan `konduktor start`, membuka browser, dan langsung bisa mengorkestrasi pekerjaan AI melalui chat -- semua konfigurasi MCP server, plugin, dan tools dilakukan lewat percakapan natural. Output pekerjaan bisa langsung menjadi Claude Artifact yang bisa di-share.

## Competitive MOAT & Defensibility

### Jujur: MOAT-nya tipis

Konduktor adalah open-source wrapper di atas produk pihak ketiga (Claude Code CLI). Kalau Anthropic bikin dashboard resmi atau Hermes pivot ke legal, positioning ini bisa tergeser. Ini bukan SaaS dengan network effect atau proprietary data.

### Apa yang bisa dipertahankan

| Layer | Defensibility | Kekuatan | Risiko |
|-------|--------------|----------|--------|
| **First-mover** | Belum ada yang wrap Claude Code CLI sebagai web dashboard legal | Medium | Rendah entry barrier, bisa disaingi kapan saja |
| **Chat-first setup** | UX paradigm yang berbeda -- kompetitor pakai GUI manual | Medium-High | Butuh NLP engine yang bagus, kalau jelek malah frustrasi |
| **Artifact integration** | Output jadi shareable artifact, bukan cuma text | Medium | Tergantung Artifact API stability |
| **Community templates** | Library MCP config, workflow templates, best practices | High (over time) | Butuh waktu bangun komunitas, chicken-egg problem |
| **Switching cost** | User yang sudah setup banyak capabilities, cron jobs, kanban boards | Medium | Data export bisa mengurangi lock-in |
| **Brand positioning** | "The legal one" -- moral high ground vs Hermes | Low | Hilang kalau Hermes jadi legal |

### Strategi defensibility jangka panjang

1. **Community-first**: buat ekosistem templates dan shared configs yang makin besar
2. **Speed of execution**: ship Phase 1-3 cepat sebelum ada yang nyaingi
3. **Workflow lock-in**: makin banyak user setup cron jobs, kanban boards, analytics history -- makin sulit pindah
4. **Extension API**: buka plugin system di Phase 5 agar komunitas bikin extensions

### Skenario mati

- Anthropic rilis dashboard resmi yang gratis -- Konduktor jadi redundant
- Claude Code CLI berubah drastis / deprecated -- foundation runtuh
- Hermes fix ToS compliance -- kehilangan positioning utama

### Mitigasi

- Track Claude Code CLI changelog aktif, adaptasi cepat
- Jangan over-invest di fitur yang bisa Anthropic ship sendiri
- Fokus ke value-add yang Anthropic tidak akan bikin: community templates, workflow automation, multi-project orchestration

## Hermes Feature Parity Map

Mapping 1:1 semua fitur Hermes dan di fase mana Konduktor deliver-nya.

| # | Hermes Feature | Konduktor Equivalent | Status | Fase |
|---|---------------|---------------------|--------|------|
| 1 | Dashboard (status overview) | Health endpoint + status bar | Replaceable | Phase 1 |
| 2 | Chat interface | Streaming chat via CLI | Replaceable | Phase 1 |
| 3 | Multi-session management | Session list + multi-tab | Replaceable | Phase 1-2 |
| 4 | Configuration panel | Settings page | Replaceable | Phase 1 |
| 5 | Session logs | CLI output capture + log viewer | Replaceable | Phase 1-2 |
| 6 | Analytics (token/cost) | Analytics dashboard | Replaceable | Phase 1 (seed) + Phase 3 (full) |
| 7 | Cron/scheduled jobs | node-cron scheduler | Replaceable | Phase 3 |
| 8 | Skills hub | Skills listing via CLI | Replaceable | Phase 2 |
| 9 | MCP server management | CLI `claude mcp` commands + UI | Replaceable | Phase 2 |
| 10 | Kanban board | Custom kanban implementation | Replaceable | Phase 2 |
| 11 | System info | System info page | Replaceable | Phase 2 |
| 12 | Subagent watch | Session events tree view | Replaceable | Phase 2 |
| 13 | Three-panel layout | Sidebar + main + status bar | Workaround | Phase 1-2 |
| 14 | Plugin management | CLI `claude plugin` commands + UI | Workaround | Phase 2 |
| 15 | Browser automation | Playwright MCP server | Gap (MCP) | Phase 4 |

**Score: 12 replaceable, 2 workaround, 1 gap (solvable via MCP)**

## Produk Akhir (Kondisi Ideal)

### Dashboard Lengkap

```
+------------------+------------------------------------------------+
|                  |                                                |
|  SIDEBAR         |  MAIN AREA                                     |
|                  |                                                |
|  > Chat          |  [Active chat / page content]                  |
|  > Sessions      |                                                |
|  > Capabilities  |  - Streaming text output                       |
|  > Kanban        |  - Tool use visualization                      |
|  > Analytics     |  - Thinking process display                    |
|  > Schedules     |  - Artifact preview                            |
|  > Artifacts     |                                                |
|  > Logs          |                                                |
|  > System        |                                                |
|  > Settings      |                                                |
|                  |                                                |
|  [Active         +------------------------------------------------+
|   Sessions]      |  STATUS BAR                                    |
|                  |  model | tokens | cost | session status        |
+------------------+------------------------------------------------+
```

### Fitur Lengkap (Target)

| Kategori | Fitur | Sumber | Fase |
|----------|-------|--------|------|
| **Chat** | Streaming chat dengan Claude Code | CLI `claude -p --output-format stream-json` | 1 |
| **Chat** | Multi-session (hingga 10 concurrent) | CLI child processes | 1 |
| **Chat** | Resume session | CLI `--resume` flag | 1 |
| **Chat** | Background sessions | CLI `claude --bg` | 2 |
| **Chat** | Chat-first setup (USP) | Intent parser + Capability Registry | 4 |
| **Chat** | Chat history search | SQLite full-text search | 2 |
| **Chat** | Chat history export | JSON/Markdown export | 3 |
| **Chat** | Thinking process visualization | Collapsible thinking blocks | 4 |
| **Chat** | Tool use visualization | Input/output panels | 4 |
| **Sessions** | List active sessions | CLI `claude agents --json` | 1 |
| **Sessions** | Stop/remove sessions | CLI `claude stop/rm` | 1 |
| **Sessions** | Session detail view | Full history, token breakdown | 2 |
| **Sessions** | Subagent watch (live tree) | CLI session events parsing | 2 |
| **Sessions** | Multi-tab session switching | Tab-based UI | 2 |
| **Capabilities** | MCP server management | CLI `claude mcp add/remove/list` | 2 |
| **Capabilities** | Plugin management | CLI `claude plugin list/install/uninstall` | 2 |
| **Capabilities** | Skills listing | CLI skills discovery | 2 |
| **Capabilities** | Dynamic gap detection | Capability Registry + intent matching | 4 |
| **Capabilities** | Auto-install guidance | Chat-first setup engine | 4 |
| **Kanban** | Task board per project | Local SQLite | 2 |
| **Kanban** | Drag-drop columns | React DnD | 2 |
| **Kanban** | Link tasks to sessions | Session ID reference | 2 |
| **Analytics** | Token usage tracking (seed) | Stream event parsing | 1 |
| **Analytics** | Cost per session/day/model | Aggregated from events | 3 |
| **Analytics** | Model usage breakdown | Analytics DB | 3 |
| **Analytics** | Trend charts | Recharts | 3 |
| **Analytics** | Export analytics (CSV, JSON) | Server endpoint | 3 |
| **Schedules** | Cron job scheduling | node-cron | 3 |
| **Schedules** | Recurring prompts | Cron + CLI spawn | 3 |
| **Schedules** | Job history + logs | SQLite | 3 |
| **Artifacts** | Output as Claude Artifact | Artifact API integration | 3 |
| **Artifacts** | Artifact gallery | Local cache + preview | 3 |
| **Artifacts** | Share artifacts | Artifact URL | 3 |
| **Logs** | Session output logs | CLI stdout/stderr capture | 2 |
| **Logs** | Cron job execution logs | Job runner output | 3 |
| **Logs** | Error/crash logs | Server error handler | 2 |
| **Browser** | Browser automation | Playwright MCP server | 4 |
| **Browser** | Screenshot capture | Playwright | 4 |
| **Browser** | Web scraping | Playwright | 4 |
| **System** | System info (Node, CLI version, OS) | Runtime detection | 2 |
| **System** | Resource usage (memory, CPU) | process.memoryUsage + os module | 2 |
| **System** | Environment info | env vars, paths | 2 |
| **Settings** | Theme (dark/light/system) | CSS custom properties | 1 |
| **Settings** | Port, model, effort config | `~/.konduktor/settings.json` | 1 |
| **Settings** | LAN access + PIN code | Express bind 0.0.0.0 + auth middleware | 1 |
| **Infra** | WebSocket auto-reconnection | Client WS with exponential backoff | 1 |
| **Infra** | Desktop notifications | Notification API (completed sessions) | 4 |
| **Infra** | Error recovery UX | Crash/timeout/rate-limit handling | 1-2 |

## Arsitektur

```
                    Browser (React 19)
                         |
                    WebSocket + HTTP
                         |
                  Express 5 Server (:4170)
                   /     |     \
           Routes    WebSocket   SQLite
          /api/*     Handler     Database
                         |
                  Claude Code CLI
                  (child process)
                         |
                  Claude API (via subscription)
```

### Monorepo Structure

```
@konduktor/shared   -- Types, constants, shared utilities
@konduktor/server   -- Express + WebSocket + SQLite + CLI wrapper
@konduktor/client   -- React dashboard
@konduktor/cli      -- CLI entry point (konduktor start/stop/status)
```

### Data Flow

1. User types prompt di browser
2. Client kirim `chat:start` via WebSocket
3. Server spawn `claude -p --output-format stream-json --verbose` sebagai child process
4. Server parse NDJSON output line-by-line
5. Setiap event di-forward ke client via WebSocket
6. Client render streaming text, tool use, thinking blocks
7. Pada `result` event, simpan analytics ke SQLite
8. Client display final result

### Capability Registry Flow

```
Server Start
    |
    v
claude mcp list --json  -->  capabilities table (type=mcp)
claude plugin list --json --> capabilities table (type=plugin)
    |
    v
User chats: "monitor Meta Ads daily"
    |
    v
Intent Parser detects: needs Meta Ads connector
    |
    v
Check capabilities table: not found
    |
    v
Respond: "Meta Ads MCP server belum terinstall.
          Mau saya bantu install? Jalankan:
          claude mcp add meta-ads-server"
    |
    v
User confirms --> auto-run install --> refresh capabilities
```

### Error Handling Strategy

| Skenario | Apa yang terjadi | UX |
|----------|-----------------|-----|
| Claude CLI crash | Child process emits `error` event | Toast: "Session ended unexpectedly. Retry?" + log to errors |
| Session timeout (10 min default) | SIGTERM lalu SIGKILL setelah 5s | Toast: "Session timed out" + partial result tetap tampil |
| Rate limit | `rate_limit_event` dari CLI stream | Banner: "Rate limited. Waiting {N}s..." + auto-retry |
| CLI not found | `konduktor start` detection fails | Guided install: "Claude Code CLI not found. Install with: npm i -g @anthropic-ai/claude-code" |
| Auth expired | `claude auth status` check fails | Prompt: "Claude session expired. Run `claude auth` to re-login" |
| WebSocket disconnect | Client auto-reconnect (exponential backoff, max 10 attempts) | Subtle indicator: "Reconnecting..." then auto-resume |
| Settings file corrupt | Load defaults, log warning | Silent fallback, settings page shows defaults |
| SQLite locked | WAL mode handles concurrent reads; write retries | Transparent to user |

### LAN Access + PIN Code Flow

```
konduktor start --lan
    |
    v
Server binds 0.0.0.0:4170
    |
    v
First-time: generate random 6-digit PIN, display in terminal
    |
    v
Browser on same LAN opens http://<server-ip>:4170
    |
    v
PIN entry screen (simple 6-digit input)
    |
    v
PIN match --> set httpOnly cookie (24h expiry) --> access granted
PIN wrong --> 3 attempts, then 60s lockout
    |
    v
Subsequent visits: cookie validates, skip PIN
```

## Fase-Fase Development

### Phase 1: Foundation
> Detail: `docs/plans/phase1-foundation.md`

**Goal:** MVP yang bisa dipakai -- streaming chat, session management, settings UI.

**Deliverables:**
- Monorepo scaffold (pnpm workspaces, TypeScript strict)
- Claude CLI wrapper (spawn, stream NDJSON, parse events)
- Express + WebSocket server
- SQLite database (chat history, analytics seed, capabilities schema)
- React dashboard (sidebar layout, design tokens, dark/light theme)
- Chat UI (streaming text, message history, send/stop)
- Session list page
- Settings page (theme, port, model, LAN access)
- CLI commands (konduktor start/stop/status)
- Smart Claude Code detection (skip install if present)
- WebSocket auto-reconnection (client)
- Basic error handling (CLI crash, timeout, malformed output)
- Integration tests + README

**Estimasi:** ~52 files, 10 commits

---

### Phase 2: Orchestration

**Goal:** Multi-session orchestration, capabilities management, dan monitoring.

**Deliverables:**
- Kanban board (columns: backlog, in-progress, review, done)
- Drag-drop task management
- Link tasks ke Claude sessions
- Subagent watch -- live tree view of spawned agents
- Capabilities management UI:
  - MCP servers: list, add, remove, status
  - Plugins: list, install, uninstall, enable/disable
  - Skills: browse available skills
- Session detail view (full history, token breakdown)
- Multi-tab session management (switch between active chats)
- Chat history search (SQLite FTS5)
- Logs page (session output, error logs)
- System info page (Node version, CLI version, OS, resource usage)
- Background sessions support (`claude --bg`)
- Error handling UX refinement (retry flows, partial result display)

**Dependencies:** Phase 1 complete

---

### Phase 3: Automation & Analytics

**Goal:** Scheduled jobs, data-driven insights, dan artifact integration.

**Deliverables:**
- Cron job scheduler (recurring prompts, configurable via UI)
- Job execution history + log viewer
- Claude Artifact integration (output as shareable artifact)
- Artifact gallery (browse, preview, share, delete)
- Analytics dashboard:
  - Token usage over time (line chart)
  - Cost per day/week/month (bar chart)
  - Model usage breakdown (pie chart)
  - Session duration distribution
  - Most used tools/MCP servers
- Export: analytics (CSV, JSON), chat history (Markdown, JSON)
- Cron job execution logs

**Dependencies:** Phase 2 complete (analytics seed data dari Phase 1)

---

### Phase 4: Advanced Features

**Goal:** Chat-first setup engine, browser automation, dan polished UX.

**Deliverables:**
- Chat-first setup engine:
  - Intent parser (keyword + pattern matching)
  - Capability gap detector (compare intent vs installed capabilities)
  - Auto-install flow (with user confirmation)
  - Configuration wizard via chat ("saya mau monitoring X" -> guide setup)
- Browser automation via Playwright MCP:
  - Screenshot capture
  - Web scraping
  - Form filling
  - Visual regression testing
- Thinking process visualization (collapsible thinking blocks in chat)
- Tool use visualization (input/output panels, expandable)
- Desktop notifications (completed sessions, cron job results)

**Dependencies:** Phase 3 complete, Playwright MCP available

---

### Phase 5: Distribution

**Goal:** Publish dan community building.

**Deliverables:**
- npm publish `@konduktor/cli` (global install, auto-detect Claude Code)
- CLI auto-update mechanism
- Documentation site (VitePress atau Starlight)
- Getting started guide + video walkthrough
- Plugin/extension API for community contributions
- Community templates repository (common MCP server configs, workflow presets)
- Cloud deployment guide (Docker, Railway, Fly.io)
- GitHub Actions CI/CD (lint, test, build, publish)
- Internationalization (id, en)

**Dependencies:** Phase 4 complete, production-stable

## Tech Stack Summary

| Layer | Technology | Why |
|-------|-----------|-----|
| Runtime | Node.js >= 20 | Native fetch, structuredClone |
| Package Manager | pnpm >= 9 | Fast, workspace support, disk efficient |
| Language | TypeScript 5.5 strict | Type safety across all packages |
| Backend | Express 5 | Stable, minimal, good middleware ecosystem |
| WebSocket | ws | Lightweight, battle-tested |
| Database | better-sqlite3 | Zero-config, fast, WAL mode |
| Frontend | React 19 | Latest features, large ecosystem |
| Build | Vite | Fast HMR, good TypeScript support |
| Tests | Vitest | Fast, native TypeScript, Vite-aligned |
| CLI | Node.js native (no framework) | Minimal dependencies |

## Constraints

- Node.js >= 20
- pnpm >= 9
- TypeScript strict mode semua packages
- Semua file < 300 baris (Makruva standard)
- MIT license
- No secrets in source -- semua config via `~/.konduktor/`
- Design tokens: deep purple (#7c3aed) + cyan (#06b6d4)
- Indonesian naming untuk brand, English untuk code
- Claude Code CLI sebagai satu-satunya interface ke Claude (no API key)

## Risiko & Dependensi Eksternal

| Risiko | Impact | Likelihood | Mitigasi |
|--------|--------|------------|----------|
| Anthropic rilis dashboard resmi | Fatal -- Konduktor jadi redundant | Medium | Fokus ke value-add (templates, workflow automation) yang Anthropic tidak akan bikin |
| Claude Code CLI breaking change | High -- foundation bisa rusak | Medium | Pin CLI version, track changelog, adapter layer |
| Claude Code CLI deprecated | Fatal | Low | Pivot ke API-based kalau ini terjadi |
| Hermes jadi ToS-compliant | Medium -- hilang positioning utama | Low | Sudah punya differentiator lain (chat-first, artifacts) |
| `claude -p stream-json` format berubah | Medium -- parser rusak | Low | Abstraction layer di parser, version detection |
| Rate limiting ketat dari Anthropic | Medium -- UX degradasi | Medium | Graceful handling, queue system, user notification |
