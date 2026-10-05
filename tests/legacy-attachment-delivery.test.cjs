const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../review/anqin-v2/app.js'), 'utf8');
const block = (from, to) => {
  const start = source.indexOf(from);
  const end = source.indexOf(to, start);
  assert.ok(start >= 0 && end > start, `source section: ${from}`);
  return source.slice(start, end);
};
let items = [];
let uploads = 0;
let evidence;
const runtime = vm.createContext({
  cloudTeacherNickname: () => 'QA',
  driveFileId: url => String(url || '').match(/\/d\/([^/]+)/)?.[1] || '',
  materialCloudUrl: item => item.cloudUrl || (item.cloudFileId ? `https://drive.google.com/file/d/${item.cloudFileId}/view` : ''),
  activityKpiNumber: () => 1,
  state: {
    daily: { date: '2026-09-07' }, context: { teacher: 'QA' }, operationHistory: [],
    get activities() {
      evidence = { id: 'evidence', attachments: items };
      return [{ id: 'activity', type: 'tutoring', teacher: 'QA', date: '2026-09-07', evidence: [evidence] }];
    },
  },
  integrationRuntime: {}, updateSaveIndicator() {}, applyCloudPreview() {}, persist() {},
  OPERATION_CHECKS: {},
  writeLocalMediaRecord: async () => assert.fail('legacy files without local-media keys must not write recovery storage'),
  API: { uploadPhoto: async () => { uploads++; return { ok: true, url: 'https://drive.google.com/file/d/qa-file/view', fileId: 'qa-file' }; } },
});
vm.runInContext([
  block('  function normalizeEvidenceRecord(', '  function normalizePrepTitle('),
  block('  function evidenceAttachments(', '  function attachmentCloudFileId('),
  block('  function syncEvidencePrimaryFields(', '  function renderEvidenceAttachmentList('),
  block('  async function confirmLocalAttachmentUploaded(', '  function walkLocalAttachments('),
  block('  function dataUrlPayload(', '  function joinActivityText('),
].join('\n'), runtime);
runtime.uploadCompressedPhotos = async entries => Promise.all(entries.map(async entry => {
  const payload = runtime.dataUrlPayload(entry.dataUrl);
  if (!payload) throw new Error(`${entry.fileName || '附件'}尚未上傳，請重新選擇檔案；文字草稿仍保留`);
  const result = await runtime.API.uploadPhoto({ base64: payload.base64, mimeType: payload.mimeType });
  return { ok: result.ok, clientId: entry.clientId, cloudUrl: result.url, cloudFileId: result.fileId };
}));
(async () => {
  items = [{ fileName: 'old.jpg', legacyMissing: true, mimeType: 'image/jpeg' }];
  assert.equal((await runtime.uploadFormalEvidence()).length, 0);
  assert.equal(uploads, 0, 'historical missing originals are not repeatedly uploaded');
  items = [{ fileName: 'new.jpg', mimeType: 'image/jpeg' }];
  await assert.rejects(runtime.uploadFormalEvidence(), /new.jpg.*尚未上傳/);
  items = [{ fileName: 'retry.jpg', legacyMissing: true, mimeType: 'image/jpeg', dataUrl: 'data:image/jpeg;base64,YQ==' }];
  assert.equal((await runtime.uploadFormalEvidence()).length, 1);
  assert.equal(uploads, 1, 'reselected original must be uploaded even after a historical missing marker');
  assert.equal(evidence.attachments[0].legacyMissing, false, 'available original clears the historical missing marker');
  assert.equal(evidence.dataUrl, '', 'primary evidence must release uploaded inline bytes');
  assert.equal(evidence.cloudFileId, 'qa-file', 'primary evidence retains the confirmed attachment identity');
  assert.equal(evidence.placeholder, false, 'a confirmed upload must remain usable after primary-field normalization');
  items = [{ fileName: 'ready.jpg', mimeType: 'image/jpeg', cloudFileId: 'existing-file' }];
  assert.equal((await runtime.uploadFormalEvidence())[0].fileId, 'existing-file');
  assert.equal(uploads, 1, 'existing cloud files must not be uploaded again');
  console.log('PASS historical missing-file exemption, new-file failure, retry, and cloud-file reuse');
})().catch(error => { console.error(error); process.exitCode = 1; });
