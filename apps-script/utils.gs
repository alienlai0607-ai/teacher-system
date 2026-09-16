/**
 * 共用工具：Sheet 讀寫、查詢、產生 ID 等
 */

// ★ 如果 Apps Script 是「獨立」（不是從 Sheet 的擴充功能開的），
//   請把你的 Sheet ID 填在這裡（取自 Sheet 網址 /d/【這裡】/edit）
const SHEET_ID = '14JSTOpzxmjdaErdjsc-54mSsDe6bZ5Trchas-NHWTS8';
var spreadsheetHandle_ = null;

/**
 * 取得目標 Spreadsheet：
 *  1. 優先用 getActiveSpreadsheet（綁定式 Apps Script 自動可用）
 *  2. 若是獨立 Apps Script，會使用 SHEET_ID 常數
 *  3. 也可呼叫 setSheetId('xxx') 後改用 ScriptProperties
 */
function getSS() {
  // Reuse the service handle within this execution, never cached row values.
  if (spreadsheetHandle_) return spreadsheetHandle_;
  let ss = SpreadsheetApp.getActiveSpreadsheet();
  if (ss) return (spreadsheetHandle_ = ss);
  const stored = PropertiesService.getScriptProperties().getProperty('SHEET_ID');
  const id = stored || SHEET_ID;
  if (!id) {
    throw new Error('找不到 Sheet：請在 utils.gs 頂部填入 SHEET_ID，或呼叫 setSheetId("...") 一次');
  }
  return (spreadsheetHandle_ = SpreadsheetApp.openById(id));
}

/**
 * 一次性設定 Sheet ID（會存到 ScriptProperties，永久生效）
 * 用法：在 Apps Script 編輯器中執行 setSheetId('Sheet ID 字串')
 */
function setSheetId(id) {
  if (!id) throw new Error('請傳入 Sheet ID');
  PropertiesService.getScriptProperties().setProperty('SHEET_ID', id);
  spreadsheetHandle_ = null;
  return { ok: true, msg: 'Sheet ID 已設定：' + id };
}

function getSheet(name) {
  const ss = getSS();
  const sheet = ss.getSheetByName(name);
  if (!sheet) throw new Error('Sheet not found: ' + name);
  return sheet;
}

function getHeaders(sheet) {
  const lastCol = sheet.getLastColumn();
  if (lastCol === 0) return [];
  return sheet.getRange(1, 1, 1, lastCol).getValues()[0];
}

function withRecordWriteLock_(callback, beforeAnyWrite) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) return Object.assign({ ok: false, code: 'WRITE_BUSY', error: '目前有其他資料正在儲存，內容仍保留，請稍後再試' }, beforeAnyWrite === true ? { retry_safe: true } : {});
  try { return callback(); }
  finally {
    try { SpreadsheetApp.flush(); } finally { lock.releaseLock(); }
  }
}

// Receipts outlive ContentService's temporary response URL. Pending operations
// must never be replayed: the original execution may already have committed.
const RECEIPTED_ACTIONS_ = new Set([
  'saveLog', 'saveCoursePrep', 'deleteCoursePrep', 'saveTalentLesson', 'saveTalentDraft',
  'saveTalentPrep', 'deleteTalentPrep', 'reviewTalentPrep', 'updateTalentAppStatus',
  'saveTalentScore', 'addTalentMessage', 'approveTalentBonus',
  'saveAdminMarketingRecord', 'saveAdminMarketingAssignment', 'reviewAdminMarketingRecord',
  'reviewAdminMarketingTrialBonus', 'saveAdminMarketingScore', 'addAdminMarketingMessage',
  'saveClassRosterMutation', 'saveWeekly', 'addFeedback', 'markFeedbackRead',
  'addObservation', 'addPost', 'saveOKR', 'updateOKRProgress', 'saveEval',
  'addTask', 'saveSelfTask', 'deleteSelfTask', 'updateTaskStatus', 'deleteTask',
  'addStudent', 'updateStudent', 'deleteStudent'
]);

function receiptDigest_(value) {
  return Utilities.base64EncodeWebSafe(Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256, JSON.stringify(value), Utilities.Charset.UTF_8
  )).replace(/=+$/, '');
}

