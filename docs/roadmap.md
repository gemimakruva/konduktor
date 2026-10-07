# Konduktor Roadmap

> Milestone-based, no fixed dates. Each phase ships when ready.

## Status

| Phase | Name | Status |
|-------|------|--------|
| 1 | Foundation | Done |
| 2 | Orchestration | Done |
| 3 | Automation & Analytics | Done |
| 4 | Advanced Features | Done |
| 5 | Agent Profiles + Kanban Auto-Assign | Done |
| **6** | **Chat Auto-Configuration (MCP Self-Service)** | **Done** |
| 7 | Networking + Distribution + Community | Planned |

### Dependency Chain

```
Phase 5 (profiles + kanban assign)
  └→ Phase 6 (MCP self-service needs profiles & kanban to orchestrate)
       └→ Phase 7 (networking needs all local features stable first)
```

---

## Phase 5: Agent Profiles + Kanban Auto-Assign

**Goal:** Turn Konduktor from a dashboard into a real orchestrator — named agents with personalities, skills, and memory that automatically pick up work from the kanban board.

### Agent Profiles

Each agent is a reusable profile with:

| Field | Description |
|-------|-------------|
| `name` | Display name (e.g. "DevOps Agent") |
| `icon` | Avatar/emoji identifier |
| `systemPrompt` | Agent's personality and instructions |
| `model` | Claude model to use |
| `defaultCwd` | Default working directory |
| `skills` | Capability tags (e.g. "frontend", "devops", "data") |
| `maxConcurrentTasks` | How many tasks this agent can run in parallel |
| `personalityPrompt` | Behavioral guidelines beyond the system prompt |
| `delegationRules` | Rules for when to hand off to another agent |
| `memoryPolicy` | What to remember across sessions |
| `toolRestrictions` | Whitelist/blacklist of allowed tools |
| `knowledgeSources` | Files/URLs the agent always references |
| `performanceStats` | Auto-computed: tasks completed, avg duration, success rate |

**Lifecycle:** Hybrid model.
- **Ephemeral (default):** Profile is a config template. Each task spawns a fresh Claude Code process. Process exits when task completes.
- **Persistent (opt-in):** Pin an agent to keep its session alive. It retains conversation context and can be paused/resumed.

**Memory:** Combination approach.
- Claude Code sessions handle conversation persistence (via `claude --resume`).
- SQLite stores structured metadata: profile config, performance history, assignment history, custom data.

### Kanban Auto-Assign

**Trigger:** Moving a task from Backlog → In Progress.

When a task is moved to "In Progress":
1. Konduktor matches task description against agent `skills` tags.
2. Best-match agent is proposed (user can override).
3. On confirm, Konduktor spawns a Claude Code process with the agent's profile config and the task as the prompt.
4. Task status updates in real-time as the agent works.
5. On completion, task auto-moves to Done with the agent's output attached.

**Manual override:** Every task also has an "Assign to Agent" dropdown for direct assignment.

### Agent Delegation (Explicit)

In Phase 5, delegation is manual only:
- User can tell an agent: "Delegate this subtask to [Agent Name]"
- The delegating agent creates a new kanban task assigned to the target agent
- Results flow back to the delegating agent's task

### Deliverables

- [ ] Agent profile CRUD (API + UI page)
- [ ] Agent profile DB schema (SQLite)
- [ ] Agent spawn with profile config (system prompt, model, cwd, tool restrictions)
- [ ] Agent lifecycle management (ephemeral + persistent toggle)
- [ ] Agent performance tracking (auto-computed from task history)
- [ ] Kanban skill-match engine
- [ ] Kanban auto-assign on column move
- [ ] Agent delegation (explicit, via chat)
- [ ] Agent list/detail UI with status indicators
- [ ] Tests for profile management and task assignment

---

## Phase 6: Chat Auto-Configuration (MCP Self-Service)

**Goal:** Users describe what they want in natural language, and Konduktor configures itself — cron jobs, agents, integrations, secrets — all from the chat.

### Konduktor as MCP Server

Konduktor exposes itself as an MCP server that Claude Code can call. When the user says "schedule a daily report at 7 AM", Claude Code uses Konduktor's MCP tools to create the cron job, assign an agent, and configure any needed integrations.

**MCP Tools exposed:**

| Tool | Description |
|------|-------------|
| `konduktor_create_cron` | Create a scheduled job |
| `konduktor_list_crons` | List all cron jobs |
| `konduktor_manage_mcp` | Add/remove MCP servers for Claude Code |
| `konduktor_store_secret` | Store an API key or credential securely |
| `konduktor_create_agent` | Create a new agent profile |
| `konduktor_assign_task` | Assign a kanban task to an agent |
| `konduktor_kanban_create` | Create a kanban task |
| `konduktor_kanban_move` | Move a task between columns |
| `konduktor_get_analytics` | Query token usage and cost data |
| `konduktor_search_history` | Search across session history |

**Example flow:** "I want a monitoring report of my Meta Ads sent to me via Telegram every day at 7 AM."

