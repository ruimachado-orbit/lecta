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
  showRightPane: boolean
  showSlideMap: boolean
  showAIGenerate: boolean
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
  toggleRightPane: () => void
  toggleSlideMap: () => void
  toggleAIGenerate: () => void
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
  loadGroupsFromPresentation: (groups: { id: string; name: string; slideIds: string[] }[]) => void
}

/** Persist groups to lecta.yaml via IPC */
function persistGroups(groups: SlideGroup[]) {
  // Lazy import to avoid circular dependency
  import('./presentation-store').then(({ usePresentationStore }) => {
    const rootPath = usePresentationStore.getState().presentation?.rootPath
    if (rootPath) {
      const toSave = groups.map((g) => ({ id: g.id, name: g.name, slideIds: g.slideIds }))
      window.electronAPI.saveGroups(rootPath, toSave)
    }
  })
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
  showRightPane: true,
  showSlideMap: false,
  showAIGenerate: false,
  editingSlide: false,
  editorMode: 'wysiwyg' as const,
  splitRatio: 40,
  fontSize: 12,
  palette: COLOR_PALETTES[0],
  slideGroups: [],

  setTheme: (theme) => {
    document.documentElement.setAttribute('data-theme', theme)
    set({ theme })
  },
  togglePresenting: () => {
    set((s) => ({ isPresenting: !s.isPresenting }))
  },
  setPresenting: (presenting) => {
    set({ isPresenting: presenting })
  },
  toggleNotes: () => set((s) => ({ showNotes: !s.showNotes })),
  toggleNavigator: () => set((s) => ({ showNavigator: !s.showNavigator })),
  toggleArticlePanel: () => set((s) => ({ showArticlePanel: !s.showArticlePanel })),
  toggleArtifactDrawer: () => set((s) => ({ showArtifactDrawer: !s.showArtifactDrawer })),
  toggleRightPane: () => set((s) => ({ showRightPane: !s.showRightPane })),
  toggleSlideMap: () => set((s) => ({ showSlideMap: !s.showSlideMap })),
  toggleAIGenerate: () => set((s) => ({ showAIGenerate: !s.showAIGenerate })),
  toggleEditingSlide: () => set((s) => ({ editingSlide: !s.editingSlide })),
  setEditingSlide: (editing) => set({ editingSlide: editing }),
  setEditorMode: (mode) => set({ editorMode: mode }),
  setSplitRatio: (ratio) => set({ splitRatio: ratio }),
  setFontSize: (size) => set({ fontSize: size }),
  setPalette: (palette) => {
    applyPalette(palette)
    set({ palette })
  },
  addSlideGroup: (name) => {
    const newGroups = [...get().slideGroups, { id: `group-${Date.now()}`, name, slideIds: [], collapsed: false }]
    set({ slideGroups: newGroups })
    persistGroups(newGroups)
  },
  removeSlideGroup: (groupId) => {
    const newGroups = get().slideGroups.filter((g) => g.id !== groupId)
    set({ slideGroups: newGroups })
    persistGroups(newGroups)
  },
  toggleGroupCollapsed: (groupId) => set((s) => ({
    slideGroups: s.slideGroups.map((g) => g.id === groupId ? { ...g, collapsed: !g.collapsed } : g)
  })),
  addSlideToGroup: (groupId, slideId) => {
    const newGroups = get().slideGroups.map((g) =>
      g.id === groupId && !g.slideIds.includes(slideId)
        ? { ...g, slideIds: [...g.slideIds, slideId] }
        : g
    )
    set({ slideGroups: newGroups })
    persistGroups(newGroups)
  },
  removeSlideFromGroup: (groupId, slideId) => {
    const newGroups = get().slideGroups.map((g) =>
      g.id === groupId ? { ...g, slideIds: g.slideIds.filter((id) => id !== slideId) } : g
    )
    set({ slideGroups: newGroups })
    persistGroups(newGroups)
  },
  loadGroupsFromPresentation: (groups) => {
    set({
      slideGroups: groups.map((g) => ({ ...g, collapsed: false }))
    })
  }
}))
