#!/bin/sh

# Install Chromium for Playwright browser automation (if not already installed)
npx playwright install chromium 2>/dev/null || echo "Playwright Chromium install skipped"

npx prisma db push --accept-data-loss
npx ts-node prisma/seed.ts || true
node dist/main.js
