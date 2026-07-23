# 09 — Campaign Module

## 9.1 Instagram Campaign Constraints

Unlike WhatsApp, Instagram does NOT allow bulk messaging to arbitrary users. Campaigns are strictly compliant:

| Campaign type | Who can receive | Meta policy |
|--------------|----------------|------------|
| Window broadcast | Contacts who messaged you in last 24h | Compliant — within 24h window |
| Story engagement | Users who reacted/replied to a specific story | Compliant — they initiated engagement |
| Post comment DM | Users who commented on a post | Compliant — they initiated engagement |
| Reel comment DM | Users who commented on a Reel | Compliant — they initiated engagement |
| Re-engagement | Any past contact, using Meta-approved template | Compliant — approved template |
| Segment broadcast | A contact list/tag segment (only if they have active window) | Compliant when window check is enforced |

**What is NOT allowed and is blocked by this platform:**
- DM to followers who have never messaged you
- Bulk DM to contacts outside 24h window without approved template
- Repeated identical messages (spam pattern)

---

## 9.2 Campaign Types in Detail

### Type 1: Window Broadcast

Sends a custom message to all contacts who have an active 24-hour messaging window.

**Audience resolution:**
```sql
SELECT id, ig_user_id FROM contacts
WHERE workspace_id = $ws
  AND last_user_message_at > NOW() - INTERVAL '24 hours'
  AND is_blocked = false
  AND opted_out = false
ORDER BY last_user_message_at DESC
```

**Content:** Text message or media (image/video/audio) + optional caption.

---

### Type 2: Story Engagement

Sends a DM to users who reacted to (❤️, 😮, etc.) or replied to a specific story.

**Audience resolution:**
```sql
SELECT DISTINCT contact_id FROM ig_story_reactions
WHERE story_id = $story_id
  AND workspace_id = $ws
  AND reaction_type IN ('reply', 'reaction')
```

**Use case:** "You reacted to our story — here's your exclusive discount code: STORY10"

---

### Type 3: Post Comment DM (Standalone Campaign)

Campaign version of post automation — send to everyone who commented on a specific past post, even if the post_automation was not active at the time.

**Audience resolution:**
```sql
SELECT DISTINCT contact_id FROM ig_comments
WHERE ig_post_id = $post_id
  AND workspace_id = $ws
  AND dm_sent = false  -- avoid duplicate DMs
```

**Content:** Custom DM message. Optionally also auto-reply on the comment.

---

### Type 4: Re-engagement (Approved Template)

Sends an approved Meta Message Template to contacts outside the 24h window. This is how to re-engage lapsed contacts legally.

**Audience resolution:** Contact list / tag filter. No window restriction — uses approved template.

**Template types used:**
- Re-introduction: "Hi {{name}}, it's been a while! Here's something new from us."
- Promotional: discount / flash sale
- Utility: order update, appointment reminder

**Flow:**
1. Admin creates campaign, selects an approved template from `ig_templates`
2. Audience: select contact list / tags / date range of last contact
3. Campaign sends using template → creates DM thread
4. Once user replies → 24h window opens → can continue with regular messages

---

### Type 5: Segment Broadcast

Send to a saved contact list or tag segment — but ONLY to members who have an active 24h window.

**This is different from window broadcast:** It lets you target a specific audience (e.g., "VIP customers" tag) rather than all contacts with an open window.

---

## 9.3 Campaign Data Flow

```
Admin creates campaign (status=draft)
      ↓
Admin configures: type, audience, message, schedule
      ↓
Optional: send test to a single contact
  POST /api/campaigns/test-send { contactId }
      ↓
Admin launches: POST /api/campaigns/[id]/run
      ↓
executeCampaign(campaignId):
  1. Validate campaign (template approved? media exists?)
  2. Resolve audience list
  3. Apply filters:
     - Skip: is_blocked, opted_out
     - Skip: recent campaign failure (2+ failed campaigns in 30 days)
     - Window check (for non-template types)
  4. Bulk-insert campaign_recipients (status=pending or filtered)
  5. Update campaign: status=running, total_recipients=N
  6. Send loop (max 5 concurrent, 300ms delay between batches):
     for each recipient:
       a. Check 24h window (for window-type campaigns)
       b. InstagramAPI.sendDM(igUserId, message)
       c. Update campaign_recipients: status=sent, ig_message_id, sent_at
       d. Create conversation record if not exists
       e. Insert outbound message record
     Flush counts every 25 sends
  7. Update campaign: status=completed, completed_at
  8. Post-completion: link any inbound replies that arrived during send
```

