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
 *
 * ── On picking a model ───────────────────────────────────────────────────────
 * The /models listing cannot be trusted on its own: it happily lists models the
 * key is not actually allowed to call. Google retires models for new users
 * (gemini-2.0-flash and gemini-2.5-flash both 404 with "no longer available to
 * new users" while still appearing in the list), and it renames families
 * regularly. So we build a candidate list and *probe* each one with a real
 * request, caching the first that answers. That costs one or two tiny calls
 * per session and is the difference between working and mysteriously failing.
 */

import { getApiKey } from './apiKey'

const API_BASE = 'https://generativelanguage.googleapis.com/v1beta'

/**
 * Preference order before falling back to whatever the account can access.
 * `-latest` aliases are the real win here: they track Google's current stable
 * model rather than pinning a version that will be retired.
 */
const CHAT_PREFERENCE = [
  'gemini-flash-latest',
  'gemini-flash-lite-latest',
  'gemini-2.5-flash',
]

const EMBED_PREFERENCE = ['gemini-embedding-001', 'text-embedding-004']

/** Cap probing so a bad key fails fast instead of making dozens of calls. */
const MAX_PROBES = 6

/** Statuses worth retrying — transient congestion rather than a bad request. */
const RETRYABLE = new Set([429, 500, 502, 503, 504])
const RETRY_ATTEMPTS = 3

/** Endpoints that share the generateContent surface but aren't chat models. */
const NOT_CHAT = /(tts|image|embedding|transcribe|robotics|lyria|computer-use|deep-research|antigravity|omni|aqa)/i

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
type Kind = 'embed' | 'chat'

// ─── Low-level transport ──────────────────────────────────────────────────────

function describeError(status: number, body: unknown): string {
  const message =
    (body as { error?: { message?: string } })?.error?.message ??
    (typeof body === 'string' ? body : '')

  if (status === 400 && /API key not valid/i.test(message)) {
    return 'That API key was rejected. Check it and try again.'
  }
  if (status === 403) {
    return message || 'This API key is not authorised for that model.'
  }
  if (status === 429) {
    return 'Free-tier rate limit reached. Wait a moment and retry.'
  }
  return message || `Gemini API returned HTTP ${status}.`
}

async function call<T>(
  path: string,
  key: string,
  body?: unknown,
): Promise<T> {
  let res: Response
  try {
    res = await fetch(`${API_BASE}${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: {
        'x-goog-api-key': key,
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
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

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/**
 * Retry transient failures with backoff. Google returns 503 "model is
 * currently experiencing high demand" fairly often on busy models — worth
 * waiting out rather than failing the user's query.
 */
async function callRetrying<T>(
  path: string,
  key: string,
  body?: unknown,
): Promise<T> {
  let lastError: unknown
  for (let attempt = 1; attempt <= RETRY_ATTEMPTS; attempt++) {
    try {
      return await call<T>(path, key, body)
    } catch (err) {
      lastError = err
      const status = err instanceof GeminiError ? err.status : undefined
      if (!status || !RETRYABLE.has(status) || attempt === RETRY_ATTEMPTS) throw err
      await sleep(400 * 2 ** (attempt - 1))
    }
  }
  throw lastError
}

// ─── Model discovery and probing ──────────────────────────────────────────────

interface ModelInfo {
  name: string
  supportedGenerationMethods?: string[]
}

const resolved = new Map<Kind, string>()

/** Rank discovered models so the most sensible fallback is tried first. */
function rankChatModels(names: string[]): string[] {
  const score = (n: string) => {
    let s = 0
    if (/flash/.test(n)) s += 40
    if (/lite/.test(n)) s -= 5
    if (/preview|exp\b|experimental/.test(n)) s -= 20
    if (/pro/.test(n)) s += 10
    // Prefer higher version numbers when present (gemini-3.8 > gemini-2.5).
    const v = n.match(/(\d+)\.(\d+)/)
    if (v) s += Number(v[1]) * 2 + Number(v[2]) * 0.1
    return s
  }
  return [...names].sort((a, b) => score(b) - score(a))
}

async function candidatesFor(kind: Kind, key: string, override?: string): Promise<string[]> {
  const out: string[] = []
  const push = (n?: string) => {
    const clean = n?.replace(/^models\//, '').trim()
    if (clean && !out.includes(clean)) out.push(clean)
  }

  push(override)
  for (const m of kind === 'chat' ? CHAT_PREFERENCE : EMBED_PREFERENCE) push(m)

  try {
    const { models = [] } = await call<{ models?: ModelInfo[] }>(
      '/models?pageSize=200',
      key,
    )
    const method = kind === 'embed' ? 'embedContent' : 'generateContent'
    const usable = models
      .filter((m) => m.supportedGenerationMethods?.includes(method))
      .map((m) => m.name.replace(/^models\//, ''))
      .filter((n) => (kind === 'chat' ? !NOT_CHAT.test(n) : /embedding/.test(n)))

    for (const n of kind === 'chat' ? rankChatModels(usable) : usable) push(n)
  } catch {
    // Listing can fail (permissions, transient) — the preference list still works.
  }

  return out
}

/**
 * Run `fn` against candidate models until one works.
 *
 * The first real call doubles as the capability probe — no wasted round trip.
 * A model that 404s (retired) or keeps returning 5xx (overloaded) is skipped in
 * favour of the next candidate; a 400 or 403 means the key or the request is
 * wrong, which no amount of model switching will fix, so that fails fast.
 * The winner is cached, so subsequent calls go straight to it.
 */
async function withModel<T>(
  kind: Kind,
  fn: (model: string) => Promise<T>,
): Promise<T> {
  const key = getApiKey()
  if (!key) throw new GeminiError('No API key configured.')

  const override =
    kind === 'embed'
      ? import.meta.env.VITE_GEMINI_EMBED_MODEL
      : import.meta.env.VITE_GEMINI_CHAT_MODEL

  const cached = resolved.get(kind)
  const all = await candidatesFor(kind, key, override)
  const order = cached ? [cached, ...all.filter((m) => m !== cached)] : all
  const tried: string[] = []
  let lastError: unknown

  for (const model of order.slice(0, MAX_PROBES)) {
    tried.push(model)
    try {
      const result = await fn(model)
      resolved.set(kind, model)
      return result
    } catch (err) {
      lastError = err
      const status = err instanceof GeminiError ? err.status : undefined
      if (status === 400 || status === 403) throw err
      // Otherwise: retired (404) or overloaded (5xx) — try the next candidate.
    }
  }

  if (lastError instanceof GeminiError) throw lastError
  throw new GeminiError(
    `No usable ${kind === 'chat' ? 'text' : 'embedding'} model for this API key. Tried: ${tried.join(', ')}.`,
  )
}

/** Forget cached model choices — call this after the API key changes. */
export function resetModelCache(): void {
  resolved.clear()
}

/** Models currently in use, for display in the UI. */
export function activeModels(): { embed?: string; chat?: string } {
  return { embed: resolved.get('embed'), chat: resolved.get('chat') }
}

// ─── Embeddings ───────────────────────────────────────────────────────────────

interface BatchEmbedResponse {
  embeddings?: { values?: number[] }[]
}
interface SingleEmbedResponse {
  embedding?: { values?: number[] }
}

const isBadRequest = (err: unknown) => err instanceof GeminiError && err.status === 400

/** Embed a batch of passages in one round trip. */
export async function embedTexts(
  texts: string[],
  taskType: TaskType,
): Promise<number[][]> {
  if (texts.length === 0) return []
  const key = getApiKey()
  if (!key) throw new GeminiError('No API key configured.')

  return withModel('embed', async (model) => {
    const request = (text: string, withDim: boolean) => ({
      model: `models/${model}`,
      content: { parts: [{ text }] },
      taskType,
      ...(withDim ? { outputDimensionality: EMBED_DIM } : {}),
    })

    const batch = async (withDim: boolean): Promise<number[][] | null> => {
      try {
        const json = await callRetrying<BatchEmbedResponse>(
          `/models/${model}:batchEmbedContents`,
          key,
          { requests: texts.map((t) => request(t, withDim)) },
        )
        const vectors = (json.embeddings ?? []).map((e) => e.values ?? [])
        if (vectors.length === texts.length && vectors.every((v) => v.length > 0)) {
          return vectors
        }
        return null
      } catch (err) {
        // Only a rejected-argument error means "try a different shape"; a 5xx
        // has already been retried and should surface.
        if (isBadRequest(err)) return null
        throw err
      }
    }

    // Preferred: one call for the whole batch, truncated dimensions.
    const withDim = await batch(true)
    if (withDim) return withDim

    // Some models reject outputDimensionality — retry at full width.
    const withoutDim = await batch(false)
    if (withoutDim) return withoutDim

    // No batch support at all — one request per passage.
    return Promise.all(
      texts.map(async (text) => {
        const json = await callRetrying<SingleEmbedResponse>(
          `/models/${model}:embedContent`,
          key,
          request(text, true),
        )
        const values = json.embedding?.values ?? []
        if (values.length === 0) {
          throw new GeminiError('The embedding API returned an unexpected response shape.')
        }
        return values
      }),
    )
  })
}

// ─── Generation ───────────────────────────────────────────────────────────────

interface GenerateResponse {
  candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[]
}

/**
 * Run a single-turn prompt and return the model's text.
 *
 * Thinking is explicitly disabled: current Gemini models spend output tokens
 * "thinking" before answering (measured: 103 tokens for a two-word reply),
 * which both adds latency and can truncate a real answer. thinkingBudget: 0
 * removes it entirely. Not every model accepts the field, so a 400 retries
 * without it.
 */
export async function generate(prompt: string): Promise<string> {
  const key = getApiKey()
  if (!key) throw new GeminiError('No API key configured.')

  return withModel('chat', async (model) => {
    const body = (withThinkingConfig: boolean) => ({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.2,
        maxOutputTokens: 2048,
        ...(withThinkingConfig ? { thinkingConfig: { thinkingBudget: 0 } } : {}),
      },
    })

    const ask = (withThinkingConfig: boolean) =>
      callRetrying<GenerateResponse>(
        `/models/${model}:generateContent`,
        key,
        body(withThinkingConfig),
      )

    let json: GenerateResponse
    try {
      json = await ask(true)
    } catch (err) {
      // Lite models reject thinkingConfig outright — retry without it.
      if (isBadRequest(err)) json = await ask(false)
      else throw err
    }

    const text = (json.candidates?.[0]?.content?.parts ?? [])
      .map((p) => p.text ?? '')
      .join('')
      .trim()

    if (!text) throw new GeminiError('The model returned an empty response.')
    return text
  })
}
