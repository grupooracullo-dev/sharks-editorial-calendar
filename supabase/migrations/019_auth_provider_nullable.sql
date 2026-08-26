-- ==========================================
-- 019 — access_requests.auth_provider anulavel
-- Alem do DEFAULT 'email' (removido na 018),
-- a coluna tinha NOT NULL no banco — nenhum
-- dos dois constava na migration 012 (que a
-- criou sem default e sem not null; CHECK so
-- aceita NULL ou 'google'). Com NOT NULL, o
-- INSERT classico (sem auth_provider) gerava
-- NULL e violava not-null; com o default,
-- violava o CHECK. Duplo bloqueio do fluxo
-- de senha desde a 012.
--
-- Fix: DROP NOT NULL — fluxo classico grava
-- NULL (valido), fluxo Google grava 'google'.
-- ==========================================

ALTER TABLE access_requests
  ALTER COLUMN auth_provider DROP NOT NULL;
