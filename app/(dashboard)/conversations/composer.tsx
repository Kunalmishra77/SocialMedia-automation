'use client'

import { useRef } from 'react'
import { useActionState } from 'react'
import { sendMessageAction } from '@/lib/actions/inbox'
import { Button } from '@/components/ui/button'

export function Composer({ conversationId, windowOpen }: { conversationId: string; windowOpen: boolean }) {
  const formRef = useRef<HTMLFormElement>(null)
  const [state, formAction, pending] = useActionState<{ error?: string }, FormData>(
    async (_prev, fd) => {
      const res = await sendMessageAction(fd)
      if (!res.error) formRef.current?.reset()
      return res
    },
    {},
  )

  if (!windowOpen) {
    return (
      <div className="border-t border-border bg-muted/40 p-4 text-center text-sm text-muted-foreground">
        ⏳ The 24-hour messaging window is closed. You can only send an approved template until the
        contact messages again.
      </div>
    )
  }

  return (
    <form ref={formRef} action={formAction} className="border-t border-border p-3">
      <input type="hidden" name="conversationId" value={conversationId} />
      <div className="flex items-end gap-2">
        <textarea
          name="content"
          rows={2}
          required
          placeholder="Type a reply…"
          className="flex-1 resize-none rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        />
        <Button type="submit" disabled={pending}>{pending ? 'Sending…' : 'Send'}</Button>
      </div>
      {state.error && <p className="mt-1 text-xs text-destructive">{state.error}</p>}
    </form>
  )
}
