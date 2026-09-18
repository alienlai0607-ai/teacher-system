const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { harness } = require('./system-logic-audit.test.cjs');
const copy = value => JSON.parse(JSON.stringify(value));
let passed = 0;

function setup(date = '2026-09-18') {
  const fixture = harness();
  fixture.c.todayStr = () => date;
  fixture.c.ensureHeaders(fixture.c.getSheet('DailyLogs'), ['department', 'role', 'kpi6_data', 'submitted_at', 'locked', 'is_makeup', 'last_request_id', 'record_revision']);
  fixture.sheet('Evidence', ['evidence_id', 'log_id', 'nickname', 'date', 'kpi_category', 'type', 'url', 'description', 'source_type', 'created_at']);
  return fixture;
}

function payload(date = '2026-09-18') {
  const screenshot = { id: 'course-shot', fileName: 'shared-course.png', mimeType: 'image/png',
    cloudFileId: 'synthetic-course-file', cloudUrl: 'https://drive.google.com/file/d/synthetic-course-file/view' };
  const courseRecord = { channels: ['group'], attachments: [screenshot], note: '系統驗收：今日課程分享' };
  return { nickname: 'north', date, submitted: true, request_id: 'synthetic-course-request', reflection: '原本日報內容',
    kpi6_data: { v2_snapshot: { schema: 'anqin-v2', version: 1,
      submission: { id: 'synthetic-submission', teacher: 'north', date, courseRecord },
      daily: { courseRecord: copy(courseRecord) } } },
    attachments: [{ type: 'photo', forType: 'v2-course-record', attachmentId: screenshot.id,
      fileId: screenshot.cloudFileId, url: screenshot.cloudUrl, mimeType: screenshot.mimeType,
      fileName: screenshot.fileName, kpi: 3, description: '課程紀錄分享截圖' }] };
}

function test(name, run) {
  run();
  passed++;
  console.log('PASS ' + name);
}

const invalid = [
  ['old client without snapshot cannot bypass the new weekday requirement', p => { delete p.kpi6_data; }],
  ['daily-only record cannot substitute for the submitted snapshot', p => { delete p.kpi6_data.v2_snapshot.submission.courseRecord; }],
  ['another date cannot supply today’s proof', p => { p.kpi6_data.v2_snapshot.submission.date = '2026-09-17'; }],
  ['at least one sharing channel is required', p => { p.kpi6_data.v2_snapshot.submission.courseRecord.channels = []; }],
  ['unknown sharing channel is rejected', p => { p.kpi6_data.v2_snapshot.submission.courseRecord.channels = ['email']; }],
  ['mixed valid and invalid sharing channels are rejected', p => { p.kpi6_data.v2_snapshot.submission.courseRecord.channels.push('email'); }],
  ['a channel string is not a confirmation array', p => { p.kpi6_data.v2_snapshot.submission.courseRecord.channels = 'group'; }],
  ['at least one screenshot is required', p => { p.kpi6_data.v2_snapshot.submission.courseRecord.attachments = []; }],
  ['a document is not a screenshot', p => { p.kpi6_data.v2_snapshot.submission.courseRecord.attachments[0].mimeType = 'application/pdf'; }],
  ['an incomplete image MIME is rejected', p => { p.kpi6_data.v2_snapshot.submission.courseRecord.attachments[0].mimeType = 'image/'; }],
  ['local bytes alone cannot claim uploaded proof', p => { const a = p.kpi6_data.v2_snapshot.submission.courseRecord.attachments[0]; delete a.cloudFileId; delete a.cloudUrl; a.dataUrl = 'data:image/png;base64,YQ=='; }],
  ['a historical missing-original marker cannot satisfy the new requirement', p => { p.kpi6_data.v2_snapshot.submission.courseRecord.attachments[0].legacyMissing = true; }],
  ['a placeholder cannot satisfy the new requirement', p => { p.kpi6_data.v2_snapshot.submission.courseRecord.attachments[0].placeholder = true; }],
  ['arbitrary external URLs cannot stand in for Drive proof', p => { p.kpi6_data.v2_snapshot.submission.courseRecord.attachments[0].cloudUrl = 'https://example.invalid/screenshot.png'; }],
  ['a Drive lookalike host is rejected', p => { p.kpi6_data.v2_snapshot.submission.courseRecord.attachments[0].cloudUrl = 'https://drive.google.com.example.invalid/file/d/synthetic-course-file/view'; }],
  ['mismatched file ID and Drive URL are rejected', p => { p.kpi6_data.v2_snapshot.submission.courseRecord.attachments[0].cloudFileId = 'different-file'; }],
  ['snapshot proof must also be present in the formal attachment manifest', p => { p.attachments = []; }],
  ['an unrelated activity image does not count as course-sharing proof', p => { p.attachments[0].forType = 'v2-tutoring'; }],
  ['the attachment identity must match the screenshot', p => { p.attachments[0].attachmentId = 'other-shot'; }],
  ['the manifest must refer to the same original file', p => { p.attachments[0].fileId = 'different-file'; p.attachments[0].url = 'https://drive.google.com/file/d/different-file/view'; }],
  ['the manifest must classify the screenshot as an image', p => { p.attachments[0].mimeType = 'application/pdf'; }],
  ['the manifest must contain a photo', p => { p.attachments[0].type = 'file'; }],
  ['the manifest needs the URL used by Evidence indexing', p => { delete p.attachments[0].url; }],
  ['the manifest needs the file ID used by PDF preview', p => { p.attachments[0].cloudFileId = p.attachments[0].fileId; delete p.attachments[0].fileId; }],
  ['a cloud ID alias cannot hide a different PDF original', p => { p.attachments[0].cloudFileId = p.attachments[0].fileId; p.attachments[0].fileId = 'different-file'; }],
  ['all selected screenshots must finish uploading', p => { p.kpi6_data.v2_snapshot.submission.courseRecord.attachments.push({ id: 'second', fileName: 'not-uploaded.png', mimeType: 'image/png' }); }],
];
invalid.forEach(([name, mutate]) => test(name, () => {
  const { c, request } = setup();
  const input = payload();
  mutate(input);
  const result = request('north', 'saveLog', input);
  assert.equal(result.ok, false);
  assert.equal(result.code, 'COURSE_RECORD_REQUIRED');
  assert.equal(c.sheetToObjects('DailyLogs').length, 0, 'Rejected proof cannot stamp or write a daily log');
  assert.equal(c.sheetToObjects('Evidence').length, 0);
}));

