# Competitive Analysis -- Konduktor

> Date: 2026-10-06

## Direct Competitors

| Tool | Overlap | Why Konduktor Wins |
|------|---------|-------------------|
| Hermes Agent | Highest -- same UI concept | Hermes violates claude.ai ToS (browser automation). Konduktor is legal (CLI). |
| Claudia (AGPL) | High -- Claude orchestrator | AGPL license forces derivatives open. API-only (no subscription). |
| Claude Squad | Medium -- multi-session | Terminal-only, no web UI, no orchestration features. |

## Indirect Competitors

| Tool | Overlap | Differentiation |
|------|---------|-----------------|
| Open Hands | Low -- general AI orchestrator | Not Claude-specific, no Claude Code integration |
| Aider | Low -- AI coding assistant | Terminal-only, multi-model, different UX paradigm |
| Cursor/Windsurf | Low -- IDE-based | IDE extensions, not standalone orchestrator |

## Name Availability

- "Conductor" -- TAKEN by conductor.build (YC S24, $22M raised)
- "Konduktor" -- AVAILABLE (Indonesian spelling)
- npm `konduktor` bare -- taken (v0.1.1 by yakkomajuri)
- npm `@konduktor/*` scoped -- AVAILABLE

## Unique Value Proposition

No existing tool combines ALL of:
1. Claude Code CLI wrapper (legal subscription use)
2. Web dashboard UI (not terminal-only)
3. Open-source (MIT license)
4. Chat-first setup paradigm
5. Claude Artifact integration as output format
6. Dynamic capability discovery (MCP/plugin gap detection)
