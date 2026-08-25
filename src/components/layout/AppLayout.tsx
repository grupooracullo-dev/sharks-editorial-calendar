import { ReactNode } from 'react';
import AppSidebar from './AppSidebar';
import TopHeader from './TopHeader';
import BottomNav from './BottomNav';
import { useAuth } from '@/contexts/AuthContext';
import { Navigate } from 'react-router-dom';

interface AppLayoutProps {
  children: ReactNode;
}

export default function AppLayout({ children }: AppLayoutProps) {
  const { user, loading, isSharks } = useAuth();

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
      <AppSidebar />
      <div className="lg:ml-[240px] transition-all duration-300">
        <TopHeader />
        <main className="p-4 pb-20 lg:pb-6">
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
