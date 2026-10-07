# Getting Started with Konduktor

A complete guide to installing, configuring, and using Konduktor — the open-source orchestrator for Claude Code.

## Prerequisites

Before installing Konduktor, ensure you have:

- **Node.js >= 20** — check with `node --version`
- **pnpm >= 9** — install with `npm install -g pnpm`
- **Claude Code CLI** — install from [Anthropic](https://docs.anthropic.com/en/docs/claude-code). Verify with `claude --version`
- **Active Claude subscription** — Pro, Team, or Enterprise plan

## Installation

```bash
git clone https://github.com/gemimakruva/konduktor.git
cd konduktor
pnpm install
pnpm build
```

## Starting Konduktor

```bash
pnpm dev
```

This starts the server on `http://localhost:4170` and the client dev server on `http://localhost:4171`.

For production use:

```bash
pnpm build
node packages/server/dist/index.js
```

Open **http://localhost:4170** in your browser. You should see the Konduktor dashboard with a sidebar navigation and a connection indicator.

---

## Features Walkthrough

### Chat & Sessions

#### Streaming Chat

The chat interface is the primary way to interact with Claude Code through Konduktor.

1. Navigate to **Chat** in the sidebar
2. Type a prompt in the message input at the bottom
3. Press Enter or click Send
4. Watch the response stream in real-time with a blinking cursor

**Expected behavior:**
- Messages appear incrementally as Claude responds
- The connection indicator (top of chat area) shows a green dot when connected
- Assistant responses render in monospace font

#### Multi-Tab Sessions

You can run multiple chat sessions in parallel using tabs.

1. Click the **+** button in the tab bar above the chat
2. Each tab is an independent session with its own conversation history
3. Switch between tabs to manage different tasks
4. Close a tab with the **×** button

**Expected behavior:**
- Each tab maintains its own message history
- Streaming in one tab continues while you switch to another
- The active tab is visually highlighted

#### Thinking Blocks

When Claude uses extended thinking, the thought process is shown as collapsible blocks.

1. Send a complex prompt that triggers extended thinking
2. Look for the **▶ Thinking...** block in the response
3. Click it to expand and read the thinking process
4. Click again to collapse

**Expected behavior:**
- Thinking blocks appear collapsed by default
- Expanding reveals the full thinking text in dimmed monospace
- The triangle rotates 90° when expanded

#### Tool Use Visualization

When Claude uses tools (Read, Edit, Bash, etc.), each tool call appears as an inline card.

1. Send a prompt that requires tool use (e.g., "read the package.json")
2. Tool cards appear showing the tool name and primary argument (e.g., `Read: package.json`)
3. Click a tool card to expand it
4. Expanded view shows INPUT (JSON) and RESULT sections

**Expected behavior:**
- Known tools show their primary argument: Read/Edit/Write show file_path, Bash shows command, WebSearch shows query
- Long arguments are truncated to 60 characters with "..."
- A "running..." indicator appears before the result arrives
- Unknown tools fall back to showing the first input value

#### Session Management

1. Navigate to **Sessions** in the sidebar
2. View all active and past sessions
3. Stop a running session with the Stop button
4. Resume a previous session by selecting it

**Expected behavior:**
- Active sessions show a running indicator
- Stopped sessions remain in the list for reference

---

### Orchestration

#### Kanban Board

A visual task board for organizing work.

1. Navigate to **Kanban** in the sidebar
2. View columns: To Do, In Progress, Done
3. Create new tasks with the Add button
4. Move tasks between columns

**Expected behavior:**
- Tasks persist across page reloads (stored in SQLite)
- Each task shows its title and can be edited

#### Agent Watch

Monitor Claude Code subagent activity.

1. Navigate to **Agents** in the sidebar
2. View detected agent processes
3. See agent status and session associations

**Expected behavior:**
- Shows currently running Claude Code processes
- Updates reflect actual system state

#### Cron Job Scheduling

Schedule recurring Claude Code prompts.

1. Navigate to **Schedules** in the sidebar
2. Click **New Job** to create a scheduled task
3. Fill in:
   - **Name** — descriptive label
   - **Schedule** — cron expression (e.g., `0 9 * * *` for daily at 9 AM)
   - **Prompt** — the instruction for Claude
   - **Working directory** — optional, defaults to server cwd
   - **Model** — optional model override
4. Toggle jobs on/off with the enable switch
5. Use **Run Now** to trigger a job manually

**Expected behavior:**
- Cron expressions are validated before saving
- Enabled jobs run automatically on schedule
- Execution history shows status (completed/failed), output, and timing
- A desktop notification fires when a cron job completes (if enabled in settings)

---

### Data

#### Analytics Dashboard

Track token usage and costs across all sessions.

1. Navigate to **Analytics** in the sidebar
2. View charts showing:
   - Token usage over time (input, output, cache)
   - Cost breakdown by model
   - Session duration trends
3. Filter by date range

**Expected behavior:**
- Charts render with Recharts
- Data aggregates from all sessions including cron executions
- Cost estimates are based on token counts and model pricing

#### Artifact Gallery

Browse and manage Claude Artifacts saved during sessions.

1. Navigate to **Artifacts** in the sidebar
2. View artifacts in a card grid
3. Filter by tags using the tag bar
4. Click a card to preview the artifact in a modal
5. Pin important artifacts for quick access
6. Toggle pin status with the pin button

**Expected behavior:**
- Artifacts are detected automatically from Claude Code output
- Each card shows title, icon, description, and tags
- Tag filtering updates the grid in real-time
- A toast notification appears in chat when an artifact is saved

#### Data Export

Export your data for backup or analysis.

1. Navigate to **Export** in the sidebar
2. Choose what to export:
   - Sessions and chat history
   - Analytics data
   - Cron jobs and execution history
3. Select format (JSON or CSV)
4. Download the export file

**Expected behavior:**
- Exports reflect current database state
- JSON exports are pretty-printed
- CSV exports use standard comma-separated format

#### Search

Full-text search across sessions and messages.

1. Navigate to **Search** in the sidebar
2. Type a search query
3. View matching results with context snippets
4. Click a result to navigate to that session

**Expected behavior:**
- Search covers message content across all sessions
- Results show the matching text with surrounding context

---

### Settings & Notifications

#### Settings Page

Configure Konduktor's behavior.

1. Navigate to **Settings** in the sidebar
2. Available settings:
   - **Theme** — light, dark, or system (follows OS preference)
   - **Max concurrent sessions** — limit parallel sessions (1-10)
   - **LAN access** — allow connections from other devices on your network
   - **Desktop notifications** — enable browser notifications for completions
3. Changes save automatically with a "Settings saved" confirmation

**Expected behavior:**
- Theme changes apply immediately
- LAN access changes take effect on server restart
- Settings persist in `~/.konduktor/settings.json`

#### Desktop Notifications

Get notified when sessions or cron jobs complete while you're in another tab.

1. Go to **Settings** and enable **Desktop notifications**
2. Your browser will prompt for notification permission — click Allow
3. Switch to another tab or window
4. When a chat session or cron job completes, a browser notification appears

**Expected behavior:**
- Notifications only fire when the Konduktor tab is NOT focused
- If browser permission is denied, the toggle reverts and shows an error
- If notifications are blocked at the browser level, a help message appears
- Toggling the setting takes effect immediately (no page refresh needed)

#### Capabilities Discovery

View what tools and integrations Claude Code has access to.

1. Navigate to **Capabilities** in the sidebar
2. View detected capabilities grouped by type:
   - MCP servers
   - Plugins
   - Skills
   - Tools
3. See installation status and configuration requirements

**Expected behavior:**
- Capabilities are detected from the Claude Code CLI
- Status shows installed, available, or missing

---

## Configuration

All configuration is managed through the **Settings** page in the web UI. Settings are stored at `~/.konduktor/settings.json` and created automatically on first run.

## Ports

| Service | Port | Description |
|---------|------|-------------|
| Server | 4170 | API + WebSocket + static files |
| Client (dev) | 4171 | Vite dev server (proxies to 4170) |

## Troubleshooting

### "Disconnected" indicator in chat

- Ensure the server is running (`pnpm dev` or `node packages/server/dist/index.js`)
- Check that port 4170 is not in use by another process
- Look at the terminal for server error messages

### Claude Code not detected

- Verify Claude Code CLI is installed: `claude --version`
- Ensure you're authenticated: `claude auth status`
- The CLI must be in your system PATH

### Cron jobs not running

- Check that the cron expression is valid (standard 5-field format)
- Verify the job is enabled (toggle is on)
- Check execution history for error output
- Ensure Claude Code CLI is accessible from the server's environment

### Desktop notifications not working

- Check browser notification permissions in browser settings
- Ensure the setting is enabled in Konduktor Settings
- Notifications only fire when the tab is not focused — try switching tabs

## License

MIT — PT Makruva Teknologi Nusantara
