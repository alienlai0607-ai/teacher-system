const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'review/anqin-v2/app.js'), 'utf8');
const legacy = fs.readFileSync(path.join(root, 'manager/eval.html'), 'utf8');

assert.match(app, /initialSession\?\.role\) && state\.ui\.route !== 'evaluations'/,
  'opening manager evaluations directly must not start the full manager month sync in parallel');

function deferred() {
  let resolve;
  const promise = new Promise(next => { resolve = next; });
  return { promise, resolve };
}

function legacyEvaluationLoaderSource() {
  const loadStart = legacy.indexOf('async function loadEvidence()');
  const resetStart = legacy.indexOf('function resetEvaluationFormFields()');
  const start = resetStart >= 0 && resetStart < loadStart ? resetStart : loadStart;
  const end = legacy.indexOf('// 安親：依 100 分級距取等第', loadStart);
  assert.ok(loadStart >= 0 && end > loadStart, 'must locate legacy manager evaluation loader');
  return legacy.slice(start, end);
}

function createDomNode(initial = {}) {
  return {
    style: {},
    value: '',
    checked: false,
    textContent: '',
    innerHTML: '',
    ...initial,
  };
}

function assertStaticEvaluationFieldsReset(nodes, message) {
  assert.equal(String(nodes.score_okr.value), '0', `${message}: OKR score must reset`);
  assert.equal(String(nodes.score_late_count.value), '0', `${message}: late count must reset`);
  assert.equal(String(nodes.september_missing_count.value), '0', `${message}: September missing count must reset`);
  assert.equal(nodes.manager_comment.value, '', `${message}: manager comment must reset`);
  assert.equal(nodes.interview_notes.value, '', `${message}: interview notes must reset`);
  assert.equal(nodes.bonus_granted.checked, true, `${message}: bonus decision must reset to granted`);
}

function assertPreviousStaticEvaluationLoaded(nodes, message) {
  assert.equal(String(nodes.score_okr.value), '29', `${message}: fixture must load the previous OKR score`);
  assert.equal(String(nodes.score_late_count.value), '4', `${message}: fixture must load the previous late count`);
  assert.equal(nodes.manager_comment.value, '前一位主管評語', `${message}: fixture must load the previous manager comment`);
  assert.equal(nodes.interview_notes.value, '前一位面談紀錄', `${message}: fixture must load the previous interview notes`);
  assert.equal(nodes.bonus_granted.checked, false, `${message}: fixture must load the previous denied bonus decision`);
}

function integratedManagerEvaluationLoaderSource() {
  const start = app.indexOf('  function pendingManagerEvaluationEvidence(');
  const end = app.indexOf('  function managerEvaluationValues()', start);
  assert.ok(start >= 0 && end > start, 'must locate integrated manager evaluation loaders');
  return app.slice(start, end);
}

async function flushAsyncLoader() {
  await Promise.resolve();
  await Promise.resolve();
}

async function verifyIntegratedManagerRendersBeforeEvidence() {
  const evidence = deferred();
  const evaluation = deferred();
  const renders = [];
  const dirtyForm = { dataset: { dirty: 'false' } };
  const context = vm.createContext({
    managerEvaluationLoadGeneration: 0,
    managerEvaluationSelectionGeneration: 0,
    integrationRuntime: {
      managerEvaluationTeacher: '', managerEvaluationMonth: '', managerEvaluationStatus: 'idle',
      managerEvaluationMessage: '', managerEvaluationEvidence: null, managerEvaluation: null,
    },
    state: { daily: { date: '2026-10-08' } },
    legacySession: () => ({ nickname: '小魚', role: 'manager' }),
    managerEvaluationTeachers: () => [{ nickname: '紅豆', role: 'teacher', department: '東橋教室' }],
    managerScopeMatches: () => true,
    backendNickname: value => value,
    document: { querySelector: () => dirtyForm },
    renderApp: () => renders.push({
      status: context.integrationRuntime.managerEvaluationStatus,
      evaluation: context.integrationRuntime.managerEvaluation,
      evidence: context.integrationRuntime.managerEvaluationEvidence,
    }),
    API: {
      getEvalEvidence: () => evidence.promise,
      getEval: () => evaluation.promise,
    },
    Promise,
  });
  vm.runInContext(integratedManagerEvaluationLoaderSource(), context);

  const pendingLoad = context.loadManagerEvaluation('紅豆', '2026-09');
  evaluation.resolve({ ok: true, eval: { marker: 'existing September evaluation' } });
  await flushAsyncLoader();
  assert.equal(context.integrationRuntime.managerEvaluationStatus, 'saved', 'existing evaluation must render while evidence is still pending');
  assert.equal(context.integrationRuntime.managerEvaluation.marker, 'existing September evaluation');
  assert.equal(context.integrationRuntime.managerEvaluationEvidence._partial, true);
  assert.equal(context.integrationRuntime.managerEvaluationEvidence._pending, true);
  assert.equal(renders.at(-1).status, 'saved', 'form-ready render must happen before evidence resolves');

  const rendersBeforeEvidence = renders.length;
  dirtyForm.dataset.dirty = 'true';
  evidence.resolve({ ok: true, marker: 'late evidence' });
  await pendingLoad;
  assert.equal(context.integrationRuntime.managerEvaluationEvidence.marker, 'late evidence');
  assert.equal(renders.length, rendersBeforeEvidence, 'late evidence must not rerender and erase dirty manager inputs');
}

