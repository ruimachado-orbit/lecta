# End-to-end smoke test

`smoke.mjs` launches the **built** Electron app with a throw-away `HOME`, opens a copy of
`example-decks/hello-world`, and checks the things a release must never break:

- the deck opens from Recents
- Monaco is served from the bundle (no CDN)
- the JavaScript sandbox returns output without a CSP violation
- Python (Pyodide) and SQL (sql.js) run from the bundled runtimes
- native execution is refused while the Settings toggle is off
- no uncaught renderer errors

Run it locally:

```bash
bun run build
bun run test:e2e          # Linux: wraps in xvfb-run when no display is available
```

The harness uses `playwright-core` with the Electron binary from `node_modules`; nothing is downloaded.
