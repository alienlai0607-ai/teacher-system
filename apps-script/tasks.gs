/**
 * 事項系統 + LINE 推播
 * Tasks schema: task_id, title, detail, assignee, department, due_date, status(open/done), created_by, created_at, updated_at, done_at
 * Users 需有 line_user_id 欄
 * Script Property: LINE_TOKEN（LINE Messaging API channel access token）
 */

function canCreateTask_(role) {
  return role === 'admin' || role === 'manager' || role === 'admin_staff';
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
    },
    triggers: {
      dailyKpiPdf: triggers.indexOf('sendDailyKpiReportAuto') >= 0,
      dailyTaskMorning: triggers.indexOf('sendMorningReminders') >= 0,
      dailyTaskEvening: triggers.indexOf('sendEveningPreview') >= 0,
      dailyTaskReminder: triggers.indexOf('sendMorningReminders') >= 0 && triggers.indexOf('sendEveningPreview') >= 0,
      talentPdfRepair: triggers.indexOf('repairMissingTalentLessonReportsAuto') >= 0,
    },
  };
}

/**
 * 管理員手動執行的正式環境實際交付驗收。
 * 每一項都會真的寫入後再讀回，並只清除本次建立的 QA 資料。
 */
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
        requireCheck_(stored.getBlob().getBytes().length > 0, '照片建立後內容為空');
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

/** 管理員一鍵補齊每日 PDF 與事項提醒排程。 */
function setupSystemAutomation(params) {
  const user = systemMaintenanceUser_(params);
  if (!user || user.role !== 'admin') return { ok: false, error: '需 admin 權限' };
  setupKpiReportTrigger();
  setupTaskReminderTrigger();
  setupTalentReportRepairTrigger();
  logSystem(user.nickname, 'setup_system_automation', '', {});
  return getSystemReadiness({ operator: user.nickname });
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
  const { title, created_by } = params;
  if (!title) return { ok: false, error: '缺少事項標題' };
  const creator = findUserByNickname(created_by);
  if (!creator || !canCreateTask_(creator.role)) return { ok: false, error: '無建立事項權限' };

  let assignees = params.assignees;
  if (typeof assignees === 'string') assignees = assignees.split(',').map(s => s.trim()).filter(Boolean);
  if (!Array.isArray(assignees) || !assignees.length) return { ok: false, error: '請指定至少一位老師' };
  const requestedTaskId = String(params.task_id || '').trim();
  if (requestedTaskId && assignees.length !== 1) return { ok: false, error: '指定事項編號時只能指派一位老師' };
  const existingRequestedTask = requestedTaskId ? findObject(SHEET_NAMES.TASKS, 'task_id', requestedTaskId) : null;
  if (existingRequestedTask && existingRequestedTask.assignee !== assignees[0]) return { ok: false, error: '事項編號已由其他老師使用' };

  const due = params.due_date || todayStr();
  const now = nowIso();
  let created = 0;
  let updated = 0;
  const taskIds = [];
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
      status: 'open',
      created_by: existing ? existing.created_by : created_by,
      created_at: existing ? existing.created_at : now,
      updated_at: now,
      done_at: ''
    };
    if (existing) {
      upsertRow(SHEET_NAMES.TASKS, 'task_id', row);
      updated++;
    } else {
      appendRow(SHEET_NAMES.TASKS, row);
      created++;
      if (params.notify !== false) notifyUser_(u, '🆕 你有新事項：' + title, (params.detail ? params.detail + '\n' : '') + '期限 ' + due);
    }
    taskIds.push(taskId);
  });
  logSystem(created_by, 'add_task', title, { assignees: assignees, due: due, created: created, updated: updated });
  return { ok: true, created: created, updated: updated, task_ids: taskIds, updated_at: now };
}

