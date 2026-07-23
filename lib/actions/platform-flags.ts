'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { requirePlatformAdmin, can, writeAudit } from '@/lib/platform-admin/auth'

export async function upsertFlagAction(formData: FormData): Promise<void> {
  const ctx = await requirePlatformAdmin()
  if (!can(ctx, 'manage_feature_flags')) throw new Error('Forbidden')

  const key = String(formData.get('key') ?? '').trim().toLowerCase().replace(/[^a-z0-9_]/g, '_')
  const description = String(formData.get('description') ?? '').trim() || null
  if (!key) throw new Error('Key required')

  const admin = createAdminClient()
  await admin.from('feature_flags').upsert({ key, description }, { onConflict: 'key' })
  await writeAudit(ctx, 'feature_flag.upsert', { type: 'feature_flag', label: key })
  revalidatePath('/platform-admin/feature-flags')
}

export async function updateFlagAction(formData: FormData): Promise<void> {
  const ctx = await requirePlatformAdmin()
  if (!can(ctx, 'manage_feature_flags')) throw new Error('Forbidden')

  const key = String(formData.get('key'))
  const default_on = formData.get('default_on') === 'on'
  const rollout_pct = Math.max(0, Math.min(100, Number(formData.get('rollout_pct') ?? 0)))

  const admin = createAdminClient()
  await admin.from('feature_flags').update({ default_on, rollout_pct }).eq('key', key)
  await writeAudit(ctx, 'feature_flag.update', {
    type: 'feature_flag',
    label: key,
    metadata: { default_on, rollout_pct },
  })
  revalidatePath('/platform-admin/feature-flags')
}
