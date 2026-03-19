import type { PresentationTheme } from './types'

const themes: PresentationTheme[] = [
  {
    id: 'dark',
    name: 'Default Dark',
    description: 'Classic dark theme',
    mode: 'dark',
    previewColors: { bg: '#000000', text: '#ffffff', accent: '#6366f1', muted: '#a3a3a3' },
    fonts: {
      heading: { family: '-apple-system, SF Pro Display, sans-serif', weights: [600, 700] },
      body: { family: '-apple-system, SF Pro Text, sans-serif', weights: [400] },
    },
  },
  {
    id: 'light',
    name: 'Default Light',
    description: 'Classic light theme',
    mode: 'light',
    previewColors: { bg: '#ffffff', text: '#0f172a', accent: '#6366f1', muted: '#64748b' },
    fonts: {
      heading: { family: '-apple-system, SF Pro Display, sans-serif', weights: [600, 700] },
      body: { family: '-apple-system, SF Pro Text, sans-serif', weights: [400] },
    },
  },
  {
    id: 'executive',
    name: 'Executive',
    description: 'McKinsey-style. Dark with gold accents',
    mode: 'dark',
    previewColors: { bg: '#0c0c0e', text: '#ffffff', accent: '#d4a843', muted: '#8a8a90' },
    fonts: {
      heading: { family: 'Inter, sans-serif', googleFont: 'Inter', weights: [600, 700] },
      body: { family: 'Inter, sans-serif', googleFont: 'Inter', weights: [400, 500] },
    },
  },
  {
    id: 'minimal',
    name: 'Minimal',
    description: 'Apple Keynote style. Ultra-clean whitespace',
    mode: 'light',
    previewColors: { bg: '#ffffff', text: '#000000', accent: '#000000', muted: '#888888' },
    fonts: {
      heading: { family: '-apple-system, SF Pro Display, Inter, sans-serif', weights: [600, 700] },
      body: { family: '-apple-system, SF Pro Text, Inter, sans-serif', weights: [400] },
    },
  },
  {
    id: 'corporate',
    name: 'Corporate',
    description: 'Professional blue. Business presentations',
    mode: 'light',
    previewColors: { bg: '#ffffff', text: '#1a365d', accent: '#2563eb', muted: '#6b7280' },
    fonts: {
      heading: { family: 'Inter, sans-serif', googleFont: 'Inter', weights: [600, 700] },
      body: { family: 'Inter, sans-serif', googleFont: 'Inter', weights: [400] },
    },
  },
  {
    id: 'creative',
    name: 'Creative',
    description: 'Stripe/Linear style. Gradients and vibrant colors',
    mode: 'dark',
    previewColors: { bg: '#0f0f12', text: '#ffffff', accent: '#8b5cf6', muted: '#9ca3af' },
    fonts: {
      heading: { family: 'Inter, sans-serif', googleFont: 'Inter', weights: [700, 800] },
      body: { family: 'Inter, sans-serif', googleFont: 'Inter', weights: [400] },
    },
  },
  {
    id: 'keynote-dark',
    name: 'Keynote Dark',
    description: 'High contrast with neon cyan accents',
    mode: 'dark',
    previewColors: { bg: '#0a0a0a', text: '#ffffff', accent: '#00d4ff', muted: '#71717a' },
    fonts: {
      heading: { family: '-apple-system, SF Pro Display, Inter, sans-serif', weights: [600, 700] },
      body: { family: '-apple-system, SF Pro Text, Inter, sans-serif', weights: [400] },
    },
  },
  {
    id: 'paper',
    name: 'Paper',
    description: 'Editorial. Warm cream with serif fonts',
    mode: 'light',
    previewColors: { bg: '#faf8f5', text: '#2c1810', accent: '#8b4513', muted: '#7a6555' },
    fonts: {
      heading: { family: 'Playfair Display, Georgia, serif', googleFont: 'Playfair Display', weights: [600, 700] },
      body: { family: 'Source Serif 4, Georgia, serif', googleFont: 'Source Serif 4', weights: [400, 500] },
    },
  },
]

export function getAllThemes(): PresentationTheme[] {
  return themes
}

export function getTheme(id: string): PresentationTheme | undefined {
  return themes.find((t) => t.id === id)
}

/** Load Google Fonts for a theme (if needed) */
const loadedFonts = new Set<string>()
export function loadThemeFonts(theme: PresentationTheme): void {
  const fontsToLoad = [theme.fonts.heading, theme.fonts.body]
    .filter((f) => f.googleFont && !loadedFonts.has(f.googleFont!))

  if (fontsToLoad.length === 0) return

  const families = fontsToLoad
    .map((f) => {
      const weights = f.weights.join(';')
      return `family=${f.googleFont!.replace(/ /g, '+')}:wght@${weights}`
    })
    .join('&')

  const link = document.createElement('link')
  link.rel = 'stylesheet'
  link.href = `https://fonts.googleapis.com/css2?${families}&display=swap`
  document.head.appendChild(link)

  fontsToLoad.forEach((f) => loadedFonts.add(f.googleFont!))
}

/** Apply a slide theme — only sets data-slide-theme for CSS scoping on slide canvases.
 *  Does NOT change the app-level data-theme (dark/light) — that's controlled by user settings. */
export function applySlideTheme(themeId: string): void {
  const theme = getTheme(themeId)
  if (!theme) return

  // Set the slide theme attribute on html for global CSS variable scoping
  document.documentElement.setAttribute('data-slide-theme', themeId)

  // Load fonts needed by this theme
  loadThemeFonts(theme)
}
