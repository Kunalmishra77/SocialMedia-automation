import 'server-only'

const GRAPH = 'https://graph.facebook.com/v21.0'

export const IG_SCOPES = [
  'instagram_basic',
  'instagram_manage_messages',
  'instagram_manage_comments',
  'pages_show_list',
  'pages_manage_metadata',
  'business_management',
].join(',')

export const IG_CAPS = {
  dm: true, dmAutoReply: true, commentToDm: true, commentReply: true,
  commentLike: true, postScheduling: true, broadcast: true, webhookInbound: true,
  messagingWindow: 24,
}

/** Exchange an OAuth code for a short-lived token. */
export async function exchangeCode(code: string, redirectUri: string): Promise<string | null> {
  const params = new URLSearchParams({
    client_id: process.env.META_APP_ID ?? '',
    client_secret: process.env.META_APP_SECRET ?? '',
    redirect_uri: redirectUri,
    code,
  })
  try {
    const res = await fetch(`${GRAPH}/oauth/access_token?${params.toString()}`)
    const data = await res.json()
    return data.access_token ?? null
  } catch {
    return null
  }
}

/** Upgrade a short-lived token to a long-lived (60-day) token. */
export async function longLivedToken(shortToken: string): Promise<{ token: string; expiresIn: number } | null> {
  const params = new URLSearchParams({
    grant_type: 'fb_exchange_token',
    client_id: process.env.META_APP_ID ?? '',
    client_secret: process.env.META_APP_SECRET ?? '',
    fb_exchange_token: shortToken,
  })
  try {
    const res = await fetch(`${GRAPH}/oauth/access_token?${params.toString()}`)
    const data = await res.json()
    if (!data.access_token) return null
    return { token: data.access_token, expiresIn: data.expires_in ?? 5_184_000 }
  } catch {
    return null
  }
}

/** List the user's pages and their connected IG business accounts. */
export async function getPagesWithIg(token: string): Promise<
  { pageId: string; pageToken: string; igId: string; igUsername: string; name: string }[]
> {
  const out: { pageId: string; pageToken: string; igId: string; igUsername: string; name: string }[] = []
  try {
    const res = await fetch(`${GRAPH}/me/accounts?fields=id,name,access_token&access_token=${token}`)
    const data = await res.json()
    for (const page of data.data ?? []) {
      const igRes = await fetch(
        `${GRAPH}/${page.id}?fields=instagram_business_account{id,username}&access_token=${page.access_token}`,
      )
      const igData = await igRes.json()
      const iba = igData.instagram_business_account
      if (iba) {
        out.push({ pageId: page.id, pageToken: page.access_token, igId: iba.id, igUsername: iba.username, name: page.name })
      }
    }
  } catch {
    /* ignore */
  }
  return out
}

/** Subscribe the page to webhook fields. */
export async function subscribePageWebhooks(pageId: string, pageToken: string): Promise<void> {
  try {
    await fetch(`${GRAPH}/${pageId}/subscribed_apps`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        subscribed_fields: 'messages,messaging_postbacks,comments,mentions,message_reactions',
        access_token: pageToken,
      }),
    })
  } catch {
    /* ignore */
  }
}

/** Send a DM to an IG user via the page token. */
export async function sendInstagramDM(
  pageToken: string,
  recipientIgsid: string,
  text: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch(`${GRAPH}/me/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        recipient: { id: recipientIgsid },
        message: { text },
        access_token: pageToken,
      }),
    })
    const data = await res.json()
    if (data.error) return { ok: false, error: data.error.message }
    return { ok: true }
  } catch (e) {
    return { ok: false, error: String(e) }
  }
}
