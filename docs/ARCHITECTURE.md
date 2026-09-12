# Lecta — Architecture

How the app is put together, as of `0.1.2`. Every claim here points at a file; if the
code and this document disagree, the code is right and this document is a bug.

## Processes

| Process | Entry | Responsibility |
|---|---|---|
| Main | `src/main/index.ts` | Windows, the `lecta-file://` protocol, CSP, all filesystem/network/process work, 132 IPC handlers |
| Preload | `src/preload/index.ts` | The only bridge: `contextBridge.exposeInMainWorld('electronAPI', api)` |
| Renderer | `src/renderer/src/main.tsx` | React 19 UI, Zustand stores, Monaco, WASM runtimes, MDX |

Windows are created in two places: the editor window in `createWindow()`
(`src/main/index.ts`), and the presenter + audience windows in
`src/main/ipc/presenter.ts`. All three load the same renderer bundle and differ only by
hash route (`#/presenter`, `#/audience`). All three run with `contextIsolation: true`,
`nodeIntegration: false`, and `sandbox: false` (the preload needs Node built-ins).

`app.on('web-contents-created')` in `src/main/index.ts:158` installs the same guards on
*every* `webContents`, including `<webview>` guests:

- `will-navigate` — non-guests may only navigate to app URLs (`isAppUrl()`); guests may
  only navigate to `http(s):` or `about:blank`.
- `setWindowOpenHandler` — every `window.open` is denied; `http(s):` URLs are handed to
  `shell.openExternal`.
- `will-attach-webview` — the guest's `preload` is deleted and `nodeIntegration` forced off.

The CSP is set per response in `session.defaultSession.webRequest.onHeadersReceived`
(`src/main/index.ts:80`) and applied only to app pages (`file://`, `devtools://`,
localhost in dev). Relevant directives: no `'unsafe-inline'` for scripts,
`worker-src 'self' blob:`, `frame-src 'self' blob: …`, `object-src 'none'`.

## Trust model in one line

**The renderer is untrusted.** Deck content — markdown, MDX, raw HTML, AI output — is
rendered there, so any path, command or payload arriving over IPC must be treated as
deck-controlled. `docs/SECURITY-MODEL.md` spells out what follows from that.

## IPC surface

132 handlers, registered from `src/main/ipc/register.ts`. Channels are prefixed by domain:

| Prefix | Count | Module |
|---|---|---|
| `fs:` | 34 | `ipc/file-system.ts` — open/save decks, slides, code, notes, drawings |
| `library:` | 20 | `ipc/library.ts`, `ipc/slide-library.ts` — deck library, folders, tags, slide templates |
| `ai:` | 18 | `ipc/ai.ts` — generation and streaming |
| `nb:` | 18 | `ipc/notebook-fs.ts` — notebook mode |
| `presenter:` | 11 | `ipc/presenter.ts` — presenter/audience windows and sync |
| `gemini:` | 7 | `ipc/gemini-image.ts` |
| `mcp:`, `design-system:` | 4 each | `ipc/mcp.ts`, `ipc/design-system.ts` |
| `export:`, `remote:` | 3 each | `ipc/export-pdf.ts`, `ipc/export-pptx.ts`, `ipc/remote-control.ts` |
| `settings:`, `artifacts:`, `chat:`, `exec:` | 2 each | see modules of the same name |
| `window:`, `shell:` | 1 each | `index.ts`, `ipc/export-pptx.ts` |

Rules every handler follows:

1. **Confine every path.** A path from the renderer goes through
   `assertInsideOpenDeck()`; a path read out of `lecta.yaml` goes through
   `resolveInsideDeck(root, relative)` (`src/main/services/deck-roots.ts`).
2. **Answer the sender.** Streaming and execution output use `event.sender`, never
   `BrowserWindow.getFocusedWindow()` — see `ipc/execution.ts:52` and `ipc/ai.ts`.
3. **Write atomically, under a lock.** See below.

## Deck-root confinement

`src/main/services/deck-roots.ts` holds `allowedFileRoots`, the set of resolved roots of
currently-open decks.

- `registerDeckRoot(root)` is called only *after* `lecta.yaml` parses
  (`ipc/file-system.ts`), and `unregisterDeckRoot` on `fs:close-presentation`.
