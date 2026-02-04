#!/bin/bash
set -e

echo "==> Installing pnpm..."
corepack enable
corepack prepare pnpm@9.15.0 --activate

echo "==> Installing dependencies..."
pnpm install

echo "==> Generating Prisma client..."
pnpm --filter @kaizen/api db:generate

echo "==> Pushing database schema..."
pnpm --filter @kaizen/api db:push

echo "==> Building all packages..."
pnpm build

echo "==> Post-create setup complete!"
