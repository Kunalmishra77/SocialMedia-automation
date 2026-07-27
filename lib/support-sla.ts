/** First-response SLA targets (hours) by ticket priority. */
export const SLA_HOURS: Record<string, number> = { urgent: 2, high: 8, normal: 24, low: 72 }

export interface SlaStatus {
  targetHours: number
  dueAt: number
  responded: boolean
  breached: boolean
  label: string
}

/**
 * First-response SLA state for a ticket.
 * - responded: an operator has replied (first_response_at set)
 * - breached: no response and the deadline has passed (or response came late)
 */
export function slaStatus(priority: string, createdAt: string, firstResponseAt: string | null, closed = false): SlaStatus {
  const targetHours = SLA_HOURS[priority] ?? 24
  const dueAt = new Date(createdAt).getTime() + targetHours * 3600_000
  const responded = !!firstResponseAt
  const respTime = firstResponseAt ? new Date(firstResponseAt).getTime() : null

  if (responded) {
    const breached = (respTime as number) > dueAt
    return { targetHours, dueAt, responded, breached, label: breached ? 'responded late' : 'responded on time' }
  }
  if (closed) return { targetHours, dueAt, responded: false, breached: false, label: 'closed' }

  const breached = Date.now() > dueAt
  if (breached) return { targetHours, dueAt, responded: false, breached: true, label: 'SLA breached' }
  const hoursLeft = Math.max(0, Math.round((dueAt - Date.now()) / 3600_000))
  return { targetHours, dueAt, responded: false, breached: false, label: `${hoursLeft}h to first reply` }
}
