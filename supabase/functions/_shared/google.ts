// ==========================================
// SHARED: Google Calendar helpers
// OAuth state signing, token management,
// event mapping and efficient queue processing
// ==========================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

export const CAL_API = 'https://www.googleapis.com/calendar/v3';
export const TOKEN_API = 'https://oauth2.googleapis.com/token';

export interface IntegrationRow {
  id: string;
  workspace_id: string;
  google_calendar_id: string | null;
  google_calendar_name: string | null;
  google_account_email: string | null;
  access_token: string | null;
  refresh_token: string | null;
  token_expires_at: string | null;
  is_connected: boolean;
  auto_sync: boolean;
  last_synced_at: string | null;
  sync_error: string | null;
}

export interface QueueItem {
  id: string;
  workspace_id: string;
  action_id: string;
  operation: 'create' | 'update' | 'delete';
  attempts: number;
  action: Record<string, unknown> | null;
}

// ---------- base64url ----------

function bytesToB64Url(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function b64UrlEncode(str: string): string {
  return bytesToB64Url(new TextEncoder().encode(str));
}

// ---------- HMAC-signed OAuth state ----------

// ---------- CORS: allow APP_URL + localhost dev ----------

export function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get('Origin') ?? '';
  const appUrl = Deno.env.get('APP_URL');
  const allowed =
    origin === appUrl ||
    origin.startsWith('http://localhost:') ||
    origin.startsWith('http://127.0.0.1:');
  return {
    'Access-Control-Allow-Origin': allowed ? origin : (appUrl ?? '*'),
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-worker-secret',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };
}

function getStateSecret(): string {
  const secret = Deno.env.get('STATE_SECRET');
  if (!secret || secret.length < 16) {
    throw new Error('STATE_SECRET not configured or too short (min 16 chars)');
  }
  return secret;
}

async function hmacBytes(payload: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(getStateSecret()),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload));
  return new Uint8Array(sig);
}

export async function createState(workspaceId: string, userId: string, returnTo: string): Promise<string> {
  const payload = b64UrlEncode(JSON.stringify({ ws: workspaceId, u: userId, r: returnTo, t: Date.now() }));
  const sig = bytesToB64Url(await hmacBytes(payload));
  return `${payload}.${sig}`;
}

export async function verifyState(state: string): Promise<{ ws: string; u: string; r: string } | null> {
  const dot = state.indexOf('.');
  if (dot <= 0) return null;
  const payload = state.slice(0, dot);
  const sig = state.slice(dot + 1);
  const expected = bytesToB64Url(await hmacBytes(payload));
  if (sig.length !== expected.length) return null;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ sig.charCodeAt(i);
  if (diff !== 0) return null;
  try {
    const json = JSON.parse(new TextDecoder().decode(
      Uint8Array.from(atob(payload.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0)),
    ));
    if (!json.ws || !json.u || Date.now() - json.t > 600_000) return null;
    return { ws: json.ws, u: json.u, r: typeof json.r === 'string' ? json.r : '/sharks/integrations' };
  } catch {
    return null;
  }
}

// ---------- Supabase clients ----------

export function serviceClient() {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } },
  );
}

export async function verifyWorkspaceAccess(
  admin: ReturnType<typeof serviceClient>,
  userId: string,
  workspaceId: string,
): Promise<boolean> {
  const { data: u } = await admin.from('users').select('role').eq('id', userId).maybeSingle();
  if (u && (u.role === 'admin_sharks' || u.role === 'sharks_team')) return true;
  const { data: m } = await admin
    .from('memberships')
    .select('id')
    .eq('user_id', userId)
    .eq('workspace_id', workspaceId)
    .maybeSingle();
  return !!m;
}

// ---------- Token management ----------

export function getGoogleCredentials(): { clientId: string; clientSecret: string } {
  const clientId = Deno.env.get('GOOGLE_CLIENT_ID');
  const clientSecret = Deno.env.get('GOOGLE_CLIENT_SECRET');
  if (!clientId || !clientSecret) {
    throw new Error('GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET not configured');
  }
  return { clientId, clientSecret };
}

