// ==========================================
// SHARED: Google Calendar helpers
// OAuth state signing, token management,
// event mapping and efficient queue processing
// Multi-ambiente (migration 023/025):
//   sync_mode unified | split, env_calendar_ids,
//   fila generalizada por source.
// ==========================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

export const CAL_API = 'https://www.googleapis.com/calendar/v3';
export const TOKEN_API = 'https://oauth2.googleapis.com/token';

export type EnvType = 'sharks_company' | 'estrategos';
export const ENV_LABEL: Record<EnvType, string> = {
  sharks_company: 'Sharks',
  estrategos: 'Estrategos',
};

export interface IntegrationRow {
  id: string;
  workspace_id: string;
  user_id: string | null;
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
  sync_mode: 'unified' | 'split';
  env_calendar_ids: Record<string, string> | null;
  env_auto_sync: Record<string, boolean> | null;
}

export type QueueSource = 'sharks_action' | 'estrategos_meeting' | 'estrategos_implementation';

export interface QueueItem {
  id: string;
  workspace_id: string;
  action_id: string | null;
  source: QueueSource;
  source_id: string | null;
  operation: 'create' | 'update' | 'delete';
  attempts: number;
  google_event_id?: string | null;
  integration_id?: string | null;
  action: Record<string, unknown> | null;
  meeting: Record<string, unknown> | null;
  implementation: Record<string, unknown> | null;
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

export async function createState(
  workspaceId: string,
  userId: string,
  returnTo: string,
  syncMode: 'unified' | 'split' = 'unified',
): Promise<string> {
  const payload = b64UrlEncode(JSON.stringify({ ws: workspaceId, u: userId, r: returnTo, m: syncMode, t: Date.now() }));
  const sig = bytesToB64Url(await hmacBytes(payload));
  return `${payload}.${sig}`;
}

export async function verifyState(state: string): Promise<{ ws: string; u: string; r: string; m: 'unified' | 'split' } | null> {
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
    return {
      ws: json.ws,
      u: json.u,
      r: typeof json.r === 'string' ? json.r : '/sharks/integrations',
      m: json.m === 'split' ? 'split' : 'unified',
    };
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
  const { data: u } = await admin.from('users').select('role, is_guardian').eq('id', userId).maybeSingle();
  if (u && (u.is_guardian || u.role === 'oracullo_admin' || u.role === 'admin_sharks' || u.role === 'sharks_team')) return true;

  // Staff por ambiente (user_environments): o ambiente do workspace
  // precisa bater com um cargo admin/team do usuario — sem depender
  // de membership (RLS ws_visible usa o mesmo criterio).
  const [wsOrgRes, envsRes] = await Promise.all([
    admin.from('workspaces').select('organization_id').eq('id', workspaceId).maybeSingle(),
    admin.from('user_environments').select('environment, role').eq('user_id', userId),
  ]);
  if (wsOrgRes.data?.organization_id) {
    const { data: org } = await admin
      .from('organizations')
      .select('environment')
      .eq('id', wsOrgRes.data.organization_id)
      .maybeSingle();
    if (org && (envsRes.data ?? []).some(e => e.environment === org.environment && (e.role === 'admin' || e.role === 'team'))) {
      return true;
    }
  }

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

// ---------- Roteamento por ambiente ----------

/** Agenda destino da integracao para o ambiente do item. */
export function targetCalendarFor(integ: IntegrationRow, env: EnvType): string {
  if (integ.sync_mode === 'split') {
    const ids = integ.env_calendar_ids ?? {};
    return ids[env] || integ.google_calendar_id || 'primary';
  }
  return integ.google_calendar_id || 'primary';
}

/** Toggle por ambiente (ausente = ativo). */
export function envSyncEnabled(integ: IntegrationRow, env: EnvType): boolean {
  const flags = integ.env_auto_sync ?? {};
  return flags[env] !== false;
}

// ---------- Event mapping ----------

const TZ = '-03:00';

function fmtLocal(ms: number): string {
  const d = new Date(ms - 3 * 3600_000);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}T${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:00${TZ}`;
}

function pretty(v: unknown): string {
  return v ? String(v).replace(/_/g, ' ') : '';
}

function envPrefix(source: QueueSource, unified: boolean): string {
  if (!unified) return '';
  return source === 'sharks_action' ? '[Sharks] ' : '[Estrategos] ';
}

export function buildEventBody(
  source: QueueSource,
  row: Record<string, any>,
  integ: IntegrationRow,
): Record<string, unknown> {
  const unified = integ.sync_mode !== 'split';
  const prefix = envPrefix(source, unified);

  if (source === 'estrategos_meeting' || source === 'estrategos_implementation') {
    const lines: string[] = [];
    if (source === 'estrategos_implementation' && row.system_name) {
      lines.push(`Sistema: ${row.system_name}`);
    }
    if (row.description) lines.push(`Descricao:\n${row.description}`);
    if (source === 'estrategos_meeting' && Array.isArray(row.attendees) && row.attendees.length) {
      lines.push(`Participantes: ${row.attendees.join(', ')}`);
    }
    if (row.location) lines.push(`Local: ${row.location}`);
    lines.push('');
    lines.push('Sincronizado automaticamente pelo Oracullo Calendar');

    const date = source === 'estrategos_meeting' ? row.meeting_date : row.target_date;
    const time = source === 'estrategos_meeting' ? row.meeting_time : null;
    let start: Record<string, string>;
    let end: Record<string, string>;
    if (time) {
      const [hh, mm] = String(time).slice(0, 5).split(':');
      const startMs = Date.parse(`${date}T${hh}:${mm}:00${TZ}`);
      const dur = source === 'estrategos_meeting' ? (row.duration_minutes ?? 60) * 60_000 : 60 * 60_000;
      start = { dateTime: fmtLocal(startMs), timeZone: 'America/Sao_Paulo' };
      end = { dateTime: fmtLocal(startMs + dur), timeZone: 'America/Sao_Paulo' };
    } else {
      const nextDay = new Date(Date.parse(`${date}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
      start = { date };
      end = { date: nextDay };
    }
    return { summary: `${prefix}${row.title ?? row.name ?? ''}`, description: lines.join('\n'), start, end };
  }

