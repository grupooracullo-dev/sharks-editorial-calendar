import { ReactNode } from 'react';

interface PageHeaderProps {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
}

export default function PageHeader({ title, subtitle, actions }: PageHeaderProps) {
  const heading = (
    <>
      <h1 className="text-2xl font-bold text-gray-900 tracking-tight">{title}</h1>
      {subtitle && <p className="text-sm text-gray-500 mt-0.5">{subtitle}</p>}
    </>
  );

  if (!actions) return <div>{heading}</div>;

  return (
    <div className="flex items-center justify-between gap-4">
      <div className="min-w-0">{heading}</div>
      <div className="flex items-center gap-2 shrink-0">{actions}</div>
    </div>
  );
}
