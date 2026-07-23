# 26 — Future Multi-Platform Expansion

**Priority:** Phase 6+ (post-GA, Enterprise tier)

## 26.1 Architecture for Multi-Channel

The Instagram platform is designed from the start with multi-channel expansion in mind. The core abstractions that make this possible:

### Channel-Agnostic Data Model

```sql
-- conversations.channel already supports multiple types:
channel VARCHAR(30)  -- 'dm' | 'comment' | 'story_reply' | 'whatsapp' | 'telegram' | 'email' | 'linkedin'

-- contacts are identified by channel-specific IDs in a flexible JSONB column:
-- instagram: ig_user_id (IGSID)
-- whatsapp: phone number
-- telegram: telegram_user_id
-- email: email address
-- All stored in a `channel_ids` JSONB column + specific indexed columns where needed
```

### Platform-Agnostic Send Interface

```typescript
// lib/channel-sender.ts
interface OutboundMessage {
  conversationId: string
  contactId: string
  workspaceId: string
  channel: ChannelType
  content: string
  mediaUrl?: string
  messageType?: string
}

interface ChannelSender {
  send(message: OutboundMessage): Promise<{ messageId: string }>
  isWithinWindow(contact: Contact): boolean
  getWindowExpiry(contact: Contact): Date | null
}

// Each channel implements ChannelSender:
// InstagramSender, WhatsAppSender, TelegramSender, EmailSender, LinkedInSender
```

The inbox, AI pipeline, CRM, and campaigns work against the abstract `ChannelSender` interface — the channel-specific sending logic is isolated in each sender class.

---

## 26.2 WhatsApp Integration

The existing WhatsApp Automation Platform (separate project, same Coolify) exposes an API. The Instagram platform can integrate as a second channel by:

### Option A: Shared Supabase (Same DB, Different App)
- Add a new `workspace_connections` table linking Instagram workspace to WhatsApp workspace
- Contacts with both Instagram + WhatsApp presence are unified in a single contact record
- Agent sees unified contact history: Instagram DMs + WhatsApp messages in one timeline

### Option B: WhatsApp as a Native Channel (Rebuild)

Rewrite the WhatsApp platform as a module within the Agentix multi-channel platform:

```
New architecture:
app/
├── (dashboard)/
│   ├── conversations/   — unified inbox: all channels side by side
│   └── settings/
│       ├── instagram/   — IG account connections
│       └── whatsapp/    — WhatsApp Business API connections

lib/
├── senders/
│   ├── instagram.sender.ts
│   └── whatsapp.sender.ts
│
app/api/webhooks/
├── instagram/route.ts
└── whatsapp/route.ts     — handles WhatsApp Business API webhooks (same HMAC pattern)
```

### WhatsApp Business API Differences from Instagram

| Feature | Instagram | WhatsApp |
|---------|-----------|---------|
| Identifier | IGSID | Phone number (E.164) |
| Messaging window | 24h from last user message | 24h from last user message |
| Cold outreach | Not allowed | Not allowed |
| Templates | Not required (except broadcast) | Required for outbound (HSM templates) |
| Media types | Images, videos, stickers, audio | + Documents, Location, Contacts |
| Rate limits | 1,000/hour | 1,000/day per number (varies by tier) |
| Webhook format | Meta Graph API | Meta Cloud API (slightly different schema) |

**Key addition for WhatsApp:** `wa_templates` table (WhatsApp message templates, approved by Meta). Campaign module uses templates for outbound messages instead of free-form text.

---

## 26.3 Telegram Integration

```typescript
// Telegram Bot API (entirely different auth model — no OAuth, just a bot token)

// Setup: create bot via @BotFather → get BOT_TOKEN
// Webhook: register via https://api.telegram.org/bot{TOKEN}/setWebhook?url={APP_URL}/api/webhooks/telegram

// telegram_accounts table (instead of instagram_accounts):
CREATE TABLE public.telegram_bots (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces ON DELETE CASCADE,
  bot_token    TEXT NOT NULL,   -- from @BotFather
  bot_username VARCHAR(255),
  bot_id       BIGINT,
  is_active    BOOLEAN DEFAULT true,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- Contacts identified by telegram_user_id (bigint):
-- contacts.channel_ids ->> 'telegram' = '123456789'
```

**Telegram differences:**
- No messaging window (can message users anytime if they started the conversation)
- Supports inline keyboards (buttons) natively — maps to flow buttons
- Supports groups and channels — but we handle only private chats for DM automation
- No HSM template requirement for outbound

