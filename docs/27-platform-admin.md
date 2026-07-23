# 27 — Platform Super-Admin Panel

**Priority:** Add-on module (build first — small, self-contained, immediate value)
**Audience:** The SaaS owner/operator (you), NOT workspace customers.

> This module sits ABOVE all workspaces. It is completely separate from the
> workspace-level `super_admin` role defined in [03-multi-tenant.md](03-multi-tenant.md).
> A workspace `super_admin` controls one business. A **platform admin** controls the
> entire platform — every workspace, every user, billing, and system health.

---

## 27.1 Why This Exists

The base blueprint is a pure multi-tenant SaaS: every client self-serves inside their
own workspace, isolated by RLS. There was no god-view for the operator. This module adds it:

- See every workspace, signup, and rupee of revenue in one place
- Change any client's plan/limits, suspend abusers, extend trials
- "Log in as" a client (impersonate) to debug support issues — safely, audit-logged
- Broadcast announcements, toggle feature flags, watch system health

---

## 27.2 Access Model

Platform admins are NOT stored as workspace members. They live in a dedicated table
and authenticate through a separate gated area.

```sql
-- migration: platform_admins
CREATE TABLE public.platform_admins (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  email         VARCHAR(255) NOT NULL,
  role          VARCHAR(30) NOT NULL DEFAULT 'platform_support',
                -- platform_owner | platform_admin | platform_support | platform_billing
  permissions   TEXT[] NOT NULL DEFAULT '{}',   -- fine-grained overrides
  is_active     BOOLEAN NOT NULL DEFAULT true,
  totp_secret   TEXT,                            -- 2FA is mandatory
  totp_enabled  BOOLEAN NOT NULL DEFAULT false,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  last_login_at TIMESTAMPTZ,
  UNIQUE (user_id)
);
```

### Platform roles & powers

```typescript
// types/platform-admin.types.ts
export type PlatformRole =
  | 'platform_owner'    // everything, incl. managing other platform admins
  | 'platform_admin'    // everything except managing platform admins
  | 'platform_support'  // read + impersonate (read-only) + tickets
  | 'platform_billing'  // read + billing/plan actions only

export type PlatformPermission =
  | 'view_workspaces'
  | 'manage_workspaces'      // suspend / activate / delete / reset limits
  | 'manage_billing'         // plan change, limit override, trial, invoices
  | 'impersonate'            // login-as (subject to read_only flag)
  | 'impersonate_full'       // login-as with write access
  | 'manage_users'           // force logout, reset password, ban
  | 'broadcast'              // announcements + email blasts
  | 'manage_feature_flags'
  | 'view_usage'
  | 'manage_platform_admins' // owner only
  | 'view_audit_log'
  | 'view_system_health'

export const PLATFORM_ROLE_PERMISSIONS: Record<PlatformRole, PlatformPermission[]> = {
  platform_owner: [ /* ALL of the above */ ],
  platform_admin: [
    'view_workspaces','manage_workspaces','manage_billing','impersonate',
    'impersonate_full','manage_users','broadcast','manage_feature_flags',
    'view_usage','view_audit_log','view_system_health'
  ],
  platform_support: ['view_workspaces','impersonate','view_usage','view_audit_log'],
  platform_billing: ['view_workspaces','manage_billing','view_usage'],
}
```

### Security gate

```
/platform-admin/*  routes:
  1. Require Supabase Auth session
  2. Look up platform_admins by user_id → 404 (not 403) if absent  ← hide existence
  3. Require totp_enabled = true; force 2FA setup on first login
  4. Every mutating action → require permission + write platform_audit_log row
  5. All reads use the service-role client (RLS bypass) — that is the point of this area
```

> Because this area bypasses RLS, it is the single most sensitive surface in the product.
> Rule: **no query in `/platform-admin` runs without a matching audit_log write for mutations,
> and no route loads without the platform_admins membership check.**

---

## 27.3 Data Model (new tables)