function receiptActorKey_(actor) {
  return receiptDigest_([actor.nickname, String(actor.email || '').toLowerCase(), actor.role, actor.department]);
}

function receiptPayloadHash_(params) {
  function sorted(value) {
    if (Array.isArray(value)) return value.map(sorted);
    if (!value || typeof value !== 'object') return value;
    const result = {};
    Object.keys(value).sort().forEach(function (key) { result[key] = sorted(value[key]); });
    return result;
  }
  const payload = {};
  Object.keys(params).forEach(function (key) {
    if (['session_token', '__actor', 'request_id'].indexOf(key) < 0) payload[key] = params[key];
  });
  return receiptDigest_(sorted(payload));
}

function mutationReceiptSheet_(create) {
  const ss = getSS();
  let sheet = ss.getSheetByName('ApiReceipts');
  if (!sheet && create) {
    sheet = ss.insertSheet('ApiReceipts');
    sheet.appendRow(['receipt_key', 'actor_key', 'action', 'request_id', 'payload_hash', 'status', 'result_base64', 'created_at', 'updated_at']);
  }
  return sheet;
}

function findMutationReceipt_(sheet, key) {
  const lastRow = sheet ? sheet.getLastRow() : 0;
  if (lastRow < 2) return null;
  const cell = sheet.getRange(2, 1, lastRow - 1, 1).createTextFinder(key).matchEntireCell(true).findNext();
  if (!cell) return null;
  return { row: cell.getRow(), values: sheet.getRange(cell.getRow(), 1, 1, 9).getValues()[0] };
}

function decodeMutationReceipt_(entry) {
  if (entry.values[5] !== 'done') return { ok: false, code: 'OPERATION_PENDING', uncertain: true, error: '正在確認上次儲存結果，內容仍保留，請稍後再試' };
  try {
    const compressed = Utilities.newBlob(Utilities.base64Decode(entry.values[6]), 'application/gzip', 'receipt.json.gz');
    const result = JSON.parse(Utilities.ungzip(compressed).getDataAsString('UTF-8'));
    if (!result || typeof result.ok !== 'boolean') throw new Error('INVALID_RECEIPT_RESULT');
    return result;
  } catch (error) {
    return { ok: false, code: 'OPERATION_INTERRUPTED', uncertain: true, request_id: String(entry.values[3]), error: '上次儲存的確認資料異常，內容仍保留；請聯絡管理員查核，勿重複新增' };
  }
}

function getMutationReceipt(params) {
  if (!params.__actor) return { ok: false, code: 'AUTH_REQUIRED' };
  const action = String(params.mutation_action || '');
  const id = String(params.mutation_id || '');
  if (!RECEIPTED_ACTIONS_.has(action) || !id || id.length > 160) return { ok: false, code: 'INVALID_RECEIPT' };
  const key = receiptDigest_([receiptActorKey_(params.__actor), action, id]);
  const entry = findMutationReceipt_(mutationReceiptSheet_(false), key);
  if (!entry) return { ok: true, state: 'not_found' };
  return { ok: true, state: entry.values[5], result: entry.values[5] === 'done' ? decodeMutationReceipt_(entry) : null };
}

