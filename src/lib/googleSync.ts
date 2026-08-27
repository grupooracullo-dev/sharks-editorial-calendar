import { supabase } from '@/lib/supabase';
import type { SyncMode, EnvironmentType } from '@/types';

// ==========================================
// GOOGLE SYNC CLIENT
// Bridge between frontend mutations and the
// Edge Function sync engine (queue-based).
// Multi-ambiente (migration 025): sync_mode
// unified | split escolhido pelo usuario na
// conexao; toggle por ambiente.
// ==========================================

const FN_BASE = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`;

export interface GoogleIntegration {
  workspace_id: string;
  user_id: string | null;
  google_calendar_id: string | null;
  google_calendar_name: string | null;
  google_account_email: string | null;
  is_connected: boolean;
  auto_sync: boolean;
  last_synced_at: string | null;
  sync_error: string | null;
  sync_mode?: SyncMode;
  env_calendar_ids?: Record<string, string> | null;
  env_auto_sync?: Record<string, boolean> | null;
}

export interface GoogleCalendarOption {
  id: string;
  name: string;
  primary: boolean;
  access_role?: string;
}

// ---------- connection registry ----------
// Kept in module scope so mutation services know
// whether firing the debounced sync is worth it.
const connectedWorkspaces = new Set<string>();
let connectedGlobal = false;

export function markIntegrationConnected(wsId: string | undefined | null, connected: boolean): void {
  if (wsId === null || wsId === undefined) {
    connectedGlobal = connected;
    return;
  }
  if (connected) connectedWorkspaces.add(wsId);
  else connectedWorkspaces.delete(wsId);
}

export function isConnected(wsId?: string | null): boolean {
  if (wsId === null || wsId === undefined) return connectedGlobal;
  return connectedWorkspaces.has(wsId);
}

// ---------- debounced processing ----------
// Rapid edits collapse: only one request per
// workspace every 2.5s. The DB trigger already
// queued each change; this just accelerates the drain.
const timers = new Map<string, ReturnType<typeof setTimeout>>();

export function notifyActionChanged(workspaceId?: string | null): void {
  const hasWs = workspaceId && connectedWorkspaces.has(workspaceId);
  const hasGlobal = connectedGlobal;
  if (!hasWs && !hasGlobal) return;
  const key = workspaceId || '__global__';
  const existing = timers.get(key);
  if (existing) clearTimeout(existing);
  timers.set(
    key,
    setTimeout(() => {
      timers.delete(key);
      processQueue(hasWs ? workspaceId : null).catch(() => {});
    }, 2500)
  );
}

async function authHeaders(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  return data.session ? { Authorization: `Bearer ${data.session.access_token}` } : {};
}

async function callFn<T>(body: Record<string, unknown>): Promise<T> {
  const res = await fetch(`${FN_BASE}/google-sync`, {
    method: 'POST',
    headers: { ...(await authHeaders()), 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
  return json as T;
}

// ---------- public API ----------

export function startGoogleConnect(
  workspaceId: string | null,
  userId: string,
  returnTo = '/sharks/integrations',
  syncMode: SyncMode = 'unified',
): void {
  const wsParam = workspaceId ?? 'global';
  window.location.href =
    `${FN_BASE}/google-oauth-start` +
    `?workspace_id=${encodeURIComponent(wsParam)}` +
    `&user_id=${encodeURIComponent(userId)}` +
    `&return_to=${encodeURIComponent(returnTo)}` +
    `&sync_mode=${syncMode}`;
}

export interface SyncResult {
  processed?: number;
  ok?: number;
  failed?: number;
  skipped_lock?: boolean;
}

export function processQueue(workspaceId: string | null): Promise<SyncResult> {
  return callFn<SyncResult>(workspaceId ? { workspace_id: workspaceId } : {});
}

export function listCalendars(workspaceId: string | null): Promise<{ calendars: GoogleCalendarOption[] }> {
  return callFn<{ calendars: GoogleCalendarOption[] }>(workspaceId ? { workspace_id: workspaceId, op: 'list_calendars' } : { op: 'list_calendars' });
}

export function setTargetCalendar(workspaceId: string | null, calendarId: string, calendarName: string): Promise<{ ok: boolean }> {
  return callFn<{ ok: boolean }>({
    ...(workspaceId ? { workspace_id: workspaceId } : {}),
    op: 'set_target',
    calendar_id: calendarId,
    calendar_name: calendarName,
  });
}

export interface CreatedCalendar {
  ok: boolean;
  calendar_id?: string;
  calendar_name?: string;
}

export function createClientCalendar(workspaceId: string | null): Promise<CreatedCalendar> {
  return callFn<CreatedCalendar>({
    ...(workspaceId ? { workspace_id: workspaceId } : {}),
    op: 'create_client_calendar',
  });
}

export function disconnectCalendar(workspaceId: string | null): Promise<{ ok: boolean }> {
  if (workspaceId) connectedWorkspaces.delete(workspaceId);
  return callFn<{ ok: boolean }>({
    ...(workspaceId ? { workspace_id: workspaceId } : {}),
    op: 'disconnect',
  });
}

export async function setAutoSync(workspaceId: string | null, value: boolean): Promise<void> {
  // Via edge function: a RLS de escrita em calendar_integrations exige
  // env admin para linhas da agencia — team tambem precisa alternar.
  await callFn({ ...(workspaceId ? { workspace_id: workspaceId } : {}), op: 'set_auto_sync', value });
}

// ---------- Multi-ambiente (migration 025) ----------

/** Liga/desliga o sync de UM ambiente nesta integracao. */
export function setEnvSync(workspaceId: string | null, env: EnvironmentType, enabled: boolean): Promise<{ ok: boolean }> {
  return callFn<{ ok: boolean }>({
    ...(workspaceId ? { workspace_id: workspaceId } : {}),
    op: 'set_env_sync',
    env,
    enabled,
  });
}

/** Alterna unified <-> split (split cria agendas por ambiente no Google). */
export function changeSyncMode(workspaceId: string | null, mode: SyncMode): Promise<{ ok: boolean; sync_mode: SyncMode; env_calendar_ids?: Record<string, string> }> {
  return callFn<{ ok: boolean; sync_mode: SyncMode; env_calendar_ids?: Record<string, string> }>({
    ...(workspaceId ? { workspace_id: workspaceId } : {}),
    op: 'change_sync_mode',
    mode,
  });
}
