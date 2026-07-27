import { cn } from '@/lib/utils'

type Tone = 'success' | 'warning' | 'error' | 'info' | 'neutral' | 'brand'

const TONES: Record<Tone, string> = {
  success: 'bg-emerald-100 text-emerald-700',
  warning: 'bg-amber-100 text-amber-700',
  error: 'bg-red-100 text-red-700',
  info: 'bg-sky-100 text-sky-700',
  neutral: 'bg-muted text-muted-foreground',
  brand: 'bg-primary/10 text-primary',
}

/**
 * Status badge. Always renders text (never colour alone) so meaning survives for
 * colour-blind users and screen readers. Pass an optional leading dot for extra
 * at-a-glance status.
 */
export function Badge({
  tone = 'neutral',
  dot = false,
  className,
  children,
}: {
  tone?: Tone
  dot?: boolean
  className?: string
  children: React.ReactNode
}) {
  const dotColor: Record<Tone, string> = {
    success: 'bg-emerald-500', warning: 'bg-amber-500', error: 'bg-red-500',
    info: 'bg-sky-500', neutral: 'bg-zinc-400', brand: 'bg-primary',
  }
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium capitalize', TONES[tone], className)}>
      {dot && <span className={cn('h-1.5 w-1.5 rounded-full', dotColor[tone])} aria-hidden="true" />}
      {children}
    </span>
  )
}