function executeWithMutationReceipt_(action, params, callback) {
  if (!RECEIPTED_ACTIONS_.has(action) || !params.request_id) return callback();
  if (!params.__actor) return { ok: false, code: 'AUTH_REQUIRED' };
  const id = String(params.request_id);
  if (id.length > 160 || /^\s*=/.test(id)) return { ok: false, code: 'INVALID_REQUEST_ID', error: '儲存編號格式不正確' };
  const actorKey = receiptActorKey_(params.__actor);
  const key = receiptDigest_([actorKey, action, id]);
  const hash = receiptPayloadHash_(params);
  // Completed receipts are immutable; reading them must not queue behind writers.
  // Missing or safely retryable receipts are always checked again under the lock.
  try {
    const known = findMutationReceipt_(mutationReceiptSheet_(false), key);
    if (known && known.values[5] === 'done' && known.values[0] === key) {
      if (known.values[4] !== hash) return { ok: false, code: 'REQUEST_ID_CONFLICT', error: '這次儲存編號已用於不同內容，請重新開啟紀錄確認' };
      const result = decodeMutationReceipt_(known);
      if (result.code !== 'WRITE_BUSY' || result.retry_safe !== true || result.uncertain) return result;
    }
  } catch (error) { /* Optional read failed; the locked admission still verifies ownership. */ }
  let admitted;
  try {
    admitted = withRecordWriteLock_(function () {
    const sheet = mutationReceiptSheet_(true);
    const existing = findMutationReceipt_(sheet, key);
    if (existing) {
      if (existing.values[4] !== hash) return { ok: false, code: 'REQUEST_ID_CONFLICT', error: '這次儲存編號已用於不同內容，請重新開啟紀錄確認' };
      const previous = decodeMutationReceipt_(existing);
      // Only an explicit, durable zero-write result can be admitted again.
      if (previous.code !== 'WRITE_BUSY' || previous.retry_safe !== true || previous.uncertain) return { replay: previous };
      existing.values[5] = 'pending';
      existing.values[6] = '';
      existing.values[8] = nowIso();
      sheet.getRange(existing.row, 1, 1, 9).setValues([existing.values]);
      return { admitted: true, row: existing.row };
    }
    const now = nowIso();
    const row = sheet.getLastRow() + 1;
    sheet.appendRow([key, actorKey, action, id, hash, 'pending', '', now, now]);
    // withRecordWriteLock_ flushes before releasing this append-only allocation.
    return { admitted: true, row: row };
    }, true);
  } catch (error) {
    // Admission may have persisted before Google failed to confirm its write.
    console.error(JSON.stringify({ event: 'mutation_admission_interrupted', action: action, request_id: id }));
    return { ok: false, code: 'OPERATION_INTERRUPTED', uncertain: true, request_id: id, error: '儲存確認暫時異常，內容仍保留；請聯絡管理員查核，勿重複新增' };
  }
  if (!admitted.admitted) return admitted.replay || admitted;
  let result;
  try { result = callback(); }
  catch (error) {
    // A thrown error can follow a partial write. Keep the admission, never replay it.
    console.error(JSON.stringify({ event: 'mutation_interrupted', action: action, request_id: id, code: error.code || 'SERVER_ERROR' }));
    result = { ok: false, code: 'OPERATION_INTERRUPTED', uncertain: true, request_id: id, error: error.message || '儲存結果尚在確認，內容仍保留，請稍後再試' };
  }
  try {
    const encoded = Utilities.base64Encode(Utilities.gzip(Utilities.newBlob(JSON.stringify(result), 'application/json')).getBytes());
    if (encoded.length > 45000) throw new Error('RECEIPT_TOO_LARGE');
    // ApiReceipts is append-only. Admission owns this fixed row exclusively;
    // cleanup retires completed rows in place and never shifts live row indexes.
    SpreadsheetApp.flush();
    const sheet = mutationReceiptSheet_(false);
    const range = sheet.getRange(admitted.row, 1, 1, 9);
    const values = range.getValues()[0];
    if (values[0] !== key || values[4] !== hash || values[5] !== 'pending') throw new Error('RECEIPT_OWNERSHIP_LOST');
    values[5] = 'done';
    values[6] = encoded;
    values[8] = nowIso();
    range.setValues([values]);
    SpreadsheetApp.flush();
  } catch (error) {
    // Do not turn a confirmed business result into failure because telemetry failed.
    console.error(JSON.stringify({ event: 'receipt_persist_failed', action: action, request_id: id, code: String(error.message || 'RECEIPT_ERROR').slice(0, 80) }));
  }
  return result;
}

function cellTimestamp_(value) {
  const time = value instanceof Date ? value.getTime() : Date.parse(String(value || '').replace(/^"|"$/g, ''));
  return isNaN(time) ? 0 : time;
}

