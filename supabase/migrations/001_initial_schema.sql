?-- ==========================================
-- SHARKS EDITORIAL CALENDAR
-- Supabase Database Schema
-- ==========================================

-- ==========================================
-- ENUMS
-- ==========================================

CREATE TYPE user_role AS ENUM ('admin_sharks', 'sharks_team', 'client');
CREATE TYPE action_status AS ENUM ('draft', 'briefing', 'in_production', 'sharks_review', 'scheduled', 'published', 'completed', 'cancelled', 'overdue');
CREATE TYPE action_type AS ENUM ('content', 'campaign', 'production', 'recording', 'photo_session', 'approval', 'publication', 'ad', 'crm', 'whatsapp', 'email', 'event', 'meeting', 'strategic_date', 'commercial', 'other');
CREATE TYPE content_format AS ENUM ('reels', 'story', 'story_sequence', 'carousel', 'static_post', 'photo', 'video', 'live', 'whatsapp', 'whatsapp_status', 'email_marketing', 'newsletter', 'landing_page', 'blog', 'youtube', 'ad', 'commercial_material', 'other');
CREATE TYPE objective AS ENUM ('brand_awareness', 'positioning', 'authority', 'educational', 'engagement', 'relationship', 'traffic', 'lead_conversion', 'sale_conversion', 'social_proof', 'launch', 'loyalty', 'repurchase', 'retention', 'reactivation');
CREATE TYPE funnel_stage AS ENUM ('discovery', 'interest', 'consideration', 'conversion', 'relationship', 'repurchase');
CREATE TYPE message_type AS ENUM ('message', 'doubt', 'suggestion');
CREATE TYPE sync_status AS ENUM ('not_synced', 'synced', 'modified_after_sync', 'sync_error');
CREATE TYPE notification_type AS ENUM ('message', 'suggestion', 'calendar_generated', 'action_upcoming', 'action_overdue', 'campaign_starting', 'sync_error', 'calendar_undefined');
CREATE TYPE date_relevance AS ENUM ('high', 'medium', 'low');
CREATE TYPE campaign_status AS ENUM ('active', 'paused', 'completed', 'draft');
CREATE TYPE membership_role AS ENUM ('owner', 'member', 'viewer');

-- ==========================================
-- TABLES
-- ==========================================

-- Organizations (Sharks Company)
CREATE TABLE organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  logo_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Workspaces (one per client)
CREATE TABLE workspaces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  logo_url TEXT,
  segment TEXT,
  city TEXT,
  state TEXT,
  country TEXT DEFAULT 'Brasil',
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Users (extends Supabase Auth)
CREATE TABLE users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT NOT NULL,
  avatar_url TEXT,
  role user_role NOT NULL DEFAULT 'client',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Memberships (user <-> workspace)
CREATE TABLE memberships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  role membership_role NOT NULL DEFAULT 'member',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, workspace_id)
);

-- Editorial Profiles
CREATE TABLE editorial_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE UNIQUE,
  frequency_per_week INTEGER DEFAULT 5,
  allowed_days INTEGER[] DEFAULT '{1,2,3,4,5}', -- 0=Sunday, 6=Saturday
  preferred_times TEXT[] DEFAULT '{}',
  priority_formats content_format[] DEFAULT '{}',
  distribution JSONB DEFAULT '{}', -- pillar_id -> percentage
  priority_objectives objective[] DEFAULT '{}',
  priority_products TEXT[] DEFAULT '{}',
  target_audience TEXT,
  restrictions TEXT,
  max_weekly INTEGER DEFAULT 7,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Editorial Pillars
