// Polyfill process for libraries that need it (e.g. Excalidraw)
if (typeof globalThis.process === 'undefined') {
  (globalThis as any).process = { env: { NODE_ENV: 'production' }, platform: '', version: '', browser: true }
}

import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './styles/globals.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
