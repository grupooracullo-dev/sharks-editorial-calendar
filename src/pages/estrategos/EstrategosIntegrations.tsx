import { useState } from 'react';
import Card, { CardHeader, CardTitle } from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import SyncModeSelector, { EnvSyncToggles } from '@/components/integrations/SyncModeSelector';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { useAuth } from '@/contexts/AuthContext';
import { useIntegration } from '@/hooks/useIntegration';
import {
  startGoogleConnect,
  processQueue,
  disconnectCalendar,
  setAutoSync,
  setEnvSync,
  changeSyncMode,
} from '@/lib/googleSync';
import { toast } from 'sonner';
import type { SyncMode, EnvironmentType } from '@/types';
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
  Mail,
  Repeat,
} from 'lucide-react';

function formatDateTime(iso: string | null): string {
  if (!iso) return 'Nunca';
  return new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

export default function EstrategosIntegrations() {
  const { workspacesByEnv } = useWorkspace();
  const { user } = useAuth();
  const wsList = workspacesByEnv('estrategos');
  const [selectedWsId, setSelectedWsId] = useState(wsList[0]?.id ?? '');
  const ws = wsList.find(w => w.id === selectedWsId) ?? wsList[0];
  const { integration, loading } = useIntegration(ws?.id);

  const [syncMode, setSyncMode] = useState<SyncMode>('split');
  const [syncing, setSyncing] = useState(false);
  const [switchingMode, setSwitchingMode] = useState(false);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);

  // Resultado do redirect do OAuth
  useState(() => {
    const sp = new URLSearchParams(window.location.search);
    const g = sp.get('google');
    if (g === 'connected') toast.success('Google Calendar conectado com sucesso!');
    else if (g === 'denied') toast.error('Permissão negada na conta Google.');
    else if (g === 'error') toast.error('Falha na conexão com o Google.');
    if (g) window.history.replaceState({}, '', window.location.pathname);
    return null;
  });

  if (!ws) {
    return (
      <Card>
        <CardHeader><CardTitle>Integrações</CardTitle></CardHeader>
        <p className="text-sm text-gray-500">Nenhum cliente Estrategos disponível.</p>
      </Card>
    );
  }

  const isConnected = !!integration?.is_connected;

  const handleConnect = () => {
    if (!user) return;
    startGoogleConnect(ws.id, user.id, '/estrategos/integrations', syncMode);
  };

  const handleSyncNow = async () => {
    if (syncing) return;
    setSyncing(true);
    try {
      const res = await processQueue(ws.id);
      if (res.failed) toast.warning(`${res.ok ?? 0} sincronizado(s), ${res.failed} falharam.`);
      else if (res.processed) toast.success(`${res.processed} item(ns) sincronizado(s).`);
      else toast.success('Tudo sincronizado.');
    } catch (e) {
      toast.error(`Erro ao sincronizar: ${(e as Error).message}`);
    } finally {
      setSyncing(false);
    }
  };

  const handleToggleEnv = async (env: EnvironmentType, enabled: boolean) => {
    try {
      await setEnvSync(ws.id, env, enabled);
      toast.success(enabled ? 'Sincronização ativada.' : 'Sincronização pausada.');
    } catch (e) {
      toast.error(`Erro: ${(e as Error).message}`);
    }
  };

  const handleSwitchMode = async () => {
    if (switchingMode) return;
    setSwitchingMode(true);
    const next = integration?.sync_mode === 'split' ? 'unified' : 'split';
    try {
      await changeSyncMode(ws.id, next);
      toast.success(next === 'split'
        ? 'Modo separado: agendas "Sharks" e "Estrategos" criadas no Google.'
        : 'Modo única agenda: novos eventos usam a agenda principal.');
    } catch (e) {
      toast.error(`Erro: ${(e as Error).message}`);
    } finally {
      setSwitchingMode(false);
    }
  };

  const handleToggleAuto = async () => {
    if (!integration) return;
    try {
      await setAutoSync(ws.id, !integration.auto_sync);
      toast.success(integration.auto_sync ? 'Sincronização automática pausada.' : 'Sincronização automática ativada.');
    } catch (e) {
      toast.error(`Erro: ${(e as Error).message}`);
    }
  };

  const handleDisconnect = async () => {
    setConfirmDisconnect(false);
    try {
      await disconnectCalendar(ws.id);
      toast.success('Google Calendar desconectado.');
    } catch (e) {
      toast.error(`Erro: ${(e as Error).message}`);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Integrações</h1>
        <p className="text-sm text-gray-500 mt-0.5">Conecte o Google Calendar por cliente Estrategos</p>
      </div>

      {wsList.length > 1 && (
        <div className="flex gap-2 flex-wrap">
          {wsList.map(w => (
            <button
              key={w.id}
              onClick={() => setSelectedWsId(w.id)}
              className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                w.id === ws.id ? 'bg-primary-500 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
              }`}
            >
              {w.name}
            </button>
          ))}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="w-5 h-5 text-primary-500" />
            Google Calendar — {ws.name}
          </CardTitle>
          {loading ? (
            <span className="flex items-center gap-1 text-xs text-gray-400">
              <Loader2 className="w-3 h-3 animate-spin" /> Carregando
            </span>
          ) : (
            <span className={`flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${isConnected ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
              {isConnected ? <><CheckCircle2 className="w-3 h-3" /> Conectado</> : <><XCircle className="w-3 h-3" /> Não conectado</>}
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
              <p className="text-sm font-medium text-gray-900 mb-1">Conecte a conta Google da Estrategos</p>
              <p className="text-xs text-gray-500 leading-relaxed">
                Reuniões e implantações de <strong>{ws.name}</strong> irão automaticamente para o Google Calendar conectado.
              </p>
            </div>
            <div className="mb-4">
              <SyncModeSelector value={syncMode} onChange={setSyncMode} />
            </div>
            <Button onClick={handleConnect}>
              <LinkIcon className="w-4 h-4" />
              Conectar conta Google
            </Button>
          </>
        ) : (
          <div className="space-y-4">
            {integration?.sync_mode === 'split' && (
              <div>
                <p className="text-xs uppercase tracking-wide text-gray-400 font-medium mb-2">Sync por ambiente</p>
                <EnvSyncToggles envAutoSync={integration?.env_auto_sync} onToggle={handleToggleEnv} />
              </div>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
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
                  <p className="text-[11px] uppercase tracking-wide text-gray-400 font-medium">Última sync</p>
                  <p className="text-sm text-gray-900 truncate">{formatDateTime(integration?.last_synced_at ?? null)}</p>
                </div>
              </div>
              <button
                role="switch"
                aria-checked={!!integration?.auto_sync}
                onClick={handleToggleAuto}
                className="flex items-center justify-between gap-3 p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors text-left"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <Zap className={`w-4 h-4 shrink-0 ${integration?.auto_sync ? 'text-primary-500' : 'text-gray-400'}`} />
                  <div className="min-w-0">
                    <p className="text-[11px] uppercase tracking-wide text-gray-400 font-medium">Auto sync</p>
                    <p className="text-sm text-gray-900">{integration?.auto_sync ? 'Ativado' : 'Pausado'}</p>
                  </div>
                </div>
                <span className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${integration?.auto_sync ? 'bg-primary-500' : 'bg-gray-300'}`}>
                  <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${integration?.auto_sync ? 'translate-x-[18px]' : 'translate-x-[3px]'}`} />
                </span>
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-2 pt-1">
              <Button variant="outline" size="sm" onClick={handleSyncNow} disabled={syncing}>
                {syncing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                Sincronizar agora
              </Button>
              <Button variant="outline" size="sm" onClick={handleSwitchMode} disabled={switchingMode}>
                {switchingMode ? <Loader2 className="w-4 h-4 animate-spin" /> : <Repeat className="w-4 h-4" />}
                {integration?.sync_mode === 'split' ? 'Usar uma agenda só' : 'Separar por ambiente'}
              </Button>
              {confirmDisconnect ? (
                <span className="flex items-center gap-2">
                  <Button variant="danger" size="sm" onClick={handleDisconnect}>Confirmar</Button>
                  <Button variant="ghost" size="sm" onClick={() => setConfirmDisconnect(false)}>Cancelar</Button>
                </span>
              ) : (
                <Button variant="ghost" size="sm" onClick={() => setConfirmDisconnect(true)}>
                  <Unlink className="w-4 h-4" /> Desconectar
                </Button>
              )}
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
