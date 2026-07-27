'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { requirePlatformAdmin, can, writeAudit } from '@/lib/platform-admin/auth'

/** Set a per-workspace override for a feature flag. */
export async function setFlagOverrideAction(formData: FormData): Promise<void> {
  const ctx = await requirePlatformAdmin()
  if (!can(ctx, 'manage_feature_flags')) throw new Error('Forbidden')
  const flagKey = String(formData.get('flag_key') ?? '')
  const workspaceId = String(formData.get('workspace_id') ?? '')
  const enabled = String(formData.get('enabled') ?? 'true') === 'true'
  if (!flagKey || !workspaceId) return
  const admin = createAdminClient()
  await admin.from('feature_flag_overrides').upsert({ flag_key: flagKey, workspace_id: workspaceId, enabled }, { onConflict: 'flag_key,workspace_id' })
  await writeAudit(ctx, 'feature_flag.override', { type: 'feature_flag', label: flagKey, metadata: { workspaceId, enabled } })
  revalidatePath('/platform-admin/feature-flags')
}

export async function removeFlagOverrideAction(formData: FormData): Promise<void> {
  const ctx = await requirePlatformAdmin()
  if (!can(ctx, 'manage_feature_flags')) throw new Error('Forbidden')
  const flagKey = String(formData.get('flag_key') ?? '')
  const workspaceId = String(formData.get('workspace_id') ?? '')
  const admin = createAdminClient()
  await admin.from('feature_flag_overrides').delete().eq('flag_key', flagKey).eq('workspace_id', workspaceId)
  await writeAudit(ctx, 'feature_flag.override_remove', { type: 'feature_flag', label: flagKey, metadata: { workspaceId } })
  revalidatePath('/platform-admin/feature-flags')
}

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
