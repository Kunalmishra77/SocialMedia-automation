import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'
import { getActivePlans, getPlanPriceMap } from '@/lib/plans-server'

const DAY = 86400_000

function since(days: number): string {
  return new Date(Date.now() - days * DAY).toISOString()
}

async function count(table: string, build?: (q: any) => any): Promise<number> {
  const admin = createAdminClient()
  let q = admin.from(table).select('id', { count: 'exact', head: true })
  if (build) q = build(q)
  const { count } = await q
  return count ?? 0
}

// ─────────────────────────────────────────────────────────────
// Command Center (dashboard)
// ─────────────────────────────────────────────────────────────

export interface CommandCenter {
  clients: {
    total: number
    active: number
    pending: number
    suspended: number
    onboarding: number
    new7d: number
    new30d: number
  }
  revenue: { mrr: number; arr: number; collected: number; pendingPayments: number }
  usage: {
    users: number
    messages: number
    messages30d: number
    conversations: number
    contacts: number
    leads: number
    automations: number
    activeAutomations: number
    channels: number
    aiEvents30d: number
  }
  growth: { day: string; count: number }[]
  planDistribution: { plan: string; count: number; mrr: number }[]
  pendingApprovals: { id: string; name: string; plan: string | null; amount: number | null; submitted_at: string | null }[]
  recentActivity: { action: string; label: string | null; email: string; at: string }[]
  alerts: { level: 'critical' | 'warning' | 'info'; text: string }[]
}