async function verifyIntegratedManagerKeepsFormWhenEvidenceFails() {
  const context = vm.createContext({
    managerEvaluationLoadGeneration: 0,
    managerEvaluationSelectionGeneration: 0,
    integrationRuntime: {
      managerEvaluationTeacher: '', managerEvaluationMonth: '', managerEvaluationStatus: 'idle',
      managerEvaluationMessage: '', managerEvaluationEvidence: null, managerEvaluation: null,
    },
    state: { daily: { date: '2026-10-08' } },
    legacySession: () => ({ nickname: '小魚', role: 'manager' }),
    managerEvaluationTeachers: () => [{ nickname: '紅豆', role: 'teacher', department: '東橋教室' }],
    managerScopeMatches: () => true,
    backendNickname: value => value,
    renderApp() {},
    API: {
      getEvalEvidence: async () => { throw new Error('evidence timeout'); },
      getEval: async () => ({ ok: true, eval: { marker: 'keep me' } }),
    },
    Promise,
  });
  vm.runInContext(integratedManagerEvaluationLoaderSource(), context);

  await context.loadManagerEvaluation('紅豆', '2026-09');
  assert.equal(context.integrationRuntime.managerEvaluationStatus, 'saved', 'evidence failure must not turn the evaluation form into a fatal error');
  assert.equal(context.integrationRuntime.managerEvaluation.marker, 'keep me', 'evidence failure must preserve the loaded evaluation');
  assert.equal(context.integrationRuntime.managerEvaluationEvidence._partial, true);
  assert.equal(context.integrationRuntime.managerEvaluationEvidence._pending, false);
  assert.match(context.integrationRuntime.managerEvaluationEvidence._error, /evidence timeout/);
}

async function verifyIntegratedManagerRace() {
  const aEvidence = deferred();
  const aEvaluation = deferred();
  const bEvidence = deferred();
  const bEvaluation = deferred();
  const requests = {
    '紅豆:2026-09:evidence': aEvidence.promise,
    '紅豆:2026-09:evaluation': aEvaluation.promise,
    '小明:2026-10:evidence': bEvidence.promise,
    '小明:2026-10:evaluation': bEvaluation.promise,
  };
  const renders = [];
  const context = vm.createContext({
    managerEvaluationLoadGeneration: 0,
    managerEvaluationSelectionGeneration: 0,
    integrationRuntime: {
      managerEvaluationTeacher: '', managerEvaluationMonth: '', managerEvaluationStatus: 'idle',
      managerEvaluationMessage: '', managerEvaluationEvidence: null, managerEvaluation: null,
    },
    state: { daily: { date: '2026-10-08' } },
    legacySession: () => ({ nickname: '小魚', role: 'manager' }),
    managerEvaluationTeachers: () => [
      { nickname: '紅豆', role: 'teacher', department: '東橋教室' },
      { nickname: '小明', role: 'teacher', department: '北區教室' },
    ],
    managerScopeMatches: () => true,
    backendNickname: value => value,
    renderApp: () => renders.push({ ...context.integrationRuntime }),
    API: {
      getEvalEvidence: (nickname, month) => requests[`${nickname}:${month}:evidence`],
      getEval: ({ nickname, year_month }) => requests[`${nickname}:${year_month}:evaluation`],
    },
    Promise,
  });
  vm.runInContext(integratedManagerEvaluationLoaderSource(), context);

  const oldLoad = context.loadManagerEvaluation('紅豆', '2026-09');
  const latestLoad = context.loadManagerEvaluation('小明', '2026-10');
  bEvidence.resolve({ ok: true, marker: 'B evidence' });
  bEvaluation.resolve({ ok: true, eval: { nickname: '小明', year_month: '2026-10', marker: 'B evaluation' } });
  await latestLoad;
  assert.equal(context.integrationRuntime.managerEvaluationTeacher, '小明');
  assert.equal(context.integrationRuntime.managerEvaluationMonth, '2026-10');
  assert.equal(context.integrationRuntime.managerEvaluationEvidence.marker, 'B evidence');
  assert.equal(context.integrationRuntime.managerEvaluation.marker, 'B evaluation');

  aEvidence.resolve({ ok: true, marker: 'A evidence' });
  aEvaluation.resolve({ ok: true, eval: { nickname: '紅豆', year_month: '2026-09', marker: 'A evaluation' } });
  await oldLoad;
  assert.equal(context.integrationRuntime.managerEvaluationTeacher, '小明', 'late old request must not restore its teacher');
  assert.equal(context.integrationRuntime.managerEvaluationMonth, '2026-10', 'late old request must not restore its month');
  assert.equal(context.integrationRuntime.managerEvaluationEvidence.marker, 'B evidence', 'late old evidence must be ignored');
  assert.equal(context.integrationRuntime.managerEvaluation.marker, 'B evaluation', 'late old evaluation must be ignored');
  assert.equal(renders.at(-1).managerEvaluationTeacher, '小明');
}

