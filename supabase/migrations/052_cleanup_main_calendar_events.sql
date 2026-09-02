-- ============================================
-- 052: Limpeza pré-consolidação de calendários
--
-- As integrações 47fe93ba (pessoal global, Grupo Oracullo) e
-- 7cacb93c (PB&RN workspace) estavam em modo unified, criando
-- eventos no calendário PRINCIPAL (grupo.oracullo@gmail.com).
-- Com a consolidação para os calendários dedicados por ambiente,
-- esses eventos ficarariam órfãos: enfileiramos o delete de cada
-- um (via caminho de delete embutido do worker) e removemos os
-- links correspondentes.
--
-- ATENÇÃO: aplicar ANTES da migração 053 (que muda o destino
-- das integrações — o delete precisa do destino antigo).
-- ============================================

INSERT INTO calendar_sync_queue (workspace_id, operation, google_event_id, integration_id)
SELECT l.workspace_id, 'delete', l.google_event_id, l.integration_id
FROM calendar_event_links l
WHERE l.integration_id IN (
    '47fe93ba-fe71-4745-ada9-04d96957c966',
    '7cacb93c-3a16-4680-bbe0-dbe6d6d013db'
  )
  AND l.google_event_id IS NOT NULL;

DELETE FROM calendar_event_links
WHERE integration_id IN (
  '47fe93ba-fe71-4745-ada9-04d96957c966',
  '7cacb93c-3a16-4680-bbe0-dbe6d6d013db'
);