export async function getCommandCenter(): Promise<CommandCenter> {
  const admin = createAdminClient()

  const [
    { data: workspaces },
    { count: users },
    { count: messages },
    { count: messages30d },
    { count: conversations },
    { count: contacts },
    { count: leads },
    { data: automations },
    { count: channels },
    { count: aiEvents30d },
    { data: audit },
    { data: expiringTokens },
  ] = await Promise.all([
    admin.from('workspaces').select('id, name, plan, status, selected_plan, payment_status, payment_amount, created_at, submitted_at'),
    admin.from('profiles').select('id', { count: 'exact', head: true }),
    admin.from('messages').select('id', { count: 'exact', head: true }),
    admin.from('messages').select('id', { count: 'exact', head: true }).gte('created_at', since(30)),
    admin.from('conversations').select('id', { count: 'exact', head: true }),
    admin.from('contacts').select('id', { count: 'exact', head: true }),
    admin.from('leads').select('id', { count: 'exact', head: true }),
    admin.from('workflow_automations').select('is_active'),
    admin.from('channel_accounts').select('id', { count: 'exact', head: true }).eq('is_active', true),
    admin.from('platform_usage_logs').select('id', { count: 'exact', head: true }).ilike('metric', 'ai%').gte('occurred_at', since(30)),
    admin.from('platform_audit_log').select('action, target_label, admin_email, occurred_at').order('occurred_at', { ascending: false }).limit(8),
    admin.from('channel_accounts').select('id').not('token_expires_at', 'is', null).lte('token_expires_at', since(-7)),
  ])

  const [priceMap, activePlans] = await Promise.all([getPlanPriceMap(), getActivePlans()])

  const rows = workspaces ?? []
  const now = Date.now()

  const clients = { total: 0, active: 0, pending: 0, suspended: 0, onboarding: 0, new7d: 0, new30d: 0 }
  const planCount: Record<string, number> = {}
  let mrr = 0
  let collected = 0
  let pendingPayments = 0
  const pendingApprovals: CommandCenter['pendingApprovals'] = []

  for (const w of rows) {
    clients.total++
    if (w.status === 'active') {
      clients.active++
      mrr += priceMap[w.plan] ?? 0
      planCount[w.plan] = (planCount[w.plan] ?? 0) + 1
    }
    if (w.status === 'pending_approval') {
      clients.pending++
      pendingPayments++
      pendingApprovals.push({ id: w.id, name: w.name, plan: w.selected_plan, amount: w.payment_amount, submitted_at: w.submitted_at })
    }
    if (w.status === 'suspended') clients.suspended++
    if (w.status === 'onboarding') clients.onboarding++
    if (w.payment_status === 'demo_paid' && w.payment_amount) collected += Number(w.payment_amount)
    const created = new Date(w.created_at).getTime()
    if (created >= now - 7 * DAY) clients.new7d++
    if (created >= now - 30 * DAY) clients.new30d++
  }

  // 14-day growth sparkline (new clients per day).
  const growthMap: Record<string, number> = {}
  for (let i = 13; i >= 0; i--) {
    const d = new Date(now - i * DAY).toISOString().slice(0, 10)
    growthMap[d] = 0
  }
  for (const w of rows) {
    const d = new Date(w.created_at).toISOString().slice(0, 10)
    if (d in growthMap) growthMap[d]++
  }
  const growth = Object.entries(growthMap).map(([day, count]) => ({ day, count }))

  const planDistribution = activePlans.map((p) => ({
    plan: p.name,
    count: planCount[p.key] ?? 0,
    mrr: (planCount[p.key] ?? 0) * (priceMap[p.key] ?? p.price),
  }))

  const autoRows = automations ?? []
  const activeAutomations = autoRows.filter((a) => a.is_active).length

  const { count: urgentTickets } = await admin
    .from('support_tickets')
    .select('id', { count: 'exact', head: true })
    .eq('priority', 'urgent')
    .not('status', 'in', '("resolved","closed")')

  const alerts: CommandCenter['alerts'] = []
  if ((urgentTickets ?? 0) > 0) alerts.push({ level: 'critical', text: `${urgentTickets} urgent support ticket${(urgentTickets ?? 0) > 1 ? 's' : ''} open` })
  if (clients.pending > 0) alerts.push({ level: 'warning', text: `${clients.pending} client${clients.pending > 1 ? 's' : ''} awaiting approval` })
  if (clients.suspended > 0) alerts.push({ level: 'critical', text: `${clients.suspended} suspended workspace${clients.suspended > 1 ? 's' : ''}` })
  if ((expiringTokens ?? []).length > 0) alerts.push({ level: 'warning', text: `${(expiringTokens ?? []).length} channel token(s) expiring within 7 days` })
  if (!process.env.RAZORPAY_KEY_ID) alerts.push({ level: 'info', text: 'Razorpay not configured — billing runs in demo mode' })
  if (alerts.length === 0) alerts.push({ level: 'info', text: 'All systems nominal. No action required.' })

  return {
    clients,
    revenue: { mrr, arr: mrr * 12, collected, pendingPayments },
    usage: {
      users: users ?? 0,
      messages: messages ?? 0,
      messages30d: messages30d ?? 0,
      conversations: conversations ?? 0,
      contacts: contacts ?? 0,
      leads: leads ?? 0,
      automations: autoRows.length,
      activeAutomations,
      channels: channels ?? 0,
      aiEvents30d: aiEvents30d ?? 0,
    },
    growth,
    planDistribution,
    pendingApprovals,
    recentActivity: (audit ?? []).map((a) => ({ action: a.action, label: a.target_label, email: a.admin_email, at: a.occurred_at })),
    alerts,
  }
}

// ─────────────────────────────────────────────────────────────
// Revenue
// ─────────────────────────────────────────────────────────────

export interface RevenueReport {
  mrr: number
  arr: number
  collected: number
  pendingAmount: number
  byPlan: { plan: string; price: number; active: number; mrr: number; share: number }[]
  topClients: { name: string; plan: string; mrr: number }[]
  payments: { name: string; amount: number | null; status: string; at: string | null }[]
}

