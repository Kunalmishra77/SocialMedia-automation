# 03 — Multi-Tenant Workspace Architecture

## 3.1 Tenancy Model

Each business is a **workspace**. Every data table carries `workspace_id FK`. Supabase Row Level Security enforces isolation — no SQL query from a client-side Supabase call can ever read another workspace's data.

A workspace has:
- One or more connected Instagram accounts
- Team members with role-based permissions
- Independent plan (Free/Starter/Pro/Enterprise)
- Independent AI settings, business hours, inbox rules
- Independent session limits

---

## 3.2 Workspace Roles

```typescript
// types/auth.types.ts
export type UserRole = 'super_admin' | 'admin' | 'manager' | 'agent'

export type Permission =
  | 'manage_workspace'       // settings, branding, integrations, IG account connect
  | 'manage_team'            // invite, remove, change roles
  | 'create_campaigns'       // campaign CRUD + launch
  | 'view_analytics'         // analytics dashboard
  | 'manage_templates'       // IG message template CRUD + Meta submission
  | 'handle_conversations'   // reply, assign, resolve, snooze
  | 'manage_contacts'        // CRUD contacts, leads, notes
  | 'manage_content'         // content calendar, post scheduling
  | 'billing_management'     // plan upgrade, invoice view
  | 'view_all_conversations' // see all conversations (not just assigned)
  | 'manage_flows'           // chatbot flow + workflow builder
  | 'manage_knowledge_base'  // KB entries + file uploads
  | 'manage_influencers'     // influencer CRM + campaigns
  | 'manage_ads'             // Meta Ads dashboard + lead sync

export const ROLE_PERMISSIONS: Record<UserRole, Permission[]> = {
  super_admin: [
    'manage_workspace', 'manage_team', 'create_campaigns', 'view_analytics',
    'manage_templates', 'handle_conversations', 'manage_contacts',
    'manage_content', 'billing_management', 'view_all_conversations',
    'manage_flows', 'manage_knowledge_base', 'manage_influencers', 'manage_ads'
  ],
  admin: [
    'manage_workspace', 'manage_team', 'create_campaigns', 'view_analytics',
    'manage_templates', 'handle_conversations', 'manage_contacts',
    'manage_content', 'billing_management', 'view_all_conversations',
    'manage_flows', 'manage_knowledge_base', 'manage_influencers', 'manage_ads'
  ],
  manager: [
    'manage_team', 'create_campaigns', 'view_analytics', 'manage_templates',
    'handle_conversations', 'manage_contacts', 'manage_content',
    'view_all_conversations', 'manage_flows', 'manage_knowledge_base',
    'manage_influencers'
  ],
  agent: [
    'handle_conversations', 'manage_contacts'
  ],
}
```

---

## 3.3 Plan Tiers

```typescript
// lib/plan-features.ts
export const PLAN_LIMITS = {
  free:       { maxAgents: 2,  maxMessages: 1_000,   maxContacts: 500,    maxCampaigns: 2,   maxIgAccounts: 1, maxFlows: 1,  maxKbEntries: 20  },
  starter:    { maxAgents: 3,  maxMessages: 5_000,   maxContacts: 2_000,  maxCampaigns: 10,  maxIgAccounts: 1, maxFlows: 3,  maxKbEntries: 50  },
  pro:        { maxAgents: 10, maxMessages: 25_000,  maxContacts: 15_000, maxCampaigns: 50,  maxIgAccounts: 3, maxFlows: 20, maxKbEntries: 500 },
  enterprise: { maxAgents: 25, maxMessages: 100_000, maxContacts: 75_000, maxCampaigns: 200, maxIgAccounts: 10, maxFlows: 50, maxKbEntries: 2000 },
}

export type PlanFeature =
  // Phase 1
  | 'inbox'
  | 'ai_auto_reply'
  | 'chatbot_flows'
  | 'knowledge_base'
  // Phase 2
  | 'content_calendar'
  | 'post_scheduling'
  | 'ai_captions'
  | 'campaign_window_broadcast'
  | 'campaign_post_comment'
  // Phase 3
  | 'campaign_re_engagement'
  | 'workflow_builder'
  | 'crm_pipeline'
  | 'lead_scoring'
  | 'contact_import'
  // Phase 4
  | 'advanced_analytics'
  | 'agent_analytics'
  | 'sla_policies'
  | 'csat'
  | 'follow_up_sequences'
  | 'outbound_webhooks'
  | 'api_access'
  // Phase 5
  | 'influencer_crm'
  | 'instagram_shopping'
  | 'meta_ads_integration'
  | 'multi_ig_accounts'
  // Enterprise
  | 'white_label'
  | 'custom_domain'
  | 'audit_logs'
  | 'priority_support'

export const PLAN_FEATURES: Record<string, Set<PlanFeature>> = {
  free: new Set([
    'inbox', 'ai_auto_reply', 'chatbot_flows', 'knowledge_base',
    'campaign_window_broadcast', 'campaign_post_comment'
  ]),
  starter: new Set([
    'inbox', 'ai_auto_reply', 'chatbot_flows', 'knowledge_base',
    'campaign_window_broadcast', 'campaign_post_comment', 'campaign_re_engagement',
    'content_calendar', 'post_scheduling', 'ai_captions',
    'crm_pipeline', 'contact_import', 'follow_up_sequences', 'sla_policies'
  ]),
  pro: new Set([
    // all starter plus:
    'workflow_builder', 'lead_scoring', 'advanced_analytics', 'agent_analytics',
    'csat', 'outbound_webhooks', 'api_access', 'influencer_crm',
    'multi_ig_accounts', 'campaign_story_engagement'
  ]),
  enterprise: new Set([
    // all pro plus:
    'instagram_shopping', 'meta_ads_integration',
    'white_label', 'custom_domain', 'audit_logs', 'priority_support'
  ]),
}
```

