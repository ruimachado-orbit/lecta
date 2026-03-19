.PHONY: dev setup install clean build package dmg lint format

# 🚀 Full setup + launch (first time or any time)
dev: setup
	cd "$(CURDIR)" && bun dev

# Install dependencies (requires bun: curl -fsSL https://bun.sh/install | bash, or brew install oven-sh/bun/bun)
install:
	cd "$(CURDIR)" && bun install

# Setup everything from scratch
setup: install
	@echo "✅ Dependencies installed"
	@echo "📝 Copy .env.example to .env and add your Anthropic API key"
	@test -f .env || cp .env.example .env
	@echo "🚀 Ready to launch!"

# Build for production
build:
	cd "$(CURDIR)" && bun build

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

# Clean build artifacts
clean:
	rm -rf node_modules dist out release .lecta
