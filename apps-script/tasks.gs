/**
 * 事項系統 + LINE 推播
 * Tasks schema: task_id, title, detail, assignee, department, due_date, status(open/done/deleted), created_by, created_at, updated_at, done_at
 * Users 需有 line_user_id 欄
 * Script Property: LINE_TOKEN（LINE Messaging API channel access token）
 */

function canCreateTask_(role) {
  return role === 'admin' || role === 'manager' || role === 'admin_staff';
}

/** Editor-only live API acceptance. Never overwrites daily logs or user profiles. */
function verifyReleaseLogicFromEditor() {
  const email = String(Session.getActiveUser().getEmail() || '').trim().toLowerCase();
  const admin = email ? findUserByEmail(email) : null;
  if (!admin || admin.role !== 'admin' || admin.status !== 'active') throw new Error('須由正式管理員執行驗收');
  const endpoint = 'https://script.google.com/macros/s/AKfycbyantQSORV8ulYF_LhHvhxOeRxvlwvUV40oFGRY_Hk9O6JxI5EaRXyFg_Vvi6C8K170UQ/exec';
  const runId = 'QA-RELEASE-' + Utilities.getUuid();
  PropertiesService.getScriptProperties().setProperty('KPI_RELEASE_QA_PENDING_' + runId, 'true');
  const checks = [];
  const cleanupRows = [];
  const started = Date.now();
  const users = sheetToObjects(SHEET_NAMES.USERS).filter(user => user.status === 'active');
  const teacher = users.find(user => user.role === 'teacher' && user.email && isAnqinUser(user));
  const talent = users.find(user => user.role === 'teacher' && user.email && userHasTalentWork_(user));
  const staff = users.find(user => user.email && adminMarketingAssignments_(user).indexOf('admin-marketing') >= 0);
  const other = users.find(user => user.role === 'teacher' && user.email && teacher && user.nickname !== teacher.nickname);
  function require(condition, message) { if (!condition) throw new Error(message); }
  function check(id, callback) {
    const start = Date.now();
    try { checks.push({ id: id, ok: true, detail: callback(), ms: Date.now() - start }); }
    catch (error) { checks.push({ id: id, ok: false, error: String(error.message || error), ms: Date.now() - start }); }
    console.log(JSON.stringify({ run_id: runId, check: checks[checks.length - 1] }));
  }
  function request(user, action, payload) {
    require(user, '缺少此角色可驗收的啟用帳號');
    const requestedAt = Date.now();
    const body = Object.assign({}, payload || {}, { action: action, session_token: issueSessionToken_(user) });
    if (!body.request_id) body.request_id = runId + '-' + Utilities.getUuid();
    const response = UrlFetchApp.fetch(endpoint, { method: 'post', contentType: 'text/plain', payload: JSON.stringify(body), followRedirects: true, muteHttpExceptions: true });
    let data;
    try { data = JSON.parse(response.getContentText()); } catch (error) { throw new Error(action + ' 回應不是 JSON：HTTP ' + response.getResponseCode()); }
    if (!data.ok) data.error = action + ': ' + (data.error || data.code || 'unknown') + ' [HTTP ' + response.getResponseCode() + ']';
    console.log(JSON.stringify({ run_id: runId, action: action, ok: data.ok === true, code: data.code || '', ms: Date.now() - requestedAt }));
    data.qa_request_id = body.request_id;
    return data;
  }
  function ok(data) { require(data && data.ok, data && data.error || '正式 API 未回報成功'); return data; }
  function reserve(sheet, key, suffix) {
    const id = runId + '-' + suffix;
    require(!findObject(sheet, key, id), '測試編號已存在，不可覆蓋');
    cleanupRows.push({ sheet: sheet, key: key, id: id });
    return id;
  }
  check('live_version', function () {
    const response = JSON.parse(UrlFetchApp.fetch(endpoint + '?action=ping').getContentText());
    require(response.release === KPI_RELEASE_VERSION_, '正式後端尚未更新至本次版本');
    return { release: response.release };
  });
  if (!checks[0].ok) { PropertiesService.getScriptProperties().deleteProperty('KPI_RELEASE_QA_PENDING_' + runId); const result = { ok: false, run_id: runId, checks: checks }; console.log(JSON.stringify(result)); return result; }
  check('active_accounts', function () {
    const emails = {};
    const accounts = users.map(function (user) {
      const address = String(user.email || '').trim().toLowerCase();
      if (address) emails[address] = (emails[address] || 0) + 1;
      const valid = verifySessionToken_(issueSessionToken_(user));
      return { nickname: user.nickname, role: user.role, email_bound: Boolean(address), signed_identity_valid: valid.ok === true };
    });
    require(accounts.every(account => account.signed_identity_valid), '有啟用帳號未通過身分驗證');
    return { accounts: accounts, duplicate_email_groups: Object.keys(emails).filter(key => emails[key] > 1).length, google_login_tested: false };
  });
  check('live_role_identities', function () {
    return [admin, teacher, talent, staff].map(function (user) {
      const result = ok(request(user, 'getSessionIdentity'));
      require(result.user.nickname === user.nickname, '回應身分不符');
      return { nickname: user.nickname, role: result.user.role };
    });
  });
  check('task_conflict_and_deletion', function () {
    require(teacher && other, '需要兩位啟用老師');
    const id = reserve(SHEET_NAMES.TASKS, 'task_id', 'TASK');
    const initial = { id: id, title: runId, dueDate: todayStr(), status: 'open' };
    const first = ok(request(teacher, 'saveSelfTask', { nickname: teacher.nickname, task: initial }));
    const receipt = ok(request(teacher, 'getMutationReceipt', { mutation_action: 'saveSelfTask', mutation_id: first.qa_request_id }));
    require(receipt.state === 'done' && receipt.result.updated_at === first.updated_at, '回執未能確認原寫入結果');
    require(ok(request(other, 'getMutationReceipt', { mutation_action: 'saveSelfTask', mutation_id: first.qa_request_id })).state === 'not_found', '其他老師可讀取私人回執');
    const replay = ok(request(teacher, 'saveSelfTask', { nickname: teacher.nickname, task: initial, request_id: first.qa_request_id }));
    require(replay.updated_at === first.updated_at, '相同儲存編號沒有重用原結果');
    const complete = ok(request(teacher, 'saveSelfTask', { nickname: teacher.nickname, task: Object.assign({}, initial, { status: 'done', cloudUpdatedAt: first.updated_at }) }));
    const stale = request(teacher, 'saveSelfTask', { nickname: teacher.nickname, task: Object.assign({}, initial, { cloudUpdatedAt: first.updated_at }) });
    require(stale.code === 'RECORD_CONFLICT' && stale.current_task.status === 'done', '舊版本覆蓋了完成狀態');
    require(!request(other, 'saveSelfTask', { nickname: other.nickname, task: initial }).ok, '其他老師可修改此事項');
    require(ok(request(admin, 'listTasks', { viewer: admin.nickname })).tasks.some(row => row.task_id === id && row.status === 'done'), '主管未讀到完成結果');
    ok(request(teacher, 'deleteSelfTask', { nickname: teacher.nickname, task_id: id }));
    require(request(teacher, 'saveSelfTask', { nickname: teacher.nickname, task: Object.assign({}, initial, { cloudUpdatedAt: complete.updated_at }) }).code === 'RECORD_DELETED', '已刪除事項被復活');
    return { owner: teacher.nickname, receipt_readback: true, replay_reused: true, receipt_privacy: true, conflict: true, privacy: true, manager_read: true, deleted: true };
  });
  check('teacher_photo_upload_and_private_preview', function () {
    require(teacher, '缺少老師帳號');
    const base64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
    const payload = { nickname: teacher.nickname, date: todayStr(), kpi: runId, mimeType: 'image/png', base64: base64 };
    const uploaded = ok(request(teacher, 'uploadPhoto', payload));
    const retry = ok(request(teacher, 'uploadPhoto', payload));
    require(retry.fileId === uploaded.fileId, '相同照片重試產生重複原檔');
    const file = DriveApp.getFileById(uploaded.fileId);
    require(Utilities.base64Encode(file.getBlob().getBytes()) === base64, '照片原始內容不一致');
    const preview = ok(request(teacher, 'getAttachmentPreviews', { file_ids: [uploaded.fileId] }));
    require(preview.previews.length === 1 && !preview.errors.length, '老師本人無法取得照片預覽');
    return { owner: teacher.nickname, bytes_match: true, retry_reused: true, private_preview: true };
  });
  check('talent_material_and_prep', function () {
    require(talent, '缺少才藝老師');
    ensureTalentRecordsSheet_();
    const id = reserve(SHEET_NAMES.TALENT_RECORDS, 'record_id', 'PREP');
    const content = 'KPI QA material content: ' + runId;
    const base64 = Utilities.base64Encode(content, Utilities.Charset.UTF_8);
    const upload = ok(request(talent, 'uploadFile', { nickname: talent.nickname, date: todayStr(), category: 'talent-' + runId, fileName: runId + '.txt', mimeType: 'text/plain', base64: base64 }));
    require(DriveApp.getFileById(upload.fileId).getBlob().getDataAsString() === content, '教材原檔內容不一致');
    const prep = { id: id, courseType: '系統驗收', courseName: runId, date: todayStr(), materials: [{ fileId: upload.fileId, fileName: runId + '.txt', url: upload.url, mimeType: 'text/plain' }] };
    ok(request(talent, 'saveTalentPrep', { nickname: talent.nickname, prep: prep }));
    const workspace = ok(request(talent, 'getTalentWorkspaceData'));
    require(workspace.preps.some(item => item.id === id && item.materials.length === 1), '才藝備課寫入後未能讀回');
    return { owner: talent.nickname, bytes_match: true, prep_readback: true };
  });
  check('admin_work_update_and_conflict', function () {
    require(staff, '缺少行政帳號');
    ensureAdminMarketingRecordsSheet_();
    const id = reserve(SHEET_NAMES.ADMIN_MARKETING_RECORDS, 'record_id', 'ADMIN');
    const record = { id: id, date: todayStr(), messages: { parentChecked: true, officialLineChecked: true, groupChecked: true }, items: [{ id: id + '-item', category: 'admin', title: runId, completedToday: '系統驗收', progress: 50, status: 'in_progress', remaining: '驗證讀回', dueDate: todayStr(), evidence: [] }] };
    const first = ok(request(staff, 'saveAdminMarketingRecord', { nickname: staff.nickname, record_type: 'daily', record: record, request_id: id + '-create' }));
    const changed = JSON.parse(JSON.stringify(first.record));
    changed.items[0].completedToday = '系統驗收已讀回';
    ok(request(staff, 'saveAdminMarketingRecord', { nickname: staff.nickname, record_type: 'daily', record: changed, request_id: id + '-update' }));
    const stale = request(staff, 'saveAdminMarketingRecord', { nickname: staff.nickname, record_type: 'daily', record: first.record, request_id: id + '-stale' });
    require(stale.code === 'RECORD_CONFLICT', '行政舊版本未拒絕');
    const workspace = ok(request(staff, 'getAdminMarketingWorkspaceData'));
    require(workspace.records.some(item => item.id === id && item.items[0].completedToday === changed.items[0].completedToday), '行政修改後內容未保留');
    return { owner: staff.nickname, update_readback: true, stale_rejected: true };
  });
  check('cleanup', function () {
    const result = withRecordWriteLock_(function () {
      // HTTP calls wrote in other executions; discard the pre-upload Sheet read cache.
      SpreadsheetApp.flush();
      cleanupRows.forEach(function (entry) {
        require(entry.id.indexOf(runId + '-') === 0, '拒絕清理非本次測試資料');
        const rowNum = findRow(entry.sheet, entry.key, entry.id);
        if (rowNum >= 2) getSheet(entry.sheet).deleteRow(rowNum);
        SpreadsheetApp.flush();
        const remainingRow = findRow(entry.sheet, entry.key, entry.id);
        console.log(JSON.stringify({ run_id: runId, cleanup_sheet: entry.sheet, matched_row: rowNum, remaining_row: remainingRow }));
        require(remainingRow < 2, entry.sheet + ' 驗收列仍存在');
      });
      cleanupReleaseReceipts_(runId);
      return { ok: true };
    });
    ok(result);
    const files = DriveApp.searchFiles("trashed = false and (title contains '" + runId + "' or title contains 'K" + runId + "')");
    let removed = 0;
    while (files.hasNext()) { const file = files.next(); require(file.getName().indexOf(runId) >= 0, '拒絕清理非測試檔'); file.setTrashed(true); require(file.isTrashed(), '測試檔清理失敗'); removed++; }
    PropertiesService.getScriptProperties().deleteProperty('KPI_RELEASE_QA_PENDING_' + runId);
    return { rows: cleanupRows.length, files_trashed: removed };
  });
  const readiness = getSystemReadiness({ operator: admin.nickname });
  const result = { ok: checks.every(item => item.ok), run_id: runId, elapsed_ms: Date.now() - started, checks: checks, readiness: readiness, real_google_logins_tested: false };
  console.log(JSON.stringify({ ok: result.ok, run_id: runId, elapsed_ms: result.elapsed_ms, checks: checks.map(item => ({ id: item.id, ok: item.ok, error: item.error })), readiness: readiness, real_google_logins_tested: false }));
  return result;
}

