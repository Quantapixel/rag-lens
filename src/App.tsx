/**
 * App.tsx — root component. Owns all top-level state and wires the API layer
 * to the UI.
 *
 * There are two ways this runs:
 *   • live    — a Gemini API key is present, so queries use real embeddings,
 *               real cosine retrieval and real LLM synthesis.
 *   • offline — no key, so the bundled keyword demo answers instead. The UI
 *               always says which one produced a result.
 *
 * Retrieval itself happens in the browser: `ensureIndex()` embeds the corpus
 * once, then every query is a local vector scan plus one generation call.
 */

import { useState, useEffect, useCallback, useMemo } from 'react'
import type { Document, Connection, QueryResult, RetrievalMode } from './types'
import {
  listDocuments,
  listConnections,
  uploadDocument,
  runQuery,
  ensureIndex,
  getChunks,
  hasApiKey,
  getStoredKey,
  setStoredKey,
  clearStoredKey,
  resetModelCache,
  clearEmbeddingCache,
  activeModels,
} from './api'

import Sidebar from './components/Sidebar'
import QueryBar from './components/QueryBar'
import AnswerCard from './components/AnswerCard'
import Graph from './components/Graph'
import DocumentDetails from './components/DocumentDetails'
import { Dot } from './components/ui'

// Example questions shown under the query bar. Each one is chosen to light up
// a different part of the document graph.
const SUGGESTIONS = [
  'What drove the margin decline?',
  'How is our APAC market share trending?',
  'How exposed are we to supply chain risk?',
  'What is the plan to de-risk vendors?',
]

