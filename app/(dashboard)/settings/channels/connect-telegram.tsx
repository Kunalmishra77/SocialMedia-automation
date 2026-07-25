'use client'

import { useState } from 'react'
import { useActionState } from 'react'
import { connectTelegramAction } from '@/lib/actions/channels'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

export function ConnectTelegram() {
  const [open, setOpen] = useState(false)
  const [state, formAction, pending] = useActionState<{ error?: string; ok?: boolean }, FormData>(
    async (_prev, fd) => {
      const res = await connectTelegramAction(fd)
      if (res.ok) setOpen(false)
      return res
    },
    {},
  )

  if (!open) return <Button size="sm" onClick={() => setOpen(true)}>Connect</Button>

  return (
    <form action={formAction} className="mt-3 space-y-2">
      <Input name="token" placeholder="Bot token from @BotFather" required />
      <p className="text-xs text-muted-foreground">
        Create a bot with @BotFather on Telegram, then paste its token. On a live HTTPS domain the
        webhook is registered automatically.
      </p>
      {state.error && <p className="text-sm text-destructive">{state.error}</p>}
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={pending}>{pending ? 'Connecting…' : 'Connect bot'}</Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
      </div>
    </form>
  )
}
