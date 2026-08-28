import { useState, useEffect, useMemo } from 'react';
import Modal from '@/components/ui/Modal';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';
import Button from '@/components/ui/Button';
import LogoUploader from '@/components/ui/LogoUploader';
import FormatFrequencyStepper, { defaultFormatFrequency } from '@/components/editorial/FormatFrequencyStepper';
import { SEGMENTS } from '@/lib/constants';
import { BR_STATES, detectDatesForClient, manualCityBirthday, type StrategicDateDraft } from '@/data/brDates';
import { createFullClient } from '@/lib/clientFactory';
import { ENVIRONMENT_META, type EnvironmentType, type FormatFrequency, type Workspace } from '@/types';
import { toast } from 'sonner';
import { Info, CheckSquare, Square, Building2 } from 'lucide-react';

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
  RJ: ['Rio de Janeiro', 'São Gonçalo', 'Duque de Caxias', 'Niterói', 'Nova Iguaçu', 'Campos dos Goytacazes'],
  RN: ['Natal', 'Mossoró', 'Parnamirim', 'São Gonçalo do Amarante'],
  RS: ['Porto Alegre', 'Caxias do Sul', 'Pelotas', 'Canoas', 'Santa Maria', 'Gravataí'],
  RO: ['Porto Velho', 'Ji-Paraná', 'Ariquemes', 'Vilhena'],
  RR: ['Boa Vista', 'Rorainópolis', 'Caracaraí'],
  SC: ['Florianópolis', 'Joinville', 'Blumenau', 'São José', 'Chapecó', 'Itajaí'],
  SP: ['São Paulo', 'Guarulhos', 'Campinas', 'São Bernardo do Campo', 'Santo André', 'Sorocaba', 'Ribeirão Preto', 'Santos'],
  SE: ['Aracaju', 'Nossa Senhora do Socorro', 'Lagarto', 'Itabaiana'],
  TO: ['Palmas', 'Araguaína', 'Gurupi', 'Porto Nacional'],
};

const baseSteps = ['Empresa', 'Localização', 'Linha Editorial', 'Frequência', 'Datas', 'Google Calendar'];

interface ClientWizardProps {
  open: boolean;
  onClose: () => void;
  /** null = seletor de ambiente no primeiro passo (Oracullo). */
  environment: EnvironmentType | null;
  onCreated?: (ws: Workspace) => void;
}

