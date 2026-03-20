import Reveal from './ScrollReveal'

const features = [
  {
    name: 'Live Code Execution',
    desc: 'Run code right inside your slides. Results appear inline — no switching windows, no copy-pasting output.',
    chips: ['JavaScript', 'Python', 'SQL', 'Native'],
    icon: (
      <svg className="fIcon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path strokeLinecap="round" strokeLinejoin="round" d="M14.25 9.75L16.5 12l-2.25 2.25m-4.5 0L7.5 12l2.25-2.25M6 20.25h12A2.25 2.25 0 0020.25 18V6A2.25 2.25 0 0018 3.75H6A2.25 2.25 0 003.75 6v12A2.25 2.25 0 006 20.25z"/>
      </svg>
    ),
  },
  {
    name: 'AI That Does Real Work',
    desc: 'Generate full decks from a prompt, write speaker notes per slide, plan structure, create images, and chat with your content. Pragmatic AI built for professionals — not gimmicks.',
    chips: ['Claude', 'GPT-4o', 'Gemini', 'Mistral'],
    icon: (
      <svg className="fIcon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456z"/>
      </svg>
    ),
  },
  {
    name: 'Real File Loading',
    desc: 'Code blocks reference actual files on disk and auto-reload on save. Edit in VS Code, run in lecta — always in sync.',
    icon: (
      <svg className="fIcon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"/>
      </svg>
    ),
  },
  {
    name: 'Eight Built-in Themes',
    desc: 'From minimal Apple Keynote to warm editorial Paper to high-contrast Keynote Dark — each theme is crafted with matching typography.',
    icon: (
      <svg className="fIcon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9.53 16.122a3 3 0 00-5.78 1.128 2.25 2.25 0 01-2.4 2.245 4.5 4.5 0 008.4-2.245c0-.399-.078-.78-.22-1.128zm0 0a15.998 15.998 0 003.388-1.62m-5.043-.025a15.994 15.994 0 011.622-3.395m3.42 3.42a15.995 15.995 0 004.764-4.648l3.876-5.814a1.151 1.151 0 00-1.597-1.597L14.146 6.32a15.996 15.996 0 00-4.649 4.763m3.42 3.42a6.776 6.776 0 00-3.42-3.42"/>
      </svg>
    ),
  },
  {
    name: 'Artifacts & Attachments',
    desc: 'Attach PDFs, Excel files, and images directly to slides. Everything travels with your deck — no broken links, no missing files.',
    icon: (
      <svg className="fIcon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path strokeLinecap="round" strokeLinejoin="round" d="M18.375 12.739l-7.693 7.693a4.5 4.5 0 01-6.364-6.364l10.94-10.94A3 3 0 1119.5 7.372L8.552 18.32m.009-.01l-.01.01m5.699-9.941l-7.81 7.81a1.5 1.5 0 002.112 2.13"/>
      </svg>
    ),
  },
  {
    name: 'Keyboard-Driven',
    desc: 'Arrow keys navigate slides, ⌘↵ executes code, F5 starts the presentation. Stay in flow without reaching for the mouse.',
    icon: (
      <svg className="fIcon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 17.25v1.007a3 3 0 01-.879 2.122L7.5 21h9l-.621-.621A3 3 0 0115 18.257V17.25m6-12V15a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 15V5.25m18 0A2.25 2.25 0 0018.75 3H5.25A2.25 2.25 0 003 5.25m18 0H3"/>
      </svg>
    ),
  },
]

export default function Features() {
  return (
    <section>
      <div className="container">
        <Reveal><span className="secLabel">Capabilities</span></Reveal>
        <Reveal><h2 className="secTitle">Everything you need<br /><em>to present code beautifully.</em></h2></Reveal>
        <div className="featureGrid">
          {features.map((f, i) => (
            <Reveal key={f.name} delay={((i % 3) + 1) as 1 | 2 | 3}>
              <div className="featureCard">
                {f.icon}
                <div className="fName">{f.name}</div>
                <p className="fDesc">{f.desc}</p>
                {f.chips && (
                  <div className="fChips">
                    {f.chips.map(c => <span key={c} className="chip">{c}</span>)}
                  </div>
                )}
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  )
}
