/**
 * System status API service.
 *
 * Returns the current health of the backend services (vector DB, embedding
 * pipeline, etc.) so the UI can show live status indicators.
 *
 * Suggested REST endpoint:
 *   GET /api/status  → getSystemStatus()
 */

import type { SystemStatus, ApiResponse } from '../types'
import { MOCK_STATUS } from './mockData'

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/** Poll the backend for system health information */
export async function getSystemStatus(): Promise<ApiResponse<SystemStatus>> {
  await delay(200)

  // ── Real backend: ────────────────────────────────────────────────────────
  // const res = await fetch('/api/status', { credentials: 'include' })
  // if (!res.ok) return { data: { vectorDbOnline: false, totalDocs: 0, totalChunks: 0 } }
  // return { data: await res.json() }
  // ─────────────────────────────────────────────────────────────────────────

  return { data: MOCK_STATUS }
}
