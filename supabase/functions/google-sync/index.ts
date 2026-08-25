// ==========================================
// google-sync
// Authenticated entrypoint for the sync engine.
//
// Modes:
//  1. Worker (cron): header x-worker-secret,
//     body {"mode":"worker"} - drains all queues.
//  2. User: Supabase JWT + workspace_id -
//     processes that workspace queue, or runs
//     ops: list_calendars | set_target | disconnect.
// ==========================================

import { CAL_API, getValidToken, processWorkspace, serviceClient, verifyWorkspaceAccess } from '../_shared/google.ts';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-worker-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

const NULL_UUID = '00000000-0000-0000-0000-000000000000';

// ==========================================
// Migracao de agenda destino: remove eventos
// da agenda antiga, reseta vinculos e
// re-enfileira tudo para a nova agenda.
// ==========================================
async function migrateTarget(
  admin: ReturnType<typeof serviceClient>,
  wsId: string,
  token: string,
  oldCalId: string,
): Promise<void> {
  // 1. remover eventos da agenda antiga
  const { data: links } = await admin
    .from('calendar_event_links')
    .select('google_event_id')
    .eq('workspace_id', wsId);
  for (const l of links ?? []) {
    if (!l.google_event_id) continue;
    await fetch(
      `${CAL_API}/calendars/${encodeURIComponent(oldCalId)}/events/${encodeURIComponent(l.google_event_id)}`,
      { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } },
    ).catch(() => {});
  }

  // 2. resetar vinculos e status
  await admin.from('calendar_event_links').delete().eq('workspace_id', wsId);
  await admin.from('actions').update({ sync_status: 'not_synced' }).eq('workspace_id', wsId).neq('status', 'cancelled');

  // 3. re-enfileirar todas as acoes ativas para re-sync na nova agenda
  await admin.from('calendar_sync_queue').delete().eq('workspace_id', wsId).in('status', ['pending', 'error']);
  const { data: acts } = await admin.from('actions').select('id').eq('workspace_id', wsId).neq('status', 'cancelled');
  if (acts?.length) {
    await admin
      .from('calendar_sync_queue')
      .insert(acts.map(a => ({ workspace_id: wsId, action_id: a.id, operation: 'create' })));
  }
}

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json(405, { error: 'Use POST' });

  const admin = serviceClient();
  const body = await req.json().catch(() => ({}));

  // ---------- Worker mode ----------
  const workerSecret = Deno.env.get('WORKER_SECRET');
  if (body?.mode === 'worker') {
    if (!workerSecret || req.headers.get('x-worker-secret') !== workerSecret) {
      return json(401, { error: 'Worker secret invalido' });
    }
    const { data: rows } = await admin
      .from('calendar_sync_queue')
      .select('workspace_id')
      .eq('status', 'pending')
      .order('created_at')
      .limit(500);

    const workspaces = [...new Set((rows ?? []).map(r => r.workspace_id))].slice(0, 15);
    const results = [];
    for (const ws of workspaces) results.push(await processWorkspace(admin, ws));
    return json(200, { mode: 'worker', workspaces: workspaces.length, results });
  }

  // ---------- User mode ----------
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return json(401, { error: 'Token ausente' });

  const token = authHeader.replace(/^Bearer /i, '');
  const { data: userData } = await admin.auth.getUser(token);
  if (!userData?.user) return json(401, { error: 'Token invalido' });

  const op: string = body?.op ?? 'process';
  const wsId: string | null = body?.workspace_id ?? null;

  // Global mode: workspace_id = null (admin sees all clients)
  const isGlobal = wsId === null;

  if (!isGlobal && !wsId) return json(400, { error: 'workspace_id obrigatorio' });

  if (!isGlobal) {
    const allowed = await verifyWorkspaceAccess(admin, userData.user.id, wsId);
    if (!allowed) return json(403, { error: 'Sem acesso a este workspace' });
  }

  // Global mode: only admin_sharks and sharks_team allowed
  if (isGlobal) {
    const { data: u } = await admin.from('users').select('role').eq('id', userData.user.id).maybeSingle();
    if (!u || (u.role !== 'admin_sharks' && u.role !== 'sharks_team')) {
      return json(403, { error: 'Sem acesso ao modo global' });
    }
  }

  const { data: integ } = isGlobal
    ? await admin
        .from('calendar_integrations')
        .select('*')
        .is('workspace_id', null)
        .maybeSingle()
    : await admin
        .from('calendar_integrations')
        .select('*')
        .eq('workspace_id', wsId)
        .maybeSingle();

  try {
    switch (op) {
      case 'list_calendars': {
        if (!integ?.is_connected) return json(400, { error: 'Integracao nao conectada' });
        const t = await getValidToken(admin, integ);
        const res = await fetch(`${CAL_API}/users/me/calendarList?minAccessRole=writer`, {
          headers: { Authorization: `Bearer ${t}` },
        });
        if (!res.ok) return json(502, { error: `Google ${res.status}` });
        const items = ((await res.json()).items ?? [])
          .filter((c: { deleted?: boolean }) => !c.deleted)
          .map((c: { id: string; summary: string; primary?: boolean; accessRole?: string }) => ({
            id: c.id,
            name: c.summary,
            primary: !!c.primary,
            access_role: c.accessRole,
          }));
        return json(200, { calendars: items });
      }

      case 'set_target': {
        if (!integ?.is_connected) return json(400, { error: 'Integracao nao conectada' });
        if (!body.calendar_id) return json(400, { error: 'calendar_id obrigatorio' });
        if (body.calendar_id === integ.google_calendar_id) return json(200, { ok: true });
        const t = await getValidToken(admin, integ);
        const oldCal = integ.google_calendar_id || 'primary';

        // Update integration
        if (isGlobal) {
          await admin
            .from('calendar_integrations')
            .update({ google_calendar_id: body.calendar_id, google_calendar_name: body.calendar_name ?? null })
            .is('workspace_id', null);
        } else {
          await admin
            .from('calendar_integrations')
            .update({ google_calendar_id: body.calendar_id, google_calendar_name: body.calendar_name ?? null })
            .eq('workspace_id', wsId);
          await migrateTarget(admin, wsId, t, oldCal);
        }
        return json(200, { ok: true });
      }

      case 'create_client_calendar': {
        if (!integ?.is_connected) return json(400, { error: 'Integracao nao conectada' });
        const summary = isGlobal
          ? 'Sharks | Agenda Global'
          : `Sharks | ${(await admin.from('workspaces').select('name').eq('id', wsId).maybeSingle()).data?.name ?? 'Cliente'}`;
        const t = await getValidToken(admin, integ);

        const res = await fetch(`${CAL_API}/calendars`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ summary, timeZone: 'America/Sao_Paulo' }),
        });
        if (!res.ok) return json(502, { error: `Google ${res.status}: ${(await res.text()).slice(0, 200)}` });
        const cal = await res.json();

        const oldCal = integ.google_calendar_id || 'primary';
        if (isGlobal) {
          await admin
            .from('calendar_integrations')
            .update({ google_calendar_id: cal.id, google_calendar_name: summary })
            .is('workspace_id', null);
        } else {
          await admin
            .from('calendar_integrations')
            .update({ google_calendar_id: cal.id, google_calendar_name: summary })
            .eq('workspace_id', wsId);
          await migrateTarget(admin, wsId, t, oldCal);
        }

        return json(200, { ok: true, calendar_id: cal.id, calendar_name: summary });
      }

      case 'disconnect': {
        if (isGlobal) {
          await admin
            .from('calendar_integrations')
            .update({
              is_connected: false,
              access_token: null,
              refresh_token: null,
              token_expires_at: null,
              last_synced_at: null,
              sync_error: null,
            })
            .is('workspace_id', null);
          // Clear all workspace-level event links (global was syncing everything)
          await admin.from('calendar_event_links').delete().neq('action_id', '00000000-0000-0000-0000-000000000000');
          await admin.from('actions').update({ sync_status: 'not_synced' }).neq('sync_status', 'not_synced');
          await admin.from('calendar_sync_queue').delete().in('status', ['pending', 'error']);
        } else {
          await admin
            .from('calendar_integrations')
            .update({
              is_connected: false,
              access_token: null,
              refresh_token: null,
              token_expires_at: null,
              last_synced_at: null,
              sync_error: null,
            })
            .eq('workspace_id', wsId);
          await admin.from('calendar_event_links').delete().eq('workspace_id', wsId);
          await admin.from('actions').update({ sync_status: 'not_synced' }).eq('workspace_id', wsId).neq('sync_status', 'not_synced');
          await admin.from('calendar_sync_queue').delete().eq('workspace_id', wsId).in('status', ['pending', 'error']);
        }
        return json(200, { ok: true });
      }

      default: {
        if (isGlobal) {
          // Process all workspaces using global integration
          const { data: allWs } = await admin.from('workspaces').select('id').eq('is_active', true);
          const results = [];
          for (const ws of (allWs ?? [])) {
            results.push(await processWorkspace(admin, ws.id));
          }
          return json(200, { mode: 'global', workspaces: results.length, results });
        }
        const result = await processWorkspace(admin, wsId);
        return json(200, result);
      }
    }
  } catch (e) {
    console.error('[google-sync]', e);
    return json(500, { error: String((e as Error).message ?? e).slice(0, 300) });
  }
});
