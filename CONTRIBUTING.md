# Contributing to Konduktor

Thank you for your interest in contributing to Konduktor! This guide will help you get started.

## Development Setup

### Prerequisites

- Node.js >= 20
- pnpm >= 9
- Claude Code CLI installed and authenticated (`claude --version`)

### Getting Started

```bash
git clone https://github.com/gemimakruva/konduktor.git
cd konduktor
pnpm install
pnpm dev
```

This starts all packages in parallel:
- **Server** at `http://localhost:4170`
- **Client** dev server at `http://localhost:4171` (proxies API to server)

### Running Tests

```bash
pnpm test        # run all tests
pnpm build       # build all packages
```

## Pull Request Process

1. Create a feature branch from `main`
2. Make your changes with clear, focused commits
3. Ensure `pnpm build` and `pnpm test` pass
4. Submit a PR using the PR template

### Commit Messages

Use conventional commits:

```
feat: add new feature
fix: resolve specific bug
docs: update documentation
refactor: restructure without behavior change
test: add or update tests
```

## Project Structure

```
packages/
  shared/    — types and constants (shared by all packages)
  server/    — Express 5 + WebSocket + SQLite backend
  client/    — React 19 + Vite frontend
  cli/       — CLI entry point (konduktor start/stop/status)
```

## Code Style

- TypeScript strict mode
- Keep files under 300 lines — split if they grow beyond that
- Inline styles with CSS custom properties for the client
- No hardcoded secrets or credentials

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
