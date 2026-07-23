# 05 — Instagram Integration Layer

## 5.1 Required Meta App Permissions

The Meta App must have these permissions approved before going live:

| Permission | Purpose |
|-----------|---------|
| `instagram_basic` | Read IG account info |
| `instagram_manage_messages` | Send/receive DMs |
| `instagram_manage_comments` | Reply to comments, hide comments |
| `instagram_content_publish` | Schedule and publish posts/reels/stories (where supported) |
| `instagram_manage_insights` | Read post-level and account-level analytics |
| `pages_show_list` | List connected Facebook Pages |
| `pages_read_engagement` | Read page engagement metrics |
| `pages_manage_metadata` | Subscribe to webhooks on the page |
| `business_management` | Business verification |
| `leads_retrieval` | Fetch Meta Ads lead form submissions |

**Webhook subscription fields to subscribe:**
- `messages` — all inbound DMs
- `messaging_seen` — read receipts
- `messaging_reactions` — emoji reactions to messages
- `comments` — new comments on posts and reels
- `live_comments` — comments on Instagram Live
- `mentions` — when your account is mentioned in a story
- `story_insights` — story reply events

---

## 5.2 Instagram Account Connection (OAuth Flow)

```typescript
// app/api/integrations/instagram/connect/route.ts
export async function GET(request: NextRequest) {
  const workspaceId = request.nextUrl.searchParams.get('workspaceId')
  // Validate workspaceId + check permission 'manage_workspace'
  
  const state = Buffer.from(JSON.stringify({
    workspaceId,
    csrf: crypto.randomBytes(16).toString('hex')
  })).toString('base64url')
  
  // Store state in short-lived cookie
  const params = new URLSearchParams({
    client_id: process.env.META_APP_ID!,
    redirect_uri: `${process.env.NEXT_PUBLIC_APP_URL}/api/integrations/instagram/callback`,
    scope: [
      'instagram_basic', 'instagram_manage_messages',
      'instagram_manage_comments', 'instagram_content_publish',
      'instagram_manage_insights', 'pages_show_list',
      'pages_read_engagement', 'pages_manage_metadata',
      'business_management', 'leads_retrieval'
    ].join(','),
    response_type: 'code',
    state,
  })
  
  return Response.redirect(
    `https://www.facebook.com/v21.0/dialog/oauth?${params.toString()}`
  )
}
```

```typescript
// app/api/integrations/instagram/callback/route.ts
export async function GET(request: NextRequest) {
  const { code, state, error } = Object.fromEntries(request.nextUrl.searchParams)
  
  if (error) return Response.redirect('/settings/instagram?error=cancelled')
  
  // 1. Decode and validate state (CSRF check)
  const { workspaceId, csrf } = JSON.parse(Buffer.from(state, 'base64url').toString())
  
  // 2. Exchange code for short-lived token
  const tokenRes = await fetch(`https://graph.facebook.com/v21.0/oauth/access_token`, {
    method: 'POST',
    body: new URLSearchParams({
      client_id: process.env.META_APP_ID!,
      client_secret: process.env.META_APP_SECRET!,
      redirect_uri: `${process.env.NEXT_PUBLIC_APP_URL}/api/integrations/instagram/callback`,
      code,
    })
  })
  const { access_token: shortLivedToken } = await tokenRes.json()
  
  // 3. Exchange for long-lived token (60 days)
  const llRes = await fetch(
    `https://graph.facebook.com/v21.0/oauth/access_token` +
    `?grant_type=fb_exchange_token&client_id=${process.env.META_APP_ID}` +
    `&client_secret=${process.env.META_APP_SECRET}&fb_exchange_token=${shortLivedToken}`
  )
  const { access_token: longLivedToken, expires_in } = await llRes.json()
  
  // 4. Get list of Facebook Pages
  const pagesRes = await fetch(
    `https://graph.facebook.com/v21.0/me/accounts?access_token=${longLivedToken}`
  )
  const { data: pages } = await pagesRes.json()
  
  // 5. For each page, find connected Instagram Business Account
  for (const page of pages) {
    const igRes = await fetch(
      `https://graph.facebook.com/v21.0/${page.id}` +
      `?fields=instagram_business_account&access_token=${page.access_token}`
    )
    const { instagram_business_account } = await igRes.json()
    if (!instagram_business_account) continue
    
    // 6. Fetch IG account profile
    const profileRes = await fetch(
      `https://graph.facebook.com/v21.0/${instagram_business_account.id}` +
      `?fields=id,username,name,profile_picture_url,followers_count,following_count,media_count,is_verified,biography,website,category` +
      `&access_token=${longLivedToken}`
    )
    const profile = await profileRes.json()
    
    // 7. Upsert instagram_accounts row
    const supabase = createAdminClient()
    await supabase.from('instagram_accounts').upsert({
      workspace_id: workspaceId,
      ig_user_id: profile.id,
      page_id: page.id,
      username: profile.username,
      name: profile.name,
      profile_pic: profile.profile_picture_url,
      followers_count: profile.followers_count,
      following_count: profile.following_count,
      media_count: profile.media_count,
      is_verified: profile.is_verified,
      biography: profile.biography,
      website: profile.website,
      category: profile.category,
      access_token: longLivedToken,
      token_expires_at: new Date(Date.now() + expires_in * 1000).toISOString(),
      last_token_refresh: new Date().toISOString(),
    }, { onConflict: 'workspace_id,ig_user_id' })
    
    // 8. Subscribe to webhooks
    await subscribeToWebhooks(page.id, page.access_token)
  }
  
  return Response.redirect('/settings/instagram?success=connected')
}

