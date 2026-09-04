const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'review/anqin-v2/app.js'), 'utf8');
const styles = fs.readFileSync(path.join(root, 'review/anqin-v2/styles.css'), 'utf8');
const workspaces = fs.readFileSync(path.join(root, 'shared/workspaces.js'), 'utf8');
const sharedAuth = fs.readFileSync(path.join(root, 'shared/auth.js'), 'utf8');
const sharedApi = fs.readFileSync(path.join(root, 'shared/api.js'), 'utf8');
const apiRouter = fs.readFileSync(path.join(root, 'apps-script/Code.gs'), 'utf8');
const authBackend = fs.readFileSync(path.join(root, 'apps-script/auth.gs'), 'utf8');
const logsBackend = fs.readFileSync(path.join(root, 'apps-script/logs.gs'), 'utf8');
const evaluationBackend = fs.readFileSync(path.join(root, 'apps-script/evaluation.gs'), 'utf8');
const pdfReport = fs.readFileSync(path.join(root, 'apps-script/pdfreport.gs'), 'utf8');
const allInOneBackend = fs.readFileSync(path.join(root, 'apps-script/_all_in_one.gs'), 'utf8');
const coursePrepBackend = fs.readFileSync(path.join(root, 'apps-script/courseprep.gs'), 'utf8');
const qaHarness = fs.readFileSync(path.join(root, 'review/anqin-v2/qa-harness.js'), 'utf8');

