import ProspectingPage from '@/components/prospecting/ProspectingPage';
import { useAuth } from '@/contexts/AuthContext';

export default function SharksProspecting() {
  const { isAdmin } = useAuth();
  return <ProspectingPage environment="sharks_company" canDelete={isAdmin} />;
}
