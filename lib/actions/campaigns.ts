'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import { getUser, getActiveMembership, roleCan } from '@/lib/authz'
import { sendTelegramMessage } from '@/lib/channels/telegram'
import { windowStatus } from '@/lib/inbox'
import { callAI, aiConfigured } from '@/lib/ai/client'
import { decryptToken } from '@/lib/crypto'

/** AI: draft a campaign broadcast message from a goal. */
export async function aiGenerateCampaignMessage(goal: string): Promise<{ message?: string; error?: string }> {
  await requireCampaigns()
  if (!aiConfigured()) return { error: 'Add an OpenAI/OpenRouter key to use AI.' }
  const g = goal.trim()
  if (!g) return { error: 'Describe the campaign goal' }
  const out = await callAI(
    [{ role: 'user', content: `Write a short, friendly broadcast DM for this goal: "${g}". Under 45 words, 1 emoji, clear call-to-action. Return only the message.` }],
    { maxTokens: 120, temperature: 0.8 },
  )
  return out ? { message: out.trim() } : { error: 'Generation failed' }
}

async function requireCampaigns() {
  const user = await getUser()
  if (!user) redirect('/login')
  const { active } = await getActiveMembership(user.id)
  if (!active) redirect('/workspace/new')
  if (active.role === 'agent') throw new Error('Forbidden')
  return { user, workspaceId: active.workspaceId }
}

export async function createCampaignAction(formData: FormData): Promise<{ error?: string }> {
  const { user, workspaceId } = await requireCampaigns()
  const name = String(formData.get('name') ?? '').trim()
  const type = String(formData.get('type') ?? 'window_broadcast')
  const message_text = String(formData.get('message_text') ?? '').trim()
  if (!name || !message_text) return { error: 'Name and message are required' }

  const admin = createAdminClient()
  await admin.from('campaigns').insert({
    workspace_id: workspaceId,
    name,
    type,
    message_text,
    status: 'draft',
    created_by: user.id,
  })
  revalidatePath('/campaigns')
  return {}
}

export async function deleteCampaignAction(formData: FormData): Promise<void> {
  const { workspaceId } = await requireCampaigns()
  const id = String(formData.get('id'))
  const admin = createAdminClient()
  await admin.from('campaigns').delete().eq('id', id).eq('workspace_id', workspaceId)
  revalidatePath('/campaigns')
}

/**
 * Run a campaign: resolve eligible contacts (those with a conversation on a
 * connected channel; window-compliant for window types), deliver, and record
 * one campaign_recipients row each. Telegram is delivered live; other channels
 * are recorded and delivered once connected.
 */
export async function runCampaignAction(formData: FormData): Promise<void> {
  const { workspaceId } = await requireCampaigns()
  const id = String(formData.get('id'))
  const admin = createAdminClient()

  const { data: campaign } = await admin
    .from('campaigns')
    .select('id, type, message_text, status')
    .eq('id', id)
    .eq('workspace_id', workspaceId)
    .maybeSingle()
  if (!campaign || campaign.status === 'running') return

  await admin.from('campaigns').update({ status: 'running', started_at: new Date().toISOString() }).eq('id', id)

  // Candidate audience: conversations with a channel account, joined to contact.
  const { data: convs } = await admin
    .from('conversations')
    .select('id, channel, channel_account_id, last_user_message_at, contact_id, meta, contacts(id, is_blocked, opted_out)')
    .eq('workspace_id', workspaceId)
    .not('channel_account_id', 'is', null)
    .limit(1000)

  const isWindowType = campaign.type === 'window_broadcast' || campaign.type === 'segment'
  let sent = 0
  let failed = 0
  let filtered = 0

  for (const conv of convs ?? []) {
    const contact = conv.contacts as unknown as { id: string; is_blocked: boolean; opted_out: boolean } | null
    if (!contact || contact.is_blocked || contact.opted_out) {
      filtered++
      continue
    }
    // Telegram has no window; IG/FB window types must be within 24h.
    if (isWindowType && conv.channel !== 'telegram') {
      if (!windowStatus(conv.last_user_message_at).open) {
        filtered++
        await recordRecipient(admin, id, workspaceId, contact.id, conv.id, 'filtered', '24h_window_expired')
        continue
      }
    }

    let ok = false
    if (conv.channel === 'telegram' && conv.channel_account_id) {
      const { data: acct } = await admin
        .from('channel_accounts')
        .select('access_token')
        .eq('id', conv.channel_account_id)
        .maybeSingle()
      const chatId = (conv.meta as { telegram_chat_id?: string } | null)?.telegram_chat_id
      const campToken = decryptToken(acct?.access_token)
      if (campToken && chatId) {
        const res = await sendTelegramMessage(campToken, chatId, campaign.message_text ?? '')
        ok = res.ok
        if (ok) {
          await admin.from('messages').insert({
            conversation_id: conv.id,
            workspace_id: workspaceId,
            sender_type: 'campaign',
            direction: 'outbound',
            type: 'text',
            content: campaign.message_text,
            status: 'sent',
          })
        }
      }
    }

    if (ok) {
      sent++
      await recordRecipient(admin, id, workspaceId, contact.id, conv.id, 'sent')
    } else {
      failed++
      await recordRecipient(admin, id, workspaceId, contact.id, conv.id, 'failed')
    }
  }

  await admin
    .from('campaigns')
    .update({
      status: 'completed',
      completed_at: new Date().toISOString(),
      total_recipients: sent + failed + filtered,
      sent_count: sent,
      failed_count: failed,
      filtered_count: filtered,
    })
    .eq('id', id)

  revalidatePath(`/campaigns/${id}`)
  revalidatePath('/campaigns')
}

async function recordRecipient(
  admin: ReturnType<typeof createAdminClient>,
  campaignId: string,
  workspaceId: string,
  contactId: string,
  conversationId: string,
  status: string,
  filteredReason?: string,
) {
  await admin.from('campaign_recipients').upsert(
    {
      campaign_id: campaignId,
      workspace_id: workspaceId,
      contact_id: contactId,
      conversation_id: conversationId,
      status,
      filtered_reason: filteredReason ?? null,
      sent_at: status === 'sent' ? new Date().toISOString() : null,
    },
    { onConflict: 'campaign_id,contact_id' },
  )
}
