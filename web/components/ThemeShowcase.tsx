import Reveal from './ScrollReveal'

const themes = [
  { name: 'Default Dark',  bg: '#000000', text: '#ffffff', accent: '#6366f1', light: false },
  { name: 'Default Light', bg: '#ffffff', text: '#0f172a', accent: '#6366f1', light: true  },
  { name: 'Executive',     bg: '#0c0c0e', text: '#ffffff', accent: '#d4a843', light: false },
  { name: 'Minimal',       bg: '#ffffff', text: '#000000', accent: '#000000', light: true  },
  { name: 'Corporate',     bg: '#ffffff', text: '#1a365d', accent: '#2563eb', light: true  },
  { name: 'Creative',      bg: '#0f0f12', text: '#ffffff', accent: '#8b5cf6', light: false },
  { name: 'Keynote Dark',  bg: '#0a0a0a', text: '#ffffff', accent: '#00d4ff', light: false },
  { name: 'Paper',         bg: '#faf8f5', text: '#2c1810', accent: '#8b4513', light: true  },
]

export default function ThemeShowcase() {
  return (
    <section className="themesBg">
      <div className="container">
        <Reveal><span className="secLabel">Themes</span></Reveal>
        <Reveal><h2 className="secTitle">Eight slide themes<br /><em>for every context.</em></h2></Reveal>
        <div className="themeStrip">
          {themes.map((t, i) => (
            <Reveal key={t.name} delay={((i % 4) + 1) as 1 | 2 | 3 | 4}>
              <div className="themeSwatch">
                <div
                  className="swPreview"
                  style={{
                    background: t.bg,
                    boxShadow: t.light ? 'inset 0 -1px 0 #e5e7eb' : undefined,
                  }}
                >
                  <div className="swTitle"  style={{ background: t.text }} />
                  <div className="swBody"   style={{ background: t.text }} />
                  <div className="swBodyS"  style={{ background: t.text }} />
                  <div className="swAccent" style={{ background: t.accent }} />
                </div>
                <div className="swLabel">
                  <span className="swName">{t.name}</span>
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  )
}
