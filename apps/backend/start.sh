#!/bin/sh
npx prisma db push --accept-data-loss
npx ts-node prisma/seed.ts || true
node dist/main.js
