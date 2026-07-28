import { notFound } from 'next/navigation'
import { IndianRupee, Copy, Archive, Plus } from 'lucide-react'
import { requirePlatformAdmin, can } from '@/lib/platform-admin/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { upsertPlanAction, togglePlanActiveAction, archivePlanAction, duplicatePlanAction } from '@/lib/actions/plans-admin'
import { PageHeader, Panel, inr } from '../ui'

interface PlanRow {
  key: string; name: string; price: number; tagline: string | null
  features: string[]; highlight: boolean; is_active: boolean; archived: boolean; sort: number
}

const field = 'h-9 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground'
const label = 'mb-1 block text-xs text-muted-foreground'

function PlanForm({ p }: { p?: PlanRow }) {
  return (
    <form action={upsertPlanAction} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className={label}>Key {p && <span className="text-muted-foreground">(locked)</span>}</label>
          <input name="key" defaultValue={p?.key} readOnly={!!p} placeholder="growth" className={`${field} ${p ? 'text-muted-foreground' : ''}`} />
        </div>
        <div>
          <label className={label}>Name</label>
          <input name="name" defaultValue={p?.name} required placeholder="Growth" className={field} />
        </div>
        <div>
          <label className={label}>Price (₹/mo)</label>
          <input name="price" type="number" step="1" defaultValue={p?.price ?? 0} className={field} />
        </div>
        <div>
          <label className={label}>Sort order</label>
          <input name="sort" type="number" defaultValue={p?.sort ?? 0} className={field} />
        </div>
      </div>
      <div>
        <label className={label}>Tagline</label>
        <input name="tagline" defaultValue={p?.tagline ?? ''} placeholder="For growing brands" className={field} />
      </div>
      <div>
        <label className={label}>Features (one per line)</label>
        <textarea name="features" rows={4} defaultValue={(p?.features ?? []).join('\n')} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground" />
      </div>
      <div className="flex items-center justify-between">
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <input type="checkbox" name="highlight" defaultChecked={p?.highlight} className="accent-[#ea6a24]" /> Highlight as popular
        </label>
        <button className="h-9 rounded-md bg-[#ea6a24] px-4 text-sm font-medium text-white hover:bg-[#ea6a24]">{p ? 'Save' : 'Create plan'}</button>
      </div>
    </form>
  )
}

export default async function PlansPage() {
  const ctx = await requirePlatformAdmin()
  if (!can(ctx, 'manage_billing') && ctx.role !== 'platform_owner') notFound()

  const admin = createAdminClient()
  const { data } = await admin.from('platform_plans').select('*').order('sort')
  const plans = (data ?? []) as PlanRow[]

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader title="Plans" subtitle="Subscription catalog. Edits drive onboarding, billing and revenue instantly." />

      <div className="space-y-4">
        {plans.map((p) => (
          <Panel key={p.key} title={undefined}>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="text-base font-semibold text-foreground">{p.name}</span>
                <span className="flex items-center gap-0.5 text-sm text-[#ea6a24]"><IndianRupee className="h-3.5 w-3.5" />{inr(Number(p.price)).replace('₹', '')}/mo</span>
                {p.highlight && <span className="rounded-full bg-[#ea6a24]/15 px-2 py-0.5 text-[10px] font-medium text-[#ea6a24]">popular</span>}
                {p.archived ? <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">archived</span>
                  : p.is_active ? <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] text-emerald-400">active</span>
                  : <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] text-amber-400">hidden</span>}
              </div>
              <div className="flex items-center gap-1">
                {!p.archived && (
                  <form action={togglePlanActiveAction}>
                    <input type="hidden" name="key" value={p.key} />
                    <input type="hidden" name="active" value={p.is_active ? 'false' : 'true'} />
                    <button className="rounded-md bg-muted px-2 py-1 text-xs text-foreground hover:bg-muted">{p.is_active ? 'Hide' : 'Show'}</button>
                  </form>
                )}
                <form action={duplicatePlanAction}>
                  <input type="hidden" name="key" value={p.key} />
                  <button className="flex items-center gap-1 rounded-md bg-muted px-2 py-1 text-xs text-foreground hover:bg-muted"><Copy className="h-3 w-3" />Duplicate</button>
                </form>
                {!p.archived && (
                  <form action={archivePlanAction}>
                    <input type="hidden" name="key" value={p.key} />
                    <button className="flex items-center gap-1 rounded-md bg-muted px-2 py-1 text-xs text-red-400 hover:bg-muted"><Archive className="h-3 w-3" />Archive</button>
                  </form>
                )}
              </div>
            </div>
            <PlanForm p={p} />
          </Panel>
        ))}
      </div>

      <Panel title="New plan" right={<Plus className="h-4 w-4 text-muted-foreground" />}>
        <PlanForm />
      </Panel>

      <p className="text-xs text-muted-foreground">
        Purchases lock in the price at checkout (stored on the workspace), so raising a price never retro-charges existing clients.
      </p>
    </div>
  )
}