export async function getRevenue(): Promise<RevenueReport> {
  const admin = createAdminClient()
  const [{ data: rows }, priceMap, activePlans] = await Promise.all([
    admin.from('workspaces').select('name, plan, status, selected_plan, payment_status, payment_amount, submitted_at, approved_at'),
    getPlanPriceMap(),
    getActivePlans(),
  ])

  const ws = rows ?? []
  const planActive: Record<string, number> = {}
  let collected = 0
  let pendingAmount = 0
  const topClients: RevenueReport['topClients'] = []
  const payments: RevenueReport['payments'] = []

  for (const w of ws) {
    if (w.status === 'active') {
      planActive[w.plan] = (planActive[w.plan] ?? 0) + 1
      const price = priceMap[w.plan] ?? 0
      if (price > 0) topClients.push({ name: w.name, plan: w.plan, mrr: price })
    }
    if (w.payment_status === 'demo_paid' && w.payment_amount) collected += Number(w.payment_amount)
    if (w.status === 'pending_approval' && w.payment_amount) pendingAmount += Number(w.payment_amount)
    if (w.payment_amount || w.payment_status !== 'unpaid') {
      payments.push({ name: w.name, amount: w.payment_amount, status: w.payment_status, at: w.approved_at ?? w.submitted_at })
    }
  }

  let mrr = 0
  const byPlan = activePlans.map((p) => {
    const active = planActive[p.key] ?? 0
    const price = priceMap[p.key] ?? p.price
    const planMrr = active * price
    mrr += planMrr
    return { plan: p.name, price, active, mrr: planMrr, share: 0 }
  })
  for (const b of byPlan) b.share = mrr > 0 ? Math.round((b.mrr / mrr) * 100) : 0

  topClients.sort((a, b) => b.mrr - a.mrr)
  payments.sort((a, b) => (b.at ?? '').localeCompare(a.at ?? ''))

  return { mrr, arr: mrr * 12, collected, pendingAmount, byPlan, topClients: topClients.slice(0, 8), payments: payments.slice(0, 20) }
}

// ─────────────────────────────────────────────────────────────
// Payments (provider-agnostic — derived from workspace payment fields)
// ─────────────────────────────────────────────────────────────

export interface PaymentsReport {
  collected: number
  pendingAmount: number
  successCount: number
  pendingCount: number
  transactions: { name: string; amount: number | null; status: string; provider: string; plan: string | null; at: string | null }[]
}

export async function getPayments(filter?: string): Promise<PaymentsReport> {
  const admin = createAdminClient()
  const { data: rows } = await admin
    .from('workspaces')
    .select('name, status, selected_plan, payment_status, payment_amount, submitted_at, approved_at')
    .order('submitted_at', { ascending: false })

  let collected = 0
  let pendingAmount = 0
  let successCount = 0
  let pendingCount = 0
  const transactions: PaymentsReport['transactions'] = []

  for (const w of rows ?? []) {
    const paid = w.payment_status === 'demo_paid' || w.payment_status === 'paid'
    const pending = w.status === 'pending_approval'
    if (paid && w.payment_amount) { collected += Number(w.payment_amount); successCount++ }
    if (pending && w.payment_amount) { pendingAmount += Number(w.payment_amount); pendingCount++ }
    if (w.payment_amount || w.payment_status !== 'unpaid') {
      const provider = w.payment_status === 'demo_paid' ? 'demo' : w.payment_status === 'paid' ? 'razorpay' : '—'
      const status = pending ? 'pending' : paid ? 'success' : 'unpaid'
      if (!filter || filter === status) {
        transactions.push({ name: w.name, amount: w.payment_amount, status, provider, plan: w.selected_plan, at: w.approved_at ?? w.submitted_at })
      }
    }
  }
  transactions.sort((a, b) => (b.at ?? '').localeCompare(a.at ?? ''))
  return { collected, pendingAmount, successCount, pendingCount, transactions: transactions.slice(0, 100) }
}

