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
assert.equal(context.talentAppEvidence_([{ fileName: 'app.png', mimeType: 'image/png', url: 'https://drive.google.com/file/d/app/view' }], true).length, 1);
assert.throws(() => context.talentAppEvidence_([{ fileName: 'app.pdf', mimeType: 'application/pdf', url: 'https://drive.google.com/file/d/app/view' }], true), /只接受圖片/);

const archiveSource = fs.readFileSync(path.join(root, 'apps-script/archivefiles.gs'), 'utf8');
const setupSource = fs.readFileSync(path.join(root, 'apps-script/setup.gs'), 'utf8');
const taskSource = fs.readFileSync(path.join(root, 'apps-script/tasks.gs'), 'utf8');
const codeSource = fs.readFileSync(path.join(root, 'apps-script/Code.gs'), 'utf8');
const adminUsersSource = fs.readFileSync(path.join(root, 'admin/users.html'), 'utf8');
const adminDashboardSource = fs.readFileSync(path.join(root, 'admin/dashboard.html'), 'utf8');
const apiSource = fs.readFileSync(path.join(root, 'shared/api.js'), 'utf8');
const talentUiSource = fs.readFileSync(path.join(root, 'review/talent-v2/app.js'), 'utf8');
const anqinUiSource = fs.readFileSync(path.join(root, 'review/anqin-v2/app.js'), 'utf8');
assert.match(archiveSource, /function listTeacherReportFolders\(/);
assert.match(archiveSource, /item\.removeViewer\(/, '應移除已失效的舊查看權限');
assert.match(archiveSource, /item\.removeEditor\(/, '主管只能查看，不保留舊編輯權限');
assert.match(archiveSource, /function revokeKpiDriveUserAccess_\(/, '刪除員工時必須立即收回雲端檔案權限');
assert.match(archiveSource, /\['active', 'suspended', 'deleted'\]/, '雲端日報需保留離職人員歷史索引');
const folderListSource = archiveSource.slice(archiveSource.indexOf('function listTeacherReportFolders('), archiveSource.indexOf('/**', archiveSource.indexOf('function listTeacherReportFolders(')));
assert.doesNotMatch(folderListSource, /getOrCreateChildFolder_/, '開啟雲端清單不得建立空白資料夾或拖慢頁面');
assert.match(archiveSource, /function talentIndexedReportFolder_\(/, '才藝雲端日報應使用已保存的資料夾索引');
assert.match(folderListSource, /CacheService\.getScriptCache\(\)/, '雲端日報清單需使用短期快取避免重複掃描 Drive');
assert.match(folderListSource, /params\.refresh/, '主管需要能在背景強制更新快取');
assert.doesNotMatch(folderListSource, /secureKpiReportPath_/, '雲端清單讀取不得同步重掃整批 Drive 權限');
assert.match(archiveSource, /function ensureTeacherReportFolderViewer_\(/, '才藝主管開啟既有日報時需補齊該資料夾的查看權限');
assert.match(folderListSource, /params\.view_as/, '柏翰測試柳丁介面時需套用才藝主管的資料範圍');
assert.match(folderListSource, /actor\.nickname === viewer\.nickname/, '測試視角不可把待開通帳號誤加為正式 Drive 查看者');

const folderUsers = [
  { nickname: '柏翰', role: 'admin', status: 'active', email: 'admin@example.com', work_assignments: ['talent-payroll'] },
  { nickname: '柳丁', role: 'manager', status: 'pending', email: 'manager@example.com', work_assignments: ['talent-manager'] },
  { nickname: '浩浩', role: 'teacher', status: 'active', email: 'hao@example.com', work_assignments: ['talent-fulltime'], department: '才藝部門' },
  { nickname: '黑豹', role: 'teacher', status: 'active', email: 'panther@example.com', work_assignments: ['talent-pt'], department: '才藝部門' },
];
const folderRows = folderUsers.filter(user => user.role === 'teacher').map((user, index) => ({
  record_type: 'lesson', status: 'submitted', nickname: user.nickname, record_date: `2026-09-0${index + 1}`,
  reportFolderUrl: `https://drive.google.com/drive/folders/folder-${index + 1}`,
}));
const folderCache = new Map();
const addedFolderViewers = [];
const archiveContext = vm.createContext({
  Array, Boolean, Date, JSON, Math, Number, Object, RegExp, String,
  SHEET_NAMES: { USERS: 'Users', TALENT_RECORDS: 'TalentRecords' },
  CacheService: { getScriptCache: () => ({ get: key => folderCache.get(key) || null, put: (key, value) => folderCache.set(key, value) }) },
  DriveApp: { getFolderById: id => ({ addViewer: email => addedFolderViewers.push({ id, email }) }) },
  findUserByNickname: nickname => folderUsers.find(user => user.nickname === nickname) || null,
  sheetToObjects: name => name === 'Users' ? folderUsers : folderRows,
  talentAssignments_: user => Array.isArray(user?.work_assignments) ? user.work_assignments : [],
  talentRecordObject_: row => ({ reportUrl: 'https://drive.google.com/file/report', reportFolderUrl: row.reportFolderUrl }),
  normalizeTalentNickname_: value => String(value || '').trim().toLowerCase(),
  normalizeDepartment_: value => String(value || ''),
  sameDepartment_: (left, right) => left === right,
  isGlobalManager_: () => false,
});
vm.runInContext(archiveSource, archiveContext);
const simulatedFolders = archiveContext.listTeacherReportFolders({ __actor: folderUsers[0], viewer: '柏翰', view_as: '柳丁', scope: 'talent' });
assert.equal(simulatedFolders.ok, true);
assert.equal(simulatedFolders.folders.length, 2, '柏翰測試柳丁時應看到才藝老師，不是管理員的全工作區資料夾');
assert.equal(addedFolderViewers.length, 0, '測試待開通柳丁時不可提前授權其 Google 帳號');
folderUsers[1].status = 'active';
const managerFolders = archiveContext.listTeacherReportFolders({ __actor: folderUsers[1], viewer: '柳丁', scope: 'talent' });
assert.equal(managerFolders.ok, true);
assert.equal(addedFolderViewers.length, 2, '柳丁正式登入後需補齊兩位老師既有日報資料夾的查看權限');
assert.match(setupSource, /'deleted_at', 'deleted_by'/, '使用者資料表需保存刪除稽核欄位');
assert.match(setupSource, /mergedAssignments\.indexOf\(assignment\) < 0/, '既有安親身分必須合併才藝工作身分，不能覆蓋或漏加');
assert.match(setupSource, /function migrateTalentUserProfiles\(\)/, '才藝帳號遷移需可獨立執行，避免完整初始化逾時');
assert.match(setupSource, /function prepareTalentSeptemberLaunch\(\)/, '正式上線前需有一次性人員狀態與生效日校正');
assert.match(setupSource, /TALENT_PT_STRICT_START.*2026-09-01/s, '才藝制度必須自 2026/09/01 起才判定缺件');
assert.match(codeSource, /nickname: '柳丁'.*status: 'pending'/, '尚未交付的柳丁帳號不可提前啟用');
assert.match(codeSource, /nickname: '浩浩'.*status: 'pending'/, '尚未交付的浩浩帳號不可提前啟用');
assert.match(codeSource, /nickname: '毛毛'.*status: 'pending'/, '尚未交付的毛毛帳號不可提前啟用');
assert.match(setupSource, /nickname: '黑豹'.*schedule_json: \[1, 4\].*19:00–20:30/s, '黑豹固定班表需為週一、週四 19:00–20:30');
assert.doesNotMatch(setupSource, /findUserByNickname\(profile\.nickname\)/, '才藝帳號遷移不得逐人重讀整張使用者表');
assert.match(setupSource, /createTextFinder\('永康教室'\)/, '舊部門名稱遷移不得掃描並重寫整欄大量資料');
assert.match(taskSource, /function systemMaintenanceUser_\(params\)/, '排程設定需支援 Apps Script 編輯器直接執行');
assert.match(taskSource, /Session\.getEffectiveUser\(\)\.getEmail\(\)/, '手動維運必須核對目前 Google 管理員');
assert.match(codeSource, /'deleteUser': \(\) => deleteUser\(params\)/, 'API 路由必須提供刪除員工操作');
assert.match(codeSource, /'deleteTalentPrep': \(\) => deleteTalentPrep\(params\)/, 'API 路由必須提供才藝備課刪除操作');
assert.match(backendSource, /function deleteUser\(params\)/);
assert.match(backendSource, /confirmation !== nickname/, '刪除前必須再次輸入完整暱稱');
assert.match(backendSource, /operatorName !== '柏翰'/, '只有柏翰管理員可以執行刪除');
assert.match(backendSource, /user\.role === 'admin'/, '管理員帳號不可被刪除');
assert.match(backendSource, /status: 'deleted'/);
assert.match(backendSource, /push_subscription_id: ''/, '刪除時必須清除 APP 綁定');
assert.match(backendSource, /target\.status !== 'active'.*不能新增或修改才藝資料/s, '刪除後不得再寫入才藝資料');
assert.match(apiSource, /deleteUser: \(nickname, confirmNickname\)/);
assert.match(apiSource, /deleteTalentPrep: \(prepId, confirmationName\)/, '才藝前端 API 需傳送刪除姓名確認');
assert.match(apiSource, /READ_ONLY_TEST_VIEW/, '切換老師視角時 API 必須全面禁止寫入');
assert.match(apiSource, /IMPERSONATION_READ_ACTIONS/, '測試視角只能呼叫明確允許的讀取 API');
assert.match(apiSource, /view_as: window\.AUTH\?\.isImpersonating/, '測試視角讀取雲端日報時需告知後端目前模擬的主管');
assert.match(adminUsersSource, /顯示已刪除人員/);
assert.match(adminUsersSource, /刪除員工/);
assert.match(adminUsersSource, /歷史日報、薪資與評分會保留/);
assert.match(talentUiSource, /route: 'cloud-reports', label: '雲端日報'/);
assert.match(talentUiSource, /refresh: forceRefresh/, '首次開啟雲端日報應優先使用後端快取，只有手動重新整理才強制更新');
assert.match(talentUiSource, /data-action="select-prep-review-teacher"/, '主管查閱備課檔案時需先選老師');
assert.match(talentUiSource, /data-action="view-prep-review"/, '選老師後需再選單一課程，不能一次展開全部內容');
assert.match(talentUiSource, /此頁不需要核准或退回/, '主管備課頁必須明確採唯讀查閱流程');
assert.doesNotMatch(talentUiSource, /data-action="review-prep"|data-action="finish-prep-review"/, '才藝主管不可再核准或退回備課檔案');
assert.match(backendSource, /prep\.status = 'ready'/, '備課檔案儲存後應立即成為可用資料');
assert.match(backendSource, /talentAttachments_\(prep\.materials, true\)/, '備課檔案必須至少有一份已上傳的教案或教材');
assert.match(backendSource, /function deleteTalentPrep\(/, '才藝備課必須提供正式刪除流程');
assert.match(backendSource, /normalizeTalentNickname_\(params\.confirmation_name\)/, '才藝備課刪除需由後端核對本人姓名');
assert.match(backendSource, /已有 ' \+ usageCount \+ ' 筆課堂紀錄使用這份檔案/, '已被課堂紀錄使用的才藝備課不可刪除');
assert.match(backendSource, /已有相同課程類型與名稱的備課檔案/, '才藝後端需阻擋重複建檔');
assert.match(backendSource, /talentAttachments_\(selectedPrep\.materials, true\)/, '送出本堂紀錄時必須再驗證備課附件');
assert.doesNotMatch(backendSource, /prepRow\.status !== 'approved'/, '本堂紀錄不可再受備課核准狀態阻擋');
assert.match(backendSource, /備課檔案儲存後即可使用，不需要主管審核/, '舊審查 API 必須明確停用');
assert.match(talentUiSource, /pending_users/, '主管人員頁需顯示待開通的黑豹');
assert.match(backendSource, /function talentCanAccessPendingUser_\(/, '待開通才藝人員只能由授權主管查看');
assert.match(talentUiSource, /function visibleTalentStaff\(\)/, '主管總覽與排班需同時顯示已啟用及待開通才藝人員');
assert.match(talentUiSource, /未啟用前不列入計薪與漏填/, '待開通人員需顯示但不可誤列入薪資或漏填');
assert.match(talentUiSource, /function settlementStaff\(/, '離職人員只應在有歷史資料的月份出現在月結');
assert.match(talentUiSource, /person\.status === 'deleted'.*deleted_at/s, 'PT 月結排課應在刪除日期截止');
assert.match(backendSource, /talentCanAccessHistoricalUser_\(actor, user\)/, '主管仍可補建離職人員缺失的歷史 PDF');
assert.match(talentUiSource, /離職保留/);
assert.match(anqinUiSource, /route: 'cloud-reports', label: '雲端日報'/);
assert.match(talentUiSource, /type="file"[^>]*multiple/);
assert.match(talentUiSource, /教案或教材附件/, '才藝備課頁需清楚命名必填資料');
assert.match(talentUiSource, /if \(!\(pendingFiles\.prep \|\| \[\]\)\.length\)/, '前端儲存前需擋下沒有附件的備課檔案');
assert.match(talentUiSource, /prep\.id && prepHasMaterial\(prep\)/, '本堂紀錄不得選取缺附件的備課檔案');
assert.match(talentUiSource, /video\/mp4,video\/quicktime/, '才藝備課選檔需直接接受常用影片格式');
assert.match(talentUiSource, /影片單檔上限 15 MB/, '影片上傳限制需在選檔前說清楚');
assert.match(talentUiSource, /function attachmentIcon\([\s\S]*startsWith\('video\/'\)/, '老師與主管需能辨識影片附件');
assert.match(talentUiSource, /data-action="remove-upload"/, '備課照片、影片與文件都需可逐檔移除');
assert.match(talentUiSource, /function fileContentFingerprint\(/, '才藝備課附件需以實際內容建立指紋');
assert.match(talentUiSource, /相同檔案已略過/, '才藝重複附件需略過並清楚告知老師');
assert.match(backendSource, /fingerprint: String\(item\.fingerprint/, '附件內容指紋需保存到雲端供下次編輯繼續防重');
assert.match(talentUiSource, /data-action="open-delete-prep"/, '老師需能直接從才藝備課檔案執行刪除');
assert.match(talentUiSource, /data-delete-prep-name/, '才藝備課刪除前需完整輸入自己的名稱');
assert.match(talentUiSource, /function prepUsageCount\(/, '刪除前需檢查是否已有課堂紀錄引用');
assert.match(talentUiSource, /已有相同課程類型與名稱的備課檔案/, '才藝前端需立即提醒並阻擋重複建檔');
assert.match(talentUiSource, /route: 'records', label: '我的紀錄'/, '才藝老師查看過去內容的入口需直接命名為我的紀錄');
assert.match(talentUiSource, /const teacherPriority = \['today', 'prep', 'records'/, '才藝手機底部需直接顯示我的紀錄，不得藏到更多');
assert.match(talentUiSource, /aria-label="編輯今日紀錄"/, '才藝老師需能從我的紀錄直接編輯當日內容');
assert.match(talentUiSource, /route: 'weekly', label: '家長 APP'/, 'PT 與正職都要有家長 APP 發布確認入口');
assert.match(talentUiSource, /data-app-evidence-id=/, 'APP 發布確認必須上傳圖片證據，不能只切換狀態');
assert.match(talentUiSource, /uploadField\('家長 APP 發布完成截圖', 'app'/, '本堂紀錄內也要有 APP 截圖上傳入口');
assert.match(talentUiSource, /截圖需同時看得到發布日期與課程名稱/, 'APP 截圖規則需明確要求日期與課程名稱');
assert.match(talentUiSource, /appFiles, appStatus: siteType === 'partner'/, '本堂送出時需一併保存已選擇的 APP 截圖');
assert.match(talentUiSource, /app-publish-fields.*siteType !== 'self'/s, '合作校必須隱藏 APP 截圖欄位');
assert.match(talentUiSource, /function appEvidenceRequired\(/);
assert.match(talentUiSource, /function selectedPerformanceMonth\(\)/, '才藝老師 KPI 應使用獨立評核月份');
assert.match(talentUiSource, /scoreMonthsFor\(currentUser\.nickname, true\)\[0\]/, '才藝老師進入 KPI 時必須直接開啟最近一次已公布評核');
assert.match(talentUiSource, /if \(state\.ui\.route === 'performance'\) state\.ui\.performanceMonth = scoreMonthsFor\(currentUser\.nickname, true\)\[0\] \|\| currentMonth\(\);/, '重新進入才藝 KPI 仍須回到最近一次評核');
assert.match(talentUiSource, /id="performance-history-form"/, '才藝歷史評核需有確認查看按鈕');
assert.match(talentUiSource, /id="scoring-selection-form"/, '才藝主管切換評核月份需有確認查看按鈕');
assert.match(talentUiSource, /目前評核尚未儲存，確定要切換月份嗎/, '才藝主管切換月份前需保護尚未儲存的評核');
assert.match(talentUiSource, /item\?\.siteType === 'self'.*TALENT_EFFECTIVE_DATE/s, '只有 9/1 起的自營教室課堂列入 APP 缺件');
assert.match(talentUiSource, /appMissing/, 'PT 續報資格與月結需納入 APP 證據缺件');
assert.match(backendSource, /lesson\.siteType === 'partner'[\s\S]*lesson\.appStatus = 'not_required'/, '合作校課程後端必須強制免發布');
assert.match(backendSource, /talentAppEvidence_\(params\.app_files, true\)/, '後端必須驗證 APP 圖片已上傳至 Drive');
assert.match(backendSource, /家長 APP 發布完成截圖/, '正式 PDF 需收錄 APP 發布證據');
assert.match(adminDashboardSource, /快速測試老師畫面/);
assert.match(adminDashboardSource, /KPI_WORKSPACES\.hrefFor\(workspaceId\)/, '測試入口需導向老師真正使用的新版工作區');
const talentTestWriteActions = talentUiSource.slice(talentUiSource.indexOf('const TEST_VIEW_WRITE_ACTIONS'), talentUiSource.indexOf("document.addEventListener('click'"));
assert.match(talentUiSource, /柏翰互動測試/, '測試視角需清楚標示為可互動沙盒');
assert.match(talentTestWriteActions, /'submit-log'/, '正式送出仍須在測試視角攔截');
assert.match(talentTestWriteActions, /'save-prep'/, '備課儲存仍須在測試視角攔截');
assert.match(talentTestWriteActions, /'confirm-delete-prep'/, '備課刪除確認仍須在測試視角攔截');
assert.doesNotMatch(talentTestWriteActions, /'finish-prep-review'|'review-prep'/, '測試視角也不應保留已停用的主管備課審查');
assert.doesNotMatch(talentTestWriteActions, /'new-log'|'edit-log'|'new-prep'|'edit-score'|'open-bonus-approval'/, '測試視角必須能開啟新增與編輯介面');
assert.match(talentUiSource, /表單流程正常，最後送出已攔截/, '按到最後一步時需明確說明未寫入正式資料');

console.log('PASS talent rules, simplified prep, schedules, attachments, employee deletion, historical payroll, cloud-report access, and multi-file controls');
