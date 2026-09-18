const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { harness } = require('./system-logic-audit.test.cjs');
const copy = value => JSON.parse(JSON.stringify(value));
const runId = 'QA-COURSE-12345678-aaaa-bbbb-cccc-123456789012';
const propertyKey = 'KPI_COURSE_QA_PENDING_' + runId;
let passed = 0;
function test(name, fn) { fn(); passed++; console.log('PASS ' + name); }

function setup(options = {}) {
  const { c } = harness();
  c.todayStr = () => options.date || '2026-09-18';
  c.Utilities.getUuid = () => runId.slice('QA-COURSE-'.length);
  c.ensureHeaders(c.getSheet('DailyLogs'), ['kpi6_data', 'department', 'role', 'submitted_at', 'locked', 'delivery_state', 'evidence_state']);
  const admin = c.findUserByNickname('boss');
  c.Session.getActiveUser = () => ({ getEmail: () => options.email === undefined ? admin.email : options.email });
  if (options.actor) c.updateRow('Users', c.findObject('Users', 'nickname', admin.nickname)._row, options.actor);
  const files = new Map();
  let sequence = 0;
  let generatedHtml = '';
  function blob(value, mime, name) {
    const bytes = typeof value === 'string' ? Buffer.from(value) : Buffer.from(value || []);
    const item = { getBytes: () => [...bytes], getDataAsString: () => bytes.toString(), getContentType: () => mime,
      getName: () => name, setName(next) { name = next; return item; },
      getAs(type) {
        assert.equal(mime, 'text/html');
        assert.equal(type, 'application/pdf');
        generatedHtml = bytes.toString();
        if (options.pdfFailure) throw new Error('synthetic PDF conversion failure');
        return blob('%PDF-synthetic artifact', type, name);
      } };
    return item;
  }
  c.Utilities.newBlob = blob;
  const folder = { createFile(data) {
    const id = 'synthetic-drive-file-' + (++sequence);
    const state = { trashed: false, access: 'PUBLIC' };
    const file = { getId: () => id, getName: () => data.getName(), getBlob: () => data,
      getSize: () => data.getBytes().length, getSharingAccess: () => state.access,
      setSharing(access) { state.access = access; },
      setTrashed(value) { if (options.trashFailure && data.getName().endsWith('-photo.png')) throw new Error('synthetic trash failure'); state.trashed = value; },
      isTrashed: () => state.trashed };
    files.set(id, file);
    if (options.createResponseLost && data.getName().endsWith('-photo.png')) throw new Error('synthetic create response lost');
    return file;
  } };
  c.getEvidenceRootFolder_ = () => folder;
  c.getOrCreateChildFolder_ = () => folder;
  c.DriveApp = { Access: { PRIVATE: 'PRIVATE' }, Permission: { VIEW: 'VIEW' }, getFileById: id => files.get(id),
    searchFiles(query) {
      const prefix = query.match(/title contains '([^']+)'/)[1];
      const found = options.staleSearch ? [] : [...files.values()].filter(file => (!query.includes('trashed = false') || !file.isTrashed()) && file.getName().includes(prefix));
      return { hasNext: () => found.length > 0, next: () => found.shift() };
    } };
  c.secureKpiDriveItem_ = file => file.setSharing('PRIVATE');
  c.assertKpiFileReadable_ = file => {
    assert.equal(file.getSharingAccess(), 'PRIVATE');
    assert.ok(file.getSize() > 0);
    if (options.pdfAccessFailure && file.getName().endsWith('-review.pdf')) throw new Error('synthetic PDF ACL failure');
  };
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../apps-script/pdfreport.gs'), 'utf8'), c);
  c.UrlFetchApp = { fetch() { throw new Error('No external requests permitted in this test'); } };
  c.notifyUser_ = () => assert.fail('QA must not notify real people');
  c.sendSubmitPdf = () => assert.fail('QA must not invoke real-teacher delivery');
  c.saveLog = () => assert.fail('QA must not submit a real teacher daily log');
  c.appendRow('DailyLogs', { log_id: 'existing-real-log', nickname: 'north', date: '2026-09-18', reflection: 'untouched' });
  const usersBefore = copy(c.sheetToObjects('Users'));
  const realBefore = copy(c.findObject('DailyLogs', 'log_id', 'existing-real-log'));
  function preserved() {
    assert.deepEqual(copy(c.sheetToObjects('Users')), usersBefore, 'Never create or update a QA user profile');
    assert.deepEqual(copy(c.findObject('DailyLogs', 'log_id', 'existing-real-log')), realBefore, 'Never overwrite a real daily log');
  }
  return { c, files, options, folder, blob, preserved, generatedHtml: () => generatedHtml,
    property: () => c.PropertiesService.getScriptProperties().getProperty(propertyKey) };
}