async function subscribeToWebhooks(pageId: string, pageToken: string) {
  await fetch(`https://graph.facebook.com/v21.0/${pageId}/subscribed_apps`, {
    method: 'POST',
    body: new URLSearchParams({
      subscribed_fields: [
        'messages', 'messaging_seen', 'messaging_reactions',
        'comments', 'live_comments', 'mentions', 'story_insights'
      ].join(','),
      access_token: pageToken,
    })
  })
}
```

---

## 5.3 Webhook Handler

```typescript
// app/api/webhooks/instagram/route.ts

// GET: Meta webhook verification
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  if (
    searchParams.get('hub.mode') === 'subscribe' &&
    searchParams.get('hub.verify_token') === process.env.INSTAGRAM_WEBHOOK_SECRET
  ) {
    return new Response(searchParams.get('hub.challenge'), { status: 200 })
  }
  return new Response('Forbidden', { status: 403 })
}

// POST: inbound events
export async function POST(request: NextRequest) {
  const rawBody = await request.text()
  
  // Verify HMAC-SHA256 signature
  const signature = request.headers.get('x-hub-signature-256')
  const expected = 'sha256=' + createHmac('sha256', process.env.META_APP_SECRET!)
    .update(rawBody).digest('hex')
  if (!signature || !timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
    return new Response('Forbidden', { status: 403 })
  }
  
  const body = JSON.parse(rawBody)
  
  // Only process instagram object type
  if (body.object !== 'instagram') {
    return new Response('OK', { status: 200 })
  }
  
  // Store raw event (fire-and-forget; don't block response to Meta)
  const supabase = createAdminClient()
  const { data: event } = await supabase.from('ig_webhook_events').insert({
    payload: body,
    page_id: body.entry?.[0]?.id,
    status: 'received',
  }).select('id').single()
  
  // Process async (do not await — respond to Meta immediately)
  processWebhookEvent(event.id, body).catch(err => {
    console.error('[Webhook] Processing error:', err)
  })
  
  return new Response('EVENT_RECEIVED', { status: 200 })
}

