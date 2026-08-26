import { useState, useMemo, useEffect } from 'react';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import Card from '@/components/ui/Card';
import Modal from '@/components/ui/Modal';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';
import Button from '@/components/ui/Button';
import EmptyState from '@/components/ui/EmptyState';
import Avatar from '@/components/ui/Avatar';
import { SEGMENTS } from '@/lib/constants';
import { BR_STATES, detectDatesForClient, manualCityBirthday, type StrategicDateDraft } from '@/data/brDates';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import { Plus, Building2, MapPin, ChevronRight, CalendarDays, CheckSquare, Square, Info, Pencil, Trash2 } from 'lucide-react';
import FormatFrequencyStepper, { normalizeFormatFrequency, formatFrequencyTotal, defaultFormatFrequency } from '@/components/editorial/FormatFrequencyStepper';
import type { FormatFrequency } from '@/types';

const wizardSteps = ['Empresa', 'Localização', 'Linha Editorial', 'Frequência', 'Datas', 'Google Calendar'];

// Cidades principais por estado (para o dropdown)
const CITIES_BY_STATE: Record<string, string[]> = {
  AC: ['Rio Branco', 'Cruzeiro do Sul', 'Sena Madureira'],
  AL: ['Maceió', 'Arapiraca', 'Penedo', 'Palmeira dos Índios'],
  AP: ['Macapá', 'Santana', 'Laranjal do Jari'],
  AM: ['Manaus', 'Parintins', 'Itacoatiara', 'Manacapuru'],
  BA: ['Salvador', 'Feira de Santana', 'Vitória da Conquista', 'Camaçari', 'Ilhéus', 'Itabuna'],
  CE: ['Fortaleza', 'Caucaia', 'Juazeiro do Norte', 'Maracanaú', 'Sobral'],
  DF: ['Brasília', 'Taguatinga', 'Ceilândia', 'Samambaia', 'Águas Claras'],
  ES: ['Vitória', 'Vila Velha', 'Serra', 'Cariacica', 'Linhares'],
  GO: ['Goiânia', 'Aparecida de Goiânia', 'Anápolis', 'Rio Verde', 'Luziânia'],
  MA: ['São Luís', 'Imperatriz', 'São José de Ribamar', 'Timon', 'Caxias'],
  MT: ['Cuiabá', 'Várzea Grande', 'Rondonópolis', 'Sinop', 'Tangará da Serra'],
  MS: ['Campo Grande', 'Dourados', 'Três Lagoas', 'Corumbá', 'Ponta Porã'],
  MG: ['Belo Horizonte', 'Uberlândia', 'Contagem', 'Juiz de Fora', 'Betim', 'Montes Claros', 'Uberaba'],
  PA: ['Belém', 'Ananindeua', 'Santarém', 'Marabá', 'Castanhal'],
  PB: ['João Pessoa', 'Campina Grande', 'Santa Rita', 'Patos', 'Bayeux'],
  PR: ['Curitiba', 'Londrina', 'Maringá', 'Ponta Grossa', 'Cascavel', 'São José dos Pinhais'],
  PE: ['Recife', 'Jaboatão dos Guararapes', 'Olinda', 'Caruaru', 'Petrolina'],
  PI: ['Teresina', 'Parnaíba', 'Picos', 'Floriano'],
  RJ: ['Rio de Janeiro', 'São Gonçalho', 'Duque de Caxias', 'Niterói', 'Nova Iguaçu', 'Campos dos Goytacazes'],
  RN: ['Natal', 'Mossoró', 'Parnamirim', 'São Gonçalo do Amarante'],
  RS: ['Porto Alegre', 'Caxias do Sul', 'Pelotas', 'Canoas', 'Santa Maria', 'Gravataí'],
  RO: ['Porto Velho', 'Ji-Paraná', 'Ariquemes', 'Vilhena'],
  RR: ['Boa Vista', 'Rorainópolis', 'Caracaraí'],
  SC: ['Florianópolis', 'Joinville', 'Blumenau', 'São José', 'Chapecó', 'Itajaí'],
  SP: ['São Paulo', 'Guarulhos', 'Campinas', 'São Bernardo do Campo', 'Santo André', 'Sorocaba', 'Ribeirão Preto', 'Santos'],
  SE: ['Aracaju', 'Nossa Senhora do Socorro', 'Lagarto', 'Itabaiana'],
  TO: ['Palmas', 'Araguaína', 'Gurupi', 'Porto Nacional'],
};