export async function refreshAccessToken(admin: ReturnType<typeof serviceClient>, integ: IntegrationRow): Promise<string> {
  if (!integ.refresh_token) throw new Error('Sem refresh token - reconecte a conta Google');
  const { clientId, clientSecret } = getGoogleCredentials();
  const res = await fetch(TOKEN_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: integ.refresh_token,
      grant_type: 'refresh_token',
    }),
  });
  if (!res.ok) throw new Error(`Token refresh falhou (${res.status}): ${await res.text()}`);
  let json: { access_token?: string; expires_in?: number };
  try {
    json = await res.json();
  } catch {
    throw new Error('Resposta invalida do endpoint de token Google');
  }
  if (!json.access_token) throw new Error('Token ausente na resposta do Google');
  const expiresAt = new Date(Date.now() + (json.expires_in ?? 3600) * 1000).toISOString();
  const { error: updError } = await admin
    .from('calendar_integrations')
    .update({ access_token: json.access_token, token_expires_at: expiresAt })
    .eq('id', integ.id);
  if (updError) throw new Error(`Falha ao persistir token: ${updError.message}`);
  return json.access_token;
}

export async function getValidToken(admin: ReturnType<typeof serviceClient>, integ: IntegrationRow): Promise<string> {
  const margin = Date.now() + 120_000;
  const exp = integ.token_expires_at ? new Date(integ.token_expires_at).getTime() : 0;
  if (integ.access_token && exp > margin) return integ.access_token;
  return refreshAccessToken(admin, integ);
}

// ---------- Event mapping ----------

const LONG_TYPES = new Set(['event', 'meeting', 'recording', 'photo_session', 'live']);
const TZ = '-03:00';

function fmtLocal(ms: number): string {
  const d = new Date(ms - 3 * 3600_000);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}T${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:00${TZ}`;
}

function pretty(v: unknown): string {
  return v ? String(v).replace(/_/g, ' ') : '';
}

export function buildEventBody(action: Record<string, any>): Record<string, unknown> {
  const pillar = action.editorial_pillar as { name?: string } | null;
  const campaign = action.campaign as { name?: string; objective?: string } | null;

  const lines: string[] = [];
  if (action.channel) lines.push(`Canal: ${action.channel}`);
  const tipo = pretty(action.format) || pretty(action.action_type);
  if (tipo) lines.push(`Tipo/Formato: ${tipo}`);
  if (pillar?.name) lines.push(`Pilar: ${pillar.name}`);
  if (campaign?.name) lines.push(`Campanha: ${campaign.name}${campaign.objective ? ` (${pretty(campaign.objective)})` : ''}`);
  if (action.theme) lines.push(`Tema: ${action.theme}`);
  if (action.hook) lines.push(`Gancho: ${action.hook}`);
  if (action.main_message) lines.push(`Mensagem principal: ${action.main_message}`);
  if (action.copy_text) lines.push(`Copy:\n${action.copy_text}`);
  if (action.cta) lines.push(`CTA: ${action.cta}`);
  if (action.audience) lines.push(`Publico: ${action.audience}`);
  if (action.product) lines.push(`Produto: ${action.product}`);
  if (action.description) lines.push(`Descricao:\n${action.description}`);
  if (action.observations) lines.push(`Observacoes:\n${action.observations}`);
  lines.push('');
  lines.push('Sincronizado automaticamente pelo Sharks Calendario Editorial');

  let start: Record<string, string>;
  let end: Record<string, string>;
  if (action.action_time) {
    const [hh, mm] = String(action.action_time).slice(0, 5).split(':');
    const startMs = Date.parse(`${action.action_date}T${hh}:${mm}:00${TZ}`);
    const dur = LONG_TYPES.has(String(action.action_type)) ? 60 : 30;
    start = { dateTime: fmtLocal(startMs), timeZone: 'America/Sao_Paulo' };
    end = { dateTime: fmtLocal(startMs + dur * 60_000), timeZone: 'America/Sao_Paulo' };
  } else {
    const nextDay = new Date(Date.parse(`${action.action_date}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
    start = { date: action.action_date };
    end = { date: nextDay };
  }

  return { summary: action.title, description: lines.join('\n'), start, end };
}

