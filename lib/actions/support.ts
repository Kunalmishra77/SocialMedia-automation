'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireUser, getActiveMembership } from '@/lib/authz'
import { requirePlatformAdmin, can, writeAudit } from '@/lib/platform-admin/auth'

const CATEGORIES = ['general', 'billing', 'technical', 'api', 'integration']
const PRIORITIES = ['low', 'normal', 'high', 'urgent']
const STATUSES = ['open', 'in_progress', 'waiting_client', 'escalated', 'resolved', 'closed']

// ── Client side ───────────────────────────────────────────────

/** A client opens a new support ticket from their portal. */
export async function createTicketAction(formData: FormData): Promise<void> {
  const user = await requireUser()
  const { active } = await getActiveMembership(user.id)
  if (!active) throw new Error('No workspace')

  const subject = String(formData.get('subject') ?? '').trim()
  const body = String(formData.get('body') ?? '').trim()
  const category = String(formData.get('category') ?? 'general')
  const priority = String(formData.get('priority') ?? 'normal')
  if (subject.length < 3 || body.length < 3) throw new Error('Subject and message are required')

  const admin = createAdminClient()
  const { data: ticket } = await admin
    .from('support_tickets')
    .insert({
      workspace_id: active.workspaceId,
      subject,
      category: CATEGORIES.includes(category) ? category : 'general',
      priority: PRIORITIES.includes(priority) ? priority : 'normal',
      status: 'open',
      created_by: user.id,
    })
    .select('id')
    .single()

  if (ticket) {
    await admin.from('support_ticket_messages').insert({
      ticket_id: ticket.id,
      author_type: 'client',
      author_id: user.id,
      author_name: user.email ?? 'Client',
      body,
    })
  }
  revalidatePath('/help')
}

/** Client replies to their own ticket. */
export async function clientReplyAction(formData: FormData): Promise<void> {
  const user = await requireUser()
  const { active } = await getActiveMembership(user.id)
  if (!active) throw new Error('No workspace')

  const ticketId = String(formData.get('ticketId'))
  const body = String(formData.get('body') ?? '').trim()
  if (!body) return

  const admin = createAdminClient()
  const { data: ticket } = await admin.from('support_tickets').select('workspace_id').eq('id', ticketId).maybeSingle()
  if (!ticket || ticket.workspace_id !== active.workspaceId) throw new Error('Forbidden')

  await admin.from('support_ticket_messages').insert({
    ticket_id: ticketId, author_type: 'client', author_id: user.id, author_name: user.email ?? 'Client', body,
  })
  await admin.from('support_tickets').update({ status: 'open', updated_at: new Date().toISOString() }).eq('id', ticketId)
  revalidatePath('/help')
}

// ── Admin side ────────────────────────────────────────────────

/** Operator replies to a ticket (public reply or internal note). */
export async function adminReplyAction(formData: FormData): Promise<void> {
  const ctx = await requirePlatformAdmin()
  const ticketId = String(formData.get('ticketId'))
  const body = String(formData.get('body') ?? '').trim()
  const internal = String(formData.get('internal') ?? '') === 'on'
  if (!body) return

  const admin = createAdminClient()
  await admin.from('support_ticket_messages').insert({
    ticket_id: ticketId, author_type: 'admin', author_id: ctx.userId, author_name: ctx.email, body, is_internal: internal,
  })
  // A public reply moves the ticket to waiting on the client + records first response (SLA).
  if (!internal) {
    const { data: t } = await admin.from('support_tickets').select('first_response_at').eq('id', ticketId).maybeSingle()
    const patch: Record<string, unknown> = { status: 'waiting_client', updated_at: new Date().toISOString() }
    if (!t?.first_response_at) patch.first_response_at = new Date().toISOString()
    await admin.from('support_tickets').update(patch).eq('id', ticketId)
  }
  await writeAudit(ctx, 'support.reply', { type: 'ticket', id: ticketId, metadata: { internal } })
  revalidatePath(`/platform-admin/support/${ticketId}`)
  revalidatePath('/platform-admin/support')
}

export async function updateTicketAction(formData: FormData): Promise<void> {
  const ctx = await requirePlatformAdmin()
  const ticketId = String(formData.get('ticketId'))
  const status = String(formData.get('status') ?? '')
  const priority = String(formData.get('priority') ?? '')

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (STATUSES.includes(status)) patch.status = status
  if (PRIORITIES.includes(priority)) patch.priority = priority

  const admin = createAdminClient()
  await admin.from('support_tickets').update(patch).eq('id', ticketId)
  await writeAudit(ctx, 'support.update', { type: 'ticket', id: ticketId, metadata: { status, priority } })
  revalidatePath(`/platform-admin/support/${ticketId}`)
  revalidatePath('/platform-admin/support')
}

export async function assignTicketAction(formData: FormData): Promise<void> {
  const ctx = await requirePlatformAdmin()
  if (!can(ctx, 'view_workspaces')) throw new Error('Forbidden')
  const ticketId = String(formData.get('ticketId'))
  const assignee = String(formData.get('assignee') ?? '')

  const admin = createAdminClient()
  await admin
    .from('support_tickets')
    .update({ assigned_to: assignee === 'me' ? ctx.userId : assignee === 'unassign' ? null : assignee, updated_at: new Date().toISOString() })
    .eq('id', ticketId)
  await writeAudit(ctx, 'support.assign', { type: 'ticket', id: ticketId, metadata: { assignee } })
  revalidatePath(`/platform-admin/support/${ticketId}`)
  revalidatePath('/platform-admin/support')
}
