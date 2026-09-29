import { useState } from 'react';
import CrmBoard from '@/components/crm/CrmBoard';
import Tabs from '@/components/ui/Tabs';

type CrmTab = 'all' | 'sharks_company' | 'estrategos';

const TABS = [
  { id: 'all' as const, label: 'Todos' },
  { id: 'sharks_company' as const, label: '🦈 Sharks' },
  { id: 'estrategos' as const, label: '📊 Estrategos' },
];

export default function OraculloCRM() {
  const [tab, setTab] = useState<CrmTab>('all');

  return (
    <div className="flex-1 min-h-0 flex flex-col space-y-4">
      <div>
        <Tabs tabs={TABS} activeTab={tab} onChange={(t) => setTab(t as CrmTab)} />
      </div>
      <CrmBoard
        key={tab}
        environment={tab === 'all' ? null : tab}
        canDelete
        showEnv={tab === 'all'}
        title="CRM"
        subtitle="Pipeline consolidado dos ambientes Sharks e Estrategos"
      />
    </div>
  );
}
