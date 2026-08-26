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
import { SharksLayout, ClientLayout, EstrategosLayout, OraculloLayout } from '@/components/layout/AppLayout';
import LoginPage from '@/pages/auth/LoginPage';
import RequestAccess from '@/pages/auth/RequestAccess';
import AuthGate from '@/pages/auth/AuthGate';
import EnvironmentSelector from '@/pages/auth/EnvironmentSelector';
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
import SharksAccessRequests from '@/pages/sharks/SharksAccessRequests';
import ClientDashboard from '@/pages/client/ClientDashboard';
import ClientCalendar from '@/pages/client/ClientCalendar';
import ClientHistory from '@/pages/client/ClientHistory';
import ClientChat from '@/pages/client/ClientChat';
import ClientIntegrations from '@/pages/client/ClientIntegrations';
import EstrategosDashboard from '@/pages/estrategos/EstrategosDashboard';
import EstrategosCalendar from '@/pages/estrategos/EstrategosCalendar';
import EstrategosProjects from '@/pages/estrategos/EstrategosProjects';
import EstrategosChat from '@/pages/estrategos/EstrategosChat';
import EstrategosClients from '@/pages/estrategos/EstrategosClients';
import EstrategosIntegrations from '@/pages/estrategos/EstrategosIntegrations';
import OraculloDashboard from '@/pages/oracullo/OraculloDashboard';
import OraculloAccess from '@/pages/oracullo/OraculloAccess';
import OraculloUsers from '@/pages/oracullo/OraculloUsers';

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

/** Home inteligente multi-ambiente (migration 023). */
function useHomePath(): string {
  const { isOracullo, isSharks, hasAccess, environments, user } = useAuth();
  if (!user) return '/login';
  if (isOracullo) return '/oracullo';
  if (environments.length === 0) return '/auth-gate';
  if (environments.length > 1) return '/select-environment';
  if (hasAccess('estrategos', ['admin', 'team'])) return '/estrategos';
  if (isSharks) return '/sharks';
  return '/client';
}

function AppRoutes() {
  const { user, authUser, loading, isSharks, isClient } = useAuth();
  const homePath = useHomePath();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="w-12 h-12 border-4 border-primary-200 border-t-primary-500 rounded-full animate-spin" />
      </div>
    );
  }

  // Not signed in at all — show login/request-access only
  if (!authUser) {
    return (
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/request-access" element={<RequestAccess />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    );
  }

  // Signed in via Google (or password) but no profile row yet —
  // the admin hasn't approved the access request. AuthGate
  // handles the pending/rejected realtime flow or shows the form.
  if (!user) {
    return (
      <Routes>
        {/* Allow direct access to the request page if a specific
            workspace was requested by the admin before approval */}
        <Route path="/request-access" element={<RequestAccess authUser={authUser} onSubmitted={() => {}} />} />
        <Route path="*" element={<AuthGate />} />
      </Routes>
    );
  }

  return (
    <Routes>
      <Route path="/login" element={<Navigate to={homePath} replace />} />
      <Route path="/select-environment" element={<EnvironmentSelector />} />

      {/* Oracullo (governança multi-ambiente) */}
      <Route path="/oracullo" element={<OraculloLayout><OraculloDashboard /></OraculloLayout>} />
      <Route path="/oracullo/access" element={<OraculloLayout><OraculloAccess /></OraculloLayout>} />
      <Route path="/oracullo/users" element={<OraculloLayout><OraculloUsers /></OraculloLayout>} />

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
      <Route path="/sharks/access-requests" element={<SharksLayout><SharksAccessRequests /></SharksLayout>} />
      <Route path="/sharks/settings" element={<SharksLayout><SharksSettings /></SharksLayout>} />

      {/* Client routes */}
      <Route path="/client" element={<ClientLayout><ClientDashboard /></ClientLayout>} />
      <Route path="/client/calendar" element={<ClientLayout><ClientCalendar /></ClientLayout>} />
      <Route path="/client/history" element={<ClientLayout><ClientHistory /></ClientLayout>} />
      <Route path="/client/chat" element={<ClientLayout><ClientChat /></ClientLayout>} />
      <Route path="/client/integrations" element={<ClientLayout><ClientIntegrations /></ClientLayout>} />

      {/* Estrategos routes */}
      <Route path="/estrategos" element={<EstrategosLayout><EstrategosDashboard /></EstrategosLayout>} />
      <Route path="/estrategos/calendar" element={<EstrategosLayout><EstrategosCalendar /></EstrategosLayout>} />
      <Route path="/estrategos/projects" element={<EstrategosLayout><EstrategosProjects /></EstrategosLayout>} />
      <Route path="/estrategos/chat" element={<EstrategosLayout><EstrategosChat /></EstrategosLayout>} />
      <Route path="/estrategos/clients" element={<EstrategosLayout><EstrategosClients /></EstrategosLayout>} />
      <Route path="/estrategos/integrations" element={<EstrategosLayout><EstrategosIntegrations /></EstrategosLayout>} />

      {/* Fallback */}
      <Route path="*" element={<Navigate to={homePath} replace />} />
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
