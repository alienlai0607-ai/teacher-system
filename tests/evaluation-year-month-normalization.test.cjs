const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const backend = fs.readFileSync(path.join(__dirname, '../apps-script/evaluation.gs'), 'utf8');
const source = backend.slice(
  backend.indexOf('function normalizeEvalYearMonth_('),
  backend.indexOf('/**\n * 清除測試交易資料')
);

const septemberDate = new Date('2026-09-01T00:00:00.000Z');
const octoberDate = new Date('2026-10-01T00:00:00.000Z');
const teacherEvals = [
  {
    eval_id: 'EVAL-2026-09-紅豆', year_month: septemberDate, nickname: '紅豆', evaluator: '小魚',
    status: 'submitted', total_score: 80, updated_at: '2026-10-02T09:00:00'
  },
  {
    eval_id: 'EVAL-2026-10-紅豆', year_month: octoberDate, nickname: '紅豆', evaluator: '小魚',
    status: 'draft', total_score: 90, updated_at: '2026-10-08T09:00:00'
  },
  {
    eval_id: 'EVAL-2026-09-小明', year_month: '2026-09', nickname: '小明', evaluator: '小魚',
    status: 'submitted', total_score: 60, updated_at: '2026-10-02T09:00:00'
  }
];
const users = [
  { nickname: '紅豆', role: 'teacher', status: 'active', department: '安親部門' },
  { nickname: '小明', role: 'teacher', status: 'active', department: '安親部門' },
  { nickname: '小魚', role: 'manager', status: 'active', department: '安親部門' }
];

const context = vm.createContext({
  Utilities: {
    formatDate(value, _timezone, pattern) {
      assert.equal(pattern, 'yyyy-MM');
      return value.toISOString().slice(0, 7);
    }
  },
  SHEET_NAMES: {
    TEACHER_EVAL: 'TeacherEval', MANAGER_EVAL: 'ManagerEval', USERS: 'Users'
  },
  findUserByNickname: nickname => users.find(user => user.nickname === nickname) || null,
  sameDepartment_: (left, right) => left === right,
  isGlobalManager_: () => false,
  sheetToObjects: name => name === 'TeacherEval' ? teacherEvals : name === 'Users' ? users : [],
  findObject: (_sheet, _key, value) => teacherEvals.find(item => item.eval_id === value) || null
});
vm.runInContext(source, context);

assert.equal(context.normalizeEvalYearMonth_(septemberDate), '2026-09', 'Sheets Date 應正規化成 YYYY-MM');
assert.equal(context.normalizeEvalYearMonth_('2026/9/01'), '2026-09', '日期字串也應正規化月份');
assert.equal(context.normalizeEvalYearMonth_('2026-9'), '2026-09', '單位數月份應補零');

const managerLatest = context.getEval({ nickname: '紅豆', viewer: '小魚', year_month: 'latest' });
assert.equal(managerLatest.eval.eval_id, 'EVAL-2026-10-紅豆', 'Date 月份排序仍應取最新月份');
assert.equal(managerLatest.eval.year_month, '2026-10', '評核回傳月份不可洩漏 Date/ISO 字串');
assert.deepEqual(Array.from(managerLatest.months), ['2026-10', '2026-09'], '月份清單應統一 YYYY-MM 並正確排序');

const teacherLatest = context.getEval({ nickname: '紅豆', viewer: '紅豆', year_month: 'latest' });
assert.equal(teacherLatest.eval.eval_id, 'EVAL-2026-09-紅豆', '老師最近評核仍需排除草稿');
assert.equal(teacherLatest.eval.year_month, '2026-09');

const explicit = context.getEval({ nickname: '紅豆', viewer: '小魚', year_month: septemberDate });
assert.equal(explicit.eval.eval_id, 'EVAL-2026-09-紅豆', 'Date 查詢參數也應找到正確 eval_id');
assert.equal(explicit.selected_month, '2026-09');
assert.equal(explicit.eval.year_month, '2026-09');

const listed = context.listEvals({ viewer: '小魚', role: 'teacher', year_month: '2026-09' });
assert.equal(listed.ok, true);
assert.deepEqual(Array.from(listed.evals, item => `${item.nickname}:${item.year_month}`), [
  '紅豆:2026-09', '小明:2026-09'
], '清單需用正規化月份篩選並回傳 YYYY-MM');

assert.equal(context.calcDeptAvg('安親部門', '2026-09'), 70, '部門平均需同時納入 Date 與字串月份資料');

console.log('evaluation year_month normalization tests passed');
