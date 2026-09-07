const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../review/anqin-v2/app.js'), 'utf8');
const block = (from, to) => source.slice(source.indexOf(from), source.indexOf(to, source.indexOf(from)));
let items = [];
let uploads = 0;
const runtime = vm.createContext({
  cloudTeacherNickname: () => 'QA',
  todayActivities: () => [{ id: 'activity', type: 'tutoring', evidence: [{ id: 'evidence', attachments: items }] }],
  evidenceAttachments: evidence => evidence.attachments,
  materialCloudUrl: item => item.cloudUrl || (item.cloudFileId ? `https://drive.google.com/file/d/${item.cloudFileId}/view` : ''),
  activityKpiNumber: () => 1,
  state: { daily: { date: '2026-09-07' }, context: { teacher: 'QA' } },
  integrationRuntime: {}, updateSaveIndicator() {}, applyCloudPreview() {},
  OPERATION_CHECKS: {},
  API: { uploadPhoto: async () => { uploads++; return { ok: true, url: 'https://drive.google.com/file/d/qa-file/view', fileId: 'qa-file' }; } },
});
vm.runInContext(block('  function dataUrlPayload(', '  function joinActivityText('), runtime);
(async () => {
  items = [{ fileName: 'old.jpg', legacyMissing: true, mimeType: 'image/jpeg' }];
  assert.equal((await runtime.uploadFormalEvidence()).length, 0);
  assert.equal(uploads, 0, 'historical missing originals are not repeatedly uploaded');
  items = [{ fileName: 'new.jpg', mimeType: 'image/jpeg' }];
  await assert.rejects(runtime.uploadFormalEvidence(), /new.jpg.*尚未上傳/);
  items = [{ fileName: 'retry.jpg', legacyMissing: true, mimeType: 'image/jpeg', dataUrl: 'data:image/jpeg;base64,YQ==' }];
  assert.equal((await runtime.uploadFormalEvidence()).length, 1);
  assert.equal(uploads, 1, 'reselected original must be uploaded even after a historical missing marker');
  items = [{ fileName: 'ready.jpg', mimeType: 'image/jpeg', cloudFileId: 'existing-file' }];
  assert.equal((await runtime.uploadFormalEvidence())[0].fileId, 'existing-file');
  assert.equal(uploads, 1, 'existing cloud files must not be uploaded again');
  console.log('PASS historical missing-file exemption, new-file failure, retry, and cloud-file reuse');
})().catch(error => { console.error(error); process.exitCode = 1; });
