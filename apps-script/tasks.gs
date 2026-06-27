/**
 * 事項系統 + LINE 推播
 * Tasks schema: task_id, title, detail, assignee, department, due_date, status(open/done), created_by, created_at, updated_at, done_at
 * Users 需有 line_user_id 欄
 * Script Property: LINE_TOKEN（LINE Messaging API channel access token）
 */

function canCreateTask_(role) {
  return role === 'admin' || role === 'manager' || role === 'admin_staff';
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

function addTask(params) {
  const { title, created_by } = params;
  if (!title) return { ok: false, error: '缺少事項標題' };
  const creator = findUserByNickname(created_by);
  if (!creator || !canCreateTask_(creator.role)) return { ok: false, error: '無建立事項權限' };

  let assignees = params.assignees;
  if (typeof assignees === 'string') assignees = assignees.split(',').map(s => s.trim()).filter(Boolean);
  if (!Array.isArray(assignees) || !assignees.length) return { ok: false, error: '請指定至少一位老師' };

  const due = params.due_date || todayStr();
  const now = nowIso();
  let created = 0;
  assignees.forEach(nk => {
    const u = findUserByNickname(nk);
    if (!u) return;
    appendRow(SHEET_NAMES.TASKS, {
      task_id: Utilities.getUuid(),
      title: String(title).trim(),
      detail: params.detail || '',
      assignee: nk,
      department: u.department,
      due_date: due,
      status: 'open',
      created_by: created_by,
      created_at: now,
      updated_at: now,
      done_at: ''
    });
    created++;
    if (params.notify !== false) notifyUser_(u, '🆕 你有新事項：' + title, (params.detail ? params.detail + '\n' : '') + '期限 ' + due);
  });
  logSystem(created_by, 'add_task', title, { assignees: assignees, due: due });
  return { ok: true, created: created };
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
  } else if (vu.role === 'manager') {
    list = list.filter(t => t.department === vu.department || t.assignee === viewer || t.created_by === viewer);
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
    UrlFetchApp.fetch('https://api.line.me/v2/bot/message/push', {
      method: 'post',
      contentType: 'application/json',
      headers: { Authorization: 'Bearer ' + token },
      payload: JSON.stringify({ to: userId, messages: [{ type: 'text', text: String(text) }] }),
      muteHttpExceptions: true
    });
    return true;
  } catch (e) { return false; }
}

// OneSignal Web Push（用暱稱當 external_id）。自動嘗試新版/舊版格式。
function oneSignalAttempts_(appId, key, externalId, title, message) {
  const link = 'https://teacher.blockplanetcamp.com/teacher/today.html?notify=1';
  return [
    { url: 'https://api.onesignal.com/notifications', auth: 'Key ' + key,
      body: { app_id: appId, target_channel: 'push', include_aliases: { external_id: [String(externalId)] }, headings: { en: title }, contents: { en: message }, url: link } },
    { url: 'https://onesignal.com/api/v1/notifications', auth: 'Basic ' + key,
      body: { app_id: appId, include_external_user_ids: [String(externalId)], headings: { en: title }, contents: { en: message }, url: link } }
  ];
}
function pushOneSignal_(externalId, title, message) {
  const props = PropertiesService.getScriptProperties();
  const appId = props.getProperty('ONESIGNAL_APP_ID');
  const key = props.getProperty('ONESIGNAL_REST_KEY');
  if (!appId || !key || !externalId) return false;
  const attempts = oneSignalAttempts_(appId, key, externalId, title, message);
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
  const attempts = oneSignalAttempts_(appId, key, ext, 'debug', 'debug push');
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
        const nk = m[1].trim();
        const u = findUserByNickname(nk);
        if (!u) {
          reply = '找不到暱稱「' + nk + '」，請確認後再試。';
        } else {
          updateRow(SHEET_NAMES.USERS, u._row, { line_user_id: userId });
          reply = '✅ ' + nk + ' 綁定成功！之後事項提醒會推播到這裡。';
        }
      } else {
        reply = '請輸入「綁定 你的暱稱」來接收事項提醒，例如：綁定 松鼠';
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
