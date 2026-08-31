import { ReactNode, useState } from 'react';
import AppSidebar from './AppSidebar';
import TopHeader from './TopHeader';
import BottomNav from './BottomNav';
import { useAuth } from '@/contexts/AuthContext';
import { Navigate } from 'react-router-dom';
import { useOverdueSweep } from '@/hooks/useOverdueSweep';

interface AppLayoutProps {
  children: ReactNode;
}

export default function AppLayout({ children }: AppLayoutProps) {
  const { user, loading, isSharks } = useAuth();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-primary-200 border-t-primary-500 rounded-full animate-spin" />
          <p className="text-sm text-gray-500">Carregando...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <AppSidebar open={mobileNavOpen} onClose={() => setMobileNavOpen(false)} />
      <div className="lg:ml-[240px] transition-all duration-300">
        <TopHeader onOpenMobileNav={() => setMobileNavOpen(true)} />
        <main className="p-4 pb-[calc(3.5rem+env(safe-area-inset-bottom))] lg:pb-6">
          {children}
        </main>
      </div>
      <BottomNav />
    </div>
  );
}

// Layout for Sharks pages only
export function SharksLayout({ children }: { children: ReactNode }) {
  const { isSharks, loading } = useAuth();
  useOverdueSweep(isSharks);

  if (loading) return null;
  if (!isSharks) return <Navigate to="/client" replace />;

  return <AppLayout>{children}</AppLayout>;
}

// Layout for Client pages only
export function ClientLayout({ children }: { children: ReactNode }) {
  const { isClient, loading } = useAuth();

  if (loading) return null;
  if (!isClient) return <Navigate to="/sharks" replace />;

  return <AppLayout>{children}</AppLayout>;
}

// Layout for Estrategos pages (staff do ambiente estrategos)
export function EstrategosLayout({ children }: { children: ReactNode }) {
  const { hasAccess, loading } = useAuth();
  const isEstrategos = hasAccess('estrategos', ['admin', 'team']);
  useOverdueSweep(isEstrategos);

  if (loading) return null;
  if (!isEstrategos) return <Navigate to="/sharks" replace />;

  return <AppLayout>{children}</AppLayout>;
}

// Layout for Oracullo pages (admin global apenas)
export function OraculloLayout({ children }: { children: ReactNode }) {
  const { isOracullo, loading } = useAuth();

  if (loading) return null;
  if (!isOracullo) return <Navigate to="/sharks" replace />;

  return <AppLayout>{children}</AppLayout>;
}
