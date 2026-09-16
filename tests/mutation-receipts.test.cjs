const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { webcrypto } = require('node:crypto');
const { harness } = require('./system-logic-audit.test.cjs');
const source = fs.readFileSync(path.resolve(__dirname, '../shared/api.js'), 'utf8');
const { c, request } = harness();
const compressed = c.Utilities.gzip(c.Utilities.newBlob('{"ok":true}', 'application/json')).getBytes();
assert.throws(() => c.Utilities.ungzip(c.Utilities.newBlob(compressed)), /non-null content type/, 'Match the real Google Blob contract');
assert.equal(JSON.parse(c.Utilities.ungzip(c.Utilities.newBlob(compressed, 'application/gzip')).getDataAsString()).ok, true);
const actor = c.findUserByNickname('north');
const params = { action: 'saveSelfTask', request_id: 'receipt-task-1', nickname: 'north', task: { id: 'receipt-task', title: 'original', dueDate: '2026-09-12', status: 'open' } };
const first = request('north', 'saveSelfTask', params);
assert.equal(first.ok, true, first.error);
assert.equal(request('north', 'getMutationReceipt', { mutation_action: params.action, mutation_id: params.request_id }).state, 'done');
assert.equal(request('east', 'getMutationReceipt', { mutation_action: params.action, mutation_id: params.request_id }).state, 'not_found');
assert.deepEqual(request('north', params.action, params), first);
const unicodeResult = { ok: true, text: '老師紀錄：空白  & <原文>\n下次確認。'.repeat(80), nested: { blank: '', count: 0, done: false } };
const unicodeParams = { request_id: 'unicode-receipt', __actor: actor };
c.executeWithMutationReceipt_('saveWeekly', unicodeParams, () => unicodeResult);
assert.equal(JSON.stringify(c.executeWithMutationReceipt_('saveWeekly', unicodeParams, () => assert.fail('Do not rewrite a completed receipt'))), JSON.stringify(unicodeResult));
assert.equal(request('north', params.action, { ...params, task: { ...params.task, title: 'must not overwrite' } }).code, 'REQUEST_ID_CONFLICT');
assert.equal(c.findObject('Tasks', 'task_id', params.task.id).title, 'original');

let calls = 0;
const pending = { action: 'saveWeekly', request_id: 'nested-pending', __actor: actor };
const completed = c.executeWithMutationReceipt_(pending.action, pending, () => {
  calls++;
  const again = c.executeWithMutationReceipt_(pending.action, pending, () => { calls++; });
  assert.equal(again.code, 'OPERATION_PENDING');
  return { ok: true, written: 'once' };
});
assert.equal(completed.ok, true);
assert.equal(calls, 1, 'pending mutations cannot be replayed concurrently');
assert.equal(c.executeWithMutationReceipt_(pending.action, pending, () => { calls++; }).written, 'once');
assert.equal(calls, 1);

const interrupted = { action: 'saveWeekly', request_id: 'partial-write', __actor: actor };
let partialWrites = 0;
assert.equal(c.executeWithMutationReceipt_(interrupted.action, interrupted, () => { partialWrites++; throw new Error('failure after commit'); }).uncertain, true);
assert.equal(c.executeWithMutationReceipt_(interrupted.action, interrupted, () => { partialWrites++; }).code, 'OPERATION_INTERRUPTED');
assert.equal(partialWrites, 1);
const corrupt = c.findMutationReceipt_(c.mutationReceiptSheet_(false), c.receiptDigest_([c.receiptActorKey_(actor), interrupted.action, interrupted.request_id]));
c.mutationReceiptSheet_(false).getRange(corrupt.row, 7).setValue('not-gzip');
assert.equal(c.executeWithMutationReceipt_(interrupted.action, interrupted, () => { partialWrites++; }).uncertain, true);
assert.equal(partialWrites, 1, 'corrupt receipt must not cause replay');

