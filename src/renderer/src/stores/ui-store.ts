import { create } from 'zustand'

interface UIState {
  theme: 'dark' | 'light'
  isPresenting: boolean
  showNotes: boolean
  showNavigator: boolean
  splitRatio: number
  fontSize: number

  // Actions
  setTheme: (theme: 'dark' | 'light') => void
  togglePresenting: () => void
  setPresenting: (presenting: boolean) => void
  toggleNotes: () => void
  toggleNavigator: () => void
  setSplitRatio: (ratio: number) => void
  setFontSize: (size: number) => void
}

export const useUIStore = create<UIState>((set) => ({
  theme: 'dark',
  isPresenting: false,
  showNotes: false,
  showNavigator: true,
  splitRatio: 40,
  fontSize: 16,

  setTheme: (theme) => set({ theme }),
  togglePresenting: () => set((s) => ({ isPresenting: !s.isPresenting })),
  setPresenting: (presenting) => set({ isPresenting: presenting }),
  toggleNotes: () => set((s) => ({ showNotes: !s.showNotes })),
  toggleNavigator: () => set((s) => ({ showNavigator: !s.showNavigator })),
  setSplitRatio: (ratio) => set({ splitRatio: ratio }),
  setFontSize: (size) => set({ fontSize: size })
}))
