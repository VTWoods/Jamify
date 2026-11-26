# Jamify

A self-hosted Progressive Web App (PWA) for managing custom Spotify playlists with Google Gemini, backed by SQLite and ready for Docker + Caddy deployment.

## Tech Stack

- **App & PWA:** Next.js (App Router, TypeScript), React, Tailwind CSS, Web App Manifest + Service Worker
- **Database:** SQLite (`better-sqlite3`, WAL mode) with Drizzle ORM
- **APIs:** Google Gemini (`@google/genai`) & Spotify Web API (`@spotify/web-api-ts-sdk`) — kept strictly server-side
- **Deployment:** Multi-stage `Dockerfile` (`output: "standalone"`) with Docker Compose and Caddy examples in [`examples/`](examples/README.md)

## Local Development

1. Install dependencies:
   ```bash
   npm install
   ```
2. Copy the environment template and fill in your credentials:
   ```bash
   cp .env.example .env
   ```
3. Apply SQLite migrations:
   ```bash
   npm run db:migrate
   ```
4. Start the dev server (runs on `http://127.0.0.1:3000` for Spotify OAuth loopback compatibility):
   ```bash
   npm run dev
   ```

## Scripts

- `npm run dev` — Start local development server
- `npm run build` — Build production bundle
- `npm run typecheck` — Run TypeScript type checking
- `npm run lint` — Run ESLint
- `npm test` — Run Vitest unit tests
- `npm run db:generate` — Generate SQLite migrations from `src/db/schema.ts`
- `npm run db:migrate` — Apply pending SQLite migrations

## Self-Hosting (Docker + Caddy)

See [`examples/README.md`](examples/README.md) for sanitized `docker-compose.yml`, `.env.example`, and `Caddyfile` configurations to run Jamify in Docker behind Caddy with automatic HTTPS for mobile PWA installation.

## License

This project is licensed under the [MIT License](LICENSE).
