import {
  Calendar, Megaphone, BookOpen, LayoutTemplate, History,
  MessageSquare, Briefcase, Link2, UserCog,
  type LucideIcon,
} from 'lucide-react';

/* ─── Types ─── */
export interface Permission {
  permission: string;
  can_create: boolean;
  can_read: boolean;
  can_update: boolean;
  can_delete: boolean;
}

export type PermissionAction = 'can_create' | 'can_read' | 'can_update' | 'can_delete';

/* ─── Permission catalog (single source of truth) ───
   Shared between SharksTeam (invite/edit) and
   SharksAccessRequests (approval flow). Must stay in
   sync with VALID_PERMISSIONS in admin-create-user /
   admin-approve-access-request Edge Functions. */
export const PERMISSION_META: Record<string, { label: string; icon: LucideIcon; description: string }> = {
  calendar:     { label: 'Calendário',      icon: Calendar,       description: 'Criar e gerenciar ações no calendário' },
  campaigns:    { label: 'Campanhas',       icon: Megaphone,      description: 'Gerenciar campanhas publicitárias' },
  editorial:    { label: 'Linha Editorial', icon: BookOpen,       description: 'Definir pilares e perfis editoriais' },
  templates:    { label: 'Modelos',         icon: LayoutTemplate, description: 'Criar e usar modelos de ação' },
  history:      { label: 'Histórico',       icon: History,        description: 'Visualizar histórico de ações' },
  chat:         { label: 'Chat',            icon: MessageSquare,  description: 'Enviar e receber mensagens' },
  clients:      { label: 'Clientes',        icon: Briefcase,      description: 'Gerenciar clientes e configurações' },
  integrations: { label: 'Integrações',     icon: Link2,          description: 'Gerenciar integrações (Google Calendar)' },
  team:         { label: 'Time',            icon: UserCog,        description: 'Gerenciar membros da equipe' },
};

export const ALL_PERMISSIONS = Object.keys(PERMISSION_META);

/* Defaults espelham DEFAULT_PERMISSIONS das Edge Functions
   (admin-create-user / admin-approve-access-request). */
export function defaultPermissions(): Permission[] {
  return ALL_PERMISSIONS.map(p => ({
    permission: p,
    can_create: !['history', 'clients', 'integrations', 'team'].includes(p),
    can_read: true,
    can_update: !['history', 'clients', 'integrations', 'team'].includes(p),
    can_delete: !['history', 'clients', 'integrations', 'team', 'chat'].includes(p),
  }));
}

export function togglePerm(
  perms: Permission[],
  perm: string,
  action: PermissionAction,
): Permission[] {
  return perms.map(p =>
    p.permission === perm ? { ...p, [action]: !p[action] } : p
  );
}

export function permCount(p: Permission): number {
  return [p.can_create, p.can_read, p.can_update, p.can_delete].filter(Boolean).length;
}
