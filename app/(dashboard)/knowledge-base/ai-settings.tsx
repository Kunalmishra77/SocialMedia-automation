'use client'

import { useActionState } from 'react'
import { updateAiSettingsAction } from '@/lib/actions/knowledge'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'

export function AiSettings({ persona, autoReply }: { persona: string; autoReply: boolean }) {
  const [state, formAction, pending] = useActionState<{ ok?: boolean; error?: string }, FormData>(
    async (_prev, fd) => updateAiSettingsAction(fd),
    {},
  )

  return (
    <form action={formAction} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="agent_persona">AI persona / instructions</Label>
        <textarea
          id="agent_persona"
          name="agent_persona"
          rows={4}
          defaultValue={persona}
          placeholder="e.g. You are a friendly support agent for a D2C skincare brand. Keep replies short and warm."
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
        />
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="auto_reply" defaultChecked={autoReply} />
        Enable AI auto-reply on inbound DMs
      </label>
      {state.ok && <p className="text-sm text-emerald-600">Saved ✓</p>}
      <Button type="submit" disabled={pending}>{pending ? 'Saving…' : 'Save AI settings'}</Button>
    </form>
  )
}
