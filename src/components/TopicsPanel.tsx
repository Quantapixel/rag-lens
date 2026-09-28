/**
 * TopicsPanel — right panel tab showing extracted topics/keywords for the
 * selected document.
 *
 * Topics are returned by the backend after the chunking + embedding pipeline
 * finishes. For now they come from the mock data.
 */

import type { Document } from '../types'

interface TopicsPanelProps {
  activeDoc: Document
}

export default function TopicsPanel({ activeDoc }: TopicsPanelProps) {
  if (activeDoc.topics.length === 0) {
    return (
      <p className="text-xs text-center py-10" style={{ color: '#52525b' }}>
        {activeDoc.status === 'indexed' ? 'No topics extracted' : 'Not yet indexed'}
      </p>
    )
  }

  return (
    <div className="flex flex-wrap gap-2 pt-1">
      {activeDoc.topics.map((topic) => (
        <span
          key={topic}
          className="text-xs px-3 py-1.5 rounded-full"
          style={{
            backgroundColor: 'rgba(255,255,255,0.04)',
            color: '#d4d4d8',
            border: '1px solid #1e1e22',
          }}
        >
          {topic}
        </span>
      ))}
    </div>
  )
}
