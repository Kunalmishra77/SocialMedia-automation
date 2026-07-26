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
  if (active.role === 'agent') throw new Error('Forbidden')
  return active.workspaceId
}

export async function createProductAction(formData: FormData): Promise<{ error?: string }> {
  const workspaceId = await ctx()
  const name = String(formData.get('name') ?? '').trim()
  const price = Number(formData.get('price') ?? 0) || null
  const sku = String(formData.get('sku') ?? '').trim() || null
  const product_url = String(formData.get('product_url') ?? '').trim() || null
  if (!name) return { error: 'Product name required' }

  const admin = createAdminClient()
  await admin.from('catalog_products').insert({ workspace_id: workspaceId, name, price, sku, product_url })
  revalidatePath('/commerce/products')
  return {}
}

export async function deleteProductAction(formData: FormData): Promise<void> {
  const workspaceId = await ctx()
  const id = String(formData.get('id'))
  const admin = createAdminClient()
  await admin.from('catalog_products').delete().eq('id', id).eq('workspace_id', workspaceId)
  revalidatePath('/commerce/products')
}
