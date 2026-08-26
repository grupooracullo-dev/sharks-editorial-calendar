import { useState, useEffect } from 'react';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import Card from '@/components/ui/Card';
import Modal from '@/components/ui/Modal';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';
import Button from '@/components/ui/Button';
import EmptyState from '@/components/ui/EmptyState';
import Avatar from '@/components/ui/Avatar';
import Badge from '@/components/ui/Badge';
import { SEGMENTS } from '@/lib/constants';
import { BR_STATES } from '@/data/brDates';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import { Plus, Building2, MapPin, Briefcase, Rocket, Loader2, Pencil, Trash2 } from 'lucide-react';
import { formatDate } from '@/lib/utils';
import type { EstrategosProject } from '@/types';

const CITIES_BY_STATE: Record<string, string[]> = {
  AC: ['Rio Branco', 'Cruzeiro do Sul'],
  AL: ['Maceio', 'Arapiraca'],
  AM: ['Manaus', 'Parintins'],
  BA: ['Salvador', 'Feira de Santana', 'Vitoria da Conquista'],
  CE: ['Fortaleza', 'Caucaia', 'Juazeiro do Norte'],
  DF: ['Brasilia', 'Taguatinga', 'Ceilandia'],
  ES: ['Vitoria', 'Vila Velha', 'Serra'],
  GO: ['Goiania', 'Aparecida de Goiania', 'Anapolis'],
  MA: ['Sao Luis', 'Imperatriz'],
  MT: ['Cuiaba', 'Varzea Grande', 'Rondonopolis'],
  MS: ['Campo Grande', 'Dourados'],
  MG: ['Belo Horizonte', 'Uberlandia', 'Contagem', 'Juiz de Fora', 'Betim'],
  PA: ['Belem', 'Ananindeua', 'Santarem'],
  PB: ['Joao Pessoa', 'Campina Grande', 'Santa Rita'],
  PR: ['Curitiba', 'Londrina', 'Maringa', 'Ponta Grossa'],
  PE: ['Recife', 'Jaboatao dos Guararapes', 'Olinda', 'Caruaru'],
  PI: ['Teresina', 'Parnaiba'],
  RJ: ['Rio de Janeiro', 'Sao Goncalo', 'Duque de Caxias', 'Niteroi'],
  RN: ['Natal', 'Mossoro', 'Parnamirim'],
  RS: ['Porto Alegre', 'Caxias do Sul', 'Pelotas', 'Canoas'],
  RO: ['Porto Velho', 'Ji-Parana'],
  RR: ['Boa Vista'],
  SC: ['Florianopolis', 'Joinville', 'Blumenau', 'Sao Jose'],
  SP: ['Sao Paulo', 'Guarulhos', 'Campinas', 'Sao Bernardo do Campo', 'Sorocaba', 'Ribeirao Preto'],
  SE: ['Aracaju', 'Nossa Senhora do Socorro'],
  TO: ['Palmas', 'Araguaina'],
};

function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

const wizardSteps = ['Empresa', 'Localizacao'];

