const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'apps-script/evaluation.gs'), 'utf8');
const start = source.indexOf('function evalSheetObjects_(');
const end = source.indexOf('function saveEval(');
assert.ok(start >= 0 && end > start, 'must locate optimized evaluation evidence functions');

const SHEET_NAMES = {
  USERS: 'Users',
  LOGS: 'DailyLogs',
  EVIDENCE: 'Evidence',
  FEEDBACK: 'Feedback',
  OBSERVATION: 'Observation',
  POSTS: 'Posts',
  OKR: 'OKR_Goals',
};

const tables = {
  Users: [
    ['nickname', 'role', 'department', 'status', 'subtype'],
    ['紅豆', 'teacher', '東橋教室', 'active', ''],
    ['柏翰', 'admin', '總部', 'active', ''],
    ['酸酸', 'manager', '東橋教室', 'active', ''],
  ],
  DailyLogs: [
    ['log_id', 'date', 'nickname', 'is_makeup'],
    ['LOG-1', '2026-09-08', '紅豆', false],
    ['LOG-2', '2026-09-09', '紅豆', true],
    ['LOG-3', '2026-10-01', '紅豆', false],
  ],
  Evidence: [
    ['evidence_id', 'date', 'nickname', 'kpi_category', 'source_type'],
    ['EV-1', '2026-09-08', '紅豆', 2, 'v2-lesson'],
    ['EV-2', '2026-09-09', '紅豆', 6, 'env_after'],
  ],
  Feedback: [
    ['feedback_id', 'to_nickname', 'tag', 'created_at'],
    ['FB-1', '紅豆', '優秀表現', '2026-09-15T08:00:00.000Z'],
  ],
  Observation: [
    ['obs_id', 'date', 'observed'],
    ['OBS-1', '2026-09-16', '紅豆'],
  ],
  Posts: [
    ['post_id', 'date', 'nickname', 'week_of'],
  ],
  OKR_Goals: [
    ['okr_id', 'semester', 'nickname'],
    ['OKR-1', '2026-下', '紅豆'],
  ],
};

const reads = {};
const context = {
  SHEET_NAMES,
  getSheet(name) {
    assert.ok(tables[name], `unexpected sheet ${name}`);
    return {
      getDataRange() {
        return {
          getValues() {
            reads[name] = (reads[name] || 0) + 1;
            return tables[name].map(row => row.slice());
          },
        };
      },
    };
  },
  cellDateStr_: value => value instanceof Date ? value.toISOString().slice(0, 10) : value,
  findUserByNickname() {
    throw new Error('getEvalEvidence must not rescan Users through findUserByNickname');
  },
  isAnqinUser: user => ['東橋教室', '北區教室'].includes(user?.department),
  isGlobalManager_: user => user?.role === 'admin',
  sameDepartment_: (a, b) => a === b,
  normalizeDepartment_: value => value,
};
vm.createContext(context);
vm.runInContext(source.slice(start, end), context);

const result = context.getEvalEvidence({
  nickname: '紅豆',
  year_month: '2026-09',
  viewer: '柏翰',
  __actor: { nickname: '柏翰', role: 'admin', department: '總部', status: 'active' },
});

assert.equal(result.ok, true);
assert.equal(result.summary.log_count, 2);
assert.equal(result.summary.makeup_count, 1);
assert.equal(result.summary.evidence_count, 2);
assert.equal(result.summary.feedback_count, 1);
assert.equal(result.summary.observation_count, 1);
assert.equal(result.summary.env_days, 1);
assert.equal(result.summary.lesson_days, 1);
assert.equal(result.okrs.length, 1);
assert.equal(result.evidence_by_kpi[2].length, 1);
assert.equal(result.evidence_by_kpi[6].length, 1);
assert.deepEqual(
  Object.fromEntries(Object.entries(reads).sort()),
  {
    DailyLogs: 1,
    Evidence: 1,
    Feedback: 1,
    OKR_Goals: 1,
    Observation: 1,
    Users: 1,
  },
  'Anqin teacher evidence load must use exactly one bulk read per required sheet and skip Posts',
);

const readSourceStart = source.indexOf('function normalizeEvalYearMonth_(');
const readSourceEnd = source.indexOf('/**\n * 清除測試交易資料');
assert.ok(readSourceStart >= 0 && readSourceEnd > readSourceStart, 'must locate evaluation read functions');

const evalRows = [{
  eval_id: 'EVAL-2026-09-紅豆', year_month: '2026-09', nickname: '紅豆',
  evaluator: '柏翰', status: 'draft', total_score: 80,
}];
const userRows = [
  { nickname: '紅豆', role: 'teacher', department: '東橋教室', status: 'active' },
  { nickname: '柏翰', role: 'admin', department: '總部', status: 'active' },
];
const evalReads = {};
const evalReadContext = vm.createContext({
  Utilities: { formatDate: value => value.toISOString().slice(0, 7) },
  SHEET_NAMES: { USERS: 'Users', TEACHER_EVAL: 'TeacherEval', MANAGER_EVAL: 'ManagerEval' },
  evalSheetObjects_(name) {
    evalReads[name] = (evalReads[name] || 0) + 1;
    if (name === 'Users') return userRows.map(row => ({ ...row }));
    if (name === 'TeacherEval') return evalRows.map(row => ({ ...row }));
    return [];
  },
  sheetToObjects() { throw new Error('optimized evaluation reads must use evalSheetObjects_'); },
  findUserByNickname() { throw new Error('optimized evaluation reads must not rescan Users'); },
  findObject() { throw new Error('getEval must not rescan the evaluation sheet for eval_id'); },
  sameDepartment_: (a, b) => a === b,
  isGlobalManager_: user => user?.role === 'admin',
});
vm.runInContext(source.slice(readSourceStart, readSourceEnd), evalReadContext);

const evaluation = evalReadContext.getEval({
  nickname: '紅豆', year_month: '2026-09', viewer: '柏翰',
  __actor: { nickname: '柏翰', role: 'admin', department: '總部', status: 'active' },
});
assert.equal(evaluation.ok, true);
assert.equal(evaluation.eval.eval_id, 'EVAL-2026-09-紅豆');
assert.deepEqual(evalReads, { Users: 1, TeacherEval: 1 }, 'getEval must bulk-read each required sheet once');

Object.keys(evalReads).forEach(key => delete evalReads[key]);
const listed = evalReadContext.listEvals({
  role: 'teacher', viewer: '柏翰',
  __actor: { nickname: '柏翰', role: 'admin', department: '總部', status: 'active' },
});
assert.equal(listed.ok, true);
assert.deepEqual(evalReads, { TeacherEval: 1 }, 'admin listEvals must reuse the authenticated actor and read only the evaluation sheet');

console.log('evaluation evidence bulk-read performance tests passed');