async function verifyManualSelectionInvalidatesPendingLatestLookup() {
  const latestList = deferred();
  const evidenceCalls = [];
  const evaluationCalls = [];
  const context = vm.createContext({
    managerEvaluationLoadGeneration: 0,
    managerEvaluationSelectionGeneration: 0,
    integrationRuntime: {
      managerEvaluationTeacher: '', managerEvaluationMonth: '', managerEvaluationStatus: 'idle',
      managerEvaluationMessage: '', managerEvaluationEvidence: null, managerEvaluation: null,
    },
    state: { daily: { date: '2026-10-08' } },
    legacySession: () => ({ nickname: '小魚', role: 'manager' }),
    managerEvaluationTeachers: () => [
      { nickname: '紅豆', role: 'teacher', department: '東橋教室' },
      { nickname: '小明', role: 'teacher', department: '北區教室' },
    ],
    managerScopeMatches: () => true,
    backendNickname: value => value,
    normalizeReviewNickname: value => String(value || '').trim(),
    renderApp() {},
    API: {
      listEvals: () => latestList.promise,
      getEvalEvidence: async (nickname, month) => {
        evidenceCalls.push({ nickname, month });
        return { ok: true, marker: `${nickname}:${month}:evidence` };
      },
      getEval: async ({ nickname, year_month }) => {
        evaluationCalls.push({ nickname, month: year_month });
        return { ok: true, eval: { nickname, year_month } };
      },
    },
    Promise,
    Map,
  });
  vm.runInContext(integratedManagerEvaluationLoaderSource(), context);

  const pendingLatest = context.loadLatestManagerEvaluation();
  await context.loadManagerEvaluation('紅豆', '2026-09');
  latestList.resolve({
    ok: true,
    evals: [{ nickname: '小明', year_month: '2026-10-01T00:00:00.000Z', updated_at: '2026-10-08T09:00:00.000Z' }],
  });
  await pendingLatest;

  assert.equal(context.integrationRuntime.managerEvaluationTeacher, '紅豆', 'pending latest lookup must not replace a manual teacher selection');
  assert.equal(context.integrationRuntime.managerEvaluationMonth, '2026-09', 'pending latest lookup must not replace a manual month selection with an ISO date');
  assert.deepEqual(evidenceCalls, [{ nickname: '紅豆', month: '2026-09' }], 'stale latest lookup must not start another evidence request');
  assert.deepEqual(evaluationCalls, [{ nickname: '紅豆', month: '2026-09' }], 'stale latest lookup must not start another evaluation request');
}

