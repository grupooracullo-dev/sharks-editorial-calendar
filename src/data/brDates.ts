// ==========================================
// RADAR DE DATAS ESTRATÉGICAS — BRASIL
// Base de conhecimento offline (sem dependência externa).
// Critério de curadoria: apenas datas de alta
// confiança; cidades fora da lista são
// confirmadas manualmente no cadastro.
// ==========================================

export type DateScope = 'national' | 'state' | 'city' | 'segment';

export interface StrategicDateDraft {
  title: string;
  date: string; // yyyy-MM-dd
  start_date?: string; // yyyy-MM-dd (para períodos como "Setembro Amarelo")
  end_date?: string;   // yyyy-MM-dd
  locality: 'national' | 'state' | 'city';
  category: 'holiday' | 'commercial' | 'segment' | 'custom';
  relevance: 'high' | 'medium' | 'low';
  description: string | null;
  is_recurring: boolean;
}

interface FixedDef {
  title: string;
  month: number; // 1-12
  day: number;
  scope: DateScope;
  category: StrategicDateDraft['category'];
  relevance: StrategicDateDraft['relevance'];
  description?: string;
  uf?: string;      // scope state
  city?: string;    // normalized city key (sem acentos, minúsculo)
  segments?: string[];
}

// ---------- Helpers de data (UTC puro) ----------

function fmt(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function addDays(d: Date, n: number): Date {
  return new Date(d.getTime() + n * 86400000);
}

// Domingo de Páscoa — algoritmo gregoriano anônimo
function easterSunday(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(year, month - 1, day));
}

// Enésimo dia-da-semana do mês (weekday 0=dom..6=sáb)
function nthWeekdayOfMonth(year: number, month: number, weekday: number, n: number): Date {
  const first = new Date(Date.UTC(year, month - 1, 1));
  const offset = (weekday - first.getUTCDay() + 7) % 7;
  return new Date(Date.UTC(year, month - 1, 1 + offset + (n - 1) * 7));
}

// Última sexta de novembro (4ª sexta na prática p/ BF; fixamos 4ª)
function blackFriday(year: number): Date {
  return nthWeekdayOfMonth(year, 11, 5, 4);
}

// ---------- Datas flutuantes (por ano) ----------

interface FloatingDef {
  title: string;
  category: StrategicDateDraft['category'];
  relevance: StrategicDateDraft['relevance'];
  compute: (year: number) => Date;
  description?: string;
}

const FLOATING: FloatingDef[] = [
  { title: 'Carnaval', category: 'holiday', relevance: 'high', compute: y => addDays(easterSunday(y), -47), description: 'Feriado flutuante — grande apelo comercial' },
  { title: 'Sexta-feira Santa', category: 'holiday', relevance: 'medium', compute: y => addDays(easterSunday(y), -2) },
  { title: 'Páscoa', category: 'commercial', relevance: 'high', compute: y => easterSunday(y), description: 'Data de alto consumo — chocolates e presentes' },
  { title: 'Corpus Christi', category: 'holiday', relevance: 'low', compute: y => addDays(easterSunday(y), 60) },
  { title: 'Dia das Mães', category: 'commercial', relevance: 'high', compute: y => nthWeekdayOfMonth(y, 5, 0, 2), description: '2º domingo de maio — top varejo presenteável' },
  { title: 'Dia dos Pais', category: 'commercial', relevance: 'high', compute: y => nthWeekdayOfMonth(y, 8, 0, 2), description: '2º domingo de agosto — top varejo presenteável' },
  { title: 'Black Friday', category: 'commercial', relevance: 'high', compute: y => blackFriday(y), description: '4ª sexta de novembro — maior data comercial do ano' },
  { title: 'Cyber Monday', category: 'commercial', relevance: 'medium', compute: y => addDays(blackFriday(y), 3), description: 'Segunda-feira após a Black Friday' },
];

// ---------- Nacionais fixas ----------

