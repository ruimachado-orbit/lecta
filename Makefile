.PHONY: dev setup install clean build package lint format

# 🚀 Full setup + launch (first time or any time)
dev: setup
	cd "$(CURDIR)" && pnpm dev

# Install dependencies
install:
	cd "$(CURDIR)" && pnpm install

# Setup everything from scratch
setup: install
	@echo "✅ Dependencies installed"
	@echo "📝 Copy .env.example to .env and add your Anthropic API key"
	@test -f .env || cp .env.example .env
	@echo "🚀 Ready to launch!"

# Build for production
build:
	cd "$(CURDIR)" && pnpm build

# Package as distributable (macOS DMG, etc.)
package: build
	cd "$(CURDIR)" && pnpm package

package-mac: build
	cd "$(CURDIR)" && pnpm package:mac

package-win: build
	cd "$(CURDIR)" && pnpm package:win

package-linux: build
	cd "$(CURDIR)" && pnpm package:linux

# Lint and format
lint:
	cd "$(CURDIR)" && pnpm lint

format:
	cd "$(CURDIR)" && pnpm format

# Type check
typecheck:
	cd "$(CURDIR)" && pnpm typecheck

# Clean build artifacts
clean:
	rm -rf node_modules dist out release .lecta
