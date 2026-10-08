const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const backend = fs.readFileSync(path.join(root, 'apps-script/evaluation.gs'), 'utf8');
const allInOne = fs.readFileSync(path.join(root, 'apps-script/_all_in_one.gs'), 'utf8');
const frontend = fs.readFileSync(path.join(root, 'review/anqin-v2/app.js'), 'utf8');
const qaHarness = fs.readFileSync(path.join(root, 'review/anqin-v2/qa-harness.js'), 'utf8');

const saveEvalSource = backend.slice(backend.indexOf('function saveEval('), backend.indexOf('function getEval('));
assert.ok(saveEvalSource.startsWith('function saveEval('), 'must locate the Anqin evaluation save rule');
assert.ok(allInOne.includes(saveEvalSource.trim()), 'the deployable all-in-one backend must mirror evaluation.gs');

const rows = [];
let existing = null;
let updated = null;
const users = {
  '紅豆': { nickname: '紅豆', role: 'teacher', department: '東橋教室', status: 'active' },
  '小魚': { nickname: '小魚', role: 'manager', department: '東橋教室', status: 'active' },
};
const logs = [];
const ensuredHeaders = [];
const tiers = [
  { min: 95, max: 100, grade: '卓越', bonus: 3000 },
  { min: 88, max: 94, grade: '優良', bonus: 2000 },
  { min: 82, max: 87, grade: '達標', bonus: 1000 },
  { min: 75, max: 81, grade: '基本合格', bonus: 0 },
  { min: 0, max: 74, grade: '待改善', bonus: 0 },
];
const context = vm.createContext({
  SHEET_NAMES: { LOGS: 'DailyLogs', TEACHER_EVAL: 'TeacherEval', MANAGER_EVAL: 'ManagerEval' },
  findUserByNickname: nickname => users[nickname] || null,
  sameDepartment_: (left, right) => left === right,
  isGlobalManager_: () => false,
  isAnqinUser: user => user?.role === 'teacher' && user.department === '東橋教室',
  getSheet: name => ({ name }),
  ensureHeaders: (sheet, headers) => ensuredHeaders.push({ sheet: sheet.name, headers: [...headers] }),
  sheetToObjects: sheet => sheet === 'DailyLogs' ? logs : rows,
  findObject: () => existing,
  appendRow: (_sheet, data) => rows.push({ ...data }),
  updateRow: (_sheet, _row, data) => { updated = { ...data }; },
  nowIso: () => '2026-10-08T12:00:00.000Z',
  calcBonusForUser: score => tiers.find(tier => score >= tier.min && score <= tier.max),
  calcDeptAvg: () => 0,
  logSystem() {},
});
vm.runInContext(saveEvalSource, context);
assert.deepEqual(ensuredHeaders, [], 'schema migration runs lazily when an evaluation is saved');

function payload(overrides = {}) {
  return {
    nickname: '紅豆', year_month: '2026-10', evaluator: '小魚', status: 'submitted',
    manager_comment: '本月工作狀況已完成評核', bonus_granted: true,
    score_k1: 20, score_k2: 20, score_k3: 20, score_k4: 20, score_k5: 12, score_k6: 8,
    score_late_count: 2,
    ...overrides,
  };
}

const twoLates = context.saveEval(payload());
assert.equal(twoLates.total_score, 100, 'zero to two late occurrences do not deduct points');
assert.equal(twoLates.grade, '卓越', 'bonus tier uses the score after the late threshold rule');
assert.equal(rows.at(-1).score_late_count, 2);
assert.equal(rows.at(-1).late_penalty, 0);
assert.equal(rows.at(-1).total_score, 100);

const threeLates = context.saveEval(payload({ score_late_count: 3 }));
assert.equal(threeLates.total_score, 95, 'three late occurrences trigger one fixed five-point deduction');
assert.equal(rows.at(-1).late_penalty, 5);
const manyLates = context.saveEval(payload({ score_late_count: 9 }));
assert.equal(manyLates.total_score, 95, 'lateness remains a fixed five-point deduction after the threshold');
assert.equal(rows.at(-1).late_penalty, 5);

logs.push(
  { nickname: '紅豆', date: '2026-10-02', is_makeup: true },
  { nickname: '紅豆', date: '2026-10-03', is_makeup: true },
);
const combined = context.saveEval(payload({ score_k5: 10 }));
assert.equal(combined.total_score, 94, 'manual KPI scores and automatic missing-work deduction combine without a duplicate late deduction');
const combinedRow = rows.at(-1);
assert.equal(combinedRow.score_k5, 10, 'automatic lateness must not overwrite the manager manual category score');
assert.equal(combinedRow.makeup_penalty, 4);
assert.equal(combinedRow.late_penalty, 0);

existing = { _row: 7, eval_id: 'EVAL-2026-10-紅豆', status: 'submitted', total_score: 100, score_late_count: 2, late_penalty: 0 };
const resaved = context.saveEval(payload());
assert.equal(resaved.total_score, 96, 'an explicitly re-saved record adopts the current threshold rule and current missing-work evidence');
assert.equal(updated.late_penalty, 0);
assert.equal(updated.total_score, 96);
assert.equal(existing.total_score, 100, 'the previously published object is not mutated merely by reading it');

