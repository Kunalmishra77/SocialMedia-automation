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

  // Logo: an uploaded file (preferred) or a pasted URL.
  let logoUrl = String(formData.get('logo_url') ?? '').trim()
  const logoFile = formData.get('logo_file') as File | null
  if (logoFile && typeof logoFile === 'object' && logoFile.size > 0) {
    if (logoFile.size > 5 * 1024 * 1024) return { error: 'Logo must be under 5 MB.' }
    const ext = (logoFile.name.split('.').pop() || 'png').toLowerCase()
    const path = `${workspaceId}/logo-${Date.now()}.${ext}`
    const { error: upErr } = await admin.storage.from('content-media').upload(path, logoFile, { contentType: logoFile.type || undefined, upsert: true })
    if (upErr) return { error: `Logo upload failed: ${upErr.message}` }
    logoUrl = admin.storage.from('content-media').getPublicUrl(path).data.publicUrl
  }

  const { data: ws } = await admin.from('workspaces').select('settings').eq('id', workspaceId).single()

  // Product photos: keep existing unless new ones are uploaded (or cleared).
  const existingProducts = (((ws?.settings as Record<string, unknown>)?.brand_profile as { product_images?: string[] } | undefined)?.product_images) ?? []
  let productImages = existingProducts
  if (formData.get('clear_products') === 'on') productImages = []
  const productFiles = formData.getAll('product_files').filter((f): f is File => f instanceof File && f.size > 0).slice(0, 4)
  if (productFiles.length) {
    productImages = []
    for (const pf of productFiles) {
      if (pf.size > 8 * 1024 * 1024) continue
      const ext = (pf.name.split('.').pop() || 'png').toLowerCase()
      const path = `${workspaceId}/product-${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
      const { error } = await admin.storage.from('content-media').upload(path, pf, { contentType: pf.type || undefined, upsert: false })
      if (!error) productImages.push(admin.storage.from('content-media').getPublicUrl(path).data.publicUrl)
    }
  }

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
    logo_url: logoUrl,
    website: String(formData.get('website') ?? '').trim(),
    phone: String(formData.get('phone') ?? '').trim(),
    handle: String(formData.get('handle') ?? '').trim(),
    theme: String(formData.get('theme') ?? 'bold').trim() || 'bold',
    imagery_style: String(formData.get('imagery_style') ?? 'real photo').trim() || 'real photo',
    product_images: productImages,
  }

  const settings = { ...((ws?.settings ?? {}) as Record<string, unknown>), brand_profile: profile }
  const { error } = await admin.from('workspaces').update({ settings }).eq('id', workspaceId)
  if (error) return { error: 'Could not save brand profile.' }
  revalidatePath('/settings/brand')
  return { ok: true }
}
