const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const pdfSource = fs.readFileSync(path.join(root, 'apps-script/pdfreport.gs'), 'utf8');
const queueSource = pdfSource.slice(
  pdfSource.indexOf("const DEFERRED_TEACHER_REPORT_PREFIX_"),
  pdfSource.indexOf('/** API：手動生成', pdfSource.indexOf("const DEFERRED_TEACHER_REPORT_PREFIX_")),
);
const logsSource = fs.readFileSync(path.join(root, 'apps-script/logs.gs'), 'utf8');
const talentSource = fs.readFileSync(path.join(root, 'apps-script/talentrecords.gs'), 'utf8');
const anqinSource = fs.readFileSync(path.join(root, 'review/anqin-v2/app.js'), 'utf8');
const legacyTeacherSource = fs.readFileSync(path.join(root, 'teacher/today.html'), 'utf8');

const properties = new Map();
const triggerDelays = [];
const kpiCalls = [];
const talentCalls = [];
let failKpi = false;
const scriptProperties = {
  getProperty: key => properties.get(key) || null,
  setProperty: (key, value) => properties.set(key, String(value)),
  deleteProperty: key => properties.delete(key),
  getProperties: () => Object.fromEntries(properties),
};
const context = vm.createContext({
  Buffer,
  Date,
  JSON,
  Math,
  Object,
  String,
  Utilities: {
    Charset: { UTF_8: 'UTF-8' },
    base64EncodeWebSafe: value => Buffer.from(String(value), 'utf8').toString('base64url'),
  },
  LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock: () => {} }) },
  PropertiesService: { getScriptProperties: () => scriptProperties },
  ScriptApp: {
    newTrigger: () => ({
      timeBased: () => ({
        after: delay => ({ create: () => triggerDelays.push(delay) }),
      }),
    }),
  },
  nowIso: () => '2026-10-05T12:00:00.000+08:00',
  sendSubmitPdf: params => {
    kpiCalls.push(params);
    return failKpi ? { ok: false, error: '暫時失敗' } : { ok: true };
  },
  repairTalentLessonReportById_: id => {
    talentCalls.push(id);
    return { ok: true, current: true };
  },
});
vm.runInContext(queueSource, context);

const first = context.queueDeferredTeacherReport_({ type: 'kpi', nickname: '小明', date: '2026-10-05' });
assert.equal(first.queued, true);
assert.equal(first.scheduled, true);
assert.equal(triggerDelays.length, 1, '第一筆工作需建立觸發器');
assert.ok(triggerDelays[0] >= 60000, '背景觸發器需符合 Apps Script 最短延遲');

context.queueDeferredTeacherReport_({ type: 'kpi', nickname: '小明', date: '2026-10-05' });
assert.equal(triggerDelays.length, 1, '同一筆重複儲存不得製造重複觸發器');
let result = context.processDeferredTeacherReportsAuto();
assert.equal(result.ok, true);
assert.equal(JSON.stringify(kpiCalls[0]), JSON.stringify({ nickname: '小明', date: '2026-10-05' }));
assert.equal([...properties.keys()].some(key => key.includes('JOB_V1_')), false, '成功工作需從佇列移除');

context.queueDeferredTeacherReport_({ type: 'talent', lessonId: 'lesson-123' });
result = context.processDeferredTeacherReportsAuto();
assert.equal(result.ok, true);
assert.deepEqual(talentCalls, ['lesson-123']);

failKpi = true;
context.queueDeferredTeacherReport_({ type: 'kpi', nickname: '小美', date: '2026-10-05' });
result = context.processDeferredTeacherReportsAuto();
assert.equal(result.ok, false);
const retryJob = [...properties.entries()].find(([key]) => key.includes('JOB_V1_kpi_'));
assert.ok(retryJob, '失敗工作必須保留');
const retryPayload = JSON.parse(retryJob[1]);
assert.equal(retryPayload.attempts, 1);
assert.ok(retryPayload.nextAttemptAt > Date.now(), '失敗工作需延後重試');

assert.match(logsSource, /queueDeferredTeacherReport_\(\{ type: 'kpi'/, '安親日報需由後端佇列接手 PDF 與通知');
const saveTalentLessonSource = talentSource.slice(talentSource.indexOf('function saveTalentLesson('), talentSource.indexOf('function saveTalentPrep('));
assert.doesNotMatch(saveTalentLessonSource, /generateTalentLessonPdf_/, '才藝資料儲存不得同步生成 PDF');
assert.doesNotMatch(anqinSource.slice(anqinSource.indexOf('async function submitDaily()'), anqinSource.indexOf('async function submitWeekly()')), /await API\.sendSubmitPdf/, '新安親畫面不得等待 PDF');
assert.doesNotMatch(legacyTeacherSource.slice(legacyTeacherSource.indexOf('async function submitLog()'), legacyTeacherSource.indexOf('// ===== 載入今日草稿')), /await API\.sendSubmitPdf/, '舊老師畫面不得等待 PDF');

console.log('background-report-queue.test.cjs passed');
