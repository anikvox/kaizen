# Kaizen

A privacy-first Chrome extension for personal growth and learning, designed for people who spend most of their time in the browser.
Kaizen helps you stay focused and retain more of what you consume online — without blocking content or forcing rigid workflows.
We use [Comet Opik](https://www.comet.com/site/products/opik/) for observability, enabling us to trace prompts, inspect model responses, and continuously improve output quality. Privacy is a core principle, with an option to run inference on a local LLM so your data stays on-device.

## Features

- **Focus Tracking** — Monitor your attention across websites, articles, videos, and audio content
- **AI-Powered Insights** — Get summaries, rewrites, and context-aware assistance powered by Gemini
- **Achievement System** — Earn milestones and track streaks to stay motivated
- **Pomodoro Timer** — Built-in focus sessions with customizable work/break cycles
- **Privacy-First** — Optional local LLM support keeps your data on-device and GDPR compliant

## Development

### Prerequisites

- Node.js 22+
- pnpm
- Docker
- [Just](https://github.com/casey/just)
- [Overmind](https://github.com/DarthSim/overmind)

- or, just use the Nix Flake and run `nix develop` to get a dev shell with everything set up

### Monorepo Structure

```
kaizen/
├── apps/
│   ├── api/            # Hono REST + SSE server
│   ├── web/            # Next.js dashboard
│   └── extension/      # Plasmo browser extension
├── packages/
│   └── api-client/     # Shared typed API client
```

### Setup

```bash
pnpm install
just dev-up
```

### Commands

| Command | Description |
|---------|-------------|
| `just dev-up` | Start postgres, run migrations, start all apps |
| `just dev-down` | Stop everything, remove db volume |
| `just clean` | Full reset (nuke + reinstall) |
| `just db-migrate <name>` | Create Prisma migration |
| `just db-studio` | Open Prisma Studio |

### Ports

| Service | Port |
|---------|------|
| Web | 60091 |
| API | 60092 |
| PostgreSQL | 60093 |
