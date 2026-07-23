# 02 — System Architecture

## 2.1 High-Level Diagram

```
┌─────────────────────────────────────────────────┐
│              Meta Platform                       │
│   Instagram Graph API v21.0                      │
│   Webhooks (messages, comments, mentions,        │
│             story_insights, feed)                │
└──────────────────┬──────────────────────────────┘
                   │ HTTPS
┌──────────────────▼──────────────────────────────┐
│           Next.js 15 Application                 │
│  ┌─────────────────────────────────────────────┐ │
│  │  App Router (Server Components + Actions)   │ │
│  │  Route Handlers (API Routes)                │ │
│  │  Middleware (auth refresh + tenant context) │ │
│  └────────────┬────────────────┬───────────────┘ │
│               │                │                  │
│  ┌────────────▼──┐  ┌──────────▼──────────────┐  │
│  │  AI Engine    │  │  Background Services      │  │
│  │  - getAIReply │  │  - Campaign Executor      │  │
│  │  - Flow Engine│  │  - Token Refresh Job      │  │
│  │  - KB Search  │  │  - Sequence Runner        │  │
│  │  - Embeddings │  │  - SLA Checker            │  │
│  └───────────────┘  └───────────────────────────┘  │
└───────────────┬──────────────────────┬─────────────┘
                │                      │
┌───────────────▼──────┐  ┌────────────▼──────────────┐
│  Supabase             │  │  Upstash Redis             │
│  - PostgreSQL 16      │  │  - Rate limiting           │
│  - pgvector           │  │  - API reply dedup         │
│  - pg_cron            │  │  - Campaign concurrency    │
│  - Supabase Auth      │  └────────────────────────────┘
│  - Supabase Realtime  │
│  - Supabase Storage   │  ┌────────────────────────────┐
│  - Row Level Security │  │  Resend / Nodemailer       │
└───────────────────────┘  │  (invite emails, alerts)   │
                           └────────────────────────────┘
```

---

## 2.2 Technology Stack

| Layer | Technology | Version | Rationale |
|-------|-----------|---------|-----------|
| Framework | Next.js | 15 | App Router, SSR, Server Actions, API Routes in one deploy |
| Language | TypeScript | 5 strict | End-to-end type safety |
| Database | Supabase (PostgreSQL) | 16 | Auth, RLS, Realtime, pgvector, pg_cron all built-in |
| Vector DB | pgvector (via Supabase) | 0.7 | Knowledge base semantic search, no separate service |
| Auth | Supabase Auth | latest | Email/password + magic link; JWT with custom claims |
| Styling | Tailwind CSS | 4 | Utility-first, consistent, rapid development |
| Components | shadcn/ui + Radix UI | latest | Accessible, unstyled primitives |
| State | Zustand | 5 | Lightweight global state |
| Data fetching | TanStack Query | 5 | Server state management, optimistic updates |
| AI | OpenAI / OpenRouter | — | Multi-model support; auto-detect by API key format |
| Embeddings | text-embedding-3-small | — | 1536-dim vectors via OpenAI |
| Rate limiting | Upstash Redis + @upstash/ratelimit | 2 | Sliding window per-contact, per-workspace |
| Email | Resend (primary), nodemailer fallback | — | Branded invite emails, system alerts |
| File storage | Supabase Storage | — | Media attachments, uploaded assets |
| Background jobs | pg_cron + Next.js Route Handlers | — | No external job runner needed at this scale |
| Deployment | Coolify (self-hosted) or Vercel | — | Docker-based or serverless |
| Testing | Vitest + Playwright | — | Unit/integration + E2E |
| Error tracking | Sentry | — | Production error monitoring |
| Logging | Axiom or console | — | Structured logs |
| Forms | react-hook-form + Zod | 7 / 3 | Validation at schema level |
| Charts | recharts | 2 | Line/bar/funnel charts |
| Flow builder | reactflow | 11 | Visual chatbot + workflow builder |
| Drag-and-drop | @dnd-kit | 6 | Kanban board, sortable lists |
| Rich editor | TipTap | 2 | Caption editor with formatting |
| Command palette | cmdk | 1 | Keyboard-driven search |
| Toasts | sonner | 1 | Notification toasts |
| Date handling | date-fns | 3 | Formatting and arithmetic |
| CSV | papaparse | 5 | Contact import |
| Excel | xlsx | 0.18 | Report export |
| PDF parsing | pdf-parse + unpdf | — | Knowledge base uploads |
| DOCX parsing | mammoth | 1.12 | Knowledge base uploads |
| Virtualization | @tanstack/react-virtual | 3 | Large conversation + contact lists |
| PWA | next-pwa | — | Service worker, push notifications |

