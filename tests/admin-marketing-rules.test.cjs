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

const dailyCheck = context.validateAdminMarketingRecord_('daily_check', {
  id: 'daily-check-1', date: '2026-08-26', status: 'clear', note: '', reported: false,
});
assert.equal(dailyCheck.status, 'clear');
assert.throws(() => context.validateAdminMarketingRecord_('daily_check', {
  id: 'daily-check-2', date: '2026-08-26', status: 'needs_supervisor', note: '等待主管確認發布時間', reported: false,
}), /主動回報/);

assert.throws(() => context.validateAdminMarketingRecord_('tuesday', {
  id: 'tuesday-1', date: '2026-08-26',
  checks: { paymentList: true, expiringStudents: true, unpaidParents: true, remindersSent: true },
  followups: [{ person: '家長 A', situation: '尚未繳費', handled: '已提醒', status: 'open', nextDate: '' }],
}), /下次追蹤日期/);

assert.throws(() => context.validateAdminMarketingRecord_('environment', {
  id: 'env-1', date: '2026-08-26', checks: { counter: true }, issue: '', improvementDue: '', evidence: [],
}), /問題與改善期限/);

assert.throws(() => context.validateAdminMarketingRecord_('project', {
  id: 'project-1', date: '2026-08-26', title: '體驗週', projectType: '招生活動', summary: '海報初稿完成',
  currentStage: '美宣', dueDate: '', stages: [],
}), /日期格式/);

const trial = context.validateAdminMarketingRecord_('trial', {
  id: 'trial-1', date: '2026-08-26', studentName: '小布', course: '機器人試上', teacher: '皮皮老師',
  contactRef: '0912-345-678', interest: 'medium', owner: '皮皮老師', nextFollowupDate: '2026-08-27',
  status: 'waiting_contact', followups: [], paymentEvidence: [],
});
assert.equal(trial.status, 'waiting_contact');
assert.equal(context.adminMarketingTrialIdentity_(trial), '小布|0912345678');

assert.throws(() => context.validateAdminMarketingRecord_('trial', {
  ...trial, id: 'trial-missing-next', nextFollowupDate: '', status: 'considering',
}), /下一次追蹤日期/);
assert.throws(() => context.validateAdminMarketingRecord_('trial', {
  ...trial, id: 'trial-bad-next', nextFollowupDate: '2026-08-25', status: 'considering',
}), /不可早於試上日期/);

const convertedTrial = context.validateAdminMarketingRecord_('trial', {
  ...trial, id: 'trial-converted', status: 'converted', nextFollowupDate: '', firstEnrollment: true,
  enrollmentDate: '2026-08-26', paymentDate: '2026-08-26', enrollmentCourse: '機器人一期',
  followups: [{ id: 'followup-1', date: '2026-08-26', method: 'line', note: '家長確認報名一期' }],
  paymentEvidence: driveEvidence,
});
assert.equal(context.adminMarketingTrialBonusEligibility_(convertedTrial).eligible, true);
assert.equal(context.adminMarketingTrialBonusEligibility_(convertedTrial).amount, 50);
assert.throws(() => context.validateAdminMarketingRecord_('trial', {
  ...convertedTrial, id: 'trial-future-payment', paymentDate: '2026-08-27',
}), /不可晚於今天/);

assert.throws(() => context.validateAdminMarketingRecord_('trial', {
  ...convertedTrial, id: 'trial-no-proof', paymentEvidence: [],
}), /完成證據/);

const renewal = context.validateAdminMarketingRecord_('trial', {
  ...convertedTrial, id: 'trial-renewal', firstEnrollment: false, paymentEvidence: [],
});
assert.equal(context.adminMarketingTrialBonusEligibility_(renewal).eligible, false);
assert.match(context.adminMarketingTrialBonusEligibility_(renewal).error, /不是首次/);

assert.equal(context.validateAdminMarketingRecord_('trial_day', {
  id: 'trial-day-1', date: '2026-08-26', noTrial: true,
}).status, 'confirmed');

assert.equal(vm.runInContext('ADMIN_MARKETING_KPI_.reduce((sum, item) => sum + item.max, 0)', context), 100);

