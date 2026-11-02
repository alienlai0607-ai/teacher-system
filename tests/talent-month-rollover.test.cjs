const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../review/talent-v2/app.js'), 'utf8');

function functionBlock(name) {
  let start = source.indexOf(`  function ${name}(`);
  if (start < 0) start = source.indexOf(`  async function ${name}(`);
  assert.notEqual(start, -1, `missing function ${name}`);
  const parameters = source.indexOf('(', start);
  let parameterDepth = 0;
  let brace = -1;
  for (let index = parameters; index < source.length; index += 1) {
    if (source[index] === '(') parameterDepth += 1;
    if (source[index] === ')') {
      parameterDepth -= 1;
      if (parameterDepth === 0) {
        brace = source.indexOf('{', index);
        break;
      }
    }
  }
  assert.notEqual(brace, -1, `missing body for ${name}`);
  let depth = 0;
  for (let index = brace; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1;
    if (source[index] === '}') depth -= 1;
    if (depth === 0) return source.slice(start, index + 1);
  }
  throw new Error(`unterminated function ${name}`);
}

function calendarContext(extra = {}) {
  const context = vm.createContext({
    Date,
    todayIso: () => '2026-11-02',
    previousKpiWorkday: value => value === '2026-11-02' ? '2026-10-30' : 'unexpected',
    ...extra,
  });
  vm.runInContext(
    functionBlock('normalizeTalentUiCalendar')
      + functionBlock('talentDateBounds'),
    context,
  );
  return context;
}

test('跨月會自動切到新月份並清掉舊的評核月份游標', () => {
  const context = calendarContext();
  const result = context.normalizeTalentUiCalendar({
    month: '2026-10', lastSeenMonth: '2026-10', lastSeenDate: '2026-10-31',
    performanceMonth: '2026-10', scoringMonth: '2026-10',
  }, '2026-11-02');
  assert.equal(result.month, '2026-11');
  assert.equal(result.lastSeenMonth, '2026-11');
  assert.equal(result.lastSeenDate, '2026-11-02');
  assert.equal(result.performanceMonth, '');
  assert.equal(result.scoringMonth, '');
});

test('同一月份手動查看歷史月份，重新整理後仍保留選擇', () => {
  const context = calendarContext();
  const result = context.normalizeTalentUiCalendar({
    month: '2026-09', lastSeenMonth: '2026-11', lastSeenDate: '2026-11-01',
    performanceMonth: '2026-09', scoringMonth: '2026-09',
  }, '2026-11-02');
  assert.equal(result.month, '2026-09');
  assert.equal(result.performanceMonth, '2026-09');
  assert.equal(result.scoringMonth, '2026-09');
  assert.equal(result.lastSeenDate, '2026-11-02');
});

test('舊版狀態沒有 lastSeenMonth 時一律切到目前月份', () => {
  const context = calendarContext();
  const result = context.normalizeTalentUiCalendar({
    month: '2026-10', lastSavedAt: '2026-10-31T16:30:00.000Z',
  }, '2026-11-02');
  assert.equal(result.month, '2026-11', '即使 lastSavedAt 在台北時間已是 11/1，舊版仍無法證明 10 月是手動選擇');
  assert.equal(result.lastSeenMonth, '2026-11');
});

test('手機跨日喚醒只更新日期限制，不改表單內容或照片', () => {
  const form = { marker: '原表單內容', dateValue: '2026-10-31', elements: { date: { max: '2026-10-31' } } };
  const photos = [{ name: '教室照片.jpg' }];
  const calls = { persist: 0, bounds: 0, render: 0 };
  const context = calendarContext({
    state: { ui: { month: '2026-10', lastSeenMonth: '2026-10', lastSeenDate: '2026-10-31' } },
    talentClockDate: '2026-10-31',
    persist: () => { calls.persist += 1; },
    refreshLogDateBounds: target => { assert.equal(target, form); calls.bounds += 1; },
    renderApp: () => { calls.render += 1; },
    $: selector => selector === '#log-form' ? form : null,
    pendingFiles: { room: photos },
  });
  vm.runInContext(functionBlock('reconcileTalentClockContext'), context);
  const beforeForm = JSON.stringify(form);
  const beforePhotos = JSON.stringify(photos);
  assert.equal(context.reconcileTalentClockContext(), true);
  assert.equal(context.state.ui.month, '2026-11');
  assert.equal(context.state.ui.lastSeenDate, '2026-11-02');
  assert.equal(context.talentClockDate, '2026-11-02');
  assert.equal(calls.persist, 1);
  assert.equal(calls.bounds, 1);
  assert.equal(calls.render, 0, '開著表單時不可重繪並清空內容');
  assert.equal(JSON.stringify(form), beforeForm);
  assert.equal(JSON.stringify(photos), beforePhotos);
});