const NATIONAL_FIXED: FixedDef[] = [
  { title: 'Ano Novo', month: 1, day: 1, scope: 'national', category: 'holiday', relevance: 'medium', description: 'Confraternização Universal' },
  { title: 'Dia do Consumidor', month: 3, day: 15, scope: 'national', category: 'commercial', relevance: 'medium', description: 'Data mundial do consumidor — promoções' },
  { title: 'Dia Internacional da Mulher', month: 3, day: 8, scope: 'national', category: 'commercial', relevance: 'high' },
  { title: 'Tiradentes', month: 4, day: 21, scope: 'national', category: 'holiday', relevance: 'medium' },
  { title: 'Dia do Trabalho', month: 5, day: 1, scope: 'national', category: 'holiday', relevance: 'medium' },
  { title: 'Dia das Mães (fixa)', month: 5, day: 12, scope: 'national', category: 'segment', relevance: 'low', segments: ['Outro'], description: 'Referência fixa — a data oficial flutua (2º domingo)' },
  { title: 'Dia Mundial do Meio Ambiente', month: 6, day: 5, scope: 'national', category: 'commercial', relevance: 'low' },
  { title: 'Dia dos Namorados', month: 6, day: 12, scope: 'national', category: 'commercial', relevance: 'high', description: 'Data presenteável de alto impacto no Brasil' },
  { title: 'Dia Internacional da Amizade', month: 7, day: 30, scope: 'national', category: 'commercial', relevance: 'low' },
  { title: 'Dia dos Avós', month: 7, day: 26, scope: 'national', category: 'commercial', relevance: 'medium' },
  { title: 'Dia do Homem', month: 7, day: 19, scope: 'national', category: 'commercial', relevance: 'low' },
  { title: 'Dia do Estudante', month: 8, day: 11, scope: 'national', category: 'commercial', relevance: 'low' },
  { title: 'Dia do Folclore', month: 8, day: 22, scope: 'national', category: 'commercial', relevance: 'low' },
  { title: 'Dia do Cliente', month: 9, day: 15, scope: 'national', category: 'commercial', relevance: 'medium', description: 'Fidelização e ações de relacionamento' },
  { title: 'Independência do Brasil', month: 9, day: 7, scope: 'national', category: 'holiday', relevance: 'medium' },
  { title: 'Dia da Árvore', month: 9, day: 21, scope: 'national', category: 'commercial', relevance: 'low' },
  { title: 'Dia das Crianças', month: 10, day: 12, scope: 'national', category: 'commercial', relevance: 'high', description: 'Nossa Senhora Aparecida + alto varejo presenteável' },
  { title: 'Dia do Professor', month: 10, day: 15, scope: 'national', category: 'commercial', relevance: 'medium' },
  { title: 'Dia da Ciência e da Tecnologia', month: 10, day: 8, scope: 'national', category: 'segment', relevance: 'low', segments: ['Tecnologia', 'Educação'] },
  { title: 'Dia do Comércio', month: 10, day: 16, scope: 'national', category: 'segment', relevance: 'medium', segments: ['Varejo', 'Serviços'] },
  { title: 'Dia da Alimentação', month: 10, day: 16, scope: 'national', category: 'segment', relevance: 'high', segments: ['Alimentação', 'Restaurante'], description: 'Data mundial da alimentação' },
  { title: 'Dia do Funcionário Público', month: 10, day: 28, scope: 'national', category: 'segment', relevance: 'low', segments: ['Serviços'] },
  { title: 'Finados', month: 11, day: 2, scope: 'national', category: 'holiday', relevance: 'low' },
  { title: 'Proclamação da República', month: 11, day: 15, scope: 'national', category: 'holiday', relevance: 'low' },
  { title: 'Dia da Consciência Negra', month: 11, day: 20, scope: 'national', category: 'holiday', relevance: 'medium' },
  { title: 'Dia da Bandeira', month: 11, day: 19, scope: 'national', category: 'commercial', relevance: 'low' },
  { title: 'Natal', month: 12, day: 25, scope: 'national', category: 'commercial', relevance: 'high', description: 'Feriado + maior período presenteável do ano' },
  { title: 'Réveillon', month: 12, day: 31, scope: 'national', category: 'holiday', relevance: 'medium', description: 'Véspera de Ano Novo' },
];

// ---------- Estaduais (curadoria conservadora) ----------

