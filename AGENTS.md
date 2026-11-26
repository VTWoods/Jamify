# AGENTS.md

Instructions and project context for AI coding agents working on **Jamify**.

## Project Overview

**Jamify** is a public open-source project for managing custom playlists in Spotify.

- **Repository:** `VTWoods/Jamify` (default branch: `main`)
- **License:** MIT
- **Status:** Bootstrapped; core tech stack and features not yet implemented.

## Keeping `AGENTS.md` Up to Date (Required)

Agents working in this repository **must** keep this file accurate and current as part of any change. Whenever a task introduces or modifies any of the following, update `AGENTS.md` in the same commit/PR before finishing:

1. **Features & capabilities** — new playlist management features, CLI/UI entry points, or Spotify API integrations.
2. **Project structure** — new top-level directories, key modules, or config files.
3. **Tech stack & dependencies** — language, runtime, frameworks, package managers, or major libraries.
4. **Commands** — setup, build, run, test, lint, and format commands.
5. **Configuration & environment** — new environment variables, auth flows, or local dev prerequisites.
6. **Conventions & architecture** — key design decisions, patterns, or invariants future agents should follow.

Keep updates concise and factual—document what actually exists in the repo, not speculative plans.

## Repository Structure

```text
.
├── AGENTS.md    # Agent instructions and living project reference
├── LICENSE      # MIT License
├── README.md    # Project overview
└── .gitignore   # Ignored local, editor, and secret files
```

## Tech Stack & Setup

_TBD — update this section once the language/runtime and dependencies are chosen._

## Common Commands

_TBD — document install, dev, build, lint, and test commands here once established._

- **Install:** _TBD_
- **Run / Dev:** _TBD_
- **Test:** _TBD_
- **Lint / Format:** _TBD_

## Security & Spotify Credentials

- **Never commit secrets** (Spotify Client ID/Secret, OAuth refresh/access tokens, `.env` files).
- Store local secrets in `.env` (already covered by `.gitignore`).
- When environment variables are introduced, document their names (without values) in `.env.example` and in this file.

## Git Workflow

- Default branch is `main`.
- Write clear, concise commit messages describing what changed and why.
- Verify tests/linters pass (once configured) and confirm `AGENTS.md` reflects any structural or feature changes before committing.
