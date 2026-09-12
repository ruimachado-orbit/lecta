# Lecta

**Open-source technical presentation platform with live code execution and multi-provider AI.**

Lecta puts slides and executable code side by side — no more switching between PowerPoint and a terminal. Write in Markdown, run real code in-app, generate entire presentations with AI, present with audience sync, and export to PDF or HTML.

## Features

### Slides & Editing
- **Split-pane layout** — slides on the left, code editor on the right
- **Markdown & WYSIWYG** — toggle between raw Markdown and a visual rich-text editor (Tiptap)
- **12 slide layouts** — default, center, title, section, two-col, two-col-wide-left, two-col-wide-right, three-col, top-bottom, big-number, quote, blank
- **8 themes** — Dark, Light, Executive, Minimal, Corporate, Creative, Keynote Dark, Paper
- **Slide transitions** — left, right, top, bottom, none
- **Slide groups** — organize slides into named groups with custom colors
- **Incremental reveal** — manual slide breaks (`----`) with click-to-advance steps
- **Skip slides** — hide slides from presentation without deleting them
- **Drawing overlay** — freehand pen, lines, arrows, rectangles, ellipses, text annotations with color and fill controls
- **MDX slides, behind a trust prompt** — a slide can be `.mdx` (JSX components, not just markdown), but MDX is executable, so it is only compiled after you trust that specific deck. Until then — and always for thumbnails, previews and exports — the slide renders as plain markdown. See [`docs/SECURITY-MODEL.md`](docs/SECURITY-MODEL.md)

### Code Execution
- **5 execution engines** — JavaScript (isolated Web Worker), Python (Pyodide/WASM), SQL (sql.js/WASM), native (any language via local toolchain), or display-only
- **15 languages** — JavaScript, TypeScript, Python, SQL, HTML, CSS, JSON, Bash, Go, Rust, Java, C#, Ruby, PHP, Markdown
- **Works offline** — Monaco, Pyodide and sql.js are bundled with the app and loaded from `out/renderer/runtimes`; nothing is fetched from a CDN at run time
- **Native execution is off by default** — `execution: native` runs only after you enable it in Settings, and then only a bare program name, in the open deck's folder, with no shell, an environment scrubbed of API keys, a configurable timeout and a hard process-group kill
- **Real file loading** — code comes from actual files on disk, not inline snippets. Edit in VS Code, Lecta auto-reloads
- **Streaming output** — stdout/stderr displayed in real-time with duration tracking
- **Execution controls** — run, cancel, timeout (30s default)

### AI (8 Providers, 25+ Models)
- **Anthropic** — Claude Sonnet 4.5, Claude Sonnet 4, Claude Opus 4.1, Claude Opus 4, Claude Haiku 4.5
- **OpenAI** — API key: GPT-5.5, GPT-5.4, GPT-5.4 Mini · Codex CLI sign-in adds GPT-5.3 Codex and GPT-5.3 Codex Spark
- **Google Gemini** — Gemini 2.5 Pro, 2.5 Flash, 2.0 Flash
- **Mistral** — Mistral Large, Medium, Small
- **Meta Llama** — Llama 4 Maverick, Llama 4 Scout, Llama 3.3 70B
- **xAI** — Grok 3, Grok 3 Fast, Grok 3 Mini, Grok 3 Mini Fast
- **Perplexity** — Sonar Pro, Sonar, Sonar Reasoning Pro, Sonar Reasoning
- **Ollama** — any model installed locally, discovered from the running Ollama instance (`OLLAMA_BASE_URL`, default `http://localhost:11434`)

API keys are configured per-provider in Settings with live validation, or per-deck via `.env` files. OpenAI can also use a local Codex CLI ChatGPT sign-in instead of an API key; the `*-codex` models are only available in that mode. A model id that is not in the catalog is rejected — prefix a local model with `ollama:` (for example `ollama:llama3.2`) to route it to Ollama explicitly.

#### AI Capabilities
- **Full presentation generation** — describe a topic, get a complete deck with configurable slide count
- **Slide generation** — generate individual or bulk slides from prompts
- **Speaker notes** — auto-generate structured notes (opening, key points, code walkthrough, transition)
- **Slide beautification** — one-click McKinsey-style professional formatting across the whole deck
- **Slide improvement** — refine slides with natural language instructions
- **Code generation** — generate or modify code blocks from prompts
- **Chart generation** — create SVG charts from descriptions
- **Inline text** — generate text to insert at cursor position
- **Article generation** — transform your presentation into a long-form article
- **Image generation** — create and edit images via Google Gemini (`gemini-2.5-flash-image`, a.k.a. Nano Banana), OpenAI DALL-E, or Codex image generation
- **Chat agent** — multi-turn conversational AI that can read, navigate, and edit your presentation with tool use (auto or ask-first mode)

