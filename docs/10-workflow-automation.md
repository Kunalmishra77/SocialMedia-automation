# 10 — Workflow Automation Builder

**Priority:** Phase 3 (Pro plan+)

## 10.1 Overview

The Workflow Automation Builder is a visual, no-code tool that lets businesses create multi-step automation sequences. Unlike chatbot flows (which handle back-and-forth conversation with a single contact), workflows are broader event-driven automations that can span multiple actions, conditions, and delays.

**Analogy:** If Chatbot Flows are Typeform/ManyChat, Workflows are Zapier/Make — but built specifically for Instagram customer engagement.

---

## 10.2 Architecture

```
Trigger Event
    ↓
Workflow Engine finds matching active workflow
    ↓
Creates workflow_session for this contact
    ↓
Executes nodes in sequence (with conditions, branches, waits)
    ↓
Each step either: sends message / updates data / calls webhook / waits
    ↓
Session ends when it reaches an 'end' node or fails
```

**Difference from chatbot flows:**
- Workflows are triggered by events (not just inbound messages)
- Workflows can run without any user reply (e.g., "Wait 2 hours → send follow-up")
- Workflows can update contact/lead data as part of the flow
- Workflows can fire external webhooks, create tasks, send email alerts

---

## 10.3 Trigger Types

| Trigger | Event | Config |
|---------|-------|--------|
| `dm_received` | Any inbound DM | keyword match (optional) |
| `first_dm` | First ever DM from this contact | — |
| `comment_received` | Comment on any/specific post | post_id (optional), keyword |
| `story_mention` | User mentions your account | — |
| `story_reply` | User replies to any/specific story | story_id (optional) |
| `reel_comment` | Comment on any/specific Reel | reel_id (optional) |
| `new_follower` | User follows your account* | — |
| `lead_created` | A new lead is created | lead source (optional) |
| `lead_stage_changed` | Lead moves to a new stage | from_stage, to_stage |
| `lead_temperature_changed` | Lead becomes hot/warm | new_temperature |
| `contact_tag_added` | A tag is added to a contact | tag_name |
| `campaign_replied` | Contact replied to a campaign | campaign_id (optional) |
| `scheduled` | Time-based (cron-style) | cron expression, audience |
| `window_expiring` | Contact's 24h window expires in 2h | — |

*New follower events require `pages_manage_metadata` permission and are delivered via webhook `follows` field.

---

## 10.4 Node Types

### Action Nodes

| Node | Config | Function |
|------|--------|----------|
| `send_dm` | message text / media | Send a DM to the contact |
| `send_quick_reply` | message + options[] | Send message with quick reply buttons |
| `assign_conversation` | agent_id or 'round_robin' | Assign to agent |
| `change_lead_stage` | new_stage | Update lead pipeline stage |
| `change_lead_temperature` | new_temp | Override lead temperature |
| `update_contact_field` | field + value | Update any contact custom field |
| `add_contact_tag` | tag | Add tag to contact |
| `remove_contact_tag` | tag | Remove tag from contact |
| `create_lead` | stage + value | Create a new lead for this contact |
| `add_note` | note_content | Add internal note to conversation |
| `add_label` | label | Add label to conversation |
| `fire_webhook` | url + method + headers + body_template | Call external service |
| `send_email_alert` | to + subject + body_template | Alert a team member by email |
| `enroll_sequence` | sequence_id | Enroll contact in a follow-up sequence |
| `resolve_conversation` | — | Auto-resolve the conversation |
| `pause_bot` | — | Pause AI bot for this conversation |
| `resume_bot` | — | Resume AI bot |
| `send_ai_reply` | context_override | Generate AI reply and send it |

### Control Nodes

| Node | Config | Function |
|------|--------|----------|
| `condition` | field + operator + value | Branch based on contact/lead data or message content |
| `wait` | duration | Wait N minutes/hours/days |
| `wait_for_reply` | timeout_hours | Wait for user reply; branch on replied vs timeout |
| `end` | — | End workflow session |

### Condition Operators

| Field type | Operators |
|-----------|-----------|
| Text | contains / does_not_contain / equals / starts_with |
| Number | equals / greater_than / less_than |
| Boolean | is_true / is_false |
| Date | before / after / is_today / within_N_days |
| List/array | includes / does_not_include |

