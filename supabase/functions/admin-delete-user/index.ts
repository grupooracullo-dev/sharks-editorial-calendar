import { serviceClient, corsHeaders } from '../_shared/google.ts';

// Per-request CORS (updated at handler start)
let CORS: Record<string, string> = {};

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

Deno.serve(async req => {
  CORS = corsHeaders(req);
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
    return json(403, { error: 'Apenas administradores podem remover usuarios' });
  }

  const body = await req.json().catch(() => null);
  if (!body?.user_id || !UUID_RE.test(body.user_id)) return json(400, { error: 'user_id (UUID) obrigatorio' });

  const { user_id } = body;

  // Prevent self-deletion
  if (user_id === userData.user.id) {
    return json(400, { error: 'Voce nao pode remover seu proprio usuario' });
  }

  // Delete auth user (FK cascades to users, team_member_access, memberships)
  const { error: authError } = await admin.auth.admin.deleteUser(user_id);
  if (authError) return json(500, { error: authError.message });

  return json(200, { ok: true });
});
