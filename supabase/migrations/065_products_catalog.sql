-- ============================================
-- 065: Catálogo de produtos por ambiente + vínculos N:N
--
-- 1. environment_products: catálogo da agência por ambiente
--    (ex.: Plano de marketing estratégico, Diagnóstico, Tráfego pago).
--    Sharks Company e Estrategos têm catálogos independentes.
-- 2. crm_lead_products: interesse do lead (N:N lead ↔ catálogo do ambiente).
-- 3. action_products: ação ↔ produtos do cliente (N:N, padrão action_partners).
-- 4. Backfill: actions.product_id existente vira linha em action_products;
--    a coluna antiga permanece, sincronizada com o 1º produto (compatibilidade).
-- ============================================

-- ---------- 1. environment_products ----------
CREATE TABLE IF NOT EXISTS public.environment_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  environment public.environment_type NOT NULL,
  name text NOT NULL,
  description text,
  category text,
  status text NOT NULL DEFAULT 'active',
  created_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_env_products_env_name ON public.environment_products (environment, name);
CREATE INDEX IF NOT EXISTS env_products_env_idx ON public.environment_products (environment);

ALTER TABLE public.environment_products ENABLE ROW LEVEL SECURITY;

CREATE POLICY environment_products_select ON public.environment_products
  FOR SELECT USING (is_env_staff((select auth.uid()), environment));
CREATE POLICY environment_products_insert ON public.environment_products
  FOR INSERT TO authenticated WITH CHECK (is_env_staff((select auth.uid()), environment));
CREATE POLICY environment_products_update ON public.environment_products
  FOR UPDATE USING (is_env_staff((select auth.uid()), environment))
  WITH CHECK (is_env_staff((select auth.uid()), environment));
CREATE POLICY environment_products_delete ON public.environment_products
  FOR DELETE USING (is_env_admin((select auth.uid()), environment));

-- ---------- 2. crm_lead_products ----------
CREATE TABLE IF NOT EXISTS public.crm_lead_products (
  lead_id uuid NOT NULL REFERENCES public.crm_leads(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.environment_products(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (lead_id, product_id)
);

CREATE INDEX IF NOT EXISTS crm_lead_products_product_idx ON public.crm_lead_products (product_id);

ALTER TABLE public.crm_lead_products ENABLE ROW LEVEL SECURITY;

CREATE POLICY crm_lead_products_select ON public.crm_lead_products
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.crm_leads l
      WHERE l.id = lead_id AND is_env_staff((select auth.uid()), l.environment)
    )
  );
CREATE POLICY crm_lead_products_insert ON public.crm_lead_products
  FOR INSERT TO authenticated WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.crm_leads l
      WHERE l.id = lead_id AND is_env_staff((select auth.uid()), l.environment)
    )
  );
CREATE POLICY crm_lead_products_delete ON public.crm_lead_products
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.crm_leads l
      WHERE l.id = lead_id AND is_env_staff((select auth.uid()), l.environment)
    )
  );

-- ---------- 3. action_products ----------
CREATE TABLE IF NOT EXISTS public.action_products (
  action_id uuid NOT NULL REFERENCES public.actions(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (action_id, product_id)
);

CREATE INDEX IF NOT EXISTS action_products_product_idx ON public.action_products (product_id);

ALTER TABLE public.action_products ENABLE ROW LEVEL SECURITY;

CREATE POLICY action_products_select ON public.action_products
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.actions a
      WHERE a.id = action_id AND ws_visible(auth.uid(), a.workspace_id)
    )
  );
CREATE POLICY action_products_insert ON public.action_products
  FOR INSERT TO authenticated WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.actions a
      WHERE a.id = action_id AND ws_env_allows_write(auth.uid(), a.workspace_id)
    )
  );
CREATE POLICY action_products_delete ON public.action_products
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.actions a
      WHERE a.id = action_id AND ws_env_allows_write(auth.uid(), a.workspace_id)
    )
  );

-- ---------- 4. Backfill do vínculo único existente ----------
INSERT INTO public.action_products (action_id, product_id)
SELECT id, product_id
FROM public.actions
WHERE product_id IS NOT NULL
ON CONFLICT DO NOTHING;

-- ---------- 5. Trigger updated_at ----------
DROP TRIGGER IF EXISTS trg_env_products_updated ON public.environment_products;
CREATE TRIGGER trg_env_products_updated BEFORE UPDATE ON public.environment_products
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- ---------- 6. Realtime ----------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'environment_products'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.environment_products;
  END IF;
END $$;
