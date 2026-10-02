import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';

async function load(path) {
  const source = await readFile(new URL(path, import.meta.url), 'utf8');
  const outputText = stripTypeScriptTypes(source);
  return import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);
}

const ingest = await load('../supabase/functions/_shared/prospecting/ingest.ts');
const ai = await load('../supabase/functions/_shared/prospecting/ai.ts');

test('9 estados de prospecção separados do estágio comercial', async () => {
  const types = await readFile(new URL('../src/lib/prospecting/types.ts', import.meta.url), 'utf8');
  for (const s of ['discovered', 'researching', 'qualified', 'discarded', 'queued', 'contacted', 'replied', 'interested', 'converted_to_pipeline']) {
    assert.ok(types.includes(`'${s}'`), `estado ausente: ${s}`);
  }
  assert.ok(types.includes('PROSPECTING_STATUS_META') === false); // meta migrada para a UI
  assert.ok(!types.includes('stage:'));
});

test('migration 067: fila com dedupe, trigger de transição e RLS por ambiente', async () => {
  const migration = await readFile(new URL('../supabase/migrations/067_prospecting_foundation.sql', import.meta.url), 'utf8');
  assert.ok(migration.includes('uq_prospecting_jobs_dedupe'));
  assert.ok(migration.includes('validate_prospecting_job_transition'));
  assert.ok(migration.includes('is_env_staff((select auth.uid()), environment)'));
  assert.ok(migration.includes("origin IN ('manual','inbound','prospecting_agent','import')"));
  assert.ok(migration.includes('converted_to_pipeline'));
  assert.ok(!migration.includes('attachments'));
});

test('rotas e menu da Prospecção IA em Sharks e Estrategos (não no Cliente)', async () => {
  const app = await readFile(new URL('../src/App.tsx', import.meta.url), 'utf8');
  assert.ok(app.includes('path="/sharks/prospeccao"'));
  assert.ok(app.includes('path="/estrategos/prospeccao"'));
  assert.ok(!app.includes('/oracullo/prospeccao'));
  assert.ok(!app.includes('/client/prospeccao'));

  const nav = await readFile(new URL('../src/components/layout/navItems.ts', import.meta.url), 'utf8');
  assert.ok(nav.includes("path: '/sharks/prospeccao'"));
  assert.ok(nav.includes("path: '/estrategos/prospeccao'"));
  assert.ok(!nav.includes("path: '/client/prospeccao'"));

  const perms = await readFile(new URL('../src/lib/permissions.ts', import.meta.url), 'utf8');
  assert.ok(perms.includes('prospecting:'));

  const createFn = await readFile(new URL('../supabase/functions/admin-create-user/index.ts', import.meta.url), 'utf8');
  assert.ok(createFn.includes("'prospecting'"));
  const approveFn = await readFile(new URL('../supabase/functions/admin-approve-access-request/index.ts', import.meta.url), 'utf8');
  assert.ok(approveFn.includes("'prospecting'"));
});

/* ─── F2: ingest e JEV (funções puras das Edge Functions) ─── */

test('normalize de contato e extração de leadgen do webhook Meta', () => {
  assert.equal(ingest.normalizeEmail('  Maria@Empresa.COM '), 'maria@empresa.com');
  assert.equal(ingest.normalizeEmail('invalido'), null);
  assert.equal(ingest.normalizePhone('(11) 99999-8888'), '11999998888');
  assert.equal(ingest.normalizePhone('123'), null);

  const contact = ingest.mapMetaLeadFields([
    { name: 'full_name', values: ['Maria Silva'] },
    { name: 'email', values: ['MARIA@Teste.com'] },
    { name: 'phone_number', values: ['(11) 98888-7777'] },
  ]);
  assert.equal(contact.name, 'Maria Silva');
  assert.equal(contact.email, 'maria@teste.com');
  assert.equal(contact.phone, '11988887777');

  const refs = ingest.extractMetaLeadIds({
    entry: [{ id: 'page1', changes: [{ field: 'leadgen', value: { lead_id: 'L1' } }] }],
  });
  assert.equal(refs.length, 1);
  assert.equal(refs[0].leadId, 'L1');
  assert.deepEqual(ingest.extractMetaLeadIds({ entry: [] }), []);
});

