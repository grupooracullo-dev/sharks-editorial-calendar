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
