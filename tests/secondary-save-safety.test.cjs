const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const read = name => fs.readFileSync(path.join(__dirname, '..', name), 'utf8');
const block = (source, from, to) => source.slice(source.indexOf(from), source.indexOf(to, source.indexOf(from)));
const clone = value => JSON.parse(JSON.stringify(value));
const adminSource = read('review/admin-marketing-v1/app.js');
const talentSource = read('review/talent-v2/app.js');

function adminHarness(original, latest) {
  const calls = [];
  const context = vm.createContext({ workerName: 'QA', PREVIEW_MODE: false,
    state: { records: [clone(original)] }, upsertLocal() {}, persist() {},
    editorRecordBases: new WeakMap(), editorPendingRecords: new WeakMap(), document: { querySelector: () => null }, preserveAdminEditor: async () => {},
    window: { API: { saveAdminMarketingRecord: async (_worker, _type, record) => {
      calls.push(clone(record));
      return calls.length === 1 ? { ok: false, code: 'RECORD_CONFLICT', current_record: clone(latest) } : { ok: true, record };
    } } },
  });
  vm.runInContext(block(adminSource, '  function adminEditorSignature(', '  async function saveAssignment('), context);
  return { context, calls };
}

test('administrative conflict must not overwrite a concurrent edit of the same field', async () => {
  const original = { id: 'record', note: 'original', recordRevision: 'r1' };
  const { context, calls } = adminHarness(original, { ...original, note: 'remote edit', recordRevision: 'r2' });
  const result = await context.saveRecord('daily_check', { ...original, note: 'local edit' });
  assert.equal(result.ok, false);
  assert.equal(result.code, 'RECORD_CONFLICT');
  assert.equal(calls.length, 1, 'do not silently write local text over newer remote text');
});

test('administrative conflict must not overwrite a concurrent edit of the same work item', async () => {
  const original = { id: 'record', items: [{ id: 'work', title: 'original' }], recordRevision: 'r1' };
  const { context, calls } = adminHarness(original, { ...original, items: [{ id: 'work', title: 'remote' }], recordRevision: 'r2' });
  const result = await context.saveRecord('daily', { ...original, items: [{ id: 'work', title: 'local' }] });
  assert.equal(result.ok, false);
  assert.equal(calls.length, 1);
});

test('administrative nonoverlapping work changes still merge without dropping either edit', async () => {
  const original = { id: 'record', items: [{ id: 'a', title: 'A' }, { id: 'b', title: 'B' }], recordRevision: 'r1' };
  const { context, calls } = adminHarness(original, { ...original, items: [{ id: 'a', title: 'A' }, { id: 'b', title: 'remote B' }], recordRevision: 'r2' });
  const result = await context.saveRecord('daily', { ...original, items: [{ id: 'a', title: 'local A' }, { id: 'b', title: 'B' }] });
  assert.equal(result.ok, true);
  assert.deepEqual(calls[1].items, [{ id: 'a', title: 'local A' }, { id: 'b', title: 'remote B' }]);
});

test('administrative explicit item deletion survives a disjoint remote change', async () => {
  const original = { id: 'record', items: [{ id: 'a', title: 'A' }, { id: 'b', title: 'B' }], recordRevision: 'r1' };
  const { context, calls } = adminHarness(original, { ...original, items: [{ id: 'a', title: 'A' }, { id: 'b', title: 'remote B' }], recordRevision: 'r2' });
  const result = await context.saveRecord('daily', { ...original, items: [{ id: 'b', title: 'B' }] });
  assert.equal(result.ok, true);
  assert.deepEqual(calls[1].items, [{ id: 'b', title: 'remote B' }]);
});

