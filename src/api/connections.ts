/**
 * Connections API service.
 *
 * Connections represent detected relationships between documents (semantic
 * similarity, shared entities, citations, temporal overlap).
 *
 * To connect a real backend, replace the stub bodies with fetch() calls.
 *
 * Suggested REST endpoints:
 *   GET /api/connections              → listConnections()
 *   GET /api/connections/:documentId  → getConnectionsForDocument()
 */

import type { Connection, ApiResponse } from '../types'
import { MOCK_CONNECTIONS } from './mockData'

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/** Fetch all connections across all documents */
export async function listConnections(): Promise<ApiResponse<Connection[]>> {
  await delay(400)

  // ── Real backend: ────────────────────────────────────────────────────────
  // const res = await fetch('/api/connections', { credentials: 'include' })
  // if (!res.ok) return { data: [], error: await res.text() }
  // return { data: await res.json() }
  // ─────────────────────────────────────────────────────────────────────────

  return { data: MOCK_CONNECTIONS }
}

/**
 * Fetch all connections that involve a specific document.
 * The backend can do this filtering server-side for efficiency.
 */
export async function getConnectionsForDocument(
  documentId: string,
): Promise<ApiResponse<Connection[]>> {
  await delay(250)

  // ── Real backend: ────────────────────────────────────────────────────────
  // const res = await fetch(`/api/connections/${documentId}`, { credentials: 'include' })
  // if (!res.ok) return { data: [], error: await res.text() }
  // return { data: await res.json() }
  // ─────────────────────────────────────────────────────────────────────────

  const filtered = MOCK_CONNECTIONS.filter(
    (c) => c.from === documentId || c.to === documentId,
  )
  return { data: filtered }
}