/** V2 老師將自己的追蹤事項同步到雲端，供提醒排程與跨裝置使用。 */
function saveSelfTask(params) {
  const nickname = String(params.nickname || '').trim();
  const user = nickname ? findUserByNickname(nickname) : null;
  const task = params.task || {};
  if (!user || user.status !== 'active') return { ok: false, error: '找不到可用帳號' };
  if (!task.id || !String(task.title || '').trim()) return { ok: false, error: '事項資料不完整' };
  const existing = findObject(SHEET_NAMES.TASKS, 'task_id', task.id);
  if (existing && existing.assignee !== nickname) return { ok: false, error: '不可修改其他人的事項' };
  const now = nowIso();
  upsertRow(SHEET_NAMES.TASKS, 'task_id', {
    task_id: task.id,
    title: String(task.title || '').trim(),
    detail: String(task.source || task.detail || ''),
    assignee: nickname,
    department: normalizeDepartment_(user.department),
    due_date: String(task.dueDate || todayStr()).slice(0, 10),
    status: task.status === 'done' ? 'done' : 'open',
    created_by: existing ? existing.created_by : nickname,
    created_at: existing ? existing.created_at : now,
    updated_at: now,
    done_at: task.status === 'done' ? (existing && existing.done_at || now) : '',
  });
  return { ok: true, task_id: task.id, updated_at: now };
}

function deleteSelfTask(params) {
  const nickname = String(params.nickname || '').trim();
  const user = nickname ? findUserByNickname(nickname) : null;
  if (!user || user.status !== 'active') return { ok: false, error: '找不到可用帳號' };
  const existing = findObject(SHEET_NAMES.TASKS, 'task_id', params.task_id);
  if (!existing) return { ok: true, removed: false };
  if (existing.assignee !== nickname && user.role !== 'admin') return { ok: false, error: '不可刪除其他人的事項' };
  deleteRow(SHEET_NAMES.TASKS, existing._row);
  return { ok: true, removed: true };
}

function listTasks(params) {
  const { viewer, status, from, to } = params || {};
  if (!viewer) return { ok: false, error: 'missing viewer' };
  const vu = findUserByNickname(viewer);
  if (!vu) return { ok: false, error: 'viewer not found' };
  let list = sheetToObjects(SHEET_NAMES.TASKS);
  list.forEach(t => { t.due_date = taskDateStr_(t.due_date); });   // 正規化日期
  if (vu.role === 'admin') {
    // 全部
  } else if (vu.role === 'manager' && !isGlobalManager_(vu)) {
    list = list.filter(t => sameDepartment_(t.department, vu.department) || t.assignee === viewer || t.created_by === viewer);
  } else {
    list = list.filter(t => t.assignee === viewer || t.created_by === viewer);
  }
  if (status) list = list.filter(t => t.status === status);
  if (from) list = list.filter(t => String(t.due_date) >= from);
  if (to) list = list.filter(t => String(t.due_date) <= to);
  list.sort((a, b) => String(a.due_date).localeCompare(String(b.due_date)) || String(b.created_at).localeCompare(String(a.created_at)));
  return { ok: true, tasks: list };
}

function updateTaskStatus(params) {
  const { task_id, status, operator } = params || {};
  if (!task_id || !status) return { ok: false, error: 'missing task_id/status' };
  const row = findRow(SHEET_NAMES.TASKS, 'task_id', task_id);
  if (row < 0) return { ok: false, error: 'task not found' };
  updateRow(SHEET_NAMES.TASKS, row, {
    status: status,
    done_at: status === 'done' ? nowIso() : '',
    updated_at: nowIso()
  });
  logSystem(operator || 'system', 'update_task', task_id, { status: status });
  return { ok: true };
}

function deleteTask(params) {
  const { task_id } = params || {};
  if (!task_id) return { ok: false, error: 'missing task_id' };
  const row = findRow(SHEET_NAMES.TASKS, 'task_id', task_id);
  if (row < 0) return { ok: false, error: 'task not found' };
  deleteRow(SHEET_NAMES.TASKS, row);
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
  if (!user) return;
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
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return Utilities.formatDate(d, Session.getScriptTimeZone(), 'yyyy-MM-dd');
}

// 共用：依模式推播。morning=當天(含逾期)、evening=隔天預告。依老師彙整成一則。
function sendTaskReminders_(mode) {
  const today = todayStr();
  const tomorrow = addDaysStr_(today, 1);
  const open = sheetToObjects(SHEET_NAMES.TASKS).filter(t => t.status === 'open');
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
    if (!u) return;
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