const workspacesSource = fs.readFileSync(path.join(root, 'shared/workspaces.js'), 'utf8');
const authSource = fs.readFileSync(path.join(root, 'apps-script/auth.gs'), 'utf8');
const codeSource = fs.readFileSync(path.join(root, 'apps-script/Code.gs'), 'utf8');
const setupSource = fs.readFileSync(path.join(root, 'apps-script/setup.gs'), 'utf8');
const apiSource = fs.readFileSync(path.join(root, 'shared/api.js'), 'utf8');
const uiSource = fs.readFileSync(path.join(root, 'review/admin-marketing-v1/app.js'), 'utf8');
const uiCssSource = fs.readFileSync(path.join(root, 'review/admin-marketing-v1/styles.css'), 'utf8');
const uiHtmlSource = fs.readFileSync(path.join(root, 'review/admin-marketing-v1/index.html'), 'utf8');
const adminDashboardSource = fs.readFileSync(path.join(root, 'admin/dashboard.html'), 'utf8');
const sharedUiSource = fs.readFileSync(path.join(root, 'shared/ui.js'), 'utf8');

assert.match(workspacesSource, /'皮皮': \['talent-pt', 'admin-marketing'\]/, '皮皮需同時保留才藝 PT 與行政美宣');
assert.match(workspacesSource, /'小魚': \['anqin-manager', 'talent-payroll', 'admin-marketing-manager'\]/, '小魚需保留安親主管並增加行政美宣主管');
assert.match(codeSource, /nickname: '皮皮老師'.*work_assignments: \['talent-pt', 'admin-marketing'\]/, '正式使用者種子需包含雙工作身分');
assert.match(setupSource, /nickname: '皮皮老師'.*role: 'admin_staff'.*subtype: 'marketing'/, '遷移需校正皮皮的行政美宣角色');
assert.match(authSource, /admin-marketing-manager/, '後端帳號管理需允許行政美宣主管工作區');
assert.match(codeSource, /'getAdminMarketingWorkspaceData'/);
assert.match(codeSource, /'getAdminMarketingDriveFolders'/);
assert.match(codeSource, /'reviewAdminMarketingTrialBonus'/);
assert.match(apiSource, /getAdminMarketingWorkspaceData/);
assert.match(apiSource, /getAdminMarketingDriveFolders/);
assert.match(apiSource, /saveAdminMarketingRecord/);
assert.match(apiSource, /reviewAdminMarketingTrialBonus/);
assert.match(uiSource, /type="file" multiple/, '證據需可一次選多個檔案');
assert.match(uiSource, /API\.uploadPhoto/, '圖片證據需進入 KPI 證據資料夾');
assert.match(uiSource, /API\.uploadFile/, '影片、PDF 與簡報需保留在檔案與素材資料夾');
assert.match(uiSource, /影片每週至少 2 支/);
assert.match(uiSource, /照片宣傳每週至少 3 則/);
assert.match(uiSource, /週二完成繳費、到期、續課與未繳費追蹤/);
assert.match(uiSource, /與主管對話/);
assert.match(uiSource, /route: 'cloud', label: '雲端資料'/);
assert.match(uiSource, /皮皮老師的行政美宣素材與完成證據/);
assert.match(uiSource, /completedOn: item\.actualDate \|\| record\.date/, '每週美宣成果應按實際完成日期歸週');
assert.match(uiSource, /data-record-id/, '跨日未完成工作需能從原紀錄繼續更新');
assert.match(adminDashboardSource, /id="test-user-select"/, '快速測試只需選擇老師');
assert.match(adminDashboardSource, /id="test-workspace-select"/, '快速測試需自動列出該老師的工作區');
assert.match(adminDashboardSource, /body\.classList\.add\('test-view-only'\)/, '測試入口不得先載入複雜主管總覽');
assert.match(adminDashboardSource, /sessionStorage\.setItem\(TEST_VIEW_CACHE_KEY/, '老師名單需快取以縮短重複切換等待');
assert.match(adminDashboardSource, /Promise\.allSettled\(\[loadDashboard\(\), loadImpersonateList\(\)\]\)/, '一般總覽內兩份資料需平行載入');
assert.doesNotMatch(adminDashboardSource, /test-view-grid/, '測試入口不得再使用大量老師卡片');
assert.match(sharedUiSource, /admin\/dashboard\.html\?v=20260827-test-view-fast-1#test-view/, '離開測試視角需直接回快速切換頁');
assert.match(uiSource, /data-action="open-test-view"/, '行政美宣主管視角需能進入快速測試');
assert.match(uiSource, /data-action="exit-impersonation"/, '行政美宣測試視角需能一鍵換老師');
assert.match(uiSource, /route: 'trials', label: '家長追蹤'/, '行政需有集中的家長追蹤頁');
assert.match(uiSource, /route: 'trials', label: '家長與獎金'/, '主管需有首報獎金審核頁');
assert.match(uiSource, /今日無試上/, '需區分無試上與忘記填寫');
assert.match(uiSource, /首次一期且完成繳費/, '使用規則需寫明首報獎金原則');
assert.match(uiSource, /function handleDailyCheck/, '每日訊息確認需與工作項目分開儲存');
assert.match(uiSource, /function retainedFiles/, '已上傳附件需能個別移除');
assert.match(uiSource, /remove-selected-file/, '新選附件在儲存前需能移除');
assert.match(uiSource, /function parseTrialMessage/, '登錄試上需支援貼上訊息自動辨識');
assert.match(uiSource, /data-action="parse-trial-message"/, '登錄試上需提供手動重新辨識按鈕');
assert.match(uiSource, /trialTime/, '試上時段需能帶入、儲存並重新顯示');
assert.match(uiSource, /data-trial-next/, '下一次追蹤日期需能依結案狀態動態隱藏');
assert.match(uiSource, /\['converted', 'not_enrolled'\]\.includes\(status\) \? ''/, '結案後不得殘留無效的下次追蹤日期');
assert.match(uiCssSource, /\.dialog > form \{[^}]*min-height: 0;[^}]*display: flex;[^}]*overflow: hidden;/, '彈窗表單需形成可捲動的 flex 容器');
assert.match(uiCssSource, /\.dialog-body \{[^}]*min-height: 0;[^}]*overflow-y: auto;/, '所有行政彈窗內容需可獨立向下捲動');
assert.match(uiCssSource, /\.dialog-foot \{[^}]*flex: 0 0 auto;/, '行政彈窗底部操作需固定留在畫面內');
assert.match(uiCssSource, /\.file-chip, \.selected-file \{[^}]*max-width: 100%;/, '長檔名不得撐破手機版面');
assert.match(uiHtmlSource, /app\.js\?v=20260901-admin-dialog-trial-import-1/, '行政新表單需使用獨立快取版本');
assert.equal((workspacesSource.match(/admin-marketing-v1\/index\.html\?workspace=admin-marketing(?:-manager)?&v=20260901-admin-dialog-trial-import-1/g) || []).length, 2, '行政與主管入口都需避開舊版快取');
assert.match(uiSource, /此學生已有試上追蹤紀錄，請更新原紀錄/, '前端需在重複新增時立即阻擋');
assert.match(uiSource, /列印月報/, '主管需能列印每月獎金明細');
assert.match(uiSource, /actionNode\.classList\.contains\('dialog-backdrop'\) && event\.target !== actionNode/, '點擊表單內按鈕不得被背景誤判為關閉對話框');
assert.match(uiSource, /function selectedPerformanceMonth\(\)/, '行政查看 KPI 應使用獨立的評核月份');
assert.match(uiSource, /scoreMonths\(true\)\[0\]/, '行政進入 KPI 時必須直接開啟最近一次已公布評核');
assert.match(uiSource, /if \(!isManager && state\.ui\.route === 'performance'\) state\.ui\.performanceMonth = scoreMonths\(true\)\[0\] \|\| currentMonth\(\);/, '重新進入行政 KPI 仍須回到最近一次評核');
assert.match(uiSource, /evaluationHistoryControl\('performance-history-form'/, '行政歷史評核需有確認查看按鈕');
assert.match(uiSource, /id="evaluation-selection-form"/, '主管切換評核月份需有確認查看按鈕');
assert.match(uiSource, /目前評核尚未儲存，確定要切換月份嗎/, '行政主管切換月份前需保護尚未儲存的評核');
assert.doesNotMatch(uiSource, /id="month-filter"[^>]*[\s\S]{0,120}月度評核/, '月度評核不得沿用一選即切換的通用月份欄位');
assert.match(uiSource, /柏翰互動測試/, '行政美宣測試視角需清楚標示可操作完整流程');
assert.match(uiSource, /personalStorageOwner = TEST_VIEW_MODE[\s\S]*_test_\$\{currentUser\.nickname\}/, '行政美宣測試草稿必須與真人使用者本機資料隔離');
assert.match(uiSource, /else if \(TEST_VIEW_MODE\)[\s\S]*最後寫入已攔截[\s\S]*else if \(form\.id === 'trial-form'\)/, '行政美宣所有正式表單需在處理器執行前被測試模式攔截');

console.log('PASS admin marketing validation, trial tracking, first-term bonus, roles, targets, evidence, deadlines, project stages, manager conversation, Drive access, and fast test view');
