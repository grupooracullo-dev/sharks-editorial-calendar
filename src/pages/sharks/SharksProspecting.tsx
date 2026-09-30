import ProspectingHub from '@/components/prospecting/ProspectingHub';
import { useAuth } from '@/contexts/AuthContext';

export default function SharksProspecting() {
  const { isAdmin } = useAuth();
  return <ProspectingHub environment="sharks_company" editable={isAdmin} />;
}
