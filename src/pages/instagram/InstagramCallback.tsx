import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { IG_CONNECT_EDGE, IG_REDIRECT_URI, validateInstagramState, envRoutePrefix } from '@/lib/prospecting/instagram';

export default function InstagramCallback() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [status, setStatus] = useState('Conectando o Instagram...');
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;

    const finish = (ok: boolean, message: string, environment?: string) => {
      if (ok) toast.success(message);
      else toast.error(message);
      navigate(environment ? `${envRoutePrefix(environment)}/prospeccao` : '/select-environment', { replace: true });
    };

    const oauthError = searchParams.get('error_description') ?? searchParams.get('error');
    const code = searchParams.get('code');
    const state = searchParams.get('state') ?? '';

    if (oauthError) { finish(false, `Conexão cancelada: ${oauthError}`); return; }

    const environment = validateInstagramState(state);
    if (!environment) { finish(false, 'Sessão de conexão inválida ou expirada. Tente conectar novamente.'); return; }
    if (!code) { finish(false, 'Código de autorização ausente.', environment); return; }

    (async () => {
      try {
        const { data } = await supabase.auth.getSession();
        const token = data.session?.access_token;
        if (!token) { finish(false, 'Sessão expirada — faça login e conecte novamente.'); return; }
        const res = await fetch(IG_CONNECT_EDGE, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ action: 'connect', code, redirect_uri: IG_REDIRECT_URI, environment }),
        });
        const body = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; username?: string; page_name?: string };
        if (!res.ok || !body.ok) { finish(false, body.error ?? `Falha ao conectar (${res.status})`, environment); return; }
        finish(true, `Instagram conectado: @${body.username ?? '-'}${body.page_name ? ` (página ${body.page_name})` : ''}`, environment);
      } catch (e) {
        finish(false, e instanceof Error ? e.message : 'Erro inesperado na conexão', environment);
      }
    })();
  }, [searchParams, navigate]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 gap-3">
      <Loader2 className="w-8 h-8 text-primary-500 animate-spin" />
      <p className="text-sm text-gray-600">{status}</p>
    </div>
  );
}
