import Link from 'next/link'
import { redirect } from 'next/navigation'
import { requireUser, getActiveMembership } from '@/lib/authz'
import { createAdminClient } from '@/lib/supabase/admin'

export default async function OrdersPage() {
  const user = await requireUser()
  const { active } = await getActiveMembership(user.id)
  if (!active) redirect('/workspace/new')
  if (active.role === 'agent') redirect('/')

  const admin = createAdminClient()
  const { data: orders } = await admin
    .from('orders')
    .select('id, order_number, total, currency, status, placed_at')
    .eq('workspace_id', active.workspaceId)
    .order('created_at', { ascending: false })
    .limit(100)

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Orders</h1>
        <Link href="/commerce/products" className="text-sm text-primary hover:underline">← Products</Link>
      </div>

      <div className="overflow-hidden rounded-lg border border-border bg-card">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-muted-foreground">
            <tr>
              <th className="px-4 py-2 text-left font-medium">Order</th>
              <th className="px-4 py-2 text-left font-medium">Total</th>
              <th className="px-4 py-2 text-left font-medium">Status</th>
              <th className="px-4 py-2 text-left font-medium">Placed</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {(!orders || orders.length === 0) && (
              <tr><td colSpan={4} className="px-4 py-10 text-center text-muted-foreground">
                No orders yet. Orders sync from Shopify/CSV or link to DM conversations.
              </td></tr>
            )}
            {orders?.map((o) => (
              <tr key={o.id}>
                <td className="px-4 py-3 font-medium">{o.order_number ?? o.id.slice(0, 8)}</td>
                <td className="px-4 py-3">{o.total ? `₹${Number(o.total).toLocaleString('en-IN')}` : '—'}</td>
                <td className="px-4 py-3 capitalize text-muted-foreground">{o.status}</td>
                <td className="px-4 py-3 text-muted-foreground">
                  {o.placed_at ? new Date(o.placed_at).toLocaleDateString() : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
