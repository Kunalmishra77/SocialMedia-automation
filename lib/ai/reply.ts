import 'server-only'

import type { createAdminClient } from '@/lib/supabase/admin'
import { callAI, generateEmbedding, aiConfigured, type ChatMessage } from '@/lib/ai/client'
import { searchDocuments } from '@/lib/ai/vector'
import { logUsage } from '@/lib/usage'

type Admin = ReturnType<typeof createAdminClient>

/**
 * Generate an AI reply for the latest inbound message in a conversation, using
 * the workspace persona + knowledge base. Returns null if AI isn't configured
 * or generation fails.
 */
export async function getAIReply(
  admin: Admin,
  workspaceId: string,
  conversationId: string,
  lastInboundText: string,
): Promise<string | null> {
  if (!aiConfigured()) return null

  // Persona
  const { data: ws } = await admin.from('workspaces').select('name, settings').eq('id', workspaceId).maybeSingle()
  const persona = (ws?.settings as { agent_persona?: string } | null)?.agent_persona
    || `You are a helpful, friendly support agent for ${ws?.name ?? 'this business'}. Keep replies concise and warm.`

  // Knowledge base context — semantic if embeddings available, else top entries.
  let kbContext = ''
  const embedding = await generateEmbedding(lastInboundText)
  if (embedding) {
    await logUsage(admin, workspaceId, 'ai_embedding')
    const { data: matches } = await admin.rpc('match_knowledge_base', {
      query_embedding: embedding,
      workspace_id_param: workspaceId,
      match_count: 5,
      min_similarity: 0.3,
    })
    kbContext = (matches ?? []).map((m: { title: string; content: string }) => `# ${m.title}\n${m.content}`).join('\n\n')
  }
  if (!kbContext) {
    const { data: entries } = await admin
      .from('knowledge_base')
      .select('title, content')
      .eq('workspace_id', workspaceId)
      .eq('is_active', true)
      .eq('is_draft', false)
      .order('priority', { ascending: false })
      .limit(5)
    kbContext = (entries ?? []).map((e) => `# ${e.title}\n${e.content}`).join('\n\n')
  }

  // Also pull relevant chunks from uploaded documents (vector search).
  try {
    const docs = await searchDocuments(admin, workspaceId, lastInboundText, 3)
    if (docs.length) kbContext += (kbContext ? '\n\n' : '') + docs.join('\n\n')
  } catch {
    /* non-fatal */
  }

  // Recent history (last 10)
  const { data: history } = await admin
    .from('messages')
    .select('direction, content, type')
    .eq('conversation_id', conversationId)
    .eq('is_deleted', false)
    .neq('type', 'internal_note')
    .order('created_at', { ascending: false })
    .limit(10)

  const historyMsgs: ChatMessage[] = (history ?? [])
    .reverse()
    .filter((m) => m.content)
    .map((m) => ({ role: m.direction === 'inbound' ? 'user' : 'assistant', content: m.content as string }))

  const system = [
    persona,
    kbContext ? `\nUse this business knowledge to answer. If the answer isn't here, be honest and offer to connect a human.\n\n${kbContext}` : '',
    '\nRules: Never invent policies or prices. Keep replies under 80 words. Match the customer\'s language.',
  ].join('')

  const reply = await callAI([{ role: 'system', content: system }, ...historyMsgs], { maxTokens: 300, temperature: 0.6 })
  if (reply) await logUsage(admin, workspaceId, 'ai_reply')
  return reply
}
