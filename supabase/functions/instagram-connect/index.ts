// ==========================================
// instagram-connect — conecta/desconecta o Instagram profissional do ambiente
//
// POST { action: 'connect', code, redirect_uri, environment }
//   → Facebook Login for Business: code → token curto → long-lived
//   → /me/accounts → página com instagram_business_account
//   → salva conexão pública (sem token p/ staff via column grants)
//     + access_token da Página (não expira) para ingest/send-dm
// POST { action: 'disconnect', environment }
// Auth: Bearer JWT de ADMIN do ambiente (guardian ou user_environments admin)
// Segredos: META_APP_ID, META_APP_SECRET
// ==========================================

import { serviceClient, corsHeaders } from '../_shared/google.ts';

const CORS: Record<string, string> = {};
function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
}

const VALID_ENVS = ['sharks_company', 'estrategos'];
const GRAPH = 'https://graph.facebook.com/v21.0';

interface PageResult {
  id: string;
  name?: string;
  access_token?: string;
  instagram_business_account?: { id: string; username?: string };
}

async function isEnvAdmin(admin: ReturnType<typeof serviceClient>, userId: string, environment: string): Promise<boolean> {
  const { data: caller } = await admin
    .from('users')
    .select('role, is_guardian')
    .eq('id', userId)
    .maybeSingle();
  if (caller?.is_guardian || caller?.role === 'oracullo_admin') return true;
  const { data: envRow } = await admin
    .from('user_environments')
    .select('role')
    .eq('user_id', userId)
    .eq('environment', environment)
    .eq('role', 'admin')
    .maybeSingle();
  if (envRow) return true;
  // cadência legada: admin_sharks administra sharks_company
  if (environment === 'sharks_company' && caller?.role === 'admin_sharks') return true;
  return false;
}

export async function exchangeToken(code: string, redirectUri: string): Promise<string> {
  const appId = Deno.env.get('META_APP_ID');
  const appSecret = Deno.env.get('META_APP_SECRET');
  if (!appId || !appSecret) throw new Error('META_APP_ID/META_APP_SECRET não configurados no Edge');

  const short = await fetch(`${GRAPH}/oauth/access_token?client_id=${appId}&redirect_uri=${encodeURIComponent(redirectUri)}&client_secret=${appSecret}&code=${encodeURIComponent(code)}`);
  if (!short.ok) throw new Error(`OAuth code inválido (${short.status}): ${(await short.text()).slice(0, 160)}`);
  const shortTok = (await short.json()) as { access_token?: string };
  if (!shortTok.access_token) throw new Error('OAuth não retornou token');

  const long = await fetch(`${GRAPH}/oauth/access_token?grant_type=fb_exchange_token&client_id=${appId}&client_secret=${appSecret}&fb_exchange_token=${shortTok.access_token}`);
  if (!long.ok) throw new Error(`Token long-lived falhou (${long.status})`);
  const longTok = (await long.json()) as { access_token?: string };
  return longTok.access_token ?? shortTok.access_token;
}

export async function fetchPages(token: string): Promise<PageResult[]> {
  const res = await fetch(`${GRAPH}/me/accounts?fields=id,name,access_token,instagram_business_account{id,username}&access_token=${encodeURIComponent(token)}`);
  if (!res.ok) throw new Error(`Listar páginas falhou (${res.status}): ${(await res.text()).slice(0, 160)}`);
  const body = (await res.json()) as { data?: PageResult[] };
  return body.data ?? [];
}

Deno.serve(async req => {
  Object.assign(CORS, corsHeaders(req));
  try {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
    if (req.method !== 'POST') return json(405, { error: 'Use POST' });

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json(401, { error: 'Token ausente' });
    const admin = serviceClient();
    const { data: userData } = await admin.auth.getUser(authHeader.replace(/^Bearer /i, ''));
    if (!userData?.user) return json(401, { error: 'Token invalido' });
    const userId = userData.user.id;

    const body = (await req.json().catch(() => null)) as { action?: string; code?: string; redirect_uri?: string; environment?: string } | null;
    if (!body?.environment || !VALID_ENVS.includes(body.environment)) return json(400, { error: 'env invalido' });
    const environment = body.environment;

    if (!(await isEnvAdmin(admin, userId, environment))) return json(403, { error: 'Somente admin do ambiente conecta canais' });

    /* ── Desconectar ── */
    if (body.action === 'disconnect') {
      await admin.from('instagram_connections').delete().eq('environment', environment);
      return json(200, { ok: true, connected: false });
    }

    /* ── Conectar ── */
    if (!body.code || !body.redirect_uri) return json(400, { error: 'Informe code e redirect_uri' });

    const longToken = await exchangeToken(body.code, body.redirect_uri);
    const pages = await fetchPages(longToken);
    const page = pages.find(p => p.instagram_business_account);
    if (!page?.access_token || !page.instagram_business_account) {
      return json(422, { error: 'Nenhuma página Facebook com Instagram profissional vinculada à conta. Vincule um perfil profissional a uma página e tente novamente.' });
    }

    // descarrega conexão anterior e grava a nova
    await admin.from('instagram_connections').delete().eq('environment', environment);
    const { error: insErr, data: row } = await admin
      .from('instagram_connections')
      .insert({
        environment,
        ig_user_id: page.instagram_business_account.id,
        username: page.instagram_business_account.username ?? null,
        page_id: page.id,
        page_name: page.name ?? null,
        access_token: page.access_token,
        connected_by: userId,
      })
      .select('id, username')
      .single();
    if (insErr) throw new Error(`Salvar conexão: ${insErr.message}`);

    return json(200, {
      ok: true,
      connected: true,
      username: (row as { username?: string } | null)?.username ?? null,
      page_name: page.name ?? null,
    });
  } catch (e) {
    console.error('[instagram-connect] erro:', (e as Error)?.stack || e);
    return json(500, { error: `Erro interno: ${(e as Error)?.message || String(e)}` });
  }
});
