.PHONY: dev dev-up dev-extension dev-frontend dev-server db-seed clean

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
	cd server && pnpm db:push -- --force-reset && pnpm db:generate
	@echo "Starting all services..."
	@$(MAKE) dev

db-seed:
	cd server && pnpm db:seed

clean:
	cd server && docker compose down -v
	find . -type d -name "node_modules" -exec rm -rf {} +
	find . -type d -name ".next" -exec rm -rf {} +
	find . -type d -name ".plasmo" -exec rm -rf {} +
	find . -type d -name ".clerk" -exec rm -rf {} +
	find . -type d -name "dist" -exec rm -rf {} +
	find . -type d -name "build" -exec rm -rf {} +
	pnpm install
