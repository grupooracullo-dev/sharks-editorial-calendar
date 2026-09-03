import { useState, useEffect } from 'react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { supabase } from '@/lib/supabase';
import Avatar from '@/components/ui/Avatar';
import { ENVIRONMENT_META, type EnvironmentType } from '@/types';
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
  LogOut,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  X,
  UserCog,
  UserPlus,
  Briefcase,
  Rocket,
  ShieldCheck,
  CalendarDays,
  Building2,
} from 'lucide-react';
import logoUrl from '/logo.png?url';
import logoSharksUrl from '/logo-sharks.png?url';
import logoEstrategosUrl from '/logo-estrategos.png?url';

const sharksNavItems = [
  { icon: LayoutDashboard, label: 'Visão Geral', path: '/sharks' },
  { icon: Calendar, label: 'Calendário', path: '/sharks/calendar' },
  { icon: Megaphone, label: 'Campanhas', path: '/sharks/campaigns' },
  { icon: BookOpen, label: 'Linha Editorial', path: '/sharks/editorial' },
  { icon: LayoutTemplate, label: 'Modelos', path: '/sharks/templates' },
  { icon: MessageSquare, label: 'Chat', path: '/sharks/chat' },
  { icon: History, label: 'Histórico', path: '/sharks/history' },
  { icon: Users, label: 'Clientes', path: '/sharks/clients' },
  { icon: UserCog, label: 'Time', path: '/sharks/team' },
  { icon: UserPlus, label: 'Acessos', path: '/sharks/access-requests', adminOnly: true },
  { icon: Link2, label: 'Integrações', path: '/sharks/integrations' },
  { icon: Settings, label: 'Configurações', path: '/sharks/settings' },
];

const clientNavItems = [
  { icon: LayoutDashboard, label: 'Início', path: '/client' },
  { icon: Calendar, label: 'Meu Calendário', path: '/client/calendar' },
  { icon: MessageSquare, label: 'Chat', path: '/client/chat' },
  { icon: History, label: 'Histórico', path: '/client/history' },
  { icon: Link2, label: 'Integrações', path: '/client/integrations' },
];

const estrategosNavItems = [
  { icon: LayoutDashboard, label: 'Visão Geral', path: '/estrategos' },
  { icon: Calendar, label: 'Calendário', path: '/estrategos/calendar' },
  { icon: Briefcase, label: 'Projetos', path: '/estrategos/projects' },
  { icon: CalendarDays, label: 'Reuniões', path: '/estrategos/meetings' },
  { icon: Rocket, label: 'Implementações', path: '/estrategos/implementations' },
  { icon: MessageSquare, label: 'Chat', path: '/estrategos/chat' },
  { icon: Users, label: 'Clientes', path: '/estrategos/clients', adminOnly: true },
  { icon: UserCog, label: 'Time', path: '/estrategos/team' },
  { icon: UserPlus, label: 'Acessos', path: '/estrategos/access-requests', adminOnly: true },
  { icon: Link2, label: 'Integrações', path: '/estrategos/integrations' },
];

const oraculloNavItems = [
  { icon: LayoutDashboard, label: 'Visão Geral', path: '/oracullo' },
  { icon: ShieldCheck, label: 'Acessos', path: '/oracullo/access' },
  { icon: UserPlus, label: 'Solicitações', path: '/oracullo/access-requests' },
  { icon: Users, label: 'Usuários', path: '/oracullo/users' },
  { icon: UserCog, label: 'Time', path: '/oracullo/team' },
  { icon: Building2, label: 'Clientes', path: '/oracullo/clients' },
];

type SidebarEnv = 'sharks' | 'client' | 'estrategos' | 'oracullo';

function detectEnv(pathname: string): SidebarEnv {
  if (pathname.startsWith('/estrategos')) return 'estrategos';
  if (pathname.startsWith('/oracullo')) return 'oracullo';
  if (pathname.startsWith('/client')) return 'client';
  return 'sharks';
}

interface AppSidebarProps {
  open: boolean;
  onClose: () => void;
}

