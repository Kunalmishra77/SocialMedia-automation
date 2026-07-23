# 20 — API Design

## 20.1 API Structure

All routes follow Next.js 15 App Router convention under `app/api/`.

### Route Conventions

```
GET    /api/[resource]              — list/query
POST   /api/[resource]              — create
GET    /api/[resource]/[id]         — get one
PATCH  /api/[resource]/[id]         — update (partial)
DELETE /api/[resource]/[id]         — delete
POST   /api/[resource]/[id]/[action]— domain action (resolve, assign, etc.)
```

### Response Format

All routes return JSON. Success:
```json
{
  "data": { ... },
  "meta": { "page": 1, "limit": 50, "total": 234 }
}
```

Error:
```json
{
  "error": {
    "code": "FORBIDDEN",
    "message": "Insufficient permissions: requires manage_team",
    "status": 403
  }
}
```

### Error Codes

| HTTP | Code | When |
|------|------|------|
| 400 | `BAD_REQUEST` | Invalid request body |
| 401 | `UNAUTHENTICATED` | No valid session |
| 403 | `FORBIDDEN` | Valid session but wrong role |
| 404 | `NOT_FOUND` | Resource doesn't exist or not in workspace |
| 409 | `CONFLICT` | Duplicate (e.g. invite already pending) |
| 422 | `VALIDATION_ERROR` | Field validation failed |
| 429 | `RATE_LIMITED` | Rate limit exceeded |
| 500 | `INTERNAL_ERROR` | Unexpected server error |

---

## 20.2 Complete Route Map

### Auth

```
POST   /api/auth/login
POST   /api/auth/logout
POST   /api/auth/signup           — new workspace + super_admin account
GET    /api/auth/session          — validate current session
POST   /api/auth/reset-password
POST   /api/auth/change-password
```

### Team

```
GET    /api/team/members?workspaceId=
POST   /api/team/invite           — send invite email + create team_invites row
GET    /api/team/invites?workspaceId=  — list pending invites
DELETE /api/team/invites/[id]     — revoke invite
POST   /api/team/invites/[token]/accept  — accept invite, create member
PATCH  /api/team/members/[id]     — update role
DELETE /api/team/members/[id]     — remove from workspace
GET    /api/team/workload?workspaceId=
POST   /api/team/balance          — run round-robin assignment
PATCH  /api/team/my-status        — update availability_status
```

### Instagram Integration

```
GET    /api/integrations/instagram?workspaceId=    — list connected accounts
POST   /api/integrations/instagram/connect         — start OAuth flow
GET    /api/integrations/instagram/callback        — OAuth callback
DELETE /api/integrations/instagram/[accountId]     — disconnect account
POST   /api/integrations/instagram/[accountId]/refresh-token
GET    /api/integrations/instagram/[accountId]/profile  — fetch live IG profile
```

### Webhooks

```
GET    /api/webhooks/instagram    — Meta webhook verification (GET challenge)
POST   /api/webhooks/instagram    — Meta webhook delivery
POST   /api/webhooks/abandoned-cart  — Commerce webhook
```

### Conversations

```
GET    /api/conversations?workspaceId=&status=&channel=&assignedTo=&q=&page=
POST   /api/conversations                          — manually create conversation
GET    /api/conversations/[id]
PATCH  /api/conversations/[id]                     — update (labels, snooze, etc.)
POST   /api/conversations/[id]/assign             — assign/unassign agent
POST   /api/conversations/[id]/smart-assign       — AI smart assignment
POST   /api/conversations/[id]/resolve
POST   /api/conversations/[id]/reopen
POST   /api/conversations/[id]/snooze             — body: { snoozeUntil: ISO string }
POST   /api/conversations/[id]/notes              — create internal note
GET    /api/conversations/[id]/tasks              — list conversation tasks
POST   /api/conversations/[id]/tasks
PATCH  /api/conversations/[id]/tasks/[taskId]
```

### Messages

```
GET    /api/messages?conversationId=&before=&limit=
POST   /api/messages/send         — send DM or reply to comment
POST   /api/messages/[id]/react   — send reaction
```

### Contacts

```
GET    /api/contacts?workspaceId=&q=&tag=&stage=&igAccountId=&page=
POST   /api/contacts
GET    /api/contacts/[id]
PATCH  /api/contacts/[id]
DELETE /api/contacts/[id]
GET    /api/contacts/[id]/360     — full Contact 360 view
GET    /api/contacts/[id]/export  — GDPR export ZIP
POST   /api/contacts/import       — CSV bulk import
GET    /api/contacts/lists?workspaceId=    — get contact lists
POST   /api/contacts/lists
POST   /api/contacts/lists/[id]/members   — add contacts to list
DELETE /api/contacts/lists/[id]/members/[contactId]
GET    /api/contacts/duplicates   — list potential duplicates
POST   /api/contacts/merge        — body: { keepId, mergeId }
```

