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

### Code Execution
- **5 execution engines** — JavaScript (sandboxed iframe), Python (Pyodide/WASM), SQL (sql.js/WASM), native (any language via local toolchain), or display-only
- **14 languages** — JavaScript, TypeScript, Python, SQL, HTML, CSS, JSON, Bash, Go, Rust, Java, C#, Ruby, PHP
- **Real file loading** — code comes from actual files on disk, not inline snippets. Edit in VS Code, Lecta auto-reloads
- **Streaming output** — stdout/stderr displayed in real-time with duration tracking
- **Execution controls** — run, cancel, timeout (30s default)

### AI (7 Providers, 20+ Models)
- **Anthropic** — Claude Sonnet 4, Opus 4, Haiku 4
- **OpenAI** — GPT-4o, GPT-4o Mini, o3, o3-mini, o4-mini
- **Google Gemini** — Gemini 2.5 Pro, 2.5 Flash, 2.0 Flash
- **Mistral** — Large, Medium, Small
- **Meta Llama** — Llama 4 Maverick, Scout, Llama 3.3 70B
- **xAI** — Grok 3, Grok 3 Fast, Grok 3 Mini, Grok 3 Mini Fast
- **Perplexity** — Sonar Pro, Sonar, Sonar Reasoning Pro, Sonar Reasoning

API keys are configured per-provider in Settings with live validation, or per-deck via `.env` files.

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
- **Image generation** — create and edit images via Google Gemini or OpenAI DALL-E
- **Chat agent** — multi-turn conversational AI that can read, navigate, and edit your presentation with tool use (auto or ask-first mode)

### Presenter Mode & Audience Sync
- **Presenter window** — speaker notes, timer, slide preview
- **Audience window** — fullscreen presentation on a second display
- **Live sync** — slides, code changes, execution output, artifacts, and mouse pointer all synchronized in real-time
- **Remote control** — WebSocket-based remote for controlling presentations

### Export
- **PDF** — slide-by-slide export with print-quality rendering
- **HTML** — self-contained single-file SPA with keyboard navigation and theme support
- **Article** — AI-generated long-form document from your slides

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
- **Spotlight search** — command palette for quick navigation
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

Prerequisites: [Node.js](https://nodejs.org/) 20+, [pnpm](https://pnpm.io/) 9+

```bash
git clone git@github.com:ruimachado-orbit/lecta.git
cd lecta
make dev
```

`make dev` installs dependencies, creates a `.env` from the template, and launches the app.

### Configure AI Providers (Optional)

Open **Settings** in the app to add API keys for any of the 7 supported providers. Keys are validated against the provider's API in real-time.

Alternatively, add keys to a `.env` file at the project root or inside your presentation folder:

```bash
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-...
GEMINI_API_KEY=...
MISTRAL_API_KEY=...
```

Keys are loaded using a fallback chain:
1. Deck's `.env` file (per-presentation)
2. App-level settings (`~/.lecta/settings.json`)
3. Process environment variables

## Creating a Presentation

A presentation is a **folder** with a `lecta.yaml` manifest, markdown slides, code files, and optional artifacts:

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
  notes/
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
| `sandpack` | JavaScript, TypeScript | Sandboxed iframe, safe in-browser execution |
| `pyodide` | Python | CPython compiled to WebAssembly, supports pip packages |
| `sql` | SQL | SQLite in WebAssembly via sql.js, supports seed data |
| `native` | Any | Runs via your local toolchain (`child_process.spawn`) |
| `none` | — | Display code without execution |

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
| `N` | Toggle speaker notes panel |

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
| AI | Anthropic, OpenAI, Google GenAI, Mistral, Meta, xAI, Perplexity |
| Slide rendering | react-markdown + remark-gfm |
| Image generation | Google Gemini ImageFX, OpenAI DALL-E |

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
make test

# Run tests in watch mode
make test-watch

# Clean build artifacts
make clean
```

## Releasing

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

- **No secrets in the repo** — `.env` files are gitignored. Only `.env.example` (with a placeholder) is committed
- **API key isolation** — API keys never leave the Electron main process. The renderer communicates via IPC. Keys are validated with live API calls before showing "Connected" status
- **Sandboxed code execution** — JavaScript runs in a sandboxed iframe. Python and SQL run in WebAssembly. Only `native` execution runs with local permissions (opt-in)
- **No `shell: true`** — native execution uses `child_process.spawn` without shell mode to prevent injection
- **Context isolation** — Electron's `contextIsolation` is enabled; `nodeIntegration` is disabled
- **CSP headers** — Content Security Policy restricts script sources in the renderer

## Contributing

Contributions are welcome! Please read our [Contributing Guide](.github/CONTRIBUTING.md) before submitting a pull request.

All PRs require approval from at least one code owner:
- [@ruimachado-orbit](https://github.com/ruimachado-orbit) (Rui Machado)
- [@DiogoAntunesOliveira](https://github.com/DiogoAntunesOliveira) (Diogo Antunes Oliveira)
- [@PedroFerreira](https://github.com/pedroferreira26) (Pedro Ferreira)

For security vulnerabilities, see our [Security Policy](.github/SECURITY.md).

## License

[MIT](LICENSE) — Rui Machado
