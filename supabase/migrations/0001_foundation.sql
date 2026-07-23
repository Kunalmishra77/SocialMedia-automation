-- ============================================================
-- 0001_foundation.sql
-- Phase 1 · Sprint 1 — auth, workspaces, members, helpers, RLS
-- Idempotent: safe to re-run.
-- ============================================================

-- ---------- Extensions ----------
CREATE EXTENSION IF NOT EXISTS pgcrypto;      -- gen_random_uuid()

-- ---------- Enums ----------
DO $$ BEGIN
  CREATE TYPE user_role AS ENUM ('super_admin', 'admin', 'manager', 'agent');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE conversation_status AS ENUM ('open', 'assigned', 'resolved', 'pending', 'snoozed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE message_direction AS ENUM ('inbound', 'outbound');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE message_status AS ENUM ('queued', 'sent', 'delivered', 'read', 'failed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE message_type AS ENUM (
    'text', 'image', 'video', 'audio', 'share',
    'story_reply', 'story_mention', 'comment',
    'quick_reply', 'template', 'generic_template',
    'internal_note', 'reaction', 'reel_share', 'location'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE lead_stage AS ENUM ('new', 'contacted', 'follow_up', 'interested', 'converted', 'lost');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE campaign_status AS ENUM ('draft', 'scheduled', 'running', 'paused', 'completed', 'failed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE campaign_type AS ENUM (
    'window_broadcast', 'story_engagement', 'post_comment',
    're_engagement', 'segment', 'reel_engagement'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE post_type AS ENUM ('feed', 'reel', 'carousel', 'story', 'live');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---------- Shared helper: set_updated_at ----------
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

-- ---------- profiles ----------
CREATE TABLE IF NOT EXISTS public.profiles (
  id                UUID PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
  full_name         TEXT,
  email             TEXT UNIQUE,
  avatar_url        TEXT,
  phone             TEXT,
  timezone          TEXT DEFAULT 'Asia/Kolkata',
  preferences       JSONB DEFAULT '{}',
  last_seen_at      TIMESTAMPTZ,
  is_platform_admin BOOLEAN DEFAULT false,
  expertise_tags    TEXT[] DEFAULT '{}',
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

DROP TRIGGER IF EXISTS trg_profiles_updated_at ON public.profiles;
CREATE TRIGGER trg_profiles_updated_at BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Auto-create a profile row whenever an auth user is created.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (NEW.id, NEW.email, NEW.raw_user_meta_data->>'full_name')
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ---------- workspaces ----------
CREATE TABLE IF NOT EXISTS public.workspaces (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                     TEXT NOT NULL,
  slug                     TEXT UNIQUE NOT NULL,
  logo_url                 TEXT,
  plan                     TEXT NOT NULL DEFAULT 'free',
  is_active                BOOLEAN DEFAULT true,
  status                   VARCHAR(20) NOT NULL DEFAULT 'active',  -- active|suspended|deleted (module 27)
  suspended_at             TIMESTAMPTZ,
  suspended_reason         TEXT,
  onboarding_complete      BOOLEAN DEFAULT false,
  owner_email              TEXT,
  industry                 TEXT,
  subscription_status      TEXT DEFAULT 'active',
  razorpay_subscription_id TEXT,
  next_billing_date        TIMESTAMPTZ,
  payment_failed_at        TIMESTAMPTZ,
  brand_color              TEXT DEFAULT '#E1306C',
  custom_domain            TEXT,
  plan_limits              JSONB DEFAULT '{}',
  settings                 JSONB DEFAULT '{}',
  created_at               TIMESTAMPTZ DEFAULT NOW(),
  updated_at               TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_workspaces_slug ON public.workspaces(slug);

DROP TRIGGER IF EXISTS trg_workspaces_updated_at ON public.workspaces;
CREATE TRIGGER trg_workspaces_updated_at BEFORE UPDATE ON public.workspaces
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------- workspace_members ----------
CREATE TABLE IF NOT EXISTS public.workspace_members (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces ON DELETE CASCADE,
  user_id      UUID NOT NULL REFERENCES public.profiles ON DELETE CASCADE,
  role         user_role NOT NULL DEFAULT 'agent',
  is_online    BOOLEAN DEFAULT false,
  max_chats    INTEGER DEFAULT 10,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (workspace_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_wm_workspace ON public.workspace_members(workspace_id);
CREATE INDEX IF NOT EXISTS idx_wm_user ON public.workspace_members(user_id);

-- ---------- Auth helper functions (SECURITY DEFINER — bypass RLS to avoid recursion) ----------
CREATE OR REPLACE FUNCTION public.is_workspace_member(p_workspace_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM workspace_members
    WHERE workspace_id = p_workspace_id AND user_id = auth.uid()
  )
$$;

CREATE OR REPLACE FUNCTION public.get_member_role(p_workspace_id uuid)
RETURNS user_role LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT role FROM workspace_members
  WHERE workspace_id = p_workspace_id AND user_id = auth.uid()
$$;

CREATE OR REPLACE FUNCTION public.can_view_assigned_row(p_workspace_id uuid, p_assigned_agent_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT is_workspace_member(p_workspace_id) AND (
    get_member_role(p_workspace_id) IS DISTINCT FROM 'agent'
    OR p_assigned_agent_id = auth.uid()
  )
$$;

-- ---------- RLS ----------
ALTER TABLE public.profiles          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspaces        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_members ENABLE ROW LEVEL SECURITY;

-- profiles: a user sees and edits only their own profile row.
DROP POLICY IF EXISTS profiles_select_own ON public.profiles;
CREATE POLICY profiles_select_own ON public.profiles
  FOR SELECT USING (id = auth.uid());
DROP POLICY IF EXISTS profiles_update_own ON public.profiles;
CREATE POLICY profiles_update_own ON public.profiles
  FOR UPDATE USING (id = auth.uid()) WITH CHECK (id = auth.uid());

-- workspaces: members can read; only admins/owner can update (checked in app + here).
DROP POLICY IF EXISTS workspaces_select_member ON public.workspaces;
CREATE POLICY workspaces_select_member ON public.workspaces
  FOR SELECT USING (public.is_workspace_member(id));
DROP POLICY IF EXISTS workspaces_update_admin ON public.workspaces;
CREATE POLICY workspaces_update_admin ON public.workspaces
  FOR UPDATE USING (public.get_member_role(id) IN ('super_admin', 'admin'));

-- workspace_members: members can read the roster of their workspace.
DROP POLICY IF EXISTS wm_select_member ON public.workspace_members;
CREATE POLICY wm_select_member ON public.workspace_members
  FOR SELECT USING (public.is_workspace_member(workspace_id));

-- Note: workspace creation and member INSERTs happen through the service-role
-- client in server actions (createWorkspaceAction / invite accept), so no
-- INSERT policy is exposed to the anon/auth client here by design.
