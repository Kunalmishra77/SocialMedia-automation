# 15 — Meta Advertising Integration

**Priority:** Phase 5 (Pro+ plan)

## 15.1 Overview

Meta Ads and Instagram organic engagement are deeply connected: ads drive DMs, story mentions, and comment engagements. This module surfaces ad performance data alongside organic engagement data, syncs leads from Meta Lead Forms, and provides a unified view of paid + organic ROI.

**What this module does:**
- Display Meta Ads campaigns running for connected Instagram accounts
- Sync leads from Meta Ads Lead Forms into the CRM
- Track ad-to-DM conversion (user sees ad → sends DM → tracked)
- Compare ad ROI with organic campaign ROI
- Surface AI recommendations for campaign optimization

**What this module does NOT do (reserved for dedicated ad management tools):**
- Create or modify Meta Ad campaigns (use Meta Ads Manager for that)
- Manage ad creative, targeting, or budgets directly

---

## 15.2 Meta Ads Lead Form Sync

Meta Lead Ads collect contact info directly in the ad without leaving Instagram. These leads must be pulled and synced to the CRM.

### Webhook Approach (Real-time)

Meta sends a webhook event when a new lead is submitted on a Lead Form:

```typescript
// In handleMessagingEvent or a separate handler:
async function handleLeadGenEvent(supabase, workspace, change) {
  const { form_id, lead_id, created_time } = change.value
  
  // Fetch lead details from Meta
  const leadRes = await fetch(
    `https://graph.facebook.com/v21.0/${lead_id}?fields=field_data,created_time&access_token=${access_token}`
  )
  const leadData = await leadRes.json()
  
  // Parse field_data: [{ name: 'email', values: ['test@example.com'] }, ...]
  const fields: Record<string, string> = {}
  for (const field of leadData.field_data) {
    fields[field.name] = field.values[0]
  }
  
  // Upsert meta_ads_leads record
  const { data: adLead } = await supabase.from('meta_ads_leads').upsert({
    workspace_id: workspace.id,
    ig_account_id: workspace.ig_account_id,
    form_id,
    lead_id,
    field_data: fields,
    created_time,
    synced_at: new Date().toISOString(),
  }, { onConflict: 'lead_id' }).select().single()
  
  // Create or update contact
  const contact = await upsertContactFromAdLead(supabase, workspace, fields, adLead.id)
  
  // Create lead in CRM
  await supabase.from('leads').insert({
    workspace_id: workspace.id,
    contact_id: contact.id,
    title: `Lead Ad: ${fields.full_name || fields.email || 'Unknown'}`,
    stage: 'new',
    source: 'lead_ad',
    custom_fields: fields,
  })
  
  // Trigger workflow if configured
  await processWorkflowForEvent(supabase, {
    workspaceId: workspace.id,
    type: 'lead_created',
    contactId: contact.id,
    data: { source: 'lead_ad', form_id },
  })
}
```

### Polling Fallback (Batch Sync)

```typescript
// app/api/cron/sync-ad-leads/route.ts
// Runs every 15 minutes as a fallback for missed webhooks
// Fetches leads created in the last 30 minutes from all active lead forms
```

---

## 15.3 Ad Performance Dashboard

```typescript
// GET /api/ads/performance?from=&to=&igAccountId=
// Data fetched from Meta Marketing API

interface AdPerformance {
  campaigns: [{
    meta_campaign_id: string,
    name: string,
    status: string,    // ACTIVE|PAUSED|ARCHIVED
    objective: string, // LEAD_GENERATION|MESSAGES|TRAFFIC|...
    daily_budget: number,
    lifetime_spend: number,
    impressions: number,
    reach: number,
    clicks: number,
    cpc: number,       // cost per click
    cpm: number,       // cost per thousand impressions
    ctr: number,       // click-through rate
    leads: number,     // leads generated (for lead gen objective)
    cpl: number,       // cost per lead
    messages_started: number,  // for click-to-DM campaigns
    cost_per_message: number,
    roas: number | null,  // return on ad spend (if conversion tracking set up)
  }]
  
