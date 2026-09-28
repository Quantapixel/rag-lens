/**
 * Corpus relationship graph.
 *
 * Live mode derives edges from the real embeddings: for every pair of indexed
 * documents we find their closest chunk pair and use that cosine similarity as
 * the edge weight, storing both passages so the link can be explained.
 *
 * Offline mode (no key) shows the seeded relationships so the graph isn't
 * empty, and the UI marks them as sample data.
 */

import type { Connection, ApiResponse } from '../types'
import { MOCK_CONNECTIONS } from './mockData'
import { hasApiKey } from './apiKey'
import { getDocuments } from './corpus'
import { topChunkPair, indexedDocumentIds } from './vectorStore'

/** Below this the two documents aren't meaningfully related. */
const MIN_SIMILARITY = 0.55

/** Trim a passage down to something that fits in a side panel. */
function shorten(text: string, max = 110): string {
  const clean = text.replace(/\s+/g, ' ').trim()
  return clean.length > max ? clean.slice(0, max).trimEnd() + '…' : clean
}

function deriveConnections(): Connection[] {
  const ids = indexedDocumentIds()
  const out: Connection[] = []

  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      const match = topChunkPair(ids[i], ids[j])
      if (!match || match.score < MIN_SIMILARITY) continue

      out.push({
        from: ids[i],
        to: ids[j],
        strength: Number(match.score.toFixed(3)),
        // Every derived edge is semantic similarity by construction.
        type: 'semantic',
        snippet: `Closest passages share ${Math.round(match.score * 100)}% similarity: “${shorten(match.fromText, 90)}” ↔ “${shorten(match.toText, 90)}”`,
      })
    }
  }

  return out.sort((a, b) => b.strength - a.strength)
}

/**
 * Fetch the corpus graph.
 *
 * Falls back to the seeded edges when the real ones can't be computed yet
 * (no API key, or indexing hasn't run), so the graph is never blank.
 */
export async function listConnections(): Promise<ApiResponse<Connection[]>> {
  if (hasApiKey() && indexedDocumentIds().length > 1) {
    return { data: deriveConnections() }
  }
  return { data: MOCK_CONNECTIONS }
}

/** Fetch connections involving a specific document. */
export async function getConnectionsForDocument(
  documentId: string,
): Promise<ApiResponse<Connection[]>> {
  const { data } = await listConnections()
  return {
    data: data.filter((c) => c.from === documentId || c.to === documentId),
  }
}

/** Recompute the graph after indexing completes. */
export function connectionsAreDerived(): boolean {
  return hasApiKey() && indexedDocumentIds().length > 1
}

/** Exposed for the empty-state copy in the UI. */
export function indexedDocCount(): number {
  return getDocuments().filter((d) => d.status === 'indexed').length
}