const STATE_FIXED: FixedDef[] = [
  { title: 'Dia do Fico (RJ)', month: 1, day: 9, scope: 'state', category: 'holiday', relevance: 'medium', uf: 'RJ' },
  { title: 'Aniversário de São Paulo', month: 1, day: 25, scope: 'state', category: 'holiday', relevance: 'medium', uf: 'SP' },
  { title: 'Aniversário do Amazonas', month: 9, day: 5, scope: 'state', category: 'holiday', relevance: 'medium', uf: 'AM' },
  { title: 'Adesão do Pará à Independência', month: 8, day: 15, scope: 'state', category: 'holiday', relevance: 'medium', uf: 'PA' },
  { title: 'Independência da Bahia', month: 7, day: 2, scope: 'state', category: 'holiday', relevance: 'medium', uf: 'BA', description: 'Feriado estadual — grande relevância local' },
  { title: 'Revolução Constitucionalista', month: 7, day: 9, scope: 'state', category: 'holiday', relevance: 'medium', uf: 'SP', description: 'Revolução de 1932' },
  { title: 'Adesão do Maranhão à Independência', month: 7, day: 28, scope: 'state', category: 'holiday', relevance: 'low', uf: 'MA' },
  { title: 'Criação do Mato Grosso do Sul', month: 10, day: 11, scope: 'state', category: 'holiday', relevance: 'low', uf: 'MS' },
  { title: 'Adesão do Piauí à Independência', month: 10, day: 19, scope: 'state', category: 'holiday', relevance: 'low', uf: 'PI' },
  { title: 'Emancipação do Paraná', month: 12, day: 19, scope: 'state', category: 'holiday', relevance: 'medium', uf: 'PR' },
  { title: 'Aniversário do Acre', month: 6, day: 15, scope: 'state', category: 'holiday', relevance: 'low', uf: 'AC' },
  { title: 'Criação do Amapá', month: 9, day: 13, scope: 'state', category: 'holiday', relevance: 'low', uf: 'AP' },
  { title: 'Confederação do Equador (AL)', month: 9, day: 16, scope: 'state', category: 'holiday', relevance: 'low', uf: 'AL' },
  { title: 'Autonomia do Sergipe', month: 7, day: 8, scope: 'state', category: 'holiday', relevance: 'low', uf: 'SE' },
  { title: 'Aniversário de Alagoas (criação)', month: 9, day: 16, scope: 'state', category: 'holiday', relevance: 'low', uf: 'AL' },
  { title: 'Semana Farroupilha', month: 9, day: 20, scope: 'state', category: 'holiday', relevance: 'medium', uf: 'RS', description: 'Feriado estadual — forte identidade gaúcha' },
];

// ---------- Municipais (aniversários — curadoria conservadora) ----------

const CITY_FIXED: FixedDef[] = [
  { title: 'Aniversário de Belém', month: 1, day: 12, scope: 'city', category: 'holiday', relevance: 'medium', city: 'belem' },
  { title: 'Aniversário de Santos', month: 1, day: 26, scope: 'city', category: 'holiday', relevance: 'medium', city: 'santos' },
  { title: 'Aniversário do Rio de Janeiro', month: 3, day: 1, scope: 'city', category: 'holiday', relevance: 'high', city: 'rio de janeiro' },
  { title: 'Aniversário de Florianópolis', month: 3, day: 23, scope: 'city', category: 'holiday', relevance: 'medium', city: 'florianopolis' },
  { title: 'Aniversário do Recife', month: 3, day: 12, scope: 'city', category: 'holiday', relevance: 'high', city: 'recife' },
  { title: 'Aniversário de Salvador', month: 3, day: 29, scope: 'city', category: 'holiday', relevance: 'high', city: 'salvador' },
  { title: 'Aniversário de Curitiba', month: 3, day: 29, scope: 'city', category: 'holiday', relevance: 'medium', city: 'curitiba' },
  { title: 'Aniversário de Porto Alegre', month: 3, day: 26, scope: 'city', category: 'holiday', relevance: 'medium', city: 'porto alegre' },
  { title: 'Aniversário de Aracaju', month: 3, day: 17, scope: 'city', category: 'holiday', relevance: 'medium', city: 'aracaju' },
  { title: 'Aniversário de Vitória', month: 9, day: 8, scope: 'city', category: 'holiday', relevance: 'medium', city: 'vitoria' },
  { title: 'Aniversário de Cuiabá', month: 4, day: 8, scope: 'city', category: 'holiday', relevance: 'medium', city: 'cuiaba' },
  { title: 'Fundação de Brasília', month: 4, day: 21, scope: 'city', category: 'holiday', relevance: 'high', city: 'brasilia' },
  { title: 'Aniversário de Fortaleza', month: 4, day: 13, scope: 'city', category: 'holiday', relevance: 'medium', city: 'fortaleza' },
  { title: 'Aniversário de Teresina', month: 8, day: 16, scope: 'city', category: 'holiday', relevance: 'medium', city: 'teresina' },
  { title: 'Aniversário de São Luís', month: 8, day: 25, scope: 'city', category: 'holiday', relevance: 'medium', city: 'sao luis' },
  { title: 'Aniversário de Niterói', month: 11, day: 22, scope: 'city', category: 'holiday', relevance: 'medium', city: 'niteroi' },
  { title: 'Aniversário de Natal', month: 12, day: 25, scope: 'city', category: 'custom', relevance: 'medium', city: 'natal' },
  { title: 'Aniversário de Goiânia', month: 10, day: 24, scope: 'city', category: 'holiday', relevance: 'medium', city: 'goiania' },
  { title: 'Aniversário de Manaus', month: 10, day: 24, scope: 'city', category: 'holiday', relevance: 'medium', city: 'manaus' },
  { title: 'Aniversário de Belo Horizonte', month: 12, day: 12, scope: 'city', category: 'holiday', relevance: 'high', city: 'belo horizonte' },
  { title: 'Aniversário de Maceió', month: 12, day: 9, scope: 'city', category: 'holiday', relevance: 'medium', city: 'maceio' },
];

