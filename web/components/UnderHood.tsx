import Reveal from './ScrollReveal'

export default function UnderHood() {
  return (
    <section className="dark" style={{ padding: '6rem 0' }}>
      <div className="container">
        <Reveal><span className="secLabel">Under the hood</span></Reveal>
        <Reveal><h2 className="secTitle">Built on the tools<br /><em>you already use.</em></h2></Reveal>
        <div className="techColsThree">
          <Reveal delay={1}>
            <div className="techGroupTitle">Execution &amp; Import</div>
            {[
              { name: 'JavaScript', desc: 'Sandboxed V8 via Sandpack — safe, isolated, instant results.' },
              { name: 'Python',     desc: 'Pyodide in WebAssembly — NumPy, pandas, matplotlib, all in-process.' },
              { name: 'SQL',        desc: 'sql.js (SQLite) — import CSVs, run queries, display tabular results.' },
              { name: 'Native Shell', desc: 'Bash, Go, Rust — run any CLI command and show live output.' },
              { name: 'Jupyter (.ipynb)', desc: 'Import notebooks with cells, outputs, and kernel detection. Full interactive view.' },
              { name: 'PowerPoint (.pptx)', desc: 'Layout detection, rich formatting, images, tables, and speaker notes.' },
            ].map(t => (
              <div key={t.name} className="techItem">
                <span className="tDot" />
                <div>
                  <div className="tName">{t.name}</div>
                  <div className="tDesc">{t.desc}</div>
                </div>
              </div>
            ))}
          </Reveal>
          <Reveal delay={2}>
            <div className="techGroupTitle">AI Integrations</div>
            {[
              { name: 'Claude (Anthropic)', desc: 'Opus 4, Sonnet 4 and all released models.' },
              { name: 'OpenAI',             desc: 'GPT-4o, o3, o4-mini, and all chat-completion endpoints.' },
              { name: 'Google Gemini',      desc: 'Gemini 2.5 Pro and Flash via Google AI SDK.' },
              { name: 'Mistral & Llama',    desc: "Open-weight models via Mistral API and Meta's API." },
              { name: 'Perplexity',         desc: 'Sonar Pro and Sonar Reasoning for research-backed generation.' },
              { name: 'Ollama (Local)',      desc: 'Run any model locally — Llama, Phi, Qwen. No API key needed.' },
            ].map(t => (
              <div key={t.name} className="techItem">
                <span className="tDot" />
                <div>
                  <div className="tName">{t.name}</div>
                  <div className="tDesc">{t.desc}</div>
                </div>
              </div>
            ))}
          </Reveal>
          <Reveal delay={3}>
            <div className="techGroupTitle">Claude MCP Server</div>
            {[
              { name: 'Create Decks',   desc: 'Tell Claude to build a full presentation — slides appear in Lecta live.' },
              { name: 'Edit & Refine',  desc: 'Add slides, change layouts, attach code blocks — all through conversation.' },
              { name: 'One-Click Setup', desc: 'Enable in Settings, click "Add to Claude Desktop", done.' },
              { name: 'No Node Required', desc: 'The app bundles its own runtime. Works from the DMG, no dev tools needed.' },
            ].map(t => (
              <div key={t.name} className="techItem">
                <span className="tDot" />
                <div>
                  <div className="tName">{t.name}</div>
                  <div className="tDesc">{t.desc}</div>
                </div>
              </div>
            ))}
          </Reveal>
        </div>
      </div>
    </section>
  )
}
