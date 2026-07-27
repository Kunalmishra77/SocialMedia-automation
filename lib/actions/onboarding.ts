'use server'

import { randomBytes } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { requirePlatformAdmin, can, writeAudit } from '@/lib/platform-admin/auth'
import { getPlan } from '@/lib/plans-server'
import { encrypt } from '@/lib/crypto'
import { sendMail, setPasswordEmailHtml } from '@/lib/email'
import { provisionOwnerWithSetPasswordLink } from '@/lib/auth-provisioning'
import { razorpayConfigured, razorpayKeyId, createOrder, verifyPaymentSignature } from '@/lib/billing/razorpay'

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'client'
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

// field name → (provider, key_name) for encrypted storage
const CRED_MAP: Record<string, { provider: string; key: string }> = {
  meta_app_id: { provider: 'meta', key: 'app_id' },
  meta_app_secret: { provider: 'meta', key: 'app_secret' },
  telegram_bot_token: { provider: 'telegram', key: 'bot_token' },
}

async function persistSelection(
  admin: ReturnType<typeof createAdminClient>,
  workspaceId: string,
  platformsCsv: string,
  credsJson: string,
): Promise<string[]> {
  const platforms = platformsCsv ? platformsCsv.split(',').map((p) => p.trim()).filter(Boolean) : []
  let creds: Record<string, string> = {}
  try { creds = JSON.parse(credsJson || '{}') } catch { creds = {} }
  for (const [field, value] of Object.entries(creds)) {
    const v = String(value ?? '').trim()
    const m = CRED_MAP[field]
    if (!v || !m) continue
    await admin.from('client_credentials').upsert(
      { workspace_id: workspaceId, provider: m.provider, key_name: m.key, value_encrypted: encrypt(v) },
      { onConflict: 'workspace_id,provider,key_name' },
    )
  }
  return platforms
}

/** Public: client submits platforms + credentials + plan + demo payment → pending approval. */
export async function submitOnboardingAction(
  _prev: { error?: string; ok?: boolean },
  formData: FormData,
): Promise<{ error?: string; ok?: boolean }> {
  const token = String(formData.get('token'))
  const planKey = String(formData.get('plan'))
  const plan = await getPlan(planKey)
  if (!plan) return { error: 'Please choose a plan' }

  const admin = createAdminClient()
  const { data: ws } = await admin
    .from('workspaces')
    .select('id, status')
    .eq('onboarding_token', token)
    .maybeSingle()
  if (!ws) return { error: 'Invalid link' }
  if (ws.status !== 'onboarding') return { error: 'This application was already submitted.' }

  const platforms = await persistSelection(
    admin, ws.id, String(formData.get('platforms') ?? ''), String(formData.get('credentials') ?? '{}'),
  )

  await admin
    .from('workspaces')
    .update({
      selected_plan: plan.key,
      selected_platforms: platforms,
      payment_status: 'demo_paid',
      payment_amount: plan.price,
      status: 'pending_approval',
      submitted_at: new Date().toISOString(),
      onboarding_data: { plan: plan.key, price: plan.price, demo_payment: true, platforms },
    })
    .eq('id', ws.id)

  revalidatePath('/platform-admin/approvals')
  return { ok: true }
}

/** Create a Razorpay order for the onboarding payment (or signal demo mode). */
export async function createPaymentOrderAction(
  token: string,
  planKey: string,
): Promise<{ demo: boolean; orderId?: string; amount?: number; keyId?: string; error?: string }> {
  const plan = await getPlan(planKey)
  if (!plan) return { demo: true, error: 'Invalid plan' }
  if (!razorpayConfigured()) return { demo: true }

  const admin = createAdminClient()
  const { data: ws } = await admin.from('workspaces').select('id, status').eq('onboarding_token', token).maybeSingle()
  if (!ws || ws.status !== 'onboarding') return { demo: true, error: 'Invalid link' }

  const order = await createOrder(plan.price, { workspaceId: ws.id, plan: plan.key })
  if (!order) return { demo: true }
  return { demo: false, orderId: order.id, amount: order.amount, keyId: razorpayKeyId() }
}

