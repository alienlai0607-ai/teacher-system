const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');

const source = fs.readFileSync(path.join(__dirname, '../review/anqin-v2/app.js'), 'utf8');
const copy = value => JSON.parse(JSON.stringify(value));
function fn(name) {
  const matcher = new RegExp(`\\n  (?:async )?function ${name}\\(`);
  const match = matcher.exec(source);
  assert.ok(match, `actual app function ${name}`);
  const start = match.index + 1;
  const next = /\n  (?:async )?function \w+\(/g;
  next.lastIndex = start + match[0].length;
  const end = next.exec(source)?.index || source.lastIndexOf('})();');
  return source.slice(start, end);
}
const teacher = 'QA老師';
const screenshot = () => ({ id: 'share-shot', fileName: 'group-screenshot.png', mimeType: 'image/png', dataUrl: 'data:image/png;base64,c2NyZWVuc2hvdA==', fingerprint: 'image-content-a', size: '12 KB', cloudUrl: '', cloudFileId: '', note: '' });
const completeRecord = () => ({ channels: ['group'], note: '已在班級群組分享今日課程照片', attachments: [screenshot()] });

function fixture() {
  const state = {
    ui: { role: 'teacher', todayTab: 'course-record' }, context: { teacher, department: '北區教室' },
    integration: { cloudSyncEnabled: true, logRevisions: {} },
    daily: { date: '2026-09-18', status: 'draft', submittedAt: '', parentStatus: 'handoff', parentHandoffConfirmed: true, parentHandoffNote: '', summary: {}, courseRecord: { channels: [], note: '', attachments: [] } },
    activities: [], studentCases: [], contacts: [], submissions: [], lessonPlans: [], tasks: [],
    operations: { id: 'operation-18', date: '2026-09-18', dutyOwner: teacher, evidenceByCheck: {} }, operationHistory: [], weekly: {},
  };
  const writes = [];
  const context = vm.createContext({
    state, clone: copy, writes,
    uid: prefix => `${prefix}-fixture`, todayIso: () => '2026-09-21', isoWeekString: date => String(date).slice(0, 7),
    addDays: (date, amount) => {
      const value = new Date(`${date}T12:00:00Z`);
      value.setUTCDate(value.getUTCDate() + amount);
      return value.toISOString().slice(0, 10);
    },
    backendNickname: value => value.replace(/老師$/, ''), cloudTeacherNickname: value => value.replace(/老師$/, ''),
    cloudLogId: (name, date) => `${name}:${date}`, cloudIdentityReady: () => true,
    dailyNeedsResubmit: () => false, dailySubmitInFlight: false, cloudDraftInFlight: null, cloudDraftGeneration: 0, cloudDraftTimer: null,
    integrationRuntime: {}, persist: () => true, updateSaveIndicator() {}, refreshSystemStatusNotice() {},
    dailyCloudConflict: null, normalizeContactRecord() {}, reconcileLegacyPlans() {}, preserveActivityMedia() {},
    operationRecordById: id => [state.operations, ...state.operationHistory].find(item => item.id === id),
    dailyRequiredTracksReady: () => true, activityComplete: () => true, operationsComplete: () => true,
    ACTIVITY_TYPES: {}, activityTrack: () => 'academic',
    window: { clearTimeout, setTimeout }, API: { saveLog: async payload => { writes.push(copy(payload)); return { ok: true, revision: 'saved-revision' }; } },
    createSeed: () => ({ daily: { date: '2026-09-21', summary: {}, courseRecord: { channels: [], note: '', attachments: [] } }, operations: { evidenceByCheck: {} }, weekly: {} }),
  });
  context.window.API = context.API;
  const functions = [
    'materialCloudUrl', 'driveFileId', 'normalizeEvidenceRecord', 'normalizeOperationPhotoRecord', 'attachmentAvailable',
    'normalizeCourseRecord', 'courseRecordRequired', 'courseRecordComplete', 'dailyKpiOptional',
    'todayActivities', 'todaySectionStatus', 'dailyCompletion', 'hasDailyRecords',
    'createDailySubmissionRecord', 'removeInlineMedia', 'buildCloudSnapshot', 'joinActivityText', 'joinActivityFeedback',
    'buildLegacySubmissionPayload', 'syncDailyDraftRequest', 'dailySubmissionContentSignature', 'normalizeDailySubmissionSignature',
    'previousKpiWorkday', 'isNextWorkdayGraceDate', 'operationHasDailyContent', 'rollWorkspaceToToday',
    'preserveAttachmentMedia', 'hydrateCloudSnapshotAttachments', 'importCloudSnapshot',
  ];
  vm.runInContext(functions.map(fn).join('\n'), context);
  return { state, context, writes };
}

test('course screenshots become required on working days from 2026-09-18, without changing older days or weekends', () => {
  const { context } = fixture();
  for (const date of ['2026-09-17', '2026-09-12', '2026-09-19', '2026-09-20']) assert.equal(context.courseRecordRequired(date), false, date);
  for (const date of ['2026-09-18', '2026-09-21']) assert.equal(context.courseRecordRequired(date), true, date);
});

test('required evidence needs a real image and a supported sharing channel', () => {
  const { context } = fixture();
  for (const channels of [['group'], ['parent_app'], ['group', 'parent_app']]) assert.equal(context.courseRecordComplete({ ...completeRecord(), channels }), true);
  for (const channels of [[], ['unknown']]) assert.equal(context.courseRecordComplete({ ...completeRecord(), channels }), false);
  assert.equal(context.courseRecordComplete({ channels: ['group'], note: 'shared', attachments: [] }), false);
  assert.equal(context.courseRecordComplete({ ...completeRecord(), attachments: [{ ...screenshot(), dataUrl: '', legacyMissing: true }] }), false, 'legacy filename exemption cannot satisfy new mandatory proof');
  assert.equal(context.courseRecordComplete({ ...completeRecord(), attachments: [{ ...screenshot(), dataUrl: '', localMediaKey: 'saved-but-not-loaded', localMediaSaved: true }] }), false, 'recovery metadata alone is not usable proof');
  assert.equal(context.courseRecordComplete({ ...completeRecord(), attachments: [{ fileName: 'notes.pdf', mimeType: 'application/pdf', dataUrl: 'data:application/pdf;base64,JVBERg==' }] }), false);
  assert.equal(context.courseRecordComplete({ ...completeRecord(), attachments: [{ ...screenshot(), dataUrl: '', cloudUrl: 'https://drive.google.com/file/d/course-proof-id/view' }] }), true);
});

test('normalization retains durable attachment identity and original user content', () => {
  const { context } = fixture();
  const input = completeRecord();
  Object.assign(input.attachments[0], { localMediaKey: 'stable-media-key', localMediaSaved: true });
  const before = copy(input);
  const normalized = context.normalizeCourseRecord(input);
  assert.equal(normalized.attachments[0].id, 'share-shot');
  assert.equal(normalized.attachments[0].fingerprint, 'image-content-a');
  assert.equal(normalized.attachments[0].localMediaKey, 'stable-media-key');
  assert.equal(normalized.attachments[0].localMediaSaved, true);
  assert.equal(normalized.note, before.note);
  assert.deepEqual(copy(normalized.channels), before.channels);
  for (const [key, value] of Object.entries(before.attachments[0])) assert.equal(normalized.attachments[0][key], value, key);
});

test('daily completion includes course records only for applicable days', () => {
  const { context, state } = fixture();
  assert.equal(context.dailyCompletion(), 75);
  state.daily.courseRecord = completeRecord();
  assert.equal(context.dailyCompletion(), 100);
  state.daily.date = '2026-09-17';
  state.daily.courseRecord = { channels: [], note: '', attachments: [] };
  assert.equal(context.dailyCompletion(), 100);
});

test('daily submission and cloud draft preserve channel, note and screenshot identity without embedding bytes', async () => {
  const { context, state, writes } = fixture();
  state.daily.courseRecord = completeRecord();
  const submission = context.createDailySubmissionRecord();
  assert.deepEqual(copy(submission.courseRecord.channels), ['group']);
  const snapshot = context.buildCloudSnapshot(submission);
  for (const record of [snapshot.daily.courseRecord, snapshot.submission.courseRecord]) {
    assert.deepEqual(copy(record.channels), ['group']);
    assert.equal(record.attachments[0].id, 'share-shot');
    assert.ok(!record.attachments[0].dataUrl);
  }
  state.daily.courseRecord.note = 'later local change';
  assert.equal(submission.courseRecord.note, '已在班級群組分享今日課程照片', 'snapshot must not alias editable state');
  await context.syncDailyDraftRequest();
  assert.equal(writes.length, 1);
  assert.equal(writes[0].submitted, false);
  assert.equal(writes[0].kpi6_data.v2_snapshot.submission.courseRecord.note, 'later local change');
  assert.equal(writes[0].kpi6_data.v2_snapshot.daily.courseRecord.attachments[0].id, 'share-shot');
});

test('course record semantic signature catches real edits but ignores storage recovery metadata', () => {
  const { context, state } = fixture();
  state.daily.courseRecord = context.normalizeCourseRecord(completeRecord());
  const baseline = context.dailySubmissionContentSignature();
  Object.assign(state.daily.courseRecord.attachments[0], { dataUrl: '', cloudUrl: 'https://drive.google.com/file/d/course-proof-id/view', cloudFileId: 'course-proof-id', localMediaKey: 'stable', localMediaSaved: false, placeholder: false, legacyMissing: false, uploadStatus: 'uploaded' });
  assert.equal(context.dailySubmissionContentSignature(), baseline);
  for (const edit of [
    () => { state.daily.courseRecord.channels = ['parent_app']; },
    () => { state.daily.courseRecord.note = 'changed note'; },
    () => { state.daily.courseRecord.attachments[0].fingerprint = 'replacement-image'; },
    () => { state.daily.courseRecord.attachments = []; },
  ]) {
    state.daily.courseRecord = context.normalizeCourseRecord(completeRecord());
    edit();
    assert.notEqual(context.dailySubmissionContentSignature(), baseline);
  }
});

test('rollover preserves a course-only draft and starts the new day with no carried-over screenshot', () => {
  const { context, state } = fixture();
  state.daily.courseRecord = completeRecord();
  const old = state.daily.courseRecord;
  assert.equal(context.rollWorkspaceToToday(true), '2026-09-18');
  assert.equal(state.daily.date, '2026-09-21');
  assert.equal(state.daily.courseRecord.attachments.length, 0);
  const archived = state.submissions.find(item => item.date === '2026-09-18');
  assert.ok(archived, 'course screenshot alone is meaningful daily content');
  assert.equal(archived.courseRecord.attachments[0].id, 'share-shot');
  old.note = 'old object changed after rollover';
  assert.equal(archived.courseRecord.note, '已在班級群組分享今日課程照片');
});

test('rollover retains newer course edits while an earlier daily submission remains unconfirmed', () => {
  const { context, state } = fixture();
  state.daily.courseRecord = completeRecord();
  state.daily.courseRecord.note = 'newer local share note';
  state.integration.pendingDailySubmission = { teacher, date: '2026-09-18' };
  state.submissions = [{ id: 'existing', teacher, date: '2026-09-18', status: 'draft', previousStatus: 'pending', courseRecord: { channels: ['parent_app'], note: 'older note', attachments: [] } }];
  context.rollWorkspaceToToday(true);
  assert.equal(state.submissions[0].courseRecord.note, 'newer local share note');
  assert.equal(state.submissions[0].previousStatus, 'pending');
  const historicalSignature = context.dailySubmissionContentSignature({ teacher, date: '2026-09-18' });
  state.daily.courseRecord = { channels: ['parent_app'], note: 'the new day stays separate', attachments: [] };
  assert.equal(context.dailySubmissionContentSignature({ teacher, date: '2026-09-18' }), historicalSignature);
  state.submissions[0].courseRecord.note = 'actual historical edit';
  assert.notEqual(context.dailySubmissionContentSignature({ teacher, date: '2026-09-18' }), historicalSignature);
});

test('another device restores course screenshots from attachment identity into both daily and historical records', () => {
  const first = fixture();
  first.state.daily.courseRecord = completeRecord();
  const snapshot = first.context.buildCloudSnapshot(first.context.createDailySubmissionRecord());
  const restored = fixture();
  const cloud = { forType: 'v2-course-record', attachmentId: 'share-shot', mimeType: 'image/jpeg', fileName: 'shared.jpg', fileId: 'course-proof-id', url: 'https://drive.google.com/file/d/course-proof-id/view' };
  assert.equal(restored.context.importCloudSnapshot(snapshot, [cloud], 'cloud-revision', false, '2026-09-18T12:00:00Z'), true);
  for (const record of [restored.state.daily.courseRecord, restored.state.submissions[0].courseRecord]) {
    assert.equal(record.attachments[0].cloudFileId, 'course-proof-id');
    assert.equal(restored.context.courseRecordComplete(record), true);
    assert.deepEqual(copy(record.channels), ['group']);
  }
  assert.equal(snapshot.submission.courseRecord.attachments[0].cloudFileId, '', 'hydration must not mutate its source snapshot');
});

test('course cloud import retains an unfinished local recovery key and never overwrites an unknown submission', () => {
  const first = fixture();
  first.state.daily.courseRecord = completeRecord();
  const snapshot = first.context.buildCloudSnapshot(first.context.createDailySubmissionRecord());
  const restored = fixture();
  restored.state.daily.courseRecord = completeRecord();
  Object.assign(restored.state.daily.courseRecord.attachments[0], { dataUrl: '', localMediaKey: 'durable-pending-image', localMediaSaved: true });
  assert.equal(restored.context.importCloudSnapshot(snapshot, [], 'cloud-revision'), true);
  assert.equal(restored.state.daily.courseRecord.attachments[0].localMediaKey, 'durable-pending-image');
  restored.state.integration.pendingDailySubmission = { teacher, date: '2026-09-18' };
  restored.state.daily.courseRecord.note = 'unconfirmed local version';
  snapshot.submission.courseRecord.note = 'remote version';
  assert.equal(restored.context.importCloudSnapshot(snapshot, [], 'newer-revision', true), false);
  assert.equal(restored.state.daily.courseRecord.note, 'unconfirmed local version');
});

test('formal daily submission uploads screenshot bytes with their own attachment identity and reuses the confirmed file', async () => {
  const { context, state } = fixture();
  state.daily.courseRecord = context.normalizeCourseRecord(completeRecord());
  const uploads = [];
  Object.assign(context, { OPERATION_CHECKS: {}, applyCloudPreview() {}, activityKpiNumber: () => 1 });
  context.API.uploadPhoto = async payload => {
    uploads.push(copy(payload));
    return { ok: true, fileId: 'course-proof-id', url: 'https://drive.google.com/file/d/course-proof-id/view' };
  };
  vm.runInContext(['evidenceAttachments', 'evidencePrimaryAttachment', 'syncEvidencePrimaryFields', 'confirmLocalAttachmentUploaded', 'dataUrlPayload', 'uploadFormalEvidence'].map(fn).join('\n'), context);
  const before = context.dailySubmissionContentSignature();
  const attachments = await context.uploadFormalEvidence();
  assert.equal(uploads.length, 1);
  assert.equal(uploads[0].base64, screenshot().dataUrl.split(',')[1]);
  assert.equal(uploads[0].date, '2026-09-18');
  assert.equal(attachments[0].forType, 'v2-course-record');
  assert.equal(attachments[0].attachmentId, 'share-shot');
  assert.equal(attachments[0].fileId, 'course-proof-id');
  assert.equal(state.daily.courseRecord.attachments[0].dataUrl, '');
  assert.equal(context.dailySubmissionContentSignature(), before, 'upload must not appear as teacher edits');
  await context.uploadFormalEvidence();
  assert.equal(uploads.length, 1, 'confirmed screenshot must not upload twice');
});

test('opening or saving an unchanged course form preserves submission status; actual edits require resubmission', () => {
  const { context, state } = fixture();
  state.daily.courseRecord = completeRecord();
  state.daily.status = 'submitted';
  let changes = 0;
  Object.assign(context, {
    FormData: class { constructor(form) { this.form = form; } getAll(key) { return this.form[key] || []; } get(key) { return this.form[key] || ''; } },
    markDailyNeedsResubmit() { changes++; state.daily.status = 'draft'; },
    scheduleDailyCloudDraftSync() {},
  });
  vm.runInContext(fn('saveCourseRecordForm'), context);
  context.saveCourseRecordForm({ channels: ['group'], note: state.daily.courseRecord.note });
  assert.equal(changes, 0);
  assert.equal(state.daily.status, 'submitted');
  context.saveCourseRecordForm({ channels: ['group', 'parent_app'], note: state.daily.courseRecord.note });
  assert.equal(changes, 1);
  assert.equal(state.daily.status, 'draft');
});

test('a delayed cloud import cannot detach a screenshot while its local save is still in progress', async () => {
  const { context, state } = fixture();
  const remote = fixture();
  const remoteSnapshot = remote.context.buildCloudSnapshot(remote.context.createDailySubmissionRecord());
  let releaseLocalWrite;
  let markLocalWriteStarted;
  const localWrite = new Promise(resolve => { releaseLocalWrite = resolve; });
  const localWriteStarted = new Promise(resolve => { markLocalWriteStarted = resolve; });
  Object.assign(context, {
    $: () => null, MAX_EVIDENCE_FILES: 8, MAX_DOCUMENT_FILE_BYTES: 25 * 1024 * 1024,
    hashFile: async () => 'selected-screenshot', fileToPreview: async () => screenshot().dataUrl,
    formatFileSize: () => '12 KB', dataUrlByteLength: () => 12,
    preserveLocalAttachment: async item => { markLocalWriteStarted(); await localWrite; item.localMediaKey = 'durable-local-key'; item.localMediaSaved = true; },
    uploadCompressedPhoto: async () => { throw new Error('network offline'); },
    markDailyNeedsResubmit() {}, scheduleDailyCloudDraftSync() {}, renderApp() {}, toast() {},
  });
  vm.runInContext(['saveCourseRecordForm', 'handleCourseRecordFiles'].map(fn).join('\n'), context);
  const request = context.handleCourseRecordFiles({ files: [{ name: 'selected.png', type: 'image/png', size: 12 }], value: 'selected' });
  await localWriteStarted;
  context.importCloudSnapshot(remoteSnapshot, [], 'delayed-cloud-revision');
  releaseLocalWrite();
  await request;
  assert.equal(state.daily.courseRecord.attachments.length, 1, 'the new screenshot must remain reachable from the saved daily state');
  assert.equal(state.daily.courseRecord.attachments[0].localMediaKey, 'durable-local-key');
  assert.equal(state.daily.courseRecord.attachments[0].uploadStatus, 'retry');
});
