/**
 * Query (RAG) API service.
 *
 * The query endpoint sends a natural-language question to the backend, which
 * retrieves relevant chunks from the vector DB, runs them through an LLM, and
 * returns a synthesized answer with source attribution.
 *
 * Suggested REST endpoint:
 *   POST /api/query  → runQuery()
 *
 * Request body: { question: string; documentIds?: string[] }
 * Response:     { answer: string; sourceDocs: string[]; latencyMs: number }
 */

import type { QueryResult, ApiResponse, RetrievedPassage, PipelineStep } from '../types'
import { MOCK_DOCUMENTS } from './mockData'

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

// Stopwords removed before keyword matching so common words don't dominate.
const STOPWORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'of', 'to', 'in', 'on', 'for', 'is', 'are',
  'was', 'were', 'what', 'which', 'who', 'how', 'why', 'when', 'where', 'does',
  'do', 'did', 'with', 'that', 'this', 'it', 'its', 'as', 'at', 'by', 'from',
  'be', 'been', 'has', 'have', 'had', 'we', 'our', 'us', 'their', 'they',
])

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 2 && !STOPWORDS.has(t))
}

/**
 * Loose token match — treats words sharing a 4+ character prefix as equal so
 * "vendor"/"vendors" and "decline"/"declined" line up without a real stemmer.
 */
function tokensMatch(a: string, b: string): boolean {
  if (a === b) return true
  if (a.length < 4 || b.length < 4) return false
  return a.startsWith(b) || b.startsWith(a)
}

/**
 * Mock retrieval: score every passage by keyword overlap with the question
 * (a stand-in for cosine similarity over embeddings) and return the top
 * matches. This keeps the demo responsive — different questions surface
 * different passages.
 */
function retrieve(question: string): RetrievedPassage[] {
  const qTokens = tokenize(question)
  if (qTokens.length === 0) {
    // No usable keywords — fall back to the first passage of each indexed doc.
    return MOCK_DOCUMENTS.filter((d) => d.status === 'indexed')
      .slice(0, 3)
      .map((d) => ({ docId: d.id, text: d.excerpts?.[0] ?? '', score: 0.5 }))
  }

  const scored: RetrievedPassage[] = []
  for (const doc of MOCK_DOCUMENTS) {
    if (doc.status !== 'indexed' && doc.status !== 'processing') continue
    for (const text of doc.excerpts ?? []) {
      const tokens = tokenize(text)
      if (tokens.length === 0) continue
      // How much of the question's vocabulary this passage covers.
      const matched = qTokens.filter((q) =>
        tokens.some((t) => tokensMatch(q, t)),
      ).length
      const coverage = matched / qTokens.length
      if (coverage === 0) continue

      // Topic matches are strong signals, worth a small boost.
      const topicHit = doc.topics.some((topic) => {
        const tt = tokenize(topic)
        return tt.some((t) => qTokens.some((q) => tokensMatch(q, t)))
      })
      // Squash into a believable 0.4–0.97 "cosine similarity" for display.
      const score = Math.min(
        0.97,
        0.4 + coverage * 0.4 + (topicHit ? 0.1 : 0) + 0.08 / Math.sqrt(tokens.length),
      )
      scored.push({ docId: doc.id, text, score })
    }
  }

  scored.sort((a, b) => b.score - a.score)
  return scored.slice(0, 5)
}

/** Compose a synthesised answer from the retrieved passages. */
function synthesize(passages: RetrievedPassage[]): string {
  if (passages.length === 0) {
    return (
      "I couldn't find relevant passages for that question in the indexed documents. " +
      'Try asking about revenue, supply chain risk, APAC market share, or the strategic outlook.'
    )
  }
  const docName = (id: string) => MOCK_DOCUMENTS.find((d) => d.id === id)?.name ?? id
  const lead = passages[0]
  const supporting = passages.slice(1, 2)

  const lines = [
    `Across the corpus, ${docName(lead.docId)} carries the strongest signal: ${lead.text}`,
  ]
  for (const p of supporting) {
    lines.push(`${docName(p.docId)} corroborates this — ${p.text}`)
  }
  lines.push(
    `Synthesised from ${new Set(passages.map((p) => p.docId)).size} source document(s) ` +
      `via ${passages.length} retrieved passage(s).`,
  )
  return lines.join('\n')
}

export interface QueryOptions {
  /** The natural-language question */
  question: string
  /**
   * Optional: restrict retrieval to specific document ids.
   * If omitted, the backend searches across all indexed documents.
   */
  documentIds?: string[]
}

/**
 * Send a question to the RAG pipeline and return a synthesized answer.
 *
 * The mock returns a canned response after a short delay to simulate LLM
 * latency. Replace the body with a real fetch() once the backend exists.
 */
export async function runQuery(options: QueryOptions): Promise<ApiResponse<QueryResult>> {
  const start = Date.now()
  await delay(700)

  // ── Real backend: ────────────────────────────────────────────────────────
  // const res = await fetch('/api/query', {
  //   method: 'POST',
  //   headers: { 'Content-Type': 'application/json' },
  //   credentials: 'include',
  //   body: JSON.stringify({
  //     question: options.question,
  //     documentIds: options.documentIds,
  //   }),
  // })
  // if (!res.ok) return { data: { answer: '', sourceDocs: [] }, error: await res.text() }
  // const json = await res.json()
  // return { data: json }
  // ─────────────────────────────────────────────────────────────────────────

  const passages = retrieve(options.question)
  if (options.documentIds?.length) {
    const allowed = new Set(options.documentIds)
    const filtered = passages.filter((p) => allowed.has(p.docId))
    if (filtered.length) passages.splice(0, passages.length, ...filtered)
  }

  // Build a timing breakdown so the UI can show where the time went.
  const embedMs = 38 + Math.round(Math.random() * 24)
  const searchMs = 12 + Math.round(Math.random() * 10)
  const rerankMs = 9 + Math.round(Math.random() * 8)
  const synthMs = 320 + Math.round(Math.random() * 240)
  const steps: PipelineStep[] = [
    { label: 'Embed',   detail: 'Question → 1536-d vector',       ms: embedMs },
    { label: 'Search',  detail: 'Top-k over 1.2K chunks',         ms: searchMs },
    { label: 'Rerank',  detail: 'Cross-encoder rescoring',        ms: rerankMs },
    { label: 'Synthesise', detail: 'LLM answer with citations',   ms: synthMs },
  ]

  return {
    data: {
      answer: synthesize(passages),
      sourceDocs: Array.from(new Set(passages.map((p) => p.docId))),
      passages,
      steps,
      latencyMs: Date.now() - start,
    },
  }
}
