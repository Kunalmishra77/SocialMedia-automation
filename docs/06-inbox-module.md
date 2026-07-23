# 06 — Inbox Module

## 6.1 Conversation Model

Every unique Instagram user who contacts a workspace creates exactly one conversation per Instagram account (upserted on `(workspace_id, ig_account_id, contact_id)` conflict). This keeps all interaction history in one thread regardless of channel surface.

### Channel Types

| Channel | Trigger | Stored in |
|---------|---------|-----------|
| `dm` | User sends a DM | `messages` + `conversations` |
| `comment` | User comments on a post/reel | `ig_comments` + surfaced as conversation |
| `story_reply` | User replies to your story | `messages` + `conversations` (with `story_id` metadata) |
| `story_mention` | User mentions your account in their story | `messages` + `conversations` (special type) |
| `reel_comment` | User comments on a Reel | `ig_comments` (same as comment, `media_type=REEL`) |
| `live` | User comments during Instagram Live | `messages` (if DM) or `ig_comments` |

---

## 6.2 Inbox Architecture

```
modules/inbox/
├── components/
│   ├── InboxLayout/          — three-panel layout (list + chat + contact)
│   ├── ConversationList/     — virtualized list with filters
│   ├── ConversationItem/     — summary row (avatar, snippet, time, badges)
│   ├── ConversationFilters/  — filter bar (status, channel, account, agent, label)
│   ├── ChatWindow/           — message thread
│   ├── MessageBubble/        — per-message renderer (all types)
│   ├── MessageInput/         — reply composer (text + media + quick replies)
│   ├── ConversationHeader/   — top bar: contact name, assignment, status, actions
│   ├── ContactPanel/         — right panel: contact details, lead info, history
│   ├── CommentThread/        — for comment channel: post preview + comment list
│   ├── WindowBanner/         — 24h countdown warning (< 2h remaining)
│   ├── QuickReplies/         — canned response picker
│   ├── InternalNote/         — team-internal note composer
│   ├── AssignDropdown/       — agent assignment picker
│   ├── LabelPicker/          — tag conversation with labels
│   └── SnoozeDialog/         — snooze until date/time
├── hooks/
│   ├── useConversations.ts   — paginated list with filters + realtime
│   ├── useMessages.ts        — message thread + realtime for active conversation
│   ├── useWindowStatus.ts    — 24h window countdown timer
│   ├── useTypingIndicator.ts — typing presence via Supabase Presence
│   └── useSmartReplies.ts    — AI suggest 3 reply options
└── services/
    └── inbox.service.ts
```

---

## 6.3 Conversation Filters

```typescript
interface ConversationFilters {
  status?: ConversationStatus | 'all'    // open|pending|resolved|snoozed|all
  assignedTo?: 'me' | 'unassigned' | string  // agent id
  channel?: 'all' | 'dm' | 'comment' | 'story_reply' | 'story_mention'
  igAccountId?: string
  label?: string
  search?: string                         // full-text search on last_message
  dateFrom?: string
  dateTo?: string
  starred?: boolean
  pinned?: boolean
}
```

Filters stored in URL params (`?status=open&assignedTo=me`) so they survive page refresh.

---

## 6.4 Real-Time Updates

```typescript
// hooks/useConversations.ts
function useConversations(filters: ConversationFilters) {
  const { activeWorkspace } = useWorkspaceStore()
  const queryClient = useQueryClient()
  
  // Initial load + polling via React Query
  const query = useInfiniteQuery({
    queryKey: ['conversations', filters],
    queryFn: ({ pageParam = 0 }) => fetchConversations(filters, pageParam),
    getNextPageParam: ...,
  })
  
  // Realtime subscription
  useEffect(() => {
    const channel = supabase
      .channel(`conversations:${activeWorkspace.id}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'conversations',
        filter: `workspace_id=eq.${activeWorkspace.id}`,
      }, (payload) => {
        // Optimistically update the list
        queryClient.setQueryData(['conversations', filters], (old) =>
          mergeConversationUpdate(old, payload)
        )
      })
      .subscribe()
    
    return () => { supabase.removeChannel(channel) }
  }, [activeWorkspace.id])
  
  return query
}
```

Three realtime subscriptions active during dashboard session:
1. `conversations` — all INSERT/UPDATE for workspace
2. `messages` — INSERT for active conversation
3. `notifications` — INSERT for current user

---

## 6.5 Message Composer

The `MessageInput` component supports:

```typescript
type OutboundMessageType = 'text' | 'image' | 'video' | 'audio' | 'template' | 'quick_reply'

// Send text
POST /api/messages/send
{ conversationId, content: "Hello!", type: "text" }

// Send image
POST /api/messages/send
{ conversationId, type: "image", mediaUrl: "https://...", caption: "Check this out!" }

// Send quick reply
POST /api/messages/send
{ conversationId, type: "quick_reply", content: "Choose an option:",
  quickReplies: [{ title: "Yes" }, { title: "No" }, { title: "Later" }] }

