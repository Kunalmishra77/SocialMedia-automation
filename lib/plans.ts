export interface PlanOption {
  key: string
  name: string
  price: number // INR / month
  tagline: string
  features: string[]
  highlight?: boolean
}

export const PLAN_CATALOG: PlanOption[] = [
  {
    key: 'starter',
    name: 'Starter',
    price: 999,
    tagline: 'For solo creators getting started',
    features: ['1 social account', 'AI auto-reply', 'Inbox + CRM', '5,000 messages/mo'],
  },
  {
    key: 'pro',
    name: 'Pro',
    price: 2999,
    tagline: 'For growing brands & teams',
    features: [
      '3 social accounts',
      'AI chatbot + comment→DM',
      'Campaigns + content scheduling',
      'Workflow automation',
      '25,000 messages/mo',
    ],
    highlight: true,
  },
  {
    key: 'enterprise',
    name: 'Enterprise',
    price: 7999,
    tagline: 'For agencies & high volume',
    features: [
      '10 social accounts',
      'Everything in Pro',
      'Influencer + Commerce + Ads',
      'Priority support',
      '100,000 messages/mo',
    ],
  },
]

export function planByKey(key: string): PlanOption | undefined {
  return PLAN_CATALOG.find((p) => p.key === key)
}

// DB-backed, editable catalog lives in lib/plans-server.ts (server-only).
// This file stays client-safe (pure data) so client components can import
// PLAN_CATALOG / PlanOption without pulling in the service-role client.
