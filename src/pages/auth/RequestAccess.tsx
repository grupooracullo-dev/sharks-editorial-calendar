import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Input from '@/components/ui/Input';
import Button from '@/components/ui/Button';
import Select from '@/components/ui/Select';
import Textarea from '@/components/ui/Textarea';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import logoUrl from '/logo.png?url';
import { ArrowLeft, Send, CheckCircle2, MailQuestion, Loader2, ShieldCheck } from 'lucide-react';
import { User } from '@supabase/supabase-js';

interface Workspace {
  id: string;
  name: string;
}

interface RequestAccessProps {
  /** When present, we are in the Google-first flow: pre-fill + verified badge. */
  authUser?: User | null;
  /** AuthGate sets this so it can react to the new pending state. */
  onSubmitted?: () => void;
}

export default function RequestAccess({ authUser = null, onSubmitted }: RequestAccessProps) {
  const navigate = useNavigate();
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const authEmail = authUser?.email ?? '';
  const authName =
    authUser?.user_metadata?.full_name
    || authUser?.user_metadata?.name
    || '';

  const [form, setForm] = useState({
    full_name: authName,
    email: authEmail,
    company: '',
    phone: '',
    workspace_id: '',
    requested_environment: 'sharks_company',
    message: '',
  });

  useEffect(() => {
    // Carrega workspaces ativos para o usuário escolher
    (async () => {
      const { data } = await supabase
        .from('workspaces')
        .select('id, name')
        .eq('is_active', true)
        .order('name');
      setWorkspaces((data as Workspace[]) || []);
      setLoading(false);
    })();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.full_name.trim() || !form.email.trim()) {
      toast.error('Preencha nome e e-mail');
      return;
    }
    setSubmitting(true);
    try {
      const payload: Record<string, unknown> = {
        full_name: form.full_name.trim(),
        email: form.email.trim().toLowerCase(),
        company: form.company.trim() || null,
        phone: form.phone.trim() || null,
        workspace_id: form.workspace_id || null,
        requested_environment: form.requested_environment,
        message: form.message.trim() || null,
        requested_role: 'client',
      };

      // Google-first: mark auth_provider so the RLS INSERT policy
      // (which checks session email == request email) allows the row.
      if (authUser) {
        payload.auth_provider = 'google';
      }

      const { error } = await supabase.from('access_requests').insert(payload);
      if (error) {
        if (error.code === '23505' || error.message.includes('duplicate') || error.message.includes('unique')) {
          toast.error('Já existe uma solicitação pendente para este e-mail');
        } else {
          throw error;
        }
        return;
      }
      setSubmitted(true);
      onSubmitted?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao enviar solicitação');
    } finally {
      setSubmitting(false);
    }
  };

  const isGoogleFlow = !!authUser;

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-900 via-primary-800 to-gray-900 flex items-center justify-center p-4">
      <div className="w-full max-w-lg">
        <div className="text-center mb-8">
          <img src={logoUrl} alt="Oracullo Calendar" className="h-16 mx-auto mb-4 object-contain drop-shadow-lg" />
          <h1 className="text-2xl font-bold text-white">Solicitar Acesso</h1>
          <p className="text-primary-200 text-sm mt-1">
            {isGoogleFlow
              ? 'Confirme os dados da sua conta Google para continuar'
              : 'Preencha o formulário para solicitar acesso à plataforma'}
          </p>
        </div>

        <div className="bg-white rounded-2xl shadow-2xl p-6 sm:p-8">
          {loading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="w-6 h-6 text-primary-500 animate-spin" />
            </div>
          ) : submitted ? (
            <div className="text-center py-6">
              <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
                <CheckCircle2 className="w-10 h-10 text-green-600" />
              </div>
              <h2 className="text-xl font-bold text-gray-900 mb-2">Solicitação enviada!</h2>
              <p className="text-sm text-gray-600 mb-1">
                Sua solicitação foi enviada para análise do administrador.
              </p>
              <p className="text-sm text-gray-600 mb-6">
                Assim que for aprovada, você será conectado automaticamente.
              </p>
              {!isGoogleFlow && (
                <Link
                  to="/login"
                  className="inline-flex items-center gap-1.5 text-sm font-medium text-primary-600 hover:text-primary-700"
                >
                  <ArrowLeft className="w-4 h-4" />
                  Voltar para o login
                </Link>
              )}
            </div>
          ) : (
            <>
              <div className="flex items-center gap-2 mb-1">
                <MailQuestion className="w-5 h-5 text-primary-500" />
                <h2 className="text-lg font-semibold text-gray-900">Novo acesso</h2>
              </div>
              <p className="text-sm text-gray-500 mb-6">
                Após análise, o administrador liberará seu acesso à plataforma.
              </p>

              {isGoogleFlow && (
                <div className="flex items-center gap-2 bg-blue-50 text-blue-700 text-xs font-medium px-3 py-2 rounded-lg mb-4">
                  <ShieldCheck className="w-4 h-4 shrink-0" />
                  E-mail verificado via Google — os campos preenchidos automaticamente não podem ser alterados.
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Input
                    label="Nome completo *"
                    value={form.full_name}
                    onChange={(e) => setForm(p => ({ ...p, full_name: e.target.value }))}
                    placeholder="Seu nome"
                    disabled={isGoogleFlow && !!authName}
                    required
                  />
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">E-mail *</label>
                    {isGoogleFlow ? (
                      <div className="w-full border border-gray-200 bg-gray-50 text-gray-600 text-sm rounded-lg px-3 py-2.5 flex items-center gap-2">
                        <span className="truncate">{form.email}</span>
                        <ShieldCheck className="w-4 h-4 text-blue-500 shrink-0" />
                      </div>
                    ) : (
                      <Input
                        type="email"
                        value={form.email}
                        onChange={(e) => setForm(p => ({ ...p, email: e.target.value }))}
                        placeholder="voce@empresa.com"
                        required
                      />
                    )}
                  </div>
                </div>

                {!isGoogleFlow && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <Input
                      label="Empresa"
                      value={form.company}
                      onChange={(e) => setForm(p => ({ ...p, company: e.target.value }))}
                      placeholder="Sua empresa"
                    />
                    <Input
                      label="Telefone"
                      value={form.phone}
                      onChange={(e) => setForm(p => ({ ...p, phone: e.target.value }))}
                      placeholder="(11) 99999-9999"
                    />
                  </div>
                )}

                <Select
                  label="Ambiente que deseja acessar"
                  value={form.requested_environment}
                  onChange={e => setForm(p => ({ ...p, requested_environment: e.target.value }))}
                  options={[
                    { value: 'sharks_company', label: '🦈 Sharks Company — Marketing' },
                    { value: 'estrategos', label: '📊 Estrategos — Gestão Empresarial' },
                  ]}
                />

                {workspaces.length > 0 && (
                  <Select
                    label="Cliente que deseja acessar"
                    value={form.workspace_id}
                    onChange={(e) => setForm(p => ({ ...p, workspace_id: e.target.value }))}
                    placeholder="Selecione (opcional)"
                    options={[
                      { value: '', label: 'Nenhum específico' },
                      ...workspaces.map(w => ({ value: w.id, label: w.name })),
                    ]}
                  />
                )}

                <Textarea
                  label="Por que você precisa de acesso?"
                  value={form.message}
                  onChange={(e) => setForm(p => ({ ...p, message: e.target.value }))}
                  placeholder="Conte um pouco sobre o seu contexto..."
                  rows={3}
                />

                <div className="flex items-center gap-2 pt-2">
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => (isGoogleFlow ? window.history.back() : navigate('/login'))}
                    className="flex-1"
                  >
                    <ArrowLeft className="w-4 h-4" />
                    Voltar
                  </Button>
                  <Button
                    type="submit"
                    className="flex-1"
                    loading={submitting}
                    disabled={!form.full_name.trim() || !form.email.trim()}
                  >
                    <Send className="w-4 h-4" />
                    Enviar solicitação
                  </Button>
                </div>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
