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
const evaluationBackend = fs.readFileSync(path.join(root, 'apps-script/evaluation.gs'), 'utf8');
const pdfReport = fs.readFileSync(path.join(root, 'apps-script/pdfreport.gs'), 'utf8');
const coursePrepBackend = fs.readFileSync(path.join(root, 'apps-script/courseprep.gs'), 'utf8');

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
assert.equal((workspaces.match(/review\/anqin-v2\/index\.html\?v=20260901-identity-evidence-repair-2/g) || []).length, 2, '安親老師與主管切換入口都必須帶入本次版本碼');
assert.match(sharedAuth, /review\/anqin-v2\/index\.html\?v=20260901-identity-evidence-repair-2/, '登入備援路徑也必須避開舊版快取');

const activityFormSource = source.slice(source.indexOf('function renderActivitySpecificFields('), source.indexOf('function renderEvidenceAttachmentList('));
assert.match(activityFormSource, /if \(activityNeedsPrepSource\(type\)\) return '';/, '課業指導與學科外不得重複顯示舊課程內容欄位');
assert.match(activityFormSource, /hideStudents: type !== 'classroom'/, '只有班級經營可顯示關聯學生');
assert.match(activityFormSource, /singleCourseName \? classFieldCopy\.label : '紀錄標題'/, '學科外只保留一個類型專屬課程名稱');
assert.match(activityFormSource, /<input type="hidden" name="type"/, '進入表單後課程類型必須固定，不得再次顯示重複下拉選單');
assert.doesNotMatch(activityFormSource, /id="activity-type"/, '正式填寫表單不得再出現課程類型下拉選單');
assert.match(source, /function openActivityTypePicker\(/, '學科內外入口需先用簡單選單選定紀錄類型');
assert.match(activityFormSource, /function renderActivityResultSection\([\s\S]*activityNeedsPrepSource\(value\.type\)[\s\S]*renderActivityPrepFeedbackFields/, '課程紀錄只保留課後備課回饋');
assert.doesNotMatch(source, /<option value="attendance">出席<\/option>/, '學生追蹤不得再提供出席類型');

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
assert.match(source, /function ensureCloudTeacherIdentity\([\s\S]{0,1200}API\.getSessionIdentity/, '前端需向後端重新確認正式老師身分');
assert.match(sharedApi, /getSessionIdentity: \(\) => call\('getSessionIdentity'\)/, '共用 API 需提供工作階段身分校正');
assert.match(apiRouter, /'getSessionIdentity': \(\) => getSessionIdentity\(params\)/, 'Apps Script 路由需提供工作階段身分校正');
assert.match(authBackend, /function getSessionIdentity\(params\)/, '後端需由驗簽結果回傳目前正式身分');
assert.match(source, /if \(dailySubmitInFlight\) return/, '日結送出需防止連點產生重複請求');
assert.match(source, /duplicate = Array\.from\(root\.children\)/, '相同提示不得在畫面上重複堆疊');

const evidenceRuntime = vm.createContext({
  materialCloudUrl: item => String(item?.cloudUrl || item?.url || ''),
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
assert.match(operationPhotoHandlerSource, /uploadCompressedPhoto\(dataUrl/, '班務照片需在選取時壓縮並立即上傳');
assert.doesNotMatch(operationPhotoHandlerSource, /這張照片已用於/, '班務照片不得因系統誤判重複而阻擋老師');
const operationSaveSource = source.slice(source.indexOf('function saveOperationsForm('), source.indexOf('function saveDailySummaryForm('));
assert.doesNotMatch(operationSaveSource, /fileNames|相同檔名/, '相同檔名但內容不同的手機照片不得被拒絕');
assert.doesNotMatch(operationSaveSource, /重複影像|fingerprints/, '照片內容品質改由主管判讀，不應由前端重複判定阻擋');
const prepUploadSource = source.slice(source.indexOf('async function handlePrepFiles('), source.indexOf('async function hashFile('));
assert.match(prepUploadSource, /fileFingerprint = await hashFile\(file\)/, '安親備課附件需以內容指紋辨識重複選檔');
assert.match(prepUploadSource, /相同檔案已略過/, '重複附件需略過並清楚告知老師');
assert.match(prepUploadSource, /duplicateIndex >= 0/, '先前未完成的同一附件必須允許重新選擇並修復');
const evidenceUploadSource = source.slice(source.indexOf('async function handleEvidenceFile('), source.indexOf('function placeEvidencePin('));
assert.match(evidenceUploadSource, /uploadCompressedPhoto\(dataUrl/, '成果照片需在選取時壓縮並立即上傳');
assert.match(evidenceUploadSource, /if \(cloudFile\) dataUrl = ''/, '照片成功上傳後不得再將大型內容塞進本機草稿');
assert.match(evidenceUploadSource, /duplicateIndex >= 0/, '未完成的成果附件必須能由同一原檔重新上傳修復');
assert.match(source, /const MAX_DOCUMENT_FILE_BYTES = 25 \* 1024 \* 1024/, '文件上限需提高至 25 MB');
assert.match(source, /function sameReviewIdentity\(/, '登入暱稱需忽略老師或主管尾綴後再核對');
assert.match(source, /sameReviewIdentity\(session\.nickname, state\.context\.teacher\)/, '正式送出權限不得因顯示名稱尾綴誤判未登入');
assert.match(source, /function preserveActivityMedia\(/, '雲端草稿不得用只有檔名的附件覆蓋本機可用媒體');
assert.match(sharedAuth, /24 \* 3600 \* 1000/, '正式登入應維持完整工作日並降低填寫途中過期風險');
assert.match(pdfReport, /教案／教材有效處/, '正式 PDF 需使用新的課後備課回饋欄位');
assert.match(pdfReport, /parent_handoff_confirmed/, '正式 PDF 需保留無重要事項時的門口交接證據');

console.log('PASS anqin task dialog, simplified course records, resubmission, multi-photo controls, and parent handoff rules');
