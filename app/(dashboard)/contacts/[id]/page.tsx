import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { requireUser, getActiveMembership } from '@/lib/authz'
import { createAdminClient } from '@/lib/supabase/admin'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export default async function ContactDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser()
  const { active } = await getActiveMembership(user.id)
  if (!active) redirect('/workspace/new')
  const { id } = await params

  const admin = createAdminClient()
  const { data: contact } = await admin
    .from('contacts')
    .select('*')
    .eq('id', id)
    .eq('workspace_id', active.workspaceId)
    .maybeSingle()
  if (!contact) notFound()

  const [{ data: leads }, { data: conversations }] = await Promise.all([
    admin.from('leads').select('id, title, stage, value, temperature').eq('contact_id', id),
    admin.from('conversations').select('id, channel, status, last_message, last_message_at').eq('contact_id', id),
  ])

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <Link href="/contacts" className="text-sm text-primary hover:underline">← All contacts</Link>

      <div className="flex items-center gap-4">
        <div className="brand-gradient flex h-14 w-14 items-center justify-center rounded-full text-xl font-bold text-white">
          {(contact.full_name || contact.ig_username || '?').charAt(0).toUpperCase()}
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            {contact.full_name || contact.ig_username || 'Unnamed contact'}
          </h1>
          <p className="text-sm text-muted-foreground">
            {contact.ig_username ? `@${contact.ig_username} · ` : ''}
            <span className="capitalize">{contact.lifecycle_stage}</span>
          </p>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-base">Details</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <Row label="Email" value={contact.email} />
            <Row label="Phone" value={contact.phone} />
            <Row label="Company" value={contact.company} />
            <Row label="Location" value={contact.location} />
            <Row label="Source" value={contact.source} />
            <Row label="Lead score" value={contact.lead_score != null ? String(contact.lead_score) : null} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Leads ({leads?.length ?? 0})</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            {(!leads || leads.length === 0) && <p className="text-muted-foreground">No leads.</p>}
            {leads?.map((l) => (
              <div key={l.id} className="flex items-center justify-between">
                <span>{l.title}</span>
                <span className="capitalize text-muted-foreground">{l.stage} · {l.temperature}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Conversations ({conversations?.length ?? 0})</CardTitle></CardHeader>
        <CardContent className="space-y-2 text-sm">
          {(!conversations || conversations.length === 0) && (
            <p className="text-muted-foreground">No conversations yet.</p>
          )}
          {conversations?.map((c) => (
            <div key={c.id} className="flex items-center justify-between border-b border-border pb-2 last:border-0">
              <span className="truncate">{c.last_message || '—'}</span>
              <span className="capitalize text-muted-foreground">{c.channel} · {c.status}</span>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  )
}

function Row({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span>{value || '—'}</span>
    </div>
  )
}