export default function ClientWizard({ open, onClose, environment, onCreated }: ClientWizardProps) {
  const steps = environment ? baseSteps : ['Ambiente', ...baseSteps];
  /** Índice do passo que exige nome (Empresa) — desloca quando há seletor de ambiente. */
  const nameStepIndex = environment ? 0 : 1;
  const datesStepIndex = environment ? 4 : 5;

  const [env, setEnv] = useState<EnvironmentType>(environment ?? 'sharks_company');
  const [step, setStep] = useState(0);
  const [creating, setCreating] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    segment: '',
    city: '',
    state: '',
    country: 'Brasil',
    format_frequency: defaultFormatFrequency() as FormatFrequency,
    google_calendar_id: '',
    logo_url: null as string | null,
  });
  const [detectedDates, setDetectedDates] = useState<StrategicDateDraft[]>([]);
  const [selectedDates, setSelectedDates] = useState<Set<number>>(new Set());
  const [manualDateInput, setManualDateInput] = useState('');
  const [cityDetected, setCityDetected] = useState(false);

  const reset = () => {
    setEnv(environment ?? 'sharks_company');
    setStep(0);
    setFormData({
      name: '',
      segment: '',
      city: '',
      state: '',
      country: 'Brasil',
      format_frequency: defaultFormatFrequency(),
      google_calendar_id: '',
      logo_url: null,
    });
    setDetectedDates([]);
    setSelectedDates(new Set());
    setManualDateInput('');
    setCityDetected(false);
  };

  // Ao fechar, devolve o wizard ao estado inicial
  useEffect(() => {
    if (!open) reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Detecção: só roda ao entrar no passo de Datas
  useEffect(() => {
    if (!open || step !== datesStepIndex) return;
    const { drafts, cityDetected: cd } = detectDatesForClient({
      state: formData.state || null,
      city: formData.city || null,
      segment: formData.segment || null,
    });
    setDetectedDates(drafts);
    setCityDetected(cd);
    setSelectedDates(new Set(drafts.map((_, i) => i)));
    setManualDateInput('');
  }, [open, step, datesStepIndex, formData.state, formData.city, formData.segment]);

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
    if (!draft) {
      toast.error('Formato inválido (use DD/MM)');
      return;
    }
    setDetectedDates(prev => [...prev, draft]);
    setSelectedDates(prev => new Set([...prev, prev.size]));
    setManualDateInput('');
  };

  const selectedDrafts = useMemo(
    () => detectedDates.filter((_, i) => selectedDates.has(i)),
    [detectedDates, selectedDates]
  );

  const handleCreate = async () => {
    if (!formData.name.trim() || creating) return;
    setCreating(true);
    try {
      const ws = await createFullClient({
        environment: env,
        name: formData.name,
        segment: formData.segment,
        city: formData.city,
        state: formData.state,
        country: formData.country,
        logo_url: formData.logo_url,
        format_frequency: formData.format_frequency,
        google_calendar_id: formData.google_calendar_id,
        selectedDates: selectedDrafts,
      });
      toast.success(`Cliente "${ws.name}" criado com sucesso!`);
      onCreated?.(ws);
      onClose();
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : 'Erro ao criar cliente');
    } finally {
      setCreating(false);
    }
  };

  const envs = Object.keys(ENVIRONMENT_META) as EnvironmentType[];

  return (
    <Modal
      isOpen={open}
      onClose={onClose}
      title={environment ? `Novo Cliente ${ENVIRONMENT_META[environment].label}` : 'Novo Cliente'}
      size="xl"
    >
      {/* Steps indicator */}
      <div className="flex items-center gap-1 mb-6">
        {steps.map((s, i) => (
          <div key={i} className="flex items-center flex-1 last:flex-none">
            <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-medium ${
              i <= step ? 'bg-primary-500 text-white' : 'bg-gray-100 text-gray-400'
            }`}>
              {i + 1}
            </div>
            {i < steps.length - 1 && (
              <div className={`h-0.5 flex-1 mx-1 ${i < step ? 'bg-primary-500' : 'bg-gray-100'}`} />
            )}
          </div>
        ))}
      </div>

      <p className="text-sm font-medium text-gray-900 mb-4">{steps[step]}</p>

      {/* Passo 0 (multi-ambiente): seleção de ambiente */}
      {!environment && step === 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {envs.map(e => {
            const meta = ENVIRONMENT_META[e];
            const selected = env === e;
            return (
              <button
                key={e}
                type="button"
                onClick={() => setEnv(e)}
                className={`flex items-center gap-3 p-4 rounded-xl border-2 text-left transition-colors ${
                  selected ? 'border-primary-500 bg-primary-50' : 'border-gray-200 bg-white hover:border-gray-300'
                }`}
              >
                <span className="w-10 h-10 rounded-lg bg-gray-50 flex items-center justify-center shrink-0">
                  <Building2 className={`w-5 h-5 ${selected ? 'text-primary-600' : 'text-gray-400'}`} />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-gray-900">{meta.label}</span>
                  <span className="block text-xs text-gray-500">{meta.emoji} {meta.short}</span>
                </span>
              </button>
            );
          })}
        </div>
      )}

      {/* Passo Empresa */}
      {((environment && step === 0) || (!environment && step === 1)) && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center gap-4">
            <div className="flex-1 space-y-4">
              <Input
                label="Nome da empresa"
                value={formData.name}
                onChange={(e) => setFormData(p => ({ ...p, name: e.target.value }))}
                placeholder="Ex: PB & RN Foods"
              />
              <Select
                label="Segmento"
                value={formData.segment}
                onChange={(e) => setFormData(p => ({ ...p, segment: e.target.value }))}
                placeholder="Selecione"
                options={SEGMENTS.map(s => ({ value: s, label: s }))}
              />
            </div>
            <div className="sm:w-56 shrink-0">
              <p className="text-sm font-medium text-gray-700 mb-1.5">Logomarca</p>
              <LogoUploader
                name={formData.name || 'Cliente'}
                logoUrl={formData.logo_url}
                onChange={(url) => setFormData(p => ({ ...p, logo_url: url }))}
              />
            </div>
          </div>
        </div>
      )}

      {/* Passo Localização */}
      {((environment && step === 1) || (!environment && step === 2)) && (
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
                  label="Digite a cidade"
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

      {/* Passo Linha Editorial */}
      {((environment && step === 2) || (!environment && step === 3)) && (
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

      {/* Passo Frequência */}
      {((environment && step === 3) || (!environment && step === 4)) && (
        <div className="space-y-4">
          <FormatFrequencyStepper
            value={formData.format_frequency}
            onChange={(ff) => setFormData(p => ({ ...p, format_frequency: ff }))}
          />
          <p className="text-sm text-gray-500">Dias permitidos: Segunda a Sexta (padrão)</p>
        </div>
      )}

      {/* Passo Datas Estratégicas */}
      {((environment && step === 4) || (!environment && step === 5)) && (
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

      {/* Passo Google Calendar */}
      {((environment && step === 5) || (!environment && step === 6)) && (
        <div className="space-y-4">
          <Input
            label="Google Calendar ID (opcional)"
            value={formData.google_calendar_id}
            onChange={(e) => setFormData(p => ({ ...p, google_calendar_id: e.target.value }))}
            placeholder="Ex: abc123@group.calendar.google.com"
          />
          <p className="text-xs text-gray-400">Pode ser configurado depois em Integrações.</p>
        </div>
      )}

      {/* Wizard navigation */}
      <div className="flex justify-between mt-8 pt-4 border-t border-gray-100">
        <Button variant="ghost" disabled={step === 0} onClick={() => setStep(s => s - 1)}>
          Voltar
        </Button>
        {step < steps.length - 1 ? (
          <Button
            onClick={() => setStep(s => s + 1)}
            disabled={step === nameStepIndex && !formData.name.trim()}
          >
            Continuar
          </Button>
        ) : (
          <Button onClick={handleCreate} loading={creating} disabled={!formData.name.trim()}>
            Criar cliente
          </Button>
        )}
      </div>
    </Modal>
  );
}