for (const channels of [['group'], ['parent_app'], ['group', 'parent_app']]) {
  test('save and read back sharing channels: ' + channels.join(','), () => {
    const { c, request } = setup();
    const input = payload();
    input.kpi6_data.v2_snapshot.submission.courseRecord.channels = channels;
    const saved = request('north', 'saveLog', input);
    assert.equal(saved.ok, true);
    const restored = request('north', 'getLog', { nickname: 'north', date: input.date });
    assert.deepEqual(copy(restored.log.kpi6_data.v2_snapshot.submission.courseRecord), input.kpi6_data.v2_snapshot.submission.courseRecord);
    assert.equal(restored.log.submitted_at.length > 0, true);
    assert.equal(c.sheetToObjects('Evidence')[0].source_type, 'v2-course-record');
    assert.equal(c.sheetToObjects('Evidence')[0].url, input.attachments[0].url);
    const replay = request('north', 'saveLog', input);
    assert.equal(replay.revision, saved.revision, 'Same request recovers its original receipt');
    assert.equal(c.sheetToObjects('DailyLogs').length, 1);
  });
}

test('JSON-encoded snapshot and manifest are supported', () => {
  const { request } = setup();
  const input = payload();
  input.kpi6_data = JSON.stringify(input.kpi6_data);
  input.attachments = JSON.stringify(input.attachments);
  assert.equal(request('north', 'saveLog', input).ok, true);
});

test('snapshot may recover the uploaded ID from its canonical Drive URL', () => {
  const { request } = setup();
  const input = payload();
  delete input.kpi6_data.v2_snapshot.submission.courseRecord.attachments[0].cloudFileId;
  assert.equal(request('north', 'saveLog', input).ok, true);
});

for (const date of ['2026-09-17', '2026-09-19', '2026-09-20']) {
  test('legacy or optional date remains compatible: ' + date, () => {
    const { request } = setup(date);
    const input = payload(date);
    delete input.kpi6_data;
    input.attachments = [];
    assert.equal(request('north', 'saveLog', input).ok, true);
  });
}

