import { useNavigate } from 'react-router-dom';
import DashboardOverview from '@/components/dashboard/DashboardOverview';
import {
  Users,
  CalendarDays,
  FileText,
  Clock,
  AlertTriangle,
} from 'lucide-react';

export default function SharksDashboard() {
  const navigate = useNavigate();
  return (
    <DashboardOverview
      env="sharks_company"
      title="Visão Geral"
      subtitle="Acompanhe tudo que está acontecendo"
      calendarPath="/sharks/calendar"
      stats={[
        { icon: Users, label: 'Clientes ativos', key: 'activeClients', onClick: () => navigate('/sharks/clients') },
        { icon: CalendarDays, label: 'Ações esta semana', key: 'actionsThisWeek' },
        { icon: FileText, label: 'Conteúdos programados', key: 'scheduled' },
        { icon: Clock, label: 'Pendências', key: 'pending' },
        { icon: AlertTriangle, label: 'Atrasadas', key: 'overdue', iconBg: 'bg-red-50 text-red-600' },
      ]}
      showClientsSection
      next7Variant="list"
    />
  );
}