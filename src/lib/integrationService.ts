import { supabase } from '@/lib/supabase';
import { markIntegrationConnected, type GoogleIntegration } from '@/lib/googleSync';
import { registerRealtimeReset } from '@/lib/realtimeCleanup';

// ==========================================
// INTEGRATION SERVICE
// Single shared realtime channel for the
// whole calendar_integrations table.
// Supports per-workspace AND global (admin) mode.
// ==========================================

const COLS = 'workspace_id, user_id, google_calendar_id, google_calendar_name, google_account_email, is_connected, auto_sync, last_synced_at, sync_error, sync_mode, env_calendar_ids, env_auto_sync';

const cache = new Map<string, GoogleIntegration | null>();
let globalCache: GoogleIntegration | null = null;
const listeners = new Set<() => void>();
const loadingPromises = new Map<string, Promise<void>>();
let channel: ReturnType<typeof supabase.channel> | null = null;

function notify() {
  listeners.forEach(fn => fn());
}

// ---------- per-workspace ----------

export function getIntegration(wsId?: string | null): GoogleIntegration | null {
  if (!wsId) return null;
  return cache.get(wsId) ?? null;
}

export async function loadIntegration(wsId?: string | null): Promise<void> {
  if (!wsId) return;
  let p = loadingPromises.get(wsId);
  if (!p) {
    p = fetchOne(wsId).finally(() => loadingPromises.delete(wsId));
    loadingPromises.set(wsId, p);
  }
  await p;
}

async function fetchOne(wsId: string): Promise<void> {
  // Migration 021/022: um workspace pode ter linha da agência (user_id NULL)
  // E linhas pessoais de clientes (user_id = X). Resolução:
  //   1. linha pessoal do usuário logado (cliente conectou a própria conta)
  //   2. fallback -> linha da agência (time/admin gerencia essa)
  // RLS garante que cliente só enxerga a própria; time/admin veem a da agência.
  const { data: { session } } = await supabase.auth.getSession();
  const uid = session?.user?.id;
  let data: GoogleIntegration | null = null;
  if (uid) {
    const own = await supabase
      .from('calendar_integrations')
      .select(COLS)
      .eq('workspace_id', wsId)
      .eq('user_id', uid)
      .maybeSingle();
    data = (own.data as GoogleIntegration) ?? null;
  }
  if (!data) {
    const agency = await supabase
      .from('calendar_integrations')
      .select(COLS)
      .eq('workspace_id', wsId)
      .is('user_id', null)
      .maybeSingle();
    data = (agency.data as GoogleIntegration) ?? null;
  }
  cache.set(wsId, data);
  markIntegrationConnected(wsId, !!data?.is_connected);
  notify();
}

// ---------- global (admin) ----------

const GLOBAL_KEY = '__global__';

export function getGlobalIntegration(): GoogleIntegration | null {
  return globalCache;
}

export async function loadGlobalIntegration(): Promise<GoogleIntegration | null> {
  // Migration 021: "global" agora = linha PESSOAL do usuario logado
  const { data: { session } } = await supabase.auth.getSession();
  const uid = session?.user?.id;
  let q = supabase
    .from('calendar_integrations')
    .select(COLS)
    .is('workspace_id', null);
  if (uid) q = q.eq('user_id', uid);
  const { data } = await q.maybeSingle();
  globalCache = (data as GoogleIntegration) ?? null;
  markIntegrationConnected(null, !!data?.is_connected);
  notify();
  return globalCache;
}

// ---------- all ----------

export function subscribeIntegration(fn: () => void): () => void {
  listeners.add(fn);
  ensureChannel();
  return () => {
    listeners.delete(fn);
  };
}

export async function loadAllIntegrations(): Promise<Record<string, GoogleIntegration>> {
  const { data: { session } } = await supabase.auth.getSession();
  const myId = session?.user?.id;
  const { data } = await supabase.from('calendar_integrations').select(COLS);
  const map: Record<string, GoogleIntegration> = {};
  for (const row of (data ?? []) as unknown as GoogleIntegration[]) {
    if (row.workspace_id === null) {
      // Admin enxerga linhas pessoais de TODOS; so a minha e "global"
      if (!myId || row.user_id === myId) {
        globalCache = row;
        markIntegrationConnected(null, !!row.is_connected);
      }
    } else if (!row.user_id) {
      // Linha da agência — é o alvo do modo workspace para o time
      map[row.workspace_id] = row;
      cache.set(row.workspace_id, row);
      markIntegrationConnected(row.workspace_id, !!row.is_connected);
    }
    // Linhas pessoais de clientes (user_id != myId): visíveis só ao admin
    // via RLS — não alteram cache/map da agência.
  }
  notify();
  return map;
}

// ---------- realtime ----------

function ensureChannel(): void {
  if (channel) return;
  channel = supabase
    .channel('realtime-integrations')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'calendar_integrations' },
      payload => {
        // Migration 021: linhas pessoais de OUTROS usuarios nao sao "minha"
        // integracao global — admin as enxerga via RLS, mas so a propria conta.
        supabase.auth.getSession().then(({ data }) => {
          const myId = data.session?.user?.id;
          if (payload.eventType === 'DELETE') {
            const ws = (payload.old as Record<string, unknown> | null)?.workspace_id as string | undefined | null;
            if (ws === null || ws === undefined) {
              globalCache = null;
              markIntegrationConnected(null, false);
            } else if (ws) {
              cache.set(ws, null);
              markIntegrationConnected(ws, false);
            }
          } else {
            const row = payload.new as unknown as GoogleIntegration | null;
            if (row?.workspace_id === null || row?.workspace_id === undefined) {
              if (!myId || row?.user_id === myId) {
                globalCache = row;
                markIntegrationConnected(null, !!row?.is_connected);
              }
            } else if (row?.workspace_id) {
              // Linha da agência atualiza o cache do workspace;
              // linha pessoal de cliente só interessa ao dono
              if (!row.user_id || row.user_id === myId) {
                cache.set(row.workspace_id, row);
                markIntegrationConnected(row.workspace_id, !!row.is_connected);
              }
            }
          }
          notify();
        });
      }
    )
    .subscribe();
}

/** Logout: limpa channel + caches (registered em realtimeCleanup). */
export function resetIntegrationsRealtime(): void {
  if (channel) {
    supabase.removeChannel(channel);
    channel = null;
  }
  cache.clear();
  globalCache = null;
  loadingPromises.clear();
  notify();
}
registerRealtimeReset(resetIntegrationsRealtime);