  // sharks_action (formato historico validado)
  const action = row;
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
  lines.push('Sincronizado automaticamente pelo Oracullo Calendar');

  const LONG_TYPES = new Set(['event', 'meeting', 'recording', 'photo_session', 'live']);
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

  return { summary: `${prefix}${action.title}`, description: lines.join('\n'), start, end };
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
    // Integracoes que cobrem este workspace (por-cliente OU
    // pessoais globais), filtradas por ambiente do workspace.
    const { data: wsRow } = await admin
      .from('workspaces')
      .select('organization_id, organizations(environment)')
      .eq('id', workspaceId)
      .maybeSingle();
    const env = ((wsRow as { organizations?: { environment?: EnvType } } | null)?.organizations?.environment ?? 'sharks_company') as EnvType;

    const [{ data: wsRows }, { data: personalRows }] = await Promise.all([
      admin
        .from('calendar_integrations')
        .select('*')
        .eq('workspace_id', workspaceId)
        .eq('is_connected', true)
        .eq('auto_sync', true),
      admin
        .from('calendar_integrations')
        .select('*')
        .is('workspace_id', null)
        .not('user_id', 'is', null)
        .eq('is_connected', true)
        .eq('auto_sync', true),
    ]);
    // Toggle por ambiente: pausado sai do fan-out
    const integs = ([...(wsRows ?? []), ...(personalRows ?? [])] as unknown as IntegrationRow[])
      .filter(i => envSyncEnabled(i, env));

    const { data: queue } = await admin
      .from('calendar_sync_queue')
      .select(
        'id, workspace_id, action_id, source, source_id, operation, attempts, google_event_id, integration_id, ' +
        'action:actions(*, campaign:campaigns(name,objective), editorial_pillar:editorial_pillars(name))',
      )
      .eq('workspace_id', workspaceId)
      .eq('status', 'pending')
      .order('created_at')
      .limit(50);

    const now = () => new Date().toISOString();

    if (!queue || queue.length === 0) {
      if (integs.length > 0) {
        await admin
          .from('calendar_integrations')
          .update({ last_synced_at: now(), sync_error: null })
          .in('id', integs.map(i => i.id));
      }
      return stat;
    }

    // Fetch meetings/implementations dos itens correspondentes
    const meetingIds = (queue as QueueItem[]).filter(q => q.source === 'estrategos_meeting' && q.source_id).map(q => q.source_id!) as string[];
    const implIds = (queue as QueueItem[]).filter(q => q.source === 'estrategos_implementation' && q.source_id).map(q => q.source_id!) as string[];
    const meetingMap = new Map<string, Record<string, any>>();
    const implMap = new Map<string, Record<string, any>>();
    if (meetingIds.length) {
      const { data: ms } = await admin.from('estrategos_meetings').select('*').in('id', meetingIds);
      for (const m of (ms ?? []) as Record<string, any>[]) meetingMap.set(m.id, m);
    }
    if (implIds.length) {
      const { data: is } = await admin.from('estrategos_implementations').select('*').in('id', implIds);
      for (const i of (is ?? []) as Record<string, any>[]) implMap.set(i.id, i);
    }

