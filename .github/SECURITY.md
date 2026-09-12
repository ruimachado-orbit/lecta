# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| latest  | :white_check_mark: |

Only the latest release gets fixes. Lecta is not code-signed or notarised yet; install from
the [releases page](https://github.com/ruimachado-orbit/lecta/releases) or with `install.sh`.

## Threat model

Read [`docs/SECURITY-MODEL.md`](../docs/SECURITY-MODEL.md) before reporting. It states what
a deck file is allowed to do and where each boundary is enforced. In short: the renderer is
treated as untrusted, every filesystem path crossing IPC is confined to the open deck,
executable MDX is behind a per-deck trust prompt, native execution is off by default, and
API keys stay in the main process.

**In scope** — anything that gets past one of those boundaries, for example:

- Reading or writing a file outside the open deck folder (IPC handler, `lecta-file://`,
  `.lecta` extraction, the MCP server).
- Executing code from a deck without the trust prompt or the native-execution toggle:
  compiled MDX in a preview/thumbnail/export, script running in the app page, escaping the
  JavaScript worker, bypassing the `exec:native` checks.
- An API key or Codex token reaching the renderer, a log, a child process environment, or a
  provider it was not meant for.
- Navigating an app window somewhere it should not go, attaching a privileged `<webview>`,
  or reaching the app's IPC bridge from embedded web content.
- Remote control accepting a request without the right token, or the token leaking through
  something other than the QR code you displayed.
- Corrupting or destroying user data through the persistence paths (atomic writes, locks,
  the `.lecta` workspace mapping).

**Known and documented, not vulnerabilities** — please do not file these; propose an
improvement in an issue instead:

- Remote control is plain HTTP with a bearer token in the URL path. Anyone on your LAN who
  gets the token can page through the deck. See `docs/SECURITY-MODEL.md#remote-control-lan-token-model-and-its-limits`.
- `execution: native` runs your local toolchain once you enable it. The Settings toggle is
  the boundary; the program is not sandboxed.
- Trusted MDX runs with the renderer's privileges. There is no capability subsetting yet.
- `sandbox: false` in `webPreferences` — the preload needs Node built-ins, so confinement is
  enforced in the main process rather than by Chromium's OS sandbox.
- Releases are unsigned.

## Reporting a Vulnerability

**Do NOT open a public GitHub issue for security vulnerabilities.**

Preferred: [GitHub private vulnerability reporting](https://github.com/ruimachado-orbit/lecta/security/advisories/new).

Otherwise, email the maintainers directly:

- **Rui Machado** — [@ruimachado-orbit](https://github.com/ruimachado-orbit)
- **Diogo Antunes Oliveira** — [@DiogoAntunesOliveira](https://github.com/DiogoAntunesOliveira)
- **Pedro Ferreira** — [@PedroFerreira](https://github.com/PedroFerreira)

### What to include

- Description of the vulnerability, and which boundary it crosses
- Steps to reproduce — a minimal `.lecta` file or deck folder is ideal
- Lecta version, OS, and whether you were running a release build or from source
- Potential impact
- Suggested fix (if any)

### Response timeline

- **Acknowledgement**: within 48 hours
- **Initial assessment**: within 1 week
- **Fix or mitigation**: as soon as reasonably possible

We will credit you in the release notes unless you ask us not to.

We appreciate your help in keeping Lecta and its users safe.
