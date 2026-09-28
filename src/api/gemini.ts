/**
 * Minimal Google Gemini REST client.
 *
 * Deliberately dependency-free: it talks to the public v1beta REST API with
 * `fetch`, so there is no SDK to keep in sync and nothing added to the bundle.
 * The free tier covers both endpoints we need — embeddings and text
 * generation — which is why the whole pipeline runs on one key.
 *
 *   POST /models/{model}:embedContent        → one embedding
 *   POST /models/{model}:batchEmbedContents  → many embeddings in one call
 *   POST /models/{model}:generateContent     → chat completion
 *
 * Docs: https://ai.google.dev/api
 */

import { getApiKey } from './apiKey'

const API_BASE = 'https://generativelanguage.googleapis.com/v1beta'

/**
 * Sensible starting points. Google renames models fairly often, so if one of
 * these 404s we fall back to asking the API what it actually supports rather
 * than failing — see resolveModel(). Both can also be pinned via env.
 */
const DEFAULT_EMBED_MODEL = 'gemini-embedding-001'
const DEFAULT_CHAT_MODEL = 'gemini-2.0-flash'

/**
 * Truncated embedding size. 768 of the model's dimensions keeps quality high
 * while making the localStorage embedding cache ~4x smaller.
 */
const EMBED_DIM = 768

export class GeminiError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message)
    this.name = 'GeminiError'
  }
}

export type TaskType = 'RETRIEVAL_DOCUMENT' | 'RETRIEVAL_QUERY'

// ─── Low-level transport ──────────────────────────────────────────────────────

function describeError(status: number, body: unknown): string {
  const message =
    (body as { error?: { message?: string } })?.error?.message ??
    (typeof body === 'string' ? body : '')
  if (status === 400 && /API key not valid/i.test(message)) {
    return 'That API key was rejected. Check it and try again.'
  }
  if (status === 403) return message || 'The API key is not authorised for this model.'
  if (status === 429) return 'Free-tier rate limit reached. Wait a moment and retry.'
  return message || `Gemini API returned HTTP ${status}.`
}

async function post<T>(path: string, body: unknown, key: string): Promise<T> {
  let res: Response
  try {
    res = await fetch(`${API_BASE}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify(body),
    })
  } catch {
    throw new GeminiError('Could not reach the Gemini API. Check your connection.')
  }

  const text = await res.text()
  let json: unknown = {}
  try {
    json = text ? JSON.parse(text) : {}
  } catch {
    json = text
  }

  if (!res.ok) throw new GeminiError(describeError(res.status, json), res.status)
  return json as T
}

async function get<T>(path: string, key: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'x-goog-api-key': key },
  })
  if (!res.ok) throw new GeminiError(describeError(res.status, await res.text()), res.status)
  return (await res.json()) as T
}

// ─── Model resolution ─────────────────────────────────────────────────────────

interface ModelInfo {
  name: string
  supportedGenerationMethods?: string[]
}

const resolved = new Map<'embed' | 'chat', string>()

/**
 * Ask the API which models exist and pick the best fit for a capability.
 * Preference order favours the newest stable families we know about, then
 * anything that advertises the method at all.
 */
async function discoverModel(
  kind: 'embed' | 'chat',
  key: string,
): Promise<string> {
  const { models = [] } = await get<{ models?: ModelInfo[] }>(
    '/models?pageSize=200',
    key,
  )

  const method = kind === 'embed' ? 'embedContent' : 'generateContent'
  const capable = models
    .filter((m) => m.supportedGenerationMethods?.includes(method))
    // Batch embedding is what the corpus indexing uses.
    .filter((m) => (kind === 'embed' ? m.supportedGenerationMethods?.includes('batchEmbedContents') : true))
    .map((m) => m.name.replace(/^models\//, ''))

  if (capable.length === 0) {
    throw new GeminiError(
      `No ${kind === 'embed' ? 'embedding' : 'text'} model is available for this API key.`,
    )
  }

  const preferred =
    kind === 'embed'
      ? capable.find((n) => n.includes('embedding')) ?? capable[0]
      : capable.find((n) => n.includes('flash')) ??
        capable.find((n) => n.includes('pro')) ??
        capable[0]

  return preferred
}

async function resolveModel(kind: 'embed' | 'chat', key: string): Promise<string> {
  const cached = resolved.get(kind)
  if (cached) return cached

  const override =
    kind === 'embed'
      ? import.meta.env.VITE_GEMINI_EMBED_MODEL
      : import.meta.env.VITE_GEMINI_CHAT_MODEL
  if (override) {
    resolved.set(kind, override)
    return override
  }

  const fallback = kind === 'embed' ? DEFAULT_EMBED_MODEL : DEFAULT_CHAT_MODEL
  resolved.set(kind, fallback)

  // Verify it exists; if not, discover a replacement once.
  try {
    await get<ModelInfo>(`/models/${fallback}`, key)
    return fallback
  } catch (err) {
    if (err instanceof GeminiError && err.status === 404) {
      const discovered = await discoverModel(kind, key)
      resolved.set(kind, discovered)
      return discovered
    }
    throw err
  }
}

/** Forget cached model choices — call this after the API key changes. */
export function resetModelCache(): void {
  resolved.clear()
}

// ─── Embeddings ───────────────────────────────────────────────────────────────

interface BatchEmbedResponse {
  embeddings?: { values?: number[] }[]
}

/** Embed up to 100 passages in a single round trip. */
export async function embedTexts(
  texts: string[],
  taskType: TaskType,
): Promise<number[][]> {
  const key = getApiKey()
  if (!key) throw new GeminiError('No API key configured.')
  if (texts.length === 0) return []

  const model = await resolveModel('embed', key)

  const buildBody = (withDim: boolean) => ({
    requests: texts.map((text) => ({
      model: `models/${model}`,
      content: { parts: [{ text }] },
      taskType,
      ...(withDim ? { outputDimensionality: EMBED_DIM } : {}),
    })),
  })

  let json: BatchEmbedResponse
  try {
    json = await post<BatchEmbedResponse>(
      `/models/${model}:batchEmbedContents`,
      buildBody(true),
      key,
    )
  } catch (err) {
    // Older models reject outputDimensionality — retry at full width.
    if (err instanceof GeminiError && err.status === 400) {
      json = await post<BatchEmbedResponse>(
        `/models/${model}:batchEmbedContents`,
        buildBody(false),
        key,
      )
    } else {
      throw err
    }
  }

  const vectors = (json.embeddings ?? []).map((e) => e.values ?? [])
  if (vectors.length !== texts.length || vectors.some((v) => v.length === 0)) {
    throw new GeminiError('The embedding API returned an unexpected response shape.')
  }
  return vectors
}

// ─── Generation ───────────────────────────────────────────────────────────────

interface GenerateResponse {
  candidates?: { content?: { parts?: { text?: string }[] } }[]
}

/** Run a single-turn prompt and return the model's text. */
export async function generate(prompt: string): Promise<string> {
  const key = getApiKey()
  if (!key) throw new GeminiError('No API key configured.')

  const model = await resolveModel('chat', key)
  const json = await post<GenerateResponse>(
    `/models/${model}:generateContent`,
    {
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.2, maxOutputTokens: 1024 },
    },
    key,
  )

  const text = (json.candidates?.[0]?.content?.parts ?? [])
    .map((p) => p.text ?? '')
    .join('')
    .trim()

  if (!text) throw new GeminiError('The model returned an empty response.')
  return text
}

/** Names of the models currently in use, for display in the UI. */
export function activeModels(): { embed?: string; chat?: string } {
  return { embed: resolved.get('embed'), chat: resolved.get('chat') }
}