    // Links existentes por (source:source_id:integracao) + legado por action
    const sourceKeys = (queue as QueueItem[]).filter(q => q.source_id).map(q => `${q.source}:${q.source_id}`) as string[];
    const actionIds = queue.map(q => q.action_id).filter(Boolean) as string[];
    const linkMap = new Map<string, string>();
    {
      const { data: links } = await admin
        .from('calendar_event_links')
        .select('action_id, source, source_id, google_event_id, workspace_id, integration_id')
        .or(
          [
            actionIds.length ? `action_id.in.(${actionIds.join(',')})` : null,
            sourceKeys.length ? `and(source.in.(${queue.filter(q => q.source).map(q => q.source).join(',')}),source_id.in.(${(queue as QueueItem[]).filter(q => q.source_id).map(q => q.source_id).join(',')}))` : null,
          ].filter(Boolean).join(',') || `action_id.eq.${NULL_UUID}`,
        );
      for (const l of links ?? []) {
        if (l.source && l.source_id) {
          linkMap.set(`${l.source}:${l.source_id}:${l.integration_id}`, l.google_event_id);
        } else if (l.action_id && l.integration_id) {
          linkMap.set(`sharks_action:${l.action_id}:${l.integration_id}`, l.google_event_id);
        }
      }
    }

    // Cache de token por integracao (evita refresh repetido no fan-out)
    const tokens = new Map<string, string>();
    const tokenFor = async (integ: IntegrationRow): Promise<string> => {
      const cached = tokens.get(integ.id);
      if (cached) return cached;
      try {
        const t = await getValidToken(admin, integ);
        tokens.set(integ.id, t);
        return t;
      } catch (e) {
        await admin
          .from('calendar_integrations')
          .update({ sync_error: `Falha de autenticacao Google: ${String((e as Error).message).slice(0, 300)}` })
          .eq('id', integ.id);
        throw e;
      }
    };

    const usedIntegIds = new Set<string>();

    const syncStatusTable: Record<QueueSource, string> = {
      sharks_action: 'actions',
      estrategos_meeting: 'estrategos_meetings',
      estrategos_implementation: 'estrategos_implementations',
    };
    const setSyncStatus = async (item: QueueItem, value: string) => {
      const src = item.source;
      const sid = item.source_id ?? item.action_id;
      if (!sid) return;
      await admin.from(syncStatusTable[src]).update({ sync_status: value }).eq('id', sid);
    };