export default function EstrategosClients() {
  const { workspacesByEnv, refreshWorkspaces } = useWorkspace();
  const wsList = workspacesByEnv('estrategos');
  const [projects, setProjects] = useState<EstrategosProject[]>([]);
  const [loading, setLoading] = useState(true);

  // Wizard state
  const [wizardOpen, setWizardOpen] = useState(false);
  const [step, setStep] = useState(0);
  const [creating, setCreating] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    segment: '',
    city: '',
    state: '',
  });

  // Edit state
  const [editOpen, setEditOpen] = useState(false);
  const [editingWs, setEditingWs] = useState<{ id: string; name: string; segment: string; city: string; state: string } | null>(null);
  const [editForm, setEditForm] = useState({ name: '', segment: '', city: '', state: '' });
  const [saving, setSaving] = useState(false);

  // Delete state
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase.from('estrategos_projects').select('*');
      setProjects((data as unknown as EstrategosProject[]) ?? []);
      setLoading(false);
    };
    load();
    const channel = supabase
      .channel('estrategos-clients')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'estrategos_projects' }, load)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  const handleCreateClient = async () => {
    if (!formData.name.trim() || creating) return;
    setCreating(true);
    try {
      // Org resolvida dinamicamente pelo ambiente — sem UUID hardcoded
      const { data: estOrg, error: orgErr } = await supabase
        .from('organizations')
        .select('id')
        .eq('environment', 'estrategos')
        .maybeSingle();
      if (orgErr) {
        console.error('[EstrategosClients] org SELECT error:', orgErr);
        throw new Error(`Erro ao buscar organização: ${orgErr.message}`);
      }
      if (!estOrg) throw new Error('Organização Estrategos não encontrada');

      const slugBase = slugify(formData.name) || `estrategos-${Date.now()}`;
      const { data: ws, error: wsError } = await supabase
        .from('workspaces')
        .insert({
          organization_id: estOrg.id,
          name: formData.name.trim(),
          slug: `${slugBase}-${Math.random().toString(36).slice(2, 6)}`,
          segment: formData.segment || null,
          city: formData.city || null,
          state: formData.state || null,
        })
        .select('*')
        .single();

      if (wsError) {
        console.error('[EstrategosClients] workspace INSERT error:', wsError);
        throw new Error(`Erro ao criar workspace: ${wsError.message}`);
      }
      if (!ws) throw new Error('Erro ao criar workspace: sem dados retornados');

      await refreshWorkspaces();
      toast.success(`Cliente "${ws.name}" criado com sucesso!`);
      setWizardOpen(false);
      setStep(0);
      setFormData({ name: '', segment: '', city: '', state: '' });
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : 'Erro ao criar cliente');
    } finally {
      setCreating(false);
    }
  };

  const handleEdit = (ws: { id: string; name: string; segment: string | null; city: string | null; state: string | null }) => {
    setEditingWs({ id: ws.id, name: ws.name, segment: ws.segment || '', city: ws.city || '', state: ws.state || '' });
    setEditForm({ name: ws.name, segment: ws.segment || '', city: ws.city || '', state: ws.state || '' });
    setEditOpen(true);
  };

  const handleUpdate = async () => {
    if (!editingWs || !editForm.name.trim() || saving) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from('workspaces')
        .update({
          name: editForm.name.trim(),
          segment: editForm.segment || null,
          city: editForm.city || null,
          state: editForm.state || null,
        })
        .eq('id', editingWs.id);

      if (error) throw new Error(error.message);

      await refreshWorkspaces();
      toast.success(`Cliente "${editForm.name}" atualizado!`);
      setEditOpen(false);
      setEditingWs(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao atualizar cliente');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (wsId: string, wsName: string) => {
    if (deleting) return;
    setDeleting(true);
    try {
      const { error } = await supabase
        .from('workspaces')
        .update({ is_active: false })
        .eq('id', wsId);

      if (error) throw new Error(error.message);

      await refreshWorkspaces();
      toast.success(`Cliente "${wsName}" removido.`);
      setDeleteConfirm(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao remover cliente');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Clientes</h1>
          <p className="text-sm text-gray-500 mt-0.5">Gerencie os workspaces Estrategos</p>
        </div>
        <Button onClick={() => setWizardOpen(true)}>
          <Plus className="w-4 h-4" />
          Novo cliente
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 text-primary-500 animate-spin" /></div>
      ) : wsList.length === 0 ? (
        <Card>
          <EmptyState
            icon={Building2}
            title="Nenhum cliente cadastrado"
            description="Crie seu primeiro workspace Estrategos para comecar."
            action={<Button onClick={() => setWizardOpen(true)}>+ Novo cliente</Button>}
          />
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {wsList.map(ws => {
            const wsProjects = projects.filter(p => p.workspace_id === ws.id);
            const active = wsProjects.filter(p => p.status === 'active').length;
            return (
              <Card key={ws.id} className="relative group">
                <div className="flex items-start gap-3">
                  <Avatar name={ws.name} size="lg" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-gray-900 truncate">{ws.name}</h3>
                      <Badge variant="success" size="sm">Ativo</Badge>
                    </div>
                    <p className="text-xs text-gray-500">{ws.segment ?? 'Gestao'}{ws.city ? ` \u00B7 ${ws.city}` : ''}</p>
                    <p className="text-xs text-gray-400 flex items-center gap-1 mt-1">
                      <MapPin className="w-3 h-3" />
                      {ws.city || 'Sem cidade'}, {ws.state || '--'}
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2 text-center mt-3">
                  <div className="bg-gray-50 rounded-lg py-2">
                    <Briefcase className="w-4 h-4 text-gray-400 mx-auto mb-0.5" />
                    <p className="text-sm font-semibold text-gray-900">{wsProjects.length}</p>
                    <p className="text-[10px] text-gray-400">Projetos</p>
                  </div>
                  <div className="bg-gray-50 rounded-lg py-2">
                    <Rocket className="w-4 h-4 text-gray-400 mx-auto mb-0.5" />
                    <p className="text-sm font-semibold text-gray-900">{active}</p>
                    <p className="text-[10px] text-gray-400">Ativos</p>
                  </div>
                  <div className="bg-gray-50 rounded-lg py-2">
                    <Building2 className="w-4 h-4 text-gray-400 mx-auto mb-0.5" />
                    <p className="text-sm font-semibold text-gray-900">{formatDate(ws.created_at).slice(-4)}</p>
                    <p className="text-[10px] text-gray-400">Desde</p>
                  </div>
                </div>

                {/* Action buttons */}
                <div className="absolute top-2 right-2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={() => handleEdit(ws)}
                    className="p-1.5 rounded-lg bg-white/90 border border-gray-200 text-gray-500 hover:text-primary-600 hover:border-primary-200 hover:bg-primary-50 transition-colors"
                    title="Editar"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => setDeleteConfirm(ws.id)}
                    className="p-1.5 rounded-lg bg-white/90 border border-gray-200 text-gray-500 hover:text-red-600 hover:border-red-200 hover:bg-red-50 transition-colors"
                    title="Excluir"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Onboarding Wizard */}
      <Modal isOpen={wizardOpen} onClose={() => setWizardOpen(false)} title="Novo Cliente Estrategos" size="md">
        {/* Steps indicator */}
        <div className="flex items-center gap-1 mb-6">
          {wizardSteps.map((s, i) => (
            <div key={i} className="flex items-center flex-1 last:flex-none">
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-medium ${
                i <= step ? 'bg-primary-500 text-white' : 'bg-gray-100 text-gray-400'
              }`}>
                {i + 1}
              </div>
              {i < wizardSteps.length - 1 && (
                <div className={`h-0.5 flex-1 mx-1 ${i < step ? 'bg-primary-500' : 'bg-gray-100'}`} />
              )}
            </div>
          ))}
        </div>

        <p className="text-sm font-medium text-gray-900 mb-4">{wizardSteps[step]}</p>

        {step === 0 && (
          <div className="space-y-4">
            <Input
              label="Nome da empresa"
              value={formData.name}
              onChange={(e) => setFormData(p => ({ ...p, name: e.target.value }))}
              placeholder="Ex: Demo Estrategos"
            />
            <Select
              label="Segmento"
              value={formData.segment}
              onChange={(e) => setFormData(p => ({ ...p, segment: e.target.value }))}
              placeholder="Selecione"
              options={SEGMENTS.map(s => ({ value: s, label: s }))}
            />
          </div>
        )}

        {step === 1 && (
          <div className="space-y-4">
            <Select
              label="Estado"
              value={formData.state}
              onChange={(e) => setFormData(p => ({ ...p, state: e.target.value, city: '' }))}
              placeholder="Selecione o estado"
              options={BR_STATES.map(s => ({ value: s.value, label: `${s.label} (${s.value})` }))}
            />

            {formData.state && (
              <Select
                label="Cidade"
                value={formData.city}
                onChange={(e) => setFormData(p => ({ ...p, city: e.target.value }))}
                placeholder="Selecione a cidade"
                options={[
                  ...(CITIES_BY_STATE[formData.state] ?? []).map(c => ({ value: c, label: c })),
                  { value: '__outro__', label: 'Outra cidade...' },
                ]}
              />
            )}

            {formData.state && formData.city && formData.city === '__outro__' && (
              <Input
                value={formData.city}
                onChange={(e) => setFormData(p => ({ ...p, city: e.target.value }))}
                placeholder="Digite o nome da cidade"
              />
            )}
          </div>
        )}

        {/* Wizard navigation */}
        <div className="flex justify-between mt-8 pt-4 border-t border-gray-100">
          <Button variant="ghost" disabled={step === 0} onClick={() => setStep(s => s - 1)}>
            Voltar
          </Button>
          {step < wizardSteps.length - 1 ? (
            <Button onClick={() => setStep(s => s + 1)} disabled={step === 0 && !formData.name.trim()}>
              Continuar
            </Button>
          ) : (
            <Button onClick={handleCreateClient} loading={creating}>
              Criar cliente
            </Button>
          )}
        </div>
      </Modal>

      {/* Edit Client Modal */}
      <Modal isOpen={editOpen} onClose={() => setEditOpen(false)} title="Editar Cliente" size="md">
        <div className="space-y-4">
          <Input
            label="Nome da empresa"
            value={editForm.name}
            onChange={(e) => setEditForm(p => ({ ...p, name: e.target.value }))}
            placeholder="Ex: Demo Estrategos"
          />
          <Select
            label="Segmento"
            value={editForm.segment}
            onChange={(e) => setEditForm(p => ({ ...p, segment: e.target.value }))}
            placeholder="Selecione"
            options={SEGMENTS.map(s => ({ value: s, label: s }))}
          />
          <Select
            label="Estado"
            value={editForm.state}
            onChange={(e) => setEditForm(p => ({ ...p, state: e.target.value, city: '' }))}
            placeholder="Selecione o estado"
            options={BR_STATES.map(s => ({ value: s.value, label: `${s.label} (${s.value})` }))}
          />
          {editForm.state && (
            <Select
              label="Cidade"
              value={editForm.city}
              onChange={(e) => setEditForm(p => ({ ...p, city: e.target.value }))}
              placeholder="Selecione a cidade"
              options={[
                ...(CITIES_BY_STATE[editForm.state] ?? []).map(c => ({ value: c, label: c })),
                { value: '__outro__', label: 'Outra cidade...' },
              ]}
            />
          )}
          {editForm.state && editForm.city && CITIES_BY_STATE[editForm.state]?.includes(editForm.city) === false && (
            <Input
              label="Cidade"
              value={editForm.city}
              onChange={(e) => setEditForm(p => ({ ...p, city: e.target.value }))}
              placeholder="Digite o nome da cidade"
            />
          )}
        </div>
        <div className="flex justify-end gap-2 mt-6 pt-4 border-t border-gray-100">
          <Button variant="ghost" onClick={() => setEditOpen(false)}>Cancelar</Button>
          <Button onClick={handleUpdate} loading={saving} disabled={!editForm.name.trim()}>
            Salvar
          </Button>
        </div>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal isOpen={!!deleteConfirm} onClose={() => setDeleteConfirm(null)} title="Excluir Cliente" size="sm">
        <p className="text-sm text-gray-600">
          Tem certeza que deseja excluir <strong>{wsList.find(w => w.id === deleteConfirm)?.name}</strong>?
        </p>
        <p className="text-xs text-gray-400 mt-2">
          Esta acao ira desativar o cliente. Os dados nao serao apagados permanentemente.
        </p>
        <div className="flex justify-end gap-2 mt-6 pt-4 border-t border-gray-100">
          <Button variant="ghost" onClick={() => setDeleteConfirm(null)}>Cancelar</Button>
          <Button
            variant="danger"
            onClick={() => {
              const ws = wsList.find(w => w.id === deleteConfirm);
              if (ws) handleDelete(ws.id, ws.name);
            }}
            loading={deleting}
          >
            Excluir
          </Button>
        </div>
      </Modal>
    </div>
  );
}
