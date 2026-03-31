import { useState, useEffect, useCallback } from 'react'

type Category = 'component' | 'color-palette' | 'typography' | 'snippet' | 'layout-pattern'

interface DesignElement {
  id: string
  name: string
  category: Category
  description: string
  content: string
  tags: string[]
  createdAt: string
  updatedAt: string
}

const CATEGORIES: { value: Category; label: string; icon: string }[] = [
  { value: 'component', label: 'Components', icon: '⬡' },
  { value: 'color-palette', label: 'Colors', icon: '◐' },
  { value: 'typography', label: 'Typography', icon: 'Aa' },
  { value: 'snippet', label: 'Snippets', icon: '{ }' },
  { value: 'layout-pattern', label: 'Layouts', icon: '▦' },
]

export function DesignSystemPanel({ onClose, onInsert }: {
  onClose: () => void
  onInsert: (content: string) => void
}): JSX.Element {
  const [elements, setElements] = useState<DesignElement[]>([])
  const [loading, setLoading] = useState(true)
  const [activeCategory, setActiveCategory] = useState<Category | null>(null)
  const [search, setSearch] = useState('')
  const [editingElement, setEditingElement] = useState<Partial<DesignElement> | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const loadElements = useCallback(async () => {
    setLoading(true)
    const opts: { category?: string; search?: string } = {}
    if (activeCategory) opts.category = activeCategory
    if (search.trim()) opts.search = search.trim()
    const stored = await window.electronAPI.listDesignElements(opts)
    setElements(stored)
    setLoading(false)
  }, [activeCategory, search])

  useEffect(() => { loadElements() }, [loadElements])

  const handleSave = async () => {
    if (!editingElement?.name || !editingElement?.category || !editingElement?.content) return
    await window.electronAPI.saveDesignElement({
      id: editingElement.id,
      name: editingElement.name,
      category: editingElement.category,
      description: editingElement.description || '',
      content: editingElement.content,
      tags: editingElement.tags || [],
    })
    setEditingElement(null)
    loadElements()
  }

  const handleDelete = async (id: string) => {
    await window.electronAPI.deleteDesignElement(id)
    setElements(prev => prev.filter(e => e.id !== id))
  }

  const categoryColor = (cat: Category): string => {
    switch (cat) {
      case 'component': return 'text-indigo-400'
      case 'color-palette': return 'text-pink-400'
      case 'typography': return 'text-amber-400'
      case 'snippet': return 'text-emerald-400'
      case 'layout-pattern': return 'text-cyan-400'
    }
  }

  const categoryBg = (cat: Category): string => {
    switch (cat) {
      case 'component': return 'bg-indigo-500/10 border-indigo-500/20'
      case 'color-palette': return 'bg-pink-500/10 border-pink-500/20'
      case 'typography': return 'bg-amber-500/10 border-amber-500/20'
      case 'snippet': return 'bg-emerald-500/10 border-emerald-500/20'
      case 'layout-pattern': return 'bg-cyan-500/10 border-cyan-500/20'
    }
  }

  // ── Editor view ──
  if (editingElement) {
    return (
      <>
        <div className="fixed inset-0 z-40" onClick={onClose} />
        <div className="absolute bottom-0 right-full mr-2 z-50 bg-gray-900 border border-gray-700 rounded-xl shadow-2xl w-96 max-h-[600px] overflow-hidden flex flex-col">
          <div className="px-3 py-2.5 border-b border-gray-800 flex items-center gap-2">
            <button onClick={() => setEditingElement(null)} className="text-gray-500 hover:text-gray-300 transition-colors">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
              </svg>
            </button>
            <span className="text-xs font-medium text-gray-300 flex-1">
              {editingElement.id ? 'Edit Element' : 'New Element'}
            </span>
          </div>

          <div className="flex-1 overflow-y-auto p-3 space-y-3">
            <input
              value={editingElement.name || ''}
              onChange={e => setEditingElement(prev => ({ ...prev, name: e.target.value }))}
              placeholder="Name (e.g. Metric Card)"
              className="w-full text-xs bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-gray-200 focus:outline-none focus:border-indigo-500"
            />

            <div className="flex flex-wrap gap-1.5">
              {CATEGORIES.map(cat => (
                <button
                  key={cat.value}
                  onClick={() => setEditingElement(prev => ({ ...prev, category: cat.value }))}
                  className={`px-2 py-1 rounded-lg text-[10px] font-medium border transition-colors ${
                    editingElement.category === cat.value
                      ? categoryBg(cat.value) + ' ' + categoryColor(cat.value)
                      : 'bg-gray-800 border-gray-700 text-gray-500 hover:text-gray-300'
                  }`}
                >
                  {cat.icon} {cat.label}
                </button>
              ))}
            </div>

            <input
              value={editingElement.description || ''}
              onChange={e => setEditingElement(prev => ({ ...prev, description: e.target.value }))}
              placeholder="Description — when to use this element"
              className="w-full text-xs bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-gray-200 focus:outline-none focus:border-indigo-500"
            />

            <textarea
              value={editingElement.content || ''}
              onChange={e => setEditingElement(prev => ({ ...prev, content: e.target.value }))}
              placeholder="JSX snippet, CSS values, or markdown content..."
              rows={10}
              className="w-full text-xs bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-gray-200 font-mono focus:outline-none focus:border-indigo-500 resize-none"
            />

            <input
              value={(editingElement.tags || []).join(', ')}
              onChange={e => setEditingElement(prev => ({
                ...prev,
                tags: e.target.value.split(',').map(t => t.trim()).filter(Boolean),
              }))}
              placeholder="Tags (comma separated: card, stats, dark-theme)"
              className="w-full text-xs bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-gray-200 focus:outline-none focus:border-indigo-500"
            />
          </div>

          <div className="px-3 py-2 border-t border-gray-800 flex gap-2">
            <button
              onClick={() => setEditingElement(null)}
              className="flex-1 px-3 py-1.5 text-xs text-gray-400 bg-gray-800 rounded-lg hover:bg-gray-700 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={!editingElement.name || !editingElement.category || !editingElement.content}
              className="flex-1 px-3 py-1.5 text-xs text-white bg-indigo-600 rounded-lg hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {editingElement.id ? 'Update' : 'Save'}
            </button>
          </div>
        </div>
      </>
    )
  }

  // ── List view ──
  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div className="absolute bottom-0 right-full mr-2 z-50 bg-gray-900 border border-gray-700 rounded-xl shadow-2xl w-80 max-h-[520px] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-3 py-2.5 border-b border-gray-800 flex items-center gap-2">
          <svg className="w-3.5 h-3.5 text-violet-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M4.098 19.902a3.75 3.75 0 0 0 5.304 0l6.401-6.402M6.75 21A3.75 3.75 0 0 1 3 17.25V4.125C3 3.504 3.504 3 4.125 3h5.25c.621 0 1.125.504 1.125 1.125v4.072M6.75 21a3.75 3.75 0 0 0 3.75-3.75V8.197M6.75 21h13.125c.621 0 1.125-.504 1.125-1.125v-5.25c0-.621-.504-1.125-1.125-1.125h-4.072M10.5 8.197l2.88-2.88c.438-.439 1.15-.439 1.59 0l3.712 3.713c.44.44.44 1.152 0 1.59l-2.879 2.88M6.75 17.25h.008v.008H6.75v-.008Z" />
          </svg>
          <span className="text-xs font-medium text-gray-300 flex-1">Design System</span>
          <span className="text-[9px] text-gray-600">{elements.length}</span>
          <button
            onClick={() => setEditingElement({ category: 'component', tags: [] })}
            className="w-5 h-5 rounded flex items-center justify-center text-gray-500 hover:text-white hover:bg-indigo-600 transition-colors"
            title="New element"
          >
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
          </button>
        </div>

        {/* Search */}
        <div className="px-3 py-2 border-b border-gray-800">
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search elements..."
            className="w-full text-xs bg-gray-800 border border-gray-700 rounded-lg px-2.5 py-1.5 text-gray-200 focus:outline-none focus:border-indigo-500 placeholder:text-gray-600"
          />
        </div>

        {/* Category filter */}
        <div className="px-3 py-2 border-b border-gray-800 flex flex-wrap gap-1">
          <button
            onClick={() => setActiveCategory(null)}
            className={`px-2 py-0.5 rounded text-[9px] font-medium transition-colors ${
              !activeCategory ? 'bg-gray-700 text-white' : 'text-gray-500 hover:text-gray-300'
            }`}
          >
            All
          </button>
          {CATEGORIES.map(cat => (
            <button
              key={cat.value}
              onClick={() => setActiveCategory(activeCategory === cat.value ? null : cat.value)}
              className={`px-2 py-0.5 rounded text-[9px] font-medium transition-colors ${
                activeCategory === cat.value
                  ? 'bg-gray-700 ' + categoryColor(cat.value)
                  : 'text-gray-500 hover:text-gray-300'
              }`}
            >
              {cat.icon} {cat.label}
            </button>
          ))}
        </div>

        {/* Element list */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="p-4 text-center text-xs text-gray-500">Loading...</div>
          ) : elements.length === 0 ? (
            <div className="p-6 text-center">
              <div className="text-gray-600 text-xs mb-1">No design elements yet</div>
              <div className="text-gray-700 text-[10px] mb-3">Build a reusable component library for consistent presentations</div>
              <button
                onClick={() => setEditingElement({ category: 'component', tags: [] })}
                className="px-3 py-1.5 text-[10px] text-indigo-400 bg-indigo-500/10 border border-indigo-500/20 rounded-lg hover:bg-indigo-500/20 transition-colors"
              >
                Create first element
              </button>
            </div>
          ) : (
            elements.map(el => (
              <div key={el.id} className="group border-b border-gray-800 hover:bg-gray-800/50 transition-colors">
                <div className="px-3 py-2">
                  {/* Header row */}
                  <div className="flex items-center gap-1.5">
                    <span className={`text-[10px] ${categoryColor(el.category)}`}>
                      {CATEGORIES.find(c => c.value === el.category)?.icon}
                    </span>
                    <span className="text-xs font-medium text-gray-200 truncate flex-1">{el.name}</span>
                    <span className={`text-[8px] px-1 py-0.5 rounded border ${categoryBg(el.category)} ${categoryColor(el.category)}`}>
                      {el.category}
                    </span>
                  </div>

                  {/* Description */}
                  <div className="text-[10px] text-gray-500 mt-0.5 truncate">{el.description}</div>

                  {/* Tags */}
                  {el.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1">
                      {el.tags.map(tag => (
                        <span key={tag} className="text-[8px] px-1 py-0.5 rounded bg-gray-800 text-gray-500">{tag}</span>
                      ))}
                    </div>
                  )}

                  {/* Expanded content */}
                  {expandedId === el.id && (
                    <pre className="mt-2 p-2 bg-gray-950 rounded-lg text-[9px] text-gray-400 font-mono overflow-x-auto max-h-40 overflow-y-auto whitespace-pre-wrap">
                      {el.content}
                    </pre>
                  )}

                  {/* Actions */}
                  <div className="flex items-center gap-1 mt-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => onInsert(el.content)}
                      className="px-2 py-0.5 text-[9px] bg-indigo-600 text-white rounded hover:bg-indigo-500 transition-colors"
                    >
                      Insert
                    </button>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(el.content)
                      }}
                      className="px-2 py-0.5 text-[9px] bg-gray-800 text-gray-400 rounded hover:text-white transition-colors"
                    >
                      Copy
                    </button>
                    <button
                      onClick={() => setExpandedId(expandedId === el.id ? null : el.id)}
                      className="px-2 py-0.5 text-[9px] bg-gray-800 text-gray-400 rounded hover:text-white transition-colors"
                    >
                      {expandedId === el.id ? 'Collapse' : 'Preview'}
                    </button>
                    <div className="flex-1" />
                    <button
                      onClick={() => setEditingElement(el)}
                      className="px-1.5 py-0.5 text-[9px] text-gray-500 hover:text-gray-300 transition-colors"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleDelete(el.id)}
                      className="px-1.5 py-0.5 text-[9px] text-gray-500 hover:text-red-400 transition-colors"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </>
  )
}