const safeBusy = { action: 'saveSelfTask', request_id: 'safe-busy', __actor: actor };
let busyCalls = 0;
const noWrite = c.executeWithMutationReceipt_(safeBusy.action, safeBusy, () => { busyCalls++; return { ok: false, code: 'WRITE_BUSY', retry_safe: true }; });
assert.equal(noWrite.retry_safe, true);
const retryBusy = c.executeWithMutationReceipt_(safeBusy.action, safeBusy, () => {
  busyCalls++;
  assert.equal(c.executeWithMutationReceipt_(safeBusy.action, safeBusy, () => assert.fail('Concurrent retry executed')).code, 'OPERATION_PENDING');
  return { ok: true, saved: 'only-once' };
});
assert.equal(retryBusy.ok, true);
assert.equal(c.executeWithMutationReceipt_(safeBusy.action, safeBusy, () => assert.fail('Completed retry replayed')).saved, 'only-once');
assert.equal(busyCalls, 2);
for (const response of [{ ok: false, code: 'WRITE_BUSY' }, { ok: false, code: 'WRITE_BUSY', retry_safe: true, uncertain: true }]) {
  const id = 'unsafe-busy-' + JSON.stringify(response);
  c.executeWithMutationReceipt_('saveWeekly', { __actor: actor, request_id: id }, () => response);
  c.executeWithMutationReceipt_('saveWeekly', { __actor: actor, request_id: id }, () => assert.fail('Ambiguous busy cannot replay'));
}
const gzip = c.Utilities.gzip;
c.Utilities.gzip = () => { throw new Error('simulated receipt storage failure'); };
const savedWithoutReceipt = c.executeWithMutationReceipt_('saveWeekly', { __actor: actor, request_id: 'receipt-storage-failed' }, () => ({ ok: true, saved: true }));
assert.equal(savedWithoutReceipt.ok, true, 'receipt failure must not erase a known successful save');
c.Utilities.gzip = gzip;
assert.equal(c.getMutationReceipt({ __actor: actor, mutation_action: 'saveWeekly', mutation_id: 'receipt-storage-failed' }).state, 'pending');

const runId = 'QA-RELEASE-11111111-1111-1111-1111-111111111111';
c.executeWithMutationReceipt_('saveWeekly', { __actor: actor, request_id: runId + '-receipt' }, () => ({ ok: true }));
c.cleanupReleaseReceipts_(runId);
assert.equal(c.getMutationReceipt({ __actor: actor, mutation_action: 'saveWeekly', mutation_id: runId + '-receipt' }).state, 'not_found');
assert.equal(c.getMutationReceipt({ __actor: actor, mutation_action: params.action, mutation_id: params.request_id }).state, 'done', 'QA cleanup must retain ordinary receipts');

const cleanupRun = 'QA-RELEASE-22222222-2222-2222-2222-222222222222';
c.executeWithMutationReceipt_('saveWeekly', { __actor: actor, request_id: cleanupRun + '-old' }, () => ({ ok: true }));
const fixedRowsBefore = c.mutationReceiptSheet_(false).getLastRow();
c.executeWithMutationReceipt_('saveWeekly', { __actor: actor, request_id: 'live-row-after-cleanup' }, () => {
  c.cleanupReleaseReceipts_(cleanupRun);
  assert.equal(c.mutationReceiptSheet_(false).getLastRow(), fixedRowsBefore + 1, 'Cleanup must not shift an in-flight receipt row');
  return { ok: true, saved: 'stable-row' };
});
assert.equal(c.getMutationReceipt({ __actor: actor, mutation_action: 'saveWeekly', mutation_id: 'live-row-after-cleanup' }).result.saved, 'stable-row');
c.executeWithMutationReceipt_('saveWeekly', { __actor: actor, request_id: cleanupRun + '-pending' }, () => {
  assert.throws(() => c.cleanupReleaseReceipts_(cleanupRun), /仍在處理/);
  return { ok: true };
});
const contention = harness();
const contentionActor = contention.c.findUserByNickname('north');
const committed = contention.c.executeWithMutationReceipt_('saveWeekly', { __actor: contentionActor, request_id: 'finalize-under-contention' }, () => {
  contention.denyLock(true);
  return { ok: true, committed: true };
});
assert.equal(committed.ok, true);
assert.equal(contention.c.getMutationReceipt({ __actor: contentionActor, mutation_action: 'saveWeekly', mutation_id: 'finalize-under-contention' }).state, 'done', 'Another writer must not block receipt finalization');
contention.denyLock(false);
contention.c.SpreadsheetApp.flush = () => { throw new Error('flush failure'); };
assert.throws(() => contention.c.withRecordWriteLock_(() => ({ ok: true })), /flush failure/);
assert.equal(contention.locked(), false, 'Failed flush must still release lock');
let admissionCallbacks = 0;
const admissionError = contention.c.executeWithMutationReceipt_('saveWeekly', { __actor: contentionActor, request_id: 'admission-confirmation-lost' }, () => { admissionCallbacks++; return { ok: true }; });
assert.equal(admissionError.code, 'OPERATION_INTERRUPTED');
assert.equal(admissionError.uncertain, true, 'Admission service error must not discard the client operation ID');
assert.equal(admissionCallbacks, 0);
assert.equal(contention.locked(), false);