// ---------- Segmento (datas de alta confiança) ----------

const SEGMENT_FIXED: FixedDef[] = [
  { title: 'Dia do Personal Trainer', month: 3, day: 9, scope: 'segment', category: 'segment', relevance: 'medium', segments: ['Fitness'] },
  { title: 'Dia Mundial da Saúde', month: 4, day: 7, scope: 'segment', category: 'segment', relevance: 'high', segments: ['Saúde'] },
  { title: 'Dia do Nutricionista', month: 8, day: 31, scope: 'segment', category: 'segment', relevance: 'medium', segments: ['Saúde', 'Alimentação', 'Fitness'] },
  { title: 'Dia do Enfermeiro', month: 5, day: 12, scope: 'segment', category: 'segment', relevance: 'medium', segments: ['Saúde'] },
  { title: 'Dia do Motorista', month: 7, day: 25, scope: 'segment', category: 'segment', relevance: 'medium', segments: ['Automotivo'] },
  { title: 'Dia da Pizza', month: 7, day: 9, scope: 'segment', category: 'segment', relevance: 'medium', segments: ['Alimentação', 'Restaurante'] },
  { title: 'Dia do Cabeleireiro', month: 6, day: 30, scope: 'segment', category: 'segment', relevance: 'medium', segments: ['Beleza'] },
  { title: 'Dia do Profissional de TI', month: 8, day: 8, scope: 'segment', category: 'segment', relevance: 'medium', segments: ['Tecnologia'] },
  { title: 'Dia do Vendedor', month: 9, day: 4, scope: 'segment', category: 'segment', relevance: 'medium', segments: ['Varejo', 'B2B'] },
  { title: 'Dia da Moda', month: 10, day: 22, scope: 'segment', category: 'segment', relevance: 'low', segments: ['Varejo', 'Beleza'] },
];

// ---------- Meses estratégicos (períodos inteiros) ----------

interface MonthlyPeriod {
  title: string;
  month: number; // 1-12
  category: StrategicDateDraft['category'];
  relevance: StrategicDateDraft['relevance'];
  description: string;
  color?: string; // cor temática para UI
}