- `isInsideRoot` compares against `root + sep`, so `/decks/alpha-evil` is not inside
  `/decks/alpha`.
- `resolveInsideDeck` additionally rejects absolute paths, Windows drive paths and any
  `..` segment, so a hand-edited `content: ../../.zshrc` cannot be read or written.
- The `lecta-file://` protocol handler (`src/main/index.ts:190`) resolves the URL and
  returns `403` unless `isInsideOpenDeck()` passes, `400` on bad percent-encoding.

Tests: `src/main/services/deck-roots.test.ts`.

## Atomic persistence

`src/main/services/safe-fs.ts` is the whole persistence toolkit:

| Helper | Guarantee |
|---|---|
| `atomicWriteFile(path, data, {mode, backup})` | Writes a sibling `*.tmp-<pid>-<ts>-<rand>`, then `rename`s over the target. On failure the temp file is unlinked and the previous content survives. |
| `writeFileIfMissing(path, data)` | `flag: 'wx'` — creates or reports `false`; never truncates an existing code file. |
| `withLock(key, fn)` | Serializes read-modify-write per key (deck root, archive path, `'settings'`). |
| `debouncePerKey(ms)` | Coalesces bursts (drawing strokes, notes keystrokes) into one write. |

Everything that persists user data uses them: `lecta.yaml` and slide/code files
(`ipc/file-system.ts`), notebooks (`ipc/notebook-fs.ts`), the `.lecta` archive
(`services/lecta-file.ts`), `settings.json` (`ipc/settings.ts`), `library.json`
(`ipc/library.ts`), the design system and slide library stores, the exported `.pptx`
(`ipc/export-pptx.ts`) and Claude Desktop's config (`services/mcp-manager.ts`).

Tests: `src/main/services/safe-fs.test.ts`, `src/main/ipc/settings.test.ts`.

## The `.lecta` container and workspace mapping

A deck is canonically a **folder** (`lecta.yaml` + `slides/` + `code/` + `artifacts/`).
A `.lecta` file is that folder as a zip. `src/main/services/lecta-file.ts` maps between them:

1. `openLectaFile(path)` derives a workspace directory
   `<temp>/lecta-workspace-<basename>-<sha1(fullPath)[0..12]>`, removes any stale copy,
   and extracts under `withLock(path)`. Archive entries that resolve outside the
   workspace are skipped (zip-slip).
2. `registerWorkspace(workspaceDir, lectaFilePath)` records the mapping; the workspace
   dir is what gets registered as the deck root, so every other handler sees a normal folder.
3. Edits land in the workspace. `autoSave(workspaceDir)` re-packs 400 ms after the last
   change (`AUTOSAVE_DEBOUNCE_MS`), serialized per archive and written with
   `atomicWriteFile`. `*.tmp-*` files are never packed (`isTransientFile`).
4. `flushAutoSave` runs on deck close, on re-open, and on `before-quit` (the quit is
   deferred until the flush completes).

## MDX trust flag

MDX slides compile to JSX and run in the renderer, so they are gated:

- `src/renderer/src/components/slides/ContentRenderer.tsx` is the single chokepoint. It
  compiles MDX **only** when the deck is trusted and the render is not a preview;
  otherwise `stripMdxToMarkdown()` output goes to the ordinary `SlideRenderer`.
- Trust is per deck, defaults to `false` (`presentation-store.ts:202`), is offered as a
  banner in `SlidePanel.tsx`, and travels to the audience window inside the presenter
  state payload (`mdxTrusted`).
- Thumbnails, the slide navigator, exports and the home screen always pass `preview`, so
  a deck you have merely *seen listed* never executes.

## Code execution

Engines are declared per slide in `lecta.yaml` (`EXECUTION_ENGINES` in
`packages/shared/src/slide-options.ts`): `sandpack`, `pyodide`, `sql`, `native`, `none`.

- **JavaScript** — `runJavaScript()` in `src/renderer/src/hooks/useCodeExecution.ts:344`
  builds a `blob:` Worker. A worker has no DOM, no `window`, no bridge, and
  `terminate()` gives a real cancel and a real 30 s timeout. (A `srcdoc` iframe cannot be
  used: it inherits the app CSP, which has no `'unsafe-inline'`; a sandboxed `blob:`
  iframe is refused by Chromium.)
