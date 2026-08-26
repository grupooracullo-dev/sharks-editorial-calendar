import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { ENVIRONMENT_META, type EnvironmentType } from '@/types';
import { cn } from '@/lib/utils';
import { ArrowRight, ShieldCheck } from 'lucide-react';

export default function EnvironmentSelector() {
  const navigate = useNavigate();
  const { user, environments, isOracullo } = useAuth();

  const targets: Array<{ id: EnvironmentType | 'oracullo'; emoji: string; label: string; desc: string; home: string }> = [];

  if (isOracullo) {
    targets.push({ id: 'oracullo', emoji: '🛡️', label: 'Oracullo', desc: 'Governança: acessos, usuários e visão geral', home: '/oracullo' });
  }
  for (const env of environments.map(e => e.environment)) {
    const meta = ENVIRONMENT_META[env];
    const isStaff = isOracullo || environments.find(e => e.environment === env)?.role !== 'client';
    targets.push({
      id: env,
      emoji: meta.emoji,
      label: meta.label,
      desc: env === 'sharks_company' ? 'Marketing: calendário editorial e campanhas' : 'Gestão: projetos, reuniões e implantações',
      home: env === 'sharks_company' ? (isStaff ? '/sharks' : '/client') : (isStaff ? '/estrategos' : '/client'),
    });
  }

  return (
    <div className="min-h-[calc(100vh-200px)] flex items-center justify-center p-4">
      <div className="w-full max-w-2xl">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-gray-900">
            Bem-vindo, {user?.full_name?.split(' ')[0]}!
          </h1>
          <p className="text-sm text-gray-500 mt-1">Selecione o ambiente que deseja acessar</p>
        </div>

        <div className={cn('grid gap-4', targets.length > 2 ? 'sm:grid-cols-3' : 'sm:grid-cols-2')}>
          {targets.map(t => (
            <button
              key={t.id}
              onClick={() => navigate(t.home)}
              className="group bg-white rounded-2xl border border-gray-200 hover:border-primary-400 hover:shadow-lg transition-all p-6 text-left"
            >
              <span className="text-3xl block mb-3">{t.emoji}</span>
              <p className="text-base font-semibold text-gray-900 group-hover:text-primary-600 transition-colors">{t.label}</p>
              <p className="text-xs text-gray-500 mt-1 leading-relaxed">{t.desc}</p>
              <span className="mt-4 inline-flex items-center gap-1 text-xs font-medium text-primary-600">
                Acessar <ArrowRight className="w-3 h-3 transition-transform group-hover:translate-x-0.5" />
              </span>
            </button>
          ))}
        </div>

        <p className="mt-6 text-center text-xs text-gray-400 flex items-center justify-center gap-1.5">
          <ShieldCheck className="w-3.5 h-3.5" />
          Você pode trocar de ambiente a qualquer momento pelo menu lateral
        </p>
      </div>
    </div>
  );
}