const taskRenderer = source.slice(source.indexOf('function taskPriorityMeta('), source.indexOf('function expectedBackendDepartment('));
assert.match(taskRenderer, /function openTaskDetail\(/, '待辦事項必須能開啟完整內容對話框');
assert.match(taskRenderer, /data-action="open-task-detail"/, '每一筆事項都要有明確的查看入口');
assert.match(taskRenderer, /data-action="close-dialog">返回列表/, '對話框必須能直接返回列表');
assert.match(taskRenderer, /task-detail-copy/, '長文字必須在詳情內完整換行顯示');
assert.doesNotMatch(taskRenderer, /<table class="data-table"/, '待辦事項不得再使用手機需橫向捲動的表格');

const cloudTaskSync = source.slice(source.indexOf('async function syncTasksFromCloud('), source.indexOf('async function refreshTaskCloudData('));
assert.match(cloudTaskSync, /detail: knownSources\.includes\(remoteDetail\) \? '' : remoteDetail/, '主管說明不得再誤塞進來源標籤');
assert.match(cloudTaskSync, /source = knownSources\.includes\(remoteDetail\)/, '雲端事項需要正確辨識來源');
assert.match(source, /source: taskDetailText\(task\) \|\| task\.source/, '更新完成狀態時不得覆蓋主管原始說明');
assert.match(source, /count: \(\) => activeTaskRecords\(\)\.filter\(task => task\.owner === state\.context\.teacher && task\.status !== 'done'\)\.length/, '老師選單的待辦數量只能計算自己的未完成事項');
assert.match(source, /目前待辦（即時）/, '今日畫面需清楚標示目前待辦會即時更新');
assert.match(source, /送出當時待辦（快照）/, '歷史日報不得再把送出當時快照誤標成即時待辦');
assert.match(source, /pendingTaskSyncIds\.has\(id\)[\s\S]{0,160}\['pending', 'saving', 'error'\]/, '雲端舊資料不得覆蓋正在同步的本機完成狀態');
assert.match(source, /await updateTaskStatusWithCloudFeedback\(task, control\.checked \? 'done' : 'open'\)/, '待辦勾選必須等雲端確認後才顯示完成');
assert.match(source, /function updateTaskStatusWithCloudFeedback\([\s\S]*taskSnapshot[\s\S]*await syncTaskToCloud[\s\S]*Object\.assign\(task, taskSnapshot\)/, '待辦同步失敗時必須回復原狀，不得假裝完成');
assert.match(qaHarness, /action === 'saveSelfTask'/, '隔離驗收環境需真實保存老師自行更新的待辦');

const activeTaskSource = source.slice(source.indexOf('function isRetiredTrackingTask('), source.indexOf('function openTasks('));
const activeTaskContext = vm.createContext({
  state: {
    tasks: [
      { id: 'manual', ref: '', title: '一般待辦' },
      { id: 'v2_case_case_zhiche', ref: 'case:case_zhiche', title: '舊學生追蹤' },
      { id: 'v2_contact_contact_1', ref: 'contact:contact_1', title: '舊親師追蹤' },
    ],
  },
});
vm.runInContext(activeTaskSource, activeTaskContext);
assert.deepEqual(Array.from(activeTaskContext.activeTaskRecords()).map(item => item.id), ['manual'], '退役的學生與親師追蹤待辦不得出現在新待辦流程');
const todayTabsSource = source.slice(source.indexOf('const TODAY_TABS'), source.indexOf('const ACTIVITY_TYPES'));
const managerNavSource = source.slice(source.indexOf('const MANAGER_NAV'), source.indexOf('const TODAY_TABS'));
assert.doesNotMatch(todayTabsSource, /key: 'students'/, '今日流程不得再顯示學生追蹤分頁');
assert.doesNotMatch(managerNavSource, /route: 'students'/, '主管導覽不得再顯示學生追蹤入口');
assert.doesNotMatch(source, /function renderStudentCaseForm\(|function openStudentCaseEditor\(|function saveStudentCaseForm\(/, '退役的學生追蹤不得保留可新增或編輯表單');
assert.doesNotMatch(source, /function renderCaseDetail\(|function openCaseDetail\(/, '退役的學生追蹤不得保留可被重新接回的詳情入口');
assert.match(source, /舊版學生追蹤紀錄[\s\S]*歷史資料唯讀，不再產生待辦或影響完成度/, '既有學生追蹤只能以唯讀歷史保留');

assert.match(source, /class="evaluation-score-list"/, '老師查看主管評核時分數不可使用寬表格');
assert.match(source, /class="manager-eval-score-input"/, '主管輸入分數需要靠近評核項目');
assert.match(styles, /\.task-open-button[\s\S]*overflow-wrap: anywhere/, '待辦事項摘要需要可換行');
assert.match(styles, /\.evaluation-score-row[\s\S]*grid-template-columns: minmax\(0, 1fr\) auto/, '各項分數必須在目前畫面直接可見');
assert.match(source, /loadTeacherEvaluation\('latest'\)/, '老師進入主管評核時必須直接載入最近一次已公布結果');
assert.match(source, /data-form="evaluation-history"/, '老師查看歷史評核必須有獨立確認表單');
assert.match(source, /data-form="manager-evaluation-selection"/, '主管切換老師或月份必須先按確認');
assert.doesNotMatch(source, /data-change="evaluation-month"/, '老師選擇月份時不得尚未確認就立即載入');
assert.doesNotMatch(source, /data-change="manager-evaluation-(?:teacher|month)"/, '主管選擇老師或月份時不得尚未確認就立即載入');
assert.match(source, /目前評核尚未儲存，確定要切換查看對象嗎/, '主管切換前需保護尚未儲存的評核');
assert.match(evaluationBackend, /requestedMonth === 'latest'/, '後端需支援查詢最近一次評核');
assert.match(evaluationBackend, /filter\(item => !workerViewer \|\| item\.status === 'submitted'\)/, '老師只能將已完成評核列入最近一次與歷史清單');
assert.match(evaluationBackend, /selected_month/, '後端需回傳實際開啟的評核月份');

const getEvalSource = evaluationBackend.slice(evaluationBackend.indexOf('function getEval('), evaluationBackend.indexOf('function listEvals('));
const submittedJune = { eval_id: 'EVAL-2026-06-紅豆', nickname: '紅豆', year_month: '2026-06', status: 'submitted' };
const draftJuly = { eval_id: 'EVAL-2026-07-紅豆', nickname: '紅豆', year_month: '2026-07', status: 'draft' };
const submittedMay = { eval_id: 'EVAL-2026-05-紅豆', nickname: '紅豆', year_month: '2026-05', status: 'submitted' };
const evalRows = [submittedJune, draftJuly, submittedMay];
const evalContext = vm.createContext({
  SHEET_NAMES: { TEACHER_EVAL: 'TeacherEval', MANAGER_EVAL: 'ManagerEval' },
  findUserByNickname: nickname => nickname === '紅豆'
    ? { nickname: '紅豆', role: 'teacher', status: 'active', department: '東橋教室' }
    : nickname === '小魚'
      ? { nickname: '小魚', role: 'manager', status: 'active', department: '東橋教室' }
      : null,
  sameDepartment_: (a, b) => a === b,
  isGlobalManager_: () => false,
  sheetToObjects: () => evalRows,
  findObject: (_sheet, _key, value) => evalRows.find(item => item.eval_id === value) || null,
});
vm.runInContext(getEvalSource, evalContext);
const teacherLatest = evalContext.getEval({ nickname: '紅豆', viewer: '紅豆', year_month: 'latest' });
assert.equal(teacherLatest.eval.year_month, '2026-06', '老師最近一次不得誤開尚未公布的七月草稿');
assert.deepEqual(Array.from(teacherLatest.months), ['2026-06', '2026-05']);
const managerLatest = evalContext.getEval({ nickname: '紅豆', viewer: '小魚', year_month: 'latest' });
assert.equal(managerLatest.eval.year_month, '2026-07', '主管可直接回到最近處理的評核草稿');

const dailyTrackRules = source.slice(source.indexOf('function activityTrackMeta('), source.indexOf('function activityDetailSchema('));
assert.match(dailyTrackRules, /學科外｜特色課程/, '特色課程入口需清楚標示');
assert.match(dailyTrackRules, /return tracks\.academic\.covered \|\| tracks\.enrichment\.covered;/, '日結需接受學科內或學科外至少一筆');
assert.match(source, /blockers\.push\('新增一筆學科內或學科外紀錄'\)/, '兩類皆未填時才可阻擋日結');
assert.match(source, /!tracks\.enrichment\.covered \|\| tracks\.enrichment\.items\.every\(weeklyActivityCoreReady\)/, '週整理須將沒有特色課程視為正常');
assert.match(source, /tracks\.enrichment\.covered && !enrichmentReady/, '若已新增特色課程但內容不完整仍須列為缺件');
assert.match(source, /每日兩類至少擇一/, '主管審查頁必須使用相同規則說明');
assert.match(source, /id="activity-track-indicator">\$\{renderActivityTrackIndicator\(value\.type\)\}/, '課程表單內要顯示目前選定的紀錄類型');
assert.match(styles, /\.daily-track-row\.is-optional:not\(\.is-covered\)/, '選填的特色課程不得以紅色缺件樣式呈現');
assert.match(source, /const TEST_VIEW_MODE = INITIAL_AUTH_SESSION\?\.impersonate === true/, '安親需以登入代看狀態啟用互動測試');
assert.match(source, /const TEST_VIEW_WRITE_ACTIONS = new Set\([\s\S]*'send-feedback-message'[\s\S]*'confirm-delete'[\s\S]*'export-monthly-archive'/, '安親測試視角必須攔截對話、刪除與正式歸檔');
assert.match(source, /if \(TEST_VIEW_MODE\)[\s\S]{0,220}表單流程正常，最後寫入已攔截/, '安親表單需在正式寫入前由測試模式攔截');
assert.match(source, /TEST_VIEW_MODE && fileInput[\s\S]{0,220}不會上傳正式檔案/, '安親測試視角選擇附件後不得上傳正式檔案');
assert.match(source, /可以開啟、輸入與切換完整流程/, '安親測試狀態需明確說明可互動範圍');
assert.match(qaHarness, /failOnceActions[\s\S]*QA 模擬網路中斷/, '隔離驗收頁需能重現一次性網路中斷並驗證重試流程');
assert.match(source, /if \(hasNextBatch\) scheduleCloudPreviewHydration\(\)/, '私密照片超過單批上限時必須繼續讀取下一批，不得留下空白縮圖');
assert.match(source, /先保留本機，正式送出時會再上傳/, '成果照片雲端失敗時需保留壓縮後檔案供正式送出重試');
assert.match(source, /照片已保留在這台裝置，正式送出時會再上傳/, '班務照片雲端失敗時也需保留本機副本');
assert.match(source, /function applyPreviewReviewContext\(/, '安親審查模式需以同一個身份來源同步角色、教室與主管');
assert.match(source, /if \(!applyPreviewReviewContext\(control\.dataset\.role\)\) state\.ui\.role = control\.dataset\.role/, '切換審查角色時必須同步身份範圍');
assert.match(source, /applyPreviewReviewContext\(LOCAL_REVIEW_ROLE\)/, '網址指定主管視角時首次載入就必須套用正確身份');
assert.match(source, /GLOBAL_MANAGER_NICKNAMES\.some\(name => sameReviewIdentity\(name, managerNickname\)\)/, '小魚在審查與正式登入都必須擁有全教室檢視範圍');
assert.equal((workspaces.match(/review\/anqin-v2\/index\.html\?v=20260904-parent-communication-1/g) || []).length, 2, '安親老師與主管切換入口都必須帶入本次版本碼');
assert.match(sharedAuth, /review\/anqin-v2\/index\.html\?v=20260904-parent-communication-1/, '登入備援路徑也必須避開舊版快取');

const startupSafetySource = source.slice(source.indexOf('function stripEmbeddedMediaJson('), source.indexOf('function loadState()'));
const startupSafetyContext = vm.createContext({ JSON, Number, Set });
vm.runInContext(startupSafetySource, startupSafetyContext);
const oversizedPhoto = `data:image/jpeg;base64,${'A'.repeat(20000)}`;
const strippedStartupJson = startupSafetyContext.stripEmbeddedMediaJson(JSON.stringify({ note: '保留文字', dataUrl: oversizedPhoto }));
assert.equal(JSON.parse(strippedStartupJson).note, '保留文字', '安全啟動清理照片時必須保留文字內容');
assert.equal(JSON.parse(strippedStartupJson).dataUrl, '', '安全啟動不得再次解析大型內嵌照片');
assert.match(source, /if \(SAFE_START_MODE\) backupRaw = localStorage\.getItem\(BACKUP_KEY\)[\s\S]{0,80}else raw = localStorage\.getItem\(STORAGE_KEY\)/, '安全模式不得讀取可能造成閃退的主要大型暫存');
const loadStateSource = source.slice(source.indexOf('function loadState()'), source.indexOf('let state = loadState()'));
assert.match(loadStateSource, /backupRaw = localStorage\.getItem\(BACKUP_KEY\)/, '安全模式需讀取不含照片的文字備份');
assert.match(loadStateSource, /if \(SAFE_START_MODE\)[\s\S]*return normalizeLoadedState\(safeBackup\)/, '安全模式需直接由文字備份復原');
assert.match(source, /embeddedMediaCharacters\(state, MAX_PERSISTED_MEDIA_CHARS\)/, '一般儲存需在照片暫存過大前自動改用雲端附件');
assert.doesNotMatch(source.slice(source.indexOf("function persist(message = '草稿已儲存')"), source.indexOf('function schedulePersist()')), /clone\(state\)/, '每次儲存不得再複製整份含照片資料');
assert.match(source, /const safePayload = JSON\.parse\(serializeStateForStorage\(payload, true\)\)/, '未送出表單草稿不得重複保存 Base64 照片');
assert.match(source, /const historyDays = SAFE_START_MODE \? 62 : 366/, '安全開啟第一次同步不得一次載入一整年紀錄');
assert.match(source, /function maybeShowPushPermissionReminder\(\)[\s\S]{0,100}if \(SAFE_START_MODE\) return/, '安全開啟不得同時啟動通知權限流程');

const activityFormSource = source.slice(source.indexOf('function renderActivitySpecificFields('), source.indexOf('function renderEvidenceAttachmentList('));
assert.match(activityFormSource, /if \(activityNeedsPrepSource\(type\)\) return '';/, '課業指導與學科外不得重複顯示舊課程內容欄位');
assert.match(activityFormSource, /hideStudents: type !== 'classroom'/, '只有班級經營可顯示關聯學生');
assert.match(activityFormSource, /singleCourseName \? classFieldCopy\.label : '紀錄標題'/, '學科外只保留一個類型專屬課程名稱');
assert.match(activityFormSource, /<input type="hidden" name="type"/, '進入表單後課程類型必須固定，不得再次顯示重複下拉選單');
assert.doesNotMatch(activityFormSource, /id="activity-type"/, '正式填寫表單不得再出現課程類型下拉選單');
assert.doesNotMatch(activityFormSource, /id="activity-class"|id="activity-class-label"|班級／對象/, '工作紀錄不得再要求班級或對象欄位');
assert.match(activityFormSource, /<input type="hidden" name="className"/, '舊紀錄的班級值需隱藏保留，避免編輯歷史資料時遺失');
assert.match(source, /function openActivityTypePicker\(/, '學科內外入口需先用簡單選單選定紀錄類型');
assert.match(activityFormSource, /function renderActivityResultSection\([\s\S]*activityNeedsPrepSource\(value\.type\)[\s\S]*renderActivityPrepFeedbackFields/, '課程紀錄只保留課後備課回饋');
const prepFeedbackFormSource = source.slice(source.indexOf('function renderActivityPrepFeedbackFields('), source.indexOf('function renderActivityResultSection('));
assert.doesNotMatch(prepFeedbackFormSource, /activity-prep-strengths|prepStrengths|這份教案／教材哪裡有效/, '課後回饋不得再要求重複的教案有效處');
assert.match(prepFeedbackFormSource, /activity-student-resonance[\s\S]*activity-prep-changes/, '課後回饋只保留孩子反應與下次調整');
const prepFeedbackCompletionSource = source.slice(source.indexOf('function prepFeedbackComplete('), source.indexOf('function activityFeedbackSummary('));
assert.match(prepFeedbackCompletionSource, /\['resonance', 'changes'\]/, '完成度只能檢查仍顯示的兩項課後回饋');
assert.doesNotMatch(prepFeedbackCompletionSource, /strengths/, '已刪除的教案有效處不得在背景阻擋送出');
assert.doesNotMatch(source, /function renderStudentCaseForm\(/, '學生追蹤表單必須完全退役');

const prepFormSource = source.slice(source.indexOf('function renderCoursePrepForm('), source.indexOf('function renderActivityForm('));
assert.match(prepFormSource, /課程類型 <span class="required">\*<\/span>/, '備課檔案只需先辨識課程類型');
assert.match(prepFormSource, /課程名稱 <span class="required">\*<\/span>/, '備課檔案只需先辨識課程名稱');
assert.match(prepFormSource, /教案或教材附件 <span class="required">\*<\/span>/, '備課檔案必須明確標示教案或教材必填');
assert.doesNotMatch(prepFormSource, /學習者背景與先備能力|可觀察學習目標|課程流程|學習檢核與達成標準/, '輕量備課不得再要求舊版教案段落');
assert.doesNotMatch(prepFormSource, /renderActivityPlanField/, '備課表單不得再開啟第二層教案表單');
assert.doesNotMatch(source, /教案、教材或參考資料皆為選填|附件可視需要補充|沒有附件；附件為選填/, '安親各頁不得殘留附件選填的舊文案');
const prepReadinessSource = source.slice(source.indexOf('function prepSourceReadinessIssues('), source.indexOf('function prepSourceUsable('));
assert.doesNotMatch(prepReadinessSource, /directPlanReady|planReadiness|建立日不可晚於授課日/, '備課檔案不得因完成百分比、主管審核或日期被阻擋');
assert.match(prepReadinessSource, /缺少教案或教材附件/, '工作紀錄不得選取缺附件的備課檔案');
const prepSaveSource = source.slice(source.indexOf('async function saveCoursePrepForm('), source.indexOf('function saveActivityForm('));
assert.match(prepSaveSource, /status: 'complete'/, '完成基本建檔後應直接可供工作紀錄選用');
assert.doesNotMatch(prepSaveSource, /directPlanReady\(planId\)/, '儲存備課不得依賴舊版教案完成度');
assert.match(prepSaveSource, /some\(item => materialCloudUrl\(item\)\)/, '前端儲存前必須確認至少一份附件已歸檔');
assert.match(prepSaveSource, /form\.elements\.id\.value = id/, '第一次按下儲存時必須立即固定檔案編號，避免連點新增多份');
assert.match(prepSaveSource, /已有相同課程類型與名稱的備課檔案/, '前端需攔截相同老師的同名同類型重複建檔');
assert.match(coursePrepBackend, /hasArchivedMaterial/, '後端也必須驗證教案或教材附件');
assert.match(coursePrepBackend, /請至少上傳一份教案或教材資料/, '後端缺附件時需回傳清楚訊息');
assert.match(coursePrepBackend, /LockService\.getScriptLock\(\)/, '雲端儲存需加鎖，避免連點請求同時建立重複檔案');
assert.match(coursePrepBackend, /請直接編輯原檔案/, '後端也需拒絕同名同類型的重複備課');
assert.match(coursePrepBackend, /confirmation_name/, '刪除備課前後端必須驗證姓名');
const prepDeleteSource = source.slice(source.indexOf('function openDeleteDialog('), source.indexOf('async function deleteDerivedTasks('));
assert.match(prepDeleteSource, /data-delete-confirm-name/, '刪除備課檔案前需輸入自己的名稱');
assert.match(prepDeleteSource, /已有 \$\{usageCount\} 筆授課紀錄使用這份檔案/, '已被授課紀錄引用的備課檔案不可刪除');
assert.match(source, /form\.dataset\.submitting === 'true'/, '備課儲存期間需立即阻擋再次送出');
const prepManagerSource = source.slice(source.indexOf('function renderPlanReviews('), source.indexOf('function renderTeamRosterTable('));
assert.match(prepManagerSource, /此頁只做客觀查閱/, '主管備課頁必須明確定位為只讀查閱');
assert.doesNotMatch(prepManagerSource, /data-action="(?:approve-plan|request-plan-changes|review-plan)"|完整度 \$\{|待審查/, '主管備課頁不得再出現審核與完成度判定');
const legacyPlanDetailSource = source.slice(source.indexOf('function renderPlanDetail('), source.indexOf('function resolveSubmissionItems('));
assert.match(legacyPlanDetailSource, /舊版備課資料/, '舊版教案需明確標示為只供查閱的歷史資料');
assert.doesNotMatch(legacyPlanDetailSource, /教案內容完整度|歸檔條件|本次審查結論|plan-review-check/, '舊版教案詳情不得再顯示百分比或審核清單');
const legacyPlanDrawerSource = source.slice(source.indexOf('function openPlanDetail('), source.indexOf('function openSubmissionReview('));
assert.doesNotMatch(legacyPlanDrawerSource, /送主管檢視|核准教案|退回補件|data-action="(?:submit-plan-review|approve-plan|request-plan-changes)"/, '任何舊版教案抽屜都不得再提供送審、核准或退回操作');
assert.match(source, /function reconcileLegacyPlans\(/, '舊版教案必須自動整併為可選取的備課檔案');
assert.match(source, /mergePlanMaterialsIntoPrep\(linkedPrep, plan\)/, '舊版正式教材必須保留在簡化後的備課附件中');
assert.match(source, /linkedPrep\.details\.targetCourse = targetCourseForPlan\(plan\)/, '舊備課缺少課程類型時必須由既有教案自動補齊');
assert.match(source, /storedVersion < 8 \|\| storedVersion > APP_VERSION/, '所有既有正式版本都必須進入安全遷移，不得因版本號更新而清空畫面');

const legacyPrepMigrationSource = source.slice(source.indexOf('function normalizePrepTitle('), source.indexOf('function normalizeLoadedState('));
const legacyPrepMigrationContext = vm.createContext({
  normalizeReviewNickname: value => String(value || '').replace(/老師$/u, ''),
  materialCloudUrl: item => String(item?.cloudUrl || item?.url || ''),
  inferPrepCategory: () => 'other',
  uid: prefix => `${prefix}_generated`,
  syncPlanIdentityFromPrep: () => {},
});
vm.runInContext(legacyPrepMigrationSource, legacyPrepMigrationContext);
const legacyPrepState = {
  daily: { date: '2026-09-01' },
  context: { teacher: '紅豆老師' },
  activities: [{ id: 'prep_old', type: 'lessonprep', teacher: '紅豆老師', title: '', details: {}, planId: 'plan_old', prepEvidence: [] }],
  lessonPlans: [{ id: 'plan_old', teacher: '紅豆老師', title: '9/1 數學小挑戰', courseType: '安親輔導', materials: [{ id: 'material_old', name: '數學學習單.pdf', size: '1 MB', cloudUrl: 'https://example.com/material.pdf' }] }],
};
legacyPrepMigrationContext.reconcileLegacyPlans(legacyPrepState);
assert.equal(legacyPrepState.activities[0].title, '9/1 數學小挑戰', '舊資料需自動帶回課程名稱');
assert.equal(legacyPrepState.activities[0].details.targetCourse, '安親課業指導', '舊資料需自動轉成可選取的課程類型');
assert.equal(legacyPrepState.activities[0].status, 'complete', '舊備課完成遷移後必須直接可選取');
assert.equal(legacyPrepState.activities[0].prepEvidence[0].fileName, '數學學習單.pdf', '舊教材附件不得在簡化時遺失');

const activitySaveSource = source.slice(source.indexOf('function saveActivityForm('), source.indexOf('function saveWeeklyForm('));
assert.match(activitySaveSource, /students: type === 'classroom' \? data\.getAll\('students'\) : \[\]/, '儲存時也只能讓班級經營保留學生');
assert.match(activitySaveSource, /markDailyNeedsResubmit\(activity\.date, activity\.teacher\)/, '修改工作紀錄後需退回待重新送出');
assert.match(activitySaveSource, /markDailyNeedsResubmit\(item\.date, item\.teacher\)/, '修改學生或親師紀錄後需退回待重新送出');
const evidenceSaveSource = source.slice(source.indexOf('function saveEvidenceForm('), source.indexOf('function capturePlanForm('));
assert.match(evidenceSaveSource, /markDailyNeedsResubmit\(linkedDailyDate, linkedDailyTeacher\)/, '修改成果照片後需退回待重新送出');
assert.doesNotMatch(evidenceSaveSource, /attachmentsMissingNotes|主管判讀重點/, '多張成果不得要求老師逐張填寫主管判讀說明');
assert.match(evidenceSaveSource, /status: evidenceReady\(draft\) \? 'pending' : 'draft'/, '成果是否可送審只檢查附件，不得使用文字分數判定');
const evidenceFormSource = source.slice(source.indexOf('function renderEvidenceAttachmentList('), source.indexOf('function weeklySourceData('));
assert.doesNotMatch(evidenceFormSource, /這張要主管看什麼|主管請看哪裡|name="observation"[^>]*required|evidence-quality">/, '成果表單不得重複要求老師說明主管觀看位置或顯示自動品質分數');
assert.match(evidenceFormSource, /主管將依內容的完整性、清楚度與可判讀性進行判斷與評分/, '成果表單需清楚說明內容品質由主管判斷');
assert.match(source, /function attachmentRecorded\(item\)/, '成果需區分已登記附件與目前裝置可否預覽');
assert.match(source, /function evidenceReady\(data\)[\s\S]{0,120}evidenceAttachments\(data\)\.some\(attachmentRecorded\)/, '既有附件紀錄不得因裝置無法預覽而被誤判缺成果');
assert.doesNotMatch(evidenceSaveSource, /份檔案尚未完成上傳，請重新選擇後再儲存/, '既有檔名附件不得阻擋老師儲存成果紀錄');
assert.match(source, /function hydrateCloudSnapshotAttachments\(/, '讀取舊日報時需從雲端附件清單修復快照連結');
assert.match(source, /importCloudSnapshot\(log\?\.kpi6_data\?\.v2_snapshot, log\?\.attachments \|\| \[\]\)/, '老師讀取日報時需一併回填雲端附件');
assert.match(source, /activityId, evidenceId, attachmentId/, '新上傳附件需保存活動、證據與附件識別碼');
assert.match(source, /function hydrateCloudPreviews\(\)[\s\S]{0,1800}API\.getAttachmentPreviews\(fileIds\)/, '私密雲端照片需透過已登入 API 讀取，不可只依賴 Drive 第三方 Cookie');
assert.match(source, /data-cloud-preview-id/, '所有雲端成果圖片都需標示檔案編號供預覽回填');
assert.match(source, /applyCloudPreview\(cloudFile\.cloudFileId, dataUrl\)/, '照片剛上傳完成時需立即保留本次預覽，不得瞬間變空白');
assert.match(sharedApi, /getAttachmentPreviews: \(fileIds\) => call\('getAttachmentPreviews'/, '共用 API 需提供私密照片預覽讀取');
assert.match(apiRouter, /'getAttachmentPreviews': \(\) => getAttachmentPreviews\(params\)/, 'Apps Script 路由需提供私密照片預覽');
assert.match(authBackend, /if \(action === 'getAttachmentPreviews'\)/, '私密照片預覽必須經過登入權限入口');
assert.match(logsBackend, /function getAttachmentPreviews\(params\)/, '後端需能讀取授權範圍內的 Drive 照片');
assert.match(logsBackend, /actorCanAccessUser_\(actor, owner\)/, '後端需依老師與主管資料範圍驗證照片權限');
assert.match(logsBackend, /dataUrl: 'data:' \+ mimeType \+ ';base64,'/, '後端需回傳瀏覽器可直接顯示的圖片資料');
assert.match(source, /function ensureCloudTeacherIdentity\([\s\S]{0,1200}API\.getSessionIdentity/, '前端需向後端重新確認正式老師身分');
assert.match(source, /function formalCloudSessionReady\(\)[\s\S]{0,500}session\.role === 'manager' \|\| session\.role === 'admin'/, '主管與管理員的健康檢查不得被老師身分規則誤判');
assert.match(source, /const formalSessionReady = formalCloudSessionReady\(\)/, '健康檢查需使用角色相容的正式工作階段判定');
assert.match(sharedApi, /getSessionIdentity: \(\) => call\('getSessionIdentity'\)/, '共用 API 需提供工作階段身分校正');
assert.match(apiRouter, /'getSessionIdentity': \(\) => getSessionIdentity\(params\)/, 'Apps Script 路由需提供工作階段身分校正');
assert.match(authBackend, /function getSessionIdentity\(params\)/, '後端需由驗簽結果回傳目前正式身分');
assert.match(source, /if \(dailySubmitInFlight\) return/, '日結送出需防止連點產生重複請求');
const dailySubmitSource = source.slice(source.indexOf('async function submitDaily()'), source.indexOf('async function submitWeekly()'));
assert.match(dailySubmitSource, /integrationRuntime\.cloudMessage = '正在確認並送出今日紀錄'/, '老師按下送出後需立即顯示送出中狀態');
assert.match(dailySubmitSource, /finally \{[\s\S]*dailySubmitInFlight = false;[\s\S]*renderApp\(\);/, '送出完成或失敗後都必須重新恢復可操作畫面');
assert.match(dailySubmitSource, /function showDailySubmissionReceipt\(/, '日結送出後需顯示固定的送出收據');
assert.match(dailySubmitSource, /今日紀錄已成功送出/, '送出收據需清楚宣告成功');
assert.match(dailySubmitSource, /送出時間/, '送出收據需提供實際送出時間');
assert.match(dailySubmitSource, /data-action="close-dialog">我知道了/, '成功收據需由老師主動確認後才關閉');
assert.match(dailySubmitSource, /data-action="view-daily-submission-status"/, '收據需提供可直接查看送出狀態的入口');
assert.match(source, /action === 'view-daily-submission-status'[^]*closeDialog\(\); persist\(\); renderApp\(\);/, '查看送出狀態前需先關閉收據，避免畫面被遮住');
assert.match(dailySubmitSource, /showDailySubmissionReceipt\(submission, '雲端紀錄、主管通知、待辦事項與 PDF 都已完成。'\)/, '雲端正式送出完成時需顯示完整成功收據');
assert.match(source, /duplicate = Array\.from\(root\.children\)/, '相同提示不得在畫面上重複堆疊');
const evidenceRemovalSource = source.slice(source.indexOf("else if (action === 'remove-evidence-attachment')"), source.indexOf("else if (action === 'remove-operation-photo')"));
assert.match(evidenceRemovalSource, /if \(!evidenceDraft\.attachments\.length\)[\s\S]{0,500}evidenceDraft\.fileName = '';[\s\S]{0,500}evidenceDraft\.cloudFileId = '';/, '刪除最後一張成果照片時必須同步清除舊版欄位，避免幽靈附件復活');

const evidenceRuntime = vm.createContext({
  materialCloudUrl: item => String(item?.cloudUrl || item?.url || ''),
  driveFileId: value => String(value || '').match(/(?:\/d\/|[?&]id=)([A-Za-z0-9_-]{10,200})/)?.[1] || '',
  clone: value => JSON.parse(JSON.stringify(value)),
});
vm.runInContext(source.slice(source.indexOf('function normalizeEvidenceRecord('), source.indexOf('function normalizeOperationPhotoRecord(')), evidenceRuntime);
vm.runInContext(source.slice(source.indexOf('function evidenceAttachments('), source.indexOf('function evidencePrimaryAttachment(')), evidenceRuntime);
vm.runInContext(source.slice(source.indexOf('function hydrateCloudSnapshotAttachments('), source.indexOf('function importCloudSnapshot(')), evidenceRuntime);
const legacyEvidence = {
  id: 'evidence_old',
  attachments: [
    { id: 'attachment_old_1', fileName: 'IMG_4297.jpeg', placeholder: true },
    { id: 'attachment_old_2', fileName: 'IMG_4298.jpeg', placeholder: true },
    { id: 'attachment_old_3', fileName: 'IMG_4300.jpeg', placeholder: true },
    { id: 'attachment_old_4', fileName: 'IMG_4301.jpeg', placeholder: true },
  ],
};
assert.equal(evidenceRuntime.attachmentAvailable(legacyEvidence.attachments[0]), false, '舊附件目前不可預覽時需保留真實狀態');
assert.equal(evidenceRuntime.evidenceReady(legacyEvidence), true, '四張既有附件不得再被誤判為缺成果');
const repairedSnapshot = evidenceRuntime.hydrateCloudSnapshotAttachments({
  schema: 'anqin-v2',
  submission: { activitySnapshots: [{ id: 'activity_1', type: 'tutoring', evidence: [legacyEvidence] }] },
}, [{
  url: 'https://drive.google.com/file/d/file-4297/view',
  fileId: 'file-4297',
  fileName: 'IMG_4297.jpeg',
  forType: 'v2-tutoring',
}]);
assert.equal(repairedSnapshot.submission.activitySnapshots[0].evidence[0].attachments[0].cloudFileId, 'file-4297', '舊快照需恢復雲端檔案編號');
assert.equal(repairedSnapshot.submission.activitySnapshots[0].evidence[0].attachments[0].placeholder, false, '成功回填後不得繼續顯示為待修復附件');
assert.match(source, /submittedAt, status: 'pending'/, '重新送出後必須回到主管待審，不得停留在草稿或舊狀態');
const resubmitSource = source.slice(source.indexOf('function markDailyNeedsResubmit('), source.indexOf('function todaySectionStatus('));
const resubmitContext = vm.createContext({
  state: {
    context: { teacher: '羊羊老師' },
    daily: { date: '2026-08-27', status: 'submitted', submittedAt: '2026-08-27T10:00:00.000Z' },
    submissions: [{ date: '2026-08-27', teacher: '羊羊老師', status: 'accepted' }],
  },
});
vm.runInContext(resubmitSource, resubmitContext);
assert.equal(resubmitContext.markDailyNeedsResubmit(), true, '已送出內容修改時應回報需要重新送出');
assert.equal(resubmitContext.state.daily.status, 'draft');
assert.equal(resubmitContext.state.daily.submittedAt, '');
assert.equal(resubmitContext.state.submissions[0].status, 'draft', '主管端不得繼續把舊快照視為最新正式版本');
assert.equal(resubmitContext.state.submissions[0].previousStatus, 'accepted', '需保留修改前狀態供稽核判讀');
assert.match(source, /needsResubmit \? '待重新送出'/, '老師歷史紀錄需明確標示修改後尚未重新送出');
assert.match(source, /function dailyNeedsResubmit\(\)/, '今日工作區需辨識已修改但尚未重新送出的版本');
assert.match(source, /內容已修改，尚未重新送出/, '今日送出頁需說明主管仍看到前一版');
assert.match(source, /needsResubmit \? '重新送出'/, '修改後的送出按鈕需清楚標示重新送出');
const cloudSnapshotSource = source.slice(source.indexOf('function buildCloudSnapshot('), source.indexOf('function activityKpiNumber('));
assert.match(cloudSnapshotSource, /status: submission\.status === 'draft' \? 'draft' : 'submitted'/, '正式雲端快照必須使用本次送出狀態，不得沿用本機舊草稿狀態');
assert.match(cloudSnapshotSource, /submittedAt: submission\.submittedAt \|\| ''/, '正式雲端快照必須保存本次實際送出時間');
const cloudDraftSyncSource = source.slice(source.indexOf('async function syncDailyDraftToCloud('), source.indexOf('function scheduleDailyCloudDraftSync('));
assert.match(cloudDraftSyncSource, /if \(dailyNeedsResubmit\(\)\)[\s\S]{0,260}reason: 'awaiting-resubmit'/, '修改已送出日報時不得用背景草稿覆蓋主管仍在看的正式版本');
assert.match(source, /function cloudDecisionIsCurrent\(decisionAt, contentUpdatedAt\)/, '雲端同步需比較主管決定與老師補件的時間版本');
assert.match(source, /cloudDecisionIsCurrent\(latestManagerRow\.created_at, submission\.submittedAt\)/, '重新送出的日報不得被舊主管意見改回待補件');
assert.match(source, /cloudDecisionIsCurrent\(latestDecision\.created_at, evidence\.updatedAt\)/, '重新上傳的成果證據不得被舊主管意見改回待補件');
assert.match(source, /cloudDecisionIsCurrent\(latestDecision\.created_at, operation\.updatedAt\)/, '重新送出的班務照片不得被舊主管意見改回待補件');
assert.match(source, /state\.operations\.updatedAt = savedAt/, '班務補件送出時需建立可比較的新版時間');
assert.match(source, /createdAt: draft\.createdAt \|\| savedAt, updatedAt: savedAt/, '成果補件儲存時需建立可比較的新版時間');
assert.doesNotMatch(source, /課業輔導每天必填/, '填寫指南不得保留與二擇一規則衝突的舊文案');
assert.match(source, /學科內或學科外至少記錄一筆/, '填寫指南需明確說明兩類至少擇一');
assert.match(source, /const returnAction = state\.ui\.role === 'manager' \? 'open-review' : 'open-record'/, '主管查看單筆工作後需返回審查頁，不得掉回唯讀頁');
assert.match(source, /function cloudFeedbackMessageMeta\(result\)/, '即時對話需沿用雲端訊息編號');
assert.match(source, /metadata\.id \|\| uid\('msg'\)/, '畫面暫存訊息需使用雲端編號，避免重開後重複');
assert.match(source, /function sameFeedbackMessage\(left, right\)/, '舊版暫存訊息與雲端訊息需能安全去重');
assert.match(source, /Math\.abs\(leftTime - rightTime\) <= 5 \* 60 \* 1000/, '只合併短時間內同作者同內容的重複訊息');
assert.match(source, /sort\(\(a, b\) => String\(a\.createdAt \|\| ''\)\.localeCompare\(String\(b\.createdAt \|\| ''\)\)\)/, '主管與老師對話重讀後需依時間排序');

const parentFormSource = source.slice(source.indexOf('function renderTodayParents('), source.indexOf('function renderTodayOperations('));
assert.match(parentFormSource, /無重要事項/, '親師溝通需提供無重要事項模式');
assert.match(parentFormSource, /parent-handoff-confirmed/, '無重要事項仍須確認門口交接');
assert.match(parentFormSource, /特殊交接備註（選填）/, '無重要事項的交接備註只能是特殊情況選填');
assert.doesNotMatch(source, /確認與備註/, '日結不得把選填交接備註誤列為必填');
assert.match(source, /新增一筆親師溝通紀錄，或確認已完成門口交接/, '日結只檢查親師溝通或門口交接確認');
const contactEditorSource = source.slice(source.indexOf('function renderContactForm('), source.indexOf('function defaultEvidenceType('));
assert.match(contactEditorSource, /孩子狀況與老師處理/, '親師溝通只需客觀記錄孩子狀況與老師處理');
assert.match(contactEditorSource, /家長回應與共同決定/, '親師溝通需保留家長回應與共同決定');
assert.doesNotMatch(contactEditorSource, /name="nextAction"/, '親師表單不得要求重複填寫後續行動');
assert.doesNotMatch(contactEditorSource, /name="dueDate"|name="status"|data-contact-followup/, '親師溝通不得再要求追蹤日期、狀態或結案流程');
const normalizeContactSource = source.slice(source.indexOf('function normalizeContactRecord('), source.indexOf('function normalizeLoadedState('));
const normalizeContactContext = vm.createContext({});
vm.runInContext(normalizeContactSource, normalizeContactContext);
const legacyContact = normalizeContactContext.normalizeContactRecord({ topic: '課堂情緒', summary: '老師已先陪同冷靜', decision: '家長今晚會再聊', nextAction: '明日持續留意', dueDate: '2026-09-05', status: 'open' });
assert.equal(legacyContact.summary, '課堂情緒\n老師已先陪同冷靜', '舊版主題與摘要必須完整合併至孩子狀況欄');
assert.equal(legacyContact.decision, '家長今晚會再聊\n明日持續留意', '舊版共識與下一步必須完整合併至共同決定欄');
assert.equal(legacyContact.nextAction, '', '轉換後不得保留重複的下一步欄位');
assert.equal(legacyContact.dueDate, '', '轉換後不得保留退役的追蹤日期');
assert.equal(legacyContact.status, 'closed', '轉換後不得繼續產生追蹤流程');
const currentContact = normalizeContactContext.normalizeContactRecord({ topic: '孩子今天願意開口', summary: '孩子今天願意開口並完成練習', decision: '家長同意在家鼓勵', nextAction: '' });
assert.equal(currentContact.summary, '孩子今天願意開口並完成練習', '新版由摘要衍生的短主題不得重複顯示');
const legacyPayloadSource = source.slice(source.indexOf('function buildLegacySubmissionPayload('), source.indexOf('async function syncDailyDraftToCloud('));
assert.match(legacyPayloadSource, /孩子狀況與老師處理：\$\{item\.summary\}；家長回應與共同決定：\$\{item\.decision\}/, '兩段親師溝通內容需完整寫入正式資料');
assert.match(legacyPayloadSource, /student_special: '',[\s\S]*special_students: \[\]/, '新的正式紀錄不得再寫入退役的學生追蹤欄位');
assert.match(pdfReport, /if \(legacyStudentTracking\) h \+= pdfRow_\('📦 舊版學生追蹤（歷史）'/, 'PDF 只可在真的有舊資料時顯示唯讀歷史');

assert.match(source, /route: 'weekly', label: '本週整理', icon: 'calendar-range', moreOnly: true/, '本週整理只放在更多功能');
assert.match(source, /const primaryNav = nav\.filter\(item => !item\.moreOnly\)/, '主要導覽需排除更多功能項目');
assert.match(source, /id="evidence-file" type="file" multiple/, '成果照片需可一次多選');
assert.match(source, /data-action="remove-evidence-attachment"/, '每張成果照片都需可個別移除');
assert.match(source, /data-action="remove-evidence-pin"/, '每個照片重點標記都需可個別移除');
assert.match(source, /data-action="remove-operation-photo"/, '班務照片選錯時也需可移除');
assert.match(styles, /\.operation-photo-remove/, '班務照片移除按鈕需有清楚可點擊樣式');
const operationPhotoSource = source.slice(source.indexOf('async function hashFile('), source.indexOf('function toggleOperationStatus('));
assert.match(operationPhotoSource, /file\.arrayBuffer\(\)/, '班務照片需以實際檔案內容建立指紋');
assert.doesNotMatch(operationPhotoSource, /file\.name\.toLowerCase|lastModified/, '照片檔名或拍攝時間不得被當成影像內容指紋');
const operationPhotoHandlerSource = source.slice(source.indexOf('async function handleOperationPhoto('), source.indexOf('async function handleReviewDecision('));
assert.match(operationPhotoHandlerSource, /status: currentStatus/, '選圖時必須同步保留畫面上的正常或異常狀態，避免已附照片仍顯示 0\/4');
assert.match(operationPhotoHandlerSource, /uploadCompressedPhoto\(dataUrl/, '班務照片需在選取時壓縮並立即上傳');
assert.doesNotMatch(operationPhotoHandlerSource, /這張照片已用於/, '班務照片不得因系統誤判重複而阻擋老師');
const operationSaveSource = source.slice(source.indexOf('function saveOperationsForm('), source.indexOf('function saveDailySummaryForm('));
assert.doesNotMatch(operationSaveSource, /fileNames|相同檔名/, '相同檔名但內容不同的手機照片不得被拒絕');
assert.doesNotMatch(operationSaveSource, /重複影像|fingerprints/, '照片內容品質改由主管判讀，不應由前端重複判定阻擋');
const prepUploadSource = source.slice(source.indexOf('async function handlePrepFiles('), source.indexOf('async function hashFile('));
assert.match(prepUploadSource, /fileFingerprint = await hashFile\(file\)/, '安親備課附件需以內容指紋辨識重複選檔');
assert.match(prepUploadSource, /相同檔案已略過/, '重複附件需略過並清楚告知老師');
assert.match(prepUploadSource, /duplicateIndex >= 0/, '先前未完成的同一附件必須允許重新選擇並修復');
assert.match(prepUploadSource, /if \(file\.size > MAX_DOCUMENT_FILE_BYTES\) \{[\s\S]{0,160}continue;/, '超限附件必須在讀取內容前單獨略過，避免耗盡瀏覽器記憶體');
assert.match(prepUploadSource, /for \(const file of files\)[\s\S]{0,800}try \{[\s\S]{0,1400}catch \(error\)/, '單一附件失敗不得中止同批其他正常附件');
assert.match(prepUploadSource, /部分附件未上傳/, '混合批次需明確回報部分成功與部分失敗');
const planMaterialUploadSource = source.slice(source.indexOf('async function uploadPlanMaterial('), source.indexOf('function formatFileSize('));
assert.match(planMaterialUploadSource, /isImage \? await fileToPreview\(file\) : await readFileAsDataUrl\(file\)/, '備課圖片需先壓縮，文件則保留原始內容');
assert.match(planMaterialUploadSource, /\.jpg`[\s\S]{0,260}mimeType: isImage \? payload\.mimeType/, '壓縮後圖片的檔名與 MIME 類型必須一致');
const evidenceUploadSource = source.slice(source.indexOf('async function handleEvidenceFile('), source.indexOf('function placeEvidencePin('));
assert.match(evidenceUploadSource, /uploadCompressedPhoto\(dataUrl/, '成果照片需在選取時壓縮並立即上傳');
assert.match(evidenceUploadSource, /if \(cloudFile\) \{[\s\S]*?applyCloudPreview\([\s\S]*?dataUrl = '';[\s\S]*?\}/, '照片成功上傳後需保留當次預覽並清除本機草稿的大型內容');
assert.match(evidenceUploadSource, /duplicateIndex >= 0/, '未完成的成果附件必須能由同一原檔重新上傳修復');
assert.match(source, /const MAX_DOCUMENT_FILE_BYTES = 25 \* 1024 \* 1024/, '文件上限需提高至 25 MB');
assert.match(source, /function sameReviewIdentity\(/, '登入暱稱需忽略老師或主管尾綴後再核對');
assert.match(source, /sameReviewIdentity\(session\.nickname, state\.context\.teacher\)/, '正式送出權限不得因顯示名稱尾綴誤判未登入');
assert.match(source, /function preserveActivityMedia\(/, '雲端草稿不得用只有檔名的附件覆蓋本機可用媒體');
assert.match(sharedAuth, /24 \* 3600 \* 1000/, '正式登入應維持完整工作日並降低填寫途中過期風險');
assert.match(pdfReport, /教案／教材有效處/, '正式 PDF 需使用新的課後備課回饋欄位');
assert.match(pdfReport, /parent_handoff_confirmed/, '正式 PDF 需保留無重要事項時的門口交接證據');
const pdfPhotoSource = pdfReport.slice(pdfReport.indexOf('function pdfImageDataUri_('), pdfReport.indexOf('function pdfRow_('));
assert.match(pdfPhotoSource, /DriveApp\.getFileById\(fileId\)\.getBlob\(\)/, 'PDF 圖片需由有權限的後端直接讀取 Drive 原檔');
assert.match(pdfPhotoSource, /\^image\\\/\(\?:jpeg\|jpg\|png\|gif\)\$/, 'PDF 嵌入前需驗證回傳內容確實為支援的圖片格式');
assert.match(pdfPhotoSource, /Authorization: 'Bearer ' \+ ScriptApp\.getOAuthToken\(\)/, '縮圖備援也必須帶入 Drive 授權');
assert.ok(pdfPhotoSource.indexOf('DriveApp.getFileById') < pdfPhotoSource.indexOf('UrlFetchApp.fetch'), 'PDF 不得優先使用可能回傳登入頁的未授權縮圖');
assert.match(pdfReport, /function savePersonPdf_\([\s\S]*replacePdfContent_/, '重建 PDF 時需原地更新既有檔案，避免舊通知連結失效');
assert.match(pdfReport, /function repairTodayKpiPdfImages\(/, '需提供可重建今日既有破圖 PDF 的維護程序');
assert.match(allInOneBackend, /function repairTodayKpiPdfImages\(/, '正式貼入 Apps Script 的整合檔也必須包含 PDF 修復程序');

const validPdfBytes = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);
const pdfPhotoContext = vm.createContext({
  String,
  Number,
  encodeURIComponent,
  DriveApp: { getFileById: () => ({ getBlob: () => ({ getContentType: () => 'image/jpeg', getBytes: () => Array.from(validPdfBytes) }) }) },
  UrlFetchApp: { fetch: () => { throw new Error('有效 Drive 圖片不應再走外部縮圖'); } },
  ScriptApp: { getOAuthToken: () => 'test-token' },
  Utilities: { base64Encode: bytes => Buffer.from(bytes).toString('base64') },
});
vm.runInContext(pdfPhotoSource, pdfPhotoContext);
assert.match(pdfPhotoContext.pdfPhotoUri_('private-photo'), /^data:image\/jpeg;base64,/, '私密 Drive 照片必須可轉成 PDF 內嵌圖片');
pdfPhotoContext.DriveApp = { getFileById: () => ({ getBlob: () => ({ getContentType: () => 'image/jpeg', getBytes: () => new Array(950001).fill(1) }) }) };
pdfPhotoContext.UrlFetchApp = { fetch: () => ({
  getResponseCode: () => 200,
  getBlob: () => ({ getContentType: () => 'text/html', getBytes: () => [60, 104, 116, 109, 108, 62] }),
}) };
assert.equal(pdfPhotoContext.pdfPhotoUri_('html-login-page'), '', 'HTTP 200 的 Google 登入頁不得再被誤當成照片嵌入 PDF');
assert.match(qaHarness, /此驗收頁只允許在本機使用/, '隔離驗收頁不得在正式網域啟用');
assert.match(qaHarness, /action === 'uploadFile' \|\| action === 'uploadPhoto'/, '隔離驗收頁需實際走過檔案與照片上傳介面');
assert.match(qaHarness, /action === 'getAttachmentPreviews'/, '隔離驗收頁需模擬跨裝置私密照片讀回');
assert.match(qaHarness, /action === 'listArchivedKpiFiles'/, '隔離驗收頁需讓老師實際讀回既有 PDF 檔案');
assert.match(qaHarness, /action === 'listTeacherReportFolders'/, '隔離驗收頁需讓主管實際讀回老師雲端日報資料夾');
assert.match(qaHarness, /isGlobalManager[\s\S]{0,260}folder\.department === department/, '隔離驗收頁需阻擋教室主管看到其他教室的雲端日報');
assert.match(qaHarness, /cloudStore\.logs\[key\] = storedLog/, '隔離驗收需保存老師送出的雲端日報，才能交由主管重讀');
assert.match(qaHarness, /Object\.values\(cloudStore\.logs\)/, '隔離驗收需提供主管日報清單，不得只回傳空成功');
assert.match(qaHarness, /action === 'addFeedback'/, '隔離驗收需保存主管與老師對話');
assert.match(qaHarness, /action === 'saveEval'/, '隔離驗收需保存主管評核並讓老師重新讀取');
assert.match(qaHarness, /total_score: totalScore, grade: tier\.grade, bonus: tier\.bonus/, '隔離驗收雲端需像正式後端一樣計算評核總分、等第與獎金');
assert.match(qaHarness, /role !== 'teacher' \|\| item\.status === 'submitted'/, '老師不得讀到主管尚未完成的評核草稿');
assert.match(source, /const calculatedTotal = Math\.max\(0, scoreValues\.reduce/, '老師評核總分需由各項分數重新核算，避免缺少彙總欄位時錯顯示 0 分');
assert.match(source, /const grade = String\(evaluation\.grade/, '老師評核需在舊資料缺少等第時依總分補算');
assert.match(source, /function saveManagerDerivedTaskToCloud\(task\)/, '主管要求補件時需直接建立正式雲端待辦');
assert.match(source, /主管工作區與目前登入身分不一致/, '對話送出前需阻擋工作區與登入角色錯置');
assert.match(source, /主管要求補充[\s\S]{0,420}立即補件/, '老師查看原始證據時需直接看到主管補件要求與入口');
assert.match(source, /const cloudTaskId = derivedTaskCloudId\(task\.ref \|\| task\.id\)[\s\S]{0,220}task_id: cloudTaskId[\s\S]{0,220}assignees: \[backendNickname\(task\.owner\)\]/, '主管補件待辦需以固定編號寫給正確老師');
assert.match(source, /item\.owner === owner && item\.title === title/, '舊版與雲端匯入的同一補件待辦需自動去重');
assert.match(source, /\[task\.cloudTaskId, derivedTaskCloudId\(ref\), task\.id\]/, '主管採認後需相容關閉新版與既有補件待辦');
assert.match(qaHarness, /action === 'addTask'/, '隔離驗收需保存主管建立的補件待辦');
assert.match(qaHarness, /Object\.values\(cloudStore\.tasks \|\| \{\}\)/, '老師重新登入後需能讀回雲端補件待辦');

console.log('PASS anqin task dialog, simplified course records, resubmission, multi-photo controls, and parent handoff rules');
