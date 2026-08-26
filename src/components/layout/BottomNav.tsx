import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';
import { LayoutDashboard, Calendar, Users, MessageSquare, History, Link2, Briefcase, Presentation, Rocket, ShieldCheck } from 'lucide-react';

const sharksNavItems = [
  { path: '/sharks', icon: LayoutDashboard, label: 'Home' },
  { path: '/sharks/calendar', icon: Calendar, label: 'Calendário' },
  { path: '/sharks/clients', icon: Users, label: 'Clientes' },
  { path: '/sharks/chat', icon: MessageSquare, label: 'Chat' },
];

const clientNavItems = [
  { path: '/client', icon: LayoutDashboard, label: 'Início' },
  { path: '/client/calendar', icon: Calendar, label: 'Calendário' },
  { path: '/client/history', icon: History, label: 'Histórico' },
  { path: '/client/chat', icon: MessageSquare, label: 'Chat' },
  { path: '/client/integrations', icon: Link2, label: 'Integrações' },
];

const estrategosNavItems = [
  { path: '/estrategos', icon: LayoutDashboard, label: 'Home' },
  { path: '/estrategos/projects', icon: Briefcase, label: 'Projetos' },
  { path: '/estrategos/meetings', icon: Presentation, label: 'Reuniões' },
  { path: '/estrategos/chat', icon: MessageSquare, label: 'Chat' },
];

const oraculloNavItems = [
  { path: '/oracullo', icon: LayoutDashboard, label: 'Home' },
  { path: '/oracullo/access', icon: ShieldCheck, label: 'Acessos' },
  { path: '/oracullo/users', icon: Users, label: 'Usuários' },
];

export default function BottomNav() {
  const location = useLocation();
  const navigate = useNavigate();
  const { isSharks } = useAuth();

  const navItems =
    location.pathname.startsWith('/estrategos') ? estrategosNavItems
    : location.pathname.startsWith('/oracullo') ? oraculloNavItems
    : isSharks ? sharksNavItems
    : clientNavItems;

  const isActive = (path: string) => {
    if (path === '/sharks' || path === '/client' || path === '/estrategos' || path === '/oracullo') {
      return location.pathname === path || location.pathname === path + '/';
    }
    return location.pathname.startsWith(path);
  };

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 lg:hidden bg-white border-t border-gray-200 safe-area-bottom">
      <div className="flex items-center justify-around h-14">
        {navItems.map(item => {
          const active = isActive(item.path);
          return (
            <button
              key={item.path}
              onClick={() => navigate(item.path)}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'flex flex-col items-center justify-center gap-0.5 w-full h-full min-h-[44px] transition-colors',
                active ? 'text-primary-500' : 'text-gray-400 active:text-gray-600'
              )}
            >
              <item.icon className="w-5 h-5" />
              <span className="text-[10px] font-medium leading-tight">{item.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