---

## 10.5 Example Workflows

### Workflow 1: Story Mention → Welcome + Lead Capture

```
TRIGGER: story_mention (any story)
      ↓
[send_dm] "Thanks for mentioning us in your story! 😊 We'd love to know more about you.
What best describes you? Reply with a number:
1. I'm interested in buying
2. I'm already a customer
3. Just exploring"
      ↓
[wait_for_reply: 24 hours]
      ├─ replied → [condition] reply contains "1"
      │               ├─ yes → [change_lead_temperature: warm]
      │               │       [send_dm] "Great! Here's our product catalogue: [link]"
      │               │       [assign_conversation: round_robin]
      │               └─ no → [condition] reply contains "2"
      │                           ├─ yes → [add_contact_tag: "existing_customer"]
      │                           │       [send_dm] "Welcome back! How can we help you?"
      │                           └─ no → [send_dm] "No problem! Feel free to DM us anytime 😊"]
      └─ timeout → [send_dm] "Still here if you need anything! 💬"]
[end]
```

### Workflow 2: Hot Lead → Sales Team Alert

```
TRIGGER: lead_temperature_changed (to: hot)
      ↓
[add_label] "HOT LEAD"
      ↓
[send_email_alert] to: sales@company.com
  Subject: "🔥 Hot lead: {{contact.ig_username}}"
  Body: "Lead {{contact.ig_name}} has reached HOT status.
         Last message: {{conversation.last_message}}"
      ↓
[assign_conversation] round_robin (from sales team)
      ↓
[send_dm] "Our sales team will reach out to you shortly!"
      ↓
[add_note] "Auto-flagged as HOT lead on {{date}}. Assigned to sales team."
[end]
```

### Workflow 3: 24h Window Expiring → Re-engagement Prompt

```
TRIGGER: window_expiring (2h before expiry)
      ↓
[condition] lead.stage IN ('new', 'contacted')
  ├─ yes → [send_dm] "Quick question before we lose touch — is [product] still on your mind?
                      Reply YES to stay connected, or LATER if you need more time."
           [wait_for_reply: 2 hours]
           ├─ replied → [change_lead_stage: follow_up]
           └─ no reply → [add_contact_tag: "window_expired"]
  └─ no → [end]
[end]
```

---

## 10.6 Workflow Engine Implementation

