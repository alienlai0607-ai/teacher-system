const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const app = fs.readFileSync(path.resolve(__dirname, '../review/anqin-v2/app.js'), 'utf8');
const section = (from, to) => {
  const start = app.indexOf(from); const end = app.indexOf(to, start);
  assert.ok(start >= 0 && end > start, from); return app.slice(start, end);
};
const copy = value => JSON.parse(JSON.stringify(value));
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
const settle = async () => { for (let i = 0; i < 80; i++) await Promise.resolve(); };
function fakeIndexedDB(options = {}) {
  const databases = new Map();
  return { databases, open(name) {
    const request = {};
    if (options.hangOpen) return request;
    queueMicrotask(() => {
      if (options.rejectOpen) { request.error = new Error('storage denied'); request.onerror(); return; }
      if (!databases.has(name)) databases.set(name, new Map());
      const records = databases.get(name);
      request.result = {
        objectStoreNames: { contains: () => true }, close() {},
        transaction(_name, mode) {
          const transaction = { abort() { transaction.error = new Error('aborted'); transaction.onabort?.(); } };
          transaction.objectStore = () => ({
            put(record) { queueMicrotask(() => {
              if (options.abortWrites) { transaction.abort(); return; }
              records.set(record.key, copy(record)); transaction.oncomplete?.();
            }); },
            get(key) { const read = {}; if (!options.hangRead) queueMicrotask(() => { read.result = copy(records.get(key) || null); read.onsuccess?.(); }); return read; },
          });
          return transaction;
        },
      };
      request.onsuccess();
    });
    return request;
  } };
}
function fixture({ indexedDB = fakeIndexedDB(), scope = 'teacher-A', storage = new Map(), api = {} } = {}) {
  let sequence = 0;
  const state = { ui: {}, integration: { cloudSyncEnabled: true }, context: { teacher: 'QA' }, daily: { date: '2026-09-16', summary: {} }, activities: [], submissions: [], studentCases: [], contacts: [], operations: { date: '2026-09-16', dutyOwner: 'QA', evidenceByCheck: {} } };
  const context = vm.createContext({
    state, openDraftStore: {}, evidenceDraft: null, activityDraft: null, planDraft: null,
    stateStorageWriteProtected: false,
    localMediaDatabase: null, localMediaRestoreInFlight: null, LOCAL_MEDIA_DB: scope,
    currentDrawerDraftKey: 'evidence:QA:today:new', DRAFT_KEY: scope + ':drafts', STORAGE_KEY: scope + ':state',
    runtimeHealth: {}, integrationRuntime: {}, MAX_DOCUMENT_FILE_BYTES: 25 * 1024 * 1024, MAX_IMAGE_SOURCE_BYTES: 25 * 1024 * 1024, MAX_EVIDENCE_FILES: 8,
    window: { indexedDB, setTimeout: (fn, ms) => setTimeout(fn, ms === 5000 ? 20 : ms), clearTimeout, API: { saveCoursePrep() {}, uploadPhoto() {}, uploadFile() {} } },
    API: { uploadFile: async () => ({ ok: true, url: 'https://example.invalid/document', fileId: 'document-id' }), uploadPhoto: async () => ({ ok: true, url: 'https://example.invalid/photo', fileId: 'photo-id' }), ...api },
    localStorage: { setItem: (key, value) => storage.set(key, value), getItem: key => storage.get(key), removeItem: key => storage.delete(key) },
    sessionStorage: { setItem() {}, removeItem() {} },
    uid: prefix => prefix + '-' + (++sequence), materialCloudUrl: item => /^https:\/\//.test(item?.cloudUrl || item?.url || '') ? item.cloudUrl || item.url : '',
    driveFileId: () => '', clone: copy, $: () => null,
    formatFileSize: size => String(size), dataUrlByteLength: value => Buffer.from(String(value).split(',')[1] || '', 'base64').length,
    readFileAsDataUrl: async file => 'data:' + file.type + ';base64,' + file.bytes.toString('base64'),
    fileToPreview: async file => 'data:image/jpeg;base64,' + file.bytes.toString('base64'),
    hashFile: async file => crypto.createHash('sha256').update(file.bytes).digest('hex'),
    cloudTeacherNickname: teacher => teacher, ensureCloudTeacherIdentity: async () => ({ ok: true }),
    activityKpiNumber: () => 5, OPERATION_CHECKS: { classroom: { label: '教室' } },
    applyCloudPreview() {}, syncEvidenceDraftFromForm() {}, updateSaveIndicator() {}, refreshSystemStatusNotice() {},
    refreshEvidenceAttachmentUI() { if (context.evidenceDraft) context.normalizeEvidenceRecord(context.evidenceDraft); },
    toast(message) { context.lastToast = message; },
    persist() { storage.set(scope + ':state', context.serializeStateForStorage(state, true)); return true; },
    markDailyNeedsResubmit() {}, scheduleDailyCloudDraftSync() {}, updateOperationProofSummary() {}, hydrateIcons() {}, scheduleCloudPreviewHydration() {},
    captureCoursePrepFormDraft() {}, capturePrepEvidenceRows() {}, inferPrepCategory: () => 'worksheet',
    planMaterialCategory: () => 'worksheet', capturePlanForm() {}, refreshPlanEditor() {},
  });
  const blocks = [
    section('  function normalizeEvidenceRecord(', '  function normalizePrepTitle('),
    section('  function embeddedMediaCharacters(', '  function rewriteRecoveredStartupState('),
    section('  function writeOpenDraftStore()', '  function serializeFormControls('),
    section('  function evidenceAttachments(', '  function attachmentCloudFileId('),
    section('  function syncEvidencePrimaryFields(', '  function renderEvidenceAttachmentList('),
    section('  function dataUrlPayload(', '  async function uploadFormalEvidence('),
    section('  async function uploadFormalEvidence(', '  function joinActivityText('),
    section('  async function handleEvidenceFile(', '  function placeEvidencePin('),
    section('  async function uploadCompressedPhoto(', '  function refreshEvidenceAttachmentUI('),
    section('  async function handleOperationPhoto(', '  async function handleReviewDecision('),
    section('  async function prepareLocalMaterial(', '  function formatFileSize('),
    section('  async function handlePrepFiles(', '  async function hashFile('),
    section('  function preserveAttachmentMedia(', '  function preserveActivityMedia('),
  ];
  vm.runInContext(blocks.join('\n'), context);
  return { context, storage, indexedDB, state };
}