CREATE TABLE editorial_pillars (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  color TEXT DEFAULT '#0066FF',
  percentage INTEGER DEFAULT 15,
  sort_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Campaigns
CREATE TABLE campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  objective TEXT,
  start_date DATE,
  end_date DATE,
  description TEXT,
  audience TEXT,
  product TEXT,
  priority TEXT DEFAULT 'medium',
  status campaign_status DEFAULT 'draft',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Channels
CREATE TABLE channels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  icon TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Actions (central table)
CREATE TABLE actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  campaign_id UUID REFERENCES campaigns(id) ON DELETE SET NULL,
  editorial_pillar_id UUID REFERENCES editorial_pillars(id) ON DELETE SET NULL,
  responsible_id UUID REFERENCES users(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT,
  action_date DATE NOT NULL,
  action_time TIME,
  action_type action_type NOT NULL DEFAULT 'content',
  format content_format,
  channel TEXT,
  objective objective,
  funnel_stage funnel_stage,
  audience TEXT,
  product TEXT,
  theme TEXT,
  hook TEXT,
  main_message TEXT,
  copy_text TEXT,
  cta TEXT,
  internal_deadline DATE,
  status action_status NOT NULL DEFAULT 'draft',
  observations TEXT,
  reference_urls TEXT[] DEFAULT '{}',
  sync_status sync_status DEFAULT 'not_synced',
  is_auto_generated BOOLEAN DEFAULT FALSE,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Calendar Templates
CREATE TABLE calendar_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  segment TEXT,
  num_contents INTEGER DEFAULT 5,
  allowed_days INTEGER[] DEFAULT '{1,2,3,4,5}',
  formats content_format[] DEFAULT '{}',
  objectives objective[] DEFAULT '{}',
  pillar_distribution JSONB DEFAULT '{}',
  distribution JSONB DEFAULT '{}',
  rules JSONB DEFAULT '{}',
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Strategic Dates
CREATE TABLE strategic_dates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  date DATE NOT NULL,
  locality TEXT, -- 'national', 'state', 'city'
  category TEXT, -- 'holiday', 'commercial', 'segment', 'custom'
  relevance date_relevance DEFAULT 'medium',
  description TEXT,
  is_recurring BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Chat Threads
CREATE TABLE chat_threads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Chat Messages
CREATE TABLE chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id UUID NOT NULL REFERENCES chat_threads(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  message_type message_type DEFAULT 'message',
  action_id UUID REFERENCES actions(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Attachments
CREATE TABLE attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  action_id UUID NOT NULL REFERENCES actions(id) ON DELETE CASCADE,
  file_url TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_type TEXT,
  uploaded_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Calendar Integrations (Google Calendar)
CREATE TABLE calendar_integrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE UNIQUE,
  google_calendar_id TEXT,
  google_calendar_name TEXT,
  access_token TEXT,
  refresh_token TEXT,
  token_expires_at TIMESTAMPTZ,
  is_connected BOOLEAN DEFAULT FALSE,
  last_synced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Calendar Event Links (Google Calendar mapping)
CREATE TABLE calendar_event_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  action_id UUID NOT NULL REFERENCES actions(id) ON DELETE CASCADE UNIQUE,
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  google_event_id TEXT,
  last_synced_at TIMESTAMPTZ,
  sync_status sync_status DEFAULT 'not_synced',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Audit Logs
CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  entity_type TEXT NOT NULL, -- 'action', 'campaign', 'template', 'workspace', etc.
  entity_id UUID NOT NULL,
  action TEXT NOT NULL, -- 'created', 'updated', 'deleted', 'status_changed', 'date_changed', 'generated', 'synced'
  old_value JSONB,
  new_value JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Notifications
CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  message TEXT,
  type notification_type NOT NULL,
  is_read BOOLEAN DEFAULT FALSE,
  action_id UUID REFERENCES actions(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ==========================================
-- INDEXES
-- ==========================================

CREATE INDEX idx_workspaces_org ON workspaces(organization_id);
CREATE INDEX idx_memberships_user ON memberships(user_id);
CREATE INDEX idx_memberships_workspace ON memberships(workspace_id);
CREATE INDEX idx_actions_workspace ON actions(workspace_id);
CREATE INDEX idx_actions_date ON actions(action_date);
CREATE INDEX idx_actions_campaign ON actions(campaign_id);
CREATE INDEX idx_actions_status ON actions(status);
CREATE INDEX idx_actions_pillar ON actions(editorial_pillar_id);
CREATE INDEX idx_chat_messages_thread ON chat_messages(thread_id);
CREATE INDEX idx_audit_workspace ON audit_logs(workspace_id);
CREATE INDEX idx_notifications_user ON notifications(user_id);
CREATE INDEX idx_notifications_read ON notifications(is_read);
CREATE INDEX idx_strategic_dates_workspace ON strategic_dates(workspace_id);
CREATE INDEX idx_strategic_dates_date ON strategic_dates(date);

-- ==========================================
-- ROW LEVEL SECURITY
-- ==========================================

ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE editorial_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE editorial_pillars ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE calendar_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE strategic_dates ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE calendar_integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE calendar_event_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- Helper function: get user role
CREATE OR REPLACE FUNCTION get_user_role(user_uuid UUID)
RETURNS user_role AS $$
  SELECT role FROM users WHERE id = user_uuid;
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Helper function: get user workspace IDs
CREATE OR REPLACE FUNCTION get_user_workspaces(user_uuid UUID)
RETURNS SETOF UUID AS $$
  SELECT workspace_id FROM memberships WHERE user_id = user_uuid;
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Helper function: check if user is sharks admin
CREATE OR REPLACE FUNCTION is_sharks_admin(user_uuid UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (SELECT 1 FROM users WHERE id = user_uuid AND role = 'admin_sharks');
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Helper function: check if user is sharks team
CREATE OR REPLACE FUNCTION is_sharks_team(user_uuid UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (SELECT 1 FROM users WHERE id = user_uuid AND role = 'sharks_team');
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Helper function: check workspace access
CREATE OR REPLACE FUNCTION has_workspace_access(user_uuid UUID, ws_id UUID)
RETURNS BOOLEAN AS $$
  SELECT
    is_sharks_admin(user_uuid) OR
    is_sharks_team(user_uuid) OR
    EXISTS (SELECT 1 FROM memberships WHERE user_id = user_uuid AND workspace_id = ws_id);
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- ==========================================
-- RLS POLICIES
-- ==========================================

-- Organizations: Sharks Admin full access
CREATE POLICY "org_select" ON organizations FOR SELECT USING (TRUE);
CREATE POLICY "org_admin_all" ON organizations FOR ALL USING (is_sharks_admin(auth.uid()));

-- Workspaces: Admin all, Team via membership, Client via membership (read)
CREATE POLICY "workspace_select" ON workspaces FOR SELECT USING (
  is_sharks_admin(auth.uid()) OR
  id IN (SELECT get_user_workspaces(auth.uid()))
);
CREATE POLICY "workspace_admin_insert" ON workspaces FOR INSERT WITH CHECK (is_sharks_admin(auth.uid()));
CREATE POLICY "workspace_admin_update" ON workspaces FOR UPDATE USING (is_sharks_admin(auth.uid()));
CREATE POLICY "workspace_admin_delete" ON workspaces FOR DELETE USING (is_sharks_admin(auth.uid()));

-- Users: read own, admin all
CREATE POLICY "users_select" ON users FOR SELECT USING (auth.uid() = id OR is_sharks_admin(auth.uid()));
CREATE POLICY "users_update_own" ON users FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "users_admin_all" ON users FOR ALL USING (is_sharks_admin(auth.uid()));

-- Memberships: via workspace access
CREATE POLICY "memberships_select" ON memberships FOR SELECT USING (
  is_sharks_admin(auth.uid()) OR
  workspace_id IN (SELECT get_user_workspaces(auth.uid())) OR
  user_id = auth.uid()
);
CREATE POLICY "memberships_admin_insert" ON memberships FOR INSERT WITH CHECK (is_sharks_admin(auth.uid()));
CREATE POLICY "memberships_admin_delete" ON memberships FOR DELETE USING (is_sharks_admin(auth.uid()));

-- Editorial Profiles: via workspace access
CREATE POLICY "profiles_select" ON editorial_profiles FOR SELECT USING (
  has_workspace_access(auth.uid(), workspace_id)
);
CREATE POLICY "profiles_team_insert" ON editorial_profiles FOR INSERT WITH CHECK (
  is_sharks_admin(auth.uid()) OR is_sharks_team(auth.uid())
);
CREATE POLICY "profiles_team_update" ON editorial_profiles FOR UPDATE USING (
  is_sharks_admin(auth.uid()) OR is_sharks_team(auth.uid())
);

-- Editorial Pillars: via workspace access
CREATE POLICY "pillars_select" ON editorial_pillars FOR SELECT USING (
  has_workspace_access(auth.uid(), workspace_id)
);
CREATE POLICY "pillars_team_all" ON editorial_pillars FOR ALL USING (
  is_sharks_admin(auth.uid()) OR is_sharks_team(auth.uid())
);

-- Campaigns: via workspace access
CREATE POLICY "campaigns_select" ON campaigns FOR SELECT USING (
  has_workspace_access(auth.uid(), workspace_id)
);
CREATE POLICY "campaigns_team_insert" ON campaigns FOR INSERT WITH CHECK (
  is_sharks_admin(auth.uid()) OR is_sharks_team(auth.uid())
);
CREATE POLICY "campaigns_team_update" ON campaigns FOR UPDATE USING (
  is_sharks_admin(auth.uid()) OR is_sharks_team(auth.uid())
);
CREATE POLICY "campaigns_team_delete" ON campaigns FOR DELETE USING (
  is_sharks_admin(auth.uid()) OR is_sharks_team(auth.uid())
);

-- Channels: via workspace access
CREATE POLICY "channels_select" ON channels FOR SELECT USING (
  has_workspace_access(auth.uid(), workspace_id)
);
CREATE POLICY "channels_team_all" ON channels FOR ALL USING (
  is_sharks_admin(auth.uid()) OR is_sharks_team(auth.uid())
);

-- Actions: via workspace access, client read-only
CREATE POLICY "actions_select" ON actions FOR SELECT USING (
  has_workspace_access(auth.uid(), workspace_id)
);
CREATE POLICY "actions_team_insert" ON actions FOR INSERT WITH CHECK (
  is_sharks_admin(auth.uid()) OR is_sharks_team(auth.uid())
);
CREATE POLICY "actions_team_update" ON actions FOR UPDATE USING (
  is_sharks_admin(auth.uid()) OR is_sharks_team(auth.uid())
);
CREATE POLICY "actions_team_delete" ON actions FOR DELETE USING (
  is_sharks_admin(auth.uid()) OR is_sharks_team(auth.uid())
);

-- Templates: Sharks only
CREATE POLICY "templates_select" ON calendar_templates FOR SELECT USING (
  is_sharks_admin(auth.uid()) OR is_sharks_team(auth.uid())
);
CREATE POLICY "templates_admin_all" ON calendar_templates FOR ALL USING (is_sharks_admin(auth.uid()));

-- Strategic Dates: via workspace access
CREATE POLICY "dates_select" ON strategic_dates FOR SELECT USING (
  has_workspace_access(auth.uid(), workspace_id)
);
CREATE POLICY "dates_team_all" ON strategic_dates FOR ALL USING (
  is_sharks_admin(auth.uid()) OR is_sharks_team(auth.uid())
);

-- Chat Threads: via workspace access
CREATE POLICY "threads_select" ON chat_threads FOR SELECT USING (
  has_workspace_access(auth.uid(), workspace_id)
);
CREATE POLICY "threads_insert" ON chat_threads FOR INSERT WITH CHECK (
  has_workspace_access(auth.uid(), workspace_id)
);

-- Chat Messages: via workspace access
CREATE POLICY "messages_select" ON chat_messages FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM chat_threads ct
    WHERE ct.id = thread_id AND has_workspace_access(auth.uid(), ct.workspace_id)
  )
);
CREATE POLICY "messages_insert" ON chat_messages FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1 FROM chat_threads ct
    WHERE ct.id = thread_id AND has_workspace_access(auth.uid(), ct.workspace_id)
  )
);

-- Attachments: via workspace access
CREATE POLICY "attachments_select" ON attachments FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM actions a
    WHERE a.id = action_id AND has_workspace_access(auth.uid(), a.workspace_id)
  )
);
CREATE POLICY "attachments_insert" ON attachments FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1 FROM actions a
    WHERE a.id = action_id AND (is_sharks_admin(auth.uid()) OR is_sharks_team(auth.uid()))
  )
);

