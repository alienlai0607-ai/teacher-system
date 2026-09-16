const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { webcrypto } = require('node:crypto');
const { harness } = require('./system-logic-audit.test.cjs');
const source = name => fs.readFileSync(path.resolve(__dirname, '..', name), 'utf8');
const response = data => ({ status: 200, text: async () => JSON.stringify(data) });
const storage = map => ({ getItem: key => map.get(key) || null, setItem: (key, value) => map.set(key, value), removeItem: key => map.delete(key) });
const pendingEntries = local => [...local].filter(([key]) => key.startsWith('kpi-pending-operation-'));

// Each tab has fresh API state and sessionStorage; only durable localStorage
// survives. Run the real auth module too, including clearSession and redirect.
function tab(actor, local, fetchImpl) {
  const redirects = [];
  let redirect;
  const window = {
    APP_CONFIG: { API_URL: 'https://example.invalid/exec' },
    location: { href: 'https://example.invalid/review/anqin-v2/index.html', replace: url => redirects.push(url) },
    crypto: webcrypto, localStorage: storage(local), sessionStorage: storage(new Map()),
    setTimeout(fn, delay) {
      if (delay === 500) { redirect = fn; return 0; }
      const timer = setTimeout(fn, delay < 5000 ? 0 : delay);
      if (delay >= 5000) timer.unref();
      return timer;
    },
    clearTimeout,
  };
  const context = vm.createContext({ window, localStorage: window.localStorage, URL, AbortController, TextEncoder,
    document: { currentScript: { src: 'https://example.invalid/shared/auth.js' } },
    console: { warn() {}, error() {} }, fetch: fetchImpl });
  vm.runInContext(source('shared/auth.js'), context);
  window.AUTH.setSession(actor);
  vm.runInContext(source('shared/api.js'), context);
  return { ...window, redirects, finishRedirect: () => redirect?.() };
}

// Reuse the existing isolated caller harness: the functions under test are
// extracted directly from the production anqin app, not copies of its logic.
const callerHarness = vm.createContext({ require, __dirname, console, setTimeout, clearTimeout });
const callerTest = fs.readFileSync(path.join(__dirname, 'anqin-submit-recovery.test.cjs'), 'utf8');
vm.runInContext(callerTest.slice(0, callerTest.indexOf('(async () => {')) + '\nglobalThis.makeSubmitContext = submitContext;', callerHarness);

