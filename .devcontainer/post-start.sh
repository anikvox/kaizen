#!/bin/bash
set -e

echo "==> Syncing source to workspace..."
rsync -a --delete /src/ /workspace/

cd /workspace

echo "==> Installing dependencies..."
pnpm install --frozen-lockfile

echo "==> Generating Prisma client..."
pnpm --filter @kaizen/api db:generate

echo "==> Pushing database schema..."
pnpm --filter @kaizen/api db:push

echo "==> Cleaning extension build artifacts..."
rm -rf /workspace/apps/extension/build

echo "==> Building all packages..."
pnpm build

echo "==> Starting services..."

# Start API in background
pnpm --filter @kaizen/api start &
API_PID=$!

# Start Web in foreground (keeps container alive)
echo "  - API: http://localhost:60092"
echo "  - Web: http://localhost:60091"
exec pnpm --filter @kaizen/web start
