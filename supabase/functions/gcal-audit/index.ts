// ==========================================
// gcal-audit (temporária): lista/purga eventos de um calendário
// para diagnóstico de duplicidades e órfãos.
// op 'audit': lista eventos do período com srcKey
// op 'purge': apaga event_ids específicos do calendário
// Apenas guardião Oracullo.
// ==========================================

import { serviceClient, corsHeaders, getValidToken, CAL_API } from '../_shared/google.ts';

const CORS: Record<string, string> = {};
function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
}

Deno.serve(async req => {
  Object.assign(CORS, corsHeaders(req));
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json(405, { error: 'Use POST' });

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return json(401, { error: 'Token ausente' });

  const admin = serviceClient();
  const token = authHeader.replace(/^Bearer /i, '');
  const { data: userData } = await admin.auth.getUser(token);
  if (!userData?.user) return json(401, { error: 'Token invalido' });

  const { data: me } = await admin.from('users').select('is_guardian, role').eq('id', userData.user.id).maybeSingle();
  const guardian = !!me?.is_guardian || me?.role === 'oracullo_admin';
  if (!guardian) return json(403, { error: 'Apenas guardiao' });

  const body = await req.json().catch(() => null);
  const op: string = body?.op ?? 'audit';
  const integrationId: string = body?.integration_id ?? '';
  const calendarId: string | undefined = body?.calendar_id;
  const timeMin: string = body?.time_min ?? '2026-08-01T00:00:00Z';
  const timeMax: string = body?.time_max ?? '2027-12-31T23:59:59Z';

  const { data: integ } = await admin.from('calendar_integrations').select('*').eq('id', integrationId).maybeSingle();
  if (!integ) return json(404, { error: 'Integracao nao encontrada' });

  let gToken: string;
  try {
    gToken = await getValidToken(admin, integ as Record<string, any>);
  } catch (e) {
    return json(502, { error: `Token: ${(e as Error).message}` });
  }

  const calId = calendarId || (integ as Record<string, any>).google_calendar_id || 'primary';

  if (op === 'purge') {
    const eventIds: string[] = Array.isArray(body?.event_ids) ? body.event_ids : [];
    let removed = 0;
    const errors: string[] = [];
    for (const evId of eventIds) {
      const res = await fetch(
        `${CAL_API}/calendars/${encodeURIComponent(calId)}/events/${encodeURIComponent(evId)}`,
        { method: 'DELETE', headers: { Authorization: `Bearer ${gToken}` } },
      ).catch(() => null);
      if ((res && res.ok) || res?.status === 404 || res?.status === 410) removed++;
      else if (res) errors.push(`${evId}: ${res.status}`);
    }
    return json(200, { ok: true, purged: removed, total: eventIds.length, errors: errors.slice(0, 10) });
  }

  // op audit: listar eventos do periodo
  const url =
    `${CAL_API}/calendars/${encodeURIComponent(calId)}/events` +
    `?timeMin=${encodeURIComponent(timeMin)}&timeMax=${encodeURIComponent(timeMax)}` +
    `&maxResults=250&singleEvents=true&orderBy=startTime`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${gToken}` } });
  if (!res.ok) return json(502, { error: `Google ${res.status}: ${(await res.text()).slice(0, 200)}` });
  const data = await res.json().catch(() => null);
  const items = (data?.items ?? []) as Array<Record<string, any>>;
  const events = items.map(ev => ({
    id: ev.id,
    summary: String(ev.summary ?? '').slice(0, 80),
    start: ev.start?.dateTime ?? ev.start?.date ?? null,
    created: ev.created,
    srcKey: ev.extendedProperties?.private?.srcKey ?? null,
  }));
  return json(200, { ok: true, calendar: calId, count: events.length, events });
});
