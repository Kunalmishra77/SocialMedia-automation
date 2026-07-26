export interface PlanLimits {
  maxAgents: number
  maxMessages: number // per month
  maxContacts: number
  maxCampaigns: number
  maxChannels: number
  maxFlows: number
  maxKbEntries: number
}

// -1 = unlimited
export const PLAN_LIMITS: Record<string, PlanLimits> = {
  free:       { maxAgents: 2,  maxMessages: 1_000,   maxContacts: 500,    maxCampaigns: 2,   maxChannels: 1,  maxFlows: 1,  maxKbEntries: 20 },
  starter:    { maxAgents: 3,  maxMessages: 5_000,   maxContacts: 2_000,  maxCampaigns: 10,  maxChannels: 2,  maxFlows: 3,  maxKbEntries: 50 },
  pro:        { maxAgents: 10, maxMessages: 25_000,  maxContacts: 15_000, maxCampaigns: 50,  maxChannels: 3,  maxFlows: 20, maxKbEntries: 500 },
  enterprise: { maxAgents: 25, maxMessages: 100_000, maxContacts: 75_000, maxCampaigns: 200, maxChannels: 10, maxFlows: 50, maxKbEntries: 2000 },
}

export function planLimits(plan: string): PlanLimits {
  return PLAN_LIMITS[plan] ?? PLAN_LIMITS.free
}

export function isUnlimited(v: number): boolean {
  return v === -1
}

/** Whether `current` is within the plan limit for a metric. */
export function withinLimit(plan: string, key: keyof PlanLimits, current: number): boolean {
  const limit = planLimits(plan)[key]
  return isUnlimited(limit) || current < limit
}
