FROM node:20-alpine

RUN apk add --no-cache openssl

# ──────────────────────────────────────────────────────────────────────────────
# TODO: When Playwright browser automation is enabled in production, replace
# the alpine image and install Chromium dependencies:
#
#   FROM node:20-slim
#
#   RUN apt-get update && apt-get install -y --no-install-recommends \
#       openssl libnss3 libatk-bridge2.0-0 libdrm2 libxkbcommon0 libgbm1 \
#       libpango-1.0-0 libcairo2 libasound2 libxshmfence1 libx11-xcb1 \
#       && rm -rf /var/lib/apt/lists/*
#
#   ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
#   RUN npx playwright install chromium --with-deps
#
# This will significantly increase the Docker image size (~400MB+).
# The BrowserPool creation in connector.registry.ts is conditional — if
# Playwright/Chromium is not installed, it falls back to the HTTP-based
# ExtranjeriaConnector automatically.
# ──────────────────────────────────────────────────────────────────────────────

WORKDIR /app

COPY package*.json ./
COPY prisma ./prisma/

RUN npm install

COPY . .

RUN npm run build

EXPOSE 3001

CMD ["sh", "-c", "npx prisma db push --accept-data-loss && (npx ts-node prisma/seed.ts || true) && node dist/main.js"]