-- Calendar Integrations: via workspace access
CREATE POLICY "integrations_select" ON calendar_integrations FOR SELECT USING (
  has_workspace_access(auth.uid(), workspace_id)
);
CREATE POLICY "integrations_team_all" ON calendar_integrations FOR ALL USING (
  is_sharks_admin(auth.uid()) OR is_sharks_team(auth.uid())
);

-- Calendar Event Links: via workspace access
CREATE POLICY "event_links_select" ON calendar_event_links FOR SELECT USING (
  has_workspace_access(auth.uid(), workspace_id)
);
CREATE POLICY "event_links_team_all" ON calendar_event_links FOR ALL USING (
  is_sharks_admin(auth.uid()) OR is_sharks_team(auth.uid())
);

-- Audit Logs: via workspace access, team/admin insert
CREATE POLICY "audit_select" ON audit_logs FOR SELECT USING (
  has_workspace_access(auth.uid(), workspace_id)
);
CREATE POLICY "audit_insert" ON audit_logs FOR INSERT WITH CHECK (
  is_sharks_admin(auth.uid()) OR is_sharks_team(auth.uid())
);

-- Notifications: user reads own
CREATE POLICY "notifications_select" ON notifications FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "notifications_insert" ON notifications FOR INSERT WITH CHECK (TRUE);
CREATE POLICY "notifications_update" ON notifications FOR UPDATE USING (auth.uid() = user_id);

