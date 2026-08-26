import { useState, useEffect, useCallback } from 'react';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import Modal from '@/components/ui/Modal';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import {
  PERMISSION_META, ALL_PERMISSIONS, defaultPermissions, togglePerm,
  type Permission, type PermissionAction,
} from '@/lib/permissions';
import { toast } from 'sonner';
import {
  UserPlus, Check, X, Mail, Building2, Phone,
  MessageSquare, Calendar, Eye, EyeOff, Copy,
  Loader2, Inbox, ShieldCheck, Briefcase, UserCog, Plus,
} from 'lucide-react';
import type { EnvironmentType } from '@/types';

interface AccessRequest {
  id: string;
  full_name: string;
  email: string;
  company: string | null;
  phone: string | null;
  workspace_id: string | null;
  message: string | null;
  status: 'pending' | 'approved' | 'rejected';
  requested_role: string;
  requested_environments: string[] | null;
  granted_role: 'client' | 'sharks_team' | null;
  temp_password: string | null;
  auth_provider: string | null;
  approved_by: string | null;
  approved_at: string | null;
  rejected_reason: string | null;
  created_at: string;
}

interface WorkspaceWithEnv {
  id: string;
  name: string;
  environment: string;
}

const ENVS: Array<{ value: string; emoji: string; label: string; desc: string }> = [
  { value: 'sharks_company', emoji: '🦈', label: 'Sharks Company', desc: 'Marketing e conteudo' },
  { value: 'estrategos', emoji: '📊', label: 'Estrategos', desc: 'Gestao empresarial' },
];

interface AccessRequestsPageProps {
  /** 'all' = guardião (visão total); senão filtra por ambiente */
  environment: EnvironmentType | 'all';
}

