# 17 — Team Collaboration Features

**Priority:** Phase 3 (all plans with multiple team members)

## 17.1 Overview

When multiple agents and managers work the same inbox, they need visibility into each other's work, the ability to communicate privately about a conversation, and structured task management. This module adds:
- Internal notes on conversations (private, never sent to contact)
- Mention (@) teammates in notes
- Conversation assignment with notifications
- Shared team status
- Task checklists on conversations
- Approval workflows for content/campaigns

All collaboration features are internal — invisible to the contact/customer.

---

## 17.2 Internal Notes

Already partially designed in [06-inbox-module.md]. Full implementation here.

```sql
-- Notes are already included in conversations via messages with sender_type = 'note'
-- A note is a message row with:
--   direction = 'internal'
--   sender_type = 'agent'
--   is_private = true  (not sent to Instagram, never synced)

-- No new table needed — just filter messages by direction = 'internal'
```

**API:**
```typescript
// POST /api/conversations/[id]/notes
// Body: { content: string, mentions: string[] } — mentions = array of user_ids

export async function createNote(conversationId: string, agentId: string, content: string, mentions: string[]) {
  const supabase = createAdminClient()
  
  // Save note as internal message
  const { data: note } = await supabase.from('messages').insert({
    conversation_id: conversationId,
    workspace_id: workspaceId,
    direction: 'internal',
    sender_type: 'agent',
    sender_id: agentId,
    content,
    is_private: true,
    created_at: new Date().toISOString(),
  }).select().single()
  
  // Notify mentioned agents
  for (const userId of mentions) {
    await supabase.from('notifications').insert({
      workspace_id: workspaceId,
      user_id: userId,
      type: 'mention',
      title: 'You were mentioned in a note',
      body: content.substring(0, 100),
      data: { conversation_id: conversationId, note_id: note.id }
    })
  }
  
  return note
}
```

