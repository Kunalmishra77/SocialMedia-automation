import 'server-only'

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

/** Returns true if any AI provider key is configured. */
export function aiConfigured(): boolean {
  return !!(process.env.OPENAI_API_KEY || process.env.OPENROUTER_API_KEY)
}

function resolveProvider(): { url: string; key: string; defaultModel: string; headers: Record<string, string> } | null {
  const openrouter = process.env.OPENROUTER_API_KEY
  const openai = process.env.OPENAI_API_KEY
  if (openrouter) {
    return {
      url: 'https://openrouter.ai/api/v1/chat/completions',
      key: openrouter,
      defaultModel: process.env.AI_MODEL ?? 'openai/gpt-4o-mini',
      headers: { 'HTTP-Referer': process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000' },
    }
  }
  if (openai) {
    return {
      url: 'https://api.openai.com/v1/chat/completions',
      key: openai,
      defaultModel: process.env.AI_MODEL ?? 'gpt-4o-mini',
      headers: {},
    }
  }
  return null
}

/** Chat completion. Returns the assistant text, or null if unavailable/failed. */
export async function callAI(
  messages: ChatMessage[],
  opts: { model?: string; maxTokens?: number; temperature?: number } = {},
): Promise<string | null> {
  const provider = resolveProvider()
  if (!provider) return null

  try {
    const res = await fetch(provider.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${provider.key}`,
        ...provider.headers,
      },
      body: JSON.stringify({
        model: opts.model ?? provider.defaultModel,
        messages,
        max_tokens: opts.maxTokens ?? 400,
        temperature: opts.temperature ?? 0.6,
      }),
    })
    if (!res.ok) return null
    const data = await res.json()
    return data.choices?.[0]?.message?.content?.trim() ?? null
  } catch {
    return null
  }
}

/** Generate a 1536-dim embedding for text (OpenAI only), or null. */
export async function generateEmbedding(text: string): Promise<number[] | null> {
  const key = process.env.OPENAI_API_KEY
  if (!key) return null
  try {
    const res = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({ model: 'text-embedding-3-small', input: text.slice(0, 8000) }),
    })
    if (!res.ok) return null
    const data = await res.json()
    return data.data?.[0]?.embedding ?? null
  } catch {
    return null
  }
}
