const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const backend = fs.readFileSync(path.join(root, 'apps-script/evaluation.gs'), 'utf8');
const setup = fs.readFileSync(path.join(root, 'apps-script/setup.gs'), 'utf8');
const frontend = fs.readFileSync(path.join(root, 'review/anqin-v2/app.js'), 'utf8');
const qaHarness = fs.readFileSync(path.join(root, 'review/anqin-v2/qa-harness.js'), 'utf8');
const legacyManager = fs.readFileSync(path.join(root, 'manager/eval.html'), 'utf8');
const legacyReport = fs.readFileSync(path.join(root, 'manager/report.html'), 'utf8');
const rules = fs.readFileSync(path.join(root, 'teacher/rules.html'), 'utf8');
const schema = fs.readFileSync(path.join(root, 'docs/SCHEMA.md'), 'utf8');

const saveEvalSource = backend.slice(backend.indexOf('function saveEval('), backend.indexOf('function getEval('));
assert.ok(saveEvalSource.startsWith('function saveEval('), 'must locate the production evaluation save rule');

const rows = [];
const logs = [];
const headerCalls = [];
let existing = null;
let updated = null;
const users = {
  '紅豆': { nickname: '紅豆', role: 'teacher', department: '東橋教室', status: 'active' },
  '小魚': { nickname: '小魚', role: 'manager', department: '東橋教室', status: 'active' },
};
const tiers = [
  { min: 95, max: 100, grade: '卓越', bonus: 3000 },
  { min: 88, max: 94, grade: '優良', bonus: 2000 },
  { min: 82, max: 87, grade: '達標', bonus: 1000 },
  { min: 75, max: 81, grade: '基本合格', bonus: 0 },
  { min: 0, max: 74, grade: '待改善', bonus: 0 },
];
const backendContext = vm.createContext({
  SHEET_NAMES: { LOGS: 'DailyLogs', TEACHER_EVAL: 'TeacherEval', MANAGER_EVAL: 'ManagerEval' },
  findUserByNickname: nickname => users[nickname] || null,
  sameDepartment_: (left, right) => left === right,
  isGlobalManager_: () => false,
  isAnqinUser: user => user?.role === 'teacher' && user.department === '東橋教室',
  getSheet: name => ({ name }),
  ensureHeaders: (sheet, headers) => headerCalls.push({ sheet: sheet.name, headers: [...headers] }),
  sheetToObjects: sheet => sheet === 'DailyLogs' ? logs : rows,
  findObject: () => existing,
  appendRow: (_sheet, data) => rows.push({ ...data }),
  updateRow: (_sheet, _row, data) => { updated = { ...data }; },
  nowIso: () => '2026-10-08T12:00:00.000Z',
  calcBonusForUser: score => tiers.find(tier => score >= tier.min && score <= tier.max),
  calcDeptAvg: () => 0,
  logSystem() {},
});
vm.runInContext(saveEvalSource, backendContext);

function payload(overrides = {}) {
  return {
    nickname: '紅豆', year_month: '2026-09', evaluator: '小魚', status: 'submitted',
    manager_comment: '本月工作狀況已完成評核', bonus_granted: true,
    score_k1: 20, score_k2: 20, score_k3: 20, score_k4: 20, score_k5: 12, score_k6: 8,
    score_late_count: 0,
    ...overrides,
  };
}

logs.push(
  { nickname: '紅豆', date: '2026-09-02', is_makeup: true },
  { nickname: '紅豆', date: '2026-09-03', is_makeup: true },
  { nickname: '紅豆', date: '2026-09-04', is_makeup: true },
  { nickname: '紅豆', date: '2026-09-05', is_makeup: true },
  { nickname: '紅豆', date: '2026-09-06', is_makeup: true },
);
const combined = backendContext.saveEval(payload({ score_late_count: 4, september_missing_count: 2, september_bonus_points: 5 }));
assert.equal(combined.total_score, 96, '100 + 5 - two manager-entered missing records - one fixed late penalty is applied exactly once');
assert.equal(combined.grade, '卓越', 'the final adjusted score selects the bonus tier');
assert.equal(rows.at(-1).september_bonus_points, 5);
assert.equal(rows.at(-1).september_missing_count, 2);
assert.equal(rows.at(-1).september_missing_penalty, 4);
assert.equal(rows.at(-1).makeup_count, 0, 'September never copies unstable automatic log counts into the score');
assert.equal(rows.at(-1).makeup_penalty, 0);
assert.equal(rows.at(-1).late_penalty, 5);
assert.deepEqual(headerCalls.at(-1), { sheet: 'TeacherEval', headers: ['september_missing_count', 'september_missing_penalty', 'september_bonus_points'] },
  'a save upgrades an existing production TeacherEval header before writing');

