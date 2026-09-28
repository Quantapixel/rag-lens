/**
 * ConnectionPanel — right panel tab showing all connections for the selected document.
 *
 * Each card displays the connected document's name, connection type, strength
 * (as a progress bar), and the explanatory snippet. Clicking a card selects
 * that document in the graph.
 */

import type { Document, Connection } from '../types'
import { Dot, EDGE_STYLES } from './ui'

interface ConnectionPanelProps {
  activeDoc: Document
  connections: Connection[]
  allDocuments: Document[]
  onSelectDoc: (id: string) => void
}

export default function ConnectionPanel({
  activeDoc,
  connections,
  allDocuments,
  onSelectDoc,
}: ConnectionPanelProps) {
  // Filter connections that involve the active document
  const activeConnections = connections.filter(
    (c) => c.from === activeDoc.id || c.to === activeDoc.id,
  )

  if (activeConnections.length === 0) {
    return (
      <p className="text-xs text-center py-10" style={{ color: '#52525b' }}>
        No connections found
      </p>
    )
  }

  return (
    <div className="space-y-3">
      {activeConnections.map((conn, index) => {
        // The "other" document is whichever end of the connection isn't the active doc
        const otherId = conn.from === activeDoc.id ? conn.to : conn.from
        const other = allDocuments.find((d) => d.id === otherId)
        if (!other) return null

        const edgeStyle = EDGE_STYLES[conn.type]

        return (
          <button
            key={index}
            className="w-full text-left rounded-xl p-4 transition-all hover:border-white/10"
            style={{ backgroundColor: '#111113', border: '1px solid #1e1e22' }}
            onClick={() => onSelectDoc(otherId)}
          >
            {/* Top row: document name + connection type badge */}
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2 min-w-0">
                <Dot color={other.color} />
                <span className="text-xs font-medium truncate" style={{ color: '#e4e4e7' }}>
                  {other.name}
                </span>
              </div>
              <span
                className="flex items-center gap-1.5 text-[10px] font-medium px-2 py-1 rounded-full capitalize shrink-0 ml-2"
                style={{ color: '#a1a1aa', background: 'rgba(255,255,255,0.05)', border: '1px solid #1e1e22' }}
              >
                <svg width="12" height="6">
                  <line
                    x1="0"
                    y1="3"
                    x2="12"
                    y2="3"
                    stroke="#a1a1aa"
                    strokeWidth="1.25"
                    strokeDasharray={edgeStyle.dash.join(' ')}
                  />
                </svg>
                {conn.type}
              </span>
            </div>

            {/* Strength bar */}
            <div className="flex items-center gap-2 mb-3">
              <div
                className="flex-1 h-1 rounded-full overflow-hidden"
                style={{ backgroundColor: '#1e1e22' }}
              >
                <div
                  className="h-full rounded-full"
                  style={{ width: `${conn.strength * 100}%`, backgroundColor: '#d4d4d8' }}
                />
              </div>
              <span className="text-xs font-semibold tabular-nums shrink-0" style={{ color: '#a1a1aa' }}>
                {Math.round(conn.strength * 100)}%
              </span>
            </div>

            {/* Explanatory snippet */}
            <p className="text-[11px] leading-relaxed" style={{ color: '#71717a' }}>
              {conn.snippet}
            </p>
          </button>
        )
      })}
    </div>
  )
}