/** Retry only exact QA IDs from a recorded acceptance run, in a fresh execution. */
function cleanupReleaseAcceptanceFromEditor() {
  const email = String(Session.getActiveUser().getEmail() || '').trim().toLowerCase();
  const admin = email ? findUserByEmail(email) : null;
  if (!admin || admin.role !== 'admin' || admin.status !== 'active') throw new Error('須由正式管理員清理驗收資料');
  const props = PropertiesService.getScriptProperties();
  const knownFirstRun = 'QA-RELEASE-0b550cc2-d002-40d2-be49-9cc68b0f78f6';
  const runs = [knownFirstRun].concat(Object.keys(props.getProperties()).filter(key => key.indexOf('KPI_RELEASE_QA_PENDING_') === 0).map(key => key.slice('KPI_RELEASE_QA_PENDING_'.length)));
  const result = withRecordWriteLock_(function () {
    const results = [];
    runs.filter((id, i) => runs.indexOf(id) === i).forEach(function (runId) {
      if (!/^QA-RELEASE-[a-f0-9-]{36}$/.test(runId)) throw new Error('拒絕非驗收編號');
      const rows = [[SHEET_NAMES.TASKS, 'task_id', 'TASK'], [SHEET_NAMES.TALENT_RECORDS, 'record_id', 'PREP'], [SHEET_NAMES.ADMIN_MARKETING_RECORDS, 'record_id', 'ADMIN']];
      rows.forEach(function (entry) {
        const id = runId + '-' + entry[2];
        const rowNum = findRow(entry[0], entry[1], id);
        if (rowNum >= 2) getSheet(entry[0]).deleteRow(rowNum);
        SpreadsheetApp.flush();
        if (findRow(entry[0], entry[1], id) >= 2) throw new Error(entry[0] + ' 驗收列仍存在');
      });
      cleanupReleaseReceipts_(runId);
      const files = DriveApp.searchFiles("trashed = false and (title contains '" + runId + "' or title contains 'K" + runId + "')");
      let removed = 0;
      while (files.hasNext()) {
        const file = files.next();
        if (file.getName().indexOf(runId) < 0) throw new Error('拒絕清除其他原檔');
        file.setTrashed(true);
        if (!file.isTrashed()) throw new Error('驗收檔未清理');
        removed++;
      }
      props.deleteProperty('KPI_RELEASE_QA_PENDING_' + runId);
      results.push({ run_id: runId, rows_absent: true, files_trashed: removed });
    });
    return { ok: true, runs: results };
  });
  console.log(JSON.stringify(result));
  return result;
}

// Called only inside the editor acceptance cleanup's write lock.
function cleanupReleaseReceipts_(runId) {
  if (!/^QA-RELEASE-[a-f0-9-]{36}$/.test(runId)) throw new Error('拒絕非驗收編號');
  SpreadsheetApp.flush();
  const sheet = mutationReceiptSheet_(false);
  if (!sheet || sheet.getLastRow() < 2) return;
  const rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, 9).getValues();
  const matches = rows.map(function (row, i) { return { row: row, index: i + 2 }; }).filter(function (item) { return String(item.row[3]).indexOf(runId + '-') === 0; });
  if (matches.some(function (item) { return item.row[5] === 'pending'; })) throw new Error('驗收回執仍在處理，不可清理');
  matches.forEach(function (item) {
    sheet.getRange(item.index, 1, 1, 9).setValues([['retired:' + Utilities.getUuid(), '', '', '', '', 'retired', '', '', nowIso()]]);
  });
  SpreadsheetApp.flush();
}

function systemMaintenanceUser_(params) {
  const operator = params && params.operator ? findUserByNickname(params.operator) : null;
  if (operator) return operator;
  let email = '';
  try { email = String(Session.getActiveUser().getEmail() || '').trim().toLowerCase(); } catch (error) {}
  if (!email) {
    try { email = String(Session.getEffectiveUser().getEmail() || '').trim().toLowerCase(); } catch (error) {}
  }
  return email ? findUserByEmail(email) : null;
}

