'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { requirePlatformAdmin, can, writeAudit } from '@/lib/platform-admin/auth'

const VALID_ROLES = ['platform_owner', 'platform_admin', 'platform_support', 'platform_billing']

/** Grant platform-admin access to an existing user by email. */
export async function addPlatformAdminAction(formData: FormData): Promise<{ error?: string }> {
  const ctx = await requirePlatformAdmin()
  if (!can(ctx, 'manage_platform_admins')) throw new Error('Forbidden')

  const email = String(formData.get('email') ?? '').trim().toLowerCase()
  const role = String(formData.get('role') ?? 'platform_support')
  if (!email || !VALID_ROLES.includes(role)) return { error: 'Valid email and role required' }

  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('profiles')
    .select('id, email')
    .eq('email', email)
    .maybeSingle()
  if (!profile) return { error: 'No user with that email. They must sign up first.' }

  await admin
    .from('platform_admins')
    .upsert(
      { user_id: profile.id, email: profile.email, role, is_active: true },
      { onConflict: 'user_id' },
    )
  await admin.from('profiles').update({ is_platform_admin: true }).eq('id', profile.id)

  await writeAudit(ctx, 'platform_admin.grant', { type: 'user', id: profile.id, label: email, metadata: { role } })
  revalidatePath('/platform-admin/admins')
  return {}
}

export async function setPlatformAdminActiveAction(formData: FormData): Promise<void> {
  const ctx = await requirePlatformAdmin()
  if (!can(ctx, 'manage_platform_admins')) throw new Error('Forbidden')

  const id = String(formData.get('id'))
  const active = formData.get('active') === 'true'

  const admin = createAdminClient()
  const { data: row } = await admin
    .from('platform_admins')
    .update({ is_active: active })
    .eq('id', id)
    .select('email')
    .maybeSingle()

  await writeAudit(ctx, active ? 'platform_admin.enable' : 'platform_admin.disable', {
    type: 'platform_admin',
    id,
    label: row?.email,
  })
  revalidatePath('/platform-admin/admins')
}
