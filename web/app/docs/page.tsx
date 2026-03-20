import type { Metadata } from 'next'
import Nav from '@/components/Nav'
import Footer from '@/components/Footer'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'Docs — lecta',
  description: 'Learn how to use Lecta with Claude, set up the MCP server, and get the most out of your presentations.',
}

export default function DocsPage() {
  return (
    <>
      <Nav />
      <main className="docsMain">
        <div className="docsContainer">

          <h1 className="docsHero">Documentation</h1>
          <p className="docsSubtitle">
            Everything you need to create presentations with Lecta — from getting started to using AI with Claude.
          </p>

          {/* ── Getting Started ── */}
          <section className="docsSection" id="getting-started">
            <h2>Getting Started</h2>
            <p>
              A Lecta presentation is just a <strong>folder</strong> with a <code>lecta.yaml</code> file, markdown slides, and optional code files.
              Open the app, create a new presentation, and start writing.
            </p>
            <div className="docsSteps">
              <div className="docsStep">
                <span className="docsStepNum">1</span>
                <div>
                  <strong>Create</strong>
                  <p>Open Lecta and click &quot;New Presentation&quot;. Give it a name and pick a theme.</p>
                </div>
              </div>
              <div className="docsStep">
                <span className="docsStepNum">2</span>
                <div>
                  <strong>Write</strong>
                  <p>Add slides using Markdown or the visual editor. Attach code files, images, and PDFs.</p>
                </div>
              </div>
              <div className="docsStep">
                <span className="docsStepNum">3</span>
                <div>
                  <strong>Present</strong>
                  <p>Hit F5 to enter presenter mode. Run code live, navigate with arrow keys, and sync with an audience window.</p>
                </div>
              </div>
            </div>
          </section>

          {/* ── Use with Claude ── */}
          <section className="docsSection" id="claude">
            <h2>Use with Claude</h2>
            <p>
              Lecta includes an <strong>MCP server</strong> that connects to Claude Desktop and Claude Code.
              This means you can create and edit presentations just by talking to Claude — no clicking required.
            </p>

            <h3>What you can say</h3>
            <div className="docsExamples">
              <div className="docsExample">&ldquo;Create a 10-slide presentation about microservices&rdquo;</div>
              <div className="docsExample">&ldquo;Add a slide about error handling with a Python code example&rdquo;</div>
              <div className="docsExample">&ldquo;Change the theme to executive&rdquo;</div>
              <div className="docsExample">&ldquo;List all the slides in my deck&rdquo;</div>
            </div>

            <h3>Setup</h3>
            <div className="docsSteps">
              <div className="docsStep">
                <span className="docsStepNum">1</span>
                <div>
                  <strong>Enable MCP Server</strong>
                  <p>Open Settings in Lecta and turn on <strong>MCP Server</strong> under Claude Integration.</p>
                </div>
              </div>
              <div className="docsStep">
                <span className="docsStepNum">2</span>
                <div>
                  <strong>Add to Claude Desktop</strong>
                  <p>Click the <strong>&quot;Add to Claude Desktop&quot;</strong> button in Settings. This automatically configures Claude to use Lecta.</p>
                </div>
              </div>
              <div className="docsStep">
                <span className="docsStepNum">3</span>
                <div>
                  <strong>Start using it</strong>
                  <p>Restart Claude Desktop. You&apos;ll see &quot;lecta&quot; in the MCP tools list. Start asking Claude to create slides!</p>
                </div>
              </div>
            </div>

            <p className="docsNote">
              Changes from Claude appear live in Lecta thanks to the file watcher. No terminal commands needed.
            </p>

            <h3>Available Tools</h3>
            <div className="docsToolGrid">
              <ToolCard name="create_presentation" desc="Create a new deck with title, theme, and starter slides" />
              <ToolCard name="add_slide" desc="Add a slide with markdown, code, layout, and speaker notes" />
              <ToolCard name="edit_slide" desc="Update content, layout, code, notes, or transitions" />
              <ToolCard name="delete_slide" desc="Remove a slide from the deck" />
              <ToolCard name="list_slides" desc="See all slides and their metadata" />
              <ToolCard name="set_theme" desc="Switch between the 8 built-in themes" />
              <ToolCard name="add_artifact" desc="Attach files (PDFs, images, docs) to a slide" />
            </div>
          </section>

          {/* ── Themes ── */}
          <section className="docsSection" id="themes">
            <h2>Themes</h2>
            <p>Lecta comes with 8 built-in themes. Set the theme in <code>lecta.yaml</code> or change it from the app.</p>
            <div className="docsThemeGrid">
              {['Dark', 'Light', 'Executive', 'Minimal', 'Corporate', 'Creative', 'Keynote Dark', 'Paper'].map(t => (
                <span key={t} className="docsThemeChip">{t}</span>
              ))}
            </div>
          </section>

          {/* ── Layouts ── */}
          <section className="docsSection" id="layouts">
            <h2>Slide Layouts</h2>
            <p>Choose a layout per slide to control how content is arranged.</p>
            <div className="docsLayoutGrid">
              {[
                ['default', 'Standard top-down flow'],
                ['center', 'Centered vertically and horizontally'],
                ['title', 'Big centered title with subtitle'],
                ['section', 'Section break with accent bar'],
                ['two-col', 'Two equal columns'],
                ['two-col-wide-left', '60/40 left-heavy split'],
                ['two-col-wide-right', '40/60 right-heavy split'],
                ['three-col', 'Three equal columns'],
                ['top-bottom', 'Content split top and bottom'],
                ['big-number', 'Large stat with context below'],
                ['quote', 'Blockquote-style centered'],
                ['blank', 'Full canvas, no padding'],
              ].map(([name, desc]) => (
                <div key={name} className="docsLayoutCard">
                  <code>{name}</code>
                  <span>{desc}</span>
                </div>
              ))}
            </div>
          </section>

          {/* ── Keyboard Shortcuts ── */}
          <section className="docsSection" id="shortcuts">
            <h2>Keyboard Shortcuts</h2>
            <div className="docsShortcutGrid">
              {[
                ['← / →', 'Previous / Next slide'],
                ['⌘ + Enter', 'Run code'],
                ['F5', 'Enter presenter mode'],
                ['Esc', 'Exit presenter mode'],
                ['N', 'Toggle speaker notes'],
                ['Shift + N', 'Add new slide'],
                ['⌘ + /', 'Toggle chat agent'],
              ].map(([key, action]) => (
                <div key={key} className="docsShortcut">
                  <kbd>{key}</kbd>
                  <span>{action}</span>
                </div>
              ))}
            </div>
          </section>

          {/* ── AI Providers ── */}
          <section className="docsSection" id="ai">
            <h2>AI Providers</h2>
            <p>
              Lecta supports 7 AI providers with 20+ models. Add your API keys in <strong>Settings</strong> or in a <code>.env</code> file.
            </p>
            <div className="docsProviderGrid">
              {[
                ['Anthropic', 'Claude Sonnet 4, Opus 4, Haiku 4'],
                ['OpenAI', 'GPT-4o, GPT-4o Mini, o3, o3-mini, o4-mini'],
                ['Google Gemini', 'Gemini 2.5 Pro, 2.5 Flash, 2.0 Flash'],
                ['Mistral', 'Large, Medium, Small'],
                ['Meta Llama', 'Llama 4 Maverick, Scout, 3.3 70B'],
                ['xAI', 'Grok 3, Grok 3 Fast, Mini, Mini Fast'],
                ['Perplexity', 'Sonar Pro, Sonar, Reasoning Pro, Reasoning'],
              ].map(([provider, models]) => (
                <div key={provider} className="docsProvider">
                  <strong>{provider}</strong>
                  <span>{models}</span>
                </div>
              ))}
            </div>
          </section>

        </div>
      </main>
      <Footer />
    </>
  )
}

function ToolCard({ name, desc }: { name: string; desc: string }) {
  return (
    <div className="docsTool">
      <code>{name}</code>
      <p>{desc}</p>
    </div>
  )
}