---

## 9.4 Campaign Executor

```typescript
// lib/campaign-executor.ts
export async function executeCampaign(campaignId: string): Promise<void> {
  const supabase = createAdminClient()
  
  const { data: campaign } = await supabase
    .from('campaigns')
    .select('*, instagram_accounts(*), ig_templates(*)')
    .eq('id', campaignId)
    .single()
  
  if (!campaign || campaign.status === 'completed') return
  
  const igAccount = campaign.instagram_accounts
  const api = new InstagramAPI(igAccount.access_token, igAccount.ig_user_id)
  
  // Pre-flight: verify template if re_engagement type
  if (campaign.type === 're_engagement') {
    if (!campaign.ig_templates || campaign.ig_templates.status !== 'approved') {
      await markCampaignFailed(supabase, campaignId, 'Template not approved by Meta')
      return
    }
  }
  
  // Resolve audience
  const recipients = await resolveAudience(supabase, campaign)
  const filtered: CampaignRecipient[] = []
  const toSend: CampaignRecipient[] = []
  
  for (const contact of recipients) {
    // Check 24h window (skip for re_engagement which uses templates)
    if (campaign.type !== 're_engagement' && campaign.type !== 'post_comment') {
      if (!isWithin24HourWindow(contact.last_user_message_at)) {
        filtered.push({ ...contact, filtered_reason: '24h_window_expired' })
        continue
      }
    }
    toSend.push(contact)
  }
  
  // Bulk-insert recipients
  const recipientRows = [
    ...filtered.map(c => ({ ...baseRow(campaign, c), status: 'filtered', filtered_reason: c.filtered_reason })),
    ...toSend.map(c => ({ ...baseRow(campaign, c), status: 'pending' })),
  ]
  await supabase.from('campaign_recipients').upsert(recipientRows, { onConflict: 'campaign_id,contact_id' })
  
  // Update campaign stats
  await supabase.from('campaigns').update({
    status: 'running',
    started_at: new Date().toISOString(),
    total_recipients: recipients.length,
    filtered_count: filtered.length,
  }).eq('id', campaignId)
  
  // Send loop (5 concurrent)
  const BATCH_SIZE = 5
  const DELAY_MS = 300
  let sentCount = 0, failedCount = 0
  
  for (let i = 0; i < toSend.length; i += BATCH_SIZE) {
    if (await isCampaignCancelled(supabase, campaignId)) break
    
    const batch = toSend.slice(i, i + BATCH_SIZE)
    await Promise.all(batch.map(async (contact) => {
      try {
        const message = buildCampaignMessage(campaign, contact)
        const result = await api.sendDM(contact.ig_user_id, message)
        
        await supabase.from('campaign_recipients')
          .update({ status: 'sent', ig_message_id: result.id, sent_at: new Date().toISOString() })
          .eq('campaign_id', campaignId)
          .eq('contact_id', contact.id)
        
        sentCount++
      } catch (err: any) {
        await supabase.from('campaign_recipients')
          .update({ status: 'failed', error_message: String(err) })
          .eq('campaign_id', campaignId)
          .eq('contact_id', contact.id)
        failedCount++
      }
    }))
    
    // Flush counts every 25
    if (i % 25 === 0) {
      await supabase.from('campaigns').update({ sent_count: sentCount, failed_count: failedCount }).eq('id', campaignId)
    }
    
    if (i + BATCH_SIZE < toSend.length) await sleep(DELAY_MS)
  }
  
  // Mark completed
  await supabase.from('campaigns').update({
    status: 'completed',
    completed_at: new Date().toISOString(),
    sent_count: sentCount,
    failed_count: failedCount,
  }).eq('id', campaignId)
  
  // Create conversation records for all successful sends
  await createConversationsForCampaign(supabase, campaignId, igAccount)
}
```

