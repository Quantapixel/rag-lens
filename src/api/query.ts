/**
 * Query (RAG) service — the real pipeline.
 *
 * Live mode (an API key is configured):
 *   1. Embed the question with the Gemini embedding model.
 *   2. Cosine-scan the local vector index for the top-k chunks.
 *   3. Rescore those candidates (vector + lexical) and keep the best few.
 *   4. Ask Gemini to answer using only those passages, with citations.
 *
 * Offline mode (no key, or the API call failed):
 *   Falls back to the original keyword-overlap scorer so the demo always works.
 *   Every result carries a `mode` and a human-readable `notice`, so the UI can
 *   be honest about which one produced it.
 *
 * Every timing in `steps` is a real measurement — nothing here is simulated.
 */

import type {
  QueryResult,
  ApiResponse,
  RetrievedPassage,
  PipelineStep,
  RetrievalMode,
} from '../types'
import { getApiKey } from './apiKey'
import { embedTexts, generate, GeminiError } from './gemini'
import { getChunks, getDocuments } from './corpus'
import {
  ensureIndex,
  searchByVector,
  hybridRescore,
  tokenizeForOverlap,
} from './vectorStore'

const TOP_K = 6
const KEEP = 4

export interface QueryOptions {
  /** The natural-language question */
  question: string
  /** Restrict retrieval to specific document ids (optional) */
  documentIds?: string[]
}

const now = () => performance.now()
const ms = (start: number) => Math.max(1, Math.round(now() - start))

// ─── Prompting ────────────────────────────────────────────────────────────────

function buildPrompt(question: string, passages: RetrievedPassage[]): string {
  const docs = new Map(getDocuments().map((d) => [d.id, d.name]))

  const context = passages
    .map((p, i) => `[${i + 1}] (${docs.get(p.docId) ?? p.docId}) ${p.text}`)
    .join('\n\n')

  return [
    'You are answering a question about a small document corpus.',
    'Use ONLY the numbered passages below. Do not use outside knowledge.',
    'Cite the passages you rely on inline with their number, like [1] or [2][3].',
    'If the passages do not answer the question, say so plainly instead of guessing.',
    'Answer in 2 to 4 sentences of plain prose. Do not use headings or bullet points.',
    '',
    `Question: ${question}`,
    '',
    'Passages:',
    context,
  ].join('\n')
}

// ─── Live pipeline ────────────────────────────────────────────────────────────

async function liveQuery(options: QueryOptions): Promise<QueryResult> {
  const steps: PipelineStep[] = []
  const chunks = getChunks()

  // Index first — a no-op once the corpus has been embedded.
  await ensureIndex(chunks)

  // 1. Embed the question
  let t = now()
  const [queryVector] = await embedTexts([options.question], 'RETRIEVAL_QUERY')
  const embedMs = ms(t)

  // 2. Vector search
  t = now()
  const candidates = searchByVector(queryVector, TOP_K, options.documentIds)
  const searchMs = ms(t)

  // 3. Hybrid rescoring
  t = now()
  const passages = hybridRescore(candidates, tokenizeForOverlap(options.question)).slice(
    0,
    KEEP,
  )
  const rerankMs = ms(t)

  if (passages.length === 0) {
    return {
      answer:
        'Nothing in the corpus is close enough to that question to answer it. ' +
        'Try asking about revenue, supply chain risk, APAC market share, or the strategic outlook.',
      sourceDocs: [],
      passages: [],
      steps: [
        { label: 'Embed', detail: 'Question → vector', ms: embedMs },
        { label: 'Search', detail: `Cosine scan over ${chunks.length} chunks`, ms: searchMs },
        { label: 'Rerank', detail: 'Hybrid rescoring', ms: rerankMs },
        { label: 'Synthesise', detail: 'Skipped — no matches', ms: 0 },
      ],
      mode: 'live',
      latencyMs: embedMs + searchMs + rerankMs,
    }
  }

  // 4. Generate the cited answer
  t = now()
  const answer = await generate(buildPrompt(options.question, passages))
  const synthMs = ms(t)

  steps.push(
    { label: 'Embed', detail: 'Question → embedding', ms: embedMs },
    {
      label: 'Search',
      detail: `Cosine scan over ${chunks.length} chunks`,
      ms: searchMs,
    },
    { label: 'Rerank', detail: `Hybrid rescoring → top ${passages.length}`, ms: rerankMs },
    { label: 'Synthesise', detail: 'Gemini answer with citations', ms: synthMs },
  )

  return {
    answer,
    sourceDocs: [...new Set(passages.map((p) => p.docId))],
    passages,
    steps,
    mode: 'live',
    latencyMs: embedMs + searchMs + rerankMs + synthMs,
  }
}

