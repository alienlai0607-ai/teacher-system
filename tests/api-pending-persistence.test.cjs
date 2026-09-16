const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { webcrypto, createHash } = require('node:crypto');
const { harness } = require('./system-logic-audit.test.cjs');
const source = fs.readFileSync(path.resolve(__dirname, '../shared/api.js'), 'utf8');
const storage = map => ({ getItem: key => map.get(key) || null, setItem: (key, value) => map.set(key, value), removeItem: key => map.delete(key) });
function tab(actor, local, session, fetchImpl) {
  const window = {
    APP_CONFIG: { API_URL: 'https://example.invalid/exec' },
    AUTH: { getSession: () => actor, isImpersonating: () => false },
    crypto: webcrypto, localStorage: storage(local), sessionStorage: storage(session),
    setTimeout: (fn, delay) => { const timer = setTimeout(fn, delay < 5000 ? 0 : delay); if (delay >= 5000) timer.unref(); return timer; }, clearTimeout,
  };
  vm.runInContext(source, vm.createContext({ window, URL, AbortController, TextEncoder, console: { warn() {}, error() {} }, fetch: fetchImpl }));
  return window;
}
const response = data => ({ status: 200, text: async () => JSON.stringify(data) });
const keyFor = (actor, action, params) => 'kpi-pending-operation-' + createHash('sha256').update(JSON.stringify([actor.nickname, actor.email, actor.role, actor.department, action, params])).digest('hex');

(async () => {
  const { c } = harness();
  const user = c.findUserByNickname('north');
  const actor = { ...user, session_token: c.issueSessionToken_(user) };
  const local = new Map();
  const firstSession = new Map();
  const input = { nickname: 'north', task: { id: 'close-tab-task', title: 'PRIVATE_TEXT_SENTINEL', status: 'open' } };
  const requests = [];
  let businessWrites = 0;
  const save = c.saveSelfTask;
  c.saveSelfTask = p => { businessWrites++; return save(p); };
  const firstTab = tab(actor, local, firstSession, async (_url, init) => {
    const payload = JSON.parse(init.body);
    requests.push(payload);
    if (payload.action === 'getMutationReceipt') throw new Error('receipt unavailable');
    c.handleRequest({ postData: { contents: init.body } }, 'POST');
    throw new Error('response lost after commit');
  });
  assert.equal((await firstTab.API.saveSelfTask(input)).uncertain, true);
  assert.equal(businessWrites, 1);
  assert.equal(local.size, 1, 'Pending operation must survive a closed tab');
  const raw = JSON.stringify([...local]);
  assert.ok(!raw.includes(input.task.title) && !raw.includes(actor.session_token) && !raw.includes(actor.nickname) && !raw.includes(actor.email));
  assert.deepEqual(Object.keys(JSON.parse([...local.values()][0])), ['id']);

  // A closed tab destroys its JS context and sessionStorage. Only localStorage is
  // carried into this entirely new API instance, with a freshly signed session.
  const nextSession = new Map();
  const nextTab = tab({ ...actor, session_token: c.issueSessionToken_(user) }, local, nextSession, async (_url, init) => {
    requests.push(JSON.parse(init.body));
    return response(c.handleRequest({ postData: { contents: init.body } }, 'POST'));
  });
  assert.equal((await nextTab.API.saveSelfTask(input)).ok, true);
  assert.equal(businessWrites, 1, 'Reopening and retrying must reuse the durable receipt');
  assert.equal(new Set(requests.filter(p => p.action === 'saveSelfTask').map(p => p.request_id)).size, 1);
  assert.equal(local.size, 0);
  assert.equal(nextSession.size, 0);

  // Legacy session-only entries migrate before dispatch; malformed local data
  // does not hide a valid old entry, and a known outcome clears both stores.
  const logInput = { nickname: 'north', date: '2026-09-16', reflection: 'PRIVATE_LOG_SENTINEL' };
  const legacyKey = keyFor(actor, 'saveLog', logInput);
  const legacy = { id: 'legacy-request-id', baseRevision: 'original-revision' };
  const legacyLocal = new Map([[legacyKey, '{invalid-json']]);
  const legacySession = new Map([[legacyKey, JSON.stringify(legacy)]]);
  const migrated = tab(actor, legacyLocal, legacySession, async (_url, init) => {
    const payload = JSON.parse(init.body);
    if (payload.action === 'saveLog') {
      assert.equal(payload.request_id, legacy.id);
      assert.equal(payload.base_revision, legacy.baseRevision);
      assert.deepEqual(JSON.parse(legacyLocal.get(legacyKey)), legacy, 'Promote legacy entry before the write');
      return response({ ok: true, log_id: 'log', revision: 'confirmed' });
    }
    throw new Error('unexpected request');
  });
  assert.equal((await migrated.API.saveLog(logInput)).ok, true);
  assert.equal(legacyLocal.size, 0);
  assert.equal(legacySession.size, 0);

  // Same nickname under another identity must not inherit the previous ID.
  const isolatedLocal = new Map([[keyFor(actor, 'saveSelfTask', input), JSON.stringify({ id: 'other-owner-request' })]]);
  const differentActor = { ...actor, email: 'other-owner@example.invalid' };
  let isolatedId;
  const isolated = tab(differentActor, isolatedLocal, new Map(), async (_url, init) => {
    isolatedId = JSON.parse(init.body).request_id;
    return response({ ok: true });
  });
  await isolated.API.saveSelfTask(input);
  assert.notEqual(isolatedId, 'other-owner-request');
  assert.equal(isolatedLocal.size, 1, 'Another identity cannot remove the original pending operation');

  // localStorage may be disabled; keep the existing in-tab fallback functional.
  const fallbackSession = new Map();
  const fallback = tab(actor, new Map(), fallbackSession, async () => { throw new Error('offline'); });
  Object.defineProperty(fallback, 'localStorage', { get() { throw new Error('storage denied'); } });
  assert.equal((await fallback.API.saveSelfTask(input)).uncertain, true);
  assert.equal(fallbackSession.size, 1);
  console.log('PASS: closed-tab retry preserves request ID and one backend write; legacy migration, revision, cleanup, identity isolation and storage-denied fallback.');
})().catch(error => { console.error(error); process.exitCode = 1; });
