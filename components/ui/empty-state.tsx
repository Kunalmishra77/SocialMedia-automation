import Link from 'next/link'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

interface CTA { label: string; href: string }

/**
 * Premium empty state — icon in a soft tinted circle, a clear headline, a short
 * explanation, and a primary (+ optional secondary) call to action. Use instead
 * of bare "No X yet" strings so every empty screen guides the user forward.
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  primary,
  secondary,
  className,
}: {
  icon: LucideIcon
  title: string
  description?: string
  primary?: CTA
  secondary?: CTA
  className?: string
}) {
  return (
    <div className={cn('flex flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-card/50 px-6 py-14 text-center', className)}>
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
        <Icon className="h-7 w-7" aria-hidden="true" />
      </div>
      <h3 className="text-base font-semibold">{title}</h3>
      {description && <p className="mt-1 max-w-sm text-sm text-muted-foreground">{description}</p>}
      {(primary || secondary) && (
        <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
          {primary && (
            <Link href={primary.href} className="inline-flex h-10 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground shadow-[var(--shadow-sm)] transition-all hover:brightness-110 hover:shadow-[var(--shadow-md)] active:scale-[0.98]">
              {primary.label}
            </Link>
          )}
          {secondary && (
            <Link href={secondary.href} className="inline-flex h-10 items-center rounded-md border border-input bg-card px-4 text-sm font-medium transition-colors hover:bg-muted">
              {secondary.label}
            </Link>
          )}
        </div>
      )}
    </div>
  )
}