// Send from media library
POST /api/messages/send
{ conversationId, type: "image", mediaLibraryId: "uuid" }
```

**24h window guard:** Before sending, the client calls `useWindowStatus()`. If window is expired:
- Text/media send is blocked with a `WindowBanner` explaining the restriction
- Template button is highlighted with "Send Template Message" CTA
- If no approved templates exist, admin is prompted to create one

---

## 6.6 Comment Thread UI

Comments appear as a special conversation type. The chat window for a comment conversation shows:
- **Post preview** at the top (thumbnail + caption snippet + link to IG post)
- **Comment thread** below (all comments on the post by this user, sorted by time)
- **Reply options** at the bottom:
  - "Reply publicly" → `POST /api/comments/[id]/reply` → public reply on Instagram
  - "Send DM" → `POST /api/messages/send` → private DM to the commenter

```typescript
// Comment thread item rendering
interface CommentItem {
  ig_comment_id: string
  text: string
  timestamp: Date
  is_hidden: boolean
  replied_at?: Date
  reply_text?: string
  dm_sent: boolean
  sentiment: 'positive' | 'neutral' | 'negative'
}
```

**Auto-hide negative comments:** If `wsSettings.auto_hide_negative_comments = true`, comments with `sentiment = 'negative'` are auto-hidden via the Graph API when received.

---

## 6.7 Story Reply UI

Story replies show:
- **Story preview thumbnail** (fetched from Meta, cached in `messages.metadata.ig_story_url`)
- The reply message from the user
- Chat history continues below

If the story has expired (Instagram stories last 24 hours), the story thumbnail is replaced with a "Story Expired" placeholder.

---

## 6.8 Conversation Actions

| Action | UI location | API call |
|--------|------------|---------|
| Assign agent | ConversationHeader dropdown | `POST /api/conversations/[id]/assign` |
| Resolve | ConversationHeader button | `POST /api/conversations/[id]/resolve` |
| Reopen | ConversationHeader (on resolved conv) | `POST /api/conversations/[id]/reopen` |
| Snooze | ConversationHeader → snooze dialog | `POST /api/conversations/[id]/snooze { until }` |
| Add label | LabelPicker popover | `PATCH /api/conversations/[id] { labels }` |
| Pin | ConversationItem context menu | `PATCH /api/conversations/[id] { is_pinned: true }` |
| Star | ConversationItem star icon | `PATCH /api/conversations/[id] { is_starred: true }` |
| Pause/resume bot | ConversationHeader toggle | `PATCH /api/conversations/[id] { bot_paused }` |
| Add note | MessageInput tab | `POST /api/conversations/[id]/notes` |

---

## 6.9 Contact Panel

Right-side panel when a conversation is active:

**Contact section:**
- IG profile picture, username, name, follower count, verified badge
- Lifecycle stage pill (Lead / Prospect / Customer)
- Lead temperature badge (Cold / Warm / Hot)
- Tags (editable inline)
- Custom fields (editable)
- Notes (add/view timeline)
- "View 360" → opens full contact page

**Conversation metadata:**
- Created date, channel, source (e.g., "from comment on Post X")
- Labels
- Assigned agent
- SLA breach indicator

**Lead section** (if lead exists):
- Stage + value
- AI score (0–100 with colored bar)
- Buy signals list
- "Open Lead" button

**Activity timeline:**
- Recent messages, notes, lead stage changes, assignments (chronological)

---

## 6.10 Smart Replies (AI Suggestions)

When agent opens a conversation, 3 AI-generated reply suggestions load in the `MessageInput`:

```typescript
// POST /api/ai/suggest-replies
// Body: { conversationId, lastN: 10 }
// Returns: { suggestions: string[] }

async function generateSuggestions(conversationId: string) {
  const history = await fetchLastNMessages(conversationId, 10)
  const kbContext = await fetchKnowledgeBaseContext(workspaceId, lastInboundMessage)
  const prompt = buildSuggestionPrompt(history, kbContext, wsSettings)
  const response = await callAI([{ role: 'user', content: prompt }], {
    model: wsSettings.fast_model ?? 'openai/gpt-4o-mini',
    maxTokens: 200,
    temperature: 0.6,
  })
  return parseSuggestions(response)  // expects JSON array of 3 strings
}
```

Suggestions appear as clickable chips. Clicking one populates the MessageInput; agent can edit before sending.

---

## 6.11 Internal Notes

Internal notes are messages with `type = 'internal_note'` and `direction = 'outbound'`. They:
- Are never counted in message limits
- Are never sent to Instagram (pure internal)
- Are visible only to workspace members, not the contact
- Display with a distinct yellow/amber background in the chat window
- Support @mentions of team members (triggers a notification)
- Are excluded from the lead temperature trigger (`type != 'internal_note'`)

---

## 6.12 Search

**Global search** (`GET /api/search?q={query}&workspaceId={id}`):
- Contacts: FTS on `full_name || ig_username || ig_name`
- Conversations: FTS on `last_message`
- Messages: FTS on `content`
- Returns top 5 results per category

**Inline inbox search** (filter on conversation list):
- Searches `last_message` text client-side on loaded conversations
- For deeper search, delegates to global search API with `?context=inbox`
