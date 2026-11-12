const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');

const source = fs.readFileSync(path.join(__dirname, '../review/anqin-v2/app.js'), 'utf8');
const block = (from, to) => source.slice(source.indexOf(from), source.indexOf(to, source.indexOf(from)));
const copy = value => JSON.parse(JSON.stringify(value));
const today = '2026-11-12', oldDate = '2026-11-06', teacher = '測試老師';
const course = { channels: ['group'], note: '原始課程說明', attachments: [{ id: 'course-original', fileName: 'original.jpg', mimeType: 'image/jpeg', cloudFileId: 'original-id', cloudUrl: 'https://drive.google.com/file/d/original-id/view', localMediaKey: 'retained-key', uploadStatus: 'uploaded', localMediaSaved: true }] };
function fixture() {
  return { id: 'draft-original', date: oldDate, teacher, status: 'draft', submittedAt: '', teacherNote: '歷史草稿原文', courseRecord: copy(course), activitySnapshots: [], contactSnapshots: [], studentCaseSnapshots: [] };
}
function harness() {
  const state = {
    ui: { role: 'teacher', route: 'records' }, context: { teacher, department: '測試教室' },
    integration: { dailyWorkspaces: {}, logRevisions: {} },
    daily: { date: today, status: 'draft', submittedAt: '', summary: { teacherNote: '今天尚未送出的內容' }, courseRecord: { channels: [], attachments: [], note: '' } },
    operations: { id: `op_${today}_${teacher}`, date: today, dutyOwner: teacher, evidenceByCheck: {} },
    operationHistory: [], activities: [], contacts: [], studentCases: [], lessonPlans: [], submissions: [fixture()], weekly: {},
  };
  const ctx = vm.createContext({
    state, console, clone: copy, Map, Set, stateStorageWriteProtected: false,
    activePhotoSaveTasks: new Set(), integrationRuntime: {}, localMediaRestoreInFlight: null,
    cloudDraftInFlight: null, dailySubmitInFlight: false, currentDrawerDraftKey: '', dailyCloudConflict: null,
    todayIso: () => today,
    addDays: (value, amount) => { const date = new Date(value + 'T12:00:00Z'); date.setUTCDate(date.getUTCDate() + amount); return date.toISOString().slice(0, 10); },
    dailyKpiOptional: value => [0, 6].includes(new Date(value + 'T00:00:00Z').getUTCDay()),
    materialCloudUrl: item => item?.cloudUrl || '',
    normalizeCourseRecord: copy,
    createSeed: () => ({ daily: { date: today, status: 'draft', submittedAt: '', summary: {}, courseRecord: { channels: [], attachments: [], note: '' } }, operations: { evidenceByCheck: {} }, weekly: {} }),
    todayActivities: () => state.activities.filter(item => item.date === state.daily.date && item.teacher === teacher),
    backendNickname: value => value, isoWeekString: () => '2026-W46',
    flushScheduledDailyCloudDraft() {}, persistCurrentDrawerDraft() { ctx.drawerPreserved = true; return true; },
    persist() { return true; }, renderApp() {}, toast() {},
    openDialog(value) { ctx.dialog = value; },
    cloudLogId: (name, date) => name + ':' + date,
    hydrateCloudSnapshotAttachments: copy, dailyNeedsResubmit: () => false,
    normalizeContactRecord() {}, normalizeEvidenceRecord() {}, normalizeOperationPhotoRecord() {},
    preserveAttachmentMedia() {}, preserveActivityMedia() {}, reconcileLegacyPlans() {},
    operationRecordById: id => [state.operations, ...state.operationHistory].find(item => item.id === id),
    esc: String, formatDate: String, formatShortDate: value => value.slice(5), icon: () => '',
  });
  vm.runInContext(block('  function previousKpiWorkday(', '  function sessionRoleLabel(')
    + block('  function importCloudSnapshot(', '  function importCloudCoursePrep(')
    + block('  function renderRecordTimelineEntry(', '  async function loadLegacyArchiveFiles('), ctx);
  return ctx;
}

