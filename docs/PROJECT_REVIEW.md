# Lecta — End-to-End Project Review

Date: 2026-09-12  ·  Version reviewed: 0.1.2 (`main` @ e277830)  ·  Scope: Electron app (main, preload, renderer), shared package, MCP server, importers, build/release, website, product & UX.

## How this review was done

- Ran the project's own checks: `tsc --noEmit`, `eslint`, `vitest` (root and `packages/mcp-server`), `electron-vite build`.
- Read every file in `src/main`, `src/preload`, `packages/*`, and the priority renderer files; claims below cite `file:line` and were confirmed in code. Several were additionally confirmed by executing the built code (workspace-hash collisions, PPTX parser output, MCP `add_slide`, `ChildProcess.killed` semantics).
- Launched the production build under a virtual display, opened the bundled `hello-world` deck, ran each execution engine, toured the presenter view, settings, help, export, theme picker, and captured screenshots.
- What could not be verified here: live calls to the AI providers (no network egress); those findings rest on SDK types/docs and the code.

## Verdict in one paragraph

Lecta has a genuinely differentiated idea — slides and real, runnable code files side by side with a solid presenter/audience story — and the codebase is organised sensibly (per-domain IPC modules, a shared schema package, an MCP server). But the current build is not release-quality: the core JavaScript engine is broken by the app's own CSP, the code editor and Python/SQL engines need internet at runtime, native execution ignores its own safety toggle, any shared `.lecta` file can execute arbitrary code with full file-system and process access, and several persistence paths can silently destroy user data. Typecheck fails, lint cannot run, one test suite is red, and there is no CI to catch any of it. The product surface has grown far past the core (Notebook mode, five asset libraries, five AI prompt bars) while first-run, error visibility, export fidelity and accessibility lag. The fix path is clear and mostly mechanical; it is sequenced in the plan at the end.

## Status after wave 1

Everything from "Build health" downwards is the **original review, unchanged**, so the
findings keep their numbers. This section records what the first wave of fixes
(`3795bae..6905909`, 14 commits) actually landed. Verified against the code, not against
the commit messages.

Wave-1 commits referenced below:

| Commit | Subject |
|---|---|
| `3795bae` | deck path guard, atomic-write and lock helpers, bundle runtime deps |
| `c2314d9` | enforce the trust boundary in IPC; harden native execution, settings, remote control |
| `b543ae4` | PPTX export via pptxgenjs; packaged-app smoke test; fix stale website claims |
| `7fed7f5` | remove unreferenced fonts, scratch decks and duplicate lockfiles |
| `678c58d` | safe deck persistence — atomic writes, locks, confined paths, no truncation |
| `8cd78fa` | route recent-decks persistence through the single settings writer |
| `be3ea1f` | correct model catalog and provider params; route streams; harden Codex and the chat agent |
| `b39155c` | preload: `closePresentation`, `exportPptx`, reveal-in-folder, `platform` |
| `7973264` | ESLint 9 flat config, portable vitest alias, vitest globals, CI workflow |
| `d724e34` | single-source slide options, hardened schema, safe MCP writes, faithful PPTX/ipynb import |
| `78e42a3` | shared YAML serializer; move an unreadable `settings.json` aside instead of overwriting |
| `9d5c29d` | JS slides in an isolated Worker; bundle Monaco/Pyodide/sql.js; fix the vite config name |
| `66e123f` | MDX trust gate, sanitized measurer, safe drag-save, presenter sync protocol, UX fixes |
| `6905909` | presenter handshake channels, typed renderer bridge, MCP cleanup, smoke-test navigation |

### Fixed

