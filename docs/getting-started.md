# Getting Started with Konduktor

A step-by-step guide to installing and running Konduktor on **macOS** and **Windows**.

---

## Prerequisites

| Requirement | Check | Install |
|-------------|-------|---------|
| **Node.js >= 20** | `node --version` | [nodejs.org](https://nodejs.org/) |
| **pnpm >= 9** | `pnpm --version` | `npm install -g pnpm` |
| **Claude Code CLI** | `claude --version` | `npm install -g @anthropic-ai/claude-code` |
| **Claude subscription** | `claude auth status` | Pro, Team, or Enterprise plan |

---

## Installation

### macOS (Terminal)

```bash
git clone https://github.com/gemimakruva/konduktor.git
cd konduktor
pnpm install
pnpm build
```

### Windows (PowerShell)

```powershell
git clone https://github.com/gemimakruva/konduktor.git
cd konduktor
pnpm install
pnpm build
```

> **Note:** On Windows, use PowerShell or Git Bash. Command Prompt works too but PowerShell is recommended.

---

## Running Konduktor

After install and build, you have three ways to start:

### Option 1: Quick Start (recommended)

```bash
pnpm start
```

This starts the server and opens the dashboard in your browser automatically.

### Option 2: CLI Commands

```bash
# Start the server (runs in background)
node packages/cli/dist/index.js start

# Start and auto-open browser
node packages/cli/dist/index.js start --open

# Check if server is running
node packages/cli/dist/index.js status

# Stop the server
node packages/cli/dist/index.js stop

# Open dashboard in browser (if server is already running)
node packages/cli/dist/index.js open
```

### Option 3: Development Mode

```bash
pnpm dev
```

This starts both the API server and the Vite dev server with hot reload. Use this when developing Konduktor itself.

| Mode | URL | Use case |
|------|-----|----------|
| Production (`pnpm start`) | http://localhost:4170 | Normal usage |
| Development (`pnpm dev`) | http://localhost:4171 | Contributing / development |

---

## Create a Shortcut (One-Time Setup)

Set up a short command so you can start Konduktor from anywhere.

### macOS / Linux (Bash or Zsh)

Add this to your `~/.bashrc` or `~/.zshrc`:

```bash
alias konduktor='node /full/path/to/konduktor/packages/cli/dist/index.js'
```

Replace `/full/path/to/konduktor` with the actual path where you cloned the repo. To find it:

```bash
cd konduktor
pwd
```

Then reload your shell:

```bash
source ~/.bashrc    # or source ~/.zshrc
```

Now you can use:

```bash
konduktor start     # Start server
konduktor start -o  # Start and open browser
konduktor stop      # Stop server
konduktor status    # Check status
konduktor open      # Open in browser
```

### Windows (PowerShell)

Add a function to your PowerShell profile:

```powershell
# Open your profile (creates it if it doesn't exist)
if (!(Test-Path -Path $PROFILE)) { New-Item -ItemType File -Path $PROFILE -Force }
notepad $PROFILE
```

Add this line (replace the path):

```powershell
function konduktor { node "C:\Users\YourName\konduktor\packages\cli\dist\index.js" $args }
```

Save, close, and reopen PowerShell. Now you can use:

```powershell
konduktor start     # Start server
konduktor start -o  # Start and open browser
konduktor stop      # Stop server
konduktor status    # Check status
konduktor open      # Open in browser
```

### Windows Desktop Shortcut

1. Right-click Desktop > **New** > **Shortcut**
2. Location: `node "C:\Users\YourName\konduktor\packages\cli\dist\index.js" start --open`
3. Name: **Konduktor**
4. Double-click to start Konduktor and open the dashboard

---

## Verify Setup

After starting, open http://localhost:4170 in your browser. You should see:

1. **Sidebar** with navigation links (Chat, Sessions, Agents, etc.)
2. **Chat panel** with a green "Connected" indicator
3. **"by Makruva"** in the bottom-left corner

If you see "Disconnected" — the server isn't running. Check your terminal for errors.

---

## Using the Chat

The chat is the main interface for talking to Claude Code through Konduktor.

### Basic Conversation

1. Navigate to **Chat** in the sidebar
2. Type a prompt in the input box at the bottom
3. Press **Enter** or click **Send**
4. The response streams in real-time

**Multi-tab:** Click **+** in the tab bar to open a new chat session. Each tab is independent — you can work on different tasks in parallel.

### What You'll See in Responses

**Thinking blocks** — When Claude uses extended thinking, a collapsible `▶ Thinking...` block appears. Click to expand and see the reasoning process.

**Tool cards** — When Claude uses tools (Read, Edit, Bash, etc.), inline cards show up with the tool name and its primary argument:
- `Read: package.json`
- `Bash: npm test`
- `Edit: src/app.ts`

Click a card to see the full input and output.

### Chat Use Cases

**Ask Claude to edit code:**
```
Read src/index.ts and add input validation to the createUser function
```

**Run shell commands:**
```
Run the test suite and show me which tests are failing
```

**Multi-step tasks:**
```
Find all TODO comments in the codebase, create a summary, and add them as tasks to the kanban board
```

**Code review:**
```
Review the changes in the current git diff and suggest improvements
```

---

## Configuring Settings

Navigate to **Settings** in the sidebar. All changes save automatically.

### Theme

Choose **Light**, **Dark**, or **System** (follows your OS preference). Changes apply immediately.

### Max Concurrent Sessions

Controls how many chat sessions can stream responses at the same time (1–10). Default is 3.

**When to change:** If you frequently use multiple tabs and want more parallel Claude responses, increase this. Lower it if you want to conserve your API usage.

### LAN Access

Enable to allow other devices on your network to access Konduktor.

**Use case:** You're running Konduktor on a desktop but want to monitor sessions from your laptop or phone.

After enabling, Konduktor listens on `0.0.0.0` instead of `127.0.0.1`. Other devices can access it at `http://<your-ip>:4170`.

> **Note:** Takes effect on the next server restart.

### Desktop Notifications

Enable browser notifications when a chat session or cron job finishes.

**Use case:** You start a long-running task, switch to another app, and get a desktop notification when Claude is done.

**Setup:**
1. Toggle **Desktop notifications** on
2. Browser will ask for notification permission — click **Allow**
3. Notifications fire only when the Konduktor tab is **not** focused

If your browser blocks notifications, you'll see a message with instructions to enable them in browser settings.

---

## Managing Sessions

Navigate to **Sessions** to see all Claude Code sessions:

- **Green dot** — session is active
- **Yellow dot** — session is idle
- **Stop** — terminate a running session
- **Remove** — remove a session from the list

---

## Kanban Board

Navigate to **Kanban** for a visual task board with three columns: **To Do**, **In Progress**, **Done**.

**Use case:** Track development tasks alongside your Claude Code sessions. Create tasks manually or ask Claude to create them via chat.

---

## Cron Scheduling

Navigate to **Schedules** to set up recurring Claude Code tasks.

### Example: Daily Code Review

1. Click **New Job**
2. **Name:** `daily-review`
3. **Schedule:** `0 9 * * *` (every day at 9 AM)
4. **Prompt:** `Review any uncommitted changes in the working directory and summarize potential issues`
5. **Working directory:** `/path/to/your/project`
6. Click **Save**

### Example: Hourly Health Check

1. Click **New Job**
2. **Name:** `health-check`
3. **Schedule:** `0 * * * *` (every hour)
4. **Prompt:** `Run the test suite and report any failures`
5. Click **Save**

Use **Run Now** to test a job manually before enabling the schedule.

---

## Analytics

Navigate to **Analytics** to see:
- Token usage over time (input, output, cache)
- Cost breakdown by model
- Session duration trends

Filter by date range to analyze specific periods.

---

## Search

Navigate to **Search** to find messages across all sessions. Type a keyword and browse matching results with context snippets.

---

## Data Export

Navigate to **Export** to download your data:
- **Sessions** — all chat history
- **Analytics** — token usage and cost data
- **Cron** — job definitions and execution history

Available formats: **JSON** (structured) and **CSV** (spreadsheet-friendly).

---

## Agent Profiles

Navigate to **Agents** to create and manage agent profiles.

Each agent is a reusable configuration with a name, system prompt, model, working directory, and skill tags. When you move a kanban task to "In Progress", Konduktor matches it to the best-fit agent based on skills.

### Creating an Agent

1. Click **New Agent**
2. **Name:** `Frontend Dev`
3. **System Prompt:** `You are a frontend developer specializing in React and TypeScript`
4. **Model:** (optional) override the default Claude model
5. **Skills:** `frontend, react, typescript`
6. Click **Save**

---

## MCP Integration

Konduktor can register itself as an MCP server for Claude Code. This lets Claude configure Konduktor through natural language — creating cron jobs, storing secrets, and managing agents, all from chat.

### Setup

```bash
# After building, register Konduktor as an MCP server
node packages/cli/dist/index.js setup-mcp

# Or if you set up the alias:
konduktor setup-mcp
```

This adds Konduktor to Claude Code's MCP configuration. After restarting Claude Code, you can say things like:

- "Schedule a daily report at 7 AM"
- "Store my API key as a secret"
- "Create a DevOps agent"

---

## Secrets Management

Navigate to **Settings** and scroll to the **Secrets** section.

Secrets are encrypted credentials (API keys, tokens) that get injected as environment variables into agent and cron processes.

### Adding a Secret

1. **Name:** Enter an uppercase name like `OPENAI_API_KEY`
2. **Value:** Paste the credential (shown as a password field)
3. **Scope:** Choose **Global** (available to all agents) or a specific agent
4. Click **Add**

Secrets are encrypted with AES-256-GCM and stored at `~/.konduktor/secrets.json`. The encryption key is in `~/.konduktor/.keyfile` (auto-generated, 0600 permissions).

### Revoking a Secret

Click **Revoke** next to any secret to permanently delete it.

---

## Capabilities

Navigate to **Capabilities** to see what tools and integrations Claude Code has access to: MCP servers, plugins, skills, and tools.

---

## Troubleshooting

### "Disconnected" in chat

- Ensure the server is running: `konduktor status`
- Check port 4170 isn't used: `lsof -i :4170` (macOS/Linux) or `netstat -ano | findstr 4170` (Windows)
- Restart: `konduktor stop && konduktor start`

### Claude Code not detected

- Verify installation: `claude --version`
- Authenticate: `claude auth login`
- Ensure `claude` is in your system PATH

### Page loads but shows no data

- The server must be built first: `pnpm build`
- Check the server logs in your terminal for errors

### Notifications not working

- Check browser notification permissions in browser settings
- Ensure the toggle is enabled in Konduktor Settings
- Notifications only fire when the Konduktor tab is **not** in focus

### Windows: `node` not recognized

- Ensure Node.js is installed and added to PATH
- Restart PowerShell after installing Node.js
- Try: `where node` to verify it's accessible

### macOS: Permission denied

```bash
chmod +x packages/cli/dist/index.js
```

---

## Updating

```bash
cd konduktor
git pull
pnpm install
pnpm build
konduktor stop
konduktor start -o
```

---

## License

MIT — PT Makruva Teknologi Nusantara
