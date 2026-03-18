import { useState, useCallback, useMemo, useRef, useEffect } from 'react'
import { useNotebookStore } from '../../stores/notebook-store'

// ── Types ──────────────────────────────────────────────────────────

interface AgendaEntry {
  time: string       // "09:00" or "" for all-day
  title: string
  detail: string     // extra info after |
  done: boolean
  noteId?: string    // linked note id — stored as @noteId in markdown
}

type ViewMode = 'day' | 'week' | 'month'

const HOURS = Array.from({ length: 16 }, (_, i) => i + 6) // 06:00 – 21:00

// ── Markdown ↔ Entries ─────────────────────────────────────────────

function parseEntries(md: string): { date: string; entries: AgendaEntry[] }[] {
  const days: { date: string; entries: AgendaEntry[] }[] = []
  let current: { date: string; entries: AgendaEntry[] } | null = null

  for (const line of md.split('\n')) {
    const dateMatch = line.match(/^##\s+(\d{4}-\d{2}-\d{2})/)
    if (dateMatch) {
      current = { date: dateMatch[1], entries: [] }
      days.push(current)
      continue
    }
    const entryMatch = line.match(/^- \[([ x])\]\s*(?:(\d{1,2}:\d{2})\s+)?(.+)/)
    if (entryMatch && current) {
      const done = entryMatch[1] === 'x'
      const time = entryMatch[2] || ''
      let rest = entryMatch[3]
      // Extract @noteId if present
      let noteId: string | undefined
      const noteMatch = rest.match(/\s*@(\S+)\s*$/)
      if (noteMatch) {
        noteId = noteMatch[1]
        rest = rest.slice(0, -noteMatch[0].length)
      }
      const parts = rest.split(' | ')
      current.entries.push({ time, title: parts[0].trim(), detail: parts.slice(1).join(' | ').trim(), done, noteId })
    }
  }
  return days
}

function serializeAll(days: { date: string; entries: AgendaEntry[] }[]): string {
  const sorted = [...days].sort((a, b) => a.date.localeCompare(b.date))
  return sorted.map((d) => {
    const lines = [`## ${d.date}`, '']
    for (const e of d.entries) {
      const check = e.done ? 'x' : ' '
      const timePart = e.time ? `${e.time} ` : ''
      const detailPart = e.detail ? ` | ${e.detail}` : ''
      const notePart = e.noteId ? ` @${e.noteId}` : ''
      lines.push(`- [${check}] ${timePart}${e.title}${detailPart}${notePart}`)
    }
    lines.push('')
    return lines.join('\n')
  }).join('\n')
}

/**
 * Append an entry to agenda.md from outside the component.
 * Called by notebook store when a note is created.
 */
export async function appendAgendaEntry(
  rootPath: string,
  entry: { time: string; title: string; noteId?: string }
): Promise<void> {
  const agendaPath = `${rootPath}/agenda.md`
  let md = ''
  try {
    md = await window.electronAPI.readFile(agendaPath)
  } catch {
    // File doesn't exist yet
  }
  const days = parseEntries(md)
  const today = new Date().toISOString().slice(0, 10)
  let todayDay = days.find((d) => d.date === today)
  if (!todayDay) {
    todayDay = { date: today, entries: [] }
    days.push(todayDay)
  }
  todayDay.entries.push({
    time: entry.time,
    title: entry.title,
    detail: '',
    done: false,
    noteId: entry.noteId
  })
  todayDay.entries.sort((a, b) => (a.time || '99:99').localeCompare(b.time || '99:99'))
  await window.electronAPI.writeFile(agendaPath, serializeAll(days))
}

// ── Helpers ─────────────────────────────────────────────────────────

function fmt(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d)
  r.setDate(r.getDate() + n)
  return r
}

function startOfWeek(d: Date): Date {
  const r = new Date(d)
  const day = r.getDay()
  r.setDate(r.getDate() - (day === 0 ? 6 : day - 1)) // Monday start
  return r
}

