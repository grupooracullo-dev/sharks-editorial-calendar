/* ─── Abstração de IA do Prospecting Engine (§12 do plano) ───
   Contrato único, providers substituíveis:
   - MockAIProvider: determinístico, zero custo (dev/testes)
   - F2: JevProvider (decisão — Choice/Score/Noul via Edge Functions)
   - Futuro: LlmProvider (geração de mensagem, revisável)            */

export interface CompanyProfile {
  name: string;
  segment?: string | null;
  location?: string | null;
  company_size?: string | null;
  /** Sinais coletados na pesquisa (ex.: "atendimento manual", "site desatualizado") */
  signals?: string[];
  website_summary?: string | null;
  notes?: string | null;
}

export type AIPriority = 'alta' | 'media' | 'baixa';
export type AINextAction = 'pesquisar_mais' | 'qualificar' | 'descartar' | 'abordar';

export interface CompanyAnalysis {
  /** 0–1: aderência ao ICP da campanha */
  icpFit: number;
  /** 0–1: confiança calibrada da decisão (gate agir/revisar/escalar) */
  confidence: number;
  priority: AIPriority;
  nextAction: AINextAction;
  /** Aderência (0–1) a cada produto ofertado na campanha */
  productScores: Array<{ productName: string; score: number }>;
  rationale?: string;
}

export interface AIProvider {
  readonly name: string;
  analyzeCompany(company: CompanyProfile, campaignProducts: string[]): Promise<CompanyAnalysis>;
}

/* Hash estável (djb2) — base do mock determinístico */
function stableHash(input: string): number {
  let h = 5381;
  for (let i = 0; i < input.length; i++) {
    h = ((h << 5) + h + input.charCodeAt(i)) >>> 0;
  }
  return h;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Provider de desenvolvimento/testes: determinístico, sem rede, sem custo. */
export class MockAIProvider implements AIProvider {
  readonly name = 'mock';

  async analyzeCompany(company: CompanyProfile, campaignProducts: string[]): Promise<CompanyAnalysis> {
    const key = [company.name, company.segment ?? '', company.location ?? '', company.company_size ?? ''].join('|');
    const seed = stableHash(key);

    const icpFit = round2(0.35 + (seed % 60) / 100);              // 0.35–0.94
    const confidence = round2(0.55 + ((seed >>> 3) % 45) / 100);  // 0.55–0.99
    const signalBoost = Math.min(company.signals?.length ?? 0, 3) * 0.03;

    const productScores = campaignProducts.map((productName, i) => ({
      productName,
      score: round2(Math.max(0.05, Math.min(0.95, 0.3 + ((seed >>> (i + 2)) % 65) / 100 + signalBoost))),
    }));

    const priority: AIPriority = icpFit >= 0.75 ? 'alta' : icpFit >= 0.55 ? 'media' : 'baixa';
    const nextAction: AINextAction = icpFit >= 0.75 ? 'qualificar' : icpFit >= 0.5 ? 'pesquisar_mais' : 'descartar';

    return {
      icpFit: round2(Math.min(0.99, icpFit + signalBoost)),
      confidence,
      priority,
      nextAction,
      productScores,
      rationale: `Mock determinístico (seed ${seed % 10000}) — substituir por JevProvider na F2.`,
    };
  }
}

/**
 * Factory — troca de fornecedor sem acoplar consumidores.
 * F2: ler Deno.env/`import.meta.env` (AI_PROVIDER=jev|llm|mock).
 */
export function getAIProvider(): AIProvider {
  return new MockAIProvider();
}
