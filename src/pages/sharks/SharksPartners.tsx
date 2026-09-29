import PageHeader from '@/components/ui/PageHeader';
import { useState, useEffect, useCallback, useMemo } from 'react';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { supabase } from '@/lib/supabase';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Modal from '@/components/ui/Modal';
import Badge from '@/components/ui/Badge';
import EmptyState from '@/components/ui/EmptyState';
import { toast } from 'sonner';
import { Handshake, Plus, Search, Pencil, Archive, ArchiveRestore, Loader2 } from 'lucide-react';

interface PartnerRow {
  id: string;
  name: string;
  type: string;
  contact_name: string | null;
  contact_email: string | null;
  logo_url: string | null;
  notes: string | null;
  status: string;
}

const TYPES: { value: string; label: string }[] = [
  { value: 'cobranding', label: 'Co-branding' },
  { value: 'fornecedor', label: 'Fornecedor' },
  { value: 'colab', label: 'Colaboração' },
  { value: 'outro', label: 'Outro' },
];

const typeLabel = (t: string) => TYPES.find(x => x.value === t)?.label ?? t;

export default function SharksPartners() {
  const { currentWorkspace } = useWorkspace();
  const [items, setItems] = useState<PartnerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<PartnerRow | null>(null);
  const [form, setForm] = useState({ name: '', type: 'cobranding', contact_name: '', contact_email: '', notes: '' });
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!currentWorkspace) { setItems([]); setLoading(false); return; }
    setLoading(true);
    const { data, error } = await supabase
      .from('partners')
      .select('*')
      .eq('workspace_id', currentWorkspace.id)
      .order('name');
    if (error) toast.error('Erro ao carregar parceiros');
    setItems((data ?? []) as unknown as PartnerRow[]);
    setLoading(false);
  }, [currentWorkspace?.id]);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter(i => i.name.toLowerCase().includes(q) || (i.contact_name ?? '').toLowerCase().includes(q));
  }, [items, search]);

  const openNew = () => { setEditing(null); setForm({ name: '', type: 'cobranding', contact_name: '', contact_email: '', notes: '' }); setModalOpen(true); };
  const openEdit = (p: PartnerRow) => { setEditing(p); setForm({ name: p.name, type: p.type, contact_name: p.contact_name ?? '', contact_email: p.contact_email ?? '', notes: p.notes ?? '' }); setModalOpen(true); };

  const handleSave = async () => {
    if (!form.name.trim() || !currentWorkspace || saving) return;
    setSaving(true);
    try {
      const payload = {
        workspace_id: currentWorkspace.id,
        name: form.name.trim(),
        type: form.type,
        contact_name: form.contact_name.trim() || null,
        contact_email: form.contact_email.trim() || null,
        notes: form.notes.trim() || null,
      };
      const { error } = editing
        ? await supabase.from('partners').update(payload).eq('id', editing.id)
        : await supabase.from('partners').insert(payload);
      if (error) throw new Error(error.message);
      toast.success(editing ? 'Parceiro atualizado!' : 'Parceiro cadastrado!');
      setModalOpen(false);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao salvar parceiro');
    } finally {
      setSaving(false);
    }
  };

  const toggleStatus = async (p: PartnerRow) => {
    const next = p.status === 'active' ? 'archived' : 'active';
    const { error } = await supabase.from('partners').update({ status: next }).eq('id', p.id);
    if (error) toast.error('Erro ao atualizar');
    else { toast.success(next === 'active' ? 'Parceiro reativado' : 'Parceiro arquivado'); await load(); }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <PageHeader title="Parceiros" subtitle={<>{currentWorkspace ? `Parceiros de ${currentWorkspace.name}` : 'Selecione um cliente para ver os parceiros'}</>} />
        {currentWorkspace && (
          <Button onClick={openNew}>
            <Plus className="w-4 h-4" />
            Novo parceiro
          </Button>
        )}
      </div>

      {currentWorkspace && (
        <div className="relative max-w-sm">
          <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar parceiro..." className="pl-9" />
        </div>
      )}

      {!currentWorkspace ? (
        <Card>
          <EmptyState icon={Handshake} title="Selecione um cliente" description="Escolha um cliente para gerenciar os parceiros." />
        </Card>
      ) : loading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 text-primary-500 animate-spin" /></div>
      ) : filtered.length === 0 ? (
        <Card>
          <EmptyState icon={Handshake} title="Nenhum parceiro" description="Cadastre parceiros para vinculá-los às ações." />
        </Card>
      ) : (
        <div className="space-y-2">
          {filtered.map(p => (
            <Card key={p.id} className="flex items-center gap-4 p-4">
              <div className="w-10 h-10 rounded-lg bg-primary-50 flex items-center justify-center shrink-0">
                <Handshake className="w-5 h-5 text-primary-600" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-semibold text-gray-900 truncate">{p.name}</p>
                  <Badge variant={p.status === 'active' ? 'success' : 'default'} size="sm">
                    {p.status === 'active' ? 'Ativo' : 'Arquivado'}
                  </Badge>
                  <Badge variant="info" size="sm">{typeLabel(p.type)}</Badge>
                </div>
                {p.notes && <p className="text-xs text-gray-500 truncate mt-0.5">{p.notes}</p>}
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  onClick={() => toggleStatus(p)}
                  className="p-1.5 rounded-lg border border-gray-200 text-gray-500 hover:text-primary-600 hover:border-primary-200 hover:bg-primary-50 transition-colors"
                  title={p.status === 'active' ? 'Arquivar' : 'Reativar'}
                >
                  {p.status === 'active' ? <Archive className="w-3.5 h-3.5" /> : <ArchiveRestore className="w-3.5 h-3.5" />}
                </button>
                <button
                  onClick={() => openEdit(p)}
                  className="p-1.5 rounded-lg border border-gray-200 text-gray-500 hover:text-primary-600 hover:border-primary-200 hover:bg-primary-50 transition-colors"
                  title="Editar"
                >
                  <Pencil className="w-3.5 h-3.5" />
                </button>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Modal cadastro/edição */}
      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title={editing ? 'Editar Parceiro' : 'Novo Parceiro'} size="sm">
        <div className="space-y-4">
          <Input
            label="Nome do parceiro"
            value={form.name}
            onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))}
            placeholder="Ex: Distribuidora X"
          />
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Tipo</label>
            <div className="flex flex-wrap gap-2">
              {TYPES.map(t => (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => setForm(f => ({ ...f, type: t.value }))}
                  className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
                    form.type === t.value ? 'border-primary-400 bg-primary-50 text-primary-700' : 'border-gray-200 text-gray-500 hover:border-gray-300'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="Contato (nome)"
              value={form.contact_name}
              onChange={(e) => setForm(f => ({ ...f, contact_name: e.target.value }))}
              placeholder="Ex: João Silva"
            />
            <Input
              label="Contato (e-mail)"
              type="email"
              value={form.contact_email}
              onChange={(e) => setForm(f => ({ ...f, contact_email: e.target.value }))}
              placeholder="contato@empresa.com"
            />
          </div>
          <Input
            label="Observações"
            value={form.notes}
            onChange={(e) => setForm(f => ({ ...f, notes: e.target.value }))}
            placeholder="Observações opcionais"
          />
        </div>
        <div className="flex justify-end gap-2 mt-6 pt-4 border-t border-gray-100">
          <Button variant="ghost" onClick={() => setModalOpen(false)}>Cancelar</Button>
          <Button onClick={handleSave} loading={saving} disabled={!form.name.trim()}>Salvar</Button>
        </div>
      </Modal>
    </div>
  );
}
