-- ============================================
-- 057: Padroniza os pilares da linha editorial (rebuild)
--
-- Padrao (6 pilares, soma 100%):
--   1. Marca & Essencia            20%  #0066FF
--   2. Autoridade & Educacao       25%  #7C3AED
--   3. Produto & Solucao           20%  #059669
--   4. Prova & Confianca           15%  #D97706
--   5. Relacionamento & Comunidade 10%  #EC4899
--   6. Oferta & Conversao          10%  #EF4444
--
-- 1. Acoes marcadas com pilares fora do padrao sao reapontadas
--    para o pilar padrao da MESMA posicao (por sort_order antigo)
-- 2. Todos os pilares sao reconstruidos no padrao (por workspace)
-- 3. distribution dos perfis e recalculado (id -> percentage)
-- ============================================

-- 1. Re-point das acoes: pilar fora do padrao -> pilar padrao da mesma posicao
WITH oldp AS (
  SELECT p.id AS old_id, p.workspace_id, p.sort_order AS old_pos
  FROM editorial_pillars p
  WHERE p.name NOT IN (
    'Marca & Essência', 'Autoridade & Educação', 'Produto & Solução',
    'Prova & Confiança', 'Relacionamento & Comunidade', 'Oferta & Conversão'
  )
),
pattern AS (
  VALUES
    (1, 'Marca & Essência'),
    (2, 'Autoridade & Educação'),
    (3, 'Produto & Solução'),
    (4, 'Prova & Confiança'),
    (5, 'Relacionamento & Comunidade'),
    (6, 'Oferta & Conversão')
),
newm AS (
  SELECT p.id AS new_id, p.workspace_id, pat.pos
  FROM editorial_pillars p
  JOIN (SELECT * FROM pattern) AS pat(pos, name) ON pat.name = p.name
)
UPDATE actions a
SET editorial_pillar_id = nm.new_id
FROM oldp o
JOIN newm nm ON nm.workspace_id = o.workspace_id AND nm.pos = o.old_pos
WHERE a.editorial_pillar_id = o.old_id;

-- 2. Rebuild: apaga tudo e recria o padrao por workspace
DELETE FROM editorial_pillars;

INSERT INTO editorial_pillars (workspace_id, name, description, color, percentage, sort_order)
SELECT w.id, m.name, m.description, m.color, m.percentage, m.sort_order
FROM workspaces w
CROSS JOIN (VALUES
  ('Marca & Essência', 'Conteúdo sobre a marca, valores e cultura', '#0066FF', 20, 1),
  ('Autoridade & Educação', 'Conteúdo educativo e de autoridade', '#7C3AED', 25, 2),
  ('Produto & Solução', 'Apresentação de produtos e serviços', '#059669', 20, 3),
  ('Prova & Confiança', 'Depoimentos, cases e prova social', '#D97706', 15, 4),
  ('Relacionamento & Comunidade', 'Engajamento e comunidade', '#EC4899', 10, 5),
  ('Oferta & Conversão', 'Ofertas e conversão de vendas', '#EF4444', 10, 6)
) AS m(name, description, color, percentage, sort_order);

-- 3. distribution dos perfis alinhado aos pilares recriados
UPDATE editorial_profiles ep
SET distribution = sub.d
FROM (
  SELECT p.workspace_id, jsonb_object_agg(p.id::text, p.percentage) AS d
  FROM editorial_pillars p
  GROUP BY p.workspace_id
) sub
WHERE ep.workspace_id = sub.workspace_id;