### Leads

```
GET    /api/leads?workspaceId=&stage=&temperature=&assignedTo=&page=
POST   /api/leads
GET    /api/leads/[id]
PATCH  /api/leads/[id]
DELETE /api/leads/[id]
POST   /api/leads/[id]/score      — trigger AI scoring
POST   /api/leads/[id]/assign
PATCH  /api/leads/[id]/stage      — body: { stage }
GET    /api/leads/pipeline        — grouped by stage with counts + values
```

### Campaigns

```
GET    /api/campaigns?workspaceId=&type=&status=
POST   /api/campaigns
GET    /api/campaigns/[id]
PATCH  /api/campaigns/[id]
DELETE /api/campaigns/[id]
POST   /api/campaigns/[id]/send   — execute immediately
POST   /api/campaigns/[id]/schedule  — body: { scheduledAt }
POST   /api/campaigns/[id]/pause
POST   /api/campaigns/[id]/cancel
GET    /api/campaigns/[id]/analytics
GET    /api/campaigns/[id]/recipients?status=&page=
```

### Post Automations (Comment DM)

```
GET    /api/automations?workspaceId=&igAccountId=
POST   /api/automations
GET    /api/automations/[id]
PATCH  /api/automations/[id]
DELETE /api/automations/[id]
POST   /api/automations/[id]/toggle   — enable/disable
```

### Chatbot Flows

```
GET    /api/flows?workspaceId=
POST   /api/flows
GET    /api/flows/[id]
PATCH  /api/flows/[id]             — save full flow JSON
DELETE /api/flows/[id]
POST   /api/flows/[id]/publish     — activate flow
POST   /api/flows/[id]/duplicate
```

### Workflow Automations

```
GET    /api/workflows?workspaceId=
POST   /api/workflows
GET    /api/workflows/[id]
PATCH  /api/workflows/[id]
DELETE /api/workflows/[id]
POST   /api/workflows/[id]/activate
POST   /api/workflows/[id]/deactivate
GET    /api/workflows/[id]/sessions?status=
GET    /api/workflows/templates    — list pre-built templates
```

### Content Studio

```
GET    /api/content/posts?workspaceId=&igAccountId=&status=&from=&to=
POST   /api/content/posts
GET    /api/content/posts/[id]
PATCH  /api/content/posts/[id]
DELETE /api/content/posts/[id]
POST   /api/content/posts/[id]/publish      — publish immediately
POST   /api/content/posts/[id]/schedule     — body: { scheduledAt }
POST   /api/content/posts/[id]/request-approval
POST   /api/content/posts/[id]/approve
POST   /api/content/posts/[id]/request-changes  — body: { feedback }
GET    /api/content/calendar?from=&to=&igAccountId=   — calendar view
POST   /api/content/ai/generate-caption     — body: { mediaDescription, tone, context }
POST   /api/content/ai/best-time           — predict best posting time
GET    /api/content/hashtag-groups?workspaceId=
POST   /api/content/hashtag-groups
PATCH  /api/content/hashtag-groups/[id]
POST   /api/content/bulk-import            — CSV schedule upload
```

### Knowledge Base

```
GET    /api/knowledge-base?workspaceId=
POST   /api/knowledge-base
GET    /api/knowledge-base/[id]
PATCH  /api/knowledge-base/[id]
DELETE /api/knowledge-base/[id]
POST   /api/knowledge-base/search         — semantic search (debug/test)
POST   /api/knowledge-base/import-url     — scrape URL + add to KB
```

### AI

```
POST   /api/ai/auto-reply          — generate AI reply for a message
POST   /api/ai/assistant           — conversational BI query
POST   /api/ai/analytics-insights  — generate workspace insights
POST   /api/ai/score-lead/[id]     — trigger lead scoring
POST   /api/ai/content-recommendations  — generate content recommendations
POST   /api/ai/predict-outcome/[conversationId]  — predict conversion
```

### Analytics

```
GET    /api/analytics/overview?from=&to=&igAccountId=
GET    /api/analytics/conversations?from=&to=
GET    /api/analytics/agents?from=&to=
GET    /api/analytics/content?from=&to=&igAccountId=
GET    /api/analytics/campaigns?from=&to=
GET    /api/analytics/crm?from=&to=
GET    /api/analytics/audience?igAccountId=
GET    /api/analytics/revenue?from=&to=
GET    /api/analytics/commerce?from=&to=
POST   /api/reports/export?type=&from=&to=   — generate downloadable report
GET    /api/reports/scheduled?workspaceId=
POST   /api/reports/scheduled
DELETE /api/reports/scheduled/[id]
```