test('背景儲存先更新狀態日期時，喚醒仍會依執行中時鐘刷新舊表單', () => {
  const form = { elements: { date: { max: '2026-10-31' } } };
  let bounds = 0;
  const context = calendarContext({
    state: { ui: { month: '2026-11', lastSeenMonth: '2026-11', lastSeenDate: '2026-11-02' } },
    talentClockDate: '2026-10-31',
    persist() {},
    refreshLogDateBounds: () => { bounds += 1; },
    renderApp() {},
    $: selector => selector === '#log-form' ? form : null,
  });
  vm.runInContext(functionBlock('reconcileTalentClockContext'), context);
  assert.equal(context.reconcileTalentClockContext(), true);
  assert.equal(bounds, 1);
  assert.equal(context.talentClockDate, '2026-11-02');
});

test('固定課程日期上下限會跟著喚醒後的今天更新', () => {
  const context = calendarContext();
  assert.deepEqual(
    JSON.parse(JSON.stringify(context.talentDateBounds('held', '2026-11-02'))),
    { min: '2026-10-30', max: '2026-11-02' },
  );
  assert.deepEqual(
    JSON.parse(JSON.stringify(context.talentDateBounds('coverage', '2026-11-02'))),
    { min: '', max: '2026-11-02' },
  );
});

function draftContext(saveResult, options = {}) {
  const opened = [];
  const messages = [];
  const saveTalentDraft = typeof saveResult === 'function' ? saveResult : async () => saveResult;
  let persistCalls = 0;
  const dialogButtons = ['close-dialog', 'resume-log-draft', 'confirm-discard-log-draft'].map(action => ({ action, disabled: false }));
  const dialog = {
    inert: false,
    isConnected: true,
    attributes: {},
    setAttribute(name, value) { this.attributes[name] = value; },
    removeAttribute(name) { delete this.attributes[name]; },
    querySelectorAll(selector) { return selector === 'button' ? dialogButtons : []; },
  };
  const document = {
    querySelector: selector => selector === '#dialog-root .dialog' && dialog.isConnected ? dialog : null,
  };
  const context = vm.createContext({
    state: { draftLog: { id: 'draft-1031', date: '2026-10-31', roomFiles: ['教室.jpg'] } },
    PREVIEW_MODE: false,
    API: { saveTalentDraft },
    window: { clearTimeout() {} },
    cloudDraftTimer: 1,
    cloudDraftChain: Promise.resolve(),
    currentUser: { nickname: '老師' },
    localDraftVault: null,
    localRecoveryReady: Promise.resolve(),
    localRecovery: { editors: {} },
    writeTalentRecovery: async () => true,
    talentDraftMutationGeneration: 0,
    talentDraftClearInFlight: null,
    activeLogSource: { id: 'draft-1031' },
    pendingFiles: { attendance: [], learning: [], room: ['教室.jpg'], app: [], prep: [] },
    persist() { persistCalls += 1; return options.persistResult === undefined ? true : options.persistResult; },
    document,
    closeDialog() { dialog.isConnected = false; }, renderApp() {},
    openLogEditor: value => opened.push(value),
    toast: message => messages.push(message),
    todayIso: () => '2026-11-02',
    formatDate: value => String(value).slice(5).replace('-', '/'),
    uid: () => 'fresh-log',
  });
  vm.runInContext(functionBlock('clearStoredTalentDraft'), context);
  return { context, opened, messages, dialog, dialogButtons, persistCalls: () => persistCalls };
}

test('雲端清除失敗時完整保留 10/31 草稿與照片', async () => {
  const { context, opened, messages } = draftContext({ ok: false, error: '網路中斷' });
  const before = JSON.stringify(context.state.draftLog);
  assert.equal(await context.clearStoredTalentDraft({ startFresh: true }), false);
  assert.equal(JSON.stringify(context.state.draftLog), before);
  assert.deepEqual(context.pendingFiles.room, ['教室.jpg']);
  assert.equal(opened.length, 0);
  assert.match(messages.join('\n'), /內容與照片仍完整保留/);
});

