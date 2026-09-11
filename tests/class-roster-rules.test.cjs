const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const backendSource = fs.readFileSync(path.join(root, 'apps-script/adminmarketing.gs'), 'utf8');
const codeSource = fs.readFileSync(path.join(root, 'apps-script/Code.gs'), 'utf8');
const authSource = fs.readFileSync(path.join(root, 'apps-script/auth.gs'), 'utf8');
const setupSource = fs.readFileSync(path.join(root, 'apps-script/setup.gs'), 'utf8');
const apiSource = fs.readFileSync(path.join(root, 'shared/api.js'), 'utf8');
const uiSource = fs.readFileSync(path.join(root, 'review/admin-marketing-v1/app.js'), 'utf8');
const cssSource = fs.readFileSync(path.join(root, 'review/admin-marketing-v1/styles.css'), 'utf8');

let uuid = 0;
const context = vm.createContext({
  Array, Date, Error, JSON, Math, Number, Object, RegExp, String,
  Utilities: {
    getUuid: () => `uuid-${++uuid}`,
    formatDate: date => new Date(date).toISOString().slice(0, 10),
  },
  todayStr: () => '2026-09-11',
});
vm.runInContext(backendSource, context);
context.parseUserListField_ = value => Array.isArray(value) ? value : [];

const rosterOnlySupervisor = {
  nickname: '柳丁', role: 'manager', status: 'active', work_assignments: ['talent-manager', 'class-roster-manager'],
};
assert.equal(context.userHasAdminMarketingWork_(rosterOnlySupervisor), false, '柳丁不可取得行政美宣資料權限');
assert.equal(context.userHasClassRosterWork_(rosterOnlySupervisor), true, '柳丁需有獨立班級人數權限');
assert.equal(context.userHasClassRosterWork_({ nickname: '一般老師', role: 'teacher', status: 'active', work_assignments: ['talent-pt'] }), false);
assert.equal(context.getAdminMarketingWorkspaceData({ __actor: rosterOnlySupervisor }).ok, false, '班級人數權限不得讀取其他行政資料');

const seed = context.classRosterSeedRows_();
assert.equal(seed.length, 30, '初始匯入需完整保留 30 班');
const north = seed.filter(item => item.campus === '北區');
const east = seed.filter(item => item.campus === '東橋');
assert.equal(north.length, 17);
assert.equal(east.length, 13);
assert.equal(north.reduce((sum, item) => sum + item.student_count, 0), 82, '北區確認後合計需為 82');
assert.equal(east.reduce((sum, item) => sum + item.student_count, 0), 74, '東橋逐班明細合計需為 74');
assert.equal(seed.reduce((sum, item) => sum + item.student_count, 0), 156, '確認後總人次需為 156');
assert.equal(seed.filter(item => item.student_count === 0).length, 1, '0 人班級仍需保留');
assert.equal(seed.filter(item => item.student_count < 4).length, 10, '少於 4 人的班級需正確列入招生關注');
assert.equal(seed.find(item => item.code === '北08-A').start_time, '10:30');
assert.equal(seed.find(item => item.code === '北08-A').end_time, '12:00');
assert.equal(seed.find(item => item.code === '北16').student_count, 7, '北區差額 3 人需歸入週六外星人創意積木');
assert.equal(seed.find(item => item.code === '東03').teacher, '酸酸');
assert.equal(seed.find(item => item.code === '東04').note, '老師待確認');

assert.equal(context.classRosterAdjustedCount_(0, 1), 1);
assert.equal(context.classRosterAdjustedCount_(2, -1), 1);
assert.throws(() => context.classRosterAdjustedCount_(0, -1), /0 至 999/);
assert.throws(() => context.classRosterAdjustedCount_(2, 2), /每次只能/);
assert.throws(() => context.classRosterClassInput_({
  id: 'x', code: 'X', campus: '北區', teacher: '老師', weekday: '一', course: '課程',
  start: '20:30', end: '19:00', count: 1,
}), /結束時間/);

