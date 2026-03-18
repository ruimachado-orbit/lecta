import { usePresentationStore } from '../../stores/presentation-store'
import type { VideoConfig } from '../../../../../packages/shared/src/types/presentation'

interface VideoPanelProps {
  video: VideoConfig
}

function getYouTubeEmbedUrl(url: string): string | null {
  // Handle all YouTube URL formats including /live/, /shorts/, query params, etc.
  const patterns = [
    /(?:youtube\.com\/watch\?v=)([a-zA-Z0-9_-]{11})/,
    /(?:youtu\.be\/)([a-zA-Z0-9_-]{11})/,
    /(?:youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
    /(?:youtube\.com\/live\/)([a-zA-Z0-9_-]{11})/,
    /(?:youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/,
    /(?:youtube\.com\/v\/)([a-zA-Z0-9_-]{11})/
  ]

  for (const pattern of patterns) {
    const match = url.match(pattern)
    if (match) {
      return `https://www.youtube-nocookie.com/embed/${match[1]}`
    }
  }

  // If it's already an embed URL, return as-is
  if (url.includes('youtube.com/embed/') || url.includes('youtube-nocookie.com/embed/')) {
    return url
  }

  return null
}

export function VideoPanel({ video }: VideoPanelProps): JSX.Element {
  const { removeAttachment } = usePresentationStore()
  const embedUrl = getYouTubeEmbedUrl(video.url)

  if (!embedUrl) {
    return (
      <div className="h-full flex flex-col bg-gray-950">
        <div className="h-9 bg-gray-900 border-b border-gray-800 flex items-center px-3">
          <span className="text-gray-500 text-xs font-mono truncate flex-1">
            {video.label || 'Video'}
          </span>
        </div>
        <div className="flex-1 flex items-center justify-center p-4">
          <div className="text-center text-gray-500 text-sm">
            <p className="mb-2">Unsupported video URL</p>
            <a
              href={video.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-white underline hover:text-gray-300"
            >
              Open in browser
            </a>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col bg-gray-950">
      {/* Header */}
      <div className="h-9 bg-gray-900 border-b border-gray-800 flex items-center px-3 gap-2">
        <VideoIcon />
        <span className="text-gray-500 text-xs font-mono truncate flex-1">
          {video.label || 'YouTube Video'}
        </span>
        <a
          href={video.url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-[10px] text-gray-500 hover:text-gray-300 transition-colors"
        >
          Open ↗
        </a>
        <button
          onClick={() => removeAttachment('video')}
          className="p-1 hover:bg-red-600 text-gray-500 hover:text-white rounded transition-colors"
          title="Remove video from slide"
        >
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Video embed */}
      <div className="flex-1 bg-black">
        <iframe
          src={embedUrl}
          className="w-full h-full"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          title={video.label || 'Video'}
        />
      </div>
    </div>
  )
}

function VideoIcon(): JSX.Element {
  return (
    <svg className="w-3.5 h-3.5 text-red-400" fill="currentColor" viewBox="0 0 24 24">
      <path d="M19.615 3.184c-3.604-.246-11.631-.245-15.23 0C.488 3.45.029 5.804 0 12c.029 6.185.484 8.549 4.385 8.816 3.6.245 11.626.246 15.23 0C23.512 20.55 23.971 18.196 24 12c-.029-6.185-.484-8.549-4.385-8.816zM9 16V8l8 3.993L9 16z" />
    </svg>
  )
}
