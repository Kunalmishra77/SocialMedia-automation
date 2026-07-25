'use client'

import { useState } from 'react'
import { useActionState } from 'react'
import { createPostAction } from '@/lib/actions/content'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

export function CreatePost() {
  const [open, setOpen] = useState(false)
  const [state, formAction, pending] = useActionState<{ error?: string }, FormData>(
    async (_prev, fd) => {
      const res = await createPostAction(fd)
      if (!res.error) setOpen(false)
      return res
    },
    {},
  )

  if (!open) return <Button size="sm" onClick={() => setOpen(true)}>+ New post</Button>

  return (
    <form action={formAction} className="space-y-3 rounded-lg border border-border bg-card p-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <select name="type" defaultValue="feed" className="h-10 rounded-md border border-input bg-background px-3 text-sm">
          <option value="feed">Feed post</option>
          <option value="reel">Reel</option>
          <option value="carousel">Carousel</option>
          <option value="story">Story</option>
        </select>
        <Input name="scheduled_at" type="datetime-local" />
      </div>
      <textarea
        name="caption"
        rows={4}
        required
        placeholder="Write your caption…"
        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
      />
      <Input name="hashtags" placeholder="#hashtags space or comma separated" />
      {state.error && <p className="text-sm text-destructive">{state.error}</p>}
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={pending}>{pending ? 'Saving…' : 'Save post'}</Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
      </div>
    </form>
  )
}
