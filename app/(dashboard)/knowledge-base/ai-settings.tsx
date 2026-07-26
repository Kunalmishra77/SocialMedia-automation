'use client'

import { useActionState } from 'react'
import { updateAiSettingsAction } from '@/lib/actions/knowledge'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'

export function AiSettings({
  persona,
  autoReply,
  followGate = true,
  autoLike = true,
  followGateMessage = '',
}: {
  persona: string
  autoReply: boolean
  followGate?: boolean
  autoLike?: boolean
  followGateMessage?: string
}) {
  const [state, formAction, pending] = useActionState<{ ok?: boolean; error?: string }, FormData>(
    async (_prev, fd) => updateAiSettingsAction(fd),
    {},
  )

  return (
    <form action={formAction} className="space-y-5">
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

      <div className="space-y-3 rounded-lg border border-border p-4">
        <p className="text-sm font-semibold">Automations</p>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="auto_reply" defaultChecked={autoReply} />
          AI auto-reply on inbound DMs
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="auto_like" defaultChecked={autoLike} />
          Auto-like comments on your posts
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="follow_gate" defaultChecked={followGate} />
          Follow-gate — require users to follow before continuing
        </label>
        <div>
          <Label htmlFor="follow_gate_message" className="text-xs text-muted-foreground">
            Follow-gate message
          </Label>
          <textarea
            id="follow_gate_message"
            name="follow_gate_message"
            rows={2}
            defaultValue={followGateMessage}
            placeholder="I'd love to help! My automations are exclusive to followers 🌟 Please follow and tap verify 👇"
            className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          />
        </div>
      </div>

      {state.ok && <p className="text-sm text-emerald-600">Saved ✓</p>}
      <Button type="submit" disabled={pending}>{pending ? 'Saving…' : 'Save AI settings'}</Button>
    </form>
  )
}
