/**
 * App.tsx — root component, owns all top-level state and wires the API layer
 * to the UI components.
 *
 * State flow:
 *   • documents / connections / systemStatus  — fetched on mount via the API layer
 *   • activeDocId                             — which document is selected in the graph
 *   • queryState                              — current question + RAG answer
 *   • uploadQueue                             — files being uploaded
 *
 * To replace mock data with a real backend, only the src/api/ files need
 * to change. All component interfaces stay the same.
 */

import { useState, useEffect, useCallback, useMemo } from 'react'
import type { Document, Connection, QueryResult, SystemStatus } from './types'
import {
  listDocuments,
  listConnections,
  getSystemStatus,
  uploadDocument,
  runQuery,
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
  const [documents, setDocuments]   = useState<Document[]>([])
  const [connections, setConnections] = useState<Connection[]>([])
  const [systemStatus, setSystemStatus] = useState<SystemStatus>({
    vectorDbOnline: false,
    totalDocs: 0,
    totalChunks: 0,
  })
  const [loadingDocs, setLoadingDocs] = useState(true)

  // ── UI state ───────────────────────────────────────────────────────────────
  const [activeDocId, setActiveDocId] = useState<string | null>(null)

  // ── Query / RAG state ──────────────────────────────────────────────────────
  const [query, setQuery]       = useState('')
  const [answer, setAnswer]     = useState<QueryResult | null>(null)
  const [thinking, setThinking] = useState(false)

  // ── Upload state ───────────────────────────────────────────────────────────
  const [uploading, setUploading] = useState(false)

  // ── About popover ──────────────────────────────────────────────────────────
  const [showAbout, setShowAbout] = useState(false)

  // ── Initial data load ──────────────────────────────────────────────────────
  useEffect(() => {
    async function loadAll() {
      setLoadingDocs(true)
      const [docsRes, connsRes, statusRes] = await Promise.all([
        listDocuments(),
        listConnections(),
        getSystemStatus(),
      ])
      if (!docsRes.error) setDocuments(docsRes.data)
      if (!connsRes.error) setConnections(connsRes.data)
      if (!statusRes.error) setSystemStatus(statusRes.data)
      // Default to the first indexed document so the graph isn't empty
      const firstIndexed = docsRes.data.find((d) => d.status === 'indexed')
      if (firstIndexed) setActiveDocId(firstIndexed.id)
      setLoadingDocs(false)
    }
    loadAll()
  }, [])

  // ── Handlers ───────────────────────────────────────────────────────────────

  const handleUpload = useCallback(async (file: File) => {
    setUploading(true)
    const res = await uploadDocument(file)
    if (!res.error) {
      // Optimistically add the new document to the list
      setDocuments((prev) => [...prev, res.data])
    }
    setUploading(false)
    // TODO: poll the document's status until it transitions to 'indexed'
    // e.g. setInterval(() => getDocument(res.data.id).then(updateDocInList), 2000)
  }, [])

  const runQuestion = useCallback(async (question: string) => {
    if (!question.trim() || thinking) return
    setThinking(true)
    setAnswer(null)
    const res = await runQuery({ question })
    if (!res.error) setAnswer(res.data)
    setThinking(false)
  }, [thinking])

  const handleQuery = useCallback(() => runQuestion(query), [runQuestion, query])

  // Clicking an example question fills the box and runs it straight away.
  const handlePick = useCallback((question: string) => {
    setQuery(question)
    runQuestion(question)
  }, [runQuestion])

  // Derived values used in the topbar
  const indexedCount = documents.filter((d) => d.status === 'indexed').length
  const totalChunks  = documents.reduce((sum, d) => sum + d.chunks, 0)
  const activeDoc    = documents.find((d) => d.id === activeDocId) ?? null

  // Documents cited by the most recent answer — highlighted in the graph.
  const highlightIds = useMemo(
    () => answer?.sourceDocs ?? [],
    [answer],
  )

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
            <Dot color={systemStatus.vectorDbOnline ? '#6aa87f' : '#cf6f6f'} pulse={systemStatus.vectorDbOnline} />
            <span>Vector DB {systemStatus.vectorDbOnline ? 'online' : 'offline'}</span>
          </div>
          {!loadingDocs && (
            <span className="tabular-nums">{indexedCount} docs · {totalChunks.toLocaleString()} chunks</span>
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

            {/* About popover — explains what the demo does and its data source */}
            {showAbout && (
              <div
                className="absolute right-0 top-9 w-80 p-4 rounded-xl border shadow-2xl z-20 text-left animate-fade-in"
                style={{ backgroundColor: '#0d0d0f', borderColor: '#26262b' }}
              >
                <p className="text-xs font-semibold mb-2" style={{ color: '#fafafa' }}>
                  What you're looking at
                </p>
                <p className="text-[11px] leading-relaxed mb-3" style={{ color: '#a1a1aa' }}>
                  RAG Lens is an observability surface for retrieval-augmented
                  generation. It maps your document corpus as a graph of
                  detected relationships, then traces every question through
                  the retrieval pipeline — showing the exact chunks an answer
                  was built from.
                </p>
                <div className="space-y-1.5">
                  {[
                    ['Graph', 'Semantic, entity, citation & temporal links'],
                    ['Trace', 'Per-stage latency and cited passages'],
                    ['Highlight', 'Cited documents glow after each query'],
                  ].map(([k, v]) => (
                    <div key={k} className="flex gap-2 text-[11px]">
                      <span className="w-16 shrink-0" style={{ color: '#e4e4e7' }}>{k}</span>
                      <span style={{ color: '#71717a' }}>{v}</span>
                    </div>
                  ))}
                </div>
                <p
                  className="text-[10px] mt-3 pt-3 border-t"
                  style={{ borderColor: '#1e1e22', color: '#52525b' }}
                >
                  Demo runs on a mock retrieval layer — swap src/api for a real
                  vector DB with no UI changes.
                </p>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* ── Body ──────────────────────────────────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden">

        {/* Left sidebar */}
        <Sidebar
          documents={documents}
          activeDocId={activeDocId}
          uploading={uploading}
          onUpload={handleUpload}
          onSelectDoc={setActiveDocId}
        />

        {/* Centre column */}
        <main className="flex-1 flex flex-col overflow-hidden">

          {/* Query bar */}
          <QueryBar
            value={query}
            thinking={thinking}
            onChange={setQuery}
            onSubmit={handleQuery}
            suggestions={SUGGESTIONS}
            onPick={handlePick}
          />

          {/* RAG answer — only shown after a successful query */}
          {answer && (
            <AnswerCard result={answer} documents={documents} />
          )}

          {/* Knowledge graph */}
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

            {/* Node / edge counter overlay */}
            <div
              className="absolute top-4 left-4 text-[11px] tabular-nums"
              style={{ color: '#3f3f46' }}
            >
              {documents.length} nodes · {connections.length} edges
            </div>

            {/* Contextual hint — guidance before a query, results after */}
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

            {/* Loading overlay while fetching initial data */}
            {loadingDocs && (
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-xs animate-pulse" style={{ color: '#52525b' }}>
                  Loading documents…
                </span>
              </div>
            )}
          </div>
        </main>

        {/* Right panel */}
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