test('successful editor run validates, roundtrips, embeds Drive bytes and retains only a private review PDF', () => {
  const h = setup();
  const result = h.c.verifyCourseRecordDeliveryFromEditor();
  assert.equal(result.ok, true);
  assert.equal(result.checks.length, 4);
  assert.ok(result.checks.every(check => check.ok));
  assert.equal(result.cleanup.row_absent, true);
  assert.equal(result.cleanup.files_trashed, 1);
  assert.equal(result.cleanup.pdf_retained_for_review, true);
  assert.equal(result.artifact.cleanup_pending, true);
  assert.equal(result.artifact.private, true);
  assert.match(h.generatedHtml(), /今日課程照片已分享到群組、家長通/);
  assert.match(h.generatedHtml(), /系統驗收：修改後內容已讀回/);
  assert.match(h.generatedHtml(), /src="data:image\/png;base64,/);
  assert.equal(h.c.findObject('DailyLogs', 'log_id', runId), null);
  assert.equal([...h.files.values()].filter(file => !file.isTrashed()).length, 1);
  assert.ok(h.property(), 'Retained PDF must remain registered for explicit cleanup');
  h.preserved();
  const collateral = h.folder.createFile(h.blob('keep', 'text/plain', runId + '-unrelated.txt'));
  const cleanup = h.c.cleanupCourseRecordDeliveryFromEditor();
  assert.equal(cleanup.ok, true);
  assert.equal(h.property(), undefined);
  assert.equal(h.files.get(result.artifact.file_id).isTrashed(), true);
  assert.equal(collateral.isTrashed(), false, 'Do not delete a different file merely sharing the run prefix');
  h.preserved();
});

for (const options of [{ email: '' }, { email: 'unknown@example.invalid' }, { actor: { role: 'teacher' } }, { actor: { status: 'inactive' } }]) {
  test('unapproved editor identity cannot create or clean QA resources: ' + JSON.stringify(options), () => {
    const h = setup(options);
    assert.throws(() => h.c.verifyCourseRecordDeliveryFromEditor(), /管理員/);
    assert.throws(() => h.c.cleanupCourseRecordDeliveryFromEditor(), /管理員/);
    assert.equal(h.files.size, 0);
    assert.equal(h.property(), undefined);
    h.preserved();
  });
}

test('missing Google editor identity scope fails before any mutation', () => {
  const h = setup();
  h.c.Session.getActiveUser = () => { throw new Error('Missing userinfo.email scope'); };
  assert.throws(() => h.c.verifyCourseRecordDeliveryFromEditor(), /userinfo.email/);
  assert.equal(h.files.size, 0);
  assert.equal(h.property(), undefined);
  h.preserved();
});

test('an accidentally permissive validator causes the QA run to fail and clean its screenshot', () => {
  const h = setup();
  h.c.validateAnqinCourseRecord_ = () => null;
  const result = h.c.verifyCourseRecordDeliveryFromEditor();
  assert.equal(result.ok, false);
  assert.equal(result.checks.at(-1).id, 'required_validation');
  assert.equal(result.cleanup.row_absent, true);
  assert.ok([...h.files.values()].every(file => file.isTrashed()));
  assert.equal(h.property(), undefined);
  h.preserved();
});

for (const operation of ['appendRow', 'updateRow']) {
  test(operation + ' failure after writing still cleans the exact QA row and photo', () => {
    const h = setup();
    const original = h.c[operation];
    h.c[operation] = (...args) => { const result = original(...args); throw new Error('synthetic write response loss'); };
    const result = h.c.verifyCourseRecordDeliveryFromEditor();
    assert.equal(result.ok, false);
    assert.equal(result.cleanup.ok, true);
    assert.equal(h.c.findObject('DailyLogs', 'log_id', runId), null);
    assert.ok([...h.files.values()].every(file => file.isTrashed()));
    assert.equal(h.property(), undefined);
    h.preserved();
  });
}

for (const option of ['pdfFailure', 'pdfAccessFailure']) {
  test(option + ' cleans the synthetic row, photo and any incomplete PDF', () => {
    const h = setup({ [option]: true });
    const result = h.c.verifyCourseRecordDeliveryFromEditor();
    assert.equal(result.ok, false);
    assert.equal(result.checks.at(-1).id, 'pdf_conversion');
    assert.equal(result.cleanup.ok, true);
    assert.equal(result.artifact, null);
    assert.ok([...h.files.values()].every(file => file.isTrashed()));
    assert.equal(h.property(), undefined);
    h.preserved();
  });
}

test('cleanup lock contention is reported and remains recoverable without retaining a PDF', () => {
  const h = setup();
  const original = h.c.withRecordWriteLock_;
  let calls = 0;
  h.c.withRecordWriteLock_ = (...args) => ++calls === 2 ? { ok: false, code: 'WRITE_BUSY' } : original(...args);
  const result = h.c.verifyCourseRecordDeliveryFromEditor();
  assert.equal(result.ok, false);
  assert.equal(result.cleanup.row_absent, false);
  assert.equal(result.cleanup.cleanup_pending, true);
  assert.ok(h.property());
  assert.ok([...h.files.values()].every(file => file.isTrashed()));
  h.c.withRecordWriteLock_ = original;
  assert.equal(h.c.cleanupCourseRecordDeliveryFromEditor().ok, true);
  assert.equal(h.c.findObject('DailyLogs', 'log_id', runId), null);
  assert.equal(h.property(), undefined);
  h.preserved();
});

test('Drive cleanup failure stays registered and can be cleaned by the same admin helper', () => {
  const h = setup({ trashFailure: true });
  const result = h.c.verifyCourseRecordDeliveryFromEditor();
  assert.equal(result.ok, false);
  assert.equal(result.cleanup.cleanup_pending, true);
  assert.ok(h.property());
  h.options.trashFailure = false;
  assert.equal(h.c.cleanupCourseRecordDeliveryFromEditor().ok, true);
  assert.ok([...h.files.values()].every(file => file.isTrashed()));
  assert.equal(h.property(), undefined);
  h.preserved();
});

test('an existing matching ID is never overwritten or cleaned by a new run', () => {
  const h = setup();
  h.c.appendRow('DailyLogs', { log_id: runId, nickname: 'north', reflection: 'collision must stay' });
  assert.throws(() => h.c.verifyCourseRecordDeliveryFromEditor(), /編號已存在/);
  assert.equal(h.c.findObject('DailyLogs', 'log_id', runId).reflection, 'collision must stay');
  assert.equal(h.files.size, 0);
  assert.equal(h.property(), undefined);
  h.preserved();
});

test('cleanup refuses a registered ID whose row belongs to a real teacher', () => {
  const h = setup();
  h.c.PropertiesService.getScriptProperties().setProperty(propertyKey, '{}');
  h.c.appendRow('DailyLogs', { log_id: runId, nickname: 'north', reflection: 'must stay' });
  const result = h.c.cleanupCourseRecordDeliveryFromEditor();
  assert.equal(result.ok, false);
  assert.equal(h.c.findObject('DailyLogs', 'log_id', runId).reflection, 'must stay');
  assert.ok(h.property());
  h.preserved();
});

test('weekend execution still exercises the mandatory weekday validator', () => {
  const h = setup({ date: '2026-09-20' });
  assert.equal(h.c.verifyCourseRecordDeliveryFromEditor().ok, true);
  assert.equal(h.c.cleanupCourseRecordDeliveryFromEditor().ok, true);
  h.preserved();
});

test('stale Drive search cannot prevent exact-ID cleanup or lose the review artifact registration', () => {
  const h = setup({ staleSearch: true });
  const originalSecure = h.c.secureKpiDriveItem_;
  h.c.secureKpiDriveItem_ = file => {
    const entry = JSON.parse(h.property());
    const key = file.getName().endsWith('-photo.png') ? 'photo_id' : 'pdf_id';
    assert.equal(entry[key], file.getId(), 'Register each ID immediately after creation, before ACL or PDF checks');
    originalSecure(file);
  };
  const result = h.c.verifyCourseRecordDeliveryFromEditor();
  assert.equal(result.ok, true);
  assert.equal(result.cleanup.files_trashed, 1);
  assert.equal(result.cleanup.pdf_retained_for_review, true);
  const entry = JSON.parse(h.property());
  assert.ok(h.files.get(entry.photo_id).isTrashed());
  assert.equal(h.files.get(entry.pdf_id).isTrashed(), false);
  assert.equal(h.c.cleanupCourseRecordDeliveryFromEditor().ok, true);
  assert.ok([...h.files.values()].every(file => file.isTrashed()));
  assert.equal(h.property(), undefined);
  h.preserved();
});

test('lost create response plus stale search retains uncertainty until the exact file is discoverable', () => {
  const h = setup({ createResponseLost: true, staleSearch: true });
  const result = h.c.verifyCourseRecordDeliveryFromEditor();
  assert.equal(result.ok, false);
  assert.equal(result.cleanup.ok, false);
  assert.equal(result.cleanup.cleanup_pending, true);
  assert.ok(h.property(), 'Empty search is not evidence that creation never happened');
  assert.equal([...h.files.values()].filter(file => !file.isTrashed()).length, 1);
  h.options.staleSearch = false;
  assert.equal(h.c.cleanupCourseRecordDeliveryFromEditor().ok, true);
  assert.ok([...h.files.values()].every(file => file.isTrashed()));
  assert.equal(h.property(), undefined);
  h.preserved();
});

test('a registered ID with a mismatched filename is never trashed and remains pending', () => {
  const h = setup();
  const unrelated = h.folder.createFile(h.blob('real data', 'text/plain', 'real-file.txt'));
  h.c.PropertiesService.getScriptProperties().setProperty(propertyKey, JSON.stringify({ version: 2, photo_attempted: true, photo_id: unrelated.getId(), pdf_attempted: false }));
  const result = h.c.cleanupCourseRecordDeliveryFromEditor();
  assert.equal(result.ok, false);
  assert.equal(unrelated.isTrashed(), false);
  assert.ok(h.property());
  h.preserved();
});

test('failed exact-ID lookup retains recovery even when search is empty', () => {
  const h = setup({ staleSearch: true });
  assert.equal(h.c.verifyCourseRecordDeliveryFromEditor().ok, true);
  const entry = JSON.parse(h.property());
  const getFile = h.c.DriveApp.getFileById;
  h.c.DriveApp.getFileById = id => { if (id === entry.photo_id) throw new Error('temporary Drive lookup failure'); return getFile(id); };
  assert.equal(h.c.cleanupCourseRecordDeliveryFromEditor().ok, false);
  assert.ok(h.property());
  h.c.DriveApp.getFileById = getFile;
  assert.equal(h.c.cleanupCourseRecordDeliveryFromEditor().ok, true);
  assert.equal(h.property(), undefined);
  h.preserved();
});

test('legacy registration with a missing photo ID does not trust an empty search', () => {
  const h = setup({ staleSearch: true });
  const photo = h.folder.createFile(h.blob('photo', 'image/png', runId + '-photo.png'));
  photo.setTrashed(true);
  const pdf = h.folder.createFile(h.blob('%PDF-synthetic', 'application/pdf', runId + '-review.pdf'));
  h.c.PropertiesService.getScriptProperties().setProperty(propertyKey, JSON.stringify({ created_at: 'before-fix', pdf_id: pdf.getId() }));
  assert.equal(h.c.cleanupCourseRecordDeliveryFromEditor().ok, false);
  assert.ok(h.property());
  h.options.staleSearch = false;
  assert.equal(h.c.cleanupCourseRecordDeliveryFromEditor().ok, true);
  assert.ok(photo.isTrashed() && pdf.isTrashed());
  assert.equal(h.property(), undefined);
  h.preserved();
});

const router = fs.readFileSync(path.join(__dirname, '../apps-script/Code.gs'), 'utf8');
assert.doesNotMatch(router, /['"](?:verifyCourseRecordDeliveryFromEditor|cleanupCourseRecordDeliveryFromEditor)['"]\s*:/, 'Editor QA must not become an HTTP endpoint');
console.log(`${passed} editor course-delivery scenarios passed; Drive/PDF services are isolated doubles, real Google conversion remains live QA.`);
