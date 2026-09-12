/**
 * 共用工具：Sheet 讀寫、查詢、產生 ID 等
 */

// ★ 如果 Apps Script 是「獨立」（不是從 Sheet 的擴充功能開的），
//   請把你的 Sheet ID 填在這裡（取自 Sheet 網址 /d/【這裡】/edit）
const SHEET_ID = '14JSTOpzxmjdaErdjsc-54mSsDe6bZ5Trchas-NHWTS8';

/**
 * 取得目標 Spreadsheet：
 *  1. 優先用 getActiveSpreadsheet（綁定式 Apps Script 自動可用）
 *  2. 若是獨立 Apps Script，會使用 SHEET_ID 常數
 *  3. 也可呼叫 setSheetId('xxx') 後改用 ScriptProperties
 */
function getSS() {
  let ss = SpreadsheetApp.getActiveSpreadsheet();
  if (ss) return ss;
  const stored = PropertiesService.getScriptProperties().getProperty('SHEET_ID');
  const id = stored || SHEET_ID;
  if (!id) {
    throw new Error('找不到 Sheet：請在 utils.gs 頂部填入 SHEET_ID，或呼叫 setSheetId("...") 一次');
  }
  return SpreadsheetApp.openById(id);
}

/**
 * 一次性設定 Sheet ID（會存到 ScriptProperties，永久生效）
 * 用法：在 Apps Script 編輯器中執行 setSheetId('Sheet ID 字串')
 */
function setSheetId(id) {
  if (!id) throw new Error('請傳入 Sheet ID');
  PropertiesService.getScriptProperties().setProperty('SHEET_ID', id);
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

function withRecordWriteLock_(callback) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) return { ok: false, code: 'WRITE_BUSY', error: '目前有其他資料正在儲存，內容仍保留，請稍後再試' };
  try { return callback(); } finally { lock.releaseLock(); }
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
    return { action: String(item.action || '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 70), ok: item.ok === true, code: String(item.code || '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 70), ms: Math.max(0, Math.min(600000, Number(item.ms) || 0)) };
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
  rows.forEach(function (row) {
    (parseJsonField(row[2]) || []).forEach(function (event) {
      const group = actions[event.action] || (actions[event.action] = { samples: 0, failures: 0, uncertain: 0, times: [] });
      group.samples += 1;
      if (!event.ok) group.failures += 1;
      if (event.code === 'REQUEST_TIMEOUT' || event.code === 'NETWORK_ERROR') group.uncertain += 1;
      group.times.push(event.ms);
    });
  });
  Object.keys(actions).forEach(function (key) {
    const group = actions[key];
    group.times.sort(function (a, b) { return a - b; });
    group.p95ms = group.times[Math.ceil(group.times.length * 0.95) - 1];
    delete group.times;
  });
  return { batches: rows.length, from: rows[0][0], to: rows[rows.length - 1][0], actions: actions, notice: '僅統計成功回傳至伺服器的操作回報，不包含尚未恢復連線的裝置' };
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

function appendRow(name, obj) {
  const sheet = getSheet(name);
  const headers = getHeaders(sheet);
  const row = headers.map(h => {
    const v = obj[h];
    if (v === undefined || v === null) return '';
    if (Object.prototype.toString.call(v) === '[object Date]') return v;
    if (typeof v === 'object') return JSON.stringify(v);
    return v;
  });
  sheet.appendRow(row);
  return sheet.getLastRow();
}

function updateRow(name, rowNum, obj) {
  const sheet = getSheet(name);
  const headers = getHeaders(sheet);
  const current = sheet.getRange(rowNum, 1, 1, headers.length).getValues()[0];
  const newRow = headers.map((h, i) => {
    if (obj[h] === undefined) return current[i];
    const v = obj[h];
    if (v === null) return '';
    if (Object.prototype.toString.call(v) === '[object Date]') return v;
    if (typeof v === 'object') return JSON.stringify(v);
    return v;
  });
  sheet.getRange(rowNum, 1, 1, headers.length).setValues([newRow]);
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
