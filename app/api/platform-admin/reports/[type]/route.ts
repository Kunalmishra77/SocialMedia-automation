import { NextRequest, NextResponse } from 'next/server'
import { requirePlatformAdmin, writeAudit } from '@/lib/platform-admin/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { getPlanPriceMap } from '@/lib/plans-server'

/** CSV cell escaping (RFC 4180). */
function cell(v: unknown): string {
  const s = v === null || v === undefined ? '' : String(v)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}
function toCsv(headers: string[], rows: unknown[][]): string {
  return [headers.join(','), ...rows.map((r) => r.map(cell).join(','))].join('\n')
}

const TYPES = ['clients', 'revenue', 'tickets', 'usage'] as const

export async function GET(req: NextRequest, { params }: { params: Promise<{ type: string }> }) {
  let ctx
  try {
    ctx = await requirePlatformAdmin()
  } catch {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  const { type } = await params
  if (!TYPES.includes(type as (typeof TYPES)[number])) {
    return NextResponse.json({ error: 'unknown report' }, { status: 404 })
  }

  const admin = createAdminClient()
  let csv = ''

  if (type === 'clients') {
    const { data } = await admin
      .from('workspaces')
      .select('name, owner_email, owner_phone, company, plan, status, payment_status, payment_amount, created_at')
      .order('created_at', { ascending: false })
    csv = toCsv(
      ['Name', 'Owner email', 'Phone', 'Company', 'Plan', 'Status', 'Payment', 'Amount', 'Created'],
      (data ?? []).map((w) => [w.name, w.owner_email, w.owner_phone, w.company, w.plan, w.status, w.payment_status, w.payment_amount, w.created_at]),
    )
  } else if (type === 'revenue') {
    const [{ data }, priceMap] = await Promise.all([
      admin.from('workspaces').select('name, plan, status, payment_status, payment_amount, approved_at').eq('status', 'active'),
      getPlanPriceMap(),
    ])
    csv = toCsv(
      ['Client', 'Plan', 'MRR', 'Payment', 'Amount paid', 'Approved'],
      (data ?? []).map((w) => [w.name, w.plan, priceMap[w.plan] ?? 0, w.payment_status, w.payment_amount, w.approved_at]),
    )
  } else if (type === 'tickets') {
    const { data } = await admin
      .from('support_tickets')
      .select('subject, category, priority, status, created_at, updated_at, first_response_at, workspaces(name)')
      .order('created_at', { ascending: false })
    csv = toCsv(
      ['Subject', 'Client', 'Category', 'Priority', 'Status', 'Created', 'Updated', 'First response'],
      (data ?? []).map((t) => [t.subject, (t.workspaces as unknown as { name: string } | null)?.name ?? '', t.category, t.priority, t.status, t.created_at, t.updated_at, t.first_response_at]),
    )
  } else {
    // usage — messages + automations per workspace
    const [{ data: ws }, { data: usage }] = await Promise.all([
      admin.from('workspaces').select('id, name'),
      admin.from('platform_usage_logs').select('workspace_id, metric, quantity'),
    ])
    const nameMap: Record<string, string> = {}
    for (const w of ws ?? []) nameMap[w.id] = w.name
    const agg: Record<string, Record<string, number>> = {}
    for (const u of usage ?? []) {
      const k = u.workspace_id as string
      agg[k] = agg[k] ?? {}
      agg[k][u.metric as string] = (agg[k][u.metric as string] ?? 0) + (u.quantity ?? 1)
    }
    const rows: unknown[][] = []
    for (const [wsId, metrics] of Object.entries(agg)) {
      for (const [metric, qty] of Object.entries(metrics)) rows.push([nameMap[wsId] ?? wsId, metric, qty])
    }
    csv = toCsv(['Client', 'Metric', 'Quantity'], rows)
  }

  await writeAudit(ctx, 'report.export', { type: 'report', label: type })

  const date = new Date().toISOString().slice(0, 10)
  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="socialflow-${type}-${date}.csv"`,
    },
  })
}
