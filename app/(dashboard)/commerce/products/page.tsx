import Link from 'next/link'
import { redirect } from 'next/navigation'
import { requireUser, getActiveMembership } from '@/lib/authz'
import { createAdminClient } from '@/lib/supabase/admin'
import { deleteProductAction } from '@/lib/actions/commerce'
import { ProductForm } from './product-form'

export default async function ProductsPage() {
  const user = await requireUser()
  const { active } = await getActiveMembership(user.id)
  if (!active) redirect('/workspace/new')
  if (active.role === 'agent') redirect('/')

  const admin = createAdminClient()
  const { data: products } = await admin
    .from('catalog_products')
    .select('id, name, price, sku, in_stock')
    .eq('workspace_id', active.workspaceId)
    .order('created_at', { ascending: false })

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Products</h1>
          <div className="flex gap-3 text-sm text-muted-foreground">
            <span>{products?.length ?? 0} products</span>
            <Link href="/commerce/orders" className="text-primary hover:underline">Orders →</Link>
          </div>
        </div>
        <ProductForm />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {(!products || products.length === 0) && (
          <p className="col-span-full py-10 text-center text-sm text-muted-foreground">
            No products yet. Add products to share in DMs and track orders.
          </p>
        )}
        {products?.map((p) => (
          <div key={p.id} className="rounded-lg border border-border bg-card p-4">
            <div className="flex items-start justify-between">
              <p className="font-medium">{p.name}</p>
              <form action={deleteProductAction}>
                <input type="hidden" name="id" value={p.id} />
                <button className="text-xs text-destructive hover:underline">×</button>
              </form>
            </div>
            <p className="mt-1 text-lg font-bold">{p.price ? `₹${Number(p.price).toLocaleString('en-IN')}` : '—'}</p>
            <p className="text-xs text-muted-foreground">{p.sku ?? ''} {p.in_stock ? '· in stock' : '· out of stock'}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