test('talent repeated submit keeps a stable payload after an unknown response', async () => {
  const calls = [];
  let savedDraft;
  let currentTime = '2026-09-16T12:00:00.000Z';
  class ClockDate extends Date { constructor(...args) { super(...(args.length ? args : [currentTime])); } }
  const values = { id: 'lesson-1', date: '2026-09-16', lessonStatus: 'held', expected: '0', present: '0', leave: '0', absent: '0', siteType: 'self', parentStatus: 'complete', issue: 'QA lesson outcome' };
  const form = { checkValidity: () => true, elements: { id: { value: values.id } } };
  class FormDataMock { get(key) { return values[key] ?? ''; } entries() { return Object.entries(values); } }
  const context = vm.createContext({ Date: ClockDate, FormData: FormDataMock,
    state: { logs: [], draftLog: { ...values } }, activeLogSource: { ...values },
    currentUser: { nickname: 'QA', employment: 'fulltime' }, PREVIEW_MODE: false,
    window: { clearTimeout() {} }, cloudDraftTimer: null, cloudDraftChain: Promise.resolve(),
    todayIso: () => '2026-09-16', isPt: () => false, schedulesForDate: () => [],
    pendingFiles: { attendance: [{ id: 'a' }], learning: [{ id: 'b' }], room: [{ id: 'c' }], app: [{ id: 'd' }] },
    document: { querySelector: () => null }, toast() {}, persist() { savedDraft = clone(context.state.draftLog); return true; }, closeDrawer() {}, renderApp() {},
    talentSubmissionError: value => value || '', uid: () => 'fallback',
    TEST_VIEW_MODE: false, $: selector => selector === '#log-form' ? form : null, icon: () => '', hydrateIcons() {},
    API: { saveTalentLesson: async (_name, lesson) => { calls.push(clone(lesson)); return { ok: false, uncertain: true, error: 'unconfirmed' }; } },
  });
  vm.runInContext(block(talentSource, '  function captureLogDraft(', '  function queueCloudDraftSave(')
    + block(talentSource, '  async function submitLog(', '  function openPrepEditor('), context);
  await context.submitLog(form);
  currentTime = '2026-09-16T12:05:00.000Z';
  context.state.draftLog = clone(savedDraft);
  context.activeLogSource = context.state.draftLog;
  await context.submitLog(form);
  assert.deepEqual(calls[1], calls[0], 'a no-edit retry must use the original payload and receipt identity');
});

test('talent form remains protected from edits while a save is in flight and unlocks on failure', async () => {
  const context = vm.createContext({ failedTalentSelections: new Map(), toast() {}, preserveTalentEditor: async () => {} });
  vm.runInContext(block(talentSource, '  async function runFormAction(', '  function capturePrep('), context);
  const form = { dataset: {}, inert: false, querySelectorAll: () => [] };
  await assert.rejects(context.runFormAction(form, async () => {
    assert.equal(form.inert, true, 'new input must not be cleared by the older response');
    throw new Error('controlled failure');
  }), /controlled failure/);
  assert.equal(form.inert, false);
  assert.equal(form.dataset.submitting, undefined);
});

test('talent storage failure is not shown as a saved draft', () => {
  const messages = [];
  const indicator = { innerHTML: '' };
  const warning = { innerHTML: '' };
  const context = vm.createContext({
    state: { ui: { lastSavedAt: 'earlier' } }, cloudRuntime: {}, PREVIEW_MODE: false,
    personalStorageKey: 'personal', sharedStorageKey: 'shared', APP_VERSION: 8,
    localStorage: { removeItem() {}, setItem() { throw new Error('full'); } },
    $: selector => selector === '#save-state' ? indicator : warning,
    icon: () => '', esc: value => value, formatTime: value => value, hydrateIcons() {},
    toast: message => messages.push(message), console: { warn() {} },
  });
  vm.runInContext(block(talentSource, '  function persist(', '  async function loadCloudData('), context);
  assert.equal(context.persist(), false);
  assert.equal(context.state.ui.lastSavedAt, 'earlier');
  assert.match(indicator.innerHTML, /未儲存/);
  assert.match(warning.innerHTML, /請勿關閉/);
  assert.equal(messages.length, 1);
});

