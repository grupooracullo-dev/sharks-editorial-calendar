-- ==========================================
-- FIX: Re-seed completo com UTF-8 correto
-- Executado lendo este arquivo em bytes (nunca texto inline no console)
-- ==========================================
BEGIN;

DELETE FROM chat_messages;
DELETE FROM chat_threads;
DELETE FROM audit_logs;
DELETE FROM notifications;
DELETE FROM calendar_integrations;
DELETE FROM actions;
DELETE FROM strategic_dates;
DELETE FROM calendar_templates;
DELETE FROM channels;
DELETE FROM campaigns;
DELETE FROM editorial_profiles;
DELETE FROM editorial_pillars;
DELETE FROM memberships;
DELETE FROM workspaces;
DELETE FROM organizations;

INSERT INTO organizations (id, name) VALUES ('00000000-0000-0000-0000-000000000001', 'Sharks Company');

INSERT INTO workspaces (id, organization_id, name, slug, segment, city, state, country) VALUES
('00000000-0000-0000-0000-000000000100', '00000000-0000-0000-0000-000000000001', 'PB & RN Foods', 'pb-rn-foods', 'Alimentação', 'São Paulo', 'SP', 'Brasil'),
('00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000001', 'TechStart Solutions', 'techstart-solutions', 'Tecnologia', 'Campinas', 'SP', 'Brasil'),
('00000000-0000-0000-0000-000000000102', '00000000-0000-0000-0000-000000000001', 'Studio Fitness Pro', 'studio-fitness-pro', 'Fitness', 'Rio de Janeiro', 'RJ', 'Brasil');

INSERT INTO editorial_pillars (id, workspace_id, name, description, color, percentage, sort_order) VALUES
('00000000-0000-0000-0000-000000001001','00000000-0000-0000-0000-000000000100','Marca & Essência','Conteúdo sobre a marca, valores e cultura','#0066FF',20,1),
('00000000-0000-0000-0000-000000001002','00000000-0000-0000-0000-000000000100','Autoridade & Educação','Conteúdo educativo e de autoridade','#7C3AED',25,2),
('00000000-0000-0000-0000-000000001003','00000000-0000-0000-0000-000000000100','Produto & Solução','Apresentação de produtos e serviços','#059669',20,3),
('00000000-0000-0000-0000-000000001004','00000000-0000-0000-0000-000000000100','Prova & Confiança','Depoimentos, cases e prova social','#D97706',15,4),
('00000000-0000-0000-0000-000000001005','00000000-0000-0000-0000-000000000100','Relacionamento & Comunidade','Engajamento e comunidade','#EC4899',10,5),
('00000000-0000-0000-0000-000000001006','00000000-0000-0000-0000-000000000100','Oferta & Conversão','Ofertas e conversão de vendas','#EF4444',10,6),
('00000000-0000-0000-0000-000000001101','00000000-0000-0000-0000-000000000101','Inovação & Tecnologia','Novidades e tendências tech','#0066FF',30,1),
('00000000-0000-0000-0000-000000001102','00000000-0000-0000-0000-000000000101','Cases & Resultados','Sucessos de clientes','#059669',25,2),
('00000000-0000-0000-0000-000000001103','00000000-0000-0000-0000-000000000101','Educação Digital','Tutoriais e dicas','#7C3AED',25,3),
('00000000-0000-0000-0000-000000001104','00000000-0000-0000-0000-000000000101','Cultura & Time','Bastidores e equipe','#EC4899',20,4),
('00000000-0000-0000-0000-000000001201','00000000-0000-0000-0000-000000000102','Treinos & Exercícios','Conteúdo de treino','#0066FF',30,1),
('00000000-0000-0000-0000-000000001202','00000000-0000-0000-0000-000000000102','Nutrição & Bem-estar','Dicas de saúde','#059669',25,2),
('00000000-0000-0000-0000-000000001203','00000000-0000-0000-0000-000000000102','Alunos & Transformações','Resultados de alunos','#D97706',25,3),
('00000000-0000-0000-0000-000000001204','00000000-0000-0000-0000-000000000102','Estrutura & Diferenciais','O studio e sua estrutura','#7C3AED',20,4);

