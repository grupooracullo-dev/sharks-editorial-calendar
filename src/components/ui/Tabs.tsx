import { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface TabsProps<T extends string> {
  tabs: { id: T; label: string; icon?: ReactNode }[];
  activeTab: T;
  onChange: (tabId: T) => void;
  className?: string;
  buttonClassName?: string;
}

export default function Tabs<T extends string>({ tabs, activeTab, onChange, className, buttonClassName }: TabsProps<T>) {
  return (
    <div className={cn('flex gap-1 bg-gray-100 p-1 rounded-lg', className)}>
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          onClick={() => onChange(tab.id)}
          className={cn(
            'flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md transition-all duration-150',
            activeTab === tab.id
              ? 'bg-white text-gray-900 shadow-sm'
              : 'text-gray-500 hover:text-gray-700',
            buttonClassName
          )}
        >
          {tab.icon}
          {tab.label}
        </button>
      ))}
    </div>
  );
}

interface TabPanelProps {
  id: string;
  activeTab: string;
  children: ReactNode;
}

export function TabPanel({ id, activeTab, children }: TabPanelProps) {
  if (id !== activeTab) return null;
  return <>{children}</>;
}
