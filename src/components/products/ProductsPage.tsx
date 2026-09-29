import { useState } from 'react';
import PageHeader from '@/components/ui/PageHeader';
import Tabs from '@/components/ui/Tabs';
import EnvProductsCatalog from './EnvProductsCatalog';
import WorkspaceProducts from './WorkspaceProducts';
import type { CrmEnvironment } from '@/hooks/useLeads';

type ProductsTab = 'catalog' | 'client';

/** Página de Produtos: catálogo do ambiente (leads) + produtos do cliente (ações). */
export default function ProductsPage({ environment }: { environment: CrmEnvironment }) {
  const [tab, setTab] = useState<ProductsTab>('catalog');

  return (
    <div className="space-y-4">
      <PageHeader
        title="Produtos"
        subtitle="Catálogo do ambiente para o interesse dos leads · Produtos dos clientes para as ações"
      />
      <Tabs
        tabs={[{ id: 'catalog' as const, label: 'Catálogo do ambiente' }, { id: 'client' as const, label: 'Produtos do cliente' }]}
        activeTab={tab}
        onChange={setTab}
      />
      {tab === 'catalog' ? (
        <EnvProductsCatalog key={environment} environment={environment} />
      ) : (
        <WorkspaceProducts />
      )}
    </div>
  );
}