logs.length = 0;
const capped = backendContext.saveEval(payload({ september_bonus_points: 5 }));
assert.equal(capped.total_score, 100, 'September bonus cannot raise KPI above 100');
assert.equal(capped.grade, '卓越');

for (const invalid of [-1, 6, 1.5, 'not-a-number']) {
  const result = backendContext.saveEval(payload({ september_bonus_points: invalid }));
  assert.equal(result.ok, false, `invalid September bonus ${invalid} must be rejected`);
}
for (const invalid of [-1, 1.5, 'not-a-number']) {
  const result = backendContext.saveEval(payload({ september_missing_count: invalid }));
  assert.equal(result.ok, false, `invalid September missing count ${invalid} must be rejected`);
}
assert.equal(backendContext.saveEval(payload({ year_month: '2026-10', september_missing_count: 1 })).ok, false,
  'a non-zero manual missing count outside 2026-09 must be rejected');
assert.equal(backendContext.saveEval(payload({ year_month: '2026-10', september_bonus_points: 1 })).ok, false,
  'a non-zero bonus outside 2026-09 must be rejected');
assert.equal(backendContext.saveEval(payload({ year_month: '2025-09', september_bonus_points: 5 })).ok, false,
  'the exception is exactly 2026-09, not every September');
assert.equal(backendContext.saveEval(payload({ year_month: '2026-10', september_bonus_points: 0 })).ok, true,
  'an explicit zero outside September is harmless');

const eightyPointScores = {
  score_k1: 15, score_k2: 15, score_k3: 15, score_k4: 15, score_k5: 12, score_k6: 8,
};
existing = {
  _row: 7, eval_id: 'EVAL-2026-09-紅豆', year_month: '2026-09', nickname: '紅豆',
  status: 'submitted', september_missing_count: 3, september_missing_penalty: 6,
  september_bonus_points: 4, total_score: 78,
};
updated = null;
const oldClientResave = backendContext.saveEval(payload({ ...eightyPointScores }));
assert.equal(oldClientResave.total_score, 78, 'an old cached client that omits new fields keeps the stored manual count and bonus');
assert.equal(updated.september_missing_count, 3, 'omission preserves the persisted manager-entered missing count');
assert.equal(updated.september_bonus_points, 4, 'omission preserves the persisted September bonus');

const explicitClear = backendContext.saveEval(payload({ ...eightyPointScores, september_bonus_points: 0 }));
assert.equal(explicitClear.total_score, 74, 'clearing only the bonus preserves the manager-entered missing count');
assert.equal(updated.september_bonus_points, 0);

const explicitClearAll = backendContext.saveEval(payload({ ...eightyPointScores, september_missing_count: 0, september_bonus_points: 0 }));
assert.equal(explicitClearAll.total_score, 80, 'the new UI can explicitly clear both manual September fields with zero');
assert.equal(updated.september_missing_count, 0);

existing = null;
const newWithoutField = backendContext.saveEval(payload({ ...eightyPointScores }));
assert.equal(newWithoutField.total_score, 80, 'a new row with no bonus field defaults to zero');
assert.equal(rows.at(-1).september_missing_count, 0);
assert.equal(rows.at(-1).september_bonus_points, 0);

assert.match(setup, /'september_missing_count', 'september_missing_penalty', 'september_bonus_points'/, 'setupSheets schema includes all September columns');
assert.match(saveEvalSource, /'september_missing_count', 'september_missing_penalty', 'september_bonus_points'/,
  'runtime save also upgrades an already deployed sheet');
assert.match(saveEvalSource, /anqin && !isManager && year_month === '2026-09'/,
  'backend eligibility is limited to an Anqin teacher evaluation in the exact month');

const helperStart = frontend.indexOf('  function savedEvaluationNumber(');
const helperEnd = frontend.indexOf('  function renderTeacherEvaluation()', helperStart);
assert.ok(helperStart >= 0 && helperEnd > helperStart, 'must locate published-score compatibility helpers');
const helperContext = vm.createContext({
  ANQIN_LATE_PENALTY_POINTS: 5,
  ANQIN_SEPTEMBER_BONUS_MONTH: '2026-09',
  ANQIN_SEPTEMBER_BONUS_MAX: 5,
  Number,
  Math,
});
vm.runInContext(frontend.slice(helperStart, helperEnd), helperContext);
const fullScores = [20, 20, 20, 20, 12, 8];
assert.equal(helperContext.displayedEvaluationTotal({
  year_month: '2026-09', total_score: 88, september_bonus_points: 5, late_penalty: 10, makeup_penalty: 4,
}, fullScores), 88, 'a published total remains authoritative and is never reinterpreted on read');
assert.equal(helperContext.displayedEvaluationTotal({ year_month: '2026-09', september_bonus_points: 5 }, [20, 20, 20, 20, 5, 5]), 95,
  'fallback totals include a saved September bonus');
