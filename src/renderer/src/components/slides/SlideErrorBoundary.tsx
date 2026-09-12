import { Component, type ReactNode } from 'react'

/**
 * Per-slide error boundary (Presenton `SlideErrorBoundary`): one broken slide
 * (bad mermaid, malformed HTML, a crashing component) shows a fallback instead
 * of taking down the whole canvas, navigator, or presenter view.
 */
export class SlideErrorBoundary extends Component<
  { children: ReactNode; label?: string },
  { error: Error | null }
> {
  state = { error: null as Error | null }

  static getDerivedStateFromError(error: Error): { error: Error } {
    return { error }
  }

  componentDidCatch(error: Error): void {
    console.error('[slide] render failed:', error)
  }

  componentDidUpdate(prevProps: { children: ReactNode }): void {
    // A new slide (or new content) deserves a fresh attempt.
    if (prevProps.children !== this.props.children && this.state.error) {
      this.setState({ error: null })
    }
  }

  render(): ReactNode {
    if (this.state.error) {
      return (
        <div className="h-full w-full flex flex-col items-center justify-center gap-2 p-8 text-center">
          <span className="text-4xl" aria-hidden>
            ⚠️
          </span>
          <p className="text-sm font-medium" style={{ color: 'var(--slide-text)' }}>
            This slide could not be rendered{this.props.label ? ` (${this.props.label})` : ''}
          </p>
          <p className="text-xs opacity-60 max-w-md" style={{ color: 'var(--slide-text)' }}>
            {this.state.error.message} — edit the markdown to fix it.
          </p>
        </div>
      )
    }
    return this.props.children
  }
}
