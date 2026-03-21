// Polyfill process for libraries that need it (e.g. Excalidraw)
if (typeof globalThis.process === 'undefined') {
  (globalThis as any).process = { env: { NODE_ENV: 'production' }, platform: '', version: '', browser: true }
}

import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './styles/globals.css'

// Catch unhandled errors that escape React's error boundary
window.onerror = (msg, src, line, col, err) => {
  console.error('[GLOBAL ERROR]', msg, '\n  at', src, line, col, '\n  error:', err)
}
window.onunhandledrejection = (event) => {
  console.error('[UNHANDLED REJECTION]', event.reason)
}

class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null }
  static getDerivedStateFromError(error: Error) { return { error } }
  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('React crash:', error, info.componentStack)
  }
  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 40, fontFamily: 'monospace', color: '#ef4444', background: '#0a0a0a', height: '100vh' }}>
          <h1 style={{ color: '#fff', marginBottom: 16 }}>Something went wrong</h1>
          <pre style={{ whiteSpace: 'pre-wrap', fontSize: 13, color: '#f87171' }}>{this.state.error.message}</pre>
          <pre style={{ whiteSpace: 'pre-wrap', fontSize: 11, color: '#6b7280', marginTop: 12 }}>{this.state.error.stack}</pre>
        </div>
      )
    }
    return this.props.children
  }
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
)
