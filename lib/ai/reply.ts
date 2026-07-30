import 'server-only'

import type { createAdminClient } from '@/lib/supabase/admin'
import { callAI, generateEmbedding, aiConfigured, type ChatMessage } from '@/lib/ai/client'
import { searchDocuments } from '@/lib/ai/vector'
import { logUsage } from '@/lib/usage'

type Admin = ReturnType<typeof createAdminClient>

/** Resolve the workspace persona (or a sensible default). */
async function getPersona(admin: Admin, workspaceId: string): Promise<string> {
  const { data: ws } = await admin.from('workspaces').select('name, settings').eq('id', workspaceId).maybeSingle()
  return (ws?.settings as { agent_persona?: string } | null)?.agent_persona
    || `You are a helpful, friendly support agent for ${ws?.name ?? 'this business'}. Keep replies concise and warm.`
}

/**
 * Retrieve grounding context for a message: semantic KB match → uploaded document
 * chunks → priority-ordered entries fallback. Shared by production + the sandbox so
 * both ground on identical knowledge.
 */
export async function retrieveKbContext(admin: Admin, workspaceId: string, message: string, logEmbeddingUsage = false): Promise<string> {
  let kbContext = ''
  const embedding = await generateEmbedding(message)
  if (embedding) {
    if (logEmbeddingUsage) await logUsage(admin, workspaceId, 'ai_embedding')
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
  try {
    const docs = await searchDocuments(admin, workspaceId, message, 3)
    if (docs.length) kbContext += (kbContext ? '\n\n' : '') + docs.join('\n\n')
  } catch {
    /* non-fatal */
  }
  return kbContext
}

/** Build the system prompt (identical for production + sandbox). */
function buildSystemPrompt(persona: string, kbContext: string): string {
  return [
    persona,
    kbContext ? `\nUse this business knowledge to answer. If the answer isn't here, be honest and offer to connect a human.\n\n${kbContext}` : '',
    '\nRules: Never invent policies or prices. Keep replies under 80 words. Match the customer\'s language.',
  ].join('')
}

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

  const persona = await getPersona(admin, workspaceId)
  const kbContext = await retrieveKbContext(admin, workspaceId, lastInboundText, true)

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

  const system = buildSystemPrompt(persona, kbContext)
  const reply = await callAI([{ role: 'system', content: system }, ...historyMsgs], { maxTokens: 300, temperature: 0.6 })
  if (reply) await logUsage(admin, workspaceId, 'ai_reply')
  return reply
}

/**
 * Sandbox test reply — runs the EXACT same persona + KB retrieval + prompting as
 * production, with an empty conversation history. Nothing is persisted. Returns the
 * reply plus the knowledge context it grounded on (so the user can see it).
 */
export async function getSandboxReply(
  admin: Admin,
  workspaceId: string,
  message: string,
): Promise<{ reply: string | null; kbContext: string; configured: boolean }> {
  if (!aiConfigured()) return { reply: null, kbContext: '', configured: false }
  const persona = await getPersona(admin, workspaceId)
  const kbContext = await retrieveKbContext(admin, workspaceId, message, false)
  const system = buildSystemPrompt(persona, kbContext)
  const reply = await callAI([{ role: 'system', content: system }, { role: 'user', content: message }], { maxTokens: 300, temperature: 0.6 })
  if (reply) await logUsage(admin, workspaceId, 'ai_reply')
  return { reply, kbContext, configured: true }
}
