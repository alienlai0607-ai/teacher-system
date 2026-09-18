const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');

const source = fs.readFileSync(path.join(__dirname, '../review/anqin-v2/app.js'), 'utf8');
const block = (from, to) => source.slice(source.indexOf(from), source.indexOf(to, source.indexOf(from)));
const copy = value => JSON.parse(JSON.stringify(value));
const teacher = 'QA老師';
function cloudLog(date, options = {}) {
  const stamp = `${date}T12:00:00.000Z`;
  return {
    log_id: `LOG-${date.replaceAll('-', '')}-QA`, date, nickname: 'QA',
    submitted_at: options.submitted === false ? '' : stamp,
    record_revision: `revision-${date}`, updated_at: stamp, attachments: [],
    kpi6_data: { v2_snapshot: {
      schema: 'anqin-v2', savedAt: stamp,
      submission: { id: `sub-${date}`, teacher, date, status: options.status || 'draft',
        submittedAt: options.status && options.status !== 'draft' ? stamp : '',
        activitySnapshots: [], contactSnapshots: [], studentCaseSnapshots: [],
        keyResult: 'QA 已保留內容', feedback: '' },
      daily: { status: 'draft', submittedAt: '', summary: {} },
    } },
  };
}
function harness(logs, options = {}) {
  const state = {
    integration: {}, context: { teacher, department: 'QA' }, ui: { role: options.manager ? 'manager' : 'teacher' },
    daily: { date: '2026-09-16', status: 'draft', submittedAt: '', summary: {} },
    submissions: copy(options.submissions || []), activities: [], contacts: [], studentCases: [],
    lessonPlans: [], operationHistory: [], tasks: [], feedbackThreads: {},
  };
  const context = vm.createContext({
    state, console, clone: copy, SAFE_START_MODE: true,
    cloudLogId: (name, date) => `${name}-${date}`, dailyNeedsResubmit: () => false,
    cloudDraftInFlight: null, dailySubmitInFlight: false, dailyCloudConflict: null,
    driveFileId: () => '',
    hydrateCloudSnapshotAttachments: copy, normalizeContactRecord() {}, normalizeEvidenceRecord() {},
    reconcileLegacyPlans() {}, preserveActivityMedia() {}, preserveAttachmentMedia() {},
    operationRecordById: () => null, sameReviewIdentity: (a, b) => a === b,
    ensureCloudTeacherIdentity: async () => ({ ok: true }),
    legacySession: () => ({ role: options.manager ? 'manager' : 'teacher', nickname: teacher }),
    integrationRuntime: {}, renderApp() {}, addDays: value => value, toast() {}, persist() {},
    window: { API: {} }, API: { listLogs: async () => ({ ok: true, logs: copy(logs) }) },
    syncCoursePrepsFromCloud: async () => ({ ok: true }), flushTaskCloudSync: async () => {},
    pendingTaskSyncIds: new Set(), syncTasksFromCloud: async () => ({ ok: true }),
    syncCloudFeedback: async () => 0, showDailyCloudConflict() {},
    managerScopeMatches: () => true, managerScopeDepartment: () => '',
    feedbackThreadKey: (kind, id) => `${kind}:${id}`, feedbackThreadMessages: () => [],
    displayNameForBackend: name => name, backendNickname: () => 'QA',
    sameFeedbackMessage: (a, b) => a.id === b.id,
  });
  context.window.API = context.API;
  vm.runInContext(
    block('  function normalizeCourseRecord(', '  function normalizePrepTitle(')
    + block('  function importCloudSnapshot(', '  function importCloudCoursePrep(')
    + block('  async function syncTeacherCloudData(', '  function renderManagerDashboard('), context);
  if (options.feedback) {
    context.API.listFeedback = async () => ({ ok: true, feedback: copy(options.feedback) });
    vm.runInContext(block('  async function syncCloudFeedback(', '  async function syncTeacherCloudData('), context);
  }
  return context;
}

