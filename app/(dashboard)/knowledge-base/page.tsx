import { redirect } from 'next/navigation'
import { requireUser, getActiveMembership } from '@/lib/authz'
import { createAdminClient } from '@/lib/supabase/admin'
import { deleteKbEntryAction } from '@/lib/actions/knowledge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { KbEditor } from './kb-editor'
import { AiSettings } from './ai-settings'

export default async function KnowledgeBasePage() {
  const user = await requireUser()
  const { active } = await getActiveMembership(user.id)
  if (!active) redirect('/workspace/new')
  if (active.role === 'agent') redirect('/')

  const admin = createAdminClient()
  const [{ data: entries }, { data: ws }] = await Promise.all([
    admin
      .from('knowledge_base')
      .select('id, title, category, char_count, is_active, created_at')
      .eq('workspace_id', active.workspaceId)
      .order('created_at', { ascending: false }),
    admin.from('workspaces').select('settings').eq('id', active.workspaceId).single(),
  ])

  const settings = (ws?.settings ?? {}) as { agent_persona?: string; auto_reply_enabled?: boolean }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Knowledge Base &amp; AI</h1>
        <p className="text-sm text-muted-foreground">
          Teach the AI about your business — it uses these to answer DMs.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>AI settings</CardTitle>
          <CardDescription>Persona and auto-reply behaviour.</CardDescription>
        </CardHeader>
        <CardContent>
          <AiSettings
            persona={settings.agent_persona ?? ''}
            autoReply={settings.auto_reply_enabled ?? false}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <div>
            <CardTitle>Knowledge entries</CardTitle>
            <CardDescription>{entries?.length ?? 0} entries</CardDescription>
          </div>
          <KbEditor />
        </CardHeader>
        <CardContent className="space-y-3">
          {(!entries || entries.length === 0) && (
            <p className="text-sm text-muted-foreground">
              No entries yet. Add FAQs, policies, product info — anything the AI should know.
            </p>
          )}
          {entries?.map((e) => (
            <div key={e.id} className="flex items-center justify-between border-b border-border pb-3 last:border-0">
              <div>
                <p className="text-sm font-medium">{e.title}</p>
                <p className="text-xs text-muted-foreground">
                  {e.category ? `${e.category} · ` : ''}{e.char_count} chars
                  {!e.is_active && ' · inactive'}
                </p>
              </div>
              <form action={deleteKbEntryAction}>
                <input type="hidden" name="id" value={e.id} />
                <button className="rounded-md px-2 py-1 text-xs text-destructive hover:bg-destructive/10">
                  Delete
                </button>
              </form>
            </div>
          ))}
        </CardContent>
      </Card>

      <p className="text-center text-xs text-muted-foreground">
        Semantic search (embeddings) activates once an OpenAI/OpenRouter key is configured.
      </p>
    </div>
  )
}