const MONTHLY_PERIODS: MonthlyPeriod[] = [
  { title: 'Janeiro Branco', month: 1, category: 'segment', relevance: 'medium', description: 'Mês da Saúde Mental — conscientização e combate ao estigma', color: '#FFFFFF' },
  { title: 'Fevereiro Lilás', month: 2, category: 'segment', relevance: 'medium', description: 'Mês de Combate à Violência contra a Mulher', color: '#C8A2C8' },
  { title: 'Março Violeta', month: 3, category: 'segment', relevance: 'medium', description: 'Mês da Mulher — conquistas e igualdade', color: '#8B5CF6' },
  { title: 'Abril Azul', month: 4, category: 'segment', relevance: 'medium', description: 'Mês do Autismo — conscientização e inclusão', color: '#3B82F6' },
  { title: 'Maio Lilás', month: 5, category: 'segment', relevance: 'medium', description: 'Mês da Consciência sobre o Câncer de Pele', color: '#A855F7' },
  { title: 'Junho Lilás', month: 6, category: 'segment', relevance: 'high', description: 'Mês de Combate à Violência contra a Mulher', color: '#C084FC' },
  { title: 'Julho Amarelo', month: 7, category: 'segment', relevance: 'medium', description: 'Mês da Conscientização sobre Deficiência', color: '#EAB308' },
  { title: 'Agosto Dourado', month: 8, category: 'segment', relevance: 'medium', description: 'Mês do Idoso — valorização e respeito', color: '#F59E0B' },
  { title: 'Setembro Amarelo', month: 9, category: 'segment', relevance: 'high', description: 'Mês da Prevenção ao Suicídio — acolhimento e conscientização', color: '#FBBF24' },
  { title: 'Outubro Rosa', month: 10, category: 'segment', relevance: 'high', description: 'Mês da Prevenção ao Câncer de Mama — exames e autoexame', color: '#EC4899' },
  { title: 'Novembro Azul', month: 11, category: 'segment', relevance: 'high', description: 'Mês da Prevenção ao Câncer de Próstata — check-up masculino', color: '#3B82F6' },
  { title: 'Dezembro Vermelho', month: 12, category: 'segment', relevance: 'high', description: 'Mês da Prevenção e Combate à AIDS/HIV', color: '#EF4444' },
];

// ---------- UF + normalização ----------

export const BR_STATES: { value: string; label: string }[] = [
  { value: 'AC', label: 'Acre' }, { value: 'AL', label: 'Alagoas' },
  { value: 'AP', label: 'Amapá' }, { value: 'AM', label: 'Amazonas' },
  { value: 'BA', label: 'Bahia' }, { value: 'CE', label: 'Ceará' },
  { value: 'DF', label: 'Distrito Federal' }, { value: 'ES', label: 'Espírito Santo' },
  { value: 'GO', label: 'Goiás' }, { value: 'MA', label: 'Maranhão' },
  { value: 'MT', label: 'Mato Grosso' }, { value: 'MS', label: 'Mato Grosso do Sul' },
  { value: 'MG', label: 'Minas Gerais' }, { value: 'PA', label: 'Pará' },
  { value: 'PB', label: 'Paraíba' }, { value: 'PR', label: 'Paraná' },
  { value: 'PE', label: 'Pernambuco' }, { value: 'PI', label: 'Piauí' },
  { value: 'RJ', label: 'Rio de Janeiro' }, { value: 'RN', label: 'Rio Grande do Norte' },
  { value: 'RS', label: 'Rio Grande do Sul' }, { value: 'RO', label: 'Rondônia' },
  { value: 'RR', label: 'Roraima' }, { value: 'SC', label: 'Santa Catarina' },
  { value: 'SP', label: 'São Paulo' }, { value: 'SE', label: 'Sergipe' },
  { value: 'TO', label: 'Tocantins' },
];

