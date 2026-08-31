-- ============================================
-- 040_drop_unused_view.sql
-- Remove view morta apontada pelo security advisor (ERROR):
--   public.actions_by_environment -> SECURITY DEFINER sem RLS.
-- Sem consumo no frontend nem no banco (dependencias apenas internas).
-- ============================================

DROP VIEW IF EXISTS public.actions_by_environment;
