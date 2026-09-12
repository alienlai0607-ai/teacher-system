const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const backendSource = fs.readFileSync(path.join(root, 'apps-script/adminmarketing.gs'), 'utf8');
const deployedBackendSource = fs.readFileSync(path.join(root, 'apps-script/_all_in_one.gs'), 'utf8');
const context = vm.createContext({
  Array, Date, Error, JSON, Math, Number, Object, RegExp, String,
  Utilities: {
    getUuid: () => 'test-uuid',
    formatDate: date => new Date(date).toISOString().slice(0, 10),
  },
  todayStr: () => '2026-08-26',
});
vm.runInContext(backendSource, context);
context.LockService = { getScriptLock: () => ({ tryLock: () => true, releaseLock() {} }) };
const helpers = fs.readFileSync(path.join(root, 'apps-script/utils.gs'), 'utf8');
vm.runInContext(helpers.slice(helpers.indexOf('function withRecordWriteLock_'), helpers.indexOf('function reportClientMetrics')), context);
assert.equal(context.recordConflict_('2026-09-05T12:33:09.000Z', new Date('2026-09-05T20:33:09+08:00')), false, '同一時間的 ISO 字串與試算表 Date 不得誤判衝突');
assert.equal(context.recordConflict_('2026-09-05T12:33:08.000Z', new Date('2026-09-05T20:33:09+08:00')), true, '不同更新時間仍須阻擋覆蓋');
assert.equal(context.recordConflictResult_({ id: 'latest' }).current_record.id, 'latest', '衝突時需回傳最新版供前端安全合併');

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
assert.equal(context.adminMarketingStudentIdentity_(trial), '小布|0912345678');
assert.equal(context.adminMarketingTrialIdentity_(trial), '小布|0912345678|機器人試上|2026-08-26');
assert.notEqual(
  context.adminMarketingTrialIdentity_(trial),
  context.adminMarketingTrialIdentity_({ ...trial, course: '樂高小創客' }),
  '同一學生的不同試上課程必須能建立為不同預約',
);
const legacyCompatibleTrial = context.validateAdminMarketingRecord_('trial', {
  ...trial,
  id: 'trial-legacy-contact',
  contactRef: '0912-345-678｜試上 2026-08-26 機器人試上',
  contactDisplay: '0912-345-678',
});
assert.equal(legacyCompatibleTrial.contactRef, '0912-345-678', '新版後端需自動清理舊後端相容用的內部聯絡識別');
assert.equal(context.adminMarketingStudentIdentity_(legacyCompatibleTrial), '小布|0912345678');

const futureTrial = context.validateAdminMarketingRecord_('trial', {
  ...trial, id: 'trial-future', date: '2026-09-10', nextFollowupDate: '2026-08-27',
});
assert.equal(futureTrial.date, '2026-09-10');
assert.equal(futureTrial.nextFollowupDate, '2026-08-27');
assert.doesNotMatch(deployedBackendSource, /尚未結案的試上學生必須設定下一次追蹤日期|下一次追蹤日期不可早於今天/, '試上預約不得強迫行政另外維護追蹤日期');
assert.doesNotMatch(deployedBackendSource, /試上日期不可晚於今天/, '部署用合併檔不得保留未來試上限制');

const workerUser = {
  nickname: '皮皮老師', role: 'admin_staff', status: 'active', subtype: 'marketing',
  work_assignments: ['talent-pt', 'admin-marketing'],
};
const managerUser = {
  nickname: '小魚主管', role: 'teacher', status: 'active',
  work_assignments: ['anqin-manager', 'talent-payroll', 'admin-marketing-manager'],
};
context.SHEET_NAMES = { ADMIN_MARKETING_RECORDS: 'ADMIN_MARKETING_RECORDS' };
context.parseUserListField_ = value => Array.isArray(value) ? value : [];
context.findUserByNickname = nickname => nickname === workerUser.nickname ? workerUser : null;
context.findObject = () => null;
context.adminMarketingFindDuplicateTrial_ = () => null;
context.sheetToObjects = () => [];
context.nowIso = () => '2026-08-26T12:00:00.000Z';
context.upsertAdminMarketingRecord_ = (type, nickname, record) => ({ ...record, type, nickname });
const saveTrial = (actor, date, lateReason = '') => context.saveAdminMarketingRecord({
  __actor: actor,
  nickname: workerUser.nickname,
  record_type: 'trial',
  record: {
    ...trial,
    id: `trial-save-${date}`,
    date,
    nextFollowupDate: '2026-08-27',
    lateReason,
  },
});
assert.equal(saveTrial(workerUser, '2026-08-26').ok, true, '行政本人應可登記今天試上');
assert.equal(saveTrial(workerUser, '2026-09-10').ok, true, '行政本人應可預先登記未來試上');
assert.match(saveTrial(workerUser, '2026-08-25').error, /過去日期屬補登/, '行政本人不得自行補登過去試上');
assert.match(saveTrial(managerUser, '2026-08-25').error, /填寫原因/, '主管補登過去試上必須填原因');
assert.match(saveTrial(managerUser, '2026-08-14', '補登舊資料').error, /2026\/08\/15 起實施/, '起算日前的試上不得建立');
assert.equal(saveTrial(managerUser, '2026-08-15', '制度起算日補登').ok, true, '主管應可補登制度起算日的試上');
assert.equal(saveTrial(managerUser, '2026-08-25', '家長訊息延遲轉交').ok, true, '小魚應可填原因後補登過去試上');

