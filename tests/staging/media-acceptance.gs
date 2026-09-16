/** Editor-only real Google media acceptance; synthetic users and files only. */
function qaStageMedia() {
  qaStageGuard_();
  if (String(Session.getActiveUser().getEmail() || '').toLowerCase() !== PropertiesService.getScriptProperties().getProperty('QA_STAGE_OWNER')) throw new Error('QA owner required');
  const endpoint = 'https://script.google.com/macros/s/AKfycbzHFsvw0PPPvT6_35b91dR-qLuWnlJTMuEe9H8veBgTr2AGNynAqb_vyUHLAgVDf6M6/exec';
  const runId = 'QA-MEDIA-' + Utilities.getUuid();
  const started = Date.now();
  const checks = [];
  const teacher = findUserByNickname('QA老師16');
  const talent = findUserByNickname('QA才藝');
  const staff = findUserByNickname('QA行政');
  const artifacts = [];
  function require(value, message) { if (!value) throw new Error(message); }
  function check(name, callback) {
    const start = Date.now();
    try { checks.push({ name: name, ok: true, detail: callback(), ms: Date.now() - start }); }
    catch (error) { checks.push({ name: name, ok: false, error: String(error.message || error), ms: Date.now() - start }); }
    console.log(JSON.stringify({ run_id: runId, check: checks[checks.length - 1] }));
  }
  function request(user, action, data) {
    const body = Object.assign({ request_id: runId + '-' + Utilities.getUuid() }, data, { action: action, session_token: issueSessionToken_(user) });
    const response = UrlFetchApp.fetch(endpoint, { method: 'post', contentType: 'text/plain', payload: JSON.stringify(body), muteHttpExceptions: true, followRedirects: true });
    let result;
    try { result = JSON.parse(response.getContentText()); } catch (error) { throw new Error(action + ' non-JSON HTTP ' + response.getResponseCode()); }
    require(result.ok, action + ': ' + (result.code || '') + ' ' + (result.error || 'failed'));
    return result;
  }
  const uploads = [];
  check('jpeg-png-upload-replay-original-bytes-preview', function () {
    QA_STAGE_MEDIA_FIXTURES_.forEach(function (fixture, index) {
      const payload = { nickname: teacher.nickname, date: todayStr(), kpi: runId + '-' + index, mimeType: fixture.mimeType, base64: fixture.base64 };
      const first = request(teacher, 'uploadPhoto', payload);
      artifacts.push({ kind: 'photo', fileId: first.fileId, fixture: fixture.fileName });
      uploads.push(Object.assign({}, first, { type: 'photo', kpi: 1, fileName: fixture.fileName, mimeType: fixture.mimeType, note: runId + ' 原圖 ' + (index + 1) }));
      const replay = request(teacher, 'uploadPhoto', payload);
      require(first.fileId === replay.fileId, 'Photo retry created a duplicate file');
      const file = DriveApp.getFileById(first.fileId);
      require(file.getSharingAccess() === DriveApp.Access.PRIVATE, 'Photo publicly shared');
      require(Utilities.base64Encode(file.getBlob().getBytes()) === fixture.base64, 'Original bytes changed');
      const preview = request(teacher, 'getAttachmentPreviews', { file_ids: [first.fileId] });
      require(preview.previews.length === 1 && !preview.errors.length, 'Photo preview unavailable');
      require(/^data:image\//.test(preview.previews[0].dataUrl || ''), 'Preview is not an image');
    });
    return { photos: uploads.length, bytes_matched: true, duplicate_upload_reused: true, private_files: true, note: 'All synthetic users share owner email; not independent Drive ACL acceptance.' };
  });
  check('daily-save-reopen-update-and-evidence', function () {
    require(uploads.length === 2, 'Photos required');
    const current = request(teacher, 'getLog', { nickname: teacher.nickname, date: todayStr() }).log;
    const text = runId + '\n繁體中文 & <原文>  保留空白\n第二行：確認孩子成果。';
    const payload = { nickname: teacher.nickname, date: todayStr(), base_revision: current && current.record_revision || '', submitted: true, reflection: text, kpi1_data: { outcome: text }, attachments: uploads };
    const saved = request(teacher, 'saveLog', payload);
    const reopened = request(teacher, 'getLog', { nickname: teacher.nickname, date: todayStr() }).log;
    require(reopened.reflection === text && reopened.attachments.length === 2, 'Saved text or attachment count mismatch');
    const updated = request(teacher, 'saveLog', Object.assign({}, payload, { base_revision: saved.revision, reflection: text + '\n已確認' }));
    const final = request(teacher, 'getLog', { nickname: teacher.nickname, date: todayStr() }).log;
    require(final.record_revision === updated.revision && final.reflection === text + '\n已確認', 'Update did not persist');
    require(final.evidence_state === 'ready', 'Evidence indexing incomplete');
    return { log_id: saved.log_id, photos: final.attachments.length, text_exact: true, update_readback: true, evidence_state: final.evidence_state };
  });
  check('anqin-course-material-save-and-readback', function () {
    require(uploads.length === 2, 'Photos required');
    const prep = { id: runId + '-ANQIN', type: 'lessonprep', title: runId + ' 備課測試', date: todayStr(), details: { targetCourse: 'SEL 聊心室' }, prepEvidence: uploads };
    request(teacher, 'saveCoursePrep', { nickname: teacher.nickname, prep: prep });
    const found = request(teacher, 'listCoursePreps', { viewer: teacher.nickname, nickname: teacher.nickname }).records.find(function (r) { return r.prepId === prep.id; });
    require(found && found.prep.prepEvidence.length === 2 && found.prep.title === prep.title, 'Course prep readback mismatch');
    return { prep_id: prep.id, attachment_count: found.prep.prepEvidence.length };
  });
  check('talent-document-upload-and-prep-readback', function () {
    const text = runId + '\n教材內容：中文字、空格 & < >\n12345';
    const payload = { nickname: talent.nickname, date: todayStr(), category: runId, fileName: runId + '.txt', mimeType: 'text/plain', base64: Utilities.base64Encode(text, Utilities.Charset.UTF_8) };
    const file = request(talent, 'uploadFile', payload);
    artifacts.push({ kind: 'material', fileId: file.fileId });
    require(DriveApp.getFileById(file.fileId).getBlob().getDataAsString('UTF-8') === text, 'Document content changed');
    const prep = { id: runId + '-TALENT', courseType: '系統驗收', courseName: runId, date: todayStr(), materials: [{ fileId: file.fileId, url: file.url, fileName: payload.fileName, mimeType: payload.mimeType }] };
    request(talent, 'saveTalentPrep', { nickname: talent.nickname, prep: prep });
    const found = request(talent, 'getTalentWorkspaceData', {}).preps.find(function (p) { return p.id === prep.id; });
    require(found && found.materials.length === 1, 'Talent prep readback mismatch');
    return { prep_id: prep.id, original_content_exact: true };
  });
  check('admin-edit-complete-and-reopen', function () {
    const record = { id: runId + '-ADMIN', date: todayStr(), messages: { parentChecked: true, officialLineChecked: true, groupChecked: true }, items: [{ id: runId + '-item', category: 'admin', title: runId, completedToday: '家長已回覆；確認下次課程。', progress: 50, status: 'in_progress', remaining: '完成確認', dueDate: todayStr(), evidence: [] }] };
    const first = request(staff, 'saveAdminMarketingRecord', { nickname: staff.nickname, record_type: 'daily', record: record });
    const changed = JSON.parse(JSON.stringify(first.record));
    changed.items[0].completedToday = '已完成，確認最新狀態。';
    changed.items[0].status = 'completed'; changed.items[0].progress = 100; changed.items[0].remaining = ''; changed.items[0].actualDate = todayStr();
    request(staff, 'saveAdminMarketingRecord', { nickname: staff.nickname, record_type: 'daily', record: changed });
    const found = request(staff, 'getAdminMarketingWorkspaceData', {}).records.find(function (r) { return r.id === record.id; });
    require(found && found.items[0].status === 'completed' && found.items[0].completedToday === changed.items[0].completedToday, 'Admin completion did not persist');
    return { id: record.id, completed_and_readback: true };
  });
  check('google-generated-pdf-file', function () {
    require(checks.some(function (c) { return c.name === 'daily-save-reopen-update-and-evidence' && c.ok; }), 'Saved log required');
    SpreadsheetApp.flush();
    const pdf = generatePersonKpiPdf_(teacher.nickname, todayStr());
    require(pdf && pdf.url, 'PDF generation failed');
    const fileId = pdf.url.match(/\/d\/([^/]+)/)[1];
    const file = DriveApp.getFileById(fileId);
    require(file.getMimeType() === 'application/pdf' && file.getSize() > 10000, 'Invalid PDF');
    artifacts.push({ kind: 'pdf', fileId: fileId, url: pdf.url });
    return { file_id: fileId, url: pdf.url, bytes: file.getSize(), rendered_verified: false, notification_sent: false };
  });
  const report = { run_id: runId, started_at: new Date(started).toISOString(), ok: checks.every(function (c) { return c.ok; }), elapsed_ms: Date.now() - started, checks: checks, artifacts: artifacts, scope: 'Real Google API media, text and editor PDF generation. Not browser UI, real OAuth, independent account ACL, phone, load or rendered PDF acceptance.' };
  getSS().getSheetByName('QAResults').appendRow([report.started_at, runId, JSON.stringify(report)]);
  console.log(JSON.stringify(report));
  return report;
}
