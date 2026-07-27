'use server'

import { randomBytes } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import { getUser, getActiveMembership, roleCan } from '@/lib/authz'
import { getTelegramMe, setTelegramWebhook } from '@/lib/channels/telegram'
import { encryptToken } from '@/lib/crypto'

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

export async function disconnectChannelAction(formData: FormData): Promise<void> {
  const workspaceId = await requireManageWorkspace()
  const id = String(formData.get('id'))
  const admin = createAdminClient()
  await admin.from('channel_accounts').delete().eq('id', id).eq('workspace_id', workspaceId)
  revalidatePath('/settings/channels')
  revalidatePath('/accounts')
}
