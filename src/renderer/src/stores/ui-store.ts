import { create } from 'zustand'

export interface ColorPalette {
  name: string
  accent: string
  accentLight: string
  accentDark: string
}

export const COLOR_PALETTES: ColorPalette[] = [
  { name: 'White', accent: '#ffffff', accentLight: '#e5e5e5', accentDark: '#d4d4d4' },
  { name: 'Silver', accent: '#a3a3a3', accentLight: '#d4d4d4', accentDark: '#737373' },
]

export interface SlideGroup {
  id: string
  name: string
  slideIds: string[]
  collapsed: boolean
}

interface UIState {
  theme: 'dark' | 'light'
  isPresenting: boolean
  showNotes: boolean
  showNavigator: boolean
  showArticlePanel: boolean
  showArtifactDrawer: boolean
  showSlideMap: boolean
  editingSlide: boolean
  editorMode: 'markdown' | 'wysiwyg'
  splitRatio: number
  fontSize: number
  palette: ColorPalette
  slideGroups: SlideGroup[]

  // Actions
  setTheme: (theme: 'dark' | 'light') => void
  togglePresenting: () => void
  setPresenting: (presenting: boolean) => void
  toggleNotes: () => void
  toggleNavigator: () => void
  toggleArticlePanel: () => void
  toggleArtifactDrawer: () => void
  toggleSlideMap: () => void
  toggleEditingSlide: () => void
  setEditingSlide: (editing: boolean) => void
  setEditorMode: (mode: 'markdown' | 'wysiwyg') => void
  setSplitRatio: (ratio: number) => void
  setFontSize: (size: number) => void
  setPalette: (palette: ColorPalette) => void
  addSlideGroup: (name: string) => void
  removeSlideGroup: (groupId: string) => void
  toggleGroupCollapsed: (groupId: string) => void
  addSlideToGroup: (groupId: string, slideId: string) => void
  removeSlideFromGroup: (groupId: string, slideId: string) => void
}

function applyPalette(palette: ColorPalette) {
  const root = document.documentElement
  root.style.setProperty('--color-brand', palette.accent)
  root.style.setProperty('--color-brand-light', palette.accentLight)
  root.style.setProperty('--color-brand-dark', palette.accentDark)
}

export const useUIStore = create<UIState>((set, get) => ({
  theme: 'dark',
  isPresenting: false,
  showNotes: false,
  showNavigator: true,
  showArticlePanel: false,
  showArtifactDrawer: false,
  showSlideMap: false,
  editingSlide: false,
  editorMode: 'wysiwyg' as const,
  splitRatio: 40,
  fontSize: 16,
  palette: COLOR_PALETTES[0],
  slideGroups: [],

  setTheme: (theme) => {
    document.documentElement.setAttribute('data-theme', theme)
    set({ theme })
  },
  togglePresenting: () => {
    const next = !get().isPresenting
    if (next) {
      document.documentElement.requestFullscreen?.().catch(() => {})
    } else {
      document.exitFullscreen?.().catch(() => {})
    }
    set({ isPresenting: next })
  },
  setPresenting: (presenting) => {
    if (presenting) {
      document.documentElement.requestFullscreen?.().catch(() => {})
    } else {
      document.exitFullscreen?.().catch(() => {})
    }
    set({ isPresenting: presenting })
  },
  toggleNotes: () => set((s) => ({ showNotes: !s.showNotes })),
  toggleNavigator: () => set((s) => ({ showNavigator: !s.showNavigator })),
  toggleArticlePanel: () => set((s) => ({ showArticlePanel: !s.showArticlePanel })),
  toggleArtifactDrawer: () => set((s) => ({ showArtifactDrawer: !s.showArtifactDrawer })),
  toggleSlideMap: () => set((s) => ({ showSlideMap: !s.showSlideMap })),
  toggleEditingSlide: () => set((s) => ({ editingSlide: !s.editingSlide })),
  setEditingSlide: (editing) => set({ editingSlide: editing }),
  setEditorMode: (mode) => set({ editorMode: mode }),
  setSplitRatio: (ratio) => set({ splitRatio: ratio }),
  setFontSize: (size) => set({ fontSize: size }),
  setPalette: (palette) => {
    applyPalette(palette)
    set({ palette })
  },
  addSlideGroup: (name) => set((s) => ({
    slideGroups: [...s.slideGroups, { id: `group-${Date.now()}`, name, slideIds: [], collapsed: false }]
  })),
  removeSlideGroup: (groupId) => set((s) => ({
    slideGroups: s.slideGroups.filter((g) => g.id !== groupId)
  })),
  toggleGroupCollapsed: (groupId) => set((s) => ({
    slideGroups: s.slideGroups.map((g) => g.id === groupId ? { ...g, collapsed: !g.collapsed } : g)
  })),
  addSlideToGroup: (groupId, slideId) => set((s) => ({
    slideGroups: s.slideGroups.map((g) =>
      g.id === groupId && !g.slideIds.includes(slideId)
        ? { ...g, slideIds: [...g.slideIds, slideId] }
        : g
    )
  })),
  removeSlideFromGroup: (groupId, slideId) => set((s) => ({
    slideGroups: s.slideGroups.map((g) =>
      g.id === groupId ? { ...g, slideIds: g.slideIds.filter((id) => id !== slideId) } : g
    )
  }))
}))