const classRows = [{
  class_id: 'class-1', code: '北測試', campus: '北區', teacher: '皮皮', weekday: '一', course: '測試課程',
  start_time: '19:00', end_time: '20:30', student_count: 0, note: '', active: true, version: 1,
  import_batch: '', created_by: '初始匯入', updated_by: '初始匯入',
  created_at: '2026-09-11T00:00:00+08:00', updated_at: '2026-09-11T00:00:00+08:00', _row: 2,
}];
const historyRows = [];
const reminderRows = [];
context.SHEET_NAMES = {
  CLASS_ROSTER: 'ClassRoster',
  CLASS_ROSTER_HISTORY: 'ClassRosterHistory',
  CLASS_ROSTER_REMINDERS: 'ClassRosterReminders',
};
context.ensureClassRosterSheets_ = () => {};
context.withRecordWriteLock_ = callback => callback();
context.nowIso = () => '2026-09-11T12:00:00+08:00';
context.getClassRosterSnapshot_ = () => ({
  classes: classRows.map(context.classRosterClassObject_),
  history: historyRows.map(context.classRosterHistoryObject_),
  reminders: reminderRows.map(context.classRosterReminderObject_),
});
const rowsFor = sheet => sheet === 'ClassRoster' ? classRows : sheet === 'ClassRosterHistory' ? historyRows : reminderRows;
context.sheetToObjects = sheet => rowsFor(sheet);
context.findObject = (sheet, key, value) => rowsFor(sheet).find(row => String(row[key]) === String(value)) || null;
context.updateRow = (sheet, rowNumber, changes) => {
  const row = rowsFor(sheet).find(item => item._row === rowNumber);
  Object.assign(row, changes);
};
context.appendRow = (sheet, value) => {
  const rows = rowsFor(sheet);
  rows.push({ ...value, _row: rows.length + 2 });
  return rows.length + 1;
};
context.getSheet = sheet => ({ deleteRow(rowNumber) {
  const rows = rowsFor(sheet);
  const index = rows.findIndex(item => item._row === rowNumber);
  if (index >= 0) rows.splice(index, 1);
} });

const actor = { nickname: '皮皮老師', role: 'admin_staff', status: 'active', work_assignments: ['admin-marketing'] };
const firstAdjustment = context.saveClassRosterMutation({
  __actor: actor,
  request_id: 'request-adjust-1',
  operation: 'adjust',
  payload: { classId: 'class-1', version: 1, delta: 1, reason: '新增學生' },
});
assert.equal(firstAdjustment.ok, true);
assert.equal(classRows[0].student_count, 1);
assert.equal(classRows[0].version, 2);
assert.equal(historyRows.length, 1, '成功更新後必須留下異動紀錄');
assert.equal(historyRows[0].before_count, 0);
assert.equal(historyRows[0].after_count, 1);
assert.equal(historyRows[0].actor, '皮皮老師');

const duplicateAdjustment = context.saveClassRosterMutation({
  __actor: actor,
  request_id: 'request-adjust-1',
  operation: 'adjust',
  payload: { classId: 'class-1', version: 1, delta: 1, reason: '重複傳送' },
});
assert.equal(duplicateAdjustment.duplicate, true, '相同 request id 不得重複加人');
assert.equal(classRows[0].student_count, 1);
assert.equal(historyRows.length, 1);
assert.equal(context.getClassRosterData({ __actor: rosterOnlySupervisor }).classes[0].count, 1, '行政更新後柳丁需讀到同一筆班級人數');

const staleAdjustment = context.saveClassRosterMutation({
  __actor: actor,
  request_id: 'request-adjust-stale',
  operation: 'adjust',
  payload: { classId: 'class-1', version: 1, delta: 1, reason: '舊畫面送出' },
});
assert.equal(staleAdjustment.code, 'RECORD_CONFLICT', '舊版本不得覆蓋最新人數');
assert.equal(classRows[0].student_count, 1);

const retriedAdjustment = context.saveClassRosterMutation({
  __actor: rosterOnlySupervisor,
  request_id: 'request-adjust-retry',
  operation: 'adjust',
  payload: { classId: 'class-1', version: 2, delta: 1, reason: '柳丁確認新增學生' },
});
assert.equal(retriedAdjustment.ok, true, '取得最新版本後應可完成第二筆加人');
assert.equal(classRows[0].student_count, 2);
assert.equal(classRows[0].version, 3);
assert.equal(historyRows.length, 2, '兩筆成功加人需留下兩筆異動紀錄');
assert.equal(historyRows[1].actor, '柳丁', '柳丁調整需留下自己的操作者紀錄');
assert.equal(context.getClassRosterData({ __actor: actor }).classes[0].count, 2, '柳丁更新後行政需讀到同一筆班級人數');

