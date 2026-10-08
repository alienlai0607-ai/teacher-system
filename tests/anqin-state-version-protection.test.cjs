const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.resolve(__dirname, '../review/anqin-v2/app.js'), 'utf8');
const section = (from, to) => {
  const start = source.indexOf(from);
  const end = source.indexOf(to, start);
  assert.ok(start >= 0 && end > start, `missing source section: ${from}`);
  return source.slice(start, end);
};

const startupSource = section('  function rewriteRecoveredStartupState(', '  let state = loadState();');
const persistenceSource = section('  function writeSafeBackup(', '  function loadOpenDraftStore(');
const draftPersistenceSource = section('  function writeOpenDraftStore()', '  function drawerDraftKey(');
const lifecycleSource = section("  window.addEventListener('beforeunload'", "  window.addEventListener('kpi-push-status-change'");
const resetSource = section("    else if (action === 'confirm-reset')", "    else if (action === 'confirm-delete')");
const APP_VERSION = Number(/const APP_VERSION = (\d+);/.exec(source)?.[1]);
assert.ok(Number.isInteger(APP_VERSION), 'APP_VERSION must be readable from the app source');
assert.match(resetSource, /if \(stateStorageWriteProtected\)[\s\S]*return;[\s\S]*localStorage\.removeItem\(STORAGE_KEY\)/, 'explicit reset cannot bypass protected state storage');

function memoryStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  const operations = [];
  const reads = [];
  return {
    values,
    operations,
    reads,
    get length() { return values.size; },
    key(index) { return Array.from(values.keys())[index] ?? null; },
    getItem(key) { reads.push(key); return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { operations.push({ type: 'set', key, value: String(value) }); values.set(key, String(value)); },
    removeItem(key) { operations.push({ type: 'remove', key }); values.delete(key); },
  };
}

function fixture({ main, backup, safe = false } = {}) {
  const localStorage = memoryStorage({
    ...(main === undefined ? {} : { main }),
    ...(backup === undefined ? {} : { backup }),
  });
  const sessionStorage = memoryStorage();
  const windowListeners = new Map();
  const documentListeners = new Map();
  const indicators = [];
  let draftPersistCalls = 0;
  let noticeRefreshes = 0;
  const addListener = (target, type, listener) => {
    const listeners = target.get(type) || [];
    listeners.push(listener);
    target.set(type, listeners);
  };
  const document = {
    visibilityState: 'visible',
    addEventListener(type, listener) { addListener(documentListeners, type, listener); },
  };
  const context = vm.createContext({
    APP_VERSION,
    SAFE_START_MODE: safe,
    STORAGE_KEY: 'main',
    BACKUP_KEY: 'backup',
    DRAFT_KEY: 'drafts',
    LEGACY_TEST_STORAGE_KEYS: [],
    MAX_BOOT_STATE_CHARS: 1600000,
    MAX_PERSISTED_MEDIA_CHARS: 850000,
    localStorage,
    sessionStorage,
    document,
    window: {
      addEventListener(type, listener) { addListener(windowListeners, type, listener); },
      clearTimeout() {},
      setTimeout(listener) { listener(); return 1; },
    },
    createSeed: () => ({
      version: APP_VERSION,
      marker: 'memory-seed',
      ui: { lastSavedAt: null, saveRevision: 0 },
      activities: [],
      submissions: [],
      operations: { evidenceByCheck: {} },
    }),
    normalizeLoadedState: value => {
      const normalized = JSON.parse(JSON.stringify(value));
      normalized.version = APP_VERSION;
      normalized.ui = { lastSavedAt: null, saveRevision: 0, ...(normalized.ui || {}) };
      return normalized;
    },
    stripEmbeddedMediaJson: value => String(value),
    serializeStateForStorage: value => JSON.stringify(value),
    embeddedMediaCharacters: () => 0,
    walkLocalAttachments() {},
    materialCloudUrl: () => '',
    hasUnuploadedInlineMedia: () => false,
    updateSaveIndicator(status, message) { indicators.push({ status, message }); },
    refreshSystemStatusNotice() { noticeRefreshes += 1; },
    persistCurrentDrawerDraft() { draftPersistCalls += 1; },
    toast() {},
    Date,
    JSON,
    Number,
  });

  vm.runInContext(`
    let loadStateIssue = '';
    let startupStateNeedsRewrite = false;
    let startupRecoverySaved = false;
    let stateStorageWriteProtected = false;
    let state;
    let openDraftStore = { protectedDraft: true };
  `, context);
  vm.runInContext(startupSource, context);
  vm.runInContext(`
    state = loadState();
    if (startupStateNeedsRewrite) startupRecoverySaved = rewriteRecoveredStartupState(state);
    let saveTimer = null;
    let draftTimer = null;
    let lastStorageToastAt = 0;
    let runtimeHealth = {
      loadIssue: loadStateIssue,
      persistError: '',
      mediaPersistWarning: '',
      lastPersistOk: !loadStateIssue,
      lastPersistAt: state.ui.lastSavedAt || '',
    };
  `, context);
  vm.runInContext(persistenceSource, context);
  vm.runInContext(draftPersistenceSource, context);
  vm.runInContext(lifecycleSource, context);

  return {
    context,
    localStorage,
    document,
    windowListeners,
    documentListeners,
    indicators,
    get draftPersistCalls() { return draftPersistCalls; },
    get noticeRefreshes() { return noticeRefreshes; },
    evaluate(expression) { return vm.runInContext(expression, context); },
    dispatchWindow(type) { (windowListeners.get(type) || []).forEach(listener => listener()); },
    dispatchDocument(type) { (documentListeners.get(type) || []).forEach(listener => listener()); },
  };
}

