import 'server-only'

const API = 'https://api.telegram.org'

export interface TelegramBotInfo {
  id: number
  username: string
  first_name: string
}

/** Verify a bot token and return the bot's identity. */
export async function getTelegramMe(token: string): Promise<TelegramBotInfo | null> {
  try {
    const res = await fetch(`${API}/bot${token}/getMe`)
    const data = await res.json()
    if (!data.ok) return null
    return { id: data.result.id, username: data.result.username, first_name: data.result.first_name }
  } catch {
    return null
  }
}

/** Send a text message to a Telegram chat. */
export async function sendTelegramMessage(
  token: string,
  chatId: string,
  text: string,
): Promise<{ ok: boolean; messageId?: number; error?: string }> {
  try {
    const res = await fetch(`${API}/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text }),
    })
    const data = await res.json()
    if (!data.ok) return { ok: false, error: data.description }
    return { ok: true, messageId: data.result.message_id }
  } catch (e) {
    return { ok: false, error: String(e) }
  }
}

/** Register the webhook URL with Telegram (called on connect). */
export async function setTelegramWebhook(
  token: string,
  url: string,
  secret: string,
): Promise<boolean> {
  try {
    const res = await fetch(`${API}/bot${token}/setWebhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, secret_token: secret, allowed_updates: ['message'] }),
    })
    const data = await res.json()
    return !!data.ok
  } catch {
    return false
  }
}
