/**
 * DocumentList — scrollable list of uploaded documents in the sidebar.
 */

import type { Document } from '../types'
import { Dot, StatusChip } from './ui'

interface DocumentListProps {
  documents: Document[]
  activeDocId: string | null
  onSelectDoc: (id: string | null) => void
}

export default function DocumentList({ documents, activeDocId, onSelectDoc }: DocumentListProps) {
  return (
    <div className="flex-1 overflow-y-auto px-3 pb-4 space-y-1">
      {documents.length === 0 && (
        <p className="text-center text-xs py-8" style={{ color: '#52525b' }}>
          No documents yet
        </p>
      )}
      {documents.map((doc) => {
        const isActive = doc.id === activeDocId
        return (
          <button
            key={doc.id}
            onClick={() => onSelectDoc(isActive ? null : doc.id)}
            className="w-full text-left rounded-lg px-3 py-2.5 transition-colors"
            style={{
              backgroundColor: isActive ? 'rgba(255,255,255,0.06)' : 'transparent',
              border: `1px solid ${isActive ? '#2e2e35' : 'transparent'}`,
            }}
          >
            <div className="flex items-center gap-2 mb-1">
              <Dot color={doc.color} />
              <span
                className="text-xs font-medium truncate"
                style={{ color: isActive ? '#fafafa' : '#a1a1aa' }}
              >
                {doc.name}
              </span>
            </div>
            <div className="flex items-center gap-2 pl-4">
              <StatusChip status={doc.status} />
              {doc.status === 'indexed' && (
                <span className="text-[10px]" style={{ color: '#52525b' }}>
                  {doc.pages}p · {doc.chunks} chunks
                </span>
              )}
            </div>
          </button>
        )
      })}
    </div>
  )
}
