import { createAdminClient } from '@/lib/supabase/admin'
import { WidgetChat } from './widget-chat'

export default async function WidgetPage({ params }: { params: Promise<{ workspaceId: string }> }) {
  const { workspaceId } = await params
  const admin = createAdminClient()
  const { data: ws } = await admin.from('workspaces').select('name, status').eq('id', workspaceId).maybeSingle()

  if (!ws || ws.status !== 'active') {
    return <div className="flex h-screen items-center justify-center text-sm text-muted-foreground">Chat unavailable.</div>
  }
  return <WidgetChat workspaceId={workspaceId} name={ws.name} />
}
