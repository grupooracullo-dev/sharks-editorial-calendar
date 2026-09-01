import { Action, ActionFilters } from '@/types';
import { supabase, authState } from '@/lib/supabase';
import { notifyActionChanged } from '@/lib/googleSync';
import { registerRealtimeReset } from '@/lib/realtimeCleanup';

// ==========================================
// ACTIONS SERVICE - Supabase-backed cache
// Synchronous reads from local cache,
// write-through mutations to Supabase.
// ==========================================

let actionsStore: Action[] = [];
let currentScope: string | null | undefined = undefined; // undefined = not loaded yet
let loadStatus: 'idle' | 'loading' | 'success' | 'error' = 'idle';
let loadSeq = 0;
let listeners: (() => void)[] = [];
let realtimeChannel: ReturnType<typeof supabase.channel> | null = null;

function notifyListeners() {
  listeners.forEach(fn => fn());
}

function applyLocalFilters(filters?: ActionFilters): Action[] {
  let result = [...actionsStore];

  if (filters?.workspaceId) {
    result = result.filter(a => a.workspace_id === filters.workspaceId);
  }
  if (filters?.campaignId) {
    result = result.filter(a => a.campaign_id === filters.campaignId);
  }
  if (filters?.format) {
    result = result.filter(a => a.format === filters.format);
  }
  if (filters?.objective) {
    result = result.filter(a => a.objective === filters.objective);
  }
  if (filters?.pillarId) {
    result = result.filter(a => a.editorial_pillar_id === filters.pillarId);
  }
  if (filters?.status) {
    result = result.filter(a => a.status === filters.status);
  }
  if (filters?.actionType) {
    result = result.filter(a => a.action_type === filters.actionType);
  }
  if (filters?.responsibleId) {
    result = result.filter(a => a.responsible_id === filters.responsibleId || a.responsibles?.some(r => r.id === filters.responsibleId));
  }
  if (filters?.channel) {
    result = result.filter(a => a.channel === filters.channel);
  }
  if (filters?.startDate) {
    result = result.filter(a => a.action_date >= filters.startDate!);
  }
  if (filters?.endDate) {
    result = result.filter(a => a.action_date <= filters.endDate!);
  }
  if (filters?.environment) {
    result = result.filter(a => a.environment === filters.environment);
  }

  return result.sort((a, b) =>
    a.action_date === b.action_date
      ? (a.action_time || '').localeCompare(b.action_time || '')
      : a.action_date.localeCompare(b.action_date)
  );
}

export function subscribeToActions(listener: () => void): () => void {
  listeners.push(listener);
  return () => {
    listeners = listeners.filter(l => l !== listener);
  };
}

const SELECT_WITH_JOINS = '*, campaign:campaigns(*), editorial_pillar:editorial_pillars(*), workspace:workspaces(name), responsible:users!actions_responsible_id_fkey(id, full_name, avatar_url), responsibles:action_responsibles(users(id, full_name, avatar_url))';

export async function loadActions(workspaceId?: string | null, environment?: string | null): Promise<void> {
  currentScope = workspaceId ?? null;
  const seq = ++loadSeq;
  loadStatus = 'loading';
  notifyListeners();
  let query = supabase.from('actions').select(SELECT_WITH_JOINS);
  if (workspaceId) {
    query = query.eq('workspace_id', workspaceId);
  }
  if (environment) {
    query = query.eq('environment', environment);
  }
  const { data, error } = await query.order('action_date');

  if (seq !== loadSeq) return;

  if (error) {
    console.error('[actions] load error:', error.message);
    loadStatus = 'error';
    notifyListeners();
    return;
  }

  actionsStore = (data as unknown as Action[]) || [];
  loadStatus = 'success';
  notifyListeners();

  // Realtime: single global channel, reload scope on any change
  if (!realtimeChannel) {
    realtimeChannel = supabase
      .channel('realtime-actions')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'actions' },
        () => {
          if (currentScope !== undefined) {
            loadActions(currentScope);
          }
        }
      )
      .subscribe();
  }
}