c.reportClientMetrics({ __actor: actor, events_batch: [
  { kind: 'attempt', action: 'saveSelfTask', ok: false, code: 'HTTP_ERROR', status: 404, stage: 'redirected_response', ms: 12000, session_token: 'never-store' },
  { kind: 'operation', action: 'saveSelfTask', ok: true, recovered: true, ms: 18000 }
] });
const metrics = c.getReliabilityMetrics_();
assert.equal(metrics.actions.saveSelfTask.failures, 0);
assert.equal(metrics.actions.saveSelfTask.recovered, 1);
assert.equal(metrics.attempts.saveSelfTask.failures, 1);
assert.ok(!JSON.stringify(c.sheetToObjects('ClientMetrics')).includes('never-store'));
assert.equal(c.getMutationReceipt({ __actor: { ...actor, department: 'changed' }, mutation_action: pending.action, mutation_id: pending.request_id }).state, 'not_found');
assert.equal(c.getMutationReceipt({ mutation_action: pending.action, mutation_id: pending.request_id }).code, 'AUTH_REQUIRED');

const frontActions = source.match(/const RECEIPTED_ACTIONS = new Set\(\[([\s\S]*?)\]\)/)[1].match(/'([^']+)'/g).map(item => item.slice(1, -1));
assert.deepEqual(frontActions.sort(), Array.from(vm.runInContext('Array.from(RECEIPTED_ACTIONS_)', c)).sort());

async function integratedRecovery(loseReceiptToo, busyCount = 0) {
  const token = c.issueSessionToken_(actor);
  const requests = [];
  let originalExecutions = 0;
  const original = c.saveSelfTask;
  c.saveSelfTask = p => { originalExecutions++; return original(p); };
  let lost = false;
  let attemptedWrites = 0;
  const storage = new Map();
  const window = {
    APP_CONFIG: { API_URL: 'https://example.invalid/exec' },
    AUTH: { getSession: () => ({ ...actor, session_token: token }), isImpersonating: () => false },
    crypto: webcrypto,
    sessionStorage: { getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) },
    setTimeout: (fn, delay) => { const timer = setTimeout(fn, delay < 5000 ? 0 : delay); if (delay >= 5000) timer.unref(); return timer; }, clearTimeout,
  };
  const context = vm.createContext({ window, URL, AbortController, TextEncoder, console: { warn() {}, error() {} }, fetch: async (_url, init) => {
    const payload = JSON.parse(init.body);
    requests.push(payload);
    if (payload.action === 'saveSelfTask' && attemptedWrites++ < busyCount) {
      return { status: 200, text: async () => JSON.stringify({ ok: false, code: 'WRITE_BUSY', retry_safe: true }) };
    }
    const result = c.handleRequest({ postData: { contents: init.body } }, 'POST');
    if (payload.action === 'saveSelfTask' && !lost) { lost = true; throw new Error('Google response lost AFTER real handler committed'); }
    if (payload.action === 'getMutationReceipt' && loseReceiptToo) throw new Error('receipt delivery also interrupted');
    return { status: 200, text: async () => JSON.stringify(result) };
  } });
  vm.runInContext(source, context);
  const input = { nickname: 'north', task: { id: 'integrated-' + loseReceiptToo + '-' + busyCount, title: 'real handler write', dueDate: '2026-09-12', status: 'open' } };
  let result = await window.API.saveSelfTask(input);
  if (loseReceiptToo) {
    assert.equal(result.uncertain, true);
    assert.equal(storage.size, 1);
    assert.ok(!JSON.stringify(Array.from(storage)).includes(token));
    assert.ok(!JSON.stringify(Array.from(storage)).includes(input.task.title));
    vm.runInContext(source, context); // Simulate a page reload: all API in-memory maps are gone.
    result = await window.API.saveSelfTask(input);
    const ids = requests.filter(p => p.action === 'saveSelfTask').map(p => p.request_id);
    assert.equal(new Set(ids).size, 1, 'manual retry of an unknown result must retain the operation ID');
  } else assert.equal(result.recovered, true);
  assert.equal(result.ok, true);
  assert.equal(storage.size, 0);
  assert.equal(originalExecutions, 1, 'response recovery must not repeat the business write');
  assert.equal(new Set(requests.filter(p => p.action === 'saveSelfTask').map(p => p.request_id)).size, 1);
  assert.equal(requests.filter(p => p.action === 'saveSelfTask').length, busyCount + (loseReceiptToo ? 2 : 1), 'Only explicit zero-write responses permit automatic retry');
  if (!loseReceiptToo) assert.ok(window.API.getTransportDiagnostics().some(item => !item.ok));
  assert.ok(!JSON.stringify(window.API.getTransportDiagnostics()).includes(token));
  c.saveSelfTask = original;
}

(async () => {
  await integratedRecovery(false);
  await integratedRecovery(true);
  await integratedRecovery(false, 2);
  console.log('mutation-receipts.test.cjs passed: real router, typed Sheets, lost responses, exactly-once admission and privacy');
})().catch(error => { console.error(error); process.exitCode = 1; });
