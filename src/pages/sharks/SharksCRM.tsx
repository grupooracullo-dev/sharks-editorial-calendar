import CrmBoard from '@/components/crm/CrmBoard';
import { useAuth } from '@/contexts/AuthContext';

export default function SharksCRM() {
  const { isAdmin } = useAuth();
  return (
    <CrmBoard
      environment="sharks_company"
      canDelete={isAdmin}
      title="CRM"
      subtitle="Da conversão do lead ao cliente recorrente"
    />
  );
}
