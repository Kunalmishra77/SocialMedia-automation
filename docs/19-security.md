# 19 — Security Architecture

## 19.1 Authentication

### Session-Based Auth (Same pattern as WhatsApp platform)

```typescript
// lib/auth.ts
// Supabase session + custom workspace_sessions table for multi-workspace

// Login flow:
// 1. supabase.auth.signInWithPassword() → gets Supabase JWT
// 2. Look up workspace_members for this user
// 3. If member exists: create workspace_sessions row
// 4. Set HttpOnly cookie: ws_session_token (30-day sliding expiry)
// 5. Set non-HttpOnly cookie: ws_id (for client-side workspace context)

interface WorkspaceSession {
  id: UUID
  workspace_id: UUID
  user_id: UUID
  token: string         // 32-byte random hex
  ip_address: string
  user_agent: string
  expires_at: TIMESTAMPTZ   // NOW() + 30 days, refreshed on each request
  created_at: TIMESTAMPTZ
}
```

**Cookie security flags:**
```typescript
{
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax',    // 'strict' would break OAuth redirects
  maxAge: 60 * 60 * 24 * 30,
  path: '/',
}
```

### Multi-Workspace Support

A single user (email) can be a member of multiple workspaces. Session includes `workspace_id` so each session is workspace-scoped. Switching workspaces creates a new session.

### Password Security

