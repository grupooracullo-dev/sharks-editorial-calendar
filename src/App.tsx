import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'sonner';
import ErrorBoundary from '@/components/ErrorBoundary';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import { WorkspaceProvider, useWorkspace } from '@/contexts/WorkspaceContext';
import { NotificationProvider } from '@/contexts/NotificationContext';
import { loadActions } from '@/lib/actionService';
import { loadCampaigns } from '@/hooks/useCampaigns';
import { loadEditorial } from '@/hooks/useEditorial';
import { useIntegration } from '@/hooks/useIntegration';
import { SharksLayout, ClientLayout } from '@/components/layout/AppLayout';
import LoginPage from '@/pages/auth/LoginPage';
import SharksDashboard from '@/pages/sharks/SharksDashboard';
import SharksCalendarPage from '@/pages/sharks/SharksCalendar';
import SharksClients from '@/pages/sharks/SharksClients';
import SharksCampaigns from '@/pages/sharks/SharksCampaigns';
import SharksEditorial from '@/pages/sharks/SharksEditorial';
import SharksTemplates from '@/pages/sharks/SharksTemplates';
import SharksHistory from '@/pages/sharks/SharksHistory';
import SharksChat from '@/pages/sharks/SharksChat';
import SharksIntegrations from '@/pages/sharks/SharksIntegrations';
import SharksSettings from '@/pages/sharks/SharksSettings';
import SharksTeam from '@/pages/sharks/SharksTeam';
import ClientDashboard from '@/pages/client/ClientDashboard';
import ClientCalendar from '@/pages/client/ClientCalendar';
import ClientHistory from '@/pages/client/ClientHistory';
import ClientChat from '@/pages/client/ClientChat';

function DataSync() {
  const { user } = useAuth();
  const { currentWorkspace } = useWorkspace();

  // Keeps the Google connection flag fresh globally (realtime)
  useIntegration(currentWorkspace?.id);

  useEffect(() => {
    if (!user) return;
    const scope = currentWorkspace?.id || null;
    loadActions(scope);
    loadCampaigns(scope);
    loadEditorial(scope);
  }, [user?.id, currentWorkspace?.id]);

  return null;
}

function AppRoutes() {
  const { user, loading, isSharks, isClient } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="w-12 h-12 border-4 border-primary-200 border-t-primary-500 rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) {
    return (
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    );
  }

  const homePath = isSharks ? '/sharks' : '/client';

  return (
    <Routes>
      <Route path="/login" element={<Navigate to={homePath} replace />} />

      {/* Sharks routes */}
      <Route path="/sharks" element={<SharksLayout><SharksDashboard /></SharksLayout>} />
      <Route path="/sharks/calendar" element={<SharksLayout><SharksCalendarPage /></SharksLayout>} />
      <Route path="/sharks/clients" element={<SharksLayout><SharksClients /></SharksLayout>} />
      <Route path="/sharks/campaigns" element={<SharksLayout><SharksCampaigns /></SharksLayout>} />
      <Route path="/sharks/editorial" element={<SharksLayout><SharksEditorial /></SharksLayout>} />
      <Route path="/sharks/templates" element={<SharksLayout><SharksTemplates /></SharksLayout>} />
      <Route path="/sharks/history" element={<SharksLayout><SharksHistory /></SharksLayout>} />
      <Route path="/sharks/chat" element={<SharksLayout><SharksChat /></SharksLayout>} />
      <Route path="/sharks/integrations" element={<SharksLayout><SharksIntegrations /></SharksLayout>} />
      <Route path="/sharks/team" element={<SharksLayout><SharksTeam /></SharksLayout>} />
      <Route path="/sharks/settings" element={<SharksLayout><SharksSettings /></SharksLayout>} />

      {/* Client routes */}
      <Route path="/client" element={<ClientLayout><ClientDashboard /></ClientLayout>} />
      <Route path="/client/calendar" element={<ClientLayout><ClientCalendar /></ClientLayout>} />
      <Route path="/client/history" element={<ClientLayout><ClientHistory /></ClientLayout>} />
      <Route path="/client/chat" element={<ClientLayout><ClientChat /></ClientLayout>} />

      {/* Fallback */}
      <Route path="*" element={
        isClient
          ? <Navigate to="/client" replace />
          : isSharks
            ? <Navigate to="/sharks" replace />
            : <Navigate to="/login" replace />
      } />
    </Routes>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <AuthProvider>
          <WorkspaceProvider>
            <NotificationProvider>
              <DataSync />
              <AppRoutes />
              <Toaster position="bottom-right" richColors closeButton />
            </NotificationProvider>
          </WorkspaceProvider>
        </AuthProvider>
      </BrowserRouter>
    </ErrorBoundary>
  );
}