function getDaysInMonth(d: Date): Date[] {
  const year = d.getFullYear()
  const month = d.getMonth()
  const first = new Date(year, month, 1)
  const last = new Date(year, month + 1, 0)
  const days: Date[] = []
  for (let i = 1; i <= last.getDate(); i++) {
    days.push(new Date(year, month, i))
  }
  // Pad start to Monday
  const startDay = first.getDay() === 0 ? 6 : first.getDay() - 1
  for (let i = 0; i < startDay; i++) {
    days.unshift(addDays(first, -(i + 1)))
  }
  // Pad end to fill 6 rows
  while (days.length < 42) days.push(addDays(last, days.length - last.getDate() - startDay + 1))
  return days
}

const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

// ── Component ──────────────────────────────────────────────────────

export function AgendaView(): JSX.Element {
  const { notebook, pages, goToPage, addNote } = useNotebookStore()

  // Navigate to a note by its id
  const navigateToNote = useCallback((noteId: string) => {
    const idx = pages.findIndex((p) => p.config.id === noteId)
    if (idx >= 0) goToPage(idx)
  }, [pages, goToPage])

  const [view, setView] = useState<ViewMode>('day')
  const [selectedDate, setSelectedDate] = useState(new Date())
  const [newEntryDate, setNewEntryDate] = useState<string | null>(null)
  const [newTime, setNewTime] = useState('')
  const [newTitle, setNewTitle] = useState('')
  const [newDetail, setNewDetail] = useState('')
  const [agendaMd, setAgendaMd] = useState('')
  const saveTimer = useRef<ReturnType<typeof setTimeout>>()

  // Load agenda.md from notebook root
  useEffect(() => {
    if (!notebook?.rootPath) return
    const agendaPath = `${notebook.rootPath}/agenda.md`
    window.electronAPI.readFile(agendaPath)
      .then(setAgendaMd)
      .catch(() => setAgendaMd(''))
  }, [notebook?.rootPath])

  // Derive note entries from all pages by their createdAt date
  const noteEntries = useMemo(() => {
    const map = new Map<string, AgendaEntry[]>()
    try {
      for (const page of (pages || [])) {
        const created = page?.config?.createdAt
        if (!created || created.length < 10) continue
        // Use local date instead of UTC to match calendar
        const d = new Date(created)
        const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
        const time = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
        // Extract title from content (first heading or first line)
        const noteTitle = (page.markdownContent || '')
          .replace(/<[^>]+>/g, '')
          .replace(/^#+\s*/, '')
          .trim()
          .split('\n')[0]
          ?.slice(0, 60) || page.config.id
        const entry: AgendaEntry = {
          time,
          title: noteTitle,
          detail: page.config.id,
          done: !!page.config.archivedAt,
          noteId: page.config.id
        }
        if (!map.has(date)) map.set(date, [])
        map.get(date)!.push(entry)
      }
    } catch (err) {
      console.error('AgendaView: error deriving note entries', err)
    }
    return map
  }, [pages])

  const manualDays = useMemo(() => parseEntries(agendaMd), [agendaMd])

  // Merge manual agenda entries with note-derived entries
  const getEntries = useCallback((date: string): AgendaEntry[] => {
    const manual = manualDays.find((d) => d.date === date)?.entries ?? []
    const notes = noteEntries.get(date) ?? []
    const all = [...manual, ...notes]
    all.sort((a, b) => (a.time || '99:99').localeCompare(b.time || '99:99'))
    return all
  }, [manualDays, noteEntries])

  // Create a note from a time slot
  const createNoteAtTime = useCallback(async (date: string, time: string, title: string) => {
    if (!title.trim()) return
    const noteId = title.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
    await addNote(noteId)
    // Navigate to the newly created note
    setTimeout(() => {
      const { pages: latestPages } = useNotebookStore.getState()
      const idx = latestPages.findIndex((p) => p.config.id === noteId)
      if (idx >= 0) goToPage(idx)
    }, 100)
  }, [addNote, goToPage])

  const updateAndSave = useCallback((newDays: { date: string; entries: AgendaEntry[] }[]) => {
    if (!notebook?.rootPath) return
    const md = serializeAll(newDays)
    setAgendaMd(md)
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      window.electronAPI.writeFile(`${notebook.rootPath}/agenda.md`, md)
    }, 800)
  }, [notebook?.rootPath])

  const setEntriesForDate = useCallback((date: string, entries: AgendaEntry[]) => {
    const existing = manualDays.filter((d) => d.date !== date)
    if (entries.length > 0) existing.push({ date, entries })
    updateAndSave(existing)
  }, [manualDays, updateAndSave])

  const toggleDone = useCallback((date: string, idx: number) => {
    const entries = [...getEntries(date)]
    if (entries[idx]) {
      entries[idx] = { ...entries[idx], done: !entries[idx].done }
      setEntriesForDate(date, entries)
    }
  }, [getEntries, setEntriesForDate])

  const deleteEntry = useCallback((date: string, idx: number) => {
    const entries = getEntries(date).filter((_, i) => i !== idx)
    setEntriesForDate(date, entries)
  }, [getEntries, setEntriesForDate])

  const addEntry = useCallback((date: string) => {
    if (!newTitle.trim()) return
    const entries = [...getEntries(date), { time: newTime, title: newTitle.trim(), detail: newDetail.trim(), done: false }]
    entries.sort((a, b) => (a.time || '99:99').localeCompare(b.time || '99:99'))
    setEntriesForDate(date, entries)
    setNewTime('')
    setNewTitle('')
    setNewDetail('')
    setNewEntryDate(null)
  }, [newTime, newTitle, newDetail, getEntries, setEntriesForDate])

  // Add with explicit time/title (for slot-based adding)
  const addEntryDirect = useCallback((date: string, time: string, title: string) => {
    if (!title.trim()) return
    const entries = [...getEntries(date), { time, title: title.trim(), detail: '', done: false }]
    entries.sort((a, b) => (a.time || '99:99').localeCompare(b.time || '99:99'))
    setEntriesForDate(date, entries)
    setNewTime('')
    setNewTitle('')
    setNewDetail('')
  }, [getEntries, setEntriesForDate])

  const today = fmt(new Date())
  const selStr = fmt(selectedDate)

  // ── Navigation ────────────────────────────────────────────────────
  const navigate = (dir: number) => {
    if (view === 'day') setSelectedDate(addDays(selectedDate, dir))
    else if (view === 'week') setSelectedDate(addDays(selectedDate, dir * 7))
    else {
      const d = new Date(selectedDate)
      d.setMonth(d.getMonth() + dir)
      setSelectedDate(d)
    }
  }

  const headerLabel = view === 'day'
    ? selectedDate.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
    : view === 'week'
    ? (() => {
        const s = startOfWeek(selectedDate)
        const e = addDays(s, 6)
        return `${s.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} – ${e.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}`
      })()
    : `${MONTH_NAMES[selectedDate.getMonth()]} ${selectedDate.getFullYear()}`

  return (
    <div className="h-full flex flex-col bg-gray-950 text-gray-200">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-2 border-b border-gray-800 flex-shrink-0">
        <div className="flex items-center gap-1">
          <button onClick={() => navigate(-1)} className="p-1 rounded hover:bg-gray-800 text-gray-400">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" /></svg>
          </button>
          <button onClick={() => setSelectedDate(new Date())} className="px-2 py-0.5 text-[10px] rounded bg-gray-800 text-gray-400 hover:text-white transition-colors">Today</button>
          <button onClick={() => navigate(1)} className="p-1 rounded hover:bg-gray-800 text-gray-400">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" /></svg>
          </button>
        </div>
        <span className="text-sm font-medium flex-1">{headerLabel}</span>
        <div className="flex gap-0.5 bg-gray-900 rounded-md p-0.5">
          {(['day', 'week', 'month'] as ViewMode[]).map((m) => (
            <button key={m} onClick={() => setView(m)}
              className={`px-2.5 py-1 text-[10px] rounded transition-colors ${view === m ? 'bg-white text-black font-medium' : 'text-gray-500 hover:text-gray-300'}`}
            >{m.charAt(0).toUpperCase() + m.slice(1)}</button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        {view === 'day' && (
          <DayView
            date={selStr}
            entries={getEntries(selStr)}
            isToday={selStr === today}
            onToggle={(i) => toggleDone(selStr, i)}
            onDelete={(i) => deleteEntry(selStr, i)}
            showAdd={newEntryDate === selStr}
            onShowAdd={() => setNewEntryDate(selStr)}
            newTime={newTime} newTitle={newTitle} newDetail={newDetail}
            onNewTime={setNewTime} onNewTitle={setNewTitle} onNewDetail={setNewDetail}
            onAdd={() => addEntry(selStr)}
            onCreateNote={(time, title) => createNoteAtTime(selStr, time, title)}
            onCancelAdd={() => setNewEntryDate(null)}
            onNavigateToNote={navigateToNote}
          />
        )}
        {view === 'week' && (
          <WeekView
            startDate={startOfWeek(selectedDate)}
            today={today}
            getEntries={getEntries}
            onToggle={toggleDone}
            onDelete={deleteEntry}
            onSelectDate={(d) => { setSelectedDate(new Date(d)); setView('day') }}
            showAddDate={newEntryDate}
            onShowAdd={setNewEntryDate}
            newTime={newTime} newTitle={newTitle} newDetail={newDetail}
            onNewTime={setNewTime} onNewTitle={setNewTitle} onNewDetail={setNewDetail}
            onAdd={addEntry}
            onCancelAdd={() => setNewEntryDate(null)}
          />
        )}
        {view === 'month' && (
          <MonthView
            selectedDate={selectedDate}
            today={today}
            getEntries={getEntries}
            onSelectDate={(d) => { setSelectedDate(new Date(d)); setView('day') }}
          />
        )}
      </div>
    </div>
  )
}

// ── Day View ────────────────────────────────────────────────────────

function DayView({ date, entries, isToday, onToggle, onDelete, showAdd, onShowAdd, newTime, newTitle, newDetail, onNewTime, onNewTitle, onNewDetail, onAdd, onCreateNote, onCancelAdd, onNavigateToNote }: {
  date: string; entries: AgendaEntry[]; isToday: boolean
  onToggle: (i: number) => void; onDelete: (i: number) => void
  showAdd: boolean; onShowAdd: () => void
  onNavigateToNote?: (noteId: string) => void
  onCreateNote: (time: string, title: string) => void
  newTime: string; newTitle: string; newDetail: string
  onNewTime: (v: string) => void; onNewTitle: (v: string) => void; onNewDetail: (v: string) => void
  onAdd: () => void; onCancelAdd: () => void
}): JSX.Element {
  const [addingAtHour, setAddingAtHour] = useState<number | null>(null)
  const [hoveredHour, setHoveredHour] = useState<number | null>(null)
  const [slotTitle, setSlotTitle] = useState('')
  const slotInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { if (addingAtHour !== null) slotInputRef.current?.focus() }, [addingAtHour])

  const timed = entries.filter((e) => e.time)
  const allDay = entries.filter((e) => !e.time)

  const handleSlotAdd = (h: number) => {
    if (!slotTitle.trim()) return
    const time = `${h.toString().padStart(2, '0')}:00`
    onCreateNote(time, slotTitle.trim())
    setSlotTitle('')
    setAddingAtHour(null)
  }

  const startAddAtHour = (h: number) => {
    setSlotTitle('')
    setAddingAtHour(h)
  }

  return (
    <div className="p-4">
      {/* All-day entries */}
      {allDay.length > 0 && (
        <div className="mb-4">
          <div className="text-[9px] text-gray-600 uppercase tracking-wider mb-1.5">All Day</div>
          {allDay.map((e, i) => {
            const realIdx = entries.indexOf(e)
            return <EntryRow key={i} entry={e} onToggle={() => onToggle(realIdx)} onDelete={() => onDelete(realIdx)} onNavigateToNote={onNavigateToNote} />
          })}
        </div>
      )}

      {/* Time grid */}
      <div className="relative">
        {HOURS.map((h) => {
          const timeStr = `${h.toString().padStart(2, '0')}:00`
          const hourEntries = timed.filter((e) => e.time.startsWith(h.toString().padStart(2, '0')))
          const isAdding = addingAtHour === h
          const isHovered = hoveredHour === h && addingAtHour === null

          return (
            <div
              key={h}
              className={`flex border-t transition-colors ${isHovered ? 'border-gray-200/30 bg-white/5' : 'border-gray-800/50'}`}
              onMouseEnter={() => setHoveredHour(h)}
              onMouseLeave={() => setHoveredHour(null)}
            >
              <div className="w-14 flex-shrink-0 text-[10px] text-gray-600 pt-2 text-right pr-3 select-none">{timeStr}</div>
              <div className="flex-1 py-1 min-h-[48px]">
                {hourEntries.map((e) => {
                  const realIdx = entries.indexOf(e)
                  return <EntryRow key={realIdx} entry={e} compact onToggle={() => onToggle(realIdx)} onDelete={() => onDelete(realIdx)} onNavigateToNote={onNavigateToNote} />
                })}

                {/* Inline add form for this slot */}
                {isAdding ? (
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <input
                      ref={slotInputRef}
                      type="text"
                      value={slotTitle}
                      onChange={(e) => setSlotTitle(e.target.value)}
                      placeholder="Note name..."
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && slotTitle.trim()) handleSlotAdd(h)
                        if (e.key === 'Escape') { setAddingAtHour(null); setSlotTitle('') }
                      }}
                      className="flex-1 px-2 py-1 bg-gray-900 border border-gray-200/50 rounded text-xs text-white placeholder-gray-600 focus:outline-none focus:border-gray-200"
                    />
                    <button
                      onClick={() => handleSlotAdd(h)}
                      disabled={!slotTitle.trim()}
                      className="px-2 py-1 bg-white hover:bg-gray-200 disabled:opacity-30 text-black text-[9px] rounded font-medium"
                    >Add</button>
                    <button
                      onClick={() => { setAddingAtHour(null); setSlotTitle('') }}
                      className="px-1 py-1 text-gray-600 hover:text-gray-400 text-[9px]"
                    >Esc</button>
                  </div>
                ) : isHovered && hourEntries.length === 0 ? (
                  <button
                    onClick={() => startAddAtHour(h)}
                    className="w-full text-left px-2 py-1 text-[10px] text-gray-700 hover:text-white transition-colors rounded"
                  >
                    + New note at {timeStr}
                  </button>
                ) : isHovered && hourEntries.length > 0 ? (
                  <button
                    onClick={() => startAddAtHour(h)}
                    className="text-[9px] text-gray-700 hover:text-white px-1 mt-0.5 transition-colors"
                  >+ New note</button>
                ) : null}
              </div>
            </div>
          )
        })}
        {/* Current time indicator */}
        {isToday && <NowLine />}
      </div>

      {/* All-day add entry */}
      {showAdd ? (
        <div className="mt-3 p-3 bg-gray-900 rounded-lg border border-gray-800">
          <div className="flex gap-2">
            <input type="time" value={newTime} onChange={(e) => onNewTime(e.target.value)}
              className="w-24 px-2 py-1.5 bg-gray-800 border border-gray-700 rounded text-xs text-white focus:border-gray-200 focus:outline-none" />
            <input type="text" value={newTitle} onChange={(e) => onNewTitle(e.target.value)}
              placeholder="All-day commitment..."
              autoFocus
              onKeyDown={(e) => { if (e.key === 'Enter') onAdd(); if (e.key === 'Escape') onCancelAdd() }}
              className="flex-1 px-2 py-1.5 bg-gray-800 border border-gray-700 rounded text-xs text-white placeholder-gray-600 focus:border-gray-200 focus:outline-none" />
          </div>
          <div className="flex gap-2 mt-2">
            <input type="text" value={newDetail} onChange={(e) => onNewDetail(e.target.value)}
              placeholder="Details (optional)"
              onKeyDown={(e) => { if (e.key === 'Enter') onAdd() }}
              className="flex-1 px-2 py-1.5 bg-gray-800 border border-gray-700 rounded text-xs text-white placeholder-gray-600 focus:border-gray-200 focus:outline-none" />
            <button onClick={onAdd} disabled={!newTitle.trim()}
              className="px-3 py-1.5 bg-white hover:bg-gray-200 disabled:opacity-30 text-black text-[10px] rounded font-medium">Add</button>
            <button onClick={onCancelAdd}
              className="px-2 py-1.5 text-gray-500 hover:text-gray-300 text-[10px]">Cancel</button>
          </div>
        </div>
      ) : (
        <button onClick={onShowAdd}
          className="mt-3 w-full py-2 border border-dashed border-gray-800 hover:border-gray-600 rounded-lg text-gray-600 hover:text-gray-400 text-xs transition-colors flex items-center justify-center gap-1">
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
          Add all-day entry
        </button>
      )}
    </div>
  )
}

