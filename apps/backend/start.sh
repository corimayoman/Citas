#!/bin/sh
set -e

echo "=== Railway start.sh ==="
echo "PORT=$PORT"
echo "NODE_ENV=$NODE_ENV"

# Prisma: sync schema with DB
npx prisma db push --accept-data-loss

# Seed (non-blocking)
npx ts-node prisma/seed.ts || true

# Start the server — Railway injects PORT env var
echo "Starting node dist/main.js ..."
exec node dist/main.js