test('teacher history uses durable submission evidence for inconsistent legacy drafts', async () => {
  const logs = ['2026-09-08', '2026-09-10', '2026-09-15'].map(date => cloudLog(date));
  const ctx = harness(logs);
  await ctx.syncTeacherCloudData(false);
  assert.equal(ctx.state.submissions.length, 3);
  for (const submission of ctx.state.submissions) {
    assert.equal(submission.status, 'pending', `${submission.date} must not become an unsent draft`);
    assert.ok(submission.submittedAt, 'the timestamp comes from the backend record');
  }
  assert.equal(logs[0].kpi6_data.v2_snapshot.submission.status, 'draft', 'normalization is read-only');
});

test('actual unsent draft remains a draft for teacher and manager', async () => {
  for (const manager of [false, true]) {
    const ctx = harness([cloudLog('2026-09-15', { submitted: false })], { manager });
    await (manager ? ctx.syncManagerCloudData(false) : ctx.syncTeacherCloudData(false));
    assert.equal(ctx.state.submissions[0].status, 'draft');
    assert.equal(ctx.state.submissions[0].submittedAt, '');
  }
});

test('manager sees corrected sent history and retains explicit review statuses', async () => {
  const ctx = harness([
    cloudLog('2026-09-08'), cloudLog('2026-09-10', { status: 'accepted' }),
    cloudLog('2026-09-15', { status: 'clarify' }),
  ], { manager: true });
  await ctx.syncManagerCloudData(false);
  assert.deepEqual(ctx.state.submissions.map(item => item.status).sort(), ['accepted', 'clarify', 'pending']);
});

test('same cloud version can repair an already cached false draft', async () => {
  const log = cloudLog('2026-09-15');
  const cached = { ...copy(log.kpi6_data.v2_snapshot.submission), cloudSavedAt: log.kpi6_data.v2_snapshot.savedAt };
  const ctx = harness([log], { submissions: [cached] });
  await ctx.syncTeacherCloudData(false);
  assert.equal(ctx.state.submissions[0].status, 'pending');
});

test('confirmed sent snapshot repairs a cached draft even when its client timestamp is newer', async () => {
  const log = cloudLog('2026-09-15', { status: 'pending' });
  const cached = { ...copy(log.kpi6_data.v2_snapshot.submission), status: 'draft', submittedAt: '',
    cloudSavedAt: '2026-09-15T23:00:00.000Z' };
  const ctx = harness([log], { submissions: [cached] });
  await ctx.syncTeacherCloudData(false);
  assert.equal(ctx.state.submissions[0].status, 'pending');
  assert.equal(ctx.state.submissions[0].submittedAt, log.submitted_at);
});

test('confirmed current-day submission restores the daily indicator', async () => {
  const log = cloudLog('2026-09-16');
  const ctx = harness([log]);
  await ctx.syncTeacherCloudData(false);
  assert.equal(ctx.state.daily.status, 'submitted');
  assert.equal(ctx.state.daily.submittedAt, log.submitted_at);
});

test('current unsynced local work is kept and shows a cloud conflict', async () => {
  const log = cloudLog('2026-09-16');
  const ctx = harness([log]);
  ctx.state.integration.dailyDraftSyncPending = true;
  ctx.state.daily.summary.teacherNote = 'QA 本機尚未同步';
  await ctx.syncTeacherCloudData(false);
  assert.equal(ctx.state.daily.status, 'draft');
  assert.equal(ctx.state.daily.summary.teacherNote, 'QA 本機尚未同步');
  assert.ok(ctx.dailyCloudConflict);
});

