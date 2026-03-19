# ─────────────────────────────────────────────────────────────────────────────
# Makefile — convenience aliases for the gw workflow
# ─────────────────────────────────────────────────────────────────────────────

.PHONY: help start push sync promote validate status setup

GW := ./gw

help:
	@$(GW) help

## Workflow commands
start:
	@$(GW) start $(BRANCH)

push:
	@$(GW) push

sync:
	@$(GW) sync

promote:
	@$(GW) promote $(TARGET)

validate:
	@$(GW) validate

status:
	@$(GW) status

## Setup
setup:
	@bash .workflow/install-hooks.sh
	@echo "  ✓ Workflow ready. Run 'gw help' or 'make help'"

## Dev shortcuts
dev-backend:
	@npm run dev --workspace=apps/backend

dev-frontend:
	@npm run dev --workspace=apps/frontend

db-migrate:
	@npm run db:migrate

db-seed:
	@npm run db:seed

db-studio:
	@npm run db:studio
