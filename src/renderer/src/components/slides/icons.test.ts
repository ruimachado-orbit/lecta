import { describe, expect, it } from 'vitest'
import { ICON_NAMES, iconSvg, expandIcons } from './icons'

describe('icons', () => {
  it('ships a non-empty curated set', () => {
    expect(ICON_NAMES.length).toBeGreaterThan(20)
    expect(ICON_NAMES).toContain('check')
    expect(ICON_NAMES).toContain('rocket')
  })

  it('renders inline SVG for known names', () => {
    const svg = iconSvg('check')
    expect(svg).toContain('<svg')
    expect(svg).toContain('stroke="currentColor"')
  })

  it('returns null for unknown names', () => {
    expect(iconSvg('nope')).toBeNull()
  })

  it('expands placeholders, leaves typos alone', () => {
    expect(expandIcons('Done {{icon:check}}!')).toContain('slide-icon')
    expect(expandIcons('Done {{icon:nope}}!')).toContain('{{icon:nope}}')
  })
})