### Influencer & Creator

```
GET    /api/influencers?workspaceId=&status=&category=
POST   /api/influencers
GET    /api/influencers/[id]
PATCH  /api/influencers/[id]
DELETE /api/influencers/[id]
GET    /api/influencers/[id]/collaborations
POST   /api/influencers/collaborations
GET    /api/influencers/collaborations/[id]
PATCH  /api/influencers/collaborations/[id]
GET    /api/influencers/collaborations/[id]/report
POST   /api/influencers/documents           — upload contract/brief
GET    /api/influencers/budgets?workspaceId=
POST   /api/influencers/budgets
```

### Commerce

```
POST   /api/commerce/sync-catalog        — trigger catalog sync from Meta
GET    /api/commerce/products?workspaceId=&q=
GET    /api/commerce/orders?workspaceId=&status=&contactId=
POST   /api/commerce/orders
PATCH  /api/commerce/orders/[id]
POST   /api/commerce/orders/import       — CSV import from Shopify/WooCommerce
```

### Advertising

```
GET    /api/ads/performance?from=&to=&igAccountId=
GET    /api/ads/creatives?from=&to=
GET    /api/ads/audience-overlap
POST   /api/ads/optimize-recommendation
POST   /api/ads/sync-leads              — force lead sync from Meta
```

### Push Notifications

```
POST   /api/push/subscribe      — register browser push subscription
DELETE /api/push/unsubscribe    — remove subscription
```

### Settings

```
GET    /api/settings?workspaceId=
PATCH  /api/settings           — update workspace settings
GET    /api/settings/api-keys
POST   /api/settings/api-keys
DELETE /api/settings/api-keys/[id]
GET    /api/settings/billing
POST   /api/settings/billing/portal  — Stripe customer portal redirect
```

### Cron Jobs (internal, not public)

```
GET    /api/cron/refresh-tokens           — daily: refresh expiring IG tokens
GET    /api/cron/check-sla               — every 30min: check SLA breaches
GET    /api/cron/run-sequences           — every 30min: send due sequence steps
GET    /api/cron/cleanup-sessions        — daily: remove expired workspace sessions
GET    /api/cron/sync-media-insights     — daily: fetch post insights from Meta
GET    /api/cron/sync-ad-leads           — every 15min: sync Meta Lead Ads
GET    /api/cron/send-campaigns          — every 5min: execute queued campaign sends
GET    /api/cron/scheduled-reports       — daily 9am: send scheduled reports
GET    /api/cron/send-push               — every 1min: deliver queued push notifications
```

### Redirect

```
GET    /api/l/[code]            — link click tracking + redirect
```

---

## 20.3 Public API v1 (External Access)

Available on Enterprise plan. Accessed via API key (Bearer auth).

**Base URL:** `https://app.agentix.in/api/v1`

**Available endpoints (subset):**
```
GET    /v1/contacts
POST   /v1/contacts
GET    /v1/contacts/[id]
PATCH  /v1/contacts/[id]
GET    /v1/conversations
GET    /v1/conversations/[id]
POST   /v1/conversations/[id]/notes
GET    /v1/leads
PATCH  /v1/leads/[id]
POST   /v1/campaigns/[id]/send
GET    /v1/analytics/overview
POST   /v1/webhooks               — register outbound webhook to your server
```

**Outbound webhooks (workspace → your server):**
Workspace can register a URL to receive events (new message, lead created, conversation resolved). Signed with `x-agentix-signature` header (HMAC-SHA256 of body with workspace API key).

---

## 20.4 Request Validation

Using Zod for all request bodies:

```typescript
// schemas/conversation.schema.ts
import { z } from 'zod'

export const createNoteSchema = z.object({
  content: z.string().min(1).max(5000),
  mentions: z.array(z.string().uuid()).max(10).default([]),
})

export const assignConversationSchema = z.object({
  agent_id: z.string().uuid().nullable(),
  note: z.string().max(500).optional(),
})
```

Validation middleware:
```typescript
// lib/validate.ts
export function validate<T>(schema: z.ZodSchema<T>) {
  return async (req: NextRequest): Promise<T> => {
    const body = await req.json().catch(() => ({}))
    const result = schema.safeParse(body)
    if (!result.success) {
      throw new ApiError('Validation error', 422, result.error.flatten())
    }
    return result.data
  }
}
```

---

## 20.5 Pagination

All list endpoints support cursor-based pagination:

```typescript
// Request: GET /api/contacts?page=2&limit=50
// Response:
{
  data: [...],
  meta: {
    page: 2,
    limit: 50,
    total: 1847,
    hasMore: true,
    nextPage: 3,
  }
}
```

Default limit: 50. Maximum limit: 200.
