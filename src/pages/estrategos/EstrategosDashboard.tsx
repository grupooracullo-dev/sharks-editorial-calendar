import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Card, { CardHeader, CardTitle } from '@/components/ui/Card';
import StatsCard from '@/components/dashboard/StatsCard';
import Badge from '@/components/ui/Badge';
import { supabase } from '@/lib/supabase';
import { formatDate } from '@/lib/utils';
import type { EstrategosProject, EstrategosMeeting, EstrategosImplementation } from '@/types';
import { Briefcase, Presentation, Rocket, CalendarDays, Clock, AlertTriangle } from 'lucide-react';

export default function EstrategosDashboard() {
  const navigate = useNavigate();
  const [projects, setProjects] = useState<EstrategosProject[]>([]);
  const [meetings, setMeetings] = useState<EstrategosMeeting[]>([]);
  const [impls, setImpls] = useState<EstrategosImplementation[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      const [p, m, i] = await Promise.all([
        supabase.from('estrategos_projects').select('*').order('created_at', { ascending: false }),
        supabase.from('estrategos_meetings').select('*').order('meeting_date').neq('status', 'cancelled'),
        supabase.from('estrategos_implementations').select('*').order('target_date').neq('status', 'cancelled'),
      ]);
      if (!mounted) return;
      setProjects((p.data as unknown as EstrategosProject[]) ?? []);
      setMeetings((m.data as unknown as EstrategosMeeting[]) ?? []);
      setImpls((i.data as unknown as EstrategosImplementation[]) ?? []);
      setLoading(false);
    };
    load();

    const channel = supabase
      .channel('estrategos-dash')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'estrategos_projects' }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'estrategos_meetings' }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'estrategos_implementations' }, load)
      .subscribe();
    return () => { supabase.removeChannel(channel); mounted = false; };
  }, []);

  const today = new Date().toISOString().slice(0, 10);
  const activeProjects = projects.filter(p => p.status === 'active');
  const upcomingMeetings = meetings.filter(m => m.meeting_date >= today).slice(0, 6);
  const pendingImpls = impls.filter(i => i.status === 'pending' || i.status === 'in_progress');
  const blockedImpls = impls.filter(i => i.status === 'blocked');

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Estrategos — Visão Geral</h1>
        <p className="text-sm text-gray-500 mt-0.5">Gestão empresarial: projetos, reuniões e implantações</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        <StatsCard icon={Briefcase} label="Projetos ativos" value={activeProjects.length} onClick={() => navigate('/estrategos/projects')} />
        <StatsCard icon={Presentation} label="Reuniões agendadas" value={upcomingMeetings.length} onClick={() => navigate('/estrategos/meetings')} />
        <StatsCard icon={Rocket} label="Implantações" value={pendingImpls.length} onClick={() => navigate('/estrategos/implementations')} />
        <StatsCard icon={AlertTriangle} label="Bloqueadas" value={blockedImpls.length} iconBg="bg-red-50 text-red-600" onClick={() => navigate('/estrategos/implementations')} />
        <StatsCard icon={CalendarDays} label="Total projetos" value={projects.length} onClick={() => navigate('/estrategos/projects')} />
      </div>

      {loading ? (
        <Card><p className="text-sm text-gray-400 py-8 text-center">Carregando...</p></Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Próximas reuniões</CardTitle>
              <button onClick={() => navigate('/estrategos/meetings')} className="text-xs text-primary-600 hover:text-primary-700">
                Ver todas
              </button>
            </CardHeader>
            {upcomingMeetings.length === 0 ? (
              <p className="text-sm text-gray-500 py-8 text-center">Nenhuma reunião agendada</p>
            ) : (
              <div className="space-y-2">
                {upcomingMeetings.map(m => (
                  <div key={m.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{m.title}</p>
                      <p className="text-xs text-gray-500 flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {formatDate(m.meeting_date)}{m.meeting_time ? ` · ${m.meeting_time.slice(0, 5)}` : ''}
                      </p>
                    </div>
                    <Badge variant={m.status === 'scheduled' ? 'info' : 'success'} size="sm">
                      {m.status === 'scheduled' ? 'Agendada' : m.status === 'completed' ? 'Realizada' : 'Cancelada'}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Implantações em andamento</CardTitle>
              <button onClick={() => navigate('/estrategos/implementations')} className="text-xs text-primary-600 hover:text-primary-700">
                Ver todas
              </button>
            </CardHeader>
            {pendingImpls.length === 0 ? (
              <p className="text-sm text-gray-500 py-8 text-center">Nenhuma implantação pendente</p>
            ) : (
              <div className="space-y-2">
                {pendingImpls.slice(0, 6).map(i => (
                  <div key={i.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{i.name}</p>
                      <p className="text-xs text-gray-500 truncate">
                        {i.system_name ? `${i.system_name} · ` : ''}{i.target_date ? formatDate(i.target_date) : 'Sem data'}
                      </p>
                    </div>
                    <Badge variant={i.status === 'in_progress' ? 'info' : i.status === 'blocked' ? 'danger' : 'default'} size="sm">
                      {i.status === 'in_progress' ? 'Em andamento' : i.status === 'blocked' ? 'Bloqueada' : 'Pendente'}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}
