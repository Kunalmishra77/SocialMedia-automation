'use client'

import { useState } from 'react'
import { useActionState } from 'react'
import { Sparkles, Loader2 } from 'lucide-react'
import { createPostAction, generateCaptionAction } from '@/lib/actions/content'
import { PLATFORMS } from '@/lib/platforms'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

export function CreatePost() {
  const [open, setOpen] = useState(false)
  const [caption, setCaption] = useState('')
  const [hashtags, setHashtags] = useState('')
  const [topic, setTopic] = useState('')
  const [genBusy, setGenBusy] = useState(false)
  const [genErr, setGenErr] = useState('')
  const [state, formAction, pending] = useActionState<{ error?: string }, FormData>(
    async (_prev, fd) => {
      // Convert the datetime-local value (user's wall-clock) to a correct UTC ISO
      // using the browser timezone, so the picked time is the user's LOCAL time.
      const sched = fd.get('scheduled_at')
      if (typeof sched === 'string' && sched) {
        const d = new Date(sched)
        if (!Number.isNaN(d.getTime())) fd.set('scheduled_at', d.toISOString())
      }
      const res = await createPostAction(fd)
      if (!res.error) { setOpen(false); setCaption(''); setHashtags(''); setTopic('') }
      return res
    },
    {},
  )

  async function generate() {
    setGenErr(''); setGenBusy(true)
    try {
      const res = await generateCaptionAction(topic, 'friendly')
      if (res.error) setGenErr(res.error)
      else { setCaption(res.caption ?? ''); setHashtags(res.hashtags ?? '') }
    } finally { setGenBusy(false) }
  }

  if (!open) return <Button size="sm" onClick={() => setOpen(true)}>+ New post</Button>

  return (
    <form action={formAction} className="space-y-3 rounded-xl border border-border bg-card p-4 shadow-[var(--shadow-card)]">
      <div className="grid gap-3 sm:grid-cols-2">
        <select name="type" defaultValue="feed" className="h-10 rounded-md border border-input bg-background px-3 text-sm">
          <option value="feed">Feed post</option>
          <option value="reel">Reel</option>
          <option value="carousel">Carousel</option>
          <option value="story">Story</option>
        </select>
        <Input name="scheduled_at" type="datetime-local" />
      </div>

      {/* Media */}
      <div className="rounded-lg border border-border bg-muted/30 p-3">
        <p className="mb-1.5 text-xs font-medium text-muted-foreground">Media (image or video for Instagram)</p>
        <input name="media" type="file" accept="image/*,video/mp4,video/quicktime" className="block w-full text-sm text-foreground file:mr-3 file:rounded-md file:border-0 file:bg-primary file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-primary-foreground hover:file:brightness-110" />
        <p className="mt-2 text-[11px] text-muted-foreground">Upload a photo (JPG/PNG) or video/reel (MP4, ≤100 MB). Or paste a public URL:</p>
        <Input name="media_url" placeholder="https://…/photo.jpg  (optional, if no file)" className="mt-1.5 h-9 text-xs" />
      </div>

      <div>
        <p className="mb-1.5 text-xs font-medium text-muted-foreground">Publish to</p>
        <div className="flex flex-wrap gap-2">
          {PLATFORMS.map((p) => (
            <label key={p.key} className="flex cursor-pointer items-center gap-1.5 rounded-full border border-border px-3 py-1 text-sm has-[:checked]:border-primary has-[:checked]:bg-primary/5">
              <input type="checkbox" name="target_platforms" value={p.key} defaultChecked={p.key === 'instagram'} className="accent-[color:var(--primary)]" />
              <span className="h-2 w-2 rounded-full" style={{ background: p.accent }} /> {p.name}
            </label>
          ))}
        </div>
      </div>

      {/* AI generator */}
      <div className="rounded-lg border border-primary/20 bg-primary/5 p-3">
        <div className="flex items-center gap-2">
          <Input value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="Topic / idea (e.g. new summer collection launch)" className="flex-1" />
          <Button type="button" size="sm" onClick={generate} disabled={genBusy}>
            {genBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Sparkles className="h-4 w-4" /> Generate</>}
          </Button>
        </div>
        {genErr && <p className="mt-1 text-xs text-destructive">{genErr}</p>}
      </div>

      <textarea name="caption" rows={4} required value={caption} onChange={(e) => setCaption(e.target.value)} placeholder="Write your caption…" className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" />
      <Input name="hashtags" value={hashtags} onChange={(e) => setHashtags(e.target.value)} placeholder="#hashtags space or comma separated" />
      {state.error && <p className="text-sm text-destructive">{state.error}</p>}
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={pending}>{pending ? 'Saving…' : 'Save post'}</Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>Cancel</Button>
      </div>
    </form>
  )
}
