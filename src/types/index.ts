// ─── Document types ───────────────────────────────────────────────────────────

export type DocumentStatus = 'indexed' | 'processing' | 'queued' | 'error'

export interface Document {
  id: string
  name: string
  /** Human-readable size, e.g. "2.4 MB" */
  size: string
  pages: number
  /** Number of text chunks stored in the vector DB */
  chunks: number
  status: DocumentStatus
  /** Hex color used to visually distinguish the doc in the graph */
  color: string
  /** Extracted topics/keywords from the document */
  topics: string[]
  /**
   * Representative passages from the document. The mock retrieval layer
   * keyword-matches against these to produce realistic citations.
   */
  excerpts?: string[]
  /** ISO timestamp of when the document was uploaded */
  uploadedAt?: string
}

// ─── Connection types ─────────────────────────────────────────────────────────

export type ConnectionType = 'semantic' | 'citation' | 'entity' | 'temporal'

export interface Connection {
  from: string  // document id
  to: string    // document id
  /** Similarity score between 0 and 1 */
  strength: number
  type: ConnectionType
  /** Short excerpt explaining why these two documents are connected */
  snippet: string
}

// ─── Query / RAG types ────────────────────────────────────────────────────────

export interface QueryResult {
  answer: string
  /** Which document ids were actually used to produce this answer */
  sourceDocs: string[]
  /** How many milliseconds the query took on the backend */
  latencyMs?: number
  /** The individual passages retrieval surfaced, ranked by relevance */
  passages?: RetrievedPassage[]
  /** Timing breakdown of the RAG pipeline stages */
  steps?: PipelineStep[]
}

/** A single chunk that semantic search pulled back from the vector DB */
export interface RetrievedPassage {
  docId: string
  text: string
  /** Cosine similarity between the query embedding and the chunk, 0–1 */
  score: number
}

/** One stage in the retrieval → synthesis pipeline, for the trace view */
export interface PipelineStep {
  label: string
  detail: string
  ms: number
}

// ─── Upload types ─────────────────────────────────────────────────────────────

export interface UploadProgress {
  file: File
  /** 0-100 */
  progress: number
  status: 'pending' | 'uploading' | 'done' | 'error'
  error?: string
}

// ─── System status ────────────────────────────────────────────────────────────

export interface SystemStatus {
  vectorDbOnline: boolean
  totalDocs: number
  totalChunks: number
}

// ─── API response wrappers ────────────────────────────────────────────────────

/** Generic wrapper so every API call has a consistent shape */
export interface ApiResponse<T> {
  data: T
  error?: string
}
