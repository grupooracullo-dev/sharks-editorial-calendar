// ==========================================
// instagram-send-dm — envia DM do Instagram do ambiente para o lead
//
// POST { lead_id, message }, Authorization: Bearer (staff)
//   → usa o access_token da conexão do ambiente (migration 074)
//   → exige IGSID do lead (ai_data.ig_sid, capturado no ingest quando o
//     prospect interage) — a API do Instagram não permite DM frio fora de
//     janela; sem IGSID responde 409 com fallback (abrir no Instagram)
//   → sucesso: atividade outreach_sent + prospecting_status → contacted
// ==========================================

import { serviceClient, corsHeaders } from '../_shared/google.ts';

const CORS: Record<string, string> = {};
function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
}

const GRAPH = 'https://graph.facebook.com/v21.0';

interface LeadRow {
  id: string;
  environment: string;
  social_instagram: string | null;
  prospecting_status: string | null;
  ai_data: { ig_sid?: string } | null;
}

export async function sendInstagramMessage(
  pageId: string,
  accessToken: string,
  recipientIgSid: string,
  text: string,
): Promise<{ ok: boolean; status: number; detail?: string }> {
  const res = await fetch(`${GRAPH}/${pageId}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      access_token: accessToken,
      recipient: { id: recipientIgSid },
      messaging_type: 'RESPONSE',
      message: { text: text.slice(0, 900) },
    }),
  });
  if (res.ok) return { ok: true, status: 200 };
  return { ok: false, status: res.status, detail: (await res.text()).slice(0, 200) };
}

Deno.serve(async req => {
  Object.assign(CORS, corsHeaders(req));
  try {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
    if (req.method !== 'POST') return json(405, { error: 'Use POST' });

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json(401, { error: 'Token ausente' });
    const admin = serviceClient();
    const token = authHeader.replace(/^Bearer /i, '');
    const { data: userData } = await admin.auth.getUser(token);
    if (!userData?.user) return json(401, { error: 'Token invalido' });
    const userId = userData.user.id;

    const body = (await req.json().catch(() => null)) as { lead_id?: string; message?: string } | null;
    if (!body?.lead_id || !body.message?.trim()) return json(400, { error: 'Informe lead_id e message' });
    const message = body.message.trim();

    const { data: leadData, error: leadErr } = await admin
      .from('crm_leads')
      .select('id, environment, social_instagram, prospecting_status, ai_data')
      .eq('id', body.lead_id)
      .maybeSingle();
    if (leadErr || !leadData) return json(404, { error: 'Lead nao encontrado' });

    const lead = leadData as unknown as LeadRow;

    // staff do ambiente
    const { data: isStaff, error: staffErr } = await admin.rpc('is_env_staff', { user_uuid: userId, env: lead.environment });
    if (staffErr) {
      // fallback por adesão direta
      const { data: envRow } = await admin
        .from('user_environments')
        .select('environment')
        .eq('user_id', userId)
        .eq('environment', lead.environment)
        .maybeSingle();
      const { data: caller } = await admin.from('users').select('role, is_guardian').eq('id', userId).maybeSingle();
      const ok = !!envRow || !!caller?.is_guardian || caller?.role === 'oracullo_admin' ||
        (lead.environment === 'sharks_company' && ['admin_sharks', 'sharks_team'].includes(String(caller?.role ?? '')));
      if (!ok) return json(403, { error: 'Sem acesso a este ambiente' });
    } else if (!isStaff) {
      return json(403, { error: 'Sem acesso a este ambiente' });
    }

    const { data: conn } = await admin
      .from('instagram_connections')
      .select('page_id, ig_user_id, access_token, username, status')
      .eq('environment', lead.environment)
      .eq('status', 'connected')
      .maybeSingle();
    const connection = (conn as unknown as { page_id: string; access_token: string; username: string | null; ig_user_id: string } | null);
    if (!connection) return json(400, { error: 'Instagram não conectado neste ambiente' });

    const igSid = lead.ai_data?.ig_sid;
    if (!igSid) {
      // sem janela de conversa (API do Instagram exige interação recente)
      return json(409, {
        error: 'no_window',
        message: 'Sem janela de conversa: o prospect ainda não interagiu (DM/comentário/Lead Ads). Abra a conversa manualmente pelo Instagram.',
        profile_url: lead.social_instagram ? `https://ig.me/m/${lead.social_instagram}` : null,
      });
    }

    const result = await sendInstagramMessage(connection.page_id, connection.access_token, igSid, message);
    if (!result.ok) {
      await admin.from('crm_lead_activities').insert({
        lead_id: lead.id,
        user_id: userId,
        type: 'system',
        content: `DM no Instagram falhou (${result.status}).`,
      });
      return json(502, { error: `Envio falhou (${result.status}): ${result.detail ?? ''}` });
    }

    await admin.from('crm_lead_activities').insert({
      lead_id: lead.id,
      user_id: userId,
      type: 'outreach_sent',
      content: `DM enviada no Instagram:\n${message}`,
    });
    if (['discovered', 'qualified', 'queued'].includes(String(lead.prospecting_status ?? ''))) {
      await admin.from('crm_leads').update({ prospecting_status: 'contacted' }).eq('id', lead.id);
    }

    return json(200, { ok: true, sent_to: `@${lead.social_instagram ?? ''}` });
  } catch (e) {
    console.error('[instagram-send-dm] uncaught:', (e as Error)?.stack || e);
    return json(500, { error: `Erro interno: ${(e as Error)?.message || String(e)}` });
  }
});
