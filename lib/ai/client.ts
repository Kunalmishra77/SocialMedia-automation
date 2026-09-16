import 'server-only'

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

/** Returns true if any AI provider key is configured. */
export function aiConfigured(): boolean {
  return !!(process.env.OPENAI_API_KEY || process.env.OPENROUTER_API_KEY)
}

const AI_TIMEOUT_MS = 30_000

/**
 * fetch() for AI providers with a hard timeout (no more indefinite hangs) and one
 * bounded retry on 429 / 5xx that honours Retry-After (capped). Returns the
 * Response (even non-OK, so callers can inspect status) or null on abort/network.
 */
export async function aiFetch(url: string, init: RequestInit, timeoutMs = AI_TIMEOUT_MS): Promise<Response | null> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), timeoutMs)
    try {
      const res = await fetch(url, { ...init, signal: ctrl.signal })
      if ((res.status === 429 || res.status >= 500) && attempt === 0) {
        const ra = Number(res.headers.get('retry-after'))
        const waitMs = Math.min(Number.isFinite(ra) && ra > 0 ? ra * 1000 : 1500, 5000)
        await new Promise((r) => setTimeout(r, waitMs))
        continue
      }
      return res
    } catch {
      if (attempt === 0) {
        await new Promise((r) => setTimeout(r, 500))
        continue
      }
      return null
    } finally {
      clearTimeout(timer)
    }
  }
  return null
}

interface Provider { url: string; key: string; defaultModel: string; headers: Record<string, string>; isOpenRouter: boolean }

/**
 * All configured chat providers, in preference order. Returning a LIST (not one)
 * means a dead/credit-exhausted OpenRouter key no longer silently kills every
 * reply: callAI falls through to OpenAI. This matters because embeddings + images
 * use OpenAI directly, so an OpenRouter-only chat path can fail while everything
 * else "looks fine".
 */
function resolveProviders(): Provider[] {
  const list: Provider[] = []
  const openrouter = process.env.OPENROUTER_API_KEY
  const openai = process.env.OPENAI_API_KEY
  if (openrouter) list.push({
    url: 'https://openrouter.ai/api/v1/chat/completions', key: openrouter,
    defaultModel: process.env.AI_MODEL ?? 'openai/gpt-4o-mini',
    headers: { 'HTTP-Referer': process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000' },
    isOpenRouter: true,
  })
  if (openai) list.push({
    url: 'https://api.openai.com/v1/chat/completions', key: openai,
    defaultModel: process.env.AI_MODEL ?? 'gpt-4o-mini',
    headers: {}, isOpenRouter: false,
  })
  return list
}

function resolveProvider(): Provider | null {
  return resolveProviders()[0] ?? null
}

/** OpenRouter free-tier fallbacks tried in order when the primary model fails. */
const OPENROUTER_FALLBACKS = [
  'openai/gpt-4o-mini',
  'google/gemini-2.0-flash-exp:free',
  'meta-llama/llama-3.3-70b-instruct:free',
  'google/gemma-2-9b-it:free',
]

/**
 * Chat completion with multi-model fallback (AI router). Tries the primary
 * model, then provider fallbacks, until one responds. Returns null if all fail.
 */
export async function callAI(
  messages: ChatMessage[],
  opts: { model?: string; maxTokens?: number; temperature?: number } = {},
): Promise<string | null> {
  const providers = resolveProviders()
  if (providers.length === 0) return null

  for (const provider of providers) {
    // On OpenRouter, a bare OpenAI model id (e.g. "gpt-4o") isn't valid, so drop
    // the override there and rely on the provider fallbacks; on OpenAI use it as-is.
    const primary = provider.isOpenRouter
      ? (opts.model?.includes('/') ? opts.model : provider.defaultModel)
      : (opts.model ?? provider.defaultModel)
    const models = [primary, ...(provider.isOpenRouter ? OPENROUTER_FALLBACKS : [])].filter(
      (m, i, a) => m && a.indexOf(m) === i,
    ) as string[]

    for (const model of models) {
      try {
        const res = await aiFetch(provider.url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${provider.key}`,
            ...provider.headers,
          },
          body: JSON.stringify({
            model,
            messages,
            max_tokens: opts.maxTokens ?? 400,
            temperature: opts.temperature ?? 0.6,
          }),
        })
        if (!res || !res.ok) continue
        const data = await res.json()
        const content = data.choices?.[0]?.message?.content?.trim()
        if (content) return content
      } catch {
        /* try next model / provider */
      }
    }
  }
  return null
}

/** Vision: describe an image via a multimodal model. Returns text or null. */
export async function callVision(imageUrl: string, prompt: string): Promise<string | null> {
  const provider = resolveProvider()
  if (!provider || !imageUrl) return null
  const isOpenRouter = provider.url.includes('openrouter')
  const model = isOpenRouter ? 'openai/gpt-4o-mini' : 'gpt-4o-mini'
  try {
    const res = await aiFetch(provider.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${provider.key}`, ...provider.headers },
      body: JSON.stringify({
        model,
        max_tokens: 500,
        messages: [{ role: 'user', content: [{ type: 'text', text: prompt }, { type: 'image_url', image_url: { url: imageUrl } }] }],
      }),
    })
    if (!res || !res.ok) return null
    const data = await res.json()
    return data.choices?.[0]?.message?.content?.trim() ?? null
  } catch {
    return null
  }
}

/** Generate a 1536-dim embedding for text (OpenAI only), or null. */
export async function generateEmbedding(text: string): Promise<number[] | null> {
  const [first] = await generateEmbeddings([text])
  return first ?? null
}

/**
 * Batch embeddings in ONE request (the /embeddings endpoint accepts an array).
 * Returns one vector per input (null for any that failed). Far fewer round-trips
 * than one call per chunk — critical for document ingestion.
 */
export async function generateEmbeddings(texts: string[]): Promise<(number[] | null)[]> {
  const key = process.env.OPENAI_API_KEY
  if (!key || texts.length === 0) return texts.map(() => null)
  try {
    const res = await aiFetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({ model: 'text-embedding-3-small', input: texts.map((t) => t.slice(0, 8000)) }),
    })
    if (!res || !res.ok) return texts.map(() => null)
    const data = await res.json()
    const out: (number[] | null)[] = texts.map(() => null)
    for (const row of data.data ?? []) {
      if (typeof row.index === 'number' && Array.isArray(row.embedding)) out[row.index] = row.embedding
    }
    return out
  } catch {
    return texts.map(() => null)
  }
}
