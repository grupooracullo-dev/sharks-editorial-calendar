-- ============================================
-- 041_drop_unused_view.sql
-- Remove segunda view morta apontada pelo security advisor (ERROR):
--   public.v_user_companies -> SECURITY DEFINER sem RLS (migration 030).
-- Sem consumo no frontend nem no banco (dependencia apenas interna).
-- ============================================

DROP VIEW IF EXISTS public.v_user_companies;
