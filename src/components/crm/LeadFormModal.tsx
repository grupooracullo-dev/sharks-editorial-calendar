import { useEffect, useState } from 'react';
import Modal from '@/components/ui/Modal';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';
import Textarea from '@/components/ui/Textarea';
import Button from '@/components/ui/Button';
import type { Lead } from '@/hooks/useLeads';

export interface LeadFormValues {
  name: string;
  contact_name: string;
  contact_email: string;
  contact_phone: string;
  source: string;
  segment: string;
  value: string;
  monthly_value: string;
  expected_close_date: string;
  owner_id: string;
  notes: string;
}

const EMPTY_FORM: LeadFormValues = {
  name: '', contact_name: '', contact_email: '', contact_phone: '',
  source: '', segment: '', value: '', monthly_value: '',
  expected_close_date: '', owner_id: '', notes: '',
};

interface LeadFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  lead: Lead | null;
  owners: { value: string; label: string }[];
  submitting: boolean;
  onSubmit: (values: LeadFormValues) => Promise<void>;
}

export default function LeadFormModal({ isOpen, onClose, lead, owners, submitting, onSubmit }: LeadFormModalProps) {
  const [form, setForm] = useState<LeadFormValues>(EMPTY_FORM);

  useEffect(() => {
    if (!isOpen) return;
    setForm(lead
      ? {
          name: lead.name ?? '',
          contact_name: lead.contact_name ?? '',
          contact_email: lead.contact_email ?? '',
          contact_phone: lead.contact_phone ?? '',
          source: lead.source ?? '',
          segment: lead.segment ?? '',
          value: lead.value != null ? String(lead.value) : '',
          monthly_value: lead.monthly_value != null ? String(lead.monthly_value) : '',
          expected_close_date: lead.expected_close_date ?? '',
          owner_id: lead.owner_id ?? '',
          notes: lead.notes ?? '',
        }
      : EMPTY_FORM);
  }, [isOpen, lead]);

  const set = (key: keyof LeadFormValues) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm(f => ({ ...f, [key]: e.target.value }));

  const handleSubmit = async () => {
    if (!form.name.trim()) return;
    await onSubmit(form);
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={lead ? 'Editar lead' : 'Novo lead'}
      size="lg"
    >
      <div className="space-y-4">
        <Input
          label="Nome / empresa *"
          value={form.name}
          onChange={set('name')}
          placeholder="Ex: Padaria Sol Nascente"
        />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input label="Contato" value={form.contact_name} onChange={set('contact_name')} placeholder="Pessoa de contato" />
          <Input label="Telefone" value={form.contact_phone} onChange={set('contact_phone')} placeholder="(00) 00000-0000" />
          <Input label="E-mail" type="email" value={form.contact_email} onChange={set('contact_email')} placeholder="email@empresa.com" />
          <Input label="Origem" value={form.source} onChange={set('source')} placeholder="Indicação, site, Instagram..." />
          <Input label="Segmento" value={form.segment} onChange={set('segment')} placeholder="Alimentação, serviços..." />
          <Input
            label="Valor estimado (R$)"
            type="number"
            min="0"
            step="0.01"
            value={form.value}
            onChange={set('value')}
            placeholder="0,00"
          />
          <Input
            label="Recorrência mensal (R$)"
            type="number"
            min="0"
            step="0.01"
            value={form.monthly_value}
            onChange={set('monthly_value')}
            placeholder="0,00"
            hint="Valor mensal após a conversão"
          />
          <Input label="Previsão de fechamento" type="date" value={form.expected_close_date} onChange={set('expected_close_date')} />
          <Select
            label="Responsável"
            value={form.owner_id}
            onChange={set('owner_id')}
            placeholder="Sem responsável"
            options={owners}
          />
        </div>
        <Textarea label="Observações" value={form.notes} onChange={set('notes')} placeholder="Contexto do lead, próxima ação..." rows={3} />
      </div>

      <div className="flex justify-end gap-2 mt-6 pt-4 border-t border-gray-100">
        <Button variant="ghost" onClick={onClose}>Cancelar</Button>
        <Button onClick={handleSubmit} loading={submitting} disabled={!form.name.trim()}>
          {lead ? 'Salvar' : 'Criar lead'}
        </Button>
      </div>
    </Modal>
  );
}
