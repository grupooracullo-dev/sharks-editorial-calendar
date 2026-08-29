// ==========================================
// google-oauth-start (HARDENED)
// Builds the Google consent URL with a signed state.
//
// SECURITY (auditoria 2026-08-29):
// - POST + Authorization (JWT) OBRIGATÓRIOS: o usuário do state
//   deriva do token, não de parâmetro de URL (antes qualquer um
//   podia iniciar o fluxo em nome de outro user_id).
// - Validação de acesso ANTECIPADA (mesma regra do callback):
//   workspace → membership/staff do ambiente; global → staff.
// - Retorna JSON { url } — o frontend redireciona.
// ==========================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

function getStateSecret(): string {
  const secret = Deno.env.get('STATE_SECRET');
  if (!secret || secret.length < 16) {
    throw new Error('STATE_SECRET not configured or too short (min 16 chars)');
  }
  return secret;
}

function bytesToB64Url(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64UrlEncode(str: string): string {
  return bytesToB64Url(new TextEncoder().encode(str));
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

// Formato IDÊNTICO ao verifyState do _shared/google.ts (compatível com o callback)
async function createState(
  workspaceId: string,
  userId: string,
  returnTo: string,
  syncMode: 'unified' | 'split',
): Promise<string> {
  const payload = b64UrlEncode(JSON.stringify({ ws: workspaceId, u: userId, r: returnTo, m: syncMode, t: Date.now() }));
  const sig = bytesToB64Url(await hmacBytes(payload));
  return `${payload}.${sig}`;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function json(status: number, body: unknown, origin: string | null): Response {
  const appUrl = Deno.env.get('APP_URL');
  const allow =
    origin && (origin === appUrl || origin.startsWith('http://localhost:') || origin.startsWith('http://127.0.0.1:'))
      ? origin
      : appUrl ?? '*';
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Access-Control-Allow-Origin': allow,
      'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Content-Type': 'application/json',
    },
  });
}

Deno.serve(async req => {
  const origin = req.headers.get('Origin');
  if (req.method === 'OPTIONS') {
    return json(204, {}, origin);
  }
  if (req.method !== 'POST') {
    return json(405, { error: 'Use POST' }, origin);
  }

  // 1. Autenticação obrigatória — usuário vem do JWT
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return json(401, { error: 'Token ausente' }, origin);

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } },
  );
  const token = authHeader.replace(/^Bearer /i, '');
  const { data: userData } = await admin.auth.getUser(token);
  if (!userData?.user) return json(401, { error: 'Token inválido' }, origin);
  const userId = userData.user.id;

  // 2. Parâmetros do corpo (não mais da URL)
  const body = await req.json().catch(() => null);
  const wsParam: string = typeof body?.workspace_id === 'string' ? body.workspace_id : '';
  const isGlobal = wsParam === 'global' || wsParam === '';
  const wsId = isGlobal ? 'global' : wsParam;
  const returnTo: string = typeof body?.return_to === 'string' && body.return_to.startsWith('/')
    ? body.return_to
    : '/sharks/integrations';
  const syncMode: 'unified' | 'split' = body?.sync_mode === 'split' ? 'split' : 'unified';

  if (!isGlobal && !UUID_RE.test(wsId)) {
    return json(400, { error: 'workspace_id inválido' }, origin);
  }

  const clientId = Deno.env.get('GOOGLE_CLIENT_ID');
  if (!clientId) {
    return json(500, { error: 'credenciais_nao_configuradas' }, origin);
  }

  // 3. Validação de acesso ANTECIPADA (espelha o callback)
  const { data: me } = await admin.from('users').select('role, is_guardian').eq('id', userId).maybeSingle();
  const { data: myEnvs } = await admin.from('user_environments').select('environment, role').eq('user_id', userId);
  const isStaff =
    !!me?.is_guardian ||
    me?.role === 'oracullo_admin' || me?.role === 'admin_sharks' || me?.role === 'sharks_team' ||
    (myEnvs ?? []).some(e => e.role === 'admin' || e.role === 'team');

  if (isGlobal) {
    if (!isStaff) return json(403, { error: 'sem_acesso_global' }, origin);
  } else {
    // staff OU membro do workspace OU staff do ambiente do workspace
    let allowed = isStaff;
    if (!allowed) {
      const { data: ws } = await admin.from('workspaces').select('organization_id').eq('id', wsId).maybeSingle();
      if (ws?.organization_id) {
        const { data: org } = await admin.from('organizations').select('environment').eq('id', ws.organization_id).maybeSingle();
        if (org && (myEnvs ?? []).some(e => e.environment === org.environment && (e.role === 'admin' || e.role === 'team'))) {
          allowed = true;
        }
      }
    }
    if (!allowed) {
      const { data: m } = await admin.from('memberships').select('id').eq('user_id', userId).eq('workspace_id', wsId).maybeSingle();
      allowed = !!m;
    }
    if (!allowed) return json(403, { error: 'sem_acesso' }, origin);
  }

  // 4. State assinado (mesmo formato do callback) + URL de consentimento
  const state = await createState(wsId, userId, returnTo, syncMode);
  const redirectUri = `${Deno.env.get('SUPABASE_URL')}/functions/v1/google-oauth-callback`;

  const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  authUrl.searchParams.set('client_id', clientId);
  authUrl.searchParams.set('redirect_uri', redirectUri);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set(
    'scope',
    'https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/calendar.readonly https://www.googleapis.com/auth/calendar.app.created https://www.googleapis.com/auth/userinfo.email',
  );
  authUrl.searchParams.set('access_type', 'offline');
  authUrl.searchParams.set('prompt', 'consent');
  authUrl.searchParams.set('include_granted_scopes', 'true');
  authUrl.searchParams.set('state', state);

  return json(200, { url: authUrl.toString() }, origin);
});
