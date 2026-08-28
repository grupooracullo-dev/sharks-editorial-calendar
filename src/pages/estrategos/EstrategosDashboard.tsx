import { useNavigate } from 'react-router-dom';
import DashboardOverview from '@/components/dashboard/DashboardOverview';
import {
  Briefcase,
  CalendarDays,
  Clock,
  AlertTriangle,
} from 'lucide-react';

export default function EstrategosDashboard() {
  const navigate = useNavigate();
  return (
    <DashboardOverview
      env="estrategos"
      title="Estrategos — Visão Geral"
      subtitle="Gestão empresarial: projetos, reuniões e implantações"
      calendarPath="/estrategos/calendar"
      stats={[
        { icon: Briefcase, label: 'Clientes ativos', key: 'activeClients', onClick: () => navigate('/estrategos/clients') },
        { icon: CalendarDays, label: 'Ações esta semana', key: 'actionsThisWeek' },
        { icon: Clock, label: 'Programadas', key: 'scheduled' },
        { icon: AlertTriangle, label: 'Atrasadas', key: 'overdue', iconBg: 'bg-red-50 text-red-600' },
        { icon: CalendarDays, label: 'Pendências', key: 'pending' },
      ]}
      showClientsSection={false}
      next7Variant="grid"
    />
  );
}