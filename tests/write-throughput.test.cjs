const assert = require('node:assert/strict');
const { harness } = require('./system-logic-audit.test.cjs');

const h = harness();
const { c, request } = h;
const task = { id: 'throughput-owner', title: 'Original\n  & <text>', dueDate: '2026-09-12', status: 'open' };
const input = { request_id: 'throughput-create', task };
const first = request('north', 'saveSelfTask', input);
assert.equal(first.ok, true);

// A finished operation is a read, even while a different request owns the lock.
h.denyLock(true);
assert.deepEqual(request('north', 'saveSelfTask', input), first);
assert.equal(request('north', 'saveSelfTask', { ...input, task: { ...task, title: 'Different payload' } }).code, 'REQUEST_ID_CONFLICT');
const denied = request('north', 'saveSelfTask', { request_id: 'throughput-new', task: { ...task, id: 'not-created' } });
assert.equal(denied.code, 'WRITE_BUSY');
assert.equal(denied.retry_safe, true);
assert.equal(c.findObject('Tasks', 'task_id', 'not-created'), null);
h.denyLock(false);

// An optimistic receipt miss must be rechecked after acquiring the write lock.
const findReceipt = c.findMutationReceipt_;
let reads = 0;
c.findMutationReceipt_ = (sheet, key) => ++reads === 1 ? null : findReceipt(sheet, key);
assert.deepEqual(request('north', 'saveSelfTask', input), first);
assert.equal(reads, 2);
c.findMutationReceipt_ = findReceipt;

let failedRead = false;
c.findMutationReceipt_ = (sheet, key) => {
  if (!failedRead) { failedRead = true; throw new Error('Optional read unavailable'); }
  return findReceipt(sheet, key);
};
assert.deepEqual(request('north', 'saveSelfTask', input), first);
c.findMutationReceipt_ = findReceipt;

// Preserve unknown cells and reuse only a fresh snapshot from inside this lock.
const sheet = c.getSheet('Tasks');
c.ensureHeaders(sheet, ['custom_number', 'custom_flag', 'custom_date']);
const date = new Date('2026-09-10T00:00:00.000Z');
c.updateRow('Tasks', 2, { custom_number: 0, custom_flag: false, custom_date: date });
const originalGetRange = sheet.getRange;
let taskReads = 0;
let taskWrites = 0;
sheet.getRange = (...args) => {
  const range = originalGetRange(...args);
  const getValues = range.getValues;
  const setValues = range.setValues;
  range.getValues = () => { if (h.locked()) taskReads++; return getValues(); };
  range.setValues = values => { assert.equal(h.locked(), true); taskWrites++; return setValues.call(range, values); };
  return range;
};
const update = request('north', 'saveSelfTask', { request_id: 'throughput-done', task: { ...task, status: 'done', cloudUpdatedAt: first.updated_at } });
assert.equal(update.ok, true);
assert.equal(taskReads, 3, 'One header, one ID column, one current row; no repeated row/header reads');
assert.equal(taskWrites, 1);
sheet.getRange = originalGetRange;
const stored = c.findObject('Tasks', 'task_id', task.id);
assert.equal(stored.title, task.title);
assert.equal(stored.status, 'done');
assert.equal(stored.custom_number, 0);
assert.equal(stored.custom_flag, false);
assert.equal(stored.custom_date.getTime(), date.getTime());
assert.equal(request('north', 'saveSelfTask', { request_id: 'throughput-stale', task: { ...task, cloudUpdatedAt: first.updated_at } }).code, 'RECORD_CONFLICT');
assert.equal(request('east', 'saveSelfTask', { request_id: 'throughput-other', task: { ...task, cloudUpdatedAt: update.updated_at } }).ok, false);
assert.equal(request('north', 'getMutationReceipt', { mutation_action: 'saveSelfTask', mutation_id: 'throughput-done' }).state, 'done');
assert.equal(c.sheetToObjects('Tasks').length, 1);

// A browser-supplied actor must never be trusted by the new fast path.
const forged = request('east', 'saveSelfTask', { ...input, __actor: c.findUserByNickname('north'), nickname: 'north' });
assert.equal(forged.ok, false);
assert.equal(c.findObject('Tasks', 'task_id', task.id).assignee, 'north');
console.log('PASS: completed receipts bypass contention; new writes recheck under lock; task writes use 3 reads, preserve unknown cells, ownership and revisions.');