(async () => {
  let scenarios = 0;
  for (const code of ['AUTH_EXPIRED', 'AUTH_INVALID']) {
    for (const throughMissingAuth of [false, true]) {
      const { c } = harness();
      const user = c.findUserByNickname('north');
      const actor = { ...user, session_token: c.issueSessionToken_(user) };
      c.appendRow('DailyLogs', { log_id: 'auth-recovery-log', nickname: 'north' });
      const input = { log_id: 'auth-recovery-log', to_nickname: 'northBoss', content: 'SYNTHETIC_PRIVATE_TEXT' };
      const local = new Map([['synthetic-workspace-draft', JSON.stringify({ pending: input, newerText: 'new local edit' })]]);
      const originalDraft = local.get('synthetic-workspace-draft');
      const writes = [];
      const first = tab(actor, local, async (_url, init) => {
        const payload = JSON.parse(init.body);
        if (payload.action !== 'addFeedback') throw new Error('receipt unavailable');
        writes.push(payload);
        assert.equal(c.handleRequest({ postData: { contents: init.body } }, 'POST').ok, true);
        throw new Error('response lost after commit');
      });
      assert.equal((await first.API.addFeedback(input)).uncertain, true);
      assert.equal(c.sheetToObjects('Feedback').length, 1);
      const originalPending = pendingEntries(local);
      assert.equal(originalPending.length, 1);

      const authRequests = [];
      const expired = tab(actor, local, async (_url, init) => {
        const payload = JSON.parse(init.body);
        authRequests.push(payload);
        if (payload.action === 'getSessionIdentity') return response({ ok: false, code });
        assert.equal(payload.action, 'addFeedback');
        writes.push(payload);
        return response({ ok: false, code: throughMissingAuth ? 'AUTH_REQUIRED' : code });
      });
      const result = await expired.API.addFeedback(input);
      assert.equal(result.code, code);
      assert.equal(result.uncertain, true, 'A rejected retry cannot disprove the earlier commit');
      assert.equal(result.request_id, writes[0].request_id);
      assert.deepEqual(pendingEntries(local), originalPending, 'Keep the original operation through forced login');
      assert.equal(expired.AUTH.getSession(), null, 'Real auth failure must still clear the invalid session');
      expired.finishRedirect();
      assert.equal(expired.redirects.length, 1);
      assert.match(expired.redirects[0], /\/index\.html\?return=review%2Fanqin-v2%2Findex\.html$/);
      assert.equal(local.get('synthetic-workspace-draft'), originalDraft, 'Clearing auth cannot clear the draft');
      assert.equal(authRequests.length, throughMissingAuth ? 2 : 1, 'Do not poll receipts with a known-invalid session');
      const serialized = JSON.stringify(pendingEntries(local));
      assert.ok(!serialized.includes(input.content) && !serialized.includes(actor.session_token));

      const relogged = tab({ ...actor, session_token: c.issueSessionToken_(user) }, local, async (_url, init) => {
        writes.push(JSON.parse(init.body));
        return response(c.handleRequest({ postData: { contents: init.body } }, 'POST'));
      });
      assert.equal((await relogged.API.addFeedback(input)).ok, true);
      assert.equal(c.sheetToObjects('Feedback').length, 1, 'Relogin must recover the receipt instead of adding a duplicate');
      assert.equal(new Set(writes.map(payload => payload.request_id)).size, 1);
      assert.equal(pendingEntries(local).length, 0);
      assert.equal(local.get('synthetic-workspace-draft'), originalDraft);
      scenarios++;
    }
  }

  for (const code of ['AUTH_EXPIRED', 'AUTH_INVALID']) {
    for (const throughMissingAuth of [false, true]) {
      const { c } = harness();
      const user = c.findUserByNickname('north');
      const actor = { ...user, session_token: c.issueSessionToken_(user) };
      const local = new Map();
      let calls = 0;
      const first = tab(actor, local, async (_url, init) => {
        calls++;
        const payload = JSON.parse(init.body);
        return response({ ok: false, code: throughMissingAuth && payload.action !== 'getSessionIdentity' ? 'AUTH_REQUIRED' : code });
      });
      const result = await first.API.addFeedback({ log_id: 'not-written', content: 'synthetic' });
      assert.equal(result.code, code);
      assert.notEqual(result.uncertain, true, 'First definite rejection must not manufacture an unknown write');
      assert.equal(c.sheetToObjects('Feedback').length, 0);
      assert.equal(pendingEntries(local).length, 0);
      assert.equal(first.AUTH.getSession(), null);
      first.finishRedirect();
      assert.equal(first.redirects.length, 1);
      assert.equal(calls, throughMissingAuth ? 2 : 1);
      scenarios++;
    }
  }

  // Real daily caller + real API/auth: retain the exact submitted snapshot and
  // revision, preserve later edits, then confirm the old version after login.
  const { c } = harness();
  const user = c.findUserByNickname('north');
  const actor = { ...user, session_token: c.issueSessionToken_(user) };
  const local = new Map();
  const sent = [];
  let phase = 'lost';
  const transport = async (_url, init) => {
    const payload = JSON.parse(init.body);
    if (payload.action !== 'saveLog') throw new Error('receipt unavailable');
    sent.push(payload);
    if (phase === 'lost') throw new Error('response lost');
    if (phase === 'expired') return response({ ok: false, code: 'AUTH_EXPIRED' });
    return response({ ok: true, log_id: 'LOG', revision: 'confirmed-revision' });
  };
  let browser = tab(actor, local, transport);
  const caller = callerHarness.makeSubmitContext({ save: payload => browser.API.saveLog(payload) });
  await caller.submitDailyRequest();
  const original = JSON.stringify(caller.state.integration.pendingDailySubmission);
  caller.state.daily.summary.teacherNote = 'new edit after original submission';
  phase = 'expired';
  browser = tab(actor, local, transport);
  await caller.submitDailyRequest();
  assert.equal(JSON.stringify(caller.state.integration.pendingDailySubmission), original);
  assert.equal(caller.receipts.length, 0);
  assert.equal(browser.AUTH.getSession(), null);
  browser.finishRedirect();
  assert.equal(browser.redirects.length, 1);
  phase = 'confirmed';
  browser = tab({ ...actor, session_token: c.issueSessionToken_(user) }, local, transport);
  await caller.submitDailyRequest();
  assert.equal(caller.state.integration.pendingDailySubmission, undefined);
  assert.equal(caller.state.daily.summary.teacherNote, 'new edit after original submission');
  assert.equal(caller.state.daily.status, 'draft', 'New local edits still need their own submission');
  assert.equal(caller.receipts.length, 1);
  assert.deepEqual(sent.map(({ session_token, ...payload }) => payload), Array(3).fill(sent[0]).map(({ session_token, ...payload }) => payload));
  assert.equal(pendingEntries(local).length, 0);
  console.log(`PASS: ${scenarios + 1} auth recovery flows; prior unknown receipt and daily payload survive login, first auth rejection remains definite.`);
})().catch(error => { console.error(error); process.exitCode = 1; });
