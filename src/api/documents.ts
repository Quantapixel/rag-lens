/**
 * Document API service.
 *
 * Every function here is a stub that returns mock data immediately.
 * To connect a real backend, replace the body of each function with a
 * fetch() call to the appropriate endpoint. The return types stay the same,
 * so nothing else in the app needs to change.
 *
 * Suggested REST endpoints:
 *   GET    /api/documents          → listDocuments()
 *   POST   /api/documents/upload   → uploadDocument()
 *   DELETE /api/documents/:id      → deleteDocument()
 *   GET    /api/documents/:id      → getDocument()
 */

import type { Document, ApiResponse } from '../types'
import { MOCK_DOCUMENTS } from './mockData'

// Simulated network delay so the UI feels realistic during development
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/** Fetch all documents in the workspace */
export async function listDocuments(): Promise<ApiResponse<Document[]>> {
  await delay(400)

  // ── Real backend: ────────────────────────────────────────────────────────
  // const res = await fetch('/api/documents', { credentials: 'include' })
  // if (!res.ok) return { data: [], error: await res.text() }
  // return { data: await res.json() }
  // ─────────────────────────────────────────────────────────────────────────

  return { data: MOCK_DOCUMENTS }
}

/** Fetch a single document by id */
export async function getDocument(id: string): Promise<ApiResponse<Document | null>> {
  await delay(200)

  // ── Real backend: ────────────────────────────────────────────────────────
  // const res = await fetch(`/api/documents/${id}`, { credentials: 'include' })
  // if (!res.ok) return { data: null, error: await res.text() }
  // return { data: await res.json() }
  // ─────────────────────────────────────────────────────────────────────────

  const doc = MOCK_DOCUMENTS.find((d) => d.id === id) ?? null
  return { data: doc }
}

/**
 * Upload a document file.
 *
 * The real endpoint should accept a multipart/form-data body, kick off the
 * chunking + embedding pipeline, and return the new Document record with
 * status 'queued' or 'processing'.
 */
export async function uploadDocument(file: File): Promise<ApiResponse<Document>> {
  await delay(600)

  // ── Real backend: ────────────────────────────────────────────────────────
  // const form = new FormData()
  // form.append('file', file)
  // const res = await fetch('/api/documents/upload', {
  //   method: 'POST',
  //   body: form,
  //   credentials: 'include',
  // })
  // if (!res.ok) return { data: {} as Document, error: await res.text() }
  // return { data: await res.json() }
  // ─────────────────────────────────────────────────────────────────────────

  // Mock: create a placeholder document so the UI reflects the upload
  const newDoc: Document = {
    id: `doc-${Date.now()}`,
    name: file.name,
    size: `${(file.size / 1_000_000).toFixed(1)} MB`,
    pages: 0,
    chunks: 0,
    status: 'queued',
    color: '#a1a1aa',
    topics: [],
    uploadedAt: new Date().toISOString(),
  }
  return { data: newDoc }
}

/** Delete a document and its associated vectors from the DB */
export async function deleteDocument(id: string): Promise<ApiResponse<{ success: boolean }>> {
  await delay(300)

  // ── Real backend: ────────────────────────────────────────────────────────
  // const res = await fetch(`/api/documents/${id}`, {
  //   method: 'DELETE',
  //   credentials: 'include',
  // })
  // if (!res.ok) return { data: { success: false }, error: await res.text() }
  // return { data: { success: true } }
  // ─────────────────────────────────────────────────────────────────────────

  return { data: { success: true } }
}