| # | Fixed by | Note |
|---|---|---|
| 1 | `9d5c29d` | JS runs in a `blob:` Worker (`useCodeExecution.ts:344`), not a `srcdoc` iframe |
| 2 | `9d5c29d` | Monaco bundled via `loader.config({ monaco })`; Pyodide/sql.js copied to `out/renderer/runtimes` |
| 3 | `be3ea1f` | `max_completion_tokens`; separate API-mode and Codex catalogs |
| 4 | `be3ea1f` | `claude-haiku-4-5-20251001` |
| 5 | `be3ea1f` | `gemini-2.5-flash-image` |
| 6 | `be3ea1f` | unknown ids throw; `ollama:` prefix routes explicitly |
| 7 | `be3ea1f` | provider errors rethrown |
| 8 | `be3ea1f`, `c2314d9` | `event.sender` in the AI, chat-agent and execution handlers |
| 9 | `be3ea1f` | `parameters` omitted when a tool has no properties |
| 10 | `be3ea1f` | pdfjs in-process, 30 s timeout, real errors |
| 11 | `66e123f` | `presentation.title` |
| 12 | `be3ea1f` | turn timeout + `turn/interrupt` + cancel |
| 13 | `d724e34` | code files named from the derived id |
| 14 | `d724e34` | resolved as "report unsupported" rather than implemented (`presentation-io.ts:976`) |
| 15 | `be3ea1f`, `6905909` | Nano Banana removed from the app and from the MCP server |
| 16 | `c2314d9` | `nativeExecutionEnabled` checked in main; cwd confined; bare-name command; one run per sender |
| 17 | `66e123f` | per-deck MDX trust gate in `ContentRenderer`; never compiled for previews; AI writes only `.md` |
| 18 | `66e123f` | measurer output sanitized with DOMPurify |
| 19 | `c2314d9`, `678c58d` | `assertInsideOpenDeck`/`resolveInsideDeck` on every path argument; `settings:get` returns `configuredKeys` booleans |
| 20 | `c2314d9`, `66e123f` | global `will-navigate` / window-open / `will-attach-webview` guards; WebPanel partition, no `allowpopups` |
| 21 | `c2314d9`, `678c58d` | root registered only after `lecta.yaml` parses, unregistered on close; protocol authorises via `deck-roots` |
| 22 | `c2314d9` | real exit tracking, process-group SIGTERM→SIGKILL, 2 MB output cap, configured timeout |
| 23 | `be3ea1f` | destructive tools always confirm; deck content delimited as data; confirmations bound to the sender with expiry |
| 24 | `be3ea1f` | scratch cwd, `networkAccess: false` |
| 25 | `678c58d` | every YAML-derived write goes through `resolveInsideDeck` |
| 26 | `d724e34` | MCP `loadPresentation` confined to the deck |
| 27 | `be3ea1f` | `stdin.on('error')`, write after `spawn`, no probe unless selected |
| 28 | `c2314d9` | bind errors reject, port range `[3333, 3343]`; the plain-HTTP LAN token model is now documented in `docs/SECURITY-MODEL.md` rather than fixed |
| 29 | `678c58d` | SHA-1 of the full path; workspace cleared before extraction |
| 30 | `3795bae`, `678c58d` | `atomicWriteFile` + `withLock` + debounced autosave everywhere |
| 31 | `66e123f` | drag edits the full slide markdown; comments deduped |
| 32 | `678c58d` | `writeFileIfMissing` (`flag: 'wx'`) at all three sites |
| 33 | `c2314d9`, `8cd78fa`, `78e42a3`, `d724e34` | per-field validation, one writer under a lock, `0600`, unreadable file moved aside, MCP never rewrites after a parse failure |
| 34 | `d724e34` | deduped ids and filenames, Unicode-aware slug, refuses writing into the parent dir |
| 35 | `66e123f` | undo keyed by slide id and cleared on load |
| 36 | `678c58d` | own-write suppression by content, `relativePath` in events, watchers closed |
| 37 | `c2314d9` | ENOENT vs parse error; atomic write with backup |
| 38 | `678c58d` | rejects on `did-fail-load` and a 60 s timeout; always destroys the window and temp file |
| 39 | `678c58d`, `78e42a3` | `stringifyYaml` in `lecta-file` and `file-system` |
| 40 | `678c58d` | the `.lecta` path is recorded |
| 41 | `d724e34` | ordered parsing, `parseTagValue`/`trimValues` off, notes via `.rels`, fixture test |
| 42 | `d724e34` | zod-validated cells, more MIME types, ANSI-stripped tracebacks |
| 45 | `be3ea1f`, `66e123f` | collision-free channels removed on the terminal event, `on*` return unsubscribers, blob URLs revoked |
| 46 | `66e123f` | selector subscriptions in the hot components; MDX cache keyed on the full source |
| 47 | `c2314d9` | the app no longer spawns the MCP server |
| 48 | `66e123f`, `6905909` | `{slideIndex, subSlide, clickStep}` with a ready→state handshake, no timers |
| 49 | `66e123f` | click steps initialise on mount |
| 50 | `66e123f` | Escape and End share one `endPresentation()` |

Build health rows: ESLint 9 flat config, the portable vitest alias, `vitest/globals` typing
and the CI workflow are `7973264`; the red MCP test, `packages/mcp-server` version and the
schema work are `d724e34`; fonts, scratch `.lecta` files and the duplicate lockfiles are
`7fed7f5`; `NotePanel 2.tsx`, `FloatingChatButton.tsx`, `Spotlight.tsx` and the renderer
type errors are `66e123f` / `6905909`.

### Partially fixed

- **#43 — schema.** Ids, indices and relative paths are validated, layouts/themes/
  transitions/engines/languages come from one `as const` source (`slide-options.ts`), unknown
  themes normalise and unknown keys are preserved (`d724e34`). **Still open:** YAML comments
  are lost on save — nothing uses `parseDocument`.
- **#44 — duplication.** `presentation-io.ts` picked up the missing traversal check and now
  mirrors the shared lists, but it is still a second copy of the schema, serializer and
  loader. `@lecta/shared` is not yet a real dependency of the MCP server.

### Also landed, beyond the defect list

- **PPTX export** (`b543ae4`) — section D's recommendation: `pptxgenjs` in the main process,
  no binary, no network (`services/pptx-exporter.ts`, `ipc/export-pptx.ts`).
- **Packaged-app smoke test** (`b543ae4`) — `tests/e2e/smoke.mjs`, 8 checks.
- Website and landing-page claims corrected (`b543ae4`).
- Quick wins from section E: status-bar error chip, delete confirmation, export result with
  Reveal, "Open Settings" in the no-AI toast, the Help sheet corrected to `Shift+S`,
  `aria-label`s, `:focus-visible`, `prefers-reduced-motion`, platform-derived titlebar
  inset, code panel open by default for code slides (`66e123f`).

### Status after waves 2 and 3

Commits `151b3c9..HEAD` on `claude/project-review-improvements-gijmwc`.

