.PHONY: dev setup install clean build package dmg lint format release bump-patch bump-minor bump-major

# 🚀 Full setup + launch (first time or any time)
dev: setup
	cd "$(CURDIR)" && bun dev

# Install dependencies (requires bun: curl -fsSL https://bun.sh/install | bash, or brew install oven-sh/bun/bun)
install:
	cd "$(CURDIR)" && bun install
	cd "$(CURDIR)/packages/mcp-server" && npm install && npm run build

# Setup everything from scratch
setup: install
	@echo "✅ Dependencies installed"
	@echo "✅ MCP server built"
	@echo "📝 Copy .env.example to .env and add your Anthropic API key"
	@test -f .env || cp .env.example .env
	@echo "🚀 Ready to launch!"

# Build for production
build:
	cd "$(CURDIR)/packages/mcp-server" && npm run build
	cd "$(CURDIR)" && bun run build

# Package as distributable (macOS DMG, etc.)
package: build
	cd "$(CURDIR)" && bun package

dmg: build
	cd "$(CURDIR)" && bun run package:mac

package-mac: build
	cd "$(CURDIR)" && bun run package:mac

package-win: build
	cd "$(CURDIR)" && bun run package:win

package-linux: build
	cd "$(CURDIR)" && bun run package:linux

# Lint and format
lint:
	cd "$(CURDIR)" && bun lint

format:
	cd "$(CURDIR)" && bun format

# Type check
typecheck:
	cd "$(CURDIR)" && bun typecheck

# ── Release ──────────────────────────────────────────────
# Usage:
#   make release          — build, tag, and publish current version
#   make bump-patch       — 0.1.0 → 0.1.1, then release
#   make bump-minor       — 0.1.0 → 0.2.0, then release
#   make bump-major       — 0.1.0 → 1.0.0, then release

VERSION := $(shell node -p "require('./package.json').version")
REPO    := ruimachado-orbit/lecta

# Sync version from package.json into web/lib/config.ts
sync-version:
	@sed -i '' "s/export const VERSION = '.*'/export const VERSION = '$(VERSION)'/" web/lib/config.ts
	@echo "📌 Version synced to $(VERSION)"

# Bump helpers — update package.json, sync web config, commit
bump-patch:
	@npm version patch --no-git-tag-version
	@$(MAKE) sync-version
	@$(MAKE) _commit-version
	@$(MAKE) release

bump-minor:
	@npm version minor --no-git-tag-version
	@$(MAKE) sync-version
	@$(MAKE) _commit-version
	@$(MAKE) release

bump-major:
	@npm version major --no-git-tag-version
	@$(MAKE) sync-version
	@$(MAKE) _commit-version
	@$(MAKE) release

_commit-version:
	$(eval VERSION := $(shell node -p "require('./package.json').version"))
	@git add package.json web/lib/config.ts
	@git commit -m "chore: bump version to $(VERSION)"
	@git push origin main

# Build, tag, and publish a GitHub release with macOS DMGs
release: build
	@echo "🚀 Releasing v$(VERSION)..."
	cd "$(CURDIR)" && bun run package:mac
	@git tag -a "v$(VERSION)" -m "Release v$(VERSION)" 2>/dev/null || true
	@git push origin "v$(VERSION)" 2>/dev/null || true
	@gh release create "v$(VERSION)" \
		--repo $(REPO) \
		--title "v$(VERSION)" \
		--generate-notes \
		release/Lecta-$(VERSION)-arm64.dmg \
		release/Lecta-$(VERSION)-x64.dmg 2>/dev/null \
	|| gh release upload "v$(VERSION)" \
		--repo $(REPO) --clobber \
		release/Lecta-$(VERSION)-arm64.dmg \
		release/Lecta-$(VERSION)-x64.dmg
	@echo "✅ Released v$(VERSION) → https://github.com/$(REPO)/releases/tag/v$(VERSION)"

# ── Testing ──────────────────────────────────────────────
test:
	cd "$(CURDIR)" && bun test

test-watch:
	cd "$(CURDIR)" && bun test:watch

# Clean build artifacts
clean:
	rm -rf node_modules dist out release .lecta
