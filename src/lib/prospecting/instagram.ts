/* ─── Instagram — conexão in-app (Facebook Login for Business) ─── */

export const IG_APP_ID = '1421077150132280';
export const IG_REDIRECT_URI = 'https://agenda.grupooracullo.com/instagram/callback';
export const IG_OAUTH_SCOPES = [
  'instagram_basic',
  'instagram_manage_messages',
  'pages_manage_metadata',
  'pages_read_engagement',
  'pages_show_list',
  'business_management',
  'leads_retrieval',
].join(',');

const NONCE_KEY = (env: string) => `ig-oauth-${env}`;

export function buildInstagramOAuthUrl(environment: string): string {
  const nonce = crypto.randomUUID().replace(/-/g, '');
  sessionStorage.setItem(NONCE_KEY(environment), nonce);
  const state = `${environment}|${nonce}`;
  const params = new URLSearchParams({
    client_id: IG_APP_ID,
    redirect_uri: IG_REDIRECT_URI,
    state,
    response_type: 'code',
    scope: IG_OAUTH_SCOPES,
  });
  return `https://www.facebook.com/v21.0/dialog/oauth?${params.toString()}`;
}

/** Valida state (env|nonce) contra o localStorage e consome o nonce. */
export function validateInstagramState(state: string): string | null {
  const [environment, nonce] = state.split('|');
  if (!environment || !nonce) return null;
  const saved = sessionStorage.getItem(NONCE_KEY(environment));
  sessionStorage.removeItem(NONCE_KEY(environment));
  return saved === nonce ? environment : null;
}

/** Prefixo de rota do ambiente para o redirect pós-conexão. */
export function envRoutePrefix(environment: string): string {
  return environment === 'estrategos' ? '/estrategos' : '/sharks';
}

export const IG_CONNECT_EDGE = 'https://cyumczehpiiarwqrpgnu.supabase.co/functions/v1/instagram-connect';
export const IG_SEND_DM_EDGE = 'https://cyumczehpiiarwqrpgnu.supabase.co/functions/v1/instagram-send-dm';
