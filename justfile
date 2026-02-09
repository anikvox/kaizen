# Kaizen
set dotenv-load := true

default:
    @just --list

dev-up:
    docker compose up -d postgres
    @sleep 2
    pnpm --filter @kaizen/api db:generate
    pnpm --filter @kaizen/api db:push
    PGBOSS_DATABASE_URL=$DATABASE_URL pnpm --filter @kaizen/api jobs:migrate
    pnpm --filter @kaizen/api-client build
    overmind start

dev-down:
    -overmind stop
    docker compose down -v

clean:
    -overmind stop
    rm ./.overmind.sock || true
    docker compose down -v
    docker volume rm server_postgres_data || true
    docker volume rm kaizen_kaizen_postgres_data || true
    rm -rf apps/*/dist apps/*/.next apps/*/.plasmo packages/*/dist .turbo
    rm -rf node_modules apps/*/node_modules packages/*/node_modules
    rm -rf apps/extension/build
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

# Seed fake activity data for testing focus agent
seed-activity:
    pnpm --filter @kaizen/api seed:activity

# ============================================
# Deployment Commands
# ============================================

# Helper to load deploy config
_deploy-config := "source deployment/config.env"

# Deploy to production server
deploy:
    cd deployment && source config.env && ansible-playbook deploy.yml

# Deploy with setup (first-time only - installs Docker)
deploy-setup:
    cd deployment && source config.env && ansible-playbook deploy.yml --tags setup,deploy

# Deploy only (skip system setup)
deploy-only:
    cd deployment && source config.env && ansible-playbook deploy.yml --tags deploy

# Update config files only
deploy-config:
    cd deployment && source config.env && ansible-playbook deploy.yml --tags config

# View production logs
deploy-logs:
    #!/usr/bin/env bash
    source deployment/config.env
    ssh ${DEPLOY_USER}@${DEPLOY_HOST} "cd /opt/kaizen && docker compose -f docker-compose.prod.yml logs -f"

# SSH into production server
deploy-ssh:
    #!/usr/bin/env bash
    source deployment/config.env
    ssh ${DEPLOY_USER}@${DEPLOY_HOST}

# Check production service status
deploy-status:
    #!/usr/bin/env bash
    source deployment/config.env
    ssh ${DEPLOY_USER}@${DEPLOY_HOST} "cd /opt/kaizen && docker compose -f docker-compose.prod.yml ps"

# Encrypt secrets file
deploy-vault-encrypt:
    cd deployment && ansible-vault encrypt secrets.yml

# Edit encrypted secrets
deploy-vault-edit:
    cd deployment && ansible-vault edit secrets.yml

# View encrypted secrets
deploy-vault-view:
    cd deployment && ansible-vault view secrets.yml
