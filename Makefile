.PHONY: dev setup install clean build package dmg lint format typecheck test test-watch test-mcp test-all release bump-patch bump-minor bump-major

# 🚀 Full setup + launch (first time or any time)
dev: setup
	cd "$(CURDIR)" && bun run dev

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
	cd "$(CURDIR)" && bun run package

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
	cd "$(CURDIR)" && bun run lint

format:
	cd "$(CURDIR)" && bun run format

# Type check
typecheck:
	cd "$(CURDIR)" && bun run typecheck

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
	@sed -i.bak "s/export const VERSION = '.*'/export const VERSION = '$(VERSION)'/" web/lib/config.ts && rm -f web/lib/config.ts.bak
	@node -e "for (const f of ['web/package.json','packages/mcp-server/package.json']) { const fs=require('fs'); const j=JSON.parse(fs.readFileSync(f,'utf8')); j.version='$(VERSION)'; fs.writeFileSync(f, JSON.stringify(j,null,2)+'\n') }"
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
	@git add package.json web/lib/config.ts web/package.json packages/mcp-server/package.json
	@git commit -m "chore: bump version to $(VERSION)"
	@git push origin main

# Build, tag, and publish a GitHub release with macOS DMGs and Linux + Windows packages
release: build
	@echo "🚀 Releasing v$(VERSION)..."
	@git diff --quiet || (echo "❌ Working tree is dirty — commit first" && exit 1)
	cd "$(CURDIR)" && bun run test && bun run typecheck && bun run lint
	cd "$(CURDIR)" && npx electron-builder --mac --publish never
	cd "$(CURDIR)" && npx electron-builder --linux --publish never
	cd "$(CURDIR)" && npx electron-builder --win --publish never
	@git tag -a "v$(VERSION)" -m "Release v$(VERSION)"
	@git push origin "v$(VERSION)"
	@gh release create "v$(VERSION)" \
		--repo $(REPO) \
		--title "v$(VERSION)" \
		--generate-notes
	@missing=0; for f in \
		release/Lecta-$(VERSION)-arm64.dmg \
		release/Lecta-$(VERSION)-x64.dmg \
		release/Lecta-$(VERSION)-x86_64.AppImage \
		release/Lecta-$(VERSION)-amd64.deb \
		release/Lecta-$(VERSION)-x64.exe; do \
		if [ -f "$$f" ]; then gh release upload "v$(VERSION)" --repo $(REPO) --clobber "$$f"; \
		else echo "⚠️  Missing artifact: $$f"; missing=1; fi; \
	done; \
	if [ "$$missing" = "1" ]; then echo "❌ Some artifacts were not built — release is incomplete"; exit 1; fi
	@echo "✅ Released v$(VERSION) → https://github.com/$(REPO)/releases/tag/v$(VERSION)"

# ── Testing ──────────────────────────────────────────────
# Note: `bun test` would run Bun's own test runner — always go through the npm scripts.
test:
	cd "$(CURDIR)" && bun run test

test-watch:
	cd "$(CURDIR)" && bun run test:watch

test-mcp:
	cd "$(CURDIR)/packages/mcp-server" && npm test

test-all: test test-mcp

# Clean build artifacts
clean:
	rm -rf node_modules dist out release .lecta
