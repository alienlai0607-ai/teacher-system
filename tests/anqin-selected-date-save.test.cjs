const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../review/anqin-v2/app.js'), 'utf8');
const block = (from, to) => {
  const start = source.indexOf(from);
  const end = source.indexOf(to, start);
  assert.ok(start >= 0 && end > start, `missing source block: ${from}`);
  return source.slice(start, end);
};
const copy = value => JSON.parse(JSON.stringify(value));
const teacher = '測試老師';
const yesterday = '2026-10-13';
const today = '2026-10-14';

function baseState() {
  return {
    ui: { role: 'teacher', route: 'today', todayTab: 'activities' },
    integration: { cloudSyncEnabled: true, dailyDraftSyncPending: false, dailyWorkspaces: {}, logRevisions: {} },
    context: { teacher, department: '北區教室' },
    daily: {
      date: today, status: 'draft', submittedAt: '',
      summary: { keyResult: '', followup: '', tomorrowPriority: '', teacherNote: '' },
      parentStatus: '', parentHandoffConfirmed: false, parentHandoffNote: '',
      courseRecord: { channels: [], attachments: [], note: '' },
    },
    operations: { id: `op_${today}_${teacher}`, date: today, room: '北區教室', dutyOwner: teacher, evidenceByCheck: {} },
    operationHistory: [], weekly: {}, activities: [], studentCases: [], contacts: [], lessonPlans: [], submissions: [],
  };
}

{
  const state = baseState();
  const ctx = vm.createContext({
    state, console, clone: copy, dailySubmitInFlight: false, stateStorageWriteProtected: false,
    todayIso: () => today,
    addDays: (value, amount) => {
      const date = new Date(`${value}T12:00:00+08:00`);
      date.setDate(date.getDate() + amount);
      return date.toLocaleDateString('sv-SE', { timeZone: 'Asia/Taipei' });
    },
    dailyKpiOptional: value => [0, 6].includes(new Date(`${value}T12:00:00+08:00`).getDay()),
    materialCloudUrl: item => item?.cloudUrl || '', normalizeCourseRecord: value => value || { channels: [], attachments: [], note: '' },
    createSeed: () => ({
      daily: { date: today, status: 'draft', submittedAt: '', summary: {}, parentStatus: '', parentHandoffConfirmed: false, parentHandoffNote: '', courseRecord: { channels: [], attachments: [], note: '' } },
      operations: { id: `op_${today}_${teacher}`, date: today, room: '北區教室', dutyOwner: teacher, evidenceByCheck: {} },
      weekly: {},
    }),
    todayActivities: () => state.activities.filter(item => item.teacher === state.context.teacher && item.date === state.daily.date && item.type !== 'lessonprep'),
    backendNickname: value => value, isoWeekString: () => '2026-W42',
    persistCurrentDrawerDraft() {}, flushScheduledDailyCloudDraft() {}, persist() { return true; }, renderApp() {}, toast() {},
  });
  vm.runInContext(block('  function previousKpiWorkday(', '  function sessionRoleLabel('), ctx);

  assert.deepEqual(copy(ctx.graceBackfillSubmission()), { date: yesterday, active: false, empty: true }, '沒有既有草稿也要提供上一工作日入口');
  state.daily.summary.teacherNote = '10/14 草稿';
  assert.equal(ctx.switchTeacherDailyDate(yesterday), true, '應可直接建立上一工作日工作區');
  assert.equal(state.daily.date, yesterday);
  assert.equal(state.operations.date, yesterday);
  state.daily.summary.teacherNote = '10/13 草稿';

  assert.equal(ctx.switchTeacherDailyDate(today), true);
  assert.equal(state.daily.date, today);
  assert.equal(state.daily.summary.teacherNote, '10/14 草稿', '今天草稿不可被昨天覆蓋');
  assert.equal(ctx.switchTeacherDailyDate(yesterday), true);
  assert.equal(state.daily.date, yesterday);
  assert.equal(state.daily.summary.teacherNote, '10/13 草稿', '昨天草稿不可被今天覆蓋');
}

async function verifyScheduledPayloadKeepsSelectedDate() {
  const state = baseState();
  state.daily.date = yesterday;
  state.daily.summary = { keyResult: '10/13 完成事項', followup: '無', tomorrowPriority: '10/14 待辦', teacherNote: '日期競態驗收' };
  state.operations = { id: `op_${yesterday}_${teacher}`, date: yesterday, room: '北區教室', dutyOwner: teacher, evidenceByCheck: {} };
  state.activities = [{
    id: 'activity-13', date: yesterday, teacher, type: 'tutoring', title: '數學複習',
    objective: '複習異分母分數', action: '完成題目講解', result: '學生已理解', issue: '', nextAction: '',
    prepFeedback: {}, evidence: [],
  }];
  const apiCalls = [];
  const timers = [];
  const API = { saveLog: async payload => { apiCalls.push(copy(payload)); return { ok: true, revision: `revision-${payload.date}` }; } };
  const ctx = vm.createContext({
    state, console, clone: copy, Map, API,
    window: {
      API,
      setTimeout(callback) { timers.push(callback); return timers.length; },
      clearTimeout() {},
    },
    scheduledDailyCloudDraft: null, cloudDraftTimer: null, cloudDraftInFlight: null,
    queuedDailyCloudDrafts: new Map(), cloudDraftGeneration: 0, dailySubmitInFlight: false,
    integrationRuntime: {},
    uid: prefix => `${prefix}-qa`,
    todayActivities: () => state.activities.filter(item => item.teacher === state.context.teacher && item.date === state.daily.date && item.type !== 'lessonprep'),
    cloudTeacherNickname: value => value, cloudLogId: (name, date) => `${name}:${date}`,
    activityTrack: type => type === 'tutoring' ? 'academic' : 'enrichment', ACTIVITY_TYPES: { tutoring: { label: '安親輔導' } },
    contactDecisionText: () => '', dailyNeedsResubmit: () => false, cloudIdentityReady: () => true,
    persist() { return true; }, refreshSystemStatusNotice() {}, updateSaveIndicator() {},
    materialCloudUrl: item => item?.cloudUrl || '',
  });
  vm.runInContext(block('  function createDailySubmissionRecord(', '  async function submitDaily('), ctx);

  ctx.scheduleDailyCloudDraftSync();
  assert.equal(timers.length, 1);
  state.daily.date = today;
  state.daily.summary.keyResult = '10/14 內容';
  state.operations.date = today;
  timers[0]();
  await new Promise(resolve => setImmediate(resolve));

  assert.equal(apiCalls.length, 1);
  assert.equal(apiCalls[0].date, yesterday, '排程時選定的 10/13 不可在 timer 執行時變成 10/14');
  assert.equal(apiCalls[0].kpi6_data.v2_snapshot.submission.date, yesterday, 'v2 snapshot 也必須維持 10/13');
  assert.equal(apiCalls[0].kpi6_data.v2_snapshot.submission.keyResult, '10/13 完成事項', '必須送出排程當下的內容快照');
}