async function verifyLegacyManagerRace() {
  const aEvidence = deferred();
  const bEvidence = deferred();
  const nodes = {
    'select-teacher': { value: '紅豆' },
    'select-month': { value: '2026-09' },
    september_bonus_points: { value: 0 },
  };
  const loading = [];
  const toasts = [];
  const context = vm.createContext({
    evaluationLoadGeneration: 0,
    document: { getElementById: id => nodes[id] || { style: {}, value: '', textContent: '', innerHTML: '' } },
    applyModelForTeacher() {},
    updateSeptemberBonusVisibility: () => nodes['select-month'].value === '2026-09',
    UI: {
      loading: value => loading.push(value),
      toast: message => toasts.push(message),
      formatDate: value => value,
    },
    API: {
      getEvalEvidence: nickname => nickname === '紅豆' ? aEvidence.promise : bEvidence.promise,
      getEval: async () => ({ ok: true, eval: null }),
    },
    Object,
    Number,
  });
  vm.runInContext(legacyEvaluationLoaderSource(), context);

  const oldLoad = context.loadEvidence();
  nodes['select-teacher'].value = '小明';
  nodes['select-month'].value = '2026-10';
  const latestLoad = context.loadEvidence();
  bEvidence.resolve({ ok: false, error: 'latest B result' });
  await latestLoad;
  assert.deepEqual(toasts, ['latest B result']);

  aEvidence.resolve({ ok: false, error: 'stale A result' });
  await oldLoad;
  assert.deepEqual(toasts, ['latest B result'], 'late old response must not update the legacy page');
  assert.deepEqual(loading, [true, true, false], 'stale request must not hide the current loading state');
}

async function verifyLegacyManagerClearsPreviousStaticFields() {
  const nodes = {
    'select-teacher': createDomNode({ value: '有評核老師' }),
    'select-month': createDomNode({ value: '2026-08' }),
    score_okr: createDomNode({ value: '0' }),
    score_late_count: createDomNode({ value: '0' }),
    september_missing_count: createDomNode({ value: '0' }),
    september_bonus_points: createDomNode({ value: '0' }),
    manager_comment: createDomNode(),
    interview_notes: createDomNode(),
    bonus_granted: createDomNode({ checked: true }),
    'eval-content': createDomNode({ style: { display: 'block' } }),
  };
  const getNode = id => {
    if (!nodes[id]) nodes[id] = createDomNode();
    return nodes[id];
  };
  const toasts = [];
  const evaluations = {
    '有評核老師:2026-08': {
      ok: true,
      eval: {
        score_okr: 29,
        score_late_count: 4,
        manager_comment: '前一位主管評語',
        interview_notes: '前一位面談紀錄',
        bonus_granted: false,
      },
    },
    '無評核老師:2026-10': { ok: true, eval: null },
    '讀取失敗老師:2026-11': { ok: false, error: '評核讀取失敗' },
  };
  const evidence = {
    ok: true,
    summary: {
      log_count: 0,
      evidence_count: 0,
      feedback_count: 0,
      observation_count: 0,
      makeup_count: 0,
    },
    evidence_by_kpi: { 1: [] },
    suggestion: { k1: 12 },
  };
  const context = vm.createContext({
    evaluationLoadGeneration: 0,
    currentKpiDef: [{ no: 1, icon: '📊', name: '測試 KPI' }],
    document: { getElementById: getNode },
    applyModelForTeacher() {},
    updateSeptemberBonusVisibility: () => false,
    recalc() {},
    UI: {
      loading() {},
      toast: (message, type) => toasts.push({ message, type }),
      formatDate: value => value,
    },
    API: {
      getEvalEvidence: async () => evidence,
      getEval: async ({ nickname, year_month }) => evaluations[`${nickname}:${year_month}`],
    },
    Object,
    Number,
  });
  vm.runInContext(legacyEvaluationLoaderSource(), context);

  await context.loadEvidence();
  assertPreviousStaticEvaluationLoaded(nodes, 'initial evaluated teacher');

  nodes['select-teacher'].value = '無評核老師';
  nodes['select-month'].value = '2026-10';
  await context.loadEvidence();
  assertStaticEvaluationFieldsReset(nodes, 'teacher with no existing evaluation');

  nodes['select-teacher'].value = '有評核老師';
  nodes['select-month'].value = '2026-08';
  await context.loadEvidence();
  assertPreviousStaticEvaluationLoaded(nodes, 'evaluated teacher reloaded before failure case');

  nodes['select-teacher'].value = '讀取失敗老師';
  nodes['select-month'].value = '2026-11';
  await context.loadEvidence();
  assertStaticEvaluationFieldsReset(nodes, 'failed evaluation request');
  assert.deepEqual(toasts.at(-1), { message: '評核讀取失敗', type: 'danger' });
}

Promise.all([
  verifyIntegratedManagerRace(),
  verifyIntegratedManagerRendersBeforeEvidence(),
  verifyIntegratedManagerKeepsFormWhenEvidenceFails(),
  verifyManualSelectionInvalidatesPendingLatestLookup(),
  verifyLegacyManagerRace(),
  verifyLegacyManagerClearsPreviousStaticFields(),
]).then(() => {
  console.log('PASS Anqin evaluation loaders ignore stale responses and clear legacy static fields');
}).catch(error => {
  console.error(error);
  process.exitCode = 1;
});
