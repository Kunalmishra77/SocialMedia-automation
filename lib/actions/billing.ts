'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import { getUser, getActiveMembership, roleCan } from '@/lib/authz'
import { planByKey } from '@/lib/plans'

/** Client self-serve plan change (demo — no gateway). Real billing via Razorpay later. */
export async function changePlanAction(formData: FormData): Promise<void> {
  const user = await getUser()
  if (!user) redirect('/login')
  const { active } = await getActiveMembership(user.id)
  if (!active) redirect('/workspace/new')
  if (!roleCan(active.role, 'billing')) throw new Error('Forbidden')

  const planKey = String(formData.get('plan'))
  const plan = planByKey(planKey)
  if (!plan) return

  const admin = createAdminClient()
  await admin
    .from('workspaces')
    .update({ plan: plan.key, selected_plan: plan.key, payment_amount: plan.price })
    .eq('id', active.workspaceId)
  revalidatePath('/settings/billing')
}
