import { join, extname } from 'path'
import type { SupportedLanguage } from '../types/presentation'

export function resolveRelativePath(rootPath: string, relativePath: string): string {
  return join(rootPath, relativePath)
}

const EXTENSION_TO_LANGUAGE: Record<string, SupportedLanguage> = {
  '.js': 'javascript',
  '.mjs': 'javascript',
  '.cjs': 'javascript',
  '.ts': 'typescript',
  '.tsx': 'typescript',
  '.jsx': 'javascript',
  '.py': 'python',
  '.sql': 'sql',
  '.html': 'html',
  '.htm': 'html',
  '.css': 'css',
  '.json': 'json',
  '.sh': 'bash',
  '.bash': 'bash',
  '.zsh': 'bash',
  '.rs': 'rust',
  '.go': 'go',
  '.java': 'java',
  '.cs': 'csharp',
  '.rb': 'ruby',
  '.php': 'php',
  '.md': 'markdown',
  '.markdown': 'markdown'
}

export function detectLanguage(filePath: string): SupportedLanguage | null {
  const ext = extname(filePath).toLowerCase()
  return EXTENSION_TO_LANGUAGE[ext] || null
}

export function getMonacoLanguage(language: SupportedLanguage): string {
  const mapping: Record<SupportedLanguage, string> = {
    javascript: 'javascript',
    typescript: 'typescript',
    python: 'python',
    sql: 'sql',
    html: 'html',
    css: 'css',
    json: 'json',
    bash: 'shell',
    rust: 'rust',
    go: 'go',
    java: 'java',
    csharp: 'csharp',
    ruby: 'ruby',
    php: 'php'
  }
  return mapping[language] || 'plaintext'
}
