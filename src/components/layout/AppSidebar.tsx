import { useState, useEffect } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { supabase } from '@/lib/supabase';
import Avatar from '@/components/ui/Avatar';
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
  Menu,
  UserCog,
  UserPlus,
} from 'lucide-react';
import logoUrl from '/logo.png?url';

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
];

export default function AppSidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const { user, signOut, isSharks, isAdmin } = useAuth();
  const { currentWorkspace } = useWorkspace();
  const navigate = useNavigate();
  const [pendingRequests, setPendingRequests] = useState(0);

  // Badge: contagem de solicitações de acesso pendentes (admin only)
  useEffect(() => {
    if (!isAdmin) return;

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
  }, [isAdmin]);

  const navItems = isSharks
    ? sharksNavItems.filter(i => !i.adminOnly || isAdmin)
    : clientNavItems;

  const handleSignOut = async () => {
    await signOut();
    navigate('/login');
  };

  return (
    <>
      {/* Mobile menu button */}
      <button
        className="lg:hidden fixed top-4 left-4 z-50 p-2 bg-white rounded-lg shadow-md"
        onClick={() => setMobileOpen(!mobileOpen)}
      >
        <Menu className="w-5 h-5" />
      </button>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="lg:hidden fixed inset-0 bg-black/30 z-40"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          'fixed left-0 top-0 h-full bg-white border-r border-gray-200 z-40 flex flex-col transition-all duration-300',
          collapsed ? 'w-[68px]' : 'w-[240px]',
          mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        )}
      >
        {/* Logo */}
        <div className={cn('flex items-center gap-3 px-4 py-5 border-b border-gray-100', collapsed && 'justify-center px-2')}>
          <img
            src={logoUrl}
            alt="Sharks Company"
            className={cn('object-contain', collapsed ? 'w-8 h-8' : 'w-10 h-10')}
          />
          {!collapsed && (
            <div className="min-w-0">
              <p className="text-sm font-bold text-gray-900 truncate">Sharks Company</p>
              {currentWorkspace && (
                <p className="text-xs text-gray-500 truncate">
                  {isSharks ? `Workspace: ${currentWorkspace.name}` : currentWorkspace.name}
                </p>
              )}
              {!currentWorkspace && isSharks && (
                <p className="text-xs text-gray-500">Todos os clientes</p>
              )}
            </div>
          )}
        </div>

        {/* Navigation */}
        <nav className="flex-1 py-4 px-2 overflow-y-auto">
          <ul className="space-y-1">
            {navItems.map((item) => (
              <li key={item.path}>
                <NavLink
                  to={item.path}
                  end={item.path === '/sharks' || item.path === '/client'}
                  onClick={() => setMobileOpen(false)}
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
                  {item.path === '/sharks/access-requests' && pendingRequests > 0 && (
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
        <div className={cn('border-t border-gray-100 p-3', collapsed && 'p-2')}>
          <div className={cn('flex items-center gap-3', collapsed && 'flex-col gap-2')}>
            <Avatar name={user?.full_name || 'U'} size="sm" />
            {!collapsed && (
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">{user?.full_name}</p>
                <p className="text-xs text-gray-500 truncate">{user?.email}</p>
              </div>
            )}
            <button
              onClick={handleSignOut}
              className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
              title="Sair"
            >
              <LogOut className="w-4 h-4" />
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
