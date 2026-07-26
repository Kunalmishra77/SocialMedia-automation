-- ============================================================
-- 0011_vector_search.sql — semantic search over uploaded documents. Idempotent.
-- ============================================================

CREATE OR REPLACE FUNCTION public.match_vector_documents(
  query_embedding vector(1536), workspace_id_param uuid, match_count int DEFAULT 3
)
RETURNS TABLE(content text, similarity float)
LANGUAGE sql STABLE AS $$
  SELECT content, 1 - (embedding <=> query_embedding) AS similarity
  FROM vector_documents
  WHERE workspace_id = workspace_id_param AND embedding IS NOT NULL
  ORDER BY embedding <=> query_embedding
  LIMIT match_count;
$$;
