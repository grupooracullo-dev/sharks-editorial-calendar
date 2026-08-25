import { serviceClient, corsHeaders } from '../_shared/google.ts';

const CORS: Record<string, string> = {};
function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function generateTempPassword(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  let pwd = '';
  for (let i = 0; i < 12; i++) {
    pwd += chars[Math.floor(Math.random() * chars.length)];
  }
  return pwd;
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

  const { data: caller } = await admin.from('users').select('role').eq('id', userData.user.id).maybeSingle();
  if (!caller || caller.role !== 'admin_sharks') {
    return json(403, { error: 'Apenas administradores podem aprovar acessos' });
  }

  const body = await req.json().catch(() => null);
  if (!body?.request_id || !UUID_RE.test(body.request_id)) {
    return json(400, { error: 'request_id (UUID) obrigatorio' });
  }

  const { request_id } = body;

  // 1. Fetch the request
  const { data: reqRow, error: reqErr } = await admin
    .from('access_requests')
    .select('*')
    .eq('id', request_id)
    .maybeSingle();

  if (reqErr || !reqRow) return json(404, { error: 'Solicitacao nao encontrada' });
  if (reqRow.status !== 'pending') return json(400, { error: `Solicitacao ja foi ${reqRow.status}` });

  // 2. Check if email already exists in auth.users
  const { data: { users: existingUsers } } = await admin.auth.admin.listUsers();
  const existing = existingUsers?.find((u: { email?: string }) => u.email?.toLowerCase() === reqRow.email.toLowerCase());
  if (existing) return json(400, { error: 'Ja existe um usuario com esse e-mail no sistema' });

  // 3. Generate temp password
  const tempPassword = generateTempPassword();

  // 4. Create auth user
  const { data: authUser, error: createErr } = await admin.auth.admin.createUser({
    email: reqRow.email,
    password: tempPassword,
    email_confirm: true,
    user_metadata: {
      full_name: reqRow.full_name,
      role: reqRow.requested_role,
    },
  });
  if (createErr || !authUser?.user) {
    return json(500, { error: `Falha ao criar auth: ${createErr?.message}` });
  }

  // 5. Create profile row
  const { error: profileErr } = await admin.from('users').insert({
    id: authUser.user.id,
    email: reqRow.email,
    full_name: reqRow.full_name,
    role: reqRow.requested_role,
  });
  if (profileErr) {
    await admin.auth.admin.deleteUser(authUser.user.id).catch(() => {});
    return json(500, { error: `Perfil: ${profileErr.message}` });
  }

  // 6. Create membership if workspace specified
  if (reqRow.workspace_id) {
    const { error: memErr } = await admin.from('memberships').upsert(
      { user_id: authUser.user.id, workspace_id: reqRow.workspace_id, role: 'member' },
      { onConflict: 'user_id,workspace_id' }
    );
    if (memErr) console.warn('[approve] membership warning:', memErr.message);
  }

  // 7. Update request status
  const { error: updErr } = await admin
    .from('access_requests')
    .update({
      status: 'approved',
      temp_password: tempPassword,
      approved_by: userData.user.id,
      approved_at: new Date().toISOString(),
      processed_at: new Date().toISOString(),
    })
    .eq('id', request_id);

  if (updErr) console.warn('[approve] update warning:', updErr.message);

  return json(200, {
    ok: true,
    user_id: authUser.user.id,
    temp_password: tempPassword,
    email: reqRow.email,
  });
});