test('unconfirmed submission protects its date across reload and rollover', async () => {
  for (const date of ['2026-09-15', '2026-09-16']) {
    const log = cloudLog(date, { status: 'pending' });
    const local = { ...copy(log.kpi6_data.v2_snapshot.submission), status: 'draft',
      keyResult: 'QA 送出未確認後的本機編輯', cloudSavedAt: `${date}T08:00:00.000Z` };
    const ctx = harness([log], { submissions: [local] });
    ctx.state.integration.pendingDailySubmission = { teacher, date, payload: { request_id: 'QA-request' } };
    await ctx.syncTeacherCloudData(false);
    assert.equal(ctx.state.submissions[0].status, 'draft');
    assert.equal(ctx.state.submissions[0].keyResult, 'QA 送出未確認後的本機編輯');
    assert.equal(ctx.dailyCloudConflict, null, 'receipt recovery owns the pending operation; do not invite a conflicting overwrite');
    assert.equal(ctx.importCloudSnapshot(log.kpi6_data.v2_snapshot, [], log.record_revision, true, log.submitted_at), false,
      'a stale conflict dialog must not force-overwrite an unresolved submission');
    assert.equal(ctx.state.submissions[0].keyResult, 'QA 送出未確認後的本機編輯');
  }
});

test('cloud snapshot explicitly awaiting resubmission is not promoted by an older first-submit timestamp', async () => {
  const log = cloudLog('2026-09-15');
  log.kpi6_data.v2_snapshot.submission.previousStatus = 'accepted';
  const ctx = harness([log]);
  await ctx.syncTeacherCloudData(false);
  assert.equal(ctx.state.submissions[0].status, 'draft');
  assert.equal(ctx.state.submissions[0].previousStatus, 'accepted');
});

test('historical local changes awaiting resubmission stay unsent', async () => {
  const log = cloudLog('2026-09-15');
  const local = { ...copy(log.kpi6_data.v2_snapshot.submission), previousStatus: 'accepted',
    previousSubmittedAt: '2026-09-15T10:00:00.000Z', cloudSavedAt: '2026-09-15T10:00:00.000Z',
    keyResult: 'QA 本機修改尚未重送' };
  const ctx = harness([log], { submissions: [local] });
  await ctx.syncTeacherCloudData(false);
  assert.equal(ctx.state.submissions[0].status, 'draft');
  assert.equal(ctx.state.submissions[0].previousStatus, 'accepted');
  assert.equal(ctx.state.submissions[0].keyResult, 'QA 本機修改尚未重送');
});

test('correcting an old cloud draft keeps a cached manager review decision', async () => {
  for (const status of ['accepted', 'clarify']) {
    const log = cloudLog('2026-09-15');
    const local = { ...copy(log.kpi6_data.v2_snapshot.submission), status,
      submittedAt: '2026-09-15T10:00:00.000Z', cloudSavedAt: '2026-09-15T10:00:00.000Z' };
    const ctx = harness([log], { submissions: [local] });
    await ctx.syncTeacherCloudData(false);
    assert.equal(ctx.state.submissions[0].status, status);
  }
});

test('manager feedback never turns an unsent draft or local resubmission into an accepted submission', async () => {
  for (const previousStatus of ['', 'accepted']) {
    const log = cloudLog('2026-09-15', { submitted: false });
    const local = { ...copy(log.kpi6_data.v2_snapshot.submission), previousStatus,
      submittedAt: previousStatus ? '2026-09-15T10:00:00.000Z' : '' };
    const ctx = harness([log], { submissions: [local], feedback: [{
      log_id: `${teacher}-2026-09-15`, feedback_id: 'QA-feedback', from_nickname: 'QA-manager',
      content: 'QA 主管留言', tag: '良好', created_at: '2026-09-15T13:00:00.000Z',
    }] });
    await ctx.syncTeacherCloudData(false);
    assert.equal(ctx.state.submissions[0].status, 'draft');
    assert.equal(ctx.state.submissions[0].feedback, 'QA 主管留言');
  }
});

test('manager feedback still reviews a confirmed submission', async () => {
  const log = cloudLog('2026-09-15', { status: 'pending' });
  const ctx = harness([log], { feedback: [{
    log_id: `${teacher}-2026-09-15`, feedback_id: 'QA-feedback', from_nickname: 'QA-manager',
    content: 'QA 請補充', tag: '需改進', created_at: '2026-09-15T13:00:00.000Z',
  }] });
  await ctx.syncTeacherCloudData(false);
  assert.equal(ctx.state.submissions[0].status, 'clarify');
});

