import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { verifyInternalCronCall } from '@/lib/cron-auth'
import { computeNextRun, generateFromPlan, type ContentPlan } from '@/lib/content/planner'

/** Generate AI posts for content plans that are due, then advance their schedule. */
export async function GET(req: NextRequest) {
  try {
    verifyInternalCronCall(req)
  } catch {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  const admin = createAdminClient()
  const now = new Date()

  const { data: due } = await admin
    .from('content_plans')
    .select('*')
    .eq('is_active', true)
    .lte('next_run_at', now.toISOString())
    .limit(20)

  let generated = 0
  let failed = 0

  for (const plan of (due ?? []) as ContentPlan[]) {
    // Publish/queue at the slot that just came due.
    const slot = plan.next_run_at ? new Date(plan.next_run_at) : now
    const res = await generateFromPlan(admin, plan, { scheduledAt: slot })
    if (res.error) failed++
    else generated++

    // Advance regardless so a single failure doesn't jam the plan.
    await admin
      .from('content_plans')
      .update({ last_run_at: now.toISOString(), next_run_at: computeNextRun(plan, now).toISOString() })
      .eq('id', plan.id)
  }

  return NextResponse.json({ ok: true, generated, failed, due: due?.length ?? 0 })
}
