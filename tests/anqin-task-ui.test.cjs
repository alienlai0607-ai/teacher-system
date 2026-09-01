const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'review/anqin-v2/app.js'), 'utf8');
const styles = fs.readFileSync(path.join(root, 'review/anqin-v2/styles.css'), 'utf8');
const workspaces = fs.readFileSync(path.join(root, 'shared/workspaces.js'), 'utf8');
const sharedAuth = fs.readFileSync(path.join(root, 'shared/auth.js'), 'utf8');
const evaluationBackend = fs.readFileSync(path.join(root, 'apps-script/evaluation.gs'), 'utf8');
const pdfReport = fs.readFileSync(path.join(root, 'apps-script/pdfreport.gs'), 'utf8');

const taskRenderer = source.slice(source.indexOf('function taskPriorityMeta('), source.indexOf('function expectedBackendDepartment('));
assert.match(taskRenderer, /function openTaskDetail\(/, '追蹤事項必須能開啟完整內容對話框');
assert.match(taskRenderer, /data-action="open-task-detail"/, '每一筆事項都要有明確的查看入口');
assert.match(taskRenderer, /data-action="close-dialog">返回列表/, '對話框必須能直接返回列表');
assert.match(taskRenderer, /task-detail-copy/, '長文字必須在詳情內完整換行顯示');
assert.doesNotMatch(taskRenderer, /<table class="data-table"/, '追蹤事項不得再使用手機需橫向捲動的表格');

const cloudTaskSync = source.slice(source.indexOf('async function syncTasksFromCloud('), source.indexOf('async function refreshTaskCloudData('));
assert.match(cloudTaskSync, /detail: knownSources\.includes\(remoteDetail\) \? '' : remoteDetail/, '主管說明不得再誤塞進來源標籤');
assert.match(cloudTaskSync, /source = knownSources\.includes\(remoteDetail\)/, '雲端事項需要正確辨識來源');
assert.match(source, /source: taskDetailText\(task\) \|\| task\.source/, '更新完成狀態時不得覆蓋主管原始說明');
assert.match(source, /count: \(\) => state\.tasks\.filter\(task => task\.owner === state\.context\.teacher && task\.status !== 'done'\)\.length/, '老師選單的待辦數量只能計算自己的未完成事項');

assert.match(source, /class="evaluation-score-list"/, '老師查看主管評核時分數不可使用寬表格');
assert.match(source, /class="manager-eval-score-input"/, '主管輸入分數需要靠近評核項目');
assert.match(styles, /\.task-open-button[\s\S]*overflow-wrap: anywhere/, '追蹤事項摘要需要可換行');
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
assert.match(dailyTrackRules, /學科外｜特色課程（如有則填）/, '特色課程入口必須明確標示當日選填');
assert.match(dailyTrackRules, /return tracks\.academic\.covered;/, '日結只要求每日課業輔導存在');
assert.doesNotMatch(source, /blockers\.push\('新增特色課程紀錄'\)/, '沒有特色課程不得阻擋日結');
assert.match(source, /!tracks\.enrichment\.covered \|\| tracks\.enrichment\.items\.every\(weeklyActivityCoreReady\)/, '週整理須將沒有特色課程視為正常');
assert.match(source, /tracks\.enrichment\.covered && !enrichmentReady/, '若已新增特色課程但內容不完整仍須列為缺件');
assert.match(source, /學科內必填；學科外有課才填/, '主管審查頁必須使用相同規則說明');
assert.match(source, /id="activity-track-indicator">\$\{renderActivityTrackIndicator\(value\.type\)\}/, '特色課程表單內要再次顯示有課才填、填了要完整的規則');
assert.match(styles, /\.daily-track-row\.is-optional:not\(\.is-covered\)/, '選填的特色課程不得以紅色缺件樣式呈現');
assert.match(source, /const TEST_VIEW_MODE = INITIAL_AUTH_SESSION\?\.impersonate === true/, '安親需以登入代看狀態啟用互動測試');
assert.match(source, /const TEST_VIEW_WRITE_ACTIONS = new Set\([\s\S]*'send-feedback-message'[\s\S]*'confirm-delete'[\s\S]*'export-monthly-archive'/, '安親測試視角必須攔截對話、刪除與正式歸檔');
assert.match(source, /if \(TEST_VIEW_MODE\)[\s\S]{0,220}表單流程正常，最後寫入已攔截/, '安親表單需在正式寫入前由測試模式攔截');
assert.match(source, /TEST_VIEW_MODE && fileInput[\s\S]{0,220}不會上傳正式檔案/, '安親測試視角選擇附件後不得上傳正式檔案');
assert.match(source, /可以開啟、輸入與切換完整流程/, '安親測試狀態需明確說明可互動範圍');
assert.equal((workspaces.match(/review\/anqin-v2\/index\.html\?v=20260901-simple-prep-1/g) || []).length, 2, '安親老師與主管切換入口都必須帶入本次版本碼');
assert.match(sharedAuth, /review\/anqin-v2\/index\.html\?v=20260901-simple-prep-1/, '登入備援路徑也必須避開舊版快取');

const activityFormSource = source.slice(source.indexOf('function renderActivitySpecificFields('), source.indexOf('function renderEvidenceAttachmentList('));
assert.match(activityFormSource, /if \(activityNeedsPrepSource\(type\)\) return '';/, '課業指導與學科外不得重複顯示舊課程內容欄位');
assert.match(activityFormSource, /hideStudents: type !== 'classroom'/, '只有班級經營可顯示關聯學生');
assert.match(activityFormSource, /function renderActivityResultSection\([\s\S]*activityNeedsPrepSource\(value\.type\)[\s\S]*renderActivityPrepFeedbackFields/, '課程紀錄只保留課後備課回饋');
assert.doesNotMatch(source, /<option value="attendance">出席<\/option>/, '學生追蹤不得再提供出席類型');

const prepFormSource = source.slice(source.indexOf('function renderCoursePrepForm('), source.indexOf('function renderActivityForm('));
assert.match(prepFormSource, /課程類型 <span class="required">\*<\/span>/, '備課檔案只需先辨識課程類型');
assert.match(prepFormSource, /課程名稱 <span class="required">\*<\/span>/, '備課檔案只需先辨識課程名稱');
assert.match(prepFormSource, /教案或教材附件（選填）/, '備課附件必須明確標示為選填');
assert.doesNotMatch(prepFormSource, /學習者背景與先備能力|可觀察學習目標|課程流程|學習檢核與達成標準/, '輕量備課不得再要求舊版教案段落');
assert.doesNotMatch(prepFormSource, /renderActivityPlanField/, '備課表單不得再開啟第二層教案表單');
const prepReadinessSource = source.slice(source.indexOf('function prepSourceReadinessIssues('), source.indexOf('function prepSourceUsable('));
assert.doesNotMatch(prepReadinessSource, /directPlanReady|planReadiness|建立日不可晚於授課日/, '備課檔案不得因完成百分比、主管審核或日期被阻擋');
const prepSaveSource = source.slice(source.indexOf('async function saveCoursePrepForm('), source.indexOf('function saveActivityForm('));
assert.match(prepSaveSource, /status: 'complete'/, '完成基本建檔後應直接可供工作紀錄選用');
assert.doesNotMatch(prepSaveSource, /directPlanReady\(planId\)/, '儲存備課不得依賴舊版教案完成度');
const prepManagerSource = source.slice(source.indexOf('function renderPlanReviews('), source.indexOf('function renderTeamRosterTable('));
assert.match(prepManagerSource, /此頁只做客觀查閱/, '主管備課頁必須明確定位為只讀查閱');
assert.doesNotMatch(prepManagerSource, /data-action="(?:approve-plan|request-plan-changes|review-plan)"|完整度 \$\{|待審查/, '主管備課頁不得再出現審核與完成度判定');
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

const parentFormSource = source.slice(source.indexOf('function renderTodayParents('), source.indexOf('function renderTodayOperations('));
assert.match(parentFormSource, /無重要事項/, '親師溝通需提供無重要事項模式');
assert.match(parentFormSource, /parent-handoff-confirmed/, '無重要事項仍須確認門口交接');
assert.match(parentFormSource, /交接備註/, '無重要事項需留下必要備註');
const contactEditorSource = source.slice(source.indexOf('function renderContactForm('), source.indexOf('function renderOperationsForm('));
assert.match(contactEditorSource, /共識與後續行動/, '親師共識與後續行動需合併為一欄');
assert.doesNotMatch(contactEditorSource, /name="nextAction"/, '親師表單不得要求重複填寫後續行動');

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
const operationSaveSource = source.slice(source.indexOf('function saveOperationsForm('), source.indexOf('function saveDailySummaryForm('));
assert.doesNotMatch(operationSaveSource, /fileNames|相同檔名/, '相同檔名但內容不同的手機照片不得被拒絕');
assert.match(operationSaveSource, /fingerprints/, '真正相同的影像內容仍需阻擋跨面向重複使用');
assert.match(pdfReport, /教案／教材有效處/, '正式 PDF 需使用新的課後備課回饋欄位');
assert.match(pdfReport, /parent_handoff_confirmed/, '正式 PDF 需保留無重要事項時的門口交接證據');

console.log('PASS anqin task dialog, simplified course records, resubmission, multi-photo controls, and parent handoff rules');