function recordConflict_(expected, current) {
  function normalized(value) {
    if (!value) return '';
    if (Object.prototype.toString.call(value) === '[object Date]') return String(value.getTime());
    const text = String(value).trim().replace(/^"|"$/g, '');
    if (/^\d{4}-\d{2}-\d{2}[T\s]/.test(text) || /^[A-Z][a-z]{2}\s[A-Z][a-z]{2}\s\d{2}\s\d{4}/.test(text)) {
      const timestamp = new Date(text).getTime();
      if (!isNaN(timestamp)) return String(timestamp);
    }
    return text;
  }
  return normalized(expected) !== normalized(current);
}

function recordConflictResult_(currentRecord) {
  const result = { ok: false, code: 'RECORD_CONFLICT', error: '這筆資料剛有更新；系統會合併最新內容後再儲存' };
  if (currentRecord) result.current_record = currentRecord;
  return result;
}

function withResourceLease_(resource, callback) {
  const props = PropertiesService.getScriptProperties();
  const key = 'RESOURCE_LEASE_' + resource;
  const lease = String(Date.now() + 420000);
  const acquired = withRecordWriteLock_(function () {
    if (Number(props.getProperty(key) || 0) > Date.now()) return false;
    props.setProperty(key, lease);
    return true;
  });
  if (acquired !== true) return { ok: false, code: 'DELIVERY_IN_PROGRESS', error: '這份日報正在處理，不必重送紀錄' };
  try { return callback(); }
  finally { if (props.getProperty(key) === lease) props.deleteProperty(key); }
}

function reportClientMetrics(params) {
  if (!params.__actor) return { ok: false, code: 'AUTH_REQUIRED' };
  const events = (Array.isArray(params.events_batch) ? params.events_batch : []).slice(0, 50).map(function (item) {
    const safe = value => String(value || '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 160);
    return { kind: item.kind === 'attempt' ? 'attempt' : 'operation', action: safe(item.action).slice(0, 70), ok: item.ok === true, code: safe(item.code).slice(0, 70), uncertain: item.uncertain === true, recovered: item.recovered === true, request_id: safe(item.request_id), attempt: Math.max(0, Math.min(20, Number(item.attempt) || 0)), phase: safe(item.phase).slice(0, 30), stage: safe(item.stage).slice(0, 30), status: Math.max(0, Math.min(599, Number(item.status) || 0)), ms: Math.max(0, Math.min(600000, Number(item.ms) || 0)) };
  });
  if (!events.length) return { ok: true };
  const ss = getSS();
  let sheet = ss.getSheetByName('ClientMetrics');
  if (!sheet) {
    const result = withRecordWriteLock_(function () {
      const found = ss.getSheetByName('ClientMetrics') || ss.insertSheet('ClientMetrics');
      ensureHeaders(found, ['at', 'role', 'events_json']);
      return found;
    });
    if (result.ok === false) return result;
    sheet = result;
  }
  sheet.appendRow([nowIso(), params.__actor.role, JSON.stringify(events)]);
  return { ok: true, received: events.length };
}

function getReliabilityMetrics_() {
  const sheet = getSS().getSheetByName('ClientMetrics');
  if (!sheet || sheet.getLastRow() < 2) return { samples: 0, notice: '尚未收到正式操作統計' };
  const from = Math.max(2, sheet.getLastRow() - 999);
  const rows = sheet.getRange(from, 1, sheet.getLastRow() - from + 1, 3).getValues();
  const actions = {};
  const attempts = {};
  rows.forEach(function (row) {
    (parseJsonField(row[2]) || []).forEach(function (event) {
      const groups = event.kind === 'attempt' ? attempts : actions;
      const group = groups[event.action] || (groups[event.action] = { samples: 0, failures: 0, uncertain: 0, recovered: 0, times: [] });
      group.samples += 1;
      if (!event.ok) group.failures += 1;
      if (event.uncertain || ['REQUEST_TIMEOUT', 'NETWORK_ERROR', 'HTTP_ERROR', 'NON_JSON_RESPONSE', 'AUTH_CHECK_UNCERTAIN', 'OPERATION_PENDING'].indexOf(event.code) >= 0) group.uncertain += 1;
      if (event.recovered) group.recovered += 1;
      group.times.push(event.ms);
    });
  });
  [actions, attempts].forEach(function (groups) { Object.keys(groups).forEach(function (key) {
    const group = groups[key];
    group.times.sort(function (a, b) { return a - b; });
    group.p95ms = group.times[Math.ceil(group.times.length * 0.95) - 1];
    delete group.times;
  }); });
  return { batches: rows.length, from: rows[0][0], to: rows[rows.length - 1][0], actions: actions, attempts: attempts, notice: '操作結果與個別連線分開統計；不包含尚未恢復連線的裝置' };
}

function backupSheetFingerprint_(sheet) {
  const rows = sheet.getLastRow();
  const columns = sheet.getLastColumn();
  const chunks = [];
  for (let start = 1; start <= rows && columns > 0; start += 500) {
    const range = sheet.getRange(start, 1, Math.min(500, rows - start + 1), columns);
    const values = range.getValues();
    const formulas = range.getFormulas();
    const cells = values.map(function (row, r) { return row.map(function (value, c) { return formulas[r][c] ? { formula: formulas[r][c] } : value; }); });
    chunks.push(Utilities.base64Encode(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, JSON.stringify(cells), Utilities.Charset.UTF_8)));
  }
  return { name: sheet.getName(), rows: rows, columns: columns, chunks: chunks };
}

