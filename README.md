# Lecta

**Open-source technical presentation platform with live code execution.**

Lecta puts slides and executable code side by side — no more switching between PowerPoint and a terminal. Load real code files from disk, run them in-app, attach artifacts (PDFs, Excel, images), and generate speaker notes with Claude AI.

## Features

- **Split-pane layout** — slides on the left, code editor on the right
- **4 execution engines** — JavaScript (sandboxed iframe), Python (Pyodide/WebAssembly), SQL (sql.js/WebAssembly), and native (any language via your local toolchain)
- **Real file loading** — code comes from actual files on disk, not inline snippets. Edit in VS Code, Lecta auto-reloads
- **Artifacts** — attach PDFs, Excel files, images, or any document to any slide
- **AI speaker notes** — generate speaker notes per slide using Claude (Anthropic API)
- **Presenter mode** — fullscreen presentation with a separate speaker view (notes + timer + next slide)
- **File watcher** — live-reloads code when you edit files externally
- **Keyboard driven** — arrow keys to navigate, `Cmd+Enter` to run, `F5` to present, `Esc` to exit

## Quick Start

### Prerequisites

- [Node.js](https://nodejs.org/) 20+
- [pnpm](https://pnpm.io/) 9+
- (Optional) [Anthropic API key](https://console.anthropic.com/) for AI speaker notes

### Install and Run

```bash
git clone git@github.com:ruimachado-orbit/lecta.git
cd lecta
make dev
```

`make dev` installs dependencies, creates a `.env` from the template, and launches the app.

### Set Up AI Speaker Notes (Optional)

Add your Anthropic API key to the `.env` file at the project root or inside your presentation folder:

```bash
ANTHROPIC_API_KEY=sk-ant-your-key-here
```

The key is loaded using a fallback chain:
1. Deck's `.env` file (per-presentation)
2. App-level settings
3. `ANTHROPIC_API_KEY` environment variable

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
  .env                     # (Optional) Anthropic API key for this deck
```

### `lecta.yaml` Example

```yaml
title: "My Technical Talk"
author: "Your Name"
theme: "dark"

slides:
  - id: intro
    content: slides/01-intro.md
    artifacts: []

  - id: python-demo
    content: slides/02-demo.md
    code:
      file: code/demo.py
      language: python
      execution: pyodide           # pyodide | sandpack | sql | native | none
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

### Slide Markdown

Slides are standard GitHub-flavored Markdown. Use headings, lists, code blocks, tables, images, blockquotes — all rendered with presentation-quality typography.

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `←` / `→` | Previous / Next slide |
| `Cmd+Enter` | Run code |
| `F5` | Enter presenter mode |
| `Esc` | Exit presenter mode |
| `N` | Toggle speaker notes panel |

## Project Structure

```
lecta/
  packages/shared/src/        # Shared types, YAML parser, utilities
  src/main/                   # Electron main process (IPC handlers, services)
  src/preload/                # Context bridge (type-safe renderer API)
  src/renderer/src/           # React UI (components, stores, hooks)
  example-decks/              # Example presentation to get started
```

### Tech Stack

| Layer | Technology |
|-------|-----------|
| Desktop shell | Electron |
| Build tool | electron-vite (Vite) |
| UI | React 19 + TypeScript |
| Code editor | Monaco Editor (VS Code) |
| Styling | Tailwind CSS 4 |
| State | Zustand |
| AI | Anthropic Claude SDK |
| Slide rendering | react-markdown + remark-gfm |

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
make package-linux  # Linux AppImage

# Lint and format
make lint
make format

# Clean build artifacts
make clean
```

## Security

- **No secrets in the repo** — `.env` files are gitignored. Only `.env.example` (with a placeholder) is committed
- **API key isolation** — the Anthropic API key never leaves the Electron main process. The renderer communicates via IPC
- **Sandboxed code execution** — JavaScript runs in a sandboxed iframe. Python and SQL run in WebAssembly. Only `native` execution runs with local permissions (opt-in)
- **No `shell: true`** — native execution uses `child_process.spawn` without shell mode to prevent injection
- **Context isolation** — Electron's `contextIsolation` is enabled; `nodeIntegration` is disabled
- **CSP headers** — Content Security Policy restricts script sources in the renderer

## Contributing

Contributions are welcome! Please open an issue or submit a pull request.

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/my-feature`)
3. Commit your changes
4. Push to the branch (`git push origin feature/my-feature`)
5. Open a Pull Request

## License

[MIT](LICENSE) — Rui Machado