// ─────────────────────────────────────────────────────────────
// Onboarding funnel (where each client is stuck)
// ─────────────────────────────────────────────────────────────

const FUNNEL_STAGES = ['created', 'link_opened', 'platforms', 'submitted', 'pending_approval', 'active'] as const
export type FunnelStage = (typeof FUNNEL_STAGES)[number]

export interface OnboardingClient {
  id: string
  name: string
  owner_email: string | null
  stage: FunnelStage
  plan: string | null
  payment_status: string | null
  platforms: number
  created_at: string
  submitted_at: string | null
}

export interface OnboardingReport {
  counts: Record<FunnelStage, number>
  clients: OnboardingClient[]
}

export async function getOnboardingFunnel(): Promise<OnboardingReport> {
  const admin = createAdminClient()
  const { data: rows } = await admin
    .from('workspaces')
    .select('id, name, owner_email, status, selected_plan, payment_status, selected_platforms, onboarding_data, created_at, submitted_at')
    .in('status', ['onboarding', 'pending_approval', 'active'])
    .order('created_at', { ascending: false })
    .limit(200)

  const counts = { created: 0, link_opened: 0, platforms: 0, submitted: 0, pending_approval: 0, active: 0 } as Record<FunnelStage, number>
  const clients: OnboardingClient[] = []

  for (const w of rows ?? []) {
    const platforms = ((w.selected_platforms as string[] | null) ?? []).length
    const od = (w.onboarding_data as Record<string, unknown> | null) ?? {}
    let stage: FunnelStage
    if (w.status === 'active') stage = 'active'
    else if (w.status === 'pending_approval') stage = 'pending_approval'
    else if (w.submitted_at) stage = 'submitted'
    else if (platforms > 0) stage = 'platforms'
    else if (od.link_opened) stage = 'link_opened'
    else stage = 'created'

    // Only show in-flight (not long-active) clients on the funnel, but count active.
    counts[stage]++
    if (w.status !== 'active') {
      clients.push({
        id: w.id as string,
        name: w.name as string,
        owner_email: w.owner_email as string | null,
        stage,
        plan: w.selected_plan as string | null,
        payment_status: w.payment_status as string | null,
        platforms,
        created_at: w.created_at as string,
        submitted_at: w.submitted_at as string | null,
      })
    }
  }
  return { counts, clients }
}

// ─────────────────────────────────────────────────────────────
// Analytics
// ─────────────────────────────────────────────────────────────

export interface AnalyticsReport {
  messages: { total: number; last30d: number; inbound: number; outbound: number }
  byChannel: { channel: string; count: number }[]
  automations: { total: number; active: number; totalRuns: number }
  ai: { events30d: number; byMetric: { metric: string; qty: number }[] }
  engagement: { contacts: number; leads: number; conversations: number; bookings: number }
  mostActiveClients: { name: string; messages: number }[]
}

