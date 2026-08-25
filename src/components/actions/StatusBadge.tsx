import { ActionStatus } from '@/types';
import { cn } from '@/lib/utils';
import { ACTION_STATUSES } from '@/lib/constants';

interface StatusBadgeProps {
  status: ActionStatus;
  size?: 'sm' | 'md';
  className?: string;
}

export default function StatusBadge({ status, size = 'md', className }: StatusBadgeProps) {
  const config = ACTION_STATUSES[status];

  return (
    <span
      className={cn(
        'inline-flex items-center font-medium rounded-full',
        config.bgColor,
        config.color,
        size === 'sm' ? 'px-2 py-0.5 text-[10px]' : 'px-2.5 py-1 text-xs',
        className
      )}
    >
      {config.label}
    </span>
  );
}
