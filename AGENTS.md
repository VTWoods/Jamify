# AGENTS.md

Instructions and project context for AI coding agents working on **Jamify**.

## Project Overview

**Jamify** is a public open-source Progressive Web App (PWA) for managing custom playlists in Spotify using the Google Gemini API and Spotify Web API, backed by SQLite and designed for self-hosted Docker deployment behind Caddy.

- **Repository:** `VTWoods/Jamify` (default branch: `main`)
- **License:** MIT
- **Status:** Core features implemented — Spotify OAuth with encrypted token storage, hourly-refreshed Spotify Assets Dashboard tab (listening history, liked songs, followed artists, personal playlists with tap-to-manage actions), and Gemini Recommendations tab (`gemini-4-hydrogen` default + `gemini-3.5-flash` fallback via reliable SQLite-backed background jobs).

## Keeping `AGENTS.md` Up to Date (Required)

Agents working in this repository **must** keep this file accurate and current as part of any change. Whenever a task introduces or modifies any of the following, update `AGENTS.md` in the same commit/PR before finishing:

1. **Features & capabilities** — new playlist management features, UI pages, API routes, or Spotify/Gemini integrations.
2. **Project structure** — new top-level directories, key modules, or config files.
3. **Tech stack & dependencies** — language, runtime, frameworks, package managers, or major libraries.
4. **Commands** — setup, build, run, test, lint, and database migration commands.
5. **Configuration & environment** — new environment variables, auth flows, or local dev prerequisites.
6. **Conventions & architecture** — key design decisions, patterns, or invariants future agents should follow.

Keep updates concise and factual—document what actually exists in the repo, not speculative plans.

## Features Implemented