```typescript
// lib/workflow-engine.ts

export async function processWorkflowForEvent(
  supabase: SupabaseClient,
  event: WorkflowEvent
): Promise<void> {
  // Find all active workflows whose trigger matches this event
  const { data: workflows } = await supabase
    .from('workflow_automations')
    .select('*')
    .eq('workspace_id', event.workspaceId)
    .eq('is_active', true)
    .eq('trigger_type', event.type)
  
  for (const workflow of workflows ?? []) {
    if (!matchesTriggerConfig(workflow.trigger_config, event)) continue
    
    // Check if contact already has an active session for this workflow
    const existingSession = await getActiveSession(supabase, workflow.id, event.contactId)
    if (existingSession && !workflow.allow_parallel_sessions) continue
    
    // Create new session
    const session = await supabase.from('workflow_sessions').insert({
      workflow_id: workflow.id,
      conversation_id: event.conversationId,
      contact_id: event.contactId,
      current_node_id: workflow.nodes[0]?.id,
      status: 'active',
      context: { trigger_data: event.data },
    }).select().single()
    
    // Execute first node immediately
    await executeWorkflowSession(supabase, session.data!, workflow, event)
    
    // Update run count
    await supabase.from('workflow_automations')
      .update({ run_count: workflow.run_count + 1, last_run_at: new Date().toISOString() })
      .eq('id', workflow.id)
  }
}

async function executeWorkflowSession(
  supabase, session, workflow, event
): Promise<void> {
  const node = findNode(workflow.nodes, session.current_node_id)
  if (!node) { await endSession(supabase, session.id); return }
  
  const context = session.context
  const contact = await getContact(supabase, session.contact_id)
  const conversation = session.conversation_id
    ? await getConversation(supabase, session.conversation_id) : null
  const igAccount = conversation ? await getIgAccount(supabase, conversation.ig_account_id) : null
  const api = igAccount ? new InstagramAPI(igAccount.access_token, igAccount.ig_user_id) : null
  
  switch (node.type) {
    case 'send_dm':
      if (api && contact) {
        const content = interpolateTemplate(node.config.content, { contact, context })
        await api.sendDM(contact.ig_user_id, { type: 'text', content })
        if (conversation) {
          await saveOutboundMessage(supabase, conversation.id, workflow.workspace_id, {
            content, type: 'text', sender_type: 'bot'
          })
        }
      }
      await advanceToNext(supabase, session, node, workflow, event)
      break
    
    case 'condition':
      const result = evaluateCondition(node.config, contact, context)
      const nextId = result ? node.edges?.true_node : node.edges?.false_node
      if (nextId) {
        await updateSession(supabase, session.id, { current_node_id: nextId })
        await executeWorkflowSession(supabase, { ...session, current_node_id: nextId }, workflow, event)
      } else {
        await endSession(supabase, session.id)
      }
      break
    
    case 'wait':
      // Schedule resume via time_trigger_queue
      const resumeAt = new Date(Date.now() + node.config.durationMs)
      await supabase.from('time_trigger_queue').insert({
        workspace_id: workflow.workspace_id,
        trigger_at: resumeAt.toISOString(),
        action_type: 'resume_workflow_session',
        action_data: { session_id: session.id, next_node_id: getNextNodeId(node, workflow) },
        status: 'pending',
      })
      // Session stays 'active' but execution pauses here
      break
    
    case 'wait_for_reply':
      // Mark session as waiting for reply
      const timeoutAt = new Date(Date.now() + node.config.timeout_hours * 3600 * 1000)
      await updateSession(supabase, session.id, {
        context: { ...context, waiting_for_reply: true, reply_timeout_at: timeoutAt.toISOString() }
      })
      // When next inbound message arrives, workflow engine resumes this session
      break
    
    case 'fire_webhook':
      const body = interpolateTemplate(JSON.stringify(node.config.body_template), { contact, context })
      await fetch(node.config.url, {
        method: node.config.method,
        headers: node.config.headers,
        body,
      }).catch(err => console.error('[Workflow] Webhook failed:', err))
      await advanceToNext(supabase, session, node, workflow, event)
      break
    
    case 'assign_conversation':
      if (conversation) {
        await assignConversation(supabase, conversation.id, node.config)
      }
      await advanceToNext(supabase, session, node, workflow, event)
      break
    
    case 'end':
      await endSession(supabase, session.id)
      break
    
    default:
      await performAction(supabase, node, contact, conversation, context)
      await advanceToNext(supabase, session, node, workflow, event)
  }
}
```

---

## 10.7 Workflow Builder UI

```
modules/workflows/
├── components/
│   ├── WorkflowList/           — list of all workflows with status + stats
│   ├── WorkflowCanvas/         — reactflow-based visual builder
│   ├── NodePalette/            — draggable node types sidebar
│   ├── NodeConfig/             — right panel: config for selected node
│   │   ├── TriggerConfig/
│   │   ├── SendDmConfig/
│   │   ├── ConditionConfig/
│   │   ├── WaitConfig/
│   │   ├── WebhookConfig/
│   │   └── ...
│   ├── WorkflowStats/          — run count, success rate, active sessions
│   └── TestWorkflow/           — simulate workflow with a test contact
```

---

## 10.8 Workflow Templates

Pre-built templates users can activate with one click:

| Template | Trigger | Use case |
|---------|---------|---------|
| Welcome DM | first_dm | Greet new DM contacts |
| Comment → DM | comment_received | Comment-to-DM funnel |
| Story Mention Acknowledge | story_mention | Thank story mentioners |
| Hot Lead Alert | lead_temperature → hot | Notify sales team |
| Window Expiry Rescue | window_expiring | Re-engage before window closes |
| Post-Purchase Follow-up | contact_tag = "customer" | Thank customers, ask for review |
| Booking Confirmation | lead_stage → interested | Confirm and prepare for meeting |
