import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';

async function load(path) {
  const source = await readFile(new URL(path, import.meta.url), 'utf8');
  const outputText = stripTypeScriptTypes(source);
  return import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);
}

const { canDeleteUser } = await load('../supabase/functions/_shared/deleteAuthorization.ts');
const { normalizeAction } = await load('../src/lib/actionNormalization.ts');
const { localDate } = await load('../src/lib/localDate.ts');
const admin = { role: 'admin_sharks' };
const member = { role: 'sharks_team' };
const sharksAdmin = [{ environment: 'sharks_company', role: 'admin' }];
const sharksTeam = [{ environment: 'sharks_company', role: 'team' }];
const estrategosTeam = [{ environment: 'estrategos', role: 'team' }];

test('environment admin can delete only subordinate accounts in their environment', () => {
  assert.equal(canDeleteUser(admin, member, sharksAdmin, sharksTeam), true);
  assert.equal(canDeleteUser(admin, member, sharksAdmin, estrategosTeam), false);
  assert.equal(canDeleteUser(admin, member, sharksAdmin, [...sharksTeam, ...estrategosTeam]), false);
  assert.equal(canDeleteUser(admin, member, sharksAdmin, []), false);
  assert.equal(canDeleteUser(member, member, sharksTeam, sharksTeam), false);
});

test('privileged targets and guardians are protected', () => {
  assert.equal(canDeleteUser(admin, { role: 'oracullo_admin' }, sharksAdmin, sharksTeam), false);
  assert.equal(canDeleteUser(admin, admin, sharksAdmin, sharksAdmin), false);
  assert.equal(canDeleteUser(admin, member, sharksAdmin, sharksAdmin), false);
  assert.equal(canDeleteUser({ role: 'oracullo_admin' }, { ...member, is_guardian: true }, [], []), false);
  assert.equal(canDeleteUser({ role: 'oracullo_admin' }, member, [], [...sharksTeam, ...estrategosTeam]), true);
});

test('all responsible users survive the nested database response', () => {
  const result = normalizeAction({ id: 'action', responsible_id: 'first', responsibles: [
    { users: { id: 'first', full_name: 'Primeiro' } },
    { users: { id: 'second', full_name: 'Segundo' } },
    { users: null },
  ] });
  assert.deepEqual(result.responsibles.map(r => r.id), ['first', 'second']);
  assert.equal(result.responsibles.some(r => r.id === 'second'), true);
  assert.deepEqual(normalizeAction({ id: 'empty' }).responsibles, []);
});

test('local calendar dates do not advance at 21h in Fortaleza', () => {
  process.env.TZ = 'America/Fortaleza';
  assert.equal(localDate(new Date('2026-09-08T00:30:00Z')), '2026-09-07');
  assert.equal(localDate(new Date('2026-09-08T03:00:00Z')), '2026-09-08');
  assert.equal(localDate(new Date(2028, 2, 0)), '2028-02-29');
  assert.equal(localDate(new Date(2026, 1, 0)), '2026-01-31');
});

test('saved actions report assignment failure without claiming complete success', async () => {
  let source = await readFile(new URL('../src/lib/actionService.ts', import.meta.url), 'utf8');
  source = source.replace(/^import .*;\r?\n/gm, '');
  const action = { id: 'saved', workspace_id: 'workspace', action_date: '2026-09-07', responsibles: [] };
  const query = {
    insert() { return this; }, update() { return this; }, select() { return this; },
    eq() { return this; }, single() { return Promise.resolve({ data: action, error: null }); },
  };
  let rpcMode = 'error';
  globalThis.__actionTest = {
    supabase: {
      from: () => query,
      rpc: async () => {
        if (rpcMode === 'throw') throw new Error('network unavailable');
        return { error: { message: 'permission denied' } };
      },
    },
    normalizeAction, localDate,
  };
  source = `const {supabase, normalizeAction, localDate} = globalThis.__actionTest;
    const authState = {userId: 'user'};
    const notifyActionChanged = () => {};
    const registerRealtimeReset = () => {};
    ${source}`;
  const compiled = stripTypeScriptTypes(source);
  const service = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);
  const created = await service.createAction({ title: 'Ação', responsible_ids: ['member'] });
  assert.equal(created.ok, true);
  assert.equal(created.data.id, 'saved');
  assert.match(created.warning, /responsáveis/);
  rpcMode = 'throw';
  const updated = await service.updateAction('saved', { responsible_ids: ['member'] });
  assert.equal(updated.ok, true);
  assert.match(updated.warning, /responsáveis/);
  delete globalThis.__actionTest;
});

test('denied environment routes lead to an unguarded selector', async () => {
  const layout = await readFile(new URL('../src/components/layout/AppLayout.tsx', import.meta.url), 'utf8');
  assert.doesNotMatch(layout, /<Navigate to="\/(sharks|client)"/);
  assert.equal((layout.match(/to="\/select-environment"/g) ?? []).length, 4);
});