### Presenter Mode & Audience Sync
- **Presenter window** — speaker notes, timer, slide preview
- **Audience window** — fullscreen presentation on a second display
- **Live sync** — slides, code changes, execution output, artifacts, and mouse pointer all synchronized in real-time
- **Remote control** — phone remote over the local network (scan a QR code from presenter view). A random per-session token in the URL is the only credential and it travels over plain HTTP — see [`docs/SECURITY-MODEL.md`](docs/SECURITY-MODEL.md) before using it on an untrusted network

### Export
- **PDF** — slide-by-slide export with print-quality rendering
- **HTML** — self-contained single-file SPA with keyboard navigation and theme support
- **PowerPoint (`.pptx`)** — editable deck built with `pptxgenjs` in the main process (no binary, no network): the 12 layouts mapped to slide masters, the 8 themes as colour/type sets, sub-slides as separate slides, code blocks as monospace boxes, images embedded from the deck folder, pinned elements placed at their canvas positions, and speaker notes attached
- **Article** — AI-generated long-form document from your slides

Exports are written atomically through a save dialog, and the result is reported with a **Reveal** action. Untrusted MDX slides export as plain markdown, never as compiled output.

### Attachments & Media
- **Artifacts** — attach PDFs, Excel files, images, or any document to slides
- **Video embeds** — URL-based video players per slide
- **Web apps** — embedded iframes for live demos
- **AI prompts** — attach prompts with saved responses to slides
- **Image library** — browse and manage AI-generated images

### Notebook Mode
- **Hierarchical notes** — parent/child note organization with unlimited nesting
- **Note layouts** — lines, blank, agenda, grid
- **Rich content** — Markdown, code blocks, videos, web apps per note
- **Archive** — archive and restore notes

### Library & Organization
- **Presentation library** — folders with custom colors, tags with color coding
- **Slide library** — save and reuse slide templates with metadata
- **Import** — import slides from other `.lecta` files or PowerPoint (PPTX)
- **Recent decks** — quick access to recently opened presentations

### Other
- **File watcher** — live-reloads code and content when files change on disk
- **Auto-save** — background persistence with change detection
- **Slide map** — overview of every slide with jump-to navigation
- **Dark/light mode** — system-wide theme toggle
- **Keyboard driven** — arrow keys to navigate, `Cmd+Enter` to run, `F5` to present

## Install

### macOS (one-liner)

```bash
curl -fsSL https://raw.githubusercontent.com/ruimachado-orbit/lecta/main/install.sh | bash
```

This downloads the latest release, installs it to `/Applications`, and handles macOS Gatekeeper automatically.

### Linux (one-liner)

```bash
curl -fsSL https://raw.githubusercontent.com/ruimachado-orbit/lecta/main/install.sh | bash
```

On Debian/Ubuntu, this downloads and installs the `.deb` package via `apt-get`. On other distros, it falls back to an AppImage installed to `~/.local/bin`.

