-- ==========================================
-- 015 — Fixes de auditoria de conexao app<->banco
--
-- Bug 1: access_requests_select_own referenciava
--   auth.users diretamente (subquery p/ pegar o
--   email do usuario logado). authenticated nao tem
--   GRANT em auth.schema -> permission denied ->
--   QUALQUER select nao-admin em access_requests
--   retornava 403. Quebrava a tela AuthGate
--   (usuario aguardando aprovacao nao via o propio
--   status) e o badge realtime do cliente.
--   Fix: usa o claim de email do proprio JWT
--   (auth.jwt() ->> 'email'), sem tocar em auth.users.
--
-- Bug 2: tabela dummy_never criada ad-hoc em sessao
--   anterior (nao consta em nenhuma migration),
--   vazia, com RLS DESABILITADO e grants completos
--   (incluindo TRUNCATE) para anon/authenticated.
--   Fix: drop.
-- ==========================================

DROP TABLE IF EXISTS public.dummy_never;

DROP POLICY IF EXISTS access_requests_select_own ON access_requests;
CREATE POLICY access_requests_select_own
  ON access_requests FOR SELECT TO authenticated
  USING (
    LOWER(email) = LOWER(COALESCE(auth.jwt() ->> 'email', ''))
  );
