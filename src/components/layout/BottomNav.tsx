import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';
import {
  SHARKS_NAV,
  CLIENT_NAV,
  ESTRATEGOS_NAV,
  ORACULLO_NAV,
  SHARKS_BOTTOM_PATHS,
  CLIENT_BOTTOM_PATHS,
  ESTRATEGOS_BOTTOM_PATHS,
  ORACULLO_BOTTOM_PATHS,
  ROOT_PATHS,
  flattenNav,
  type NavItem,
} from '@/components/layout/navItems';

function itemsFor(paths: string[], nav: NavItem[]): NavItem[] {
  return paths.map((p) => nav.find((i) => i.path === p)).filter((i): i is NavItem => !!i);
}

export default function BottomNav() {
  const location = useLocation();
  const navigate = useNavigate();
  const { isSharks } = useAuth();

  const navItems =
    location.pathname.startsWith('/estrategos') ? itemsFor(ESTRATEGOS_BOTTOM_PATHS, flattenNav(ESTRATEGOS_NAV))
    : location.pathname.startsWith('/oracullo') ? itemsFor(ORACULLO_BOTTOM_PATHS, flattenNav(ORACULLO_NAV))
    : location.pathname.startsWith('/client') ? itemsFor(CLIENT_BOTTOM_PATHS, flattenNav(CLIENT_NAV))
    : isSharks ? itemsFor(SHARKS_BOTTOM_PATHS, flattenNav(SHARKS_NAV))
    : itemsFor(CLIENT_BOTTOM_PATHS, flattenNav(CLIENT_NAV));

  const isActive = (path: string) => {
    if (ROOT_PATHS.includes(path)) {
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
                'relative flex flex-col items-center justify-center gap-0.5 w-full h-full min-h-[44px] transition-colors',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary-500',
                active
                  ? 'text-primary-600 before:absolute before:top-0 before:left-1/2 before:-translate-x-1/2 before:h-0.5 before:w-8 before:rounded-b-full before:bg-primary-600 before:content-[""]'
                  : 'text-gray-400 active:text-gray-600'
              )}
            >
              <item.icon className="w-5 h-5" />
              <span className="text-[10px] font-medium leading-tight">{item.shortLabel ?? item.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
