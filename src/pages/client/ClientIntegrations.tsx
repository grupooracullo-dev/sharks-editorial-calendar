import { useEffect, useState } from 'react';
import Card, { CardHeader, CardTitle } from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { useAuth } from '@/contexts/AuthContext';
import { useIntegration } from '@/hooks/useIntegration';
import {
  startGoogleConnect,
  processQueue,
  listCalendars,
  setTargetCalendar,
  disconnectCalendar,
  setAutoSync,
  type GoogleCalendarOption,
} from '@/lib/googleSync';
import { toast } from 'sonner';
import {
  Calendar,
  CheckCircle2,
  XCircle,
  RefreshCw,
  Link as LinkIcon,
  Clock,
  Zap,
  AlertTriangle,
  Loader2,
  Unlink,
  ChevronRight,
  Mail,
} from 'lucide-react';

function formatDateTime(iso: string | null): string {
  if (!iso) return 'Nunca';
  return new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

export default function ClientIntegrations() {
  const { currentWorkspace } = useWorkspace();
  const { user } = useAuth();
  const { integration, loading } = useIntegration(currentWorkspace?.id);

  const [syncing, setSyncing] = useState(false);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);
  const [showCalendars, setShowCalendars] = useState(false);
  const [calendars, setCalendars] = useState<GoogleCalendarOption[] | null>(null);
  const [loadingCalendars, setLoadingCalendars] = useState(false);

  // Resultado do redirect do OAuth
  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    const g = sp.get('google');
    if (!g) return;
    if (g === 'connected') toast.success('Google Calendar conectado com sucesso!');
    else if (g === 'denied') toast.error('Permissão negada na conta Google.');
    else {
      const reason = sp.get('reason');
      const msg =
        reason === 'sem_permissao_calendario'
          ? 'A permissão do Google Calendar não foi marcada. Tente de novo e marque TODAS as caixinhas na tela do Google.'
          : reason === 'sem_acesso'
          ? 'Sua conta não tem acesso a este workspace.'
          : `Falha na conexão: ${reason ? decodeURIComponent(reason) : g}`;
      toast.error(msg, { duration: 8000 });
    }
    window.history.replaceState({}, '', window.location.pathname);
  }, []);

  if (!currentWorkspace) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Integrações</CardTitle>
        </CardHeader>
        <p className="text-sm text-gray-500">Nenhum workspace vinculado à sua conta.</p>
      </Card>
    );
  }

  const isConnected = !!integration?.is_connected;
  const calDisplayName =
    integration?.google_calendar_name && integration.google_calendar_name !== integration.google_account_email
      ? integration.google_calendar_name
      : 'Primária';

  const handleConnect = () => {
    if (!user) return;
    startGoogleConnect(currentWorkspace.id, user.id, '/client/integrations');
  };

  const handleSyncNow = async () => {
    if (syncing) return;
    setSyncing(true);
    try {
      const res = await processQueue(currentWorkspace.id);
      if (res.failed) {
        toast.warning(`${res.ok ?? 0} sincronizado(s), ${res.failed} falharam. Tentaremos novamente automaticamente.`);
      } else if (res.processed) {
        toast.success(`${res.processed} item(ns) sincronizado(s) com o Google Calendar.`);
      } else {
        toast.success('Tudo sincronizado.');
      }
    } catch (e) {
      toast.error(`Erro ao sincronizar: ${(e as Error).message}`);
    } finally {
      setSyncing(false);
    }
  };

  const handleToggleAuto = async () => {
    if (!integration) return;
    try {
      await setAutoSync(currentWorkspace.id, !integration.auto_sync);
      toast.success(integration.auto_sync ? 'Sincronização automática pausada.' : 'Sincronização automática ativada.');
    } catch (e) {
      toast.error(`Erro: ${(e as Error).message}`);
    }
  };

  const handleDisconnect = async () => {
    setConfirmDisconnect(false);
    try {
      await disconnectCalendar(currentWorkspace.id);
      toast.success('Google Calendar desconectado.');
    } catch (e) {
      toast.error(`Erro: ${(e as Error).message}`);
    }
  };

  const handleLoadCalendars = async () => {
    setLoadingCalendars(true);
    try {
      const res = await listCalendars(currentWorkspace.id);
      setCalendars(res.calendars);
    } catch (e) {
      toast.error(`Erro ao listar agendas: ${(e as Error).message}`);
    } finally {
      setLoadingCalendars(false);
    }
  };

  const handlePickCalendar = async (cal: GoogleCalendarOption) => {
    try {
      await setTargetCalendar(currentWorkspace.id, cal.id, cal.name);
      toast.success(`Agenda destino: ${cal.name}`);
    } catch (e) {
      toast.error(`Erro: ${(e as Error).message}`);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Integrações</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Conecte o Google Calendar de <strong>{currentWorkspace.name}</strong>
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="w-5 h-5 text-primary-500" />
            Google Calendar
          </CardTitle>
          {loading ? (
            <span className="flex items-center gap-1 text-xs text-gray-400">
              <Loader2 className="w-3 h-3 animate-spin" /> Carregando
            </span>
          ) : (
            <span
              className={`flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${
                isConnected ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-500'
              }`}
            >
              {isConnected ? (
                <>
                  <CheckCircle2 className="w-3 h-3" /> Conectado
                </>
              ) : (
                <>
                  <XCircle className="w-3 h-3" /> Não conectado
                </>
              )}
            </span>
          )}
        </CardHeader>

        {!loading && integration?.sync_error && (
          <div className="mb-4 flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg p-3">
            <AlertTriangle className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
            <p className="text-xs text-red-700">{integration.sync_error}</p>
          </div>
        )}

        {!isConnected ? (
          <>
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 mb-4">
              <p className="text-sm font-medium text-gray-900 mb-1">Conecte a sua conta Google</p>
              <p className="text-xs text-gray-500 leading-relaxed">
                Ao conectar, o cronograma completo de <strong>{currentWorkspace.name}</strong> —
                criações, edições e cancelamentos — é enviado automaticamente para a sua agenda
                do Google Calendar, em tempo quase real.
              </p>
            </div>
            <Button onClick={handleConnect}>
              <LinkIcon className="w-4 h-4" />
              Conectar minha conta Google
            </Button>
          </>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                <Mail className="w-4 h-4 text-gray-400 shrink-0" />
                <div className="min-w-0">
                  <p className="text-[11px] uppercase tracking-wide text-gray-400 font-medium">Conta Google</p>
                  <p className="text-sm text-gray-900 truncate">{integration?.google_account_email ?? '—'}</p>
                </div>
              </div>
              <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                <Clock className="w-4 h-4 text-gray-400 shrink-0" />
                <div className="min-w-0">
                  <p className="text-[11px] uppercase tracking-wide text-gray-400 font-medium">Última sincronização</p>
                  <p className="text-sm text-gray-900 truncate">{formatDateTime(integration?.last_synced_at ?? null)}</p>
                </div>
              </div>
              <button
                onClick={() => {
                  setShowCalendars(v => {
                    if (!v && !calendars) handleLoadCalendars();
                    return !v;
                  });
                }}
                className="flex items-center justify-between gap-3 p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors text-left"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <Calendar className="w-4 h-4 text-gray-400 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-[11px] uppercase tracking-wide text-gray-400 font-medium">Agenda destino</p>
                    <p className="text-sm text-gray-900 truncate">{calDisplayName}</p>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-gray-300 shrink-0" />
              </button>
              <button
                role="switch"
                aria-checked={!!integration?.auto_sync}
                onClick={handleToggleAuto}
                className="flex items-center justify-between gap-3 p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors text-left"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <Zap className={`w-4 h-4 shrink-0 ${integration?.auto_sync ? 'text-primary-500' : 'text-gray-400'}`} />
                  <div className="min-w-0">
                    <p className="text-[11px] uppercase tracking-wide text-gray-400 font-medium">Sync automático</p>
                    <p className="text-sm text-gray-900">{integration?.auto_sync ? 'Ativado' : 'Pausado'}</p>
                  </div>
                </div>
                <span
                  className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${
                    integration?.auto_sync ? 'bg-primary-500' : 'bg-gray-300'
                  }`}
                >
                  <span
                    className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${
                      integration?.auto_sync ? 'translate-x-[18px]' : 'translate-x-[3px]'
                    }`}
                  />
                </span>
              </button>
            </div>

            {showCalendars && (
              <div className="border border-gray-200 rounded-lg divide-y divide-gray-100 max-h-56 overflow-y-auto">
                {loadingCalendars && (
                  <div className="flex items-center gap-2 p-3 text-xs text-gray-400">
                    <Loader2 className="w-3 h-3 animate-spin" /> Carregando agendas...
                  </div>
                )}
                {calendars?.map(cal => {
                  const active = cal.id === integration?.google_calendar_id;
                  return (
                    <button
                      key={cal.id}
                      onClick={() => handlePickCalendar(cal)}
                      className={`w-full flex items-center justify-between px-3 py-2.5 text-left text-sm hover:bg-gray-50 transition-colors ${
                        active ? 'font-medium text-primary-600' : 'text-gray-700'
                      }`}
                    >
                      <span className="truncate">{cal.name}</span>
                      <span className="flex items-center gap-2 shrink-0 ml-2">
                        {!active && cal.primary && (
                          <span className="text-[10px] uppercase tracking-wide bg-gray-100 text-gray-400 px-1.5 py-0.5 rounded">
                            primária
                          </span>
                        )}
                        {active && <CheckCircle2 className="w-4 h-4" />}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}

            <div className="flex flex-wrap items-center gap-2 pt-1">
              <Button variant="outline" size="sm" onClick={handleSyncNow} disabled={syncing}>
                {syncing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                Sincronizar agora
              </Button>
              {confirmDisconnect ? (
                <span className="flex items-center gap-2">
                  <Button variant="danger" size="sm" onClick={handleDisconnect}>
                    Confirmar desconexão
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setConfirmDisconnect(false)}>
                    Cancelar
                  </Button>
                </span>
              ) : (
                <Button variant="ghost" size="sm" onClick={() => setConfirmDisconnect(true)}>
                  <Unlink className="w-4 h-4" />
                  Desconectar
                </Button>
              )}
            </div>
          </div>
        )}
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Como funciona</CardTitle>
        </CardHeader>
        <ul className="space-y-2.5 text-sm text-gray-600">
          <li className="flex items-start gap-2.5">
            <Zap className="w-4 h-4 text-primary-500 mt-0.5 shrink-0" />
            <span>Cada ação criada ou editada pela agência vai automaticamente para a sua agenda — sem precisar fazer nada.</span>
          </li>
          <li className="flex items-start gap-2.5">
            <RefreshCw className="w-4 h-4 text-primary-500 mt-0.5 shrink-0" />
            <span>Um servidor roda a cada minuto garantindo que nada fique para trás, mesmo com o app fechado.</span>
          </li>
          <li className="flex items-start gap-2.5">
            <LinkIcon className="w-4 h-4 text-primary-500 mt-0.5 shrink-0" />
            <span>Só o cronograma de <strong>{currentWorkspace.name}</strong> é sincronizado — nada de outros clientes.</span>
          </li>
        </ul>
      </Card>
    </div>
  );
}
