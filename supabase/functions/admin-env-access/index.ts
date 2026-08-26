// ==========================================
// admin-env-access
// Gestao de acessos multi-ambiente (Oracullo).
//
// Apenas oracullo_admin (JWT) pode:
//   grant  { user_id, environment, role }
//   revoke { user_id, environment }
//   list   {} -> usuarios + acessos
//
// Revogar 'sharks_company' remove acesso a
// TODAS as politicas dependentes de
// is_sharks_admin/is_sharks_team na hora
// (helpers consultam user_environments).
// ==========================================

import { corsHeaders, serviceClient } from '../_shared/google.ts';

type EnvType = 'sharks_company' | 'estrategos';
type EnvRole = 'admin' | 'team' | 'client';

const ENVIRONMENTS: EnvType[] = ['sharks_company', 'estrategos'];
const ROLES: EnvRole[] = ['admin', 'team', 'client'];

let CORS: Record<string, string> = {};

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

async function isOraculloAdmin(admin: ReturnType<typeof serviceClient>, userId: string): Promise<boolean> {
  const { data } = await admin.from('users').select('role').eq('id', userId).maybeSingle();
  return data?.role === 'oracullo_admin';
}

Deno.serve(async req => {
  CORS = corsHeaders(req);

  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json(405, { error: 'Use POST' });

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return json(401, { error: 'Token ausente' });
  const token = authHeader.replace(/^Bearer /i, '');

  const admin = serviceClient();
  const { data: userData } = await admin.auth.getUser(token);
  if (!userData?.user) return json(401, { error: 'Token invalido' });

  if (!(await isOraculloAdmin(admin, userData.user.id))) {
    return json(403, { error: 'Apenas administradores Oracullo' });
  }

  const body = await req.json().catch(() => ({}));
  const op: string = body?.op ?? 'list';

  try {
    switch (op) {
      case 'grant': {
        const userId = String(body.user_id ?? '');
        const env = body.environment as EnvType;
        const role = (body.role ?? 'client') as EnvRole;
        if (!userId || !ENVIRONMENTS.includes(env) || !ROLES.includes(role)) {
          return json(400, { error: 'user_id, environment e role validos obrigatorios' });
        }
        const { data: target } = await admin.from('users').select('id, email').eq('id', userId).maybeSingle();
        if (!target) return json(404, { error: 'Usuario nao encontrado' });

        const { error } = await admin
          .from('user_environments')
          .upsert(
            { user_id: userId, environment: env, role, granted_by: userData.user.id },
            { onConflict: 'user_id,environment' },
          );
        if (error) throw error;

        // Papel primario global acompanha o primeiro acesso staff
        // (mantem UX e Edge Functions legadas coerentes).
        if (role === 'admin' || role === 'team') {
          const { data: cur } = await admin.from('users').select('role').eq('id', userId).maybeSingle();
          const newGlobal =
            role === 'admin' && env === 'sharks_company' ? 'admin_sharks'
            : role === 'admin' && env === 'estrategos' ? 'oracullo_admin'
            : 'sharks_team';
          const upgrade =
            (cur?.role === 'client') ||
            (cur?.role === 'sharks_team' && newGlobal === 'admin_sharks');
          if (upgrade) {
            await admin.from('users').update({ role: newGlobal, updated_at: new Date().toISOString() }).eq('id', userId);
          }
        }

        return json(200, { ok: true, user_id: userId, environment: env, role });
      }

      case 'revoke': {
        const userId = String(body.user_id ?? '');
        const env = body.environment as EnvType;
        if (!userId || !ENVIRONMENTS.includes(env)) {
          return json(400, { error: 'user_id e environment validos obrigatorios' });
        }
        const { error } = await admin
          .from('user_environments')
          .delete()
          .eq('user_id', userId)
          .eq('environment', env);
        if (error) throw error;
        return json(200, { ok: true });
      }

      case 'list': {
        const { data, error } = await admin
          .from('user_environments')
          .select('user_id, environment, role, created_at, updated_at, users(email, full_name, role)')
          .order('user_id');
        if (error) throw error;
        return json(200, { accesses: data ?? [] });
      }

      default:
        return json(400, { error: `Operacao desconhecida: ${op}` });
    }
  } catch (e) {
    console.error('[admin-env-access]', e);
    return json(500, { error: String((e as Error).message ?? e).slice(0, 300) });
  }
});