test('administrative form cannot be submitted twice or edited while saving', async () => {
  const context = vm.createContext({ uploadWarning: '', toast() {}, hydrateIcons() {}, preserveAdminEditor: async () => {} });
  vm.runInContext(block(adminSource, '  async function runForm(', '  let trialParseTimer'), context);
  const form = { dataset: {}, inert: false, querySelector: () => null };
  let count = 0;
  await context.runForm(async () => {
    count++;
    assert.equal(form.inert, true);
    await context.runForm(async () => { count++; }, form);
  }, form);
  assert.equal(count, 1);
  assert.equal(form.inert, false);
});

test('new roster classes and reminders keep their IDs when a save result is unknown', async () => {
  for (const reminder of [false, true]) {
    const calls = [];
    let sequence = 0;
    const values = { classId: reminder ? 'class-existing' : '', code: 'QA', campus: 'QA', teacher: 'QA', weekday: '1', course: 'QA', start: '09:00', end: '10:00', count: '0', title: 'QA reminder', dueDate: '2026-09-17' };
    const form = { dataset: {}, elements: { classId: { value: values.classId } } };
    class FormDataMock { get(key) { return form.elements[key]?.value ?? values[key] ?? ''; } }
    const context = vm.createContext({ FormData: FormDataMock, uid: prefix => `${prefix}-${++sequence}`, classRosterItem: () => null,
      mutateClassRoster: async (_operation, payload) => { calls.push(clone(payload)); throw new Error('unknown result'); },
    });
    vm.runInContext(block(adminSource, '  async function handleClassRosterEditor(', '  async function runForm('), context);
    const save = reminder ? context.handleClassRosterReminder : context.handleClassRosterEditor;
    await assert.rejects(save(form), /unknown result/);
    await assert.rejects(save(form), /unknown result/);
    assert.deepEqual(calls[1], calls[0], 'retry must target the same class or reminder');
  }
});

test('automatic first-enrollment followup stays stable when a trial save is retried', async () => {
  const calls = [];
  let sequence = 0;
  let currentTime = '2026-09-16T12:00:00.000Z';
  class ClockDate extends Date { constructor(...args) { super(...(args.length ? args : [currentTime])); } }
  const values = { trialId: '', status: 'converted', studentName: 'QA', contactRef: 'QA contact', date: '2026-09-16', course: 'QA course', teacher: 'QA teacher', enrollmentDate: '2026-09-16', paymentDate: '2026-09-16', enrollmentCourse: 'QA enrollment', firstEnrollment: 'yes' };
  const form = { dataset: {}, elements: { trialId: { value: '' }, paymentEvidence: {} } };
  class FormDataMock { get(key) { return form.elements[key]?.value ?? values[key] ?? ''; } }
  const context = vm.createContext({ Date: ClockDate, FormData: FormDataMock, uid: prefix => `${prefix}-${++sequence}`,
    PREVIEW_MODE: false, TRIAL_START_DATE: '2026-08-15', workerName: 'QA', currentUser: { nickname: 'QA' },
    trialRecords: () => [], normalizeTrialStatus: value => value, isConvertedTrialStatus: () => true,
    isConcludedTrialStatus: () => true, todayIso: () => '2026-09-16', uploadFiles: async () => [],
    legacyTrialContactRef: value => value, retainedFiles: () => [], combinedEvidence: (a, b) => a.concat(b), evidenceReady: () => true,
    saveRecord: async (_type, record) => { calls.push(clone(record)); return { ok: false, error: 'unknown result', uncertain: true }; },
  });
  vm.runInContext(block(adminSource, '  async function handleTrial(', '  async function handleNoTrial('), context);
  await assert.rejects(context.handleTrial(form), /unknown result/);
  currentTime = '2026-09-16T12:05:00.000Z';
  await assert.rejects(context.handleTrial(form), /unknown result/);
  assert.deepEqual(calls[1], calls[0]);
});