async function processWebhookEvent(eventId: string, body: any) {
  const supabase = createAdminClient()
  
  try {
    await supabase.from('ig_webhook_events').update({ status: 'processing' }).eq('id', eventId)
    
    for (const entry of body.entry ?? []) {
      const pageId = entry.id
      const workspace = await findWorkspaceByPageId(supabase, pageId)
      if (!workspace) continue
      
      // Route by field type
      for (const change of entry.changes ?? []) {
        switch (change.field) {
          case 'messages':
            await handleMessagingEvent(supabase, workspace, change.value)
            break
          case 'comments':
            await handleCommentEvent(supabase, workspace, change.value)
            break
          case 'mentions':
            await handleMentionEvent(supabase, workspace, change.value)
            break
        }
      }
      
      // Also handle entry-level messaging array (older webhook format)
      for (const messaging of entry.messaging ?? []) {
        await handleMessagingEvent(supabase, workspace, messaging)
      }
    }
    
    await supabase.from('ig_webhook_events').update({ status: 'processed' }).eq('id', eventId)
  } catch (err) {
    await supabase.from('ig_webhook_events').update({
      status: 'failed',
      last_error: String(err),
      attempts: supabase.rpc('increment', { x: 1 })
    }).eq('id', eventId)
    throw err
  }
}
```

---

## 5.4 Inbound Message Handler

```typescript
async function handleMessagingEvent(supabase, workspace, messaging: any) {
  const senderId = messaging.sender?.id
  const recipientId = messaging.recipient?.id
  
  if (!senderId || senderId === workspace.ig_user_id) return // ignore own messages
  
  const igAccount = await findIgAccount(supabase, workspace.id, recipientId)
  if (!igAccount) return
  
  // Route by messaging sub-type
  if (messaging.message) {
    if (messaging.message.is_deleted) {
      await handleMessageDeleted(supabase, messaging)
    } else {
      await handleIncomingDM(supabase, workspace, igAccount, messaging)
    }
  } else if (messaging.read) {
    await handleReadReceipt(supabase, workspace, messaging)
  } else if (messaging.reaction) {
    await handleReaction(supabase, workspace, messaging)
  }
}

async function handleIncomingDM(supabase, workspace, igAccount, messaging) {
  const senderIgsid = messaging.sender.id
  const msg = messaging.message
  
  // 1. Fetch/upsert contact
  let contact = await upsertContact(supabase, workspace, igAccount, senderIgsid)
  
  // 2. Check blocked
  if (contact.is_blocked) return
  
  // 3. Upsert conversation
  const conversation = await upsertConversation(supabase, workspace, igAccount, contact)
  
  // 4. Determine message type + content
  const { type, content, mediaUrl, metadata } = parseMessagePayload(msg, messaging)
  
  // 5. Insert message (dedup on ig_message_id)
  try {
    await supabase.from('messages').insert({
      conversation_id: conversation.id,
      workspace_id: workspace.id,
      sender_type: 'contact',
      direction: 'inbound',
      type,
      content,
      media_url: mediaUrl,
      ig_message_id: msg.mid,
      metadata,
    })
  } catch (err: any) {
    if (err.code === '23505') return // duplicate ig_message_id, skip
    throw err
  }
  
  // 6. Non-blocking side effects
  void sendReadReceipt(igAccount, senderIgsid)
  void persistMediaToStorage(supabase, mediaUrl, workspace.id)
  void trackUsage(supabase, workspace.id, 'messages_in')
  void detectCampaignReply(supabase, workspace.id, contact.id, conversation.id)
  void detectOptOut(supabase, contact, content)
  
  // 7. Auto-reply pipeline
  await runAutoReplyPipeline(supabase, workspace, igAccount, contact, conversation, {
    type, content, mediaUrl, metadata
  })
}
```

---

## 5.5 Instagram Graph API Wrapper

```typescript
// services/instagram/api.ts
export class InstagramAPI {
  private baseUrl = 'https://graph.instagram.com/v21.0'
  private graphUrl = 'https://graph.facebook.com/v21.0'
  