export async function getAnalytics(): Promise<AnalyticsReport> {
  const admin = createAdminClient()
  const [
    { count: total },
    { count: last30d },
    { count: inbound },
    { count: outbound },
    { data: channelRows },
    { data: autos },
    { data: usage },
    { count: contacts },
    { count: leads },
    { count: conversations },
    { count: bookings },
    { data: msgWs },
    { data: wsNames },
  ] = await Promise.all([
    admin.from('messages').select('id', { count: 'exact', head: true }),
    admin.from('messages').select('id', { count: 'exact', head: true }).gte('created_at', since(30)),
    admin.from('messages').select('id', { count: 'exact', head: true }).eq('direction', 'inbound'),
    admin.from('messages').select('id', { count: 'exact', head: true }).eq('direction', 'outbound'),
    admin.from('conversations').select('channel'),
    admin.from('workflow_automations').select('is_active, run_count'),
    admin.from('platform_usage_logs').select('metric, quantity').gte('occurred_at', since(30)),
    admin.from('contacts').select('id', { count: 'exact', head: true }),
    admin.from('leads').select('id', { count: 'exact', head: true }),
    admin.from('conversations').select('id', { count: 'exact', head: true }),
    admin.from('bookings').select('id', { count: 'exact', head: true }),
    admin.from('messages').select('workspace_id').gte('created_at', since(30)).limit(5000),
    admin.from('workspaces').select('id, name'),
  ])

  const chMap: Record<string, number> = {}
  for (const c of channelRows ?? []) chMap[c.channel] = (chMap[c.channel] ?? 0) + 1
  const byChannel = Object.entries(chMap).map(([channel, count]) => ({ channel, count })).sort((a, b) => b.count - a.count)

  const autoRows = autos ?? []
  const aiMap: Record<string, number> = {}
  for (const u of usage ?? []) aiMap[u.metric] = (aiMap[u.metric] ?? 0) + (u.quantity ?? 1)
  const byMetric = Object.entries(aiMap).map(([metric, qty]) => ({ metric, qty })).sort((a, b) => b.qty - a.qty).slice(0, 8)
  const events30d = Object.values(aiMap).reduce((s, q) => s + q, 0)

  const nameMap: Record<string, string> = {}
  for (const w of wsNames ?? []) nameMap[w.id] = w.name
  const msgCount: Record<string, number> = {}
  for (const m of msgWs ?? []) msgCount[m.workspace_id] = (msgCount[m.workspace_id] ?? 0) + 1
  const mostActiveClients = Object.entries(msgCount)
    .map(([id, messages]) => ({ name: nameMap[id] ?? '—', messages }))
    .sort((a, b) => b.messages - a.messages)
    .slice(0, 6)

  return {
    messages: { total: total ?? 0, last30d: last30d ?? 0, inbound: inbound ?? 0, outbound: outbound ?? 0 },
    byChannel,
    automations: { total: autoRows.length, active: autoRows.filter((a) => a.is_active).length, totalRuns: autoRows.reduce((s, a) => s + (a.run_count ?? 0), 0) },
    ai: { events30d, byMetric },
    engagement: { contacts: contacts ?? 0, leads: leads ?? 0, conversations: conversations ?? 0, bookings: bookings ?? 0 },
    mostActiveClients,
  }
}

// ─────────────────────────────────────────────────────────────
// System Health
// ─────────────────────────────────────────────────────────────

export interface HealthReport {
  db: { status: 'operational' | 'down'; latencyMs: number }
  integrations: { name: string; configured: boolean; note: string }[]
  tokens: { channel: string; handle: string | null; expires_at: string | null; state: 'ok' | 'expiring' | 'expired' }[]
  counts: { workspaces: number; messages: number; automations: number }
}

export async function getHealth(): Promise<HealthReport> {
  const admin = createAdminClient()
  const t0 = Date.now()
  let dbStatus: 'operational' | 'down' = 'operational'
  try {
    await admin.from('workspaces').select('id', { count: 'exact', head: true })
  } catch {
    dbStatus = 'down'
  }
  const latencyMs = Date.now() - t0

  const integrations = [
    { name: 'Instagram / Meta', configured: !!process.env.INSTAGRAM_APP_ID && !!process.env.INSTAGRAM_APP_SECRET, note: 'graph.instagram.com v24.0' },
    { name: 'AI (OpenAI/OpenRouter)', configured: !!process.env.OPENAI_API_KEY || !!process.env.OPENROUTER_API_KEY, note: 'multi-model fallback' },
    { name: 'Email (SMTP)', configured: !!process.env.SMTP_HOST || !!process.env.SMTP_USER, note: 'transactional email' },
    { name: 'Razorpay', configured: !!process.env.RAZORPAY_KEY_ID && !!process.env.RAZORPAY_KEY_SECRET, note: 'billing gateway' },
    { name: 'Supabase', configured: !!process.env.NEXT_PUBLIC_SUPABASE_URL, note: 'database + realtime + auth' },
  ]

  const { data: chans } = await admin.from('channel_accounts').select('channel, handle, token_expires_at').eq('is_active', true)
  const now = Date.now()
  const tokens = (chans ?? [])
    .filter((c) => c.token_expires_at)
    .map((c) => {
      const exp = new Date(c.token_expires_at as string).getTime()
      const state: 'ok' | 'expiring' | 'expired' = exp < now ? 'expired' : exp < now + 7 * DAY ? 'expiring' : 'ok'
      return { channel: c.channel as string, handle: c.handle as string | null, expires_at: c.token_expires_at as string, state }
    })

  const [ws, msg, auto] = await Promise.all([
    count('workspaces'),
    count('messages'),
    count('workflow_automations'),
  ])

  return { db: { status: dbStatus, latencyMs }, integrations, tokens, counts: { workspaces: ws, messages: msg, automations: auto } }
}

