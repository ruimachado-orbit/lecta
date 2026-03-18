import { useState } from 'react'
import type { ArtifactConfig } from '../../../../../packages/shared/src/types/presentation'
import { ArtifactViewer } from './ArtifactViewer'
import { usePresentationStore } from '../../stores/presentation-store'

interface ArtifactBarProps {
  artifacts: ArtifactConfig[]
}

export function ArtifactBar({ artifacts }: ArtifactBarProps): JSX.Element {
  const [viewingArtifact, setViewingArtifact] = useState<ArtifactConfig | null>(null)
  const presentation = usePresentationStore((s) => s.presentation)

  if (artifacts.length === 0) return <></>

  const getFullPath = (artifact: ArtifactConfig): string => {
    return `${presentation?.rootPath}/${artifact.path}`
  }

  const getIcon = (path: string): string => {
    if (path.match(/\.pdf$/i)) return 'PDF'
    if (path.match(/\.xlsx?$/i) || path.match(/\.csv$/i)) return 'XLS'
    if (path.match(/\.(png|jpe?g|gif|svg|webp)$/i)) return 'IMG'
    return 'FILE'
  }

  return (
    <>
      <div className="px-4 py-2 bg-gray-900/50 border-t border-gray-800 flex items-center gap-2 flex-wrap">
        <span className="text-[10px] uppercase tracking-wider text-gray-600 mr-1">
          Artifacts
        </span>
        {artifacts.map((artifact, i) => (
          <button
            key={i}
            onClick={() => setViewingArtifact(artifact)}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-gray-800 hover:bg-gray-700
                       text-gray-300 text-xs rounded-md transition-colors border border-gray-700
                       hover:border-gray-600"
          >
            <span className="text-[9px] font-bold text-indigo-400">
              {getIcon(artifact.path)}
            </span>
            {artifact.label}
          </button>
        ))}
      </div>

      {/* Viewer modal */}
      {viewingArtifact && (
        <ArtifactViewer
          artifact={viewingArtifact}
          fullPath={getFullPath(viewingArtifact)}
          onClose={() => setViewingArtifact(null)}
        />
      )}
    </>
  )
}
