import { notFound } from 'next/navigation'
import { requirePlatformAdmin, can } from '@/lib/platform-admin/auth'
import { listFeatureFlags } from '@/lib/platform-admin/metrics'
import { upsertFlagAction, updateFlagAction } from '@/lib/actions/platform-flags'

export default async function FeatureFlagsPage() {
  const ctx = await requirePlatformAdmin()
  if (!can(ctx, 'manage_feature_flags')) notFound()
  const flags = await listFeatureFlags()

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Feature flags</h1>
        <p className="text-sm text-zinc-400">Roll features out gradually or toggle them globally.</p>
      </div>

      {/* Create */}
      <form action={upsertFlagAction} className="flex flex-wrap items-end gap-2 rounded-lg border border-zinc-800 bg-zinc-900 p-4">
        <div>
          <label className="mb-1 block text-xs text-zinc-400">New flag key</label>
          <input name="key" placeholder="new_analytics_v2" className="h-10 rounded-md border border-zinc-700 bg-zinc-950 px-3 text-sm text-zinc-100 placeholder:text-zinc-600" />
        </div>
        <div className="flex-1">
          <label className="mb-1 block text-xs text-zinc-400">Description</label>
          <input name="description" placeholder="What it gates" className="h-10 w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 text-sm text-zinc-100 placeholder:text-zinc-600" />
        </div>
        <button className="h-10 rounded-md bg-emerald-600 px-4 text-sm font-medium text-white hover:bg-emerald-500">Add flag</button>
      </form>

      {/* List */}
      <div className="space-y-3">
        {flags.length === 0 && <p className="text-sm text-zinc-500">No flags yet.</p>}
        {flags.map((f) => (
          <form
            key={f.id}
            action={updateFlagAction}
            className="flex flex-wrap items-center gap-4 rounded-lg border border-zinc-800 bg-zinc-900 p-4"
          >
            <input type="hidden" name="key" value={f.key} />
            <div className="flex-1">
              <code className="text-sm text-emerald-400">{f.key}</code>
              {f.description && <p className="text-xs text-zinc-500">{f.description}</p>}
            </div>
            <label className="flex items-center gap-2 text-sm text-zinc-300">
              <input type="checkbox" name="default_on" defaultChecked={f.default_on} />
              Default on
            </label>
            <div className="flex items-center gap-2">
              <label className="text-xs text-zinc-400">Rollout %</label>
              <input
                type="number"
                name="rollout_pct"
                min={0}
                max={100}
                defaultValue={f.rollout_pct}
                className="h-9 w-20 rounded-md border border-zinc-700 bg-zinc-950 px-2 text-sm text-zinc-100"
              />
            </div>
            <button className="h-9 rounded-md bg-zinc-700 px-3 text-sm hover:bg-zinc-600">Save</button>
          </form>
        ))}
      </div>
    </div>
  )
}