export default function AppSidebar({ open, onClose }: AppSidebarProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [envMenuOpen, setEnvMenuOpen] = useState(false);
  const { user, signOut, isSharks, isAdmin, isOracullo, environments, hasAccess } = useAuth();
  const { currentWorkspace } = useWorkspace();
  const location = useLocation();
  const navigate = useNavigate();
  const [pendingRequests, setPendingRequests] = useState(0);

  const env = detectEnv(location.pathname);

  // Ambientes disponiveis para o switcher (staff ve area staff;
  // cliente so ve o seu portal por ambiente)
  const switcherTargets: Array<{ id: EnvironmentType; label: string; emoji: string; home: string }> = [];
  if (hasAccess('sharks_company', ['admin', 'team'])) {
    switcherTargets.push({ id: 'sharks_company', label: 'Sharks Company', emoji: '🦈', home: '/sharks' });
  } else if (hasAccess('sharks_company')) {
    switcherTargets.push({ id: 'sharks_company', label: 'Sharks Company', emoji: '🦈', home: '/client' });
  }
  if (hasAccess('estrategos', ['admin', 'team'])) {
    switcherTargets.push({ id: 'estrategos', label: 'Estrategos', emoji: '📊', home: '/estrategos' });
  } else if (hasAccess('estrategos')) {
    switcherTargets.push({ id: 'estrategos', label: 'Estrategos', emoji: '📊', home: '/client/estrategos' });
  }
  if (isOracullo) {
    switcherTargets.unshift({ id: 'sharks_company', label: 'Oracullo', emoji: '🛡️', home: '/oracullo' });
  }

  const isEstrategosAdmin = hasAccess('estrategos', ['admin']);
  const canSeeRequestsBadge = isAdmin || isEstrategosAdmin;

  // Badge: contagem de solicitacoes de acesso pendentes (admin de qualquer ambiente)
  useEffect(() => {
    if (!canSeeRequestsBadge) return;

    const loadCount = async () => {
      const { count } = await supabase
        .from('access_requests')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'pending');
      setPendingRequests(count ?? 0);
    };
    loadCount();

    const channel = supabase
      .channel('sidebar-access-requests')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'access_requests' },
        () => { loadCount(); }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [canSeeRequestsBadge]);

  const baseItems =
    env === 'estrategos' ? estrategosNavItems.filter(i => !i.adminOnly || isEstrategosAdmin)
    : env === 'oracullo' ? oraculloNavItems
    : isSharks ? sharksNavItems.filter(i => !i.adminOnly || isAdmin)
    : clientNavItems;

  // No portal do cliente dentro do contexto estrategos, reutiliza os itens do client
  const navItems = env === 'client' && location.pathname.startsWith('/client/estrategos')
    ? clientNavItems
    : baseItems;

  const brandTitle =
    env === 'estrategos' ? 'Estrategos'
    : env === 'oracullo' ? 'Oracullo Calendar'
    : isSharks ? 'Sharks Company'
    : 'Sharks Company';

  const currentEnvLabel =
    env === 'estrategos' ? '📊 Estrategos'
    : env === 'oracullo' ? '🛡️ Oracullo'
    : '🦈 Sharks';

  const envLogo: Record<string, string> = {
    sharks_company: logoSharksUrl,
    sharks: logoSharksUrl,
    estrategos: logoEstrategosUrl,
    oracullo: logoUrl,
    client: logoUrl,
  };

  const handleSignOut = async () => {
    await signOut();
    navigate('/login');
  };

  // Drawer mobile: fecha com Escape e trava o scroll do body
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);

  return (
    <>
      {/* Overlay mobile com blur */}
      <div
        onClick={onClose}
        className={cn(
          'lg:hidden fixed inset-0 bg-black/40 backdrop-blur-[2px] z-[60] transition-opacity duration-300',
          open ? 'opacity-100' : 'opacity-0 pointer-events-none'
        )}
      />

      {/* Sidebar: drawer professional no mobile, fixa no desktop */}
      <aside
        className={cn(
          'fixed left-0 top-0 h-full bg-white border-r border-gray-200 z-[70] flex flex-col transition-all duration-300 ease-out',
          // Mobile: drawer com cantos arredondados, sombra e safe area
          'w-[288px] max-w-[85vw] rounded-r-2xl shadow-2xl pb-[env(safe-area-inset-bottom)]',
          // Desktop: barra fixa padrao (sem sombra/cantos)
          'lg:rounded-none lg:shadow-none lg:w-[240px] lg:max-w-none lg:pb-0 lg:translate-x-0',
          collapsed ? 'lg:w-[68px]' : 'lg:w-[240px]',
          open ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        {/* Logo + environment switcher + fechar (mobile) */}
        <div className={cn('px-4 py-4 border-b border-gray-100 relative', collapsed && 'lg:px-2')}>
          <button
            onClick={onClose}
            className="lg:hidden absolute right-3 top-4 p-2 -mr-1 rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
            aria-label="Fechar menu"
          >
            <X className="w-4 h-4" />
          </button>
          <div className={cn('flex items-center gap-3 pr-9 lg:pr-0', collapsed && 'lg:justify-center')}>
            <img
              src={envLogo[env] || logoUrl}
              alt="Oracullo Calendar"
              className={cn('object-contain', collapsed ? 'lg:w-8 lg:h-8' : 'w-9 h-9')}
            />
            {!collapsed && (
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-gray-900 truncate">{brandTitle}</p>
                <p className="text-[11px] text-gray-400 truncate">Oracullo Calendar</p>
              </div>
            )}
          </div>

          {/* Switcher (2+ opcoes) */}
          {!collapsed && switcherTargets.length > 1 && (
            <div className="relative mt-3">
              <button
                onClick={() => setEnvMenuOpen(v => !v)}
                className="w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg border border-gray-200 bg-gray-50 hover:bg-gray-100 text-sm font-medium text-gray-700 transition-colors"
              >
                <span className="truncate">{currentEnvLabel}</span>
                <ChevronDown className={cn('w-4 h-4 text-gray-400 transition-transform', envMenuOpen && 'rotate-180')} />
              </button>
              {envMenuOpen && (
                <div className="absolute left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden z-50">
                  {switcherTargets.map(t => (
                    <button
                      key={`${t.id}-${t.home}`}
                      onClick={() => {
                        setEnvMenuOpen(false);
                        onClose();
                        navigate(t.home);
                      }}
                      className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm text-gray-700 hover:bg-gray-50 text-left transition-colors"
                    >
                      <span className="text-base leading-none">{t.emoji}</span>
                      <span className="truncate">{t.label}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Workspace atual (contexto sharks/estrategos) */}
          {!collapsed && currentWorkspace && env !== 'oracullo' && (
            <p className="mt-2 text-xs text-gray-500 truncate">
              {env === 'estrategos' || !isSharks ? currentWorkspace.name : `Workspace: ${currentWorkspace.name}`}
            </p>
          )}
          {!collapsed && !currentWorkspace && (isSharks || env === 'estrategos') && (
            <p className="mt-2 text-xs text-gray-500">Todos os clientes</p>
          )}
        </div>

        {/* Scrollable area: nav + footer together so footer is always reachable */}
        <div className="flex-1 overflow-y-auto flex flex-col min-h-0">
          {/* Navigation */}
          <nav className="flex-1 py-4 px-2">
            <ul className="space-y-1">
              {navItems.map((item) => (
                <li key={item.path}>
                  <NavLink
                    to={item.path}
                    end={item.path === '/sharks' || item.path === '/client' || item.path === '/estrategos' || item.path === '/oracullo'}
                    onClick={onClose}
                    className={({ isActive }) =>
                      cn(
                        'relative flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150',
                        isActive
                          ? 'bg-primary-50 text-primary-600'
                          : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900',
                        collapsed && 'justify-center px-2'
                      )
                    }
                  >
                    <item.icon className="w-5 h-5 flex-shrink-0" />
                    {!collapsed && <span>{item.label}</span>}
                    {item.path.endsWith('/access-requests') && pendingRequests > 0 && (
                      <span
                        className={cn(
                          'ml-auto min-w-[20px] h-5 px-1.5 flex items-center justify-center rounded-full bg-red-500 text-white text-[11px] font-bold',
                          collapsed && 'absolute -top-0.5 -right-0.5 ml-0 w-5 px-0'
                        )}
                      >
                        {pendingRequests > 9 ? '9+' : pendingRequests}
                      </span>
                    )}
                  </NavLink>
                </li>
              ))}
            </ul>
          </nav>

          {/* Footer */}
          <div className={cn('border-t border-gray-100 p-3', collapsed && 'lg:p-2')}>
            <div className={cn('flex items-center gap-3', collapsed && 'lg:flex-col lg:gap-2')}>
              <Avatar name={user?.full_name || 'U'} src={user?.avatar_url} size="sm" />
              {!collapsed && (
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{user?.full_name}</p>
                  <p className="text-xs text-gray-500 truncate">{user?.email}</p>
                </div>
              )}
              <button
                onClick={handleSignOut}
                className="hidden lg:block p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                title="Sair"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>

            {/* Mobile (drawer): botão de sair com rótulo, área de toque generosa */}
            <button
              onClick={handleSignOut}
              className="lg:hidden mt-3 w-full flex items-center justify-center gap-2 px-3 py-2.5 min-h-[44px] rounded-lg border border-gray-200 bg-gray-50 text-sm font-medium text-gray-600 hover:bg-red-50 hover:text-red-600 hover:border-red-200 active:bg-red-100 transition-colors"
            >
              <LogOut className="w-4 h-4" />
              Sair da conta
            </button>
          </div>
        </div>

        {/* Collapse toggle */}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="hidden lg:flex absolute -right-3 top-20 w-6 h-6 bg-white border border-gray-200 rounded-full items-center justify-center text-gray-400 hover:text-gray-600 shadow-sm"
        >
          {collapsed ? <ChevronRight className="w-3 h-3" /> : <ChevronLeft className="w-3 h-3" />}
        </button>
      </aside>
    </>
  );
}
