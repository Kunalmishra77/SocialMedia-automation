import type { LucideIcon } from 'lucide-react'

/** Shared presentational primitives for the dark operator console. */

export function PageHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-0.5 text-sm text-muted-foreground">{subtitle}</p>}
      </div>
      {action}
    </div>
  )
}

export function Panel({ title, children, className = '', right }: { title?: string; children: React.ReactNode; className?: string; right?: React.ReactNode }) {
  return (
    <div className={`rounded-xl border border-border bg-card/80 p-5 ${className}`}>
      {title && (
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-foreground">{title}</h2>
          {right}
        </div>
      )}
      {children}
    </div>
  )
}

export function Stat({
  label, value, icon: Icon, sub, tone = 'default',
}: {
  label: string
  value: string | number
  icon?: LucideIcon
  sub?: string
  tone?: 'default' | 'positive' | 'warning' | 'critical' | 'brand'
}) {
  const tones: Record<string, string> = {
    default: 'text-foreground',
    positive: 'text-emerald-400',
    warning: 'text-amber-400',
    critical: 'text-red-400',
    brand: 'text-[#ea6a24]',
  }
  return (
    <div className="rounded-xl border border-border bg-card/80 p-4">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</span>
        {Icon && <Icon className="h-4 w-4 text-muted-foreground" />}
      </div>
      <p className={`mt-2 text-2xl font-bold ${tones[tone]}`}>{value}</p>
      {sub && <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p>}
    </div>
  )
}

export function Bar({ label, value, max, suffix, tone = 'brand' }: { label: string; value: number; max: number; suffix?: string; tone?: 'brand' | 'emerald' | 'amber' }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0
  const bar: Record<string, string> = { brand: 'bg-[#ea6a24]', emerald: 'bg-emerald-500', amber: 'bg-amber-500' }
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-sm">
        <span className="text-foreground">{label}</span>
        <span className="font-semibold text-foreground">{suffix ?? value}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-muted">
        <div className={`h-full rounded-full ${bar[tone]}`} style={{ width: `${Math.max(pct, value > 0 ? 3 : 0)}%` }} />
      </div>
    </div>
  )
}

export function Sparkline({ points, height = 40 }: { points: number[]; height?: number }) {
  const max = Math.max(...points, 1)
  const w = 100
  const step = points.length > 1 ? w / (points.length - 1) : w
  const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${(i * step).toFixed(1)} ${(height - (p / max) * height).toFixed(1)}`).join(' ')
  return (
    <svg viewBox={`0 0 ${w} ${height}`} preserveAspectRatio="none" className="h-12 w-full">
      <path d={path} fill="none" stroke="currentColor" strokeWidth="2" className="text-[#ea6a24]" vectorEffect="non-scaling-stroke" />
    </svg>
  )
}

export function StatusDot({ state }: { state: 'operational' | 'ok' | 'degraded' | 'warning' | 'expiring' | 'down' | 'expired' }) {
  const map: Record<string, string> = {
    operational: 'bg-emerald-500', ok: 'bg-emerald-500',
    degraded: 'bg-amber-500', warning: 'bg-amber-500', expiring: 'bg-amber-500',
    down: 'bg-red-500', expired: 'bg-red-500',
  }
  return <span className={`inline-block h-2.5 w-2.5 rounded-full ${map[state] ?? 'bg-zinc-500'}`} />
}

export function inr(n: number): string {
  return '₹' + n.toLocaleString('en-IN')
}

export function timeAgo(iso: string | null): string {
  if (!iso) return '—'
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  return `${d}d ago`
}
