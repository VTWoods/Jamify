# Deployment Examples

This directory contains sanitized, ready-to-adapt examples for self-hosting **Jamify** with Docker and exposing it over HTTPS through **Caddy** (required for installing the PWA on iOS and Android).

## Contents

- `docker/docker-compose.yml` — Runs Jamify in a container with a persistent Docker volume for the SQLite database (`/data/jamify.db`).
- `docker/.env.example` — Template environment variables for the container. Copy to `.env` next to `docker-compose.yml` and fill in your real values (never commit `.env`).
- `caddy/Caddyfile` — Reverse proxy configuration for Caddy v2 with automatic HTTPS and standard security headers.

## Quick Start

1. Copy `examples/docker/.env.example` to your deployment directory as `.env` and populate your secrets (`GEMINI_API_KEY`, `SPOTIFY_CLIENT_ID`, `SPOTIFY_CLIENT_SECRET`, `SESSION_SECRET`, `APP_URL`, and `ALLOWED_SPOTIFY_USER_IDS`).
2. Register `https://jamify.example.com/api/auth/spotify/callback` (using your real domain) as a Redirect URI in the Spotify Developer Dashboard.
3. Start the container with Docker Compose:
   ```bash
   docker compose -f examples/docker/docker-compose.yml --env-file /path/to/.env up -d --build
   ```
4. Add the block from `examples/caddy/Caddyfile` to your Caddy configuration, replace `jamify.example.com` with your domain, and reload Caddy.
5. Open `https://<your-domain>` on your phone and choose **Add to Home Screen** (iOS Safari) or **Install app** (Android Chrome).