1. **Spotify OAuth 2.0 & Session Auth:** Server-side Authorization Code flow (`/api/auth/spotify/login`, `/api/auth/spotify/callback`, `/api/auth/logout`, `/api/auth/me`) with dynamic request-origin redirect URI matching (`x-forwarded-proto`/`x-forwarded-host` for Caddy or client `Host` header, falling back to `APP_URL`), AES-256-GCM encrypted access/refresh tokens in SQLite, HMAC-SHA256 signed `HttpOnly` session cookies, automatic token refresh, and optional `ALLOWED_SPOTIFY_USER_IDS` allowlist.
2. **Spotify Assets Tab (`SpotifyAssetsTab`):** Mobile dashboard summarizing Listening History (accumulates full play history indefinitely in SQLite across hourly syncs, displaying up to the newest 1,000 plays in the UI, since Spotify's recently-played API returns 50 per fetch), Liked Songs, Followed Artists, and Personal Playlists cached in SQLite. Automatically refreshes from Spotify every hour (plus manual "Sync now" and visibility-based staleness check). Tapping any summary card opens a filterable management view to unlike songs, unfollow artists, inspect playlist tracks, edit owned playlist names/descriptions, remove tracks from owned playlists, and remove/unfollow playlists from the user's Spotify profile.
3. **Gemini Recommendations Tab (`GeminiRecommendationsTab`):** Uses the synced Spotify library as context to recommend unheard artists (strictly excluding known artists) and curated custom playlists ready for one-tap **Follow** or **Add to Spotify**. Runs reliably as a SQLite-persisted background job kicked off by the **Refresh** button: defaults to `gemini-4-hydrogen` via the `@google/genai` Interactions API (`background: true`) with crash/restart recovery via persisted `geminiInteractionId`, and automatically falls back to `gemini-3.5-flash` on token/quota limits or API errors.
4. **Preset Commute & Weekly Discovery Playlists Tab (`CommutePlaylistsTab` + 1 AM Server Scheduler):** Maintains three constant ~1-hour Spotify playlists — **Morning Commute** (upbeat, higher-tempo, followed artists only), **Evening Commute** (chill, relaxing, followed artists only), and **Weekly Discovery** (newer/fresh songs from unfollowed artists similar to followed artists). A Next.js server-side scheduler (`src/instrumentation.ts` -> `src/lib/commute-scheduler.ts`) runs every Sunday at 1:00 AM (`TZ`) to generate 5 weekday editions (Mon–Fri) for Morning/Evening plus 1 weekly Discovery edition via Gemini (`gemini-4-hydrogen` default + `gemini-3.5-flash` fallback with transient 503 backoff) saved in SQLite (`commute_daily_editions`), syncs Weekly Discovery once on Sunday, and rotates Morning/Evening in Spotify (`PUT /v1/playlists/{id}/items`) every weekday (Mon–Fri) at 1:00 AM. Supports manual "Generate Week", "Sync to Spotify", and Auto ON/Paused toggles at `/commute/morning`, `/commute/evening`, and `/commute/discovery`.

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
│   │   ├── api/
│   │   │   ├── auth/                # Spotify OAuth login, callback, logout, me
│   │   │   ├── commute/             # GET state, POST generate, POST apply, PATCH config
│   │   │   ├── health/route.ts      # GET /api/health (verifies SQLite connectivity)
│   │   │   ├── recommendations/     # GET state, POST refresh, POST playlists/[id]/add
│   │   │   └── spotify/             # Assets sync/fetch, liked-songs, followed-artists, playlists
│   │   ├── commute/                 # /commute & /commute/[kind] (morning | evening | discovery)
│   │   ├── gemini/                  # /gemini & /gemini/[view] (artists | playlists)
│   │   ├── spotify/                 # /spotify, /spotify/[section], /spotify/playlists/[playlistId]
│   │   ├── globals.css              # Tailwind v4 global styles (dark mode default)
│   │   ├── layout.tsx               # Mobile-first root layout, PWA metadata, SW registration
│   │   ├── manifest.ts              # Next.js Web App Manifest route
│   │   └── page.tsx                 # Server entry loading session user into JamifyApp
│   ├── components/
│   │   ├── commute-playlists-tab.tsx# Constant Morning/Evening commute UI & weekday previews
│   │   ├── gemini-recommendations-tab.tsx # Gemini discovery UI, polling, Follow & Add to Spotify
│   │   ├── jamify-app.tsx           # Authenticated PWA shell & bottom tab navigation
│   │   ├── pwa-register.tsx         # Client-side service worker registration
│   │   └── spotify-assets-tab.tsx   # Spotify dashboard, hourly sync & asset management UI
│   ├── db/
│   │   ├── index.ts                 # SQLite singleton (WAL mode, foreign keys) + health check
│   │   ├── index.test.ts            # Vitest unit test for SQLite setup
│   │   └── schema.ts                # Drizzle tables (users, tokens, Spotify cache, Gemini & commute tables)
│   ├── instrumentation.ts           # Next.js server startup hook launching the 1 AM commute scheduler
│   ├── lib/
│   │   ├── auth.ts                  # Session cookies, Spotify OAuth scopes & allowlist helpers
│   │   ├── commute-playlists.ts     # Weekly 5-day Gemini commute generator & Spotify rotator
│   │   ├── commute-schedule-clock.ts# Timezone-aware Sunday 1 AM & weekday 1 AM clock helpers
│   │   ├── commute-scheduler.ts     # Minute-tick server scheduler for automatic generation/rotation
│   │   ├── crypto.ts                # AES-256-GCM token encryption & HMAC session signing
│   │   ├── env.ts                   # Server-side Zod environment validation helpers
│   │   ├── gemini-recommendations.ts# Reliable Gemini background job runner & fallback logic
│   │   ├── spotify.ts               # Spotify API client, token refresh & catalog search helpers
│   │   └── spotify-sync.ts          # Hourly SQLite Spotify asset sync & snapshot queries
│   └── types/
│       └── jamify.ts                # Shared frontend/API TypeScript interfaces
├── tsconfig.json                    # Strict TypeScript config (@/* -> ./src/*)
└── vitest.config.ts                 # Vitest test runner config
```

## Tech Stack & Dependencies

- **Runtime & Package Manager:** Node.js (20+ locally, `node:22-bookworm-slim` in Docker), `npm`
- **Framework:** Next.js 15 (App Router, `output: "standalone"`), React 19, TypeScript (strict)
- **Styling & Icons:** Tailwind CSS v4 (`4.1.11` pinned for Node 20 compatibility), `lucide-react`
- **PWA:** Next.js `src/app/manifest.ts`, `public/sw.js`, `src/components/pwa-register.tsx`
- **Database:** SQLite via `better-sqlite3` (WAL mode + foreign keys) + Drizzle ORM (`drizzle-orm`, `drizzle-kit`)
- **APIs & Validation:** `@google/genai` (`^3.5.0`, GA Interactions API), `@spotify/web-api-ts-sdk`, `zod`
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
- `SESSION_SECRET` — 32+ char random secret for session signing and AES-256-GCM token encryption
- `ALLOWED_SPOTIFY_USER_IDS` — Optional comma-separated Spotify user ID allowlist
- `TZ` — Optional IANA timezone (e.g., `America/New_York`) so Sunday 1:00 AM generation and Mon–Fri 1:00 AM rotations run in local time inside Docker (`tzdata` is installed in the container)

## Conventions & Architecture

- **Server-only secrets & API calls:** All Gemini and Spotify API requests must execute in server-side Route Handlers (`src/app/api/**`) or Server Actions. Never expose API keys or OAuth tokens to the browser.
- **Spotify Web API (2026 spec):** Use `/v1/playlists/{id}/items` (reading `entry.item ?? entry.track` and deleting with `{ items: [{ uri }] }`), `/v1/me/playlists` for creating playlists, and `/v1/me/library?uris=...` (`PUT`/`DELETE`) for saving/removing tracks and following/unfollowing artists. Do not use deprecated `/playlists/{id}/tracks`, `/users/{id}/playlists`, or `DELETE /me/tracks` / `PUT|DELETE /me/following` endpoints.
- **Gemini model policy:** Default to `gemini-4-hydrogen` via the `@google/genai` Interactions API (`background: true`), with automatic fallback to `gemini-3.5-flash` on quota/token errors or execution failures. Never use deprecated `gemini-2.5-*`, `gemini-2.0-*`, or `gemini-1.5-*` models.
- **Reliable background jobs:** Long-running Gemini tasks must persist job state and `geminiInteractionId` in SQLite (`recommendation_jobs`) so client polls and container restarts recover cleanly without HTTP timeouts.
- **PWA caching invariant:** `public/sw.js` must never cache `/api/*` routes or non-GET requests.
- **SQLite & Docker:** Keep `better-sqlite3` in `serverExternalPackages` in `next.config.ts`. Any schema change in `src/db/schema.ts` must be paired with `npm run db:generate` so `scripts/migrate.mjs` applies it automatically on container startup.
- **Public repository hygiene:** Never commit personal domains, emails, IP addresses, Spotify IDs, `.env` files, or `.db` files. Use generic placeholders (`jamify.example.com`, `your_*`) in all examples and docs.

## Git Workflow & Mandatory Pre-Commit Privacy Audit

- Default branch is `main`.
- Write clear, concise commit messages describing what changed and why.
- **Mandatory Pre-Commit Privacy & Secret Audit (Required before EVERY commit and push):**
  1. Inspect `git status` and `git diff --cached` to confirm no `.env`, `.env.*` (except `.env.example`), `data/`, `*.db`, `*.db-wal`, `*.db-shm`, or local log/debug files are staged.
  2. Scan all tracked and newly added files for leaked secrets or personal information: API keys (`AIza*`, `sk-*`, `ghp_*`, OAuth client IDs/secrets, bearer/Cloudflare tokens), personal domains, email addresses, private LAN IPs, real Spotify user/playlist IDs, or host-specific paths.
  3. Replace any real values with generic placeholders (`jamify.example.com`, `your_*`) before committing. Never push if any secret or personal data is found.
- Before committing, run `npm run typecheck`, `npm run lint`, `npm test`, and `npm run build`, and confirm `AGENTS.md` reflects any structural or feature changes.
