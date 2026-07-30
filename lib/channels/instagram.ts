import 'server-only'

// Instagram Business Login API (graph.instagram.com) — richer than the Facebook-login
// Graph API: supports follow-status (is_user_follow_business), comment likes,
// private replies and postback buttons. Multi-tenant: every call takes the
// per-workspace access token.
const IG = 'https://graph.instagram.com/v24.0'

export const IG_SCOPES = [
  'instagram_business_basic',
  'instagram_business_manage_messages',
  'instagram_business_manage_comments',
  'instagram_business_content_publish',
].join(',')

export const IG_CAPS = {
  dm: true, dmAutoReply: true, commentToDm: true, commentReply: true,
  commentLike: true, followGate: true, postScheduling: true, broadcast: true,
  webhookInbound: true, messagingWindow: 24,
}

export interface InstagramProfile {
  name: string | null
  username: string | null
  profile_pic: string | null
  follower_count: number | null
  is_user_follow_business: boolean | null
  is_business_follow_user: boolean | null
}

/** Fetch a user's IG profile incl. whether they follow the business (follow-gate). */
export async function fetchInstagramProfile(igsid: string, token: string): Promise<InstagramProfile> {
  const url = new URL(`${IG}/${igsid}`)
  url.searchParams.set(
    'fields',
    'name,username,profile_pic,follower_count,is_user_follow_business,is_business_follow_user',
  )
  url.searchParams.set('access_token', token)
  try {
    const res = await fetch(url.toString())
    if (!res.ok) return blankProfile()
    const d = await res.json()
    return {
      name: d.name ?? null,
      username: d.username ?? null,
      profile_pic: d.profile_pic ?? null,
      follower_count: d.follower_count ?? null,
      is_user_follow_business: d.is_user_follow_business ?? null,
      is_business_follow_user: d.is_business_follow_user ?? null,
    }
  } catch {
    return blankProfile()
  }
}
function blankProfile(): InstagramProfile {
  return { name: null, username: null, profile_pic: null, follower_count: null, is_user_follow_business: null, is_business_follow_user: null }
}

/** Send a plain DM. */
export async function sendInstagramDM(token: string, recipientIgsid: string, text: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch(`${IG}/me/messages?access_token=${token}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ recipient: { id: recipientIgsid }, message: { text } }),
    })
    if (!res.ok) return { ok: false, error: (await res.json())?.error?.message }
    return { ok: true }
  } catch (e) {
    return { ok: false, error: String(e) }
  }
}

/** Send a DM with postback buttons (used for the follow-gate "I've Followed" flow). */
export async function sendInstagramButtons(
  token: string,
  recipientIgsid: string,
  text: string,
  buttons: { title: string; payload: string }[],
): Promise<boolean> {
  try {
    const res = await fetch(`${IG}/me/messages?access_token=${token}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        recipient: { id: recipientIgsid },
        message: {
          attachment: {
            type: 'template',
            payload: {
              template_type: 'generic',
              elements: [{
                title: 'Follow to continue',
                subtitle: text,
                buttons: buttons.map((b) => ({ type: 'postback', title: b.title, payload: b.payload })),
              }],
            },
          },
        },
      }),
    })
    return res.ok
  } catch {
    return false
  }
}

/** Public reply on a comment. */
export async function replyToComment(token: string, commentId: string, text: string): Promise<boolean> {
  try {
    const res = await fetch(`${IG}/${commentId}/replies?access_token=${token}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: text }),
    })
    return res.ok
  } catch {
    return false
  }
}

/** Private reply to a commenter (comment → DM). Falls back to /me/messages. */
export async function sendPrivateReply(token: string, commentId: string, text: string): Promise<boolean> {
  try {
    const res = await fetch(`${IG}/${commentId}/private_replies?access_token=${token}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: text }),
    })
    if (res.ok) return true
    const res2 = await fetch(`${IG}/me/messages?access_token=${token}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ recipient: { comment_id: commentId }, message: { text } }),
    })
    return res2.ok
  } catch {
    return false
  }
}

/** Like a comment as the business (graph.instagram.com, graph.facebook.com fallback). */
export async function likeComment(token: string, businessId: string, commentId: string): Promise<boolean> {
  try {
    const a = await fetch(`${IG}/${businessId}/likes?comment_id=${commentId}&access_token=${token}`, { method: 'POST' })
    if (a.ok) return true
    const b = await fetch(
      `https://graph.facebook.com/v24.0/${businessId}/likes?comment_id=${commentId}&access_token=${token}`,
      { method: 'POST' },
    )
    return b.ok
  } catch {
    return false
  }
}

