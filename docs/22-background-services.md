# 22 — Background Services

## 22.1 Overview

All background work runs as:
1. **pg_cron jobs** — SQL/Postgres-native jobs (no external scheduler needed)
2. **Cron-triggered API routes** — `GET /api/cron/...` called by pg_cron via HTTP
3. **Supabase DB triggers** — instant reactions to row changes (no polling)

There is NO separate message queue (Redis queues, BullMQ, etc.) — campaign sends and sequence steps use the PostgreSQL DB as a queue. This simplifies ops significantly.

---

## 22.2 pg_cron Schedule (Full)

```sql
-- Enable pg_cron extension (done once in Supabase)
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- IMPORTANT: pg_cron HTTP calls require pg_net extension
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Helper to call internal API routes from pg_cron
CREATE OR REPLACE FUNCTION call_cron_route(path TEXT)
RETURNS void LANGUAGE sql AS $$
  SELECT net.http_get(
    url := current_setting('app.base_url') || path,
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || current_setting('app.cron_secret'),
      'Content-Type', 'application/json'
    )
  )
$$;
```

**All pg_cron jobs:**

```sql
-- 1. Instagram token refresh (daily at 3am UTC)
SELECT cron.schedule('refresh-ig-tokens', '0 3 * * *', $$SELECT call_cron_route('/api/cron/refresh-tokens')$$);

-- 2. SLA breach check (every 30 minutes)
SELECT cron.schedule('check-sla', '*/30 * * * *', $$SELECT call_cron_route('/api/cron/check-sla')$$);

-- 3. Sequence step runner (every 30 minutes)
SELECT cron.schedule('run-sequences', '*/30 * * * *', $$SELECT call_cron_route('/api/cron/run-sequences')$$);

-- 4. Campaign executor (every 5 minutes)
SELECT cron.schedule('send-campaigns', '*/5 * * * *', $$SELECT call_cron_route('/api/cron/send-campaigns')$$);

-- 5. Session cleanup (daily at 4am UTC)
SELECT cron.schedule('cleanup-sessions', '0 4 * * *', $$SELECT call_cron_route('/api/cron/cleanup-sessions')$$);

-- 6. Media insights sync (daily at 2am UTC)
SELECT cron.schedule('sync-media-insights', '0 2 * * *', $$SELECT call_cron_route('/api/cron/sync-media-insights')$$);

-- 7. Ad leads sync (every 15 minutes)
SELECT cron.schedule('sync-ad-leads', '*/15 * * * *', $$SELECT call_cron_route('/api/cron/sync-ad-leads')$$);

-- 8. Scheduled reports (daily at 9am UTC)
SELECT cron.schedule('scheduled-reports', '0 9 * * *', $$SELECT call_cron_route('/api/cron/scheduled-reports')$$);

-- 9. Activity log cleanup (daily at 5am UTC — delete rows > 90 days)
SELECT cron.schedule('cleanup-activity-log', '0 5 * * *',
  $$DELETE FROM activity_log WHERE occurred_at < NOW() - INTERVAL '90 days'$$);

-- 10. Notification cleanup (daily at 5am UTC — delete rows > 30 days)
SELECT cron.schedule('cleanup-notifications', '5 5 * * *',
  $$DELETE FROM notifications WHERE created_at < NOW() - INTERVAL '30 days' AND is_read = true$$);

-- 11. Audit log cleanup (every Sunday 6am UTC — delete rows > 12 months)
SELECT cron.schedule('cleanup-audit-log', '0 6 * * 0',
  $$DELETE FROM audit_log WHERE occurred_at < NOW() - INTERVAL '12 months'$$);
```

---

## 22.3 Cron Route Implementations

### Token Refresh (`/api/cron/refresh-tokens`)