test('雲端清除連線直接中斷時也不刪草稿', async () => {
  const { context, opened, messages } = draftContext(async () => { throw new Error('離線'); });
  const before = JSON.stringify(context.state.draftLog);
  assert.equal(await context.clearStoredTalentDraft({ startFresh: true }), false);
  assert.equal(JSON.stringify(context.state.draftLog), before);
  assert.deepEqual(context.pendingFiles.room, ['教室.jpg']);
  assert.equal(opened.length, 0);
  assert.match(messages.join('\n'), /離線/);
});

test('刪除前會先等已排程的草稿同步結束，避免舊草稿回寫', async () => {
  const order = [];
  const { context } = draftContext(async () => { order.push('clear'); return { ok: true }; });
  context.cloudDraftChain = Promise.resolve().then(() => { order.push('pending-save'); });
  assert.equal(await context.clearStoredTalentDraft(), true);
  assert.deepEqual(order, ['pending-save', 'clear']);
});

test('雲端已清除但本機附件暫存清理失敗時，會回寫雲端並保留雙端草稿', async () => {
  const calls = [];
  const { context, opened, messages } = draftContext(async (_nickname, value) => {
    calls.push(value === null ? 'clear' : value?.id);
    return { ok: true };
  });
  context.localDraftVault = {};
  context.localRecovery.editors['log-form:draft-1031'] = {
    formId: 'log-form', source: { id: 'draft-1031' }, pendingFiles: { room: ['教室.jpg'] },
  };
  context.writeTalentRecovery = async () => false;
  const before = JSON.stringify(context.state.draftLog);
  assert.equal(await context.clearStoredTalentDraft({ startFresh: true }), false);
  assert.deepEqual(calls, ['clear', 'draft-1031']);
  assert.equal(JSON.stringify(context.state.draftLog), before);
  assert.deepEqual(context.pendingFiles.room, ['教室.jpg']);
  assert.ok(context.localRecovery.editors['log-form:draft-1031']);
  assert.equal(opened.length, 0);
  assert.match(messages.join('\n'), /已回復到雲端/);
});

test('明確確認刪除成功後才建立今天的新紀錄', async () => {
  const { context, opened } = draftContext({ ok: true });
  assert.equal(await context.clearStoredTalentDraft({ startFresh: true }), true);
  assert.equal(context.state.draftLog, null);
  assert.deepEqual(JSON.parse(JSON.stringify(context.pendingFiles.room)), []);
  assert.deepEqual(JSON.parse(JSON.stringify(opened)), [{ id: 'fresh-log', date: '2026-11-02' }]);
});

test('本機狀態寫入失敗時回復記憶體與雲端草稿，不開新表單', async () => {
  const calls = [];
  const { context, opened, messages } = draftContext(async (_nickname, value) => {
    calls.push(value === null ? 'clear' : value?.id);
    return { ok: true };
  }, { persistResult: false });
  const originalActive = context.activeLogSource;
  const originalPending = context.pendingFiles;
  assert.equal(await context.clearStoredTalentDraft({ startFresh: true }), false);
  assert.deepEqual(calls, ['clear', 'draft-1031']);
  assert.equal(context.state.draftLog.id, 'draft-1031');
  assert.equal(context.activeLogSource, originalActive);
  assert.equal(context.pendingFiles, originalPending);
  assert.deepEqual(context.pendingFiles.room, ['教室.jpg']);
  assert.equal(opened.length, 0);
  assert.match(messages.join('\n'), /原草稿已回復到雲端與這台裝置/);
});

test('快速雙擊刪除只執行一次交易且只開一個新表單', async () => {
  let releaseClear;
  const calls = [];
  const clearGate = new Promise(resolve => { releaseClear = resolve; });
  const { context, opened, dialog, dialogButtons } = draftContext(async (_nickname, value) => {
    calls.push(value === null ? 'clear' : value?.id);
    if (value === null) await clearGate;
    return { ok: true };
  });
  const first = context.clearStoredTalentDraft({ startFresh: true });
  const second = context.clearStoredTalentDraft({ startFresh: true });
  await Promise.resolve();
  assert.equal(dialog.inert, true, '刪除中整個確認視窗都需鎖定');
  assert.equal(dialog.attributes['aria-busy'], 'true');
  assert.ok(dialogButtons.every(button => button.disabled), '刪除中取消、繼續草稿與確認按鈕都不可操作');
  releaseClear();
  assert.deepEqual(await Promise.all([first, second]), [true, true]);
  assert.deepEqual(calls, ['clear']);
  assert.equal(opened.length, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(opened[0])), { id: 'fresh-log', date: '2026-11-02' });
  assert.equal(dialog.isConnected, false);
  assert.ok(dialogButtons.every(button => button.disabled), '已被移除的舊對話框不應在 finally 被重新啟用');
});

