import { useState } from 'react'
import { usePresentationStore } from '../../stores/presentation-store'
import { useUIStore } from '../../stores/ui-store'
import { useExecutionStore } from '../../stores/execution-store'
import type { SupportedLanguage } from '../../../../../packages/shared/src/types/presentation'

export function Toolbar(): JSX.Element {
  const { presentation, currentSlideIndex, slides, nextSlide, prevSlide, addSlide, addCodeToSlide, addArtifact, addVideo, addWebApp } =
    usePresentationStore()
  const { togglePresenting, toggleNotes, showNotes, editingSlide, toggleEditingSlide, theme, setTheme } = useUIStore()
  const { saveSlideContent } = usePresentationStore()
  const { isExecuting } = useExecutionStore()

  const [showAddSlide, setShowAddSlide] = useState(false)
  const [showAddCode, setShowAddCode] = useState(false)
  const [showAddVideo, setShowAddVideo] = useState(false)
  const [showAddWebApp, setShowAddWebApp] = useState(false)
  const [newSlideId, setNewSlideId] = useState('')
  const [videoUrl, setVideoUrl] = useState('')
  const [webAppUrl, setWebAppUrl] = useState('')

  const currentSlide = slides[currentSlideIndex]
  const hasCode = !!currentSlide?.config.code
  const hasVideo = !!currentSlide?.config.video
  const hasWebApp = !!currentSlide?.config.webapp

  const handleAddSlide = async () => {
    const id = newSlideId.trim().replace(/\s+/g, '-').toLowerCase()
    if (!id) return
    await addSlide(id)
    setNewSlideId('')
    setShowAddSlide(false)
  }

  const handleAddCode = async (language: SupportedLanguage) => {
    await addCodeToSlide(language)
    setShowAddCode(false)
  }

  const handleAddVideo = async () => {
    const url = videoUrl.trim()
    if (!url) return
    await addVideo(url)
    setVideoUrl('')
    setShowAddVideo(false)
  }

  const handleAddWebApp = async () => {
    let url = webAppUrl.trim()
    if (!url) return
    if (!url.match(/^https?:\/\//)) url = `https://${url}`
    await addWebApp(url)
    setWebAppUrl('')
    setShowAddWebApp(false)
  }

  const closeAllDropdowns = () => {
    setShowAddSlide(false)
    setShowAddCode(false)
    setShowAddVideo(false)
    setShowAddWebApp(false)
  }

  return (
    <div className="h-12 bg-gray-900 border-b border-gray-800 flex items-center pl-20 pr-4 gap-4 select-none" style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}>
      {/* Navigation */}
      <div className="flex items-center gap-2" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
        <button
          onClick={prevSlide}
          disabled={currentSlideIndex === 0}
          className="p-1.5 rounded hover:bg-gray-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          title="Previous slide (←)"
        >
          <ChevronLeftIcon />
        </button>

        <span className="text-gray-400 text-sm font-mono min-w-[60px] text-center">
          {currentSlideIndex + 1} / {slides.length}
        </span>

        <button
          onClick={nextSlide}
          disabled={currentSlideIndex === slides.length - 1}
          className="p-1.5 rounded hover:bg-gray-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          title="Next slide (→)"
        >
          <ChevronRightIcon />
        </button>
      </div>

      {/* Separator */}
      <div className="w-px h-6 bg-gray-800" />

      {/* Title */}
      <div className="flex-1 min-w-0">
        <span className="text-gray-300 text-sm font-medium truncate block">
          {presentation?.title}
        </span>
      </div>

      {/* Right actions */}
      <div className="flex items-center gap-2" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
        {/* Execution status */}
        {isExecuting && (
          <div className="flex items-center gap-1.5 text-amber-400 text-xs">
            <div className="w-2 h-2 bg-amber-400 rounded-full animate-pulse" />
            Running...
          </div>
        )}

        {/* Edit / Preview slide toggle */}
        <button
          onClick={() => {
            if (editingSlide) {
              saveSlideContent(currentSlideIndex)
            }
            toggleEditingSlide()
          }}
          className={`p-1.5 rounded transition-colors ${
            editingSlide ? 'bg-indigo-600 text-white' : 'hover:bg-gray-800 text-gray-400'
          }`}
          title={editingSlide ? 'Switch to preview (save)' : 'Edit slide content'}
        >
          <EditIcon />
        </button>

        {/* Add Slide */}
        <div className="relative">
          <button
            onClick={() => { closeAllDropdowns(); setShowAddSlide(!showAddSlide) }}
            className="p-1.5 rounded hover:bg-gray-800 text-gray-400 hover:text-gray-200 transition-colors"
            title="Add new slide"
          >
            <PlusSlideIcon />
          </button>
          {showAddSlide && (
            <div className="absolute right-0 top-full mt-2 z-50 bg-gray-900 border border-gray-700 rounded-lg shadow-2xl p-3 w-64">
              <label className="text-xs text-gray-400 block mb-1.5">Slide ID</label>
              <input
                type="text"
                value={newSlideId}
                onChange={(e) => setNewSlideId(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAddSlide()}
                placeholder="e.g. intro, demo, conclusion"
                autoFocus
                className="w-full px-3 py-2 bg-gray-950 text-white rounded-md border border-gray-700
                           focus:border-indigo-500 focus:outline-none text-sm placeholder-gray-600"
              />
              <div className="flex gap-2 mt-2">
                <button
                  onClick={handleAddSlide}
                  disabled={!newSlideId.trim()}
                  className="flex-1 py-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40
                             text-white text-xs font-medium rounded-md transition-colors"
                >
                  Add after current
                </button>
                <button
                  onClick={() => { setShowAddSlide(false); setNewSlideId('') }}
                  className="py-1.5 px-3 bg-gray-800 hover:bg-gray-700 text-gray-400 text-xs rounded-md transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Add Code (only if current slide has no code) */}
        {!hasCode && (
          <div className="relative">
            <button
              onClick={() => { closeAllDropdowns(); setShowAddCode(!showAddCode) }}
              className="p-1.5 rounded hover:bg-gray-800 text-gray-400 hover:text-gray-200 transition-colors"
              title="Add code to this slide"
            >
              <CodeIcon />
            </button>
            {showAddCode && (
              <div className="absolute right-0 top-full mt-2 z-50 bg-gray-900 border border-gray-700 rounded-lg shadow-2xl p-2 w-44">
                <div className="text-[10px] uppercase tracking-wider text-gray-500 px-2 py-1">Language</div>
                {(['javascript', 'python', 'sql', 'typescript', 'bash', 'rust', 'go'] as SupportedLanguage[]).map((lang) => (
                  <button
                    key={lang}
                    onClick={() => handleAddCode(lang)}
                    className="w-full text-left px-3 py-1.5 text-sm text-gray-300 hover:bg-gray-800
                               rounded-md transition-colors capitalize"
                  >
                    {lang}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Add Artifact */}
        <button
          onClick={addArtifact}
          className="p-1.5 rounded hover:bg-gray-800 text-gray-400 hover:text-gray-200 transition-colors"
          title="Add artifact to this slide"
        >
          <PaperclipIcon />
        </button>

        {/* Add YouTube Video */}
        {!hasVideo && (
          <div className="relative">
            <button
              onClick={() => { closeAllDropdowns(); setShowAddVideo(!showAddVideo) }}
              className="p-1.5 rounded hover:bg-gray-800 text-gray-400 hover:text-gray-200 transition-colors"
              title="Add YouTube video to this slide"
            >
              <YouTubeIcon />
            </button>
            {showAddVideo && (
              <div className="absolute right-0 top-full mt-2 z-50 bg-gray-900 border border-gray-700 rounded-lg shadow-2xl p-3 w-80">
                <label className="text-xs text-gray-400 block mb-1.5">YouTube URL</label>
                <input
                  type="text"
                  value={videoUrl}
                  onChange={(e) => setVideoUrl(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleAddVideo()}
                  placeholder="https://www.youtube.com/watch?v=..."
                  autoFocus
                  className="w-full px-3 py-2 bg-gray-950 text-white rounded-md border border-gray-700
                             focus:border-indigo-500 focus:outline-none text-sm placeholder-gray-600"
                />
                <div className="flex gap-2 mt-2">
                  <button
                    onClick={handleAddVideo}
                    disabled={!videoUrl.trim()}
                    className="flex-1 py-1.5 bg-red-600 hover:bg-red-500 disabled:opacity-40
                               text-white text-xs font-medium rounded-md transition-colors"
                  >
                    Add Video
                  </button>
                  <button
                    onClick={() => { setShowAddVideo(false); setVideoUrl('') }}
                    className="py-1.5 px-3 bg-gray-800 hover:bg-gray-700 text-gray-400 text-xs rounded-md transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Add Web App */}
        {!hasWebApp && (
          <div className="relative">
            <button
              onClick={() => { closeAllDropdowns(); setShowAddWebApp(!showAddWebApp) }}
              className="p-1.5 rounded hover:bg-gray-800 text-gray-400 hover:text-gray-200 transition-colors"
              title="Embed a web app or URL"
            >
              <GlobeIcon />
            </button>
            {showAddWebApp && (
              <div className="absolute right-0 top-full mt-2 z-50 bg-gray-900 border border-gray-700 rounded-lg shadow-2xl p-3 w-80">
                <label className="text-xs text-gray-400 block mb-1.5">Web App URL</label>
                <input
                  type="text"
                  value={webAppUrl}
                  onChange={(e) => setWebAppUrl(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleAddWebApp()}
                  placeholder="https://localhost:3000 or any URL"
                  autoFocus
                  className="w-full px-3 py-2 bg-gray-950 text-white rounded-md border border-gray-700
                             focus:border-indigo-500 focus:outline-none text-sm placeholder-gray-600"
                />
                <p className="text-[10px] text-gray-600 mt-1">Embed a local dev server, web app, or any website</p>
                <div className="flex gap-2 mt-2">
                  <button
                    onClick={handleAddWebApp}
                    disabled={!webAppUrl.trim()}
                    className="flex-1 py-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40
                               text-white text-xs font-medium rounded-md transition-colors"
                  >
                    Embed
                  </button>
                  <button
                    onClick={() => { setShowAddWebApp(false); setWebAppUrl('') }}
                    className="py-1.5 px-3 bg-gray-800 hover:bg-gray-700 text-gray-400 text-xs rounded-md transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Separator */}
        <div className="w-px h-6 bg-gray-800" />

        {/* Theme toggle */}
        <button
          onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          className="p-1.5 rounded hover:bg-gray-800 text-gray-400 hover:text-gray-200 transition-colors"
          title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
        >
          {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
        </button>

        {/* Notes toggle */}
        <button
          onClick={toggleNotes}
          className={`p-1.5 rounded transition-colors ${
            showNotes ? 'bg-indigo-600 text-white' : 'hover:bg-gray-800 text-gray-400'
          }`}
          title="Toggle speaker notes (N)"
        >
          <NotesIcon />
        </button>

        {/* Present mode */}
        <button
          onClick={togglePresenting}
          className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium
                     rounded-lg transition-colors flex items-center gap-1.5"
          title="Start presentation (F5)"
        >
          <PlayIcon />
          Present
        </button>
      </div>
    </div>
  )
}

function ChevronLeftIcon(): JSX.Element {
  return (
    <svg className="w-4 h-4 text-gray-300" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
    </svg>
  )
}

function ChevronRightIcon(): JSX.Element {
  return (
    <svg className="w-4 h-4 text-gray-300" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
    </svg>
  )
}

function PlayIcon(): JSX.Element {
  return (
    <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
      <path d="M8 5v14l11-7z" />
    </svg>
  )
}

function NotesIcon(): JSX.Element {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
    </svg>
  )
}

function PlusSlideIcon(): JSX.Element {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
    </svg>
  )
}

function CodeIcon(): JSX.Element {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M17.25 6.75 22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3-4.5 16.5" />
    </svg>
  )
}

function EditIcon(): JSX.Element {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0 1 15.75 21H5.25A2.25 2.25 0 0 1 3 18.75V8.25A2.25 2.25 0 0 1 5.25 6H10" />
    </svg>
  )
}

function PaperclipIcon(): JSX.Element {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="m18.375 12.739-7.693 7.693a4.5 4.5 0 0 1-6.364-6.364l10.94-10.94A3 3 0 1 1 19.5 7.372L8.552 18.32m.009-.01-.01.01m5.699-9.941-7.81 7.81a1.5 1.5 0 0 0 2.112 2.13" />
    </svg>
  )
}

function GlobeIcon(): JSX.Element {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9.004 9.004 0 0 0 8.716-6.747M12 21a9.004 9.004 0 0 1-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 0 1 7.843 4.582M12 3a8.997 8.997 0 0 0-7.843 4.582m15.686 0A11.953 11.953 0 0 1 12 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0 1 21 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0 1 12 16.5a17.92 17.92 0 0 1-8.716-2.247m0 0A8.966 8.966 0 0 1 3 12c0-1.97.633-3.794 1.708-5.282" />
    </svg>
  )
}

function SunIcon(): JSX.Element {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v2.25m6.364.386-1.591 1.591M21 12h-2.25m-.386 6.364-1.591-1.591M12 18.75V21m-4.773-4.227-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0Z" />
    </svg>
  )
}

function MoonIcon(): JSX.Element {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M21.752 15.002A9.72 9.72 0 0 1 18 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 0 0 3 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 0 0 9.002-5.998Z" />
    </svg>
  )
}

function YouTubeIcon(): JSX.Element {
  return (
    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
      <path d="M19.615 3.184c-3.604-.246-11.631-.245-15.23 0C.488 3.45.029 5.804 0 12c.029 6.185.484 8.549 4.385 8.816 3.6.245 11.626.246 15.23 0C23.512 20.55 23.971 18.196 24 12c-.029-6.185-.484-8.549-4.385-8.816zM9 16V8l8 3.993L9 16z" />
    </svg>
  )
}
