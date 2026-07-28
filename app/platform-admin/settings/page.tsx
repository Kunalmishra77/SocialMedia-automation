import { notFound } from 'next/navigation'
import { Palette, Sparkles, IndianRupee, Wrench } from 'lucide-react'
import { requirePlatformAdmin, can } from '@/lib/platform-admin/auth'
import { getPlatformSettings } from '@/lib/platform-admin/settings'
import { updatePlatformSettingAction } from '@/lib/actions/platform-settings'
import { PageHeader, Panel } from '../ui'

const field = 'h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground'
const label = 'mb-1 block text-xs text-muted-foreground'
const saveBtn = 'h-9 rounded-md bg-[#ea6a24] px-4 text-sm font-medium text-white hover:bg-[#ea6a24]'

export default async function PlatformSettingsPage() {
  const ctx = await requirePlatformAdmin()
  if (!can(ctx, 'manage_feature_flags') && ctx.role !== 'platform_owner') notFound()
  const s = await getPlatformSettings()

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader title="Platform settings" subtitle="Global configuration for the whole product." />

      <Panel title="Branding">
        <form action={updatePlatformSettingAction} className="space-y-3">
          <input type="hidden" name="__key" value="branding" />
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className={label}><Palette className="mr-1 inline h-3 w-3" />Platform name</label>
              <input name="platformName" defaultValue={s.branding.platformName} className={field} />
            </div>
            <div>
              <label className={label}>Support email</label>
              <input name="supportEmail" type="email" defaultValue={s.branding.supportEmail} className={field} />
            </div>
          </div>
          <button className={saveBtn}>Save branding</button>
        </form>
      </Panel>

      <Panel title="AI defaults">
        <form action={updatePlatformSettingAction} className="space-y-3">
          <input type="hidden" name="__key" value="ai" />
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className={label}><Sparkles className="mr-1 inline h-3 w-3" />Default model</label>
              <input name="defaultModel" defaultValue={s.ai.defaultModel} className={field} />
            </div>
            <div>
              <label className={label}>Fallback model</label>
              <input name="fallbackModel" defaultValue={s.ai.fallbackModel} className={field} />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">Used as the platform-wide default when a workspace has no model override.</p>
          <button className={saveBtn}>Save AI defaults</button>
        </form>
      </Panel>

      <Panel title="Billing">
        <form action={updatePlatformSettingAction} className="space-y-3">
          <input type="hidden" name="__key" value="billing" />
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className={label}><IndianRupee className="mr-1 inline h-3 w-3" />Currency</label>
              <input name="currency" defaultValue={s.billing.currency} className={field} />
            </div>
            <div>
              <label className={label}>Tax %</label>
              <input name="taxPct" type="number" step="0.1" defaultValue={s.billing.taxPct} className={field} />
            </div>
          </div>
          <button className={saveBtn}>Save billing</button>
        </form>
      </Panel>

      <Panel title="Maintenance mode">
        <form action={updatePlatformSettingAction} className="space-y-3">
          <input type="hidden" name="__key" value="maintenance" />
          <label className="flex items-center gap-2 text-sm text-foreground">
            <input type="checkbox" name="enabled" defaultChecked={s.maintenance.enabled} className="accent-amber-500" />
            <Wrench className="h-4 w-4 text-amber-400" /> Enable maintenance banner
          </label>
          <div>
            <label className={label}>Message</label>
            <textarea name="message" rows={2} defaultValue={s.maintenance.message} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground" />
          </div>
          <button className={saveBtn}>Save maintenance</button>
        </form>
      </Panel>
    </div>
  )
}
