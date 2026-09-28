/**
 * In-browser vector index.
 *
 * Embeds each corpus chunk once, keeps the vectors in memory, and mirrors them
 * to localStorage so reloading the page doesn't re-spend free-tier quota. Query
 * time is then a brute-force cosine scan — plenty for a corpus of this size,
 * and it means retrieval genuinely runs locally with no server.
 *
 * Swap this file for a call to a real vector DB (pgvector, Qdrant, Pinecone)
 * when the corpus outgrows a single page's memory.
 */

import type { RetrievedPassage } from '../types'
import { embedTexts } from './gemini'
import type { CorpusChunk } from './corpus'

const CACHE_KEY = 'raglens.embeddings.v1'
/** Keep the cache from growing without bound on a long-lived browser profile. */
const CACHE_LIMIT = 4000

/** Cheap, stable string hash (djb2) — used as the embedding cache key. */
function hash(text: string): string {
  let h = 5381
  for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) | 0
  return (h >>> 0).toString(36) + ':' + text.length.toString(36)
}

type Cache = Map<string, number[]>

let cache: Cache | null = null

function loadCache(): Cache {
  if (cache) return cache
  cache = new Map()
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as Record<string, number[]>
      for (const [k, v] of Object.entries(parsed)) {
        if (Array.isArray(v) && v.length) cache.set(k, v)
      }
    }
  } catch {
    // Corrupt or unavailable storage — start clean rather than crash.
    cache = new Map()
  }
  return cache
}

let saveTimer: ReturnType<typeof setTimeout> | undefined

function persist(): void {
  clearTimeout(saveTimer)
  // Debounced: indexing can add hundreds of entries in quick succession.
  saveTimer = setTimeout(() => {
    const map = loadCache()
    try {
      let entries = [...map.entries()]
      if (entries.length > CACHE_LIMIT) {
        entries = entries.slice(entries.length - CACHE_LIMIT)
      }
      localStorage.setItem(CACHE_KEY, JSON.stringify(Object.fromEntries(entries)))
    } catch {
      // Quota exceeded — the in-memory cache still works for this session.
    }
  }, 400)
}

/** Trim precision so the serialised cache stays small; retrieval is unaffected. */
function quantise(values: number[]): number[] {
  return values.map((v) => Math.round(v * 1e5) / 1e5)
}

export function clearEmbeddingCache(): void {
  cache = new Map()
  try {
    localStorage.removeItem(CACHE_KEY)
  } catch {
    /* ignore */
  }
}

// ─── Indexing ─────────────────────────────────────────────────────────────────

export interface IndexProgress {
  embedded: number
  total: number
}

// Chunks we've already embedded this session, keyed by chunk id.
let indexed: { hash: string; chunk: CorpusChunk; vector: number[] }[] = []
let indexedSignature = ''

/** Cheap fingerprint of the corpus, so we only re-index when it changes. */
function signature(chunks: CorpusChunk[]): string {
  return `${chunks.length}:${hash(chunks.map((c) => c.id + c.text).join('\u0000'))}`
}

/**
 * Embed any chunks we haven't seen before. Idempotent and safe to call on every
 * query — it short-circuits when the corpus is unchanged.
 */
export async function ensureIndex(
  chunks: CorpusChunk[],
  onProgress?: (p: IndexProgress) => void,
): Promise<void> {
  const sig = signature(chunks)
  if (sig === indexedSignature && indexed.length === chunks.length) return

  const store = loadCache()
  const next: typeof indexed = []
  const missing: { chunk: CorpusChunk; hash: string }[] = []

  for (const chunk of chunks) {
    const key = hash(chunk.text)
    const cached = store.get(key)
    if (cached) next.push({ hash: key, chunk, vector: cached })
    else missing.push({ chunk, hash: key })
  }

  const total = chunks.length
  let done = total - missing.length
  onProgress?.({ embedded: done, total })

  // Batch in groups of 90 (the API caps batchEmbedContents at 100).
  const BATCH = 90
  for (let i = 0; i < missing.length; i += BATCH) {
    const slice = missing.slice(i, i + BATCH)
    const vectors = await embedTexts(
      slice.map((m) => m.chunk.text),
      'RETRIEVAL_DOCUMENT',
    )
    slice.forEach((m, j) => {
      const vector = quantise(vectors[j])
      store.set(m.hash, vector)
      next.push({ hash: m.hash, chunk: m.chunk, vector })
      done += 1
    })
    persist()
    onProgress?.({ embedded: done, total })
  }

  indexed = next
  indexedSignature = sig
}

/** How many chunks currently have vectors. */
export function indexedCount(): number {
  return indexed.length
}

// ─── Search ───────────────────────────────────────────────────────────────────

export function cosineSimilarity(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length)
  let dot = 0
  let na = 0
  let nb = 0
  for (let i = 0; i < n; i++) {
    dot += a[i] * b[i]
    na += a[i] * a[i]
    nb += b[i] * b[i]
  }
  if (na === 0 || nb === 0) return 0
  return dot / (Math.sqrt(na) * Math.sqrt(nb))
}

/** Cosine scan over the indexed chunks, returning the top-k passages. */
export function searchByVector(
  queryVector: number[],
  topK: number,
  documentIds?: string[],
): RetrievedPassage[] {
  const allowed = documentIds?.length ? new Set(documentIds) : null

  return indexed
    .filter((e) => !allowed || allowed.has(e.chunk.docId))
    .map((e) => ({
      docId: e.chunk.docId,
      text: e.chunk.text,
      score: cosineSimilarity(queryVector, e.vector),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)
}

/**
 * Hybrid rescoring: blend vector similarity with the fraction of the question's
 * vocabulary the passage contains. Cheap, but it reliably lifts passages that
 * share the question's exact terms — a poor man's cross-encoder.
 */
export function hybridRescore(
  passages: RetrievedPassage[],
  queryTerms: string[],
  weight = 0.25,
): RetrievedPassage[] {
  if (queryTerms.length === 0) return passages
  const terms = new Set(queryTerms)

  return passages
    .map((p) => {
      const tokens = tokenizeForOverlap(p.text)
      const hits = tokens.filter((t) => terms.has(t)).length
      const lexical = tokens.length ? hits / Math.sqrt(tokens.length) : 0
      const lexicalNorm = Math.min(1, lexical)
      return { ...p, score: p.score * (1 - weight) + lexicalNorm * weight }
    })
    .sort((a, b) => b.score - a.score)
}

export function tokenizeForOverlap(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 2)
}

/** The strongest semantic link between two documents, via their best chunk pair. */
export interface ChunkPairMatch {
  score: number
  /** Passage from the first document */
  fromText: string
  /** Passage from the second document */
  toText: string
}

/**
 * Compare every chunk of one document against every chunk of another and keep
 * the closest pair. O(n·m) but trivially cheap at this corpus size, and it
 * gives a much more meaningful link than comparing document averages.
 */
export function topChunkPair(a: string, b: string): ChunkPairMatch | null {
  const from = indexed.filter((e) => e.chunk.docId === a)
  const to = indexed.filter((e) => e.chunk.docId === b)
  if (!from.length || !to.length) return null

  let best: ChunkPairMatch | null = null
  for (const x of from) {
    for (const y of to) {
      const score = cosineSimilarity(x.vector, y.vector)
      if (!best || score > best.score) {
        best = { score, fromText: x.chunk.text, toText: y.chunk.text }
      }
    }
  }
  return best
}

/** Document ids that currently have at least one embedded chunk. */
export function indexedDocumentIds(): string[] {
  return [...new Set(indexed.map((e) => e.chunk.docId))]
}