```typescript
// Tokens expire every 60 days. Refresh proactively at 50 days.
export async function GET(req: NextRequest) {
  verifyInternalCronCall(req)
  const supabase = createAdminClient()
  
  const { data: accounts } = await supabase
    .from('instagram_accounts')
    .select('id, access_token, workspace_id, ig_username')
    .eq('is_active', true)
    .lt('token_expires_at', new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString()) // expires within 10 days
  
  let refreshed = 0, failed = 0
  for (const account of accounts ?? []) {
    try {
      const res = await fetch(
        `https://graph.instagram.com/refresh_access_token?grant_type=ig_refresh_token&access_token=${account.access_token}`
      )
      const data = await res.json()
      if (data.access_token) {
        await supabase.from('instagram_accounts').update({
          access_token: data.access_token,
          token_expires_at: new Date(Date.now() + data.expires_in * 1000).toISOString(),
        }).eq('id', account.id)
        refreshed++
      }
    } catch {
      failed++
      // Notify workspace admin
      await notifyAdmins(supabase, account.workspace_id, {
        type: 'token_refresh_failed',
        title: 'Instagram token refresh failed',
        body: `Token for @${account.ig_username} could not be refreshed. Please reconnect.`,
      })
    }
  }
  
  return Response.json({ refreshed, failed })
}
```

### SLA Breach Check (`/api/cron/check-sla`)

```typescript
export async function GET(req: NextRequest) {
  verifyInternalCronCall(req)
  const supabase = createAdminClient()
  
  // Find conversations that:
  // 1. Are open/pending (not resolved)
  // 2. Have not been replied to in sla_first_response_minutes
  // 3. Are not already marked sla_breached
  
  const { data: workspaces } = await supabase
    .from('workspaces')
    .select('id, settings')
    .not('settings->sla_first_response_minutes', 'is', null)
  
  for (const workspace of workspaces ?? []) {
    const slaMinutes = workspace.settings.sla_first_response_minutes ?? 60
    const threshold = new Date(Date.now() - slaMinutes * 60 * 1000).toISOString()
    
    const { data: breached } = await supabase
      .from('conversations')
      .select('id, contact_id, assigned_agent_id')
      .eq('workspace_id', workspace.id)
      .in('status', ['open', 'pending'])
      .eq('sla_breached', false)
      .lt('created_at', threshold)
      .is('first_replied_at', null)
    
    for (const conv of breached ?? []) {
      await supabase.from('conversations').update({ sla_breached: true }).eq('id', conv.id)
      
      await notifyManagers(supabase, workspace.id, {
        type: 'sla_breach',
        title: 'SLA breach detected',
        body: `A conversation has exceeded the ${slaMinutes}-minute response SLA`,
        data: { conversation_id: conv.id }
      })
    }
  }
  
  return Response.json({ processed: workspaces?.length ?? 0 })
}
```

### Sequence Runner (`/api/cron/run-sequences`)

```typescript
export async function GET(req: NextRequest) {
  verifyInternalCronCall(req)
  const supabase = createAdminClient()
  
  // Find due sequence steps
  const { data: dueSteps } = await supabase
    .from('contact_sequences')
    .select('*, follow_up_sequences(steps), contacts(*), conversations(*)')
    .eq('status', 'active')
    .lte('next_send_at', new Date().toISOString())
    .limit(100)
  
  for (const step of dueSteps ?? []) {
    const sequence = step.follow_up_sequences
    const steps: SequenceStep[] = sequence.steps
    const currentStep = steps[step.current_step]
    
    if (!currentStep) {
      // Sequence complete
      await supabase.from('contact_sequences').update({ status: 'completed' }).eq('id', step.id)
      continue
    }
    
    // Check 24h window
    const contact = step.contacts
    if (!isWithin24HourWindow(contact.last_user_message_at)) {
      // Cannot send — window expired
      // Mark paused, will retry when contact replies
      await supabase.from('contact_sequences').update({ status: 'paused' }).eq('id', step.id)
      continue
    }
    
    // Send message
    const igAccount = await getWorkspaceIgAccount(supabase, step.workspace_id)
    await igApi.sendDM(contact.ig_user_id, currentStep.message, igAccount.access_token)
    
    // Save as outbound message
    await saveOutboundMessage(supabase, step.conversation_id, currentStep.message)
    
    // Advance to next step or complete
    const nextStep = steps[step.current_step + 1]
    await supabase.from('contact_sequences').update({
      current_step: step.current_step + 1,
      next_send_at: nextStep
        ? new Date(Date.now() + nextStep.delay_hours * 3600000).toISOString()
        : null,
      status: nextStep ? 'active' : 'completed',
    }).eq('id', step.id)
  }
  
  return Response.json({ processed: dueSteps?.length ?? 0 })
}
```

### Campaign Executor (`/api/cron/send-campaigns`)

```typescript
// Already described in 09-campaign-module.md — executeCampaign()
// This cron wrapper:
// 1. Finds campaigns where scheduled_at <= NOW() and status = 'scheduled'
// 2. Also finds running campaigns with pending recipients
// 3. For each: calls executeCampaign() with max 50 sends per cron tick
// 4. Respects per-workspace concurrent campaign limit (1 at a time to avoid rate limits)
```

### Media Insights Sync (`/api/cron/sync-media-insights`)

```typescript
export async function GET(req: NextRequest) {
  verifyInternalCronCall(req)
  const supabase = createAdminClient()
  
  // Fetch insights for posts published in the last 90 days
  const { data: accounts } = await supabase
    .from('instagram_accounts')
    .select('id, access_token, workspace_id')
    .eq('is_active', true)
  
  for (const account of accounts ?? []) {
    const { data: posts } = await supabase
      .from('content_posts')
      .select('id, ig_media_id')
      .eq('ig_account_id', account.id)
      .eq('status', 'published')
      .not('ig_media_id', 'is', null)
      .gte('published_at', new Date(Date.now() - 90 * 86400000).toISOString())
    
    for (const post of posts ?? []) {
      const insights = await igApi.getMediaInsights(post.ig_media_id, account.access_token)
      await supabase.from('ig_media_insights').upsert({
        workspace_id: account.workspace_id,
        ig_account_id: account.id,
        ig_media_id: post.ig_media_id,
        content_post_id: post.id,
        ...insights,
        synced_at: new Date().toISOString(),
      }, { onConflict: 'ig_media_id' })
    }
  }
  
  return Response.json({ done: true })
}
```

### Session Cleanup (`/api/cron/cleanup-sessions`)

```typescript
export async function GET(req: NextRequest) {
  verifyInternalCronCall(req)
  const supabase = createAdminClient()
  const { count } = await supabase
    .from('workspace_sessions')
    .delete()
    .lt('expires_at', new Date().toISOString())
    .select('*', { count: 'exact' })
  return Response.json({ deleted: count })
}
```

---

## 22.4 Database Triggers (Instant Events)

### Lead Temperature on Message (already in 04-database-schema.md)

```sql
CREATE OR REPLACE FUNCTION update_lead_temp_on_message() RETURNS trigger AS $$
DECLARE
  msg_count INTEGER;