// ─────────────────────────────────────────────────────────────
// Communication + Security helpers
// ─────────────────────────────────────────────────────────────

export interface Announcement {
  id: string
  title: string
  body: string
  audience: Record<string, unknown>
  channels: string[]
  published_at: string | null
  scheduled_for: string | null
  created_at: string
}

export async function listAnnouncements(limit = 30): Promise<Announcement[]> {
  const admin = createAdminClient()
  const { data } = await admin
    .from('platform_announcements')
    .select('id, title, body, audience, channels, published_at, scheduled_for, created_at')
    .order('created_at', { ascending: false })
    .limit(limit)
  return (data ?? []) as Announcement[]
}

// ─────────────────────────────────────────────────────────────
// Support tickets
// ─────────────────────────────────────────────────────────────

export interface TicketRow {
  id: string
  subject: string
  category: string
  priority: string
  status: string
  workspace_name: string
  assigned_to: string | null
  created_at: string
  updated_at: string
  first_response_at: string | null
}

export async function listTickets(filter?: { status?: string; priority?: string }): Promise<TicketRow[]> {
  const admin = createAdminClient()
  let q = admin
    .from('support_tickets')
    .select('id, subject, category, priority, status, assigned_to, created_at, updated_at, first_response_at, workspaces(name)')
    .order('updated_at', { ascending: false })
    .limit(200)
  if (filter?.status) q = q.eq('status', filter.status)
  if (filter?.priority) q = q.eq('priority', filter.priority)
  const { data } = await q
  return (data ?? []).map((t) => ({
    id: t.id as string,
    subject: t.subject as string,
    category: t.category as string,
    priority: t.priority as string,
    status: t.status as string,
    assigned_to: t.assigned_to as string | null,
    created_at: t.created_at as string,
    updated_at: t.updated_at as string,
    first_response_at: t.first_response_at as string | null,
    workspace_name: (t.workspaces as unknown as { name: string } | null)?.name ?? '—',
  }))
}

export interface TicketStats {
  open: number
  inProgress: number
  urgent: number
  unassigned: number
  slaBreached: number
  total: number
}

export async function getTicketStats(): Promise<TicketStats> {
  const { slaStatus } = await import('@/lib/support-sla')
  const admin = createAdminClient()
  const { data } = await admin.from('support_tickets').select('status, priority, assigned_to, created_at, first_response_at')
  const rows = data ?? []
  return {
    total: rows.length,
    open: rows.filter((r) => r.status === 'open').length,
    inProgress: rows.filter((r) => r.status === 'in_progress').length,
    urgent: rows.filter((r) => r.priority === 'urgent' && !['resolved', 'closed'].includes(r.status)).length,
    unassigned: rows.filter((r) => !r.assigned_to && !['resolved', 'closed'].includes(r.status)).length,
    slaBreached: rows.filter((r) => slaStatus(r.priority as string, r.created_at as string, r.first_response_at as string | null, ['resolved', 'closed'].includes(r.status as string)).breached).length,
  }
}

