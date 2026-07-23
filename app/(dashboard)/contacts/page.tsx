import Link from 'next/link'
import { redirect } from 'next/navigation'
import { requireUser, getActiveMembership } from '@/lib/authz'
import { createAdminClient } from '@/lib/supabase/admin'
import { AddContact } from './add-contact'

export default async function ContactsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>
}) {
  const user = await requireUser()
  const { active } = await getActiveMembership(user.id)
  if (!active) redirect('/workspace/new')
  const { q } = await searchParams

  const admin = createAdminClient()
  let query = admin
    .from('contacts')
    .select('id, full_name, ig_username, email, phone, lifecycle_stage, tags, created_at')
    .eq('workspace_id', active.workspaceId)
    .order('created_at', { ascending: false })
    .limit(100)
  if (q?.trim()) query = query.or(`full_name.ilike.%${q}%,ig_username.ilike.%${q}%,email.ilike.%${q}%`)
  const { data: contacts } = await query

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Contacts</h1>
          <p className="text-sm text-muted-foreground">{contacts?.length ?? 0} shown</p>
        </div>
        <AddContact />
      </div>

      <form className="flex gap-2">
        <input
          name="q"
          defaultValue={q ?? ''}
          placeholder="Search contacts…"
          className="h-10 flex-1 rounded-md border border-input bg-background px-3 text-sm"
        />
        <button className="rounded-md border border-input px-4 text-sm hover:bg-muted">Search</button>
      </form>

      <div className="overflow-hidden rounded-lg border border-border bg-card">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-muted-foreground">
            <tr>
              <th className="px-4 py-2 text-left font-medium">Name</th>
              <th className="px-4 py-2 text-left font-medium">Instagram</th>
              <th className="px-4 py-2 text-left font-medium">Email</th>
              <th className="px-4 py-2 text-left font-medium">Stage</th>
              <th className="px-4 py-2 text-left font-medium">Tags</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {(!contacts || contacts.length === 0) && (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-muted-foreground">
                  No contacts yet. Add one, or they&apos;ll appear automatically when a channel is connected.
                </td>
              </tr>
            )}
            {contacts?.map((c) => (
              <tr key={c.id} className="hover:bg-muted/40">
                <td className="px-4 py-3">
                  <Link href={`/contacts/${c.id}`} className="font-medium text-primary hover:underline">
                    {c.full_name || c.ig_username || 'Unnamed'}
                  </Link>
                </td>
                <td className="px-4 py-3 text-muted-foreground">{c.ig_username ? `@${c.ig_username}` : '—'}</td>
                <td className="px-4 py-3 text-muted-foreground">{c.email ?? '—'}</td>
                <td className="px-4 py-3 capitalize">{c.lifecycle_stage}</td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-1">
                    {(c.tags ?? []).slice(0, 3).map((t: string) => (
                      <span key={t} className="rounded-full bg-muted px-2 py-0.5 text-xs">{t}</span>
                    ))}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