const DEFAULT_PILLARS_DEF = [
  { name: 'Marca & Essência', description: 'Conteúdo sobre a marca, valores e cultura', color: '#0066FF', percentage: 20 },
  { name: 'Autoridade & Educação', description: 'Conteúdo educativo e de autoridade', color: '#7C3AED', percentage: 25 },
  { name: 'Produto & Solução', description: 'Apresentação de produtos e serviços', color: '#059669', percentage: 20 },
  { name: 'Prova & Confiança', description: 'Depoimentos, cases e prova social', color: '#D97706', percentage: 15 },
  { name: 'Relacionamento & Comunidade', description: 'Engajamento e comunidade', color: '#EC4899', percentage: 10 },
  { name: 'Oferta & Conversão', description: 'Ofertas e conversão de vendas', color: '#EF4444', percentage: 10 },
];

function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

export default function SharksClients() {
  const { workspaces: allWorkspaces, workspacesByEnv, setCurrentWorkspace, refreshWorkspaces } = useWorkspace();
  const workspaces = workspacesByEnv('sharks_company');
  const [wizardOpen, setWizardOpen] = useState(false);
  const [step, setStep] = useState(0);
  const [creating, setCreating] = useState(false);

  // Edit state
  const [editOpen, setEditOpen] = useState(false);
  const [editingWs, setEditingWs] = useState<{ id: string; name: string; segment: string; city: string; state: string } | null>(null);
  const [editForm, setEditForm] = useState({ name: '', segment: '', city: '', state: '' });
  const [saving, setSaving] = useState(false);

  // Delete state
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const [formData, setFormData] = useState({
    name: '',
    segment: '',
    city: '',
    state: '',
    country: 'Brasil',
    format_frequency: defaultFormatFrequency() as FormatFrequency,
    google_calendar_id: '',
  });

  const [detectedDates, setDetectedDates] = useState<StrategicDateDraft[]>([]);
  const [selectedDates, setSelectedDates] = useState<Set<number>>(new Set());
  const [manualDateInput, setManualDateInput] = useState('');
  const [cityDetected, setCityDetected] = useState(false);

  useEffect(() => {
    if (!wizardOpen || step !== 4) return;
    const { drafts, cityDetected: cd } = detectDatesForClient({
      state: formData.state || null,
      city: formData.city || null,
      segment: formData.segment || null,
    });
    setDetectedDates(drafts);
    setCityDetected(cd);
    setSelectedDates(new Set(drafts.map((_, i) => i)));
    setManualDateInput('');
  }, [wizardOpen, step, formData.state, formData.city, formData.segment]);

  const toggleDate = (index: number) => {
    setSelectedDates(prev => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  const toggleAll = () => {
    if (selectedDates.size === detectedDates.length) setSelectedDates(new Set());
    else setSelectedDates(new Set(detectedDates.map((_, i) => i)));
  };

  const addManualDate = () => {
    const draft = manualCityBirthday(formData.city || 'Cidade', manualDateInput);
    if (!draft) { toast.error('Formato inválido (use DD/MM)'); return; }
    setDetectedDates(prev => [...prev, draft]);
    setSelectedDates(prev => new Set([...prev, prev.size]));
    setManualDateInput('');
  };

  const selectedDrafts = useMemo(() =>
    detectedDates.filter((_, i) => selectedDates.has(i)),
  [detectedDates, selectedDates]);

  const handleCreateClient = async () => {
    if (!formData.name.trim() || creating) return;
    setCreating(true);
    try {
      // 1. Create workspace (chat thread is auto-created by DB trigger)
      const slugBase = slugify(formData.name) || `cliente-${Date.now()}`;
      const { data: ws, error: wsError } = await supabase
        .from('workspaces')
        .insert({
          organization_id: '00000000-0000-0000-0000-000000000001',
          name: formData.name.trim(),
          slug: `${slugBase}-${Math.random().toString(36).slice(2, 6)}`,
          segment: formData.segment || null,
          city: formData.city || null,
          state: formData.state || null,
          country: formData.country,
        })
        .select('*')
        .single();

      if (wsError || !ws) throw new Error(wsError?.message || 'Erro ao criar workspace');

      // 2. Default pillars
      const pillarRows = DEFAULT_PILLARS_DEF.map((p, i) => ({
        workspace_id: ws.id,
        name: p.name,
        description: p.description,
        color: p.color,
        percentage: p.percentage,
        sort_order: i + 1,
      }));
      const { data: pillarsInserted, error: pillarsError } = await supabase
        .from('editorial_pillars')
        .insert(pillarRows)
        .select('*');

      if (pillarsError) throw new Error(pillarsError.message);

      // 3. Editorial profile
      const ff = normalizeFormatFrequency(formData.format_frequency);
      const frequency = formatFrequencyTotal(ff);
      const distribution: Record<string, number> = {};
      pillarsInserted?.forEach(p => {
        distribution[p.id] = p.percentage;
      });
      await supabase.from('editorial_profiles').insert({
        workspace_id: ws.id,
        frequency_per_week: frequency,
        format_frequency: ff,
        allowed_days: [1, 2, 3, 4, 5],
        preferred_times: ['09:00', '14:00', '18:00'],
        priority_formats: (ff.feed ?? 0) > 0
          ? ['static_post', 'carousel', 'photo', 'video', 'story', 'reels']
          : ['story', 'reels'],
        distribution,
        priority_objectives: ['educational', 'engagement'],
        priority_products: [],
        max_weekly: frequency + 2,
      });

      // 4. Optional Google Calendar integration placeholder
      if (formData.google_calendar_id.trim()) {
        await supabase.from('calendar_integrations').insert({
          workspace_id: ws.id,
          google_calendar_id: formData.google_calendar_id.trim(),
          is_connected: false,
        });
      }

      // 5. Strategic dates (from step 4 detection)
      if (selectedDrafts.length > 0) {
        await supabase.from('strategic_dates').insert(
          selectedDrafts.map(d => ({
            workspace_id: ws.id,
            title: d.title,
            date: d.date,
            locality: d.locality,
            category: d.category,
            relevance: d.relevance,
            description: d.description,
            is_recurring: d.is_recurring,
          }))
        );
      }

      await refreshWorkspaces();
      toast.success(`Cliente "${ws.name}" criado com sucesso!`);
      setWizardOpen(false);
      setStep(0);
      setFormData({ name: '', segment: '', city: '', state: '', country: 'Brasil', format_frequency: defaultFormatFrequency(), google_calendar_id: '' });
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
          <p className="text-sm text-gray-500 mt-0.5">Gerencie os workspaces de cada cliente</p>
        </div>
        <Button onClick={() => setWizardOpen(true)}>
          <Plus className="w-4 h-4" />
          Novo cliente
        </Button>
      </div>

      {workspaces.length === 0 ? (
        <Card>
          <EmptyState
            icon={Building2}
            title="Nenhum cliente cadastrado"
            description="Crie seu primeiro workspace para começar a planejar."
            action={<Button onClick={() => setWizardOpen(true)}>+ Novo cliente</Button>}
          />
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {workspaces.map(ws => (
            <Card key={ws.id} className="relative group">
              <div
                className="flex items-start gap-3 cursor-pointer"
                onClick={() => { setCurrentWorkspace(ws); window.location.hash = '#/sharks/calendar'; }}
              >
                <Avatar name={ws.name} size="lg" />
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-gray-900 truncate">{ws.name}</h3>
                  <p className="text-xs text-gray-500">{ws.segment}</p>
                  <p className="text-xs text-gray-400 flex items-center gap-1 mt-1">
                    <MapPin className="w-3 h-3" />
                    {ws.city}, {ws.state}
                  </p>
                </div>
                <ChevronRight className="w-4 h-4 text-gray-300" />
              </div>
              {/* Action buttons */}
              <div className="absolute top-2 right-2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={(e) => { e.stopPropagation(); handleEdit(ws); }}
                  className="p-1.5 rounded-lg bg-white/90 border border-gray-200 text-gray-500 hover:text-primary-600 hover:border-primary-200 hover:bg-primary-50 transition-colors"
                  title="Editar"
                >
                  <Pencil className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); setDeleteConfirm(ws.id); }}
                  className="p-1.5 rounded-lg bg-white/90 border border-gray-200 text-gray-500 hover:text-red-600 hover:border-red-200 hover:bg-red-50 transition-colors"
                  title="Excluir"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Onboarding Wizard */}
      <Modal isOpen={wizardOpen} onClose={() => setWizardOpen(false)} title="Novo Cliente" size="xl">
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
            <Input label="Nome da empresa" value={formData.name} onChange={(e) => setFormData(p => ({ ...p, name: e.target.value }))} placeholder="Ex: PB & RN Foods" />
            <Select label="Segmento" value={formData.segment} onChange={(e) => setFormData(p => ({ ...p, segment: e.target.value }))} placeholder="Selecione" options={SEGMENTS.map(s => ({ value: s, label: s }))} />
          </div>
        )}

        {step === 1 && (
          <div className="space-y-4">
            <Select
              label="País"
              value={formData.country}
              onChange={(e) => setFormData(p => ({ ...p, country: e.target.value }))}
              options={[{ value: 'Brasil', label: 'Brasil' }]}
            />

            <Select
              label="Estado"
              value={formData.state}
              onChange={(e) => setFormData(p => ({ ...p, state: e.target.value, city: '' }))}
              placeholder="Selecione o estado"
              options={BR_STATES.map(s => ({ value: s.value, label: `${s.label} (${s.value})` }))}
            />

            {formData.state && (
              <div className="space-y-1.5">
                <Select
                  label="Cidade"
                  value={CITIES_BY_STATE[formData.state]?.includes(formData.city) ? formData.city : '__outro__'}
                  onChange={(e) => {
                    if (e.target.value === '__outro__') {
                      setFormData(p => ({ ...p, city: '' }));
                    } else {
                      setFormData(p => ({ ...p, city: e.target.value }));
                    }
                  }}
                  placeholder="Selecione a cidade"
                  options={[
                    ...(CITIES_BY_STATE[formData.state] ?? []).map(c => ({ value: c, label: c })),
                    { value: '__outro__', label: 'Outra cidade...' },
                  ]}
                />

                {!CITIES_BY_STATE[formData.state]?.includes(formData.city) && (
                  <Input
                    value={formData.city}
                    onChange={(e) => setFormData(p => ({ ...p, city: e.target.value }))}
                    placeholder="Digite o nome da cidade"
                  />
                )}
              </div>
            )}

            {formData.state && formData.city && (
              <div className="flex items-start gap-2 bg-blue-50 border border-blue-100 rounded-lg p-3">
                <Info className="w-4 h-4 text-blue-500 mt-0.5 shrink-0" />
                <p className="text-xs text-blue-700 leading-relaxed">
                  Datas comemorativas de <strong>{formData.city}</strong> serão detectadas automaticamente
                  na etapa de Datas Estratégicas.
                </p>
              </div>
            )}
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <p className="text-sm text-gray-500">Os pilares padrão serão criados automaticamente:</p>
            <ul className="text-sm space-y-1.5">
              {['Marca & Essência', 'Autoridade & Educação', 'Produto & Solução', 'Prova & Confiança', 'Relacionamento & Comunidade', 'Oferta & Conversão'].map(p => (
                <li key={p} className="flex items-center gap-2 text-gray-700">
                  <span className="w-1.5 h-1.5 bg-primary-500 rounded-full" /> {p}
                </li>
              ))}
            </ul>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-4">
            <FormatFrequencyStepper
              value={formData.format_frequency}
              onChange={(ff) => setFormData(p => ({ ...p, format_frequency: ff }))}
            />
            <p className="text-sm text-gray-500">Dias permitidos: Segunda a Sexta (padrão)</p>
          </div>
        )}

        {step === 4 && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-gray-600">
                {detectedDates.length} datas detectadas para <strong>{formData.segment || 'todos os segmentos'}</strong>
                {formData.state ? ` em ${formData.state}` : ''}
                {formData.city ? `, ${formData.city}` : ''}
              </p>
              <button
                type="button"
                className="text-xs text-primary-600 hover:text-primary-700 font-medium"
                onClick={toggleAll}
              >
                {selectedDates.size === detectedDates.length ? 'Desmarcar todas' : 'Marcar todas'}
              </button>
            </div>

            {detectedDates.length === 0 && (
              <p className="text-sm text-gray-400 text-center py-4">
                Nenhuma data detectada. Adicione manualmente abaixo ou configure depois em Linha Editorial.
              </p>
            )}

            <div className="max-h-72 overflow-y-auto space-y-1 pr-1">
              {detectedDates.map((d, i) => (
                <button
                  key={`${d.title}-${d.date}-${i}`}
                  type="button"
                  className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left text-sm transition-colors ${
                    selectedDates.has(i) ? 'bg-primary-50 hover:bg-primary-100' : 'bg-gray-50 hover:bg-gray-100 opacity-60'
                  }`}
                  onClick={() => toggleDate(i)}
                >
                  {selectedDates.has(i)
                    ? <CheckSquare className="w-4 h-4 text-primary-600 shrink-0" />
                    : <Square className="w-4 h-4 text-gray-300 shrink-0" />}
                  <span className="flex-1 min-w-0 truncate">{d.title}</span>
                  <span className="text-xs text-gray-500 shrink-0">{d.date.slice(5)}</span>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full shrink-0 ${
                    d.relevance === 'high' ? 'bg-red-100 text-red-700' :
                    d.relevance === 'medium' ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-500'
                  }`}>
                    {d.relevance === 'high' ? 'alta' : d.relevance === 'medium' ? 'média' : 'baixa'}
                  </span>
                </button>
              ))}
            </div>

            {formData.city && !cityDetected && (
              <div className="border-t border-gray-100 pt-3">
                <p className="text-xs text-gray-500 mb-2">
                  Aniversário de <strong>{formData.city}</strong> não encontrado na base. Informe DD/MM:
                </p>
                <div className="flex gap-2">
                  <Input
                    value={manualDateInput}
                    onChange={(e) => setManualDateInput(e.target.value)}
                    placeholder="DD/MM"
                    maxLength={5}
                  />
                  <Button variant="outline" size="sm" onClick={addManualDate}>Adicionar</Button>
                </div>
              </div>
            )}

            <p className="text-xs text-gray-400">
              {selectedDrafts.length} data{selectedDrafts.length !== 1 ? 's' : ''} serão salvas com o cliente.
            </p>
          </div>
        )}

        {step === 5 && (
          <div className="space-y-4">
            <Input label="Google Calendar ID (opcional)" value={formData.google_calendar_id} onChange={(e) => setFormData(p => ({ ...p, google_calendar_id: e.target.value }))} placeholder="Ex: abc123@group.calendar.google.com" />
            <p className="text-xs text-gray-400">Pode ser configurado depois em Integrações.</p>
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
            placeholder="Ex: PB & RN Foods"
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
          Tem certeza que deseja excluir <strong>{workspaces.find(w => w.id === deleteConfirm)?.name}</strong>?
        </p>
        <p className="text-xs text-gray-400 mt-2">
          Esta ação irá desativar o cliente. Os dados não serão apagados permanentemente.
        </p>
        <div className="flex justify-end gap-2 mt-6 pt-4 border-t border-gray-100">
          <Button variant="ghost" onClick={() => setDeleteConfirm(null)}>Cancelar</Button>
          <Button
            variant="danger"
            onClick={() => {
              const ws = workspaces.find(w => w.id === deleteConfirm);
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