/** Confirm a Razorpay Checkout success (verify signature) → pending approval. */
export async function confirmRazorpayPaymentAction(
  _prev: { error?: string; ok?: boolean },
  formData: FormData,
): Promise<{ error?: string; ok?: boolean }> {
  const token = String(formData.get('token'))
  const planKey = String(formData.get('plan'))
  const orderId = String(formData.get('razorpay_order_id'))
  const paymentId = String(formData.get('razorpay_payment_id'))
  const signature = String(formData.get('razorpay_signature'))
  const plan = await getPlan(planKey)
  if (!plan) return { error: 'Invalid plan' }
  if (!verifyPaymentSignature(orderId, paymentId, signature)) return { error: 'Payment verification failed' }

  const admin = createAdminClient()
  const { data: ws } = await admin.from('workspaces').select('id, status').eq('onboarding_token', token).maybeSingle()
  if (!ws || ws.status !== 'onboarding') return { error: 'Already submitted' }

  const platforms = await persistSelection(
    admin, ws.id, String(formData.get('platforms') ?? ''), String(formData.get('credentials') ?? '{}'),
  )

  await admin.from('workspaces').update({
    selected_plan: plan.key,
    selected_platforms: platforms,
    payment_status: 'paid',
    payment_amount: plan.price,
    status: 'pending_approval',
    submitted_at: new Date().toISOString(),
    onboarding_data: { plan: plan.key, price: plan.price, platforms, razorpay_order_id: orderId, razorpay_payment_id: paymentId },
  }).eq('id', ws.id)

  revalidatePath('/platform-admin/approvals')
  return { ok: true }
}

/** Super Admin: reject/return a pending application (client can resubmit via the same link). */
export async function rejectClientAction(formData: FormData): Promise<void> {
  const ctx = await requirePlatformAdmin()
  if (!can(ctx, 'manage_workspaces')) throw new Error('Forbidden')
  const workspaceId = String(formData.get('workspaceId'))
  const reason = String(formData.get('reason') ?? '').trim() || null
  const admin = createAdminClient()
  const { data: ws } = await admin.from('workspaces').select('name, onboarding_data').eq('id', workspaceId).maybeSingle()
  await admin.from('workspaces').update({
    status: 'onboarding',
    onboarding_data: { ...(ws?.onboarding_data as object ?? {}), rejected_reason: reason, rejected_at: new Date().toISOString() },
  }).eq('id', workspaceId)
  await writeAudit(ctx, 'client.reject', { type: 'workspace', id: workspaceId, label: ws?.name ?? undefined, metadata: { reason } })
  revalidatePath('/platform-admin/approvals')
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

  // Create/reuse the owner user WITHOUT a plaintext password and mint a secure
  // one-time set-password link. No password is ever emailed or stored.
  const prov = await provisionOwnerWithSetPasswordLink(admin, ws.owner_email)
  if (!prov) return

  await admin
    .from('workspace_members')
    .upsert({ workspace_id: workspaceId, user_id: prov.userId, role: 'super_admin' }, { onConflict: 'workspace_id,user_id' })

  await admin
    .from('workspaces')
    .update({
      status: 'active',
      plan: ws.selected_plan ?? 'pro',
      approved_at: new Date().toISOString(),
      approved_by: ctx.userId,
      // Store the one-time set-password link (expiring) for manual re-share, never a password.
      onboarding_data: { activation: { email: ws.owner_email, setPasswordUrl: prov.setPasswordUrl, sentAt: new Date().toISOString() } },
    })
    .eq('id', workspaceId)

  if (prov.setPasswordUrl) {
    await sendMail({
      to: ws.owner_email,
      subject: `Your Socialflow workspace "${ws.name}" is live 🎉`,
      html: setPasswordEmailHtml({ workspaceName: ws.name, email: ws.owner_email, setPasswordUrl: prov.setPasswordUrl }),
    })
  }

  await writeAudit(ctx, 'client.approve', {
    type: 'workspace', id: workspaceId, label: ws.name, metadata: { plan: ws.selected_plan },
  })
  revalidatePath('/platform-admin/approvals')
  revalidatePath('/platform-admin/workspaces')
}