async function verifyFormalSubmitKeepsSelectedDate() {
  const state = baseState();
  state.daily.date = yesterday;
  state.daily.summary = { keyResult: '10/13 完成事項', followup: '無', tomorrowPriority: '10/14 待辦', teacherNote: '正式送出日期驗收' };
  state.operations = { id: `op_${yesterday}_${teacher}`, date: yesterday, room: '北區教室', dutyOwner: teacher, evidenceByCheck: {} };
  const apiCalls = [];
  const receipts = [];
  const API = {
    saveLog: async payload => { apiCalls.push(copy(payload)); return { ok: true, log_id: `LOG-${payload.date}`, revision: `revision-${payload.date}` }; },
    uploadPhoto: async () => ({ ok: true }),
    uploadFile: async () => ({ ok: true }),
  };
  const ctx = vm.createContext({
    state, console, clone: copy, Map, API,
    window: { API, setTimeout, clearTimeout },
    scheduledDailyCloudDraft: null, cloudDraftTimer: null, cloudDraftInFlight: null,
    queuedDailyCloudDrafts: new Map(), cloudDraftGeneration: 0, dailySubmitInFlight: true,
    localMediaRestoreInFlight: null, dailyCloudConflict: null, integrationRuntime: {},
    uid: prefix => `${prefix}-formal-qa`,
    todayActivities: () => state.activities.filter(item => item.teacher === state.context.teacher && item.date === state.daily.date && item.type !== 'lessonprep'),
    cloudTeacherNickname: value => value, cloudLogId: (name, date) => `${name}:${date}`,
    activityTrack: type => type === 'tutoring' ? 'academic' : 'enrichment', ACTIVITY_TYPES: { tutoring: { label: '安親輔導' } },
    contactDecisionText: () => '', dailyNeedsResubmit: () => false, cloudIdentityReady: () => true,
    materialCloudUrl: item => item?.cloudUrl || '',
    $: () => null, dailyKpiOptional: () => false, hasDailyRecords: () => true,
    dailyCompletion: () => 100, activityComplete: () => true,
    ensureCloudTeacherIdentity: async () => ({ ok: true }), syncAllTasksToCloud: async () => ({ ok: true, failed: 0 }),
    persist: () => true, updateSaveIndicator() {}, refreshSystemStatusNotice() {}, renderApp() {}, toast() {},
    showDailySubmissionReceipt(submission) { receipts.push(copy(submission)); },
    finishDailyDelivery: async () => {}, showDailyCloudConflict() {},
    markDailyNeedsResubmit() {},
  });
  vm.runInContext(block('  function createDailySubmissionRecord(', '  async function submitDaily('), ctx);
  ctx.uploadFormalEvidence = async () => [];
  vm.runInContext(block('  function dailySubmissionContentSignature(', '  async function submitWeekly('), ctx);

  await ctx.submitDailyRequest();

  assert.equal(apiCalls.length, 1, '正式送出只能寫入一次');
  assert.equal(apiCalls[0].submitted, true, '必須是正式送出，不是草稿');
  assert.equal(apiCalls[0].date, yesterday, '在 10/14 選擇 10/13 後，正式送出 payload 必須寫入 10/13');
  assert.equal(apiCalls[0].kpi6_data.v2_snapshot.submission.date, yesterday, '正式送出 v2 snapshot 也必須寫入 10/13');
  assert.equal(apiCalls[0].kpi6_data.v2_snapshot.submission.keyResult, '10/13 完成事項');
  assert.equal(receipts.length, 1, '雲端確認後應顯示成功回執');
}

Promise.all([verifyScheduledPayloadKeepsSelectedDate(), verifyFormalSubmitKeepsSelectedDate()]).then(() => {
  assert.match(source, /KPI 日期：\$\{formatDate\(state\.daily\.date\)\}/, '畫面要明確標示整份 KPI 日期');
  assert.match(source, /這裡只記錄備課檔案的建立日，不會切換整份 KPI 日期/, '備課日期需防止老師誤解');
  console.log('PASS Anqin selected KPI date, blank previous-workday entry, isolated workspaces, and frozen draft/formal payloads');
}).catch(error => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
