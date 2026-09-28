/**
 * Shared small UI primitives used across multiple components.
 * Kept here to avoid duplication.
 */

import type { ConnectionType, DocumentStatus } from '../types'

/**
 * Edge styling is monochrome: connection types are distinguished by line
 * style and emphasis rather than hue, keeping the graph calm and readable.
 */
export interface EdgeStyle {
  /** Canvas dash pattern — empty array means solid */
  dash: number[]
  /** Relative emphasis, multiplies opacity and width */
  weight: number
}

export const EDGE_STYLES: Record<ConnectionType, EdgeStyle> = {
  semantic: { dash: [],         weight: 1.00 },
  citation: { dash: [7, 3, 1.5, 3], weight: 1.30 },
  entity:   { dash: [5, 4],     weight: 1.00 },
  temporal: { dash: [1.5, 4.5], weight: 1.00 },
}

/** Single neutral colour for every edge in the graph */
export const EDGE_COLOR = '212, 212, 216' // zinc-300, used as an rgb() triple

// ─── Dot ─────────────────────────────────────────────────────────────────────

interface DotProps {
  color: string
  /** Adds a glowing box-shadow to indicate a live/active state */
  pulse?: boolean
}

export function Dot({ color, pulse = false }: DotProps) {
  return (
    <span
      className="inline-block w-2 h-2 rounded-full shrink-0"
      style={{
        backgroundColor: color,
        boxShadow: pulse ? `0 0 5px ${color}` : 'none',
      }}
    />
  )
}

// ─── StatusChip ───────────────────────────────────────────────────────────────

const STATUS_MAP: Record<DocumentStatus, { label: string; color: string }> = {
  indexed:    { label: 'Ready',      color: '#a1a1aa' },
  processing: { label: 'Processing', color: '#c2a24a' },
  queued:     { label: 'Queued',     color: '#52525b' },
  error:      { label: 'Error',      color: '#cf6f6f' },
}

interface StatusChipProps {
  status: DocumentStatus
}

export function StatusChip({ status }: StatusChipProps) {
  const s = STATUS_MAP[status]
  return (
    <span className="text-[10px] font-medium" style={{ color: s.color }}>
      {s.label}
    </span>
  )
}
