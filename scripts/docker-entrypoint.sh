#!/bin/sh
set -eu

# Apply any pending SQLite migrations before starting the Next.js server
node scripts/migrate.mjs

exec node server.js
