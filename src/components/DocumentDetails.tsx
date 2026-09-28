/**
 * DocumentDetails — right sidebar panel shown when a document is selected.
 *
 * Displays the document's name, status, and two tabs:
 *   • Connections — other documents related to this one
 *   • Topics      — extracted keywords/topics
 *
 * Shows a placeholder state when no document is selected.
 */

import { useState } from 'react'
import type { Document, Connection } from '../types'
import { Dot, StatusChip } from './ui'
import ConnectionPanel from './ConnectionPanel'
import TopicsPanel from './TopicsPanel'

type Tab = 'connections' | 'topics'

interface DocumentDetailsProps {
  activeDoc: Document | null
  connections: Connection[]
  allDocuments: Document[]
  onSelectDoc: (id: string) => void
}

export default function DocumentDetails({
  activeDoc,
  connections,
  allDocuments,
  onSelectDoc,
}: DocumentDetailsProps) {
  const [tab, setTab] = useState<Tab>('connections')

  // Count connections for the active document for the stats footer
  const connectionCount = activeDoc
    ? connections.filter((c) => c.from === activeDoc.id || c.to === activeDoc.id).length
    : 0

  if (!activeDoc) {
    return (
      <aside
        className="w-72 shrink-0 flex flex-col border-l"
        style={{ borderColor: '#1e1e22' }}
      >
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center px-8">
            <div className="text-3xl mb-3" style={{ color: '#26262b' }}>⬡</div>
            <p className="text-xs" style={{ color: '#52525b' }}>
              Select a document to see its connections
            </p>
          </div>
        </div>
      </aside>
    )
  }

  return (
    <aside
      className="w-72 shrink-0 flex flex-col border-l"
      style={{ borderColor: '#1e1e22' }}
    >
      {/* Document header */}
      <div className="px-5 pt-5 pb-4 border-b" style={{ borderColor: '#1e1e22' }}>
        <div className="flex items-center gap-2 mb-2">
          <Dot color={activeDoc.color} />
          <span className="text-sm font-semibold truncate" style={{ color: '#fafafa' }}>
            {activeDoc.name}
          </span>
        </div>
        <div className="flex gap-3 text-xs" style={{ color: '#71717a' }}>
          <StatusChip status={activeDoc.status} />
          {activeDoc.status === 'indexed' && (
            <span>
              {activeDoc.pages > 0 ? `${activeDoc.pages} pages · ` : ''}
              {activeDoc.size}
            </span>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b" style={{ borderColor: '#1e1e22' }}>
        {(['connections', 'topics'] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className="flex-1 py-2.5 text-xs font-medium capitalize transition-colors"
            style={{
              color: tab === t ? '#fafafa' : '#71717a',
              borderBottom: `1.5px solid ${tab === t ? '#fafafa' : 'transparent'}`,
            }}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto p-4">
        {tab === 'connections' ? (
          <ConnectionPanel
            activeDoc={activeDoc}
            connections={connections}
            allDocuments={allDocuments}
            onSelectDoc={onSelectDoc}
          />
        ) : (
          <TopicsPanel activeDoc={activeDoc} />
        )}
      </div>

      {/* Stats footer */}
      <div className="border-t grid grid-cols-3" style={{ borderColor: '#1e1e22' }}>
        {[
          { label: 'Links',   value: connectionCount },
          { label: 'Chunks',  value: activeDoc.chunks || '—' },
          { label: 'Topics',  value: activeDoc.topics.length || '—' },
        ].map((stat) => (
          <div
            key={stat.label}
            className="py-4 text-center border-r"
            style={{ borderColor: '#1e1e22' }}
          >
            <div className="text-base font-semibold tabular-nums" style={{ color: '#fafafa' }}>
              {stat.value}
            </div>
            <div className="text-[10px] mt-0.5" style={{ color: '#52525b' }}>
              {stat.label}
            </div>
          </div>
        ))}
      </div>
    </aside>
  )
}
