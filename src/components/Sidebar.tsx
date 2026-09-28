/**
 * Sidebar — left panel containing the upload zone, document list, and edge
 * type legend.
 */

import type { Document, ConnectionType } from '../types'
import { EDGE_STYLES } from './ui'
import UploadZone from './UploadZone'
import DocumentList from './DocumentList'

interface SidebarProps {
  documents: Document[]
  activeDocId: string | null
  uploading: boolean
  /** Edge types present in the graph — the legend only lists what exists */
  edgeTypes?: ConnectionType[]
  /** Message from the most recent failed ingest, if any */
  uploadError?: string | null
  onUpload: (file: File) => void
  onSelectDoc: (id: string | null) => void
}

export default function Sidebar({
  documents,
  activeDocId,
  uploading,
  edgeTypes,
  uploadError = null,
  onUpload,
  onSelectDoc,
}: SidebarProps) {
  // Live mode derives semantic edges only; the offline sample uses all four.
  const legendTypes = edgeTypes ?? (Object.keys(EDGE_STYLES) as ConnectionType[])

  return (
    <aside
      className="w-60 shrink-0 flex flex-col border-r"
      style={{ borderColor: '#1e1e22' }}
    >
      {/* Upload zone */}
      <div className="p-4">
        <UploadZone onUpload={onUpload} disabled={uploading} />
        {uploadError && (
          <p
            className="text-[10px] leading-relaxed mt-2 px-2 py-1.5 rounded-md"
            style={{ color: '#cf6f6f', background: 'rgba(207,111,111,0.08)' }}
          >
            {uploadError}
          </p>
        )}
      </div>

      {/* Document list */}
      <DocumentList
        documents={documents}
        activeDocId={activeDocId}
        onSelectDoc={onSelectDoc}
      />

      {/* Edge type legend */}
      {legendTypes.length > 0 && (
        <div className="border-t px-4 py-4 space-y-2" style={{ borderColor: '#1e1e22' }}>
          <p className="text-[10px] uppercase tracking-widest mb-3" style={{ color: '#52525b' }}>
            {legendTypes.length === 1 ? 'Edge type' : 'Edge types'}
          </p>
          {legendTypes.map((type) => (
            <div key={type} className="flex items-center gap-2">
              <svg width="16" height="6" className="shrink-0">
                <line
                  x1="0"
                  y1="3"
                  x2="16"
                  y2="3"
                  stroke="#a1a1aa"
                  strokeWidth="1.25"
                  strokeDasharray={EDGE_STYLES[type].dash.join(' ')}
                />
              </svg>
              <span className="text-[11px] capitalize" style={{ color: '#a1a1aa' }}>
                {type}
              </span>
            </div>
          ))}
        </div>
      )}
    </aside>
  )
}