INSERT INTO editorial_profiles (id, workspace_id, frequency_per_week, allowed_days, preferred_times, priority_formats, distribution, priority_objectives, priority_products, target_audience, restrictions, max_weekly) VALUES
('00000000-0000-0000-0000-000000000200','00000000-0000-0000-0000-000000000100',5,'{1,2,3,4,5}','{09:00,14:00,18:00}','{reels,carousel,story}','{"00000000-0000-0000-0000-000000001001": 20, "00000000-0000-0000-0000-000000001002": 25, "00000000-0000-0000-0000-000000001003": 20, "00000000-0000-0000-0000-000000001004": 15, "00000000-0000-0000-0000-000000001005": 10, "00000000-0000-0000-0000-000000001006": 10}','{educational,engagement,sale_conversion,social_proof}','{}','Famílias de classe média interessadas em alimentação saudável e prática','Não publicar ofertas aos domingos',7),
('00000000-0000-0000-0000-000000000201','00000000-0000-0000-0000-000000000101',3,'{1,3,5}','{09:00,14:00,18:00}','{carousel,reels}','{"00000000-0000-0000-0000-000000001101": 30, "00000000-0000-0000-0000-000000001102": 25, "00000000-0000-0000-0000-000000001103": 25, "00000000-0000-0000-0000-000000001104": 20}','{authority,educational}','{}','Empresas que buscam transformação digital',NULL,5),
('00000000-0000-0000-0000-000000000202','00000000-0000-0000-0000-000000000102',4,'{2,3,4,6}','{09:00,14:00,18:00}','{reels,story}','{"00000000-0000-0000-0000-000000001201": 30, "00000000-0000-0000-0000-000000001202": 25, "00000000-0000-0000-0000-000000001203": 25, "00000000-0000-0000-0000-000000001204": 20}','{engagement,sale_conversion,social_proof}','{}','Pessoas buscando qualidade de vida e condicionamento físico',NULL,6);

INSERT INTO campaigns (id, workspace_id, name, objective, start_date, end_date, description, status) VALUES
('00000000-0000-0000-0000-000000000300','00000000-0000-0000-0000-000000000100','Campanha Dia dos Pais','Aumentar vendas de kits presenteáveis','2026-08-01','2026-08-09','Campanha especial para o Dia dos Pais com foco em kits e presentes.','active');

INSERT INTO channels (id, workspace_id, name, icon) VALUES
('00000000-0000-0000-0000-000000000400','00000000-0000-0000-0000-000000000100','Instagram','instagram'),
('00000000-0000-0000-0000-000000000401','00000000-0000-0000-0000-000000000100','Facebook','facebook'),
('00000000-0000-0000-0000-000000000402','00000000-0000-0000-0000-000000000100','WhatsApp','message-circle'),
('00000000-0000-0000-0000-000000000403','00000000-0000-0000-0000-000000000100','TikTok','music');

INSERT INTO actions (id, workspace_id, campaign_id, editorial_pillar_id, title, description, action_date, action_time, action_type, format, channel, objective, funnel_stage, status, created_by) VALUES
('00000000-0000-0000-0000-000000000501','00000000-0000-0000-0000-000000000100',NULL,'00000000-0000-0000-0000-000000001002','Reels: 5 dicas de café da manhã saudável','Conteúdo educativo sobre café da manhã','2026-08-17','09:00','content','reels','Instagram','educational','discovery','published',NULL),
('00000000-0000-0000-0000-000000000502','00000000-0000-0000-0000-000000000100',NULL,'00000000-0000-0000-0000-000000001003','Carrossel: Novos produtos da linha','Apresentação dos novos produtos','2026-08-18','14:00','content','carousel','Instagram','authority','interest','published',NULL),
('00000000-0000-0000-0000-000000000503','00000000-0000-0000-0000-000000000100',NULL,'00000000-0000-0000-0000-000000001004','Story: Depoimento cliente Maria','Prova social com depoimento real','2026-08-18','10:00','content','story','Instagram','social_proof','consideration','published',NULL),
('00000000-0000-0000-0000-000000000504','00000000-0000-0000-0000-000000000100',NULL,'00000000-0000-0000-0000-000000001005','Reels: Bastidores da produção','Mostrar processo de produção','2026-08-19','16:00','content','reels','TikTok','engagement','relationship','published',NULL),
('00000000-0000-0000-0000-000000000505','00000000-0000-0000-0000-000000000100','00000000-0000-0000-0000-000000000300','00000000-0000-0000-0000-000000001006','Post: Promoção Dia dos Pais','Oferta especial para o Dia dos Pais','2026-08-20','09:00','content','static_post','Instagram','sale_conversion','conversion','scheduled',NULL),
('00000000-0000-0000-0000-000000000506','00000000-0000-0000-0000-000000000100','00000000-0000-0000-0000-000000000300','00000000-0000-0000-0000-000000001002','Reels: Guia de presentes','Guia de presentes para pais','2026-08-21','10:00','content','reels','Instagram','educational','consideration','briefing',NULL),
('00000000-0000-0000-0000-000000000507','00000000-0000-0000-0000-000000000100','00000000-0000-0000-0000-000000000300','00000000-0000-0000-0000-000000001004','Story: Cliente satisfeito com kit','Prova social do kit Dia dos Pais','2026-08-22','11:00','content','story','Instagram','social_proof','consideration','draft',NULL),
('00000000-0000-0000-0000-000000000508','00000000-0000-0000-0000-000000000100',NULL,'00000000-0000-0000-0000-000000001001','Reels: História da marca','Storytelling da marca','2026-08-24','09:00','content','reels','Instagram','brand_awareness','discovery','draft',NULL),
('00000000-0000-0000-0000-000000000509','00000000-0000-0000-0000-000000000100','00000000-0000-0000-0000-000000000300','00000000-0000-0000-0000-000000001006','WhatsApp: Oferta exclusiva Dia dos Pais','Disparo de oferta exclusiva','2026-08-22','08:00','whatsapp','whatsapp','WhatsApp','sale_conversion','conversion','draft',NULL),
('00000000-0000-0000-0000-000000000510','00000000-0000-0000-0000-000000000100',NULL,'00000000-0000-0000-0000-000000001005','Live: Perguntas e respostas','Live de relacionamento','2026-08-25','19:00','event','live','Instagram','engagement','relationship','draft',NULL);