/** Publish an image post (Content Publishing API). */
/** Publish a Reel/video. Video containers need processing, so we poll status_code. */
export async function publishReel(token: string, igUserId: string, videoUrl: string, caption: string): Promise<{ ok: boolean; id?: string; error?: string }> {
  try {
    const create = await fetch(`${IG}/${igUserId}/media?access_token=${token.trim()}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ media_type: 'REELS', video_url: videoUrl, caption }),
    })
    const cd = await create.json()
    if (!cd.id) return { ok: false, error: cd.error?.message ?? 'container failed' }

    // Poll until the video container finishes processing (max ~90s).
    for (let i = 0; i < 18; i++) {
      await new Promise((r) => setTimeout(r, 5000))
      const st = await fetch(`${IG}/${cd.id}?fields=status_code,status&access_token=${token.trim()}`)
      const sd = await st.json()
      if (sd.status_code === 'FINISHED') break
      if (sd.status_code === 'ERROR') return { ok: false, error: sd.status ?? 'video processing error' }
    }

    const pub = await fetch(`${IG}/${igUserId}/media_publish?access_token=${token.trim()}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ creation_id: cd.id }),
    })
    const pd = await pub.json()
    return pd.id ? { ok: true, id: pd.id } : { ok: false, error: pd.error?.message ?? 'publish failed' }
  } catch (e) {
    return { ok: false, error: String(e) }
  }
}

export async function publishImage(token: string, igUserId: string, imageUrl: string, caption: string): Promise<{ ok: boolean; id?: string; error?: string }> {
  try {
    const create = await fetch(`${IG}/${igUserId}/media?access_token=${token}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image_url: imageUrl, caption }),
    })
    const cd = await create.json()
    if (!cd.id) return { ok: false, error: cd.error?.message }
    const pub = await fetch(`${IG}/${igUserId}/media_publish?access_token=${token}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ creation_id: cd.id }),
    })
    const pd = await pub.json()
    return pd.id ? { ok: true, id: pd.id } : { ok: false, error: pd.error?.message }
  } catch (e) {
    return { ok: false, error: String(e) }
  }
}

// ---------- OAuth (Instagram Business Login) ----------

export function instagramAuthUrl(redirectUri: string, state: string): string {
  const p = new URLSearchParams({
    client_id: process.env.INSTAGRAM_APP_ID ?? '',
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: IG_SCOPES,
    state,
  })
  return `https://www.instagram.com/oauth/authorize?${p.toString()}`
}

export async function exchangeIgCode(code: string, redirectUri: string): Promise<{ token: string; userId: string } | null> {
  try {
    const res = await fetch('https://api.instagram.com/oauth/access_token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: process.env.INSTAGRAM_APP_ID ?? '',
        client_secret: process.env.INSTAGRAM_APP_SECRET ?? '',
        grant_type: 'authorization_code',
        redirect_uri: redirectUri,
        code,
      }),
    })
    const d = await res.json()
    if (!d.access_token) return null
    return { token: d.access_token, userId: String(d.user_id) }
  } catch {
    return null
  }
}

export async function igLongLivedToken(shortToken: string): Promise<{ token: string; expiresIn: number } | null> {
  try {
    const url = new URL(`${IG.replace('/v24.0', '')}/access_token`)
    url.searchParams.set('grant_type', 'ig_exchange_token')
    url.searchParams.set('client_secret', process.env.INSTAGRAM_APP_SECRET ?? '')
    url.searchParams.set('access_token', shortToken)
    const res = await fetch(url.toString())
    const d = await res.json()
    if (!d.access_token) return null
    return { token: d.access_token, expiresIn: d.expires_in ?? 5_184_000 }
  } catch {
    return null
  }
}
