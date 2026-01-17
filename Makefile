.PHONY: dev dev-up dev-extension dev-frontend dev-server db-seed

dev:
	@echo "Starting all services in development mode..."
	@trap 'kill 0' INT TERM; \
		pnpm dev:extension & \
		pnpm dev:frontend & \
		pnpm dev:server & \
		wait

dev-extension:
	pnpm dev:extension

dev-frontend:
	pnpm dev:frontend

dev-server:
	pnpm dev:server

dev-up:
	@echo "Starting Docker containers..."
	docker compose -f server/docker-compose.yml up -d
	@echo "Waiting for database to be ready..."
	@sleep 2
	@echo "Resetting database..."
	cd server && pnpm db:push -- --force-reset
	@echo "Starting all services..."
	@$(MAKE) dev

db-seed:
	cd server && pnpm db:seed
