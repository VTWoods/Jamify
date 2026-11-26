# AGENTS.md

Instructions and project context for AI coding agents working on **Jamify**.

## Project Overview

**Jamify** is a public open-source Progressive Web App (PWA) for managing custom playlists in Spotify using the Google Gemini API and Spotify Web API, backed by SQLite and designed for self-hosted Docker deployment behind Caddy.

- **Repository:** `VTWoods/Jamify` (default branch: `main`)
- **License:** MIT
- **Status:** Tech stack scaffolded (Next.js App Router, PWA shell, SQLite/Drizzle schema & migrations, Docker/Caddy deployment examples). Core Spotify OAuth and Gemini playlist features are next.

## Keeping `AGENTS.md` Up to Date (Required)

Agents working in this repository **must** keep this file accurate and current as part of any change. Whenever a task introduces or modifies any of the following, update `AGENTS.md` in the same commit/PR before finishing:

1. **Features & capabilities** — new playlist management features, UI pages, API routes, or Spotify/Gemini integrations.
2. **Project structure** — new top-level directories, key modules, or config files.
3. **Tech stack & dependencies** — language, runtime, frameworks, package managers, or major libraries.
4. **Commands** — setup, build, run, test, lint, and database migration commands.
5. **Configuration & environment** — new environment variables, auth flows, or local dev prerequisites.
6. **Conventions & architecture** — key design decisions, patterns, or invariants future agents should follow.

Keep updates concise and factual—document what actually exists in the repo, not speculative plans.

## Repository Structure

```text
.
├── AGENTS.md                        # Agent instructions and living project reference
├── Dockerfile                       # Multi-stage production container (Next.js standalone + SQLite)
├── LICENSE                          # MIT License
├── README.md                        # Project overview and quick start
├── .dockerignore                    # Docker build exclusions
├── .env.example                     # Sanitized local environment template
├── .gitignore                       # Ignored build, DB, editor, and secret files
├── drizzle.config.ts                # Drizzle Kit SQLite migration config
├── drizzle/                         # Generated SQLite migration files
├── eslint.config.mjs                # ESLint flat config (next/core-web-vitals + typescript)
├── examples/                        # Sanitized deployment examples (no personal info)
│   ├── README.md                    # Docker + Caddy self-hosting guide
│   ├── caddy/Caddyfile              # Caddy v2 reverse proxy config with automatic HTTPS
│   └── docker/
│       ├── .env.example             # Container environment template
│       └── docker-compose.yml       # Docker Compose service with persistent SQLite volume
├── next.config.ts                   # Next.js config (standalone output, better-sqlite3 external)
├── package.json                     # Dependencies and npm scripts
├── postcss.config.mjs               # Tailwind CSS v4 PostCSS config
├── public/
│   ├── icons/                       # PWA PNG icons (192x192, 512x512)
│   └── sw.js                        # PWA service worker (caches shell, bypasses /api/*)
├── scripts/
│   ├── docker-entrypoint.sh         # Container entrypoint: runs migrations then starts server
│   └── migrate.mjs                  # Applies Drizzle SQLite migrations
├── src/
│   ├── app/
│   │   ├── api/health/route.ts      # GET /api/health (verifies SQLite connectivity)
│   │   ├── globals.css              # Tailwind v4 global styles (dark mode default)
│   │   ├── layout.tsx               # Mobile-first root layout, PWA metadata, SW registration
│   │   ├── manifest.ts              # Next.js Web App Manifest route
│   │   └── page.tsx                 # Starter home page
│   ├── components/
│   │   └── pwa-register.tsx         # Client-side service worker registration
│   ├── db/
│   │   ├── index.ts                 # SQLite singleton (WAL mode, foreign keys) + health check
│   │   ├── index.test.ts            # Vitest unit test for SQLite setup
│   │   └── schema.ts                # Drizzle tables: users, spotify_tokens, playlist_rules
│   └── lib/
│       └── env.ts                   # Server-side Zod environment validation helpers
├── tsconfig.json                    # Strict TypeScript config (@/* -> ./src/*)
└── vitest.config.ts                 # Vitest test runner config
```

## Tech Stack & Dependencies

- **Runtime & Package Manager:** Node.js (20+ locally, `node:22-bookworm-slim` in Docker), `npm`
- **Framework:** Next.js 15 (App Router, `output: "standalone"`), React 19, TypeScript (strict)
- **Styling & Icons:** Tailwind CSS v4 (`@tailwindcss/postcss`), `lucide-react`
- **PWA:** Next.js `src/app/manifest.ts`, `public/sw.js`, `src/components/pwa-register.tsx`
- **Database:** SQLite via `better-sqlite3` (WAL mode + foreign keys) + Drizzle ORM (`drizzle-orm`, `drizzle-kit`)
- **APIs & Validation:** `@google/genai`, `@spotify/web-api-ts-sdk`, `zod`
- **Testing & Linting:** Vitest, ESLint (`eslint-config-next`)

## Common Commands

- **Install:** `npm install`
- **Dev Server:** `npm run dev` (binds to `http://127.0.0.1:3000` for Spotify OAuth loopback compliance)
- **Build:** `npm run build`
- **Start (prod):** `npm run start`
- **Typecheck:** `npm run typecheck`
- **Lint:** `npm run lint`
- **Test:** `npm test` (or `npm run test:watch`)
- **DB Generate Migration:** `npm run db:generate`
- **DB Apply Migrations:** `npm run db:migrate`
- **DB Studio:** `npm run db:studio`

## Environment & Configuration

All secrets are **server-side only** (never prefix secrets with `NEXT_PUBLIC_`). See `.env.example`:

- `APP_URL` — Public base URL (default `http://127.0.0.1:3000`; HTTPS domain in production behind Caddy)
- `DATABASE_PATH` — Path to SQLite file (default `./data/jamify.db`; `/data/jamify.db` in Docker)
- `GEMINI_API_KEY` — Google Gemini API key
- `SPOTIFY_CLIENT_ID` — Spotify Developer App client ID
- `SPOTIFY_CLIENT_SECRET` — Spotify Developer App client secret
- `SESSION_SECRET` — 32+ char random secret for session signing and token encryption
- `ALLOWED_SPOTIFY_USER_IDS` — Optional comma-separated Spotify user ID allowlist

## Conventions & Architecture

- **Server-only secrets & API calls:** All Gemini and Spotify API requests must execute in server-side Route Handlers (`src/app/api/**`) or Server Actions. Never expose API keys or OAuth tokens to the browser.
- **PWA caching invariant:** `public/sw.js` must never cache `/api/*` routes or non-GET requests.
- **SQLite & Docker:** Keep `better-sqlite3` in `serverExternalPackages` in `next.config.ts`. Any schema change in `src/db/schema.ts` must be paired with `npm run db:generate` so `scripts/migrate.mjs` applies it automatically on container startup.
- **Public repository hygiene:** Never commit personal domains, emails, IP addresses, Spotify IDs, `.env` files, or `.db` files. Use generic placeholders (`jamify.example.com`, `your_*`) in all examples and docs.

## Git Workflow

- Default branch is `main`.
- Write clear, concise commit messages describing what changed and why.
- Before committing, run `npm run typecheck`, `npm run lint`, `npm test`, and `npm run build`, and confirm `AGENTS.md` reflects any structural or feature changes.
