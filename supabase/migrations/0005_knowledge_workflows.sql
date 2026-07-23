-- ============================================================
-- 0005_knowledge_workflows.sql
-- Knowledge base (pgvector), vector documents, workflow automations
-- + sessions, semantic search function. Idempotent.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS vector;

-- ---------- knowledge_base ----------
CREATE TABLE IF NOT EXISTS public.knowledge_base (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    UUID NOT NULL REFERENCES public.workspaces ON DELETE CASCADE,
  title           TEXT NOT NULL,
  content         TEXT NOT NULL,
  category        TEXT,
  is_active       BOOLEAN DEFAULT true,
  tags            TEXT[] DEFAULT '{}',
  source          VARCHAR(20) DEFAULT 'manual',
  source_filename TEXT,
  is_draft        BOOLEAN DEFAULT false,
  priority        INTEGER DEFAULT 0,
  char_count      INTEGER GENERATED ALWAYS AS (length(content)) STORED,
  embedding       vector(1536),
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_kb_workspace ON public.knowledge_base(workspace_id, is_active);
CREATE INDEX IF NOT EXISTS idx_kb_embedding ON public.knowledge_base USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

DROP TRIGGER IF EXISTS trg_kb_updated_at ON public.knowledge_base;
CREATE TRIGGER trg_kb_updated_at BEFORE UPDATE ON public.knowledge_base
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------- vector_documents ----------
CREATE TABLE IF NOT EXISTS public.vector_documents (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces ON DELETE CASCADE,
  filename     TEXT NOT NULL,
  file_type    VARCHAR(10),
  chunk_index  INTEGER NOT NULL,
  content      TEXT NOT NULL,
  embedding    vector(1536),
  created_at   TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_vdoc_workspace ON public.vector_documents(workspace_id);
CREATE INDEX IF NOT EXISTS idx_vdoc_embedding ON public.vector_documents USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- ---------- semantic search ----------
CREATE OR REPLACE FUNCTION public.match_knowledge_base(
  query_embedding vector(1536), workspace_id_param uuid,
  match_count int DEFAULT 5, min_similarity float DEFAULT 0.35
)
RETURNS TABLE(id uuid, title text, content text, similarity float)
LANGUAGE sql STABLE AS $$
  SELECT id, title, content, 1 - (embedding <=> query_embedding) AS similarity
  FROM knowledge_base
  WHERE workspace_id = workspace_id_param AND is_active = true AND is_draft = false
    AND embedding IS NOT NULL
    AND 1 - (embedding <=> query_embedding) > min_similarity
  ORDER BY embedding <=> query_embedding
  LIMIT match_count;
$$;

-- ---------- workflow_automations ----------
CREATE TABLE IF NOT EXISTS public.workflow_automations (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id   UUID NOT NULL REFERENCES public.workspaces ON DELETE CASCADE,
  name           TEXT NOT NULL,
  is_active      BOOLEAN DEFAULT false,
  trigger_type   TEXT NOT NULL,
  trigger_config JSONB DEFAULT '{}',
  nodes          JSONB DEFAULT '[]',
  edges          JSONB DEFAULT '[]',
  run_count      INTEGER DEFAULT 0,
  last_run_at    TIMESTAMPTZ,
  created_by     UUID REFERENCES public.profiles,
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  updated_at     TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_wf_workspace ON public.workflow_automations(workspace_id, is_active);

DROP TRIGGER IF EXISTS trg_wf_updated_at ON public.workflow_automations;
CREATE TRIGGER trg_wf_updated_at BEFORE UPDATE ON public.workflow_automations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------- workflow_sessions ----------
CREATE TABLE IF NOT EXISTS public.workflow_sessions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id     UUID NOT NULL REFERENCES public.workflow_automations ON DELETE CASCADE,
  conversation_id UUID REFERENCES public.conversations,
  contact_id      UUID REFERENCES public.contacts,
  current_node_id TEXT,
  status          VARCHAR(20) DEFAULT 'active',
  context         JSONB DEFAULT '{}',
  started_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_wfs_workflow ON public.workflow_sessions(workflow_id, status);

-- ---------- RLS ----------
ALTER TABLE public.knowledge_base       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vector_documents     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workflow_automations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workflow_sessions    ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS kb_member ON public.knowledge_base;
CREATE POLICY kb_member ON public.knowledge_base FOR SELECT USING (public.is_workspace_member(workspace_id));
DROP POLICY IF EXISTS vdoc_member ON public.vector_documents;
CREATE POLICY vdoc_member ON public.vector_documents FOR SELECT USING (public.is_workspace_member(workspace_id));
DROP POLICY IF EXISTS wf_member ON public.workflow_automations;
CREATE POLICY wf_member ON public.workflow_automations FOR SELECT USING (public.is_workspace_member(workspace_id));