test('刪除失敗時只重新啟用仍在畫面上的原確認視窗', async () => {
  const { context, dialog, dialogButtons } = draftContext({ ok: false, error: '暫時失敗' });
  assert.equal(await context.clearStoredTalentDraft(), false);
  assert.equal(dialog.isConnected, true);
  assert.equal(dialog.inert, false);
  assert.equal(dialog.attributes['aria-busy'], undefined);
  assert.ok(dialogButtons.every(button => !button.disabled));
});

test('較早開始的雲端讀取不可在草稿刪除後把舊草稿灌回', async () => {
  let resolveLoad;
  const response = new Promise(resolve => { resolveLoad = resolve; });
  const context = vm.createContext({
    PREVIEW_MODE: false,
    TEST_VIEW_MODE: false,
    talentDraftMutationGeneration: 0,
    cloudRuntime: {},
    state: {
      draftLog: null, logs: [], preps: [], scores: [], conversations: [], users: [], pendingUsers: [], archivedUsers: [],
      settings: {}, ui: { route: 'today' },
    },
    currentUser: { nickname: '老師' },
    window: { API: { getTalentWorkspaceData: () => response }, setTimeout() {} },
    renderApp() {}, toast() {}, persist() { return true; },
    scoreMonthsFor: () => [], allScoreMonths: () => [], currentMonth: () => '2026-11',
    normalizeName: value => value,
  });
  vm.runInContext(functionBlock('loadCloudData'), context);
  const loading = context.loadCloudData();
  context.talentDraftMutationGeneration += 1;
  resolveLoad({
    ok: true, draft: { id: 'stale-1031', date: '2026-10-31' }, lessons: [], preps: [], scores: [], conversations: [],
    users: [], pending_users: [], archived_users: [], settings: {},
  });
  assert.equal((await loading).ok, true);
  assert.equal(context.state.draftLog, null);
});

test('舊草稿與新增入口分流，且手機喚醒事件全部接上', () => {
  const editor = functionBlock('openLogEditor');
  const choice = functionBlock('openNewLogChoice');
  const wake = functionBlock('reconcileTalentClockContext');
  const persistBlock = functionBlock('persist');
  assert.doesNotMatch(editor, /existing \|\| state\.draftLog \|\|/, '新增不可再靜默復用舊草稿');
  assert.match(editor, /options\.resumeStoredDraft/);
  assert.match(choice, /resume-log-draft/);
  assert.match(choice, /replace-log-draft/);
  assert.match(choice, /不會自動刪除或覆蓋/);
  assert.match(wake, /refreshLogDateBounds\(form\)/);
  assert.doesNotMatch(wake, /updateLogFormLogic|pendingFiles|\.value\s*=/);
  assert.match(persistBlock, /state\.ui = normalizeTalentUiCalendar\(state\.ui, todayIso\(\)\)/, '午夜後任何儲存都須先完成跨月切換');
  assert.match(source, /window\.addEventListener\('pageshow', reconcileTalentClockContext\)/);
  assert.match(source, /window\.addEventListener\('focus', reconcileTalentClockContext\)/);
  assert.match(source, /visibilitychange[\s\S]*reconcileTalentClockContext/);
  assert.match(source, /document\.addEventListener\('click'[\s\S]{0,240}if \(talentDraftClearInFlight \|\| document\.querySelector/, '草稿清除中所有點擊與背景關閉都需被攔截');
  assert.match(source, /document\.addEventListener\('keydown'[\s\S]{0,180}if \(talentDraftClearInFlight \|\| document\.querySelector/, '草稿清除中 Esc 不可關閉確認視窗');
  assert.match(source, /TEST_VIEW_WRITE_ACTIONS[\s\S]*'replace-log-draft'[\s\S]*'confirm-discard-log-draft'/, '主管代看模式不得真的刪除老師草稿');
});