function storedPair(testFixture) {
  return {
    main: testFixture.localStorage.getItem('main'),
    backup: testFixture.localStorage.getItem('backup'),
  };
}

const supported = marker => JSON.stringify({ version: APP_VERSION, marker, ui: {} });
const future = marker => JSON.stringify({ version: APP_VERSION + 1, marker, ui: {} });

{
  const original = { main: future('future-main'), backup: supported('supported-backup') };
  const testFixture = fixture(original);
  assert.equal(testFixture.evaluate('stateStorageWriteProtected'), true, 'future main state enables write protection');
  assert.equal(testFixture.evaluate('state.marker'), 'memory-seed', 'future state opens only an in-memory seed');
  assert.deepEqual(storedPair(testFixture), original, 'startup never rewrites a future main state or its backup');
  assert.equal(testFixture.localStorage.operations.length, 0);

  assert.equal(testFixture.evaluate("state.ui.changed = true; persist('manual')"), false);
  assert.deepEqual(storedPair(testFixture), original, 'manual persist cannot overwrite protected state');
  assert.equal(testFixture.evaluate('writeSafeBackup(state)'), false, 'direct backup writes are protected');
  assert.equal(testFixture.evaluate('rewriteRecoveredStartupState(state)'), false, 'direct startup rewrites are protected');
  assert.equal(testFixture.evaluate('writeOpenDraftStore()'), '', 'direct drawer-draft writes are protected');
  assert.equal(testFixture.localStorage.getItem('drafts'), null);

  testFixture.dispatchWindow('pagehide');
  testFixture.document.visibilityState = 'hidden';
  testFixture.dispatchDocument('visibilitychange');
  testFixture.dispatchWindow('beforeunload');
  assert.deepEqual(storedPair(testFixture), original, 'pagehide, hidden, and beforeunload preserve protected state');
  assert.equal(testFixture.draftPersistCalls, 0, 'protected lifecycle events do not create replacement drawer drafts');
}

{
  const original = { main: supported('supported-main'), backup: future('future-backup') };
  const testFixture = fixture(original);
  assert.equal(testFixture.evaluate('stateStorageWriteProtected'), true, 'future backup protects both storage records even when main is readable');
  assert.deepEqual(storedPair(testFixture), original);
  assert.equal(testFixture.evaluate('persist()'), false);
  assert.deepEqual(storedPair(testFixture), original);
}

{
  const original = { main: supported('safe-main-sentinel'), backup: future('future-safe-backup') };
  const testFixture = fixture({ ...original, safe: true });
  assert.equal(testFixture.evaluate('stateStorageWriteProtected'), true, 'safe mode protects a future backup');
  assert.equal(testFixture.evaluate('startupRecoverySaved'), false, 'safe mode never rewrites a future backup during startup');
  assert.deepEqual(storedPair(testFixture), original);
  testFixture.dispatchWindow('pagehide');
  assert.deepEqual(storedPair(testFixture), original);
}

{
  const original = { main: supported('safe-main-sentinel'), backup: '{damaged-backup' };
  const testFixture = fixture({ ...original, safe: true });
  assert.equal(testFixture.evaluate('stateStorageWriteProtected'), true, 'safe mode protects damaged backup bytes');
  assert.deepEqual(storedPair(testFixture), original);
  testFixture.document.visibilityState = 'hidden';
  testFixture.dispatchDocument('visibilitychange');
  assert.deepEqual(storedPair(testFixture), original);
}