function backupKpiDatabaseAuto() {
  const props = PropertiesService.getScriptProperties();
  const source = getSS();
  const folderId = props.getProperty('KPI_DATABASE_BACKUP_FOLDER');
  const folder = folderId ? DriveApp.getFolderById(folderId) : DriveApp.createFolder('KPI資料庫備份');
  if (!folderId) props.setProperty('KPI_DATABASE_BACKUP_FOLDER', folder.getId());
  folder.setSharing(DriveApp.Access.PRIVATE, DriveApp.Permission.VIEW);
  const file = DriveApp.getFileById(source.getId()).makeCopy('KPI備份-' + todayStr() + '-' + Utilities.getUuid().slice(0, 8), folder);
  file.setSharing(DriveApp.Access.PRIVATE, DriveApp.Permission.VIEW);
  const restored = SpreadsheetApp.openById(file.getId());
  const expected = source.getSheets().map(backupSheetFingerprint_);
  const actual = restored.getSheets().map(backupSheetFingerprint_);
  if (JSON.stringify(expected) !== JSON.stringify(actual)) throw new Error('備份內容與來源不同，可能備份期間仍有寫入；備份保留，但不標示驗證通過');
  props.setProperty('KPI_LAST_DATABASE_BACKUP', JSON.stringify({ at: nowIso(), fileId: file.getId(), sheets: actual.length, verified: 'reopened-values-and-formulas-matched' }));
  logSystem('system', 'database_backup', file.getId(), { sheets: actual.length });
  return { ok: true, fileId: file.getId(), sheets: actual.length };
}

/**
 * date 欄正規化：Sheets 會把 yyyy-MM-dd 自動轉成 Date 物件，
 * 讀出來一律轉回字串，否則所有「按月/日比對」（String(l.date) >= from 等）全部失效
 */
function cellDateStr_(v) {
  if (v instanceof Date) return Utilities.formatDate(v, 'Asia/Taipei', 'yyyy-MM-dd');
  return v;
}

/**
 * 把 sheet 轉成 array of objects
 */
function sheetToObjects(name) {
  const sheet = getSheet(name);
  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) return [];
  const headers = getHeaders(sheet);
  const data = sheet.getRange(2, 1, lastRow - 1, headers.length).getValues();
  return data.map(row => {
    const obj = {};
    headers.forEach((h, i) => obj[h] = (h === 'date') ? cellDateStr_(row[i]) : row[i]);
    return obj;
  });
}

/**
 * 找符合條件的列號（1-based，含 header）
 */
function findRow(name, key, value) {
  const sheet = getSheet(name);
  if (sheet.getLastRow() <= 1) return -1; // 空表（只有表頭）視為找不到，避免 getRange 列數<1 報錯
  const headers = getHeaders(sheet);
  const keyCol = headers.indexOf(key);
  if (keyCol < 0) return -1;
  const data = sheet.getRange(2, keyCol + 1, sheet.getLastRow() - 1, 1).getValues();
  for (let i = 0; i < data.length; i++) {
    if (String(data[i][0]) === String(value)) return i + 2;
  }
  return -1;
}

