'use client'

import { useDeferredValue, useMemo, useState } from 'react'
import { ChevronDown, Wand2, ShieldCheck } from 'lucide-react'
import { lintCaption } from '@/lib/ig/caption-lint'
import { detect } from '@/lib/ig/detect'
import { humanize } from '@/lib/ig/humanize'
import { cleanHashtags } from '@/lib/ig/compose'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

const STATUS_TONE = { PASS: 'success', WARN: 'warning', FAIL: 'error' } as const

/**
 * Live Instagram caption review: what the feed shows before "... more", the
 * linter checks (hashtag cap, one ask, links, first line) and the human score.
 * Runs entirely in the browser on every keystroke — no AI call, no cost.
 */
export function CaptionCoach({
  caption,
  hashtags = '',
  keywords,
  onApply,
  defaultOpen = false,
  className,
}: {
  caption: string
  hashtags?: string | string[]
  keywords?: string[]
  /** Called with the cleaned caption when the user accepts the humanizer's fixes. */
  onApply?: (next: string) => void
  defaultOpen?: boolean
  className?: string
}) {
  const [open, setOpen] = useState(defaultOpen)
  const text = useDeferredValue(caption)
  const tags = useMemo(() => cleanHashtags(hashtags), [hashtags])

  const report = useMemo(() => {
    if (!text.trim()) return null
    try {
      const lint = lintCaption(text, { hashtags: tags, keywords })
      const human = detect(text)
      const clean = humanize(text)
      return { lint, human, clean }
    } catch {
      return null
    }
  }, [text, tags, keywords])

  if (!report) return null
  const { lint, human, clean } = report
  const fails = lint.checks.filter((c) => c.status === 'FAIL').length
  const warns = lint.checks.filter((c) => c.status === 'WARN').length
  const fixes = clean.changes.reduce((n, c) => n + c.count, 0)
  const score = Math.round(human.score)
  const headline = fails ? `${fails} to fix` : warns ? `${warns} to review` : 'Ready'

  return (
    <div className={cn('rounded-lg border border-border bg-card text-sm', className)}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left"
        aria-expanded={open}
      >
        <ShieldCheck className="h-4 w-4 text-primary" aria-hidden="true" />
        <span className="font-medium">Caption check</span>
        <Badge tone={fails ? 'error' : warns ? 'warning' : 'success'} dot>{headline}</Badge>
        <Badge tone={human.verdict === 'PASS' ? 'success' : 'warning'}>Human {score}</Badge>
        {fixes > 0 && <Badge tone="brand">{fixes} AI tell{fixes === 1 ? '' : 's'}</Badge>}
        <ChevronDown className={cn('ml-auto h-4 w-4 text-muted-foreground transition-transform', open && 'rotate-180')} aria-hidden="true" />
      </button>

      {open && (
        <div className="space-y-3 border-t border-border px-3 py-3">
          {/* What a scrolling stranger sees */}
          <div>
            <p className="mb-1 text-xs font-medium text-muted-foreground">What the feed shows before “… more”</p>
            <div className="rounded-md border border-border bg-muted/40 px-3 py-2 text-[13px] leading-snug">
              <span className="whitespace-pre-wrap">{lint.visible}</span>
              {lint.truncated && <span className="text-muted-foreground"> … more</span>}
            </div>
          </div>

          <ul className="space-y-1">
            {lint.checks.map((c) => (
              <li key={c.key} className="flex gap-2">
                <Badge tone={STATUS_TONE[c.status]} className="mt-0.5 h-fit w-12 justify-center">{c.status}</Badge>
                <span><span className="font-medium">{c.label}</span> <span className="text-muted-foreground">· {c.message}</span></span>
              </li>
            ))}
          </ul>

          <div className="grid gap-1.5 sm:grid-cols-5">
            {human.checks.map((c) => (
              <div key={c.key} title={c.detail} className="rounded-md bg-muted/50 px-2 py-1.5">
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{c.label}</p>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-border" aria-hidden="true">
                  <div className={cn('h-full rounded-full', c.score >= 70 ? 'bg-emerald-500' : c.score >= 45 ? 'bg-amber-500' : 'bg-red-500')} style={{ width: `${Math.max(4, Math.min(100, c.score))}%` }} />
                </div>
                <p className="mt-0.5 text-xs font-medium">{Math.round(c.score)}</p>
              </div>
            ))}
          </div>

          {clean.flags.length > 0 && (
            <div>
              <p className="mb-1 text-xs font-medium text-muted-foreground">Rewrite these by hand (changing sentence shape needs judgement)</p>
              <ul className="list-disc space-y-0.5 pl-5 text-xs text-muted-foreground">
                {clean.flags.slice(0, 6).map((f, i) => (
                  <li key={`${f.id}-${i}`}><span className="font-medium text-foreground">{f.label}</span>{f.excerpt ? `: “${f.excerpt}”` : ''}</li>
                ))}
              </ul>
            </div>
          )}

          {onApply && fixes > 0 && (
            <div className="flex flex-wrap items-center gap-2 rounded-md border border-primary/20 bg-primary/5 px-3 py-2">
              <Wand2 className="h-4 w-4 text-primary" aria-hidden="true" />
              <span className="text-xs">
                {clean.changes.slice(0, 4).map((c) => `${c.from} → ${c.to || '(removed)'}`).join(' · ')}
                {clean.changes.length > 4 ? ` · +${clean.changes.length - 4} more` : ''}
              </span>
              <button
                type="button"
                onClick={() => onApply(clean.text)}
                className="ml-auto rounded-md bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground hover:brightness-110"
              >
                Clean up {fixes} AI tell{fixes === 1 ? '' : 's'}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
