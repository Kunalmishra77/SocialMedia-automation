import { redirect } from 'next/navigation'
import { requireUser, getActiveMembership } from '@/lib/authz'
import { createAdminClient } from '@/lib/supabase/admin'
import { updateBookingStatusAction } from '@/lib/actions/bookings'
import { PageHeader } from '@/components/dashboard/page-header'
import { AutoSubmitSelect } from '@/components/ui/auto-submit-select'
import { AddBooking } from './add-booking'

const STATUS_COLOR: Record<string, string> = {
  booked: 'bg-sky-500/15 text-sky-600',
  completed: 'bg-emerald-500/15 text-emerald-600',
  cancelled: 'bg-red-500/15 text-red-600',
  no_show: 'bg-amber-500/15 text-amber-600',
}

export default async function BookingsPage() {
  const user = await requireUser()
  const { active } = await getActiveMembership(user.id)
  if (!active) redirect('/workspace/new')

  const admin = createAdminClient()
  const { data: bookings } = await admin
    .from('bookings')
    .select('id, name, service, phone, starts_at, status')
    .eq('workspace_id', active.workspaceId)
    .order('starts_at', { ascending: true })
    .limit(200)

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <PageHeader title="Bookings" subtitle="Appointments & bookings from your channels." action={<AddBooking />} />

      <div className="overflow-hidden rounded-lg border border-border bg-card">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-muted-foreground">
            <tr>
              <th className="px-4 py-2 text-left font-medium">Customer</th>
              <th className="px-4 py-2 text-left font-medium">Service</th>
              <th className="px-4 py-2 text-left font-medium">When</th>
              <th className="px-4 py-2 text-left font-medium">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {(!bookings || bookings.length === 0) && (
              <tr><td colSpan={4} className="px-4 py-10 text-center text-muted-foreground">No bookings yet.</td></tr>
            )}
            {bookings?.map((b) => (
              <tr key={b.id} className="hover:bg-muted/40">
                <td className="px-4 py-3">
                  <p className="font-medium">{b.name}</p>
                  {b.phone && <p className="text-xs text-muted-foreground">{b.phone}</p>}
                </td>
                <td className="px-4 py-3 text-muted-foreground">{b.service ?? '—'}</td>
                <td className="px-4 py-3 text-muted-foreground">{b.starts_at ? new Date(b.starts_at).toLocaleString() : '—'}</td>
                <td className="px-4 py-3">
                  <form action={updateBookingStatusAction} className="inline-flex items-center gap-2">
                    <input type="hidden" name="id" value={b.id} />
                    <span className={`rounded-full px-2 py-0.5 text-xs capitalize ${STATUS_COLOR[b.status] ?? ''}`}>{b.status.replace('_', ' ')}</span>
                    <AutoSubmitSelect
                      name="status"
                      defaultValue={b.status}
                      options={[
                        { value: 'booked', label: 'Booked' },
                        { value: 'completed', label: 'Completed' },
                        { value: 'cancelled', label: 'Cancelled' },
                        { value: 'no_show', label: 'No show' },
                      ]}
                      className="h-7 rounded border border-input bg-background px-1 text-xs"
                    />
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