function findObject(name, key, value) {
  const row = findRow(name, key, value);
  if (row < 0) return null;
  const sheet = getSheet(name);
  const headers = getHeaders(sheet);
  const values = sheet.getRange(row, 1, 1, headers.length).getValues()[0];
  const obj = {};
  headers.forEach((h, i) => obj[h] = (h === 'date') ? cellDateStr_(values[i]) : values[i]);
  obj._row = row;
  return obj;
}

// These helpers write application data, never formulas. Escape only formula-like
// strings at the Sheets boundary; JSON, Dates, numbers and booleans retain type.
function sheetValueForWrite_(value) {
  if (value === undefined || value === null) return '';
  if (Object.prototype.toString.call(value) === '[object Date]') return value;
  if (typeof value === 'object') return JSON.stringify(value);
  return typeof value === 'string' && /^\s*=/.test(value) ? "'" + value : value;
}

function appendRow(name, obj) {
  const sheet = getSheet(name);
  const headers = getHeaders(sheet);
  sheet.appendRow(headers.map(function (header) { return sheetValueForWrite_(obj[header]); }));
  return sheet.getLastRow();
}

// Write only supplied fields, grouping adjacent columns into one request. Reading
// then rewriting an entire row would turn stored literal '=' text into a formula
// and replace unrelated formulas with their calculated values.
function writeSheetFields_(sheet, rowNum, headers, obj) {
  let start = -1;
  let values = [];
  function flush() {
    if (start < 0) return;
    sheet.getRange(rowNum, start + 1, 1, values.length).setValues([values]);
    start = -1;
    values = [];
  }
  headers.forEach(function (header, index) {
    if (obj[header] === undefined) { flush(); return; }
    if (start < 0) start = index;
    values.push(sheetValueForWrite_(obj[header]));
  });
  flush();
}

function updateRow(name, rowNum, obj) {
  const sheet = getSheet(name);
  writeSheetFields_(sheet, rowNum, getHeaders(sheet), obj);
}

function upsertRow(name, key, obj) {
  const existing = findRow(name, key, obj[key]);
  if (existing > 0) {
    updateRow(name, existing, obj);
    return { row: existing, created: false };
  } else {
    const row = appendRow(name, obj);
    return { row, created: true };
  }
}

function deleteRow(name, rowNum) {
  if (rowNum <= 1) return; // 不刪表頭
  getSheet(name).deleteRow(rowNum);
}

function nowIso() {
  return Utilities.formatDate(new Date(), 'Asia/Taipei', "yyyy-MM-dd'T'HH:mm:ss");
}

function todayStr() {
  return Utilities.formatDate(new Date(), 'Asia/Taipei', 'yyyy-MM-dd');
}

function yearMonth(date) {
  const d = date ? new Date(date) : new Date();
  return Utilities.formatDate(d, 'Asia/Taipei', 'yyyy-MM');
}

function weekOf(date) {
  // 回傳 yyyy-Www 格式（ISO 8601 簡化版）
  const d = date ? new Date(date) : new Date();
  const onejan = new Date(d.getFullYear(), 0, 1);
  const week = Math.ceil(((d - onejan) / 86400000 + onejan.getDay() + 1) / 7);
  return d.getFullYear() + '-W' + String(week).padStart(2, '0');
}

function parseJsonField(value) {
  if (!value) return null;
  if (typeof value === 'object') return value;
  try { return JSON.parse(value); } catch (e) { return value; }
}

function logSystem(nickname, action, target, detail) {
  try {
    appendRow(SHEET_NAMES.SYSTEM_LOG, {
      timestamp: nowIso(),
      nickname: nickname || '',
      action,
      target: target || '',
      detail: detail ? JSON.stringify(detail) : '',
      ip: ''
    });
  } catch (e) {
    Logger.log('logSystem failed: ' + e.message);
  }
}
