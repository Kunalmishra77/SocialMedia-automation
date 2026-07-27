'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import { getUser, getActiveMembership } from '@/lib/authz'

async function ctx() {
  const user = await getUser()
  if (!user) redirect('/login')
  const { active } = await getActiveMembership(user.id)
  if (!active) redirect('/workspace/new')
  return active.workspaceId
}

export async function createBookingAction(formData: FormData): Promise<{ error?: string }> {
  const workspaceId = await ctx()
  const name = String(formData.get('name') ?? '').trim()
  const service = String(formData.get('service') ?? '').trim() || null
  const startsAt = String(formData.get('starts_at') ?? '').trim()
  const phone = String(formData.get('phone') ?? '').trim() || null
  const email = String(formData.get('email') ?? '').trim() || null
  if (!name || !startsAt) return { error: 'Name and date/time required' }

  const admin = createAdminClient()
  await admin.from('bookings').insert({
    workspace_id: workspaceId, name, service, phone, email,
    starts_at: new Date(startsAt).toISOString(), status: 'booked',
  })
  revalidatePath('/bookings')
  return {}
}

export async function updateBookingStatusAction(formData: FormData): Promise<void> {
  const workspaceId = await ctx()
  const id = String(formData.get('id'))
  const status = String(formData.get('status'))
  const admin = createAdminClient()
  await admin.from('bookings').update({ status }).eq('id', id).eq('workspace_id', workspaceId)
  revalidatePath('/bookings')
}