// ---------- Queue processing ----------

const NULL_UUID = '00000000-0000-0000-0000-000000000000';

async function gFetch(url: string, init: RequestInit, token: string): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set('Authorization', `Bearer ${token}`);
  if (init.body) headers.set('Content-Type', 'application/json');
  return fetch(url, { ...init, headers });
}

export async function processWorkspace(
  admin: ReturnType<typeof serviceClient>,
  workspaceId: string,
): Promise<{ workspace_id: string; processed: number; ok: number; failed: number }> {
  const stat = { workspace_id: workspaceId, processed: 0, ok: 0, failed: 0 };

  const { data: locked } = await admin.rpc('fn_try_sync_lock', { ws: workspaceId });
  if (!locked) return { ...stat, skipped_lock: true } as typeof stat & { skipped_lock: boolean };

  try {
    // Try per-workspace integration first, then fall back to global (workspace_id IS NULL)
    let { data: integ } = await admin
      .from('calendar_integrations')
      .select('*')
      .eq('workspace_id', workspaceId)
      .maybeSingle();

    let isGlobal = false;
    if (!integ || !integ.is_connected) {
      const { data: globalInteg } = await admin
        .from('calendar_integrations')
        .select('*')
        .is('workspace_id', null)
        .eq('is_connected', true)
        .eq('auto_sync', true)
        .maybeSingle();
      if (globalInteg) {
        integ = globalInteg;
        isGlobal = true;
      }
    }

    if (!integ || !integ.is_connected) {
      await admin
        .from('calendar_sync_queue')
        .update({ status: 'done', processed_at: new Date().toISOString(), last_error: 'integracao inativa' })
        .eq('workspace_id', workspaceId)
        .eq('status', 'pending');
      return stat;
    }

    let token: string;
    try {
      token = await getValidToken(admin, integ as IntegrationRow);
    } catch (e) {
      const errFilter = isGlobal
        ? { workspace_id: null as unknown }
        : { workspace_id: workspaceId };
      await admin
        .from('calendar_integrations')
        .update({ sync_error: `Falha de autenticacao Google: ${String((e as Error).message).slice(0, 300)}` })
        .match(errFilter as Record<string, unknown>);
      return stat;
    }

    const calId = integ.google_calendar_id || 'primary';

    const { data: queue } = await admin
      .from('calendar_sync_queue')
      .select('id, workspace_id, action_id, operation, attempts, action:actions(*, campaign:campaigns(name,objective), editorial_pillar:editorial_pillars(name))')
      .eq('workspace_id', workspaceId)
      .eq('status', 'pending')
      .order('created_at')
      .limit(50);

    if (!queue || queue.length === 0) return stat;

    const actionIds = queue.map(q => q.action_id).filter(Boolean);
    // Cross-workspace dedup: fetch ALL links for these action_ids (not just current workspace)
    // to prevent duplicate Google Calendar events when same action is queued for multiple workspaces
    const { data: links } = await admin
      .from('calendar_event_links')
      .select('action_id, google_event_id, workspace_id')
      .in('action_id', actionIds.length ? actionIds : [NULL_UUID]);
    const linkMap = new Map<string, string>((links ?? []).map(l => [l.action_id, l.google_event_id]));

    for (const item of queue as unknown as QueueItem[]) {
      stat.processed++;
      const now = () => new Date().toISOString();
      try {
        if (!item.action_id) {
          await admin.from('calendar_sync_queue').update({ status: 'done', processed_at: now() }).eq('id', item.id);
          continue;
        }

        if (item.operation === 'delete') {
          const eventId = linkMap.get(item.action_id);
          if (eventId) {
            const res = await gFetch(`${CAL_API}/calendars/${encodeURIComponent(calId)}/events/${encodeURIComponent(eventId)}`, { method: 'DELETE' }, token);
            if (!res.ok && res.status !== 404 && res.status !== 410) {
              throw new Error(`Google DELETE ${res.status}: ${(await res.text()).slice(0, 200)}`);
            }
          }
          await admin.from('calendar_event_links').delete().eq('action_id', item.action_id);
        } else {
          const action = item.action as Record<string, any> | null;
          if (!action) {
            await admin.from('calendar_sync_queue').update({ status: 'done', processed_at: now(), last_error: 'acao removida antes do sync' }).eq('id', item.id);
            stat.ok++;
            continue;
          }
          const eventId = linkMap.get(item.action_id);
          const bodyJson = JSON.stringify(buildEventBody(action));
          let res: Response;
          let googleEventId: string;

          if (eventId) {
            // Event exists (possibly from another workspace in global mode) — update it
            googleEventId = eventId;
            res = await gFetch(`${CAL_API}/calendars/${encodeURIComponent(calId)}/events/${encodeURIComponent(eventId)}`, { method: 'PATCH', body: bodyJson }, token);
            if ((res.status === 404 || res.status === 410)) {
              res = await gFetch(`${CAL_API}/calendars/${encodeURIComponent(calId)}/events`, { method: 'POST', body: bodyJson }, token);
            }
          } else {
            // No link found — create new event
            res = await gFetch(`${CAL_API}/calendars/${encodeURIComponent(calId)}/events`, { method: 'POST', body: bodyJson }, token);
          }
          if (!res.ok) throw new Error(`Google ${res.status}: ${(await res.text()).slice(0, 200)}`);
          const ev = await res.json();
          googleEventId = ev.id;

          // Upsert link with conflict handling (fixes race condition R1)
          const { error: linkError } = await admin
            .from('calendar_event_links')
            .upsert({
              action_id: item.action_id,
              workspace_id: workspaceId,
              google_event_id: googleEventId,
              last_synced_at: now(),
              sync_status: 'synced',
            }, { onConflict: 'action_id,workspace_id' });

          if (linkError) {
            // Composite conflict passed — check for legacy single-link (cross-workspace dedup)
            const { data: existingLink } = await admin
              .from('calendar_event_links')
              .select('action_id')
              .eq('action_id', item.action_id)
              .limit(1)
              .maybeSingle();
            if (existingLink) {
              await admin.from('calendar_event_links')
                .update({ last_synced_at: now(), sync_status: 'synced' })
                .eq('action_id', item.action_id);
            } else {
              throw new Error(`link upsert: ${linkError.message}`);
            }
          }
          await admin.from('actions').update({ sync_status: 'synced' }).eq('id', item.action_id);
        }

        await admin.from('calendar_sync_queue').update({ status: 'done', processed_at: now() }).eq('id', item.id);
        stat.ok++;
      } catch (e) {
        stat.failed++;
        const msg = String((e as Error).message ?? e).slice(0, 400);
        const attempts = (item.attempts ?? 0) + 1;
        await admin
          .from('calendar_sync_queue')
          .update({ attempts, last_error: msg, status: attempts >= 5 ? 'error' : 'pending' })
          .eq('id', item.id);
      }
    }

    // Update last_synced_at on the integration used (per-workspace or global)
    const updateFilter = isGlobal
      ? { workspace_id: null as unknown }
      : { workspace_id: workspaceId };
    await admin
      .from('calendar_integrations')
      .update({
        last_synced_at: new Date().toISOString(),
        sync_error: stat.failed ? `${stat.failed} item(ns) falharam no ultimo ciclo` : null,
      })
      .match(updateFilter as Record<string, unknown>);

    return stat;
  } finally {
    await admin.rpc('fn_release_sync_lock', { ws: workspaceId });
  }
}