export interface TicketDetail extends TicketRow {
  workspace_id: string
  messages: { id: string; author_type: string; author_name: string | null; body: string; is_internal: boolean; created_at: string }[]
}

export async function getTicket(id: string): Promise<TicketDetail | null> {
  const admin = createAdminClient()
  const { data: t } = await admin
    .from('support_tickets')
    .select('id, subject, category, priority, status, assigned_to, created_at, updated_at, first_response_at, workspace_id, workspaces(name)')
    .eq('id', id)
    .maybeSingle()
  if (!t) return null
  const { data: msgs } = await admin
    .from('support_ticket_messages')
    .select('id, author_type, author_name, body, is_internal, created_at')
    .eq('ticket_id', id)
    .order('created_at')
  return {
    id: t.id as string,
    subject: t.subject as string,
    category: t.category as string,
    priority: t.priority as string,
    status: t.status as string,
    assigned_to: t.assigned_to as string | null,
    created_at: t.created_at as string,
    updated_at: t.updated_at as string,
    first_response_at: t.first_response_at as string | null,
    workspace_id: t.workspace_id as string,
    workspace_name: (t.workspaces as unknown as { name: string } | null)?.name ?? '—',
    messages: (msgs ?? []) as TicketDetail['messages'],
  }
}

// ─────────────────────────────────────────────────────────────
// Global search
// ─────────────────────────────────────────────────────────────

export interface SearchResults {
  workspaces: { id: string; name: string; owner_email: string | null; status: string; plan: string }[]
  tickets: { id: string; subject: string; status: string; workspace_name: string }[]
  admins: { email: string; role: string }[]
}

export async function globalSearch(q: string): Promise<SearchResults> {
  const term = q.trim()
  if (term.length < 2) return { workspaces: [], tickets: [], admins: [] }
  const admin = createAdminClient()
  const like = `%${term}%`

  const [{ data: ws }, { data: tk }, { data: ad }] = await Promise.all([
    admin.from('workspaces').select('id, name, owner_email, status, plan')
      .or(`name.ilike.${like},owner_email.ilike.${like},slug.ilike.${like},company.ilike.${like}`)
      .limit(15),
    admin.from('support_tickets').select('id, subject, status, workspaces(name)')
      .ilike('subject', like).limit(15),
    admin.from('platform_admins').select('email, role').ilike('email', like).limit(10),
  ])

  return {
    workspaces: (ws ?? []).map((w) => ({ id: w.id as string, name: w.name as string, owner_email: w.owner_email as string | null, status: w.status as string, plan: w.plan as string })),
    tickets: (tk ?? []).map((t) => ({ id: t.id as string, subject: t.subject as string, status: t.status as string, workspace_name: (t.workspaces as unknown as { name: string } | null)?.name ?? '—' })),
    admins: (ad ?? []).map((a) => ({ email: a.email as string, role: a.role as string })),
  }
}

// ─────────────────────────────────────────────────────────────
// 360° client view
// ─────────────────────────────────────────────────────────────

export interface Client360 {
  usage: { messages: number; messages30d: number; conversations: number; contacts: number; leads: number; automations: number; content: number; aiEvents30d: number }
  channels: { channel: string; handle: string | null; is_active: boolean; token_expires_at: string | null }[]
  tickets: { open: number; total: number }
  payment: { status: string | null; amount: number | null; selected_plan: string | null; submitted_at: string | null; approved_at: string | null }
  activity: { action: string; label: string | null; at: string }[]
  lastImpersonation: string | null
}

