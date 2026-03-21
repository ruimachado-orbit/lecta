import React, { useState, useEffect, useRef, useCallback } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { FlowDiagram } from '../common/FlowDiagram'
import { resolveImageSrc } from './slide-utils'

/** Catches render-time errors from compiled MDX content */
class MdxErrorBoundary extends React.Component<
  { children: React.ReactNode; fallback: React.ReactNode },
  { hasError: boolean; error: string | null }
> {
  state = { hasError: false, error: null as string | null }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error: error.message }
  }

  componentDidCatch(error: Error) {
    console.error('[MdxRenderer] render error:', error)
  }

  // Reset when children change (new compilation)
  componentDidUpdate(prevProps: { children: React.ReactNode }) {
    if (prevProps.children !== this.props.children && this.state.hasError) {
      this.setState({ hasError: false, error: null })
    }
  }

  render() {
    if (this.state.hasError) return this.props.fallback
    return this.props.children
  }
}

interface MdxRendererProps {
  markdown: string
  rootPath?: string
  clickStep?: number
  onClickSteps?: (total: number) => void
}

// Layer 1: Processor cache — plugin init happens once
let cachedProcessor: any = null

async function getProcessor() {
  if (cachedProcessor) return cachedProcessor
  const { createProcessor } = await import('@mdx-js/mdx')
  const remarkGfmPlugin = (await import('remark-gfm')).default
  let recmaPlugins: any[] = []
  try {
    const recmaEscape = (await import('recma-mdx-escape-missing-components')).default
    recmaPlugins = [recmaEscape]
  } catch {
    // Plugin unavailable — missing components will throw (caught by error boundary)
  }
  cachedProcessor = createProcessor({
    outputFormat: 'function-body',
    remarkPlugins: [remarkGfmPlugin],
    recmaPlugins,
    format: 'mdx',
  })
  return cachedProcessor
}

// Layer 2: Output cache — same content -> cached compiled JS
const MAX_CACHE_SIZE = 50
const compiledCache = new Map<string, string>()

function getCacheKey(source: string): string {
  return source.length + ':' + source.slice(0, 100) + source.slice(-100)
}

async function compileMdx(source: string): Promise<string> {
  const key = getCacheKey(source)
  const cached = compiledCache.get(key)
  if (cached) return cached

  const processor = await getProcessor()
  const result = String(await processor.process(source))

  // Evict oldest entries if cache is too large
  if (compiledCache.size >= MAX_CACHE_SIZE) {
    const firstKey = compiledCache.keys().next().value
    if (firstKey !== undefined) compiledCache.delete(firstKey)
  }
  compiledCache.set(key, result)
  return result
}

/** Shared MDX component overrides — mirrors SlideRenderer for consistency */
function useMdxComponents(rootPath?: string) {
  return {
    img: ({ src, alt, ...props }: any) => (
      <img
        src={resolveImageSrc(src, rootPath)}
        alt={alt}
        className="my-4"
        style={{ maxWidth: '100%' }}
        {...props}
      />
    ),
    a: ({ href, children, ...props }: any) => (
      <a href={href} target="_blank" rel="noopener noreferrer" {...props}>{children}</a>
    ),
    code: ({ className, children, ...props }: any) => {
      if (className?.includes('language-mermaid')) {
        const chart = String(children).replace(/\n$/, '')
        return <FlowDiagram chart={chart} />
      }
      const isInline = !className
      if (isInline) return <code>{children}</code>
      return <code className={`${className} block`} {...props}>{children}</code>
    },
    pre: ({ children, ...props }: any) => {
      // Pass through mermaid diagrams rendered by the code override
      const child = Array.isArray(children) ? children[0] : children
      if (child?.props?.className?.includes?.('language-mermaid')) {
        return <>{children}</>
      }
      return <pre {...props}>{children}</pre>
    },
  }
}

export function MdxRenderer({ markdown, rootPath, clickStep, onClickSteps }: MdxRendererProps): JSX.Element {
  const [MdxContent, setMdxContent] = useState<React.ComponentType<any> | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [errorDetail, setErrorDetail] = useState<{ line?: number; column?: number } | null>(null)
  const [fallbackMarkdown, setFallbackMarkdown] = useState<string | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastSourceRef = useRef<string>('')
  const components = useMdxComponents(rootPath)

  // No click animations for MDX — report 0 steps
  const reportedRef = useRef(false)
  useEffect(() => {
    if (!reportedRef.current) {
      onClickSteps?.(0)
      reportedRef.current = true
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const compile = useCallback(async (source: string) => {
    try {
      const code = await compileMdx(source)
      const { run } = await import('@mdx-js/mdx')
      const runtime = await import('react/jsx-runtime')
      const { default: Content } = await run(code, {
        ...runtime,
        baseUrl: import.meta.url,
      })
      setMdxContent(() => Content)
      setError(null)
      setErrorDetail(null)
      setFallbackMarkdown(null)
    } catch (err: any) {
      console.error('[MdxRenderer] compilation failed:', err)
      setError(err.message || String(err))
      // Extract line/column from MDX compilation errors
      setErrorDetail({
        line: err.line ?? err.position?.start?.line,
        column: err.column ?? err.position?.start?.column,
      })
      setFallbackMarkdown(source)
    }
  }, [])

  useEffect(() => {
    // Skip recompilation if content unchanged
    if (markdown === lastSourceRef.current && MdxContent) return
    const isFirstCompile = lastSourceRef.current === ''
    lastSourceRef.current = markdown

    // Compile immediately on first mount; debounce during live editing
    if (isFirstCompile) {
      compile(markdown)
    } else {
      if (debounceRef.current) clearTimeout(debounceRef.current)
      debounceRef.current = setTimeout(() => {
        compile(markdown)
      }, 300)
    }

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [markdown, compile]) // eslint-disable-line react-hooks/exhaustive-deps

  // Render compiled MDX content — wrapped in error boundary to catch render-time crashes
  if (MdxContent && !error) {
    const fallbackRender = (
      <div className="slide-content max-w-none relative">
        <div className="mb-3 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-mono">
          <div className="font-semibold mb-1">MDX render error</div>
          <div className="opacity-80">The compiled MDX threw during render. Showing markdown fallback.</div>
        </div>
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{markdown}</ReactMarkdown>
      </div>
    )
    return (
      <div className="slide-content max-w-none relative">
        <MdxErrorBoundary fallback={fallbackRender}>
          <MdxContent components={components} />
        </MdxErrorBoundary>
      </div>
    )
  }

  // Fallback: render as plain markdown with error indicator
  if (fallbackMarkdown !== null) {
    return (
      <div className="slide-content max-w-none relative">
        {error && (
          <div className="mb-3 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-mono">
            <div className="font-semibold mb-1">MDX compilation error</div>
            <div className="opacity-80 break-words">{error}</div>
            {errorDetail?.line && (
              <div className="opacity-60 mt-1">
                Line {errorDetail.line}{errorDetail.column ? `, column ${errorDetail.column}` : ''}
              </div>
            )}
          </div>
        )}
        <ReactMarkdown remarkPlugins={[remarkGfm]}>
          {fallbackMarkdown}
        </ReactMarkdown>
      </div>
    )
  }

  // Initial loading state — show content as plain markdown while compiling
  return (
    <div className="slide-content max-w-none relative">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>
        {markdown}
      </ReactMarkdown>
    </div>
  )
}
