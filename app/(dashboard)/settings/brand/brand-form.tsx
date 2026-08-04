'use client'

import { useActionState } from 'react'
import { updateBrandProfileAction } from '@/lib/actions/brand'
import type { BrandProfile } from '@/lib/ai/brand'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

const area = 'w-full rounded-md border border-input bg-background px-3 py-2 text-sm'

export function BrandForm({ profile }: { profile: BrandProfile }) {
  const [state, formAction, pending] = useActionState<{ ok?: boolean; error?: string }, FormData>(
    async (_prev, fd) => updateBrandProfileAction(fd),
    {},
  )

  return (
    <form action={formAction} className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="business_name">Business name</Label>
          <Input id="business_name" name="business_name" defaultValue={profile.business_name} placeholder="Skinwise" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="industry">Industry / niche</Label>
          <Input id="industry" name="industry" defaultValue={profile.industry} placeholder="D2C skincare" />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="target_audience">Target audience</Label>
        <textarea id="target_audience" name="target_audience" rows={2} defaultValue={profile.target_audience} className={area}
          placeholder="Women 22–40 in metros who care about clean, science-backed skincare." />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="brand_voice">Brand voice / tone</Label>
          <Input id="brand_voice" name="brand_voice" defaultValue={profile.brand_voice} placeholder="Warm, expert, no-hype" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="content_style">Content style</Label>
          <Input id="content_style" name="content_style" defaultValue={profile.content_style} placeholder="Educational + aspirational" />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="products">Products / services</Label>
        <textarea id="products" name="products" rows={2} defaultValue={profile.products} className={area}
          placeholder="Vitamin C serum, SPF 50 sunscreen, ceramide moisturiser." />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="objectives">Content objectives</Label>
          <Input id="objectives" name="objectives" defaultValue={profile.objectives} placeholder="Awareness + product education" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="default_cta">Preferred call-to-action</Label>
          <Input id="default_cta" name="default_cta" defaultValue={profile.default_cta} placeholder="Shop now · DM us · Link in bio" />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="topics_focus">Topics to focus on</Label>
          <textarea id="topics_focus" name="topics_focus" rows={2} defaultValue={profile.topics_focus.join(', ')} className={area}
            placeholder="Skincare routines, ingredient education, sun protection" />
          <p className="text-xs text-muted-foreground">Comma or newline separated.</p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="topics_avoid">Topics to avoid</Label>
          <textarea id="topics_avoid" name="topics_avoid" rows={2} defaultValue={profile.topics_avoid.join(', ')} className={area}
            placeholder="Medical cure claims, competitor bashing, politics" />
          <p className="text-xs text-muted-foreground">The AI will never mention these.</p>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="language">Preferred language</Label>
          <Input id="language" name="language" defaultValue={profile.language} placeholder="English / Hinglish" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="competitors">Competitor references</Label>
          <Input id="competitors" name="competitors" defaultValue={profile.competitors} placeholder="Minimalist, The Ordinary" />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="brand_colors">Brand colors (hex)</Label>
          <Input id="brand_colors" name="brand_colors" defaultValue={profile.brand_colors.join(', ')} placeholder="#ea6a24, #16233a" />
          <p className="text-xs text-muted-foreground">First is primary. Used on designed posts.</p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="logo_file">Logo</Label>
          {profile.logo_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={profile.logo_url} alt="Current logo" className="h-10 w-auto rounded border border-border bg-white p-1" />
          )}
          <input id="logo_file" name="logo_file" type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" className="block w-full text-sm text-muted-foreground file:mr-3 file:rounded-md file:border-0 file:bg-muted file:px-3 file:py-1.5 file:text-sm" />
          <Input name="logo_url" defaultValue={profile.logo_url} placeholder="…or paste a logo URL" />
        </div>
      </div>

      <div className="rounded-lg border border-border p-4">
        <p className="mb-3 text-sm font-semibold">Brand Kit — for designed posts (Design Studio)</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="theme">Visual theme</Label>
            <select id="theme" name="theme" defaultValue={profile.theme || 'bold'} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
              <option value="bold">Bold (big headlines, high contrast)</option>
              <option value="minimal">Minimal (clean, lots of whitespace)</option>
              <option value="playful">Playful (rounded, friendly)</option>
              <option value="dark">Dark (dark background)</option>
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="imagery_style">Imagery style</Label>
            <select id="imagery_style" name="imagery_style" defaultValue={profile.imagery_style || 'real photo'} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
              <option value="real photo">Real photography</option>
              <option value="3d render">3D render</option>
              <option value="illustration">Illustration</option>
              <option value="abstract gradient">Abstract / gradient</option>
              <option value="minimal product">Minimal product shot</option>
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="website">Website (footer)</Label>
            <Input id="website" name="website" defaultValue={profile.website} placeholder="www.yourbrand.com" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="phone">Phone (footer)</Label>
            <Input id="phone" name="phone" defaultValue={profile.phone} placeholder="+91 00000 00000" />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="handle">Social handle</Label>
            <Input id="handle" name="handle" defaultValue={profile.handle} placeholder="@yourbrand" />
          </div>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">Set once — every AI-designed post automatically uses these. AI also auto-picks the best layout for each topic.</p>
      </div>

      {state.error && <p className="text-sm text-destructive">{state.error}</p>}
      {state.ok && <p className="text-sm text-emerald-600">Saved ✓ — future AI posts will use this brand profile.</p>}

      <Button type="submit" disabled={pending}>{pending ? 'Saving…' : 'Save brand profile'}</Button>
    </form>
  )
}
