import { cn, getInitials } from '@/lib/utils';

interface WorkspaceLogoProps {
  name: string;
  logoUrl?: string | null;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  className?: string;
}

const sizes = {
  xs: 'w-6 h-6 text-[10px]',
  sm: 'w-8 h-8 text-xs',
  md: 'w-10 h-10 text-sm',
  lg: 'w-12 h-12 text-base',
};

export default function WorkspaceLogo({ name, logoUrl, size = 'sm', className }: WorkspaceLogoProps) {
  if (logoUrl) {
    return (
      <img
        src={logoUrl}
        alt={name}
        className={cn(
          'rounded-xl object-cover bg-white border border-gray-100 flex-shrink-0',
          sizes[size],
          className
        )}
      />
    );
  }

  return (
    <div
      className={cn(
        'rounded-xl bg-primary-100 text-primary-700 font-bold flex items-center justify-center flex-shrink-0',
        sizes[size],
        className
      )}
    >
      {getInitials(name)}
    </div>
  );
}