const originalRecordObject = context.adminMarketingRecordObject_;
context.findObject = () => ({ record_id: 'trial-legacy-revision' });
context.adminMarketingRecordObject_ = () => ({
  ...trial, id: 'trial-legacy-revision', updatedAt: new Date('2026-09-05T20:33:09+08:00'), history: [],
});
const legacyRevisionUpdate = context.saveAdminMarketingRecord({
  __actor: workerUser,
  nickname: workerUser.nickname,
  record_type: 'trial',
  request_id: 'legacy-revision-update',
  record: { ...trial, id: 'trial-legacy-revision', baseRevision: '2026-09-05T12:33:09.000Z', note: '更新家長回覆' },
});
assert.equal(legacyRevisionUpdate.ok, true, '舊紀錄的試算表日期與前端 ISO 相同時必須能正常更新');
context.findObject = () => null;
context.adminMarketingRecordObject_ = originalRecordObject;

assert.doesNotThrow(() => context.validateAdminMarketingRecord_('trial', {
  ...trial, id: 'trial-missing-next', nextFollowupDate: '', status: 'considering',
}));
assert.doesNotThrow(() => context.validateAdminMarketingRecord_('trial', {
  ...trial, id: 'trial-bad-next', nextFollowupDate: '2026-08-25', status: 'considering',
}));

const convertedTrial = context.validateAdminMarketingRecord_('trial', {
  ...trial, id: 'trial-converted', status: 'converted', nextFollowupDate: '', firstEnrollment: true,
  enrollmentDate: '2026-08-26', paymentDate: '2026-08-26', enrollmentCourse: '機器人一期',
  followups: [],
  paymentEvidence: driveEvidence,
});
assert.equal(context.adminMarketingTrialBonusEligibility_(convertedTrial).eligible, true);
assert.equal(context.adminMarketingTrialBonusEligibility_(convertedTrial).amount, 50);
const halfYearTrial = context.validateAdminMarketingRecord_('trial', {
  ...convertedTrial, id: 'trial-half-year', status: 'converted_half_year', enrollmentCourse: '機器人半年班',
});
assert.equal(halfYearTrial.status, 'converted_half_year');
assert.equal(context.adminMarketingTrialBonusEligibility_(halfYearTrial).eligible, true, '首次半年報名完成繳費也應進入首報審核');
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
const workspacesCssSource = fs.readFileSync(path.join(root, 'shared/workspaces.css'), 'utf8');
const adminDashboardSource = fs.readFileSync(path.join(root, 'admin/dashboard.html'), 'utf8');
const sharedUiSource = fs.readFileSync(path.join(root, 'shared/ui.js'), 'utf8');

