import { serviceClient, corsHeaders } from '../_shared/google.ts';
import { sendEmail, rejectedAccessEmail } from '../_shared/email.ts';

const CORS: Record<string, string> = {};
function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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

  const { data: caller } = await admin.from('users').select('role, is_guardian').eq('id', userData.user.id).maybeSingle();
  const isStaff = !!caller?.is_guardian || caller?.role === 'oracullo_admin' || caller?.role === 'admin_sharks';
  if (!isStaff) {
    return json(403, { error: 'Apenas administradores podem rejeitar acessos' });
  }

  const body = await req.json().catch(() => null);
  if (!body?.request_id || !UUID_RE.test(body.request_id)) {
    return json(400, { error: 'request_id (UUID) obrigatorio' });
  }

  // Dados do solicitante para o e-mail de rejeicao
  const { data: reqRow } = await admin
    .from('access_requests')
    .select('full_name, email')
    .eq('id', body.request_id)
    .maybeSingle();

  const { data: updated, error } = await admin
    .from('access_requests')
    .update({
      status: 'rejected',
      rejected_reason: body.reason?.toString().slice(0, 500) || null,
      processed_at: new Date().toISOString(),
    })
    .eq('id', body.request_id)
    .eq('status', 'pending') // só rejeita se ainda estiver pending
    .select('id');

  if (error) return json(500, { error: error.message });
  if (!updated || updated.length === 0) {
    return json(409, { error: 'Solicitacao ja processada ou nao encontrada' });
  }

  // E-mail transacional (best-effort — nunca bloqueia a rejeicao)
  let emailSent = false;
  if (reqRow?.email) {
    try {
      const mail = rejectedAccessEmail({
        name: reqRow.full_name || reqRow.email,
        reason: body.reason?.toString().slice(0, 500) || null,
      });
      const mailResult = await sendEmail({ to: reqRow.email, subject: mail.subject, html: mail.html });
      emailSent = mailResult.ok;
    } catch (e) {
      console.warn('[reject] e-mail falhou:', (e as Error).message);
    }
  }

  return json(200, { ok: true, email_sent: emailSent });
});