assert.equal(helperContext.displayedEvaluationTotal({
  year_month: '2026-09', september_bonus_points: 5, september_missing_penalty: 4, late_penalty: 5,
}, fullScores), 96, 'fallback totals include the independent manual missing and fixed late penalties');
assert.equal(helperContext.displayedEvaluationTotal({ year_month: '2026-09' }, [20, 20, 20, 20, 5, 5]), 90,
  'a missing new field is treated as zero');
assert.equal(helperContext.displayedEvaluationTotal({ year_month: '2026-10', september_bonus_points: 5 }, [20, 20, 20, 20, 5, 5]), 90,
  'a stray bonus on another month is ignored by fallback display');
assert.equal(helperContext.displayedEvaluationTotal({ year_month: '2026-09', september_bonus_points: 5 }, fullScores), 100,
  'fallback display also caps the score at 100');

const managerTotalNode = { textContent: '' };
const managerTierNode = { textContent: '' };
const lateNote = { className: '' };
const lateTitle = { textContent: '' };
const lateCopy = { textContent: '' };
const managerForm = {
  elements: {
    score_k1: { value: 20 }, score_k2: { value: 20 }, score_k3: { value: 20 },
    score_k4: { value: 20 }, score_k5: { value: 12 }, score_k6: { value: 8 },
    score_late_count: { value: 4 }, september_missing_count: { value: 2 }, september_bonus_points: { value: 5 },
  },
};
Object.assign(helperContext, {
  ANQIN_KPI_STANDARDS: fullScores.map(points => ({ points })),
  integrationRuntime: { managerEvaluationMonth: '2026-09', managerEvaluationEvidence: { summary: { makeup_count: 2 } } },
  evaluationTier: total => ({ grade: total >= 95 ? '卓越' : total >= 88 ? '優良' : '達標', bonus: total >= 95 ? 'NT$3,000' : total >= 88 ? 'NT$2,000' : 'NT$1,000' }),
  $: selector => ({
    '#manager-evaluation-form': managerForm,
    '#manager-eval-total': managerTotalNode,
    '#manager-eval-tier': managerTierNode,
    '#manager-eval-late-note': lateNote,
    '#manager-eval-late-title': lateTitle,
    '#manager-eval-late-copy': lateCopy,
  })[selector] || null,
});
const refreshStart = frontend.indexOf('  function refreshManagerEvaluationTotal()');
const refreshEnd = frontend.indexOf('  async function saveManagerEvaluation(', refreshStart);
vm.runInContext(frontend.slice(refreshStart, refreshEnd), helperContext);
helperContext.refreshManagerEvaluationTotal();
assert.equal(managerTotalNode.textContent, '96', 'new manager UI ignores automatic September counts and combines manual missing, fixed lateness, and +5 once');
assert.equal(managerTierNode.textContent, '卓越 · NT$3,000');
managerForm.elements.september_bonus_points.value = 0;
helperContext.refreshManagerEvaluationTotal();
assert.equal(managerTotalNode.textContent, '91', 'explicit zero immediately removes the preview bonus');
managerForm.elements.september_bonus_points.value = 5;
helperContext.integrationRuntime.managerEvaluationMonth = '2026-10';
helperContext.refreshManagerEvaluationTotal();
assert.equal(managerTotalNode.textContent, '91', 'another month ignores stale September fields and uses automatic missing-work count plus the same fixed late rule');

assert.match(frontend, /selectedMonth === ANQIN_SEPTEMBER_BONUS_MONTH/, 'new manager UI gates the control by selected month');
assert.match(frontend, /name="september_bonus_points" min="0" max="\$\{ANQIN_SEPTEMBER_BONUS_MAX\}" step="1"/, 'new manager UI exposes an integer 0–5 control');
assert.match(frontend, /payload\.september_missing_count = septemberMissingCount;/,
  'new manager UI sends the manager-entered September missing count');
assert.match(frontend, /payload\.september_bonus_points = septemberBonusPoints;/,
  'new manager UI sends explicit zero for September bonus and omits it otherwise');
assert.match(frontend, /<div class="metadata-label">九月加分<\/div>/, 'published teacher view shows the bonus detail');
assert.match(frontend, /manager-eval-september-bonus/, 'the new bonus input participates in live recalculation');

