import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'
import { PLAN_CATALOG, planByKey, type PlanOption } from '@/lib/plans'

// DB-backed subscription catalog (editable in the super-admin console).
// Falls back to PLAN_CATALOG if the table is empty/unavailable, so the runtime
// is safe even before migration 0016 runs.

interface PlanRow {
  key: string; name: string; price: number; tagline: string | null
  features: string[]; highlight: boolean; is_active: boolean; archived: boolean; sort: number
}

function rowToOption(r: PlanRow): PlanOption {
  return { key: r.key, name: r.name, price: Number(r.price), tagline: r.tagline ?? '', features: r.features ?? [], highlight: r.highlight }
}

/** All active, non-archived plans, ordered — for onboarding/billing display. */
export async function getActivePlans(): Promise<PlanOption[]> {
  try {
    const admin = createAdminClient()
    const { data } = await admin
      .from('platform_plans')
      .select('key, name, price, tagline, features, highlight, is_active, archived, sort')
      .eq('is_active', true).eq('archived', false)
      .order('sort')
    if (data && data.length) return (data as PlanRow[]).map(rowToOption)
  } catch { /* fall through */ }
  return PLAN_CATALOG
}

/** Single plan by key (includes archived/inactive) — for pricing a purchase. */
export async function getPlan(key: string): Promise<PlanOption | undefined> {
  try {
    const admin = createAdminClient()
    const { data } = await admin
      .from('platform_plans')
      .select('key, name, price, tagline, features, highlight, is_active, archived, sort')
      .eq('key', key).maybeSingle()
    if (data) return rowToOption(data as PlanRow)
  } catch { /* fall through */ }
  return planByKey(key)
}

/** key → price map for revenue math. */
export async function getPlanPriceMap(): Promise<Record<string, number>> {
  const map: Record<string, number> = {}
  for (const p of PLAN_CATALOG) map[p.key] = p.price
  try {
    const admin = createAdminClient()
    const { data } = await admin.from('platform_plans').select('key, price')
    for (const r of data ?? []) map[r.key as string] = Number(r.price)
  } catch { /* keep static */ }
  return map
}