test('existing same-month own draft reopens with exact screenshot identity and preserves today', () => {
  const ctx = harness();
  assert.equal(ctx.canResumeHistoricalDailyDraft(oldDate), true);
  assert.equal(ctx.switchTeacherDailyDate(oldDate), true);
  assert.equal(ctx.state.daily.date, oldDate);
  assert.equal(ctx.state.operations.date, oldDate);
  assert.equal(ctx.state.daily.status, 'draft');
  assert.equal(ctx.state.daily.submittedAt, '');
  assert.deepEqual(copy(ctx.state.daily.courseRecord), course);
  assert.equal(ctx.state.integration.dailyWorkspaces[today].daily.summary.teacherNote, '今天尚未送出的內容');
  ctx.state.daily.summary.teacherNote = '歷史草稿後續修改';
  assert.equal(ctx.switchTeacherDailyDate(today), true);
  assert.equal(ctx.state.daily.summary.teacherNote, '今天尚未送出的內容');
  assert.equal(ctx.switchTeacherDailyDate(oldDate), true);
  assert.equal(ctx.state.daily.summary.teacherNote, '歷史草稿後續修改');
  assert.deepEqual(copy(ctx.state.daily.courseRecord), course);
});

test('history eligibility never creates arbitrary dates or reopens another teacher / submitted record', () => {
  const cases = [
    ['empty day', ctx => ctx.state.submissions = []],
    ['other teacher', ctx => ctx.state.submissions[0].teacher = '其他老師'],
    ['manager mode', ctx => ctx.state.ui.role = 'manager'],
    ['submitted status', ctx => ctx.state.submissions[0].status = 'pending'],
    ['local submitted timestamp', ctx => ctx.state.submissions[0].submittedAt = 'confirmed'],
    ['cloud submitted timestamp', ctx => ctx.state.submissions[0].cloudSubmittedAt = 'confirmed'],
    ['previous submitted timestamp', ctx => ctx.state.submissions[0].previousSubmittedAt = 'confirmed'],
    ['resubmission', ctx => ctx.state.submissions[0].previousStatus = 'accepted'],
  ];
  for (const [label, mutate] of cases) {
    const ctx = harness(); mutate(ctx);
    const before = copy(ctx.state);
    assert.equal(ctx.canResumeHistoricalDailyDraft(oldDate), false, label);
    assert.equal(ctx.switchTeacherDailyDate(oldDate), false, label);
    assert.deepEqual(copy(ctx.state), before, label);
  }
  for (const date of ['2026-10-30', '2026-11-30', '2026-11-00', 'not-a-date']) {
    const ctx = harness(); ctx.state.submissions[0].date = date;
    assert.equal(ctx.canResumeHistoricalDailyDraft(date), false, date);
  }
});

test('historical switch waits for upload, local restoration, cloud save, pending receipt and drawer', () => {
  for (const kind of ['upload', 'course', 'restore', 'cloud', 'submit', 'pending', 'readonly', 'drawer', 'storage']) {
    const ctx = harness();
    if (kind === 'upload') ctx.activePhotoSaveTasks.add({});
    if (kind === 'course') ctx.integrationRuntime.courseRecordUploading = true;
    if (kind === 'restore') ctx.localMediaRestoreInFlight = {};
    if (kind === 'cloud') ctx.cloudDraftInFlight = {};
    if (kind === 'submit') ctx.dailySubmitInFlight = true;
    if (kind === 'pending') ctx.state.integration.pendingDailySubmission = { teacher, date: oldDate };
    if (kind === 'readonly') ctx.stateStorageWriteProtected = true;
    if (kind === 'drawer') ctx.currentDrawerDraftKey = 'original-drawer';
    if (kind === 'storage') ctx.persist = () => false;
    assert.equal(ctx.switchTeacherDailyDate(oldDate), false, kind);
    assert.equal(ctx.state.daily.date, today, kind);
    assert.equal(ctx.state.daily.summary.teacherNote, '今天尚未送出的內容', kind);
    if (kind === 'drawer') assert.equal(ctx.drawerPreserved, true);
  }
});

