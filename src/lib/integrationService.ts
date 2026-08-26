import { supabase } from '@/lib/supabase';
import { markIntegrationConnected, type GoogleIntegration } from '@/lib/googleSync';

// ==========================================
// INTEGRATION SERVICE
// Single shared realtime channel for the
// whole calendar_integrations table.
// Supports per-workspace AND global (admin) mode.
// ==========================================

const COLS = 'workspace_id, user_id, google_calendar_id, google_calendar_name, google_account_email, is_connected, auto_sync, last_synced_at, sync_error';

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
  const { data } = await supabase
    .from('calendar_integrations')
    .select(COLS)
    .eq('workspace_id', wsId)
    .maybeSingle();
  cache.set(wsId, (data as GoogleIntegration) ?? null);
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
    } else {
      map[row.workspace_id] = row;
      cache.set(row.workspace_id, row);
      markIntegrationConnected(row.workspace_id, !!row.is_connected);
    }
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
              cache.set(row.workspace_id, row);
              markIntegrationConnected(row.workspace_id, !!row.is_connected);
            }
          }
          notify();
        });
      }
    )
    .subscribe();
}
