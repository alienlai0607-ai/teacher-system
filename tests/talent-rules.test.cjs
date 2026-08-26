const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const backendSource = [
  fs.readFileSync(path.join(root, 'apps-script/auth.gs'), 'utf8'),
  fs.readFileSync(path.join(root, 'apps-script/talentrecords.gs'), 'utf8'),
].join('\n');
const context = vm.createContext({
  Array,
  Date,
  Error,
  JSON,
  Math,
  Number,
  Object,
  RegExp,
  String,
  console,
  decodeURIComponent,
  encodeURIComponent,
  Utilities: { getUuid: () => 'test-uuid' },
});
vm.runInContext(backendSource, context);

const schedule = context.normalizeUserSchedule_([
  { weekday: 3, time: '19:00-20:30', siteType: 'self', site: 'A 教室' },
  { weekday: 3, time: '20:30-22:00', siteType: 'self', site: 'A 教室' },
]);
assert.equal(schedule.length, 2);
assert.notEqual(schedule[0].scheduleKey, schedule[1].scheduleKey, '同日不同班次必須有不同識別碼');
assert.throws(() => context.normalizeUserSchedule_([
  { weekday: 3, time: '19:00-20:30', siteType: 'self', site: 'A 教室' },
  { weekday: 3, time: '19:00-20:30', siteType: 'self', site: 'A 教室' },
]), /重複班次/);
assert.throws(() => context.validateUserWorkConfiguration_('teacher', 'pt', ['talent-pt'], []), /至少一筆固定排班/);
assert.doesNotThrow(() => context.validateUserWorkConfiguration_('teacher', 'pt', ['talent-pt'], schedule));
assert.deepEqual(Array.from(context.normalizeRestDays_(['週一', '週日', '週一'])), ['週一', '週日']);

const pt = { employment_type: 'pt' };
const pay = (overrides = {}) => context.talentLessonPay_({
  lessonStatus: 'held',
  present: 2,
  makeup: 0,
  trial: 0,
  duration: 1.5,
  siteType: 'self',
  ...overrides,
}, pt);
assert.deepEqual({ rate: pay().rate, amount: pay().amount }, { rate: 500, amount: 750 });
assert.deepEqual({ rate: pay({ present: 5 }).rate, amount: pay({ present: 5 }).amount }, { rate: 600, amount: 900 });
assert.deepEqual({ rate: pay({ present: 8 }).rate, amount: pay({ present: 8 }).amount }, { rate: 800, amount: 1200 });
assert.equal(pay({ present: 1, makeup: 1, trial: 50 }).rate, 500, '補課計薪、體驗不計薪');
assert.deepEqual({ rate: pay({ present: 11 }).rate, amount: pay({ present: 11 }).amount, review: pay({ present: 11 }).requiresReview }, { rate: 0, amount: 0, review: true });
assert.deepEqual({ rate: pay({ present: 0, siteType: 'partner' }).rate, amount: pay({ present: 0, siteType: 'partner' }).amount }, { rate: 600, amount: 900 });
assert.equal(pay({ lessonStatus: 'cancelled' }).amount, 0);

const adminActor = { nickname: '柏翰', role: 'admin', status: 'active', department: '總部' };
const deletedTeacher = { nickname: '離職老師', role: 'teacher', status: 'deleted', department: '才藝部門', employment_type: 'pt', work_assignments: ['talent-pt'] };
assert.equal(context.talentCanAccessUser_(adminActor, deletedTeacher), false, '已刪除員工不可再進入現職資料流');
assert.equal(context.talentCanAccessHistoricalUser_(adminActor, deletedTeacher), true, '管理員仍須能查核已刪除員工的歷史資料');

const driveAttachment = context.talentAttachments_([{ fileName: 'photo.jpg', url: 'https://drive.google.com/file/d/abc/view' }], true);
assert.equal(driveAttachment[0].url, 'https://drive.google.com/file/d/abc/view');
assert.throws(() => context.talentAttachments_([{ fileName: 'fake.jpg', url: 'https://example.com/fake.jpg' }], true), /尚未完整上傳/);