test('Jev: perguntas atômicas e mapeamento de respostas para o contrato', () => {
  const q = ai.buildJevQuestions(['Tráfego pago', 'CRM']);
  assert.ok(q.icp_fit && q.priority && q.next_action);
  assert.ok(q.prod_0 && q.prod_1);
  assert.equal(q.prod_1.instructions.includes('CRM'), true);

  const analysis = ai.mapJevAnswers(
    {
      icp_fit: { score: 3, confidence: 0.82 },
      priority: { choice: 'alta' },
      next_action: { choice: 'qualificar' },
      prod_0: { noul: 0.9 },
      prod_1: { noul: 0.4 },
    },
    ['Tráfego pago', 'CRM'],
  );
  assert.equal(analysis.icpFit, 0.75);
  assert.equal(analysis.confidence, 0.82);
  assert.equal(analysis.priority, 'alta');
  assert.equal(analysis.nextAction, 'qualificar');
  assert.equal(analysis.productScores[0].score, 0.9);
  assert.equal(analysis.productScores[1].score, 0.4);
});

test('mock do provider (fallback sem key) continua determinístico', async () => {
  const provider = new ai.MockAIProvider();
  const a = await provider.analyzeCompany({ name: 'X', segment: 'S' }, ['P1']);
  const b = await provider.analyzeCompany({ name: 'X', segment: 'S' }, ['P1']);
  assert.equal(a.icpFit, b.icpFit);
  assert.ok(a.icpFit >= 0 && a.icpFit <= 1);
});

/* ─── F3: settings do agente + GLM ─── */
test('migration 070: settings por ambiente com seeds, RLS de admin e drops', async () => {
  const migration = await readFile(new URL('../supabase/migrations/070_limpeza_e_agent_settings.sql', import.meta.url), 'utf8');
  assert.ok(migration.includes('prospecting_agent_settings'));
  assert.ok(migration.includes('DROP TABLE IF EXISTS public.channels'));
  assert.ok(migration.includes('DROP TABLE IF EXISTS public.calendar_templates'));
  assert.ok(migration.includes('DROP TABLE IF EXISTS public.partners'));
  assert.ok(migration.includes('DROP TABLE IF EXISTS public.action_partners'));
  assert.ok(migration.includes('Sofia'));
  assert.ok(migration.includes('is_env_admin((select auth.uid()), environment)'));
});

test('GLM: system prompt carrega personalidade e parse de rascunho', () => {
  const prompt = ai.buildGlmSystemPrompt(
    { agent_name: 'Sofia', tone: 'amigavel', language: 'pt-BR', persona: 'Consultora comercial', brand_voice_rules: 'Sem promessas', signature: '— Sharks', greeting_style: 'curto' },
    'Distribuidores PE',
  );
  assert.ok(prompt.includes('Sofia'));
  assert.ok(prompt.includes('Consultora comercial'));
  assert.ok(prompt.includes('Sem promessas'));
  assert.ok(prompt.includes('Distribuidores PE'));
  assert.ok(prompt.includes('Assunto:'));

  const parsed = ai.parseGlmDraft('Assunto: Ideia para voce\n\nOla, tudo bem?');
  assert.equal(parsed.subject, 'Ideia para voce');
  assert.equal(parsed.message, 'Ola, tudo bem?');

  const fallback = ai.parseGlmDraft('Mensagem direta sem assunto');
  assert.equal(fallback.subject, null);
  assert.equal(fallback.message, 'Mensagem direta sem assunto');
});

/* ---- Fim-a-fim: ICP + voz + auto-loop (migration 073) ---- */

test('migration 073: ICP da campanha, metadata de atividades e bucket de voz', async () => {
  const m = await readFile(new URL('../supabase/migrations/073_agent_icp_voice.sql', import.meta.url), 'utf8');
  assert.ok(m.includes('ADD COLUMN IF NOT EXISTS icp_description'));
  assert.ok(m.includes('ADD COLUMN IF NOT EXISTS metadata'));
  assert.ok(m.includes("('agent-voice', 'agent-voice', true)"));
  assert.ok(m.includes('bucket_id = '));
});

