import { describe, it, expect } from 'vitest'
import { resolveRelativePath, detectLanguage, getMonacoLanguage } from './path-resolver'

describe('resolveRelativePath', () => {
  it('joins root path with relative path', () => {
    expect(resolveRelativePath('/projects/deck', 'slides/01-intro.md')).toBe(
      '/projects/deck/slides/01-intro.md'
    )
  })

  it('handles nested paths', () => {
    expect(resolveRelativePath('/root', 'code/src/index.ts')).toBe(
      '/root/code/src/index.ts'
    )
  })

  it('throws on path traversal with ../', () => {
    expect(() => resolveRelativePath('/root', '../../etc/passwd')).toThrow('Path traversal')
  })

  it('throws on path traversal hidden in nested path', () => {
    expect(() => resolveRelativePath('/root', 'foo/../../etc/passwd')).toThrow('Path traversal')
  })

  it('throws on parent references that escape root', () => {
    expect(() => resolveRelativePath('/root/sub', '../file.txt')).toThrow('Path traversal')
  })
})

describe('detectLanguage', () => {
  const cases: [string, string | null][] = [
    ['script.js', 'javascript'],
    ['module.mjs', 'javascript'],
    ['common.cjs', 'javascript'],
    ['app.ts', 'typescript'],
    ['component.tsx', 'typescript'],
    ['page.jsx', 'javascript'],
    ['main.py', 'python'],
    ['query.sql', 'sql'],
    ['index.html', 'html'],
    ['page.htm', 'html'],
    ['styles.css', 'css'],
    ['config.json', 'json'],
    ['deploy.sh', 'bash'],
    ['run.bash', 'bash'],
    ['setup.zsh', 'bash'],
    ['lib.rs', 'rust'],
    ['main.go', 'go'],
    ['App.java', 'java'],
    ['Program.cs', 'csharp'],
    ['script.rb', 'ruby'],
    ['index.php', 'php'],
    ['README.md', 'markdown'],
    ['doc.mdx', 'markdown'],
    ['notes.markdown', 'markdown'],
  ]

  it.each(cases)('detects language for %s as %s', (file, expected) => {
    expect(detectLanguage(file)).toBe(expected)
  })

  it('returns null for unknown extensions', () => {
    expect(detectLanguage('data.csv')).toBeNull()
    expect(detectLanguage('image.png')).toBeNull()
    expect(detectLanguage('noext')).toBeNull()
  })

  it('is case-insensitive for extensions', () => {
    expect(detectLanguage('FILE.JS')).toBe('javascript')
    expect(detectLanguage('app.PY')).toBe('python')
  })
})

describe('getMonacoLanguage', () => {
  it('maps javascript to javascript', () => {
    expect(getMonacoLanguage('javascript')).toBe('javascript')
  })

  it('maps typescript to typescript', () => {
    expect(getMonacoLanguage('typescript')).toBe('typescript')
  })

  it('maps bash to shell', () => {
    expect(getMonacoLanguage('bash')).toBe('shell')
  })

  it('maps python to python', () => {
    expect(getMonacoLanguage('python')).toBe('python')
  })

  it('maps markdown to markdown', () => {
    expect(getMonacoLanguage('markdown')).toBe('markdown')
  })
})
