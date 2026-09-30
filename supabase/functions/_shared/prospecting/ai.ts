/* ─── AIProvider do Prospecting Engine ───
   - MockAIProvider: determinístico (dev/testes), zero custo
   - JevProvider: decisões tipadas (Score/Choice/Noul) via TypeSafe AI
   Contrato estável: consumidores não conhecem o fornecedor.
   (getAIProvider lê env apenas em Deno; em node/testes use as classes.) */

export interface CompanyProfile {
  name: string;
  segment?: string | null;
  location?: string | null;
  company_size?: string | null;
  signals?: string[];
  website_summary?: string | null;
  notes?: string | null;
}

export type AIPriority = 'alta' | 'media' | 'baixa';
export type AINextAction = 'pesquisar_mais' | 'qualificar' | 'descartar' | 'abordar';

export interface CompanyAnalysis {
  icpFit: number;
  confidence: number;
  priority: AIPriority;
  nextAction: AINextAction;
  productScores: Array<{ productName: string; score: number }>;
  rationale?: string;
}

export interface AIProvider {
  readonly name: string;
  analyzeCompany(company: CompanyProfile, campaignProducts: string[]): Promise<CompanyAnalysis>;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

function stableHash(input: string): number {
  let h = 5381;
  for (let i = 0; i < input.length; i++) h = ((h << 5) + h + input.charCodeAt(i)) >>> 0;
  return h;
}

export class MockAIProvider implements AIProvider {
  readonly name = 'mock';

  async analyzeCompany(company: CompanyProfile, campaignProducts: string[]): Promise<CompanyAnalysis> {
    const key = [company.name, company.segment ?? '', company.location ?? '', company.company_size ?? ''].join('|');
    const seed = stableHash(key);
    const signalBoost = Math.min(company.signals?.length ?? 0, 3) * 0.03;

    const icpFit = round2(Math.min(0.99, 0.35 + (seed % 60) / 100 + signalBoost));
    const confidence = round2(0.55 + ((seed >>> 3) % 45) / 100);
    const productScores = campaignProducts.map((productName, i) => ({
      productName,
      score: round2(Math.max(0.05, Math.min(0.95, 0.3 + ((seed >>> (i + 2)) % 65) / 100 + signalBoost))),
    }));

    return {
      icpFit,
      confidence,
      priority: icpFit >= 0.75 ? 'alta' : icpFit >= 0.55 ? 'media' : 'baixa',
      nextAction: icpFit >= 0.75 ? 'qualificar' : icpFit >= 0.5 ? 'pesquisar_mais' : 'descartar',
      productScores,
      rationale: `Mock determinístico (seed ${seed % 10000}).`,
    };
  }
}

const JEV_URL = 'https://api.typesafe.ai/v1/systemone';
const JEV_MODEL = 'jev-latest';

/** Monta as perguntas atômicas para o JEV (1 chamada, N perguntas em paralelo). */
export function buildJevQuestions(products: string[]): Record<string, unknown> {
  const questions: Record<string, unknown> = {
    icp_fit: {
      type: 'score',
      instructions: 'Aderência desta empresa ao perfil de cliente ideal da agência',
      criteria: ['Nenhum encaixe', 'Encaixe fraco', 'Encaixe razoável', 'Bom encaixe', 'Encaixe ideal'],
    },
    priority: {
      type: 'choice',
      instructions: 'Prioridade de follow-up comercial',
      criteria: { alta: 'Recomenda contato imediato', media: 'Acompanhar de perto', baixa: 'Nutrir no longo prazo' },
    },
    next_action: {
      type: 'choice',
      instructions: 'Próxima ação comercial recomendada',
      criteria: {
        pesquisar_mais: 'Faltam dados para decidir',
        qualificar: 'Perfil promissor, avançar no CRM',
        descartar: 'Sem encaixe real hoje',
        abordar: 'Pronto para primeiro contato',
      },
    },
  };
  products.slice(0, 12).forEach((p, i) => {
    questions[`prod_${i}`] = {
      type: 'noul',
      instructions: `Esta empresa demonstra necessidade/interesse real por: ${p}?`,
    };
  });
  return questions;
}

export function buildJevState(company: CompanyProfile): string {
  return [
    `Empresa: ${company.name}`,
    company.segment ? `Segmento: ${company.segment}` : '',
    company.location ? `Localização: ${company.location}` : '',
    company.company_size ? `Porte: ${company.company_size}` : '',
    company.signals?.length ? `Sinais: ${company.signals.join('; ')}` : '',
    company.website_summary ? `Resumo do site: ${company.website_summary}` : '',
    company.notes ? `Notas: ${company.notes}` : '',
  ].filter(Boolean).join('\n');
}

/** Converte a resposta do JEV no CompanyAnalysis do contrato. */
export function mapJevAnswers(
  answers: Record<string, Record<string, unknown>>,
  products: string[],
): CompanyAnalysis {
  const fit = Number((answers.icp_fit as { score?: number })?.score ?? 0);
  const icpFit = round2(fit / 4); // rubrica 0–4 → 0–1
  const priorityRaw = String((answers.priority as { choice?: string })?.choice ?? 'baixa');
  const nextRaw = String((answers.next_action as { choice?: string })?.choice ?? 'pesquisar_mais');

  const productScores = products.slice(0, 12).map((productName, i) => ({
    productName,
    score: round2(Number((answers[`prod_${i}`] as { noul?: number })?.noul ?? 0)),
  }));

  return {
    icpFit,
    confidence: round2(Number((answers.icp_fit as { confidence?: number })?.confidence ?? 0)),
    priority: (['alta', 'media', 'baixa'] as const).includes(priorityRaw as AIPriority)
      ? (priorityRaw as AIPriority) : 'baixa',
    nextAction: (['pesquisar_mais', 'qualificar', 'descartar', 'abordar'] as const).includes(nextRaw as AINextAction)
      ? (nextRaw as AINextAction) : 'pesquisar_mais',
    productScores,
    rationale: 'JEV (decisão calibrada).',
  };
}

export class JevProvider implements AIProvider {
  readonly name = 'jev';
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async analyzeCompany(company: CompanyProfile, campaignProducts: string[]): Promise<CompanyAnalysis> {
    const res = await fetch(JEV_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        state: buildJevState(company),
        model: JEV_MODEL,
        questions: buildJevQuestions(campaignProducts),
      }),
    });
    if (!res.ok) {
      throw new Error(`JEV falhou (${res.status}): ${(await res.text()).slice(0, 200)}`);
    }
    const body = (await res.json()) as { answers: Record<string, Record<string, unknown>> };
    return mapJevAnswers(body.answers, campaignProducts);
  }
}

/** Factory — nunca acopla consumidores a um fornecedor. */
export function getAIProvider(): AIProvider {
  const env = (globalThis as { Deno?: { env: { get(k: string): string | undefined } } }).Deno;
  const key = env?.env.get('TYPESAFE_API_KEY');
  if (env?.env.get('AI_PROVIDER') === 'jev' && key) return new JevProvider(key);
  return new MockAIProvider();
}

/** JEV real só quando há key configurada. */
export function hasRealAI(): boolean {
  const env = (globalThis as { Deno?: { env: { get(k: string): string | undefined } } }).Deno;
  return !!env?.env.get('TYPESAFE_API_KEY');
}