const edited = context.saveClassRosterMutation({
  __actor: actor,
  request_id: 'request-edit-1',
  operation: 'save_class',
  payload: {
    version: 3,
    class: { id: 'class-1', code: '北測試', campus: '北區', teacher: '皮皮', weekday: '二', course: '更新課程', start: '19:00', end: '20:30', count: 99, note: '' },
  },
});
assert.equal(edited.ok, true);
assert.equal(classRows[0].student_count, 2, '編輯班級資料不得繞過異動流程改人數');
assert.equal(classRows[0].weekday, '二');

const historyBeforeMigration = historyRows.length;
classRows.push({
  class_id: 'class-roster-seed-017', code: '北16', campus: '北區', teacher: '外星人', weekday: '六', course: '創意積木',
  start_time: '09:30', end_time: '10:30', student_count: 4, note: '', active: true, version: 1,
  import_batch: '20260911-handoff-v1', created_by: '初始匯入', updated_by: '初始匯入',
  created_at: '2026-09-11T00:00:00+08:00', updated_at: '2026-09-11T00:00:00+08:00', _row: 3,
});
assert.equal(context.migrateClassRosterNorth16_(), 'confirmed', '舊版未異動資料應自動套用已確認差額');
assert.equal(classRows[1].student_count, 7);
assert.equal(classRows[1].version, 2);
assert.equal(historyRows.length, historyBeforeMigration + 1, '資料校正需留下稽核紀錄');
assert.match(historyRows.at(-1).reason, /差額 3 人/);
assert.equal(context.migrateClassRosterNorth16_(), 'confirmed', '重跑遷移應具冪等性');
assert.equal(historyRows.length, historyBeforeMigration + 1, '重跑遷移不得重複寫入紀錄');

assert.match(codeSource, /'getClassRosterData'/);
assert.match(codeSource, /'saveClassRosterMutation'/);
assert.match(authSource, /action === 'saveClassRosterMutation'[\s\S]*userHasClassRosterWork_/);
assert.match(setupSource, /CLASS_ROSTER_HISTORY[\s\S]*before_count[\s\S]*after_count/);
assert.match(apiSource, /saveClassRosterMutation: \(operation, payload = \{\}\)/);
assert.match(apiSource, /action === 'saveClassRosterMutation'[\s\S]*requestId/);
assert.match(backendSource, /CLASS_ROSTER_SEED_PROPERTY_/, '初始匯入需有一次性版本標記，重新部署不得覆蓋資料');
assert.match(backendSource, /getRange\(2, 1, seedRows\.length, classHeaders\.length\)\.setValues/, '首次 30 班需批次寫入，避免逐筆請求拖慢初次開啟');
assert.match(backendSource, /function migrateClassRosterNorth16_[\s\S]*student_count: 7[\s\S]*系統資料校正/, '既有舊版資料需安全校正北16並留下紀錄');
assert.match(backendSource, /withRecordWriteLock_/, '班級人數寫入需使用後端鎖');
assert.match(backendSource, /function userHasClassRosterWork_[\s\S]*class-roster-manager/, '班級人數需使用獨立權限，不可擴大為行政資料權限');
assert.match(uiSource, /route: 'class-roster', label: '班級人數'/);
assert.match(uiSource, /試上學生不計入/);
assert.match(uiSource, /確認班級與人數後才會寫入/);
assert.match(uiSource, /正式上課人數不能小於 0/);
assert.match(uiSource, /data-action="open-class-adjust"/);
assert.match(uiSource, /function classRosterNeedsRecruitment[\s\S]*< 4/, '少於 4 人需以一致規則判斷');
assert.match(uiSource, /class-campus-\$\{esc\(option\.value\)\}/, '全校、北區與東橋需在頁面外層提供摘要切換');
assert.match(uiSource, /for \(let attempt = 0; attempt < 3; attempt \+= 1\)[\s\S]*operation !== 'adjust'[\s\S]*RECORD_CONFLICT[\s\S]*version: Number\(latest\.version/, '多人同時調整人數時前端需取得最新版後有限次重送');
assert.match(cssSource, /\.roster-mobile-list \{ display: none;/);
assert.match(cssSource, /\.roster-table tr\.is-low-enrollment/);
assert.match(cssSource, /\.roster-mobile-row\.is-low-enrollment/);
assert.match(cssSource, /@media \(max-width: 860px\)[\s\S]*\.roster-desktop \{ display: none;/);
assert.match(cssSource, /\.roster-mobile-list \{ display: block;/);

console.log('PASS class roster seed, validation, idempotency, version conflicts, audit log, routes, and responsive UI rules');