```sql
-- Every sensitive platform action is recorded, immutably.
CREATE TABLE public.platform_audit_log (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id   UUID NOT NULL,
  admin_email     VARCHAR(255) NOT NULL,
  action          VARCHAR(60) NOT NULL,   -- e.g. 'workspace.suspend', 'impersonate.start'
  target_type     VARCHAR(40),            -- 'workspace' | 'user' | 'plan' | ...
  target_id       UUID,
  target_label    TEXT,                   -- human-readable (workspace name/email)
  metadata        JSONB DEFAULT '{}',     -- before/after values, reason
  ip_address      INET,
  occurred_at     TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_platform_audit_time ON platform_audit_log(occurred_at DESC);
CREATE INDEX idx_platform_audit_target ON platform_audit_log(target_type, target_id);

-- Impersonation sessions — time-limited, fully tracked.
CREATE TABLE public.impersonation_sessions (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id  UUID NOT NULL,
  workspace_id   UUID NOT NULL REFERENCES workspaces ON DELETE CASCADE,
  mode           VARCHAR(10) NOT NULL DEFAULT 'read',  -- read | full
  reason         TEXT,
  started_at     TIMESTAMPTZ DEFAULT NOW(),
  expires_at     TIMESTAMPTZ NOT NULL,                 -- default now()+30min
  ended_at       TIMESTAMPTZ
);

-- Global announcements / broadcasts.
CREATE TABLE public.platform_announcements (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title         TEXT NOT NULL,
  body          TEXT NOT NULL,
  audience      JSONB NOT NULL DEFAULT '{"scope":"all"}', -- {scope:'all'|'plan'|'ids', value}
  channels      TEXT[] NOT NULL DEFAULT '{in_app}',       -- in_app | email
  created_by    UUID NOT NULL,
  published_at  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- Feature flags — global + per-workspace overrides.
CREATE TABLE public.feature_flags (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key           VARCHAR(60) NOT NULL,          -- 'new_analytics_v2'
  description   TEXT,
  default_on    BOOLEAN NOT NULL DEFAULT false,
  rollout_pct   SMALLINT NOT NULL DEFAULT 0,   -- 0..100 gradual rollout
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (key)
);
CREATE TABLE public.feature_flag_overrides (
  flag_key      VARCHAR(60) NOT NULL,
  workspace_id  UUID NOT NULL REFERENCES workspaces ON DELETE CASCADE,
  enabled       BOOLEAN NOT NULL,
  PRIMARY KEY (flag_key, workspace_id)
);
```

Existing tables gain a lifecycle column so the panel can suspend without deleting:

```sql
ALTER TABLE public.workspaces
  ADD COLUMN status VARCHAR(20) NOT NULL DEFAULT 'active',  -- active|suspended|deleted
  ADD COLUMN suspended_at TIMESTAMPTZ,
  ADD COLUMN suspended_reason TEXT;
```

Middleware then blocks any workspace with `status != 'active'` from all customer routes,
showing a "workspace suspended — contact support" screen.

---

## 27.4 Panel Sections

```
/platform-admin
├── /                       Dashboard    — MRR, workspaces, active users, growth, churn
├── /workspaces             Workspaces   — searchable table; row → detail
│   └── /workspaces/[id]    Detail       — plan, usage, team, health, actions
├── /billing                Billing      — revenue, plan changes, trials, failed payments
├── /users                  Users        — global user search, force logout, reset, ban
├── /broadcast              Broadcast    — compose announcement / email to audience
├── /feature-flags          Flags        — global + per-workspace toggles, rollout %
├── /usage                  Usage        — API + AI-token spend, top consumers, abuse
├── /audit                  Audit Log    — immutable action history (filter by admin/target)
├── /health                 System       — cron status, webhook + token-refresh failures
└── /admins                 Admins       — manage platform admins (owner only)
```

### 27.4.1 Dashboard metrics

```typescript
// GET /api/platform-admin/dashboard
interface PlatformDashboard {
  totals:  { workspaces: number; active: number; suspended: number; users: number }
  revenue: { mrr: number; arr: number; byPlan: Record<string, number> }
  growth:  { newWorkspaces7d: number; newWorkspaces30d: number; churn30d: number }
  usage:   { messages30d: number; aiTokens30d: number; campaignsSent30d: number }
  series:  { signups: Point[]; revenue: Point[]; activeUsers: Point[] }  // for charts
}
```

### 27.4.2 Workspace detail actions

