import Reveal from './ScrollReveal'
import Link from 'next/link'

const examples = [
  '"Create a 10-slide deck about Rust async"',
  '"Add a two-column slide comparing SQL vs NoSQL"',
  '"Change the theme to keynote-dark"',
  '"Add a Python code example to slide 3"',
]

const steps = [
  { num: '1', title: 'Enable', desc: 'Turn on MCP Server in Settings' },
  { num: '2', title: 'Connect', desc: 'Click "Add to Claude Desktop"' },
  { num: '3', title: 'Create', desc: 'Ask Claude to build your deck' },
]

export default function ClaudeSection() {
  return (
    <section className="claudeSection">
      <div className="container">
        <Reveal><span className="secLabel">Claude Integration</span></Reveal>
        <Reveal>
          <h2 className="secTitle">
            Talk to Claude.<br /><em>Get a presentation.</em>
          </h2>
        </Reveal>

        <div className="claudeGrid">
          {/* Left — how it works */}
          <Reveal delay={1}>
            <div className="claudeCard">
              <div className="claudeCardLabel">How it works</div>
              <div className="claudeSteps">
                {steps.map((s) => (
                  <div key={s.num} className="claudeStep">
                    <span className="claudeStepNum">{s.num}</span>
                    <div>
                      <strong>{s.title}</strong>
                      <span>{s.desc}</span>
                    </div>
                  </div>
                ))}
              </div>
              <p className="claudeCardNote">
                No Node.js required. No terminal. The app handles everything.
              </p>
            </div>
          </Reveal>

          {/* Right — what you can say */}
          <Reveal delay={2}>
            <div className="claudeCard">
              <div className="claudeCardLabel">What you can say</div>
              <div className="claudeExamples">
                {examples.map((ex) => (
                  <div key={ex} className="claudeExample">{ex}</div>
                ))}
              </div>
              <p className="claudeCardNote">
                Changes appear live in Lecta. Add slides, edit content, switch themes — all through conversation.
              </p>
            </div>
          </Reveal>
        </div>

        <Reveal>
          <div className="claudeCta">
            <Link href="/docs#claude" className="claudeDocsLink">
              Read the full setup guide &rarr;
            </Link>
          </div>
        </Reveal>
      </div>
    </section>
  )
}
