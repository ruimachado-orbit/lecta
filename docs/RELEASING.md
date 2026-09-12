# Lecta — Releasing

Everything the release path actually does, as of `0.1.2`. All commands are `make` targets
from the repo root (`Makefile`); the underlying scripts live in `package.json`.

## Prerequisites

- [Bun](https://bun.sh/) 1.3.11 — the app's package manager, pinned in `packageManager`
  and in CI. `bun.lock` is the only lockfile for the app.
- Node.js 22+ — for `packages/mcp-server` (plain `npm`), electron-builder and the smoke test.
- `gh` (GitHub CLI), authenticated, for `make release`.
- A clean tree on `main`, or the release will tag work in progress.

```bash
make install     # bun install  +  mcp-server npm install && npm run build
```

## Gates before a release

Run what CI runs, plus the two things CI cannot:

```bash
make typecheck        # tsc --noEmit                       — must be 0 errors
make lint             # eslint . --max-warnings=1000       — must be 0 errors
make test             # vitest run (app + shared)
make test-mcp         # vitest run in packages/mcp-server
make build            # mcp-server tsc + electron-vite build
bun run test:e2e      # packaged-app smoke test (see below)
```

`make test-all` chains the two test suites.

### CI

`.github/workflows/ci.yml` runs on every push to `main` and every pull request, with
`concurrency` cancelling superseded runs. Two jobs:

| Job | Steps |
|---|---|
| **App** (`ubuntu-latest`, bun 1.3.11 + node 22) | `bun install --frozen-lockfile` → `typecheck` → `lint` → `test` → `build` |
| **MCP server** (`ubuntu-latest`, node 22, npm cache) | `npm ci` → `npm test` → `npm run build` |

The bun version in the workflow is pinned and must be kept in step with `packageManager`
in `package.json`.

**Not in CI yet:** the e2e smoke test (needs a build plus a display) and packaging. Run
both locally before tagging.

### Smoke test

`tests/e2e/smoke.mjs` (see `tests/e2e/README.md`) launches the **built** app with
`playwright-core` and the Electron binary from `node_modules` — nothing is downloaded. It
uses a throw-away `HOME`, opens a copy of `example-decks/hello-world`, and asserts eight
things: the deck opens, Monaco comes from the bundle, the JavaScript worker returns output,
no CSP violation is logged, Pyodide and sql.js run from `out/renderer/runtimes`, native
execution is refused while the Settings toggle is off, and no uncaught renderer errors.

```bash
bun run build
bun run test:e2e      # on Linux without a display: xvfb-run -a node tests/e2e/smoke.mjs
```

Exit code 0 means all checks passed; the script prints `PASS`/`FAIL` per check.

## Version sync

The version is authored in **`package.json`** and must match in three other places:

| File | Kept in step by |
|---|---|
| `package.json` | source of truth (`npm version …` via the bump targets) |
| `web/lib/config.ts` (`VERSION`) | `make sync-version` — drives the website's download URLs |
| `web/package.json` | **manual** |
| `packages/mcp-server/package.json` | **manual** |

Two known drifts to check by hand before a release:

- `packages/mcp-server/src/server.ts` advertises `version: '0.1.0'` to MCP clients while its
  `package.json` says `0.1.2`.
- `web/package.json` and `packages/mcp-server/package.json` are not touched by
  `make sync-version`.

The download URLs the website builds (`web/lib/config.ts`) must match electron-builder's
`artifactName` patterns in `electron-builder.yml`, or the download buttons 404:

```
Lecta-<version>-arm64.dmg     Lecta-<version>-x64.dmg
Lecta-<version>-amd64.deb     Lecta-<version>-x86_64.AppImage
```

## Cutting a release

```bash
make bump-patch     # 0.1.2 → 0.1.3
make bump-minor     # 0.1.2 → 0.2.0
make bump-major     # 0.1.2 → 1.0.0
```

Each bump target: `npm version <level> --no-git-tag-version` → `make sync-version` →
commits `package.json` + `web/lib/config.ts` and **pushes to `main`** → `make release`.

`make release` alone publishes the current version:

1. `make build` — builds the MCP server (`tsc`) then the app (`electron-vite build`).
2. `npx electron-builder --mac --publish never` — arm64 + x64 DMGs.
3. `npx electron-builder --linux --publish never` — x64 AppImage + `.deb`.
4. `git tag -a v<version>` and pushes the tag.
5. `gh release create v<version> --generate-notes`.
6. Uploads each artifact from `release/` with `--clobber`, skipping any that is missing.

Steps 4–6 are individually tolerant of failure (`|| true`), so a partial release does not
abort: **check the release page afterwards.**

Windows is packaged by `make package-win` (NSIS, x64) and is *not* part of `make release`.
Add it to the artifact loop in the `Makefile` before advertising Windows downloads.

Other packaging targets: `make package` (current platform), `make package-mac`,
`make package-linux`, `make dmg`.

## What ships

`electron-builder.yml`:

- `files` contains **only negations**, which keeps electron-builder's default `**/*`
  include. That is deliberate — the first positive glob would replace the default and drop
  `package.json` and `node_modules`. This is how `out/renderer/runtimes/{pyodide,sqljs}`
  (~30 MB of offline Pyodide and sql.js) reaches `app.asar`.
- `extraResources` copies `packages/mcp-server/dist` and its `node_modules` to
  `resources/mcp-server`, so Claude Desktop can launch the server with Electron's own
  binary and users need no Node.
- Linux `.deb` runs `build/linux/postinst.sh` after install.

Builds are **not code-signed or notarised**. `install.sh` clears the macOS quarantine
attribute; a manual DMG install needs `xattr -cr /Applications/Lecta.app`.

## Release checklist

1. `main` is green in CI.
2. `make test-all` and `bun run test:e2e` pass locally on a fresh `make build`.
3. `CHANGELOG.md` — move `Unreleased` entries under the new version heading and date it.
4. Version matches in `package.json`, `web/lib/config.ts`, `web/package.json`,
   `packages/mcp-server/package.json` and `packages/mcp-server/src/server.ts`.
5. `make bump-<level>` (or `make release` for a re-cut).
6. Verify the GitHub release has all four artifacts, then install one and open the demo deck.
7. Deploy the website so its download links point at the new tag.