// ── Week View ───────────────────────────────────────────────────────

function WeekView({ startDate, today, getEntries, onToggle, onDelete, onSelectDate, showAddDate, onShowAdd, newTime, newTitle, newDetail, onNewTime, onNewTitle, onNewDetail, onAdd, onCancelAdd }: {
  startDate: Date; today: string; getEntries: (d: string) => AgendaEntry[]
  onToggle: (d: string, i: number) => void; onDelete: (d: string, i: number) => void
  onSelectDate: (d: string) => void
  showAddDate: string | null; onShowAdd: (d: string | null) => void
  newTime: string; newTitle: string; newDetail: string
  onNewTime: (v: string) => void; onNewTitle: (v: string) => void; onNewDetail: (v: string) => void
  onAdd: (d: string) => void; onCancelAdd: () => void
}): JSX.Element {
  const days = Array.from({ length: 7 }, (_, i) => fmt(addDays(startDate, i)))

  return (
    <div className="grid grid-cols-7 gap-px bg-gray-800/30 h-full">
      {days.map((d) => {
        const date = new Date(d)
        const entries = getEntries(d)
        const isToday = d === today
        return (
          <div key={d} className="bg-gray-950 flex flex-col min-h-0">
            <button onClick={() => onSelectDate(d)}
              className={`px-2 py-1.5 text-left border-b border-gray-800 hover:bg-gray-900 transition-colors ${isToday ? 'bg-white/5' : ''}`}>
              <div className={`text-[9px] uppercase tracking-wider ${isToday ? 'text-white' : 'text-gray-600'}`}>
                {DAY_NAMES[date.getDay() === 0 ? 6 : date.getDay() - 1]}
              </div>
              <div className={`text-sm font-medium ${isToday ? 'text-gray-300' : 'text-gray-300'}`}>
                {date.getDate()}
              </div>
            </button>
            <div className="flex-1 overflow-y-auto px-1 py-1 space-y-0.5">
              {entries.map((e, i) => (
                <div key={i} onClick={() => onToggle(d, i)}
                  className={`px-1.5 py-1 rounded text-[9px] cursor-pointer transition-colors ${
                    e.done ? 'bg-gray-800/50 text-gray-600 line-through' : 'bg-gray-900 text-gray-300 hover:bg-gray-800'
                  }`}>
                  {e.time && <span className="text-gray-500 mr-1">{e.time}</span>}
                  {e.title}
                </div>
              ))}
            </div>
            <button onClick={() => onShowAdd(d)}
              className="px-1 py-1 text-gray-700 hover:text-gray-500 text-[10px] hover:bg-gray-900 transition-colors text-center">
              +
            </button>
          </div>
        )
      })}
    </div>
  )
}

