/** Instagram/Facebook 24-hour messaging window helper. */
export const WINDOW_MS = 24 * 60 * 60 * 1000

export function windowStatus(lastUserMessageAt: string | null): {
  open: boolean
  msLeft: number
} {
  if (!lastUserMessageAt) return { open: false, msLeft: 0 }
  const elapsed = Date.now() - new Date(lastUserMessageAt).getTime()
  const msLeft = WINDOW_MS - elapsed
  return { open: msLeft > 0, msLeft: Math.max(0, msLeft) }
}

export function formatWindowLeft(msLeft: number): string {
  if (msLeft <= 0) return 'expired'
  const h = Math.floor(msLeft / 3_600_000)
  const m = Math.floor((msLeft % 3_600_000) / 60_000)
  return h > 0 ? `${h}h ${m}m left` : `${m}m left`
}