function normalizeName(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function nextOccurrence(month: number, day: number): { date: string; year: number } {
  const now = new Date();
  let year = now.getUTCFullYear();
  const candidate = new Date(Date.UTC(year, month - 1, day));
  if (candidate.getTime() < Date.UTC(year, now.getUTCMonth(), now.getUTCDate())) year += 1;
  return { date: fmt(new Date(Date.UTC(year, month - 1, day))), year };
}

function defToDraft(d: FixedDef): StrategicDateDraft {
  const occ = nextOccurrence(d.month, d.day);
  const locality: StrategicDateDraft['locality'] =
    d.scope === 'state' ? 'state' : d.scope === 'city' ? 'city' : 'national';
  return {
    title: d.title,
    date: occ.date,
    locality,
    category: d.scope === 'segment' ? 'segment' : d.category,
    relevance: d.relevance,
    description: d.description ?? null,
    is_recurring: true,
  };
}

function monthPeriodToDraft(p: MonthlyPeriod, year: number): StrategicDateDraft {
  const startDate = fmt(new Date(Date.UTC(year, p.month - 1, 1)));
  // Último dia do mês
  const lastDay = new Date(Date.UTC(year, p.month, 0)).getUTCDate();
  const endDate = fmt(new Date(Date.UTC(year, p.month - 1, lastDay)));
  return {
    title: p.title,
    date: startDate, // date = start_date para compatibilidade
    start_date: startDate,
    end_date: endDate,
    locality: 'national',
    category: p.category,
    relevance: p.relevance,
    description: p.description,
    is_recurring: true,
  };
}

// ==========================================
// API PRINCIPAL
// ==========================================

export interface DetectOptions {
  state?: string | null;   // sigla UF (ex: 'PE')
  city?: string | null;    // nome da cidade
  segment?: string | null; // um dos SEGMENTS
}

export interface DetectResult {
  drafts: StrategicDateDraft[];       // ordenadas por data
  cityDetected: boolean;              // true se a cidade está na base
}

export function detectDatesForClient(opts: DetectOptions): DetectResult {
  const out: StrategicDateDraft[] = [];
  const seen = new Set<string>();
  const push = (d: StrategicDateDraft) => {
    const key = `${normalizeName(d.title)}|${d.date}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push(d);
  };

  // 1) Nacionais fixas
  for (const def of NATIONAL_FIXED) {
    if (def.scope === 'national') push(defToDraft(def));
  }

  // 2) Flutuantes: ano atual + próximo
  const years = [new Date().getUTCFullYear(), new Date().getUTCFullYear() + 1];
  for (const fl of FLOATING) {
    for (const y of years) {
      const date = fl.compute(y);
      // inclui apenas ocorrências futuras (ou muito próximas)
      if (date.getTime() >= Date.now() - 3 * 86400000) {
        push({
          title: fl.title,
          date: fmt(date),
          locality: 'national',
          category: fl.category,
          relevance: fl.relevance,
          description: fl.description ?? null,
          is_recurring: false,
        });
      }
    }
  }

  // 3) Estaduais
  const uf = (opts.state || '').toUpperCase().trim();
  if (uf) {
    for (const def of STATE_FIXED) {
      if (def.uf === uf) push(defToDraft(def));
    }
  }

  // 4) Municipais
  let cityDetected = false;
  const cityKey = normalizeName(opts.city || '');
  if (cityKey) {
    for (const def of CITY_FIXED) {
      if (def.city === cityKey) {
        cityDetected = true;
        push(defToDraft(def));
      }
    }
  }

  // 5) Segmento
  const seg = (opts.segment || '').trim();
  if (seg) {
    for (const def of [...SEGMENT_FIXED, ...NATIONAL_FIXED.filter(d => d.scope === 'segment')]) {
      if (def.segments?.includes(seg)) push(defToDraft(def));
    }
  }

  // 6) Meses estratégicos (períodos inteiros)
  const currentYear = new Date().getUTCFullYear();
  for (const period of MONTHLY_PERIODS) {
    // Inclui mês atual e próximo ano
    for (const y of [currentYear, currentYear + 1]) {
      const draft = monthPeriodToDraft(period, y);
      // Inclui apenas períodos futuros ou em andamento
      if (draft.end_date && draft.end_date >= fmt(new Date())) {
        push(draft);
      }
    }
  }

  out.sort((a, b) => a.date.localeCompare(b.date));
  return { drafts: out, cityDetected };
}

/** Datas municipais fora da base: valida DD/MM informado manualmente */
export function manualCityBirthday(city: string, ddmm: string): StrategicDateDraft | null {
  const m = ddmm.trim().match(/^(\d{1,2})\/(\d{1,2})$/);
  if (!m) return null;
  const day = parseInt(m[1], 10);
  const month = parseInt(m[2], 10);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const test = new Date(Date.UTC(2020, month - 1, day)); // 2020 bissexto p/ validar 29/02
  if (test.getUTCMonth() !== month - 1 || test.getUTCDate() !== day) return null;
  const occ = nextOccurrence(month, day);
  return {
    title: `Aniversário de ${city.trim()}`,
    date: occ.date,
    locality: 'city',
    category: 'custom',
    relevance: 'high',
    description: 'Aniversário municipal confirmado manualmente',
    is_recurring: true,
  };
}

/** Helper: uma data recorrente "bate" num dia específico? */
export function recurringMatches(isoDate: string, month: number, day: number): boolean {
  const d = new Date(isoDate + 'T00:00:00Z');
  return d.getUTCMonth() + 1 === month && d.getUTCDate() === day;
}
