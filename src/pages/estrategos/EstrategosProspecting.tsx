import ProspectingPage from '@/components/prospecting/ProspectingPage';
import { useAuth } from '@/contexts/AuthContext';

export default function EstrategosProspecting() {
  const { hasAccess } = useAuth();
  return <ProspectingPage environment="estrategos" canDelete={hasAccess('estrategos', ['admin'])} />;
}