test('administrative old unknown payload keeps its old signature through repeated retries after new edits', async () => {
  const calls = [];
  const values = { note: 'original input' };
  const form = { querySelectorAll: () => [] };
  const bases = new WeakMap([[form, [{ id: 'r', note: 'base', recordRevision: 'v1', updatedAt: 'first' }]]]);
  const pending = new WeakMap();
  class FormDataMock { entries() { return Object.entries(values); } }
  const context = vm.createContext({ workerName: 'QA', PREVIEW_MODE: false, FormData: FormDataMock, structuredClone,
    editorRecordBases: bases, editorPendingRecords: pending, document: { querySelector: () => form },
    selectedFilesFor: () => [], selectedFileKey: () => '', preserveAdminEditor: async () => {},
    state: { records: [] }, upsertLocal(record) { context.state.records = [record]; },
    window: { API: { saveAdminMarketingRecord: async (_user, _type, record) => {
      calls.push(clone(record));
      return calls.length < 3 ? { ok: false, uncertain: true } : { ok: true, record: { ...record, recordRevision: 'v2' } };
    } } },
  });
  vm.runInContext(block(adminSource, '  function adminEditorSignature(', '  async function saveAssignment('), context);
  await context.saveRecord('daily_check', { id: 'r', note: values.note });
  values.note = 'new input that is not in the old request';
  await context.saveRecord('daily_check', { id: 'r', note: values.note });
  const result = await context.saveRecord('daily_check', { id: 'r', note: values.note });
  assert.equal(result.code, 'PREVIOUS_SAVE_CONFIRMED');
  assert.equal(result.ok, false, 'the edited form must remain open for the newer input');
  assert.deepEqual(calls[1], calls[0]);
  assert.deepEqual(calls[2], calls[0]);
  assert.equal(pending.has(form), false);
});

test('restored administrative form with no old record cannot borrow a newer cloud revision', async () => {
  const form = {};
  const sent = [];
  const latest = { id: 'r', note: 'remote value', recordRevision: 'new-revision', updatedAt: 'new-time' };
  const context = vm.createContext({ workerName: 'QA', PREVIEW_MODE: false,
    state: { records: [latest] }, editorRecordBases: new WeakMap([[form, []]]), editorPendingRecords: new WeakMap(),
    document: { querySelector: () => form }, upsertLocal() {}, sendAdminRecord: async (_type, record) => { sent.push(clone(record)); return { ok: false }; },
  });
  vm.runInContext(block(adminSource, '  async function saveRecord(', '  async function saveAssignment('), context);
  await context.saveRecord('daily_check', { ...latest, note: 'old local value' });
  assert.equal(sent[0].recordRevision, '');
  assert.equal(sent[0].baseRevision, '');
  assert.equal(sent[0].updatedAt, '');
});

test('a restored environment form keeps its original work date across midnight', async () => {
  let captured;
  class FormDataMock { get() { return 'clear'; } getAll() { return []; } }
  const context = vm.createContext({ FormData: FormDataMock, workerName: 'QA', todayIso: () => '2026-09-17', normalizeName: x => x,
    workerRecords: () => [], ENVIRONMENT_GROUPS: [], ENVIRONMENT_CHECKS: [], uploadFiles: async () => [],
    retainedFiles: () => [], combinedEvidence: (a, b) => a.concat(b), saveRecord: async (_type, record) => { captured = record; return { ok: true }; },
    closeDialog() {}, renderApp() {}, toast() {},
  });
  vm.runInContext(block(adminSource, '  async function handleEnvironment(', '  async function handleProject('), context);
  await context.handleEnvironment({ dataset: { workDate: '2026-09-16' }, elements: { evidence: {} } });
  assert.equal(captured.date, '2026-09-16');
  assert.equal(captured.id, 'admin-marketing-environment-QA-2026-09-16');
});
