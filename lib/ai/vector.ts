import 'server-only'

import type { createAdminClient } from '@/lib/supabase/admin'
import { generateEmbedding, generateEmbeddings } from '@/lib/ai/client'

type Admin = ReturnType<typeof createAdminClient>

/** Hard ceiling on chunks per document — protects against runaway cost/timeout. */
const MAX_CHUNKS = 400
/** How many chunks per embeddings request (the endpoint accepts arrays). */
const EMBED_BATCH = 64

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

/**
 * Ingest a document: chunk (capped), embed in batches, bulk-insert into
 * vector_documents. Batched embeddings keep this to a handful of API calls even
 * for large files, so it stays well within a serverless timeout and cost budget.
 * Returns `truncated` when the document exceeded the chunk ceiling.
 */
export async function ingestDocument(
  admin: Admin,
  workspaceId: string,
  filename: string,
  fileType: string,
  text: string,
): Promise<{ chunks: number; embedded: number; truncated: boolean }> {
  const all = chunkText(text)
  const truncated = all.length > MAX_CHUNKS
  const chunks = truncated ? all.slice(0, MAX_CHUNKS) : all
  let embedded = 0

  for (let start = 0; start < chunks.length; start += EMBED_BATCH) {
    const batch = chunks.slice(start, start + EMBED_BATCH)
    const embeddings = await generateEmbeddings(batch)
    const rows = batch.map((content, j) => {
      const emb = embeddings[j]
      if (emb) embedded++
      return {
        workspace_id: workspaceId,
        filename,
        file_type: fileType,
        chunk_index: start + j,
        content,
        embedding: emb ? `[${emb.join(',')}]` : null,
      }
    })
    const { error } = await admin.from('vector_documents').insert(rows)
    if (error) console.error('[ingest] chunk insert failed', error.message)
  }
  return { chunks: chunks.length, embedded, truncated }
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