export default function App() {
  // ── Remote data ────────────────────────────────────────────────────────────
  const [documents, setDocuments] = useState<Document[]>([])
  const [connections, setConnections] = useState<Connection[]>([])
  const [loadingDocs, setLoadingDocs] = useState(true)

  // ── Retrieval status ───────────────────────────────────────────────────────
  const [mode, setMode] = useState<RetrievalMode>('offline')
  const [indexing, setIndexing] = useState<{ embedded: number; total: number } | null>(null)
  const [indexError, setIndexError] = useState<string | null>(null)

  // ── UI state ───────────────────────────────────────────────────────────────
  const [activeDocId, setActiveDocId] = useState<string | null>(null)

  // ── Query / RAG state ──────────────────────────────────────────────────────
  const [query, setQuery] = useState('')
  const [answer, setAnswer] = useState<QueryResult | null>(null)
  const [thinking, setThinking] = useState(false)

  // ── Upload state ───────────────────────────────────────────────────────────
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)

  // ── Settings popover ───────────────────────────────────────────────────────
  const [showAbout, setShowAbout] = useState(false)
  const [keyDraft, setKeyDraft] = useState('')
  const [savedKey, setSavedKey] = useState('')

  /**
   * Load documents, then (when a key exists) embed the corpus so retrieval and
   * the relationship graph reflect real data. Re-runnable after the key changes.
   */
  const bootstrap = useCallback(async () => {
    setLoadingDocs(true)
    setIndexError(null)

    const [docsRes] = await Promise.all([listDocuments()])
    if (!docsRes.error) {
      setDocuments(docsRes.data)
      const firstIndexed = docsRes.data.find((d) => d.status === 'indexed')
      if (firstIndexed && !activeDocId) setActiveDocId(firstIndexed.id)
    }

    const live = hasApiKey()
    setMode(live ? 'live' : 'offline')

    if (live) {
      setIndexing({ embedded: 0, total: getChunks().length })
      try {
        await ensureIndex(getChunks(), (p) => setIndexing(p))
      } catch (err) {
        setIndexError(err instanceof Error ? err.message : 'Indexing failed.')
      } finally {
        setIndexing(null)
      }
    }

    // Edges are derived from embeddings, so this has to run after indexing.
    const connsRes = await listConnections()
    if (!connsRes.error) setConnections(connsRes.data)

    setLoadingDocs(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    void bootstrap()
    setSavedKey(getStoredKey())
  }, [bootstrap])

  // ── Handlers ───────────────────────────────────────────────────────────────

  const handleUpload = useCallback(
    async (file: File) => {
      setUploading(true)
      setUploadError(null)
      const res = await uploadDocument(file)
      if (res.error) {
        setUploadError(res.error)
      } else {
        setDocuments((prev) => [...prev, res.data])
        // A new document adds chunks; refresh the derived graph if we're live.
        if (hasApiKey()) {
          const conns = await listConnections()
          if (!conns.error) setConnections(conns.data)
        }
      }
      setUploading(false)
    },
    [],
  )

  const runQuestion = useCallback(
    async (question: string) => {
      if (!question.trim() || thinking) return
      setThinking(true)
      setAnswer(null)
      const res = await runQuery({ question })
      if (!res.error || res.data) setAnswer(res.data)
      setThinking(false)
    },
    [thinking],
  )

  const handleQuery = useCallback(() => runQuestion(query), [runQuestion, query])

  const handlePick = useCallback(
    (question: string) => {
      setQuery(question)
      runQuestion(question)
    },
    [runQuestion],
  )

  /** Persist a pasted key and rebuild the index against it. */
  const handleSaveKey = useCallback(async () => {
    const next = keyDraft.trim()
    if (!next) return
    if (next !== getStoredKey()) {
      // A different key may resolve to a different embedding model, so cached
      // vectors could be from the wrong space. Start clean rather than mix them.
      clearEmbeddingCache()
    }
    setStoredKey(next)
    setSavedKey(next)
    resetModelCache()
    setKeyDraft('')
    setAnswer(null)
    await bootstrap()
  }, [keyDraft, bootstrap])

  const handleClearKey = useCallback(async () => {
    clearStoredKey()
    setSavedKey('')
    setKeyDraft('')
    resetModelCache()
    clearEmbeddingCache()
    setAnswer(null)
    await bootstrap()
  }, [bootstrap])

  // Derived values
  const indexedCount = documents.filter((d) => d.status === 'indexed').length
  const activeDoc = documents.find((d) => d.id === activeDocId) ?? null
  const highlightIds = useMemo(() => answer?.sourceDocs ?? [], [answer])
  // Only show legend entries for edge types actually present in the graph.
  const edgeTypes = useMemo(
    () => [...new Set(connections.map((c) => c.type))],
    [connections],
  )
  const models = activeModels()

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div
      className="flex flex-col h-screen overflow-hidden"
      style={{ color: '#f4f4f5', fontFamily: 'Inter, sans-serif' }}
    >
      {/* ── Topbar ────────────────────────────────────────────────────────── */}
      <header
        className="flex items-center justify-between px-6 h-14 shrink-0 border-b"
        style={{ borderColor: '#1e1e22' }}
      >
        {/* Brand */}
        <div className="flex items-center gap-3">
          <div
            className="w-7 h-7 rounded-md flex items-center justify-center text-sm font-semibold"
            style={{ background: '#fafafa', color: '#09090b' }}
          >
            R
          </div>
          <div className="flex items-baseline gap-2.5">
            <span className="font-semibold text-sm tracking-tight" style={{ color: '#ffffff' }}>
              RAG Lens
            </span>
            <span className="text-[11px] hidden lg:inline" style={{ color: '#52525b' }}>
              See inside your AI's knowledge
            </span>
          </div>
        </div>

        {/* Status indicators */}
        <div className="flex items-center gap-5 text-xs" style={{ color: '#71717a' }}>
          <div className="flex items-center gap-1.5">
            <Dot
              color={mode === 'live' ? '#6aa87f' : '#c2a24a'}
              pulse={mode === 'live'}
            />
            <span>
              {indexing
                ? `Indexing ${indexing.embedded}/${indexing.total}`
                : mode === 'live'
                  ? 'Live · Gemini'
                  : 'Offline demo'}
            </span>
          </div>
          {!loadingDocs && (
            <span className="tabular-nums">
              {indexedCount} docs · {getChunks().length} chunks
            </span>
          )}

          <div className="relative">
            <button
              className="px-3 py-1.5 rounded-lg text-xs border transition-colors hover:border-zinc-700 hover:text-zinc-200"
              style={{ borderColor: '#1e1e22', color: '#a1a1aa' }}
              onClick={() => setShowAbout((s) => !s)}
              aria-expanded={showAbout}
            >
              About
            </button>

            {showAbout && (
              <div
                className="absolute right-0 top-9 p-4 rounded-xl border shadow-2xl z-20 text-left animate-fade-in"
                style={{
                  width: '22rem',
                  backgroundColor: '#0d0d0f',
                  borderColor: '#26262b',
                }}
              >
                <p className="text-xs font-semibold mb-2" style={{ color: '#fafafa' }}>
                  What you're looking at
                </p>
                <p className="text-[11px] leading-relaxed mb-3" style={{ color: '#a1a1aa' }}>
                  RAG Lens maps a document corpus as a graph of relationships,
                  then traces every question through the retrieval pipeline —
                  showing the exact chunks an answer was built from.
                </p>
                <div className="space-y-1.5">
                  {[
                    ['Graph', 'Edges from embedding similarity'],
                    ['Trace', 'Real per-stage latency'],
                    ['Highlight', 'Cited documents glow after each query'],
                  ].map(([k, v]) => (
                    <div key={k} className="flex gap-2 text-[11px]">
                      <span className="w-16 shrink-0" style={{ color: '#e4e4e7' }}>{k}</span>
                      <span style={{ color: '#71717a' }}>{v}</span>
                    </div>
                  ))}
                </div>

                {/* ── Retrieval status + API key ───────────────────────────── */}
                <div
                  className="mt-4 pt-4 border-t"
                  style={{ borderColor: '#1e1e22' }}
                >
                  <p className="text-[11px] font-medium mb-2" style={{ color: '#e4e4e7' }}>
                    Retrieval
                  </p>
                  <div className="text-[11px] space-y-1 mb-3">
                    <div className="flex gap-2">
                      <span className="w-16 shrink-0" style={{ color: '#52525b' }}>Mode</span>
                      <span style={{ color: mode === 'live' ? '#6aa87f' : '#c2a24a' }}>
                        {mode === 'live' ? 'Live · Gemini API' : 'Offline demo'}
                      </span>
                    </div>
                    {mode === 'live' && (
                      <>
                        <div className="flex gap-2">
                          <span className="w-16 shrink-0" style={{ color: '#52525b' }}>Embed</span>
                          <span style={{ color: '#a1a1aa' }}>{models.embed ?? 'resolving…'}</span>
                        </div>
                        <div className="flex gap-2">
                          <span className="w-16 shrink-0" style={{ color: '#52525b' }}>Chat</span>
                          <span style={{ color: '#a1a1aa' }}>{models.chat ?? 'resolving…'}</span>
                        </div>
                      </>
                    )}
                  </div>

                  {indexError && (
                    <p
                      className="text-[10px] mb-2 px-2 py-1.5 rounded"
                      style={{ color: '#cf6f6f', background: 'rgba(207,111,111,0.08)' }}
                    >
                      {indexError}
                    </p>
                  )}

                  {savedKey ? (
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-mono" style={{ color: '#52525b' }}>
                        ••••{savedKey.slice(-4)}
                      </span>
                      <button
                        onClick={handleClearKey}
                        className="ml-auto text-[11px] px-2 py-1 rounded-md border transition-colors hover:border-zinc-700"
                        style={{ borderColor: '#1e1e22', color: '#a1a1aa' }}
                      >
                        Disconnect
                      </button>
                    </div>
                  ) : (
                    <>
                      <label className="text-[10px] block mb-1.5" style={{ color: '#71717a' }}>
                        Paste a free Gemini API key to run real retrieval
                      </label>
                      <div className="flex items-center gap-2">
                        <input
                          type="password"
                          value={keyDraft}
                          onChange={(e) => setKeyDraft(e.target.value)}
                          onKeyDown={(e) => e.key === 'Enter' && handleSaveKey()}
                          placeholder="AIza…"
                          className="flex-1 min-w-0 text-[11px] px-2 py-1.5 rounded-md outline-none"
                          style={{
                            background: '#141417',
                            border: '1px solid #26262b',
                            color: '#e4e4e7',
                            fontFamily: 'JetBrains Mono, monospace',
                          }}
                        />
                        <button
                          onClick={handleSaveKey}
                          disabled={!keyDraft.trim()}
                          className="text-[11px] px-2.5 py-1.5 rounded-md font-medium shrink-0"
                          style={{
                            background: keyDraft.trim() ? '#fafafa' : '#1a1a1e',
                            color: keyDraft.trim() ? '#09090b' : '#71717a',
                            cursor: keyDraft.trim() ? 'pointer' : 'not-allowed',
                          }}
                        >
                          Connect
                        </button>
                      </div>
                    </>
                  )}

                  <p className="text-[10px] mt-2.5 leading-relaxed" style={{ color: '#52525b' }}>
                    The key is stored only in this browser and never committed to
                    the repo. Get one free at{' '}
                    <a
                      href="https://aistudio.google.com/apikey"
                      target="_blank"
                      rel="noreferrer noopener"
                      style={{ color: '#a1a1aa', textDecoration: 'underline' }}
                    >
                      aistudio.google.com/apikey
                    </a>
                    .
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* ── Body ──────────────────────────────────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden">
        <Sidebar
          documents={documents}
          activeDocId={activeDocId}
          uploading={uploading}
          edgeTypes={edgeTypes}
          uploadError={uploadError}
          onUpload={handleUpload}
          onSelectDoc={setActiveDocId}
        />

        <main className="flex-1 flex flex-col overflow-hidden">
          <QueryBar
            value={query}
            thinking={thinking}
            onChange={setQuery}
            onSubmit={handleQuery}
            suggestions={SUGGESTIONS}
            onPick={handlePick}
          />

          {answer && <AnswerCard result={answer} documents={documents} />}

          <div className="flex-1 relative overflow-hidden">
            <div className="absolute inset-0">
              <Graph
                docs={documents}
                connections={connections}
                activeDocId={activeDocId}
                onSelectDoc={setActiveDocId}
                highlightIds={highlightIds}
              />
            </div>

            <div
              className="absolute top-4 left-4 text-[11px] tabular-nums"
              style={{ color: '#3f3f46' }}
            >
              {documents.length} nodes · {connections.length} edges
            </div>

            {!loadingDocs && (
              <div
                className="absolute bottom-5 left-1/2 -translate-x-1/2 text-[11px] px-4 py-2 rounded-full border whitespace-nowrap"
                style={{ backgroundColor: '#0d0d0f', borderColor: '#1e1e22', color: '#a1a1aa' }}
              >
                {answer
                  ? `${highlightIds.length} cited document${highlightIds.length !== 1 ? 's' : ''} highlighted · drag nodes to rearrange`
                  : 'Drag nodes to rearrange · ask a question to trace retrieval'}
              </div>
            )}

            {loadingDocs && (
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-xs animate-pulse" style={{ color: '#52525b' }}>
                  Loading documents…
                </span>
              </div>
            )}
          </div>
        </main>

        <DocumentDetails
          activeDoc={activeDoc}
          connections={connections}
          allDocuments={documents}
          onSelectDoc={setActiveDocId}
        />
      </div>
    </div>
  )
}
