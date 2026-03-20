import Reveal from './ScrollReveal'

export default function UnderHood() {
  return (
    <section className="dark" style={{ padding: '6rem 0' }}>
      <div className="container">
        <Reveal><span className="secLabel">Under the hood</span></Reveal>
        <Reveal><h2 className="secTitle">Built on the tools<br /><em>you already use.</em></h2></Reveal>
        <div className="techCols">
          <Reveal delay={1}>
            <div className="techGroupTitle">Execution Engines</div>
            {[
              { name: 'JavaScript', desc: 'Sandboxed V8 via Sandpack — safe, isolated, instant results.' },
              { name: 'Python',     desc: 'Pyodide in WebAssembly — NumPy, pandas, matplotlib, all in-process.' },
              { name: 'SQL',        desc: 'sql.js (SQLite) — import CSVs, run queries, display tabular results.' },
              { name: 'Native Shell', desc: 'Your local toolchain — run any CLI command and show live output.' },
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
              { name: 'Claude (Anthropic)', desc: 'claude-opus-4, claude-sonnet-4-6 and all released models.' },
              { name: 'OpenAI',             desc: 'GPT-4o, o3, and all chat-completion endpoints.' },
              { name: 'Google Gemini',      desc: 'Gemini 2.5 Pro and Flash via Google AI SDK.' },
              { name: 'Mistral & Llama',    desc: "Open-weight models via Mistral API and Meta's API." },
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