  summary: {
    total_spend: number,
    total_leads: number,
    avg_cpl: number,
    total_messages_started: number,
    avg_cost_per_message: number,
    leads_synced_to_crm: number,
    leads_converted: number,
    conversion_rate: number,
  }
}
```

**Note:** Meta Marketing API requires separate `ads_read` permission scope.

---

## 15.4 Click-to-DM Attribution

When users click a "Send Message" Instagram ad, they're taken directly to a DM with the business. The referral source is captured in the webhook payload:

```typescript
// In webhook handler — messaging.referral contains ad source:
if (messaging.referral?.source === 'AD') {
  const { ref, ad_id, adset_id, campaign_id } = messaging.referral
  
  // Tag the contact with ad source
  await supabase.from('contacts').update({
    source: 'ad_click',
    custom_fields: { ...contact.custom_fields, meta_ad_id: ad_id, meta_campaign_id: campaign_id }
  }).eq('id', contact.id)
  
  // Log attribution
  await supabase.from('link_clicks').insert({
    workspace_id, contact_id: contact.id,
    source: 'ad_click',
    campaign_id: ad_id,
  })
}
```

---

## 15.5 Ad-to-Lead Funnel

```
Meta Ads Campaign
      ↓
User clicks "Send Message" → DM opened (click_to_dm attribution)
OR
User submits Lead Form → lead synced to CRM
      ↓
AI auto-replies / agent handles
      ↓
Lead created in CRM (source = 'lead_ad' or 'ad_click')
      ↓
Lead moves through pipeline
      ↓
Conversion: Lead stage = 'converted' + order created
      ↓
ROI = (order_value - ad_spend_attributed) / ad_spend_attributed
```

Attribution model: First-touch (the ad that drove the initial contact).

---

## 15.6 Creative Performance

Surface top-performing ad creatives alongside organic content:

```typescript
// GET /api/ads/creatives?campaignId=&from=&to=
[{
  ad_id: string,
  ad_name: string,
  creative_type: 'IMAGE' | 'VIDEO' | 'CAROUSEL',
  thumbnail_url: string,
  ctr: number,
  cpm: number,
  cpc: number,
  leads: number,
  messages_started: number,
  spend: number,
}]
// Sorted by CTR DESC
```

**AI Creative Recommendation:**
```typescript
// POST /api/ads/optimize-recommendation
// Analyzes which creative elements correlate with high performance
// Returns: { recommendation: string, supporting_data: {...} }
// Example: "Video ads with product demos generate 3× more leads than image ads. 
//           Consider creating more demo videos."
```

---

## 15.7 Audience Overlap Analysis

```typescript
// GET /api/ads/audience-overlap
// Compares Meta Ads audience with existing CRM contacts

{
  totalAdAudience: N,        // Meta estimated reach
  existingContacts: N,        // CRM contacts that could be targeted
  newProspects: N,            // Ad audience not yet in CRM (est.)
  retargetable: N,            // CRM contacts with Facebook/IG matched
  
  recommendations: [
    "Your 'warm leads' tag has 234 contacts — create a Custom Audience to retarget them",
    "87% of your converted customers are in the 25-34 age group — test targeting this segment",
  ]
}
```

---

## 15.8 Budget ROI Report

Monthly report combining organic engagement costs and ad spend:

| Channel | Spend | Leads | CPL | Conversions | Revenue | ROAS |
|---------|-------|-------|-----|-------------|---------|------|
| Meta Ads | ₹50,000 | 200 | ₹250 | 12 | ₹1,20,000 | 2.4× |
| Influencer | ₹30,000 | 85 | ₹353 | 8 | ₹80,000 | 2.7× |
| Organic DMs | ₹0 | 150 | ₹0 | 10 | ₹1,00,000 | ∞ |
| Total | ₹80,000 | 435 | ₹184 | 30 | ₹3,00,000 | 3.75× |
