'use client'

import { useActionState } from 'react'
import { updateWorkspaceAction } from '@/lib/actions/workspace'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export function SettingsForm({
  workspaceId,
  name,
  industry,
  brandColor,
}: {
  workspaceId: string
  name: string
  industry: string
  brandColor: string
}) {
  const [state, formAction, pending] = useActionState<{ error?: string; ok?: boolean }, FormData>(
    async (_prev, fd) => updateWorkspaceAction(fd),
    {},
  )

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="workspaceId" value={workspaceId} />
      <div className="space-y-2">
        <Label htmlFor="name">Workspace name</Label>
        <Input id="name" name="name" defaultValue={name} required />
      </div>
      <div className="space-y-2">
        <Label htmlFor="industry">Industry</Label>
        <Input id="industry" name="industry" defaultValue={industry} placeholder="D2C, Agency, Coaching…" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="brand_color">Brand color</Label>
        <div className="flex items-center gap-2">
          <input
            id="brand_color"
            name="brand_color"
            type="color"
            defaultValue={brandColor || '#e1306c'}
            className="h-10 w-16 rounded-md border border-input bg-background"
          />
        </div>
      </div>

      {state.error && <p className="text-sm text-destructive">{state.error}</p>}
      {state.ok && <p className="text-sm text-emerald-600">Saved ✓</p>}

      <Button type="submit" disabled={pending}>
        {pending ? 'Saving…' : 'Save changes'}
      </Button>
    </form>
  )
}