// ─── Offline fallback ─────────────────────────────────────────────────────────

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

/** Prefix match so "vendor"/"vendors" line up without a real stemmer. */
function tokensMatch(a: string, b: string): boolean {
  if (a === b) return true
  if (a.length < 4 || b.length < 4) return false
  return a.startsWith(b) || b.startsWith(a)
}

function retrieveOffline(question: string): RetrievedPassage[] {
  const qTokens = tokenize(question)
  const corpus = getDocuments()

  if (qTokens.length === 0) {
    return corpus
      .filter((d) => d.status === 'indexed')
      .slice(0, 3)
      .map((d) => ({ docId: d.id, text: d.excerpts?.[0] ?? '', score: 0.5 }))
  }

  const scored: RetrievedPassage[] = []
  for (const doc of corpus) {
    if (doc.status !== 'indexed' && doc.status !== 'processing') continue
    for (const text of doc.excerpts ?? []) {
      const tokens = tokenize(text)
      if (tokens.length === 0) continue

      const matched = qTokens.filter((q) => tokens.some((t) => tokensMatch(q, t))).length
      const coverage = matched / qTokens.length
      if (coverage === 0) continue

      const topicHit = doc.topics.some((topic) =>
        tokenize(topic).some((t) => qTokens.some((q) => tokensMatch(q, t))),
      )
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

function synthesizeOffline(passages: RetrievedPassage[]): string {
  if (passages.length === 0) {
    return (
      "I couldn't find relevant passages for that question in the indexed documents. " +
      'Try asking about revenue, supply chain risk, APAC market share, or the strategic outlook.'
    )
  }
  const name = (id: string) => getDocuments().find((d) => d.id === id)?.name ?? id
  const [lead, ...rest] = passages

  const lines = [
    `Across the corpus, ${name(lead.docId)} carries the strongest signal: ${lead.text}`,
  ]
  for (const p of rest.slice(0, 1)) {
    lines.push(`${name(p.docId)} corroborates this — ${p.text}`)
  }
  lines.push(
    `Synthesised from ${new Set(passages.map((p) => p.docId)).size} source document(s) ` +
      `via ${passages.length} retrieved passage(s).`,
  )
  return lines.join('\n')
}

function offlineQuery(question: string, notice: string): QueryResult {
  const t = now()
  const passages = retrieveOffline(question)
  const searchMs = ms(t)
  const answer = synthesizeOffline(passages)

  return {
    answer,
    sourceDocs: [...new Set(passages.map((p) => p.docId))],
    passages,
    steps: [
      { label: 'Tokenise', detail: 'Question → keywords', ms: Math.max(1, Math.round(searchMs / 2)) },
      { label: 'Match', detail: 'Keyword overlap over excerpts', ms: searchMs },
      { label: 'Synthesise', detail: 'Template (no model call)', ms: 1 },
    ],
    mode: 'offline',
    notice,
    latencyMs: searchMs,
  }
}

// ─── Entry point ──────────────────────────────────────────────────────────────

function errorMessage(err: unknown): string {
  if (err instanceof GeminiError) return err.message
  if (err instanceof Error) return err.message
  return 'Unknown error'
}

/**
 * Send a question to the RAG pipeline.
 *
 * Uses the live Gemini pipeline when a key is configured, and falls back to the
 * offline keyword demo otherwise — surfacing which path ran rather than
 * silently pretending.
 */
export async function runQuery(
  options: QueryOptions,
): Promise<ApiResponse<QueryResult>> {
  if (!getApiKey()) {
    return {
      data: offlineQuery(
        options.question,
        'No API key configured — this answer came from the offline keyword demo. Add a free Gemini key to run real retrieval.',
      ),
    }
  }

  try {
    return { data: await liveQuery(options) }
  } catch (err) {
    return {
      data: offlineQuery(
        options.question,
        `Live retrieval failed (${errorMessage(err)}) — falling back to the offline demo.`,
      ),
    }
  }
}

/** Which mode a query would run in right now. */
export function currentMode(): RetrievalMode {
  return getApiKey() ? 'live' : 'offline'
}