test('rollover retains edits made while the previous day submission remains unconfirmed', () => {
  const ctx = harness([]);
  ctx.state.daily.date = '2026-09-15';
  ctx.state.daily.summary.teacherNote = 'QA 送出後新增補充';
  ctx.state.daily.parentHandoffNote = 'QA 送出後修改交接';
  ctx.state.integration.pendingDailySubmission = { teacher, date: '2026-09-15' };
  ctx.state.submissions = [{ id: 'existing', teacher, date: '2026-09-15', status: 'draft',
    previousStatus: 'accepted', cloudSavedAt: '2026-09-15T08:00:00.000Z', teacherNote: 'QA 舊補充' }];
  ctx.state.activities = [{ id: 'QA-activity', teacher, date: '2026-09-15', type: 'tutoring', result: 'QA 新內容' }];
  ctx.todayIso = () => '2026-09-16';
  ctx.isoWeekString = () => '2026-W38';
  ctx.createSeed = () => ({ daily: { summary: {} }, operations: {}, weekly: {} });
  vm.runInContext(block('  function rollWorkspaceToToday(', '  function sessionRoleLabel('), ctx);
  assert.equal(ctx.rollWorkspaceToToday(), '2026-09-15');
  const archived = ctx.state.submissions[0];
  assert.equal(archived.teacherNote, 'QA 送出後新增補充');
  assert.equal(archived.parentHandoffNote, 'QA 送出後修改交接');
  assert.equal(archived.activitySnapshots[0].result, 'QA 新內容');
  assert.equal(archived.status, 'draft');
  assert.equal(archived.previousStatus, 'accepted');
  assert.equal(archived.cloudSavedAt, '2026-09-15T08:00:00.000Z');
});

test('rollover keeps newer edits after an older in-flight submission is confirmed', () => {
  const ctx = harness([]);
  ctx.state.daily.date = '2026-09-15';
  ctx.state.daily.summary.teacherNote = 'QA 等待送出回應時新增的補充';
  ctx.state.daily.parentHandoffNote = 'QA 等待送出回應時更新的交接';
  // The older request succeeded and its pending marker was cleared. The newer
  // local edits are correctly marked as awaiting resubmission, then midnight passes.
  ctx.state.submissions = [{ id: 'existing', teacher, date: '2026-09-15', status: 'draft',
    previousStatus: 'pending', previousSubmittedAt: '2026-09-15T12:00:00.000Z',
    cloudSavedAt: '2026-09-15T12:00:00.000Z', teacherNote: 'QA 已送出舊補充' }];
  ctx.state.activities = [{ id: 'QA-activity', teacher, date: '2026-09-15', type: 'tutoring', result: 'QA 後續修改' }];
  ctx.todayIso = () => '2026-09-16';
  ctx.isoWeekString = () => '2026-W38';
  ctx.createSeed = () => ({ daily: { summary: {} }, operations: {}, weekly: {} });
  vm.runInContext(block('  function rollWorkspaceToToday(', '  function sessionRoleLabel('), ctx);
  assert.equal(ctx.rollWorkspaceToToday(), '2026-09-15');
  const archived = ctx.state.submissions[0];
  assert.equal(archived.teacherNote, 'QA 等待送出回應時新增的補充');
  assert.equal(archived.parentHandoffNote, 'QA 等待送出回應時更新的交接');
  assert.equal(archived.activitySnapshots[0].result, 'QA 後續修改');
  assert.equal(archived.status, 'draft');
  assert.equal(archived.previousStatus, 'pending');
  assert.equal(archived.previousSubmittedAt, '2026-09-15T12:00:00.000Z');
  assert.equal(archived.cloudSavedAt, '2026-09-15T12:00:00.000Z');
});