-- ==========================================
-- TRIGGERS
-- ==========================================

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_workspaces_updated_at BEFORE UPDATE ON workspaces FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_editorial_profiles_updated_at BEFORE UPDATE ON editorial_profiles FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_campaigns_updated_at BEFORE UPDATE ON campaigns FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_actions_updated_at BEFORE UPDATE ON actions FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_integrations_updated_at BEFORE UPDATE ON calendar_integrations FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Auto-create chat thread when workspace is created
CREATE OR REPLACE FUNCTION create_workspace_chat_thread()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO chat_threads (workspace_id) VALUES (NEW.id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER on_workspace_created AFTER INSERT ON workspaces FOR EACH ROW EXECUTE FUNCTION create_workspace_chat_thread();

-- Auto-create audit log entry
CREATE OR REPLACE FUNCTION create_audit_log()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO audit_logs (workspace_id, user_id, entity_type, entity_id, action, new_value)
    VALUES (
      COALESCE(NEW.workspace_id, NEW.id),
      auth.uid(),
      TG_TABLE_NAME,
      NEW.id,
      'created',
      to_jsonb(NEW)
    );
  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO audit_logs (workspace_id, user_id, entity_type, entity_id, action, old_value, new_value)
    VALUES (
      COALESCE(NEW.workspace_id, NEW.id),
      auth.uid(),
      TG_TABLE_NAME,
      NEW.id,
      'updated',
      to_jsonb(OLD),
      to_jsonb(NEW)
    );
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO audit_logs (workspace_id, user_id, entity_type, entity_id, action, old_value)
    VALUES (
      COALESCE(OLD.workspace_id, OLD.id),
      auth.uid(),
      TG_TABLE_NAME,
      OLD.id,
      'deleted',
      to_jsonb(OLD)
    );
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER audit_actions AFTER INSERT OR UPDATE OR DELETE ON actions FOR EACH ROW EXECUTE FUNCTION create_audit_log();
CREATE TRIGGER audit_campaigns AFTER INSERT OR UPDATE OR DELETE ON campaigns FOR EACH ROW EXECUTE FUNCTION create_audit_log();

-- ==========================================
-- SEED DATA
-- ==========================================

-- Organization
INSERT INTO organizations (id, name, logo_url)
VALUES ('00000000-0000-0000-0000-000000000001', 'Sharks Company', NULL);

-- Demo Client: PB & RN Foods
INSERT INTO workspaces (id, organization_id, name, slug, segment, city, state, country)
VALUES ('00000000-0000-0000-0000-000000000100', '00000000-0000-0000-0000-000000000001', 'PB & RN Foods', 'pb-rn-foods', 'Alimentação', 'São Paulo', 'SP', 'Brasil');

-- Editorial Pillars for Demo Client
INSERT INTO editorial_pillars (id, workspace_id, name, description, color, percentage, sort_order)
VALUES
  ('00000000-0000-0000-0000-000000001001', '00000000-0000-0000-0000-000000000100', 'Marca & Essência', 'Conteúdo sobre a marca, valores e cultura', '#0066FF', 20, 1),
  ('00000000-0000-0000-0000-000000001002', '00000000-0000-0000-0000-000000000100', 'Autoridade & Educação', 'Conteúdo educativo e de autoridade', '#7C3AED', 25, 2),
  ('00000000-0000-0000-0000-000000001003', '00000000-0000-0000-0000-000000000100', 'Produto & Solução', 'Apresentação de produtos e serviços', '#059669', 20, 3),
  ('00000000-0000-0000-0000-000000001004', '00000000-0000-0000-0000-000000000100', 'Prova & Confiança', 'Depoimentos, cases e prova social', '#D97706', 15, 4),
  ('00000000-0000-0000-0000-000000001005', '00000000-0000-0000-0000-000000000100', 'Relacionamento & Comunidade', 'Engajamento e comunidade', '#EC4899', 10, 5),
  ('00000000-0000-0000-0000-000000001006', '00000000-0000-0000-0000-000000000100', 'Oferta & Conversão', 'Ofertas e conversão de vendas', '#EF4444', 10, 6);

-- Editorial Profile for Demo Client
INSERT INTO editorial_profiles (id, workspace_id, frequency_per_week, allowed_days, priority_formats, distribution, priority_objectives, target_audience)
VALUES (
  '00000000-0000-0000-0000-000000000200',
  '00000000-0000-0000-0000-000000000100',
  5,
  '{1,2,3,4,5}',
  '{reels,carousel,story}',
  '{"00000000-0000-0000-0000-000000001001": 20, "00000000-0000-0000-0000-000000001002": 25, "00000000-0000-0000-0000-000000001003": 20, "00000000-0000-0000-0000-000000001004": 15, "00000000-0000-0000-0000-000000001005": 10, "00000000-0000-0000-0000-000000001006": 10}',
  '{educational,engagement,sale_conversion,social_proof}',
  'Famílias de classe média interessadas em alimentação saudável e prática'
);

-- Demo Campaign
INSERT INTO campaigns (id, workspace_id, name, objective, start_date, end_date, description, status)
VALUES (
  '00000000-0000-0000-0000-000000000300',
  '00000000-0000-0000-0000-000000000100',
  'Campanha Dia dos Pais',
  'Aumentar vendas de kits presenteáveis',
  '2026-08-01',
  '2026-08-09',
  'Campanha especial para o Dia dos Pais com foco em kits e presentes.',
  'active'
);

-- Demo Channels
INSERT INTO channels (id, workspace_id, name, icon)
VALUES
  ('00000000-0000-0000-0000-000000000400', '00000000-0000-0000-0000-000000000100', 'Instagram', 'instagram'),
  ('00000000-0000-0000-0000-000000000401', '00000000-0000-0000-0000-000000000100', 'Facebook', 'facebook'),
  ('00000000-0000-0000-0000-000000000402', '00000000-0000-0000-0000-000000000100', 'WhatsApp', 'message-circle'),
  ('00000000-0000-0000-0000-000000000403', '00000000-0000-0000-0000-000000000100', 'TikTok', 'music');

-- Demo Actions (past and future)
INSERT INTO actions (id, workspace_id, campaign_id, editorial_pillar_id, title, description, action_date, action_time, action_type, format, channel, objective, funnel_stage, status, created_by)
VALUES
  ('00000000-0000-0000-0000-000000000501', '00000000-0000-0000-0000-000000000100', NULL, '00000000-0000-0000-0000-000000001002', 'Reels: 5 dicas de café da manhã saudável', 'Conteúdo educativo sobre café da manhã', '2026-08-17', '09:00', 'content', 'reels', 'Instagram', 'educational', 'discovery', 'published', NULL),
  ('00000000-0000-0000-0000-000000000502', '00000000-0000-0000-0000-000000000100', NULL, '00000000-0000-0000-0000-000000001003', 'Carrossel: Novos produtos da linha', 'Apresentação dos novos produtos', '2026-08-18', '14:00', 'content', 'carousel', 'Instagram', 'authority', 'interest', 'published', NULL),
  ('00000000-0000-0000-0000-000000000503', '00000000-0000-0000-0000-000000000100', NULL, '00000000-0000-0000-0000-000000001004', 'Story: Depoimento cliente Maria', 'Prova social com depoimento real', '2026-08-18', '10:00', 'content', 'story', 'Instagram', 'social_proof', 'consideration', 'published', NULL),
  ('00000000-0000-0000-0000-000000000504', '00000000-0000-0000-0000-000000000100', NULL, '00000000-0000-0000-0000-000000001005', 'Reels: Bastidores da produção', 'Mostrar processo de produção', '2026-08-19', '16:00', 'content', 'reels', 'TikTok', 'engagement', 'relationship', 'published', NULL),
  ('00000000-0000-0000-0000-000000000505', '00000000-0000-0000-0000-000000000100', '00000000-0000-0000-0000-000000000300', '00000000-0000-0000-0000-000000001006', 'Post: Promoção Dia dos Pais', 'Oferta especial para o Dia dos Pais', '2026-08-20', '09:00', 'content', 'static_post', 'Instagram', 'sale_conversion', 'conversion', 'scheduled', NULL),
  ('00000000-0000-0000-0000-000000000506', '00000000-0000-0000-0000-000000000100', '00000000-0000-0000-0000-000000000300', '00000000-0000-0000-0000-000000001002', 'Reels: Guia de presentes', 'Guia de presentes para pais', '2026-08-21', '10:00', 'content', 'reels', 'Instagram', 'educational', 'consideration', 'briefing', NULL),
  ('00000000-0000-0000-0000-000000000507', '00000000-0000-0000-0000-000000000100', '00000000-0000-0000-0000-000000000300', '00000000-0000-0000-0000-000000001004', 'Story: Cliente satisfeito com kit', 'Prova social do kit Dia dos Pais', '2026-08-22', '11:00', 'content', 'story', 'Instagram', 'social_proof', 'consideration', 'draft', NULL),
  ('00000000-0000-0000-0000-000000000508', '00000000-0000-0000-0000-000000000100', NULL, '00000000-0000-0000-0000-000000001001', 'Reels: História da marca', 'Storytelling da marca', '2026-08-24', '09:00', 'content', 'reels', 'Instagram', 'brand_awareness', 'discovery', 'draft', NULL),
  ('00000000-0000-0000-0000-000000000509', '00000000-0000-0000-0000-000000000100', '00000000-0000-0000-0000-000000000300', '00000000-0000-0000-0000-000000001006', 'WhatsApp: Oferta exclusiva Dia dos Pais', 'Disparo de oferta exclusiva', '2026-08-22', '08:00', 'whatsapp', 'whatsapp', 'WhatsApp', 'sale_conversion', 'conversion', 'draft', NULL),
  ('00000000-0000-0000-0000-000000000510', '00000000-0000-0000-0000-000000000100', NULL, '00000000-0000-0000-0000-000000001005', 'Live: Perguntas e respostas', 'Live de relacionamento', '2026-08-25', '19:00', 'event', 'live', 'Instagram', 'engagement', 'relationship', 'draft', NULL);

-- Demo Strategic Dates
INSERT INTO strategic_dates (id, workspace_id, title, date, locality, category, relevance, description)
VALUES
  ('00000000-0000-0000-0000-000000000601', '00000000-0000-0000-0000-000000000100', 'Dia dos Pais', '2026-08-09', 'national', 'commercial', 'high', 'Data comemorativa importante para varejo'),
  ('00000000-0000-0000-0000-000000000602', '00000000-0000-0000-0000-000000000100', 'Dia do Cliente', '2026-09-15', 'national', 'commercial', 'high', 'Data para ações de fidelização'),
  ('00000000-0000-0000-0000-000000000603', '00000000-0000-0000-0000-000000000100', 'Black Friday', '2026-11-27', 'national', 'commercial', 'high', 'Maior data comercial do ano'),
  ('00000000-0000-0000-0000-000000000604', '00000000-0000-0000-0000-000000000100', 'Natal', '2026-12-25', 'national', 'holiday', 'high', 'Feriado de Natal'),
  ('00000000-0000-0000-0000-000000000605', '00000000-0000-0000-0000-000000000100', 'Aniversário PB & RN', '2026-06-10', 'city', 'custom', 'high', 'Aniversário da empresa');

-- Demo Templates
INSERT INTO calendar_templates (id, organization_id, name, segment, num_contents, allowed_days, formats, objectives, description)
VALUES
  ('00000000-0000-0000-0000-000000000700', '00000000-0000-0000-0000-000000000001', 'Food Service', 'Alimentação', 5, '{1,2,3,4,5}', '{reels,carousel,story}', '{educational,engagement,sale_conversion,social_proof}', 'Template para restaurantes e food service com foco em conteúdo visual.'),
  ('00000000-0000-0000-0000-000000000701', '00000000-0000-0000-0000-000000000001', 'Restaurante', 'Alimentação', 4, '{1,2,4,5}', '{reels,story}', '{engagement,social_proof,sale_conversion}', 'Template para restaurantes com promoções semanais.'),
  ('00000000-0000-0000-0000-000000000702', '00000000-0000-0000-0000-000000000001', 'Serviços', 'Serviços', 5, '{1,2,3,4,5}', '{reels,carousel,story}', '{educational,authority,social_proof}', 'Template para empresas de serviços.'),
  ('00000000-0000-0000-0000-000000000703', '00000000-0000-0000-0000-000000000001', 'B2B', 'B2B', 3, '{1,3,5}', '{reels,carousel}', '{authority,educational,sale_conversion}', 'Template para empresas B2B.');