assert.equal(context.saveEval(payload({ score_late_count: 1.5 })).ok, false, 'lateness must remain a non-negative integer');

const helperStart = frontend.indexOf('  function savedEvaluationNumber(');
const helperEnd = frontend.indexOf('  function renderTeacherEvaluation()', helperStart);
assert.ok(helperStart >= 0 && helperEnd > helperStart, 'must locate frontend evaluation helpers');
const helperContext = vm.createContext({
  ANQIN_LATE_PENALTY_POINTS: 5,
  ANQIN_SEPTEMBER_BONUS_MONTH: '2026-09',
  ANQIN_SEPTEMBER_BONUS_MAX: 5,
  Number,
  Math,
});
vm.runInContext(frontend.slice(helperStart, helperEnd), helperContext);
const fullScores = [20, 20, 20, 20, 12, 8];
assert.equal(helperContext.evaluationLatePenaltyForCount(2), 0);
assert.equal(helperContext.evaluationLatePenaltyForCount(3), 5);
assert.equal(helperContext.evaluationLatePenaltyForCount(20), 5, 'late deduction is fixed, not multiplied');
assert.equal(helperContext.evaluationBonusGranted({}), true, 'a new or legacy evaluation defaults to granting its tier bonus');
assert.equal(helperContext.evaluationBonusGranted({ bonus_granted: true }), true);
assert.equal(helperContext.evaluationBonusGranted({ bonus_granted: 'TRUE' }), true);
assert.equal(helperContext.evaluationBonusGranted({ bonus_granted: false }), false, 'only an explicit false cancels the tier bonus');
assert.equal(helperContext.evaluationBonusGranted({ bonus_granted: 'FALSE' }), false);
assert.equal(helperContext.displayedEvaluationTotal({ total_score: 100, score_late_count: 2, late_penalty: 0 }, fullScores), 100,
  'an old published result remains its saved value and is not reinterpreted on read');
assert.equal(helperContext.displayedEvaluationTotal({ total_score: 90, score_late_count: 2, late_penalty: 10 }, fullScores), 90,
  'a newly saved result displays its authoritative total without deducting lateness twice');
assert.equal(helperContext.displayedEvaluationTotal({ makeup_penalty: 2, late_penalty: 5 }, fullScores), 93,
  'legacy rows without total_score fall back to their saved penalty fields, not a new count-based rule');

const totalNode = { textContent: '' };
const tierNode = { textContent: '' };
const lateNote = { className: '' };
const lateTitle = { textContent: '' };
const lateCopy = { textContent: '' };
const form = {
  elements: {
    score_k1: { value: 20 }, score_k2: { value: 20 }, score_k3: { value: 20 },
    score_k4: { value: 20 }, score_k5: { value: 12 }, score_k6: { value: 8 },
    score_late_count: { value: 2 },
  },
};
Object.assign(helperContext, {
  ANQIN_KPI_STANDARDS: fullScores.map(points => ({ points })),
  integrationRuntime: { managerEvaluationMonth: '2026-10', managerEvaluationEvidence: { summary: { makeup_count: 0 } } },
  evaluationTier: total => ({ grade: total >= 88 ? '優良' : '達標', bonus: total >= 88 ? 'NT$2,000' : 'NT$1,000' }),
  $: selector => ({
    '#manager-evaluation-form': form,
    '#manager-eval-total': totalNode,
    '#manager-eval-tier': tierNode,
    '#manager-eval-late-note': lateNote,
    '#manager-eval-late-title': lateTitle,
    '#manager-eval-late-copy': lateCopy,
  })[selector] || null,
});
const refreshStart = frontend.indexOf('  function refreshManagerEvaluationTotal()');
const refreshEnd = frontend.indexOf('  async function saveManagerEvaluation(', refreshStart);
vm.runInContext(frontend.slice(refreshStart, refreshEnd), helperContext);
helperContext.refreshManagerEvaluationTotal();
assert.equal(totalNode.textContent, '100', 'manager live preview does not deduct the first two late occurrences');
assert.equal(tierNode.textContent, '優良 · NT$2,000');
assert.match(lateTitle.textContent, /遲到 2 次，不扣分/);
form.elements.score_late_count.value = 3;
helperContext.refreshManagerEvaluationTotal();
assert.equal(totalNode.textContent, '95', 'manager live preview applies one fixed deduction at three lates');
assert.match(lateTitle.textContent, /遲到 3 次，固定扣 5 分/);

assert.match(frontend, /data-input="manager-eval-late"/, 'the manager late-count control participates in live calculation');
assert.match(frontend, /septemberBonusPoints - septemberMissingPenalty - makeupPenalty - latePenalty/, 'the manager preview combines bonus and deductions exactly once');
assert.match(frontend, /已公布評核以當時寫入的 total_score 與各加扣分欄位為準/, 'published evaluations document saved-value compatibility');
assert.equal((frontend.match(/const granted = evaluationBonusGranted\(evaluation\);/g) || []).length, 2,
  'teacher and manager evaluation views must share the explicit-false-only bonus rule');
assert.match(qaHarness, /const latePenalty = lateCount >= 3 \? 5 : 0;/, 'isolated browser QA mirrors the production threshold rule');

console.log('PASS Anqin lateness: 0–2 no deduction, 3+ fixed five points, live total, and saved-history compatibility');
