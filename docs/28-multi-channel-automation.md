# 28 — Multi-Channel Automation (Beyond Instagram)

**Priority:** Add-on module (build after Platform Admin; phase the platforms in).
**Scope:** Extend the Instagram platform to every practical social channel EXCEPT WhatsApp
(WhatsApp is a separate product — integrated later via API per [26-future-platforms.md](26-future-platforms.md)).

> This replaces the "someday" framing of [26-future-platforms.md](26-future-platforms.md) with a
> concrete, honest, capability-driven design. Not every platform can do everything — the
> design makes each platform's real limits first-class, so the UI never promises what an API
> can't deliver (which keeps us ToS-safe).

---

## 28.1 Design Principle — Channel Adapter Pattern

The entire core (inbox, AI reply, CRM, campaigns, workflows, analytics, admin) is already
platform-neutral in shape. We keep it and put each platform behind one interface.

```
        ┌─────────────── Core Engine (reused as-is) ──────────────┐
        │  Inbox · AI reply · KB · CRM · Campaigns · Workflows ·   │
        │  Analytics · Platform Admin                              │
        └───────────────────────────┬─────────────────────────────┘
                                    │ ChannelAdapter interface
   ┌───────┬───────┬────────┬───────┼────────┬───────┬────────┬──────────┐
   ▼       ▼       ▼        ▼       ▼        ▼       ▼        ▼          ▼
Instagram Facebook Telegram LinkedIn YouTube  X    TikTok  Pinterest
 (full)   (full)   (full)   (post)   (comment)(paid)(post)  (post)
```

`InstagramAPI` (from [05-instagram-integration.md](05-instagram-integration.md)) becomes the
**first implementation** of `ChannelAdapter` — a refactor, not a rewrite.

```typescript
// lib/channels/adapter.ts
export interface ChannelCapabilities {
  dm: boolean               // can send/receive direct messages
  dmAutoReply: boolean      // AI auto-reply on inbound DM
  commentToDm: boolean      // comment triggers a DM
  commentReply: boolean     // reply publicly on a comment
  commentLike: boolean      // like/heart a comment
  postScheduling: boolean   // schedule + publish content
  broadcast: boolean        // window/segment broadcast campaigns
  webhookInbound: boolean   // real-time inbound events (vs polling)
  messagingWindow: number | null  // hours; null = no window restriction
}

export interface ChannelAdapter {
  readonly channel: ChannelType
  readonly capabilities: ChannelCapabilities

  sendDM(recipientId: string, message: OutboundMessage): Promise<{ id: string }>
  replyToComment?(commentId: string, text: string): Promise<{ id: string }>
  likeComment?(commentId: string): Promise<void>
  hideComment?(commentId: string): Promise<void>
  publishPost?(post: ChannelPost): Promise<{ id: string }>
  refreshToken?(): Promise<{ token: string; expiresAt: string }>
  verifyWebhook?(req: Request): boolean
  parseWebhook?(payload: unknown): NormalizedEvent[]   // → core's unified event shape
}
```

**The rule:** a UI feature only renders for a channel if `capabilities[feature] === true`.
No capability → the control is hidden or shown disabled with a "not supported on {channel}"
tooltip. This makes adding/limiting a platform a pure data change.

---

## 28.2 Capability Matrix (realistic, API-truthful)

| Platform | DM reply | Comment→DM | Comment reply | Comment like | Post schedule | Broadcast | Inbound webhook |
|----------|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| **Instagram** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Facebook / Messenger** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Telegram** | ✅ | — | — | — | ✅ (channels) | ✅ | ✅ |
| **LinkedIn** | ❌¹ | — | ✅ | ✅ | ✅ (pages) | ❌ | ❌ (poll) |
| **YouTube** | ❌ | — | ✅ | ✅ | ✅ (community) | ❌ | ❌ (poll) |
| **X / Twitter** | ⚠️² | — | ✅ | ✅ | ✅ | ⚠️² | ⚠️ |
| **TikTok** | ❌³ | — | ⚠️ | — | ✅ | ❌ | ❌ (poll) |
| **Pinterest** | ❌ | — | — | — | ✅ | ❌ | ❌ (poll) |

```
¹ LinkedIn: official API gives NO messaging automation. DM controls are hidden. Posting only.
² X/Twitter: DM + write access requires a paid API tier; features gate behind a plan/flag.
³ TikTok: official API has no DM automation; comment mgmt is limited. Posting + analytics only.
```

Meta's 24-hour messaging window ([06-inbox-module.md](06-inbox-module.md)) applies to Instagram
AND Facebook/Messenger (`messagingWindow: 24`). Telegram has no such window (`null`).

---

## 28.3 Inbox Model — Per-Channel Inboxes

Chosen model: **each platform has its own inbox** (tabbed in the sidebar). No cross-platform
contact merge — a person messaging on IG and on Telegram is two contacts. This keeps identity,
tokens, windows, and rate limits cleanly separated per platform.

```
Sidebar → Channels
┌──────────────────────────────┐
│ 📷 Instagram          12  ●   │  active inbox (full features)
│ 👍 Facebook            3  ●   │  active inbox (full features)
│ ✈️ Telegram            7  ●   │  active inbox (DM only, no window)
│ 💼 LinkedIn            —       │  posting only → opens content view, not inbox
│ ▶️ YouTube             2       │  comment moderation view
│ 🐦 X (Pro)             1       │  gated by plan/flag
│ 🎵 TikTok              —       │  posting + analytics only
│ 📌 Pinterest           —       │  posting only
└──────────────────────────────┘
```

