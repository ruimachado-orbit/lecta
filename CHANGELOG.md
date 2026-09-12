# Changelog

All notable changes to Lecta are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

The first hardening wave after the end-to-end review in
[`docs/PROJECT_REVIEW.md`](docs/PROJECT_REVIEW.md). Numbers in brackets are that review's
finding numbers; `docs/PROJECT_REVIEW.md#status-after-wave-1` maps every one of them to a
commit.

### Security

- **Deck-root confinement for every path that crosses IPC.** `assertInsideOpenDeck()` for
  renderer-supplied paths and `resolveInsideDeck()` for paths read out of `lecta.yaml`
  (`src/main/services/deck-roots.ts`). A deck can no longer read or write outside its own
  folder, and `notes: ../../.zshrc` is refused instead of loaded. [#19, #25]
- **MDX is behind a per-deck trust gate.** `ContentRenderer` is the only place MDX is
  compiled; untrusted decks and every thumbnail/preview render as plain markdown. The flag
  defaults to off, resets on load and travels with the presenter state. AI output is
  written to `.md`, never into an `.mdx` slide. [#17]
- **Native execution honours its own toggle.** `exec:native` refuses unless
  `nativeExecutionEnabled` is on *in the main process*, the cwd is inside an open deck, the
  command is a bare program name and the args are strings — one run per window, the
  configured timeout, no shell, a scrubbed environment that carries no API keys, process
  group kill on cancel/timeout and a 2 MB output cap. [#16, #22]
- **API keys never reach the renderer.** `settings:get` returns blanked secrets plus a
  `configuredKeys` boolean map; keys are encrypted at rest with Electron `safeStorage` and
  written atomically with mode `0600`. [#19, #33]
- **Slide markdown is no longer assigned to `innerHTML`.** The sub-slide measurer sanitizes
  with DOMPurify. [#18]
- **Window and navigation guards on every `webContents`** — `will-navigate`,
  `setWindowOpenHandler` (external links go to the OS browser), and
  `will-attach-webview` stripping the preload and Node integration from guests. The web
  panel drops `allowpopups` and uses a persistent partition. [#20]
- **`lecta-file://` authorises against the open-deck registry**, `403` outside it and
  `400` on malformed encoding; a deck root is registered only after `lecta.yaml` parses and
  is unregistered on close. [#21]
- **`.lecta` extraction refuses entries that escape the workspace** (zip-slip).
- **Chat agent**: destructive tools always confirm even in auto mode, deck content is
  delimited as data, pending confirmations are bound to the requesting window and expire.
  Codex runs in a scratch directory with network access off. [#23, #24]
- **MCP server**: `loadPresentation` is confined to the deck, `createPresentation` refuses
  to write into the parent directory, and Claude Desktop's config is never overwritten when
  it cannot be parsed. [#26, #34, #37]
- **Remote control** rejects bind errors instead of hiding them and tries the port range
  `[3333, 3343]`; the plain-HTTP LAN token model and its limits are now written down in
  `docs/SECURITY-MODEL.md`. [#28]

### Fixed

- **The JavaScript engine works again.** Code runs in a `blob:` Worker instead of a
  `srcdoc` iframe the app's own CSP refused; `terminate()` gives a real cancel and timeout. [#1]
- **The app works offline.** Monaco is bundled and registered through one
  `loader.config({ monaco })`; Pyodide and sql.js ship in `out/renderer/runtimes` and load
  from the app bundle (sql.js with an explicit `wasmBinary` so it works under `file://`);
  theme fonts load with `display=swap` and never throw offline. [#2]
- **`electron-vite.config.ts` → `electron.vite.config.ts`** — the old name was never picked
  up, so the alias/define/react settings are live for the first time.
- **Atomic, serialized persistence** for `lecta.yaml`, the `.lecta` archive, `settings.json`,
  `library.json`, the design-system and slide-library stores: temp file + rename, a per-key
  lock, and a debounced autosave with an explicit flush on close and quit. [#30]
- **Workspace collisions.** The temp workspace for a `.lecta` file is keyed on a SHA-1 of the
  full path and cleared before extraction, so two decks with the same basename can no longer
  be packed into each other. [#29]
- **No more silent truncation** — new code files are created with `flag: 'wx'`. [#32]
- **Settings are no longer wiped** by one bad field: validation is per field, there is a
  single writer under a lock, and an unreadable `settings.json` is moved aside rather than
  overwritten. [#33]
- **Dragging a pinned element** edits the full slide markdown instead of saving the current
  sub-slide as the whole slide; positioned-element comments are deduped. [#31]
- **Presenter/audience sync** carries `{slideIndex, subSlide, clickStep}` with a
  ready → request-state handshake instead of timers, so the audience shows the same
  sub-slide and click step; click steps initialise on mount; Escape and End share one
  `endPresentation()`. [#48, #49, #50]
- **File watcher** suppresses the app's own writes (content compare), reports
  `relativePath`, re-arms after a rename and stops on close, so a save no longer overwrites
  what you are typing. [#36]
- **Undo/redo** is keyed by slide id and cleared on load. [#35]
- **PDF export** rejects on `did-fail-load` and after 60 s, and always destroys the hidden
  window and the temp file. [#38]
- **AI providers**: real Claude ids, `max_completion_tokens` for OpenAI, separate API-key
  and Codex catalogs, `gemini-2.5-flash-image` for image generation, unknown model ids error
  instead of silently posting to Ollama, and full-presentation generation rethrows provider
  errors instead of returning an empty deck. [#3–#7]
- **Streams reach the window that asked for them** (`event.sender`), always emit a terminal
  event, and clean up their listeners; `on*` helpers return unsubscribers. [#8, #45]
- **Gemini tool declarations** omit `parameters` when a tool has no properties. [#9]
- **PDF import** runs pdfjs in-process with a 30 s timeout and real errors instead of
  shelling out to `node`. [#10]
- **Codex client**: stdin error handling, write after `spawn`, a turn timeout with
  `turn/interrupt`, and no probe spawn unless Codex is selected. [#12, #27]
- **MCP `add_slide`** names code files from the derived id, dedupes slide ids and filenames,
  slugs non-Latin titles correctly, and never rewrites a side-car JSON it failed to parse.
  [#13, #34]
- **PPTX import** keeps numbers, inter-run spaces and line breaks (`parseTagValue` and
  `trimValues` off, ordered parsing), resolves notes through `.rels`, and escapes table
  cells. [#41]
- **ipynb import** validates cells with zod and handles JPEG/SVG/markdown outputs and
  attachments, ANSI-stripped tracebacks and R/Julia kernels. [#42]
- **Library import** records the `.lecta` path instead of the temp workspace. [#40]
- Renderer type errors, whole-store subscriptions in the hot components, and the MDX
  recompile-on-every-keystroke cache key. [#11, #46]

### Added

- **PPTX export** — `pptxgenjs` in the main process (no binary, no network): the 12 layouts,
  8 theme palettes, sub-slides as steps, code blocks as monospace boxes, deck-confined
  images, speaker notes and pinned elements. `export:pptx` writes atomically through a save
  dialog. (`src/main/services/pptx-exporter.ts`, `src/main/ipc/export-pptx.ts`)
- **Packaged-app smoke test** — `tests/e2e/smoke.mjs` (`bun run test:e2e`) drives the built
  app with `playwright-core` under a throw-away `HOME` and checks eight things a release
  must never break, including the JS sandbox, the bundled runtimes and native-execution
  gating.
- **CI** — `.github/workflows/ci.yml` runs typecheck, lint, both test suites and the build
  on every push and pull request, with bun pinned to `packageManager`.
- **`eslint.config.js`** for ESLint 9, so `bun run lint` runs at all.
- **`src/main/services/safe-fs.ts`** — `atomicWriteFile`, `writeFileIfMissing`, `withLock`,
  `debouncePerKey` — and **`src/main/services/deck-roots.ts`** — the open-deck registry with
  `assertInsideOpenDeck` / `resolveInsideDeck`.
- **`packages/shared/src/slide-options.ts`** — one `as const` source for layouts, themes,
  transitions, execution engines and languages, backing both the TypeScript unions and the
  `z.enum` validators.
- Preload: `closePresentation`, `exportPptx`, `showItemInFolder`, `platform`, and
  `relativePath` on file-change events.
- Tests: PPTX and ipynb importer fixtures, `pptx-exporter`, `native-executor` timeout
  escalation, `export-pdf` path confinement, schema/slide-options round-trips, 35 more MCP
  server tests, and — in this wave — `deck-roots`, `safe-fs`, `settings` and `slide-utils`.
- Documentation: `docs/ARCHITECTURE.md`, `docs/SECURITY-MODEL.md`, `docs/RELEASING.md` and
  this changelog.

### Changed

- **Settings write protocol**: for a secret, `''`/`undefined` from the renderer means
  "unchanged" and `null` means "clear"; `configuredKeys` is renderer-only and never
  persisted. Recent decks go through the same single settings writer.
- **The MCP integration no longer spawns a server process** — Claude Desktop launches it
  from `claude_desktop_config.json`; the app only manages that registration. [#47]
- **Deck YAML is written with the shared serializer** (`stringifyYaml`) instead of string
  interpolation, so a quote in a title no longer produces an unopenable deck. [#39]
- The shared schema validates ids, indices and relative paths, normalises unknown themes to
  `dark` with a warning, and preserves unknown top-level keys on save. [#43]
- `customize_theme` now reports that per-deck colour/font overrides are unsupported instead
  of silently succeeding. [#14]
- `vitest.config.ts` no longer hardcodes a developer's home directory as the `@shared`
  alias; `tsconfig.json` includes `vitest/globals`.
- `bun` is the app's package manager everywhere (Makefile, README, CI); `bun.lock` is the
  only lockfile at the root.
- Website and landing-page copy corrected: real model names, the JS sandbox described as it
  is, and macOS-only claims replaced.

### Removed

- The **"Nano Banana" image provider**, which posted the user's key to a third-party
  endpoint; Gemini image generation uses `gemini-2.5-flash-image`. [#15]
- 14 MB of unreferenced `woff2` fonts under `src/renderer/public/fonts`, four scratch
  `.lecta` files inside `example-decks/hello-world`, and the duplicate `package-lock.json`
  and `pnpm-lock.yaml` at the root.
- Dead components and code: `NotePanel 2.tsx`, `FloatingChatButton.tsx`, `Spotlight.tsx`,
  `MermaidDiagram.tsx`, the CSP-refused inline `process` polyfill in `index.html`, and
  unreachable Toolbar symbols.

## 0.1.2 and earlier

Changelog keeping starts with the entry above. For releases up to and including `v0.1.2`
(macOS DMGs and Linux `.deb` + AppImage), see the
[releases page](https://github.com/ruimachado-orbit/lecta/releases).

[Unreleased]: https://github.com/ruimachado-orbit/lecta/compare/v0.1.2...HEAD