// 把 due_date 正規化成 yyyy-MM-dd（Sheets 會把日期字串自動轉成 Date 物件）
function taskDateStr_(v) {
  if (v instanceof Date) return Utilities.formatDate(v, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  return String(v == null ? '' : v).slice(0, 10);
}

// 由 admin 透過 API 設定機密（OneSignal / LINE），免去手動點指令碼屬性
function setConfig(params) {
  const u = params && params.operator ? findUserByNickname(params.operator) : null;
  if (!u || u.role !== 'admin') return { ok: false, error: '需 admin 權限' };
  const allowed = ['ONESIGNAL_APP_ID', 'ONESIGNAL_REST_KEY', 'LINE_TOKEN'];
  const props = PropertiesService.getScriptProperties();
  const set = [];
  allowed.forEach(k => {
    if (params[k] !== undefined && params[k] !== '') { props.setProperty(k, String(params[k])); set.push(k); }
  });
  return { ok: true, set: set };
}

/** 不回傳機密值，只供管理介面檢查通知、教材與排程是否已完成設定。 */
function getSystemReadiness(params) {
  const user = systemMaintenanceUser_(params);
  if (!user || (user.role !== 'admin' && user.role !== 'manager')) return { ok: false, error: '需主管或管理員權限' };
  const props = PropertiesService.getScriptProperties();
  const triggers = ScriptApp.getProjectTriggers().map(t => t.getHandlerFunction());
  return {
    ok: true,
    services: {
      line: Boolean(props.getProperty('LINE_TOKEN')),
      oneSignalApp: Boolean(props.getProperty('ONESIGNAL_APP_ID')),
      oneSignalKey: Boolean(props.getProperty('ONESIGNAL_REST_KEY')),
      materialUpload: true,
      coursePrepArchive: true,
      taskCloudSync: true,
      productionIntegrity: true,
      verifiedLineIngress: props.getProperty('LINE_VERIFIED_INGRESS_ENABLED') === 'true' && Boolean(props.getProperty('LINE_CHANNEL_SECRET')),
    },
    triggers: {
      dailyKpiPdf: triggers.indexOf('sendDailyKpiReportAuto') >= 0,
      dailyTaskMorning: triggers.indexOf('sendMorningReminders') >= 0,
      dailyTaskEvening: triggers.indexOf('sendEveningPreview') >= 0,
      dailyTaskReminder: triggers.indexOf('sendMorningReminders') >= 0 && triggers.indexOf('sendEveningPreview') >= 0,
      talentPdfRepair: triggers.indexOf('repairMissingTalentLessonReportsAuto') >= 0,
      deliveryRetry: triggers.indexOf('retryPendingKpiDeliveries') >= 0,
      databaseBackup: triggers.indexOf('backupKpiDatabaseAuto') >= 0,
    },
    reliability: user.role === 'admin' ? getReliabilityMetrics_() : null,
    databaseBackup: user.role === 'admin' ? parseJsonField(props.getProperty('KPI_LAST_DATABASE_BACKUP')) : null,
  };
}

/**
 * 管理員手動執行的正式環境實際交付驗收。
 * 每一項都會真的寫入後再讀回，並只清除本次建立的 QA 資料。
 */
function verifyProductionDeliveryFromEditor() {
  let result;
  try {
    // Fail explicitly when editor identity scope is missing; do not bypass the admin check.
    Session.getActiveUser().getEmail();
    result = runProductionIntegrityCheck();
  } catch (error) {
    const message = String(error && error.message || error);
    result = { ok: false, code: message.indexOf('userinfo.email') >= 0 ? 'EDITOR_EMAIL_SCOPE_REQUIRED' : 'EDITOR_CHECK_FAILED', error: message };
  }
  console.log(JSON.stringify(result));
  return result;
}

/** 管理員手動執行：以一次 HTTP 請求實測 8 張照片批次上傳，完成後立即清理測試檔。 */
function verifyPhotoBatchPerformanceFromEditor() {
  const email = String(Session.getActiveUser().getEmail() || '').trim().toLowerCase();
  const admin = email ? findUserByEmail(email) : null;
  if (!admin || admin.role !== 'admin' || admin.status !== 'active') throw new Error('須由正式管理員執行驗收');
  const endpoint = ScriptApp.getService().getUrl();
  if (!endpoint) throw new Error('找不到已部署的 Web App 網址');
  const tinyPng = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL1WQAAAABJRU5ErkJggg==';
  const runId = 'QA-BATCH-' + Utilities.getUuid().slice(0, 8);
  const photos = [];
  for (let index = 0; index < 8; index += 1) photos.push({
    clientId: runId + '-' + index,
    kpi: index + 1,
    mimeType: 'image/png',
    base64: tinyPng,
    description: '批次照片效能驗收 ' + (index + 1),
  });
  const started = Date.now();
  let response = null;
  let cleanupComplete = true;
  try {
    const http = UrlFetchApp.fetch(endpoint, {
      method: 'post', contentType: 'text/plain', followRedirects: true, muteHttpExceptions: true,
      payload: JSON.stringify({ action: 'uploadPhotos', nickname: admin.nickname, date: todayStr(), photos: photos, session_token: issueSessionToken_(admin) }),
    });
    response = JSON.parse(http.getContentText());
  } catch (error) {
    response = { ok: false, error: String(error && error.message || error) };
  } finally {
    const results = response && Array.isArray(response.results) ? response.results : [];
    results.forEach(function (item) {
      if (!item.fileId) return;
      try { DriveApp.getFileById(item.fileId).setTrashed(true); }
      catch (error) { cleanupComplete = false; }
    });
  }
  const result = {
    ok: Boolean(response && response.ok && response.uploaded === 8 && response.failed === 0 && cleanupComplete),
    release: KPI_RELEASE_VERSION_,
    photos: 8,
    requests: 1,
    elapsed_ms: Date.now() - started,
    uploaded: Number(response && response.uploaded || 0),
    failed: Number(response && response.failed || 0),
    cleanup_complete: cleanupComplete,
    error: response && response.error || '',
  };
  console.log(JSON.stringify(result));
  return result;
}

function runProductionIntegrityCheck(params) {
  const actor = params && params.__actor ? params.__actor : systemMaintenanceUser_(params);
  if (!actor || actor.role !== 'admin' || actor.status !== 'active') {
    return { ok: false, error: '只有啟用中的管理員可以執行正式環境驗收' };
  }

  const startedAtMs = Date.now();
  const runId = 'QA-' + Utilities.formatDate(new Date(), 'Asia/Taipei', 'yyyyMMdd-HHmmss') + '-' + Utilities.getUuid().slice(0, 8);
  const checks = [];
  const lock = LockService.getScriptLock();

  function requireCheck_(condition, message) {
    if (!condition) throw new Error(message);
  }

  function runCheck_(id, label, runner) {
    const checkStartedAt = Date.now();
    try {
      const detail = runner() || {};
      checks.push({
        id: id,
        label: label,
        ok: true,
        elapsed_ms: Date.now() - checkStartedAt,
        detail: detail,
      });
    } catch (error) {
      checks.push({
        id: id,
        label: label,
        ok: false,
        elapsed_ms: Date.now() - checkStartedAt,
        error: String(error && error.message || error || '未知錯誤'),
      });
    }
  }

  if (!lock.tryLock(15000)) {
    return { ok: false, error: '系統正在處理其他雲端寫入，請稍後再執行驗收' };
  }

  try {
    runCheck_('session_identity', '正式登入身分', function () {
      const storedUser = findUserByNickname(actor.nickname);
      requireCheck_(storedUser && storedUser.status === 'active', '登入帳號未在正式人員名單啟用');
      requireCheck_(storedUser.role === 'admin', '正式帳號不是管理員角色');
      return { nickname: storedUser.nickname, role: storedUser.role };
    });

    runCheck_('spreadsheet_roundtrip', '試算表寫入、讀回與清理', function () {
      const payload = {
        runId: runId,
        message: '布拉克星球 KPI 雲端交付驗收',
        count: 3,
        flags: [true, false, true],
      };
      const rowNumber = appendRow(SHEET_NAMES.SYSTEM_LOG, {
        timestamp: nowIso(),
        nickname: actor.nickname,
        action: 'production_integrity_check',
        target: runId,
        detail: payload,
        ip: '',
      });
      try {
        SpreadsheetApp.flush();
        const row = findObject(SHEET_NAMES.SYSTEM_LOG, 'target', runId);
        requireCheck_(row && row._row === rowNumber, '測試列寫入後無法由唯一編號讀回');
        const restored = parseJsonField(row.detail);
        requireCheck_(restored && restored.runId === payload.runId, 'JSON 物件讀回內容不一致');
        requireCheck_(restored.message === payload.message && Number(restored.count) === payload.count, '中文或數值資料讀回內容不一致');
      } finally {
        const row = findObject(SHEET_NAMES.SYSTEM_LOG, 'target', runId);
        if (row && row._row > 1) deleteRow(SHEET_NAMES.SYSTEM_LOG, row._row);
      }
      SpreadsheetApp.flush();
      requireCheck_(findRow(SHEET_NAMES.SYSTEM_LOG, 'target', runId) < 0, '測試列清理失敗');
      return { sheet: SHEET_NAMES.SYSTEM_LOG, roundtrip: 'passed', cleanup: 'passed' };
    });

    runCheck_('anqin_record_roundtrip', '安親紀錄新增、修改、讀回與清理', function () {
      const logId = runId + '-ANQIN';
      const student = '系統驗收學生';
      const originalSummary = '孩子今天能主動說明卡住的步驟，老師已提供一次示範。';
      const originalDecision = '家長了解今日狀況，同意回家只複習同類型一題。';
      const updatedSummary = originalSummary + ' 修改後已能自行完成。';
      const updatedDecision = originalDecision + ' 雙方確認明日再觀察。';
      const contact = {
        id: logId + '-CONTACT',
        date: todayStr(),
        teacher: actor.nickname,
        student: student,
        channel: '門口面談',
        summary: originalSummary,
        decision: originalDecision,
        nextAction: '',
        dueDate: '',
        status: 'closed',
      };
      const snapshot = {
        schema: 'anqin-v2',
        version: 1,
        submission: {
          id: logId + '-SUBMISSION',
          date: todayStr(),
          teacher: actor.nickname,
          contactIds: [contact.id],
          contactSnapshots: [contact],
          studentCaseIds: [],
          studentCaseSnapshots: [],
        },
      };
      const kpi5 = {
        parent_contacted: true,
        parent_summary: student + '（門口面談）：孩子狀況與老師處理：' + originalSummary + '；家長回應與共同決定：' + originalDecision,
        parent_handoff_confirmed: false,
        parent_handoff_note: '',
        student_special: '',
        special_students: [],
      };
      const rowNumber = appendRow(SHEET_NAMES.LOGS, {
        log_id: logId,
        date: todayStr(),
        nickname: actor.nickname,
        department: actor.department || '總部',
        role: actor.role,
        kpi1_data: {},
        kpi2_data: {},
        kpi3_data: {},
        kpi4_data: {},
        kpi5_data: kpi5,
        kpi6_data: { v2_snapshot: snapshot },
        attachments: [],
        created_at: nowIso(),
        updated_at: nowIso(),
        locked: false,
      });
      try {
        SpreadsheetApp.flush();
        const inserted = findObject(SHEET_NAMES.LOGS, 'log_id', logId);
        requireCheck_(inserted && inserted._row === rowNumber, '安親測試紀錄新增後無法讀回');
        const insertedKpi5 = parseJsonField(inserted.kpi5_data);
        const insertedKpi6 = parseJsonField(inserted.kpi6_data);
        requireCheck_(insertedKpi5.parent_summary === kpi5.parent_summary, '親師溝通中文內容新增後不一致');
        requireCheck_(insertedKpi5.student_special === '' && Array.isArray(insertedKpi5.special_students) && insertedKpi5.special_students.length === 0, '新紀錄仍混入舊版學生追蹤欄位');
        requireCheck_(insertedKpi6.v2_snapshot.submission.contactSnapshots[0].decision === originalDecision, '親師溝通快照新增後不一致');
        requireCheck_(insertedKpi6.v2_snapshot.submission.studentCaseSnapshots.length === 0, '新紀錄快照仍混入學生追蹤');

        const updatedContact = Object.assign({}, contact, { summary: updatedSummary, decision: updatedDecision });
        const updatedKpi5 = Object.assign({}, kpi5, {
          parent_summary: student + '（門口面談）：孩子狀況與老師處理：' + updatedSummary + '；家長回應與共同決定：' + updatedDecision,
        });
        const updatedSnapshot = JSON.parse(JSON.stringify(snapshot));
        updatedSnapshot.submission.contactSnapshots = [updatedContact];
        updateRow(SHEET_NAMES.LOGS, rowNumber, {
          kpi5_data: updatedKpi5,
          kpi6_data: { v2_snapshot: updatedSnapshot },
          updated_at: nowIso(),
        });
        SpreadsheetApp.flush();
        const updated = findObject(SHEET_NAMES.LOGS, 'log_id', logId);
        const restoredKpi5 = parseJsonField(updated.kpi5_data);
        const restoredKpi6 = parseJsonField(updated.kpi6_data);
        requireCheck_(restoredKpi5.parent_summary === updatedKpi5.parent_summary, '安親紀錄修改後未讀回新內容');
        requireCheck_(restoredKpi6.v2_snapshot.submission.contactSnapshots[0].summary === updatedSummary, '親師溝通快照修改後不一致');
        requireCheck_(restoredKpi6.v2_snapshot.submission.contactSnapshots[0].decision === updatedDecision, '家長回應修改後不一致');
      } finally {
        const row = findObject(SHEET_NAMES.LOGS, 'log_id', logId);
        if (row && row._row > 1) deleteRow(SHEET_NAMES.LOGS, row._row);
      }
      SpreadsheetApp.flush();
      requireCheck_(findRow(SHEET_NAMES.LOGS, 'log_id', logId) < 0, '安親測試紀錄清理失敗');
      return { sheet: SHEET_NAMES.LOGS, create: 'passed', update: 'passed', readback: 'passed', cleanup: 'passed' };
    });

    runCheck_('photo_roundtrip', '照片建立、讀回與私密預覽', function () {
      const root = getEvidenceRootFolder_();
      const qaFolder = getOrCreateChildFolder_(root, '_系統健康檢查');
      const pngBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
      const filename = runId + '-photo.png';
      const file = qaFolder.createFile(Utilities.newBlob(Utilities.base64Decode(pngBase64), 'image/png', filename));
      try {
        secureKpiDriveItem_(file, actor, 'anqin', []);
        const fileId = file.getId();
        const stored = DriveApp.getFileById(fileId);
        requireCheck_(stored.getName() === filename, '照片建立後檔名不一致');
        requireCheck_(Utilities.base64Encode(stored.getBlob().getBytes()) === pngBase64, '照片建立後內容與原檔不一致');
        assertKpiFileReadable_(stored, actor, 'anqin');
        const preview = getAttachmentPreviews({ __actor: actor, file_ids: [fileId] });
        requireCheck_(preview && preview.ok, '私密照片預覽端點執行失敗');
        requireCheck_(Array.isArray(preview.previews) && preview.previews.length === 1, '私密照片預覽未回傳圖片');
        requireCheck_(/^data:image\//.test(String(preview.previews[0].dataUrl || '')), '照片預覽不是可顯示的影像資料');
        const pdfPhoto = pdfPhotoUri_(fileId);
        requireCheck_(/^data:image\/(?:png|jpeg|jpg|gif);base64,/.test(String(pdfPhoto || '')), 'PDF 無法嵌入雲端照片');
      } finally {
        file.setTrashed(true);
      }
      requireCheck_(file.isTrashed(), '測試照片清理失敗');
      return { format: 'image/png', preview: 'passed', pdf_embed: 'passed', privacy: 'private', cleanup: 'passed' };
    });

    runCheck_('material_roundtrip', '教材檔案建立、讀回與內容核對', function () {
      const root = getMaterialRootFolder_();
      const qaFolder = getOrCreateChildFolder_(root, '_系統健康檢查');
      const content = 'run=' + runId + '\n布拉克星球 KPI 教材交付驗收\n內容完整';
      const filename = runId + '-material.txt';
      const file = qaFolder.createFile(Utilities.newBlob(content, 'text/plain', filename));
      try {
        secureKpiDriveItem_(file, actor, 'anqin', []);
        const stored = DriveApp.getFileById(file.getId());
        requireCheck_(stored.getName() === filename, '教材建立後檔名不一致');
        requireCheck_(stored.getBlob().getDataAsString('UTF-8') === content, '教材建立後內容與原始內容不一致');
        requireCheck_(stored.getSize() > 0, '教材建立後檔案大小為 0');
        assertKpiFileReadable_(stored, actor, 'anqin');
      } finally {
        file.setTrashed(true);
      }
      requireCheck_(file.isTrashed(), '測試教材清理失敗');
      return { format: 'text/plain', content_match: true, privacy: 'private', cleanup: 'passed' };
    });
  } finally {
    lock.releaseLock();
  }

  const passed = checks.filter(function (check) { return check.ok; }).length;
  const failed = checks.length - passed;
  return {
    ok: failed === 0,
    run_id: runId,
    checked_at: nowIso(),
    elapsed_ms: Date.now() - startedAtMs,
    summary: { total: checks.length, passed: passed, failed: failed },
    checks: checks,
  };
}

function courseRecordQaAdmin_() {
  const email = String(Session.getActiveUser().getEmail() || '').trim().toLowerCase();
  const actor = email ? findUserByEmail(email) : null;
  if (!actor || actor.role !== 'admin' || actor.status !== 'active') throw new Error('須由正式啟用管理員在編輯器執行課程紀錄驗收');
  return actor;
}

/** Editor-only; never creates a user, submits a real teacher's log or sends notifications. */
function verifyCourseRecordDeliveryFromEditor() {
  const actor = courseRecordQaAdmin_();
  const runId = 'QA-COURSE-' + Utilities.getUuid();
  const props = PropertiesService.getScriptProperties();
  const propertyKey = 'KPI_COURSE_QA_PENDING_' + runId;
  let date = todayStr();
  while (isKpiWeekend_(date)) date = addDaysStr_(date, -1);
  if (date < '2026-09-18') throw new Error('驗收日期須在課程紀錄啟用日之後');
  if (findObject(SHEET_NAMES.LOGS, 'log_id', runId)) throw new Error('驗收編號已存在，不可覆蓋');
  const registration = { version: 2, created_at: nowIso(), photo_attempted: false, pdf_attempted: false };
  props.setProperty(propertyKey, JSON.stringify(registration));
  const checks = [];
  let stage = 'private_screenshot';
  let artifact = null;
  let complete = false;
  let cleanup;
  function require(condition, message) { if (!condition) throw new Error(message); }
  function passed(id) { checks.push({ id: id, ok: true }); }
  try {
    const folder = getOrCreateChildFolder_(getEvidenceRootFolder_(), '_系統健康檢查');
    // Opaque brand-orange pixel, enlarged by pdfLogCard_ for visual verification.
    const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGN4MdsGAAQuAcDDaEQlAAAAAElFTkSuQmCC';
    registration.photo_attempted = true;
    props.setProperty(propertyKey, JSON.stringify(registration));
    const photo = folder.createFile(Utilities.newBlob(Utilities.base64Decode(png), 'image/png', runId + '-photo.png'));
    registration.photo_id = photo.getId();
    props.setProperty(propertyKey, JSON.stringify(registration));
    secureKpiDriveItem_(photo, actor, 'anqin', []);
    assertKpiFileReadable_(photo, actor, 'anqin');
    require(Utilities.base64Encode(DriveApp.getFileById(photo.getId()).getBlob().getBytes()) === png, 'Drive 截圖原始內容不一致');
    passed(stage);

    stage = 'required_validation';
    const fakeUser = { nickname: runId, role: 'teacher', department: '北區教室', status: 'active' };
    const screenshot = { id: runId + '-SCREENSHOT', fileName: photo.getName(), mimeType: 'image/png', cloudFileId: photo.getId(), cloudUrl: 'https://drive.google.com/file/d/' + photo.getId() + '/view' };
    const record = { channels: ['group', 'parent_app'], attachments: [screenshot], note: '系統驗收：課程照片分享截圖' };
    const snapshot = { schema: 'anqin-v2', version: 1, submission: { id: runId + '-SUBMISSION', teacher: runId, date: date, courseRecord: record }, daily: { courseRecord: record } };
    const payload = { nickname: runId, date: date, submitted: true, kpi6_data: { v2_snapshot: snapshot }, attachments: [
      { type: 'photo', forType: 'v2-course-record', attachmentId: screenshot.id, fileId: photo.getId(), url: screenshot.cloudUrl, fileName: screenshot.fileName, mimeType: 'image/png', kpi: 2, description: '課程紀錄分享截圖（系統驗收）' }
    ] };
    require(!validateAnqinCourseRecord_(payload, fakeUser), '合法課程紀錄未通過正式驗證');
    const missingChannel = JSON.parse(JSON.stringify(payload));
    missingChannel.kpi6_data.v2_snapshot.submission.courseRecord.channels = [];
    require((validateAnqinCourseRecord_(missingChannel, fakeUser) || {}).code === 'COURSE_RECORD_REQUIRED', '缺分享管道未被正式驗證拒絕');
    const missingProof = JSON.parse(JSON.stringify(payload));
    missingProof.kpi6_data.v2_snapshot.submission.courseRecord.attachments = [];
    require((validateAnqinCourseRecord_(missingProof, fakeUser) || {}).code === 'COURSE_RECORD_REQUIRED', '缺截圖未被正式驗證拒絕');
    passed(stage);

    stage = 'snapshot_roundtrip';
    const stored = withRecordWriteLock_(function () {
      require(!findObject(SHEET_NAMES.LOGS, 'log_id', runId), '驗收編號已存在，不可覆蓋');
      appendRow(SHEET_NAMES.LOGS, { log_id: runId, nickname: runId, date: date, department: fakeUser.department, role: 'teacher',
        kpi6_data: payload.kpi6_data, attachments: payload.attachments, reflection: '僅系統驗收，非真實老師日報',
        submitted_at: '', delivery_state: '', evidence_state: '', created_at: nowIso(), updated_at: nowIso(), locked: false });
      SpreadsheetApp.flush();
      const inserted = findObject(SHEET_NAMES.LOGS, 'log_id', runId);
      require(inserted && inserted.nickname === runId, '唯一 QA 紀錄未能讀回');
      const restored = parseJsonField(inserted.kpi6_data).v2_snapshot;
      require(JSON.stringify(restored.submission.courseRecord) === JSON.stringify(record), '課程紀錄第一次讀回不一致');
      require(anqinCourseScreenshots_(restored.submission.courseRecord, parseJsonField(inserted.attachments)).length === 1, '第一次讀回遺失截圖關聯');
      restored.submission.courseRecord.note = '系統驗收：修改後內容已讀回';
      restored.daily.courseRecord.note = restored.submission.courseRecord.note;
      const changed = Object.assign({}, payload, { kpi6_data: { v2_snapshot: restored } });
      require(!validateAnqinCourseRecord_(changed, fakeUser), '修改後課程紀錄未通過正式驗證');
      updateRow(SHEET_NAMES.LOGS, inserted._row, { kpi6_data: changed.kpi6_data, updated_at: nowIso() });
      SpreadsheetApp.flush();
      const updated = findObject(SHEET_NAMES.LOGS, 'log_id', runId);
      const updatedSnapshot = parseJsonField(updated.kpi6_data).v2_snapshot;
      require(updatedSnapshot.submission.courseRecord.note === restored.submission.courseRecord.note, '課程紀錄第二次讀回不一致');
      require(anqinCourseScreenshots_(updatedSnapshot.submission.courseRecord, parseJsonField(updated.attachments)).length === 1, '修改後遺失截圖關聯');
      return { ok: true, log: updated };
    });
    require(stored && stored.ok, stored && stored.error || '驗收寫入未完成');
    passed(stage);

    stage = 'pdf_conversion';
    const card = pdfLogCard_(stored.log);
    require(card.indexOf('今日課程照片已分享到群組、家長通') >= 0 && card.indexOf('系統驗收：修改後內容已讀回') >= 0, 'PDF HTML 遺失課程紀錄文字');
    require(/<img[^>]+src="data:image\/(?:png|jpeg|jpg|gif);base64,/.test(card), 'PDF HTML 未嵌入真實 Drive 截圖');
    const html = '<!doctype html><html><head><meta charset="UTF-8"></head><body><h2>課程紀錄交付驗收（合成資料）</h2>' + card + '</body></html>';
    const pdfBlob = Utilities.newBlob(html, 'text/html', runId + '.html').getAs('application/pdf').setName(runId + '-review.pdf');
    registration.pdf_attempted = true;
    props.setProperty(propertyKey, JSON.stringify(registration));
    const pdf = folder.createFile(pdfBlob);
    registration.pdf_id = pdf.getId();
    props.setProperty(propertyKey, JSON.stringify(registration));
    secureKpiDriveItem_(pdf, actor, 'anqin', []);
    assertKpiFileReadable_(pdf, actor, 'anqin');
    const bytes = pdf.getBlob().getBytes();
    require(bytes.length > 5 && String.fromCharCode.apply(null, bytes.slice(0, 5)) === '%PDF-', 'Google 未產生有效 PDF');
    artifact = { file_id: pdf.getId(), url: 'https://drive.google.com/file/d/' + pdf.getId() + '/view', file_name: pdf.getName(), private: true, cleanup_pending: true };
    passed(stage);
    complete = true;
  } catch (error) {
    checks.push({ id: stage, ok: false, error: String(error && error.message || error) });
  } finally {
    cleanup = cleanupCourseRecordQaRun_(runId, complete);
  }
  const result = { ok: complete && cleanup.ok, run_id: runId, checks: checks, cleanup: cleanup, artifact: artifact,
    scope: 'formal validator, synthetic Sheets roundtrip, private Drive original and Google PDF conversion; no teacher submission or notification',
    cleanup_function: 'cleanupCourseRecordDeliveryFromEditor' };
  console.log(JSON.stringify(result));
  return result;
}

function cleanupCourseRecordQaRun_(runId, keepPdf) {
  if (!/^QA-COURSE-[a-f0-9-]{36}$/.test(String(runId))) throw new Error('拒絕非課程驗收編號');
  const props = PropertiesService.getScriptProperties();
  const key = 'KPI_COURSE_QA_PENDING_' + runId;
  if (!props.getProperty(key)) throw new Error('找不到此課程驗收登記');
  const registration = JSON.parse(props.getProperty(key));
  if (!registration || typeof registration !== 'object') throw new Error('課程驗收登記格式不正確');
  const errors = [];
  let rowAbsent = false;
  let retainedPdf = false;
  let filesTrashed = 0;
  try {
    const result = withRecordWriteLock_(function () {
      SpreadsheetApp.flush();
      const row = findObject(SHEET_NAMES.LOGS, 'log_id', runId);
      if (row) {
        if (row.nickname !== runId) throw new Error('拒絕清除非本次合成資料列');
        deleteRow(SHEET_NAMES.LOGS, row._row);
      }
      SpreadsheetApp.flush();
      return { ok: findRow(SHEET_NAMES.LOGS, 'log_id', runId) < 0 };
    });
    if (!result || !result.ok) throw new Error('QA 日報清理未完成');
    rowAbsent = true;
  } catch (error) { errors.push(String(error && error.message || error)); }
  [['photo', '-photo.png'], ['pdf', '-review.pdf']].forEach(function (entry) {
    const kind = entry[0];
    const expectedName = runId + entry[1];
    const idKey = kind + '_id';
    if (registration.version === 2 && registration[kind + '_attempted'] === false && !registration[idKey]) return;
    try {
      if (!registration[idKey]) {
        // Only interrupted/legacy runs need search recovery. Include trashed
        // originals; an empty search cannot prove a file was never created.
        const matches = [];
        const files = DriveApp.searchFiles("title contains '" + runId + "'");
        while (files.hasNext()) {
          const candidate = files.next();
          if (candidate.getName() === expectedName) matches.push(candidate);
        }
        if (matches.length !== 1) throw new Error('QA ' + kind + ' 原檔編號尚未確認，保留清理登記');
        registration[idKey] = matches[0].getId();
        props.setProperty(key, JSON.stringify(registration));
      }
      const file = DriveApp.getFileById(registration[idKey]);
      if (!file || file.getId() !== registration[idKey] || file.getName() !== expectedName) throw new Error('拒絕清除編號或檔名不符的 QA 原檔');
      if (file.isTrashed()) return;
      if (keepPdf && rowAbsent && kind === 'pdf') { retainedPdf = true; return; }
      file.setTrashed(true);
      if (!file.isTrashed()) throw new Error('QA 檔案清理未完成');
      filesTrashed++;
    } catch (error) { errors.push(String(error && error.message || error)); }
  });
  if (!errors.length && !retainedPdf) {
    try { props.deleteProperty(key); }
    catch (error) { errors.push(String(error && error.message || error)); }
  }
  return { ok: errors.length === 0, row_absent: rowAbsent, files_trashed: filesTrashed, pdf_retained_for_review: retainedPdf, cleanup_pending: retainedPdf || errors.length > 0, errors: errors };
}

/** After downloading the synthetic PDF, remove only registered exact QA artifacts. */
function cleanupCourseRecordDeliveryFromEditor() {
  courseRecordQaAdmin_();
  const prefix = 'KPI_COURSE_QA_PENDING_';
  const properties = PropertiesService.getScriptProperties().getProperties();
  const runs = Object.keys(properties).filter(function (key) { return key.indexOf(prefix) === 0; }).map(function (key) {
    const runId = key.slice(prefix.length);
    return { run_id: runId, cleanup: cleanupCourseRecordQaRun_(runId, false) };
  });
  const result = { ok: runs.every(function (run) { return run.cleanup.ok; }), runs: runs };
  console.log(JSON.stringify(result));
  return result;
}

/** 管理員一鍵補齊每日 PDF 與事項提醒排程。 */
function setupSystemAutomation(params) {
  const user = systemMaintenanceUser_(params);
  if (!user || user.role !== 'admin') return { ok: false, error: '需 admin 權限' };
  setupKpiReportTrigger();
  setupTaskReminderTrigger();
  setupTalentReportRepairTrigger();
  setupKpiReliabilityTriggers();
  logSystem(user.nickname, 'setup_system_automation', '', {});
  return getSystemReadiness({ operator: user.nickname });
}

function handleVerifiedLineWebhook_(envelope) {
  const secret = PropertiesService.getScriptProperties().getProperty('LINE_CHANNEL_SECRET');
  const rawBody = envelope && envelope.rawBody;
  const signature = String(envelope && envelope.signature || '');
  if (!secret || typeof rawBody !== 'string' || rawBody.length > 1000000 || !signature) return { ok: false, code: 'LINE_SIGNATURE_REQUIRED' };
  const expected = Utilities.base64Encode(Utilities.computeHmacSha256Signature(rawBody, secret, Utilities.Charset.UTF_8));
  let mismatch = expected.length ^ signature.length;
  for (let i = 0; i < expected.length; i++) mismatch |= expected.charCodeAt(i) ^ (signature.charCodeAt(i) || 0);
  if (mismatch !== 0) return { ok: false, code: 'LINE_SIGNATURE_INVALID' };
  let payload;
  try { payload = JSON.parse(rawBody); } catch (error) { return { ok: false, code: 'LINE_BODY_INVALID' }; }
  if (!payload || !Array.isArray(payload.events) || payload.events.length > 100 || payload.events.some(function (event) { return !event || typeof event !== 'object'; })) return { ok: false, code: 'LINE_BODY_INVALID' };
  const cache = CacheService.getScriptCache();
  for (let i = 0; i < payload.events.length; i++) {
    const event = payload.events[i];
    const digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, event.webhookEventId || JSON.stringify(event), Utilities.Charset.UTF_8);
    const key = 'line-event-' + Utilities.base64EncodeWebSafe(digest).replace(/=+$/, '');
    const result = withResourceLease_(key, function () {
      if (cache.get(key)) return { ok: true, duplicate: true };
      handleLineWebhook_({ events: [event] });
      cache.put(key, 'done', 21600);
      return { ok: true };
    });
    if (!result.ok) return result;
  }
  return { ok: true };
}

/** 對目前帳號同時測試 LINE 與 APP 通知，不回傳任何服務密鑰。 */
function testMyNotifications(params) {
  const user = params && params.operator ? findUserByNickname(params.operator) : null;
  if (!user || user.status !== 'active') return { ok: false, error: '找不到可用帳號' };
  const title = '布拉克星球 KPI 通知測試';
  const body = 'APP 與 LINE 通知設定測試完成。';
  const lineBound = Boolean(user.line_user_id);
  const lineSent = lineBound ? pushLine_(user.line_user_id, title + '\n' + body) : false;
  const appSent = pushOneSignal_(user.nickname, title, body);
  logSystem(user.nickname, 'test_notifications', '', { lineBound: lineBound, lineSent: lineSent, appSent: appSent });
  return { ok: true, lineBound: lineBound, lineSent: lineSent, appSent: appSent };
}

/** 經登入驗證後，把這台裝置的 OneSignal subscription ID 綁到目前帳號。 */
function registerPushSubscription(params) {
  ensureHeaders(getSheet(SHEET_NAMES.USERS), [
    'nickname', 'email', 'role', 'department', 'status', 'phone', 'joined_at',
    'last_login', 'notes', 'subtype', 'line_user_id', 'push_subscription_id',
    'employment_type', 'work_assignments', 'schedule_json', 'rest_days', 'deleted_at', 'deleted_by'
  ]);
  const user = params && params.operator ? findUserByNickname(params.operator) : null;
  if (!user || user.status !== 'active') return { ok: false, error: '找不到可用帳號' };
  const subscriptionId = String(params.subscription_id || '').trim();
  if (!/^[A-Za-z0-9_-]{8,256}$/.test(subscriptionId)) return { ok: false, error: 'APP 訂閱識別碼無效' };

  // 同一台裝置只能綁一個帳號；切換使用者時清除舊帳號的裝置綁定。
  sheetToObjects(SHEET_NAMES.USERS).forEach((item, index) => {
    if (item.nickname !== user.nickname && String(item.push_subscription_id || '') === subscriptionId) {
      updateRow(SHEET_NAMES.USERS, index + 2, { push_subscription_id: '' });
    }
  });
  updateRow(SHEET_NAMES.USERS, user._row, { push_subscription_id: subscriptionId });
  logSystem(user.nickname, 'register_push_subscription', subscriptionId.slice(0, 12), {});
  return { ok: true, subscription_id: subscriptionId };
}

function unregisterPushSubscription(params) {
  const user = params && params.operator ? findUserByNickname(params.operator) : null;
  if (!user || user.status !== 'active') return { ok: false, error: '找不到可用帳號' };
  updateRow(SHEET_NAMES.USERS, user._row, { push_subscription_id: '' });
  logSystem(user.nickname, 'unregister_push_subscription', '', {});
  return { ok: true };
}

function issueLineBindingCode_(user) {
  const payload = base64UrlText_(JSON.stringify({
    v: 1,
    n: String(user.nickname || ''),
    x: Date.now() + 10 * 60 * 1000,
    nonce: Utilities.getUuid().slice(0, 8),
  }));
  return payload + '.' + sessionSignature_('line-binding:' + payload);
}

function verifyLineBindingCode_(code) {
  const parts = String(code || '').split('.');
  if (parts.length !== 2 || !constantTimeTextEqual_(parts[1], sessionSignature_('line-binding:' + parts[0]))) {
    return { ok: false, error: '綁定指令無效' };
  }
  try {
    const payload = JSON.parse(Utilities.newBlob(Utilities.base64DecodeWebSafe(parts[0])).getDataAsString());
    if (payload.v !== 1 || Number(payload.x || 0) <= Date.now()) return { ok: false, error: '綁定指令已逾時' };
    const user = findUserByNickname(String(payload.n || ''));
    if (!user || user.status !== 'active' || !user.email) return { ok: false, error: '帳號尚未啟用' };
    return { ok: true, user: user };
  } catch (error) {
    return { ok: false, error: '綁定指令無效' };
  }
}

/** 產生 10 分鐘有效、只能綁目前登入帳號的 LINE 指令。 */
function getLineBindingCode(params) {
  const user = params && params.operator ? findUserByNickname(params.operator) : null;
  if (!user || user.status !== 'active' || !user.email) return { ok: false, error: '請先完成 Google 帳號綁定' };
  const code = issueLineBindingCode_(user);
  return { ok: true, command: '綁定 ' + code, expires_in_seconds: 600 };
}

function addTask(params) {
  const notifications = [];
  const result = withRecordWriteLock_(function () { return addTaskLocked_(params, notifications); });
  if (result.ok) notifications.forEach(function (item) {
    try { notifyUser_(item.user, item.title, item.body); }
    catch (error) { result.warning = '事項已儲存，但通知未完成'; }
  });
  return result;
}

function addTaskLocked_(params, notifications) {
  const { title, created_by } = params;
  if (!String(title || '').trim()) return { ok: false, error: '缺少事項標題' };
  const creator = findUserByNickname(created_by);
  if (!creator || !canCreateTask_(creator.role)) return { ok: false, error: '無建立事項權限' };

  let assignees = params.assignees;
  if (typeof assignees === 'string') assignees = assignees.split(',').map(s => s.trim()).filter(Boolean);
  if (!Array.isArray(assignees) || !assignees.length) return { ok: false, error: '請指定至少一位老師' };
  const requestedTaskId = String(params.task_id || '').trim();
  if (requestedTaskId && assignees.length !== 1) return { ok: false, error: '指定事項編號時只能指派一位老師' };
  const existingRequestedTask = requestedTaskId ? findObject(SHEET_NAMES.TASKS, 'task_id', requestedTaskId) : null;
  if (existingRequestedTask && existingRequestedTask.assignee !== assignees[0]) return { ok: false, error: '事項編號已由其他老師使用' };
  if (existingRequestedTask && existingRequestedTask.status === 'deleted') return { ok: false, code: 'RECORD_DELETED', error: '此事項已刪除，請另建新事項' };
  if (existingRequestedTask && existingRequestedTask.created_by !== created_by && creator.role !== 'admin') return { ok: false, error: '只能修改自己建立的事項' };

  const due = params.due_date || todayStr();
  const now = nowIso();
  let created = 0;
  let updated = 0;
  const taskIds = [];
  const taskStatuses = {};
  const taskRevisions = {};
  assignees.forEach(nk => {
    const u = findUserByNickname(nk);
    if (!u) return;
    const taskId = requestedTaskId || Utilities.getUuid();
    const existing = requestedTaskId ? existingRequestedTask : null;
    const row = {
      task_id: taskId,
      title: String(title).trim(),
      detail: params.detail || '',
      assignee: nk,
      department: normalizeDepartment_(u.department),
      due_date: due,
      status: existing ? existing.status : 'open',
      created_by: existing ? existing.created_by : created_by,
      created_at: existing ? existing.created_at : now,
      updated_at: nextTaskUpdatedAt_(existing),
      done_at: existing ? existing.done_at : ''
    };
    if (existing) {
      upsertRow(SHEET_NAMES.TASKS, 'task_id', row);
      updated++;
    } else {
      appendRow(SHEET_NAMES.TASKS, row);
      created++;
      if (params.notify !== false) notifications.push({ user: u, title: '🆕 你有新事項：' + title, body: (params.detail ? params.detail + '\n' : '') + '期限 ' + due });
    }
    taskIds.push(taskId);
    taskStatuses[taskId] = row.status;
    taskRevisions[taskId] = row.updated_at;
  });
  logSystem(created_by, 'add_task', title, { assignees: assignees, due: due, created: created, updated: updated });
  return { ok: true, created: created, updated: updated, task_ids: taskIds, task_statuses: taskStatuses, task_revisions: taskRevisions, updated_at: taskRevisions[taskIds[0]] || now };
}

/** V2 老師將自己的追蹤事項同步到雲端，供提醒排程與跨裝置使用。 */
function nextTaskUpdatedAt_(existing) {
  const previous = existing && existing.updated_at;
  const parsed = previous instanceof Date ? previous.getTime() : Date.parse(String(previous || '').replace(/^"|"$/g, ''));
  return new Date(Math.max(Date.now(), isNaN(parsed) ? 0 : parsed + 1)).toISOString();
}

function saveSelfTask(params) {
  return withRecordWriteLock_(function () { return saveSelfTaskLocked_(params); }, true);
}

function saveSelfTaskLocked_(params) {
  const nickname = String(params.nickname || '').trim();
  const user = nickname ? findUserByNickname(nickname) : null;
  const task = params.task || {};
  if (!user || user.status !== 'active') return { ok: false, error: '找不到可用帳號' };
  if (!task.id || !String(task.title || '').trim()) return { ok: false, error: '事項資料不完整' };
  const sheet = getSheet(SHEET_NAMES.TASKS);
  const headers = getHeaders(sheet);
  const keyColumn = headers.indexOf('task_id');
  if (keyColumn < 0) throw new Error('事項資料表缺少 task_id');
  const lastRow = sheet.getLastRow();
  const ids = lastRow > 1 ? sheet.getRange(2, keyColumn + 1, lastRow - 1, 1).getValues() : [];
  const index = ids.findIndex(row => String(row[0]) === String(task.id));
  const rowNumber = index < 0 ? 0 : index + 2;
  const current = rowNumber ? sheet.getRange(rowNumber, 1, 1, headers.length).getValues()[0] : [];
  const existing = rowNumber ? headers.reduce(function (obj, key, i) { obj[key] = current[i]; return obj; }, { _row: rowNumber }) : null;
  if (existing && existing.assignee !== nickname) return { ok: false, error: '不可修改其他人的事項' };
  if (existing && existing.status === 'deleted') return { ok: false, code: 'RECORD_DELETED', error: '此事項已在雲端刪除' };
  if (task.status && ['open', 'done'].indexOf(task.status) < 0) return { ok: false, error: '事項狀態不正確' };
  const assigned = existing && existing.created_by !== nickname;
  const now = nextTaskUpdatedAt_(existing);
  const record = {
    task_id: task.id,
    title: assigned ? existing.title : String(task.title || '').trim(),
    detail: assigned ? existing.detail : String(task.source || task.detail || ''),
    assignee: nickname,
    department: normalizeDepartment_(user.department),
    due_date: assigned ? existing.due_date : String(task.dueDate || todayStr()).slice(0, 10),
    status: task.status === 'done' ? 'done' : 'open',
    created_by: existing ? existing.created_by : nickname,
    created_at: existing ? existing.created_at : now,
    updated_at: now,
    done_at: task.status === 'done' ? (existing && existing.done_at || now) : '',
  };
  if (existing) {
    const same = ['title', 'detail', 'status'].every(key => String(record[key] || '') === String(existing[key] || '')) && taskDateStr_(record.due_date) === taskDateStr_(existing.due_date);
    if (same) return { ok: true, task_id: task.id, updated_at: existing.updated_at, duplicate: true };
    if (recordConflict_(task.cloudUpdatedAt, existing.updated_at)) return { ok: false, code: 'RECORD_CONFLICT', current_task: Object.assign({}, existing, { due_date: taskDateStr_(existing.due_date) }), error: '事項已在其他裝置更新，已顯示最新狀態；請確認後再操作' };
  }
  // Keep unknown columns and any existing sheet formulas untouched.
  if (existing) writeSheetFields_(sheet, rowNumber, headers, record);
  else sheet.appendRow(headers.map(function (key) { return sheetValueForWrite_(record[key]); }));
  return { ok: true, task_id: task.id, updated_at: now };
}

function deleteSelfTask(params) {
  return withRecordWriteLock_(function () { return deleteSelfTaskLocked_(params); });
}

function deleteSelfTaskLocked_(params) {
  const nickname = String(params.nickname || '').trim();
  const user = nickname ? findUserByNickname(nickname) : null;
  if (!user || user.status !== 'active') return { ok: false, error: '找不到可用帳號' };
  const existing = findObject(SHEET_NAMES.TASKS, 'task_id', params.task_id);
  if (!existing) return { ok: true, removed: false };
  if (existing.assignee !== nickname && user.role !== 'admin') return { ok: false, error: '不可刪除其他人的事項' };
  if (existing.created_by !== nickname && user.role !== 'admin') return { ok: false, error: '主管交辦事項只能由建立者或主管刪除' };
  updateRow(SHEET_NAMES.TASKS, existing._row, { status: 'deleted', updated_at: nextTaskUpdatedAt_(existing) });
  return { ok: true, removed: true };
}

function listTasks(params) {
  const { viewer, status, from, to } = params || {};
  if (!viewer) return { ok: false, error: 'missing viewer' };
  const vu = findUserByNickname(viewer);
  if (!vu) return { ok: false, error: 'viewer not found' };
  let list = sheetToObjects(SHEET_NAMES.TASKS);
  list.forEach(t => { t.due_date = taskDateStr_(t.due_date); });   // 正規化日期
  if (vu.role === 'admin' || isGlobalManager_(vu)) {
    // 全部
  } else if (vu.role === 'manager' && !isGlobalManager_(vu)) {
    list = list.filter(t => sameDepartment_(t.department, vu.department) || t.assignee === viewer || t.created_by === viewer);
  } else {
    list = list.filter(t => t.assignee === viewer || t.created_by === viewer);
  }
  const deletedIds = list.filter(t => t.status === 'deleted' || /^v2_(?:case|contact)_/.test(String(t.task_id || ''))).map(t => t.task_id);
  list = list.filter(t => deletedIds.indexOf(t.task_id) < 0);
  if (status) list = list.filter(t => t.status === status);
  if (from) list = list.filter(t => String(t.due_date) >= from);
  if (to) list = list.filter(t => String(t.due_date) <= to);
  list.sort((a, b) => String(a.due_date).localeCompare(String(b.due_date)) || cellTimestamp_(b.created_at) - cellTimestamp_(a.created_at));
  return { ok: true, tasks: list, deletedIds: deletedIds };
}

function updateTaskStatus(params) {
  return withRecordWriteLock_(function () { return updateTaskStatusLocked_(params); });
}

function updateTaskStatusLocked_(params) {
  const { task_id, status, operator } = params || {};
  if (!task_id || !status) return { ok: false, error: 'missing task_id/status' };
  if (['open', 'done'].indexOf(status) < 0) return { ok: false, error: '事項狀態不正確' };
  const existing = findObject(SHEET_NAMES.TASKS, 'task_id', task_id);
  if (!existing) return { ok: false, error: 'task not found' };
  if (existing.status === 'deleted') return { ok: false, code: 'RECORD_DELETED', error: '此事項已刪除' };
  const now = nextTaskUpdatedAt_(existing);
  updateRow(SHEET_NAMES.TASKS, existing._row, {
    status: status,
    done_at: status === 'done' ? existing.done_at || now : '',
    updated_at: now
  });
  logSystem(operator || 'system', 'update_task', task_id, { status: status });
  return { ok: true, updated_at: now };
}

function deleteTask(params) {
  return withRecordWriteLock_(function () { return deleteTaskLocked_(params); });
}

function deleteTaskLocked_(params) {
  const { task_id } = params || {};
  if (!task_id) return { ok: false, error: 'missing task_id' };
  const row = findRow(SHEET_NAMES.TASKS, 'task_id', task_id);
  if (row < 0) return { ok: false, error: 'task not found' };
  const existing = findObject(SHEET_NAMES.TASKS, 'task_id', task_id);
  updateRow(SHEET_NAMES.TASKS, row, { status: 'deleted', updated_at: nextTaskUpdatedAt_(existing) });
  return { ok: true };
}

// ===== LINE 推播 =====
function getLineToken_() {
  return PropertiesService.getScriptProperties().getProperty('LINE_TOKEN') || '';
}

function pushLine_(userId, text) {
  const token = getLineToken_();
  if (!token || !userId) return false;
  try {
    const response = UrlFetchApp.fetch('https://api.line.me/v2/bot/message/push', {
      method: 'post',
      contentType: 'application/json',
      headers: { Authorization: 'Bearer ' + token },
      payload: JSON.stringify({ to: userId, messages: [{ type: 'text', text: String(text) }] }),
      muteHttpExceptions: true
    });
    const code = response.getResponseCode();
    return code >= 200 && code < 300;
  } catch (e) { return false; }
}

// OneSignal Web Push：只使用經登入驗證後登記的 subscription ID，不再相信前端自填 external_id。
function oneSignalAttempts_(appId, key, subscriptionId, title, message, targetUrl) {
  const link = String(targetUrl || 'https://teacher.blockplanetcamp.com/index.html?notify=1');
  return [
    { url: 'https://api.onesignal.com/notifications', auth: 'Key ' + key,
      body: { app_id: appId, target_channel: 'push', include_subscription_ids: [String(subscriptionId)], headings: { en: title }, contents: { en: message }, url: link } },
    { url: 'https://onesignal.com/api/v1/notifications', auth: 'Basic ' + key,
      body: { app_id: appId, include_player_ids: [String(subscriptionId)], headings: { en: title }, contents: { en: message }, url: link } }
  ];
}
function pushOneSignal_(externalId, title, message, targetUrl) {
  const props = PropertiesService.getScriptProperties();
  const appId = props.getProperty('ONESIGNAL_APP_ID');
  const key = props.getProperty('ONESIGNAL_REST_KEY');
  const user = externalId ? findUserByNickname(String(externalId)) : null;
  const subscriptionId = user ? String(user.push_subscription_id || '') : '';
  if (!appId || !key || !subscriptionId) return false;
  const attempts = oneSignalAttempts_(appId, key, subscriptionId, title, message, targetUrl);
  for (let i = 0; i < attempts.length; i++) {
    try {
      const r = UrlFetchApp.fetch(attempts[i].url, {
        method: 'post', contentType: 'application/json',
        headers: { Authorization: attempts[i].auth },
        payload: JSON.stringify(attempts[i].body), muteHttpExceptions: true
      });
      const code = r.getResponseCode(), txt = r.getContentText();
      if (code >= 200 && code < 300 && txt.indexOf('"recipients":0') < 0 && txt.indexOf('"errors"') < 0) return true;
    } catch (e) {}
  }
  return false;
}
// 診斷：回傳每種格式的 OneSignal 回應
function debugPush(params) {
  const props = PropertiesService.getScriptProperties();
  const appId = props.getProperty('ONESIGNAL_APP_ID');
  const key = props.getProperty('ONESIGNAL_REST_KEY');
  if (!appId || !key) return { ok: false, hasApp: !!appId, hasKey: !!key };
  const ext = String((params && params.nickname) || '柏翰');
  const user = findUserByNickname(ext);
  const subscriptionId = user ? String(user.push_subscription_id || '') : '';
  if (!subscriptionId) return { ok: false, error: '目前帳號尚未登記 APP 訂閱' };
  const attempts = oneSignalAttempts_(appId, key, subscriptionId, 'debug', 'debug push');
  const results = attempts.map(a => {
    try {
      const r = UrlFetchApp.fetch(a.url, { method: 'post', contentType: 'application/json', headers: { Authorization: a.auth }, payload: JSON.stringify(a.body), muteHttpExceptions: true });
      return { url: a.url, auth: a.auth.split(' ')[0], code: r.getResponseCode(), body: r.getContentText().slice(0, 250) };
    } catch (e) { return { url: a.url, auth: a.auth.split(' ')[0], err: String(e) }; }
  });
  return { ok: true, ext: ext, results: results };
}

// 同時發 LINE + OneSignal
function notifyUser_(user, title, body) {
  if (!user || user.status !== 'active') return;
  if (user.line_user_id) pushLine_(user.line_user_id, title + '\n━━━━━━━━\n' + body);
  pushOneSignal_(user.nickname, title, body);
}

/**
 * 群發公告（admin 專用）：發給所有 active 使用者（不含 operator 自己），LINE + OneSignal 同步
 * params: { operator(admin), title, body, roles? }  roles 逗號分隔可過濾（如 'teacher,manager'）
 * GET 可用：?action=adminBroadcast&operator=柏翰&title=...&body=...
 */
function adminBroadcast(params) {
  const u = params.operator ? findUserByNickname(params.operator) : null;
  if (!u || u.role !== 'admin') return { ok: false, error: '僅限管理員操作' };
  const title = String(params.title || '').trim();
  const body = String(params.body || '').trim();
  if (!title || !body) return { ok: false, error: 'missing title/body' };
  const roles = params.roles ? String(params.roles).split(',') : null;
  const users = sheetToObjects(SHEET_NAMES.USERS).filter(x =>
    x.status === 'active' && x.nickname !== u.nickname &&
    (!roles || roles.indexOf(x.role) >= 0)
  );
  const sent = [];
  users.forEach(x => {
    try { notifyUser_(x, title, body); sent.push(x.nickname); } catch (e) { /* 單人失敗不擋其他人 */ }
  });
  logSystem(params.operator, 'broadcast', '', { title: title, count: sent.length });
  return { ok: true, sent: sent, count: sent.length };
}

function addDaysStr_(dateStr, n) {
  const d = new Date(dateStr + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

// 共用：依模式推播。morning=當天(含逾期)、evening=隔天預告。依老師彙整成一則。
function sendTaskReminders_(mode) {
  const today = todayStr();
  const tomorrow = addDaysStr_(today, 1);
  const open = sheetToObjects(SHEET_NAMES.TASKS).filter(t => t.status === 'open' && !/^v2_(?:case|contact)_/.test(String(t.task_id || '')));
  open.forEach(t => { t.due_date = taskDateStr_(t.due_date); });   // 正規化日期
  let relevant, header;
  if (mode === 'evening') {
    relevant = open.filter(t => String(t.due_date) === tomorrow);
    header = '🌙 明日事項預告（' + tomorrow + '）';
  } else {
    relevant = open.filter(t => String(t.due_date) <= today);
    header = '☀️ 今日待辦事項提醒';
  }
  const users = sheetToObjects(SHEET_NAMES.USERS);
  const umap = {}; users.forEach(u => umap[u.nickname] = u);
  const byAssignee = {};
  relevant.forEach(t => { (byAssignee[t.assignee] = byAssignee[t.assignee] || []).push(t); });
  let sent = 0;
  Object.keys(byAssignee).forEach(nk => {
    const u = umap[nk];
    if (!u || u.status !== 'active') return;
    if (isAnqinUser(u) && (isKpiWeekend_(today) || (mode === 'evening' && isKpiWeekend_(tomorrow)))) return;
    const items = byAssignee[nk]
      .map((t, i) => (i + 1) + '. ' + t.title + '（' + t.due_date + (String(t.due_date) < today ? ' 逾期' : '') + '）')
      .join('\n');
    notifyUser_(u, header, items + '\n\n完成後請到系統標記 ✅');
    sent++;
  });
  return { ok: true, mode: mode, sent: sent };
}

// 觸發器用（不可帶參數，故拆兩個函式）
function sendMorningReminders() { return sendTaskReminders_('morning'); }
function sendEveningPreview() { return sendTaskReminders_('evening'); }

// LINE webhook：老師加好友後傳「綁定 暱稱」→ 綁定 line_user_id
function handleLineWebhook_(body) {
  const events = (body && body.events) || [];
  events.forEach(ev => {
    const userId = ev.source && ev.source.userId;
    if (!userId) return;
    if (ev.type === 'message' && ev.message && ev.message.type === 'text') {
      const text = String(ev.message.text || '').trim();
      const m = text.match(/^綁定\s*(.+)$/);
      let reply;
      if (m) {
        const verified = verifyLineBindingCode_(m[1].trim());
        const u = verified.user;
        if (!verified.ok || !u) {
          const legacyUser = findUserByNickname(m[1].trim());
          if (legacyUser && String(legacyUser.line_user_id || '') === String(userId)) {
            reply = '✅ ' + legacyUser.nickname + ' 已完成綁定。';
          } else {
            reply = '此綁定指令無效或已逾時。請先登入 KPI 系統，在「更多 → 帳號與通知」重新取得綁定指令。';
          }
        } else if (u.line_user_id && String(u.line_user_id) !== String(userId)) {
          reply = '此帳號已綁定其他 LINE，請由管理員先解除舊綁定。';
        } else {
          const sameLineUser = sheetToObjects(SHEET_NAMES.USERS).find(item => item.line_user_id && String(item.line_user_id) === String(userId) && item.nickname !== u.nickname);
          if (sameLineUser) {
            reply = '這個 LINE 已綁定「' + sameLineUser.nickname + '」，請由管理員先解除舊綁定。';
          } else {
            updateRow(SHEET_NAMES.USERS, u._row, { line_user_id: userId });
            reply = u.line_user_id ? '✅ ' + u.nickname + ' 已完成綁定。' : '✅ ' + u.nickname + ' 綁定成功！之後事項提醒會推播到這裡。';
          }
        }
      } else if (/^kpi/i.test(text)) {
        // 老闆專用：生成 KPI 日報 PDF（可能要跑一下，先回覆再推結果）
        if (ev.replyToken) replyLine_(ev.replyToken, '📄 日報生成中，約 1 分鐘後傳給你…');
        try { pushLine_(userId, handleKpiLineCommand_(userId, text)); }
        catch (e) { pushLine_(userId, '❌ 日報生成失敗：' + e.message); }
        return;
      } else {
        reply = '請先登入 KPI 系統，在「更多 → 帳號與通知」取得 LINE 綁定指令。\n（老闆可輸入「kpi」取得今日日報 PDF）';
      }
      if (ev.replyToken) replyLine_(ev.replyToken, reply);
    }
  });
}

function replyLine_(replyToken, text) {
  const token = getLineToken_();
  if (!token) return;
  try {
    UrlFetchApp.fetch('https://api.line.me/v2/bot/message/reply', {
      method: 'post',
      contentType: 'application/json',
      headers: { Authorization: 'Bearer ' + token },
      payload: JSON.stringify({ replyToken: replyToken, messages: [{ type: 'text', text: String(text) }] }),
      muteHttpExceptions: true
    });
  } catch (e) {}
}

// 一次性：在 Apps Script 編輯器執行此函式，建立兩個定時觸發器
// 晚上 20:00 預告隔天、早上 07:30 提醒當天(含逾期)
function setupTaskReminderTrigger() {
  const old = ['sendDailyTaskReminders', 'sendMorningReminders', 'sendEveningPreview'];
  ScriptApp.getProjectTriggers().forEach(t => {
    if (old.indexOf(t.getHandlerFunction()) >= 0) ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('sendEveningPreview').timeBased().everyDays(1).atHour(20).nearMinute(0).create();
  ScriptApp.newTrigger('sendMorningReminders').timeBased().everyDays(1).atHour(7).nearMinute(30).create();
  return { ok: true, msg: '已建立：晚上 20:00 預告隔天 + 早上 07:30 提醒當天' };
}