| Plan item | Status | Where |
|---|---|---|
| Provider adapter interface, one tool loop, cancellation, Stop button | done (`151b3c9`) | `src/main/services/ai/`, `ipc/ai.ts`, `components/chat/` |
| Theme-faithful PDF/HTML through the real renderer, completion feedback | done (`f6c5c87`) | `src/renderer/src/export/`, `ipc/export-pdf.ts` |
| PPTX in the Deck menu and palette | done (`f6c5c87`, `7b245cb`) | `export/exporter.ts`, `deck-commands.ts` |
| Element model: glass/card/frame presets, inspector, per-slide backgrounds, drop/paste, snapping | done (`453bdfe`, `01344f9`) | `components/slides/element-model.ts`, `Inspector.tsx`, `PinnedElements.tsx`, `slide-background.ts` |
| Dialog/Popover primitive, one toolbar (Deck / Insert), command palette, `?` overlay from one binding table | done (`7b245cb`) | `components/common/`, `layout/Toolbar.tsx`, `useKeyboardShortcuts.ts` |
| First run: demo deck, three-slide template, Open Settings everywhere | done (`7b245cb`) | `ipc/demo.ts`, `lecta-file.ts`, `HomeScreen.tsx` |
| One-click present on a second display | done (`7b245cb`) | `ipc/presenter.ts`, `PresenterView.tsx` |
| Notebook behind an experimental flag; Design System and Prompt panels retired | done (`7b245cb`) | settings `experimentalNotebook` |
| Single-file `deck.md` authoring with import and export | done (`e4b8ee9`, `39c71b1`) | `packages/shared/src/utils/single-file.ts`, `ipc/file-system.ts` |
| Unified AI surface with slash commands; agent can run code (`/run`, `run_code` tool) | done (`1ab107b`) | `components/chat/slash-commands.ts`, `ChatComposer.tsx`, `code-run-bridge.ts` |
| MCP server consuming the shared package (#44) | done (`6f45e59`, `1ab107b`) | `packages/mcp-server/tsconfig.shared.json`, `#shared/*` imports |
| Docs: architecture, security model, releasing, changelog | done (`13beaef`, `26554e0`) | `docs/` |

Still open after wave 3: YAML comments are lost on save (#43, needs `parseDocument`); the `run_code` agent tool reports its result as a follow-up message rather than in the same turn (no renderer→main tool-result channel yet);
MDX executes in the renderer behind the trust prompt rather than in a sandboxed iframe;
the remote control still uses a plain-HTTP LAN token (documented in
`docs/SECURITY-MODEL.md`); Windows is not built by `make release`.

### Status after the level-up pass (2026-09-12, uncommitted)

- **#43 narrowed**: leading `#` header comments now round-trip (`parseDocument` +
  per-root memory in `packages/shared/src/utils/yaml-parser.ts`, tested). Inline
  comments are still dropped — what remains is a documented limitation.
- **`run_code` same-turn verified already landed**: `chat:run-code-request` /
  `chat:report-code-run-result` (`src/main/ipc/chat-agent.ts`) + `requestCodeRun` /
  `installAgentCodeRunHandler` (`code-run-bridge.ts`) report output in the same turn.
  The "still open" line above is stale.
- **MDX sandboxed by default**: trusted MDX goes through `MdxSandbox`
  (opaque-origin `<iframe sandbox="">`, no scripts, no bridge); `MdxRenderer` remains
  only behind an explicit `interactiveMdx` opt-in no caller sets yet.
- **Remote trust now visible in-product**: the phone-remote popover warns about
  plain HTTP on the LAN (the `SECURITY-MODEL.md` account stands).
- **Windows added to `make release`** (`--win` + `*-x64.exe`); **CI builds Storybook**;
  `design-system/index.ts` is the canonical entry point and `SlideEditToolbar` uses it.
- **Export matrix test**: 12 layouts × 8 themes in `pptx-exporter.test.ts`.
- Gates at pass time: `tsc` clean, app tests 425 passed, MCP tests 83 passed, eslint 0 errors.

## Build health (measured)

| Check | Result |
|---|---|
| `tsc --noEmit` | **Fails**, 98 errors: 29 real code errors in the renderer, 69 from missing vitest global types in `src/main/ipc/export-pdf.test.ts` (no `types: ["vitest/globals"]`) |
| `eslint .` | **Cannot run**: ESLint 9 is installed but there is no `eslint.config.js` |
| `vitest run` (root) | 104 passed |
| `vitest run` (`packages/mcp-server`) | **1 failed** / 42 passed (`listSlides` heading, `presentation-io.test.ts:510`) |
| `electron-vite build` | Passes (main bundle 3.0 MB) |
| CI | **None**: `.github/` has templates but no workflows |
| Lockfiles | Three committed (`bun.lock`, `package-lock.json`, `pnpm-lock.yaml`); Makefile uses bun, README says pnpm; `packages/mcp-server/package-lock.json` is out of sync with its `package.json` |
| `vitest.config.ts` | Hardcodes `/Users/pedroferreira/...` as the `@shared` alias |
| Repo hygiene | 14 MB of unreferenced fonts in `src/renderer/public/fonts` (209 Xiaolai files, Excalifont, Virgil…); `components/notebook/NotePanel 2.tsx` stray duplicate; `example-decks/hello-world/slides/{name,sadsad,test,vv}.lecta` scratch files; `web/package.json` and MCP server still at 0.1.1 |

## A. Verified defects, ranked

Severity: **C** critical · **H** high · **M** medium · **L** low. "Observed" = reproduced in the running app.

### A1. Broken core features

| # | Sev | Finding | Where | Fix |
|---|---|---|---|---|
| 1 | C | **JavaScript engine never returns.** `runJavaScript` injects an inline `<script>` into a `srcdoc` iframe; srcdoc inherits the parent CSP, whose `script-src` has no `'unsafe-inline'`, so the browser refuses the script and no `done` message ever arrives. *Observed:* "Running…" until the 30 s timeout, console: "Refused to execute inline script…". | `src/renderer/src/hooks/useCodeExecution.ts:189-246`, CSP at `src/main/index.ts:102` | Build the iframe from a `blob:` URL (allowed by `script-src blob:`) or add a per-script nonce; add a test that runs a JS slide in the packaged app. |
| 2 | H | **Code editor, Python and SQL need internet.** `@monaco-editor/react` loads Monaco from jsDelivr by default (no `loader.config`), Pyodide and sql.js are fetched from CDN at run time. *Observed:* editor stuck on "Loading…", Python: raw "Failed to fetch dynamically imported module". Conference Wi-Fi is exactly where this product is used. | `CodeEditor.tsx:2`, `useCodeExecution.ts:24,42,55`, `theme-registry.ts:117` (Google Fonts) | Bundle `monaco-editor` (`loader.config({ monaco })`), ship Pyodide/sql.js via `extraResources` or a one-time "download runtime" step; show an offline indicator. |
| 3 | H | **OpenAI API-key mode fails for every listed model.** Only GPT-5.x models are offered, but `max_tokens` is sent unless the model matches `/^o\d/`; GPT-5 requires `max_completion_tokens`. `gpt-5.3-codex*` are not Chat Completions models at all. Settings still shows "connected" because validation only calls `models.list()`. | `ai-service.ts:199-205, 288-294, 1432-1465`; `constants.ts:134-142` | Always send `max_completion_tokens`; keep separate catalogs for API mode vs Codex mode. |
| 4 | H | **Non-existent model id `claude-haiku-4-20250414`** ships in the catalog, README and `.env.example`; selecting it yields a 404 at request time. | `constants.ts:91` | Replace with a real id (`claude-haiku-4-5-20251001`); consider populating from `models.list()`. |
| 5 | H | **Gemini image generation uses a text-only model** (`gemini-2.5-flash` with `responseModalities: ['IMAGE']`) → 400. Image output needs `gemini-2.5-flash-image`. | `gemini-image-service.ts:50,72` | Switch model. |
| 6 | H | **Unknown model ids silently route to Ollama** (`provider?.id ?? 'ollama'`), so the `.env.example` suggestions `gpt-4o`, `o3`, `o4-mini` post prompts to `localhost:11434`. | `ai-service.ts:87-91`, `.env.example:11-13` | Throw on unknown model; Ollama only for ids returned by `fetchOllamaModels()`. |
| 7 | H | **Full-presentation generation swallows provider errors** and returns a one-slide "successful" deck with empty markdown. | `ai-service.ts:780-836` | Rethrow when `raw` is empty. |
| 8 | H | **Streaming and execution output go to the focused window**, not the requesting one. Switch apps during a 60 s generation, or have the presenter window focused, and chunks, `[DONE]` and `exec:done` are dropped; the UI spins forever. | `ipc/ai.ts:38,182,213,307`, `ipc/chat-agent.ts:24`, `ipc/execution.ts:11` | Use `event.sender`. |
| 9 | M | **Gemini tool declarations with empty `properties` are rejected** (400), so the Gemini chat agent cannot start. | `ai-service.ts:1328-1332`, `chat-agent-tools.ts:39-43` | Omit `parameters` when there are no properties. |
| 10 | M | **PDF import shells out to `node`**, which packaged users don't have; failure becomes the literal string `[Could not read PDF file]` fed to the model as "PRIMARY INPUT". `execFileSync` also freezes the UI up to 30 s. | `ipc/ai.ts:241-279` | Run pdfjs in-process or spawn with `ELECTRON_RUN_AS_NODE`; throw on failure. |
| 11 | M | **Inline "AI" button in the visual editor throws** `presentation.config.title` (no `config` field; flagged by tsc). | `WysiwygEditor.tsx:786` | `presentation.title`; make typecheck gate CI. |
| 12 | M | **Codex turns have no timeout and no interrupt**; only `turn/start` is bounded. | `codex-app-server-client.ts:435-449` | Race with a timeout, send `turn/interrupt`, expose cancel. |
| 13 | M | **MCP `add_slide` writes every code file as `code/undefined.<ext>`** (uses `opts.slideId` instead of `autoId`); code slides of the same language overwrite each other. *Confirmed against `dist/`.* | `presentation-io.ts:462-463`, `server.ts:294-306` | Use `autoId`; add a test without `slideId`. |
| 14 | M | `customize_theme` writes `customStyles`, which the shared schema strips and nothing renders; the tool is a no-op that reports success. | `presentation-io.ts:746-770` | Implement or remove. |
| 15 | M | "Nano Banana" image provider posts the user's key to `api.nanobanana.com`, not a Google endpoint; Nano Banana is Gemini's image model. | `gemini-image-service.ts:181-194`, `presentation-io.ts:1167` | Remove; implement via `@google/genai` + `gemini-2.5-flash-image`. |

### A2. Security and trust boundary

The renderer is treated as trusted, yet deck content can run JavaScript in it. Combined, these make **opening a shared `.lecta` file equivalent to running a program**.

| # | Sev | Finding | Where | Fix |
|---|---|---|---|---|
| 16 | C | **Native execution ignores `nativeExecutionEnabled`.** The setting is only read by the Settings UI; `exec:native` runs whatever `command`/`args` the YAML specifies. *Observed:* native slide ran `node` with the toggle off. | `ipc/execution.ts:8-30`, `useCodeExecution.ts:133-137` | Check settings in the handler; confine `cwd` to the open deck; allowlist interpreters; per-deck confirmation. |
| 17 | C | **MDX slides are compiled and executed at run time** with the full `electronAPI` bridge — including on the Home screen thumbnails of every recent/library deck and in export. AI "Prettify"/chat output is also written into `.mdx` slides, so prompt injection becomes code execution. | `MdxRenderer.tsx:170-255`, `HomeScreen.tsx:1426`, `Toolbar.tsx:505-521` | Run MDX in a sandboxed iframe or behind a per-deck "trust" gate (Jupyter model); never compile MDX for thumbnails; route AI output only to `.md`. |
| 18 | C | **Raw slide markdown goes through `innerHTML`** in the sub-slide measurer; `<img onerror>`, `<svg onload>` etc. fire with bridge privileges, for every plain `.md` slide. | `useSubSlides.ts:211-222, 293-336` | Build the measurement DOM with `textContent`/DOMPurify, or measure via the real `SlideRenderer`. |
| 19 | C | **IPC accepts arbitrary paths and commands**: `fs:read-file`/`fs:write-file` take raw absolute paths, `artifacts:read-buffer`/`open-system` any file, `settings:get` returns **decrypted API keys** to the renderer. | `file-system.ts:979-985`, `artifacts.ts:5-12`, `settings.ts:129-131` | One `assertInsideOpenDeck(path)` helper on every path argument; never return secrets to the renderer (booleans only). |
| 20 | H | **No `will-navigate` guard; presenter/audience windows have no window-open handler; `<webview allowpopups>` with no `will-attach-webview`**. | `index.ts:130-133`, `presenter.ts:91-146`, `WebPanel.tsx:136-143` | Add guards on every `webContents`; strip preload/nodeIntegration in `will-attach-webview`; drop `allowpopups`, set a `partition`. |
| 21 | H | `lecta-file://` root is whitelisted **before** `lecta.yaml` is validated and never removed: `loadPresentation('/')` fails but leaves `/` readable via the protocol. | `file-system.ts:304-313` | Add the root only after a successful parse; remove on close. |
| 22 | H | Timeout/cancel escalation to SIGKILL is dead code (`process.killed` is true once SIGTERM is *sent*), no process-group kill, unbounded stdout buffering, settings `executionTimeout` ignored. | `native-executor.ts:43-116` | Track `exited`; `detached: true` + kill the group; cap output. |
| 23 | M | Chat agent in `auto` mode runs `delete_slide`/`reorder_slides` unconfirmed on content the model read from the deck; `ask`-mode confirmations can hang forever (no timeout/cleanup). | `chat-agent.ts:357-364`, `ai-service.ts:1083-1139` | Always confirm destructive tools; delimit deck content as data; reject pending confirmations on `destroyed`. |
| 24 | M | Codex threads run with `cwd` = the deck folder where per-deck `.env` API keys live, with a shell tool in read-only mode; `generateImage` sets `networkAccess: true`. | `codex-app-server-client.ts:363-371, 538` | Scratch cwd; network off; instructions via a system channel. |
| 25 | M | Writes derived from YAML aren't confined: `notes: ../../.zshrc` loads (traversal error swallowed) and `fs:save-notes` overwrites it. Same in `nb:save-content`, `fs:add-slide`. | `file-system.ts:338-344, 802-804` | Use `resolveRelativePath` for every write. |
| 26 | M | MCP `loadPresentation` uses bare `join` (no traversal check) unlike the app; `content: ../../.ssh/id_rsa` is returned to the model by `list_slides`. | `presentation-io.ts:285-305` | Reuse `resolveRelativePath`. |
| 27 | M | Codex stdin has no `'error'` handler; a missing binary or EPIPE is an **uncaught exception in the main process**, and status probes spawn Codex even when it isn't selected. | `codex-app-server-client.ts:142-176` | `stdin.on('error')`, write after `'spawn'`, probe only when selected. |
| 28 | L | Remote control: `server.on('error', () => {})` hides EADDRINUSE and still returns a QR URL; token travels over plain HTTP on `0.0.0.0:3333`. | `remote-control.ts:381-388` | Reject on error, try a port range, document the LAN trust model. |

### A3. Data loss and persistence

| # | Sev | Finding | Where | Fix |
|---|---|---|---|---|
| 29 | C | **Workspace dir "hash" covers only the first 6 bytes of the path**; any two `.lecta` files with the same basename share a temp workspace, and the next autosave packs a mixture of both decks into whichever file is mapped. Stale files are never cleared before extraction. *Confirmed:* three different paths → `L1VzZXJz`. | `lecta-file.ts:12-16, 46-60` | SHA-1 of the full path or `mkdtemp`; `rm -rf` before extract. |
| 30 | H | **No atomic writes anywhere**; the `.lecta` zip is rewritten in place on every change, unserialized (`save-drawings`/`save-notes` even zip twice). Crash or overlap → truncated archive; the only other copy is in `$TMPDIR`. | `lecta-file.ts:77-83`, `file-system.ts:146, 798-824` | temp + `rename`; per-deck promise-chain mutex; debounce autosave. |
| 31 | H | **Dragging any element in preview mode saves only the current sub-slide as the whole slide** (other sub-slides deleted), or duplicates positioned-element comments on every drag. | `SlidePanel.tsx:150-159, 402-416` | Edit against the full slide markdown; dedupe comments. |
| 32 | H | `nb:toggle-cell-type`, `nb:add-code`, `fs:add-code-to-slide` **truncate existing code files** with an unconditional `writeFile(path, '')` (not awaited, racing autosave). | `notebook-fs.ts:393, 606-610`, `file-system.ts:508` | `{ flag: 'wx' }`. |
| 33 | H | **Settings wiped**: `parseSettings` returns pure defaults on any schema error and the next save persists it (API keys, recents gone); MCP `registerInRecentDecks` rewrites `settings.json` from `{}` after any read/parse failure; two unsynchronised writers, mode 0644. | `schemas/settings.ts:29-34`, `settings.ts:120-126`, `file-system.ts:90-105`, `presentation-io.ts:795-833` | Per-field validation; never rewrite a file you failed to parse; one writer with a lock, `0600` + rename. |
| 34 | H | MCP `addSlide` reuses `slides/${length+1}-…` after deletes and never dedupes ids → **overwrites a live slide file**; non-Latin titles slug to `''` so `createPresentation` writes into the parent directory. *Confirmed.* | `presentation-io.ts:124-126, 347-348, 440-481` | Dedupe ids; non-colliding filenames; Unicode-aware slug with fallback. |
| 35 | M | Undo stack is index-based and survives reorder/delete and tab switches → Cmd+Z writes another slide's (or another deck's) text. | `presentation-store.ts:593-623` | Key by slide id; clear on `restoreTab`/load. |
| 36 | M | File-watcher echo of the app's own save overwrites keystrokes typed in the 1.5 s window; path comparison never matches on Windows; watchers never closed on deck close. | `file-watcher.ts:17-29`, `presentation-store.ts:329-346` | Suppress own writes (content compare); normalise paths. |
| 37 | M | Corrupt Claude Desktop config is silently replaced with only the `lecta` entry, deleting the user's other MCP servers. | `mcp-manager.ts:388-416` | ENOENT vs parse error; `.bak`. |
| 38 | M | PDF export hangs forever on `did-fail-load` and leaks the hidden window and temp file. | `export-pdf.ts:42-59` | Race with fail/timeout; unlink in `finally`. |
| 39 | M | `createLectaFile`/`fs:create` build YAML by string interpolation; a `"` in the title makes an unopenable deck. | `lecta-file.ts:102-140`, `file-system.ts:421-433` | `stringifyYaml`. |
| 40 | L | Library import records the temp workspace path instead of the `.lecta` file. | `library.ts:381-408` | Use `filePath`. |