const legacyRecalcStart = legacyManager.indexOf('function recalc()');
const legacyRecalcEnd = legacyManager.indexOf('async function saveEval(', legacyRecalcStart);
assert.ok(legacyRecalcStart >= 0 && legacyRecalcEnd > legacyRecalcStart, 'must locate legacy manager recalc');
const legacyNodes = {
  score_k1: { value: 20 }, score_k2: { value: 20 }, score_k3: { value: 20 },
  score_k4: { value: 20 }, score_k5: { value: 12 }, score_k6: { value: 8 },
  score_okr: { value: 0 }, score_late_count: { value: 4 }, september_missing_count: { value: 2 }, september_bonus_points: { value: 5 },
  'select-month': { value: '2026-09' }, 'total-score': { textContent: '' }, 'total-max': { textContent: '' },
  'score-breakdown': { textContent: '' }, 'late-note': { style: {}, textContent: '' },
  'september-missing-note': { style: {}, textContent: '' },
  grade: { textContent: '' }, bonus: { textContent: '' }, 'bonus-final': { textContent: '' },
  bonus_granted: { checked: true },
};
const legacyContext = vm.createContext({
  currentKpiDef: fullScores.map((max, index) => ({ no: index + 1, max })),
  currentAnqin: true,
  currentMakeupCount: 2,
  SEPTEMBER_BONUS_MONTH: '2026-09',
  SEPTEMBER_BONUS_MAX: 5,
  document: { getElementById: id => legacyNodes[id] },
  window: { ANQIN_BONUS_TIERS: tiers },
  tierFor(kpi) {
    const tier = tiers.find(item => kpi >= item.min && kpi <= item.max);
    return { grade: tier.grade, bonus: tier.bonus };
  },
  Number,
  Math,
});
vm.runInContext(legacyManager.slice(legacyRecalcStart, legacyRecalcEnd), legacyContext);
legacyContext.recalc();
assert.equal(legacyNodes['total-score'].textContent, 96, 'legacy manager entry uses the same manual-September formula');
assert.match(legacyNodes['score-breakdown'].textContent, /九月加分 \+5/);
assert.match(legacyNodes['score-breakdown'].textContent, /缺交 2 次 −4/);
assert.match(legacyNodes['score-breakdown'].textContent, /遲到 4 次 −5/);
legacyNodes['select-month'].value = '2026-10';
legacyContext.recalc();
assert.equal(legacyNodes['total-score'].textContent, 91, 'legacy manager entry ignores September fields outside September and keeps the global threshold rule');

assert.match(legacyManager, /id="september-bonus-card" style="display:none;"/, 'legacy entry starts with the bonus UI hidden');
assert.match(legacyManager, /currentAnqin && month === SEPTEMBER_BONUS_MONTH/, 'legacy entry shows it only for eligible Anqin September scoring');
assert.match(legacyManager, /payload\.september_missing_count = septemberMissingCount;/,
  'legacy entry sends the manual missing count only for the eligible month');
assert.match(legacyManager, /lateCount >= 3 \? 5 : 0/, 'legacy entry uses the global three-late fixed deduction');
assert.doesNotMatch(legacyManager, /lateCount - 2|直接降一個獎金等級/,
  'legacy entry no longer carries the old per-occurrence or tier-drop rule');

assert.match(qaHarness, /september_bonus_points: septemberBonusPoints/, 'isolated QA backend persists the bonus');
assert.match(qaHarness, /september_missing_count: septemberMissingCount, september_missing_penalty: septemberMissingPenalty/,
  'isolated QA backend persists manual September penalties separately');
assert.match(qaHarness, /const makeupCount = septemberBonusEligible \? 0 : Object\.values\(cloudStore\.logs\)/,
  'isolated QA backend must not use automatic log counts for September scoring');
assert.match(qaHarness, /Math\.min\(100, Math\.max\(0,[\s\S]*septemberBonusPoints - septemberMissingPenalty - makeupPenalty - latePenalty\)\)/,
  'isolated QA backend mirrors the capped combined formula');
assert.match(legacyReport, /evalObj\.total_score !== undefined/, 'legacy report prefers the saved total, including zero');
assert.match(legacyReport, /september_bonus_points/, 'legacy report shows the saved September bonus detail');
assert.match(legacyReport, /september_missing_penalty/, 'legacy report shows the saved manual missing penalty');
assert.match(legacyReport, /保存固定扣 \$\{latePenalty\} 分/, 'legacy report shows saved late penalty instead of recalculating history');
assert.match(rules, /0～5 分「九月加分」/, 'the visible Anqin rules explain the one-time bonus');
assert.match(rules, /遲到 0～2 次不扣/, 'the visible Anqin rules explain the global late threshold');
assert.match(schema, /september_missing_count/, 'schema documentation records the independent manual missing fields');

console.log('PASS Anqin 2026-09 manual penalties and bonus: validation, no automatic deduction, fixed late threshold, capped score, both UIs, report, QA, and schema');
