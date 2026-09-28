/**
 * Sidebar — left panel containing the upload zone, document list, and edge
 * type legend.
 */

import type { Document } from '../types'
import { EDGE_STYLES } from './ui'
import UploadZone from './UploadZone'
import DocumentList from './DocumentList'

interface SidebarProps {
  documents: Document[]
  activeDocId: string | null
  uploading: boolean
  onUpload: (file: File) => void
  onSelectDoc: (id: string | null) => void
}

export default function Sidebar({
  documents,
  activeDocId,
  uploading,
  onUpload,
  onSelectDoc,
}: SidebarProps) {
  return (
    <aside
      className="w-60 shrink-0 flex flex-col border-r"
      style={{ borderColor: '#1e1e22' }}
    >
      {/* Upload zone */}
      <div className="p-4">
        <UploadZone onUpload={onUpload} disabled={uploading} />
      </div>

      {/* Document list */}
      <DocumentList
        documents={documents}
        activeDocId={activeDocId}
        onSelectDoc={onSelectDoc}
      />

      {/* Edge type legend */}
      <div className="border-t px-4 py-4 space-y-2" style={{ borderColor: '#1e1e22' }}>
        <p className="text-[10px] uppercase tracking-widest mb-3" style={{ color: '#52525b' }}>
          Edge type
        </p>
        {(Object.entries(EDGE_STYLES) as [string, { dash: number[] }][]).map(([type, style]) => (
          <div key={type} className="flex items-center gap-2">
            <svg width="16" height="6" className="shrink-0">
              <line
                x1="0"
                y1="3"
                x2="16"
                y2="3"
                stroke="#a1a1aa"
                strokeWidth="1.25"
                strokeDasharray={style.dash.join(' ')}
              />
            </svg>
            <span className="text-[11px] capitalize" style={{ color: '#a1a1aa' }}>
              {type}
            </span>
          </div>
        ))}
      </div>
    </aside>
  )
}
