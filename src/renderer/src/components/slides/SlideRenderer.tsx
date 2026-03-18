import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeRaw from 'rehype-raw'

interface SlideRendererProps {
  markdown: string
  rootPath?: string
}

function resolveImageSrc(src: string | undefined, rootPath?: string): string {
  if (!src) return ''
  // Already absolute URL or data URI
  if (src.startsWith('http://') || src.startsWith('https://') || src.startsWith('data:')) {
    return src
  }
  // Local file — resolve relative to workspace root
  if (rootPath) {
    return `file://${rootPath}/${src}`
  }
  return src
}

export function SlideRenderer({ markdown, rootPath }: SlideRendererProps): JSX.Element {
  return (
    <div className="slide-content max-w-none">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeRaw]}
        components={{
          // Custom renderers for presentation-quality output
          h1: ({ children }) => (
            <h1 className="text-4xl font-bold mb-6 text-white leading-tight">
              {children}
            </h1>
          ),
          h2: ({ children }) => (
            <h2 className="text-3xl font-semibold mb-4 text-white leading-tight">
              {children}
            </h2>
          ),
          h3: ({ children }) => (
            <h3 className="text-2xl font-medium mb-3 text-gray-200">
              {children}
            </h3>
          ),
          p: ({ children }) => (
            <p className="text-xl leading-relaxed mb-4 text-gray-300">
              {children}
            </p>
          ),
          ul: ({ children }) => (
            <ul className="text-lg leading-relaxed mb-4 ml-6 text-gray-300 space-y-2">
              {children}
            </ul>
          ),
          ol: ({ children }) => (
            <ol className="text-lg leading-relaxed mb-4 ml-6 text-gray-300 space-y-2 list-decimal">
              {children}
            </ol>
          ),
          li: ({ children }) => (
            <li className="list-disc">{children}</li>
          ),
          code: ({ className, children, ...props }) => {
            const isInline = !className
            if (isInline) {
              return (
                <code className="bg-gray-800 px-2 py-0.5 rounded text-indigo-300 font-mono text-base">
                  {children}
                </code>
              )
            }
            return (
              <code className={`${className} block`} {...props}>
                {children}
              </code>
            )
          },
          pre: ({ children }) => (
            <pre className="bg-gray-900 rounded-lg p-4 mb-4 overflow-x-auto text-sm">
              {children}
            </pre>
          ),
          blockquote: ({ children }) => (
            <blockquote className="border-l-4 border-indigo-500 pl-4 italic text-gray-400 mb-4">
              {children}
            </blockquote>
          ),
          a: ({ href, children }) => (
            <a
              href={href}
              className="text-indigo-400 underline hover:text-indigo-300"
              target="_blank"
              rel="noopener noreferrer"
            >
              {children}
            </a>
          ),
          img: ({ src, alt }) => (
            <img
              src={resolveImageSrc(src, rootPath)}
              alt={alt}
              className="max-w-full h-auto rounded-lg my-4"
            />
          ),
          table: ({ children }) => (
            <table className="w-full border-collapse mb-4">{children}</table>
          ),
          th: ({ children }) => (
            <th className="bg-gray-800 border border-gray-700 px-4 py-2 text-left font-semibold text-gray-200">
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td className="border border-gray-700 px-4 py-2 text-gray-300">
              {children}
            </td>
          ),
          hr: () => <hr className="border-gray-700 my-8" />
        }}
      >
        {markdown}
      </ReactMarkdown>
    </div>
  )
}
