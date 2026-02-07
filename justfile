# Kaizen

default:
    @just --list

dev-up:
    docker compose up -d postgres
    @sleep 2
    pnpm --filter @kaizen/api db:generate
    pnpm --filter @kaizen/api db:push
    pnpm --filter @kaizen/api-client build
    overmind start

dev-down:
    -overmind stop
    docker compose down -v

clean:
    -overmind stop
    docker compose down -v
    rm -rf apps/*/dist apps/*/.next apps/*/.plasmo packages/*/dist .turbo
    rm -rf node_modules apps/*/node_modules packages/*/node_modules
    pnpm install

db-migrate name:
    pnpm --filter @kaizen/api db:migrate --name {{name}}

db-studio:
    pnpm --filter @kaizen/api db:studio

prod-up:
    cd .devcontainer && docker compose up --build

prod-down:
    cd .devcontainer && docker compose down

prod-clean:
    cd .devcontainer && docker compose down -v

prompts-status:
    pnpm --filter @kaizen/api prompts:status

prompts-sync:
    pnpm --filter @kaizen/api prompts:sync