BEGIN
  -- Count inbound messages for this contact
  SELECT COUNT(*) INTO msg_count
  FROM messages m
  JOIN conversations c ON c.id = m.conversation_id
  WHERE c.contact_id = (SELECT contact_id FROM conversations WHERE id = NEW.conversation_id)
    AND m.direction = 'inbound';
  
  -- Update lead temperature (never downgrade)
  UPDATE leads SET temperature =
    CASE
      WHEN msg_count >= 8 AND temperature NOT IN ('hot') THEN 'hot'
      WHEN msg_count >= 4 AND temperature NOT IN ('hot', 'warm') THEN 'warm'
      ELSE temperature
    END
  WHERE contact_id = (SELECT contact_id FROM conversations WHERE id = NEW.conversation_id)
    AND workspace_id = NEW.workspace_id;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_lead_temp_on_message
  AFTER INSERT ON messages
  FOR EACH ROW WHEN (NEW.direction = 'inbound')
  EXECUTE FUNCTION update_lead_temp_on_message();
```

### Assignment Notification Trigger

```sql
CREATE OR REPLACE FUNCTION notify_on_assignment() RETURNS trigger AS $$
BEGIN
  IF NEW.assigned_agent_id IS NOT NULL AND NEW.assigned_agent_id IS DISTINCT FROM OLD.assigned_agent_id THEN
    INSERT INTO notifications (workspace_id, user_id, type, title, data)
    VALUES (
      NEW.workspace_id,
      NEW.assigned_agent_id,
      TG_ARGV[0],
      'New ' || TG_ARGV[0] || ' assigned to you',
      jsonb_build_object('id', NEW.id, 'table', TG_TABLE_NAME)
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_conversation_assigned
  AFTER UPDATE OF assigned_agent_id ON conversations
  FOR EACH ROW EXECUTE FUNCTION notify_on_assignment('conversation_assigned');

CREATE TRIGGER trg_lead_assigned
  AFTER UPDATE OF assigned_agent_id ON leads
  FOR EACH ROW EXECUTE FUNCTION notify_on_assignment('lead_assigned');
```

### New Inbound Message Notification

```sql
CREATE OR REPLACE FUNCTION notify_on_new_message() RETURNS trigger AS $$
DECLARE
  conv_assigned_agent UUID;
BEGIN
  SELECT assigned_agent_id INTO conv_assigned_agent
  FROM conversations WHERE id = NEW.conversation_id;
  
  IF conv_assigned_agent IS NOT NULL THEN
    INSERT INTO notifications (workspace_id, user_id, type, title, body, data)
    VALUES (
      NEW.workspace_id, conv_assigned_agent,
      'new_message', 'New message',
      LEFT(NEW.content, 100),
      jsonb_build_object('conversation_id', NEW.conversation_id, 'message_id', NEW.id)
    );
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_notify_new_message
  AFTER INSERT ON messages
  FOR EACH ROW WHEN (NEW.direction = 'inbound')
  EXECUTE FUNCTION notify_on_new_message();
```

### Update contact.last_user_message_at

```sql
CREATE OR REPLACE FUNCTION update_contact_last_message_at() RETURNS trigger AS $$
BEGIN
  UPDATE contacts SET last_user_message_at = NEW.created_at
  FROM conversations c
  WHERE c.id = NEW.conversation_id AND c.contact_id = contacts.id
    AND (contacts.last_user_message_at IS NULL OR NEW.created_at > contacts.last_user_message_at);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_update_contact_last_message
  AFTER INSERT ON messages
  FOR EACH ROW WHEN (NEW.direction = 'inbound')
  EXECUTE FUNCTION update_contact_last_message_at();
```

---

## 22.5 Internal Cron Security

All `/api/cron/...` routes are protected — they only accept requests with the internal cron secret:

```typescript
// lib/cron-auth.ts
export function verifyInternalCronCall(req: NextRequest): void {
  const authHeader = req.headers.get('authorization')
  const secret = process.env.CRON_SECRET
  if (!secret || authHeader !== `Bearer ${secret}`) {
    throw new Error('Unauthorized cron call')
  }
}
```

`CRON_SECRET` must be set in the environment. pg_cron passes it in the Authorization header.

---

## 22.6 Campaign DB Queue Pattern

Campaigns use PostgreSQL as a work queue:

```sql
-- campaign_send_queue: one row per outbound message to be sent
CREATE TABLE public.campaign_send_queue (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id     UUID NOT NULL REFERENCES campaigns ON DELETE CASCADE,
  workspace_id    UUID NOT NULL,
  ig_account_id   UUID NOT NULL,
  contact_id      UUID NOT NULL,
  ig_user_id      VARCHAR(255) NOT NULL,
  message         TEXT NOT NULL,
  status          VARCHAR(20) DEFAULT 'pending',  -- pending|sending|sent|failed
  scheduled_at    TIMESTAMPTZ,
  attempted_at    TIMESTAMPTZ,
  sent_at         TIMESTAMPTZ,
  error_message   TEXT,
  retry_count     INTEGER DEFAULT 0,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_queue_pending ON campaign_send_queue(workspace_id, scheduled_at)
  WHERE status = 'pending';
```

Campaign executor picks up `pending` rows ordered by `scheduled_at`, sends each, and updates status to `sent` or `failed`. Failed rows with `retry_count < 3` are retried in the next cron tick with exponential backoff.
