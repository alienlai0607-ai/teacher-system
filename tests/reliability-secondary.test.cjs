const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const crypto = require('node:crypto');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const block = (text, from, to) => text.slice(text.indexOf(from), text.indexOf(to, text.indexOf(from)));
const utils = read('apps-script/utils.gs');
const properties = new Map();
const cache = new Map();
let eventCalls = 0;
const context = vm.createContext({
  console, Date,
  PropertiesService: { getScriptProperties: () => ({ getProperty: key => key === 'LINE_CHANNEL_SECRET' ? 'synthetic-secret' : properties.get(key), setProperty: (key, value) => properties.set(key, value), deleteProperty: key => properties.delete(key) }) },
  CacheService: { getScriptCache: () => ({ get: key => cache.get(key), put: (key, value) => cache.set(key, value) }) },
  LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock() {} }) },
  Utilities: {
    Charset: { UTF_8: 'utf8' }, DigestAlgorithm: { SHA_256: 'sha256' },
    computeHmacSha256Signature: (value, secret) => crypto.createHmac('sha256', secret).update(value).digest(),
    base64Encode: value => Buffer.from(value).toString('base64'), base64EncodeWebSafe: value => Buffer.from(value).toString('base64url'),
    computeDigest: (_, value) => crypto.createHash('sha256').update(value).digest(),
  },
  handleLineWebhook_: () => eventCalls++,
});
vm.runInContext(block(utils, 'function withRecordWriteLock_', 'function reportClientMetrics') + block(read('apps-script/tasks.gs'), 'function handleVerifiedLineWebhook_', '/** 對目前帳號'), context);
const envelope = rawBody => ({ rawBody, signature: crypto.createHmac('sha256', 'synthetic-secret').update(rawBody).digest('base64') });
assert.equal(context.handleVerifiedLineWebhook_({ rawBody: '{}', signature: 'forged' }).code, 'LINE_SIGNATURE_INVALID');
assert.equal(eventCalls, 0);
assert.equal(context.handleVerifiedLineWebhook_(envelope('null')).code, 'LINE_BODY_INVALID');
assert.equal(context.handleVerifiedLineWebhook_(envelope('{"events":[null]}')).code, 'LINE_BODY_INVALID');
const valid = envelope(JSON.stringify({ events: [{ webhookEventId: 'synthetic-event', type: 'message' }] }));
assert.equal(context.handleVerifiedLineWebhook_(valid).ok, true);
assert.equal(context.handleVerifiedLineWebhook_(valid).ok, true);
assert.equal(eventCalls, 1, 'redelivered event handled once');
assert.equal(context.handleVerifiedLineWebhook_(envelope('{"events":[]}')).ok, true, 'LINE verification ping');

vm.runInContext(block(utils, 'function backupSheetFingerprint_', 'function backupKpiDatabaseAuto'), context);
const sheet = (values, formulas) => ({ getName: () => 'test', getLastRow: () => values.length, getLastColumn: () => values[0].length, getRange: (start, _, length) => ({ getValues: () => values.slice(start - 1, start - 1 + length), getFormulas: () => formulas.slice(start - 1, start - 1 + length) }) });
const first = context.backupSheetFingerprint_(sheet([['text', 1]], [['', '=NOW()']]));
assert.deepEqual(first, context.backupSheetFingerprint_(sheet([['text', 2]], [['', '=NOW()']])), 'volatile formula result ignored but formula preserved');
assert.notDeepEqual(first, context.backupSheetFingerprint_(sheet([['lost', 1]], [['', '=NOW()']])), 'lost cell detected');
assert.notDeepEqual(first, context.backupSheetFingerprint_(sheet([['text', 1]], [['', '=1']])), 'changed formula detected');

const app = read('review/anqin-v2/app.js');
const readinessPanel = block(app, '  function renderIntegrationSettings()', '  async function');
assert.match(readinessPanel, /通知與排程設定/);
assert.doesNotMatch(readinessPanel, /全部完成|正式上線檢查/);
assert.doesNotMatch(block(app, '    const readinessChecks = [', '    const managerNickname'), /materialUpload|coursePrepArchive|taskCloudSync/);
assert.match(readinessPanel, /deliveryRetry/);
assert.match(readinessPanel, /databaseBackup/);
const state = { activities: [{ id: 'one', type: 'lessonprep', title: 'local edit', teacher: 'QA', cloudSyncStatus: 'pending', cloudRevision: 'r1' }], lessonPlans: [] };
const frontend = vm.createContext({ state, clone: value => JSON.parse(JSON.stringify(value)), displayNameForBackend: value => value, backendNickname: value => value, uid: () => 'recovered', toast() {} });
vm.runInContext(block(app, '  function importCloudCoursePrep(', '  async function syncCoursePrepsFromCloud('), frontend);
const remote = revision => ({ revision, nickname: 'QA', updatedAt: '2026-09-06', prep: { id: 'one', type: 'lessonprep', title: 'cloud edit' } });
assert.equal(frontend.importCloudCoursePrep(remote('r1')), false, 'pending edit not overwritten by unchanged cloud');
assert.equal(frontend.importCloudCoursePrep(remote('r2')), true);
assert.equal(state.activities[0].title, 'cloud edit');
assert.equal(state.activities[1].title, 'local edit（本機未同步草稿）');
assert.equal(state.activities[1].cloudRevision, '');
assert.match(read('review/anqin-v2/styles.css'), /\.workflow-tabs\s*\{[^}]*grid-auto-flow: column;[^}]*grid-auto-columns: minmax\(0, 1fr\);/);
assert.doesNotMatch(read('review/anqin-v2/styles.css'), /\.workflow-tabs\s*\{[^}]*repeat\(5/);

const pdfSource = read('apps-script/pdfreport.gs');
let replaceSucceeds = false;
const trashed = [];
let created = 0;
const existingPdf = { getId: () => 'stable-pdf-id', setTrashed: () => trashed.push('existing') };
const duplicatePdf = { setTrashed: () => trashed.push('duplicate') };
const folder = files => ({
  getFilesByName: () => { let index = 0; return { hasNext: () => index < files.length, next: () => files[index++] }; },
  createFile: () => { created++; return { created: true }; },
});
const pdfContext = vm.createContext({ replacePdfContent_: (id, blob) => { assert.equal(id, 'stable-pdf-id'); return replaceSucceeds; } });
vm.runInContext(block(pdfSource, 'function savePersonPdf_(', '/** 單人日報 PDF'), pdfContext);
assert.throws(() => pdfContext.savePersonPdf_(folder([existingPdf, duplicatePdf]), 'daily.pdf', {}), error => error.code === 'PDF_REPLACE_FAILED');
assert.deepEqual(trashed, [], 'failed replacement preserves the old report and every existing link');
assert.equal(created, 0, 'failed replacement does not create a new report ID');
replaceSucceeds = true;
assert.equal(pdfContext.savePersonPdf_(folder([existingPdf, duplicatePdf]), 'daily.pdf', {}), existingPdf);
assert.deepEqual(trashed, ['duplicate'], 'only successful replacement can retire duplicate files');
assert.equal(pdfContext.savePersonPdf_(folder([]), 'daily.pdf', {}).created, true);
assert.equal(created, 1);
console.log('PASS signature rejection/replay, backup content verification, prep conflict recovery, equal-width step layout, and PDF replacement failure preservation');
