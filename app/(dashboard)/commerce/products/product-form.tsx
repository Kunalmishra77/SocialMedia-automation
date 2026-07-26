'use client'

import { useState } from 'react'
import { useActionState } from 'react'
import { createProductAction } from '@/lib/actions/commerce'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

export function ProductForm() {
  const [open, setOpen] = useState(false)
  const [state, formAction, pending] = useActionState<{ error?: string }, FormData>(
    async (_prev, fd) => {
      const res = await createProductAction(fd)
      if (!res.error) setOpen(false)
      return res
    },
    {},
  )

  if (!open) return <Button size="sm" onClick={() => setOpen(true)}>+ Add product</Button>

  return (
    <form action={formAction} className="rounded-lg border border-border bg-card p-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <Input name="name" placeholder="Product name" required />
        <Input name="price" type="number" placeholder="Price (₹)" />
        <Input name="sku" placeholder="SKU" />
        <Input name="product_url" placeholder="Product URL" />
      </div>
      {state.error && <p className="mt-2 text-sm text-destructive">{state.error}</p>}
      <div className="mt-3 flex gap-2">
        <Button type="submit" size="sm" disabled={pending}>{pending ? 'Saving…' : 'Save'}</Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>Cancel</Button>
      </div>
    </form>
  )
}
