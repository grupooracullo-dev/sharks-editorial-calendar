import { useEffect, useState } from 'react';
import Modal from '@/components/ui/Modal';
import Input from '@/components/ui/Input';
import Button from '@/components/ui/Button';
import { ENVIRONMENT_META } from '@/types';
import type { Lead } from '@/hooks/useLeads';

interface ConvertLeadModalProps {
  lead: Lead | null;
  submitting: boolean;
  onClose: () => void;
  onConfirm: (workspaceName: string, segment: string) => Promise<void>;
}

export default function ConvertLeadModal({ lead, submitting, onClose, onConfirm }: ConvertLeadModalProps) {
  const [wsName, setWsName] = useState('');
  const [segment, setSegment] = useState('');

  useEffect(() => {
    if (lead) {
      setWsName(lead.name);
      setSegment(lead.segment ?? '');
    }
  }, [lead]);

  if (!lead) return null;

  return (
    <Modal isOpen={!!lead} onClose={onClose} title="Converter em cliente" size="md">
      <div className="space-y-4">
        <div className="bg-primary-50 border border-primary-200 rounded-lg p-3">
          <p className="text-xs text-primary-700">
            O cliente será criado no ambiente {ENVIRONMENT_META[lead.environment].emoji}{' '}
            {ENVIRONMENT_META[lead.environment].label}. O acesso dele à agenda continua
            seguindo o fluxo normal de solicitação de acesso.
          </p>
        </div>
        <Input
          label="Nome do cliente *"
          value={wsName}
          onChange={(e) => setWsName(e.target.value)}
          placeholder="Nome que aparecerá na agenda"
        />
        <Input
          label="Segmento"
          value={segment}
          onChange={(e) => setSegment(e.target.value)}
          placeholder="Alimentação, serviços..."
        />
      </div>

      <div className="flex justify-end gap-2 mt-6 pt-4 border-t border-gray-100">
        <Button variant="ghost" onClick={onClose}>Cancelar</Button>
        <Button
          variant="success"
          onClick={() => onConfirm(wsName, segment)}
          loading={submitting}
          disabled={!wsName.trim()}
        >
          Converter em cliente
        </Button>
      </div>
    </Modal>
  );
}
