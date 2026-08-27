import { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import logoUrl from '/logo.png?url';

export default function LegalLayout({ title, updated, children }: { title: string; updated: string; children: ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-100">
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center justify-between">
          <Link to="/login" className="flex items-center gap-2.5">
            <img src={logoUrl} alt="Oracullo" className="h-8 w-8 object-contain" />
            <span className="text-sm font-bold text-gray-900">Oracullo Calendar</span>
          </Link>
          <nav className="flex items-center gap-4 text-xs font-medium text-gray-500">
            <Link to="/privacy" className="hover:text-gray-900 transition-colors">Privacidade</Link>
            <Link to="/terms" className="hover:text-gray-900 transition-colors">Termos</Link>
          </nav>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-10">
        <h1 className="text-3xl font-bold text-gray-900">{title}</h1>
        <p className="text-xs text-gray-400 mt-2">Última atualização: {updated}</p>

        <div className="mt-8 space-y-8">{children}</div>
      </main>

      <footer className="border-t border-gray-100 mt-10">
        <div className="max-w-3xl mx-auto px-4 py-6 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-gray-400">
          <p>© {new Date().getFullYear()} Grupo Oracullo. Todos os direitos reservados.</p>
          <p>
            <a href="mailto:grupo.oracullo@gmail.com" className="hover:text-gray-600">grupo.oracullo@gmail.com</a>
          </p>
        </div>
      </footer>
    </div>
  );
}

interface SectionProps {
  n: number;
  title: string;
  children: ReactNode;
}

export function Section({ n, title, children }: SectionProps) {
  return (
    <section className="bg-white rounded-xl border border-gray-200 p-6">
      <h2 className="text-base font-semibold text-gray-900 mb-3">
        <span className="text-primary-600 mr-2">{String(n).padStart(2, '0')}</span>
        {title}
      </h2>
      <div className="space-y-3 text-sm leading-relaxed text-gray-600">{children}</div>
    </section>
  );
}
