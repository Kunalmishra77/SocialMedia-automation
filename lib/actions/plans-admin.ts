'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { requirePlatformAdmin, can, writeAudit } from '@/lib/platform-admin/auth'

function guard(ctx: Awaited<ReturnType<typeof requirePlatformAdmin>>) {
  if (!can(ctx, 'manage_billing') && ctx.role !== 'platform_owner') throw new Error('Forbidden')
}

function slugKey(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 30)
}

/** Create or update a plan (upsert on key). */
export async function upsertPlanAction(formData: FormData): Promise<void> {
  const ctx = await requirePlatformAdmin()
  guard(ctx)

  const rawKey = String(formData.get('key') ?? '').trim()
  const name = String(formData.get('name') ?? '').trim()
  const key = slugKey(rawKey || name)
  const price = Number(formData.get('price') ?? 0) || 0
  const tagline = String(formData.get('tagline') ?? '').trim()
  const features = String(formData.get('features') ?? '')
    .split('\n').map((f) => f.trim()).filter(Boolean)
  const highlight = String(formData.get('highlight') ?? '') === 'on'
  const sort = Number(formData.get('sort') ?? 0) || 0
  if (!key || name.length < 2) throw new Error('Key and name are required')

  const admin = createAdminClient()
  await admin.from('platform_plans').upsert(
    { key, name, price, tagline, features, highlight, sort, updated_at: new Date().toISOString() },
    { onConflict: 'key' },
  )
  await writeAudit(ctx, 'plan.upsert', { type: 'plan', id: key, label: name, metadata: { price } })
  revalidatePath('/platform-admin/plans')
}

export async function togglePlanActiveAction(formData: FormData): Promise<void> {
  const ctx = await requirePlatformAdmin()
  guard(ctx)
  const key = String(formData.get('key'))
  const active = String(formData.get('active')) === 'true'
  const admin = createAdminClient()
  await admin.from('platform_plans').update({ is_active: active, updated_at: new Date().toISOString() }).eq('key', key)
  await writeAudit(ctx, active ? 'plan.activate' : 'plan.disable', { type: 'plan', id: key })
  revalidatePath('/platform-admin/plans')
}

export async function archivePlanAction(formData: FormData): Promise<void> {
  const ctx = await requirePlatformAdmin()
  guard(ctx)
  const key = String(formData.get('key'))
  const admin = createAdminClient()
  await admin.from('platform_plans').update({ archived: true, is_active: false, updated_at: new Date().toISOString() }).eq('key', key)
  await writeAudit(ctx, 'plan.archive', { type: 'plan', id: key })
  revalidatePath('/platform-admin/plans')
}

export async function duplicatePlanAction(formData: FormData): Promise<void> {
  const ctx = await requirePlatformAdmin()
  guard(ctx)
  const key = String(formData.get('key'))
  const admin = createAdminClient()
  const { data: src } = await admin.from('platform_plans').select('*').eq('key', key).maybeSingle()
  if (!src) return
  let newKey = `${key}-copy`
  let n = 1
  while (true) {
    const { data } = await admin.from('platform_plans').select('key').eq('key', newKey).maybeSingle()
    if (!data) break
    n += 1
    newKey = `${key}-copy-${n}`
  }
  await admin.from('platform_plans').insert({
    key: newKey, name: `${src.name} (copy)`, price: src.price, tagline: src.tagline,
    features: src.features, highlight: false, is_active: false, sort: (src.sort ?? 0) + 1,
  })
  await writeAudit(ctx, 'plan.duplicate', { type: 'plan', id: newKey, metadata: { from: key } })
  revalidatePath('/platform-admin/plans')
}
