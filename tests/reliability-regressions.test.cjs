const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '..');
const read = name => fs.readFileSync(path.join(root, name), 'utf8');
const copy = value => JSON.parse(JSON.stringify(value));
const block = (text, from, to) => text.slice(text.indexOf(from), text.indexOf(to, text.indexOf(from)));
const app = read('review/anqin-v2/app.js');
const helpers = block(read('apps-script/utils.gs'), 'function withRecordWriteLock_', 'function reportClientMetrics');
let assertions = 0;
function check(value, message) { assert.ok(value, message); assertions++; }

async function main() {
  const records = new Map();
  const context = vm.createContext({ console, Utilities: { getUuid: () => crypto.randomUUID() },
    SHEET_NAMES: { LOGS: 'logs', COURSE_PREP: 'preps' },
    LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock() {} }) },
    getSheet: () => ({}), ensureHeaders() {},
    findUserByNickname: name => ({ nickname: name, status: 'active', role: name === 'boss' ? 'admin' : 'teacher', department: 'QA' }),
    findObject: (sheet, key, id) => { const found = [...records.values()].find(item => item.sheet === sheet && item[key] === id); return found ? copy(found) : null; },
    appendRow: (sheet, data) => records.set(records.size + 2, { ...copy(data), _row: records.size + 2, sheet }),
    updateRow: (sheet, row, data) => Object.assign(records.get(row), copy(data)),
    upsertRow: (sheet, key, data) => { const old = [...records.values()].find(item => item.sheet === sheet && item[key] === data[key]); if (old) Object.assign(old, copy(data)); else context.appendRow(sheet, data); },
    sheetToObjects: sheet => [...records.values()].filter(item => item.sheet === sheet).map(copy),
    parseJsonField: value => typeof value === 'string' ? (value ? JSON.parse(value) : null) : value,
    normalizeDepartment_: value => value, isGlobalManager_: () => false,
    todayStr: () => '2026-09-06', nowIso: () => '2026-09-06T12:00:00', logSystem() {},
  });
  vm.runInContext(helpers + read('apps-script/logs.gs') + read('apps-script/courseprep.gs'), context);
  context.replaceEvidenceForLog_ = () => {};
  context.ensureCoursePrepSheet_ = () => ({});
  const payload = { nickname: 'QA', date: '2026-09-06', reflection: 'new '.repeat(50), attachments: [{ url: 'https://drive.google.com/file/d/qa/view' }], submitted: true, request_id: 'submit-1' };
  const first = context.saveLog(payload);
  check(first.ok, 'initial submission');
  const late = context.saveLog({ ...payload, request_id: 'old', submitted: false, reflection: 'old', attachments: [] });
  check(late.code === 'ALREADY_SUBMITTED', 'late draft must not erase submitted text/photos');
  check(context.getLog(payload).log.attachments.length === 1, 'attachments survived');
  check(context.saveLog(payload).duplicate, 'lost-response retry returns original receipt');
  check(context.saveLog({ ...payload, request_id: 'stale' }).code === 'RECORD_CONFLICT', 'stale submitted edit rejected');
  const second = context.saveLog({ ...payload, request_id: 'submit-2', base_revision: first.revision, reflection: 'edited' });
  check(second.ok && second.revision !== first.revision, 'same-second saves still have unique revisions');
  context.replaceEvidenceForLog_ = () => { throw new Error('temporary index failure'); };
  const repairedLater = context.saveLog({ ...payload, request_id: 'submit-3', base_revision: second.revision });
  check(repairedLater.ok && context.getLog(payload).log.evidence_state === 'pending', 'durable saved result with repairable evidence index');

  for (let i = 0; i < 1001; i++) context.appendRow('logs', { log_id: `history-${i}`, date: '2026-09-05', nickname: 'QA' });
  const ids = new Set(); let cursor = ''; let pages = 0;
  do {
    const page = context.listLogs({ viewer: 'boss', limit: 500, cursor });
    check(page.total === 1002, 'total exposed on each page');
    page.logs.forEach(item => { check(!ids.has(item.log_id), 'no duplicate page items'); ids.add(item.log_id); });
    cursor = page.next_cursor; pages++;
  } while (cursor && pages < 5);
  check(ids.size === 1002 && pages === 3, 'history beyond 500 fully readable');

  const prep = { id: 'prep-1', type: 'lessonprep', title: 'QA course', details: { targetCourse: 'QA' }, prepEvidence: [{ url: 'https://drive.google.com/file/d/qa/view' }] };
  const saved = context.saveCoursePrep({ nickname: 'QA', prep, request_id: 'prep-req' });
  check(saved.ok, 'prep save');
  check(context.saveCoursePrep({ nickname: 'QA', prep, request_id: 'prep-req' }).duplicate, 'prep retries are idempotent');
  check(context.saveCoursePrep({ nickname: 'QA', prep }).code === 'RECORD_CONFLICT', 'prep rejects stale update');
  check(context.deleteCoursePrep({ operator: 'QA', prep_id: prep.id, confirmation_name: 'QA' }).ok, 'soft delete');
  check(context.listCoursePreps({ viewer: 'QA' }).deletedIds.includes(prep.id), 'deletion propagated');
  check(context.saveCoursePrep({ nickname: 'QA', prep }).code === 'RECORD_DELETED', 'deleted ID cannot resurrect');

  const state = { integration: {}, activities: [{ ...prep, teacher: 'QA', cloudSyncStatus: 'saved' }], submissions: [], contacts: [{ id: 'removed', teacher: 'QA', date: '2026-09-06' }], studentCases: [], lessonPlans: [], operationHistory: [], ui: { role: 'teacher' }, context: { teacher: 'QA' }, daily: { date: '2026-09-06', summary: {} } };
  const frontend = vm.createContext({ state, clone: copy, cloudLogId: (name, date) => `${name}-${date}`, dailyNeedsResubmit: () => false,
    cloudDraftInFlight: null, dailySubmitInFlight: false, dailyCloudConflict: null,
    hydrateCloudSnapshotAttachments: copy, normalizeContactRecord() {}, normalizeEvidenceRecord() {}, reconcileLegacyPlans() {},
    sameReviewIdentity: (a, b) => a === b,
    window: { API: { listCoursePreps() {} } }, API: { listCoursePreps: async () => ({ ok: true, complete: true, records: [], deletedIds: [prep.id] }) },
  });
  vm.runInContext(block(app, '  function importCloudSnapshot(', '  function importCloudCoursePrep(') + block(app, '  async function syncCoursePrepsFromCloud(', '  async function refreshCoursePrepCloudData('), frontend);
  await frontend.syncCoursePrepsFromCloud({ role: 'teacher', nickname: 'QA' });
  check(state.activities.length === 0, 'deleted cloud prep disappears from synced device');
  const remote = { schema: 'anqin-v2', savedAt: '2026-09-06T02:00:00Z', submission: { id: 'day1', teacher: 'QA', date: state.daily.date, contactSnapshots: [], activitySnapshots: [] } };
  frontend.importCloudSnapshot(remote, [], 'revision-a');
  check(state.contacts.length === 0, 'removed contacts do not survive authoritative snapshot');
  state.integration.dailyDraftSyncPending = true;
  state.contacts.push({ id: 'unsaved', teacher: 'QA', date: state.daily.date });
  frontend.importCloudSnapshot({ ...remote, savedAt: '2026-09-06T03:00:00Z' }, [], 'revision-b');
  check(state.contacts.length === 1 && frontend.dailyCloudConflict, 'local unsaved work retained on conflict');

  const parser = vm.createContext({ todayIso: () => '2026-09-06' });
  vm.runInContext(block(read('review/admin-marketing-v1/app.js'), '  function trialDateFromMessage(', '  function parseTrialMessage('), parser);
  check(parser.trialDateFromMessage('今天幫孩子報名，預約日期：2026/09/10') === '2026-09-10', 'explicit trial date wins');
  check(parser.trialDateFromMessage('報名日：2026/09/01\n預約日期：2026/09/10') === '2026-09-10', 'labeled date wins over first date');
  check(parser.trialDateFromMessage('預約日期：2026/02/30') === '', 'impossible date rejected');
  vm.runInContext(read('apps-script/adminmarketing.gs'), context);
  check(context.validateAdminMarketingRecord_('trial', { id: 'trial', date: '2026-09-10', studentName: 'QA', course: 'QA', teacher: 'QA', owner: 'QA', contactRef: 'synthetic', status: 'converted', firstEnrollment: false, enrollmentDate: '2026-09-06', paymentDate: '2026-09-06', enrollmentCourse: 'QA' }).paymentDate === '2026-09-06', 'payment before trial accepted');

  const files = new Map(); let deny = true; let fileNo = 0;
  const folder = { getFilesByName: name => { const list = [...files.values()].filter(file => file.getName() === name); return { hasNext: () => list.length > 0, next: () => list.shift() }; }, createFile: blob => {
    const viewers = new Set(); const id = `file-${++fileNo}`;
    const file = { getId: () => id, getName: () => blob.getName(), isTrashed: () => false, getSize: () => blob.bytes.length, getOwner: () => ({ getEmail: () => 'owner@example.invalid' }), getSharingAccess: () => 'private', getAccess: email => viewers.has(email) ? 'view' : 'none', getEditors: () => [], getViewers: () => [], setSharing() {}, setShareableByEditors() {}, addViewer(email) { if (deny) throw new Error('denied'); viewers.add(email); }, bytes: blob.bytes };
    files.set(id, file); return file;
  } };
  const upload = vm.createContext({ ...context,
    Utilities: { getUuid: crypto.randomUUID, base64Decode: value => Buffer.from(value, 'base64'), newBlob: (bytes, type, name) => ({ bytes, getContentType: () => type, getName: () => name, setName(value) { name = value; } }), computeDigest: (_, value) => crypto.createHash('sha256').update(value).digest(), base64EncodeWebSafe: value => Buffer.from(value).toString('base64url'), DigestAlgorithm: { SHA_256: 'sha256' }, Charset: { UTF_8: 'utf8' } },
    DriveApp: { Access: { PRIVATE: 'private' }, Permission: { VIEW: 'view', EDIT: 'edit', OWNER: 'owner' } },
    kpiDriveViewerUsers_: () => [{ nickname: 'QA', email: 'qa@example.invalid' }],
  });
  vm.runInContext(read('apps-script/logs.gs') + block(read('apps-script/archivefiles.gs'), 'function secureKpiDriveItem_(', 'function listArchivedKpiFiles('), upload);
  upload.getMaterialRootFolder_ = () => folder; upload.getOrCreateChildFolder_ = () => folder; upload.secureKpiReportPath_ = () => {};
  const filePayload = { nickname: 'QA', date: '2026-09-06', mimeType: 'application/pdf', fileName: 'QA.pdf', base64: Buffer.from('%PDF original bytes').toString('base64') };
  assert.throws(() => upload.uploadFile(filePayload), error => error.code === 'FILE_ACCESS_PENDING'); assertions++;
  deny = false;
  check(upload.uploadFile(filePayload).ok && files.size === 1, 'permission retry reuses file rather than duplicating');
  check([...files.values()][0].bytes.equals(Buffer.from('%PDF original bytes')), 'document bytes preserved');
  console.log(`PASS ${assertions} reliability assertions (isolated services, not production-account verification)`);
}
main().catch(error => { console.error(error); process.exitCode = 1; });
