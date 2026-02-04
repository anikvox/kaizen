#!/usr/bin/env bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

cd "$SCRIPT_DIR"

# Check for .env.production
if [ ! -f "$PROJECT_ROOT/.env.production" ]; then
    echo "Error: .env.production file not found!"
    echo "Create one based on .env.example"
    exit 1
fi

echo "==> Starting Kaizen in production sandbox..."
echo ""
echo "Services will be available at:"
echo "  - Web: http://localhost:60091"
echo "  - API: http://localhost:60092"
echo "  - PostgreSQL: localhost:60093"
echo ""

# Run with docker compose from .devcontainer directory
docker compose up --build "$@"
