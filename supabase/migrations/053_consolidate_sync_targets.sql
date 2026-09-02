-- ============================================
-- 053: Consolidação de destinos de sincronização
--
-- Todas as integrações da conta grupo.oracullo@gmail.com passam
-- a resolver para os MESMOS calendários dedicados por ambiente
-- (o par já em uso pela integração DILATI). Com destinos idênticos,
-- o dedupe do worker (conta+calendário) colapsa o fan-out para
-- 1 evento por ação — fim das duplicatas na visão do Google Calendar.
-- ============================================

UPDATE calendar_integrations
SET sync_mode = 'split',
    env_calendar_ids = '{
      "sharks_company": "fd1777df9f54911db133ea89af716d66bcf2fbd3a14ed9fddd5168e7e7edcbc0@group.calendar.google.com",
      "estrategos": "526b5f93a1189f2d3c6763d9c1ca866daef4e6fb8c379129eb19ceff62ca220d@group.calendar.google.com"
    }'::jsonb
WHERE id IN (
  '47fe93ba-fe71-4745-ada9-04d96957c966',
  '7cacb93c-3a16-4680-bbe0-dbe6d6d013db'
);
