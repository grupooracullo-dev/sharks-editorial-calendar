import { useState } from 'react';
import PageHeader from '@/components/ui/PageHeader';
import Tabs from '@/components/ui/Tabs';
import CampaignsSection from './ProspectingPage';
import AgentSection from './AgentPage';
import ApproachesSection from './ApproachesPage';
import type { ProspectingEnvironment } from '@/lib/prospecting/types';

type HubTab = 'campanhas' | 'agente' | 'abordagens';

const SUBTITLES: Record<HubTab, string> = {
  campanhas: 'Crie e acompanhe campanhas de prospecção por ICP, canal e produtos.',
  agente: 'O motor que descobre, pesquisa, qualifica e aborda — com transparência total.',
  abordagens: 'Rascunhos, envios e respostas do agente em tempo real.',
};

interface ProspectingHubProps {
  environment: ProspectingEnvironment;
}

/** Hub da Prospecção IA: campanhas, agente e abordagens em um módulo só. */
export default function ProspectingHub({ environment }: ProspectingHubProps) {
  const [tab, setTab] = useState<HubTab>('campanhas');

  return (
    <div className="flex-1 min-h-0 flex flex-col space-y-4">
      <PageHeader title="Prospecção IA" subtitle={SUBTITLES[tab]} />
      <Tabs
        tabs={[
          { id: 'campanhas' as const, label: 'Campanhas' },
          { id: 'agente' as const, label: 'Agente IA' },
          { id: 'abordagens' as const, label: 'Abordagens' },
        ]}
        activeTab={tab}
        onChange={setTab}
        className="self-start"
      />
      {tab === 'campanhas' && <CampaignsSection environment={environment} />}
      {tab === 'agente' && <AgentSection environment={environment} />}
      {tab === 'abordagens' && <ApproachesSection environment={environment} />}
    </div>
  );
}
