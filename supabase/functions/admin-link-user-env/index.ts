// ==========================================
// admin-link-user-env
// Vincula/desvincula usuário a ambiente de forma ATÔMICA:
//
// link:   user_environments(env) + membership em workspace escolhido
//         OU criado na hora (new_workspace_name) na org do ambiente
// unlink: remove user_environments(env) + memberships em workspaces
//         da org daquele ambiente (sem resíduo)
//
// Permissão: guardião OU admin do ambiente-alvo.
// ==========================================

import { serviceClient, corsHeaders } from '../_shared/google.ts';

const CORS: Record<string, string> = {};
function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const VALID_ENVS = ['sharks_company', 'estrategos'] as const;
type EnvType = typeof VALID_ENVS[number];
type EnvRole = 'admin' | 'team' | 'client';

// Deve espelhar ENVIRONMENT_META / roles válidos
const VALID_ROLES: EnvRole[] = ['admin', 'team', 'client'];

const ENV_ORG_NAME: Record<EnvType, string> = {
  sharks_company: 'Sharks Company',
  estrategos: 'Estrategos',
};

function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
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

  const { data: me } = await admin.from('users').select('id, is_guardian, role').eq('id', userData.user.id).maybeSingle();
  const guardian = !!me?.is_guardian || me?.role === 'oracullo_admin';

  const body = await req.json().catch(() => null);
  const op: string = body?.op ?? 'link';
  const env: string = body?.environment ?? '';
  const targetUserId: string = body?.user_id ?? '';

  if (!VALID_ENVS.includes(env)) return json(400, { error: `environment invalido. Use: ${VALID_ENVS.join(', ')}` });
  if (!UUID_RE.test(targetUserId)) return json(400, { error: 'user_id (UUID) obrigatorio' });

  // Permissão: guardião OU admin do ambiente-alvo
  if (!guardian) {
    const { data: callerEnv } = await admin
      .from('user_environments')
      .select('role')
      .eq('user_id', userData.user.id)
      .eq('environment', env)
      .maybeSingle();
    if (callerEnv?.role !== 'admin') {
      return json(403, { error: `Apenas o guardiao ou admin do ambiente ${env} pode vincular usuarios` });
    }
  }

  // Alvo existe?
  const { data: target } = await admin.from('users').select('id, email, full_name').eq('id', targetUserId).maybeSingle();
  if (!target) return json(404, { error: 'Usuario nao encontrado' });

  // Org do ambiente
  const { data: org } = await admin
    .from('organizations')
    .select('id')
    .eq('environment', env)
    .maybeSingle();
  if (!org) return json(500, { error: `Organizacao do ambiente ${env} nao encontrada` });

  try {
    if (op === 'unlink') {
      // 1. memberships em workspaces da org do ambiente
      const { data: orgWorkspaces } = await admin
        .from('workspaces')
        .select('id')
        .eq('organization_id', org.id);
      const wsIds = (orgWorkspaces ?? []).map(w => w.id);

      let removedMemberships = 0;
      if (wsIds.length > 0) {
        const { data: del, error: delErr } = await admin
          .from('memberships')
          .delete()
          .eq('user_id', targetUserId)
          .in('workspace_id', wsIds)
          .select('id');
        if (delErr) throw new Error(`memberships: ${delErr.message}`);
        removedMemberships = del?.length ?? 0;
      }

      // 2. user_environments do ambiente
      const { error: envErr } = await admin
        .from('user_environments')
        .delete()
        .eq('user_id', targetUserId)
        .eq('environment', env);
      if (envErr) throw new Error(`user_environments: ${envErr.message}`);

      return json(200, {
        ok: true,
        op: 'unlink',
        user_id: targetUserId,
        environment: env,
        removed_memberships: removedMemberships,
      });
    }

    // ---------- op === 'link' ----------
    const envRole: EnvRole = VALID_ROLES.includes(body?.env_role) ? body?.env_role : 'client';
    const workspaceId: string | null =
      typeof body?.workspace_id === 'string' && UUID_RE.test(body.workspace_id) ? body.workspace_id : null;
    const newWorkspaceName: string | null =
      typeof body?.new_workspace_name === 'string' && body.new_workspace_name.trim()
        ? body.new_workspace_name.trim()
        : null;

    if (envRole === 'client' && !workspaceId && !newWorkspaceName) {
      return json(400, { error: 'Cliente precisa de workspace: informe workspace_id ou new_workspace_name' });
    }

    let finalWsId = workspaceId;

    // Workspace existente: validar que pertence à org do ambiente
    if (finalWsId) {
      const { data: ws } = await admin
        .from('workspaces')
        .select('id, organization_id')
        .eq('id', finalWsId)
        .maybeSingle();
      if (!ws) return json(400, { error: 'Workspace selecionado nao existe' });
      if (ws.organization_id !== org.id) {
        return json(400, { error: `Workspace nao pertence ao ambiente ${env}` });
      }
    } else if (newWorkspaceName) {
      // Criar workspace na org do ambiente
      const slugBase = slugify(newWorkspaceName) || `cliente-${Date.now()}`;
      const { data: newWs, error: wsErr } = await admin
        .from('workspaces')
        .insert({
          organization_id: org.id,
          name: newWorkspaceName,
          slug: `${slugBase}-${Math.random().toString(36).slice(2, 6)}`,
          is_active: true,
        })
        .select('id')
        .maybeSingle();
      if (wsErr || !newWs) return json(500, { error: `Criar workspace: ${wsErr?.message}` });
      finalWsId = newWs.id;
    }

    // 1. user_environments (upsert)
    const { error: envErr } = await admin
      .from('user_environments')
      .upsert(
        { user_id: targetUserId, environment: env, role: envRole, granted_by: userData.user.id },
        { onConflict: 'user_id,environment' },
      );
    if (envErr) throw new Error(`user_environments: ${envErr.message}`);

    // 2. membership (para client; staff também pode receber vínculo a workspace)
    let membershipCreated = false;
    if (finalWsId) {
      const memberRole = envRole === 'client' ? 'member' : 'manager';
      const { error: memErr } = await admin
        .from('memberships')
        .upsert(
          { user_id: targetUserId, workspace_id: finalWsId, role: memberRole },
          { onConflict: 'user_id,workspace_id' },
        );
      if (memErr) throw new Error(`membership: ${memErr.message}`);
      membershipCreated = true;
    }

    return json(200, {
      ok: true,
      op: 'link',
      user_id: targetUserId,
      environment: env,
      env_role: envRole,
      workspace_id: finalWsId,
      workspace_created: !!newWorkspaceName && !workspaceId,
      membership_created: membershipCreated,
      org_name: ENV_ORG_NAME[env as EnvType],
    });
  } catch (err) {
    return json(500, { error: err instanceof Error ? err.message : 'Erro interno' });
  }
});
