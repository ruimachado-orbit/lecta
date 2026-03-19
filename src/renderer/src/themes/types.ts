export interface ThemeFontConfig {
  family: string
  googleFont?: string
  weights: number[]
}

export interface PresentationTheme {
  id: string
  name: string
  description: string
  mode: 'dark' | 'light'
  previewColors: {
    bg: string
    text: string
    accent: string
    muted: string
  }
  fonts: {
    heading: ThemeFontConfig
    body: ThemeFontConfig
  }
}
