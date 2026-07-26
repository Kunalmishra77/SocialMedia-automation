-- ============================================================
-- 0008_commerce.sql — product catalog + orders. Idempotent.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.catalog_products (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  UUID NOT NULL REFERENCES public.workspaces ON DELETE CASCADE,
  external_id   VARCHAR(255),
  name          TEXT NOT NULL,
  description   TEXT,
  price         DECIMAL(12,2),
  currency      VARCHAR(3) DEFAULT 'INR',
  image_url     TEXT,
  product_url   TEXT,
  sku           VARCHAR(100),
  in_stock      BOOLEAN DEFAULT true,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_products_ws ON public.catalog_products(workspace_id);

CREATE TABLE IF NOT EXISTS public.orders (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  UUID NOT NULL REFERENCES public.workspaces ON DELETE CASCADE,
  contact_id    UUID REFERENCES public.contacts ON DELETE SET NULL,
  external_id   VARCHAR(255),
  order_number  VARCHAR(100),
  total         DECIMAL(12,2),
  currency      VARCHAR(3) DEFAULT 'INR',
  status        VARCHAR(30) DEFAULT 'pending',
  items         JSONB DEFAULT '[]',
  placed_at     TIMESTAMPTZ,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_orders_ws ON public.orders(workspace_id);

ALTER TABLE public.catalog_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders           ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS products_member ON public.catalog_products;
CREATE POLICY products_member ON public.catalog_products FOR SELECT USING (public.is_workspace_member(workspace_id));
DROP POLICY IF EXISTS orders_member ON public.orders;
CREATE POLICY orders_member ON public.orders FOR SELECT USING (public.is_workspace_member(workspace_id));