- Within a platform, the existing unified surface stays (e.g. Instagram still merges DM +
  comment + story into its own inbox — that's intra-platform, unchanged).
- AI reply, flows, and campaigns are configured **per channel**, gated by capabilities.
- A channel with no `dm` capability shows a content/moderation view instead of an inbox.

---

## 28.4 Data Model Changes

Generalize the Instagram-specific tables into channel-neutral ones.

```sql
-- Channel type enum
CREATE TYPE channel_type AS ENUM (
  'instagram','facebook','telegram','linkedin','youtube','twitter','tiktok','pinterest'
);

-- Generic connected-account table (superset of instagram_accounts)
CREATE TABLE public.channel_accounts (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id       UUID NOT NULL REFERENCES workspaces ON DELETE CASCADE,
  channel            channel_type NOT NULL,
  external_id        VARCHAR(255) NOT NULL,     -- ig_user_id / page_id / bot_id / channel_id
  handle             VARCHAR(255),              -- @username / page name
  display_name       TEXT,
  access_token       TEXT,
  refresh_token      TEXT,
  token_expires_at   TIMESTAMPTZ,
  capabilities       JSONB NOT NULL DEFAULT '{}', -- resolved ChannelCapabilities snapshot
  is_active          BOOLEAN NOT NULL DEFAULT true,
  connected_at       TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (workspace_id, channel, external_id)
);

-- Add channel awareness to core tables
ALTER TABLE public.conversations ADD COLUMN channel channel_type NOT NULL DEFAULT 'instagram';
ALTER TABLE public.conversations ADD COLUMN channel_account_id UUID REFERENCES channel_accounts;
ALTER TABLE public.messages      ADD COLUMN channel channel_type NOT NULL DEFAULT 'instagram';
ALTER TABLE public.contacts      ADD COLUMN channel channel_type NOT NULL DEFAULT 'instagram';
```

**Migration strategy:** existing `instagram_accounts` rows are copied into `channel_accounts`
with `channel='instagram'`; the old table can remain as a view for backward compatibility during
transition. Conversations/messages/contacts default to `'instagram'`, so existing data is valid
with zero backfill.

---

## 28.5 Per-Platform Integration Notes

```
INSTAGRAM   — already built (05). Becomes ChannelAdapter #1. Full capabilities.

FACEBOOK /  — Same Meta Graph API + webhooks as Instagram. Highest reuse: DM auto-reply,
MESSENGER     comment→DM, comment reply/like/hide, page post scheduling, 24h window. Add first.

TELEGRAM    — Bot API (getUpdates webhook or long-poll). DM auto-reply, inline buttons,
              media, channel broadcast. No 24h window. Very open — easy full automation.

LINKEDIN    — Marketing/Community API. Company-page posting + comment reply/like only.
              NO DM automation (ToS). DM UI hidden. Posting + analytics.

YOUTUBE     — Data API v3. Community posts, comment moderation (reply/like/hide/delete).
              No DM concept. Comment automation + content scheduling.

X / TWITTER — v2 API, paid tiers. DM (paid), tweet/reply/like, scheduling. Gate behind
              plan + feature flag; make the cost explicit to the operator.

TIKTOK      — Content Posting API + analytics. Posting + insights. Comment mgmt limited.
              No DM automation. Posting-focused channel.

PINTEREST   — API v5. Pin/board publishing + analytics. Posting only.
```

Each platform ships its own:
`/api/integrations/{channel}/connect` (OAuth) · `/callback` · `/api/webhooks/{channel}`
(verify + parse → normalize to core's `NormalizedEvent`) · adapter class · capability snapshot.

---

## 28.6 Reuse vs New Work

```
✅ REUSED AS-IS
   DB core & RLS · CRM & leads · lead scoring · workflow engine · analytics ·
   AI reply engine & KB · campaign executor · platform admin (module 27) ·
   24h-window logic (applies to IG + FB)

🔧 NEW
   channel_type enum + channel_accounts table + channel columns
   ChannelAdapter interface + one adapter per platform
   Per-platform OAuth connect/callback + webhook handlers
   Capability-gated UI (sidebar channels, per-channel settings)
   Refactor: InstagramAPI → implements ChannelAdapter

♻️ REFACTOR (low risk)
   Anywhere code says `instagram_accounts` / `InstagramAPI` directly →
   route through channel_accounts / getAdapter(channel)
```

---

## 28.7 Build Order (phased — value first)

```
Phase A  (highest reuse, full automation)
  1. Adapter interface + refactor Instagram into it
  2. channel_accounts migration + channel columns
  3. Facebook / Messenger adapter  (Meta API — near-identical to IG)
  4. Telegram adapter              (open bot API — full DM automation)
  → Deliverable: 3 fully-automated channels (IG + FB + Telegram), per-channel inboxes

Phase B  (posting / comment channels)
  5. LinkedIn (page posting + comment reply/like)
  6. YouTube  (community posts + comment moderation)
  → Deliverable: content scheduling + comment automation on LinkedIn & YouTube

Phase C  (specialized / gated)
  7. X/Twitter (plan-gated, paid API)
  8. TikTok + Pinterest (posting + analytics)
  → Deliverable: full channel coverage, each within its API's real limits
```

---

## 28.8 Guardrails

- **Never** render a DM/automation control for a channel whose `capabilities.dm === false`.
- **ToS safety:** LinkedIn/TikTok DM automation is intentionally absent — do not add unofficial
  workarounds; they risk account bans for our customers.
- **Rate limits & tokens** are per `channel_account`, isolated — one platform's throttling never
  blocks another. Token refresh cron ([22-background-services.md](22-background-services.md))
  iterates all `channel_accounts`, calling each adapter's `refreshToken()`.
- **Plan gating:** number of connectable channels/accounts respects `PLAN_LIMITS`
  ([03-multi-tenant.md](03-multi-tenant.md)); add `maxChannels` per plan.
```
