-- ============================================
-- 061: Produtos e Parceiros por empresa + vínculo com ações
--
-- 1. products: catálogo de produtos do cliente (workspace)
-- 2. partners: catálogo de parceiros do cliente (workspace)
-- 3. actions.product_id: produto principal da ação (FK)
-- 4. action_partners: parceiros da ação (N:N)
-- 5. RLS por workspace (leitura ws_visible, escrita ws_env_allows_write)
-- 6. Backfill: produtos criados a partir dos valores distintos
--    já preenchidos em actions.product, com as ações vinculadas.
-- ============================================

-- ---------- 1. products ----------
CREATE TABLE IF NOT EXISTS public.products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  category text,
  image_url text,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_products_ws_name ON public.products (workspace_id, name);
CREATE INDEX IF NOT EXISTS products_ws_idx ON public.products (workspace_id);

ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

CREATE POLICY products_select ON public.products
  FOR SELECT USING (ws_visible(auth.uid(), workspace_id));
CREATE POLICY products_insert ON public.products
  FOR INSERT TO authenticated WITH CHECK (ws_env_allows_write(auth.uid(), workspace_id));
CREATE POLICY products_update ON public.products
  FOR UPDATE USING (ws_env_allows_write(auth.uid(), workspace_id))
  WITH CHECK (ws_env_allows_write(auth.uid(), workspace_id));
CREATE POLICY products_delete ON public.products
  FOR DELETE USING (ws_env_allows_write(auth.uid(), workspace_id));

-- ---------- 2. partners ----------
CREATE TABLE IF NOT EXISTS public.partners (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  name text NOT NULL,
  type text NOT NULL DEFAULT 'outro',
  contact_name text,
  contact_email text,
  logo_url text,
  notes text,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_partners_ws_name ON public.partners (workspace_id, name);
CREATE INDEX IF NOT EXISTS partners_ws_idx ON public.partners (workspace_id);

ALTER TABLE public.partners ENABLE ROW LEVEL SECURITY;

CREATE POLICY partners_select ON public.partners
  FOR SELECT USING (ws_visible(auth.uid(), workspace_id));
CREATE POLICY partners_insert ON public.partners
  FOR INSERT TO authenticated WITH CHECK (ws_env_allows_write(auth.uid(), workspace_id));
CREATE POLICY partners_update ON public.partners
  FOR UPDATE USING (ws_env_allows_write(auth.uid(), workspace_id))
  WITH CHECK (ws_env_allows_write(auth.uid(), workspace_id));
CREATE POLICY partners_delete ON public.partners
  FOR DELETE USING (ws_env_allows_write(auth.uid(), workspace_id));

-- ---------- 3. action_partners (N:N) ----------
CREATE TABLE IF NOT EXISTS public.action_partners (
  action_id uuid NOT NULL REFERENCES public.actions(id) ON DELETE CASCADE,
  partner_id uuid NOT NULL REFERENCES public.partners(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (action_id, partner_id)
);

CREATE INDEX IF NOT EXISTS action_partners_partner_idx ON public.action_partners (partner_id);

ALTER TABLE public.action_partners ENABLE ROW LEVEL SECURITY;

CREATE POLICY action_partners_select ON public.action_partners
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.actions a
      WHERE a.id = action_id AND ws_visible(auth.uid(), a.workspace_id)
    )
  );
CREATE POLICY action_partners_insert ON public.action_partners
  FOR INSERT TO authenticated WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.actions a
      WHERE a.id = action_id AND ws_env_allows_write(auth.uid(), a.workspace_id)
    )
  );
CREATE POLICY action_partners_delete ON public.action_partners
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.actions a
      WHERE a.id = action_id AND ws_env_allows_write(auth.uid(), a.workspace_id)
    )
  );

-- ---------- 4. actions.product_id ----------
ALTER TABLE public.actions ADD COLUMN IF NOT EXISTS product_id uuid REFERENCES public.products(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS actions_product_id_idx ON public.actions (product_id);

-- ---------- 5. triggers de updated_at ----------
DROP TRIGGER IF EXISTS trg_products_updated ON public.products;
CREATE TRIGGER trg_products_updated BEFORE UPDATE ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

DROP TRIGGER IF EXISTS trg_partners_updated ON public.partners;
CREATE TRIGGER trg_partners_updated BEFORE UPDATE ON public.partners
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- ---------- 6. Backfill: produtos a partir das ações existentes ----------
INSERT INTO public.products (workspace_id, name)
SELECT DISTINCT a.workspace_id, btrim(a.product)
FROM public.actions a
WHERE a.product IS NOT NULL AND btrim(a.product) <> ''
ON CONFLICT DO NOTHING;

UPDATE public.actions a
SET product_id = p.id
FROM public.products p
WHERE p.workspace_id = a.workspace_id
  AND lower(btrim(p.name)) = lower(btrim(a.product))
  AND a.product_id IS NULL;