function attachDailySubmit(fixture, result) {
  const { context, state } = fixture;
  const writes = [];
  Object.assign(context, {
    dailyCloudConflict: null, dailySubmitInFlight: true, cloudDraftTimer: null, cloudDraftInFlight: null,
    dailyKpiOptional: () => false, hasDailyRecords: () => true, dailyCompletion: () => 100,
    createDailySubmissionRecord: () => ({ id: 'submission', date: state.daily.date, teacher: state.context.teacher, status: 'pending', submittedAt: '2026-09-16T12:00:00Z', activitySnapshots: copy(state.activities) }),
    buildLegacySubmissionPayload: (submission, attachments) => ({ nickname: submission.teacher, date: submission.date, submitted: true, submission: copy(submission), attachments: copy(attachments) }),
    renderApp() {}, showDailySubmissionReceipt() {}, finishDailyDelivery: async () => {}, showDailyCloudConflict() {},
    markDailyNeedsResubmit() { state.daily.status = 'draft'; state.daily.submittedAt = ''; },
  });
  context.window.API.saveLog = () => {};
  context.API.saveLog = async payload => { writes.push(copy(payload)); return result; };
  vm.runInContext(section('  function removeInlineMedia(', '  function buildCloudSnapshot(')
    + section('  function dailySubmissionContentSignature(', '  async function submitWeekly()'), context);
  return writes;
}
const file = (name, type, bytes) => ({ name, type, bytes, size: bytes.length });
let passed = 0;
async function test(name, run) { await run(); passed++; console.log('PASS ' + name); }
(async () => {
  await test('large PDF is persisted before network and restored byte-for-byte after a page closes', async () => {
    const network = deferred(); const requests = [];
    const bytes = Buffer.concat([Buffer.from('%PDF-1.7\n'), crypto.randomBytes(1024 * 1024)]);
    const first = fixture({ api: { uploadFile: payload => { requests.push(payload); return network.promise; } } });
    first.context.evidenceDraft = { id: 'evidence', activityId: 'activity', attachments: [] };
    const running = first.context.handleEvidenceFile({ files: [file('lesson.pdf', 'application/pdf', bytes)], value: 'selected' });
    await settle();
    assert.equal(requests.length, 1);
    const persisted = first.storage.get('teacher-A:drafts');
    assert.ok(persisted && persisted.length < 3000, 'large bytes stay outside localStorage');
    const reloaded = fixture({ storage: first.storage, indexedDB: first.indexedDB });
    reloaded.context.openDraftStore = JSON.parse(persisted);
    const recovered = await reloaded.context.restoreLocalAttachments();
    assert.equal(recovered.restored, 1, 'primary and attachment share one media key');
    const evidence = reloaded.context.openDraftStore['evidence:QA:today:new'].payload;
    assert.ok(Buffer.from(evidence.attachments[0].dataUrl.split(',')[1], 'base64').equals(bytes));
    assert.equal(evidence.dataUrl, evidence.attachments[0].dataUrl, 'primary metadata also recovers');
    reloaded.state.activities.push({ id: 'activity', teacher: 'QA', date: '2026-09-16', type: 'project', evidence: [evidence] });
    let retryPayload;
    reloaded.context.API.uploadFile = async payload => { retryPayload = payload; return { ok: true, url: 'https://example.invalid/document', fileId: 'document-id' }; };
    await reloaded.context.uploadFormalEvidence();
    assert.ok(Buffer.from(retryPayload.base64, 'base64').equals(bytes));
    network.resolve({ ok: true, url: 'https://example.invalid/document', fileId: 'document-id' });
    await running;
    assert.equal(first.context.evidenceDraft.attachments[0].cloudFileId, 'document-id', 'normalization cannot detach uploaded metadata');
    const cached = [...first.indexedDB.databases.get('teacher-A').values()][0];
    assert.equal(cached.dataUrl, '', 'confirmed upload releases large local bytes');
    assert.equal(cached.cloudFileId, 'document-id');
    const stale = fixture({ indexedDB: first.indexedDB });
    stale.context.openDraftStore = JSON.parse(persisted);
    await stale.context.restoreLocalAttachments();
    assert.equal(stale.context.openDraftStore['evidence:QA:today:new'].payload.attachments[0].cloudFileId, 'document-id', 'old draft references recover the forwarding record');
  });
  await test('one media key restores every matching state and open draft reference', async () => {
    const fixtureA = fixture(); const attachment = { dataUrl: 'data:image/jpeg;base64,cGhvdG8=', fileName: 'photo.jpg' };
    await fixtureA.context.preserveLocalAttachment(attachment);
    const reference = { ...attachment, dataUrl: '' };
    fixtureA.state.activities.push({ attachment: copy(reference) });
    fixtureA.context.openDraftStore.drawer = { payload: { attachments: [copy(reference)] } };
    await fixtureA.context.restoreLocalAttachments();
    assert.equal(fixtureA.state.activities[0].attachment.dataUrl, attachment.dataUrl);
    assert.equal(fixtureA.context.openDraftStore.drawer.payload.attachments[0].dataUrl, attachment.dataUrl);
  });
  await test('aborted storage never claims a local copy exists', async () => {
    const { context, indexedDB } = fixture({ indexedDB: fakeIndexedDB({ abortWrites: true }) });
    const attachment = { dataUrl: 'data:application/pdf;base64,JVBERg==', fileName: 'a.pdf' };
    await assert.rejects(context.preserveLocalAttachment(attachment), /aborted/);
    assert.equal(attachment.localMediaSaved, undefined);
    assert.equal(indexedDB.databases.get('teacher-A').size, 0);
  });
  await test('another account cannot load media through a copied media key', async () => {
    const shared = fakeIndexedDB(); const a = fixture({ indexedDB: shared });
    const attachment = { dataUrl: 'data:image/jpeg;base64,c2VjcmV0', fileName: 'a.jpg' };
    await a.context.preserveLocalAttachment(attachment);
    const b = fixture({ indexedDB: shared, scope: 'teacher-B' });
    b.state.activities.push({ ...attachment, dataUrl: '' });
    const result = await b.context.restoreLocalAttachments();
    assert.equal(result.missing, 1);
    assert.equal(b.state.activities[0].dataUrl, '');
    assert.equal(b.state.activities[0].localMediaSaved, false);
  });
  await test('blocked browser storage has a finite opening deadline', async () => {
    const { context } = fixture({ indexedDB: fakeIndexedDB({ hangOpen: true }) });
    const started = Date.now();
    await assert.rejects(context.preserveLocalAttachment({ dataUrl: 'data:image/jpeg;base64,cA==' }), /逾時/);
    assert.ok(Date.now() - started < 1000);
  });
  await test('unresponsive stored-file reads finish without trapping page startup', async () => {
    const options = {}; const f = fixture({ indexedDB: fakeIndexedDB(options) });
    const attachment = { dataUrl: 'data:image/jpeg;base64,cGhvdG8=', fileName: 'a.jpg' };
    await f.context.preserveLocalAttachment(attachment);
    f.state.activities.push({ ...attachment, dataUrl: '' });
    options.hangRead = true;
    const started = Date.now();
    const result = await f.context.restoreLocalAttachments();
    assert.equal(result.missing, 1);
    assert.ok(Date.now() - started < 1000);
  });
  await test('cleanup failure retains the original local bytes', async () => {
    const options = {}; const f = fixture({ indexedDB: fakeIndexedDB(options) });
    const attachment = { dataUrl: 'data:application/pdf;base64,JVBERg==', fileName: 'a.pdf' };
    await f.context.preserveLocalAttachment(attachment);
    options.abortWrites = true;
    attachment.cloudUrl = 'https://example.invalid/a.pdf';
    await f.context.confirmLocalAttachmentUploaded(attachment);
    assert.equal(f.indexedDB.databases.get('teacher-A').get(attachment.localMediaKey).dataUrl, attachment.dataUrl);
  });
  await test('cloud import keeps recovery keys before asynchronous restoration completes', async () => {
    const { context } = fixture();
    const remote = { id: 'same', fileName: 'a.jpg' };
    context.preserveAttachmentMedia({ id: 'same', fileName: 'a.jpg', localMediaKey: 'pending-key', localMediaSaved: true }, remote);
    assert.equal(remote.localMediaKey, 'pending-key');
    const evidence = { attachments: [remote] };
    context.normalizeEvidenceRecord(evidence);
    assert.equal(evidence.attachments[0].localMediaKey, 'pending-key');
    assert.equal(evidence.localMediaKey, 'pending-key');
  });
  await test('operation photo state is durable before waiting for upload', async () => {
    const network = deferred(); const first = fixture({ api: { uploadPhoto: () => network.promise } });
    const image = file('operation.jpg', 'image/jpeg', Buffer.from('operation-image'));
    const running = first.context.handleOperationPhoto({ files: [image], value: 'selected', dataset: { checkKey: 'classroom' }, closest: () => null });
    await settle();
    const savedState = JSON.parse(first.storage.get('teacher-A:state'));
    assert.ok(savedState.operations.evidenceByCheck.classroom.localMediaKey);
    const reloaded = fixture({ indexedDB: first.indexedDB });
    Object.assign(reloaded.state, savedState);
    await reloaded.context.restoreLocalAttachments();
    assert.equal(reloaded.state.operations.evidenceByCheck.classroom.dataUrl, 'data:image/jpeg;base64,' + image.bytes.toString('base64'));
    network.resolve({ ok: true, url: 'https://example.invalid/photo', fileId: 'photo-id' });
    await running;
  });
  for (const kind of ['prep', 'plan']) await test(`${kind} documents survive a failed upload and save retries original bytes`, async () => {
    const bytes = Buffer.concat([Buffer.from('PK-docx-original'), crypto.randomBytes(8192)]);
    const f = fixture({ api: { uploadFile: async () => ({ ok: false, error: 'offline' }) } });
    const input = { files: [file('lesson.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', bytes)], value: 'selected' };
    if (kind === 'prep') { f.context.activityDraft = { prepEvidence: [] }; await f.context.handlePrepFiles(input); }
    else { f.context.planDraft = { materials: [] }; await f.context.handlePlanMaterials(input); }
    const draft = JSON.parse(f.storage.get('teacher-A:drafts'));
    const restored = fixture({ indexedDB: f.indexedDB });
    restored.context.openDraftStore = draft;
    await restored.context.restoreLocalAttachments();
    const payload = restored.context.openDraftStore['evidence:QA:today:new'].payload;
    const items = kind === 'prep' ? payload.prepEvidence : payload.materials;
    assert.equal(items.length, 1);
    const originalId = items[0].id;
    let uploaded;
    restored.context.API.uploadFile = async value => { uploaded = value; return { ok: true, url: 'https://example.invalid/docx', fileId: 'docx-id' }; };
    await restored.context.uploadRetainedMaterials(items, { date: '2026-09-16', teacher: 'QA' });
    assert.equal(items[0].id, originalId);
    assert.equal(uploaded.fileName, 'lesson.docx');
    assert.ok(Buffer.from(uploaded.base64, 'base64').equals(bytes));
    assert.equal(items[0].cloudFileId, 'docx-id');
  });
  await test('oversize prep files are rejected before hashing or reading their bytes', async () => {
    const f = fixture();
    f.context.activityDraft = { prepEvidence: [] };
    let reads = 0;
    f.context.hashFile = f.context.readFileAsDataUrl = f.context.fileToPreview = async () => { reads++; throw new Error('must not read oversized file'); };
    await f.context.handlePrepFiles({ files: [{ name: 'too-large.pdf', type: 'application/pdf', size: 25 * 1024 * 1024 + 1 }], value: 'selected' });
    assert.equal(reads, 0);
    assert.equal(f.context.activityDraft.prepEvidence.length, 0);
    assert.match(f.context.lastToast, /超過 25 MB/);
  });
  await test('confirmed forwarding recovery and reload normalization do not make an unchanged pending report a draft', async () => {
    const first = fixture();
    await first.context.handleOperationPhoto({ files: [file('operation.jpg', 'image/jpeg', Buffer.from('same-picture'))], value: 'selected', dataset: { checkKey: 'classroom' }, closest: () => null });
    const uploaded = first.state.operations.evidenceByCheck.classroom;
    assert.equal(uploaded.legacyMissing, undefined, 'newly selected operation proof has no reload-only default yet');
    const firstWrites = attachDailySubmit(first, { ok: false, uncertain: true });
    await first.context.submitDailyRequest();
    assert.ok(first.state.integration.pendingDailySubmission);
    const olderClientSignature = JSON.parse(first.state.integration.pendingDailySubmission.localSignature);
    Object.assign(olderClientSignature.operation.evidenceByCheck.classroom, {
      cloudUrl: uploaded.cloudUrl, cloudFileId: uploaded.cloudFileId, dataUrl: '', uploadStatus: 'uploaded', placeholder: false,
    });
    first.state.integration.pendingDailySubmission.localSignature = JSON.stringify(olderClientSignature);
    first.context.persist();
    const reloaded = fixture({ indexedDB: first.indexedDB });
    Object.assign(reloaded.state, JSON.parse(first.storage.get('teacher-A:state')));
    const restoredPhoto = reloaded.state.operations.evidenceByCheck.classroom;
    reloaded.context.normalizeOperationPhotoRecord(restoredPhoto);
    assert.equal(restoredPhoto.legacyMissing, false, 'actual reload normalization adds the default');
    // An older drawer clone has only the persistent key. Resolve the committed
    // forwarding record using the actual restore helper before replaying submit.
    reloaded.context.openDraftStore = { old: { payload: { ...copy(uploaded), cloudUrl: '', cloudFileId: '', dataUrl: '', localMediaSaved: true } } };
    await reloaded.context.restoreLocalAttachments();
    assert.equal(reloaded.context.openDraftStore.old.payload.cloudFileId, 'photo-id');
    const retryWrites = attachDailySubmit(reloaded, { ok: true, log_id: 'LOG', revision: 'r1' });
    await reloaded.context.submitDailyRequest();
    assert.deepEqual(retryWrites[0], firstWrites[0], 'pending request payload remains exact after restore');
    assert.equal(reloaded.state.daily.status, 'submitted', 'storage defaults alone are not teacher edits');
    assert.equal(reloaded.state.integration.pendingDailySubmission, undefined);
    const changed = fixture({ indexedDB: first.indexedDB });
    Object.assign(changed.state, JSON.parse(first.storage.get('teacher-A:state')));
    changed.state.operations.evidenceByCheck.classroom.fingerprint = 'different-file-chosen-by-teacher';
    attachDailySubmit(changed, { ok: true, log_id: 'LOG', revision: 'r1' });
    await changed.context.submitDailyRequest();
    assert.equal(changed.state.daily.status, 'draft', 'an actual replacement photo still requires resubmission');
  });
  console.log(`PASS ${passed} local media recovery scenarios (isolated browser storage and network, no cloud writes)`);
})().catch(error => { console.error(error); process.exitCode = 1; });
