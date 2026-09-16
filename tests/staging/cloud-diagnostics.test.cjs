const fs = require('node:fs');
const vm = require('node:vm');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const sleeps = [];
const context = vm.createContext({ Utilities: {
  DigestAlgorithm: { SHA_256: 'sha256' },
  computeDigest: (algorithm, body) => [...crypto.createHash(algorithm).update(body).digest()],
  sleep: delay => sleeps.push(delay),
} });
vm.runInContext(fs.readFileSync(`${__dirname}/cloud-acceptance.gs`, 'utf8'), context);
function decode(body, status = 200, mime = 'application/json') {
  return context.qaStageDecodeResponse_({ getContentText: () => body, getResponseCode: () => status, getHeaders: () => ({ 'content-TYPE': mime }) });
}
assert.equal(decode('\uFEFF{"ok":true}').data.ok, true);
for (const body of ['null', '{}', '[]', '<html><title>Service unavailable</title></html>']) {
  const result = decode(body);
  assert.equal(result.data.code, 'NON_JSON');
  assert.equal(result.diagnostic.http_status, 200);
  assert.equal(result.diagnostic.body_sha256.length, 64);
}
const unavailable = decode('<title>Service unavailable</title>', 503, 'text/html');
assert.equal(unavailable.data.code, 'HTTP_ERROR');
assert.equal(unavailable.diagnostic.html_title, 'Service unavailable');
assert.equal(unavailable.diagnostic.content_type, 'text/html');
assert.equal(decode('{"ok":true}', 500).data.ok, false);
let calls = [];
const recovered = context.qaStageReadWithRecovery_((label, action, payloads, indexes) => {
  calls.push({ label, payloads, indexes });
  return calls.length === 1 ? [{ ok: true, value: 1 }, { ok: false, code: 'NON_JSON' }] : [{ ok: true, value: 2 }];
}, 'receipt', 'getMutationReceipt', ['first', 'second']);
assert.equal(recovered[0].value, 1);
assert.equal(recovered[1].value, 2);
assert.deepEqual(Array.from(calls[1].indexes), [1]);
assert.deepEqual(Array.from(calls[1].payloads), ['second']);
assert.deepEqual(sleeps, [700]);
calls = [];
const failed = context.qaStageReadWithRecovery_((label) => {
  calls.push(label); return [{ ok: false, code: 'HTTP_ERROR' }];
}, 'receipt', 'getMutationReceipt', ['one']);
assert.equal(calls.length, 3);
assert.equal(failed[0].ok, false);
assert.throws(() => context.qaStageReadWithRecovery_(() => { throw new Error('must not execute'); }, 'write', 'saveLog', []), /reads only/);
calls = [];
context.qaStageReadWithRecovery_((label) => { calls.push(label); return [{ ok: false, code: 'AUTH_INVALID' }]; }, 'auth', 'getLog', [{}]);
assert.equal(calls.length, 1);
console.log('PASS: QA diagnostics retain HTTP/MIME/hash; bounded read recovery keeps failed attempts, indexes, and never replays mutations or auth failures.');
