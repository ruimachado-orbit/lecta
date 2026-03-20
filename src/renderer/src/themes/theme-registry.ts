import type { PresentationTheme } from './types'

const themes: PresentationTheme[] = [
  {
    id: 'dark',
    name: 'Default Dark',
    description: 'Deep navy with soft indigo accents',
    mode: 'dark',
    previewColors: { bg: '#08081a', text: '#eeeeff', accent: '#6366f1', muted: '#7878a0' },
    fonts: {
      heading: { family: '-apple-system, SF Pro Display, sans-serif', weights: [600, 700] },
      body: { family: '-apple-system, SF Pro Text, sans-serif', weights: [400] },
    },
  },
  {
    id: 'light',
    name: 'Default Light',
    description: 'Clean white with indigo accents',
    mode: 'light',
    previewColors: { bg: '#ffffff', text: '#111827', accent: '#4f46e5', muted: '#6b7280' },
    fonts: {
      heading: { family: '-apple-system, SF Pro Display, sans-serif', weights: [600, 700] },
      body: { family: '-apple-system, SF Pro Text, sans-serif', weights: [400] },
    },
  },
  {
    id: 'executive',
    name: 'Executive',
    description: 'Premium dark with champagne gold',
    mode: 'dark',
    previewColors: { bg: '#07070a', text: '#f5f5f0', accent: '#c4a035', muted: '#686862' },
    fonts: {
      heading: { family: 'Inter, sans-serif', googleFont: 'Inter', weights: [600, 700] },
      body: { family: 'Inter, sans-serif', googleFont: 'Inter', weights: [400, 500] },
    },
  },
  {
    id: 'minimal',
    name: 'Minimal',
    description: 'Pure black on white. Zero decoration',
    mode: 'light',
    previewColors: { bg: '#ffffff', text: '#000000', accent: '#171717', muted: '#a3a3a3' },
    fonts: {
      heading: { family: '-apple-system, SF Pro Display, Inter, sans-serif', weights: [600, 700] },
      body: { family: '-apple-system, SF Pro Text, Inter, sans-serif', weights: [400] },
    },
  },
  {
    id: 'corporate',
    name: 'Corporate',
    description: 'Enterprise navy and blue',
    mode: 'light',
    previewColors: { bg: '#ffffff', text: '#0c1a3a', accent: '#1d4ed8', muted: '#64748b' },
    fonts: {
      heading: { family: 'Inter, sans-serif', googleFont: 'Inter', weights: [600, 700] },
      body: { family: 'Inter, sans-serif', googleFont: 'Inter', weights: [400] },
    },
  },
  {
    id: 'creative',
    name: 'Creative',
    description: 'Vibrant violet-to-pink gradients',
    mode: 'dark',
    previewColors: { bg: '#0a0a14', text: '#ffffff', accent: '#8b5cf6', muted: '#808098' },
    fonts: {
      heading: { family: 'Inter, sans-serif', googleFont: 'Inter', weights: [700, 800] },
      body: { family: 'Inter, sans-serif', googleFont: 'Inter', weights: [400] },
    },
  },
  {
    id: 'keynote-dark',
    name: 'Keynote Dark',
    description: 'True black with electric cyan neon',
    mode: 'dark',
    previewColors: { bg: '#000000', text: '#ffffff', accent: '#00d4ff', muted: '#606060' },
    fonts: {
      heading: { family: '-apple-system, SF Pro Display, Inter, sans-serif', weights: [600, 700] },
      body: { family: '-apple-system, SF Pro Text, Inter, sans-serif', weights: [400] },
    },
  },
  {
    id: 'paper',
    name: 'Paper',
    description: 'Warm cream, serif fonts, sienna ink',
    mode: 'light',
    previewColors: { bg: '#faf7f0', text: '#1c110a', accent: '#8a3a10', muted: '#6a5545' },
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

/** Apply a slide theme — loads fonts needed by the theme.
 *  Does NOT set data-slide-theme on <html> to avoid leaking slide styles
 *  into non-slide UI (e.g. notebook editor). Slide canvases set data-slide-theme
 *  locally on their container divs in SlidePanel/PresenterView. */
export function applySlideTheme(themeId: string): void {
  const theme = getTheme(themeId)
  if (!theme) return

  // Load fonts needed by this theme
  loadThemeFonts(theme)
}
