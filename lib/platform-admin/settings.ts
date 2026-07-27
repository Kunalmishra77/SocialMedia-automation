import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'

export interface PlatformSettings {
  branding: { platformName: string; supportEmail: string }
  ai: { defaultModel: string; fallbackModel: string }
  billing: { currency: string; taxPct: number }
  maintenance: { enabled: boolean; message: string }
}

export const DEFAULT_SETTINGS: PlatformSettings = {
  branding: { platformName: 'Socialflow', supportEmail: 'support@socialflow.app' },
  ai: { defaultModel: 'gpt-4o-mini', fallbackModel: 'gpt-4o' },
  billing: { currency: 'INR', taxPct: 18 },
  maintenance: { enabled: false, message: 'We are performing scheduled maintenance. Back shortly.' },
}

export async function getPlatformSettings(): Promise<PlatformSettings> {
  const admin = createAdminClient()
  const { data } = await admin.from('platform_settings').select('key, value')
  const map: Record<string, Record<string, unknown>> = {}
  for (const row of data ?? []) map[row.key as string] = (row.value as Record<string, unknown>) ?? {}
  return {
    branding: { ...DEFAULT_SETTINGS.branding, ...(map.branding ?? {}) },
    ai: { ...DEFAULT_SETTINGS.ai, ...(map.ai ?? {}) },
    billing: { ...DEFAULT_SETTINGS.billing, ...(map.billing ?? {}) },
    maintenance: { ...DEFAULT_SETTINGS.maintenance, ...(map.maintenance ?? {}) },
  } as PlatformSettings
}