test('incomplete weekday drafts remain saveable', () => {
  const { request } = setup();
  const input = payload();
  input.submitted = false;
  input.kpi6_data.v2_snapshot.submission.courseRecord = { channels: [], attachments: [], note: '' };
  input.attachments = [];
  assert.equal(request('north', 'saveLog', input).ok, true);
  assert.equal(request('north', 'getLog', { nickname: 'north', date: input.date }).log.submitted_at, '');
});

test('new weekday remains required after the cutover weekend', () => {
  const { request } = setup('2026-09-21');
  const input = payload('2026-09-21');
  delete input.kpi6_data;
  assert.equal(request('north', 'saveLog', input).code, 'COURSE_RECORD_REQUIRED');
});

test('non-anqin legacy reports retain their existing contract', () => {
  const { c, request } = setup();
  c.appendRow('Users', { nickname: 'talent-qa', role: 'teacher', department: '才藝部門', status: 'active', email: 'talent-qa@example.invalid' });
  assert.equal(request('talent-qa', 'saveLog', { nickname: 'talent-qa', date: '2026-09-18', submitted: true, reflection: '才藝既有日報' }).ok, true);
});

test('a manager using the anqin snapshot receives the same validation', () => {
  const { request } = setup();
  const input = payload();
  input.nickname = 'northBoss';
  delete input.kpi6_data.v2_snapshot.submission.courseRecord;
  assert.equal(request('northBoss', 'saveLog', input).code, 'COURSE_RECORD_REQUIRED');
});

test('failed edited submission keeps the existing daily report and attachments', () => {
  const { c, request } = setup();
  const input = payload();
  const saved = request('north', 'saveLog', input);
  const before = copy(c.sheetToObjects('DailyLogs'));
  input.request_id = 'edited-course-request';
  input.base_revision = saved.revision;
  input.kpi6_data.v2_snapshot.submission.courseRecord.attachments = [];
  input.attachments = [];
  assert.equal(request('north', 'saveLog', input).code, 'COURSE_RECORD_REQUIRED');
  assert.deepEqual(copy(c.sheetToObjects('DailyLogs')), before);
  assert.equal(c.sheetToObjects('Evidence').length, 1);
});

test('already-durable legacy retry is acknowledged before applying new requirements', () => {
  const { c } = setup();
  c.appendRow('DailyLogs', { log_id: 'LOG-20260918-north', nickname: 'north', date: '2026-09-18',
    submitted_at: '2026-09-18T01:00:00Z', last_request_id: 'predeployment-request', record_revision: 'original-revision' });
  const result = c.saveLog({ nickname: 'north', date: '2026-09-18', submitted: true, request_id: 'predeployment-request' });
  assert.equal(result.ok, true);
  assert.equal(result.duplicate, true);
  assert.equal(result.revision, 'original-revision');
});

test('PDF displays course-sharing confirmation, escaped note, screenshot and original link', () => {
  const { c } = setup();
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../apps-script/pdfreport.gs'), 'utf8'), c);
  c.pdfPhotoUri_ = () => 'data:image/png;base64,YQ==';
  const input = payload();
  input.kpi6_data.v2_snapshot.submission.courseRecord.channels = ['group', 'parent_app'];
  input.kpi6_data.v2_snapshot.submission.courseRecord.note = '<script>synthetic</script>';
  const html = c.pdfLogCard_({ ...input, department: '北區教室', submitted_at: '2026-09-18T01:00:00Z' });
  assert.match(html, /今日課程照片已分享到群組、家長通/);
  assert.match(html, /1 張（見下方照片與成果附件）/);
  assert.match(html, /課程紀錄截圖/);
  assert.match(html, /&lt;script&gt;synthetic&lt;\/script&gt;/);
  assert.match(html, /https:\/\/drive\.google\.com\/file\/d\/synthetic-course-file\/view/);
  assert.match(html, /data:image\/png;base64,YQ==/);
  assert.doesNotMatch(html, /<script>/);
  const legacy = copy(input);
  delete legacy.kpi6_data;
  legacy.attachments = [];
  assert.doesNotMatch(c.pdfLogCard_(legacy), /課程紀錄|分享截圖/);
  input.kpi6_data.v2_snapshot.submission.courseRecord.channels = [];
  input.attachments = [];
  const draft = c.pdfLogCard_(input);
  assert.match(draft, /尚未確認分享管道/);
  assert.match(draft, /尚未附上已上傳的截圖/);
});

console.log(`${passed} backend course-record scenarios passed; no cloud or real data writes.`);
