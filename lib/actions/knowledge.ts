'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import { getUser, getActiveMembership, roleCan } from '@/lib/authz'
import { generateEmbedding, callAI, aiConfigured } from '@/lib/ai/client'
import { ingestDocument } from '@/lib/ai/vector'

/** AI: draft a knowledge base entry (title + content) from a topic. */
export async function aiGenerateKbEntry(topic: string): Promise<{ title?: string; content?: string; error?: string }> {
  await requireManageKb()
  if (!aiConfigured()) return { error: 'Add an OpenAI/OpenRouter key to use AI generation.' }
  const t = topic.trim()
  if (!t) return { error: 'Enter a topic' }
  const out = await callAI(
    [{ role: 'user', content: `Write a concise knowledge-base entry for a customer-support AI about: "${t}". Line 1: "TITLE: <short title>". Then the answer content in 2-5 sentences (facts only, no fluff).` }],
    { maxTokens: 260, temperature: 0.5 },
  )
  if (!out) return { error: 'Generation failed' }
  const m = out.match(/TITLE:\s*(.+)/i)
  const title = m?.[1]?.trim() ?? t
  const content = out.replace(/TITLE:.*(\n)?/i, '').trim()
  return { title, content }
}

/** AI: draft/improve the AI persona from a business description. */
export async function aiGeneratePersona(desc: string): Promise<{ persona?: string; error?: string }> {
  await requireManageKb()
  if (!aiConfigured()) return { error: 'Add an OpenAI/OpenRouter key to use AI generation.' }
  const d = desc.trim()
  if (!d) return { error: 'Describe your business' }
  const out = await callAI(
    [{ role: 'user', content: `Write a system persona (2-4 sentences) for an AI assistant that handles DMs for this business: "${d}". Define tone, what it helps with, and to hand off to a human when unsure. Return only the persona text.` }],
    { maxTokens: 200, temperature: 0.6 },
  )
  return out ? { persona: out.trim() } : { error: 'Generation failed' }
}

/** Sandbox: test the AI reply for a message using the workspace persona + KB.
 *  Runs the exact production pipeline (empty history), persists nothing. */
export async function sandboxReplyAction(message: string): Promise<{ reply?: string; kbContext?: string; error?: string }> {
  const workspaceId = await requireManageKb()
  const m = message.trim()
  if (!m) return { error: 'Type a message to test.' }
  const { getSandboxReply } = await import('@/lib/ai/reply')
  const admin = createAdminClient()
  const res = await getSandboxReply(admin, workspaceId, m)
  if (!res.configured) return { error: 'Add an OpenAI/OpenRouter key to test the AI.' }
  return { reply: res.reply ?? '(no reply generated)', kbContext: res.kbContext }
}

async function requireManageKb(): Promise<string> {
  const user = await getUser()
  if (!user) redirect('/login')
  const { active } = await getActiveMembership(user.id)
  if (!active) redirect('/workspace/new')
  // managers/admins manage KB; agents cannot.
  if (!roleCan(active.role, 'manage_content') && active.role !== 'manager') throw new Error('Forbidden')
  return active.workspaceId
}

export async function createKbEntryAction(formData: FormData): Promise<{ error?: string }> {
  const workspaceId = await requireManageKb()
  const title = String(formData.get('title') ?? '').trim()
  const content = String(formData.get('content') ?? '').trim()
  const category = String(formData.get('category') ?? '').trim() || null
  if (!title || !content) return { error: 'Title and content are required' }

  const admin = createAdminClient()
  const { data: entry } = await admin
    .from('knowledge_base')
    .insert({ workspace_id: workspaceId, title, content, category, source: 'manual', is_active: true })
    .select('id')
    .single()

  // Generate + store embedding when an OpenAI key is configured (enables semantic search).
  if (entry) {
    const embedding = await generateEmbedding(`${title}\n${content}`)
    if (embedding) {
      // pgvector expects the literal '[v1,v2,...]' text form.
      await admin.from('knowledge_base').update({ embedding: `[${embedding.join(',')}]` }).eq('id', entry.id)
    }
  }

  revalidatePath('/knowledge-base')
  return {}
}

