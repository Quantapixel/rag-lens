/**
 * System status.
 *
 * There is no server to poll — the vector index and the model client both live
 * in this tab, so status is derived from real local state: whether a key is
 * configured, and how many chunks actually hold vectors.
 */

import type { SystemStatus, ApiResponse } from '../types'
import { hasApiKey, keySource } from './apiKey'
import { getDocuments, totalChunks } from './corpus'
import { indexedCount } from './vectorStore'

export interface DetailedStatus extends SystemStatus {
  /** Chunks that currently have an embedding in the local index */
  embeddedChunks: number
  /** Where the active API key came from */
  keySource: 'runtime' | 'env' | 'none'
}

export async function getSystemStatus(): Promise<ApiResponse<DetailedStatus>> {
  const live = hasApiKey()
  const docs = getDocuments()

  return {
    data: {
      // "online" means real retrieval is available, not that a socket is open.
      vectorDbOnline: live,
      mode: live ? 'live' : 'offline',
      totalDocs: docs.filter((d) => d.status === 'indexed').length,
      totalChunks: totalChunks(),
      embeddedChunks: indexedCount(),
      keySource: keySource(),
    },
  }
}
