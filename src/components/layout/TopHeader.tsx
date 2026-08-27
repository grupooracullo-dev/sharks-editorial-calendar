import { useState, useRef, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { useNotifications } from '@/contexts/NotificationContext';
import { ChevronDown, Bell, Search, Check, X, Menu } from 'lucide-react';
import { cn } from '@/lib/utils';
import Avatar from '@/components/ui/Avatar';
import { useNavigate, useLocation } from 'react-router-dom';
import type { EnvironmentType } from '@/types';

export default function TopHeader({ onOpenMobileNav }: { onOpenMobileNav?: () => void }) {
  const { user, isSharks } = useAuth();
  const { currentWorkspace, workspacesByEnv, setCurrentWorkspace } = useWorkspace();
  const { notifications, unreadCount, markAsRead, markAllAsRead } = useNotifications();
  const [wsDropdownOpen, setWsDropdownOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const navigate = useNavigate();
  const location = useLocation();
  const wsRef = useRef<HTMLDivElement>(null);
  const notifRef = useRef<HTMLDivElement>(null);

  // Ambiente derivado da rota atual — dropdown de clientes nunca mistura ambientes
  const routeEnv: EnvironmentType = location.pathname.startsWith('/estrategos')
    ? 'estrategos'
    : 'sharks_company';
  const workspaces = workspacesByEnv(routeEnv);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (wsRef.current && !wsRef.current.contains(event.target as Node)) {
        setWsDropdownOpen(false);
      }
      if (notifRef.current && !notifRef.current.contains(event.target as Node)) {
        setNotifOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      navigate(`/${routeEnv === 'estrategos' ? 'estrategos' : 'sharks'}/calendar?search=${encodeURIComponent(searchQuery)}`);
    }
  };

  return (
    <header className="sticky top-0 z-30 bg-white border-b border-gray-200 px-3 sm:px-4 lg:px-6 py-3">
      <div className="flex items-center justify-between gap-3">
        {/* Left: menu (mobile) + workspace selector */}
        <div className="flex items-center gap-1 min-w-0">
          {onOpenMobileNav && (
            <button
              onClick={onOpenMobileNav}
              className="lg:hidden p-2 -ml-1 rounded-lg text-gray-600 hover:bg-gray-100 active:bg-gray-200 transition-colors"
              aria-label="Abrir menu"
            >
              <Menu className="w-5 h-5" />
            </button>
          )}

          {/* Workspace Selector (Sharks only) */}
          {isSharks && (
            <div ref={wsRef} className="relative">
            <button
              onClick={() => setWsDropdownOpen(!wsDropdownOpen)}
              className="flex items-center gap-2 px-3 py-2 bg-gray-50 hover:bg-gray-100 rounded-lg transition-colors text-sm font-medium text-gray-700"
            >
              <span className="max-w-[200px] truncate">
                {currentWorkspace ? currentWorkspace.name : 'Todos os clientes'}
              </span>
              <ChevronDown className="w-4 h-4 text-gray-400" />
            </button>

            {wsDropdownOpen && (
              <div className="absolute top-full left-0 mt-1 w-64 bg-white rounded-xl shadow-lg border border-gray-200 py-2 z-50">
                <button
                  onClick={() => {
                    setCurrentWorkspace(null);
                    setWsDropdownOpen(false);
                  }}
                  className={cn(
                    'w-full flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-gray-50 transition-colors',
                    !currentWorkspace && 'bg-primary-50 text-primary-700'
                  )}
                >
                  <div className="w-8 h-8 bg-primary-100 rounded-lg flex items-center justify-center">
                    <span className="text-xs font-bold text-primary-600">T</span>
                  </div>
                  <span className="font-medium">Todos os clientes</span>
                  {!currentWorkspace && <Check className="w-4 h-4 ml-auto text-primary-600" />}
                </button>
                {workspaces.map((ws) => (
                  <button
                    key={ws.id}
                    onClick={() => {
                      setCurrentWorkspace(ws);
                      setWsDropdownOpen(false);
                    }}
                    className={cn(
                      'w-full flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-gray-50 transition-colors',
                      currentWorkspace?.id === ws.id && 'bg-primary-50 text-primary-700'
                    )}
                  >
                    <div className="w-8 h-8 bg-gray-100 rounded-lg flex items-center justify-center">
                      <span className="text-xs font-bold text-gray-600">{ws.name.charAt(0)}</span>
                    </div>
                    <div className="text-left">
                      <p className="font-medium">{ws.name}</p>
                      <p className="text-xs text-gray-400">{ws.segment}</p>
                    </div>
                    {currentWorkspace?.id === ws.id && <Check className="w-4 h-4 ml-auto text-primary-600" />}
                  </button>
                ))}
              </div>
            )}
            </div>
          )}
        </div>

        {/* Search (Sharks only) */}
        {isSharks && (
          <form onSubmit={handleSearch} className="hidden md:flex flex-1 max-w-md">
            <div className="relative w-full">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="Buscar clientes, campanhas, ações..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 text-sm bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-colors"
              />
            </div>
          </form>
        )}

        {/* Right side */}
        <div className="flex items-center gap-2 ml-auto">
          {/* Notifications */}
          <div ref={notifRef} className="relative">
            <button
              onClick={() => setNotifOpen(!notifOpen)}
              className="relative p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <Bell className="w-5 h-5" />
              {unreadCount > 0 && (
                <span className="absolute top-1 right-1 w-4 h-4 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                  {unreadCount}
                </span>
              )}
            </button>

            {notifOpen && (
              <div className="absolute top-full right-0 mt-1 w-80 bg-white rounded-xl shadow-lg border border-gray-200 z-50">
                <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
                  <h3 className="text-sm font-semibold">Notificações</h3>
                  <div className="flex gap-2">
                    <button
                      onClick={markAllAsRead}
                      className="text-xs text-primary-600 hover:text-primary-700"
                    >
                      Marcar todas lidas
                    </button>
                  </div>
                </div>
                <div className="max-h-80 overflow-y-auto">
                  {notifications.length === 0 ? (
                    <div className="p-4 text-center text-sm text-gray-400">
                      Nenhuma notificação
                    </div>
                  ) : (
                    notifications.map((n) => (
                      <button
                        key={n.id}
                        onClick={() => markAsRead(n.id)}
                        className={cn(
                          'w-full flex items-start gap-3 px-4 py-3 text-left hover:bg-gray-50 transition-colors border-b border-gray-50',
                          !n.is_read && 'bg-primary-50/30'
                        )}
                      >
                        <div className={cn('w-2 h-2 rounded-full mt-1.5 flex-shrink-0', n.is_read ? 'bg-gray-300' : 'bg-primary-500')} />
                        <div className="min-w-0 flex-1">
                          <p className={cn('text-sm', !n.is_read && 'font-medium')}>{n.title}</p>
                          {n.message && <p className="text-xs text-gray-500 truncate">{n.message}</p>}
                          <p className="text-xs text-gray-400 mt-1">
                            {new Date(n.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                          </p>
                        </div>
                      </button>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>

          {/* User avatar */}
          <div className="flex items-center gap-2">
            <Avatar name={user?.full_name || 'U'} size="sm" />
            <span className="hidden md:block text-sm font-medium text-gray-700">
              {user?.full_name}
            </span>
          </div>
        </div>
      </div>
    </header>
  );
}
