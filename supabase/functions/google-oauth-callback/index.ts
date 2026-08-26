// ==========================================
// google-oauth-callback
// Exchanges authorization code for tokens,
// stores them on calendar_integrations and
// redirects back to the app.
// No JWT required (Google redirects here).
// ==========================================

import { TOKEN_API, verifyState, verifyWorkspaceAccess, serviceClient, getGoogleCredentials } from '../_shared/google.ts';

Deno.serve(async req => {
  const url = new URL(req.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state') ?? '';
  const oauthError = url.searchParams.get('error');

  const verified = await verifyState(state);
  const appUrl = Deno.env.get('APP_URL') ?? 'http://localhost:5173';
  const returnTo = verified?.r ?? '/sharks/integrations';
  const back = (params: string) =>
    Response.redirect(`${appUrl}${returnTo}${returnTo.includes('?') ? '&' : '?'}${params}`, 302);

  if (oauthError) return back(`google=${oauthError === 'access_denied' ? 'denied' : 'error'}&reason=${oauthError}`);
  if (!verified) return back('google=error&reason=state_invalido');
  if (!code) return back('google=error&reason=codigo_ausente');

  try {
    console.log('[callback] trocando codigo por tokens...');
    // Exchange code for tokens
    const { clientId, clientSecret } = getGoogleCredentials();
    const tokenRes = await fetch(TOKEN_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: `${Deno.env.get('SUPABASE_URL')}/functions/v1/google-oauth-callback`,
        grant_type: 'authorization_code',
      }),
    });
    if (!tokenRes.ok) {
      const errBody = await tokenRes.text();
      console.error('[callback] falha na troca de token:', tokenRes.status, errBody.slice(0, 300));
      throw new Error(`troca de token ${tokenRes.status}`);
    }
    const tokens = await tokenRes.json();
    console.log('[callback] tokens OK, escopos concedidos:', tokens.scope);

    // SEGURANCA: sem escopo de calendario a integracao e inutil - recusar
    const granted = String(tokens.scope ?? '');
    if (!granted.includes('calendar.events')) {
      console.warn('[callback] escopo de calendario NAO concedido');
      return back('google=error&reason=sem_permissao_calendario');
    }

    // Google account email
    let email: string | null = null;
    try {
      const ui = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
        headers: { Authorization: `Bearer ${tokens.access_token}` },
      });
      if (ui.ok) email = (await ui.json()).email ?? null;
    } catch { /* non-fatal */ }
    console.log('[callback] email da conta:', email);

    // Resolve target calendar (primary by default)
    let calId: string | null = null;
    let calName: string | null = null;
    try {
      const cl = await fetch('https://www.googleapis.com/calendar/v3/users/me/calendarList?minAccessRole=writer', {
        headers: { Authorization: `Bearer ${tokens.access_token}` },
      });
      if (cl.ok) {
        const items = ((await cl.json()).items ?? []) as Array<{ id: string; summary: string; primary?: boolean }>;
        const chosen = items.find(c => c.primary) ?? items[0];
        if (chosen) {
          calId = chosen.id;
          calName = chosen.summary;
        }
      } else {
        console.warn('[callback] calendarList falhou:', cl.status);
      }
    } catch (e) { console.warn('[callback] erro calendarList:', e); }
    console.log('[callback] calendario escolhido:', calId, '|', calName);

    // Access check: requester must still have access to the workspace
    const admin = serviceClient();
    const isGlobal = verified.ws === 'global';
    const wsId = isGlobal ? null : verified.ws;

    if (!isGlobal) {
      const allowed = await verifyWorkspaceAccess(admin, verified.u, verified.ws);
      if (!allowed) return back('google=error&reason=sem_acesso');
    }

    // Global mode: only admin_sharks and sharks_team allowed
    if (isGlobal) {
      const { data: u } = await admin.from('users').select('role').eq('id', verified.u).maybeSingle();
      if (!u || (u.role !== 'admin_sharks' && u.role !== 'sharks_team')) {
        return back('google=error&reason=sem_acesso_global');
      }
    }

    // Merge refresh token (Google omits it on re-consent)
    // Migration 021: global mode = LINHA PESSOAL do usuario (workspace_id NULL
    // + user_id). Cada usuario conecta a propria conta Google.
    const existingQuery = isGlobal
      ? await admin.from('calendar_integrations').select('id, refresh_token').is('workspace_id', null).eq('user_id', verified.u).maybeSingle()
      : await admin.from('calendar_integrations').select('id, refresh_token').eq('workspace_id', verified.ws).maybeSingle();
    const existing = existingQuery.data;

    const row = {
      workspace_id: wsId,
      user_id: isGlobal ? verified.u : null,
      google_calendar_id: calId,
      google_calendar_name: calName,
      google_account_email: email,
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token ?? existing?.refresh_token ?? null,
      token_expires_at: new Date(Date.now() + (tokens.expires_in ?? 3600) * 1000).toISOString(),
      is_connected: true,
      sync_error: null,
    };

    if (existing) {
      const { error } = await admin.from('calendar_integrations').update(row).eq('id', existing.id);
      if (error) {
        console.error('[callback] erro no UPDATE:', error.message);
        throw error;
      }
    } else {
      const { error } = await admin.from('calendar_integrations').insert(row);
      if (error) {
        console.error('[callback] erro no INSERT:', error.message);
        throw error;
      }
    }
    console.log('[callback] integracao gravada com sucesso!');

    return back('google=connected');
  } catch (e) {
    console.error('[oauth-callback]', e);
    return back(`google=error&reason=${encodeURIComponent(String((e as Error).message).slice(0, 80))}`);
  }
});
