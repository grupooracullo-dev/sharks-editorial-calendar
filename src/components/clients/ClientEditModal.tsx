import { useState, useEffect } from 'react';
import Modal from '@/components/ui/Modal';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';
import Button from '@/components/ui/Button';
import LogoUploader from '@/components/ui/LogoUploader';
import { SEGMENTS } from '@/lib/constants';
import { BR_STATES } from '@/data/brDates';
import { CITIES_BY_STATE } from '@/data/brCities';
import { updateClient } from '@/lib/clientFactory';
import { toast } from 'sonner';

export interface ClientEditTarget {
  id: string;
  name: string;
  segment: string | null;
  city: string | null;
  state: string | null;
  logo_url: string | null;
}

export interface ClientEditModalProps {
  open: boolean;
  onClose: () => void;
  client: ClientEditTarget | null;
  onSaved?: () => void;
}

export default function ClientEditModal({ open, onClose, client, onSaved }: ClientEditModalProps) {
  const [form, setForm] = useState({ name: '', segment: '', city: '', state: '' });
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open || !client) return;
    setForm({
      name: client.name,
      segment: client.segment || '',
      city: client.city || '',
      state: client.state || '',
    });
    setLogoUrl(client.logo_url ?? null);
    setSaving(false);
  }, [open, client]);

  const handleSave = async () => {
    if (!client || !form.name.trim() || saving) return;
    setSaving(true);
    try {
      await updateClient(client.id, {
        name: form.name.trim(),
        segment: form.segment || null,
        city: form.city || null,
        state: form.state || null,
        logo_url: logoUrl,
      });
      toast.success(`Cliente "${form.name}" atualizado!`);
      onSaved?.();
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao atualizar cliente');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal isOpen={open} onClose={onClose} title="Editar Cliente" size="md">
      <div className="space-y-4">
        <p className="text-sm font-medium text-gray-700">Logomarca</p>
        <LogoUploader
          name={form.name || 'Cliente'}
          logoUrl={logoUrl}
          onChange={setLogoUrl}
        />
        <Input
          label="Nome da empresa"
          value={form.name}
          onChange={(e) => setForm(p => ({ ...p, name: e.target.value }))}
          placeholder="Ex: PB & RN Foods"
        />
        <Select
          label="Segmento"
          value={form.segment}
          onChange={(e) => setForm(p => ({ ...p, segment: e.target.value }))}
          placeholder="Selecione"
          options={SEGMENTS.map(s => ({ value: s, label: s }))}
        />
        <Select
          label="Estado"
          value={form.state}
          onChange={(e) => setForm(p => ({ ...p, state: e.target.value, city: '' }))}
          placeholder="Selecione o estado"
          options={BR_STATES.map(s => ({ value: s.value, label: `${s.label} (${s.value})` }))}
        />
        {form.state && (
          <Select
            label="Cidade"
            value={CITIES_BY_STATE[form.state]?.includes(form.city) ? form.city : '__outro__'}
            onChange={(e) => {
              if (e.target.value === '__outro__') {
                setForm(p => ({ ...p, city: '' }));
              } else {
                setForm(p => ({ ...p, city: e.target.value }));
              }
            }}
            placeholder="Selecione a cidade"
            options={[
              ...(CITIES_BY_STATE[form.state] ?? []).map(c => ({ value: c, label: c })),
              { value: '__outro__', label: 'Outra cidade...' },
            ]}
          />
        )}
        {form.state && !CITIES_BY_STATE[form.state]?.includes(form.city) && (
          <Input
            label="Cidade"
            value={form.city}
            onChange={(e) => setForm(p => ({ ...p, city: e.target.value }))}
            placeholder="Digite o nome da cidade"
          />
        )}
      </div>
      <div className="flex justify-end gap-2 mt-6 pt-4 border-t border-gray-100">
        <Button variant="ghost" onClick={onClose}>Cancelar</Button>
        <Button onClick={handleSave} loading={saving} disabled={!form.name.trim()}>
          Salvar
        </Button>
      </div>
    </Modal>
  );
}