  constructor(
    private accessToken: string,
    private igUserId: string
  ) {}
  
  async sendDM(recipientIgsid: string, message: OutboundMessage): Promise<{ id: string }> {
    return this.callWithRetry(() =>
      this.post(`/${this.igUserId}/messages`, {
        recipient: { id: recipientIgsid },
        message: this.buildMessagePayload(message),
      })
    )
  }
  
  async replyToComment(commentId: string, text: string): Promise<void> {
    await this.callWithRetry(() =>
      this.post(`/${commentId}/replies`, { message: text })
    )
  }
  
  async hideComment(commentId: string, hide: boolean): Promise<void> {
    await this.callWithRetry(() =>
      this.post(`/${commentId}`, { is_hidden: hide })
    )
  }
  
  async getUserProfile(igsid: string): Promise<IGUserProfile> {
    return this.callWithRetry(() =>
      this.get(`/${igsid}`, { fields: 'name,profile_pic' })
    )
  }
  
  async getMediaUrl(mediaId: string): Promise<string> {
    const res = await this.callWithRetry(() =>
      this.get(`/${mediaId}`, { fields: 'url,mime_type' })
    )
    return res.url
  }
  
  async publishImage(igUserId: string, imageUrl: string, caption: string): Promise<string> {
    // Step 1: Create container
    const container = await this.callWithRetry(() =>
      this.post(`/${igUserId}/media`, { image_url: imageUrl, caption })
    )
    // Step 2: Wait for container to be ready
    await this.waitForContainer(container.id)
    // Step 3: Publish container
    const result = await this.callWithRetry(() =>
      this.post(`/${igUserId}/media_publish`, { creation_id: container.id })
    )
    return result.id  // ig_media_id
  }
  
  async getMediaInsights(mediaId: string): Promise<MediaInsights> {
    return this.callWithRetry(() =>
      this.get(`/${mediaId}/insights`, {
        metric: 'reach,impressions,likes,comments,shares,saved,video_views'
      })
    )
  }
  
  async getAccountInsights(igUserId: string, period: string, metrics: string[]): Promise<any> {
    return this.callWithRetry(() =>
      this.get(`/${igUserId}/insights`, {
        metric: metrics.join(','),
        period,
      })
    )
  }
  
  async refreshToken(token: string): Promise<{ access_token: string; expires_in: number }> {
    return this.get(
      `${this.graphUrl}/refresh_access_token`,
      { grant_type: 'ig_refresh_token', access_token: token }
    )
  }
  
  // Internal: exponential backoff with 3 retries
  private async callWithRetry<T>(fn: () => Promise<T>, retries = 3): Promise<T> {
    for (let i = 0; i < retries; i++) {
      try {
        return await fn()
      } catch (err: any) {
        const isTransient = err.status >= 500 || err.status === 429 || !err.status
        if (!isTransient || i === retries - 1) throw err
        const delay = Math.pow(2, i) * 1000
        if (err.status === 429 && err.retryAfter) {
          await sleep(err.retryAfter * 1000)
        } else {
          await sleep(delay)
        }
      }
    }
    throw new Error('Max retries exceeded')
  }
  