/** Logout: limpa channel + cache (registered em realtimeCleanup). */
export function resetActionsRealtime(): void {
  if (realtimeChannel) {
    supabase.removeChannel(realtimeChannel);
    realtimeChannel = null;
  }
  actionsStore = [];
  currentScope = undefined;
  loadStatus = 'idle';
  loadSeq++;
  notifyListeners();
}
registerRealtimeReset(resetActionsRealtime);

export async function reloadActions(): Promise<void> {
  if (currentScope !== undefined) {
    await loadActions(currentScope);
  }
}

export function getCurrentScope(): string | null | undefined {
  return currentScope;
}

export function getActionsLoadStatus(): 'idle' | 'loading' | 'success' | 'error' {
  return loadStatus;
}

export function getActions(filters?: ActionFilters): Action[] {
  return applyLocalFilters(filters);
}

export function getActionById(id: string): Action | undefined {
  return actionsStore.find(a => a.id === id);
}

export interface ActionResult {
  ok: boolean;
  data?: Action;
  error?: string;
}

/** Grava os responsáveis (N:N) via RPC e re-carrega a linha com os joins. */
async function syncResponsibles(actionId: string, userIds: string[]): Promise<Action | null> {
  const { error } = await supabase.rpc('set_action_responsibles', {
    p_action_id: actionId,
    p_user_ids: userIds,
  });
  if (error) {
    console.error('[actions] set_action_responsibles error:', error.message);
    return null;
  }
  const { data } = await supabase
    .from('actions')
    .select(SELECT_WITH_JOINS)
    .eq('id', actionId)
    .single();
  return (data as unknown as Action) || null;
}

export async function createAction(data: Partial<Action>): Promise<ActionResult> {
  const payload = {
    workspace_id: data.workspace_id || '',
    environment: data.environment || 'sharks_company',
    campaign_id: data.campaign_id || null,
    editorial_pillar_id: data.editorial_pillar_id || null,
    responsible_id: data.responsible_id || null,
    title: data.title || '',
    description: data.description || null,
    action_date: data.action_date || '',
    action_time: data.action_time || null,
    action_type: data.action_type || 'content',
    format: data.format || null,
    channel: data.channel || null,
    objective: data.objective || null,
    funnel_stage: data.funnel_stage || null,
    audience: data.audience || null,
    product: data.product || null,
    theme: data.theme || null,
    hook: data.hook || null,
    main_message: data.main_message || null,
    copy_text: data.copy_text || null,
    cta: data.cta || null,
    internal_deadline: data.internal_deadline || null,
    status: data.status || 'draft',
    observations: data.observations || null,
    reference_urls: data.reference_urls || [],
    is_auto_generated: data.is_auto_generated || false,
    created_by: authState.userId,
  };

  const { data: inserted, error } = await supabase
    .from('actions')
    .insert(payload)
    .select(SELECT_WITH_JOINS)
    .single();

  if (error || !inserted) {
    console.error('[actions] create error:', error?.message);
    return { ok: false, error: error?.message || 'Erro ao criar ação' };
  }

  // Múltiplos responsáveis (N:N) — RPC após o insert
  const respIds = (data as Partial<Action> & { responsible_ids?: string[] }).responsible_ids;
  let finalAction = inserted as unknown as Action;
  if (Array.isArray(respIds)) {
    const refreshed = await syncResponsibles(finalAction.id, respIds);
    if (refreshed) finalAction = refreshed;
  }

  const idx = actionsStore.findIndex(a => a.id === finalAction.id);
  if (idx !== -1) actionsStore[idx] = finalAction;
  else actionsStore.push(finalAction);
  notifyListeners();
  notifyActionChanged(finalAction.workspace_id);
  return { ok: true, data: finalAction };
}

