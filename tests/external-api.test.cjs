const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'apps-script/externalapi.gs'), 'utf8');
const deployed = fs.readFileSync(path.join(root, 'apps-script/_all_in_one.gs'), 'utf8');
const code = fs.readFileSync(path.join(root, 'apps-script/Code.gs'), 'utf8');
const properties = new Map();
const rows = {
  Students: [
    { student_id: 's1', name: '甲', teacher: '小明', department: '北區教室', status: 'active' },
    { student_id: 's2', name: '乙', teacher: '小明', department: '北區教室', status: 'active' },
  ],
  DailyLogs: [{ date: '2026-10-02', submitted_at: '2026-10-02T18:00:00' }],
  Tasks: [{ task_id: 't1', status: 'open' }, { task_id: 't2', status: 'done' }],
  TalentRecords: [
    {
      record_id: 'lesson-old', record_type: 'lesson', nickname: '小明', record_date: '2026-09-25', updated_at: '2026-09-25T20:00:00',
      data_json: { teacher: '小明', scheduleKey: 'wed-1', courseName: 'WeDo', site: '北區', expected: 5, present: 4, trial: 0, lessonStatus: 'held' },
    },
    {
      record_id: 'lesson-new', record_type: 'lesson', nickname: '小明', record_date: '2026-10-02', updated_at: '2026-10-02T20:00:00',
      data_json: { teacher: '小明', scheduleKey: 'wed-1', courseName: 'WeDo', site: '北區', expected: 6, present: 5, trial: 1, lessonStatus: 'held' },
    },
  ],
};
const sheets = Object.fromEntries(Object.entries(rows).map(([name, items]) => {
  const headers = [...new Set(items.flatMap(item => Object.keys(item)))];
  return [name, {
    headers,
    getLastRow: () => items.length + 1,
    getLastColumn: () => headers.length,
    getRange: (row, _column, count) => ({
      getValues: () => items.slice(row - 2, row - 2 + count).map(item => headers.map(header => item[header] ?? '')),
    }),
  }];
}));

const context = vm.createContext({
  Array, Date, Error, JSON, Math, Number, Object, RegExp, String,
  SHEET_NAMES: {
    USERS: 'Users', LOGS: 'DailyLogs', WEEKLY: 'WeeklyReports', OKR: 'OKR',
    TEACHER_EVAL: 'TeacherEval', MANAGER_EVAL: 'ManagerEval', FEEDBACK: 'Feedback',
    EVIDENCE: 'Evidence', OBSERVATION: 'Observation', POSTS: 'Posts', KPI_CONFIG: 'KpiConfig',
    STUDENTS: 'Students', TASKS: 'Tasks', COURSE_PREP: 'CoursePrep',
    TALENT_RECORDS: 'TalentRecords', ADMIN_MARKETING_RECORDS: 'AdminMarketingRecords',
  },
  Utilities: {
    DigestAlgorithm: { SHA_256: 'sha256' }, Charset: { UTF_8: 'utf8' },
    computeDigest: (_algorithm, value) => Array.from(crypto.createHash('sha256').update(value).digest()).map(value => value > 127 ? value - 256 : value),
    getUuid: () => crypto.randomUUID(),
    formatDate: value => new Date(value).toISOString(),
    base64Encode: value => Buffer.from(value.map(byte => byte < 0 ? byte + 256 : byte)).toString('base64'),
  },
  PropertiesService: {
    getScriptProperties: () => ({
      getProperty: key => properties.get(key) || null,
      setProperty: (key, value) => properties.set(key, value),
      deleteProperty: key => properties.delete(key),
    }),
  },
  Logger: { log: () => {} },
  constantTimeTextEqual_: (left, right) => left === right,
  nowIso: () => '2026-10-02T12:00:00',
  todayStr: () => '2026-10-02',
  getHeaders: sheet => sheet.headers,
  getSS: () => ({ getSheetByName: name => sheets[name] || null }),
});
vm.runInContext(source, context);

const setup = context.setupExternalDataAccess();
assert.match(setup.api_key, /^bp_kpi_[a-f0-9]{64}$/);
assert.notEqual(properties.get('EXTERNAL_DATA_API_KEY_SHA256'), setup.api_key, 'Apps Script 只可保存金鑰雜湊');
assert.equal(context.authenticateExternalDataRequest_({ api_key: setup.api_key }, 'POST').ok, true);
assert.equal(context.authenticateExternalDataRequest_({ api_key: setup.api_key }, 'GET').ok, false, '金鑰不可放在 GET 網址');
assert.equal(context.authenticateExternalDataRequest_({ api_key: 'bp_kpi_' + '0'.repeat(64) }, 'POST').ok, false);

const summary = context.externalOperationalSummary_();
assert.equal(summary.talent.class_count, 1);
assert.equal(summary.talent.latest_expected_students, 6, '同一班級只採最近一堂回報');
assert.equal(summary.talent.latest_present_students, 5);
assert.equal(summary.talent.latest_trial_students, 1);
assert.equal(summary.student_rosters[0].active_students, 2);
assert.equal(summary.tasks.open_count, 1);
assert.equal(summary.daily_logs.submitted_count, 1);

assert.match(code, /action === 'externalData'[\s\S]*authenticateExternalDataRequest_\(params, method\)/);
assert.match(code, /'externalData': \(\) => externalData\(params\)/);
assert.ok(deployed.includes(code.trim()), '_all_in_one.gs 必須逐字包含 Code.gs');
assert.ok(deployed.includes(source.trim()), '_all_in_one.gs 必須逐字包含 externalapi.gs');