Both `.deb` and `.AppImage` are available on the [releases page](https://github.com/ruimachado-orbit/lecta/releases).

### From Source

Prerequisites: [Bun](https://bun.sh/) 1.3+ (app, see `packageManager` in `package.json`), [Node.js](https://nodejs.org/) 22+ (MCP server, Electron tooling)

```bash
git clone git@github.com:ruimachado-orbit/lecta.git
cd lecta
make dev
```

`make dev` runs `bun install` and builds the MCP server (`packages/mcp-server`, plain `npm`), creates a `.env` from the template, and launches the app. `bun.lock` is the only lockfile for the app — do not commit `package-lock.json` or `pnpm-lock.yaml` at the root.

### Configure AI Providers (Optional)

Open **Settings** in the app to add API keys for any of the 8 supported providers. Keys are validated against the provider's API in real-time.

For OpenAI without an API key, install the Codex CLI and sign in with ChatGPT:

```bash
npm install -g @openai/codex
codex login
```

Then choose **OpenAI account → Codex CLI** in Settings. Lecta uses `codex app-server` locally and keeps ChatGPT tokens inside Codex's own auth storage.

Alternatively, add keys to a `.env` file at the project root or inside your presentation folder:

```bash
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-...
GEMINI_API_KEY=...
MISTRAL_API_KEY=...
```

Keys are loaded using a fallback chain:
1. Deck's `.env` file (per-presentation)
2. App-level settings (`settings.json` in Electron's `userData` directory — `~/Library/Application Support/Lecta` on macOS, `~/.config/Lecta` on Linux, `%APPDATA%\Lecta` on Windows). Keys there are encrypted with the OS keychain via Electron `safeStorage` and are never sent to the renderer
3. Process environment variables

## Creating a Presentation

There are two ways to write a deck: **one markdown file** (the quickest way in) or the **folder format** (canonical — every feature lives there). Opening a single file turns it into a folder, so you never have to choose up front.

### The Single-File Form

Write the whole deck in one `.md` file and open it with **Open**. Lecta materializes it into a deck folder of the same name next to the file (`my-talk.md` → `my-talk/`) and opens that; the file is left untouched. If a folder of that name already exists, Lecta refuses rather than writing into it.

````markdown
---
title: My Talk
author: Your Name
theme: executive
---
# Slide one

Body text.

---
layout: two-col
transition: left
---
# Slide two

```python file=demo.py execution=pyodide packages=[numpy]
print("hi")
```

<!-- notes -->
Speaker notes for this slide.
````

The rules, in full:

| Element | What it does |
|---------|--------------|
| A line that is exactly `---` | Starts a new slide. `----` (or longer) is an ordinary horizontal rule and splits nothing, and a `---` inside a code fence is left alone |
| The first block, when the file opens with `---` | Deck frontmatter: `title`, `author`, `theme`, `presenterNotes`, `ai`. Unknown keys are carried into `lecta.yaml` |
| A YAML block between two `---` lines whose keys are *all* slide options | Configures the slide that follows: `id`, `title`, `layout`, `transition`, `notes`, `skip`, `background`. To configure the very first slide, put this block right after the frontmatter |
| A fenced code block with `file=` in its info string | Becomes the slide's code file. Also accepts `execution=`, `packages=[a, b]`, `dependencies=[…]`, `seedData=`, `command=`, `args=[…]`. A bare name lands in `code/`; `file=code/demo.py` is used as given. Fences without `file=` stay inline |
| `<!-- notes -->` on its own line | Everything after it, to the end of the slide, becomes speaker notes |

Defaults match the rest of the app: the engine follows the language (`javascript`/`typescript` → `sandpack`, `python` → `pyodide`, `sql` → `sql`, anything else → `native` with the usual interpreter), and slide ids are slugged from each slide's first heading (deduped with `-2`, `-3`, …).

Two things a single file cannot express: MDX slides (materialized slides are always `.md`), and a setext heading underlined with `---` (it reads as a slide separator — use `#` headings).

Going the other way, **Deck → Export as single Markdown file** writes an open deck back out as one file, frontmatter, code fences and notes included.

A working example lives in [`example-decks/single-file-demo.md`](example-decks/single-file-demo.md).

### The Folder Format

A presentation is a **folder** with a `lecta.yaml` manifest, markdown slides, code files, and optional artifacts. All paths in `lecta.yaml` (`content`, `code.file`, `notes`, `artifacts[].path`) must be relative to the folder and stay inside it (no `..`, no absolute paths). Unknown top-level keys are preserved when the deck is saved.

```
my-talk/
  lecta.yaml              # Deck manifest
  slides/
    01-intro.md            # Markdown slides
    02-demo.md
  code/
    demo.py                # Real code files
    setup.js
  artifacts/
    diagram.pdf            # Attached documents
    01-intro.notes.md      # Speaker notes (auto-generated or hand-written)
  .env                     # (Optional) API keys for this deck
```

### `lecta.yaml` Example

```yaml
title: "My Technical Talk"
author: "Your Name"
theme: "dark"

slides:
  - id: intro
    content: slides/01-intro.md
    layout: title
    transition: left

  - id: python-demo
    content: slides/02-demo.md
    layout: two-col
    code:
      file: code/demo.py
      language: python
      execution: pyodide
      packages: ["pandas", "numpy"]
    artifacts:
      - path: artifacts/diagram.pdf
        label: "Architecture Diagram"

  - id: js-demo
    content: slides/03-js.md
    code:
      file: code/setup.js
      language: javascript
      execution: sandpack

  - id: native-demo
    content: slides/04-native.md
    code:
      file: code/server.js
      language: javascript
      execution: native
      command: node
      args: ["code/server.js"]
```

### Execution Engines

| Engine | Languages | How it works |
|--------|-----------|-------------|
| `sandpack` | JavaScript, TypeScript | Isolated Web Worker — no DOM, no bridge, hard cancel and timeout |
| `pyodide` | Python | CPython compiled to WebAssembly, supports pip packages |
| `sql` | SQL | SQLite in WebAssembly via sql.js, supports seed data |
| `native` | Any | Runs via your local toolchain (`child_process.spawn`, no shell). Disabled until you turn it on in Settings |
| `none` | — | Display code without execution |

### Themes

`theme` is one of `dark` (default), `light`, `executive`, `minimal`, `corporate`, `creative`, `keynote-dark`, `paper`. An unknown theme is accepted and falls back to `dark` (with a warning) so older decks still open.

### Slide Layouts

| Layout | Description |
|--------|-------------|
| `default` | Standard top-down flow |
| `center` | Everything centered vertically and horizontally |
| `title` | Big centered title with subtitle |
| `section` | Section break with accent bar |
| `two-col` | Two equal columns |
| `two-col-wide-left` | 60/40 left-heavy split |
| `two-col-wide-right` | 40/60 right-heavy split |
| `three-col` | Three equal columns |
| `top-bottom` | Content split top and bottom |
| `big-number` | Large stat/number with context |
| `quote` | Blockquote-style centered layout |
| `blank` | No padding, full canvas |

### Slide Markdown

Slides are standard GitHub-flavored Markdown. Use headings, lists, code blocks, tables, images, blockquotes — all rendered with presentation-quality typography.

Use `----` to create incremental reveal steps within a single slide.

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `←` / `→` | Previous / Next slide |
| `Cmd+Enter` | Run code |
| `F5` | Enter presenter mode |
| `Esc` | Exit presenter mode |
| `Shift+N` | Add a slide |
| `Shift+S` | Toggle speaker notes panel |
| `Cmd+S` | Save the current slide |
| `Cmd+Z` / `Cmd+Shift+Z` | Undo / redo a slide edit |
| `Cmd+/` | Toggle the AI chat |

## Use with Claude (MCP Server)

Lecta ships with an MCP server that lets you create and manage presentations directly from **Claude Desktop** or **Claude Code**. Just talk naturally — Claude handles the rest.

**What you can say:**
- *"Create a 10-slide presentation about microservices"*
- *"Add a slide about error handling with a Python code example"*
- *"Change the theme to executive"*
- *"List all slides in my presentation"*

### Setup

1. Open **Settings** in Lecta and turn on **MCP Server** under Claude Integration.
2. Click **"Add to Claude Desktop"** — this automatically configures Claude to use Lecta.
3. Restart Claude Desktop — you'll see "lecta" in the MCP tools list.

That's it. Changes from Claude appear live in Lecta thanks to the file watcher.

> **From source?** If you're running from the repo instead of the app, build the MCP server first: `cd packages/mcp-server && npm install && npm run build`

### Available Tools

| Tool | What it does |
|------|-------------|
| `create_presentation` | Create a new deck with title, theme, and starter slides |
| `add_slide` | Add a slide with markdown, code, layout, and speaker notes |
| `edit_slide` | Update content, layout, code, notes, or transitions |
| `delete_slide` | Remove a slide |
| `list_slides` | See all slides and their metadata |
| `set_theme` | Switch between the 8 built-in themes |
| `add_artifact` | Attach files (PDFs, images, docs) to a slide |

## Project Structure

```
lecta/
  packages/shared/src/        # Shared types, YAML parser, constants
  src/main/                   # Electron main process (IPC, services)
    ipc/                      # IPC handlers (file system, settings, library)
    services/                 # AI, execution, image gen, file watching
  src/preload/                # Context bridge (type-safe renderer API)
  src/renderer/src/           # React UI
    components/               # UI components (slides, AI, layout, notebook)
    stores/                   # Zustand state management
    hooks/                    # Custom React hooks
  example-decks/              # Example presentation to get started
```

### Tech Stack

| Layer | Technology |
|-------|-----------|
| Desktop shell | Electron |
| Build tool | electron-vite (Vite) |
| UI | React 19 + TypeScript |
| Code editor | Monaco Editor |
| Rich text editor | Tiptap |
| Styling | Tailwind CSS 4 |
| State | Zustand |
| AI | Anthropic, OpenAI, OpenAI via Codex CLI, Google GenAI, Mistral, Meta, xAI, Perplexity |
| Slide rendering | react-markdown + remark-gfm |
| Image generation | Google Gemini ImageFX, OpenAI DALL-E, Codex image generation |

## Development

```bash
# Install dependencies
make install

# Start in dev mode (hot reload)
make dev

# Production build
make build

# Package as distributable
make package-mac    # macOS DMG
make package-win    # Windows installer
make package-linux  # Linux .deb + AppImage

# Lint and format
make lint
make format

# Type check
make typecheck

# Run tests
make test           # app + shared (vitest)
make test-mcp       # packages/mcp-server
make test-all       # both suites
make test-watch     # vitest in watch mode

# Packaged-app smoke test (needs `make build` first)
bun run test:e2e

# Clean build artifacts (also removes node_modules)
make clean
```

> `bun test` would run Bun's own test runner — always go through the `make` targets or the npm scripts.

### Documentation

| Document | What is in it |
|---|---|
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | Processes, the IPC surface, deck-root confinement, atomic persistence, the `.lecta` container, presenter handshake, bundled runtimes, the MCP server's relationship to the app |
| [`docs/SECURITY-MODEL.md`](docs/SECURITY-MODEL.md) | What a deck file can and cannot do, native-execution policy, the remote-control token model and its limits, how API keys are stored and exposed |
| [`docs/RELEASING.md`](docs/RELEASING.md) | Make targets, CI gates, the smoke test, version sync, release checklist |
| [`docs/PROJECT_REVIEW.md`](docs/PROJECT_REVIEW.md) | End-to-end review, the numbered defect list, and what has been fixed so far |
| [`CHANGELOG.md`](CHANGELOG.md) | Keep-a-Changelog history |

## Releasing

Full procedure — gates, version sync and the checklist — is in [`docs/RELEASING.md`](docs/RELEASING.md).

Releases are published to [GitHub Releases](https://github.com/ruimachado-orbit/lecta/releases) with macOS DMGs and Linux packages (.deb + AppImage) attached.

```bash
# Release current version (build + package + tag + upload DMGs + Linux packages)
make release

# Bump version and release (picks one)
make bump-patch     # 0.1.0 → 0.1.1
make bump-minor     # 0.1.0 → 0.2.0
make bump-major     # 0.1.0 → 1.0.0
```

Each bump command automatically:
1. Updates the version in `package.json` and `web/lib/config.ts`
2. Commits and pushes the version change
3. Builds the app and packages macOS DMGs (arm64 + x64) and Linux packages (.deb + AppImage, x64)
4. Creates a git tag and GitHub release with all artifacts attached

> **Note:** The app is not yet code-signed with an Apple Developer certificate. The install script (`install.sh`) handles macOS Gatekeeper automatically. If installing manually from the DMG, run:
> ```bash
> xattr -cr /Applications/Lecta.app
> ```

## Security

A deck is content someone sent you. [`docs/SECURITY-MODEL.md`](docs/SECURITY-MODEL.md) is the full account of what one can and cannot do; the short version:

- **No secrets in the repo** — `.env` files are gitignored. Only `.env.example` (with a placeholder) is committed
- **API key isolation** — keys never leave the main process. They are encrypted at rest with Electron `safeStorage` and the renderer only ever receives booleans saying which providers are configured
- **Codex auth isolation** — ChatGPT sign-in for Codex-backed OpenAI access is owned by the local Codex CLI/app-server. Lecta reads account status and generation results, but does not read or store Codex OAuth tokens
- **Deck confinement** — every filesystem path that crosses IPC, and every path read out of `lecta.yaml`, is resolved and rejected unless it is inside an open deck folder. Absolute paths and `..` are refused
- **Sandboxed code execution** — JavaScript runs in an isolated Web Worker (no DOM, no bridge); Python and SQL run in WebAssembly. Only `native` execution runs with local permissions, and only after you opt in
- **No `shell: true`** — native execution uses `child_process.spawn` without shell mode, with a scrubbed environment and a process-group kill on timeout or cancel
- **Executable slides are opt-in** — MDX compiles only for a deck you have explicitly trusted, never for thumbnails, previews or exports
- **Context isolation** — Electron's `contextIsolation` is enabled; `nodeIntegration` is disabled; navigation, `window.open` and `<webview>` attachment are guarded on every `webContents`
- **CSP headers** — Content Security Policy restricts script sources in the renderer (no `'unsafe-inline'` scripts, `object-src 'none'`)

## Contributing

Contributions are welcome! Please read our [Contributing Guide](.github/CONTRIBUTING.md) before submitting a pull request.

All PRs require approval from at least one code owner:
- [@ruimachado-orbit](https://github.com/ruimachado-orbit) (Rui Machado)
- [@DiogoAntunesOliveira](https://github.com/DiogoAntunesOliveira) (Diogo Antunes Oliveira)
- [@PedroFerreira](https://github.com/pedroferreira26) (Pedro Ferreira)

For security vulnerabilities, see our [Security Policy](.github/SECURITY.md).

## License

[MIT](LICENSE) — Rui Machado