```typescript
POST /api/platform-admin/workspaces/[id]/suspend   { reason }
POST /api/platform-admin/workspaces/[id]/activate
POST /api/platform-admin/workspaces/[id]/plan      { plan, limitsOverride? }
POST /api/platform-admin/workspaces/[id]/extend-trial { days }
POST /api/platform-admin/workspaces/[id]/reset-limits
DELETE /api/platform-admin/workspaces/[id]          { confirm, reason }  // soft delete
```

Each handler: check permission → perform → write `platform_audit_log` → return.

---

## 27.5 Impersonation Flow (safe "login as")

```
Admin clicks "Login as" on a workspace
      ↓
POST /api/platform-admin/workspaces/[id]/impersonate { mode: 'read'|'full', reason }
  1. Require 'impersonate' (or 'impersonate_full' for mode=full)
  2. INSERT impersonation_sessions { expires_at = now()+30min }
  3. INSERT platform_audit_log 'impersonate.start'
  4. (optional, per platform setting) notify workspace super_admin by email
  5. Issue a scoped impersonation cookie (signed, references the session row)
      ↓
Customer app reads the cookie:
  - Renders a persistent red banner: "⚠️ Platform support viewing as {workspace} —
    read-only" (or "— FULL access")
  - In 'read' mode, all mutating API routes reject with 'impersonation_read_only'
  - Session auto-expires at expires_at; "Exit impersonation" ends it early
      ↓
POST /api/platform-admin/impersonate/end → set ended_at, clear cookie, audit 'impersonate.end'
```

**Rules:**
- Admin chooses the mode. `full` (write) access is a first-class option — the admin can
  perform ANY action inside the client's workspace (reply to DMs, edit settings, run
  campaigns, fix data), exactly as that client's super_admin would.
- `full` requires the `impersonate_full` permission + a short reason (for the audit trail).
  The reason/audit does NOT block or slow the action — it only records it.
- `read` mode remains available for pure look-only support cases.
- Sessions are time-limited (default 30 min, extendable); the non-dismissible banner always
  shows which mode is active so the operator knows whether they're viewing or acting.

---

## 27.6 Broadcast

```
Compose → audience (all | plan=pro | specific workspace ids) → channels (in_app, email)
      ↓
Publish:
  - in_app  → fan-out INSERT into notifications for target workspace members
  - email   → enqueue via Resend to owner emails (respects unsubscribe)
  - record platform_audit_log 'broadcast.publish'
```

Customers see in-app announcements in a bell/megaphone dropdown; unread badge until dismissed.

---

## 27.7 Feature Flags — resolution

```typescript
// lib/feature-flags.ts
export async function isFeatureOn(key: string, workspaceId: string): Promise<boolean> {
  const override = await getOverride(key, workspaceId)     // feature_flag_overrides
  if (override !== null) return override.enabled
  const flag = await getFlag(key)                          // feature_flags
  if (!flag) return false
  if (flag.default_on) return true
  if (flag.rollout_pct > 0) return hashToPct(workspaceId) < flag.rollout_pct  // stable bucket
  return false
}
```

Used both in the customer app (gate new features) and the admin panel (per-workspace toggle UI).

---

## 27.8 System Health

Read-only surface aggregating operational signals already produced by background services
([22-background-services.md](22-background-services.md)):

```
• pg_cron last-run + status per job
• Webhook failures (instagram_webhook_events where status='failed', last 24h)
• Token refresh failures (accounts with expired/failed tokens)
• Campaign executor errors, queue depth (campaign_send_queue pending count)
• Error-rate summary (from Sentry, if wired)
```

---

## 27.9 Build Order (fits the roadmap)

Add as a dedicated sprint (recommended right after Phase 1, or in parallel):

- [ ] Migration: `platform_admins`, `platform_audit_log`, `impersonation_sessions`,
      `platform_announcements`, `feature_flags`, `feature_flag_overrides`,
      `workspaces.status` columns
- [ ] `/platform-admin` route group + membership gate + mandatory 2FA
- [ ] Dashboard + Workspaces list/detail + suspend/activate/plan actions
- [ ] Impersonation (read mode first, then full) + banner + audit
- [ ] Billing view, Users, Broadcast, Feature flags, Usage, Audit log, System health
- [ ] Middleware: block suspended workspaces from customer routes

**Deliverable:** Operator can see the whole platform, manage any client, and safely support them.
```