export async function updateAction(id: string, data: Partial<Action>): Promise<ActionResult> {
  const oldAction = getActionById(id);

  // responsible_ids não é coluna — vai para a RPC após o update
  const { responsible_ids: respIdsRaw, ...updatePayload } = data as Partial<Action> & { responsible_ids?: string[] };

  const { data: updated, error } = await supabase
    .from('actions')
    .update(updatePayload)
    .eq('id', id)
    .select(SELECT_WITH_JOINS)
    .single();

  if (error || !updated) {
    console.error('[actions] update error:', error?.message);
    return { ok: false, error: error?.message || 'Erro ao atualizar ação' };
  }

  // Mark as needing sync locally if date changed and was previously synced
  const result = updated as unknown as Action;

  // Múltiplos responsáveis (N:N) — RPC após o update
  if (Array.isArray(respIdsRaw)) {
    const refreshed = await syncResponsibles(id, respIdsRaw);
    if (refreshed) Object.assign(result, refreshed);
  }

  if (
    data.action_date &&
    oldAction?.sync_status === 'synced' &&
    data.action_date !== oldAction.action_date
  ) {
    result.sync_status = 'modified_after_sync';
  }

  const index = actionsStore.findIndex(a => a.id === id);
  if (index !== -1) {
    actionsStore[index] = result;
  }
  notifyListeners();
  notifyActionChanged(result.workspace_id);
  return { ok: true, data: result };
}

export async function deleteAction(id: string): Promise<{ ok: boolean; error?: string }> {
  const wsId = getActionById(id)?.workspace_id;
  const { error } = await supabase.from('actions').delete().eq('id', id);
  if (error) {
    console.error('[actions] delete error:', error.message, error);
    notifyListeners();
    return { ok: false, error: error.message };
  }
  actionsStore = actionsStore.filter(a => a.id !== id);
  notifyListeners();
  notifyActionChanged(wsId);
  return { ok: true };
}

export async function bulkCreateActions(rows: Partial<Action>[]): Promise<{ ok: boolean; count: number; error?: string }> {
  // responsible_ids não é coluna — vai para a RPC após o insert
  const respIds = (rows[0] as Partial<Action> & { responsible_ids?: string[] } | undefined)?.responsible_ids;
  const payload = rows.map(r => {
    const { responsible_ids: _strip, ...rest } = r as Partial<Action> & { responsible_ids?: string[] };
    return {
      ...rest,
      sync_status: rest.sync_status || 'not_synced',
      reference_urls: rest.reference_urls || [],
      created_by: authState.userId,
    };
  });

  const { data, error } = await supabase.from('actions').insert(payload).select('id');
  if (error) {
    console.error('[actions] bulk create error:', error.message);
    return { ok: false, count: 0, error: error.message };
  }

  // Multi-responsáveis: aplica a todos os itens criados (em paralelo)
  if (Array.isArray(respIds) && respIds.length > 0 && data && data.length > 0) {
    await Promise.all(
      data.map(row =>
        supabase.rpc('set_action_responsibles', {
          p_action_id: (row as { id: string }).id,
          p_user_ids: respIds,
        }),
      ),
    );
  }

  await reloadActions();
  notifyActionChanged(rows[0]?.workspace_id || null);
  return { ok: true, count: data?.length || 0 };
}

export function getActionsByDate(date: string, workspaceId?: string): Action[] {
  return actionsStore.filter(a => {
    if (workspaceId && a.workspace_id !== workspaceId) return false;
    return a.action_date === date;
  });
}

export function getTodayActions(workspaceId?: string): Action[] {
  const today = new Date().toISOString().split('T')[0];
  return getActionsByDate(today, workspaceId).sort((a, b) =>
    (a.action_time || '').localeCompare(b.action_time || '')
  );
}

export function getWeekActions(startDate: string, endDate: string, workspaceId?: string): Action[] {
  return actionsStore
    .filter(a => {
      if (workspaceId && a.workspace_id !== workspaceId) return false;
      return a.action_date >= startDate && a.action_date <= endDate;
    })
    .sort((a, b) => a.action_date.localeCompare(b.action_date));
}

export function getOverdueActions(workspaceId?: string): Action[] {
  const today = new Date().toISOString().split('T')[0];
  return actionsStore.filter(a => {
    if (workspaceId && a.workspace_id !== workspaceId) return false;
    if (['published', 'completed', 'cancelled'].includes(a.status)) return false;
    return a.action_date < today;
  });
}

export function getPendingActions(workspaceId?: string): Action[] {
  return actionsStore.filter(a => {
    if (workspaceId && a.workspace_id !== workspaceId) return false;
    return ['draft', 'briefing'].includes(a.status);
  });
}