---

## 3.4 Workspace Creation Flow

```
User signs up → /signup
      ↓
Supabase Auth creates user → trigger auto-creates profiles row
      ↓
Redirect to /workspace/new
      ↓
User fills: workspace name, industry, Instagram handle (optional)
      ↓
createWorkspaceAction():
  1. Generate slug from name
  2. INSERT workspaces {name, slug, plan='free', owner_email}
  3. INSERT workspace_members {role='super_admin'}
  4. Redirect to /onboarding (connect Instagram account)
```

---

## 3.5 Team Invite Flow

```typescript
// A. Admin sends invite
POST /api/team/invite { email, role }
  → INSERT team_invites { token=randomBytes(32).hex, status='pending', expires_at=7d }
  → sendMail({ to: email, subject: "You've been invited to {workspace}" })
  → Email contains: /accept-invite?token={token}

// B. Invitee accepts
GET /accept-invite?token=... → validate token, show workspace + role
POST /api/team/invite/accept { token, password? }
  → If new user: supabase.auth.admin.createUser({ email, password, email_confirm: true })
  → If existing user: verify they're already authenticated
  → INSERT workspace_members { workspace_id, user_id, role: invite.role }
  → UPDATE team_invites SET status='accepted'
  → DO NOT call createWorkspace() — user joins existing workspace
  → Redirect to /conversations (not /workspace/new)
```

---

## 3.6 Session Management (Concurrent Browser Limit)

Identical to WhatsApp platform (fully documented pattern):

- `workspace_sessions` table: `session_token VARCHAR(64) UNIQUE`, `expires_at` (30 days sliding)
- Gate applies only to `super_admin` and `admin` roles
- `workspaces.settings.max_sessions` (JSONB) → default 2 if absent
- Cookie name: `ws_session_token` — HttpOnly, Secure, SameSite=Lax
- Session creation: on first dashboard page load without valid cookie
- Session validation: on every dashboard page load with existing cookie
- Heartbeat: `POST /api/session/heartbeat` every 60 seconds (client component)
- Logout: deletes session row + clears cookie
- Cleanup: pg_cron `DELETE FROM workspace_sessions WHERE expires_at < NOW()` hourly

---

## 3.7 Multi-Workspace Support

A single user can belong to multiple workspaces. On login:
- 0 workspaces → redirect to `/workspace/new`
- 1 workspace → redirect to `/conversations`
- 2+ workspaces → redirect to `/workspace/select` (picker UI)

Active workspace stored in a cookie (`active_workspace_id`). Workspace switcher in the sidebar header.

---

## 3.8 Assignment-Based Agent Isolation

For `agent` role:
- Cannot see conversations not assigned to them (RLS enforced at DB layer)
- Cannot see leads not assigned to them
- Cannot see contacts unless linked to their assigned conversations or leads
- Sidebar hides: Team, Campaigns, Templates, Flows, Analytics, Settings, Knowledge Base, Influencers, Ads
- Direct URL access to hidden pages → server-side redirect to `/conversations`

RLS function (same pattern as WhatsApp platform):
```sql
CREATE OR REPLACE FUNCTION can_view_assigned_row(p_workspace_id uuid, p_assigned_agent_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT is_workspace_member(p_workspace_id) AND (
    get_member_role(p_workspace_id) IS DISTINCT FROM 'agent'
    OR p_assigned_agent_id = auth.uid()
  )
$$;
```