- **Python / SQL** — Pyodide and sql.js, both WebAssembly, in the renderer.
- **Native** — the only engine that leaves the sandbox; see `docs/SECURITY-MODEL.md`.

## Bundled runtimes (offline)

Nothing is fetched from a CDN at run time.

- **Monaco** is imported as a module and registered once via `loader.config({ monaco })`
  in `src/renderer/src/main.tsx`, with local language workers; the build splits it into
  its own chunk (`electron.vite.config.ts`).
- **Pyodide and sql.js** are copied out of `node_modules` into
  `out/renderer/runtimes/{pyodide,sqljs}` by the `lecta-runtimes` plugin in
  `electron.vite.config.ts`, and served from the same `/runtimes/...` path by a dev
  middleware. The renderer resolves them with `new URL('runtimes/<name>/', document.baseURI)`.
  `electron-builder.yml` ships `out/` through the default include (its `files` list is
  negations only — adding a positive glob would drop `package.json` and `node_modules`).
- sql.js is handed an explicit `wasmBinary` because `locateFile` alone fails under `file://`.

## Presenter handshake protocol

Three windows, one `pending*` state cache in `src/main/ipc/presenter.ts`. No timers.

```
editor window                main                        audience window
  presenter:open-audience  →  create window
                              did-finish-load → presenter:load-path
                                            ←   presenter:audience-ready
                              replay: presenter:load-path,
                                      presenter:sync-state (or :sync-slide),
                                      presenter:sync-artifact
  ← presenter:request-state
  presenter:sync-state     →  cache + fan out  →  presenter:sync-state
```

`PresenterState` is `{ slideIndex, subSlide, clickStep, mdxTrusted? }`, so the audience
renders the same sub-slide and the same click step as the presenter. Side channels:
`presenter:sync-code`, `:sync-execution`, `:sync-mouse`, `:sync-artifact`. Webapp
artifacts cannot be mirrored live, so the main process crops and streams ~10 fps PNGs
(`startArtifactCapture`).

## Remote control

`src/main/services/remote-control.ts` starts a plain `http` server bound to `0.0.0.0`,
first free port in `[3333, 3343]`. A 16-byte random token is the first path segment
(`http://<lan-ip>:<port>/<token>`), shown as a QR code. Every request is token-checked
and rate-limited (300 requests / 10 s per IP). The API is `GET /api/state` and
`POST /api/{next,prev,first,last}`, executed against the controlling window via
`executeJavaScript` on `window.__lectaSlideState` / `window.__lectaRemoteAction`.

## MCP server

`packages/mcp-server` is a **separate stdio process that the app does not run**.
`src/main/services/mcp-manager.ts` only writes the `lecta` entry into
`claude_desktop_config.json` (atomically, refusing to touch a file it could not parse);
Claude Desktop spawns the server itself. In a packaged app the registered command is
Electron's own binary with `ELECTRON_RUN_AS_NODE=1`, because users have no Node.

The server reads and writes the same deck folders as the app, so changes show up live via
the file watcher (`src/main/services/file-watcher.ts`, which suppresses the app's own
writes for 2 s so a save cannot clobber what is being typed).

## Shared code

`packages/shared/src` holds the deck schema (`utils/yaml-parser.ts`), the closed value
lists (`slide-options.ts` — layouts, themes, transitions, engines, languages), the model
catalog (`constants.ts`) and the notebook parser. The MCP server mirrors these lists in
`packages/mcp-server/src/lib/presentation-io.ts` rather than importing them; keeping the
two in step is a known duplication.

## Where things live

```
src/main/index.ts            windows, CSP, protocol, web-contents guards
src/main/ipc/*.ts            IPC handlers, one module per domain
src/main/services/           deck-roots, safe-fs, lecta-file, native-executor,
                             remote-control, file-watcher, importers, pptx-exporter,
                             ai-service, codex-app-server-client, mcp-manager
src/preload/index.ts         the contextBridge API
src/renderer/src/            React app: components/, stores/, hooks/, themes/
packages/shared/src/         schema, slide options, constants, notebook parser
packages/mcp-server/         stdio MCP server (built with npm, not bun)
tests/e2e/smoke.mjs          packaged-app smoke test
```