test('local-workspace-only draft is recoverable only when explicitly owned by current teacher', () => {
  const ctx = harness(); ctx.state.submissions = [];
  ctx.state.integration.dailyWorkspaces[oldDate] = {
    daily: { date: oldDate, status: 'draft', submittedAt: '', summary: { teacherNote: '純本機草稿' }, courseRecord: copy(course) },
    operation: { date: oldDate, dutyOwner: teacher, evidenceByCheck: {} },
  };
  assert.equal(ctx.canResumeHistoricalDailyDraft(oldDate), true);
  ctx.state.integration.dailyWorkspaces[oldDate].operation.dutyOwner = '其他老師';
  assert.equal(ctx.canResumeHistoricalDailyDraft(oldDate), false);
});

test('imported unsent cloud draft remains visible and opens with course photos and operation evidence', () => {
  const ctx = harness(); ctx.state.submissions = [];
  const snapshot = {
    schema: 'anqin-v2', savedAt: oldDate + 'T12:00:00Z', submission: fixture(),
    operation: { id: `op_${oldDate}_${teacher}`, date: oldDate, dutyOwner: teacher, evidenceByCheck: { classroom: { fileName: 'room.jpg', cloudUrl: 'https://drive.google.com/file/d/room/view' } } },
    daily: { status: 'draft', submittedAt: '', courseRecord: copy(course) },
  };
  assert.equal(ctx.importCloudSnapshot(snapshot, [], 'revision-historical', false, ''), true);
  assert.equal(ctx.canResumeHistoricalDailyDraft(oldDate), true);
  const html = ctx.renderRecordTimelineEntry({ date: oldDate, status: '草稿', title: '草稿', copy: '', submissionId: 'draft-original' });
  assert.match(html, /data-action="resume-daily-draft"/);
  assert.match(html, /繼續填寫/);
  assert.equal(ctx.switchTeacherDailyDate(oldDate), true);
  assert.deepEqual(copy(ctx.state.daily.courseRecord), course);
  assert.equal(ctx.state.operations.evidenceByCheck.classroom.fileName, 'room.jpg');
  assert.equal(ctx.state.daily.submittedAt, '');
});

test('reload rollover preserves newest historical edits rather than restoring an older workspace', () => {
  const ctx = harness();
  assert.equal(ctx.switchTeacherDailyDate(oldDate), true);
  assert.equal(ctx.switchTeacherDailyDate(today), true);
  assert.equal(ctx.switchTeacherDailyDate(oldDate), true);
  ctx.state.daily.summary.teacherNote = '重整前最新內容';
  ctx.state.daily.courseRecord.attachments.push({ id: 'new-photo', fileName: 'new.jpg', localMediaKey: 'new-local-key', localMediaSaved: true });
  ctx.rollWorkspaceToToday();
  assert.equal(ctx.switchTeacherDailyDate(oldDate), true);
  assert.equal(ctx.state.daily.summary.teacherNote, '重整前最新內容');
  assert.equal(ctx.state.daily.courseRecord.attachments[1].localMediaKey, 'new-local-key');
});

test('different local/cloud versions require explicit choice and preserve both originals', () => {
  for (const choice of ['local', 'cloud']) {
    const ctx = harness();
    const remote = ctx.dailyWorkspaceFromSubmission(oldDate);
    ctx.state.integration.dailyWorkspaces[oldDate] = copy(remote);
    ctx.state.integration.dailyWorkspaces[oldDate].daily.summary.teacherNote = '本機不同原文';
    ctx.state.submissions[0].cloudSavedAt = '2026-11-12T10:00:00Z';
    assert.equal(ctx.switchTeacherDailyDate(oldDate), false);
    assert.equal(ctx.state.daily.date, today);
    assert.match(ctx.dialog.title, /兩份草稿/);
    assert.equal(ctx.switchTeacherDailyDate(oldDate, choice), true);
    assert.equal(ctx.state.daily.summary.teacherNote, choice === 'local' ? '本機不同原文' : '歷史草稿原文');
    const copies = ctx.state.integration.historicalDraftRecoveryCopies[oldDate];
    assert.equal(copies.length, 1);
    assert.equal(copies[0].local.daily.summary.teacherNote, '本機不同原文');
    assert.equal(copies[0].cloud.daily.summary.teacherNote, '歷史草稿原文');
  }
});