export async function getClient360(workspaceId: string): Promise<Client360> {
  const admin = createAdminClient()
  const [
    { count: messages },
    { count: messages30d },
    { count: conversations },
    { count: contacts },
    { count: leads },
    { count: automations },
    { count: content },
    { count: aiEvents30d },
    { data: channels },
    { data: tickets },
    { data: ws },
    { data: activity },
    { data: imp },
  ] = await Promise.all([
    admin.from('messages').select('id', { count: 'exact', head: true }).eq('workspace_id', workspaceId),
    admin.from('messages').select('id', { count: 'exact', head: true }).eq('workspace_id', workspaceId).gte('created_at', since(30)),
    admin.from('conversations').select('id', { count: 'exact', head: true }).eq('workspace_id', workspaceId),
    admin.from('contacts').select('id', { count: 'exact', head: true }).eq('workspace_id', workspaceId),
    admin.from('leads').select('id', { count: 'exact', head: true }).eq('workspace_id', workspaceId),
    admin.from('workflow_automations').select('id', { count: 'exact', head: true }).eq('workspace_id', workspaceId),
    admin.from('content_posts').select('id', { count: 'exact', head: true }).eq('workspace_id', workspaceId),
    admin.from('platform_usage_logs').select('id', { count: 'exact', head: true }).eq('workspace_id', workspaceId).ilike('metric', 'ai%').gte('occurred_at', since(30)),
    admin.from('channel_accounts').select('channel, handle, is_active, token_expires_at').eq('workspace_id', workspaceId),
    admin.from('support_tickets').select('status').eq('workspace_id', workspaceId),
    admin.from('workspaces').select('payment_status, payment_amount, selected_plan, submitted_at, approved_at').eq('id', workspaceId).maybeSingle(),
    admin.from('platform_audit_log').select('action, target_label, occurred_at').eq('target_id', workspaceId).order('occurred_at', { ascending: false }).limit(8),
    admin.from('impersonation_sessions').select('started_at').eq('workspace_id', workspaceId).order('started_at', { ascending: false }).limit(1),
  ])

  const ticketRows = tickets ?? []
  return {
    usage: {
      messages: messages ?? 0,
      messages30d: messages30d ?? 0,
      conversations: conversations ?? 0,
      contacts: contacts ?? 0,
      leads: leads ?? 0,
      automations: automations ?? 0,
      content: content ?? 0,
      aiEvents30d: aiEvents30d ?? 0,
    },
    channels: (channels ?? []).map((c) => ({ channel: c.channel as string, handle: c.handle as string | null, is_active: c.is_active as boolean, token_expires_at: c.token_expires_at as string | null })),
    tickets: { open: ticketRows.filter((t) => !['resolved', 'closed'].includes(t.status as string)).length, total: ticketRows.length },
    payment: {
      status: (ws?.payment_status as string) ?? null,
      amount: (ws?.payment_amount as number) ?? null,
      selected_plan: (ws?.selected_plan as string) ?? null,
      submitted_at: (ws?.submitted_at as string) ?? null,
      approved_at: (ws?.approved_at as string) ?? null,
    },
    activity: (activity ?? []).map((a) => ({ action: a.action as string, label: a.target_label as string | null, at: a.occurred_at as string })),
    lastImpersonation: (imp ?? [])[0]?.started_at ?? null,
  }
}

export interface ImpersonationRow {
  id: string
  workspace_name: string
  mode: string
  reason: string | null
  started_at: string
  expires_at: string
  ended_at: string | null
}

export async function listImpersonationSessions(limit = 30): Promise<ImpersonationRow[]> {
  const admin = createAdminClient()
  const { data } = await admin
    .from('impersonation_sessions')
    .select('id, mode, reason, started_at, expires_at, ended_at, workspaces(name)')
    .order('started_at', { ascending: false })
    .limit(limit)
  return (data ?? []).map((r) => ({
    id: r.id as string,
    workspace_name: (r.workspaces as unknown as { name: string } | null)?.name ?? '—',
    mode: r.mode as string,
    reason: r.reason as string | null,
    started_at: r.started_at as string,
    expires_at: r.expires_at as string,
    ended_at: r.ended_at as string | null,
  }))
}