INSERT INTO strategic_dates (id, workspace_id, title, date, locality, category, relevance, description) VALUES
('00000000-0000-0000-0000-000000000601','00000000-0000-0000-0000-000000000100','Dia dos Pais','2026-08-09','national','commercial','high','Data comemorativa importante para varejo'),
('00000000-0000-0000-0000-000000000602','00000000-0000-0000-0000-000000000100','Dia do Cliente','2026-09-15','national','commercial','high','Data para ações de fidelização'),
('00000000-0000-0000-0000-000000000603','00000000-0000-0000-0000-000000000100','Black Friday','2026-11-27','national','commercial','high','Maior data comercial do ano'),
('00000000-0000-0000-0000-000000000604','00000000-0000-0000-0000-000000000100','Natal','2026-12-25','national','holiday','high','Feriado de Natal'),
('00000000-0000-0000-0000-000000000605','00000000-0000-0000-0000-000000000100','Aniversário PB & RN','2026-06-10','city','custom','high','Aniversário da empresa');

INSERT INTO calendar_templates (id, organization_id, name, segment, num_contents, allowed_days, formats, objectives, description) VALUES
('00000000-0000-0000-0000-000000000700','00000000-0000-0000-0000-000000000001','Food Service','Alimentação',5,'{1,2,3,4,5}','{reels,carousel,story}','{educational,engagement,sale_conversion,social_proof}','Template para restaurantes e food service com foco em conteúdo visual.'),
('00000000-0000-0000-0000-000000000701','00000000-0000-0000-0000-000000000001','Restaurante','Alimentação',4,'{1,2,4,5}','{reels,story}','{engagement,social_proof,sale_conversion}','Template para restaurantes com promoções semanais.'),
('00000000-0000-0000-0000-000000000702','00000000-0000-0000-0000-000000000001','Serviços','Serviços',5,'{1,2,3,4,5}','{reels,carousel,story}','{educational,authority,social_proof}','Template para empresas de serviços.'),
('00000000-0000-0000-0000-000000000703','00000000-0000-0000-0000-000000000001','B2B','B2B',3,'{1,3,5}','{reels,carousel}','{authority,educational,sale_conversion}','Template para empresas B2B.');

-- Recriar memberships (mesmos UUIDs fixos de usuários já existentes)
INSERT INTO memberships (user_id, workspace_id, role)
SELECT u.id, '00000000-0000-0000-0000-000000000100', 'owner'
FROM public.users u WHERE u.email = 'cliente@pbrn.com'
ON CONFLICT DO NOTHING;

INSERT INTO memberships (user_id, workspace_id, role)
SELECT u.id, w.id, 'member'
FROM public.users u CROSS JOIN workspaces w
WHERE u.email IN ('equipe@sharks.com')
ON CONFLICT DO NOTHING;

COMMIT;
