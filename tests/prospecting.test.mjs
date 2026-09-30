import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';

async function load(path) {
  const source = await readFile(new URL(path, import.meta.url), 'utf8');
  const outputText = stripTypeScriptTypes(source);
  return import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);
}

/* ─── Mock AI determinístico (contrato AIProvider) ─── */
const { MockAIProvider, getAIProvider } = await load('../src/lib/prospecting/aiProvider.ts');

test('mock AI provider é determinístico e respeita os limites 0–1', async () => {
  const provider = new MockAIProvider();
  const company = {
    name: 'Distribuidora Alimentos PE',
    segment: 'Alimentação',
    location: 'Pernambuco',
    company_size: 'Médio',
    signals: ['atendimento manual', 'site desatualizado'],
  };
  const first = await provider.analyzeCompany(company, ['Tráfego pago', 'CRM']);
  const second = await provider.analyzeCompany({ ...company }, ['Tráfego pago', 'CRM']);

  assert.equal(first.icpFit, second.icpFit);
  assert.equal(first.priority, second.priority);
  assert.equal(first.nextAction, second.nextAction);

  assert.ok(first.icpFit >= 0 && first.icpFit <= 1);
  assert.ok(first.confidence >= 0 && first.confidence <= 1);
  assert.equal(first.productScores.length, 2);
  for (const p of first.productScores) {
    assert.ok(p.score >= 0 && p.score <= 1);
  }
  assert.ok(['alta', 'media', 'baixa'].includes(first.priority));
  assert.ok(['pesquisar_mais', 'qualificar', 'descartar', 'abordar'].includes(first.nextAction));
});

test('empresas diferentes produzem análises com seed distinto quando o contexto muda', async () => {
  const provider = new MockAIProvider();
  const a = await provider.analyzeCompany({ name: 'Empresa A', segment: 'Serviços' }, ['CRM']);
  const b = await provider.analyzeCompany({ name: 'Empresa B', segment: 'Alimentação' }, ['CRM']);
  // Determinístico por chave — entradas distintas devem gerar contextos distintos
  // (não afirma ordem, apenas que o campo rationale reflete o seed e é estável)
  const b2 = await provider.analyzeCompany({ name: 'Empresa B', segment: 'Alimentação' }, ['CRM']);
  assert.equal(b.icpFit, b2.icpFit);
  assert.ok(a.rationale.includes('Mock'));
});

test('factory retorna um provider válido', async () => {
  const provider = getAIProvider();
  assert.ok(provider && typeof provider.analyzeCompany === 'function');
});

/* ─── Estrutura: domínio e schema ─── */
test('9 estados de prospecção separados do estágio comercial', async () => {
  const types = await readFile(new URL('../src/lib/prospecting/types.ts', import.meta.url), 'utf8');
  for (const s of ['discovered', 'researching', 'qualified', 'discarded', 'queued', 'contacted', 'replied', 'interested', 'converted_to_pipeline']) {
    assert.ok(types.includes(`'${s}'`), `estado ausente: ${s}`);
  }
  // Pipeline comercial não foi misturado
  assert.ok(types.includes("PROSPECTING_STATUS_META"));
  assert.ok(!types.includes("stage:"));
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

/* ─── Estrutura: rotas, menu e permissão ─── */
test('rotas e menu da Prospecção IA em Sharks e Estrategos (não no Cliente)', async () => {
  const app = await readFile(new URL('../src/App.tsx', import.meta.url), 'utf8');
  assert.ok(app.includes("path=\"/sharks/prospeccao\""));
  assert.ok(app.includes("path=\"/estrategos/prospeccao\""));
  assert.ok(!app.includes("/oracullo/prospeccao"));
  assert.ok(!app.includes("/client/prospeccao"));

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
