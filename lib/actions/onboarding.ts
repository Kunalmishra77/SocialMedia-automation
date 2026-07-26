'use server'

import { randomBytes } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { requirePlatformAdmin, can, writeAudit } from '@/lib/platform-admin/auth'
import { planByKey } from '@/lib/plans'
import { encrypt } from '@/lib/crypto'
import { sendMail, credentialsEmailHtml } from '@/lib/email'

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'client'
}
function genPassword(): string {
  return randomBytes(4).toString('hex') + 'A' + randomBytes(3).toString('hex') + '9!'
}
function baseUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
}

/** Super Admin: create a client shell in 'onboarding' + generate the onboarding link. */
export async function createClientOnboardingAction(
  _prev: { error?: string; onboardUrl?: string },
  formData: FormData,
): Promise<{ error?: string; onboardUrl?: string }> {
  const ctx = await requirePlatformAdmin()
  if (!can(ctx, 'manage_workspaces')) throw new Error('Forbidden')

  const workspaceName = String(formData.get('workspaceName') ?? '').trim()
  const ownerEmail = String(formData.get('ownerEmail') ?? '').trim().toLowerCase()
  const ownerName = String(formData.get('ownerName') ?? '').trim() || null
  const ownerPhone = String(formData.get('ownerPhone') ?? '').trim() || null
  const company = String(formData.get('company') ?? '').trim() || null
  if (workspaceName.length < 2) return { error: 'Workspace name is too short' }
  if (!ownerEmail.includes('@')) return { error: 'Valid owner email required' }

  const admin = createAdminClient()
  const base = slugify(workspaceName)
  let slug = base
  let n = 1
  while (true) {
    const { data } = await admin.from('workspaces').select('id').eq('slug', slug).maybeSingle()
    if (!data) break
    n += 1
    slug = `${base}-${n}`
  }

  const token = randomBytes(24).toString('hex')
  const { data: ws, error } = await admin
    .from('workspaces')
    .insert({
      name: workspaceName,
      slug,
      plan: 'free',
      status: 'onboarding',
      owner_email: ownerEmail,
      owner_name: ownerName,
      owner_phone: ownerPhone,
      company,
      onboarding_token: token,
    })
    .select('id')
    .single()
  if (error || !ws) return { error: error?.message ?? 'Could not create client' }

  await writeAudit(ctx, 'client.onboarding_created', {
    type: 'workspace', id: ws.id, label: workspaceName, metadata: { ownerEmail },
  })
  revalidatePath('/platform-admin/workspaces')
  return { onboardUrl: `${baseUrl()}/onboard/${token}` }
}

/** Public: read onboarding state by token (no auth). */
export async function getOnboardingState(token: string): Promise<{
  ok: boolean
  workspaceName?: string
  ownerEmail?: string
  status?: string
  selectedPlan?: string | null
  reason?: string
} > {
  const admin = createAdminClient()
  const { data: ws } = await admin
    .from('workspaces')
    .select('name, owner_email, status, selected_plan')
    .eq('onboarding_token', token)
    .maybeSingle()
  if (!ws) return { ok: false, reason: 'This onboarding link is invalid.' }
  return {
    ok: true,
    workspaceName: ws.name,
    ownerEmail: ws.owner_email ?? undefined,
    status: ws.status,
    selectedPlan: ws.selected_plan,
  }
}

/** Public: client submits plan + demo payment → pending approval. */
export async function submitOnboardingAction(
  _prev: { error?: string; ok?: boolean },
  formData: FormData,
): Promise<{ error?: string; ok?: boolean }> {
  const token = String(formData.get('token'))
  const planKey = String(formData.get('plan'))
  const plan = planByKey(planKey)
  if (!plan) return { error: 'Please choose a plan' }

  const admin = createAdminClient()
  const { data: ws } = await admin
    .from('workspaces')
    .select('id, status')
    .eq('onboarding_token', token)
    .maybeSingle()
  if (!ws) return { error: 'Invalid link' }
  if (ws.status !== 'onboarding') return { error: 'This application was already submitted.' }

  // Optional client-provided app credentials (hybrid model) — stored encrypted.
  const metaAppId = String(formData.get('meta_app_id') ?? '').trim()
  const metaAppSecret = String(formData.get('meta_app_secret') ?? '').trim()
  if (metaAppId) {
    await admin.from('client_credentials').upsert(
      { workspace_id: ws.id, provider: 'meta', key_name: 'app_id', value_encrypted: encrypt(metaAppId) },
      { onConflict: 'workspace_id,provider,key_name' },
    )
  }
  if (metaAppSecret) {
    await admin.from('client_credentials').upsert(
      { workspace_id: ws.id, provider: 'meta', key_name: 'app_secret', value_encrypted: encrypt(metaAppSecret) },
      { onConflict: 'workspace_id,provider,key_name' },
    )
  }

  await admin
    .from('workspaces')
    .update({
      selected_plan: plan.key,
      payment_status: 'demo_paid',
      payment_amount: plan.price,
      status: 'pending_approval',
      submitted_at: new Date().toISOString(),
      onboarding_data: { plan: plan.key, price: plan.price, demo_payment: true },
    })
    .eq('id', ws.id)

  revalidatePath('/platform-admin/approvals')
  return { ok: true }
}

/** Super Admin: approve a pending client → activate + create owner user + email credentials. */
export async function approveClientAction(formData: FormData): Promise<void> {
  const ctx = await requirePlatformAdmin()
  if (!can(ctx, 'manage_workspaces')) throw new Error('Forbidden')

  const workspaceId = String(formData.get('workspaceId'))
  const admin = createAdminClient()
  const { data: ws } = await admin
    .from('workspaces')
    .select('id, name, owner_email, status, selected_plan')
    .eq('id', workspaceId)
    .maybeSingle()
  if (!ws || ws.status !== 'pending_approval' || !ws.owner_email) return

  // Create or reuse the owner user with a fresh password.
  const password = genPassword()
  let userId: string
  const { data: existing } = await admin.from('profiles').select('id').eq('email', ws.owner_email).maybeSingle()
  if (existing) {
    userId = existing.id
    await admin.auth.admin.updateUserById(userId, { password })
  } else {
    const { data: created, error } = await admin.auth.admin.createUser({
      email: ws.owner_email,
      password,
      email_confirm: true,
    })
    if (error || !created.user) return
    userId = created.user.id
  }

  await admin
    .from('workspace_members')
    .upsert({ workspace_id: workspaceId, user_id: userId, role: 'super_admin' }, { onConflict: 'workspace_id,user_id' })

  const loginUrl = `${baseUrl()}/login`
  await admin
    .from('workspaces')
    .update({
      status: 'active',
      plan: ws.selected_plan ?? 'pro',
      approved_at: new Date().toISOString(),
      approved_by: ctx.userId,
      onboarding_data: { approved_credentials: { email: ws.owner_email, password, loginUrl } },
    })
    .eq('id', workspaceId)

  await sendMail({
    to: ws.owner_email,
    subject: `Your Socialflow workspace "${ws.name}" is live 🎉`,
    html: credentialsEmailHtml({ workspaceName: ws.name, email: ws.owner_email, password, loginUrl }),
  })

  await writeAudit(ctx, 'client.approve', {
    type: 'workspace', id: workspaceId, label: ws.name, metadata: { plan: ws.selected_plan },
  })
  revalidatePath('/platform-admin/approvals')
  revalidatePath('/platform-admin/workspaces')
}