    for (const item of queue as unknown as QueueItem[]) {
      stat.processed++;
      try {
        // Delete embutido (migration 014/025): o registro origem ja
        // foi removido; integration_id diz EM QUAL agenda apagar.
        if (item.operation === 'delete' && !item.source_id && !item.action_id) {
          let target: IntegrationRow | null = null;
          if (item.integration_id) {
            const { data: t } = await admin
              .from('calendar_integrations')
              .select('*')
              .eq('id', item.integration_id)
              .maybeSingle();
            target = (t as IntegrationRow) ?? null;
          } else if (integs.length > 0) {
            target = integs[0]; // legado: sem integration_id
          }
          if (target) {
            usedIntegIds.add(target.id);
            const token = await tokenFor(target);
            const calId = targetCalendarFor(target, env);
            const eventId = item.google_event_id;
            if (eventId) {
              const res = await gFetch(
                `${CAL_API}/calendars/${encodeURIComponent(calId)}/events/${encodeURIComponent(eventId)}`,
                { method: 'DELETE' },
                token,
              );
              if (!res.ok && res.status !== 404 && res.status !== 410) {
                throw new Error(`Google DELETE ${res.status}: ${(await res.text()).slice(0, 200)}`);
              }
            }
          }
          await admin.from('calendar_sync_queue').update({ status: 'done', processed_at: now() }).eq('id', item.id);
          stat.ok++;
          continue;
        }

        const src = item.source;
        const sid = item.source_id ?? item.action_id;
        if (!sid) {
          await admin.from('calendar_sync_queue').update({ status: 'done', processed_at: now() }).eq('id', item.id);
          continue;
        }

        if (integs.length === 0) {
          await admin
            .from('calendar_sync_queue')
            .update({ status: 'done', processed_at: now(), last_error: 'integracao inativa' })
            .eq('id', item.id);
          stat.ok++;
          continue;
        }

        if (item.operation === 'delete') {
          // Registro cancelado: remove o evento de TODAS as agendas
          const errs: string[] = [];
          let anyOk = false;
          for (const integ of integs) {
            usedIntegIds.add(integ.id);
            try {
              const eventId = linkMap.get(`${src}:${sid}:${integ.id}`);
              if (eventId) {
                const token = await tokenFor(integ);
                const calId = targetCalendarFor(integ, env);
                const res = await gFetch(
                  `${CAL_API}/calendars/${encodeURIComponent(calId)}/events/${encodeURIComponent(eventId)}`,
                  { method: 'DELETE' },
                  token,
                );
                if (!res.ok && res.status !== 404 && res.status !== 410) {
                  throw new Error(`DELETE ${res.status}`);
                }
              }
              anyOk = true;
            } catch (e) {
              errs.push(`${integ.google_account_email ?? integ.id}: ${String((e as Error).message).slice(0, 120)}`);
            }
          }
          if (!anyOk) throw new Error(errs.join(' | ').slice(0, 380));
          await admin.from('calendar_event_links').delete().match({ source: src, source_id: sid });
          await setSyncStatus(item, 'not_synced');
          await admin
            .from('calendar_sync_queue')
            .update({ status: 'done', processed_at: now(), last_error: errs.length ? `parcial: ${errs.join(' | ').slice(0, 200)}` : null })
            .eq('id', item.id);
          stat.ok++;
        } else {
          // create/update: fan-out para TODAS as integracoes ativas
          const row =
            src === 'estrategos_meeting' ? meetingMap.get(sid) :
            src === 'estrategos_implementation' ? implMap.get(sid) :
            (item.action as Record<string, any> | null);
          if (!row) {
            await admin.from('calendar_sync_queue').update({ status: 'done', processed_at: now(), last_error: 'registro removido antes do sync' }).eq('id', item.id);
            stat.ok++;
            continue;
          }
          const errs: string[] = [];
          let anyOk = false;
          for (const integ of integs) {
            usedIntegIds.add(integ.id);
            try {
              const token = await tokenFor(integ);
              const calId = targetCalendarFor(integ, env);
              const bodyJson = JSON.stringify(buildEventBody(src, row, integ));
              const eventId = linkMap.get(`${src}:${sid}:${integ.id}`);
              let res: Response;
              if (eventId) {
                res = await gFetch(
                  `${CAL_API}/calendars/${encodeURIComponent(calId)}/events/${encodeURIComponent(eventId)}`,
                  { method: 'PATCH', body: bodyJson },
                  token,
                );
                if (res.status === 404 || res.status === 410) {
                  res = await gFetch(`${CAL_API}/calendars/${encodeURIComponent(calId)}/events`, { method: 'POST', body: bodyJson }, token);
                }
              } else {
                res = await gFetch(`${CAL_API}/calendars/${encodeURIComponent(calId)}/events`, { method: 'POST', body: bodyJson }, token);
              }
              if (!res.ok) throw new Error(`Google ${res.status}: ${(await res.text()).slice(0, 150)}`);
              const ev = await res.json();

              await admin.from('calendar_event_links').upsert({
                action_id: src === 'sharks_action' ? sid : null,
                source: src,
                source_id: sid,
                workspace_id: workspaceId,
                integration_id: integ.id,
                google_event_id: ev.id,
                last_synced_at: now(),
                sync_status: 'synced',
              }, { onConflict: 'source,source_id,integration_id' });
              anyOk = true;
            } catch (e) {
              errs.push(`${integ.google_account_email ?? integ.id}: ${String((e as Error).message).slice(0, 120)}`);
            }
          }
          await setSyncStatus(item, anyOk ? 'synced' : 'sync_error');
          if (!anyOk) throw new Error(errs.join(' | ').slice(0, 380));
          await admin
            .from('calendar_sync_queue')
            .update({ status: 'done', processed_at: now(), last_error: errs.length ? `parcial: ${errs.join(' | ').slice(0, 200)}` : null })
            .eq('id', item.id);
          stat.ok++;
        }
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

    // Heartbeat nas integracoes efetivamente usadas neste ciclo
    if (usedIntegIds.size > 0) {
      await admin
        .from('calendar_integrations')
        .update({
          last_synced_at: new Date().toISOString(),
          sync_error: stat.failed ? `${stat.failed} item(ns) falharam no ultimo ciclo` : null,
        })
        .in('id', [...usedIntegIds]);
    }

    return stat;
  } finally {
    await admin.rpc('fn_release_sync_lock', { ws: workspaceId });
  }
}