- Passwords handled by Supabase Auth (bcrypt, 12 rounds)
- Minimum 8 characters enforced at the API layer before calling Supabase
- Password reset via email link (Supabase's built-in flow)
- No custom password storage — Supabase owns credential management

### OAuth (Future)

Google OAuth for "Sign in with Google" — standard Supabase OAuth configuration. Not in Phase 1 scope.

---

## 19.2 Authorization (RBAC)

### Role Matrix

Defined in `types/auth.types.ts` as a `ROLE_PERMISSIONS` constant:

```typescript
// 4 roles: super_admin | admin | manager | agent
// 14 permission types:

const ROLE_PERMISSIONS: Record<UserRole, Set<Permission>> = {
  super_admin: new Set([...ALL_PERMISSIONS]),
  admin: new Set([
    'manage_team', 'view_analytics', 'create_campaigns',
    'manage_templates', 'configure_automation', 'manage_integrations',
    'manage_knowledge_base', 'view_all_conversations', 'assign_conversations',
    'manage_contacts', 'manage_leads', 'configure_ai',
    // NOT: billing_management, workspace_settings (super_admin only)
  ]),
  manager: new Set([
    'view_analytics', 'create_campaigns', 'manage_templates',
    'view_all_conversations', 'assign_conversations',
    'manage_contacts', 'manage_leads',
  ]),
  agent: new Set([
    // Effectively: manage own assigned conversations + contacts linked to them
  ]),
}
```

### Permission Check Pattern

```typescript
// lib/authz.ts
export async function requireWorkspacePermission(
  workspaceId: string,
  permission: Permission
): Promise<{ userId: string; role: UserRole }> {
  const session = await getSession()
  if (!session) throw new AuthError('Unauthenticated', 401)
  
  const member = await getWorkspaceMember(workspaceId, session.userId)
  if (!member) throw new AuthError('Not a workspace member', 403)
  
  if (!ROLE_PERMISSIONS[member.role].has(permission)) {
    throw new AuthError(`Insufficient permissions: requires ${permission}`, 403)
  }
  
  return { userId: session.userId, role: member.role }
}
```

Called at the top of every mutating API route:
```typescript
// app/api/campaigns/route.ts
const { userId } = await requireWorkspacePermission(workspaceId, 'create_campaigns')
```

---

## 19.3 Row-Level Security (Supabase RLS)

All tables have RLS enabled. All client-side Supabase calls (from browser) go through RLS. Server-side calls use `createAdminClient()` (service-role key) which bypasses RLS — only used in trusted server contexts (webhook handlers, API routes, cron jobs).

### Core RLS Functions

```sql
-- Already defined in 04-database-schema.md, reproduced here for reference:

CREATE OR REPLACE FUNCTION is_workspace_member(p_workspace_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM workspace_members WHERE workspace_id = p_workspace_id AND user_id = auth.uid())
$$;

CREATE OR REPLACE FUNCTION get_member_role(p_workspace_id uuid)
RETURNS user_role LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT role FROM workspace_members WHERE workspace_id = p_workspace_id AND user_id = auth.uid()
$$;

CREATE OR REPLACE FUNCTION can_view_assigned_row(p_workspace_id uuid, p_assigned_agent_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT is_workspace_member(p_workspace_id) AND (
    get_member_role(p_workspace_id) IS DISTINCT FROM 'agent'
    OR p_assigned_agent_id = auth.uid()
  )
$$;
```

### Key RLS Policies

```sql
-- Workspace: only members can read
ALTER TABLE workspaces ENABLE ROW LEVEL SECURITY;
CREATE POLICY "workspace_member_read" ON workspaces
  FOR SELECT USING (is_workspace_member(id));

-- Instagram accounts: workspace members
ALTER TABLE instagram_accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ig_account_read" ON instagram_accounts
  FOR SELECT USING (is_workspace_member(workspace_id));
CREATE POLICY "ig_account_write" ON instagram_accounts
  FOR ALL USING (is_workspace_member(workspace_id) AND get_member_role(workspace_id) IN ('super_admin', 'admin'));

-- Contacts: workspace isolation (agents see only assigned contacts)
ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "contacts_read" ON contacts FOR SELECT
  USING (can_view_contact_row(workspace_id, id));

-- Conversations: assignment-based for agents
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "conversations_read" ON conversations FOR SELECT
  USING (can_view_assigned_row(workspace_id, assigned_agent_id));

-- Messages: follows conversation access
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "messages_read" ON messages FOR SELECT
  USING (can_view_message_row(workspace_id, conversation_id));
```

---

## 19.4 Webhook Security (Meta Signature Verification)

Every inbound webhook from Meta MUST be verified with HMAC-SHA256:

```typescript
// app/api/webhooks/instagram/route.ts
import { createHmac, timingSafeEqual } from 'crypto'

export async function POST(req: NextRequest) {
  const rawBody = await req.text()
  const signature = req.headers.get('x-hub-signature-256')
  
  if (!signature) return new Response('Missing signature', { status: 400 })
  
  const expected = 'sha256=' + createHmac('sha256', process.env.INSTAGRAM_WEBHOOK_SECRET!)
    .update(rawBody)
    .digest('hex')
  
  // Timing-safe comparison (prevents timing attacks)
  if (!timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
    console.error('Webhook signature mismatch')
    return new Response('Invalid signature', { status: 403 })
  }
  
  const body = JSON.parse(rawBody)
  // Process async to return 200 within 5 seconds
  processWebhookAsync(body).catch(console.error)
  
  return new Response('OK', { status: 200 })
}
```

**Replay attack prevention:**
- Meta webhooks include a timestamp in `messaging[n].timestamp`
- Reject events older than 5 minutes
- Deduplicate by `messaging_id` (UNIQUE index on `messages.ig_message_id`)

---

## 19.5 API Key Authentication (Public API)

For workspace owners accessing the API programmatically:

```sql
CREATE TABLE public.api_keys (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces ON DELETE CASCADE,
  name         TEXT NOT NULL,
  key_hash     VARCHAR(64) NOT NULL UNIQUE,  -- SHA-256 of the key
  key_prefix   VARCHAR(10) NOT NULL,         -- e.g. "sk_live_" — shown in UI
  permissions  TEXT[] DEFAULT '{}',          -- scoped permissions
  last_used_at TIMESTAMPTZ,
  expires_at   TIMESTAMPTZ,
  created_by   UUID REFERENCES profiles,
  is_active    BOOLEAN DEFAULT true,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);
```

**Key format:** `ag_live_` + 48 random hex chars (56 chars total)

**Key storage:** Never stored in plaintext. SHA-256 hash stored in DB. Key shown once at creation.

**API auth middleware:**
```typescript
// lib/api-auth.ts
export async function authenticateApiKey(req: NextRequest): Promise<WorkspaceContext> {
  const authHeader = req.headers.get('authorization')
  const key = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null
  if (!key) throw new ApiError('No API key provided', 401)
  
  const keyHash = createHash('sha256').update(key).digest('hex')
  
  const { data: apiKey } = await supabase
    .from('api_keys')
    .select('workspace_id, permissions, is_active, expires_at')
    .eq('key_hash', keyHash)
    .single()
  
  if (!apiKey || !apiKey.is_active) throw new ApiError('Invalid API key', 401)
  if (apiKey.expires_at && new Date(apiKey.expires_at) < new Date()) throw new ApiError('API key expired', 401)
  
  // Update last_used_at (async, don't await)
  supabase.from('api_keys').update({ last_used_at: new Date().toISOString() })
    .eq('key_hash', keyHash).then(() => {})
  
  return { workspaceId: apiKey.workspace_id, permissions: apiKey.permissions }
}
```

---

## 19.6 Rate Limiting

### API Rate Limits

```typescript
// lib/rate-limit.ts — Upstash Redis sliding window
import { Ratelimit } from '@upstash/ratelimit'
import { Redis } from '@upstash/redis'

export const rateLimiters = {
  // Per-workspace AI reply rate limit (1 per 30s per contact)
  aiReply: new Ratelimit({
    redis: Redis.fromEnv(),
    limiter: Ratelimit.slidingWindow(1, '30 s'),
    prefix: 'rl:ai-reply',
  }),
  
  // Per-IP webhook delivery (prevent DDoS)
  webhook: new Ratelimit({
    redis: Redis.fromEnv(),
    limiter: Ratelimit.slidingWindow(100, '10 s'),
    prefix: 'rl:webhook',
  }),
  
  // Per-workspace API requests
  api: new Ratelimit({
    redis: Redis.fromEnv(),
    limiter: Ratelimit.slidingWindow(1000, '1 m'),
    prefix: 'rl:api',
  }),
  
  // Login attempts (per IP)
  login: new Ratelimit({
    redis: Redis.fromEnv(),
    limiter: Ratelimit.slidingWindow(10, '1 m'),
    prefix: 'rl:login',
  }),
}
```

### Instagram API Rate Limits

Meta enforces per-account limits. Platform tracks usage and backs off:

| API | Rate Limit |
|-----|-----------|
| Messaging | 1,000 messages/hour per page |
| Media publish | 50 posts/24h (API), 25 reels/24h |
| Insights | 200 calls/hour |
| User lookup | 200 calls/hour |

```typescript
// lib/instagram-api.ts — exponential backoff on 429
// Already defined in 05-instagram-integration.md
```

---

## 19.7 Data Security

### Sensitive Data Handling

| Field | Storage | Access |
|-------|---------|--------|
| `access_token` (Instagram) | Supabase DB column | Server-side only (never sent to browser) |
| `api_keys.key_hash` | SHA-256 hash | Key never retrievable after creation |
| `ws_session_token` | HttpOnly cookie | Never accessible to JS |
| User passwords | Supabase Auth (bcrypt) | Supabase manages; never in our app DB |
| `OPENAI_API_KEY` | Server env var | Never in DB or client |

### Encryption at Rest

Supabase Postgres uses AES-256 encryption at rest by default.

### Supabase Storage Security

All media files (images, videos, documents) stored in Supabase Storage:
- Public bucket: only for published content thumbnails
- Private bucket: everything else (DM media, influencer docs, import files)
- Private files served via signed URLs with 1-hour expiry

```typescript
// Generate signed URL for private file
const { data } = await supabase.storage
  .from('private-media')
  .createSignedUrl(filePath, 3600)  // 1 hour
```

---

## 19.8 Injection Prevention

### SQL Injection

Never build raw SQL strings — all DB access via Supabase client (parameterized) or typed RPCs:
```typescript
// Safe: supabase.from('contacts').select().eq('ig_user_id', userId)
// Never: await supabase.rpc('raw_query', { sql: `SELECT ... WHERE id = '${userId}'` })
```

### XSS Prevention

- All user content rendered in React (auto-escapes by default)
- Message content that may contain HTML rendered in sandboxed `<iframe>` or as `white-space: pre-wrap` text (never `dangerouslySetInnerHTML`)
- Caption/note input: `<textarea>` only (no rich text editor that accepts HTML)
- Content Security Policy header:
  ```
  Content-Security-Policy: default-src 'self'; img-src 'self' data: blob: cdninstagram.com *.fbcdn.net; connect-src 'self' *.supabase.co wss://*.supabase.co api.openai.com openrouter.ai;
  ```

### CSRF Prevention

- All state-changing requests require the `ws_session_token` HttpOnly cookie AND the `workspace_id` in the request body/header
- SameSite=Lax on session cookie prevents cross-site form submission
- No CORS for mutating routes (only GET analytics endpoints support CORS for the public API)

---

## 19.9 Data Retention & GDPR/DPDP

### Retention Defaults

| Data type | Default retention | Configurable |
|-----------|-----------------|-------------|
| Messages | 24 months | Yes (workspace setting) |
| Contact records | Indefinite | Yes — workspace can delete any contact |
| Activity log | 90 days | No |
| Notifications | 30 days | No |
| Webhook raw payloads | 7 days | No |
| Push subscriptions | Until user removes | — |

### Contact Deletion (Right to Erasure)

```typescript
// DELETE /api/contacts/[id]
// Also hard-deletes: messages, conversations, leads, notes, activity entries
// Cascades handled by ON DELETE CASCADE on FK columns
// Any orders/purchases referencing this contact: anonymized (not deleted)

// Response includes:
// { deleted: true, data_removed: ['messages', 'conversations', 'leads', 'notes'] }
```

### Data Export (DPDP Compliance)

```typescript
// GET /api/contacts/[id]/export
// Returns ZIP with:
// - contact.json — all contact fields
// - conversations.json — all conversations
// - messages.json — all messages
// - notes.json — internal notes
```

### PII Audit Logging

All access to contact PII (email, phone) is logged to `audit_log` table:

```sql
CREATE TABLE public.audit_log (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID REFERENCES workspaces,
  user_id      UUID REFERENCES profiles,
  action       TEXT NOT NULL,  -- 'read_contact_pii' | 'export_contact' | 'delete_contact'
  resource_id  UUID,
  ip_address   INET,
  occurred_at  TIMESTAMPTZ DEFAULT NOW()
);
```

Retained for 12 months (regulatory requirement). Not configurable.

---

## 19.10 Security Headers

```typescript
// next.config.ts — security headers
const securityHeaders = [
  { key: 'X-DNS-Prefetch-Control', value: 'on' },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
  { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
]
```
