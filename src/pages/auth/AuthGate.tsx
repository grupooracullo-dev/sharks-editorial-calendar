import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import RequestAccess from './RequestAccess';
import Button from '@/components/ui/Button';
import logoUrl from '/logo.png?url';
import { Hourglass, CheckCircle2, XCircle, LogOut, Loader2 } from 'lucide-react';

interface AccessRequestRow {
  id: string;
  status: 'pending' | 'approved' | 'rejected';
  rejected_reason: string | null;
}

type Phase = 'checking' | 'none' | 'pending' | 'rejected';

/**
 * Rendered when a session exists (e.g. signed in with Google) but no
 * profile row does — access has not been approved by an admin yet.
 * All app routes are blocked until approval lands (via realtime).
 */
export default function AuthGate() {
  const { authUser, refreshProfile, signOut } = useAuth();
  const [phase, setPhase] = useState<Phase>('checking');
  const [reason, setReason] = useState<string | null>(null);
  const email = authUser?.email ?? '';

  // Initial state from the latest request for this email
  useEffect(() => {
    if (!email) return;
    let mounted = true;
    (async () => {
      const { data } = await supabase
        .from('access_requests')
        .select('id, status, rejected_reason')
        .ilike('email', email)
        .order('created_at', { ascending: false })
        .limit(1);
      if (!mounted) return;
      const latest = (data as AccessRequestRow[] | null)?.[0];
      if (!latest || latest.status === 'approved') {
        // approved but profile still missing? refresh once more
        const found = await refreshProfile();
        if (!found) setPhase(latest ? 'none' : 'none');
        return;
      }
      setPhase(latest.status);
      if (latest.status === 'rejected') setReason(latest.rejected_reason);
    })();
    return () => { mounted = false; };
  }, [email, refreshProfile]);

  // Realtime: react to the admin's decision instantly
  useEffect(() => {
    if (!email) return;
    const channel = supabase
      .channel(`auth-gate-${email}`)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .on('postgres_changes' as any, { event: '*', schema: 'public', table: 'access_requests', filter: `email=eq.${email}` }, (payload: any) => {
        const row = payload.new;
        if (!row) return;
          if (row.status === 'pending') {
            setPhase('pending');
          } else if (row.status === 'rejected') {
            setPhase('rejected');
            setReason(row.rejected_reason);
          } else if (row.status === 'approved') {
            // Profile row was created just before the request update.
            // Small retry to avoid a visibility race with the event.
            setPhase('checking');
            let attempts = 0;
            const tryProfile = async () => {
              const ok = await refreshProfile();
              if (!ok && attempts < 5) {
                attempts += 1;
                setTimeout(tryProfile, 800);
              }
            };
            tryProfile();
          }
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [email, refreshProfile]);

  const handleSignOut = useCallback(async () => {
    await signOut();
  }, [signOut]);

  if (phase === 'none' || phase === 'checking') {
    if (phase === 'checking') {
      return (
        <Shell email={email} onSignOut={handleSignOut}>
          <Loader2 className="w-8 h-8 text-primary-500 animate-spin mx-auto mb-4" />
          <p className="text-sm text-gray-500">Verificando status do seu acesso…</p>
        </Shell>
      );
    }
    // No request yet — Google-verified email, straight to the form
    return <RequestAccess authUser={authUser} onSubmitted={() => setPhase('pending')} />;
  }

  if (phase === 'pending') {
    return (
      <Shell email={email} onSignOut={handleSignOut}>
        <div className="w-16 h-16 rounded-full bg-amber-100 flex items-center justify-center mx-auto mb-4">
          <Hourglass className="w-8 h-8 text-amber-600" />
        </div>
        <h2 className="text-xl font-bold text-gray-900 mb-2">Aguardando aprovação</h2>
        <p className="text-sm text-gray-600 mb-1">
          Sua solicitação de acesso foi enviada e está sendo analisada.
        </p>
        <p className="text-sm text-gray-500 mb-6">
          Esta tela vai liberar o acesso automaticamente assim que o administrador aprovar —
          você não precisa recarregar nada.
        </p>
        <div className="inline-flex items-center gap-2 bg-blue-50 text-blue-700 text-xs font-medium px-3 py-1.5 rounded-full">
          <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
          Acompanhando em tempo real
        </div>
      </Shell>
    );
  }

  // rejected
  return (
    <Shell email={email} onSignOut={handleSignOut}>
      <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-4">
        <XCircle className="w-8 h-8 text-red-600" />
      </div>
      <h2 className="text-xl font-bold text-gray-900 mb-2">Solicitação rejeitada</h2>
      {reason && (
        <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2 mb-3">{reason}</p>
      )}
      <p className="text-sm text-gray-500 mb-6">
        Se acredita que isso foi um engano, você pode enviar uma nova solicitação.
      </p>
      <div className="flex flex-col sm:flex-row gap-2 justify-center">
        <Button variant="outline" onClick={handleSignOut}>
          <LogOut className="w-4 h-4" /> Sair
        </Button>
        <Button onClick={() => setPhase('none')}>
          <CheckCircle2 className="w-4 h-4" /> Solicitar novamente
        </Button>
      </div>
    </Shell>
  );
}

function Shell({ email, onSignOut, children }: { email: string; onSignOut: () => void; children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-900 via-primary-800 to-gray-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-6">
          <img src={logoUrl} alt="Sharks Company" className="h-14 mx-auto mb-3 object-contain drop-shadow-lg" />
        </div>
        <div className="bg-white rounded-2xl shadow-2xl p-6 sm:p-8 text-center">
          {children}
          {email && (
            <div className="mt-6 pt-4 border-t border-gray-100 flex items-center justify-between">
              <p className="text-xs text-gray-400 truncate">{email}</p>
              {onSignOut && (
                <button
                  onClick={onSignOut}
                  className="text-xs text-gray-400 hover:text-red-500 font-medium transition-colors"
                >
                  Trocar conta
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
