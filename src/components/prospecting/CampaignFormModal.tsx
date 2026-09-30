import { useEffect, useState } from 'react';
import Modal from '@/components/ui/Modal';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';
import Button from '@/components/ui/Button';
import ChipMultiSelect from '@/components/ui/ChipMultiSelect';
import { useEnvProducts } from '@/hooks/useEnvProducts';
import {
  AUTOMATION_LEVELS, AUTOMATION_META, CHANNEL_META, COMPANY_SIZES,
  PROSPECTING_CHANNELS, type AutomationLevel, type CampaignPayload,
  type CampaignStatus, type ProspectingCampaign, type ProspectingEnvironment,
} from '@/lib/prospecting/types';

export interface CampaignFormValues {
  name: string;
  objective: string;
  segment: string;
  location: string;
  company_size: string;
  target_count: string;
  channels: string[];
  automation_level: AutomationLevel;
  assigned_to: string;
  product_ids: string[];
  status: CampaignStatus;
}

const EMPTY: CampaignFormValues = {
  name: '', objective: '', segment: '', location: '', company_size: '',
  target_count: '100', channels: ['email'], automation_level: 'assisted',
  assigned_to: '', product_ids: [], status: 'draft',
};

interface CampaignFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  campaign: ProspectingCampaign | null;
  environment: ProspectingEnvironment;
  owners: { value: string; label: string }[];
  submitting: boolean;
  onSubmit: (values: CampaignFormValues) => Promise<void>;
}

export default function CampaignFormModal({
  isOpen, onClose, campaign, environment, owners, submitting, onSubmit,
}: CampaignFormModalProps) {
  const [form, setForm] = useState<CampaignFormValues>(EMPTY);
  const catalogProducts = useEnvProducts(environment);

  useEffect(() => {
    if (!isOpen) return;
    setForm(campaign
      ? {
          name: campaign.name ?? '',
          objective: campaign.objective ?? '',
          segment: campaign.segment ?? '',
          location: campaign.location ?? '',
          company_size: campaign.company_size ?? '',
          target_count: String(campaign.target_count ?? 100),
          channels: campaign.channels ?? [],
          automation_level: campaign.automation_level,
          assigned_to: campaign.assigned_to ?? '',
          product_ids: (campaign.products ?? []).map(x => x.product?.id).filter((v): v is string => !!v),
          status: campaign.status,
        }
      : EMPTY);
  }, [isOpen, campaign]);

  const set = (key: keyof CampaignFormValues) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm(f => ({ ...f, [key]: e.target.value }));

  const handleSubmit = async () => {
    if (!form.name.trim()) return;
    await onSubmit(form);
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={campaign ? 'Editar campanha' : 'Nova campanha de prospecção'}
      size="lg"
    >
      <div className="space-y-4">
        <Input
          label="Nome da campanha *"
          value={form.name}
          onChange={set('name')}
          placeholder="Ex: Distribuidores de alimentos — PE"
        />
        <Input
          label="Objetivo"
          value={form.objective}
          onChange={set('objective')}
          placeholder="Ex: Gerar reuniões com donos de negócio"
        />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input label="Segmento" value={form.segment} onChange={set('segment')} placeholder="Alimentação, serviços..." />
          <Input label="Localização" value={form.location} onChange={set('location')} placeholder="Cidade, estado ou região" />
          <Select
            label="Porte da empresa"
            value={form.company_size}
            onChange={set('company_size')}
            placeholder="Qualquer porte"
            options={COMPANY_SIZES.map(s => ({ value: s, label: s }))}
          />
          <Input
            label="Quantidade desejada"
            type="number"
            min="1"
            max="100000"
            value={form.target_count}
            onChange={set('target_count')}
          />
        </div>

        <ChipMultiSelect
          label="Produtos ofertados"
          options={catalogProducts.map(p => ({ id: p.id, name: p.name }))}
          values={form.product_ids}
          onChange={(ids) => setForm(f => ({ ...f, product_ids: ids }))}
          placeholder="Selecionar produtos do ambiente..."
          emptyMessage="Nenhum produto cadastrado — cadastre na página Produtos"
        />

        <ChipMultiSelect
          label="Canais de abordagem"
          options={PROSPECTING_CHANNELS.map(c => ({ id: c, name: CHANNEL_META[c].label }))}
          values={form.channels}
          onChange={(ids) => setForm(f => ({ ...f, channels: ids }))}
          placeholder="Selecionar canais..."
          emptyMessage="Nenhum canal disponível"
        />

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <Select
              label="Nível de automação"
              value={form.automation_level}
              onChange={(e) => setForm(f => ({ ...f, automation_level: e.target.value as AutomationLevel }))}
              options={AUTOMATION_LEVELS.map(a => ({ value: a, label: AUTOMATION_META[a].label }))}
            />
            <p className="text-[11px] text-gray-400 mt-1">O MVP nunca executa abordagens reais automaticamente.</p>
          </div>
          <Select
            label="Responsável"
            value={form.assigned_to}
            onChange={set('assigned_to')}
            placeholder="Sem responsável"
            options={owners}
          />
        </div>
      </div>

      <div className="flex justify-end gap-2 mt-6 pt-4 border-t border-gray-100">
        <Button variant="ghost" onClick={onClose}>Cancelar</Button>
        <Button
          onClick={handleSubmit}
          loading={submitting}
          disabled={!form.name.trim() || form.channels.length === 0}
        >
          {campaign ? 'Salvar' : 'Criar campanha'}
        </Button>
      </div>
    </Modal>
  );
}

export function payloadFromValues(values: CampaignFormValues, environment: ProspectingEnvironment): CampaignPayload {
  return {
    name: values.name.trim(),
    objective: values.objective.trim() || null,
    segment: values.segment.trim() || null,
    location: values.location.trim() || null,
    company_size: values.company_size || null,
    target_count: Math.max(1, Math.min(100000, parseInt(values.target_count, 10) || 100)),
    channels: values.channels,
    automation_level: values.automation_level,
    assigned_to: values.assigned_to || null,
    product_ids: values.product_ids,
    status: values.status,
  };
}
