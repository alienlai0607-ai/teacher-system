const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const app = fs.readFileSync(path.resolve(__dirname, '../review/anqin-v2/app.js'), 'utf8');
const section = (from, to) => {
  const start = app.indexOf(from);
  const end = app.indexOf(to, start);
  assert.ok(start >= 0 && end > start, `source section: ${from}`);
  return app.slice(start, end);
};
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
const settle = async () => { for (let index = 0; index < 12; index++) await Promise.resolve(); };
const copy = value => JSON.parse(JSON.stringify(value));
let passed = 0;
const failures = [];
async function test(name, fn) {
  try { await fn(); passed++; console.log(`PASS ${name}`); }
  catch (error) { failures.push(name); console.error(`FAIL ${name}: ${error.message}`); }
}

function taskContext(tasks, save) {
  const pendingTaskSyncIds = new Set();
  const context = vm.createContext({
    state: { integration: { cloudSyncEnabled: true }, context: { teacher: 'QA' }, tasks },
    pendingTaskSyncIds, taskSyncTimer: null, taskCloudSyncInFlight: null,
    cloudIdentityReady: () => true, activeTaskRecords: () => tasks,
    persist() {}, window: { clearTimeout, setTimeout }, syncTaskToCloud: save,
  });
  vm.runInContext(section('  async function flushTaskCloudSync()', '  async function syncTasksFromCloud('), context);
  return context;
}

function submitContext(options = {}) {
  const state = {
    integration: { cloudSyncEnabled: true, logRevisions: {} }, context: { teacher: 'QA' },
    daily: { date: '2026-09-15', status: 'draft', submittedAt: '', summary: {} }, submissions: [],
    activities: [], studentCases: [], contacts: [],
  };
  const saved = [];
  const receipts = [];
  const context = vm.createContext({
    state, saved, receipts, clone: copy, removeInlineMedia: copy, dailyCloudConflict: null, uid: () => 'fixed-request-id',
    dailySubmitInFlight: true, cloudDraftTimer: null, cloudDraftInFlight: options.draft || null, localMediaRestoreInFlight: null,
    integrationRuntime: {}, window: { clearTimeout, API: { saveLog() {}, uploadPhoto() {}, uploadFile() {} } },
    $: () => null, dailyKpiOptional: () => false, hasDailyRecords: () => true,
    dailyCompletion: () => 100, todayActivities: () => [], activityComplete: () => true,
    ensureCloudTeacherIdentity: options.identity || (async () => ({ ok: true })),
    createDailySubmissionRecord: () => ({ id: 'submission', date: state.daily.date, teacher: state.context.teacher, status: 'pending', submittedAt: '2026-09-15T12:00:00Z' }),
    buildLegacySubmissionPayload: submission => ({ nickname: submission.teacher, date: submission.date, submitted: true }),
    syncAllTasksToCloud: options.tasks || (async () => ({ ok: true, failed: 0 })),
    uploadFormalEvidence: options.upload || (async () => []),
    API: { saveLog: async payload => { saved.push(copy(payload)); return options.save ? options.save(payload) : options.result || { ok: true, log_id: 'LOG', revision: 'revision' }; } },
    updateSaveIndicator() {}, renderApp() {}, persist() { return options.persist !== false; }, refreshSystemStatusNotice() {},
    toast(message) { context.lastToast = message; },
    showDailySubmissionReceipt(submission) { receipts.push(copy(submission)); },
    finishDailyDelivery: async () => {}, showDailyCloudConflict() {},
    markDailyNeedsResubmit() {
      state.daily.status = 'draft'; state.daily.submittedAt = '';
      const submission = state.submissions.find(item => item.date === state.daily.date && item.teacher === state.context.teacher);
      if (submission) { submission.previousStatus = submission.status; submission.status = 'draft'; }
    },
  });
  vm.runInContext(section('  function dailySubmissionContentSignature(', '  async function submitWeekly()'), context);
  return context;
}