**TelegramSender:**
```typescript
class TelegramSender implements ChannelSender {
  async send(msg: OutboundMessage) {
    const res = await fetch(
      `https://api.telegram.org/bot${this.botToken}/sendMessage`,
      {
        method: 'POST',
        body: JSON.stringify({
          chat_id: msg.contact.channel_ids.telegram,
          text: msg.content,
          parse_mode: 'MarkdownV2',
        }),
      }
    )
    const data = await res.json()
    return { messageId: String(data.result.message_id) }
  }
  
  isWithinWindow() { return true }  // No window for Telegram
  getWindowExpiry() { return null }
}
```

---

## 26.4 LinkedIn Integration

LinkedIn DMs (InMail) via LinkedIn Marketing API:

**Limitations:**
- LinkedIn does not provide a consumer messaging API — only for pre-approved use cases
- Direct DM automation is heavily restricted and may violate LinkedIn ToS for mass messaging
- Only available through LinkedIn Messaging API (requires LinkedIn partnership)

**Viable approach for Phase 6:**
- Connect via LinkedIn OAuth for professional accounts
- Auto-reply to connection requests / InMails using LinkedIn API (within policy)
- Lead capture from LinkedIn Lead Gen Forms (similar to Meta Lead Ads)
- Post comment automation on LinkedIn posts

**Contact identifier:** `linkedin_member_urn` (format: `urn:li:person:{id}`)

```typescript
interface LinkedInAccount {
  id: UUID
  workspace_id: UUID
  member_urn: string        // LinkedIn person URN
  access_token: string      // OAuth 2.0 access token (2-hour expiry)
  refresh_token: string     // OAuth 2.0 refresh token (60-day expiry)
  display_name: string
  is_active: boolean
}
```

---

## 26.5 Email Channel

Email as a conversation channel (not transactional email):

```typescript
// Inbound: receive emails via Resend inbound routing or Mailgun
// Outbound: send via Resend / Mailgun

interface EmailSender extends ChannelSender {
  send(msg: OutboundMessage): Promise<{ messageId: string }>
}

// contacts identified by email address
// conversations.channel = 'email'

// Email threading: In-Reply-To header maintains thread continuity
// Each conversation has email_thread_id (In-Reply-To / Message-ID chain)
```

**Email-specific features:**
- Rich text (HTML email) in composer
- Email signature per-agent
- Auto-reply: out-of-office detection (no AI reply to bounces/auto-replies)
- Thread merge: if same contact sends from multiple email addresses

---

## 26.6 X (Twitter) Integration

X (formerly Twitter) DMs via X API v2:

**Major constraint:** X API v2 DM access requires Elevated+ access (previously called "Twitter API v2 Pro") at $100/month. Mass automation is explicitly against X ToS.

**Viable Phase 6 use case:**
- Monitor brand mentions (`@username` mentions in tweets)
- Auto-reply to mentions with a comment directing to DM
- Track DM conversations for existing DM threads (not mass DM blast)

```typescript
// X mentions webhook:
// POST /api/webhooks/x — receives X Account Activity API events
// Requires: X Developer Account + Elevated access + App approved for Account Activity API

interface XAccount {
  id: UUID
  workspace_id: UUID
  x_user_id: string
  x_username: string
  oauth_token: string
  oauth_token_secret: string  // X still uses OAuth 1.0a for some API paths
  is_active: boolean
}
```

---

## 26.7 Unified Inbox (Multi-Platform)

Once 2+ channels are live, the unified inbox aggregates all conversations:

```
Unified Inbox
├── Channel filter: All | Instagram | WhatsApp | Telegram | Email
├── Each conversation card shows channel badge (IG logo, WA logo, etc.)
├── Contact has unified profile: shows all channel connections
└── Agent can see the contact's full history across all channels
```

**Contact unification logic:**
```typescript
// When a new contact arrives on any channel, check if we already know them:
// 1. Exact match: same channel_id on the same channel
// 2. Fuzzy match: same email in custom_fields, or same phone in custom_fields
// 3. If match found: merge into existing contact (add new channel_id to channel_ids JSONB)
// 4. If no match: create new contact with this channel as primary
```

---

## 26.8 Multi-Platform Campaign Engine

Campaigns extended to support cross-channel sending:

```typescript
// Campaign with multi-channel audience:
interface Campaign {
  // ... existing fields
  channels: ChannelType[]  // ['instagram', 'whatsapp']
  
  // Per-channel message variants (different content for each platform)
  messages: {
    instagram: { content: string, media_url?: string }
    whatsapp: { template_id: string, variables: string[] }
    telegram: { content: string }
    email: { subject: string, html: string }
  }
}
```

Campaign executor iterates per contact per channel — if a contact is reachable on 2 channels (IG + WA), they receive the message on the first available window.

---

## 26.9 Platform Expansion Decision Framework

When evaluating a new channel for integration, check:

| Criteria | Minimum bar |
|---------|-------------|
| Has a programmable DM API | Yes (no scraping, no unofficial API) |
| Webhook delivery (not polling) | Yes (or reliable long-polling) |
| User identifier is stable | Yes (not session-based) |
| Rate limits are manageable | < 10,000 messages/day for SMB use case |
| TOS allows business messaging automation | Yes (explicitly permitted for API use) |
| API available without $500+/month enterprise contract | Yes |

**Channels that pass (Phase 6 candidates):** WhatsApp, Telegram, Email, LinkedIn (limited)
**Channels that don't pass (do not build):** Snapchat, TikTok DMs (no public API), Discord (consumer, not business)