assert.match(workspacesSource, /'皮皮': \['talent-pt', 'admin-marketing'\]/, '皮皮需同時保留才藝 PT 與行政美宣');
assert.match(workspacesSource, /'小魚': \['anqin-manager', 'talent-payroll', 'admin-marketing-manager', 'class-roster-manager'\]/, '小魚需保留原工作區並增加班級人數入口');
assert.match(workspacesSource, /'柏翰': \['anqin-manager', 'talent-payroll', 'admin-marketing-manager', 'class-roster-manager'\]/, '柏翰需保留原工作區並增加班級人數入口');
assert.match(workspacesSource, /'柳丁': \['talent-manager', 'class-roster-manager'\]/, '柳丁只可增加班級人數入口，不得取得其他行政功能');
assert.match(codeSource, /nickname: '皮皮老師'.*work_assignments: \['talent-pt', 'admin-marketing'\]/, '正式使用者種子需包含雙工作身分');
assert.match(codeSource, /nickname: '柳丁'.*status: 'pending'.*work_assignments: \['talent-manager', 'class-roster-manager'\]/, '柳丁維持待開通並只取得才藝主管與班級人數');
assert.match(setupSource, /nickname: '皮皮老師'.*role: 'admin_staff'.*subtype: 'marketing'/, '遷移需校正皮皮的行政美宣角色');
assert.match(setupSource, /'柳丁': \['talent-manager', 'class-roster-manager'\]/, '正式上線檢查需確認柳丁的班級人數入口');
assert.match(authSource, /admin-marketing-manager/, '後端帳號管理需允許行政美宣主管工作區');
assert.match(authSource, /class-roster-manager/, '後端帳號管理需允許獨立班級人數工作區');
assert.match(uiSource, /'class-roster-manager': \{ label: '班級人數', role: 'roster', start: 'class-roster'/, '柳丁需直接進入獨立班級人數頁');
assert.match(uiSource, /roster: \[[\s\S]*route: 'class-roster'[\s\S]*\]/, '獨立班級人數工作區不得顯示其他行政導覽');
assert.match(uiSource, /const result = isRosterOnly[\s\S]*getClassRosterData[\s\S]*getAdminMarketingWorkspaceData/, '獨立班級人數頁只能讀取班級 API');
assert.match(uiSource, /isRosterOnly && existingShared\?\.version === APP_VERSION[\s\S]*\{ \.\.\.existingShared, classRoster: state\.classRoster \}/, '柳丁更新班級人數時不得覆蓋行政共用紀錄');
assert.match(backendSource, /function getAdminMarketingWorkspaceData[\s\S]*userHasAdminMarketingWork_/, '獨立班級人數權限不得讀取行政美宣資料');
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
assert.match(uiSource, /pageHead\('行政美宣主管總覽', `\$\{currentUser\.nickname\}/, '主管總覽應顯示目前登入者，不得寫死其他主管名字');
const alertTrial = { id: 'trial-qa', type: 'trial', studentName: 'QA', status: 'waiting_contact', bonusStatus: 'not_eligible', nextFollowupDate: '2026-09-07' };
const alertRuntime = vm.createContext({
  workerRecords: () => [], trialRecords: () => [alertTrial], todayIso: () => '2026-09-07',
  normalizeTrialStatus: value => value, esc: value => String(value || ''), formatDate: value => value,
  isConcludedTrialStatus: value => ['converted', 'converted_half_year', 'not_enrolled'].includes(value),
  emptyState: () => '',
});
vm.runInContext(uiSource.slice(uiSource.indexOf('function statusBadge('), uiSource.indexOf('function evidenceReady(')), alertRuntime);
vm.runInContext(uiSource.slice(uiSource.indexOf('function renderManagerAlerts('), uiSource.indexOf('function renderReviewsPage(')), alertRuntime);
assert.match(alertRuntime.renderManagerAlerts(), /已預約／待試上/);
assert.doesNotMatch(alertRuntime.renderManagerAlerts(), /not_eligible|確認獎金/);
alertTrial.status = 'converted';
alertTrial.bonusStatus = 'pending_review';
assert.match(alertRuntime.renderManagerAlerts(), /待主管確認/);
assert.match(alertRuntime.renderManagerAlerts(), /確認獎金/);
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
assert.match(uiSource, /route: 'trials', label: '試上名單'/, '行政需有簡單明確的試上名單頁');
assert.match(uiSource, /route: 'trials', label: '家長與獎金'/, '主管需有首報獎金審核頁');
assert.match(uiSource, /主管.*回覆今日工作[\s\S]*data-route="performance"/, '今日工作需直接顯示主管回覆並提供對話入口');
assert.match(uiSource, /admin-marketing-review-\$\{id\}[\s\S]*conversationRecord\.messages/, '主管逐筆回覆需同步到可來回回覆的月度對話');
assert.match(uiSource, /<strong>主管評語<\/strong>[\s\S]*score\.comment/, '老師查看已公布評核時必須看得到主管評語');
assert.match(uiSource, /今日無試上/, '需區分無試上與忘記填寫');
assert.match(uiSource, /首次正式報名且完成繳費/, '使用規則需涵蓋一期與半年首報');
assert.match(uiSource, /function handleDailyCheck/, '每日訊息確認需與工作項目分開儲存');
assert.match(uiSource, /const communication = todayCommunication\(\)/, '每日工作頁需依獨立訊息確認紀錄判定，不得把新增工作誤當已檢查訊息');
const dailyRecordSource = uiSource.slice(uiSource.indexOf('function renderDailyRecord('), uiSource.indexOf('function renderTuesdayPage('));
assert.doesNotMatch(dailyRecordSource, /progress-label|item\.progress|%<\/strong>/, '行政工作紀錄不得用主觀百分比增加填寫與判讀負擔');
assert.match(dailyRecordSource, /<strong>下一步：<\/strong>/, '未完成工作只需客觀顯示下一步');
assert.match(uiSource, /請填寫工作類型、工作名稱與本次處理結果/, '前端缺件訊息需使用畫面上的欄位名稱');
assert.match(backendSource, /每項工作都要填寫工作類型、工作名稱與本次處理結果/, '後端缺件訊息需與前端欄位一致');
assert.match(uiSource, /function retainedFiles/, '已上傳附件需能個別移除');
assert.match(uiSource, /remove-selected-file/, '新選附件在儲存前需能移除');
assert.match(uiSource, /const selectedFilesByInput = new WeakMap\(\)/, '分次選檔需保留先前已選附件，不能被下一次選取取代');
assert.match(uiSource, /function mergeSelectedFiles\([\s\S]*selectedFileKey[\s\S]*input\.value = ''/, '分次選檔需累加、去重，且允許再次選取同一檔案');
assert.match(uiSource, /const MAX_ADMIN_FILE_BYTES = 25 \* 1024 \* 1024/, '行政附件上限需與正式雲端 25 MB 規則一致');
assert.match(uiSource, /const source = isImageFile\(file\) \? await compressAdminImage\(file\) : file;[\s\S]*if \(PREVIEW_MODE\)/, '審查模式也需實際執行大圖壓縮');
assert.match(uiSource, /failed\.push\(`\$\{file\.name\}[\s\S]*if \(failed\.length && !output\.length\)/, '單一附件失敗不得讓其餘成功檔案全部遺失');
assert.match(uiSource, /function parseTrialMessage/, '登錄試上需支援貼上訊息自動辨識');
assert.match(uiSource, /data-action="parse-trial-message"/, '登錄試上需提供手動重新辨識按鈕');
assert.match(uiSource, /recognized\.length[\s\S]*欄位已有相同內容/, '重複按辨識時不得把已成功帶入的資料誤報為未辨識');
assert.match(uiSource, /button\.setAttribute\('aria-busy', 'true'\)[\s\S]*正在處理/, '附件壓縮或儲存期間需提供明確忙碌狀態並防止重複送出');
assert.doesNotMatch(uiSource, /renderIcons\(\)/, '行政表單收尾不得呼叫不存在的圖示函式');
assert.match(uiSource, /button\?\.isConnected[\s\S]*hydrateIcons\(\)/, '行政表單完成後需恢復按鈕並重新繪製圖示');
assert.match(uiSource, /return iso;/, '貼上訊息時需能辨識未來試上日期');
assert.doesNotMatch(uiSource, /id="trial-date"[^>]*max=/, '預約試上日期不得限制為今天以前');
assert.match(uiSource, /const TRIAL_START_DATE = '2026-08-15'/, '行政試上制度需有固定起算日');
assert.match(uiSource, /id="trial-date"[^>]*min="\$\{TRIAL_START_DATE\}"/, '試上日期欄不得選擇制度起算日前日期');
assert.match(uiSource, /mayReplaceDefaultDate/, '貼上未來日期時需取代新表單預設的今天');
assert.match(uiSource, /state\.ui\.month = date\.slice\(0, 7\)/, '跨月試上儲存後需切到預約月份');
assert.match(uiSource, /trialTime/, '試上時段需能帶入、儲存並重新顯示');
assert.match(uiSource, /data-trial-next/, '下一次追蹤日期需能依結案狀態動態隱藏');
assert.match(uiSource, /isConcludedTrialStatus\(status\) \? ''/, '一期、半年與未報名結案後不得殘留無效提醒日期');
assert.match(uiCssSource, /\.dialog > form \{[^}]*min-height: 0;[^}]*display: flex;[^}]*overflow: hidden;/, '彈窗表單需形成可捲動的 flex 容器');
assert.match(uiCssSource, /\.dialog-body \{[^}]*min-height: 0;[^}]*overflow-y: auto;/, '所有行政彈窗內容需可獨立向下捲動');
assert.match(uiCssSource, /\.dialog-foot \{[^}]*flex: 0 0 auto;/, '行政彈窗底部操作需固定留在畫面內');
assert.match(uiCssSource, /\.toast-region \{[^}]*pointer-events: none;/, '行政成功提示不得遮住下一個按鈕而誘發重複送出');
assert.match(uiCssSource, /\.file-chip, \.selected-file \{[^}]*max-width: 100%;/, '長檔名不得撐破手機版面');
assert.match(workspacesCssSource, /\.workspace-quick-switch \{[^}]*flex-wrap: wrap;/, '多工作身分列需依容器寬度換行');
assert.match(workspacesCssSource, /\.workspace-quick-options \{[^}]*flex: 1 1 280px;[^}]*flex-wrap: wrap;/, '工作身分按鈕群不得撐破行政側欄');
assert.match(workspacesCssSource, /\.workspace-quick-option \{[^}]*max-width: 100%;[^}]*flex: 1 1 112px;/, '單一工作身分按鈕不得超出容器');
assert.match(workspacesCssSource, /@media \(max-width: 820px\)[\s\S]*\.workspace-quick-switch \{[^}]*flex-direction: column;[^}]*flex-wrap: nowrap;/, '手機直向排列不得因換行規則產生多餘高度');
assert.match(workspacesCssSource, /\.workspace-quick-title \{[^}]*width: 100%;[^}]*flex: 0 0 auto;/, '手機工作身分標題高度需依內容決定');
assert.match(workspacesCssSource, /grid-template-columns: repeat\(auto-fit, minmax\(136px, 1fr\)\)/, '手機三身分按鈕需保留可讀寬度');
assert.match(uiHtmlSource, /workspaces\.css\?v=20260901-workspace-wrap-1/, '行政頁需載入防溢出的工作身分樣式');
assert.match(uiHtmlSource, /styles\.css\?v=20260912-roster-time-2/, '班級人數版面需使用獨立快取版本');
assert.match(uiHtmlSource, /app\.js\?v=20260912-logic-audit-1/, '班級人數互動需使用獨立快取版本');
assert.match(uiHtmlSource, /shared\/roster-time\.js\?v=20260912-roster-time-2/, '舊版時間字串需要先正規化');
assert.match(uiHtmlSource, /shared\/api\.js\?v=20260912-own-roster-1/, '行政頁需載入班級人數 API 版本');
assert.match(uiHtmlSource, /shared\/workspaces\.js\?v=20260911-class-roster-access-1/, '工作切換需避開舊權限快取');
assert.match(uiSource, /\['converted_half_year', '已報名半年'\]/, '試上結果需可選擇已報名半年');
assert.match(uiSource, /result\?\.code === 'RECORD_CONFLICT'[\s\S]*result\.current_record[\s\S]*merged\.recordRevision/, '更新衝突需合併最新版後安全重試');
assert.equal((workspacesSource.match(/admin-marketing-v1\/index\.html\?workspace=(?:admin-marketing|admin-marketing-manager|class-roster-manager)&v=20260912-own-roster-1/g) || []).length, 3, '行政、主管與班級人數入口都需避開舊版快取');
assert.match(uiSource, /trialIdentity\(item\.studentName, trialContact\(item\), item\.course, item\.date\)/, '重複預約需依學生、課程與日期判定');
assert.match(uiSource, /同一學生可登記不同課程/, '行政需清楚知道同一學生可登記多門試上課');
assert.doesNotMatch(uiSource, /首報獎金至少要有一筆家長追蹤紀錄|新增一筆追蹤/, '首報不得強迫另建一筆重複的家長追蹤');
assert.doesNotMatch(backendSource, /首報獎金需至少有一筆家長追蹤紀錄|尚未留下家長追蹤紀錄/, '後端首報資格不得保留已刪除的追蹤門檻');
assert.match(uiSource, /function legacyTrialContactRef\(/, '正式後端尚未更新時，不同課程仍需取得不同的內部預約識別');
assert.match(uiSource, /contactDisplay: contactRef, contactRef: legacyTrialContactRef\(contactRef, course, date\)/, '畫面需保留原聯絡資料，不顯示內部相容識別');
assert.match(uiSource, /系統依首次正式報名與完成繳費自動建立/, '舊後端需要的首報事件應由系統自動建立，不得增加行政填寫工作');
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
