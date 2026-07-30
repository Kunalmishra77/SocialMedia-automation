'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import { getUser, getActiveMembership, roleCan } from '@/lib/authz'
import { computeNextRun, generateFromPlan, type ContentPlan } from '@/lib/content/planner'

async function ctx() {
  const user = await getUser()
  if (!user) redirect('/login')
  const { active } = await getActiveMembership(user.id)
  if (!active) redirect('/workspace/new')
  if (!roleCan(active.role, 'manage_content') && active.role !== 'manager') throw new Error('Forbidden')
  return { user, workspaceId: active.workspaceId }
}

function parsePlan(fd: FormData) {
  const platforms = fd.getAll('platforms').map(String).filter(Boolean)
  const days = fd.getAll('days_of_week').map((d) => Number(d)).filter((n) => !isNaN(n))
  const frequency = String(fd.get('frequency') ?? 'daily') === 'weekly' ? 'weekly' : 'daily'
  return {
    name: String(fd.get('name') ?? '').trim() || 'Content plan',
    platforms: platforms.length ? platforms : ['instagram'],
    frequency,
    days_of_week: frequency === 'weekly' ? days : [],
    time_of_day: /^\d{2}:\d{2}$/.test(String(fd.get('time_of_day'))) ? String(fd.get('time_of_day')) : '09:00',
    timezone: String(fd.get('timezone') ?? '').trim() || 'Asia/Kolkata',
    themes: String(fd.get('themes') ?? '').trim() || null,
    mode: String(fd.get('mode') ?? 'manual') === 'autopilot' ? 'autopilot' : 'manual',
  }
}

export async function createPlanAction(fd: FormData): Promise<{ error?: string }> {
  const { user, workspaceId } = await ctx()
  const p = parsePlan(fd)
  const admin = createAdminClient()
  const next = computeNextRun(p, new Date())
  const { error } = await admin.from('content_plans').insert({
    workspace_id: workspaceId, ...p, next_run_at: next.toISOString(), created_by: user.id,
  })
  if (error) return { error: 'Could not create plan.' }
  revalidatePath('/content/plans')
  return {}
}

export async function updatePlanAction(fd: FormData): Promise<{ error?: string }> {
  const { workspaceId } = await ctx()
  const id = String(fd.get('id') ?? '')
  if (!id) return { error: 'Missing plan.' }
  const p = parsePlan(fd)
  const admin = createAdminClient()
  const next = computeNextRun(p, new Date())
  const { error } = await admin
    .from('content_plans')
    .update({ ...p, next_run_at: next.toISOString() })
    .eq('id', id)
    .eq('workspace_id', workspaceId)
  if (error) return { error: 'Could not update plan.' }
  revalidatePath('/content/plans')
  return {}
}

export async function togglePlanAction(fd: FormData): Promise<void> {
  const { workspaceId } = await ctx()
  const id = String(fd.get('id') ?? '')
  const active = fd.get('is_active') === 'true'
  const admin = createAdminClient()
  const update: Record<string, unknown> = { is_active: active }
  if (active) {
    const { data: plan } = await admin.from('content_plans').select('frequency, days_of_week, time_of_day, timezone').eq('id', id).eq('workspace_id', workspaceId).maybeSingle()
    if (plan) update.next_run_at = computeNextRun(plan, new Date()).toISOString()
  }
  await admin.from('content_plans').update(update).eq('id', id).eq('workspace_id', workspaceId)
  revalidatePath('/content/plans')
}

export async function deletePlanAction(fd: FormData): Promise<void> {
  const { workspaceId } = await ctx()
  const id = String(fd.get('id') ?? '')
  const admin = createAdminClient()
  await admin.from('content_plans').delete().eq('id', id).eq('workspace_id', workspaceId)
  revalidatePath('/content/plans')
}

/** Generate one post from a plan right now (for testing / on-demand). */
export async function generateNowAction(planId: string): Promise<{ ok?: boolean; brief?: string; error?: string }> {
  const { workspaceId } = await ctx()
  const admin = createAdminClient()
  const { data: plan } = await admin.from('content_plans').select('*').eq('id', planId).eq('workspace_id', workspaceId).maybeSingle()
  if (!plan) return { error: 'Plan not found.' }
  const res = await generateFromPlan(admin, plan as ContentPlan, { scheduledAt: new Date(Date.now() + 5 * 60 * 1000) })
  if (res.error) return { error: res.error }
  revalidatePath('/content')
  revalidatePath('/content/plans')
  return { ok: true, brief: res.brief }
}
