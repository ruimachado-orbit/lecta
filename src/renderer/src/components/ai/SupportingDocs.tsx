import { MAX_SUPPORTING_DOCS, SUPPORTING_DOC_EXTENSIONS } from '../../../../../packages/shared/src/constants'

export interface SupportingDoc {
  path: string
  name: string
}

const FILTERS = [
  { name: 'Documents', extensions: [...SUPPORTING_DOC_EXTENSIONS] },
  { name: 'All Files', extensions: ['*'] },
]

/**
 * Presenton-style supporting-docs picker: up to MAX_SUPPORTING_DOCS files,
 * typed allowlist, per-file remove. Reading happens at generate time so a
 * stale pick never silently grounds the deck.
 */
export function SupportingDocs({
  docs, onChange, disabled,
}: {
  docs: SupportingDoc[]
  onChange: (docs: SupportingDoc[]) => void
  disabled?: boolean
}): JSX.Element {
  const pick = async () => {
    const paths: string[] = await window.electronAPI.selectFiles(FILTERS)
    if (!paths || paths.length === 0) return
    const fresh = paths
      .filter((p) => !docs.some((d) => d.path === p))
      .map((p) => ({ path: p, name: p.split('/').pop() || p }))
    const merged = [...docs, ...fresh].slice(0, MAX_SUPPORTING_DOCS)
    onChange(merged)
  }

  return (
    <div>
      <label className="text-sm text-gray-300 block mb-1.5">
        Supporting documents{' '}
        <span className="text-gray-500">
          (optional{docs.length > 0 ? ` — ${docs.length}/${MAX_SUPPORTING_DOCS}` : ` — up to ${MAX_SUPPORTING_DOCS}`})
        </span>
      </label>
      <p className="text-[11px] text-gray-400 mb-2">
        Ground the deck in your files — PDF, Word, PowerPoint, spreadsheets, CSV, Markdown.
      </p>
      {docs.length > 0 && (
        <ul className="space-y-1.5 mb-2">
          {docs.map((d) => (
            <li
              key={d.path}
              className="flex items-center gap-2 px-3 py-2 bg-gray-900 rounded-lg border border-gray-700"
            >
              <svg className="w-4 h-4 text-indigo-400 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
              </svg>
              <span className="text-sm text-gray-300 truncate flex-1" title={d.path}>{d.name}</span>
              <button
                onClick={() => onChange(docs.filter((x) => x.path !== d.path))}
                disabled={disabled}
                aria-label={`Remove ${d.name}`}
                className="p-0.5 rounded hover:bg-gray-800 text-gray-500 hover:text-gray-300 disabled:opacity-30"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                </svg>
              </button>
            </li>
          ))}
        </ul>
      )}
      {docs.length < MAX_SUPPORTING_DOCS && (
        <button
          onClick={pick}
          disabled={disabled}
          className="w-full px-3 py-3 bg-gray-900 hover:bg-gray-800 text-gray-500 hover:text-gray-300
                     text-sm rounded-lg border border-dashed border-gray-700 hover:border-gray-500
                     transition-colors flex items-center justify-center gap-2 disabled:opacity-30"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5" />
          </svg>
          Add documents...
        </button>
      )}
    </div>
  )
}
