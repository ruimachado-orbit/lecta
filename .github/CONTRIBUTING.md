# Contributing to Lecta

Thank you for your interest in contributing to Lecta! This document outlines the guidelines for contributing to this project.

## Code of Conduct

By participating in this project, you agree to maintain a respectful and inclusive environment for everyone.

## Getting Started

1. **Fork** the repository
2. **Clone** your fork locally
3. **Create a branch** from `main` for your changes
4. **Install dependencies** with `make install`
5. **Make your changes** and test them locally
6. **Push** your branch and open a Pull Request

## Development Setup

Prerequisites: [Bun](https://bun.sh/) 1.3.11 (the app's package manager, pinned in
`packageManager`) and [Node.js](https://nodejs.org/) 22+ (the MCP server and Electron
tooling). `bun.lock` is the only lockfile at the root — do not commit `package-lock.json`
or `pnpm-lock.yaml` there.

```bash
# Clone your fork
git clone https://github.com/<your-username>/lecta.git
cd lecta

# Install dependencies (bun install + build packages/mcp-server)
make install

# Start the app in dev mode (also creates .env from the template)
make dev
```

> `bun test` runs Bun's own test runner, not this project's. Use the `make` targets below.

## Before you open a pull request

Run everything CI runs:

```bash
make typecheck     # tsc --noEmit           — must be 0 errors
make lint          # eslint .               — must be 0 errors
make test          # vitest (app + shared)
make test-mcp      # vitest (packages/mcp-server)
make build         # electron-vite build
```

If you touched the main process, execution, export or the bundled runtimes, also run the
packaged-app smoke test:

```bash
make build && bun run test:e2e     # Linux without a display: xvfb-run -a node tests/e2e/smoke.mjs
```

Add a test next to the module you changed. Pure modules under `packages/shared/src`,
`src/main/services` and `src/main/ipc` are covered by `vitest.config.ts`; Electron-facing
modules are testable with `vi.mock('electron', …)` — see `src/main/ipc/settings.test.ts`.

Update [`CHANGELOG.md`](../CHANGELOG.md) under `## [Unreleased]` for anything a user would
notice, in the Keep-a-Changelog group that fits (Security / Fixed / Added / Changed /
Removed).

## Things reviewers will look for

These are the invariants the codebase depends on — see
[`docs/ARCHITECTURE.md`](../docs/ARCHITECTURE.md) and
[`docs/SECURITY-MODEL.md`](../docs/SECURITY-MODEL.md):

- **The renderer is untrusted.** Any filesystem path arriving over IPC goes through
  `assertInsideOpenDeck()`; any path read out of `lecta.yaml` goes through
  `resolveInsideDeck()` (`src/main/services/deck-roots.ts`).
- **Answer the sender.** Use `event.sender`, never `BrowserWindow.getFocusedWindow()`.
- **Write safely.** Use `atomicWriteFile`, `writeFileIfMissing` and `withLock` from
  `src/main/services/safe-fs.ts`. Never `writeFile(path, '')` a file that may exist, and
  never rewrite a store you failed to parse.
- **No secrets to the renderer.** Anything key-shaped is exposed as a boolean.
- **No new executable surface.** MDX compiles only through `ContentRenderer`, behind the
  per-deck trust flag.
- **Keep the closed value lists in one place** — `packages/shared/src/slide-options.ts`.

## Pull Request Process

1. **Branch naming**: Use descriptive branch names (e.g., `feat/slide-export`, `fix/auth-redirect`, `docs/api-reference`)
2. **Small, focused PRs**: Keep pull requests focused on a single change. Large PRs are harder to review and more likely to introduce issues.
3. **Required reviews**: All PRs must be approved by at least one code owner before merging:
   - [@ruimachado-orbit](https://github.com/ruimachado-orbit) (Rui Machado)
   - [@DiogoAntunesOliveira](https://github.com/DiogoAntunesOliveira) (Diogo Antunes Oliveira)
   - [@PedroFerreira](https://github.com/PedroFerreira) (Pedro Ferreira)
4. **No direct pushes to `main`**: All changes must go through a PR.
5. **Passing checks**: All CI checks must pass before merging (`.github/workflows/ci.yml`:
   typecheck, lint, both test suites, build).
6. **Fill out the PR template**: Provide a clear description, motivation, and test plan.

## Commit Messages

Use clear, descriptive commit messages. We recommend the [Conventional Commits](https://www.conventionalcommits.org/) format:

```
feat: add PDF export for presentations
fix: resolve slide reordering bug on drag-and-drop
docs: update installation instructions
chore: upgrade electron to v30
```

## Reporting Bugs

Use the [bug report template](https://github.com/ruimachado-orbit/lecta/issues/new?template=bug_report.yml) to report issues. Include:

- Steps to reproduce
- Expected vs actual behavior
- Environment details (OS, Electron version, etc.)

## Requesting Features

Use the [feature request template](https://github.com/ruimachado-orbit/lecta/issues/new?template=feature_request.yml) to propose new features. Describe:

- The problem you're trying to solve
- Your proposed solution
- Any alternatives you've considered

## Security

If you discover a security vulnerability, **do not open a public issue**. Please see our [Security Policy](SECURITY.md) for responsible disclosure instructions.

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](../LICENSE).
