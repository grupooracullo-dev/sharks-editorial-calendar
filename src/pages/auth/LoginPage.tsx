import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import Input from '@/components/ui/Input';
import Button from '@/components/ui/Button';
import logoUrl from '/logo.png?url';
import { UserPlus, Loader2 } from 'lucide-react';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const { signIn, signInWithGoogle, user, isSharks, isOracullo, environments } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!user) return;
    // Redirect inteligente multi-ambiente:
    //   oracullo      -> /oracullo (govanca)
    //   sem ambiente  -> /auth-gate (acesso pendente)
    //   1 ambiente    -> home do ambiente
    //   2+ ambientes  -> seletor
    if (isOracullo) {
      navigate('/oracullo', { replace: true });
    } else if (environments.length === 0) {
      navigate('/auth-gate', { replace: true });
    } else if (environments.length === 1) {
      const env = environments[0];
      const isStaff = env.role !== 'client';
      navigate(env.environment === 'sharks_company' ? (isStaff ? '/sharks' : '/client') : (isStaff ? '/estrategos' : '/client'), { replace: true });
    } else {
      navigate('/select-environment', { replace: true });
    }
  }, [user, isSharks, isOracullo, environments, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await signIn(email, password);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'E-mail ou senha inválidos');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogle = async () => {
    setError('');
    try {
      await signInWithGoogle();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao conectar com Google');
    }
  };

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center p-4 relative overflow-hidden">
      {/* Subtle radial glow */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(99,102,241,0.15)_0%,transparent_70%)]" />
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[600px] bg-primary-500/5 rounded-full blur-3xl" />

      <div className="w-full max-w-md relative z-10">
        {/* Logo */}
        <div className="text-center mb-8">
          <img
            src={logoUrl}
            alt="Oracullo"
            className="h-40 mx-auto object-contain drop-shadow-2xl"
          />
        </div>

        {/* Card */}
        <div className="bg-white/95 backdrop-blur-xl rounded-2xl shadow-2xl shadow-black/20 p-6 sm:p-8">
          <h2 className="text-lg font-semibold text-gray-900 mb-1">Entrar</h2>
          <p className="text-sm text-gray-500 mb-6">Acesse sua conta para continuar</p>

          {/* Google SSO */}
          <button
            type="button"
            onClick={handleGoogle}
            disabled={loading}
            className="w-full flex items-center justify-center gap-3 border border-gray-300 bg-white text-gray-700 text-sm font-medium rounded-lg px-4 py-2.5 hover:bg-gray-50 transition-colors disabled:opacity-50 mb-4"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
            </svg>
            Entrar com Google
          </button>

          <div className="relative my-4">
            <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-gray-200" /></div>
            <div className="relative flex justify-center text-xs"><span className="bg-white px-2 text-gray-400">ou entre com e-mail e senha</span></div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <Input
              label="E-mail"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="voce@empresa.com"
              required
            />
            <Input
              label="Senha"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
            />

            {error && (
              <div className="bg-red-50 text-red-600 text-sm px-3 py-2 rounded-lg">
                {error}
              </div>
            )}

            <Button type="submit" className="w-full" size="lg" loading={loading}>
              Entrar
            </Button>

            <div className="text-center pt-3 border-t border-gray-100">
              <p className="text-xs text-gray-500 mb-2">Ainda não tem acesso?</p>
              <Link
                to="/request-access"
                className="inline-flex items-center gap-1.5 text-sm font-medium text-primary-600 hover:text-primary-700 transition-colors"
              >
                <UserPlus className="w-4 h-4" />
                Solicitar acesso
              </Link>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