---

## 2.3 Deployment Architecture

### Option A: Coolify (Recommended for self-hosted)

```
Coolify Server
├── instagram-app (Docker container — Next.js standalone)
│   ├── Port 3000 exposed
│   ├── Health check: GET /api/health
│   └── Env vars from Coolify secret store
├── Nginx reverse proxy (SSL termination)
└── Supabase (external — Supabase Cloud)

Scaling:
- Coolify scales app replicas horizontally
- Supabase PgBouncer handles DB connection pooling
- Upstash Redis is cloud-managed (no self-hosting)
```

### Option B: Vercel (Serverless)

```
Vercel
├── Next.js app (serverless functions per route)
├── Edge Middleware (auth refresh, tenant context)
└── Vercel Cron (calls /api/cron/* endpoints)

Note: Campaign executor must complete within 60s function timeout.
For long campaigns, use DB-backed chunked execution with continuation.
```

---

## 2.4 Data Flow: Inbound DM

```
1. User sends DM on Instagram
         ↓
2. Meta webhook POST → /api/webhooks/instagram
   - Verify X-Hub-Signature-256
   - Parse entry.messaging[].message
         ↓
3. Store raw event in instagram_webhook_events (status=received)
         ↓
4. processInboundDM():
   a. Upsert contact (ig_user_id)
   b. Upsert conversation
   c. Insert message (dedup on ig_message_id)
   d. Update contact.last_user_message_at ← critical for 24h window
         ↓
5. Parallel non-blocking tasks:
   - Send read receipt to Meta
   - Log to Google Sheets (if configured)
   - Persist media to Supabase Storage
   - Track usage (platform_usage_logs)
         ↓
6. Campaign reply detection → update campaign_recipients
         ↓
7. Apply inbox rules (keyword → assign/label/auto-reply)
         ↓
8. Process chatbot flow if active flow session
         ↓
9. AI auto-reply pipeline:
   - Check blockers (is_blocked, opted_out, VIP, bot_paused)
   - Check plan limit + rate limit
   - Fetch KB context (semantic search)
   - getAIReply() → InstagramAPI.sendDM()
   - saveOutboundMessage()
         ↓
10. Non-blocking post-processing:
    - updateConversationSentiment()
    - detectAndLogEvent() (booking, callback, etc.)
    - autoCreateOrUpdateLead()
    - dispatchOutboundWebhooks()
```

---

## 2.5 Request Lifecycle (API Route)

```
Client → Next.js Route Handler
         ↓
lib/authz.ts → requireWorkspacePermission(workspaceId, permission)
  - Reads JWT from Supabase Auth cookie
  - Validates workspace membership
  - Checks role permission
  - Returns AuthzContext { userId, email, role, workspaceId }
         ↓
Zod schema validation on request body
         ↓
Business logic (query Supabase admin client)
         ↓
Return JSON response
```

---

## 2.6 Multi-Account Architecture

One workspace can have multiple Instagram accounts. Each account has:
- Its own `instagram_accounts` row with unique `ig_user_id` + `page_id`
- Webhook subscriptions on its own page
- Conversations tagged with `ig_account_id`
- Independent token lifecycle

The inbox supports account-level filtering: "Show only DMs from @account1."

---

## 2.7 Stateless Application Layer

The Next.js app is completely stateless. All persistent state is in:
- **Supabase** — all application data
- **Upstash Redis** — rate limit sliding windows
- **Supabase Auth** — user session JWTs (via cookies)
- **`ws_session_token` cookie** — application session tracker (maps to `workspace_sessions` table)

This means any app server can handle any request. Horizontal scaling is zero-config.