test('score ICP-aware: estado e perguntas do JEV carregam o publico-alvo da campanha', () => {
  const icp = {
    campaign_name: 'PILOTO Distribuidores SP',
    segment: 'Distribuidores de alimentos',
    location: 'Sao Paulo - SP',
    company_size: 'Medio',
    icp_description: 'Atacado com delivery proprio',
  };
  const state = ai.buildJevState({ name: 'Padaria X' }, icp);
  assert.ok(state.includes('Público-alvo da campanha'));
  assert.ok(state.includes('PILOTO Distribuidores SP'));
  assert.ok(state.includes('Segmento alvo: Distribuidores de alimentos'));
  assert.ok(state.includes('Descrição do ICP: Atacado com delivery proprio'));

  const q = ai.buildJevQuestions(['Tráfego pago'], icp);
  assert.ok(q.icp_fit.instructions.includes('desta campanha'));
  const q2 = ai.buildJevQuestions(['Tráfego pago']);
  assert.ok(q2.icp_fit.instructions.includes('da agencia') || q2.icp_fit.instructions.includes('da agência'));

  const stateNoIcp = ai.buildJevState({ name: 'Padaria X' });
  assert.ok(!stateNoIcp.includes('Público-alvo'));
});

test('SpeechProvider: contrato, ElevenLabs e fallback mock sem key', async () => {
  const speech = await load('../supabase/functions/_shared/prospecting/speech.ts');
  const mock = new speech.MockSpeechProvider();
  assert.equal(await mock.synthesize('qualquer texto'), null);
  assert.equal(speech.hasRealSpeech(), false);
  const factory = speech.getSpeechProvider();
  assert.equal(factory.name, 'mock');
  assert.equal(await factory.synthesize('teste'), null);
  assert.ok(speech.ELEVEN_DEFAULT_VOICE.length > 0);
});

test('worker: auto-loop de discovery, ICP na analise e voz na geracao', async () => {
  const worker = await readFile(new URL('../supabase/functions/prospecting-run/index.ts', import.meta.url), 'utf8');
  // auto-loop: campanhas running abaixo da meta enfileiram discovery sozinhos
  assert.ok(worker.includes("eq('status', 'running')"));
  assert.ok(worker.includes('auto-discover-'));
  assert.ok(worker.includes('max_companies_per_run'));
  assert.ok(worker.includes('GOOGLE_PLACES_API_KEY'));
  // ICP-aware
  assert.ok(worker.includes('loadCampaignIcp'));
  assert.ok(worker.includes('analyzeCompany(company, products, icp)'));
  // voz
  assert.ok(worker.includes('getSpeechProvider()'));
  assert.ok(worker.includes('agent-voice'));
  assert.ok(worker.includes('audio_url'));
});

test('UI: ICP no formulario, voz na personalidade e player no feed', async () => {
  const form = await readFile(new URL('../src/components/prospecting/CampaignFormModal.tsx', import.meta.url), 'utf8');
  assert.ok(form.includes('icp_description'));
  assert.ok(form.includes('Público-alvo (ICP)'));

  const agent = await readFile(new URL('../src/components/prospecting/AgentPage.tsx', import.meta.url), 'utf8');
  assert.ok(agent.includes("setVoice('mode'"));
  assert.ok(agent.includes("value: 'audio'"));
  assert.ok(agent.includes("key: 'speech'"));

  const feed = await readFile(new URL('../src/components/prospecting/ApproachesPage.tsx', import.meta.url), 'utf8');
  assert.ok(feed.includes('<audio controls'));
  assert.ok(feed.includes('metadata?.audio_url'));

  const drawer = await readFile(new URL('../src/components/crm/LeadDrawer.tsx', import.meta.url), 'utf8');
  assert.ok(drawer.includes('a.metadata?.audio_url'));

  const page = await readFile(new URL('../src/components/prospecting/ProspectingPage.tsx', import.meta.url), 'utf8');
  assert.ok(page.includes('Progresso da meta'));
  assert.ok(page.includes('c.icp_description'));
});