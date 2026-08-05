'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import { getUser, getActiveMembership, roleCan } from '@/lib/authz'
import { getPlan } from '@/lib/plans-server'

/** Client self-serve plan change (demo — no gateway). Real billing via Razorpay later. */
export async function changePlanAction(formData: FormData): Promise<void> {
  const user = await getUser()
  if (!user) redirect('/login')
  const { active } = await getActiveMembership(user.id)
  if (!active) redirect('/workspace/new')
  if (!roleCan(active.role, 'billing')) throw new Error('Forbidden')

  const planKey = String(formData.get('plan'))
  const plan = await getPlan(planKey)
  if (!plan) return

  const admin = createAdminClient()
  // Keep subscription state coherent so the billing page reflects reality: a plan
  // change (re)activates the subscription and sets the next billing date 30 days out.
  const nextBilling = new Date(Date.now() + 30 * 86400_000).toISOString()
  await admin
    .from('workspaces')
    .update({
      plan: plan.key,
      selected_plan: plan.key,
      payment_amount: plan.price,
      subscription_status: 'active',
      next_billing_date: nextBilling,
    })
    .eq('id', active.workspaceId)
  revalidatePath('/settings/billing')
}