---

## 9.5 Post Comment Automation (Real-Time)

Separate from campaigns — this fires in real-time as comments arrive.

```typescript
// In webhook handler (handleCommentEvent):
async function handleCommentEvent(supabase, workspace, igAccount, change) {
  const { commentId, senderId, text, postId, timestamp } = parseCommentEvent(change)
  
  // Upsert contact
  const contact = await upsertContact(supabase, workspace, igAccount, senderId)
  
  // Store comment
  await supabase.from('ig_comments').upsert({
    workspace_id: workspace.id,
    ig_account_id: igAccount.id,
    ig_comment_id: commentId,
    ig_post_id: postId,
    commenter_ig_id: senderId,
    contact_id: contact.id,
    text,
    timestamp,
  }, { onConflict: 'ig_comment_id' })
  
  // Check if any post_automation is active for this post
  const { data: automations } = await supabase
    .from('post_automations')
    .select('*')
    .eq('workspace_id', workspace.id)
    .eq('ig_post_id', postId)
    .eq('is_active', true)
  
  for (const automation of automations ?? []) {
    // Check trigger condition
    const shouldTrigger = automation.trigger_type === 'any_comment' ||
      automation.trigger_keywords?.some((kw: string) => text.toLowerCase().includes(kw.toLowerCase()))
    
    if (!shouldTrigger) continue
    
    // Prevent duplicate DM to same contact for this automation
    if (automation.prevent_duplicate) {
      const { count } = await supabase.from('campaign_recipients')
        .select('*', { count: 'exact', head: true })
        .eq('campaign_id', automation.campaign_id)
        .eq('contact_id', contact.id)
        .in('status', ['sent', 'delivered'])
      if (count! > 0) continue
    }
    
    // Send DM
    const api = new InstagramAPI(igAccount.access_token, igAccount.ig_user_id)
    try {
      await api.sendDM(senderId, { type: 'text', content: automation.dm_message })
      
      // Log to campaign_recipients
      await supabase.from('campaign_recipients').insert({
        campaign_id: automation.campaign_id,
        workspace_id: workspace.id,
        contact_id: contact.id,
        ig_user_id: senderId,
        status: 'sent',
        sent_at: new Date().toISOString(),
      })
      
      // Update trigger count
      await supabase.from('post_automations')
        .update({ trigger_count: automation.trigger_count + 1 })
        .eq('id', automation.id)
      
      // Post auto-reply on comment if configured
      if (automation.auto_comment_reply) {
        setTimeout(() =>
          api.replyToComment(commentId, automation.auto_comment_reply!).catch(() => {}),
          2_000
        )
      }
    } catch (err) {
      console.error('[PostAutomation] DM failed:', err)
    }
  }
}
```

---

## 9.6 Campaign Analytics

Per-campaign metrics page shows:

**Funnel:** Targeted → Filtered (window/blocked) → Sent → Delivered → Read → Replied

**Time series:** Daily/hourly send rate chart

**Per-recipient table:** Contact name, status, sent_at, read_at, replied (with message preview)

**Engagement stats:**
- Reply rate = replied / sent × 100%
- Read rate = read / delivered × 100%
- Conversion rate (if post-campaign lead tracking enabled) = leads_created / replied × 100%

---

## 9.7 Campaign Scheduling

```sql
-- time_trigger_queue stores the scheduled campaign
INSERT INTO time_trigger_queue (workspace_id, trigger_at, action_type, action_data)
VALUES ($wsId, $scheduledAt, 'run_campaign', '{"campaign_id": "..."}')
```

`/api/cron/run-time-triggers` processes due rows every 5 minutes.

---

## 9.8 A/B Testing (Phase 5)

Create two campaign variants (A and B) targeting the same audience. Each recipient randomly assigned to group A or B. Compare:
- Read rate A vs B
- Reply rate A vs B
- Conversion rate A vs B

Implemented as two campaign rows with `parent_campaign_id` FK and `ab_test_group = 'A' | 'B'`.
