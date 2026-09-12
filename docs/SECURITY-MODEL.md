# Lecta — Security Model

Lecta opens files that other people made. A `.lecta` file or a deck folder is content you
were sent, the same way a `.pptx` or a Jupyter notebook is. This document says exactly what
such a file is allowed to do, what it is not, and where the boundaries are enforced.

If you find a way past any of these boundaries, please report it privately — see
[Reporting](#reporting-a-vulnerability) at the bottom.

## The one assumption

**The renderer process is untrusted.** Deck markdown, deck HTML, MDX and AI output all
render there. So anything the renderer sends over IPC — a path, a command, a payload — is
treated as if the deck author wrote it, because they may have.

Everything below follows from that.

## What a deck can do

A deck you open can:

- Render markdown and inline HTML on a slide.
- Reference local images and artifacts **inside its own folder** — they are served by the
  `lecta-file://` protocol, which resolves the path and returns `403` unless it is inside
  an open deck root (`src/main/index.ts:190`, `src/main/services/deck-roots.ts`).
- Declare code blocks that you can choose to run in the JavaScript worker, Pyodide or
  sql.js sandboxes.
- Embed an `https://` page in the web panel, in a `<webview>` guest with no preload, no
  Node integration and a persistent partition.
- Ask you — once, per deck — to trust its MDX (see below).
- Ask you — once, per app, in Settings — to allow native execution (see below).

## What a deck cannot do

- **Read or write outside its own folder.** Every path from the renderer goes through
  `assertInsideOpenDeck()`; every path taken from `lecta.yaml` (`content`, `code.file`,
  `notes`, `artifacts[].path`) goes through `resolveInsideDeck()`, which rejects absolute
  paths, `C:\` paths, and any `..` segment. `content: ../../.ssh/id_rsa` fails to load and
  cannot be written back over.
- **Escape a `.lecta` archive.** Entries that resolve outside the extraction directory are
  skipped (zip-slip guard, `services/lecta-file.ts`).
- **Execute on sight.** Plain markdown never executes. MDX only compiles after you trust
  the deck, and never for a thumbnail or preview. The sub-slide measurer sanitizes with
  DOMPurify instead of assigning raw deck HTML to `innerHTML`
  (`src/renderer/src/hooks/useSubSlides.ts`).
- **Navigate the app anywhere.** `will-navigate` is denied for anything that is not an app
  URL, `window.open` is always denied (external `http(s)` links are handed to the OS
  browser), and `will-attach-webview` strips the preload from every guest
  (`src/main/index.ts:158`).
- **Run inline script in the app page.** The CSP has no `'unsafe-inline'` for scripts and
  `object-src 'none'` (`src/main/index.ts:80`).
- **Reach your API keys.** See [API keys](#api-keys).
- **Truncate your files.** New code files are created with `flag: 'wx'`; every store is
  written temp-then-rename under a per-key lock (`src/main/services/safe-fs.ts`).

## MDX slides (executable content)

MDX compiles to JSX and runs with the renderer's privileges, so it is behind a per-deck
trust gate, default off:

- `ContentRenderer` (`src/renderer/src/components/slides/ContentRenderer.tsx`) is the only
  place MDX is compiled. Untrusted or preview → the source is reduced to plain markdown
  and rendered by the non-executing `SlideRenderer`.
- The flag is per deck, resets on load, and is carried to the audience window in the
  presenter state so a trusted deck does not silently become executable there.
- Home screen thumbnails, the slide navigator and exports always render in preview mode.

Treat "Trust this deck" the way you would treat "Enable macros": only for decks you wrote
or whose author you trust.

## Native execution policy

`execution: native` is the one engine that leaves the sandbox. `exec:native`
(`src/main/ipc/execution.ts`) refuses unless **all** of the following hold:

1. `nativeExecutionEnabled` is true in Settings. It defaults to `false`
   (`src/main/schemas/settings.ts`) and is read in the main process on every call — the
   renderer cannot bypass it.
2. `cwd` is inside an open deck root.
3. `command` matches `/^[A-Za-z0-9_.+-]+$/` — a bare program name. No path separators, no
   shell metacharacters, no absolute paths.
4. `args` is an array of strings.
5. No other native run is already in flight for that window.

The child process itself (`src/main/services/native-executor.ts`):

- `shell: false` — always. There is no shell to inject into.
- A scrubbed environment: only `PATH HOME USER SHELL LANG TERM TMPDIR NODE_ENV LC_ALL
  LC_CTYPE` are forwarded. **No API keys reach the child.**
- `detached: true` on POSIX so timeout and cancel kill the whole process group
  (`SIGTERM`, then `SIGKILL` after 1 s); `taskkill /T /F` on Windows.
- Output is capped at 2 MB, after which the process is killed and the output marked
  truncated.
- The timeout is the configured `executionTimeout` (default 30 s).

What this does **not** do: it does not sandbox the program. `command: rm` with the toggle
on will run `rm`. The toggle is the boundary; the allowlist is your judgement.

## Remote control: LAN token model, and its limits

Presenter view can start a phone remote (`src/main/services/remote-control.ts`):

- A plain HTTP server binds `0.0.0.0` on the first free port in `[3333, 3343]`. If none is
  free it rejects rather than pretending to be up.
- A fresh 16-byte random token (`crypto.randomBytes`) is generated per start and forms the
  first path segment: `http://<lan-ip>:<port>/<token>`. Every request is compared against
  it; anything else gets `401`.
- Requests are rate-limited to 300 per 10 s per client IP.
- The API is deliberately tiny: read the current slide/notes/title, and move
  next/prev/first/last. There is no file access and no eval of client input.
- `remote:stop`, closing presenter mode and quitting all clear the token.

**Limits you should know before you use it on a conference network:**

- It is **HTTP, not HTTPS**. The token travels in the clear and is visible to anyone who
  can see your traffic or your QR code. Anyone on the same LAN who obtains it can page
  through your deck.
- It binds to all interfaces, not just the interface you presented the QR code on.
- The token is a bearer credential with no expiry other than stopping the remote.
- Slide *notes* are returned to whoever holds the token.

Start it when you need it, stop it when you are done, and do not use it on a network you
would not read your speaker notes aloud on.

## API keys

Keys for the eight AI providers are stored in `settings.json` under Electron's
`app.getPath('userData')` and handled by `src/main/ipc/settings.ts`:

- **At rest**: each sensitive field is encrypted with Electron `safeStorage` (macOS
  Keychain / Windows DPAPI / libsecret) and stored as `enc:<base64>`. A plaintext key found
  on disk is migrated to encrypted form on the next load. The file is written atomically
  with mode `0600`. When the OS keychain is unavailable, values are stored as plaintext —
  the app does not pretend otherwise.
- **To the renderer**: never. `settings:get` returns `redactSettings()`, which replaces
  every secret with `''` and adds `configuredKeys: { anthropicApiKey: true, … }` so the UI
  can show "Connected" without ever holding the value.
- **From the renderer**: `''` or `undefined` for a secret means "unchanged" (so a redacted
  round-trip cannot wipe a key), `null` means "clear". `configuredKeys` is never persisted.
- **Resolution order** for a request (`src/main/services/env-loader.ts`): the deck's own
  `.env` → app settings → `process.env`. A deck's `.env` therefore *can* supply a key for
  that deck; keep untrusted decks out of folders where you keep credentials.
- Provider calls are made from the main process only. Native child processes get a scrubbed
  environment (above), and Codex runs in a scratch cwd with network access off.
- ChatGPT sign-in for Codex-backed OpenAI is owned by the local Codex CLI; Lecta reads
  account status and results and never reads or stores those OAuth tokens.
- Behaviour covered by tests: `src/main/ipc/settings.test.ts`.

## AI agent actions

The chat agent can edit the open deck. Destructive tools (`delete_slide`,
`reorder_slides`, bulk generation) always ask for confirmation, including in `auto` mode
(`src/main/services/chat-agent-tools.ts`). Deck content handed to a model is delimited as
data, pending confirmations are bound to the window that requested them and are denied if
that window goes away. AI output is written to `.md`, never into an `.mdx` slide, so a
prompt-injected model response cannot turn itself into executable content.

## Known limits

- `sandbox: false` in `webPreferences`: the preload needs Node built-ins, so the renderer
  is not in Chromium's OS-level sandbox. Confinement is enforced in the main process, not
  by the OS.
- MDX, once trusted, runs with the full `electronAPI` bridge. Trust is the boundary; there
  is no capability subsetting yet.
- Releases are not code-signed or notarised; `install.sh` clears the quarantine attribute
  on macOS.
- The MCP server runs outside the app with the permissions of whatever launched it
  (Claude Desktop) and is not subject to the app's IPC confinement.

## Reporting a vulnerability

Please do **not** open a public issue. Use
[GitHub private vulnerability reporting](https://github.com/ruimachado-orbit/lecta/security/advisories/new),
or the contacts and timelines in [`.github/SECURITY.md`](../.github/SECURITY.md).
