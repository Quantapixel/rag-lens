/**
 * AnswerCard — the RAG trace view.
 *
 * Shows, top to bottom:
 *   • the synthesised answer
 *   • the pipeline stages with per-stage timing
 *   • the individual passages retrieval surfaced, with similarity scores
 *
 * This is the "lens" part of RAG Lens: you can see not just the answer but
 * exactly which chunks produced it.
 */

import type { QueryResult, Document } from '../types'
import { useState } from 'react'
import { Dot } from './ui'

interface AnswerCardProps {
  result: QueryResult
  documents: Document[]
}

export default function AnswerCard({ result, documents }: AnswerCardProps) {
  const [showTrace, setShowTrace] = useState(true)

  const sourceDocs = result.sourceDocs
    .map((id) => documents.find((d) => d.id === id))
    .filter(Boolean) as Document[]

  const docFor = (id: string) => documents.find((d) => d.id === id)

  return (
    <div
      className="mx-5 mt-4 rounded-xl border overflow-hidden shrink-0 animate-fade-in"
      style={{ backgroundColor: '#0b0b0d', borderColor: '#1e1e22' }}
    >
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div
        className="flex items-center gap-2 flex-wrap px-4 py-2.5 border-b"
        style={{ borderColor: '#1e1e22' }}
      >
        <span
          className="text-[10px] font-medium px-2 py-0.5 rounded-full uppercase tracking-wider"
          style={{ background: 'rgba(255,255,255,0.06)', color: '#d4d4d8' }}
        >
          Synthesis
        </span>
        <span className="text-[11px]" style={{ color: '#71717a' }}>
          {sourceDocs.length} source doc{sourceDocs.length !== 1 ? 's' : ''}
        </span>
        {result.latencyMs !== undefined && (
          <span className="text-[11px] tabular-nums" style={{ color: '#71717a' }}>
            · {result.latencyMs}ms
          </span>
        )}
        <button
          onClick={() => setShowTrace((s) => !s)}
          className="ml-auto text-[11px] px-2 py-0.5 rounded-md transition-colors"
          style={{ color: showTrace ? '#d4d4d8' : '#71717a', background: '#141417' }}
        >
          {showTrace ? 'Hide trace' : 'Show trace'}
        </button>
      </div>

      <div className="max-h-[32vh] overflow-y-auto">
        {/* ── Answer ───────────────────────────────────────────────────── */}
        <div
          className="px-4 py-3 text-[13px] leading-relaxed whitespace-pre-line"
          style={{ color: '#c7c7cd' }}
        >
          {result.answer}
        </div>

        {showTrace && (
          <>
            {/* ── Pipeline stages ──────────────────────────────────────── */}
            {result.steps && result.steps.length > 0 && (
              <div className="px-4 pb-3.5">
                <p
                  className="text-[10px] uppercase tracking-widest mb-2"
                  style={{ color: '#52525b' }}
                >
                  Retrieval pipeline
                </p>
                <div className="flex items-stretch gap-1.5 flex-wrap">
                  {result.steps.map((step, i) => (
                    <div key={step.label} className="flex items-stretch gap-1.5">
                      <div
                        className="rounded-lg px-2.5 py-2 min-w-[110px]"
                        style={{ background: '#141417', border: '1px solid #26262b' }}
                      >
                        <div className="flex items-baseline justify-between gap-3">
                          <span className="text-[11px] font-medium" style={{ color: '#d4d4d8' }}>
                            {step.label}
                          </span>
                          <span
                            className="text-[10px] tabular-nums"
                            style={{ color: '#71717a' }}
                          >
                            {step.ms}ms
                          </span>
                        </div>
                        <div className="text-[10px] mt-0.5" style={{ color: '#52525b' }}>
                          {step.detail}
                        </div>
                      </div>
                      {i < result.steps!.length - 1 && (
                        <span
                          className="self-center text-xs"
                          style={{ color: '#2e2e35' }}
                          aria-hidden
                        >
                          →
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ── Retrieved passages ───────────────────────────────────── */}
            {result.passages && result.passages.length > 0 && (
              <div className="px-4 pb-4">
                <p
                  className="text-[10px] uppercase tracking-widest mb-2"
                  style={{ color: '#52525b' }}
                >
                  Retrieved chunks · {result.passages.length}
                </p>
                <div className="space-y-2">
                  {result.passages.map((p, i) => {
                    const doc = docFor(p.docId)
                    const tone = doc?.color ?? '#a1a1aa'
                    return (
                      <div
                        key={i}
                        className="rounded-lg px-3 py-2 flex gap-3"
                        style={{ background: '#141417', border: '1px solid #26262b' }}
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 mb-1">
                            <Dot color={tone} />
                            <span
                              className="text-[11px] font-medium truncate"
                              style={{ color: '#d4d4d8' }}
                            >
                              {doc?.name ?? p.docId}
                            </span>
                          </div>
                          <p
                            className="text-[11px] leading-relaxed"
                            style={{ color: '#71717a' }}
                          >
                            {p.text}
                          </p>
                        </div>
                        {/* Similarity score */}
                        <div className="w-10 shrink-0 flex flex-col items-end justify-center gap-1">
                          <span
                            className="text-[10px] font-semibold tabular-nums font-mono"
                            style={{ color: '#d4d4d8' }}
                          >
                            {p.score.toFixed(2)}
                          </span>
                          <div
                            className="w-8 h-1 rounded-full overflow-hidden"
                            style={{ background: '#1e1e22' }}
                          >
                            <div
                              className="h-full rounded-full"
                              style={{ width: `${p.score * 100}%`, background: '#d4d4d8' }}
                            />
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </>
        )}

        {/* ── Source document chips ────────────────────────────────────── */}
        {sourceDocs.length > 0 && (
          <div
            className="flex flex-wrap gap-3 px-4 py-3 border-t"
            style={{ borderColor: '#1e1e22' }}
          >
            {sourceDocs.map((doc) => (
              <div key={doc.id} className="flex items-center gap-1.5">
                <Dot color={doc.color} />
                <span className="text-[11px]" style={{ color: '#a1a1aa' }}>
                  {doc.name}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
