// ==========================================
// google-oauth-start
// Builds the Google consent URL with a signed
// state and redirects the browser to it.
// No JWT required (plain browser navigation).
// ==========================================

import { createState } from '../_shared/google.ts';

Deno.serve(async req => {
  const url = new URL(req.url);
  const appUrl = Deno.env.get('APP_URL') ?? 'http://localhost:5173';
  const wsId = url.searchParams.get('workspace_id');
  const userId = url.searchParams.get('user_id');
  const returnTo = url.searchParams.get('return_to') ?? '/sharks/integrations';

  if (!wsId || !userId) {
    return Response.redirect(`${appUrl}${returnTo}?google=error&reason=parametros_ausentes`, 302);
  }

  const clientId = Deno.env.get('GOOGLE_CLIENT_ID');
  if (!clientId) {
    return Response.redirect(`${appUrl}${returnTo}?google=error&reason=credenciais_nao_configuradas`, 302);
  }

  const state = await createState(wsId, userId, returnTo);
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

  return Response.redirect(authUrl.toString(), 302);
});
