const assert = require('node:assert/strict');
const { harness } = require('./system-logic-audit.test.cjs');

// Google Sheets appendRow treats a leading '=' as a formula. Request IDs are
// opaque metadata, so reject them before either receipt or business writes.
// https://developers.google.com/apps-script/reference/spreadsheet/sheet#appendrowrowcontents
for (const requestId of ['=1+1', '  =1+1', '\t=1+1', '\r\n=1+1']) {
  const { c, request } = harness();
  const result = request('north', 'saveSelfTask', {
    request_id: requestId,
    task: { id: 'formula-id-guard', title: 'QA receipt safety', status: 'open' },
  });
  assert.equal(result.code, 'INVALID_REQUEST_ID', 'Formula-like IDs must fail before Sheet writes');
  assert.equal(c.mutationReceiptSheet_(false), undefined, 'Invalid IDs must not create a receipt sheet');
  assert.equal(c.findObject('Tasks', 'task_id', 'formula-id-guard'), null, 'Invalid IDs must not execute the mutation');
}

const { c, request } = harness();
for (const requestId of ['daily-submit-123_test', 'legacy:opaque={id}', 'req:literal=1+1']) {
  const task = { id: requestId, title: 'Original text', status: 'open' };
  const first = request('north', 'saveSelfTask', { request_id: requestId, task });
  assert.equal(first.ok, true, 'Keep valid existing opaque ID formats');
  assert.deepEqual(request('north', 'saveSelfTask', { request_id: requestId, task }), first);
  const receipt = request('north', 'getMutationReceipt', { mutation_action: 'saveSelfTask', mutation_id: requestId });
  assert.equal(receipt.state, 'done');
  assert.equal(receipt.result.updated_at, first.updated_at);
}
assert.equal(c.sheetToObjects('Tasks').length, 3);
console.log('PASS: formula-like receipt IDs rejected before writes; existing opaque IDs retain exact replay and readback.');
