'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { requirePlatformAdmin, can, writeAudit } from '@/lib/platform-admin/auth'

/** Upsert one platform_settings key. Value is rebuilt from the posted fields. */
export async function updatePlatformSettingAction(formData: FormData): Promise<void> {
  const ctx = await requirePlatformAdmin()
  if (!can(ctx, 'manage_feature_flags') && ctx.role !== 'platform_owner') throw new Error('Forbidden')

  const key = String(formData.get('__key') ?? '')
  if (!['branding', 'ai', 'billing', 'maintenance'].includes(key)) throw new Error('Invalid settings key')

  let value: Record<string, unknown>
  switch (key) {
    case 'branding':
      value = { platformName: String(formData.get('platformName') ?? '').trim(), supportEmail: String(formData.get('supportEmail') ?? '').trim() }
      break
    case 'ai':
      value = { defaultModel: String(formData.get('defaultModel') ?? '').trim(), fallbackModel: String(formData.get('fallbackModel') ?? '').trim() }
      break
    case 'billing':
      value = { currency: String(formData.get('currency') ?? 'INR').trim(), taxPct: Number(formData.get('taxPct') ?? 18) || 0 }
      break
    case 'maintenance':
      value = { enabled: String(formData.get('enabled') ?? '') === 'on', message: String(formData.get('message') ?? '').trim() }
      break
    default:
      throw new Error('Invalid settings key')
  }

  const admin = createAdminClient()
  await admin.from('platform_settings').upsert(
    { key, value, updated_at: new Date().toISOString(), updated_by: ctx.userId },
    { onConflict: 'key' },
  )
  await writeAudit(ctx, 'settings.update', { type: 'settings', label: key, metadata: value })
  revalidatePath('/platform-admin/settings')
}