**UI rendering:**
- Internal notes shown between regular messages in the message thread
- Visually distinct: yellow/amber background, "📝 Note" badge, "only visible to team" label
- Agent name + avatar shown (since it's internal, not from a customer)
- @mentions highlighted in blue

---

## 17.3 Conversation Assignment

Assignment is already implemented as a core feature (assignee dropdown in ConversationHeader). Here we add the collaboration layer on top:

### Assignment Comment

When assigning a conversation, the assigner can leave an assignment note:

```typescript
// Extended assignment: POST /api/conversations/[id]/assign
// Body: { agent_id: string, note?: string }

// If note provided, auto-create an internal note:
// "Assigned to @{agent_name}: {note}"
```

### Team Availability Status

```typescript
// Each agent can set their availability:
type AgentStatus = 'online' | 'away' | 'busy' | 'offline'

// Stored on workspace_members:
// availability_status VARCHAR(20) DEFAULT 'offline'
// status_updated_at TIMESTAMPTZ

// Route: PATCH /api/team/my-status
// Body: { status: AgentStatus }

// Shown in:
// - Assignment dropdown (green/yellow/red indicator next to name)
// - Team page workload view
```

**Status badge in assignment dropdown:**
```
● Online (3 conversations)
◐ Away (1 conversation)
○ Offline
```

---

## 17.4 Conversation Tasks (Checklists)

Agents can add todo items to a conversation — internal action items:

```sql
CREATE TABLE public.conversation_tasks (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    UUID NOT NULL REFERENCES workspaces ON DELETE CASCADE,
  conversation_id UUID NOT NULL REFERENCES conversations ON DELETE CASCADE,
  title           TEXT NOT NULL,
  assigned_to     UUID REFERENCES profiles,
  due_date        DATE,
  status          VARCHAR(20) DEFAULT 'pending',  -- pending|done
  created_by      UUID REFERENCES profiles,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  completed_at    TIMESTAMPTZ
);
```

**UI:** In the conversation right panel (below contact info), a "Tasks" section shows a checklist. Agents can check off tasks. Overdue tasks highlighted in red.

---

## 17.5 Approval Workflows

### Content Approval (for Content Studio)

Controlled by `post_approval_required` flag on instagram_accounts:

```
Draft → Review Requested (by creator) → Approved (by manager/admin) → Scheduled/Published
                                     ↓
                              Changes Requested → Back to Draft
```

**Notification flow:**
1. Creator saves post as draft → clicks "Submit for Approval"
2. Notification sent to all managers/admins: "New post awaiting approval: [title]"
3. Manager reviews in Content Studio → Approve or Request Changes
4. Creator notified of decision
5. If approved: post is scheduled/published

```typescript
// POST /api/content/posts/[id]/request-approval
// PATCH /api/content/posts/[id]/approve
// PATCH /api/content/posts/[id]/request-changes
// Body for request-changes: { feedback: string }
```

### Campaign Approval

For Pro/Enterprise workspaces, campaigns require manager approval before sending:

```
Campaign Draft → Review Requested → Approved → Scheduled → Running
                                 ↓
                           Changes Requested → Back to Draft
```

Same notification pattern as content approval.

---

## 17.6 Team Inbox (Shared Queue)

The "All" tab in the conversations view is the shared team inbox — all open/pending conversations for the workspace. Managers can:
- See ALL conversations (no agent isolation restriction for manager+ role)
- Filter by assigned agent
- Filter by channel
- Filter by label
- Search by contact name or message content

**Unassigned conversations bucket:** A dedicated filter `assigned_agent_id IS NULL` shows conversations nobody has claimed yet. Useful for managers to triage and distribute work.

### Round-Robin Auto-Assignment

When a new conversation arrives with no assigned agent:
1. Check workspace settings: `auto_assign_enabled` flag
2. If enabled: call `/api/team/balance` logic (existing round-robin)
3. Assign to the online agent with fewest open conversations
4. Send assignment notification

```typescript
// lib/auto-assign.ts
export async function autoAssignConversation(
  supabase: SupabaseClient,
  conversationId: string,
  workspaceId: string
): Promise<void> {
  const settings = await getWorkspaceSettings(workspaceId)
  if (!settings.auto_assign_enabled) return
  
  const onlineAgents = await supabase.from('workspace_members')
    .select('user_id, availability_status')
    .eq('workspace_id', workspaceId)
    .eq('role', 'agent')
    .in('availability_status', ['online'])
  
  if (!onlineAgents.data?.length) return
  
  // Count open conversations per agent
  const counts = await Promise.all(onlineAgents.data.map(async a => ({
    userId: a.user_id,
    count: await countOpenConversations(supabase, a.user_id, workspaceId),
  })))
  
  // Assign to agent with fewest
  const target = counts.sort((a, b) => a.count - b.count)[0]
  
  await supabase.from('conversations')
    .update({ assigned_agent_id: target.userId })
    .eq('id', conversationId)
  // Trigger fires notification (see 22-background-services.md)
}
```

---

## 17.7 Activity Timeline (Team View)

Managers can see a live feed of team activity:

```typescript
// GET /api/team/activity?limit=50
// Returns recent actions across the workspace:

[{
  type: 'message_sent' | 'conversation_assigned' | 'lead_updated' | 'note_added' | 'campaign_sent' | 'post_published',
  user_id: string,
  user_name: string,
  description: string,  // "Sent reply to @contact_username"
  resource_id: string,
  resource_type: 'conversation' | 'lead' | 'campaign' | 'post',
  occurred_at: string,
}]
```

This is built from the `notifications` table plus a new `activity_log` table:

```sql
CREATE TABLE public.activity_log (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces ON DELETE CASCADE,
  user_id      UUID REFERENCES profiles,
  type         VARCHAR(50) NOT NULL,
  resource_id  UUID,
  resource_type VARCHAR(30),
  description  TEXT,
  metadata     JSONB DEFAULT '{}',
  occurred_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_activity_log_workspace ON activity_log(workspace_id, occurred_at DESC);
```

**Retention:** 90 days (pg_cron cleanup).

---

## 17.8 Typing Indicators (Realtime)

When an agent starts typing a reply, other agents viewing the same conversation see a "typing..." indicator:

**Implementation:** Supabase Realtime Broadcast (no DB write):

```typescript
// In MessageComposer component, on input change:
const channel = supabase.channel(`conversation:${conversationId}`)
channel.send({ type: 'broadcast', event: 'typing', payload: { agent_name: currentUser.name } })

// All subscribers to conversation channel show:
// "Kunal is typing..."
```

No message is saved — pure ephemeral broadcast. Indicator auto-clears after 3 seconds of no typing event.

---

## 17.9 Conversation SLA (Response Time Limits)

```sql
-- On workspace_settings:
sla_first_response_minutes  INTEGER DEFAULT 60  -- alert if no first reply within 1 hour
sla_resolution_hours        INTEGER DEFAULT 24  -- alert if conversation unresolved in 24h
```

SLA checker cron runs every 30 minutes (see 22-background-services.md). When a breach is detected:
1. `conversations.sla_breached = true`
2. Manager notification: "SLA breach: @contact has been waiting 67 minutes"
3. Conversation flagged red in inbox (border-red-500 style)

Agent-level SLA report shows each agent's average first response time vs the SLA target.
