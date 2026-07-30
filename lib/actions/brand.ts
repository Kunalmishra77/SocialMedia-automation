'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import { getUser, getActiveMembership, roleCan } from '@/lib/authz'
import type { BrandProfile } from '@/lib/ai/brand'

async function requireManageBrand(): Promise<string> {
  const user = await getUser()
  if (!user) redirect('/login')
  const { active } = await getActiveMembership(user.id)
  if (!active) redirect('/workspace/new')
  if (!roleCan(active.role, 'manage_workspace') && active.role !== 'manager') throw new Error('Forbidden')
  return active.workspaceId
}

const csv = (v: FormDataEntryValue | null): string[] =>
  String(v ?? '').split(/[\n,]+/).map((s) => s.trim()).filter(Boolean)

/** Save the structured brand profile into workspaces.settings.brand_profile. */
export async function updateBrandProfileAction(formData: FormData): Promise<{ ok?: boolean; error?: string }> {
  const workspaceId = await requireManageBrand()
  const admin = createAdminClient()

  const { data: ws } = await admin.from('workspaces').select('settings').eq('id', workspaceId).single()

  const profile: BrandProfile = {
    business_name: String(formData.get('business_name') ?? '').trim(),
    industry: String(formData.get('industry') ?? '').trim(),
    target_audience: String(formData.get('target_audience') ?? '').trim(),
    brand_voice: String(formData.get('brand_voice') ?? '').trim(),
    content_style: String(formData.get('content_style') ?? '').trim(),
    language: String(formData.get('language') ?? '').trim() || 'English',
    products: String(formData.get('products') ?? '').trim(),
    topics_focus: csv(formData.get('topics_focus')),
    topics_avoid: csv(formData.get('topics_avoid')),
    default_cta: String(formData.get('default_cta') ?? '').trim(),
    competitors: String(formData.get('competitors') ?? '').trim(),
    objectives: String(formData.get('objectives') ?? '').trim(),
    brand_colors: csv(formData.get('brand_colors')).filter((c) => /^#?[0-9a-fA-F]{3,8}$/.test(c)).map((c) => (c.startsWith('#') ? c : `#${c}`)),
    logo_url: String(formData.get('logo_url') ?? '').trim(),
  }

  const settings = { ...((ws?.settings ?? {}) as Record<string, unknown>), brand_profile: profile }
  const { error } = await admin.from('workspaces').update({ settings }).eq('id', workspaceId)
  if (error) return { error: 'Could not save brand profile.' }
  revalidatePath('/settings/brand')
  return { ok: true }
}
