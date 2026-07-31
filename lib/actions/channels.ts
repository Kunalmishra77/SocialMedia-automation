'use server'

import { randomBytes } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import { getUser, getActiveMembership, roleCan } from '@/lib/authz'
import { getTelegramMe, setTelegramWebhook } from '@/lib/channels/telegram'
import { fetchIgMe, subscribeInstagramWebhooks, IG_CAPS } from '@/lib/channels/instagram'
import { saveInstagramApp, clearInstagramApp } from '@/lib/instagram-config'
import { encryptToken, decryptToken } from '@/lib/crypto'

async function requireManageWorkspace(): Promise<string> {
  const user = await getUser()
  if (!user) redirect('/login')
  const { active } = await getActiveMembership(user.id)
  if (!active) redirect('/workspace/new')
  if (!roleCan(active.role, 'manage_workspace')) throw new Error('Forbidden')
  return active.workspaceId
}

const TELEGRAM_CAPS = {
  dm: true, dmAutoReply: true, commentToDm: false, commentReply: false,
  commentLike: false, postScheduling: true, broadcast: true, webhookInbound: true,
  messagingWindow: null,
}

export async function connectTelegramAction(formData: FormData): Promise<{ error?: string; ok?: boolean }> {
  const workspaceId = await requireManageWorkspace()
  const token = String(formData.get('token') ?? '').trim()
  if (!token) return { error: 'Enter your bot token' }

  const me = await getTelegramMe(token)
  if (!me) return { error: 'Invalid bot token — could not reach Telegram.' }

  const admin = createAdminClient()
  const secret = randomBytes(16).toString('hex')
  const { data: account } = await admin
    .from('channel_accounts')
    .upsert(
      {
        workspace_id: workspaceId,
        channel: 'telegram',
        external_id: String(me.id),
        handle: me.username,
        display_name: me.first_name,
        access_token: encryptToken(token),
        webhook_secret: encryptToken(secret),
        capabilities: TELEGRAM_CAPS,
        is_active: true,
      },
      { onConflict: 'workspace_id,channel,external_id' },
    )
    .select('id')
    .single()

  // Register webhook (works once the app is on a public HTTPS domain).
  const base = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
  if (account && base.startsWith('https://')) {
    await setTelegramWebhook(token, `${base}/api/webhooks/telegram/${account.id}`, secret)
  }

  revalidatePath('/settings/channels')
  return { ok: true }
}

/** Save this workspace's own Instagram app credentials (App ID + App Secret). */
export async function saveInstagramAppAction(formData: FormData): Promise<{ ok?: boolean; error?: string; verifyToken?: string }> {
  const workspaceId = await requireManageWorkspace()
  const appId = String(formData.get('app_id') ?? '').trim()
  const appSecret = String(formData.get('app_secret') ?? '').trim()
  if (!appId || !appSecret) return { error: 'Enter both the Instagram App ID and App Secret.' }
  if (!/^\d{6,}$/.test(appId)) return { error: 'App ID should be numeric (from your Meta app).' }
  const admin = createAdminClient()
  const { verifyToken } = await saveInstagramApp(admin, workspaceId, appId, appSecret)
  revalidatePath('/settings/channels')
  return { ok: true, verifyToken }
}

/** Switch this workspace off its own Instagram app onto the platform (central) app. */
export async function useCentralInstagramAppAction(): Promise<{ ok?: boolean }> {
  const workspaceId = await requireManageWorkspace()
  const admin = createAdminClient()
  await clearInstagramApp(admin, workspaceId)
  revalidatePath('/settings/channels')
  return { ok: true }
}

/**
 * Connect Instagram by pasting a long-lived access token (no OAuth redirect),
 * then auto-subscribe the account to webhooks so DMs actually arrive.
 */
export async function connectInstagramTokenAction(formData: FormData): Promise<{ error?: string; ok?: boolean; warning?: string }> {
  const workspaceId = await requireManageWorkspace()
  const token = String(formData.get('token') ?? '').trim()
  if (!token) return { error: 'Paste your Instagram access token.' }

  const me = await fetchIgMe(token)
  if (!me) return { error: 'Invalid or expired token — Instagram didn’t accept it. Generate a fresh token and try again.' }

  const admin = createAdminClient()
  const encToken = encryptToken(token)
  await admin.from('channel_accounts').upsert(
    {
      workspace_id: workspaceId, channel: 'instagram', external_id: me.userId,
      handle: me.username, display_name: me.name, access_token: encToken,
      capabilities: IG_CAPS, is_active: true,
    },
    { onConflict: 'workspace_id,channel,external_id' },
  )
  await admin.from('instagram_accounts').upsert(
    {
      workspace_id: workspaceId, ig_user_id: me.userId, page_id: me.userId,
      username: me.username, name: me.name, access_token: encToken,
      webhook_verified: true, is_active: true,
    },
    { onConflict: 'workspace_id,ig_user_id' },
  )

  const sub = await subscribeInstagramWebhooks(token)
  revalidatePath('/settings/channels')
  if (!sub.ok) {
    return { ok: true, warning: `Connected, but webhook subscription failed: ${sub.error}. Make sure the Instagram webhook (callback URL + "messages" field) is configured in the Meta app.` }
  }
  return { ok: true }
}

/** Re-run the webhook subscription for an already-connected Instagram account. */
export async function resubscribeInstagramAction(formData: FormData): Promise<{ ok?: boolean; error?: string }> {
  const workspaceId = await requireManageWorkspace()
  const id = String(formData.get('id') ?? '')
  const admin = createAdminClient()
  const { data: acct } = await admin
    .from('channel_accounts')
    .select('access_token')
    .eq('id', id).eq('workspace_id', workspaceId).eq('channel', 'instagram')
    .maybeSingle()
  const token = decryptToken(acct?.access_token)
  if (!token) return { error: 'No token on file — reconnect Instagram.' }
  const sub = await subscribeInstagramWebhooks(token)
  revalidatePath('/settings/channels')
  return sub.ok ? { ok: true } : { error: `${sub.error}. Configure the Instagram webhook (callback URL + "messages" field) in the Meta app dashboard first.` }
}

export async function disconnectChannelAction(formData: FormData): Promise<void> {
  const workspaceId = await requireManageWorkspace()
  const id = String(formData.get('id'))
  const admin = createAdminClient()
  await admin.from('channel_accounts').delete().eq('id', id).eq('workspace_id', workspaceId)
  revalidatePath('/settings/channels')
  revalidatePath('/accounts')
}
