# 14 — Commerce Features (Instagram Shopping)

**Priority:** Phase 5 (Enterprise plan)

## 14.1 Overview

Instagram Shopping allows businesses to tag products in posts, stories, and reels, and accept purchases directly through Instagram. This module integrates the platform with Instagram Shopping to:
- Display product catalog in the inbox for easy sharing
- Track which products are being asked about in DMs
- Sync orders from Shopping
- Track purchase conversions from DM conversations

**Prerequisites:**
- Business must have Meta Commerce Manager set up
- Must have a product catalog in Meta Business Manager
- Must have Instagram Shopping enabled on their account

---

## 14.2 Product Catalog

### Catalog Sync

```typescript
// POST /api/commerce/sync-catalog
// Fetches all products from the connected Meta catalog

export async function syncProductCatalog(workspaceId: string, igAccountId: string): Promise<void> {
  const supabase = createAdminClient()
  const account = await getIgAccount(supabase, igAccountId)
  
  // Get catalog ID from workspace settings
  const catalogId = account.catalog_id
  if (!catalogId) throw new Error('No catalog connected')
  
  // Fetch all products (paginated)
  let cursor: string | undefined
  do {
    const res = await fetch(
      `https://graph.facebook.com/v21.0/${catalogId}/products` +
      `?fields=id,name,description,price,currency,image_url,availability,url` +
      `&limit=200${cursor ? `&after=${cursor}` : ''}` +
      `&access_token=${account.access_token}`
    )
    const data = await res.json()
    
    // Upsert products
    await supabase.from('catalog_products').upsert(
      data.data.map((p: any) => ({
        workspace_id: workspaceId,
        ig_account_id: igAccountId,
        catalog_id: catalogId,
        meta_product_id: p.id,
        name: p.name,
        description: p.description,
        price: parseFloat(p.price),
        currency: p.currency,
        image_url: p.image_url,
        availability: p.availability,
        url: p.url,
      })),
      { onConflict: 'meta_product_id' }
    )
    
    cursor = data.paging?.cursors?.after
  } while (cursor && data.data.length > 0)
}
```

### Catalog Table

```sql
CREATE TABLE public.catalog_products (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id     UUID NOT NULL REFERENCES workspaces ON DELETE CASCADE,
  ig_account_id    UUID REFERENCES instagram_accounts,
  catalog_id       VARCHAR(255),
  meta_product_id  VARCHAR(255) UNIQUE,
  retailer_id      VARCHAR(255),
  name             TEXT NOT NULL,
  description      TEXT,
  price            DECIMAL(10,2),
  currency         VARCHAR(3) DEFAULT 'INR',
  image_url        TEXT,
  availability     TEXT,  -- in stock|out of stock|preorder
  url              TEXT,
  category         TEXT,
  brand            TEXT,
  is_active        BOOLEAN DEFAULT true,
  synced_at        TIMESTAMPTZ DEFAULT NOW(),
  created_at       TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_catalog_workspace ON catalog_products(workspace_id);
CREATE INDEX idx_catalog_name_fts ON catalog_products USING GIN(to_tsvector('english', name));
```

---

## 14.3 Product Sharing in DMs

When an agent is replying to a customer asking about products, they can share products directly from the inbox:

**Product picker:** Agent clicks "Share Product" in MessageInput → search by name → select product → sends Instagram Shopping card message

```typescript
// Send product via DM
POST /api/messages/send
{
  conversationId,
  type: 'generic_template',  // Instagram generic template = product card
  template: {
    template_type: 'generic',
    elements: [{
      title: product.name,
      image_url: product.image_url,
      subtitle: `₹${product.price}`,
      default_action: { type: 'web_url', url: product.url },
      buttons: [{ type: 'web_url', url: product.url, title: 'Shop Now' }]
    }]
  }
}
```

---

## 14.4 Product Detection in DMs

AI pipeline automatically detects when a contact is asking about a specific product:

```typescript
// In webhook handler
async function detectProductMention(
  message: string,
  workspaceId: string
): Promise<CatalogProduct | null> {
  
  // First: keyword match on product names (fast)
  const products = await supabase.from('catalog_products')
    .select('id, name, price, image_url, url')
    .eq('workspace_id', workspaceId)
    .eq('is_active', true)
  
  const messageLower = message.toLowerCase()
  const match = products.data?.find(p =>
    messageLower.includes(p.name.toLowerCase())
  )
  if (match) return match
  
  // Second: semantic search (pgvector on product names + descriptions)
  // [similar to KB search]
  return null
}
```

If a product is detected, the AI reply context includes the product's price, availability, and URL.

---

## 14.5 Order Tracking Integration

Sync orders from external systems (Shopify, WooCommerce, custom) and link them to DM contacts:

```sql
CREATE TABLE public.orders (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id      UUID NOT NULL REFERENCES workspaces ON DELETE CASCADE,
  contact_id        UUID REFERENCES contacts,
  conversation_id   UUID REFERENCES conversations,
  
  -- External order data
  order_ref         TEXT UNIQUE,
  external_order_id TEXT,
  source            TEXT,           -- shopify|woocommerce|manual|ig_shop
  
  -- Status
  status            VARCHAR(30) DEFAULT 'pending',
  -- pending|confirmed|processing|shipped|out_for_delivery|delivered|cancelled|refunded
  
  -- Details
  customer_name     TEXT,
  items_summary     TEXT,
  total_amount      DECIMAL(10,2),
  currency          VARCHAR(3) DEFAULT 'INR',
  shipping_address  JSONB,
  
  -- Tracking
  tracking_number   TEXT,
  tracking_url      TEXT,
  carrier           TEXT,
  expected_at       TIMESTAMPTZ,
  delivered_at      TIMESTAMPTZ,
  
  -- Meta
  notes             TEXT,
  raw_data          JSONB DEFAULT '{}',
  
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);
```

**Order status detection in DMs:**

When a contact sends a message containing "order", "tracking", "delivery", "shipped", etc., the AI checks if they have an associated order and includes the status in the reply context:

```typescript
if (mentionsOrder) {
  const order = await findOrderForContact(contact.id)
  if (order) {
    systemPromptAddition = `\n[ORDER STATUS] Order ${order.order_ref}: ${order.status}. ${order.tracking_number ? `Tracking: ${order.tracking_number}` : ''}`
  }
}
```

---

## 14.6 Purchase Tracking & Attribution

Link DM conversations to purchases to measure conversation-to-conversion rate:

```sql
CREATE TABLE public.purchase_attributions (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id     UUID NOT NULL REFERENCES workspaces ON DELETE CASCADE,
  contact_id       UUID REFERENCES contacts,
  conversation_id  UUID REFERENCES conversations,
  lead_id          UUID REFERENCES leads,
  order_id         UUID REFERENCES orders,
  amount           DECIMAL(10,2),
  currency         VARCHAR(3),
  channel          TEXT,  -- dm|comment|campaign|story
  attributed_at    TIMESTAMPTZ DEFAULT NOW()
);
```

**Analytics view:** Revenue attributed to DM conversations vs organic Instagram traffic.

---

## 14.7 Instagram Shopping Analytics

```typescript
// GET /api/analytics/commerce
{
  totalRevenue: number,
  ordersCreated: number,
  avgOrderValue: number,
  conversionRate: number,        // DM → order
  topProducts: [{ name, quantity_sold, revenue }],
  revenueByChannel: { dm, campaign, comment, story },
  orderStatusBreakdown: { pending, shipped, delivered, cancelled },
  revenueByMonth: [{ month, revenue }],
}
```

---

## 14.8 Abandoned Cart Detection

If the workspace integrates with Shopify/WooCommerce, the platform can receive abandoned cart events and trigger a re-engagement DM:

```typescript
// POST /api/webhooks/abandoned-cart
// Body: { ig_user_id, cart_items, cart_url, contact_email }

// If contact has an active 24h window:
// → Send DM: "Hey! Looks like you left something behind 😊 Your cart is waiting: [link]"
// If window expired: enroll in re-engagement sequence
```