### A4. Importers and schema

| # | Sev | Finding | Where | Fix |
|---|---|---|---|---|
| 41 | H | **PPTX text corruption**: fast-xml-parser defaults (`parseTagValue`, `trimValues`) turn `"1.10"` into `1.1`, `"007"` into `7`, drop the spaces between runs ("This is**bold**text"), and `<a:br/>` is never read. *Confirmed with the exact parser config.* Notes are matched by file number, not `.rels`; inherited bullets, charts/SmartArt, merged cells are lost. | `pptx-importer.ts:59-64, 122-170, 700-705` | `parseTagValue:false, trimValues:false, preserveOrder:true`; resolve notes via relationships; fixture tests. Entity handling is safe (v5.5.8 caps expansion). |
| 42 | M | ipynb importer throws on non-array `source`/`outputs: [null]`, drops non-PNG images and markdown attachments, keeps ANSI in tracebacks. | `ipynb-importer.ts:69-73, 148-157, 240-247` | zod-validate cells; handle other MIME types. |
| 43 | M | Shared schema accepts any `theme`, empty `id`, absolute `content`, and silently strips unknown keys (users' hand-written keys and all YAML comments are lost on the next save). Layout/theme/transition lists are hand-copied in six places; README says 14 languages, code has 15. | `yaml-parser.ts:40-81` | `as const` lists in shared + `z.enum`; `.strict()`; preserve comments with `yaml` `parseDocument`. |
| 44 | M | `presentation-io.ts` duplicates the shared schema, serializer, loader and language maps "to avoid NodeNext import issues", and has already drifted (traversal check dropped, different `command` fallback, `customStyles`). | `presentation-io.ts:11-252` | Build `@lecta/shared` as a real package and depend on it. |
| 45 | M | Listener leaks: every streaming call registers a permanent `ipcRenderer.on` on a `Date.now()` channel; `on*` helpers return no unsubscribe so components call `removeAllListeners`; blob URLs never revoked in `ArtifactViewer`. | `preload/index.ts:93-166`, `ArtifactViewer.tsx:25-50` | Remove on terminal event; return unsubscribers. |
| 46 | M | Whole-store subscriptions (`usePresentationStore()` with no selector) in `AppShell`, `Toolbar`, `SlideNavigator`, `SlidePanel`, `WysiwygEditor`… — every keystroke re-renders the shell, re-measures sub-slides with forced reflows, and recompiles MDX (the 300 ms debounce is dead code because the hash check always differs). | `MdxRenderer.tsx:329-347`, stores | Selector subscriptions with `useShallow`; key "slide changed" on slide id. |
| 47 | L | MCP child process spawned with piped stdio nobody reads (blocks after 64 KB) and serves no client — Claude Desktop spawns its own. | `mcp-manager.ts:337-353` | Drop the spawn; registration is enough. |

### A5. Presenter sync

| # | Sev | Finding | Where | Fix |
|---|---|---|---|---|
| 48 | H | **Audience never sees sub-slides or click steps**: presenter advances `clickStep`/`currentSubSlide` locally; only the slide index is synced, and the audience renders the whole slide with `clickStep = -1`. Initial sync relies on 300 ms / 800 ms timers. | `AudienceView.tsx:140-147`, `PresenterView.tsx:175-212`, `presentation-store.ts:194-213` | Sync `{slideIndex, subSlide, clickStep}`; `ready → state` handshake. |
| 49 | M | Click-step reveal never initialises on the first presented slide or after an MDX slide (`prevClickCount` seeded with the current value). | `SlideRenderer.tsx:153-159` | Call `onClickSteps` on mount; reset on navigation. |
| 50 | M | Escape exits presenting without closing the audience window or restoring the theme (only the End button does). | `useKeyboardShortcuts.ts:76-79` vs `PresenterView.tsx:219-224` | One `endPresentation()` path. |

## B. UI/UX and product assessment

### Scorecard

| Area | Score | Why |
|---|---|---|
| First-run | 2/5 | Empty home; no sample deck although `example-decks/hello-world` exists; a new deck is one line of text; the AI generate screen is a dead end with "No AI configured" and no link to Settings. |
| Information architecture | 2/5 | Six toolbar strips visible at once; Home swaps between four sub-screens without routing; 8+ right-pane content types behind a 28 px icon strip; five different "libraries" (Recents, My Presentations, Slide Store, Design System, Image Library). |
| Visual consistency | 2/5 | 214 inline styles, 181 hex literals, 38 hand-rolled overlays with 7 z-index tiers; accent officially "white/silver" while 84 `indigo-*` classes leak; emoji and Unicode glyphs used as icons next to Heroicons. |
| Editing | 3/5 | Visual/Editor/Draw exist and positioned elements persist, but the Tiptap→HTML→Turndown round trip (9 custom rules, `[TABLE_N]` placeholder hack) is lossy for exactly the constructs Lecta adds (comments, MDX, badges, mermaid). Global shortcuts fire while typing in the visual editor (← → change slide, capital N adds a slide). |
| Presenting | 3/5 | Timer, notes, next-slide, action notes, audience toggle and QR remote are genuinely strong. But: sub-slide desync (#48), Escape leaves the audience window open, no auto-fullscreen or second-display detection, presenter mode replaces the editor in place. |
| AI | 3/5 | Zero-key state handled with a toast in most places; Prettify has a real per-slide diff review. But five separate prompt bars, two paths fail silently to console, and two of seven text providers plus one image provider fail on first use. |
| Error handling | 2/5 | The store sets `error` in 17 catch blocks; nothing inside a deck renders it. Export gives no completion feedback. Slide delete has no confirm or undo. |
| Accessibility | 1/5 | 0 `aria-*`, 0 `focus-visible`, 0 reduced-motion, no focus trap, 157 uses of 6–9 px text; help sheet documents `N` for notes while the code binds `Shift+S`; README promises a command palette that does not exist. |

### What the live tour showed

- **The code panel is hidden by default** (`showRightPane: false`). The first slide says "Try modifying the code on the right" and there is no code on the right; the toggle is an unlabeled `{}` glyph in a 28 px rail.
- With the panel open: editor "Loading…" (Monaco from CDN), JS "Running…" forever (#1), Python raw fetch error (#2), native ran with the safety toggle off (#16). Only SQL/native produced output.
- Icon-only toolbar (sparkle, upload, grid, palette, export) relies on tooltips; `Prettify` and `Present` are the only labelled actions.
- Slide thumbnails are blank white boxes with 8 px labels; the recent-deck card renders an almost empty dark rectangle.
- The theme picker blocks all other toolbar clicks while open (backdrop); it does close on outside click and Escape.
- Layout holds at 1024×700 and dark/light both render; the light theme is clean.
- Console on a clean run: CSP violation, a Tiptap duplicate-extension warning, and an unhandled rejection from Monaco.

### Product-level read

Strengths worth doubling down on: real files on disk (works with git and editors), presenter/audience/code-output sync, the `.lecta` container plus MCP server as an agent-native format, eight coherent slide themes, and the Prettify diff review.

Where it is losing focus: Notebook mode (~3,600 lines, a second product), Design System and Slide Store panels, per-slide Prompt panel, screenshot-streamed web panel, and a settings page that presents MCP plumbing to every user. Compared with Slidev/Marp (single-file markdown, great export), Deckset (PDF quality), Pitch/Gamma (one generation flow), Lecta's distinctive promise is "the slide runs the code, and the audience sees it". Everything that does not serve that promise is currently costing it quality.

## C. Evolution plan

### Phase 0 — Stop the bleeding (1–2 weeks, one engineer)

1. Fix the JS engine CSP break (#1); bundle Monaco; bundle or pre-download Pyodide/sql.js; offline indicator (#2).
2. Enforce `nativeExecutionEnabled` in main, confine `cwd`, add a per-deck confirmation (#16).
3. Add `assertInsideOpenDeck` to every path-taking IPC handler; stop returning API keys to the renderer; add `will-navigate`/`will-attach-webview` guards and a shared window-open handler (#19–21).
4. Sanitize the sub-slide measurer (#18); gate MDX behind a per-deck trust prompt and never compile it for thumbnails (#17).
5. Full-path workspace hash + clear before extract; atomic writes with a per-deck mutex for `.lecta`, `lecta.yaml`, `settings.json` (#29, #30, #33).
6. Fix `writeFile(path, '')` truncation (#32), drag-save data loss (#31), event routing via `event.sender` (#8).
7. Model catalog: real Haiku id, `max_completion_tokens`, unknown-model error, Gemini image model, remove Nano Banana, rethrow on generation failure (#3–#7, #9, #15).
8. Green the build: fix the 29 type errors, add `vitest/globals` types, add `eslint.config.js`, fix the MCP test, delete `NotePanel 2.tsx`, unreferenced fonts and scratch `.lecta` files, keep one lockfile. Add a GitHub Actions workflow running typecheck, lint, both test suites and `electron-vite build` on every PR.

### Phase 1 — Foundations (3–4 weeks)

- **Trust model.** Treat the renderer as untrusted. A single IPC validation layer (zod on every handler input, path confinement, capability checks). Run MDX in a sandboxed iframe with a `postMessage` bridge exposing only what slides need.
- **One shared package.** Build `@lecta/shared` properly; MCP server and app import the same schema, serializer, loader, language maps and `as const` lists for layouts/themes/transitions/languages. Make the schema `.strict()` and preserve YAML comments.
- **Persistence layer.** One `DeckStore` module owning read-modify-write of `lecta.yaml`/`.lecta` with locking, debounce, atomic rename, and `.bak`. Remove the four duplicated recent-decks/settings writers.
- **Provider adapter interface.** `generate / stream / chatWithTools` per provider (Anthropic, Gemini, OpenAI-compatible, Codex); one tool loop; `AbortSignal` threaded through every call with a cancel IPC; sender-scoped streaming helper that always emits a terminal event and removes listeners.
- **Presenter protocol.** `ready → state` handshake carrying `{slideIndex, subSlide, clickStep, artifact}`; single `endPresentation()`.
- **Tests where the bugs were.** Fixture tests for PPTX/ipynb importers, `lecta-file`, native-executor timeout escalation, schema unknown-key behaviour, MCP `add_slide` without `slideId`, and a Playwright smoke test that opens the example deck and runs each engine in the packaged app (the harness used for this review works under `xvfb-run`).

### Phase 2 — Product focus and UX consolidation (4–6 weeks)

- **First run.** Ship `hello-world` as "Open the demo deck"; make the new-deck template three slides (title, two-col with runnable code, closing); open the code panel by default when the slide has code; "Open Settings" button in every no-AI state.
- **One toolbar, labelled.** Collapse Import/Export/Article/Prettify under a `Deck ▾` menu, label the remaining icons, move Image Library/Design System/Slide Store into an `Insert` menu. Add a real `Cmd+K` command palette (slides, actions, themes) and a `?` shortcut overlay generated from the binding table.
- **Errors visible.** Render `presentation-store.error` in the status bar; export completion with "Reveal"; confirm or undo-toast on slide delete; route the two silent AI paths through `showAIError`.
- **Editing.** Ignore global shortcuts when focus is in `contenteditable`; don't double-undo with Tiptap; write markdown back only when the ProseMirror document changed; preserve unknown HTML comments verbatim.
- **Accessibility floor.** One `Dialog`/`Popover` primitive with focus trap and Escape; `aria-label` from every `title`; `:focus-visible`; `prefers-reduced-motion`; minimum 11 px UI text; fix Stop-button contrast.
- **Cut or flag.** Move Notebook mode behind an experimental flag (or into its own app); retire Design System and per-slide Prompt panels; merge Slide Store into the Library.
- **Cross-platform.** Titlebar inset from `process.platform` instead of hardcoded `pl-20` (80 px dead gutter on Linux/Windows); Windows path normalisation in the watcher.

### Phase 3 — Differentiate (ongoing)

- Theme-faithful PDF/HTML export rendered through the real `SlideRenderer` (today: 10-line regex + two hardcoded colour schemes).
- **PPTX export** (see D).
- One-click present: auto-open audience on the second display, fullscreen both, remote QR in the presenter header, live code output and artifacts on the audience screen as the headline demo.
- Slidev-style single-file authoring (`deck.md` with frontmatter and ` ```python file=demo.py ` fences) as an on-ramp; the folder format stays canonical.
- AI as one surface: a chat sidebar with slash commands replacing the five prompt bars; the agent can *run* the code — the thing Gamma/Pitch cannot do.
- Correct the public claims (landing page still says GPT-4o and macOS-only; README promises a command palette and a WebSocket remote that is HTTP polling).

## D. Should Lecta add "office-cli" for PPTX?

There are two unrelated projects called OfficeCLI:

- **iOfficeAI/OfficeCLI** — Apache-2.0, ~30k stars, a single self-contained .NET binary (macOS/Linux/Windows) that creates and edits DOCX/XLSX/PPTX without Office, renders slides to HTML/SVG/PNG, extracts content to JSON, has `--json` output, stdin batching, a Node SDK and an MCP server.
- **officecli/officecli** — an MIT CLI wrapper around a *hosted* AI generation service (free trial, then paid API keys, or bring-your-own LLM endpoint). Generation runs on their servers by default.

Recommendation:

1. **Yes to PPTX export, no to bundling either tool.** PPTX export is a real gap: the README advertises import only, the "McKinsey-style" beautify targets exactly the audience that must hand a `.pptx` to someone, and Marp/Slidev/Deckset all export. But Lecta is the source of truth and only needs *create-from-scratch* export. `pptxgenjs` (MIT, pure JavaScript, runs in the Electron main process, no binary, no network) covers that fully: map the 12 layouts to slide masters, the 8 themes to colour/typography sets, code blocks to monospace text boxes with token colours, images/SVG charts embedded, speaker notes to notes, one slide per sub-slide. This is a 1–2 week feature and fits the existing export menu.
2. **Skip officecli/officecli entirely.** It routes content through a third-party hosted service, which contradicts Lecta's local-first, bring-your-own-provider model, and its generation is prompt-based rather than a faithful rendering of an existing deck.
3. **Consider iOfficeAI/OfficeCLI as an optional external tool later**, discovered on `PATH` the same way Codex CLI is today — not shipped inside the app (a ~100 MB .NET binary per platform would triple the installer and add a runtime the team doesn't maintain). Where it would earn its place: a higher-fidelity *importer* (its structured JSON extraction would replace the fragile hand-rolled OOXML parsing that currently corrupts numbers and whitespace), slide-preview rendering, and round-trip editing of decks that originated in PowerPoint. Expose it as an "Advanced: use OfficeCLI if installed" setting, invoke with `--json`, and keep pptxgenjs as the always-available path.
4. **Fix the existing PPTX importer regardless** (#41); it is a correctness bug independent of any new tooling.

## E. Quick wins (each under a day)

- Fix the JS engine CSP break; bundle Monaco.
- Enforce the native-execution toggle in main.
- `event.sender` instead of `getFocusedWindow()` in the five IPC handlers.
- Full-path hash in `getWorkspaceDir`; `rm -rf` before extract.
- `writeFile(path, '', { flag: 'wx' })` in the three truncation sites.
- Replace `claude-haiku-4-20250414`; `max_completion_tokens`; `gemini-2.5-flash-image`.
- Delete `NotePanel 2.tsx`, `FloatingChatButton.tsx`, `Spotlight.tsx`, unused fonts, scratch `.lecta` files, the `{false && …}` block and dead Toolbar symbols.
- `eslint.config.js`; `vitest/globals` types; fix `presentation-io.test.ts:510`; remove the hardcoded `/Users/...` alias; pick one lockfile; add a CI workflow.
- Open the code panel by default when a slide has code; add "Open Settings" to the no-AI toast and the generate screen.
- Escape → `endPresentation()`; help sheet `N` → `Shift+S`; `aria-label` from `title`; `prefers-reduced-motion`; `:focus-visible`.
- Confirm or undo-toast on slide delete; show export result with "Reveal".
- Titlebar inset from `process.platform`.
