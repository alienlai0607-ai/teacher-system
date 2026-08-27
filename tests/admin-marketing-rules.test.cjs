const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const backendSource = fs.readFileSync(path.join(root, 'apps-script/adminmarketing.gs'), 'utf8');
const context = vm.createContext({
  Array, Date, Error, JSON, Math, Number, Object, RegExp, String,
  Utilities: {
    getUuid: () => 'test-uuid',
    formatDate: date => new Date(date).toISOString().slice(0, 10),
  },
  todayStr: () => '2026-08-26',
});
vm.runInContext(backendSource, context);

const driveEvidence = [{ fileName: '完成截圖.png', url: 'https://drive.google.com/file/d/test/view', mimeType: 'image/png' }];
const validDaily = () => ({
  id: 'daily-1',
  date: '2026-08-26',
  messages: { parentChecked: true, officialLineChecked: true, groupChecked: true, unresolved: '', reported: false },
  items: [{
    id: 'item-1', category: 'video', title: '體驗週影片', completedToday: '影片剪輯及字幕完成',
    progress: 100, status: 'completed', remaining: '', dueDate: '2026-08-26', actualDate: '2026-08-26', evidence: driveEvidence,
  }],
});
assert.equal(context.validateAdminMarketingRecord_('daily', validDaily()).status, 'submitted');

const noEvidence = validDaily();
noEvidence.items[0].evidence = [];
assert.throws(() => context.validateAdminMarketingRecord_('daily', noEvidence), /完成證據/);

const unfinished = validDaily();
unfinished.items[0] = { ...unfinished.items[0], category: 'admin', status: 'in_progress', progress: 60, remaining: '', dueDate: '', actualDate: '', evidence: [] };
assert.throws(() => context.validateAdminMarketingRecord_('daily', unfinished), /剩餘工作與預計完成日期/);

const unresolved = validDaily();
unresolved.messages.unresolved = '等待主管確認發布時間';
assert.throws(() => context.validateAdminMarketingRecord_('daily', unresolved), /主動回報/);

assert.throws(() => context.validateAdminMarketingRecord_('tuesday', {
  id: 'tuesday-1', date: '2026-08-26',
  checks: { paymentList: true, expiringStudents: true, unpaidParents: true, remindersSent: true },
  followups: [{ person: '家長 A', situation: '尚未繳費', handled: '已提醒', status: 'open', nextDate: '' }],
}), /下次追蹤日期/);

assert.throws(() => context.validateAdminMarketingRecord_('environment', {
  id: 'env-1', date: '2026-08-26', checks: { counter: true }, issue: '', improvementDue: '', evidence: [],
}), /問題與改善期限/);

assert.throws(() => context.validateAdminMarketingRecord_('project', {
  id: 'project-1', date: '2026-08-26', title: '體驗週', projectType: '招生活動',
  stages: [{ name: '企劃', status: 'active', dueDate: '', actualDate: '' }],
}), /企劃階段必須設定完成日期/);

assert.equal(vm.runInContext('ADMIN_MARKETING_KPI_.reduce((sum, item) => sum + item.max, 0)', context), 100);

const workspacesSource = fs.readFileSync(path.join(root, 'shared/workspaces.js'), 'utf8');
const authSource = fs.readFileSync(path.join(root, 'apps-script/auth.gs'), 'utf8');
const codeSource = fs.readFileSync(path.join(root, 'apps-script/Code.gs'), 'utf8');
const setupSource = fs.readFileSync(path.join(root, 'apps-script/setup.gs'), 'utf8');
const apiSource = fs.readFileSync(path.join(root, 'shared/api.js'), 'utf8');
const uiSource = fs.readFileSync(path.join(root, 'review/admin-marketing-v1/app.js'), 'utf8');

assert.match(workspacesSource, /'皮皮': \['talent-pt', 'admin-marketing'\]/, '皮皮需同時保留才藝 PT 與行政美宣');
assert.match(workspacesSource, /'小魚': \['anqin-manager', 'talent-payroll', 'admin-marketing-manager'\]/, '小魚需保留安親主管並增加行政美宣主管');
assert.match(codeSource, /nickname: '皮皮老師'.*work_assignments: \['talent-pt', 'admin-marketing'\]/, '正式使用者種子需包含雙工作身分');
assert.match(setupSource, /nickname: '皮皮老師'.*role: 'admin_staff'.*subtype: 'marketing'/, '遷移需校正皮皮的行政美宣角色');
assert.match(authSource, /admin-marketing-manager/, '後端帳號管理需允許行政美宣主管工作區');
assert.match(codeSource, /'getAdminMarketingWorkspaceData'/);
assert.match(codeSource, /'getAdminMarketingDriveFolders'/);
assert.match(apiSource, /getAdminMarketingWorkspaceData/);
assert.match(apiSource, /getAdminMarketingDriveFolders/);
assert.match(apiSource, /saveAdminMarketingRecord/);
assert.match(uiSource, /type="file" multiple/, '證據需可一次選多個檔案');
assert.match(uiSource, /API\.uploadPhoto/, '圖片證據需進入 KPI 證據資料夾');
assert.match(uiSource, /API\.uploadFile/, '影片、PDF 與簡報需保留在檔案與素材資料夾');
assert.match(uiSource, /每週至少 2 支完成影片/);
assert.match(uiSource, /每週至少 3 則照片宣傳/);
assert.match(uiSource, /週二完成繳費、到期、續課與未繳費追蹤/);
assert.match(uiSource, /與主管對話/);
assert.match(uiSource, /route: 'cloud', label: '雲端資料'/);
assert.match(uiSource, /皮皮老師的行政美宣素材與完成證據/);
assert.match(uiSource, /completedOn: item\.actualDate \|\| record\.date/, '每週美宣成果應按實際完成日期歸週');
assert.match(uiSource, /data-record-id/, '跨日未完成工作需能從原紀錄繼續更新');

console.log('PASS admin marketing validation, roles, targets, evidence, deadlines, project stages, manager conversation, and Drive access');