{
  const original = { main: JSON.stringify({ version: 7, marker: 'unsupported-main', ui: {} }), backup: supported('supported-backup') };
  const testFixture = fixture(original);
  assert.equal(testFixture.evaluate('stateStorageWriteProtected'), true, 'unsupported legacy versions use the same preservation mode');
  assert.deepEqual(storedPair(testFixture), original);
}

{
  const oldBackup = JSON.stringify({ version: APP_VERSION - 1, marker: 'recoverable-backup', ui: {} });
  const testFixture = fixture({ main: '{corrupt-main', backup: oldBackup });
  assert.equal(testFixture.evaluate('stateStorageWriteProtected'), false, 'a supported old backup remains recoverable');
  assert.equal(testFixture.evaluate('startupRecoverySaved'), true);
  assert.equal(JSON.parse(testFixture.localStorage.getItem('main')).marker, 'recoverable-backup');
  assert.equal(JSON.parse(testFixture.localStorage.getItem('main')).version, APP_VERSION);
  assert.equal(testFixture.localStorage.getItem('main'), testFixture.localStorage.getItem('backup'));
}

{
  const oldBackup = JSON.stringify({ version: APP_VERSION - 1, marker: 'safe-old-backup', ui: {} });
  const testFixture = fixture({ main: supported('safe-main'), backup: oldBackup, safe: true });
  assert.equal(testFixture.evaluate('stateStorageWriteProtected'), false, 'safe mode still migrates a supported old backup');
  assert.equal(testFixture.evaluate('startupRecoverySaved'), true);
  assert.equal(JSON.parse(testFixture.localStorage.getItem('main')).marker, 'safe-old-backup');
  assert.equal(JSON.parse(testFixture.localStorage.getItem('backup')).version, APP_VERSION);
}

{
  const originalMain = future('future-main-without-backup');
  const testFixture = fixture({ main: originalMain, safe: true });
  assert.equal(testFixture.evaluate('stateStorageWriteProtected'), true, 'safe mode preserves an existing main key when no backup exists');
  assert.deepEqual(testFixture.localStorage.reads, ['backup'], 'safe mode detects the main key without reading or parsing its bytes');
  assert.equal(testFixture.localStorage.getItem('main'), originalMain);
  testFixture.dispatchWindow('pagehide');
  assert.equal(testFixture.localStorage.getItem('main'), originalMain, 'safe pagehide leaves a main-only future state byte-for-byte intact');
  assert.equal(testFixture.localStorage.getItem('backup'), null);
}

{
  const testFixture = fixture({ backup: '', safe: true });
  assert.equal(testFixture.evaluate('stateStorageWriteProtected'), true, 'an existing but empty backup key is preserved instead of treated as a clean device');
  assert.equal(testFixture.localStorage.getItem('backup'), '');
  assert.equal(testFixture.evaluate('persist()'), false);
  assert.equal(testFixture.localStorage.getItem('backup'), '');
}

{
  const testFixture = fixture({ safe: true });
  assert.equal(testFixture.evaluate('stateStorageWriteProtected'), false, 'safe mode without backup bytes remains writable for cloud reconstruction');
  assert.equal(testFixture.evaluate('startupRecoverySaved'), false, 'an empty safe-mode seed is not rewritten during startup');
  assert.equal(testFixture.evaluate("state.ui.cloudRebuilt = true; persist('cloud rebuilt')"), true);
  assert.equal(JSON.parse(testFixture.localStorage.getItem('main')).ui.cloudRebuilt, true);
  assert.equal(JSON.parse(testFixture.localStorage.getItem('backup')).ui.cloudRebuilt, true);
}

{
  const testFixture = fixture({ main: supported('normal-main'), backup: supported('normal-backup') });
  assert.equal(testFixture.evaluate('stateStorageWriteProtected'), false);
  assert.equal(testFixture.evaluate("state.ui.normalDraft = 'kept'; persist('normal')"), true, 'normal drafts still persist');
  assert.equal(JSON.parse(testFixture.localStorage.getItem('main')).ui.normalDraft, 'kept');
  assert.equal(JSON.parse(testFixture.localStorage.getItem('backup')).ui.normalDraft, 'kept');
  assert.equal(testFixture.evaluate('writeOpenDraftStore()'), 'local', 'normal drawer drafts remain writable');
  assert.equal(JSON.parse(testFixture.localStorage.getItem('drafts')).protectedDraft, true);

  testFixture.evaluate("state.ui.normalDraft = 'pagehide';");
  testFixture.dispatchWindow('pagehide');
  assert.equal(JSON.parse(testFixture.localStorage.getItem('main')).ui.normalDraft, 'pagehide', 'normal pagehide persistence remains enabled');
}

console.log('PASS: unsupported and future Anqin state stays byte-for-byte protected while supported drafts still persist.');