const archiveSource = fs.readFileSync(path.join(root, 'apps-script/archivefiles.gs'), 'utf8');
const setupSource = fs.readFileSync(path.join(root, 'apps-script/setup.gs'), 'utf8');
const taskSource = fs.readFileSync(path.join(root, 'apps-script/tasks.gs'), 'utf8');
const codeSource = fs.readFileSync(path.join(root, 'apps-script/Code.gs'), 'utf8');
const adminUsersSource = fs.readFileSync(path.join(root, 'admin/users.html'), 'utf8');
const apiSource = fs.readFileSync(path.join(root, 'shared/api.js'), 'utf8');
const talentUiSource = fs.readFileSync(path.join(root, 'review/talent-v2/app.js'), 'utf8');
const anqinUiSource = fs.readFileSync(path.join(root, 'review/anqin-v2/app.js'), 'utf8');
assert.match(archiveSource, /function listTeacherReportFolders\(/);
assert.match(archiveSource, /item\.removeViewer\(/, '應移除已失效的舊查看權限');
assert.match(archiveSource, /item\.removeEditor\(/, '主管只能查看，不保留舊編輯權限');
assert.match(archiveSource, /function revokeKpiDriveUserAccess_\(/, '刪除員工時必須立即收回雲端檔案權限');
assert.match(archiveSource, /\['active', 'suspended', 'deleted'\]/, '雲端日報需保留離職人員歷史索引');
assert.match(archiveSource, /isActive \? getOrCreateChildFolder_/, '離職人員不可再建立空白雲端資料夾');
assert.match(setupSource, /'deleted_at', 'deleted_by'/, '使用者資料表需保存刪除稽核欄位');
assert.match(setupSource, /mergedAssignments\.indexOf\(assignment\) < 0/, '既有安親身分必須合併才藝工作身分，不能覆蓋或漏加');
assert.match(setupSource, /function migrateTalentUserProfiles\(\)/, '才藝帳號遷移需可獨立執行，避免完整初始化逾時');
assert.doesNotMatch(setupSource, /findUserByNickname\(profile\.nickname\)/, '才藝帳號遷移不得逐人重讀整張使用者表');
assert.match(setupSource, /createTextFinder\('永康教室'\)/, '舊部門名稱遷移不得掃描並重寫整欄大量資料');
assert.match(taskSource, /function systemMaintenanceUser_\(params\)/, '排程設定需支援 Apps Script 編輯器直接執行');
assert.match(taskSource, /Session\.getEffectiveUser\(\)\.getEmail\(\)/, '手動維運必須核對目前 Google 管理員');
assert.match(codeSource, /'deleteUser': \(\) => deleteUser\(params\)/, 'API 路由必須提供刪除員工操作');
assert.match(backendSource, /function deleteUser\(params\)/);
assert.match(backendSource, /confirmation !== nickname/, '刪除前必須再次輸入完整暱稱');
assert.match(backendSource, /operatorName !== '柏翰'/, '只有柏翰管理員可以執行刪除');
assert.match(backendSource, /user\.role === 'admin'/, '管理員帳號不可被刪除');
assert.match(backendSource, /status: 'deleted'/);
assert.match(backendSource, /push_subscription_id: ''/, '刪除時必須清除 APP 綁定');
assert.match(backendSource, /target\.status !== 'active'.*不能新增或修改才藝資料/s, '刪除後不得再寫入才藝資料');
assert.match(apiSource, /deleteUser: \(nickname, confirmNickname\)/);
assert.match(adminUsersSource, /顯示已刪除人員/);
assert.match(adminUsersSource, /刪除員工/);
assert.match(adminUsersSource, /歷史日報、薪資與評分會保留/);
assert.match(talentUiSource, /route: 'cloud-reports', label: '雲端日報'/);
assert.match(talentUiSource, /function settlementStaff\(/, '離職人員只應在有歷史資料的月份出現在月結');
assert.match(talentUiSource, /person\.status === 'deleted'.*deleted_at/s, 'PT 月結排課應在刪除日期截止');
assert.match(talentUiSource, /isActiveTalentTeacher\(item\.teacher\)/, '離職老師的未完成備課不可留在主管待辦');
assert.match(backendSource, /talentCanAccessHistoricalUser_\(actor, user\)/, '主管仍可補建離職人員缺失的歷史 PDF');
assert.match(talentUiSource, /離職保留/);
assert.match(anqinUiSource, /route: 'cloud-reports', label: '雲端日報'/);
assert.match(talentUiSource, /type="file"[^>]*multiple/);

console.log('PASS talent rules, schedules, attachments, employee deletion, historical payroll, cloud-report access, and multi-file controls');
