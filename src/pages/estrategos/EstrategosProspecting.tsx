import ProspectingHub from '@/components/prospecting/ProspectingHub';
import { useAuth } from '@/contexts/AuthContext';

export default function EstrategosProspecting() {
  const { hasAccess } = useAuth();
  return <ProspectingHub environment="estrategos" editable={hasAccess('estrategos', ['admin'])} />;
}