1. Claude Code asks for Meta Ads API key → user provides → `konduktor_store_secret`
2. Claude Code asks for Telegram bot token → user provides → `konduktor_store_secret`
3. `konduktor_manage_mcp` → adds Telegram MCP server
4. `konduktor_create_agent` → creates "Reporting Agent" with data analysis skills
5. `konduktor_create_cron` → daily at 7 AM, prompt: "Fetch Meta Ads data, generate summary, send via Telegram"
6. `konduktor_assign_task` → assigns the cron job to the Reporting Agent

All from one chat conversation.

### Secrets Management

- Stored at `~/.konduktor/secrets.json`, encrypted at rest.
- Secrets are injected as environment variables into Claude Code processes that need them.
- UI in Settings for viewing (masked) and revoking secrets.
- Secrets are scoped: global or per-agent.

### Delegation Upgrade: Rule-Based

Phase 6 adds rule-based delegation on top of Phase 5's explicit delegation:
- Users define rules: "If task type is `deployment`, always assign to DevOps Agent"
- Rules are evaluated automatically when tasks are created or moved
- Rules are stored per-agent in `delegationRules` and globally in Settings

### Deliverables

- [ ] Konduktor MCP server implementation (stdio transport)
- [ ] MCP tool handlers for all 10 tools listed above
- [ ] Auto-registration: `konduktor setup-mcp` CLI command adds Konduktor to Claude Code's MCP config
- [ ] Secrets storage with encryption
- [ ] Secrets injection into agent/cron processes
- [ ] Secrets management UI (view masked, revoke)
- [ ] Rule-based delegation engine
- [ ] Delegation rules UI (per-agent and global)
- [ ] Tests for MCP tools and secrets management

---

## Phase 7: Networking + Distribution + Community

**Goal:** Multiple Konduktor instances collaborate across machines, the project is published to npm, and the community can share agent profiles and workflows.

### Agent Networking: Hub-Spoke

One Konduktor instance acts as the **hub** (typically your laptop), and others act as **workers** (e.g. VPS, CI server, team machines).

**Architecture:**
- Workers expose the existing REST + WebSocket API (same shape as local).
- Hub connects to workers via WebSocket for real-time updates and REST for commands.
- Hub aggregates all agents, tasks, and sessions into a unified dashboard.

**Worker registration:**
- Hub stores worker connection configs in `~/.konduktor/workers.json`.
- Workers authenticate via shared secret (PIN code, reusing existing LAN auth).
- Hub UI shows worker status (online/offline, load, agent count).

**Task distribution:**
- Hub can dispatch tasks to any worker's agents.
- Kanban auto-assign considers agents across all workers.
- Cron jobs specify which worker should execute them.

**Delegation upgrade: Autonomous.**
- Agents can decide to delegate to agents on other workers based on capability match.
- Example: a frontend agent on your laptop delegates a database migration to a DevOps agent on the VPS.

### npm Publish

- Single package: `konduktor` on npm.
- `npm install -g konduktor` → `konduktor start`.
- CLI bundles server + pre-built client.
- Build pipeline: monorepo for development, bundled for distribution.

### Docs Site

- Built with VitePress (consistent with Vite-based stack).
- Hosted on GitHub Pages.
- Versioned documentation matching npm releases.
- Sections: Getting Started, Agent Profiles, MCP Tools, Networking, API Reference.

### Community Templates

Shareable JSON files importable via UI or CLI:

**Agent profile templates:**
- "Frontend Developer" — React/Next.js specialist
- "DevOps Engineer" — CI/CD, infrastructure, deployment
- "Data Analyst" — reporting, data processing, visualization
- "Code Reviewer" — automated PR review with custom standards
- "Documentation Writer" — generates and maintains docs

**Workflow templates:**
- "Daily Standup Report" — cron + agent + Slack/Telegram notification
- "PR Review Automation" — webhook trigger + code review agent
- "Monitoring Dashboard" — periodic data collection + analytics
- "Dependency Updater" — weekly dependency check + PR creation

**Distribution:** GitHub repository (`konduktor-templates`), importable via:
```bash
konduktor template import <url-or-name>
```

### Team Features

Agent profiles gain team-oriented fields:
- `owner` — creator of the profile
- `visibility` — private (only you) or shared (team can use)
- `forkedFrom` — lineage tracking when duplicating profiles

### Deliverables

- [ ] Worker connection manager (hub side)
- [ ] Worker API exposure with auth (worker side)
- [ ] Hub dashboard aggregation (unified view across workers)
- [ ] Cross-worker task dispatch
- [ ] Autonomous delegation engine
- [ ] npm build pipeline (bundle monorepo → single package)
- [ ] npm publish CI (GitHub Actions)
- [ ] VitePress docs site
- [ ] GitHub Pages deployment
- [ ] Template format specification (JSON schema)
- [ ] Template import/export CLI commands
- [ ] Template gallery UI
- [ ] Pre-built template collection
- [ ] Agent team features (owner, visibility, forkedFrom)
- [ ] Tests for networking, templates, and team features

---

## Summary

| Phase | Core Value | Key Metric |
|-------|-----------|------------|
| 5 | Agents work for you | Tasks auto-completed by agents |
| 6 | Configure by chatting | Zero manual setup needed |
| 7 | Scale across machines | Multi-machine orchestration |