export default function AccessRequestsPage({ environment }: AccessRequestsPageProps) {
  const { user, isAdmin, isOracullo } = useAuth();
  const { refreshWorkspaces } = useWorkspace();
  const [requests, setRequests] = useState<AccessRequest[]>([]);
  const [workspaces, setWorkspaces] = useState<WorkspaceWithEnv[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'pending' | 'all'>('pending');

  const [approveModal, setApproveModal] = useState<AccessRequest | null>(null);
  const [rejectModal, setRejectModal] = useState<AccessRequest | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [processing, setProcessing] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [viewModal, setViewModal] = useState<AccessRequest | null>(null);

  // Approve form
  const [approveRole, setApproveRole] = useState<'client' | 'sharks_team'>('client');
  const [approveName, setApproveName] = useState('');
  const [approveWorkspaceIds, setApproveWorkspaceIds] = useState<string[]>([]);
  const [approvePermissions, setApprovePermissions] = useState<Permission[]>([]);
  const [approveEnvironments, setApproveEnvironments] = useState<string[]>([]);
  // Por ambiente: 'existing' | 'new' + workspace escolhido + nome do novo
  const [wsChoice, setWsChoice] = useState<Record<string, 'existing' | 'new'>>({});
  const [wsSelected, setWsSelected] = useState<Record<string, string>>({});
  const [wsNewName, setWsNewName] = useState<Record<string, string>>({});

  const canManage = environment === 'all' ? isOracullo : isAdmin;

  const openApprove = (req: AccessRequest) => {
    setApproveModal(req);
    setApproveRole(req.requested_role === 'sharks_team' ? 'sharks_team' : 'client');
    setApproveName(req.full_name);
    setApproveWorkspaceIds([]);
    setApprovePermissions(defaultPermissions());
    const envs = req.requested_environments?.length
      ? req.requested_environments
      : ['sharks_company'];
    // Na visão por ambiente, só o próprio ambiente é concedível
    setApproveEnvironments(environment === 'all' ? envs : [environment]);
    const choice: Record<string, 'existing' | 'new'> = {};
    const selected: Record<string, string> = {};
    for (const env of envs) {
      choice[env] = 'new';
      selected[env] = '';
    }
    setWsChoice(choice);
    setWsSelected(selected);
    setWsNewName({});
  };

  const load = useCallback(async () => {
    setLoading(true);
    let q = supabase
      .from('access_requests')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100);
    if (filter === 'pending') q = q.eq('status', 'pending');

    const [reqRes, wsRes, envRes] = await Promise.all([
      q,
      supabase.from('workspaces').select('id, name').eq('is_active', true),
      supabase.rpc('ws_env_map'),
    ]);

    const envMap = new Map<string, string>(
      ((envRes.data ?? []) as Array<{ id: string; environment: string }>).map(r => [r.id, r.environment]),
    );

    if (reqRes.data) setRequests(reqRes.data as unknown as AccessRequest[]);
    if (wsRes.data) {
      setWorkspaces(
        (wsRes.data as Array<{ id: string; name: string }>).map(w => ({
          ...w,
          environment: envMap.get(w.id) ?? 'sharks_company',
        })),
      );
    }
    setLoading(false);
  }, [filter]);

  useEffect(() => {
    if (canManage) load();
  }, [canManage, load]);

  useEffect(() => {
    const channel = supabase
      .channel('access-requests-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'access_requests' },
        () => { load(); }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [load]);

  const handleApprove = async () => {
    if (!approveModal) return;
    if (!approveName.trim()) {
      toast.error('Informe o nome do usuario');
      return;
    }
    if (approveEnvironments.length === 0) {
      toast.error('Selecione pelo menos um ambiente');
      return;
    }
    if (approveRole === 'client') {
      for (const env of approveEnvironments) {
        if (wsChoice[env] === 'existing' && !wsSelected[env]) {
          toast.error(`Selecione um cliente existente para ${env === 'sharks_company' ? 'Sharks' : 'Estrategos'} ou escolha "Criar novo"`);
          return;
        }
        if (wsChoice[env] === 'new' && !(wsNewName[env] ?? '').trim()) {
          toast.error(`Informe o nome do novo cliente para ${env === 'sharks_company' ? 'Sharks' : 'Estrategos'}`);
          return;
        }
      }
    }
    setProcessing(true);
    try {
      // Payload: workspace_id legacy (1 env + existente) OU new_workspaces
      const singleEnv = approveEnvironments.length === 1 ? approveEnvironments[0] : null;
      const legacyWsId = singleEnv && wsChoice[singleEnv] === 'existing' ? wsSelected[singleEnv] : null;
      const newWorkspaces: Record<string, string> = {};
      if (approveRole === 'client') {
        for (const env of approveEnvironments) {
          if (wsChoice[env] === 'new' && (wsNewName[env] ?? '').trim()) {
            newWorkspaces[env] = wsNewName[env].trim();
          }
        }
      }

      const { data, error } = await supabase.functions.invoke('admin-approve-access-request', {
        body: {
          request_id: approveModal.id,
          role: approveRole,
          full_name: approveName.trim(),
          workspace_id: legacyWsId,
          workspace_ids: approveRole === 'sharks_team' ? approveWorkspaceIds : [],
          permissions: approveRole === 'sharks_team' ? approvePermissions : undefined,
          requested_environments: approveEnvironments,
          ...(Object.keys(newWorkspaces).length > 0 ? { new_workspaces: newWorkspaces } : {}),
        },
      });
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);

      const roleLabel = approveRole === 'sharks_team' ? 'Time' : 'Cliente';
      const envLabel = approveEnvironments
        .map(e => (e === 'sharks_company' ? 'Sharks' : 'Estrategos'))
        .join(' + ');
      if (data.auth_provider === 'google') {
        toast.success(`Aprovado como ${roleLabel} (${envLabel})! ${data.email} ja possui conta Google ativa.`);
      } else {
        toast.success(`Aprovado como ${roleLabel} (${envLabel})! Senha temporaria: ${data.temp_password}`);
        setShowPassword(true);
      }
      setApproveModal(null);
      await Promise.all([load(), refreshWorkspaces()]);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao aprovar');
    } finally {
      setProcessing(false);
    }
  };

  const handleReject = async () => {
    if (!rejectModal) return;
    setProcessing(true);
    try {
      const { data, error } = await supabase.functions.invoke('admin-reject-access-request', {
        body: { request_id: rejectModal.id, reason: rejectReason },
      });
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);

      toast.success('Solicitacao rejeitada');
      setRejectModal(null);
      setRejectReason('');
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao rejeitar');
    } finally {
      setProcessing(false);
    }
  };

  const copyPassword = (pwd: string) => {
    navigator.clipboard.writeText(pwd);
    toast.success('Senha copiada!');
  };

  const wsName = (id: string | null) =>
    id ? workspaces.find(w => w.id === id)?.name ?? '—' : null;

  const visibleRequests = environment === 'all'
    ? requests
    : requests.filter(r => {
        const envs = r.requested_environments?.length ? r.requested_environments : ['sharks_company'];
        return envs.includes(environment);
      });

  if (!canManage) {
    return (
      <Card>
        <p className="text-sm text-gray-500 text-center py-6">
          Apenas administradores podem gerenciar solicitacoes de acesso.
        </p>
      </Card>
    );
  }

  const pendingCount = visibleRequests.filter(r => r.status === 'pending').length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Solicitações de Acesso</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {pendingCount > 0
              ? `${pendingCount} solicitação${pendingCount > 1 ? 'ões' : ''} pendente${pendingCount > 1 ? 's' : ''}`
              : 'Nenhuma solicitação pendente'}
          </p>
        </div>
        <div className="flex items-center gap-1 bg-gray-100 p-1 rounded-lg">
          <button
            onClick={() => setFilter('pending')}
            className={`px-3 py-1.5 text-sm font-medium rounded-md transition-all ${
              filter === 'pending' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'
            }`}
          >
            Pendentes
          </button>
          <button
            onClick={() => setFilter('all')}
            className={`px-3 py-1.5 text-sm font-medium rounded-md transition-all ${
              filter === 'all' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'
            }`}
          >
            Histórico
          </button>
        </div>
      </div>

      {/* Lista */}
      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="w-6 h-6 text-primary-500 animate-spin" />
        </div>
      ) : visibleRequests.length === 0 ? (
        <Card>
          <div className="text-center py-12">
            <Inbox className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <h3 className="text-lg font-semibold text-gray-900 mb-1">
              {filter === 'pending' ? 'Nenhuma solicitação pendente' : 'Histórico vazio'}
            </h3>
            <p className="text-sm text-gray-500">
              Quando alguém solicitar acesso, aparecerá aqui.
            </p>
          </div>
        </Card>
      ) : (
        <div className="space-y-3">
          {visibleRequests.map(req => (
            <Card key={req.id} className="overflow-hidden">
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 rounded-full bg-primary-100 text-primary-600 flex items-center justify-center font-semibold shrink-0">
                  {req.full_name.charAt(0).toUpperCase()}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-semibold text-gray-900">{req.full_name}</h3>
                    <Badge variant={
                      req.status === 'pending' ? 'info' :
                      req.status === 'approved' ? 'success' : 'default'
                    }>
                      {req.status === 'pending' ? 'Pendente' :
                       req.status === 'approved' ? 'Aprovado' : 'Rejeitado'}
                    </Badge>
                    {req.auth_provider === 'google' && (
                      <Badge variant="info" className="bg-blue-100 text-blue-700">
                        <ShieldCheck className="w-3 h-3 inline mr-1" />
                        Google
                      </Badge>
                    )}
                    {req.status === 'approved' && req.granted_role && (
                      <Badge variant={req.granted_role === 'sharks_team' ? 'primary' : 'default'}>
                        {req.granted_role === 'sharks_team' ? 'Time' : 'Cliente'}
                      </Badge>
                    )}
                    {req.requested_environments?.map(env => (
                      <Badge key={env} variant={env === 'sharks_company' ? 'info' : 'warning'}>
                        {env === 'sharks_company' ? 'Sharks' : 'Estrategos'}
                      </Badge>
                    ))}
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1 text-xs text-gray-500">
                    <span className="flex items-center gap-1"><Mail className="w-3 h-3" /> {req.email}</span>
                    {req.company && <span className="flex items-center gap-1"><Building2 className="w-3 h-3" /> {req.company}</span>}
                    {req.phone && <span className="flex items-center gap-1"><Phone className="w-3 h-3" /> {req.phone}</span>}
                    {wsName(req.workspace_id) && (
                      <span className="flex items-center gap-1 text-primary-600 font-medium">
                        <UserPlus className="w-3 h-3" /> {wsName(req.workspace_id)}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-gray-400 mt-1 flex items-center gap-1">
                    <Calendar className="w-3 h-3" />
                    {new Date(req.created_at).toLocaleString('pt-BR')}
                  </p>
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => setViewModal(req)}
                    className="p-2 rounded-lg text-gray-400 hover:text-primary-600 hover:bg-primary-50 transition-colors"
                    title="Ver detalhes"
                  >
                    <MessageSquare className="w-4 h-4" />
                  </button>
                  {req.status === 'pending' && (
                    <>
                      <Button size="sm" onClick={() => openApprove(req)}>
                        <Check className="w-4 h-4" />
                        Aprovar
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setRejectModal(req)}
                      >
                        <X className="w-4 h-4" />
                        Rejeitar
                      </Button>
                    </>
                  )}
                  {req.status === 'approved' && req.temp_password && (
                    <button
                      onClick={() => copyPassword(req.temp_password!)}
                      className="p-2 rounded-lg text-gray-400 hover:text-green-600 hover:bg-green-50 transition-colors"
                      title="Copiar senha"
                    >
                      <Copy className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Approve Modal */}
      <Modal
        isOpen={!!approveModal}
        onClose={() => setApproveModal(null)}
        title="Aprovar solicitação"
        size="md"
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            <strong>{approveModal?.email}</strong>
            {approveModal?.auth_provider === 'google' ? (
              <span className="block mt-1 text-xs text-blue-600 bg-blue-50 rounded-lg px-3 py-2">
                Conta Google autenticada — nenhuma senha temporária será gerada.
              </span>
            ) : (
              <span className="block mt-1 text-xs text-gray-500">
                Será gerada uma senha temporária para enviar ao solicitante.
              </span>
            )}
          </p>

          {/* Papel */}
          <div>
            <p className="text-sm font-medium text-gray-700 mb-2">Papel de acesso</p>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setApproveRole('client')}
                className={`flex items-start gap-2.5 p-3 rounded-lg border text-left transition-all ${
                  approveRole === 'client'
                    ? 'border-primary-500 bg-primary-50 ring-1 ring-primary-200'
                    : 'border-gray-200 bg-white hover:border-gray-300'
                }`}
              >
                <Briefcase className={`w-5 h-5 shrink-0 mt-0.5 ${approveRole === 'client' ? 'text-primary-600' : 'text-gray-400'}`} />
                <div>
                  <p className={`text-sm font-semibold ${approveRole === 'client' ? 'text-primary-700' : 'text-gray-700'}`}>Cliente</p>
                  <p className="text-[11px] text-gray-500">Acesso ao portal do cliente</p>
                </div>
              </button>
              <button
                onClick={() => setApproveRole('sharks_team')}
                className={`flex items-start gap-2.5 p-3 rounded-lg border text-left transition-all ${
                  approveRole === 'sharks_team'
                    ? 'border-primary-500 bg-primary-50 ring-1 ring-primary-200'
                    : 'border-gray-200 bg-white hover:border-gray-300'
                }`}
              >
                <UserCog className={`w-5 h-5 shrink-0 mt-0.5 ${approveRole === 'sharks_team' ? 'text-primary-600' : 'text-gray-400'}`} />
                <div>
                  <p className={`text-sm font-semibold ${approveRole === 'sharks_team' ? 'text-primary-700' : 'text-gray-700'}`}>Time</p>
                  <p className="text-[11px] text-gray-500">Equipe, com permissões por módulo</p>
                </div>
              </button>
            </div>
          </div>

          {/* Ambientes */}
          {environment === 'all' && (
            <div>
              <p className="text-sm font-medium text-gray-700 mb-2">Ambientes de acesso</p>
              <div className="space-y-2">
                {ENVS.map(env => (
                  <label
                    key={env.value}
                    className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                      approveEnvironments.includes(env.value)
                        ? 'border-primary-400 bg-primary-50'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={approveEnvironments.includes(env.value)}
                      onChange={e => {
                        setApproveEnvironments(envs =>
                          e.target.checked
                            ? [...envs, env.value]
                            : envs.filter(v => v !== env.value),
                        );
                      }}
                      className="w-4 h-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                    />
                    <span className="text-lg">{env.emoji}</span>
                    <div>
                      <p className="text-sm font-medium text-gray-900">{env.label}</p>
                      <p className="text-xs text-gray-500">{env.desc}</p>
                    </div>
                  </label>
                ))}
              </div>
            </div>
          )}

          <Input
            label="Nome"
            value={approveName}
            onChange={(e) => setApproveName(e.target.value)}
            placeholder="Nome completo"
          />

          {/* Config por papel */}
          {approveRole === 'client' ? (
            <div className="space-y-4">
              {approveEnvironments.map(env => {
                const envWs = workspaces.filter(w => w.environment === env);
                const label = env === 'sharks_company' ? 'Sharks' : 'Estrategos';
                return (
                  <div key={env} className="border border-gray-200 rounded-lg p-3 space-y-2">
                    <p className="text-sm font-medium text-gray-700">
                      {env === 'sharks_company' ? '🦈' : '📊'} Cliente no ambiente {label}
                    </p>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setWsChoice(p => ({ ...p, [env]: 'existing' }))}
                        className={`px-3 py-1.5 text-xs font-medium rounded-md border transition-colors ${
                          wsChoice[env] === 'existing'
                            ? 'border-primary-400 bg-primary-50 text-primary-700'
                            : 'border-gray-200 text-gray-500 hover:border-gray-300'
                        }`}
                      >
                        Cliente existente
                      </button>
                      <button
                        type="button"
                        onClick={() => setWsChoice(p => ({ ...p, [env]: 'new' }))}
                        className={`flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-md border transition-colors ${
                          wsChoice[env] === 'new'
                            ? 'border-primary-400 bg-primary-50 text-primary-700'
                            : 'border-gray-200 text-gray-500 hover:border-gray-300'
                        }`}
                      >
                        <Plus className="w-3 h-3" /> Criar novo cliente
                      </button>
                    </div>
                    {wsChoice[env] === 'existing' ? (
                      <Select
                        value={wsSelected[env] ?? ''}
                        onChange={e => setWsSelected(p => ({ ...p, [env]: e.target.value }))}
                        placeholder={`Selecione o cliente ${label}...`}
                        options={envWs.map(w => ({ value: w.id, label: w.name }))}
                      />
                    ) : (
                      <Input
                        value={wsNewName[env] ?? ''}
                        onChange={e => setWsNewName(p => ({ ...p, [env]: e.target.value }))}
                        placeholder={`Nome da empresa em ${label} (ex: ${approveName || 'Cliente'} — ${label})`}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <>
              <div>
                <p className="text-sm font-medium text-gray-700 mb-1.5">
                  Clientes que gerencia
                  <span className="ml-1 text-xs font-normal text-gray-400">(opcional)</span>
                </p>
                {(() => {
                  const pool = workspaces.filter(w =>
                    approveEnvironments.includes(w.environment),
                  );
                  return pool.length === 0 ? (
                    <p className="text-sm text-gray-400 py-2">Nenhum cliente cadastrado</p>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 max-h-32 overflow-y-auto">
                      {pool.map(ws => {
                        const selected = approveWorkspaceIds.includes(ws.id);
                        return (
                          <button
                            key={ws.id}
                            onClick={() => setApproveWorkspaceIds(ids =>
                              selected ? ids.filter(id => id !== ws.id) : [...ids, ws.id]
                            )}
                            className={`flex items-center gap-2 px-2.5 py-2 rounded-lg border text-left text-sm transition-all ${
                              selected
                                ? 'border-primary-300 bg-primary-50 text-primary-700'
                                : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
                            }`}
                          >
                            <span className={`w-4 h-4 rounded flex items-center justify-center shrink-0 border ${
                              selected ? 'border-primary-500 bg-primary-500' : 'border-gray-300'
                            }`}>
                              {selected && <Check className="w-3 h-3 text-white" />}
                            </span>
                            <span className="truncate">{ws.name}</span>
                          </button>
                        );
                      })}
                    </div>
                  );
                })()}
              </div>

              <div>
                <p className="text-sm font-medium text-gray-700 mb-1.5">Permissões por módulo</p>
                <div className="space-y-1.5 max-h-64 overflow-y-auto pr-1">
                  {ALL_PERMISSIONS.map(perm => {
                    const meta = PERMISSION_META[perm];
                    const Icon = meta.icon;
                    const p = approvePermissions.find(x => x.permission === perm)
                      || { permission: perm, can_create: false, can_read: true, can_update: false, can_delete: false };
                    return (
                      <div key={perm} className="flex items-center gap-3 px-3 py-2 rounded-lg bg-white border border-gray-200">
                        <Icon className="w-4 h-4 text-gray-400 shrink-0" />
                        <div className="flex-1 min-w-0">
                          <span className="text-sm font-medium text-gray-700">{meta.label}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          {(['can_create', 'can_read', 'can_update', 'can_delete'] as PermissionAction[]).map(action => {
                            const lbl = action === 'can_create' ? 'Criar' : action === 'can_read' ? 'Ver' : action === 'can_update' ? 'Editar' : 'Excluir';
                            return (
                              <button
                                key={action}
                                onClick={() => setApprovePermissions(perms => togglePerm(perms, perm, action))}
                                className={`px-2 py-1 rounded text-[11px] font-medium transition-colors ${
                                  p[action]
                                    ? action === 'can_delete' ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'
                                    : 'bg-gray-100 text-gray-400'
                                }`}
                                title={lbl}
                              >
                                {lbl}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </>
          )}
        </div>

        <div className="flex justify-end gap-2 mt-6 pt-4 border-t border-gray-100">
          <Button variant="ghost" onClick={() => setApproveModal(null)}>Cancelar</Button>
          <Button onClick={handleApprove} loading={processing}>
            <Check className="w-4 h-4" />
            Aprovar como {approveRole === 'sharks_team' ? 'Time' : 'Cliente'}
          </Button>
        </div>
      </Modal>

      {/* Reject Modal */}
      <Modal
        isOpen={!!rejectModal}
        onClose={() => setRejectModal(null)}
        title="Rejeitar solicitação"
        size="sm"
      >
        <p className="text-sm text-gray-600 mb-3">
          Rejeitar a solicitação de <strong>{rejectModal?.full_name}</strong>?
        </p>
        <Input
          label="Motivo (opcional)"
          value={rejectReason}
          onChange={(e) => setRejectReason(e.target.value)}
          placeholder="Por que está rejeitando?"
        />
        <div className="flex justify-end gap-2 mt-6 pt-4 border-t border-gray-100">
          <Button variant="ghost" onClick={() => setRejectModal(null)}>Cancelar</Button>
          <Button variant="danger" onClick={handleReject} loading={processing}>
            <X className="w-4 h-4" />
            Rejeitar
          </Button>
        </div>
      </Modal>

      {/* View Details Modal */}
      {viewModal && (
        <Modal
          isOpen={!!viewModal}
          onClose={() => setViewModal(null)}
          title={`Detalhes: ${viewModal.full_name}`}
          size="md"
        >
          <div className="space-y-3">
            <DetailRow icon={Mail} label="E-mail" value={viewModal.email} />
            {viewModal.company && <DetailRow icon={Building2} label="Empresa" value={viewModal.company} />}
            {viewModal.phone && <DetailRow icon={Phone} label="Telefone" value={viewModal.phone} />}
            {wsName(viewModal.workspace_id) && (
              <DetailRow icon={UserPlus} label="Cliente solicitado" value={wsName(viewModal.workspace_id)!} />
            )}
            {viewModal.requested_environments && viewModal.requested_environments.length > 0 && (
              <div className="flex items-start gap-3">
                <Briefcase className="w-4 h-4 text-gray-400 shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-gray-500">Ambientes solicitados</p>
                  <div className="flex flex-wrap gap-1.5 mt-1">
                    {viewModal.requested_environments.map(env => (
                      <Badge key={env} variant={env === 'sharks_company' ? 'info' : 'warning'}>
                        {env === 'sharks_company' ? 'Sharks Company' : 'Estrategos'}
                      </Badge>
                    ))}
                  </div>
                </div>
              </div>
            )}
            <DetailRow
              icon={Calendar}
              label="Solicitado em"
              value={new Date(viewModal.created_at).toLocaleString('pt-BR')}
            />
            {viewModal.auth_provider === 'google' && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                <p className="text-xs font-semibold text-blue-700 flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4" />
                  Autenticado via Google — nenhuma senha temporária necessária
                </p>
              </div>
            )}
            {viewModal.message && (
              <div className="bg-gray-50 rounded-lg p-3">
                <p className="text-xs font-semibold text-gray-500 mb-1">Mensagem</p>
                <p className="text-sm text-gray-700 whitespace-pre-wrap">{viewModal.message}</p>
              </div>
            )}
            {viewModal.status === 'approved' && viewModal.temp_password && (
              <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                <div className="flex items-center justify-between mb-1">
                  <p className="text-xs font-semibold text-green-700">Senha temporária</p>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setShowPassword(s => !s)}
                      className="p-1 text-green-700 hover:bg-green-100 rounded"
                    >
                      {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    </button>
                    <button
                      onClick={() => copyPassword(viewModal.temp_password!)}
                      className="p-1 text-green-700 hover:bg-green-100 rounded"
                    >
                      <Copy className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
                <p className="text-sm font-mono text-green-900">
                  {showPassword ? viewModal.temp_password : '••••••••••••'}
                </p>
              </div>
            )}
            {viewModal.status === 'rejected' && viewModal.rejected_reason && (
              <div className="bg-red-50 rounded-lg p-3">
                <p className="text-xs font-semibold text-red-700 mb-1">Motivo da rejeição</p>
                <p className="text-sm text-red-700">{viewModal.rejected_reason}</p>
              </div>
            )}
          </div>
        </Modal>
      )}

      {/* Show generated password modal */}
      <Modal
        isOpen={showPassword}
        onClose={() => setShowPassword(false)}
        title="Acesso aprovado!"
        size="sm"
      >
        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
          <p className="text-xs text-green-700 mb-2">
            Envie esta senha ao solicitante por e-mail. O usuário deverá trocá-la no primeiro login.
          </p>
          <div className="flex items-center gap-2 bg-white border border-green-300 rounded-lg p-2">
            <p className="text-base font-mono text-green-900 flex-1">Senha gerada (veja o toast acima)</p>
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <Button onClick={() => setShowPassword(false)}>Fechar</Button>
        </div>
      </Modal>
    </div>
  );
}

function DetailRow({ icon: Icon, label, value }: { icon: any; label: string; value: string }) {
  return (
    <div className="flex items-start gap-3">
      <Icon className="w-4 h-4 text-gray-400 shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        <p className="text-xs text-gray-500">{label}</p>
        <p className="text-sm text-gray-900 break-words">{value}</p>
      </div>
    </div>
  );
}