  private async post(path: string, body: object): Promise<any> {
    const res = await fetch(`${this.graphUrl}${path}?access_token=${this.accessToken}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const data = await res.json()
    if (data.error) throw new IGApiError(data.error)
    return data
  }
  
  private async get(path: string, params: Record<string, string> = {}): Promise<any> {
    const url = new URL(`${this.graphUrl}${path}`)
    url.searchParams.set('access_token', this.accessToken)
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v))
    const res = await fetch(url.toString())
    const data = await res.json()
    if (data.error) throw new IGApiError(data.error)
    return data
  }
}
```

---

## 5.6 Token Lifecycle Management

Instagram long-lived tokens expire in 60 days. The platform proactively refreshes them.

```typescript
// app/api/cron/refresh-ig-tokens/route.ts
export async function POST(request: NextRequest) {
  // Auth: verify CRON_SECRET Bearer header
  
  const supabase = createAdminClient()
  
  // Find accounts expiring within 10 days
  const { data: accounts } = await supabase
    .from('instagram_accounts')
    .select('*')
    .lt('token_expires_at', new Date(Date.now() + 10 * 86400 * 1000).toISOString())
    .eq('is_active', true)
  
  for (const account of accounts ?? []) {
    try {
      const api = new InstagramAPI(account.access_token, account.ig_user_id)
      const { access_token, expires_in } = await api.refreshToken(account.access_token)
      
      await supabase.from('instagram_accounts').update({
        access_token,
        token_expires_at: new Date(Date.now() + expires_in * 1000).toISOString(),
        last_token_refresh: new Date().toISOString(),
      }).eq('id', account.id)
      
    } catch (err: any) {
      console.error(`Token refresh failed for account ${account.id}:`, err)
      
      // Token revoked by user (error_subcode 458 or 460)
      if (err.code === 190 || err.subcode === 458 || err.subcode === 460) {
        await supabase.from('instagram_accounts').update({ is_active: false }).eq('id', account.id)
        // Notify workspace admin
        await notifyWorkspaceAdmin(supabase, account.workspace_id, 'ig_token_revoked', {
          ig_username: account.username,
        })
      }
    }
  }
  
  return Response.json({ ok: true })
}
```

**pg_cron schedule** (added to migration for pg_cron setup):
```sql
SELECT cron.schedule('refresh-ig-tokens', '0 2 * * *',
  $$ SELECT net.http_post(
    url := current_setting('app.url') || '/api/cron/refresh-ig-tokens',
    headers := jsonb_build_object('Authorization', 'Bearer ' || current_setting('app.cron_secret'))
  ) $$
);
```

---

## 5.7 24-Hour Messaging Window

```typescript
// lib/ig-window.ts

export function isWithin24HourWindow(lastUserMessageAt: Date | null | undefined): boolean {
  if (!lastUserMessageAt) return false
  return new Date(lastUserMessageAt).getTime() > Date.now() - 24 * 60 * 60 * 1000
}

export function windowExpiresAt(lastUserMessageAt: Date): Date {
  return new Date(new Date(lastUserMessageAt).getTime() + 24 * 60 * 60 * 1000)
}

export function windowRemainingMs(lastUserMessageAt: Date): number {
  return Math.max(0, windowExpiresAt(lastUserMessageAt).getTime() - Date.now())
}

export class WindowExpiredError extends Error {
  constructor() {
    super('24-hour messaging window has expired. Use an approved template to message this contact.')
    this.name = 'WindowExpiredError'
  }
}

// Guard in outbound send API:
if (!isWithin24HourWindow(conversation.last_user_message_at)) {
  if (!isApprovedTemplate) {
    throw new WindowExpiredError()
  }
}
```

The UI shows a countdown banner in the chat window when < 2 hours remain.

---

## 5.8 Media Persistence

Instagram CDN media URLs expire after ~24 hours. The platform persists inbound media to Supabase Storage immediately:

```typescript
// lib/ig-media.ts
export async function persistInboundMedia(
  supabase: SupabaseClient,
  mediaUrl: string,
  workspaceId: string,
  messageId: string
): Promise<string | null> {
  try {
    const res = await fetch(mediaUrl, { signal: AbortSignal.timeout(10_000) })
    if (!res.ok) return null
    const blob = await res.blob()
    const ext = mime.extension(blob.type) || 'bin'
    const path = `${workspaceId}/messages/${messageId}.${ext}`
    
    const { error } = await supabase.storage.from('instagram-media').upload(path, blob, {
      contentType: blob.type,
      upsert: true,
    })
    if (error) return null
    
    const { data } = supabase.storage.from('instagram-media').getPublicUrl(path)
    return data.publicUrl
  } catch {
    return null  // non-critical; original URL still available for ~24h
  }
}
```
