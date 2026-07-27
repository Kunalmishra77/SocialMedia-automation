'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

/**
 * Subscribes to new messages/conversations for the workspace and refreshes the
 * current route so the inbox updates live without a manual refresh.
 */
export function RealtimeRefresh({ workspaceId }: { workspaceId: string }) {
  const router = useRouter()
  useEffect(() => {
    const supabase = createClient()
    const channel = supabase
      .channel(`ws:${workspaceId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `workspace_id=eq.${workspaceId}` }, () => router.refresh())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'conversations', filter: `workspace_id=eq.${workspaceId}` }, () => router.refresh())
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [workspaceId, router])
  return null
}
