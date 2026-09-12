import type { PresentationTheme } from './types'

const themes: PresentationTheme[] = [
  {
    id: 'modern',
    name: 'Modern',
    description: 'Bright contemporary deck — soft white, ink type, violet accents',
    mode: 'light',
    previewColors: { bg: '#fafaf9', text: '#0c0a09', accent: '#6d28d9', muted: '#78716c' },
    fonts: {
      heading: { family: 'Inter, sans-serif', googleFont: 'Inter', weights: [700, 800] },
      body: { family: 'Inter, sans-serif', googleFont: 'Inter', weights: [400, 500] },
    },
  },
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
  {
    id: 'aurora',
    name: 'Aurora',
    description: 'Modern SaaS mist with iris + mint duotone',
    mode: 'light',
    previewColors: { bg: '#f5f7ff', text: '#0f1b3d', accent: '#5b5bd6', muted: '#6b7a9e' },
    fonts: {
      heading: { family: 'Outfit, sans-serif', googleFont: 'Outfit', weights: [600, 700] },
      body: { family: 'Inter, sans-serif', googleFont: 'Inter', weights: [400, 500] },
    },
  },
  {
    id: 'ember',
    name: 'Ember',
    description: 'Sunset pitch — charred espresso, flame orange',
    mode: 'dark',
    previewColors: { bg: '#181210', text: '#fff7ed', accent: '#f97316', muted: '#9c8474' },
    fonts: {
      heading: { family: 'Fraunces, Georgia, serif', googleFont: 'Fraunces', weights: [600, 700] },
      body: { family: 'DM Sans, sans-serif', googleFont: 'DM Sans', weights: [400, 500] },
    },
  },
  {
    id: 'abyss',
    name: 'Abyss',
    description: 'Ocean depths — deep navy, teal bioluminescence',
    mode: 'dark',
    previewColors: { bg: '#0a1628', text: '#f1faee', accent: '#2dd4bf', muted: '#6f8f98' },
    fonts: {
      heading: { family: 'Space Grotesk, sans-serif', googleFont: 'Space Grotesk', weights: [600, 700] },
      body: { family: 'Inter, sans-serif', googleFont: 'Inter', weights: [400, 500] },
    },
  },
  {
    id: 'galaxy',
    name: 'Galaxy',
    description: 'Midnight cosmic — nebula purple, starlight lavender',
    mode: 'dark',
    previewColors: { bg: '#130e26', text: '#f5f0ff', accent: '#a78bfa', muted: '#857a9e' },
    fonts: {
      heading: { family: 'Syne, sans-serif', googleFont: 'Syne', weights: [700, 800] },
      body: { family: 'Space Grotesk, sans-serif', googleFont: 'Space Grotesk', weights: [400, 500] },
    },
  },
  {
    id: 'forest',
    name: 'Forest',
    description: 'Botanical — sage mist, deep pine, moss',
    mode: 'light',
    previewColors: { bg: '#f6f8f1', text: '#1a2e1f', accent: '#2d6a4f', muted: '#6b7f70' },
    fonts: {
      heading: { family: 'Lora, Georgia, serif', googleFont: 'Lora', weights: [500, 600] },
      body: { family: 'DM Sans, sans-serif', googleFont: 'DM Sans', weights: [400, 500] },
    },
  },
  {
    id: 'editorial',
    name: 'Editorial',
    description: 'Fashion magazine — bone, ink black, crimson masthead',
    mode: 'light',
    previewColors: { bg: '#faf9f6', text: '#111111', accent: '#b91c1c', muted: '#737373' },
    fonts: {
      heading: { family: 'Bodoni Moda, Didot, Georgia, serif', googleFont: 'Bodoni Moda', weights: [600, 700] },
      body: { family: 'Manrope, sans-serif', googleFont: 'Manrope', weights: [400, 500] },
    },
  },
  {
    id: 'brutalist',
    name: 'Brutalist',
    description: 'Swiss neo-brutalist — ink borders, hazard yellow',
    mode: 'light',
    previewColors: { bg: '#fffdf4', text: '#000000', accent: '#ff3d00', muted: '#525252' },
    fonts: {
      heading: { family: 'Archivo Black, Arial Black, sans-serif', googleFont: 'Archivo Black', weights: [400] },
      body: { family: 'Space Mono, monospace', googleFont: 'Space Mono', weights: [400, 700] },
    },
  },
  {
    id: 'blush',
    name: 'Blush',
    description: 'Pastel creator — rose mist, plum ink, raspberry pop',
    mode: 'light',
    previewColors: { bg: '#fdf2f5', text: '#3b2231', accent: '#db2777', muted: '#96707f' },
    fonts: {
      heading: { family: 'DM Serif Display, Georgia, serif', googleFont: 'DM Serif Display', weights: [400] },
      body: { family: 'Outfit, sans-serif', googleFont: 'Outfit', weights: [400, 500] },
    },
  },
  {
    id: 'terminal',
    name: 'Terminal',
    description: 'Hacker dev — phosphor black, lime prompt, full mono',
    mode: 'dark',
    previewColors: { bg: '#070b07', text: '#e8ffe8', accent: '#4ade80', muted: '#5f8a5f' },
    fonts: {
      heading: { family: 'JetBrains Mono, monospace', googleFont: 'JetBrains Mono', weights: [600, 700] },
      body: { family: 'IBM Plex Mono, monospace', googleFont: 'IBM Plex Mono', weights: [400, 500] },
    },
  },
  {
    id: 'frost',
    name: 'Frost',
    description: 'Arctic frost — glacier white-blue, cobalt signal',
    mode: 'light',
    previewColors: { bg: '#f2f6fd', text: '#0b1e3b', accent: '#2563eb', muted: '#647f9e' },
    fonts: {
      heading: { family: 'Sora, sans-serif', googleFont: 'Sora', weights: [600, 700] },
      body: { family: 'Inter, sans-serif', googleFont: 'Inter', weights: [400, 500] },
    },
  },
]

export function getAllThemes(): PresentationTheme[] {
  return themes
}

export function getTheme(id: string): PresentationTheme | undefined {
  return themes.find((t) => t.id === id)
}

/** Default theme for new decks. */
export const DEFAULT_THEME_ID = 'modern'

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

  // Google Fonts are a progressive enhancement: every theme also declares a
  // local fallback stack. Load the stylesheet without blocking first paint
  // (media="print" until it arrives) and swallow failures so an offline app —
  // or the CSP, which does not allow fonts.googleapis.com — never throws here.
  const link = document.createElement('link')
  link.rel = 'stylesheet'
  link.media = 'print'
  link.href = `https://fonts.googleapis.com/css2?${families}&display=swap`
  link.onload = () => {
    link.media = 'all'
  }
  link.onerror = () => {
    link.remove()
    fontsToLoad.forEach((f) => loadedFonts.delete(f.googleFont!))
  }
  try {
    document.head.appendChild(link)
  } catch {
    /* never let font loading break theme application */
  }

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
