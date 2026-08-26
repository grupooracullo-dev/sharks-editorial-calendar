-- 030_admin_hierarchy.sql
-- Hierarquia de admins: 1 Oracullo (guardiao) + 1 admin por ambiente

-- =============================================
-- 1. grupo.oracullo@gmail.com = UNICO oracullo_admin
--    (acessa ambiente Oracullo + ambos ambientes)
-- =============================================
UPDATE users SET role = 'oracullo_admin'
WHERE email = 'grupo.oracullo@gmail.com';

-- Garantir acesso admin nos 2 ambientes
INSERT INTO user_environments (user_id, environment, role)
SELECT id, e.env::environment_type, 'admin'
FROM users, (VALUES ('sharks_company'), ('estrategos')) AS e(env)
WHERE users.email = 'grupo.oracullo@gmail.com'
ON CONFLICT (user_id, environment) DO UPDATE SET role = 'admin';

-- =============================================
-- 2. 04silva.junior09@gmail.com = ADMIN SHARKS
--    (somente ambiente sharks_company)
-- =============================================
UPDATE users SET role = 'admin_sharks'
WHERE email = '04silva.junior09@gmail.com';

-- Somente sharks_company — remover estrategos se existir
DELETE FROM user_environments
WHERE user_id = (SELECT id FROM users WHERE email = '04silva.junior09@gmail.com')
  AND environment = 'estrategos';

INSERT INTO user_environments (user_id, environment, role)
SELECT id, 'sharks_company', 'admin' FROM users WHERE email = '04silva.junior09@gmail.com'
ON CONFLICT (user_id, environment) DO UPDATE SET role = 'admin';

-- =============================================
-- 3. estrategosonline@gmail.com = ADMIN ESTRATEGOS
--    (somente ambiente estrategos; role global neutro,
--     acesso via user_environments apenas)
-- =============================================
UPDATE users SET role = 'client'
WHERE email = 'estrategosonline@gmail.com';

-- Remover acesso sharks_company (era admin heranca do oracullo)
DELETE FROM user_environments
WHERE user_id = (SELECT id FROM users WHERE email = 'estrategosonline@gmail.com')
  AND environment = 'sharks_company';

INSERT INTO user_environments (user_id, environment, role)
SELECT id, 'estrategos', 'admin' FROM users WHERE email = 'estrategosonline@gmail.com'
ON CONFLICT (user_id, environment) DO UPDATE SET role = 'admin';

-- =============================================
-- 4. Nenhum outro usuario pode ser oracullo_admin
-- =============================================
UPDATE users SET role = 'client'
WHERE role = 'oracullo_admin'
  AND email <> 'grupo.oracullo@gmail.com';

-- =============================================
-- 5. Helper: cliente vinculado a qual empresa
--    view para identificar workspace de cada user
-- =============================================
CREATE OR REPLACE VIEW v_user_companies AS
SELECT
  u.id AS user_id,
  u.email,
  u.full_name,
  u.role AS global_role,
  m.workspace_id,
  w.name AS workspace_name,
  o.environment,
  m.role AS membership_role
FROM users u
LEFT JOIN memberships m ON m.user_id = u.id
LEFT JOIN workspaces w ON w.id = m.workspace_id AND w.is_active = true
LEFT JOIN organizations o ON o.id = w.organization_id;