// ── Month View ──────────────────────────────────────────────────────

function MonthView({ selectedDate, today, getEntries, onSelectDate }: {
  selectedDate: Date; today: string; getEntries: (d: string) => AgendaEntry[]
  onSelectDate: (d: string) => void
}): JSX.Element {
  const days = getDaysInMonth(selectedDate)
  const currentMonth = selectedDate.getMonth()

  return (
    <div className="p-2">
      <div className="grid grid-cols-7 gap-px">
        {DAY_NAMES.map((d) => (
          <div key={d} className="text-[9px] text-gray-600 uppercase tracking-wider text-center py-1">{d}</div>
        ))}
        {days.map((d, i) => {
          const dateStr = fmt(d)
          const entries = getEntries(dateStr)
          const isToday = dateStr === today
          const isCurrentMonth = d.getMonth() === currentMonth
          return (
            <button key={i} onClick={() => onSelectDate(dateStr)}
              className={`aspect-square p-1 rounded-md text-left transition-colors relative ${
                isToday ? 'bg-white/5 ring-1 ring-gray-200/30' :
                isCurrentMonth ? 'hover:bg-gray-900' : 'opacity-30'
              }`}
            >
              <div className={`text-[10px] font-medium ${isToday ? 'text-gray-300' : 'text-gray-400'}`}>
                {d.getDate()}
              </div>
              {entries.length > 0 && (
                <div className="mt-0.5 space-y-px">
                  {entries.slice(0, 3).map((e, j) => (
                    <div key={j} className={`h-1 rounded-full ${e.done ? 'bg-gray-700' : 'bg-gray-200/60'}`} />
                  ))}
                  {entries.length > 3 && (
                    <div className="text-[7px] text-gray-600">+{entries.length - 3}</div>
                  )}
                </div>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ── Shared Components ───────────────────────────────────────────────

function EntryRow({ entry, compact, onToggle, onDelete, onNavigateToNote }: {
  entry: AgendaEntry; compact?: boolean; onToggle: () => void; onDelete: () => void
  onNavigateToNote?: (noteId: string) => void
}): JSX.Element {
  return (
    <div className={`group flex items-start gap-2 ${compact ? 'py-0.5' : 'py-1'} hover:bg-gray-900/50 rounded px-1 -mx-1`}>
      <button onClick={onToggle}
        className={`mt-0.5 w-4 h-4 rounded border flex-shrink-0 flex items-center justify-center transition-colors ${
          entry.done ? 'bg-white border-white text-black' : 'border-gray-600 hover:border-gray-200'
        }`}>
        {entry.done && (
          <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" strokeWidth={3} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
          </svg>
        )}
      </button>
      <div className="flex-1 min-w-0">
        <div className={`text-xs ${entry.done ? 'line-through text-gray-600' : 'text-gray-200'}`}>
          {entry.time && <span className="text-white mr-1.5 font-mono text-[10px]">{entry.time}</span>}
          {entry.title}
          {entry.noteId && onNavigateToNote && (
            <button
              onClick={(e) => { e.stopPropagation(); onNavigateToNote(entry.noteId!) }}
              className="ml-1.5 inline-flex items-center text-white hover:text-gray-300 transition-colors"
              title={`Go to note: ${entry.noteId}`}
            >
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 0 0 3 8.25v10.5A2.25 2.25 0 0 0 5.25 21h10.5A2.25 2.25 0 0 0 18 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
              </svg>
            </button>
          )}
        </div>
        {entry.detail && (
          <div className="text-[10px] text-gray-600 mt-0.5">{entry.detail}</div>
        )}
      </div>
      <button onClick={onDelete}
        className="opacity-0 group-hover:opacity-100 p-0.5 text-gray-600 hover:text-red-400 transition-all">
        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  )
}

function NowLine(): JSX.Element {
  const [top, setTop] = useState(0)
  useEffect(() => {
    const update = () => {
      const now = new Date()
      const h = now.getHours()
      const m = now.getMinutes()
      if (h < 6 || h > 21) { setTop(-1); return }
      // 44px per hour slot, offset from hour 6
      setTop((h - 6) * 44 + (m / 60) * 44)
    }
    update()
    const interval = setInterval(update, 60000)
    return () => clearInterval(interval)
  }, [])

  if (top < 0) return <></>
  return (
    <div className="absolute left-0 right-0 pointer-events-none" style={{ top }}>
      <div className="flex items-center">
        <div className="w-2 h-2 rounded-full bg-red-500 -ml-1" />
        <div className="flex-1 h-px bg-red-500/60" />
      </div>
    </div>
  )
}
