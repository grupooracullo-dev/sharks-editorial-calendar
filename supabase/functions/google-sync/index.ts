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

import { CAL_API, corsHeaders, getValidToken, processWorkspace, serviceClient, verifyWorkspaceAccess } from '../_shared/google.ts';

// Per-request CORS (updated at handler start)
let CORS: Record<string, string> = {};

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
  integId: string,
): Promise<void> {
  // 1. remover eventos da agenda antiga (apenas os links DESSA integracao)
  const { data: links } = await admin
    .from('calendar_event_links')
    .select('google_event_id')
    .eq('workspace_id', wsId)
    .or(`integration_id.eq.${integId},integration_id.is.null`);
  for (const l of links ?? []) {
    if (!l.google_event_id) continue;
    await fetch(
      `${CAL_API}/calendars/${encodeURIComponent(oldCalId)}/events/${encodeURIComponent(l.google_event_id)}`,
      { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } },
    ).catch(() => {});
  }

  // 2. resetar vinculos (só dessa integracao) e status
  await admin.from('calendar_event_links').delete().eq('workspace_id', wsId).or(`integration_id.eq.${integId},integration_id.is.null`);
  await admin.from('actions').update({ sync_status: 'not_synced' }).eq('workspace_id', wsId).neq('status', 'cancelled');
  await admin.from('estrategos_meetings').update({ sync_status: 'not_synced' }).eq('workspace_id', wsId).neq('status', 'cancelled');
  await admin.from('estrategos_implementations').update({ sync_status: 'not_synced' }).eq('workspace_id', wsId).not('status', 'in', '(cancelled)');

  // 3. re-enfileirar todos os itens ativos para re-sync na nova
  //    agenda (fan-out recria para TODAS as integracoes ativas).
  //    Migration 025: actions + meetings/impl estrategos.
  await admin.from('calendar_sync_queue').delete().eq('workspace_id', wsId).in('status', ['pending', 'error']);
  const { data: acts } = await admin.from('actions').select('id').eq('workspace_id', wsId).neq('status', 'cancelled');
  if (acts?.length) {
    await admin
      .from('calendar_sync_queue')
      .insert(acts.map(a => ({ workspace_id: wsId, action_id: a.id, source: 'sharks_action' as const, source_id: a.id, operation: 'create' as const })));
  }
  const { data: meets } = await admin.from('estrategos_meetings').select('id').eq('workspace_id', wsId).neq('status', 'cancelled');
  if (meets?.length) {
    await admin
      .from('calendar_sync_queue')
      .insert(meets.map(m => ({ workspace_id: wsId, source: 'estrategos_meeting' as const, source_id: m.id, operation: 'create' as const })));
  }
  const { data: impls } = await admin.from('estrategos_implementations').select('id').eq('workspace_id', wsId).not('status', 'in', '(cancelled,completed)');
  if (impls?.length) {
    await admin
      .from('calendar_sync_queue')
      .insert(impls.map(i => ({ workspace_id: wsId, source: 'estrategos_implementation' as const, source_id: i.id, operation: 'create' as const })));
  }
}
Deno.serve(async req => {
  CORS = corsHeaders(req);

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

  // Migration 021/022/023: resolução consciente de papel.
  //   global (staff)       -> linha pessoal (workspace_id NULL + user_id)
  //   workspace + staff    -> linha da agência (W + user_id NULL)
  //   workspace + cliente  -> linha pessoal do cliente (W + user_id)
  const { data: me } = await admin.from('users').select('role').eq('id', userData.user.id).maybeSingle();
  const { data: myEnvs } = await admin
    .from('user_environments')
    .select('environment, role')
    .eq('user_id', userData.user.id);
  const isStaffUser =
    me?.role === 'oracullo_admin' || me?.role === 'admin_sharks' || me?.role === 'sharks_team'
    || (myEnvs ?? []).some(e => (e.environment === 'sharks_company' || e.environment === 'estrategos') && (e.role === 'admin' || e.role === 'team'));

  // Global mode: only staff allowed
  if (isGlobal && !isStaffUser) {
    return json(403, { error: 'Sem acesso ao modo global' });
  }

  const { data: integ } = isGlobal
    ? await admin
        .from('calendar_integrations')
        .select('*')
        .is('workspace_id', null)
        .eq('user_id', userData.user.id)
        .maybeSingle()
    : isStaffUser
      ? await admin
          .from('calendar_integrations')
          .select('*')
          .eq('workspace_id', wsId)
          .is('user_id', null)
          .maybeSingle()
      : await admin
          .from('calendar_integrations')
          .select('*')
          .eq('workspace_id', wsId)
          .eq('user_id', userData.user.id)
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

        // Update integration (apenas a linha em questao — nunca a de outros usuarios)
        if (isGlobal) {
          await admin
            .from('calendar_integrations')
            .update({ google_calendar_id: body.calendar_id, google_calendar_name: body.calendar_name ?? null })
            .eq('id', integ.id);
        } else {
          await admin
            .from('calendar_integrations')
            .update({ google_calendar_id: body.calendar_id, google_calendar_name: body.calendar_name ?? null })
            .eq('id', integ.id);
          await migrateTarget(admin, wsId, t, oldCal, integ.id);
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
            .eq('id', integ.id);
        } else {
          await admin
            .from('calendar_integrations')
            .update({ google_calendar_id: cal.id, google_calendar_name: summary })
            .eq('id', integ.id);
          await migrateTarget(admin, wsId, t, oldCal, integ.id);
        }

        return json(200, { ok: true, calendar_id: cal.id, calendar_name: summary });
      }

      case 'set_env_sync': {
        // Migration 025: liga/desliga o sync de UM ambiente
        // nesta integracao (apenas a linha do caller).
        if (!integ?.is_connected) return json(400, { error: 'Integracao nao conectada' });
        const env = body.env === 'estrategos' ? 'estrategos' : 'sharks_company';
        const enabled = !!body.enabled;
        const flags = { ...(integ.env_auto_sync ?? {}), [env]: enabled };
        await admin.from('calendar_integrations').update({ env_auto_sync: flags }).eq('id', integ.id);
        return json(200, { ok: true, env, enabled, env_auto_sync: flags });
      }

      case 'change_sync_mode': {
        // Migration 025: alterna unified <-> split.
        // Para split cria as agendas por ambiente se faltarem.
        if (!integ?.is_connected) return json(400, { error: 'Integracao nao conectada' });
        const mode = body.mode === 'split' ? 'split' : 'unified';
        const patch: Record<string, unknown> = { sync_mode: mode };

        if (mode === 'split') {
          const t = await getValidToken(admin, integ);
          const ids = { ...(integ.env_calendar_ids ?? {}) };
          for (const [env, summary] of [['sharks_company', 'Sharks'], ['estrategos', 'Estrategos']] as const) {
            if (ids[env]) continue;
            const res = await fetch(`${CAL_API}/calendars`, {
              method: 'POST',
              headers: { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' },
              body: JSON.stringify({ summary, timeZone: 'America/Sao_Paulo' }),
            });
            if (res.ok) {
              ids[env] = (await res.json()).id;
            } else {
              return json(502, { error: `Falha ao criar agenda ${summary}: Google ${res.status}` });
            }
          }
          patch.env_calendar_ids = ids;
        }

        await admin.from('calendar_integrations').update(patch).eq('id', integ.id);
        return json(200, { ok: true, sync_mode: mode, ...(patch.env_calendar_ids ? { env_calendar_ids: patch.env_calendar_ids } : {}) });
      }

      case 'disconnect': {
        const wipe = {
          is_connected: false,
          access_token: null,
          refresh_token: null,
          token_expires_at: null,
          last_synced_at: null,
          sync_error: null,
        };
        if (isGlobal) {
          // Migration 021: desconecta SOMENTE a linha pessoal do usuario.
          // Links/fila de outros usuarios permanecem intactos.
          if (!integ) return json(200, { ok: true });
          await admin.from('calendar_integrations').update(wipe).eq('id', integ.id);
          await admin.from('calendar_event_links').delete().eq('integration_id', integ.id);

          // Acoes sem nenhum link restante voltam a not_synced
          const { data: remaining } = await admin
            .from('calendar_event_links')
            .select('action_id')
            .or(`integration_id.neq.${integ.id},integration_id.is.null`);
          const keepIds = [...new Set((remaining ?? []).map(r => r.action_id))];
          const resetQuery = admin.from('actions').update({ sync_status: 'not_synced' }).neq('sync_status', 'not_synced');
          if (keepIds.length) await resetQuery.not('id', 'in', `(${keepIds.join(',')})`);
          else await resetQuery;

          // Deletes embutidos alvejando minha integracao nao fazem mais sentido
          await admin.from('calendar_sync_queue').delete().eq('integration_id', integ.id);
        } else {
          if (!integ) return json(200, { ok: true });
          await admin.from('calendar_integrations').update(wipe).eq('id', integ.id);
          // Remove apenas os links DESSA integracao (agencia ou do cliente)
          await admin.from('calendar_event_links').delete().eq('integration_id', integ.id);
          // Registros SEM nenhum link restante voltam a not_synced
          // (actions + meetings/impl estrategos — migration 025)
          const { data: remainingWs } = await admin
            .from('calendar_event_links')
            .select('source, source_id, action_id')
            .eq('workspace_id', wsId)
            .or(`integration_id.neq.${integ.id},integration_id.is.null`);
          const keepAct = [...new Set((remainingWs ?? []).filter(r => r.action_id).map(r => r.action_id))];
          const keepMeet = [...new Set((remainingWs ?? []).filter(r => r.source === 'estrategos_meeting' && r.source_id).map(r => r.source_id))];
          const keepImpl = [...new Set((remainingWs ?? []).filter(r => r.source === 'estrategos_implementation' && r.source_id).map(r => r.source_id))];

          const resetActions = admin.from('actions').update({ sync_status: 'not_synced' }).eq('workspace_id', wsId).neq('sync_status', 'not_synced');
          if (keepAct.length) await resetActions.not('id', 'in', `(${keepAct.join(',')})`);
          else await resetActions;

          const resetMeetings = admin.from('estrategos_meetings').update({ sync_status: 'not_synced' }).eq('workspace_id', wsId).neq('sync_status', 'not_synced');
          if (keepMeet.length) await resetMeetings.not('id', 'in', `(${keepMeet.join(',')})`);
          else await resetMeetings;

          const resetImpls = admin.from('estrategos_implementations').update({ sync_status: 'not_synced' }).eq('workspace_id', wsId).neq('sync_status', 'not_synced');
          if (keepImpl.length) await resetImpls.not('id', 'in', `(${keepImpl.join(',')})`);
          else await resetImpls;
          // Fila permanece: outras integracoes (pessoais/agencia) ainda cobrem o workspace
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
