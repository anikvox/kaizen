# Kaizen

**[kaizen.apps.sandipan.dev](https://kaizen.apps.sandipan.dev)** · Focus that Follows You

A privacy-first browser extension that tracks where your attention actually goes and gently helps you stay on track — without blocking content or enforcing rigid workflows.

Built by CS students with ADHD who wanted a tool that understands attention patterns, not one that locks you out.

---

## Screenshots

<p align="center">
  <img src="apps/web/public/screenshots/extension-sidepanel.png" alt="Extension Side Panel" width="280" />
  &nbsp;&nbsp;
  <img src="apps/web/public/screenshots/focus-nudge.png" alt="Focus Guardian Nudge" width="400" />
</p>

<p align="center">
  <em>Left: Extension side panel with focus tracking and growing tree. Right: Gentle nudge when you drift.</em>
</p>

---

## Features

- **Cognitive Attention Tracking** — Knows what you're reading, watching, and listening to — not just which tabs are open
- **Focus Guardian Agent** — Detects doomscrolling and distraction patterns, sends supportive nudges instead of blocking
- **AI Chat with Memory** — Ask "What was I reading about today?" and get context-aware answers from your browsing history
- **Auto-Generated Quizzes** — Turn passive reading into active recall with knowledge verification quizzes
- **Insights & Achievements** — Track streaks, milestones, and focus patterns over time
- **Privacy-First** — Your data stays yours. Optional local LLM support for fully on-device processing

---

## How It Works

**Attention Sensors** — The extension tracks where your attention goes:
- Text: paragraphs read, scroll patterns, reading time
- Images: hover duration with auto-generated Vision LLM captions
- Audio/Video: playback time, active listening

**Multi-Agent System** — Four coordinated AI agents:
| Agent | Purpose |
|-------|---------|
| Focus Agent | Monitors patterns, detects drift, sends gentle nudges |
| Chat Agent | Answers questions about your browsing with tool-calling |
| Quiz Agent | Generates quizzes from what you've read |
| Summarization Agent | Builds contextual memory of your exploration |

**Adaptive Nudges** — When you drift, you get a soft pulse banner, not a wall. Nudge sensitivity learns from your feedback.

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| Extension | Plasmo, React, TypeScript |
| Backend | Hono, Prisma, PostgreSQL |
| Real-time | Server-Sent Events (SSE) |
| Auth | Clerk (web), device token handshake (extension) |
| AI | Gemini, with multi-provider support via Vercel AI SDK |
| Observability | [Comet Opik](https://www.comet.com/site/products/opik/) |

---

## Architecture

```
kaizen/
├── apps/
│   ├── api/            # Hono backend (agents, SSE, jobs)
│   ├── web/            # Next.js dashboard
│   └── extension/      # Plasmo browser extension
├── packages/
│   ├── api-client/     # Shared typed API client
│   └── ui/             # Shared components
└── deployment/         # Ansible config
```

---

## Development

### Prerequisites

- Node.js 22+ / pnpm 9+
- Docker
- [Just](https://github.com/casey/just) + [Overmind](https://github.com/DarthSim/overmind)

Or run `nix develop` for a pre-configured shell.

### Quick Start

```bash
pnpm install
just dev-up
```

### Loading the Extension

1. Run `just dev-up` or `pnpm --filter @kaizen/extension dev`
2. Go to `chrome://extensions` → Enable Developer mode
3. Load unpacked → Select `apps/extension/build/chrome-mv3-dev`

### Ports

| Service | Port |
|---------|------|
| Web | 60091 |
| API | 60092 |
| PostgreSQL | 60093 |

---

## Environment Variables

Copy `.env.example` to `.env`:

```bash
DATABASE_URL="postgresql://kaizen:kaizen_password@localhost:60093/kaizen"

# Clerk
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_...
CLERK_SECRET_KEY=sk_...

# API URLs
NEXT_PUBLIC_KAIZEN_API_URL=http://localhost:60092
PLASMO_PUBLIC_KAIZEN_API_URL=http://localhost:60092

# AI
GEMINI_API_KEY=...
ENCRYPTION_KEY=...  # For user-provided API keys

# Observability (optional)
OPIK_API_KEY=...
```

The extension defaults to production URLs if `PLASMO_PUBLIC_*` vars aren't set at build time.

---

## Deployment

```bash
just deploy        # Full deployment
just deploy-quick  # Deploy only
just deploy-logs   # View logs
```

| Environment | URL |
|-------------|-----|
| Dashboard | https://kaizen.apps.sandipan.dev |
| API | https://api.kaizen.apps.sandipan.dev |

---

## Credits

Built with [Claude Code](https://claude.ai/code). All prompts in [prompts.md](./prompts.md).

## License

MIT
