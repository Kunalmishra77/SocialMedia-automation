import 'server-only'

import type { createAdminClient } from '@/lib/supabase/admin'
import { generateEmbedding } from '@/lib/ai/client'

type Admin = ReturnType<typeof createAdminClient>

/** Split text into ~800-char chunks on sentence/paragraph boundaries. */
export function chunkText(text: string, size = 800): string[] {
  const clean = text.replace(/\r/g, '').trim()
  if (!clean) return []
  const paras = clean.split(/\n{2,}/)
  const chunks: string[] = []
  let buf = ''
  for (const p of paras) {
    if ((buf + '\n\n' + p).length > size) {
      if (buf) chunks.push(buf.trim())
      if (p.length > size) {
        for (let i = 0; i < p.length; i += size) chunks.push(p.slice(i, i + size).trim())
        buf = ''
      } else {
        buf = p
      }
    } else {
      buf = buf ? `${buf}\n\n${p}` : p
    }
  }
  if (buf.trim()) chunks.push(buf.trim())
  return chunks.filter(Boolean)
}

/** Ingest a document: chunk, embed each chunk, store in vector_documents. */
export async function ingestDocument(
  admin: Admin,
  workspaceId: string,
  filename: string,
  fileType: string,
  text: string,
): Promise<{ chunks: number; embedded: number }> {
  const chunks = chunkText(text)
  let embedded = 0
  for (let i = 0; i < chunks.length; i++) {
    const emb = await generateEmbedding(chunks[i])
    await admin.from('vector_documents').insert({
      workspace_id: workspaceId,
      filename,
      file_type: fileType,
      chunk_index: i,
      content: chunks[i],
      embedding: emb ? `[${emb.join(',')}]` : null,
    })
    if (emb) embedded++
  }
  return { chunks: chunks.length, embedded }
}

/** Semantic search over vector_documents for a query. */
export async function searchDocuments(admin: Admin, workspaceId: string, query: string, limit = 3): Promise<string[]> {
  const emb = await generateEmbedding(query)
  if (!emb) return []
  // Uses pgvector distance via RPC-less order: fetch candidates and rank in SQL.
  const { data } = await admin.rpc('match_vector_documents', {
    query_embedding: `[${emb.join(',')}]`,
    workspace_id_param: workspaceId,
    match_count: limit,
  })
  return (data ?? []).map((d: { content: string }) => d.content)
}
