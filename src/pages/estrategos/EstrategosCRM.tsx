import CrmBoard from '@/components/crm/CrmBoard';
import { useAuth } from '@/contexts/AuthContext';

export default function EstrategosCRM() {
  const { hasAccess } = useAuth();
  return (
    <CrmBoard
      environment="estrategos"
      canDelete={hasAccess('estrategos', ['admin'])}
      title="CRM"
      subtitle="Da conversão do lead ao cliente recorrente"
    />
  );
}
