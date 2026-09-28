/**
 * The working document corpus.
 *
 * Starts from the seeded sample documents and grows as files are uploaded.
 * Kept in memory for the session — this is a client-side app with no server,
 * so "ingestion" means: read the text, split it into chunks, embed the chunks,
 * and hold both here.
 */

import type { Document } from '../types'
import { MOCK_DOCUMENTS } from './mockData'

export interface CorpusChunk {
  /** Stable id: `${docId}:${index}` */
  id: string
  docId: string
  text: string
}

interface Entry {
  doc: Document
  chunks: string[]
}

// Seed from the sample corpus. Excerpts double as the initial chunks.
const entries: Entry[] = MOCK_DOCUMENTS.map((doc) => ({
  doc: { ...doc },
  chunks: doc.excerpts ?? [],
}))

let idCounter = 0

export function getDocuments(): Document[] {
  return entries.map((e) => e.doc)
}

export function getDocumentById(id: string): Document | null {
  return entries.find((e) => e.doc.id === id)?.doc ?? null
}

/**
 * Every searchable chunk, in insertion order.
 *
 * Only documents that have finished indexing contribute — a document still
 * being processed must not appear in retrieval results, or "processing" in the
 * sidebar would be a lie.
 */
export function getChunks(): CorpusChunk[] {
  const out: CorpusChunk[] = []
  for (const entry of entries) {
    if (entry.doc.status !== 'indexed') continue
    entry.chunks.forEach((text, i) => {
      out.push({ id: `${entry.doc.id}:${i}`, docId: entry.doc.id, text })
    })
  }
  return out
}

export function totalChunks(): number {
  return getChunks().length
}

/**
 * Split raw text into overlapping chunks.
 *
 * Character-based rather than token-based: it's a decent approximation, needs
 * no tokenizer dependency, and the overlap keeps sentences that straddle a
 * boundary retrievable from either side.
 */
export function chunkText(text: string, size = 800, overlap = 150): string[] {
  const clean = text.replace(/\r\n/g, '\n').replace(/[ \t]+/g, ' ').trim()
  if (!clean) return []
  if (clean.length <= size) return [clean]

  const chunks: string[] = []
  let start = 0
  while (start < clean.length) {
    let end = Math.min(start + size, clean.length)

    // Prefer to break on a paragraph or sentence boundary near the limit.
    if (end < clean.length) {
      const window = clean.slice(start, end)
      const boundary = Math.max(
        window.lastIndexOf('\n\n'),
        window.lastIndexOf('. '),
      )
      if (boundary > size * 0.5) end = start + boundary + 1
    }

    chunks.push(clean.slice(start, end).trim())
    if (end >= clean.length) break
    start = Math.max(end - overlap, start + 1)
  }
  return chunks.filter(Boolean)
}

/** Register a newly ingested document together with its chunked text. */
export function addDocument(
  doc: Omit<Document, 'id'> & { id?: string },
  chunks: string[],
): Document {
  const id = doc.id ?? `doc-upload-${++idCounter}-${Date.now()}`
  const full: Document = {
    ...doc,
    id,
    chunks: chunks.length,
    excerpts: chunks.slice(0, 4),
  }
  entries.push({ doc: full, chunks })
  return full
}

export function updateDocument(id: string, patch: Partial<Document>): void {
  const entry = entries.find((e) => e.doc.id === id)
  if (entry) entry.doc = { ...entry.doc, ...patch }
}

/** Test seam — restores the seeded corpus. */
export function resetCorpus(): void {
  entries.length = 0
  for (const doc of MOCK_DOCUMENTS) {
    entries.push({ doc: { ...doc }, chunks: doc.excerpts ?? [] })
  }
}
