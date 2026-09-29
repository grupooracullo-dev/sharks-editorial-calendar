import {
  LayoutDashboard,
  Calendar,
  Users,
  Megaphone,
  BookOpen,
  LayoutTemplate,
  History,
  MessageSquare,
  Link2,
  Settings,
  UserCog,
  UserPlus,
  Briefcase,
  Rocket,
  ShieldCheck,
  CalendarDays,
  Building2,
  Target,
  type LucideIcon,
} from 'lucide-react';

export interface NavItem {
  icon: LucideIcon;
  label: string;
  shortLabel?: string;
  path: string;
  adminOnly?: boolean;
}

export const SHARKS_NAV: NavItem[] = [
  { icon: LayoutDashboard, label: 'Visão Geral', path: '/sharks' },
  { icon: Calendar, label: 'Calendário', path: '/sharks/calendar' },
  { icon: Megaphone, label: 'Campanhas', path: '/sharks/campaigns' },
  { icon: BookOpen, label: 'Linha Editorial', path: '/sharks/editorial' },
  { icon: LayoutTemplate, label: 'Modelos', path: '/sharks/templates' },
  { icon: MessageSquare, label: 'Chat', path: '/sharks/chat' },
  { icon: History, label: 'Histórico', path: '/sharks/history' },
  { icon: Target, label: 'CRM', path: '/sharks/crm' },
  { icon: Users, label: 'Clientes', path: '/sharks/clients' },
  { icon: UserCog, label: 'Time', path: '/sharks/team' },
  { icon: UserPlus, label: 'Acessos', path: '/sharks/access-requests', adminOnly: true },
  { icon: Link2, label: 'Integrações', path: '/sharks/integrations' },
  { icon: Settings, label: 'Configurações', path: '/sharks/settings' },
];

export const CLIENT_NAV: NavItem[] = [
  { icon: LayoutDashboard, label: 'Início', path: '/client' },
  { icon: Calendar, label: 'Calendário', path: '/client/calendar' },
  { icon: MessageSquare, label: 'Chat', path: '/client/chat' },
  { icon: History, label: 'Histórico', path: '/client/history' },
  { icon: Link2, label: 'Integrações', path: '/client/integrations' },
];

export const ESTRATEGOS_NAV: NavItem[] = [
  { icon: LayoutDashboard, label: 'Visão Geral', path: '/estrategos' },
  { icon: Calendar, label: 'Calendário', path: '/estrategos/calendar' },
  { icon: Briefcase, label: 'Projetos', path: '/estrategos/projects' },
  { icon: CalendarDays, label: 'Reuniões', path: '/estrategos/meetings' },
  { icon: Rocket, label: 'Implementações', shortLabel: 'Impl.', path: '/estrategos/implementations' },
  { icon: Target, label: 'CRM', path: '/estrategos/crm' },
  { icon: MessageSquare, label: 'Chat', path: '/estrategos/chat' },
  { icon: Users, label: 'Clientes', path: '/estrategos/clients', adminOnly: true },
  { icon: UserCog, label: 'Time', path: '/estrategos/team' },
  { icon: UserPlus, label: 'Acessos', path: '/estrategos/access-requests', adminOnly: true },
  { icon: Link2, label: 'Integrações', path: '/estrategos/integrations' },
];

export const ORACULLO_NAV: NavItem[] = [
  { icon: LayoutDashboard, label: 'Visão Geral', path: '/oracullo' },
  { icon: Target, label: 'CRM', path: '/oracullo/crm' },
  { icon: ShieldCheck, label: 'Acessos', path: '/oracullo/access' },
  { icon: UserPlus, label: 'Solicitações', path: '/oracullo/access-requests' },
  { icon: Users, label: 'Usuários', path: '/oracullo/users' },
  { icon: UserCog, label: 'Time', path: '/oracullo/team' },
  { icon: Building2, label: 'Clientes', path: '/oracullo/clients' },
];

export const SHARKS_BOTTOM_PATHS = [
  '/sharks',
  '/sharks/calendar',
  '/sharks/clients',
  '/sharks/chat',
];

export const CLIENT_BOTTOM_PATHS = [
  '/client',
  '/client/calendar',
  '/client/history',
  '/client/chat',
  '/client/integrations',
];

export const ESTRATEGOS_BOTTOM_PATHS = [
  '/estrategos',
  '/estrategos/calendar',
  '/estrategos/meetings',
  '/estrategos/implementations',
  '/estrategos/projects',
  '/estrategos/chat',
];

export const ORACULLO_BOTTOM_PATHS = [
  '/oracullo',
  '/oracullo/access',
  '/oracullo/clients',
  '/oracullo/users',
];

export const ROOT_PATHS = ['/sharks', '/client', '/estrategos', '/oracullo'];
