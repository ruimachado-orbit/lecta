import { create } from 'zustand'

export interface ColorPalette {
  name: string
  accent: string
  accentLight: string
  accentDark: string
}

export const COLOR_PALETTES: ColorPalette[] = [
  { name: 'Indigo', accent: '#6366f1', accentLight: '#818cf8', accentDark: '#4f46e5' },
  { name: 'Blue', accent: '#3b82f6', accentLight: '#60a5fa', accentDark: '#2563eb' },
  { name: 'Emerald', accent: '#10b981', accentLight: '#34d399', accentDark: '#059669' },
  { name: 'Rose', accent: '#f43f5e', accentLight: '#fb7185', accentDark: '#e11d48' },
  { name: 'Amber', accent: '#f59e0b', accentLight: '#fbbf24', accentDark: '#d97706' },
  { name: 'Purple', accent: '#a855f7', accentLight: '#c084fc', accentDark: '#9333ea' },
  { name: 'Cyan', accent: '#06b6d4', accentLight: '#22d3ee', accentDark: '#0891b2' },
  { name: 'Orange', accent: '#f97316', accentLight: '#fb923c', accentDark: '#ea580c' },
]

interface UIState {
  theme: 'dark' | 'light'
  isPresenting: boolean
  showNotes: boolean
  showNavigator: boolean
  showArticlePanel: boolean
  showArtifactDrawer: boolean
  editingSlide: boolean
  splitRatio: number
  fontSize: number
  palette: ColorPalette

  // Actions
  setTheme: (theme: 'dark' | 'light') => void
  togglePresenting: () => void
  setPresenting: (presenting: boolean) => void
  toggleNotes: () => void
  toggleNavigator: () => void
  toggleArticlePanel: () => void
  toggleArtifactDrawer: () => void
  toggleEditingSlide: () => void
  setEditingSlide: (editing: boolean) => void
  setSplitRatio: (ratio: number) => void
  setFontSize: (size: number) => void
  setPalette: (palette: ColorPalette) => void
}

function applyPalette(palette: ColorPalette) {
  const root = document.documentElement
  root.style.setProperty('--color-brand', palette.accent)
  root.style.setProperty('--color-brand-light', palette.accentLight)
  root.style.setProperty('--color-brand-dark', palette.accentDark)
}

export const useUIStore = create<UIState>((set) => ({
  theme: 'dark',
  isPresenting: false,
  showNotes: false,
  showNavigator: true,
  showArticlePanel: false,
  showArtifactDrawer: false,
  editingSlide: false,
  splitRatio: 40,
  fontSize: 16,
  palette: COLOR_PALETTES[0],

  setTheme: (theme) => {
    document.documentElement.setAttribute('data-theme', theme)
    set({ theme })
  },
  togglePresenting: () => set((s) => ({ isPresenting: !s.isPresenting })),
  setPresenting: (presenting) => set({ isPresenting: presenting }),
  toggleNotes: () => set((s) => ({ showNotes: !s.showNotes })),
  toggleNavigator: () => set((s) => ({ showNavigator: !s.showNavigator })),
  toggleArticlePanel: () => set((s) => ({ showArticlePanel: !s.showArticlePanel })),
  toggleArtifactDrawer: () => set((s) => ({ showArtifactDrawer: !s.showArtifactDrawer })),
  toggleEditingSlide: () => set((s) => ({ editingSlide: !s.editingSlide })),
  setEditingSlide: (editing) => set({ editingSlide: editing }),
  setSplitRatio: (ratio) => set({ splitRatio: ratio }),
  setFontSize: (size) => set({ fontSize: size }),
  setPalette: (palette) => {
    applyPalette(palette)
    set({ palette })
  }
}))
