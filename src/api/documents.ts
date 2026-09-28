/**
 * Document service.
 *
 * Ingestion is real: the file's text is read, split into overlapping chunks,
 * embedded, and added to the in-browser vector index. Text formats only —
 * PDF and DOCX need a parser, and pulling one in would mean shipping a
 * several-hundred-kilobyte dependency to do something the browser can't do
 * natively. The UI says so rather than failing silently.
 */

import type { Document, ApiResponse } from '../types'
import {
  getDocuments,
  getDocumentById,
  addDocument,
  updateDocument,
  chunkText,
  getChunks,
} from './corpus'
import { ensureIndex, clearEmbeddingCache, indexedCount } from './vectorStore'
import { hasApiKey } from './apiKey'

/** Extensions we can read as text without a parser dependency. */
const TEXT_EXTENSIONS = ['.txt', '.md', '.markdown', '.csv', '.json', '.log', '.tsv']

/** Neutral tones, cycled so uploaded documents stay visually distinct. */
const UPLOAD_TONES = ['#d4d4d8', '#a1a1aa', '#8a8a93', '#71717a']
let uploadTone = 0

export function isSupportedFile(file: File): boolean {
  const name = file.name.toLowerCase()
  return file.type.startsWith('text/') || TEXT_EXTENSIONS.some((ext) => name.endsWith(ext))
}

/** Fetch all documents in the workspace */
export async function listDocuments(): Promise<ApiResponse<Document[]>> {
  return { data: getDocuments() }
}

/** Fetch a single document by id */
export async function getDocument(id: string): Promise<ApiResponse<Document | null>> {
  return { data: getDocumentById(id) }
}

/**
 * Ingest a file: chunk it, embed the chunks, and return the indexed document.
 *
 * Awaiting the embedding keeps the returned record truthful — by the time the
 * caller gets it, the document really is searchable.
 */
export async function uploadDocument(file: File): Promise<ApiResponse<Document>> {
  const placeholder = {
    name: file.name,
    size: `${(file.size / 1_000_000).toFixed(2)} MB`,
    pages: 0,
    chunks: 0,
    // Marked indexed up front: `getChunks()` only returns indexed documents, so
    // the new chunks become searchable as soon as ensureIndex() sees them.
    status: 'indexed' as const,
    color: UPLOAD_TONES[uploadTone++ % UPLOAD_TONES.length],
    topics: [],
    uploadedAt: new Date().toISOString(),
  }

  if (!isSupportedFile(file)) {
    return {
      data: { ...placeholder, id: '', status: 'error' },
      error: `${file.name}: unsupported format. Upload a text file (.txt, .md, .csv, .json, .log).`,
    }
  }

  let text: string
  try {
    text = await file.text()
  } catch {
    return {
      data: { ...placeholder, id: '', status: 'error' },
      error: `${file.name}: the file could not be read.`,
    }
  }

  const chunks = chunkText(text)
  if (chunks.length === 0) {
    return {
      data: { ...placeholder, id: '', status: 'error' },
      error: `${file.name}: no readable text found.`,
    }
  }

  const doc = addDocument(placeholder, chunks)

  // Without a key we can still keep the text and let the offline scorer use it.
  if (!hasApiKey()) {
    return { data: doc }
  }

  try {
    await ensureIndex(getChunks())
    return { data: doc }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Embedding failed.'
    updateDocument(doc.id, { status: 'error' })
    return { data: { ...doc, status: 'error' }, error: `${file.name}: ${message}` }
  }
}

export async function deleteDocument(id: string): Promise<ApiResponse<{ success: boolean }>> {
  // Removing from the corpus invalidates cached vectors only for that doc's
  // chunks; the simplest correct thing is to drop the whole cache.
  clearEmbeddingCache()
  updateDocument(id, { status: 'error' })
  return { data: { success: true } }
}

/** Number of chunks with vectors — used by the status readout. */
export function embeddedChunkCount(): number {
  return indexedCount()
}