export async function deleteKbEntryAction(formData: FormData): Promise<void> {
  const workspaceId = await requireManageKb()
  const id = String(formData.get('id'))
  const admin = createAdminClient()
  await admin.from('knowledge_base').delete().eq('id', id).eq('workspace_id', workspaceId)
  revalidatePath('/knowledge-base')
}

export async function toggleKbEntryAction(formData: FormData): Promise<void> {
  const workspaceId = await requireManageKb()
  const id = String(formData.get('id'))
  const isActive = formData.get('is_active') === 'true'
  const admin = createAdminClient()
  await admin.from('knowledge_base').update({ is_active: isActive }).eq('id', id).eq('workspace_id', workspaceId)
  revalidatePath('/knowledge-base')
}

/** Ingest a document — an uploaded file (PDF/Excel/CSV/DOCX/TXT) or pasted text:
 *  extract → chunk → embed into vector_documents. */
export async function ingestDocumentAction(formData: FormData): Promise<{ error?: string; ok?: string }> {
  const workspaceId = await requireManageKb()
  const admin = createAdminClient()

  let filename = String(formData.get('filename') ?? '').trim()
  let content = ''
  let fileType = 'txt'

  const file = formData.get('file') as File | null
  if (file && typeof file === 'object' && file.size > 0) {
    if (file.size > 25 * 1024 * 1024) return { error: 'File must be under 25 MB.' }
    const { extractText } = await import('@/lib/ai/extract')
    const res = await extractText(file)
    if (res.error) return { error: res.error }
    content = res.text.trim()
    fileType = res.fileType
    filename = filename || file.name
    if (content.length < 20) return { error: 'No readable text found in that file (is it a scanned/image-only PDF?).' }
  } else {
    content = String(formData.get('content') ?? '').trim()
    filename = filename || 'document.txt'
    if (content.length < 20) return { error: 'Paste at least a paragraph of text, or choose a file.' }
  }

  const { chunks, embedded, truncated } = await ingestDocument(admin, workspaceId, filename, fileType, content)
  revalidatePath('/knowledge-base')
  const trunc = truncated ? ' (large file — only the first part was indexed; split it for full coverage)' : ''
  return { ok: `Ingested “${filename}” — ${chunks} chunk(s)${embedded < chunks ? ` · ${embedded} embedded (add an AI key for semantic search)` : ' embedded ✓'}${trunc}` }
}

/** Delete all chunks of an ingested document. */
export async function deleteDocumentAction(formData: FormData): Promise<void> {
  const workspaceId = await requireManageKb()
  const filename = String(formData.get('filename') ?? '')
  const admin = createAdminClient()
  await admin.from('vector_documents').delete().eq('workspace_id', workspaceId).eq('filename', filename)
  revalidatePath('/knowledge-base')
}

/** Update workspace AI settings stored in workspaces.settings JSONB. */
export async function updateAiSettingsAction(formData: FormData): Promise<{ ok?: boolean; error?: string }> {
  const workspaceId = await requireManageKb()
  const persona = String(formData.get('agent_persona') ?? '').trim()
  const autoReply = formData.get('auto_reply') === 'on'
  const followGate = formData.get('follow_gate') === 'on'
  const autoLike = formData.get('auto_like') === 'on'
  const followGateMsg = String(formData.get('follow_gate_message') ?? '').trim()

  const admin = createAdminClient()
  const { data: ws } = await admin.from('workspaces').select('settings').eq('id', workspaceId).single()
  const settings = {
    ...(ws?.settings ?? {}),
    agent_persona: persona,
    auto_reply_enabled: autoReply,
    follow_gate_enabled: followGate,
    auto_like_comments: autoLike,
    follow_gate_message: followGateMsg || undefined,
  }
  await admin.from('workspaces').update({ settings }).eq('id', workspaceId)
  revalidatePath('/knowledge-base')
  return { ok: true }
}
