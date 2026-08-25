import { AlertCircle, AlertTriangle, Info, CheckCircle2, LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

interface AlertCardProps {
  type: 'danger' | 'warning' | 'info' | 'success';
  title: string;
  message?: string;
  action?: React.ReactNode;
  onClick?: () => void;
}

const configs = {
  danger: { icon: AlertCircle, bg: 'bg-red-50 border-red-100', iconColor: 'text-red-500', titleColor: 'text-red-900' },
  warning: { icon: AlertTriangle, bg: 'bg-amber-50 border-amber-100', iconColor: 'text-amber-500', titleColor: 'text-amber-900' },
  info: { icon: Info, bg: 'bg-blue-50 border-blue-100', iconColor: 'text-blue-500', titleColor: 'text-blue-900' },
  success: { icon: CheckCircle2, bg: 'bg-emerald-50 border-emerald-100', iconColor: 'text-emerald-500', titleColor: 'text-emerald-900' },
};

export default function AlertCard({ type, title, message, action, onClick }: AlertCardProps) {
  const config = configs[type];
  const Icon = config.icon;

  return (
    <div
      className={cn('flex items-start gap-3 p-3 rounded-xl border', config.bg, onClick && 'cursor-pointer hover:shadow-sm transition-shadow')}
      onClick={onClick}
    >
      <Icon className={cn('w-4 h-4 mt-0.5 flex-shrink-0', config.iconColor)} />
      <div className="min-w-0 flex-1">
        <p className={cn('text-sm font-medium', config.titleColor)}>{title}</p>
        {message && <p className="text-xs text-gray-600 mt-0.5">{message}</p>}
      </div>
      {action}
    </div>
  );
}