(async () => {
  await test('unchanged saved tasks are not written again during daily submission', async () => {
    const writes = [];
    const tasks = [
      { id: 'saved', owner: 'QA', cloudSyncStatus: 'saved', cloudUpdatedAt: 'revision' },
      { id: 'changed', owner: 'QA', cloudSyncStatus: 'pending' },
      { id: 'other', owner: 'Other', cloudSyncStatus: 'pending' },
    ];
    const context = taskContext(tasks, async task => { writes.push(task.id); return { ok: true }; });
    await context.syncAllTasksToCloud();
    assert.deepEqual(writes, ['changed']);
  });

  await test('one rejected task retains its retry and does not abandon following tasks', async () => {
    const writes = [];
    const tasks = ['lost', 'next'].map(id => ({ id, owner: 'QA', cloudSyncStatus: 'pending' }));
    const context = taskContext(tasks, async task => {
      writes.push(task.id);
      if (task.id === 'lost') throw new Error('connection reset');
      task.cloudSyncStatus = 'saved'; return { ok: true };
    });
    const result = await context.syncAllTasksToCloud();
    assert.deepEqual(writes, ['lost', 'next']);
    assert.equal(result.ok, false);
    assert.equal(result.failed, 1);
    assert.equal(tasks[0].cloudSyncStatus, 'error');
    assert.equal(context.pendingTaskSyncIds.has('lost'), true);
  });

  await test('slow unrelated task sync does not block saving the daily record', async () => {
    const pending = deferred();
    const context = submitContext({ tasks: () => pending.promise });
    const request = context.submitDailyRequest();
    await settle();
    const savedBeforeTasks = context.saved.length;
    pending.resolve({ ok: true, failed: 0 });
    await request;
    assert.equal(savedBeforeTasks, 1);
    assert.equal(context.receipts.length, 1);
    assert.equal(context.state.daily.status, 'submitted');
  });

  await test('switching day while an earlier draft saves does not submit the newly opened day', async () => {
    const pending = deferred();
    const context = submitContext({ draft: pending.promise });
    const request = context.submitDailyRequest();
    context.state.daily.date = '2026-09-16';
    pending.resolve({ ok: true });
    await request;
    assert.equal(context.saved.length, 0);
    assert.equal(context.state.daily.submittedAt, '');
  });

  await test('an uncertain save has no success receipt and does not claim definite failure', async () => {
    const context = submitContext({ result: { ok: false, uncertain: true, code: 'REQUEST_TIMEOUT', error: '尚未取得儲存確認' } });
    await context.submitDailyRequest();
    assert.equal(context.receipts.length, 0);
    assert.equal(context.state.daily.submittedAt, '');
    assert.doesNotMatch(context.lastToast, /送出失敗/);
    assert.equal(context.state.integration.dailyDraftSyncPending, false);
    assert.equal(context.state.integration.pendingDailySubmission.payload.request_id, 'fixed-request-id');
  });

  await test('changing the teacher during identity validation stops before any upload', async () => {
    const pending = deferred(); let uploads = 0;
    const context = submitContext({ identity: () => pending.promise, upload: async () => { uploads++; return []; } });
    const request = context.submitDailyRequest();
    context.state.context.teacher = 'Another teacher';
    pending.resolve({ ok: true });
    await request;
    assert.equal(uploads, 0);
    assert.equal(context.saved.length, 0);
  });

  for (const operation of ['add', 'edit', 'delete']) {
    await test(`${operation} during upload requires confirmation of the newer content`, async () => {
      const pending = deferred();
      const context = submitContext({ upload: () => pending.promise });
      context.state.activities.push({ id: 'activity', date: '2026-09-15', teacher: 'QA', title: 'original' });
      const request = context.submitDailyRequest();
      await settle();
      if (operation === 'add') context.state.activities.push({ id: 'new', date: '2026-09-15', teacher: 'QA', title: 'new photo' });
      if (operation === 'edit') context.state.activities[0].title = 'updated';
      if (operation === 'delete') context.state.activities.splice(0, 1);
      pending.resolve([]);
      await request;
      assert.equal(context.saved.length, 0);
      assert.equal(context.receipts.length, 0);
      assert.match(context.lastToast, /上傳期間內容有修改/);
    });
  }

  await test('failed local persistence prevents the original request and every retry', async () => {
    const context = submitContext({ persist: false });
    await context.submitDailyRequest();
    await context.submitDailyRequest();
    assert.equal(context.saved.length, 0);
    assert.equal(context.receipts.length, 0);
  });

  await test('a new task queued during an active flush receives its own follow-up flush', async () => {
    const pending = deferred(); const writes = [];
    const tasks = [{ id: 'first', owner: 'QA', cloudSyncStatus: 'pending' }];
    const context = taskContext(tasks, async task => {
      writes.push(task.id);
      if (task.id === 'first') await pending.promise;
      task.cloudSyncStatus = 'saved'; return { ok: true };
    });
    const request = context.syncAllTasksToCloud();
    tasks.push({ id: 'next', owner: 'QA', cloudSyncStatus: 'pending' });
    context.pendingTaskSyncIds.add('next');
    const overlapping = context.flushTaskCloudSync();
    pending.resolve();
    await Promise.all([request, overlapping]);
    await new Promise(resolve => setTimeout(resolve, 5));
    assert.deepEqual(writes, ['first', 'next']);
  });

  await test('an expired identity retains pending tasks without a timer retry loop', async () => {
    const tasks = [{ id: 'pending', owner: 'QA', cloudSyncStatus: 'pending' }];
    const context = taskContext(tasks, async () => { throw new Error('must not write'); });
    context.cloudIdentityReady = () => false;
    let scheduled = 0;
    context.window.setTimeout = () => { scheduled++; return 1; };
    await context.syncAllTasksToCloud();
    assert.equal(scheduled, 0);
    assert.equal(context.pendingTaskSyncIds.has('pending'), true);
  });

  await test('reloading after a lost response retries the exact original payload and keeps newer edits', async () => {
    const first = submitContext({ result: { ok: false, uncertain: true, code: 'REQUEST_TIMEOUT' } });
    await first.submitDailyRequest();
    const pending = copy(first.state.integration.pendingDailySubmission);
    const reloaded = submitContext();
    reloaded.state.integration.pendingDailySubmission = pending;
    reloaded.state.daily.summary.teacherNote = 'new local edit after the lost response';
    await reloaded.submitDailyRequest();
    assert.deepEqual(reloaded.saved[0], first.saved[0]);
    assert.equal(reloaded.state.integration.pendingDailySubmission, undefined);
    assert.equal(reloaded.state.daily.summary.teacherNote, 'new local edit after the lost response');
    assert.equal(reloaded.state.daily.status, 'draft');
    assert.equal(reloaded.state.submissions[0].previousStatus, 'pending');
    assert.equal(reloaded.receipts.length, 1);
  });

  await test('new edits made while the save is in flight are not marked as submitted', async () => {
    const pending = deferred();
    const context = submitContext({ save: () => pending.promise });
    const request = context.submitDailyRequest();
    await settle();
    context.state.daily.summary.teacherNote = 'edited while saving';
    pending.resolve({ ok: true, log_id: 'LOG', revision: 'revision' });
    await request;
    assert.equal(context.state.daily.status, 'draft');
    assert.equal(context.state.submissions[0].previousStatus, 'pending');
    assert.equal(context.state.daily.summary.teacherNote, 'edited while saving');
  });

  await test('next-day confirmation resolves only the earlier pending submission', async () => {
    const first = submitContext({ result: { ok: false, uncertain: true } });
    await first.submitDailyRequest();
    const reloaded = submitContext();
    reloaded.state.daily.date = '2026-09-16';
    reloaded.state.daily.summary.teacherNote = 'today stays untouched';
    reloaded.state.integration.pendingDailySubmission = copy(first.state.integration.pendingDailySubmission);
    reloaded.state.submissions.push({ date: '2026-09-15', teacher: 'QA', status: 'draft', teacherNote: 'yesterday newer edit' });
    await reloaded.submitDailyRequest();
    assert.equal(reloaded.saved[0].date, '2026-09-15');
    assert.equal(reloaded.state.daily.submittedAt, '');
    assert.equal(reloaded.state.daily.summary.teacherNote, 'today stays untouched');
    assert.equal(reloaded.state.submissions[0].teacherNote, 'yesterday newer edit');
    assert.equal(reloaded.state.submissions[0].previousStatus, 'pending');
    assert.equal(reloaded.state.integration.pendingDailySubmission, undefined);
  });

  console.log(`${passed} passed; ${failures.length} failed (isolated client tests, no cloud writes)`);
  if (failures.length) process.exitCode = 1;
})();
