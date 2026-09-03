/**
 * 布拉克星球 KPI 系統 - 合併版（All-in-One v9）
 * 觸發詞：kpi系統
 * 此檔由 apps-script 各模組機械式合併，請勿單獨修改。
 * 合併日期：2026-09-03
 */

// ════════════════════════════════════════════════════════════
//  Code.gs
// ════════════════════════════════════════════════════════════

/**
 * 布拉克星球 KPI 系統 - Apps Script 後端
 * 觸發詞：kpi系統
 *
 * 部署：
 * 1. 在 Google Sheet 開啟「擴充功能 > Apps Script」
 * 2. 把所有 .gs 檔案內容貼進去
 * 3. 執行 setupSheets() 初始化
 * 4. 部署為 Web 應用程式（任何人皆可存取）
 * 5. 把網址貼到前端 shared/config.js 的 API_URL
 */

// ============ 路由 ============
function doGet(e) {
  return handleRequest(e, 'GET');
}

function doPost(e) {
  return handleRequest(e, 'POST');
}

function handleRequest(e, method) {
  try {
    const params = method === 'POST'
      ? JSON.parse(e.postData.contents || '{}')
      : (e.parameter || {});

    // LINE webhook（老師加好友/傳訊息）— 與一般 API 共用同一個 URL
    if (params.events && Array.isArray(params.events)) {
      handleLineWebhook_(params);
      return jsonOut({ ok: true });
    }

    const action = params.action || '';

    // 除了健康檢查與 Google 登入交換之外，所有 API 都必須帶後端簽發的工作階段。
    // 權限不可只靠前端傳來的 nickname / viewer / operator，否則改寫請求即可冒用他人。
    if (action !== 'ping' && action !== 'whoami') {
      const authResult = authenticateApiRequest_(params);
      if (!authResult.ok) return jsonOut(authResult);
      params.__actor = authResult.user;
      authorizeApiAction_(action, params, authResult.user);
    }

    const ROUTES = {
      // 認證
      'ping': () => ({ ok: true, time: new Date().toISOString() }),
      'whoami': () => whoami(params),
      'getSessionIdentity': () => getSessionIdentity(params),

      // 使用者管理（admin）
      'listUsers': () => listUsers(params),
      'addUser': () => addUser(params),
      'updateUser': () => updateUser(params),
      'approveUser': () => approveUser(params),
      'deleteUser': () => deleteUser(params),

      // 日誌
      'saveLog': () => saveLog(params),
      'getLog': () => getLog(params),
      'listLogs': () => listLogs(params),
      'getTodayLog': () => getTodayLog(params),
      'uploadPhoto': () => uploadPhoto(params),
      'uploadFile': () => uploadFile(params),
      'getAttachmentPreviews': () => getAttachmentPreviews(params),
      'getEvidenceLog': () => getEvidenceLog(params),
      'getMakeupQuota': () => getMakeupQuota(params),
      'cleanupDuplicateEvidence': () => cleanupDuplicateEvidence(params),
      'adminStampSubmitted': () => adminStampSubmitted(params),
      'adminBroadcast': () => adminBroadcast(params),
      'sendDailyKpiPdf': () => sendDailyKpiPdf(params),
      'sendSubmitPdf': () => sendSubmitPdf(params),
      'listArchivedKpiFiles': () => listArchivedKpiFiles(params),
      'listTeacherReportFolders': () => listTeacherReportFolders(params),
      'archiveMonthlyCsv': () => archiveMonthlyCsv(params),

      // 安親 V2 備課教案建檔
      'saveCoursePrep': () => saveCoursePrep(params),
      'listCoursePreps': () => listCoursePreps(params),
      'deleteCoursePrep': () => deleteCoursePrep(params),

      // 才藝 V2：正職、PT、主管與薪資共用同一份正式資料
      'getTalentWorkspaceData': () => getTalentWorkspaceData(params),
      'saveTalentLesson': () => saveTalentLesson(params),
      'regenerateTalentLessonReport': () => regenerateTalentLessonReport(params),
      'saveTalentDraft': () => saveTalentDraft(params),
      'saveTalentPrep': () => saveTalentPrep(params),
      'deleteTalentPrep': () => deleteTalentPrep(params),
      'reviewTalentPrep': () => reviewTalentPrep(params),
      'updateTalentAppStatus': () => updateTalentAppStatus(params),
      'saveTalentScore': () => saveTalentScore(params),
      'addTalentMessage': () => addTalentMessage(params),
      'approveTalentBonus': () => approveTalentBonus(params),

      // 行政美宣：皮皮執行、小魚主管審查
      'getAdminMarketingWorkspaceData': () => getAdminMarketingWorkspaceData(params),
      'getAdminMarketingDriveFolders': () => getAdminMarketingDriveFolders(params),
      'saveAdminMarketingRecord': () => saveAdminMarketingRecord(params),
      'saveAdminMarketingAssignment': () => saveAdminMarketingAssignment(params),
      'reviewAdminMarketingRecord': () => reviewAdminMarketingRecord(params),
      'reviewAdminMarketingTrialBonus': () => reviewAdminMarketingTrialBonus(params),
      'saveAdminMarketingScore': () => saveAdminMarketingScore(params),
      'addAdminMarketingMessage': () => addAdminMarketingMessage(params),

      // 週報
      'saveWeekly': () => saveWeekly(params),
      'getWeekly': () => getWeekly(params),
      'listWeekly': () => listWeekly(params),

      // 回饋
      'addFeedback': () => addFeedback(params),
      'listFeedback': () => listFeedback(params),
      'listFeedbackThread': () => listFeedbackThread(params),
      'markFeedbackRead': () => markFeedbackRead(params),

      // 觀課
      'addObservation': () => addObservation(params),
      'listObservations': () => listObservations(params),

      // 發文
      'addPost': () => addPost(params),
      'listPosts': () => listPosts(params),
      'getWeekPostCount': () => getWeekPostCount(params),

      // OKR
      'saveOKR': () => saveOKR(params),
      'getOKR': () => getOKR(params),
      'updateOKRProgress': () => updateOKRProgress(params),

      // 評核
      'getEvalEvidence': () => getEvalEvidence(params),
      'saveEval': () => saveEval(params),
      'getEval': () => getEval(params),
      'listEvals': () => listEvals(params),

      // 事項
      'setConfig': () => setConfig(params),
      'getSystemReadiness': () => getSystemReadiness(params),
      'runProductionIntegrityCheck': () => runProductionIntegrityCheck(params),
      'setupSystemAutomation': () => setupSystemAutomation(params),
      'testMyNotifications': () => testMyNotifications(params),
      'registerPushSubscription': () => registerPushSubscription(params),
      'unregisterPushSubscription': () => unregisterPushSubscription(params),
      'getLineBindingCode': () => getLineBindingCode(params),
      'debugPush': () => debugPush(params),
      'addTask': () => addTask(params),
      'saveSelfTask': () => saveSelfTask(params),
      'deleteSelfTask': () => deleteSelfTask(params),
      'listTasks': () => listTasks(params),
      'updateTaskStatus': () => updateTaskStatus(params),
      'deleteTask': () => deleteTask(params),

      // 學生名冊
      'listStudents': () => listStudents(params),
      'addStudent': () => addStudent(params),
      'updateStudent': () => updateStudent(params),
      'deleteStudent': () => deleteStudent(params),

      // 報表
      'getDashboard': () => getDashboard(params),
      'getMyKpiPreview': () => getMyKpiPreview(params),

      // 初始化（admin only）
      'setupSheets': () => { setupSheets(); return { ok: true, msg: 'Sheets initialized' }; },
      'purgeTestData': () => purgeTestData(params),
    };

    if (!ROUTES[action]) {
      return jsonOut({ ok: false, error: 'Unknown action: ' + action });
    }
    const result = ROUTES[action]();
    return jsonOut(result);
  } catch (err) {
    try { console.error(err && err.stack ? err.stack : err); } catch (ignore) {}
    return jsonOut({ ok: false, error: err && err.message ? err.message : '系統處理失敗' });
  }
}

function jsonOut(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// ============ 常數 ============
const SHEET_NAMES = {
  USERS: 'Users',
  LOGS: 'DailyLogs',
  OKR: 'OKR_Goals',
  TEACHER_EVAL: 'TeacherEval',
  MANAGER_EVAL: 'ManagerEval',
  FEEDBACK: 'Feedback',
  EVIDENCE: 'Evidence',
  OBSERVATION: 'Observation',
  POSTS: 'Posts',
  KPI_CONFIG: 'KPI_Config',
  SYSTEM_LOG: 'Logs_System',
  WEEKLY: 'WeeklyReports',
  STUDENTS: 'Students',
  TASKS: 'Tasks',
  COURSE_PREP: 'CoursePrep',
  TALENT_RECORDS: 'TalentRecords',
  ADMIN_MARKETING_RECORDS: 'AdminMarketingRecords',
};

const DEPARTMENTS = ['東橋教室', '北區教室', '才藝部門', '總部'];
// 安親部門：這些部門的「老師」改用 100 分制（才藝部門老師與所有主管維持舊制）
const ANQIN_DEPARTMENTS = ['東橋教室', '北區教室'];
const ROLES = ['admin', 'manager', 'teacher', 'admin_staff'];
// admin_staff 子類型：'general'（行政總務）/ 'marketing'（行政宣傳）
const ADMIN_STAFF_SUBTYPES = ['general', 'marketing'];

const INITIAL_USERS = [
  { nickname: '柏翰',     role: 'admin',       department: '總部',     status: 'active', employment_type: 'admin', work_assignments: ['anqin-manager', 'talent-payroll', 'admin-marketing-manager'] },
  { nickname: '酸酸',     role: 'manager',     department: '東橋教室', status: 'active', employment_type: 'manager', work_assignments: ['anqin-manager'] },
  { nickname: '小魚',     role: 'manager',     department: '北區教室', status: 'active', employment_type: 'manager', work_assignments: ['anqin-manager', 'talent-payroll', 'admin-marketing-manager'] },
  { nickname: '柳丁',     role: 'manager',     department: '才藝部門', status: 'pending', employment_type: 'manager', work_assignments: ['talent-manager'] },
  { nickname: '松鼠',     role: 'teacher',     department: '東橋教室', status: 'active' },
  { nickname: '羊羊',     role: 'teacher',     department: '東橋教室', status: 'active' },
  { nickname: '紅豆',     role: 'teacher',     department: '東橋教室', status: 'active', employment_type: 'pt', work_assignments: ['anqin-teacher', 'talent-pt'] },
  { nickname: '江江',     role: 'teacher',     department: '北區教室', status: 'active' },
  { nickname: '小明',     role: 'teacher',     department: '北區教室', status: 'active', employment_type: 'pt', work_assignments: ['anqin-teacher', 'talent-pt'] },
  { nickname: '浩浩',     role: 'teacher',     department: '才藝部門', status: 'pending', employment_type: 'fulltime', work_assignments: ['talent-fulltime'] },
  { nickname: '毛毛',     role: 'teacher',     department: '才藝部門', status: 'pending', employment_type: 'fulltime', work_assignments: ['talent-fulltime'] },
  // 行政美編行銷（歸北區教室，由小魚評核）
  { nickname: '皮皮老師', role: 'admin_staff', department: '北區教室', status: 'active', subtype: 'marketing', employment_type: 'pt', work_assignments: ['talent-pt', 'admin-marketing'] },
];

const INITIAL_STUDENT_ROSTER = [
  { teacher: '松鼠', department: '東橋教室', students: ['宥縈', '彥呈', '浩軒', '久珹', '荏苒', '宥銨', '宥熹', '梓涵', '芮語', '尊瑋'] },
  { teacher: '紅豆', department: '東橋教室', students: ['佳揚', '沛杰', '紫瑀', '呈諺', '琝程', '米樂', '沐雅', '立喆', '雋翔'] },
  { teacher: '羊羊', department: '東橋教室', students: ['琮諺', '唯恩', '知澈', '知牧', '浩宸', '軒婕'] },
  { teacher: '酸酸', department: '東橋教室', students: ['炳兆', '宸瑋', '羽芯', '丞澤', '詣壹', '亦辰', '采華', '靚芯', '萓臻'] },
  { teacher: '江江', department: '北區教室', students: ['宥鈞', '翊辰', '恩弦', '偲芮', '士宸', '允樂', '岩真', '軒瑀', '秐菲'] },
  { teacher: '小明', department: '北區教室', students: ['陳硯', '尹睿', '承叡', '宥騫', '登睿', '宇綸', '映竹', '秉融', '守博'] },
  { teacher: '小魚', department: '北區教室', students: ['陳泱', '雨霏', '亭榛', '鎧宸', '芊妤', '沛豊', '宇翔', '宸熙', '寅熙', '浚宸', '奕瀚', '毓祥'] },
];

// ============ 獎金級距 ============
const BONUS_TEACHER = [
  { min: 67, max: 70, grade: '卓越', bonus: 3000 },
  { min: 63, max: 66, grade: '優良', bonus: 2000 },
  { min: 60, max: 62, grade: '達標', bonus: 1000 },
  { min: 55, max: 59, grade: '基本合格', bonus: 0 },
  { min: 0,  max: 54, grade: '待改善', bonus: 0 },
];

const BONUS_MANAGER = [
  { min: 67, max: 70, grade: '卓越', bonus: 5000 },
  { min: 63, max: 66, grade: '優良', bonus: 3500 },
  { min: 60, max: 62, grade: '達標', bonus: 2000 },
  { min: 55, max: 59, grade: '基本合格', bonus: 0 },
  { min: 0,  max: 54, grade: '待改善', bonus: 0 },
];

// 安親 100 分制獎金級距（看 KPI 總分，滿分 100）
const BONUS_ANQIN = [
  { min: 95, max: 100, grade: '卓越', bonus: 3000 },
  { min: 88, max: 94,  grade: '優良', bonus: 2000 },
  { min: 82, max: 87,  grade: '達標', bonus: 1000 },
  { min: 75, max: 81,  grade: '基本合格', bonus: 0 },
  { min: 0,  max: 74,  grade: '待改善', bonus: 0 },
];

// 是否為安親老師（teacher 且部門屬安親）
function isAnqinUser(user) {
  return !!user && user.role === 'teacher'
    && ANQIN_DEPARTMENTS.indexOf(normalizeDepartment_(user.department)) >= 0;
}

/** 舊資料的「永康教室」等同目前正式名稱「東橋教室」。 */
function normalizeDepartment_(department) {
  const value = String(department || '').trim();
  return value === '永康教室' ? '東橋教室' : value;
}

function sameDepartment_(left, right) {
  return normalizeDepartment_(left) === normalizeDepartment_(right);
}

// 依使用者選正確的獎金級距並計等第（安親看 100 分、其餘看 70 分）
function calcBonusForUser(kpiScore, user) {
  if (isAnqinUser(user)) {
    const tier = BONUS_ANQIN.find(t => kpiScore >= t.min && kpiScore <= t.max);
    return tier || { grade: '未評等', bonus: 0 };
  }
  return calcBonus(kpiScore, user.role);
}

// 取得某等第在指定級距表的索引（用於遲到「降一級」計算）
function bonusTierIndex(grade, user) {
  const table = isAnqinUser(user) ? BONUS_ANQIN : (user.role === 'manager' ? BONUS_MANAGER : BONUS_TEACHER);
  return table.findIndex(t => t.grade === grade);
}

// 降 n 個獎金等級後的獎金（不低於最低級）
function bonusAfterDrop(grade, dropLevels, user) {
  const table = isAnqinUser(user) ? BONUS_ANQIN : (user.role === 'manager' ? BONUS_MANAGER : BONUS_TEACHER);
  let idx = table.findIndex(t => t.grade === grade);
  if (idx < 0) idx = table.length - 1;
  idx = Math.min(table.length - 1, idx + dropLevels);
  return table[idx];
}

function calcBonus(kpiScore, role) {
  // admin_staff（行政）獎金級距同 teacher
  const table = role === 'manager' ? BONUS_MANAGER : BONUS_TEACHER;
  const tier = table.find(t => kpiScore >= t.min && kpiScore <= t.max);
  return tier || { grade: '未評等', bonus: 0 };
}

// ════════════════════════════════════════════════════════════
//  setup.gs
// ════════════════════════════════════════════════════════════

/**
 * Sheet 初始化
 * 第一次部署時執行 setupSheets()
 */

function setupSheets() {
  const ss = getSS();
  const schemas = {
    [SHEET_NAMES.USERS]: [
      'nickname', 'email', 'role', 'department', 'status',
      'phone', 'joined_at', 'last_login', 'notes', 'subtype', 'line_user_id', 'push_subscription_id',
      'employment_type', 'work_assignments', 'schedule_json', 'rest_days', 'deleted_at', 'deleted_by'
    ],
    [SHEET_NAMES.LOGS]: [
      'log_id', 'date', 'nickname', 'department', 'role',
      'checkin_at', 'checkout_at',
      'kpi1_data', 'kpi2_data', 'kpi3_data', 'kpi4_data', 'kpi5_data', 'kpi6_data',
      'reflection', 'help_needed', 'help_content', 'attachments',
      'created_at', 'updated_at', 'locked',
      'is_makeup', 'submitted_at'
    ],
    [SHEET_NAMES.OKR]: [
      'okr_id', 'semester', 'nickname', 'objective_no', 'objective_type',
      'objective_text', 'kr1_text', 'kr2_text', 'kr3_text',
      'kr1_progress', 'kr2_progress', 'kr3_progress',
      'month1', 'month2', 'month3', 'month4', 'month5', 'month6',
      'status', 'created_at', 'updated_at'
    ],
    [SHEET_NAMES.TEACHER_EVAL]: [
      'eval_id', 'year_month', 'nickname', 'evaluator',
      'self_k1', 'self_k2', 'self_k3', 'self_k4', 'self_k5', 'self_k6',
      'self_summary',
      'score_k1', 'score_k2', 'score_k3', 'score_k4', 'score_k5', 'score_k6',
      'score_okr', 'total_score', 'grade', 'bonus',
      'score_late_count', 'late_penalty', 'makeup_count', 'makeup_penalty', 'bonus_granted',
      'manager_comment', 'interview_notes',
      'status', 'created_at', 'updated_at'
    ],
    [SHEET_NAMES.MANAGER_EVAL]: [
      'eval_id', 'year_month', 'nickname', 'evaluator',
      'self_m1', 'self_m2', 'self_m3', 'self_m4', 'self_m5', 'self_m6',
      'self_summary',
      'score_m1', 'score_m2', 'score_m3', 'score_m4', 'score_m5', 'score_m6',
      'score_okr', 'total_score', 'grade', 'bonus', 'bonus_granted',
      'makeup_count', 'makeup_penalty',
      'dept_avg_score',
      'bonus_okr', 'bonus_recruit', 'bonus_dept', 'final_bonus',
      'boss_comment', 'interview_notes',
      'status', 'created_at', 'updated_at'
    ],
    [SHEET_NAMES.FEEDBACK]: [
      'feedback_id', 'log_id', 'from_nickname', 'to_nickname',
      'content', 'tag', 'created_at', 'read_at'
    ],
    [SHEET_NAMES.EVIDENCE]: [
      'evidence_id', 'log_id', 'nickname', 'date', 'kpi_category',
      'type', 'url', 'description', 'source_type', 'created_at'
    ],
    [SHEET_NAMES.OBSERVATION]: [
      'obs_id', 'date', 'observer', 'observed', 'type',
      'duration_min', 'score', 'notes', 'photos', 'created_at'
    ],
    [SHEET_NAMES.POSTS]: [
      'post_id', 'date', 'nickname', 'department', 'platform',
      'url', 'screenshot', 'content_type', 'week_of', 'created_at'
    ],
    [SHEET_NAMES.KPI_CONFIG]: [
      'config_id', 'version', 'role', 'kpi_no', 'max_score',
      'sub_items', 'grade_rules', 'effective_from'
    ],
    [SHEET_NAMES.SYSTEM_LOG]: [
      'timestamp', 'nickname', 'action', 'target', 'detail', 'ip'
    ],
    [SHEET_NAMES.WEEKLY]: [
      'week_id', 'week_of', 'nickname', 'department', 'role',
      'teaching_reflection', 'student_observation', 'tool_needs', 'course_improvement',
      'created_at', 'updated_at'
    ],
    [SHEET_NAMES.STUDENTS]: [
      'student_id', 'name', 'teacher', 'department', 'status',
      'notes', 'created_at', 'updated_at'
    ],
    [SHEET_NAMES.TASKS]: [
      'task_id', 'title', 'detail', 'assignee', 'department', 'due_date',
      'status', 'created_by', 'created_at', 'updated_at', 'done_at'
    ],
    [SHEET_NAMES.COURSE_PREP]: [
      'prep_id', 'nickname', 'department', 'title', 'course_type',
      'created_date', 'status', 'data_json', 'created_at', 'updated_at'
    ],
    [SHEET_NAMES.TALENT_RECORDS]: [
      'record_id', 'record_type', 'nickname', 'department', 'record_date',
      'year_month', 'status', 'data_json', 'created_by', 'updated_by',
      'created_at', 'updated_at', 'submitted_at'
    ],
    [SHEET_NAMES.ADMIN_MARKETING_RECORDS]: [
      'record_id', 'record_type', 'nickname', 'department', 'record_date',
      'year_week', 'year_month', 'status', 'data_json', 'created_by', 'updated_by',
      'created_at', 'updated_at', 'reviewed_at'
    ],
  };

  Object.entries(schemas).forEach(([name, headers]) => {
    let sheet = ss.getSheetByName(name);
    if (!sheet) {
      sheet = ss.insertSheet(name);
    }
    ensureHeaders(sheet, headers);  // 自動補缺欄（含舊表新增的 subtype 等）
  });

  migrateLegacyDepartmentNames_();

  // 預填初始使用者
  const usersSheet = ss.getSheetByName(SHEET_NAMES.USERS);
  if (usersSheet.getLastRow() === 1) {
    const now = new Date().toISOString();
    const headers = getHeaders(usersSheet);
    const rows = INITIAL_USERS.map(u => headers.map(header => {
      if (header === 'joined_at') return now;
      if (header === 'work_assignments') return JSON.stringify(u.work_assignments || []);
      return u[header] === undefined ? '' : u[header];
    }));
    usersSheet.getRange(2, 1, rows.length, headers.length).setValues(rows);
  }

  migrateTalentUserProfiles_();

  const seededStudents = seedInitialStudents_();

  // 預填 KPI 規則
  seedKpiConfig();

  Logger.log('Setup completed; seeded students: ' + seededStudents);
  return { ok: true, seeded_students: seededStudents };
}

/**
 * 補齊既有帳號的多工作身分與才藝排班。既有管理員已調整過的欄位不覆蓋；
 * 尚未取得 Google Email 的 RITA／黑豹先以 pending 建檔，避免被誤啟用。
 */
function migrateTalentUserProfiles_() {
  const profiles = [
    { nickname: '柏翰', employment_type: 'admin', work_assignments: ['anqin-manager', 'talent-payroll', 'admin-marketing-manager'] },
    { nickname: '酸酸', employment_type: 'manager', work_assignments: ['anqin-manager'] },
    { nickname: '小魚', employment_type: 'manager', work_assignments: ['anqin-manager', 'talent-payroll', 'admin-marketing-manager'] },
    { nickname: '柳丁', role: 'manager', department: '才藝部門', status: 'pending', employment_type: 'manager', work_assignments: ['talent-manager'] },
    { nickname: '浩浩', role: 'teacher', department: '才藝部門', status: 'pending', employment_type: 'fulltime', work_assignments: ['talent-fulltime'], rest_days: ['週一', '週日'] },
    { nickname: 'RITA', role: 'teacher', department: '才藝部門', status: 'pending', employment_type: 'fulltime', work_assignments: ['talent-fulltime'], rest_days: ['週二', '週日'] },
    { nickname: '毛毛', role: 'teacher', department: '才藝部門', status: 'pending', employment_type: 'fulltime', work_assignments: ['talent-fulltime'] },
    { nickname: '皮皮老師', role: 'admin_staff', department: '北區教室', subtype: 'marketing', employment_type: 'pt', work_assignments: ['talent-pt', 'admin-marketing'], schedule_json: [{ weekday: 4, label: '週四', time: '19:00-20:30', siteType: 'self', site: '布拉克自營教室' }] },
    { nickname: '紅豆', employment_type: 'pt', work_assignments: ['anqin-teacher', 'talent-pt'], schedule_json: [1, 3, 4, 5].map(function (weekday) { return { weekday: weekday, label: '週' + ['日', '一', '二', '三', '四', '五', '六'][weekday], time: '19:00-20:30', siteType: 'self', site: '布拉克自營教室' }; }) },
    { nickname: '小明', employment_type: 'pt', work_assignments: ['anqin-teacher', 'talent-pt'], schedule_json: [{ weekday: 3, label: '週三', time: '19:00-20:30', siteType: 'self', site: '布拉克自營教室' }] },
    { nickname: '黑豹', role: 'teacher', department: '才藝部門', status: 'pending', employment_type: 'pt', work_assignments: ['talent-pt'], schedule_json: [1, 4].map(function (weekday) { return { weekday: weekday, label: weekday === 1 ? '週一' : '週四', time: '19:00–20:30', siteType: 'partner', site: '善化合作校' }; }) },
  ];
  const now = nowIso();
  const sheet = getSheet(SHEET_NAMES.USERS);
  const headers = getHeaders(sheet);
  const indexes = {};
  headers.forEach(function (header, index) { indexes[header] = index; });
  const rows = sheet.getLastRow() > 1
    ? sheet.getRange(2, 1, sheet.getLastRow() - 1, headers.length).getValues()
    : [];
  const rowByNickname = {};
  rows.forEach(function (row, index) {
    rowByNickname[String(row[indexes.nickname] || '').trim()] = index;
  });
  let changed = false;

  function storedValue(value) {
    if (value === undefined || value === null) return '';
    return typeof value === 'object' ? JSON.stringify(value) : value;
  }

  profiles.forEach(function (profile) {
    let rowIndex = rowByNickname[profile.nickname];
    if (rowIndex === undefined) {
      const user = {
        nickname: profile.nickname,
        email: '',
        role: profile.role || 'teacher',
        department: profile.department || '才藝部門',
        status: profile.status || 'pending',
        joined_at: now,
        employment_type: profile.employment_type || '',
        work_assignments: profile.work_assignments || [],
        schedule_json: profile.schedule_json || [],
        rest_days: profile.rest_days || [],
      };
      rows.push(headers.map(function (header) { return storedValue(user[header]); }));
      rowIndex = rows.length - 1;
      rowByNickname[profile.nickname] = rowIndex;
      changed = true;
      return;
    }
    const row = rows[rowIndex];
    const currentAssignments = parseUserListField_(row[indexes.work_assignments]);
    const requiredAssignments = profile.work_assignments || [];
    const mergedAssignments = currentAssignments.slice();
    requiredAssignments.forEach(function (assignment) {
      if (mergedAssignments.indexOf(assignment) < 0) mergedAssignments.push(assignment);
    });
    if (mergedAssignments.length !== currentAssignments.length) {
      row[indexes.work_assignments] = JSON.stringify(mergedAssignments);
      changed = true;
    }
    ['employment_type', 'schedule_json', 'rest_days'].forEach(function (key) {
      const index = indexes[key];
      if (index >= 0 && (row[index] === '' || row[index] === null || row[index] === undefined) && profile[key] !== undefined) {
        row[index] = storedValue(profile[key]);
        changed = true;
      }
    });
    if (profile.nickname === '皮皮老師') {
      ['role', 'department', 'subtype'].forEach(function (key) {
        const index = indexes[key];
        if (index >= 0 && profile[key] !== undefined && row[index] !== profile[key]) {
          row[index] = profile[key];
          changed = true;
        }
      });
    }
  });
  if (changed) sheet.getRange(2, 1, rows.length, headers.length).setValues(rows);
  invalidateKpiDriveAccess_();
}

/** 可由 Apps Script 編輯器單獨執行，避免既有大量日誌拖慢完整初始化。 */
function migrateTalentUserProfiles() {
  migrateTalentUserProfiles_();
  return { ok: true, message: '才藝工作身分與排班已補齊' };
}

/** 行政美宣上線前執行一次：建立資料表並補齊皮皮、小魚、柏翰的工作區。 */
function prepareAdminMarketingLaunch() {
  migrateTalentUserProfiles_();
  ensureAdminMarketingRecordsSheet_();
  const expected = {
    '皮皮老師': ['talent-pt', 'admin-marketing'],
    '小魚': ['anqin-manager', 'talent-payroll', 'admin-marketing-manager'],
    '柏翰': ['anqin-manager', 'talent-payroll', 'admin-marketing-manager'],
  };
  const result = {};
  Object.keys(expected).forEach(function (nickname) {
    const user = findUserByNickname(nickname);
    if (!user) throw new Error('找不到人員：' + nickname);
    const assignments = parseUserListField_(user.work_assignments);
    const missing = expected[nickname].filter(function (item) { return assignments.indexOf(item) < 0; });
    if (missing.length) throw new Error(nickname + ' 尚缺工作區：' + missing.join('、'));
    result[nickname] = assignments;
  });
  invalidateKpiDriveAccess_();
  return { ok: true, users: result, supervisor: '小魚', worker: '皮皮老師' };
}

/** 正式交付前執行一次：未交付帳號維持待開通，才藝缺件自 2026/09/01 起計。 */
function prepareTalentSeptemberLaunch() {
  const pendingNames = ['柳丁', '浩浩', '毛毛'];
  const sheet = getSheet(SHEET_NAMES.USERS);
  const users = sheetToObjects(SHEET_NAMES.USERS);
  const changed = [];
  pendingNames.forEach(function (nickname) {
    const user = users.filter(function (item) { return item.nickname === nickname; })[0];
    if (!user || user.status === 'pending') return;
    if (user.status === 'deleted') throw new Error(nickname + ' 已刪除，不能改為待開通');
    updateRow(SHEET_NAMES.USERS, user._row, { status: 'pending' });
    changed.push(nickname);
  });
  PropertiesService.getScriptProperties().setProperty('TALENT_PT_STRICT_START', '2026-09-01');
  invalidateKpiDriveAccess_();
  return { ok: true, pending: pendingNames, changed: changed, effective_from: '2026-09-01' };
}

/**
 * 補入首批學生名單，但不覆蓋既有學生的老師或狀態。
 * 轉班後重跑 setupSheets() 也不會被初始名單改回去。
 */
function seedInitialStudents_() {
  const sheet = getSheet(SHEET_NAMES.STUDENTS);
  const headers = getHeaders(sheet);
  const existingNames = new Set(sheetToObjects(SHEET_NAMES.STUDENTS).map(row => String(row.name || '').trim()).filter(Boolean));
  const now = nowIso();
  const records = [];
  INITIAL_STUDENT_ROSTER.forEach(group => {
    group.students.forEach(name => {
      if (existingNames.has(name)) return;
      existingNames.add(name);
      records.push({
        student_id: Utilities.getUuid(),
        name,
        teacher: group.teacher,
        department: normalizeDepartment_(group.department),
        status: 'active',
        notes: '',
        created_at: now,
        updated_at: now,
      });
    });
  });
  if (!records.length) return 0;
  const values = records.map(record => headers.map(header => record[header] === undefined ? '' : record[header]));
  sheet.getRange(sheet.getLastRow() + 1, 1, values.length, headers.length).setValues(values);
  return records.length;
}

/** 將舊稱「永康教室」一次轉成正式名稱「東橋教室」，保留既有紀錄關聯。 */
function migrateLegacyDepartmentNames_() {
  const ss = getSS();
  [
    SHEET_NAMES.USERS, SHEET_NAMES.LOGS, SHEET_NAMES.WEEKLY, SHEET_NAMES.STUDENTS,
    SHEET_NAMES.TASKS, SHEET_NAMES.COURSE_PREP, SHEET_NAMES.POSTS,
    SHEET_NAMES.TALENT_RECORDS,
  ].forEach(name => {
    const sheet = ss.getSheetByName(name);
    if (!sheet || sheet.getLastRow() <= 1) return;
    const headers = getHeaders(sheet);
    const column = headers.indexOf('department') + 1;
    if (!column) return;
    sheet.getRange(2, column, sheet.getLastRow() - 1, 1)
      .createTextFinder('永康教室')
      .matchEntireCell(true)
      .replaceAllWith('東橋教室');
  });
}

/**
 * 確保 sheet 含有所有指定表頭欄。
 * - 空表：一次建立全部表頭、套樣式、凍結首列。
 * - 已有資料：把缺少的欄補在最右邊（不動既有資料與順序）。
 * 這讓日後 schema 新增欄位（如 subtype）重跑 setupSheets 就會自動補上。
 */
function ensureHeaders(sheet, headers) {
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.getRange(1, 1, 1, headers.length)
      .setFontWeight('bold').setBackground('#1976d2').setFontColor('#ffffff');
    sheet.setFrozenRows(1);
    return;
  }
  const lastCol = sheet.getLastColumn();
  const existing = sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(h => String(h).trim());
  const missing = headers.filter(h => existing.indexOf(h) === -1);
  if (missing.length) {
    const rng = sheet.getRange(1, lastCol + 1, 1, missing.length);
    rng.setValues([missing]);
    rng.setFontWeight('bold').setBackground('#1976d2').setFontColor('#ffffff');
  }
}

function seedKpiConfig() {
  const ss = getSS();
  const sheet = ss.getSheetByName(SHEET_NAMES.KPI_CONFIG);
  if (sheet.getLastRow() > 1) return;

  const TEACHER_KPI = [
    { kpi: 1, max: 15, name: '學校課業指導', items: [
      { name: '作業完成率/錯誤率', max: 3 },
      { name: '字體工整/整潔', max: 3 },
      { name: '訂正檢查', max: 2 },
      { name: '每日挑戰本設計', max: 3 },
      { name: '課業複習/考試準備', max: 2 },
      { name: '個別弱點補強', max: 2 },
    ]},
    { kpi: 2, max: 15, name: '班級經營與學習氛圍', items: [
      { name: '作業時間秩序', max: 2 },
      { name: '主動學習/專注度', max: 2 },
      { name: '獎勵規範執行', max: 3 },
      { name: '環境整潔/空間', max: 2 },
      { name: '班級氛圍', max: 3 },
      { name: '情緒衝突處理', max: 3 },
    ]},
    { kpi: 3, max: 10, name: '專案課程執行', items: [
      { name: '教案/材料準備', max: 3 },
      { name: '引導/互動', max: 3 },
      { name: '節奏掌握', max: 2 },
      { name: '進度執行', max: 2 },
    ]},
    { kpi: 4, max: 10, name: '班級群組經營', items: [
      { name: '每週課程分享(月至少2篇)', max: 4 },
      { name: '訊息即時回覆', max: 4 },
      { name: '活動推廣/互動率', max: 2 },
    ]},
    { kpi: 5, max: 15, name: '親師溝通與關係經營', items: [
      { name: '主動回饋學生狀況', max: 4 },
      { name: '溝通內容專業度', max: 3 },
      { name: '親師信任建立', max: 4 },
      { name: '問題與客訴處理', max: 4 },
    ]},
    { kpi: 6, max: 5, name: '個人工作態度與表現', items: [
      { name: '出勤/時間觀念', max: 3 },
      { name: '主動性/工作態度', max: 2 },
    ]},
  ];

  const MANAGER_KPI = [
    { kpi: 1, max: 15, name: '團隊領導與培訓', items: [
      { name: '老師日誌即時回饋', max: 3 },
      { name: '觀課執行', max: 3 },
      { name: '巡班觀察記錄', max: 2 },
      { name: '老師個別輔導', max: 2 },
      { name: '團體培訓場次', max: 3 },
      { name: '老師成長追蹤', max: 2 },
    ]},
    { kpi: 2, max: 15, name: '教學品質監督與部門風氣', items: [
      { name: '部門平均KPI(≥60滿分)', max: 3 },
      { name: '品質問題即時處理', max: 3 },
      { name: '跨班學習氛圍維護', max: 3 },
      { name: '教材教案品質把關', max: 2 },
      { name: '突發事件處理指導', max: 2 },
      { name: '部門整體進度追蹤', max: 2 },
    ]},
    { kpi: 3, max: 10, name: '部門課程/特色發展', items: [
      { name: '新教案/特色課程開發', max: 3 },
      { name: '跨班活動策劃執行', max: 3 },
      { name: '教學資源整合更新', max: 2 },
      { name: '部門課程競爭力提升', max: 2 },
    ]},
    { kpi: 4, max: 10, name: '招生續班與部門經營', items: [
      { name: '部門學生人數變化', max: 2 },
      { name: '續班率(≥85%)', max: 2 },
      { name: '招生活動策劃執行', max: 2 },
      { name: '安親內容發文(週≥3篇FB+IG)', max: 2 },
      { name: '部門品牌經營與曝光', max: 2 },
    ]},
    { kpi: 5, max: 15, name: '親師關係與客訴處理', items: [
      { name: '客訴件數控制', max: 4 },
      { name: '客訴處理時效', max: 3 },
      { name: '重大親師事件處理', max: 3 },
      { name: '親師活動規劃(季≥1場)', max: 3 },
      { name: '親師信任建立', max: 2 },
    ]},
    { kpi: 6, max: 5, name: '個人工作態度與表現', items: [
      { name: '出勤/時間觀念', max: 2 },
      { name: '主動性/工作態度', max: 3 },
    ]},
  ];

  const rows = [];
  const now = new Date().toISOString();
  TEACHER_KPI.forEach(k => {
    rows.push([
      Utilities.getUuid(), '1.0', 'teacher', k.kpi, k.max,
      JSON.stringify({ name: k.name, items: k.items }),
      JSON.stringify(getGradeRules('teacher', k.kpi, k.max)),
      now
    ]);
  });
  MANAGER_KPI.forEach(k => {
    rows.push([
      Utilities.getUuid(), '1.0', 'manager', k.kpi, k.max,
      JSON.stringify({ name: k.name, items: k.items }),
      JSON.stringify(getGradeRules('manager', k.kpi, k.max)),
      now
    ]);
  });

  // 行政總務 KPI（皮皮老師）
  const ADMIN_STAFF_KPI = [
    { kpi: 1, max: 15, name: '招生與客服第一線', items: [
      { name: '諮詢回覆時效(30分內首回應)', max: 3 },
      { name: '諮詢→體驗→報名漏斗追蹤', max: 3 },
      { name: '體驗課接待與引導', max: 3 },
      { name: '客訴一線處理', max: 3 },
      { name: '家長關係維護', max: 3 },
    ]},
    { kpi: 2, max: 15, name: '財務報帳與收款', items: [
      { name: '學費收款追蹤(當月應收100%)', max: 4 },
      { name: '發票/收據開立準確度', max: 3 },
      { name: '月結報表準時繳交(每月5日前)', max: 3 },
      { name: '零用金/雜支記帳', max: 2 },
      { name: '與會計/外部單位對帳', max: 3 },
    ]},
    { kpi: 3, max: 10, name: '教具與環境管理', items: [
      { name: '教具庫存盤點(月1次)', max: 3 },
      { name: '教具叫貨/補貨時效(缺料3日內)', max: 3 },
      { name: '教室環境維護', max: 2 },
      { name: '設備故障通報處理', max: 2 },
    ]},
    { kpi: 4, max: 10, name: '活動支援與營隊執行', items: [
      { name: '營隊報名作業', max: 3 },
      { name: '活動現場支援', max: 3 },
      { name: '教具/材料包準備', max: 2 },
      { name: '活動後結算', max: 2 },
    ]},
    { kpi: 5, max: 15, name: '文書與行政流程', items: [
      { name: '公文/合約/同意書處理', max: 4 },
      { name: '學生資料維護', max: 3 },
      { name: '家長群組訊息發布', max: 3 },
      { name: '內部會議記錄(24小時內發出)', max: 3 },
      { name: '跨部門溝通協調', max: 2 },
    ]},
    { kpi: 6, max: 5, name: '個人工作態度與表現', items: [
      { name: '出勤/時間觀念', max: 3 },
      { name: '主動性/工作態度', max: 2 },
    ]},
  ];

  // 行政美宣 KPI（皮皮老師，由小魚主管評核）
  const ADMIN_MARKETING_KPI = [
    { kpi: 1, max: 20, name: '每日行政與訊息處理', items: [
      { name: '家長訊息、官方 LINE 與班級群組確認', max: 6 },
      { name: '每日工作日誌完整度', max: 6 },
      { name: '未完成事項具備進度與新期限', max: 4 },
      { name: '需主管確認事項主動回報', max: 4 },
    ]},
    { kpi: 2, max: 25, name: '每週美宣產出與完成證據', items: [
      { name: '完成影片每週至少 2 支', max: 10 },
      { name: '照片宣傳每週至少 3 則', max: 9 },
      { name: '發布、排程或成品證據完整', max: 4 },
      { name: '內容品質與品牌一致性', max: 2 },
    ]},
    { kpi: 3, max: 15, name: '繳費與家長事項追蹤', items: [
      { name: '每週二完成繳費與到期名單確認', max: 6 },
      { name: '未繳費、續課與家長事項持續追蹤', max: 5 },
      { name: '每筆未結案事項具備下次追蹤日', max: 2 },
      { name: '特殊狀況主動回報', max: 2 },
    ]},
    { kpi: 4, max: 20, name: '期限與活動專案管理', items: [
      { name: '主管交辦期限與進度更新', max: 7 },
      { name: '逾期前主動說明並提出新期限', max: 4 },
      { name: '活動專案八階段排程', max: 6 },
      { name: '完成日期與證據可追溯', max: 3 },
    ]},
    { kpi: 5, max: 10, name: '環境、公告與素材管理', items: [
      { name: '東橋一樓內外環境與物品定位', max: 5 },
      { name: '過期公告撤除與最新資訊更新', max: 2 },
      { name: '照片、影片與宣傳素材分類', max: 3 },
    ]},
    { kpi: 6, max: 10, name: '主管評核', items: [
      { name: '工作正確性與可直接使用程度', max: 4 },
      { name: '主動性與風險回報', max: 3 },
      { name: '溝通、協作與改善速度', max: 3 },
    ]},
  ];

  ADMIN_STAFF_KPI.forEach(k => {
    rows.push([
      Utilities.getUuid(), '1.0', 'admin_staff:general', k.kpi, k.max,
      JSON.stringify({ name: k.name, items: k.items }),
      JSON.stringify(getGradeRules('admin_staff', k.kpi, k.max)),
      now
    ]);
  });
  ADMIN_MARKETING_KPI.forEach(k => {
    rows.push([
      Utilities.getUuid(), '1.0', 'admin_staff:marketing', k.kpi, k.max,
      JSON.stringify({ name: k.name, items: k.items }),
      JSON.stringify(getGradeRules('admin_staff', k.kpi, k.max)),
      now
    ]);
  });

  sheet.getRange(2, 1, rows.length, rows[0].length).setValues(rows);
}

function getGradeRules(role, kpi, max) {
  // 通用評分區間（依比例）
  if (max === 25) return [
    { range: '22-25', label: '優秀' },
    { range: '18-21', label: '基本達成' },
    { range: '≤17', label: '需加強' }
  ];
  if (max === 20) return [
    { range: '18-20', label: '優秀' },
    { range: '14-17', label: '基本達成' },
    { range: '≤13', label: '需加強' }
  ];
  if (max === 15) return [
    { range: '12-15', label: '優秀' },
    { range: '8-11', label: '基本達成' },
    { range: '≤7', label: '需加強' }
  ];
  if (max === 10) return [
    { range: '8-10', label: '優秀' },
    { range: '5-7', label: '基本達成' },
    { range: '≤4', label: '需加強' }
  ];
  if (max === 5) return [
    { range: '4-5', label: '優秀' },
    { range: '≤3', label: '需加強' }
  ];
  return [];
}

// ════════════════════════════════════════════════════════════
//  utils.gs
// ════════════════════════════════════════════════════════════

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

// ════════════════════════════════════════════════════════════
//  auth.gs
// ════════════════════════════════════════════════════════════

/**
 * 認證與使用者管理
 *
 * 流程：
 * 1. 前端用 Google Identity Services 取得 ID token
 * 2. 後端向 Google 驗證 ID token，再依 email 查使用者
 * 3. 後端簽發 24 小時工作階段；其餘 API 每次都驗簽與重新核對帳號狀態
 * 4. 新人由管理員預先建立 email 綁定，避免未綁定暱稱被陌生帳號認領
 */

const GOOGLE_OAUTH_CLIENT_ID_ = '110974418283-75a7ifti599cauhptkcd0jsqshfrupbf.apps.googleusercontent.com';
const API_SESSION_TTL_MS_ = 24 * 60 * 60 * 1000;

function whoami(params) {
  const identity = verifyLoginIdentity_(params || {});
  if (!identity.ok) return identity;
  const email = identity.email;

  const user = findUserByEmail(email);
  if (!user) {
    return {
      ok: true,
      registered: false,
      email,
      msg: '此 Email 尚未開通，請管理員先建立帳號並綁定 Email'
    };
  }

  // 更新最後登入時間
  updateRow(SHEET_NAMES.USERS, user._row, { last_login: nowIso() });

  return {
    ok: true,
    registered: true,
    user: {
      nickname: user.nickname,
      email: user.email,
      role: user.role,
      department: normalizeDepartment_(user.department),
      status: user.status,
      subtype: user.subtype || '',
      employment_type: user.employment_type || '',
      work_assignments: parseUserListField_(user.work_assignments),
      schedule_json: parseUserListField_(user.schedule_json),
      rest_days: parseUserListField_(user.rest_days)
    },
    session_token: user.status === 'active' ? issueSessionToken_(user) : ''
  };
}

function getSessionIdentity(params) {
  const user = params && params.__actor;
  if (!user || user.status !== 'active') {
    return { ok: false, error: '登入狀態已失效，請重新登入', code: 'AUTH_REQUIRED' };
  }
  return {
    ok: true,
    user: {
      nickname: user.nickname,
      email: user.email,
      role: user.role,
      department: normalizeDepartment_(user.department),
      status: user.status,
      subtype: user.subtype || '',
      employment_type: user.employment_type || '',
      work_assignments: parseUserListField_(user.work_assignments),
      schedule_json: parseUserListField_(user.schedule_json),
      rest_days: parseUserListField_(user.rest_days)
    }
  };
}

function parseUserListField_(value) {
  if (Array.isArray(value)) return value;
  if (!value) return [];
  try {
    const parsed = JSON.parse(String(value));
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    return String(value).split(/[,、;|]/).map(function (item) { return item.trim(); }).filter(Boolean);
  }
}

function userScheduleKey_(item) {
  if (!item || typeof item !== 'object') return '';
  if (item.scheduleKey || item.key) return String(item.scheduleKey || item.key).trim().slice(0, 240);
  return [
    'w' + Number(item.weekday),
    String(item.time || '').trim(),
    String(item.siteType || '').trim(),
    String(item.site || '').trim()
  ].map(function (value) { return encodeURIComponent(value); }).join('__');
}

function normalizeUserSchedule_(value) {
  const list = parseUserListField_(value);
  if (list.length > 28) throw new Error('固定排班最多 28 筆');
  const weekdayLabels = ['週日', '週一', '週二', '週三', '週四', '週五', '週六'];
  const seen = {};
  return list.map(function (item) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) throw new Error('固定排班格式不正確');
    const weekday = Number(item.weekday);
    const time = String(item.time || '').trim().slice(0, 80);
    const siteType = String(item.siteType || 'self').trim();
    const site = String(item.site || '').trim().slice(0, 100);
    if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6) throw new Error('固定排班星期不正確');
    if (!time || !site) throw new Error('固定排班必須包含時間與地點');
    if (['self', 'partner'].indexOf(siteType) < 0) throw new Error('固定排班場域不正確');
    const normalized = {
      weekday: weekday,
      label: String(item.label || weekdayLabels[weekday]).trim().slice(0, 20),
      time: time,
      siteType: siteType,
      site: site
    };
    normalized.scheduleKey = userScheduleKey_(Object.assign({}, normalized, { scheduleKey: item.scheduleKey || item.key || '' }));
    if (!normalized.scheduleKey || seen[normalized.scheduleKey]) throw new Error('固定排班有重複班次，請確認星期、時間與地點');
    seen[normalized.scheduleKey] = true;
    return normalized;
  });
}

function normalizeRestDays_(value) {
  const allowed = ['週日', '週一', '週二', '週三', '週四', '週五', '週六'];
  const seen = {};
  return parseUserListField_(value).map(function (item) { return String(item || '').trim(); }).filter(function (item) {
    if (allowed.indexOf(item) < 0) throw new Error('固定休假日期不正確');
    if (seen[item]) return false;
    seen[item] = true;
    return true;
  });
}

function validateUserWorkConfiguration_(role, employment, assignments, schedule) {
  const work = Array.isArray(assignments) ? assignments : [];
  const employmentType = String(employment || '');
  if (work.indexOf('talent-pt') >= 0) {
    if (employmentType !== 'pt') throw new Error('才藝 PT 工作區必須搭配 PT 聘用身分');
    if (!Array.isArray(schedule) || !schedule.length) throw new Error('才藝 PT 必須先設定至少一筆固定排班');
  }
  if (work.indexOf('talent-fulltime') >= 0 && employmentType !== 'fulltime') {
    throw new Error('才藝正職工作區必須搭配正職聘用身分');
  }
  if (work.indexOf('talent-manager') >= 0 && role !== 'manager' && role !== 'admin') {
    throw new Error('才藝主管工作區只可指派給主管或管理員');
  }
  if (work.indexOf('talent-payroll') >= 0 && role !== 'manager' && role !== 'admin') {
    throw new Error('才藝薪資工作區只可指派給主管或管理員');
  }
  if (work.indexOf('admin-marketing') >= 0 && role !== 'admin_staff' && role !== 'admin') {
    throw new Error('行政美宣工作區只可指派給行政美宣人員');
  }
  if (work.indexOf('admin-marketing-manager') >= 0 && role !== 'manager' && role !== 'admin') {
    throw new Error('行政美宣主管工作區只可指派給主管或管理員');
  }
}

/** 驗證首次 Google 登入，或用尚未過期的後端工作階段重新核對身分。 */
function verifyLoginIdentity_(params) {
  const requestedEmail = String(params.email || '').toLowerCase().trim();
  if (params.credential) return verifyGoogleCredential_(String(params.credential), requestedEmail);
  if (params.session_token) {
    const session = verifySessionToken_(String(params.session_token));
    if (!session.ok) return session;
    if (requestedEmail && requestedEmail !== String(session.user.email || '').toLowerCase()) {
      return { ok: false, error: '登入身分不一致', code: 'AUTH_INVALID' };
    }
    return { ok: true, email: String(session.user.email || '').toLowerCase(), user: session.user };
  }
  return { ok: false, error: '請重新使用 Google 登入', code: 'AUTH_REQUIRED' };
}

/** Google ID token 必須由後端驗證，不能只相信前端 decode 出來的 email。 */
function verifyGoogleCredential_(credential, requestedEmail) {
  if (!credential) return { ok: false, error: '缺少 Google 登入憑證', code: 'AUTH_REQUIRED' };
  try {
    const response = UrlFetchApp.fetch(
      'https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(credential),
      { muteHttpExceptions: true }
    );
    if (response.getResponseCode() !== 200) {
      return { ok: false, error: 'Google 登入憑證無效，請重新登入', code: 'AUTH_INVALID' };
    }
    const profile = JSON.parse(response.getContentText() || '{}');
    const expectedClientId = PropertiesService.getScriptProperties().getProperty('GOOGLE_CLIENT_ID') || GOOGLE_OAUTH_CLIENT_ID_;
    const email = String(profile.email || '').toLowerCase().trim();
    const issuer = String(profile.iss || '');
    const expiresAt = Number(profile.exp || 0) * 1000;
    if (!email || String(profile.aud || '') !== expectedClientId ||
        !['accounts.google.com', 'https://accounts.google.com'].includes(issuer) ||
        String(profile.email_verified || '') !== 'true' || expiresAt <= Date.now()) {
      return { ok: false, error: 'Google 登入驗證失敗，請重新登入', code: 'AUTH_INVALID' };
    }
    if (requestedEmail && requestedEmail !== email) {
      return { ok: false, error: 'Google 帳號與登入資料不一致', code: 'AUTH_INVALID' };
    }
    return { ok: true, email: email };
  } catch (error) {
    return { ok: false, error: '暫時無法驗證 Google 登入，請稍後重試', code: 'AUTH_UNAVAILABLE' };
  }
}

function apiSessionSecret_() {
  const props = PropertiesService.getScriptProperties();
  let secret = props.getProperty('API_SESSION_SECRET');
  if (!secret) {
    secret = Utilities.getUuid() + Utilities.getUuid() + Utilities.getUuid();
    props.setProperty('API_SESSION_SECRET', secret);
  }
  return secret;
}

function base64UrlText_(text) {
  return Utilities.base64EncodeWebSafe(String(text), Utilities.Charset.UTF_8).replace(/=+$/g, '');
}

function sessionSignature_(encodedPayload) {
  const bytes = Utilities.computeHmacSha256Signature(
    String(encodedPayload), apiSessionSecret_(), Utilities.Charset.UTF_8
  );
  return Utilities.base64EncodeWebSafe(bytes).replace(/=+$/g, '');
}

function constantTimeTextEqual_(left, right) {
  left = String(left || '');
  right = String(right || '');
  if (left.length !== right.length) return false;
  let mismatch = 0;
  for (let i = 0; i < left.length; i++) mismatch |= left.charCodeAt(i) ^ right.charCodeAt(i);
  return mismatch === 0;
}

function issueSessionToken_(user) {
  const now = Date.now();
  const payload = base64UrlText_(JSON.stringify({
    v: 1,
    nickname: String(user.nickname || ''),
    email: String(user.email || '').toLowerCase(),
    role: String(user.role || ''),
    department: String(user.department || ''),
    issued_at: now,
    expires_at: now + API_SESSION_TTL_MS_,
  }));
  return payload + '.' + sessionSignature_(payload);
}

function verifySessionToken_(token) {
  const parts = String(token || '').split('.');
  if (parts.length !== 2 || !parts[0] || !parts[1] ||
      !constantTimeTextEqual_(parts[1], sessionSignature_(parts[0]))) {
    return { ok: false, error: '登入工作階段無效，請重新登入', code: 'AUTH_INVALID' };
  }
  let payload;
  try {
    payload = JSON.parse(Utilities.newBlob(Utilities.base64DecodeWebSafe(parts[0])).getDataAsString());
  } catch (error) {
    return { ok: false, error: '登入工作階段無效，請重新登入', code: 'AUTH_INVALID' };
  }
  if (payload.v !== 1 || Number(payload.expires_at || 0) <= Date.now()) {
    return { ok: false, error: '登入已逾時，請重新登入', code: 'AUTH_EXPIRED' };
  }
  const user = findUserByNickname(String(payload.nickname || ''));
  if (!user || user.status !== 'active' ||
      String(user.email || '').toLowerCase() !== String(payload.email || '').toLowerCase() ||
      String(user.role || '') !== String(payload.role || '') ||
      String(user.department || '') !== String(payload.department || '')) {
    return { ok: false, error: '帳號權限已變更，請重新登入', code: 'AUTH_INVALID' };
  }
  return { ok: true, user: user };
}

function authenticateApiRequest_(params) {
  if (!params || !params.session_token) {
    return { ok: false, error: '請先登入再操作', code: 'AUTH_REQUIRED' };
  }
  return verifySessionToken_(String(params.session_token));
}

function actorCanAccessUser_(actor, target) {
  if (!actor || !target || actor.status !== 'active') return false;
  if (actor.role === 'admin' || isGlobalManager_(actor)) return true;
  if (actor.nickname === target.nickname) return true;
  return actor.role === 'manager' && sameDepartment_(actor.department, target.department);
}

function requireApiRole_(actor, allowedRoles) {
  if (!actor || allowedRoles.indexOf(actor.role) < 0) throw new Error('權限不足');
}

function requireApiUserScope_(actor, nickname) {
  const target = nickname ? findUserByNickname(String(nickname)) : null;
  if (!target || !actorCanAccessUser_(actor, target)) throw new Error('無權存取此人員資料');
  return target;
}

function authorizeTaskResource_(actor, taskId, deleting) {
  const task = taskId ? findObject(SHEET_NAMES.TASKS, 'task_id', taskId) : null;
  if (!task) return;
  const assignee = findUserByNickname(String(task.assignee || ''));
  const scopedManager = actor.role === 'manager' && assignee && actorCanAccessUser_(actor, assignee);
  const own = task.assignee === actor.nickname || task.created_by === actor.nickname;
  if (actor.role !== 'admin' && !scopedManager && !own) throw new Error('無權操作此事項');
  if (deleting && actor.role !== 'admin' && !scopedManager && task.created_by !== actor.nickname) {
    throw new Error('只有建立者或主管可以刪除事項');
  }
}

/**
 * 每個 HTTP API 的單一權限入口。這裡會以已驗簽 actor 覆蓋前端傳入的
 * viewer / operator / evaluator，並對資料對象再次做部門範圍判斷。
 */
function authorizeApiAction_(action, params, actor) {
  const adminOnly = [
    'addUser', 'updateUser', 'approveUser', 'deleteUser', 'setConfig', 'setupSystemAutomation',
    'runProductionIntegrityCheck',
    'cleanupDuplicateEvidence', 'adminStampSubmitted', 'adminBroadcast',
    'sendDailyKpiPdf', 'setupSheets', 'purgeTestData', 'approveTalentBonus'
  ];
  if (adminOnly.indexOf(action) >= 0) {
    requireApiRole_(actor, ['admin']);
    params.operator = actor.nickname;
    return;
  }

  if (action === 'listUsers') {
    requireApiRole_(actor, ['admin', 'manager', 'admin_staff']);
    params.operator = actor.nickname;
    return;
  }
  if (action === 'getSystemReadiness') {
    requireApiRole_(actor, ['admin', 'manager']);
    params.operator = actor.nickname;
    return;
  }
  if (action === 'testMyNotifications' || action === 'debugPush') {
    params.operator = actor.nickname;
    params.nickname = actor.nickname;
    return;
  }
  if (action === 'registerPushSubscription' || action === 'unregisterPushSubscription' || action === 'getLineBindingCode') {
    params.operator = actor.nickname;
    params.nickname = actor.nickname;
    return;
  }

  if (action === 'getAttachmentPreviews') {
    params.viewer = actor.nickname;
    return;
  }

  const viewerActions = [
    'listLogs', 'getEvidenceLog', 'listWeekly', 'listCoursePreps',
    'listArchivedKpiFiles', 'listTeacherReportFolders', 'getTalentWorkspaceData',
    'getAdminMarketingWorkspaceData',
    'getAdminMarketingDriveFolders',
    'getEvalEvidence', 'getEval', 'listEvals',
    'listTasks', 'getDashboard'
  ];
  if (viewerActions.indexOf(action) >= 0) params.viewer = actor.nickname;

  if (action === 'listTeacherReportFolders') {
    requireApiRole_(actor, ['admin', 'manager']);
    params.viewer = actor.nickname;
    return;
  }

  if (action === 'getTalentWorkspaceData') {
    params.viewer = actor.nickname;
    return;
  }

  if (action === 'getAdminMarketingWorkspaceData') {
    params.viewer = actor.nickname;
    return;
  }

  if (action === 'getAdminMarketingDriveFolders') {
    requireApiRole_(actor, ['admin', 'manager']);
    params.viewer = actor.nickname;
    return;
  }

  if (action === 'saveAdminMarketingRecord') {
    const target = requireApiUserScope_(actor, params.nickname || actor.nickname);
    if (target.status !== 'active') throw new Error('此員工帳號已停用，不能新增或修改行政美宣資料');
    params.nickname = target.nickname;
    if (actor.role !== 'admin' && target.nickname !== actor.nickname) throw new Error('只能修改自己的行政美宣紀錄');
    return;
  }

  if (action === 'saveAdminMarketingAssignment' || action === 'addAdminMarketingMessage') {
    requireApiUserScope_(actor, params.nickname);
    params.operator = actor.nickname;
    return;
  }

  if (action === 'reviewAdminMarketingRecord' || action === 'saveAdminMarketingScore') {
    requireApiRole_(actor, ['admin', 'manager']);
    params.operator = actor.nickname;
    return;
  }

  if (['saveTalentLesson', 'saveTalentDraft', 'saveTalentPrep', 'updateTalentAppStatus'].indexOf(action) >= 0) {
    const target = requireApiUserScope_(actor, params.nickname || actor.nickname);
    if (target.status !== 'active') throw new Error('此員工帳號已停用或刪除，不能新增或修改才藝資料');
    params.nickname = target.nickname;
    if (actor.role !== 'admin' && target.nickname !== actor.nickname) throw new Error('只能修改自己的才藝資料');
    return;
  }

  if (action === 'deleteTalentPrep' || action === 'deleteCoursePrep') {
    params.operator = actor.nickname;
    return;
  }

  if (action === 'regenerateTalentLessonReport') {
    params.operator = actor.nickname;
    return;
  }

  if (['reviewTalentPrep', 'saveTalentScore'].indexOf(action) >= 0) {
    requireApiRole_(actor, ['admin', 'manager']);
    params.operator = actor.nickname;
    return;
  }

  if (action === 'addTalentMessage') {
    params.operator = actor.nickname;
    return;
  }

  const ownContentActions = [
    'saveLog', 'uploadPhoto', 'uploadFile', 'saveWeekly', 'saveCoursePrep',
    'saveSelfTask', 'deleteSelfTask', 'addPost', 'saveOKR'
  ];
  if (ownContentActions.indexOf(action) >= 0) {
    const target = requireApiUserScope_(actor, params.nickname || actor.nickname);
    if (target.status !== 'active') throw new Error('此員工帳號已停用或刪除，不能新增或修改資料');
    params.nickname = target.nickname;
    if (actor.role !== 'admin' && target.nickname !== actor.nickname) throw new Error('只能修改自己的資料');
    return;
  }

  // 匯出與通知不改寫老師原始紀錄，主管可在既有查閱範圍內代為重建。
  if (['sendSubmitPdf', 'archiveMonthlyCsv'].indexOf(action) >= 0) {
    const target = requireApiUserScope_(actor, params.nickname || actor.nickname);
    params.nickname = target.nickname;
    return;
  }

  if (['getTodayLog', 'getMakeupQuota', 'getWeekly', 'getOKR', 'getMyKpiPreview', 'getWeekPostCount'].indexOf(action) >= 0) {
    const target = requireApiUserScope_(actor, params.nickname || actor.nickname);
    params.nickname = target.nickname;
    params.viewer = actor.nickname;
    return;
  }

  if (action === 'getLog') {
    let nickname = params.nickname || '';
    if (!nickname && params.log_id) {
      const log = findObject(SHEET_NAMES.LOGS, 'log_id', params.log_id);
      nickname = log ? log.nickname : '';
    }
    if (nickname) requireApiUserScope_(actor, nickname);
    params.viewer = actor.nickname;
    return;
  }

  if (action === 'saveEval') {
    requireApiRole_(actor, ['admin', 'manager']);
    requireApiUserScope_(actor, params.nickname);
    params.evaluator = actor.nickname;
    return;
  }
  if (action === 'getEvalEvidence' || action === 'getEval') {
    requireApiUserScope_(actor, params.nickname);
    return;
  }
  if (action === 'listEvals') {
    requireApiRole_(actor, ['admin', 'manager']);
    return;
  }

  if (action === 'addFeedback') {
    const target = requireApiUserScope_(actor, params.to_nickname);
    if (actor.role === 'teacher' || actor.role === 'admin_staff') {
      if (!(target.role === 'admin' || (target.role === 'manager' && (sameDepartment_(target.department, actor.department) || isGlobalManager_(target))))) {
        throw new Error('只能回覆主管或管理員');
      }
    }
    params.from_nickname = actor.nickname;
    return;
  }
  if (action === 'listFeedback') {
    if (actor.role !== 'admin') params.nickname = actor.nickname;
    else if (params.nickname) requireApiUserScope_(actor, params.nickname);
    params.viewer = actor.nickname;
    return;
  }
  if (action === 'listFeedbackThread') {
    const messages = sheetToObjects(SHEET_NAMES.FEEDBACK).filter(item => item.log_id === params.log_id);
    if (messages.length && actor.role !== 'admin') {
      const allowed = messages.some(item => item.from_nickname === actor.nickname || item.to_nickname === actor.nickname ||
        actorCanAccessUser_(actor, findUserByNickname(item.from_nickname)) || actorCanAccessUser_(actor, findUserByNickname(item.to_nickname)));
      if (!allowed) throw new Error('無權讀取此對話');
    }
    params.viewer = actor.nickname;
    return;
  }
  if (action === 'markFeedbackRead') {
    const item = findObject(SHEET_NAMES.FEEDBACK, 'feedback_id', params.feedback_id);
    if (item && actor.role !== 'admin' && item.to_nickname !== actor.nickname) throw new Error('無權更新此訊息');
    params.reader = actor.nickname;
    return;
  }

  if (action === 'addObservation') {
    requireApiRole_(actor, ['admin', 'manager']);
    requireApiUserScope_(actor, params.observed);
    params.observer = actor.nickname;
    return;
  }
  if (action === 'listObservations') {
    if (params.observed) requireApiUserScope_(actor, params.observed);
    if (actor.role === 'teacher' || actor.role === 'admin_staff') params.observed = actor.nickname;
    else if (actor.role === 'manager' && !params.observed) params.observer = actor.nickname;
    params.viewer = actor.nickname;
    return;
  }
  if (action === 'listPosts') {
    if (params.nickname) requireApiUserScope_(actor, params.nickname);
    if (actor.role !== 'admin' && !params.nickname) params.nickname = actor.nickname;
    params.viewer = actor.nickname;
    return;
  }

  if (action === 'updateOKRProgress') {
    const okr = findObject(SHEET_NAMES.OKR, 'okr_id', params.okr_id);
    if (okr && actor.role !== 'admin' && okr.nickname !== actor.nickname) throw new Error('只能更新自己的 OKR');
    params.operator = actor.nickname;
    return;
  }

  if (action === 'addTask') {
    requireApiRole_(actor, ['admin', 'manager', 'admin_staff']);
    let assignees = params.assignees;
    if (typeof assignees === 'string') assignees = assignees.split(',').map(item => item.trim()).filter(Boolean);
    (assignees || []).forEach(nickname => requireApiUserScope_(actor, nickname));
    params.created_by = actor.nickname;
    return;
  }
  if (action === 'updateTaskStatus' || action === 'deleteTask') {
    authorizeTaskResource_(actor, params.task_id, action === 'deleteTask');
    params.operator = actor.nickname;
    return;
  }

  if (action === 'listStudents') {
    if (actor.role === 'teacher' || actor.role === 'admin_staff') {
      params.teacher = actor.nickname;
      params.department = '';
    } else if (actor.role === 'manager' && !isGlobalManager_(actor)) {
      if (params.teacher) requireApiUserScope_(actor, params.teacher);
      params.department = actor.department;
    } else if (params.teacher) requireApiUserScope_(actor, params.teacher);
    params.viewer = actor.nickname;
    return;
  }
  if (action === 'addStudent' || action === 'updateStudent' || action === 'deleteStudent') {
    requireApiRole_(actor, ['admin', 'manager']);
    if (action === 'addStudent') requireApiUserScope_(actor, params.teacher);
    else {
      const student = findObject(SHEET_NAMES.STUDENTS, 'student_id', params.student_id);
      if (student) requireApiUserScope_(actor, student.teacher);
      if (params.teacher) requireApiUserScope_(actor, params.teacher);
    }
    params.operator = actor.nickname;
    return;
  }

  if (['deleteCoursePrep'].indexOf(action) >= 0) {
    params.operator = actor.nickname;
    const prep = findObject(SHEET_NAMES.COURSE_PREP, 'prep_id', params.prep_id);
    if (prep) {
      requireApiUserScope_(actor, prep.nickname);
      if (actor.role !== 'admin' && prep.nickname !== actor.nickname) throw new Error('只能刪除自己的備課檔案');
    }
    return;
  }

  // 已在前面覆蓋 viewer，個別函式仍會依角色/部門過濾。
  if (['listLogs', 'getEvidenceLog', 'listWeekly', 'listCoursePreps',
       'listArchivedKpiFiles', 'listTasks', 'getDashboard'].indexOf(action) >= 0) return;

  throw new Error('此功能尚未設定安全權限');
}

function findUserByEmail(email) {
  if (!email) return null;
  const users = sheetToObjects(SHEET_NAMES.USERS);
  for (let i = 0; i < users.length; i++) {
    if (String(users[i].email || '').toLowerCase() === email.toLowerCase()) {
      users[i]._row = i + 2;
      return users[i];
    }
  }
  return null;
}

function findUserByNickname(nickname) {
  return findObject(SHEET_NAMES.USERS, 'nickname', nickname);
}

/**
 * 列出尚未綁定 email 的暱稱（給首次登入者選）
 */
function listAvailableNicknames() {
  return { ok: false, error: '新人請由管理員先建立帳號並綁定 Email' };
}

/**
 * 老師認領暱稱：把 email 寫入該暱稱
 */
function claimNickname(params) {
  return { ok: false, error: '自助認領已停用，請由管理員先綁定 Email' };
}

/**
 * 列出所有使用者（admin 用）
 */
function listUsers(params) {
  const operator = params && params.operator ? findUserByNickname(params.operator) : null;
  if (!operator || operator.status !== 'active' || !['admin', 'manager', 'admin_staff'].includes(operator.role)) {
    return { ok: false, error: '無查看人員權限' };
  }
  let users = sheetToObjects(SHEET_NAMES.USERS);
  if (operator.role !== 'admin' && !isGlobalManager_(operator)) {
    users = users.filter(user => sameDepartment_(user.department, operator.department) || user.nickname === operator.nickname);
  }
  users = users.map(function (user) {
    const copy = Object.assign({}, user);
    delete copy._row;
    copy.department = normalizeDepartment_(copy.department);
    copy.work_assignments = parseUserListField_(copy.work_assignments);
    try {
      copy.schedule_json = normalizeUserSchedule_(copy.schedule_json);
      copy.rest_days = normalizeRestDays_(copy.rest_days);
      copy.configuration_error = '';
    } catch (error) {
      copy.schedule_json = [];
      copy.rest_days = [];
      copy.configuration_error = String(error.message || error);
    }
    return copy;
  });
  return { ok: true, users };
}

/**
 * admin 新增使用者
 */
function addUser(params) {
  const operator = params && params.operator ? findUserByNickname(params.operator) : null;
  if (!operator || operator.role !== 'admin' || operator.status !== 'active') return { ok: false, error: '需 admin 權限' };
  const { nickname, role, department, email, phone, notes } = params;
  const normalizedEmail = String(email || '').toLowerCase().trim();
  const normalizedDepartment = normalizeDepartment_(department);
  if (!nickname || !role || !department || !normalizedEmail) {
    return { ok: false, error: '暱稱、Google Email、角色與部門皆為必填' };
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) return { ok: false, error: 'Google Email 格式不正確' };
  if (!ROLES.includes(role)) return { ok: false, error: 'invalid role' };
  if (!DEPARTMENTS.includes(normalizedDepartment)) return { ok: false, error: 'invalid department' };
  if (params.employment_type && !['fulltime', 'pt', 'manager', 'admin'].includes(String(params.employment_type))) {
    return { ok: false, error: 'invalid employment_type' };
  }
  const workAssignments = parseUserListField_(params.work_assignments);
  const allowedAssignments = ['anqin-teacher', 'anqin-manager', 'talent-fulltime', 'talent-pt', 'talent-manager', 'talent-payroll', 'admin-marketing', 'admin-marketing-manager'];
  if (workAssignments.some(function (item) { return allowedAssignments.indexOf(item) < 0; })) {
    return { ok: false, error: 'invalid work_assignments' };
  }
  const normalizedSchedule = normalizeUserSchedule_(params.schedule_json);
  const normalizedRestDays = normalizeRestDays_(params.rest_days);
  validateUserWorkConfiguration_(role, params.employment_type, workAssignments, normalizedSchedule);

  // 行政美編行銷必須有 subtype（general/marketing），否則 KPI_Config 查不到
  const subtype = role === 'admin_staff'
    ? (ADMIN_STAFF_SUBTYPES.includes(params.subtype) ? params.subtype : 'general')
    : '';

  // 檢查暱稱重複
  if (findUserByNickname(nickname)) {
    return { ok: false, error: '暱稱已存在' };
  }
  // 檢查 email 重複
  if (findUserByEmail(normalizedEmail)) {
    return { ok: false, error: 'Email 已綁定其他暱稱' };
  }

  appendRow(SHEET_NAMES.USERS, {
    nickname,
    email: normalizedEmail,
    role,
    department: normalizedDepartment,
    status: 'active',
    phone: phone || '',
    joined_at: nowIso(),
    last_login: '',
    notes: notes || '',
    subtype,
    employment_type: params.employment_type || '',
    work_assignments: workAssignments,
    schedule_json: normalizedSchedule,
    rest_days: normalizedRestDays
  });
  invalidateKpiDriveAccess_();
  logSystem(params.operator || 'system', 'add_user', nickname, { role, department });

  return { ok: true, msg: '新增成功' };
}

/**
 * admin 更新使用者
 */
function updateUser(params) {
  const operator = params && params.operator ? findUserByNickname(params.operator) : null;
  if (!operator || operator.role !== 'admin' || operator.status !== 'active') return { ok: false, error: '需 admin 權限' };
  const { nickname } = params;
  if (!nickname) return { ok: false, error: 'missing nickname' };
  const user = findUserByNickname(nickname);
  if (!user) return { ok: false, error: 'user not found' };
  if (user.status === 'deleted') return { ok: false, error: '此員工帳號已刪除，不能重新啟用或修改' };

  const updates = {};
  ['email', 'line_user_id', 'role', 'department', 'status', 'phone', 'notes', 'subtype',
   'employment_type', 'work_assignments', 'schedule_json', 'rest_days'].forEach(k => {
    if (params[k] !== undefined) updates[k] = params[k];
  });
  if (updates.email !== undefined) {
    updates.email = String(updates.email || '').toLowerCase().trim();
    if (updates.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(updates.email)) return { ok: false, error: 'Google Email 格式不正確' };
    const duplicate = updates.email ? findUserByEmail(updates.email) : null;
    if (duplicate && duplicate.nickname !== nickname) return { ok: false, error: 'Email 已綁定其他暱稱' };
  }
  if (updates.role !== undefined && !ROLES.includes(updates.role)) return { ok: false, error: 'invalid role' };
  if (updates.department !== undefined) {
    updates.department = normalizeDepartment_(updates.department);
    if (!DEPARTMENTS.includes(updates.department)) return { ok: false, error: 'invalid department' };
  }
  if (updates.status !== undefined && !['active', 'pending', 'suspended'].includes(updates.status)) return { ok: false, error: 'invalid status' };
  if (updates.subtype !== undefined && updates.subtype && !ADMIN_STAFF_SUBTYPES.includes(updates.subtype)) return { ok: false, error: 'invalid subtype' };
  if (updates.employment_type !== undefined && updates.employment_type && !['fulltime', 'pt', 'manager', 'admin'].includes(String(updates.employment_type))) return { ok: false, error: 'invalid employment_type' };
  if (updates.work_assignments !== undefined) {
    const assignments = parseUserListField_(updates.work_assignments);
    const allowed = ['anqin-teacher', 'anqin-manager', 'talent-fulltime', 'talent-pt', 'talent-manager', 'talent-payroll', 'admin-marketing', 'admin-marketing-manager'];
    if (assignments.some(function (item) { return allowed.indexOf(item) < 0; })) return { ok: false, error: 'invalid work_assignments' };
    updates.work_assignments = assignments;
  }
  if (updates.schedule_json !== undefined) updates.schedule_json = normalizeUserSchedule_(updates.schedule_json);
  if (updates.rest_days !== undefined) updates.rest_days = normalizeRestDays_(updates.rest_days);
  const resultingRole = updates.role !== undefined ? updates.role : user.role;
  const resultingEmployment = updates.employment_type !== undefined ? updates.employment_type : user.employment_type;
  const resultingAssignments = updates.work_assignments !== undefined ? updates.work_assignments : parseUserListField_(user.work_assignments);
  const resultingSchedule = updates.schedule_json !== undefined ? updates.schedule_json : normalizeUserSchedule_(user.schedule_json);
  validateUserWorkConfiguration_(resultingRole, resultingEmployment, resultingAssignments, resultingSchedule);
  const resultingStatus = updates.status !== undefined ? updates.status : user.status;
  const resultingEmail = updates.email !== undefined ? updates.email : String(user.email || '').trim();
  if (resultingStatus === 'active' && !resultingEmail) return { ok: false, error: '啟用帳號前必須先綁定 Google Email' };
  updateRow(SHEET_NAMES.USERS, user._row, updates);
  invalidateKpiDriveAccess_();
  logSystem(params.operator || 'system', 'update_user', nickname, updates);

  return { ok: true, msg: '更新成功' };
}

/**
 * 永久刪除員工帳號。保留暱稱、職務與排班快照，讓既有日報、薪資及評分
 * 仍可稽核；登入資料與所有通知綁定會立即移除，且不可由一般更新流程復原。
 */
function deleteUser(params) {
  const operator = params && params.operator ? findUserByNickname(params.operator) : null;
  const operatorName = String(operator && operator.nickname || '').trim().replace(/(?:老師|主管)$/, '');
  if (!operator || operator.role !== 'admin' || operator.status !== 'active' || operatorName !== '柏翰') {
    return { ok: false, error: '只有柏翰管理員可以刪除員工' };
  }
  ensureHeaders(getSheet(SHEET_NAMES.USERS), ['deleted_at', 'deleted_by']);
  const nickname = String(params.nickname || '').trim();
  const confirmation = String(params.confirm_nickname || '').trim();
  if (!nickname || confirmation !== nickname) return { ok: false, error: '請完整輸入員工暱稱以確認刪除' };
  if (nickname === operator.nickname) return { ok: false, error: '不能刪除目前登入的管理員帳號' };

  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  let user;
  let previousEmail = '';
  try {
    user = findUserByNickname(nickname);
    if (!user) return { ok: false, error: '找不到此員工' };
    if (user.role === 'admin') return { ok: false, error: '管理員帳號不可從此處刪除' };
    if (user.status === 'deleted') return { ok: false, error: '此員工帳號已刪除' };
    previousEmail = String(user.email || '').trim().toLowerCase();
    updateRow(SHEET_NAMES.USERS, user._row, {
      status: 'deleted',
      email: '',
      phone: '',
      line_user_id: '',
      push_subscription_id: '',
      last_login: '',
      notes: '',
      deleted_at: nowIso(),
      deleted_by: operator.nickname,
    });
  } finally {
    lock.releaseLock();
  }

  invalidateKpiDriveAccess_();
  let driveRevocation = { ok: true, scanned: 0, removed: 0, complete: true };
  if (previousEmail) {
    try {
      driveRevocation = revokeKpiDriveUserAccess_(user, previousEmail);
    } catch (error) {
      driveRevocation = { ok: false, error: String(error.message || error) };
    }
  }
  logSystem(operator.nickname, 'delete_user', nickname, {
    deleted_at: nowIso(),
    had_google_binding: Boolean(previousEmail),
    drive_revocation: driveRevocation,
  });
  return {
    ok: true,
    msg: '員工帳號已刪除；歷史日報、薪資與評分保留供稽核',
    drive_revocation: driveRevocation,
  };
}

function approveUser(params) {
  return updateUser({ ...params, status: 'active' });
}

/**
 * 權限檢查 helper
 */
function requireRole(nickname, allowedRoles) {
  const user = findUserByNickname(nickname);
  if (!user) throw new Error('User not found: ' + nickname);
  if (!allowedRoles.includes(user.role)) {
    throw new Error('Permission denied: requires ' + allowedRoles.join('/'));
  }
  return user;
}

/** 小魚主管需跨校區支援；其他主管仍只看自己的校區。 */
function isGlobalManager_(user) {
  const nickname = String(user && user.nickname || '').trim().replace(/(?:老師|主管)$/, '');
  return !!user && user.role === 'manager' && nickname === '小魚';
}

function canViewDepartment_(user, department) {
  return !!user && (user.role === 'admin' || isGlobalManager_(user) ||
    (user.role === 'manager' && sameDepartment_(user.department, department)));
}

// ════════════════════════════════════════════════════════════
//  logs.gs
// ════════════════════════════════════════════════════════════

/**
 * 每日工作日誌 CRUD
 */

/**
 * 儲存日誌（同日重複呼叫會覆蓋，過了 24h 鎖定後拒絕）
 */
function saveLog(params) {
  const { nickname, date } = params;
  if (!nickname || !date) return { ok: false, error: 'missing nickname or date' };

  const user = findUserByNickname(nickname);
  if (!user) return { ok: false, error: 'user not found' };
  if (user.status !== 'active') return { ok: false, error: '帳號目前未啟用' };

  const log_id = 'LOG-' + String(date).replace(/-/g, '') + '-' + nickname;
  const existing = findObject(SHEET_NAMES.LOGS, 'log_id', log_id);

  // ===== 補繳判定 =====
  // 回填過去日期，且（該日沒有日誌 或 日誌已鎖定）→ 視為補繳：限當月、每月 3 次、評核時每次扣 2 分
  const today = todayStr();
  const isBackdated = String(date) < today;
  const needMakeup = isBackdated && (!existing || existing.locked === true);
  let makeupRemaining = null;
  if (needMakeup) {
    if (String(date).slice(0, 7) !== today.slice(0, 7)) {
      return { ok: false, error: '補繳僅限當月日期' };
    }
    const used = countMakeupLogs_(nickname, today.slice(0, 7));
    const alreadyMakeup = existing && existing.is_makeup === true;  // 同一天重複補存不重複扣次數
    if (!alreadyMakeup && used >= 3) {
      return { ok: false, error: '本月 3 次補繳機會已用完' };
    }
    makeupRemaining = Math.max(0, 3 - used - (alreadyMakeup ? 0 : 1));
  } else if (existing && existing.locked === true) {
    // 鎖定檢查（補繳模式可越過鎖定）
    return { ok: false, error: '日誌已鎖定（過 24 小時），無法修改' };
  }
  const isMakeup = needMakeup || (existing && existing.is_makeup === true);

  // ===== 空白覆蓋防護 =====
  // 自動存檔（非正式提交）若內容幾乎全空，而雲端已有實質內容（文字/照片），
  // 一律跳過不寫入——防止快取舊頁面或尚未載入完成的空白表單把整天的紀錄蓋掉
  if (params.submitted !== true && existing) {
    const incomingScore = logContentScore_(params);
    const existingScore = logContentScore_(existing);
    if (incomingScore < 20 && existingScore >= 100) {
      logSystem(nickname, 'skip_empty_autosave', log_id, { incoming: incomingScore, existing: existingScore });
      return { ok: true, log_id, msg: '雲端已有內容，空白草稿未覆蓋', skipped: true };
    }
  }

  const data = {
    log_id,
    date,
    nickname,
    department: normalizeDepartment_(user.department),
    role: user.role,
    checkin_at: params.checkin_at || (existing ? existing.checkin_at : ''),
    checkout_at: params.checkout_at || (existing ? existing.checkout_at : ''),
    kpi1_data: params.kpi1_data || '',
    kpi2_data: params.kpi2_data || '',
    kpi3_data: params.kpi3_data || '',
    kpi4_data: params.kpi4_data || '',
    kpi5_data: params.kpi5_data || '',
    kpi6_data: params.kpi6_data || '',
    reflection: params.reflection || '',
    help_needed: params.help_needed ? true : false,
    help_content: params.help_content || '',
    attachments: params.attachments || '',
    updated_at: nowIso(),
    locked: false,
    is_makeup: isMakeup === true,
    submitted_at: (existing && existing.submitted_at) || ''
  };

  // 正式提交（非草稿自動存）：首次提交蓋時間戳。
  // PDF 與主管通知由前端在 saveLog 成功後呼叫 sendSubmitPdf，避免同次送出收到兩則通知。
  const firstSubmit = params.submitted === true && !data.submitted_at;
  if (firstSubmit) data.submitted_at = nowIso();

  if (!existing) {
    data.created_at = nowIso();
    appendRow(SHEET_NAMES.LOGS, data);
  } else {
    updateRow(SHEET_NAMES.LOGS, existing._row, data);
  }

  // 附件 → Evidence：只在「正式提交」時寫入，且整份取代
  // （舊版每次草稿自動存都 append 一次，一天可灌出上百筆重複證據）
  if (params.submitted === true) {
    replaceEvidenceForLog_(log_id, nickname, date, params.attachments);
  }

  // 處理發文（如果是主管）→ 寫入 Posts
  if (user.role === 'manager' && params.posts && Array.isArray(params.posts)) {
    saveManagerPosts(nickname, user.department, date, params.posts);
  }

  logSystem(nickname, 'save_log', log_id, { date });

  return { ok: true, log_id, msg: '已儲存', is_makeup: isMakeup === true, makeup_remaining: makeupRemaining };
}

/**
 * 日誌內容分數：自由文字長度 + 附件數×50（排除 type/work_types 這類選單值）
 * 用於空白覆蓋防護與補蓋提交時間戳的判斷
 */
function logContentScore_(o) {
  let n = 0;
  const SKIP_KEYS = { type: 1, work_types: 1, forType: 1, special_students: 1 };
  function walk(x) {
    if (x == null) return;
    if (typeof x === 'string') { n += x.trim().length; return; }
    if (Array.isArray(x)) { x.forEach(walk); return; }
    if (typeof x === 'object') { Object.keys(x).forEach(k => { if (!SKIP_KEYS[k]) walk(x[k]); }); }
  }
  ['kpi1_data', 'kpi2_data', 'kpi3_data', 'kpi4_data', 'kpi5_data', 'kpi6_data'].forEach(k => {
    walk(parseJsonField(o[k]));
  });
  n += String(o.reflection || '').trim().length * 3;
  n += String(o.help_content || '').trim().length;
  const att = parseJsonField(o.attachments);
  if (Array.isArray(att)) n += att.length * 50;
  return n;
}

/**
 * 補蓋提交時間戳（admin 修復用）：指定日期中「有實質內容但 submitted_at 空白」的日誌
 * 一律把 submitted_at 補成該筆 updated_at（歷史資料是舊版後端存的，沒蓋到時間戳）
 * params: { operator(admin), date, nickname? }，不發通知
 */
function adminStampSubmitted(params) {
  const u = params.operator ? findUserByNickname(params.operator) : null;
  if (!u || u.role !== 'admin') return { ok: false, error: '僅限管理員操作' };
  if (!params.date) return { ok: false, error: 'missing date' };
  const sheet = getSheet(SHEET_NAMES.LOGS);
  const headers = getHeaders(sheet);
  const col = headers.indexOf('submitted_at') + 1;
  if (col === 0) return { ok: false, error: 'LOGS 缺 submitted_at 欄，請先執行 setupSheets' };
  const all = sheetToObjects(SHEET_NAMES.LOGS);   // 依表列順序，index+2 = 實際列號
  const stamped = [];
  all.forEach((l, i) => {
    if (String(l.date) !== String(params.date)) return;
    if (params.nickname && l.nickname !== params.nickname) return;
    if (l.submitted_at) return;
    if (logContentScore_(l) < 100) return;   // 幾乎沒內容的草稿不補蓋
    const t = l.updated_at ? new Date(l.updated_at).toISOString() : nowIso();
    sheet.getRange(i + 2, col).setValue(t);
    stamped.push(l.nickname);
  });
  logSystem(params.operator, 'stamp_submitted', String(params.date), { stamped });
  return { ok: true, date: String(params.date), stamped };
}

/** 當月已用補繳次數 */
function countMakeupLogs_(nickname, ym) {
  return sheetToObjects(SHEET_NAMES.LOGS).filter(l =>
    l.nickname === nickname && String(l.date).slice(0, 7) === ym && l.is_makeup === true
  ).length;
}

/** 查詢本月補繳額度（每月 3 次） */
function getMakeupQuota(params) {
  const nickname = params.nickname;
  if (!nickname) return { ok: false, error: 'missing nickname' };
  const ym = todayStr().slice(0, 7);
  const used = countMakeupLogs_(nickname, ym);
  return { ok: true, year_month: ym, used: used, limit: 3, remaining: Math.max(0, 3 - used) };
}

function getLog(params) {
  const { log_id, nickname, date } = params;
  let log;
  if (log_id) {
    log = findObject(SHEET_NAMES.LOGS, 'log_id', log_id);
  } else if (nickname && date) {
    const id = 'LOG-' + String(date).replace(/-/g, '') + '-' + nickname;
    log = findObject(SHEET_NAMES.LOGS, 'log_id', id);
  } else {
    return { ok: false, error: 'missing log_id or (nickname+date)' };
  }
  if (!log) return { ok: true, log: null };

  // 解析 JSON 欄位
  ['kpi1_data','kpi2_data','kpi3_data','kpi4_data','kpi5_data','kpi6_data','attachments'].forEach(k => {
    log[k] = parseJsonField(log[k]);
  });
  return { ok: true, log };
}

function getTodayLog(params) {
  return getLog({ nickname: params.nickname, date: todayStr() });
}

/**
 * 列出日誌（主管看部門、admin 看全部）
 */
function listLogs(params) {
  const { viewer, nickname, department, from, to, limit } = params;
  if (!viewer) return { ok: false, error: 'missing viewer' };

  const viewerUser = findUserByNickname(viewer);
  if (!viewerUser) return { ok: false, error: 'viewer not found' };

  let logs = sheetToObjects(SHEET_NAMES.LOGS);

  // 權限過濾
  if (viewerUser.role === 'teacher' || viewerUser.role === 'admin_staff') {
    logs = logs.filter(l => l.nickname === viewer);
  } else if (viewerUser.role === 'manager' && !isGlobalManager_(viewerUser)) {
    logs = logs.filter(l => sameDepartment_(l.department, viewerUser.department) || l.nickname === viewer);
  }
  // admin 看全部

  // 條件過濾
  if (nickname) logs = logs.filter(l => l.nickname === nickname);
  if (department) logs = logs.filter(l => sameDepartment_(l.department, department));
  if (from) logs = logs.filter(l => String(l.date) >= from);
  if (to) logs = logs.filter(l => String(l.date) <= to);

  // 排序：新→舊
  logs.sort((a, b) => String(b.date).localeCompare(String(a.date)));

  // 解析 JSON 欄位
  logs.forEach(l => {
    ['kpi1_data','kpi2_data','kpi3_data','kpi4_data','kpi5_data','kpi6_data','attachments'].forEach(k => {
      l[k] = parseJsonField(l[k]);
    });
  });

  if (limit) logs = logs.slice(0, Number(limit));

  return { ok: true, logs };
}

/**
 * 附件 → Evidence 整份取代：先刪掉該 log_id 舊列再寫入，確保一份日誌只有一組證據
 */
function replaceEvidenceForLog_(log_id, nickname, date, attachmentsRaw) {
  const sh = getSheet(SHEET_NAMES.EVIDENCE);
  const last = sh.getLastRow();
  if (last > 1) {
    const headers = getHeaders(sh);
    const col = headers.indexOf('log_id') + 1;
    const vals = sh.getRange(2, col, last - 1, 1).getValues();
    for (let r = vals.length - 1; r >= 0; r--) {
      if (String(vals[r][0]) === String(log_id)) sh.deleteRow(r + 2);
    }
  }
  saveEvidenceFromLog(log_id, nickname, date, attachmentsRaw);
}

/**
 * 清除 Evidence 重複列（歷史資料修復用；同 log_id+url+kpi 只留一筆）
 * 需 operator=admin + confirm:'CLEAN'
 */
function cleanupDuplicateEvidence(params) {
  const u = params.operator ? findUserByNickname(params.operator) : null;
  if (!u || u.role !== 'admin') return { ok: false, error: '僅限管理員操作' };
  if (params.confirm !== 'CLEAN') return { ok: false, error: '需帶 confirm=CLEAN 以確認清除' };
  const sh = getSheet(SHEET_NAMES.EVIDENCE);
  const values = sh.getDataRange().getValues();
  if (values.length <= 1) return { ok: true, removed: 0, kept: 0 };
  const headers = values[0];
  const li = headers.indexOf('log_id'), ui = headers.indexOf('url'), ki = headers.indexOf('kpi_category');
  const seen = {};
  const keep = [headers];
  for (let r = 1; r < values.length; r++) {
    const key = values[r][li] + '|' + values[r][ui] + '|' + values[r][ki];
    if (seen[key]) continue;
    seen[key] = true;
    keep.push(values[r]);
  }
  const removed = values.length - keep.length;
  sh.clearContents();
  sh.getRange(1, 1, keep.length, headers.length).setValues(keep);
  logSystem(params.operator, 'cleanup_dup_evidence', '', { removed: removed, kept: keep.length - 1 });
  return { ok: true, removed: removed, kept: keep.length - 1 };
}

/**
 * 附件寫入 Evidence
 */
function saveEvidenceFromLog(log_id, nickname, date, attachmentsRaw) {
  const arr = parseJsonField(attachmentsRaw);
  if (!Array.isArray(arr)) return;
  arr.forEach(att => {
    if (!att.url) return;
    appendRow(SHEET_NAMES.EVIDENCE, {
      evidence_id: Utilities.getUuid(),
      log_id,
      nickname,
      date,
      kpi_category: att.kpi || '',
      type: att.type || 'link',
      url: att.url,
      description: att.description || '',
      source_type: att.forType || '',
      created_at: nowIso()
    });
  });
}

/**
 * 證據紀錄（以天計）— 老師看自己、主管看部門、admin 全部
 * 分類：KPI2=環境整潔(env)、KPI3=教案歸檔(lesson)
 */
function getEvidenceLog(params) {
  const { viewer, year_month, nickname } = params || {};
  if (!viewer || !year_month) return { ok: false, error: 'missing viewer/year_month' };
  const vu = findUserByNickname(viewer);
  if (!vu) return { ok: false, error: 'viewer not found' };
  const users = sheetToObjects(SHEET_NAMES.USERS);

  let scope;
  if (vu.role === 'admin') scope = users.map(u => u.nickname);
  else if (vu.role === 'manager') scope = users.filter(u => isGlobalManager_(vu) || sameDepartment_(u.department, vu.department)).map(u => u.nickname);
  else scope = [viewer];
  if (nickname) {
    if (scope.indexOf(nickname) < 0) return { ok: false, error: 'no permission' };
    scope = [nickname];
  }

  const evAll = sheetToObjects(SHEET_NAMES.EVIDENCE)
    .filter(e => String(e.date).slice(0, 7) === year_month && scope.indexOf(e.nickname) >= 0);

  const usersMap = {}; users.forEach(u => usersMap[u.nickname] = u);
  const byPerson = {};
  evAll.forEach(e => {
    const nk = e.nickname, d = String(e.date);
    const person = usersMap[nk] || null;
    const k = normalizeEvalEvidenceKpi_(person, e);
    const environmentKpi = isAnqinUser(person) ? 6 : 2;
    const lessonKpi = isAnqinUser(person) ? 2 : 3;
    if (k !== environmentKpi && k !== lessonKpi) return;
    byPerson[nk] = byPerson[nk] || {};
    byPerson[nk][d] = byPerson[nk][d] || { date: d, env: 0, lesson: 0, urls: [] };
    if (k === environmentKpi) byPerson[nk][d].env++;
    if (k === lessonKpi) byPerson[nk][d].lesson++;
    if (e.url) byPerson[nk][d].urls.push(e.url);
  });

  const people = Object.keys(byPerson).map(nk => {
    const days = Object.values(byPerson[nk]).sort((a, b) => String(b.date).localeCompare(String(a.date)));
    return {
      nickname: nk,
      department: (usersMap[nk] || {}).department || '',
      env_days: days.filter(d => d.env > 0).length,
      lesson_days: days.filter(d => d.lesson > 0).length,
      days: days
    };
  }).sort((a, b) => String(a.nickname).localeCompare(String(b.nickname)));

  return { ok: true, year_month, people };
}

/**
 * 主管發文 → Posts（每週 3 篇 KPI 證據）
 */
function saveManagerPosts(nickname, department, date, posts) {
  if (!Array.isArray(posts)) return;
  const week = weekOf(date);
  posts.forEach(p => {
    if (!p.url && !p.screenshot) return;
    appendRow(SHEET_NAMES.POSTS, {
      post_id: Utilities.getUuid(),
      date,
      nickname,
      department,
      platform: p.platform || 'FB',
      url: p.url || '',
      screenshot: p.screenshot || '',
      content_type: p.content_type || '其他',
      week_of: week,
      created_at: nowIso()
    });
  });
}

/**
 * 統計主管本週發文數（FB+IG 累計）
 */
function getWeekPostCount(params) {
  const { nickname, date } = params;
  if (!nickname) return { ok: false, error: 'missing nickname' };
  const week = weekOf(date || todayStr());
  const posts = sheetToObjects(SHEET_NAMES.POSTS);
  const weekPosts = posts.filter(p => p.nickname === nickname && p.week_of === week);
  return {
    ok: true,
    week,
    count: weekPosts.length,
    target: 3,
    posts: weekPosts
  };
}

/**
 * 排程：每天 03:00 鎖定 24h 前的日誌（由觸發器呼叫）
 */
function dailyLockOldLogs() {
  const sheet = getSheet(SHEET_NAMES.LOGS);
  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) return;
  const headers = getHeaders(sheet);
  const dateCol = headers.indexOf('date') + 1;
  const lockedCol = headers.indexOf('locked') + 1;
  const cutoff = new Date(Date.now() - 24 * 3600 * 1000);
  const cutoffStr = Utilities.formatDate(cutoff, 'Asia/Taipei', 'yyyy-MM-dd');

  for (let r = 2; r <= lastRow; r++) {
    const d = String(sheet.getRange(r, dateCol).getValue());
    if (d < cutoffStr) {
      sheet.getRange(r, lockedCol).setValue(true);
    }
  }
}

/**
 * 拍照存證：把前端壓縮後的照片存進 Google Drive，回傳授權檢視網址
 * params: { nickname, date, kpi, mimeType, base64, description }
 * 資料夾結構：KPI證據 / 部門 / 暱稱 / 年月
 * 權限：資料本人、所屬主管、全域主管與管理員
 */
function uploadPhoto(params) {
  const { nickname, date, kpi, mimeType, base64 } = params;
  if (!nickname || !base64) return { ok: false, error: 'missing nickname or base64' };
  if (String(base64).length > 12 * 1024 * 1024) return { ok: false, error: '照片內容過大，請壓縮後再上傳' };

  const user = findUserByNickname(nickname);
  if (!user) return { ok: false, error: 'user not found' };

  const dateStr = String(date || todayStr());
  const ym = dateStr.slice(0, 7); // YYYY-MM
  const mt = mimeType || 'image/jpeg';
  const ext = mt.indexOf('png') >= 0 ? 'png'
    : mt.indexOf('webp') >= 0 ? 'webp'
    : mt.indexOf('gif') >= 0 ? 'gif'
    : mt.indexOf('heif') >= 0 ? 'heif'
    : mt.indexOf('heic') >= 0 ? 'heic'
    : 'jpg';

  // 資料夾：KPI證據 / 部門 / 暱稱 / 年月
  const scopeKey = String(kpi || '');
  const scope = scopeKey.indexOf('talent-') === 0 ? 'talent'
    : scopeKey.indexOf('admin-marketing') === 0 ? 'admin-marketing'
    : 'anqin';
  const root = getEvidenceRootFolder_();
  const deptF = getOrCreateChildFolder_(root, normalizeDepartment_(user.department) || '未分部門');
  const userF = getOrCreateChildFolder_(deptF, nickname);
  const workLabel = scope === 'talent' ? '才藝' : scope === 'admin-marketing' ? '行政美宣' : '安親';
  const workF = getOrCreateChildFolder_(userF, workLabel);
  const ymF = getOrCreateChildFolder_(workF, ym);

  const bytes = Utilities.base64Decode(base64);
  const filename = `K${kpi || 0}-${dateStr}-${Utilities.getUuid().slice(0, 8)}.${ext}`;
  const blob = Utilities.newBlob(bytes, mt, filename);
  const file = ymF.createFile(blob);
  secureKpiReportPath_(root, deptF, userF, workF, ymF, user, scope, []);
  secureKpiDriveItem_(file, user, scope, []);

  const fileId = file.getId();
  const url = 'https://drive.google.com/file/d/' + fileId + '/view';

  logSystem(nickname, 'upload_photo', fileId, { kpi, date: dateStr });
  return { ok: true, url, fileId };
}

/**
 * 教案與教材原始檔上傳。
 * 資料夾結構：KPI教材 / 部門 / 暱稱 / 年月
 */
function uploadFile(params) {
  const { nickname, date, mimeType, base64 } = params;
  if (!nickname || !base64) return { ok: false, error: 'missing nickname or base64' };

  const user = findUserByNickname(nickname);
  if (!user) return { ok: false, error: 'user not found' };
  if (String(base64).length > 36 * 1024 * 1024) return { ok: false, error: '檔案超過 25 MB 上限' };

  const dateStr = String(date || todayStr());
  const ym = dateStr.slice(0, 7);
  const originalName = String(params.fileName || '教材檔案')
    .replace(/[\\/:*?"<>|]/g, '-')
    .replace(/^\.+/, '')
    .slice(0, 120) || '教材檔案';
  const uniqueName = Utilities.getUuid().slice(0, 8) + '-' + originalName;
  const bytes = Utilities.base64Decode(base64);
  const blob = Utilities.newBlob(bytes, mimeType || 'application/octet-stream', uniqueName);

  const categoryKey = String(params.category || '');
  const scope = categoryKey.indexOf('talent-') === 0 ? 'talent'
    : categoryKey.indexOf('admin-marketing') === 0 ? 'admin-marketing'
    : 'anqin';
  const root = getMaterialRootFolder_();
  const deptF = getOrCreateChildFolder_(root, normalizeDepartment_(user.department) || '未分部門');
  const userF = getOrCreateChildFolder_(deptF, nickname);
  const workLabel = scope === 'talent' ? '才藝' : scope === 'admin-marketing' ? '行政美宣' : '安親';
  const workF = getOrCreateChildFolder_(userF, workLabel);
  const ymF = getOrCreateChildFolder_(workF, ym);
  const file = ymF.createFile(blob);
  secureKpiReportPath_(root, deptF, userF, workF, ymF, user, scope, []);
  secureKpiDriveItem_(file, user, scope, []);

  const fileId = file.getId();
  const url = 'https://drive.google.com/file/d/' + fileId + '/view';
  logSystem(nickname, 'upload_material', fileId, { date: dateStr, fileName: originalName, category: params.category || '' });
  return { ok: true, url, fileId, fileName: originalName };
}

/**
 * 私密雲端照片預覽。
 * Drive 私密縮圖會受第三方 Cookie 影響，因此由已驗簽的 KPI 工作階段讀取，
 * 並只回傳目前角色有權查看的影像。一次最多 12 張，避免單次回應過大。
 */
function getAttachmentPreviews(params) {
  const actor = params && params.__actor;
  if (!actor) return { ok: false, error: '請先登入再查看照片' };

  const input = Array.isArray(params.file_ids)
    ? params.file_ids
    : String(params.file_ids || '').split(',');
  const ids = [];
  input.forEach(function (value) {
    const id = String(value || '').trim();
    if (!/^[A-Za-z0-9_-]{10,200}$/.test(id) || ids.indexOf(id) >= 0 || ids.length >= 12) return;
    ids.push(id);
  });
  if (!ids.length) return { ok: true, previews: [], errors: [] };

  let ownerByFileId = null;
  function ownerForFile(fileId) {
    if (!ownerByFileId) {
      ownerByFileId = {};
      sheetToObjects(SHEET_NAMES.EVIDENCE).forEach(function (row) {
        const url = String(row.url || '');
        ids.forEach(function (id) {
          if (!ownerByFileId[id] && url.indexOf(id) >= 0) ownerByFileId[id] = String(row.nickname || '');
        });
      });
      sheetToObjects(SHEET_NAMES.LOGS).forEach(function (row) {
        const haystack = [
          row.attachments, row.kpi1_data, row.kpi2_data, row.kpi3_data,
          row.kpi4_data, row.kpi5_data, row.kpi6_data,
        ].map(function (value) {
          if (typeof value === 'string') return value;
          try { return JSON.stringify(value || ''); } catch (error) { return ''; }
        }).join('|');
        ids.forEach(function (id) {
          if (!ownerByFileId[id] && haystack.indexOf(id) >= 0) ownerByFileId[id] = String(row.nickname || '');
        });
      });
    }
    return String(ownerByFileId[fileId] || '');
  }

  function actorListedOnFile(file) {
    if (actor.role === 'admin' || isGlobalManager_(actor)) return true;
    const email = String(actor.email || '').trim().toLowerCase();
    if (!email) return false;
    try {
      if (String(file.getOwner().getEmail() || '').trim().toLowerCase() === email) return true;
    } catch (error) {}
    try {
      if (file.getViewers().some(function (user) {
        return String(user.getEmail() || '').trim().toLowerCase() === email;
      })) return true;
    } catch (error) {}
    try {
      if (file.getEditors().some(function (user) {
        return String(user.getEmail() || '').trim().toLowerCase() === email;
      })) return true;
    } catch (error) {}
    return false;
  }

  const previews = [];
  const errors = [];
  ids.forEach(function (fileId) {
    try {
      const file = DriveApp.getFileById(fileId);
      let allowed = actorListedOnFile(file);
      if (!allowed) {
        const ownerNickname = ownerForFile(fileId);
        const owner = ownerNickname ? findUserByNickname(ownerNickname) : null;
        allowed = Boolean(owner && actorCanAccessUser_(actor, owner));
      }
      if (!allowed) {
        errors.push({ fileId: fileId, error: '無權查看此照片' });
        return;
      }
      const sourceMimeType = String(file.getMimeType() || '');
      if (sourceMimeType.indexOf('image/') !== 0) {
        errors.push({ fileId: fileId, error: '此附件不是照片格式' });
        return;
      }
      let blob = null;
      try { blob = file.getThumbnail(); } catch (error) {}
      if (!blob) blob = file.getBlob();
      const bytes = blob.getBytes();
      if (bytes.length > 1200 * 1024) {
        errors.push({ fileId: fileId, error: '照片預覽過大，請開啟原檔' });
        return;
      }
      const mimeType = String(blob.getContentType() || sourceMimeType || 'image/jpeg');
      previews.push({
        fileId: fileId,
        fileName: file.getName(),
        mimeType: mimeType,
        dataUrl: 'data:' + mimeType + ';base64,' + Utilities.base64Encode(bytes),
      });
    } catch (error) {
      errors.push({ fileId: fileId, error: '照片預覽讀取失敗' });
    }
  });
  return { ok: true, previews: previews, errors: errors };
}

function getMaterialRootFolder_() {
  const props = PropertiesService.getScriptProperties();
  const cached = props.getProperty('MATERIAL_ROOT_FOLDER_ID');
  if (cached) {
    try { return DriveApp.getFolderById(cached); } catch (e) { /* 失效則重建 */ }
  }
  const name = 'KPI教材';
  const it = DriveApp.getFoldersByName(name);
  const folder = it.hasNext() ? it.next() : DriveApp.createFolder(name);
  props.setProperty('MATERIAL_ROOT_FOLDER_ID', folder.getId());
  return folder;
}

/** 取得（或建立）證據根資料夾，ID 快取於 Script Properties 避免每次掃描 Drive */
function getEvidenceRootFolder_() {
  const props = PropertiesService.getScriptProperties();
  const cached = props.getProperty('EVIDENCE_ROOT_FOLDER_ID');
  if (cached) {
    try { return DriveApp.getFolderById(cached); } catch (e) { /* 失效則重建 */ }
  }
  const name = 'KPI證據';
  const it = DriveApp.getFoldersByName(name);
  const folder = it.hasNext() ? it.next() : DriveApp.createFolder(name);
  props.setProperty('EVIDENCE_ROOT_FOLDER_ID', folder.getId());
  return folder;
}

/** 取得（或建立）子資料夾 */
function getOrCreateChildFolder_(parent, name) {
  const it = parent.getFoldersByName(name);
  if (it.hasNext()) return it.next();
  return parent.createFolder(name);
}

/* ========== 週報（教學反思/學生觀察/教具需求/課程改善）========== */

function saveWeekly(params) {
  const { nickname, week_of } = params;
  if (!nickname || !week_of) return { ok: false, error: 'missing nickname or week_of' };
  const user = findUserByNickname(nickname);
  if (!user) return { ok: false, error: 'user not found' };
  if (user.status !== 'active') return { ok: false, error: '帳號目前未啟用' };

  const week_id = 'WK-' + week_of + '-' + nickname;
  const existing = findObject(SHEET_NAMES.WEEKLY, 'week_id', week_id);
  const data = {
    week_id, week_of, nickname, department: normalizeDepartment_(user.department), role: user.role,
    teaching_reflection: params.teaching_reflection || '',
    student_observation: params.student_observation || '',
    tool_needs: params.tool_needs || '',
    course_improvement: params.course_improvement || '',
    updated_at: nowIso(),
  };
  if (existing) {
    updateRow(SHEET_NAMES.WEEKLY, existing._row, data);
  } else {
    data.created_at = nowIso();
    appendRow(SHEET_NAMES.WEEKLY, data);
  }
  logSystem(nickname, 'save_weekly', week_id, { week_of });
  return { ok: true, week_id };
}

function getWeekly(params) {
  const { nickname, week_of } = params;
  if (!nickname || !week_of) return { ok: false, error: 'missing nickname or week_of' };
  const week_id = 'WK-' + week_of + '-' + nickname;
  const w = findObject(SHEET_NAMES.WEEKLY, 'week_id', week_id);
  return { ok: true, weekly: w || null };
}

function listWeekly(params) {
  const { viewer, nickname, week_of } = params;
  if (!viewer) return { ok: false, error: 'missing viewer' };
  const viewerUser = findUserByNickname(viewer);
  if (!viewerUser) return { ok: false, error: 'viewer not found' };

  let list = sheetToObjects(SHEET_NAMES.WEEKLY);
  if (viewerUser.role === 'teacher' || viewerUser.role === 'admin_staff') {
    list = list.filter(w => w.nickname === viewer);
  } else if (viewerUser.role === 'manager' && !isGlobalManager_(viewerUser)) {
    list = list.filter(w => sameDepartment_(w.department, viewerUser.department) || w.nickname === viewer);
  }
  // admin 看全部
  if (nickname) list = list.filter(w => w.nickname === nickname);
  if (week_of) list = list.filter(w => w.week_of === week_of);
  list.sort((a, b) => String(b.week_of).localeCompare(String(a.week_of)));
  return { ok: true, weeklies: list };
}

// ════════════════════════════════════════════════════════════
//  feedback.gs
// ════════════════════════════════════════════════════════════

/**
 * 即時主管回饋 + 觀課/巡班紀錄
 */

function addFeedback(params) {
  const { log_id, from_nickname, to_nickname, content, tag } = params;
  if (!log_id || !from_nickname || !to_nickname || !content) {
    return { ok: false, error: 'missing required fields' };
  }
  const fromU = findUserByNickname(from_nickname);
  const toU = findUserByNickname(to_nickname);
  if (!fromU || !toU || fromU.status !== 'active' || toU.status !== 'active') return { ok: false, error: '對話帳號不存在或未啟用' };
  if (fromU.role === 'teacher' && !(toU.role === 'manager' && (sameDepartment_(toU.department, fromU.department) || isGlobalManager_(toU))) && toU.role !== 'admin') {
    return { ok: false, error: '老師只能回覆同部門主管或管理員' };
  }
  if (fromU.role === 'manager' && !isGlobalManager_(fromU) && toU.role !== 'admin' && !sameDepartment_(toU.department, fromU.department)) {
    return { ok: false, error: '主管只能回覆自己部門' };
  }
  // 主管/老闆發的算「回饋」；老師發的算「回覆」（回覆不需 tag）
  const isBoss = fromU && (fromU.role === 'manager' || fromU.role === 'admin');
  const feedback_id = Utilities.getUuid();
  appendRow(SHEET_NAMES.FEEDBACK, {
    feedback_id: feedback_id,
    log_id,
    from_nickname,
    to_nickname,
    content,
    tag: isBoss ? (tag || '已知悉') : '回覆',
    created_at: nowIso(),
    read_at: ''
  });
  logSystem(from_nickname, 'add_feedback', log_id, { to: to_nickname, tag: tag, reply: !isBoss });

  // 即時通知對方（LINE + OneSignal）
  try {
    const dateMatch = String(log_id).match(/^LOG-(\d{4})(\d{2})(\d{2})-/);
    const contextLabel = dateMatch ? dateMatch.slice(1).join('/') + ' 日報' : 'KPI 紀錄';
    const title = isBoss ? ('💬 ' + from_nickname + ' 給你回饋') : ('💬 ' + from_nickname + ' 回覆了你');
    const body = '（' + contextLabel + '）\n' + String(content).slice(0, 120);
    notifyUser_(toU, title, body);
  } catch (e) { /* 通知失敗不影響回饋寫入 */ }

  return { ok: true, feedback_id: feedback_id };
}

/** 對話串：某則日誌的所有往來訊息，依時間正序（老師/主管共用） */
function listFeedbackThread(params) {
  const { log_id } = params;
  if (!log_id) return { ok: false, error: 'missing log_id' };
  const list = sheetToObjects(SHEET_NAMES.FEEDBACK)
    .filter(f => f.log_id === log_id)
    .sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
  return { ok: true, thread: list };
}

function listFeedback(params) {
  const { nickname, log_id, unread_only } = params;
  let list = sheetToObjects(SHEET_NAMES.FEEDBACK);
  if (nickname) list = list.filter(f => f.to_nickname === nickname || f.from_nickname === nickname);
  if (log_id) list = list.filter(f => f.log_id === log_id);
  if (unread_only) list = list.filter(f => !f.read_at);
  list.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
  return { ok: true, feedback: list };
}

function markFeedbackRead(params) {
  const { feedback_id } = params;
  const row = findRow(SHEET_NAMES.FEEDBACK, 'feedback_id', feedback_id);
  if (row < 0) return { ok: false, error: 'feedback not found' };
  updateRow(SHEET_NAMES.FEEDBACK, row, { read_at: nowIso() });
  return { ok: true };
}

function addObservation(params) {
  const { observer, observed, type, date, duration_min, score, notes, photos } = params;
  if (!observer || !observed || !type) {
    return { ok: false, error: 'missing required fields' };
  }
  appendRow(SHEET_NAMES.OBSERVATION, {
    obs_id: Utilities.getUuid(),
    date: date || todayStr(),
    observer,
    observed,
    type,
    duration_min: duration_min || 0,
    score: score || 0,
    notes: notes || '',
    photos: photos || '',
    created_at: nowIso()
  });
  logSystem(observer, 'add_observation', observed, { type, score });
  return { ok: true };
}

function listObservations(params) {
  const { observer, observed, type, from, to } = params;
  let list = sheetToObjects(SHEET_NAMES.OBSERVATION);
  if (observer) list = list.filter(o => o.observer === observer);
  if (observed) list = list.filter(o => o.observed === observed);
  if (type) list = list.filter(o => o.type === type);
  if (from) list = list.filter(o => String(o.date) >= from);
  if (to) list = list.filter(o => String(o.date) <= to);
  list.sort((a, b) => String(b.date).localeCompare(String(a.date)));
  return { ok: true, observations: list };
}

function addPost(params) {
  const { nickname, date, platform, url, screenshot, content_type } = params;
  if (!nickname || !platform) return { ok: false, error: 'missing required fields' };
  const user = findUserByNickname(nickname);
  if (!user) return { ok: false, error: 'user not found' };
  appendRow(SHEET_NAMES.POSTS, {
    post_id: Utilities.getUuid(),
    date: date || todayStr(),
    nickname,
    department: normalizeDepartment_(user.department),
    platform,
    url: url || '',
    screenshot: screenshot || '',
    content_type: content_type || '其他',
    week_of: weekOf(date),
    created_at: nowIso()
  });
  return { ok: true };
}

function listPosts(params) {
  const { nickname, week, from, to } = params;
  let list = sheetToObjects(SHEET_NAMES.POSTS);
  if (nickname) list = list.filter(p => p.nickname === nickname);
  if (week) list = list.filter(p => p.week_of === week);
  if (from) list = list.filter(p => String(p.date) >= from);
  if (to) list = list.filter(p => String(p.date) <= to);
  list.sort((a, b) => String(b.date).localeCompare(String(a.date)));
  return { ok: true, posts: list };
}

// ════════════════════════════════════════════════════════════
//  okr.gs
// ════════════════════════════════════════════════════════════

/**
 * OKR 學期目標管理
 */

function saveOKR(params) {
  const { semester, nickname, objective_no, objective_type, objective_text,
          kr1_text, kr2_text, kr3_text } = params;
  if (!semester || !nickname || !objective_no) {
    return { ok: false, error: 'missing required fields' };
  }
  const okr_id = `OKR-${semester}-${nickname}-${objective_no}`;
  const existing = findObject(SHEET_NAMES.OKR, 'okr_id', okr_id);

  const data = {
    okr_id, semester, nickname,
    objective_no: Number(objective_no),
    objective_type: objective_type || '',
    objective_text: objective_text || '',
    kr1_text: kr1_text || '',
    kr2_text: kr2_text || '',
    kr3_text: kr3_text || '',
    kr1_progress: existing ? existing.kr1_progress : 0,
    kr2_progress: existing ? existing.kr2_progress : 0,
    kr3_progress: existing ? existing.kr3_progress : 0,
    status: 'active',
    updated_at: nowIso()
  };

  if (existing) {
    updateRow(SHEET_NAMES.OKR, existing._row, data);
  } else {
    data.created_at = nowIso();
    appendRow(SHEET_NAMES.OKR, data);
  }
  return { ok: true, okr_id };
}

function getOKR(params) {
  const { nickname, semester } = params;
  if (!nickname) return { ok: false, error: 'missing nickname' };
  let list = sheetToObjects(SHEET_NAMES.OKR);
  list = list.filter(o => o.nickname === nickname);
  if (semester) list = list.filter(o => o.semester === semester);
  return { ok: true, okrs: list };
}

function updateOKRProgress(params) {
  const { okr_id, kr1_progress, kr2_progress, kr3_progress, month, month_note } = params;
  const row = findRow(SHEET_NAMES.OKR, 'okr_id', okr_id);
  if (row < 0) return { ok: false, error: 'OKR not found' };
  const updates = { updated_at: nowIso() };
  if (kr1_progress !== undefined) updates.kr1_progress = kr1_progress;
  if (kr2_progress !== undefined) updates.kr2_progress = kr2_progress;
  if (kr3_progress !== undefined) updates.kr3_progress = kr3_progress;
  if (month && month_note !== undefined) {
    updates['month' + month] = month_note;
  }
  updateRow(SHEET_NAMES.OKR, row, updates);
  return { ok: true };
}

// ════════════════════════════════════════════════════════════
//  evaluation.gs
// ════════════════════════════════════════════════════════════

/**
 * 月度評核：證據彙整、評分、獎金計算
 */

/**
 * 取得評核所需的證據摘要
 * 主管打開「評核某老師當月」時呼叫，自動彙整所有證據
 */
function getEvalEvidence(params) {
  const { nickname, year_month, viewer } = params;
  if (!nickname || !year_month) return { ok: false, error: 'missing nickname or year_month' };

  const [year, month] = year_month.split('-').map(Number);
  const from = `${year}-${String(month).padStart(2, '0')}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const to = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

  const user = findUserByNickname(nickname);
  if (!user) return { ok: false, error: 'user not found' };
  const viewerUser = findUserByNickname(viewer);
  const canReview = viewerUser && viewerUser.status === 'active' && (
    viewerUser.role === 'admin' ||
    (viewerUser.role === 'manager' && (isGlobalManager_(viewerUser) || sameDepartment_(viewerUser.department, user.department))) ||
    (['teacher', 'admin_staff'].includes(viewerUser.role) && viewerUser.nickname === user.nickname)
  );
  if (!canReview) return { ok: false, error: '無評核資料讀取權限' };

  // 1. 當月所有日誌
  const logs = sheetToObjects(SHEET_NAMES.LOGS)
    .filter(l => l.nickname === nickname && String(l.date) >= from && String(l.date) <= to);

  // 2. 附件證據（依 KPI 分類）
  const evidence = sheetToObjects(SHEET_NAMES.EVIDENCE)
    .filter(e => e.nickname === nickname && String(e.date) >= from && String(e.date) <= to);
  // 新版直接保存 100 分制 KPI 編號；沒有 source_type 的歷史資料仍套用舊編號。
  const anqinUser = isAnqinUser(user);
  const evidenceByKpi = { 1: [], 2: [], 3: [], 4: [], 5: [], 6: [] };
  evidence.forEach(e => {
    const k = normalizeEvalEvidenceKpi_(user, e);
    if (k >= 1 && k <= 6) evidenceByKpi[k].push(e);
  });
  // 證據以「天」計：環境整潔(KPI2)、教案歸檔(KPI3) 各算有幾天執行（同一天多張只算 1）
  const _evDay = {};
  evidence.forEach(e => {
    const k = normalizeEvalEvidenceKpi_(user, e), d = String(e.date);
    _evDay[d] = _evDay[d] || { env: false, lesson: false };
    if (k === (anqinUser ? 6 : 2)) _evDay[d].env = true;
    if (k === (anqinUser ? 2 : 3)) _evDay[d].lesson = true;
  });
  const env_days = Object.values(_evDay).filter(x => x.env).length;
  const lesson_days = Object.values(_evDay).filter(x => x.lesson).length;

  // 3. 主管當月回饋
  const feedback = sheetToObjects(SHEET_NAMES.FEEDBACK)
    .filter(f => f.to_nickname === nickname && String(f.created_at).slice(0, 7) === year_month);

  // 4. 觀課/巡班
  const observations = sheetToObjects(SHEET_NAMES.OBSERVATION)
    .filter(o => o.observed === nickname && String(o.date) >= from && String(o.date) <= to);

  // 5. 發文證據：主管(安親發文 KPI4) + 行政美編行銷(社群內容 KPI1)
  let posts = [];
  let postsByWeek = {};
  if (user.role === 'manager' || (user.role === 'admin_staff' && user.subtype === 'marketing')) {
    posts = sheetToObjects(SHEET_NAMES.POSTS)
      .filter(p => p.nickname === nickname && String(p.date) >= from && String(p.date) <= to);
    posts.forEach(p => {
      postsByWeek[p.week_of] = (postsByWeek[p.week_of] || 0) + 1;
    });
  }

  // 6. OKR
  const semester = year_month >= `${year}-08` ? `${year}-下` : `${year}-上`;
  const okrs = sheetToObjects(SHEET_NAMES.OKR)
    .filter(o => o.nickname === nickname && o.semester === semester);

  // 7. 自動建議分數
  const suggestion = suggestKpiScores(user, logs, evidence, feedback, observations, postsByWeek);

  return {
    ok: true,
    nickname,
    year_month,
    role: user.role,
    department: normalizeDepartment_(user.department),
    summary: {
      log_count: logs.length,
      makeup_count: logs.filter(l => l.is_makeup === true).length,
      evidence_count: evidence.length,
      env_days: env_days,
      lesson_days: lesson_days,
      feedback_count: feedback.length,
      observation_count: observations.length,
      posts_total: posts.length,
      posts_weeks_under_target: Object.entries(postsByWeek).filter(([w, c]) => c < 3).length,
    },
    logs,
    evidence_by_kpi: evidenceByKpi,
    feedback,
    observations,
    posts,
    posts_by_week: postsByWeek,
    okrs,
    suggestion
  };
}

/**
 * 安親 V2 的 source_type 表示 kpi_category 已是 100 分制正式編號。
 * 舊資料沒有此欄，維持舊日報編號轉換，避免歷史證據跑到錯誤 KPI。
 */
function normalizeEvalEvidenceKpi_(user, evidence) {
  const kpi = Number(evidence && evidence.kpi_category);
  if (!isAnqinUser(user)) return kpi;
  const sourceType = String((evidence && evidence.source_type) || '');
  if (/^(v2-|env_)/.test(sourceType)) return kpi;
  const legacyMap = { 1: 1, 2: 6, 3: 2, 4: 4, 5: 4, 6: 5 };
  return legacyMap[kpi] || kpi;
}

/**
 * 自動建議分數（依日誌頻率、證據數量、回饋標籤）
 */
function suggestKpiScores(user, logs, evidence, feedback, observations, postsByWeek) {
  const role = user.role;
  const anqin = isAnqinUser(user);
  // 安親 100 分制配分；其餘維持 70 分制
  const max = anqin
    ? { 1: 20, 2: 20, 3: 20, 4: 20, 5: 12, 6: 8 }
    : { 1: 15, 2: 15, 3: 10, 4: 10, 5: 15, 6: 5 };

  // 從 0 起算的建議分（不再預設 80% 基礎分，避免無資料時亂給分）
  // 依「本月日誌投入比例 × 滿分 ＋ 證據加成 ＋ 主管回饋」推算；無資料＝0。僅供參考，最終由評核者決定。
  const result = {};
  const positive = feedback.filter(f => f.tag === '優秀表現').length;
  const negative = feedback.filter(f => f.tag === '需改進').length;
  // 投入比例：本月日誌天數 / 約略工作天目標（18 天）；0 篇 → 0
  const TARGET_DAYS = 18;
  const engagement = Math.min(1, (logs.length || 0) / TARGET_DAYS);

  for (let k = 1; k <= 6; k++) {
    const kEvidence = evidence.filter(e => normalizeEvalEvidenceKpi_(user, e) === k).length;
    // 從 0 起算：投入比例×滿分 ＋ 證據加成（封頂 15%）＋ 回饋調整
    let score = max[k] * engagement + Math.min(max[k] * 0.15, kEvidence) + positive - negative * 2;
    score = Math.max(0, Math.min(max[k], Math.round(score)));

    // 主管發文 KPI4：依達標週數比例（從 0 起算）
    if (role === 'manager' && k === 4) {
      const weeksMet = Object.values(postsByWeek).filter(c => c >= 3).length;
      const totalWeeks = Math.max(1, Object.keys(postsByWeek).length || 4);
      score = Math.max(0, Math.min(max[k], Math.round(max[k] * (weeksMet / totalWeeks))));
    }
    result[`k${k}`] = score;
  }
  return result;
}

/**
 * 儲存評核
 */
function saveEval(params) {
  const { nickname, year_month, evaluator } = params;
  if (!nickname || !year_month || !evaluator) {
    return { ok: false, error: 'missing required fields' };
  }
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(String(year_month))) {
    return { ok: false, error: '評核月份格式錯誤' };
  }
  const user = findUserByNickname(nickname);
  if (!user) return { ok: false, error: 'user not found' };
  const evaluatorUser = findUserByNickname(evaluator);
  const canEvaluate = evaluatorUser && evaluatorUser.status === 'active' && (
    evaluatorUser.role === 'admin' ||
    (evaluatorUser.role === 'manager' && ['teacher', 'admin_staff'].includes(user.role) &&
      (isGlobalManager_(evaluatorUser) || sameDepartment_(evaluatorUser.department, user.department)))
  );
  if (!canEvaluate) return { ok: false, error: '無評核儲存權限' };

  const isManager = user.role === 'manager';
  const sheetName = isManager ? SHEET_NAMES.MANAGER_EVAL : SHEET_NAMES.TEACHER_EVAL;
  const prefix = isManager ? 'MEVAL' : 'EVAL';
  const eval_id = `${prefix}-${year_month}-${nickname}`;
  const existing = findObject(sheetName, 'eval_id', eval_id);

  const prefixK = isManager ? 'm' : 'k';
  const anqin = isAnqinUser(user);
  const scoreMaximums = anqin && !isManager ? [20, 20, 20, 20, 12, 8] : [15, 15, 10, 10, 15, 5];
  const scoreValues = [];
  let kpiTotal = 0;
  for (let i = 1; i <= 6; i++) {
    const raw = params[`score_${prefixK}${i}`];
    const v = raw === undefined || raw === '' ? 0 : Number(raw);
    const max = scoreMaximums[i - 1];
    if (!Number.isFinite(v) || v < 0 || v > max) {
      return { ok: false, error: `第 ${i} 項分數需介於 0–${max} 分` };
    }
    scoreValues.push(v);
    kpiTotal += v;
  }

  // 安親：KPI 滿分 100、OKR 獨立另計（不納入總分）；其餘：KPI 70 + OKR 30
  const okrScore = anqin ? 0 : Number(params.score_okr || 0);
  if (!anqin && (!Number.isFinite(okrScore) || okrScore < 0 || okrScore > 30)) {
    return { ok: false, error: 'OKR 分數需介於 0–30 分' };
  }
  const status = params.status || 'draft';
  if (!['draft', 'submitted'].includes(status)) return { ok: false, error: '評核狀態錯誤' };
  const managerComment = String(params.manager_comment || params.boss_comment || '').trim();
  if (anqin && !isManager && status === 'submitted' && managerComment.length < 8) {
    return { ok: false, error: '完成評核前，主管評語至少需要 8 字' };
  }

  // ===== 日報補繳扣分：每次補繳扣 2 分（依當月日誌 is_makeup 自動統計，不吃前端參數）=====
  const makeupCount = sheetToObjects(SHEET_NAMES.LOGS).filter(l =>
    l.nickname === nickname && String(l.date).slice(0, 7) === year_month && l.is_makeup === true).length;
  const makeupPenalty = makeupCount * 2;
  const kpiEffective = Math.max(0, kpiTotal - makeupPenalty);

  const totalScore = kpiEffective + okrScore;

  // 等第與獎金（安親看 100 分級距，其餘看 70 分級距）
  let tier = calcBonusForUser(kpiEffective, user);

  // ===== 安親遲到扣分（獨立於 100 分之外）=====
  // 當月遲到累計 ≥3 次：自 KPI 總分「每次額外扣 5 分」或「直接降一個獎金等級」，擇重者
  let lateCount = 0, latePenalty = 0;
  if (anqin) {
    lateCount = Number(params.score_late_count || 0);
    if (!Number.isInteger(lateCount) || lateCount < 0) {
      return { ok: false, error: '遲到次數需為 0 以上的整數' };
    }
    if (lateCount >= 3) {
      const penaltyPoints = (lateCount - 2) * 5; // 第 3 次起才扣，每次 5 分
      const tierByPoints = calcBonusForUser(Math.max(0, kpiEffective - penaltyPoints), user); // 方案A：扣分
      const tierByDrop = bonusAfterDrop(tier.grade, 1, user);                              // 方案B：降一級
      // 擇重者＝獎金較低者
      tier = (tierByPoints.bonus <= tierByDrop.bonus) ? tierByPoints : tierByDrop;
      latePenalty = penaltyPoints;
    }
  }
  // 主管核發決定：未帶＝預設核發（true）
  const bonusGranted = (params.bonus_granted === undefined || params.bonus_granted === '')
    ? true : (params.bonus_granted === true || params.bonus_granted === 'true');

  const data = {
    eval_id, year_month, nickname, evaluator,
    score_okr: okrScore,
    total_score: totalScore,
    grade: tier.grade,
    bonus: tier.bonus,
    score_late_count: lateCount,
    late_penalty: latePenalty,
    makeup_count: makeupCount,
    makeup_penalty: makeupPenalty,
    bonus_granted: bonusGranted,
    manager_comment: managerComment,
    interview_notes: params.interview_notes || '',
    status,
    updated_at: nowIso()
  };

  // 自評與評分欄位
  for (let i = 1; i <= 6; i++) {
    if (params[`self_${prefixK}${i}`] !== undefined) data[`self_${prefixK}${i}`] = params[`self_${prefixK}${i}`];
    data[`score_${prefixK}${i}`] = scoreValues[i - 1];
  }
  if (params.self_summary !== undefined) data.self_summary = params.self_summary;

  // 主管專屬欄位
  if (isManager) {
    data.dept_avg_score = params.dept_avg_score || calcDeptAvg(user.department, year_month);
    data.bonus_okr = params.bonus_okr || 0;
    data.bonus_recruit = params.bonus_recruit || 0;
    data.bonus_dept = params.bonus_dept || 0;
    data.final_bonus = Number(tier.bonus) + Number(data.bonus_okr) + Number(data.bonus_recruit) + Number(data.bonus_dept);
    // 連坐：部門 <55 主管獎金減半
    if (Number(data.dept_avg_score) < 55) {
      data.final_bonus = Math.round(data.final_bonus / 2);
    }
    data.boss_comment = params.boss_comment || '';
  }

  if (existing) {
    updateRow(sheetName, existing._row, data);
  } else {
    data.created_at = nowIso();
    appendRow(sheetName, data);
  }
  logSystem(evaluator, 'save_eval', eval_id, { total: totalScore, grade: tier.grade });

  return { ok: true, eval_id, total_score: totalScore, grade: tier.grade, bonus: data.final_bonus || tier.bonus };
}

function getEval(params) {
  const { nickname, viewer } = params;
  const requestedMonth = String(params.year_month || '').trim();
  if (!nickname || !viewer) return { ok: false, error: 'missing fields' };
  const user = findUserByNickname(nickname);
  if (!user) return { ok: false, error: 'user not found' };
  const viewerUser = findUserByNickname(viewer);
  if (!viewerUser || viewerUser.status !== 'active') return { ok: false, error: '無評核讀取權限' };
  const canRead = viewerUser.role === 'admin' ||
    (viewerUser.role === 'manager' && (isGlobalManager_(viewerUser) || sameDepartment_(viewerUser.department, user.department))) ||
    (['teacher', 'admin_staff'].includes(viewerUser.role) && viewerUser.nickname === user.nickname);
  if (!canRead) return { ok: false, error: '無評核讀取權限' };
  const isManager = user.role === 'manager';
  const sheetName = isManager ? SHEET_NAMES.MANAGER_EVAL : SHEET_NAMES.TEACHER_EVAL;
  const prefix = isManager ? 'MEVAL' : 'EVAL';
  const workerViewer = ['teacher', 'admin_staff'].includes(viewerUser.role);
  const available = sheetToObjects(sheetName)
    .filter(item => item.nickname === nickname)
    .filter(item => !workerViewer || item.status === 'submitted')
    .sort((a, b) => {
      const monthCompare = String(b.year_month || '').localeCompare(String(a.year_month || ''));
      if (monthCompare) return monthCompare;
      return String(b.updated_at || b.created_at || '').localeCompare(String(a.updated_at || a.created_at || ''));
    });
  const months = Array.from(new Set(available.map(item => String(item.year_month || '')).filter(Boolean)));
  if (!requestedMonth || requestedMonth === 'latest') {
    return { ok: true, eval: available[0] || null, months, selected_month: months[0] || '' };
  }
  const eval_id = `${prefix}-${requestedMonth}-${nickname}`;
  const e = findObject(sheetName, 'eval_id', eval_id);
  if (workerViewer && e && e.status !== 'submitted') {
    return { ok: true, eval: null, months, selected_month: requestedMonth };
  }
  return { ok: true, eval: e, months, selected_month: requestedMonth };
}

function listEvals(params) {
  const { evaluator, year_month, role, viewer } = params;
  const viewerUser = findUserByNickname(viewer);
  if (!viewerUser || viewerUser.status !== 'active' || !['admin', 'manager'].includes(viewerUser.role)) {
    return { ok: false, error: '無評核清單讀取權限' };
  }
  const sheetName = role === 'manager' ? SHEET_NAMES.MANAGER_EVAL : SHEET_NAMES.TEACHER_EVAL;
  let list = sheetToObjects(sheetName);
  if (viewerUser.role === 'manager' && !isGlobalManager_(viewerUser)) {
    const allowed = sheetToObjects(SHEET_NAMES.USERS)
      .filter(user => sameDepartment_(user.department, viewerUser.department))
      .map(user => user.nickname);
    list = list.filter(item => allowed.includes(item.nickname));
  }
  if (evaluator) list = list.filter(e => e.evaluator === evaluator);
  if (year_month) list = list.filter(e => e.year_month === year_month);
  return { ok: true, evals: list };
}

function calcDeptAvg(department, year_month) {
  const evals = sheetToObjects(SHEET_NAMES.TEACHER_EVAL)
    .filter(e => e.year_month === year_month);
  const users = sheetToObjects(SHEET_NAMES.USERS);
  const deptTeachers = users.filter(u => sameDepartment_(u.department, department) && u.role === 'teacher').map(u => u.nickname);
  const deptEvals = evals.filter(e => deptTeachers.includes(e.nickname));
  if (deptEvals.length === 0) return 0;
  const sum = deptEvals.reduce((s, e) => s + Number(e.total_score || 0), 0);
  return Math.round((sum / deptEvals.length) * 10) / 10;
}

/**
 * 清除測試交易資料（僅 admin）：日誌/證據/評核/週報/回饋/觀課/發文/OKR/事項
 * 保留：使用者帳號(Users)、學生名冊(Students，預設保留)、KPI 設定。
 * 需帶 confirm:'PURGE'；可選 clearStudents:true 一併清學生。
 */
function purgeTestData(params) {
  const operator = params.operator;
  const u = operator ? findUserByNickname(operator) : null;
  if (!u || u.role !== 'admin') return { ok: false, error: '僅限管理員操作' };
  if (params.confirm !== 'PURGE') return { ok: false, error: '需帶 confirm=PURGE 以確認清除' };
  const targets = [
    SHEET_NAMES.LOGS, SHEET_NAMES.EVIDENCE,
    SHEET_NAMES.TEACHER_EVAL, SHEET_NAMES.MANAGER_EVAL,
    SHEET_NAMES.WEEKLY, SHEET_NAMES.FEEDBACK,
    SHEET_NAMES.OBSERVATION, SHEET_NAMES.POSTS,
    SHEET_NAMES.OKR, SHEET_NAMES.TASKS,
  ];
  if (params.clearStudents === true || params.clearStudents === 'true') targets.push(SHEET_NAMES.STUDENTS);
  const cleared = {};
  targets.forEach(name => {
    const sh = getSheet(name);
    if (!sh) { cleared[name] = 'no sheet'; return; }
    const last = sh.getLastRow();
    if (last > 1) sh.deleteRows(2, last - 1); // 保留標題列
    cleared[name] = Math.max(0, last - 1);
  });
  logSystem(operator, 'purge_test_data', '', cleared);
  return { ok: true, cleared };
}

// ════════════════════════════════════════════════════════════
//  dashboard.gs
// ════════════════════════════════════════════════════════════

/**
 * 儀表板與 KPI 預估
 */

/**
 * 老師：本月 KPI 預估
 */
function getMyKpiPreview(params) {
  const { nickname } = params;
  if (!nickname) return { ok: false, error: 'missing nickname' };
  const user = findUserByNickname(nickname);
  if (!user) return { ok: false, error: 'user not found' };

  const ym = yearMonth();
  const ev = getEvalEvidence({ nickname, year_month: ym, viewer: nickname });
  if (!ev.ok) return ev;

  const suggestion = ev.suggestion;
  const kpiTotal = Object.values(suggestion).reduce((s, v) => s + Number(v || 0), 0);
  const tier = calcBonusForUser(kpiTotal, user);

  // 待補事項
  const todos = [];
  if (user.role === 'manager') {
    const weekCount = ev.posts_by_week[weekOf()] || 0;
    if (weekCount < 3) todos.push(`本週安親發文：${weekCount}/3 篇`);
  }
  if (ev.summary.log_count < 20) todos.push(`本月已填日誌 ${ev.summary.log_count} 天，建議每日填寫`);

  return {
    ok: true,
    year_month: ym,
    role: user.role,
    department: normalizeDepartment_(user.department),
    is_anqin: isAnqinUser(user),
    suggestion,
    kpi_total: kpiTotal,
    grade: tier.grade,
    bonus_estimated: tier.bonus,
    summary: ev.summary,
    todos
  };
}

/**
 * 主管儀表板：今日部門狀況
 */
function getDashboard(params) {
  const { viewer } = params;
  if (!viewer) return { ok: false, error: 'missing viewer' };
  const user = findUserByNickname(viewer);
  if (!user) return { ok: false, error: 'viewer not found' };

  const today = todayStr();
  const ym = yearMonth();
  const users = sheetToObjects(SHEET_NAMES.USERS);

  if (user.role === 'teacher' || user.role === 'admin_staff') {
    return getMyKpiPreview({ nickname: viewer });
  }

  if (user.role === 'manager') {
    const globalScope = isGlobalManager_(user);
    const deptTeachers = users.filter(u => u.role === 'teacher' && (globalScope || sameDepartment_(u.department, user.department)));
    // 部門成員（含行政美編行銷，皆需每日填報）
    const deptMembers = users.filter(u => (u.role === 'teacher' || u.role === 'admin_staff') && (globalScope || sameDepartment_(u.department, user.department)));
    const todayLogs = sheetToObjects(SHEET_NAMES.LOGS)
      .filter(l => l.date === today && (globalScope || sameDepartment_(l.department, user.department)));
    const status = deptMembers.map(t => {
      const log = todayLogs.find(l => l.nickname === t.nickname);
      return {
        nickname: t.nickname,
        submitted: !!log,
        checkin_at: log ? log.checkin_at : '',
        help_needed: log ? log.help_needed === true : false,
        log_id: log ? log.log_id : ''
      };
    });
    const submittedCount = status.filter(s => s.submitted).length;
    const helpCount = status.filter(s => s.help_needed).length;

    // 本月部門平均
    const monthEvals = sheetToObjects(SHEET_NAMES.TEACHER_EVAL)
      .filter(e => e.year_month === ym && deptTeachers.map(t => t.nickname).includes(e.nickname));
    const avg = monthEvals.length > 0
      ? Math.round(monthEvals.reduce((s, e) => s + Number(e.total_score || 0), 0) / monthEvals.length * 10) / 10
      : null;

    return {
      ok: true,
      role: 'manager',
      department: globalScope ? '全教室' : normalizeDepartment_(user.department),
      date: today,
      teachers_count: deptMembers.length,
      submitted_count: submittedCount,
      help_count: helpCount,
      status,
      month_avg: avg
    };
  }
  // 注意：teachers_count 改用 deptMembers（見上方）；month_avg 仍只算 teacher

  if (user.role === 'admin') {
    const deptStats = DEPARTMENTS.filter(d => d !== '總部').map(dept => {
      const teachers = users.filter(u => sameDepartment_(u.department, dept) && u.role === 'teacher');
      const manager = users.find(u => sameDepartment_(u.department, dept) && u.role === 'manager');
      const todayLogs = sheetToObjects(SHEET_NAMES.LOGS)
        .filter(l => l.date === today && sameDepartment_(l.department, dept));
      const monthEvals = sheetToObjects(SHEET_NAMES.TEACHER_EVAL)
        .filter(e => e.year_month === ym && teachers.map(t => t.nickname).includes(e.nickname));
      const avg = monthEvals.length > 0
        ? Math.round(monthEvals.reduce((s, e) => s + Number(e.total_score || 0), 0) / monthEvals.length * 10) / 10
        : null;
      return {
        department: dept,
        manager: manager ? manager.nickname : '未指派',
        teachers_count: teachers.length,
        today_submitted: todayLogs.length,
        month_avg: avg
      };
    });
    return {
      ok: true,
      role: 'admin',
      date: today,
      departments: deptStats,
      total_users: users.length
    };
  }

  return { ok: false, error: 'unknown role' };
}

// ════════════════════════════════════════════════════════════
//  students.gs
// ════════════════════════════════════════════════════════════

/**
 * 學生名冊（後台統一建，每位老師自己的班）
 * Students schema: student_id, name, teacher, department, status, notes, created_at, updated_at
 */

function listStudents(params) {
  const { teacher, department, includeInactive } = params || {};
  let list = sheetToObjects(SHEET_NAMES.STUDENTS);
  if (teacher) list = list.filter(s => s.teacher === teacher);
  if (department) list = list.filter(s => sameDepartment_(s.department, department));
  if (!includeInactive) list = list.filter(s => s.status !== 'inactive');
  list.sort((a, b) => String(a.name).localeCompare(String(b.name), 'zh-Hant'));
  return { ok: true, students: list };
}

function addStudent(params) {
  const { name, teacher } = params;
  if (!name || !teacher) return { ok: false, error: '缺少姓名或老師' };
  const t = findUserByNickname(teacher);
  if (!t) return { ok: false, error: '老師不存在：' + teacher };
  // 同老師班內姓名重複檢查
  const dup = sheetToObjects(SHEET_NAMES.STUDENTS)
    .some(s => s.teacher === teacher && s.name === name && s.status !== 'inactive');
  if (dup) return { ok: false, error: '此老師班上已有同名學生' };

  appendRow(SHEET_NAMES.STUDENTS, {
    student_id: Utilities.getUuid(),
    name: String(name).trim(),
    teacher,
    department: normalizeDepartment_(t.department),
    status: 'active',
    notes: params.notes || '',
    created_at: nowIso(),
    updated_at: nowIso()
  });
  logSystem(params.operator || 'system', 'add_student', name, { teacher });
  return { ok: true, msg: '新增成功' };
}

function updateStudent(params) {
  const { student_id } = params;
  if (!student_id) return { ok: false, error: '缺少 student_id' };
  const rowNum = findRow(SHEET_NAMES.STUDENTS, 'student_id', student_id);
  if (rowNum < 0) return { ok: false, error: '學生不存在' };

  const updates = {};
  ['name', 'teacher', 'department', 'status', 'notes'].forEach(k => {
    if (params[k] !== undefined) updates[k] = params[k];
  });
  // 換老師時連帶更新所屬部門
  if (params.teacher) {
    const t = findUserByNickname(params.teacher);
    if (t) updates.department = normalizeDepartment_(t.department);
  } else if (updates.department !== undefined) {
    updates.department = normalizeDepartment_(updates.department);
  }
  updates.updated_at = nowIso();
  updateRow(SHEET_NAMES.STUDENTS, rowNum, updates);
  logSystem(params.operator || 'system', 'update_student', student_id, updates);
  return { ok: true, msg: '更新成功' };
}

function deleteStudent(params) {
  const { student_id } = params;
  if (!student_id) return { ok: false, error: '缺少 student_id' };
  const rowNum = findRow(SHEET_NAMES.STUDENTS, 'student_id', student_id);
  if (rowNum < 0) return { ok: false, error: '學生不存在' };
  deleteRow(SHEET_NAMES.STUDENTS, rowNum);
  logSystem(params.operator || 'system', 'delete_student', student_id, {});
  return { ok: true, msg: '已刪除' };
}

// ════════════════════════════════════════════════════════════
//  tasks.gs
// ════════════════════════════════════════════════════════════

/**
 * 事項系統 + LINE 推播
 * Tasks schema: task_id, title, detail, assignee, department, due_date, status(open/done), created_by, created_at, updated_at, done_at
 * Users 需有 line_user_id 欄
 * Script Property: LINE_TOKEN（LINE Messaging API channel access token）
 */

function canCreateTask_(role) {
  return role === 'admin' || role === 'manager' || role === 'admin_staff';
}

function systemMaintenanceUser_(params) {
  const operator = params && params.operator ? findUserByNickname(params.operator) : null;
  if (operator) return operator;
  let email = '';
  try { email = String(Session.getActiveUser().getEmail() || '').trim().toLowerCase(); } catch (error) {}
  if (!email) {
    try { email = String(Session.getEffectiveUser().getEmail() || '').trim().toLowerCase(); } catch (error) {}
  }
  return email ? findUserByEmail(email) : null;
}

// 把 due_date 正規化成 yyyy-MM-dd（Sheets 會把日期字串自動轉成 Date 物件）
function taskDateStr_(v) {
  if (v instanceof Date) return Utilities.formatDate(v, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  return String(v == null ? '' : v).slice(0, 10);
}

// 由 admin 透過 API 設定機密（OneSignal / LINE），免去手動點指令碼屬性
function setConfig(params) {
  const u = params && params.operator ? findUserByNickname(params.operator) : null;
  if (!u || u.role !== 'admin') return { ok: false, error: '需 admin 權限' };
  const allowed = ['ONESIGNAL_APP_ID', 'ONESIGNAL_REST_KEY', 'LINE_TOKEN'];
  const props = PropertiesService.getScriptProperties();
  const set = [];
  allowed.forEach(k => {
    if (params[k] !== undefined && params[k] !== '') { props.setProperty(k, String(params[k])); set.push(k); }
  });
  return { ok: true, set: set };
}

/** 不回傳機密值，只供管理介面檢查通知、教材與排程是否已完成設定。 */
function getSystemReadiness(params) {
  const user = systemMaintenanceUser_(params);
  if (!user || (user.role !== 'admin' && user.role !== 'manager')) return { ok: false, error: '需主管或管理員權限' };
  const props = PropertiesService.getScriptProperties();
  const triggers = ScriptApp.getProjectTriggers().map(t => t.getHandlerFunction());
  return {
    ok: true,
    services: {
      line: Boolean(props.getProperty('LINE_TOKEN')),
      oneSignalApp: Boolean(props.getProperty('ONESIGNAL_APP_ID')),
      oneSignalKey: Boolean(props.getProperty('ONESIGNAL_REST_KEY')),
      materialUpload: true,
      coursePrepArchive: true,
      taskCloudSync: true,
      productionIntegrity: true,
    },
    triggers: {
      dailyKpiPdf: triggers.indexOf('sendDailyKpiReportAuto') >= 0,
      dailyTaskMorning: triggers.indexOf('sendMorningReminders') >= 0,
      dailyTaskEvening: triggers.indexOf('sendEveningPreview') >= 0,
      dailyTaskReminder: triggers.indexOf('sendMorningReminders') >= 0 && triggers.indexOf('sendEveningPreview') >= 0,
      talentPdfRepair: triggers.indexOf('repairMissingTalentLessonReportsAuto') >= 0,
    },
  };
}

/**
 * 管理員手動執行的正式環境實際交付驗收。
 * 每一項都會真的寫入後再讀回，並只清除本次建立的 QA 資料。
 */
function runProductionIntegrityCheck(params) {
  const actor = params && params.__actor ? params.__actor : systemMaintenanceUser_(params);
  if (!actor || actor.role !== 'admin' || actor.status !== 'active') {
    return { ok: false, error: '只有啟用中的管理員可以執行正式環境驗收' };
  }

  const startedAtMs = Date.now();
  const runId = 'QA-' + Utilities.formatDate(new Date(), 'Asia/Taipei', 'yyyyMMdd-HHmmss') + '-' + Utilities.getUuid().slice(0, 8);
  const checks = [];
  const lock = LockService.getScriptLock();

  function requireCheck_(condition, message) {
    if (!condition) throw new Error(message);
  }

  function runCheck_(id, label, runner) {
    const checkStartedAt = Date.now();
    try {
      const detail = runner() || {};
      checks.push({
        id: id,
        label: label,
        ok: true,
        elapsed_ms: Date.now() - checkStartedAt,
        detail: detail,
      });
    } catch (error) {
      checks.push({
        id: id,
        label: label,
        ok: false,
        elapsed_ms: Date.now() - checkStartedAt,
        error: String(error && error.message || error || '未知錯誤'),
      });
    }
  }

  if (!lock.tryLock(15000)) {
    return { ok: false, error: '系統正在處理其他雲端寫入，請稍後再執行驗收' };
  }

  try {
    runCheck_('session_identity', '正式登入身分', function () {
      const storedUser = findUserByNickname(actor.nickname);
      requireCheck_(storedUser && storedUser.status === 'active', '登入帳號未在正式人員名單啟用');
      requireCheck_(storedUser.role === 'admin', '正式帳號不是管理員角色');
      return { nickname: storedUser.nickname, role: storedUser.role };
    });

    runCheck_('spreadsheet_roundtrip', '試算表寫入、讀回與清理', function () {
      const payload = {
        runId: runId,
        message: '布拉克星球 KPI 雲端交付驗收',
        count: 3,
        flags: [true, false, true],
      };
      const rowNumber = appendRow(SHEET_NAMES.SYSTEM_LOG, {
        timestamp: nowIso(),
        nickname: actor.nickname,
        action: 'production_integrity_check',
        target: runId,
        detail: payload,
        ip: '',
      });
      try {
        SpreadsheetApp.flush();
        const row = findObject(SHEET_NAMES.SYSTEM_LOG, 'target', runId);
        requireCheck_(row && row._row === rowNumber, '測試列寫入後無法由唯一編號讀回');
        const restored = parseJsonField(row.detail);
        requireCheck_(restored && restored.runId === payload.runId, 'JSON 物件讀回內容不一致');
        requireCheck_(restored.message === payload.message && Number(restored.count) === payload.count, '中文或數值資料讀回內容不一致');
      } finally {
        const row = findObject(SHEET_NAMES.SYSTEM_LOG, 'target', runId);
        if (row && row._row > 1) deleteRow(SHEET_NAMES.SYSTEM_LOG, row._row);
      }
      SpreadsheetApp.flush();
      requireCheck_(findRow(SHEET_NAMES.SYSTEM_LOG, 'target', runId) < 0, '測試列清理失敗');
      return { sheet: SHEET_NAMES.SYSTEM_LOG, roundtrip: 'passed', cleanup: 'passed' };
    });

    runCheck_('photo_roundtrip', '照片建立、讀回與私密預覽', function () {
      const root = getEvidenceRootFolder_();
      const qaFolder = getOrCreateChildFolder_(root, '_系統健康檢查');
      const pngBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
      const filename = runId + '-photo.png';
      const file = qaFolder.createFile(Utilities.newBlob(Utilities.base64Decode(pngBase64), 'image/png', filename));
      try {
        secureKpiDriveItem_(file, actor, 'anqin', []);
        const fileId = file.getId();
        const stored = DriveApp.getFileById(fileId);
        requireCheck_(stored.getName() === filename, '照片建立後檔名不一致');
        requireCheck_(stored.getBlob().getBytes().length > 0, '照片建立後內容為空');
        const preview = getAttachmentPreviews({ __actor: actor, file_ids: [fileId] });
        requireCheck_(preview && preview.ok, '私密照片預覽端點執行失敗');
        requireCheck_(Array.isArray(preview.previews) && preview.previews.length === 1, '私密照片預覽未回傳圖片');
        requireCheck_(/^data:image\//.test(String(preview.previews[0].dataUrl || '')), '照片預覽不是可顯示的影像資料');
        const pdfPhoto = pdfPhotoUri_(fileId);
        requireCheck_(/^data:image\/(?:png|jpeg|jpg|gif);base64,/.test(String(pdfPhoto || '')), 'PDF 無法嵌入雲端照片');
      } finally {
        file.setTrashed(true);
      }
      requireCheck_(file.isTrashed(), '測試照片清理失敗');
      return { format: 'image/png', preview: 'passed', pdf_embed: 'passed', privacy: 'private', cleanup: 'passed' };
    });

    runCheck_('material_roundtrip', '教材檔案建立、讀回與內容核對', function () {
      const root = getMaterialRootFolder_();
      const qaFolder = getOrCreateChildFolder_(root, '_系統健康檢查');
      const content = 'run=' + runId + '\n布拉克星球 KPI 教材交付驗收\n內容完整';
      const filename = runId + '-material.txt';
      const file = qaFolder.createFile(Utilities.newBlob(content, 'text/plain', filename));
      try {
        secureKpiDriveItem_(file, actor, 'anqin', []);
        const stored = DriveApp.getFileById(file.getId());
        requireCheck_(stored.getName() === filename, '教材建立後檔名不一致');
        requireCheck_(stored.getBlob().getDataAsString('UTF-8') === content, '教材建立後內容與原始內容不一致');
        requireCheck_(stored.getSize() > 0, '教材建立後檔案大小為 0');
      } finally {
        file.setTrashed(true);
      }
      requireCheck_(file.isTrashed(), '測試教材清理失敗');
      return { format: 'text/plain', content_match: true, privacy: 'private', cleanup: 'passed' };
    });
  } finally {
    lock.releaseLock();
  }

  const passed = checks.filter(function (check) { return check.ok; }).length;
  const failed = checks.length - passed;
  return {
    ok: failed === 0,
    run_id: runId,
    checked_at: nowIso(),
    elapsed_ms: Date.now() - startedAtMs,
    summary: { total: checks.length, passed: passed, failed: failed },
    checks: checks,
  };
}

/** 管理員一鍵補齊每日 PDF 與事項提醒排程。 */
function setupSystemAutomation(params) {
  const user = systemMaintenanceUser_(params);
  if (!user || user.role !== 'admin') return { ok: false, error: '需 admin 權限' };
  setupKpiReportTrigger();
  setupTaskReminderTrigger();
  setupTalentReportRepairTrigger();
  logSystem(user.nickname, 'setup_system_automation', '', {});
  return getSystemReadiness({ operator: user.nickname });
}

/** 對目前帳號同時測試 LINE 與 APP 通知，不回傳任何服務密鑰。 */
function testMyNotifications(params) {
  const user = params && params.operator ? findUserByNickname(params.operator) : null;
  if (!user || user.status !== 'active') return { ok: false, error: '找不到可用帳號' };
  const title = '布拉克星球 KPI 通知測試';
  const body = 'APP 與 LINE 通知設定測試完成。';
  const lineBound = Boolean(user.line_user_id);
  const lineSent = lineBound ? pushLine_(user.line_user_id, title + '\n' + body) : false;
  const appSent = pushOneSignal_(user.nickname, title, body);
  logSystem(user.nickname, 'test_notifications', '', { lineBound: lineBound, lineSent: lineSent, appSent: appSent });
  return { ok: true, lineBound: lineBound, lineSent: lineSent, appSent: appSent };
}

/** 經登入驗證後，把這台裝置的 OneSignal subscription ID 綁到目前帳號。 */
function registerPushSubscription(params) {
  ensureHeaders(getSheet(SHEET_NAMES.USERS), [
    'nickname', 'email', 'role', 'department', 'status', 'phone', 'joined_at',
    'last_login', 'notes', 'subtype', 'line_user_id', 'push_subscription_id',
    'employment_type', 'work_assignments', 'schedule_json', 'rest_days', 'deleted_at', 'deleted_by'
  ]);
  const user = params && params.operator ? findUserByNickname(params.operator) : null;
  if (!user || user.status !== 'active') return { ok: false, error: '找不到可用帳號' };
  const subscriptionId = String(params.subscription_id || '').trim();
  if (!/^[A-Za-z0-9_-]{8,256}$/.test(subscriptionId)) return { ok: false, error: 'APP 訂閱識別碼無效' };

  // 同一台裝置只能綁一個帳號；切換使用者時清除舊帳號的裝置綁定。
  sheetToObjects(SHEET_NAMES.USERS).forEach((item, index) => {
    if (item.nickname !== user.nickname && String(item.push_subscription_id || '') === subscriptionId) {
      updateRow(SHEET_NAMES.USERS, index + 2, { push_subscription_id: '' });
    }
  });
  updateRow(SHEET_NAMES.USERS, user._row, { push_subscription_id: subscriptionId });
  logSystem(user.nickname, 'register_push_subscription', subscriptionId.slice(0, 12), {});
  return { ok: true, subscription_id: subscriptionId };
}

function unregisterPushSubscription(params) {
  const user = params && params.operator ? findUserByNickname(params.operator) : null;
  if (!user || user.status !== 'active') return { ok: false, error: '找不到可用帳號' };
  updateRow(SHEET_NAMES.USERS, user._row, { push_subscription_id: '' });
  logSystem(user.nickname, 'unregister_push_subscription', '', {});
  return { ok: true };
}

function issueLineBindingCode_(user) {
  const payload = base64UrlText_(JSON.stringify({
    v: 1,
    n: String(user.nickname || ''),
    x: Date.now() + 10 * 60 * 1000,
    nonce: Utilities.getUuid().slice(0, 8),
  }));
  return payload + '.' + sessionSignature_('line-binding:' + payload);
}

function verifyLineBindingCode_(code) {
  const parts = String(code || '').split('.');
  if (parts.length !== 2 || !constantTimeTextEqual_(parts[1], sessionSignature_('line-binding:' + parts[0]))) {
    return { ok: false, error: '綁定指令無效' };
  }
  try {
    const payload = JSON.parse(Utilities.newBlob(Utilities.base64DecodeWebSafe(parts[0])).getDataAsString());
    if (payload.v !== 1 || Number(payload.x || 0) <= Date.now()) return { ok: false, error: '綁定指令已逾時' };
    const user = findUserByNickname(String(payload.n || ''));
    if (!user || user.status !== 'active' || !user.email) return { ok: false, error: '帳號尚未啟用' };
    return { ok: true, user: user };
  } catch (error) {
    return { ok: false, error: '綁定指令無效' };
  }
}

/** 產生 10 分鐘有效、只能綁目前登入帳號的 LINE 指令。 */
function getLineBindingCode(params) {
  const user = params && params.operator ? findUserByNickname(params.operator) : null;
  if (!user || user.status !== 'active' || !user.email) return { ok: false, error: '請先完成 Google 帳號綁定' };
  const code = issueLineBindingCode_(user);
  return { ok: true, command: '綁定 ' + code, expires_in_seconds: 600 };
}

function addTask(params) {
  const { title, created_by } = params;
  if (!title) return { ok: false, error: '缺少事項標題' };
  const creator = findUserByNickname(created_by);
  if (!creator || !canCreateTask_(creator.role)) return { ok: false, error: '無建立事項權限' };

  let assignees = params.assignees;
  if (typeof assignees === 'string') assignees = assignees.split(',').map(s => s.trim()).filter(Boolean);
  if (!Array.isArray(assignees) || !assignees.length) return { ok: false, error: '請指定至少一位老師' };
  const requestedTaskId = String(params.task_id || '').trim();
  if (requestedTaskId && assignees.length !== 1) return { ok: false, error: '指定事項編號時只能指派一位老師' };
  const existingRequestedTask = requestedTaskId ? findObject(SHEET_NAMES.TASKS, 'task_id', requestedTaskId) : null;
  if (existingRequestedTask && existingRequestedTask.assignee !== assignees[0]) return { ok: false, error: '事項編號已由其他老師使用' };

  const due = params.due_date || todayStr();
  const now = nowIso();
  let created = 0;
  let updated = 0;
  const taskIds = [];
  assignees.forEach(nk => {
    const u = findUserByNickname(nk);
    if (!u) return;
    const taskId = requestedTaskId || Utilities.getUuid();
    const existing = requestedTaskId ? existingRequestedTask : null;
    const row = {
      task_id: taskId,
      title: String(title).trim(),
      detail: params.detail || '',
      assignee: nk,
      department: normalizeDepartment_(u.department),
      due_date: due,
      status: 'open',
      created_by: existing ? existing.created_by : created_by,
      created_at: existing ? existing.created_at : now,
      updated_at: now,
      done_at: ''
    };
    if (existing) {
      upsertRow(SHEET_NAMES.TASKS, 'task_id', row);
      updated++;
    } else {
      appendRow(SHEET_NAMES.TASKS, row);
      created++;
      if (params.notify !== false) notifyUser_(u, '🆕 你有新事項：' + title, (params.detail ? params.detail + '\n' : '') + '期限 ' + due);
    }
    taskIds.push(taskId);
  });
  logSystem(created_by, 'add_task', title, { assignees: assignees, due: due, created: created, updated: updated });
  return { ok: true, created: created, updated: updated, task_ids: taskIds, updated_at: now };
}

/** V2 老師將自己的追蹤事項同步到雲端，供提醒排程與跨裝置使用。 */
function saveSelfTask(params) {
  const nickname = String(params.nickname || '').trim();
  const user = nickname ? findUserByNickname(nickname) : null;
  const task = params.task || {};
  if (!user || user.status !== 'active') return { ok: false, error: '找不到可用帳號' };
  if (!task.id || !String(task.title || '').trim()) return { ok: false, error: '事項資料不完整' };
  const existing = findObject(SHEET_NAMES.TASKS, 'task_id', task.id);
  if (existing && existing.assignee !== nickname) return { ok: false, error: '不可修改其他人的事項' };
  const now = nowIso();
  upsertRow(SHEET_NAMES.TASKS, 'task_id', {
    task_id: task.id,
    title: String(task.title || '').trim(),
    detail: String(task.source || task.detail || ''),
    assignee: nickname,
    department: normalizeDepartment_(user.department),
    due_date: String(task.dueDate || todayStr()).slice(0, 10),
    status: task.status === 'done' ? 'done' : 'open',
    created_by: existing ? existing.created_by : nickname,
    created_at: existing ? existing.created_at : now,
    updated_at: now,
    done_at: task.status === 'done' ? (existing && existing.done_at || now) : '',
  });
  return { ok: true, task_id: task.id, updated_at: now };
}

function deleteSelfTask(params) {
  const nickname = String(params.nickname || '').trim();
  const user = nickname ? findUserByNickname(nickname) : null;
  if (!user || user.status !== 'active') return { ok: false, error: '找不到可用帳號' };
  const existing = findObject(SHEET_NAMES.TASKS, 'task_id', params.task_id);
  if (!existing) return { ok: true, removed: false };
  if (existing.assignee !== nickname && user.role !== 'admin') return { ok: false, error: '不可刪除其他人的事項' };
  deleteRow(SHEET_NAMES.TASKS, existing._row);
  return { ok: true, removed: true };
}

function listTasks(params) {
  const { viewer, status, from, to } = params || {};
  if (!viewer) return { ok: false, error: 'missing viewer' };
  const vu = findUserByNickname(viewer);
  if (!vu) return { ok: false, error: 'viewer not found' };
  let list = sheetToObjects(SHEET_NAMES.TASKS);
  list.forEach(t => { t.due_date = taskDateStr_(t.due_date); });   // 正規化日期
  if (vu.role === 'admin') {
    // 全部
  } else if (vu.role === 'manager' && !isGlobalManager_(vu)) {
    list = list.filter(t => sameDepartment_(t.department, vu.department) || t.assignee === viewer || t.created_by === viewer);
  } else {
    list = list.filter(t => t.assignee === viewer || t.created_by === viewer);
  }
  if (status) list = list.filter(t => t.status === status);
  if (from) list = list.filter(t => String(t.due_date) >= from);
  if (to) list = list.filter(t => String(t.due_date) <= to);
  list.sort((a, b) => String(a.due_date).localeCompare(String(b.due_date)) || String(b.created_at).localeCompare(String(a.created_at)));
  return { ok: true, tasks: list };
}

function updateTaskStatus(params) {
  const { task_id, status, operator } = params || {};
  if (!task_id || !status) return { ok: false, error: 'missing task_id/status' };
  const row = findRow(SHEET_NAMES.TASKS, 'task_id', task_id);
  if (row < 0) return { ok: false, error: 'task not found' };
  updateRow(SHEET_NAMES.TASKS, row, {
    status: status,
    done_at: status === 'done' ? nowIso() : '',
    updated_at: nowIso()
  });
  logSystem(operator || 'system', 'update_task', task_id, { status: status });
  return { ok: true };
}

function deleteTask(params) {
  const { task_id } = params || {};
  if (!task_id) return { ok: false, error: 'missing task_id' };
  const row = findRow(SHEET_NAMES.TASKS, 'task_id', task_id);
  if (row < 0) return { ok: false, error: 'task not found' };
  deleteRow(SHEET_NAMES.TASKS, row);
  return { ok: true };
}

// ===== LINE 推播 =====
function getLineToken_() {
  return PropertiesService.getScriptProperties().getProperty('LINE_TOKEN') || '';
}

function pushLine_(userId, text) {
  const token = getLineToken_();
  if (!token || !userId) return false;
  try {
    const response = UrlFetchApp.fetch('https://api.line.me/v2/bot/message/push', {
      method: 'post',
      contentType: 'application/json',
      headers: { Authorization: 'Bearer ' + token },
      payload: JSON.stringify({ to: userId, messages: [{ type: 'text', text: String(text) }] }),
      muteHttpExceptions: true
    });
    const code = response.getResponseCode();
    return code >= 200 && code < 300;
  } catch (e) { return false; }
}

// OneSignal Web Push：只使用經登入驗證後登記的 subscription ID，不再相信前端自填 external_id。
function oneSignalAttempts_(appId, key, subscriptionId, title, message, targetUrl) {
  const link = String(targetUrl || 'https://teacher.blockplanetcamp.com/index.html?notify=1');
  return [
    { url: 'https://api.onesignal.com/notifications', auth: 'Key ' + key,
      body: { app_id: appId, target_channel: 'push', include_subscription_ids: [String(subscriptionId)], headings: { en: title }, contents: { en: message }, url: link } },
    { url: 'https://onesignal.com/api/v1/notifications', auth: 'Basic ' + key,
      body: { app_id: appId, include_player_ids: [String(subscriptionId)], headings: { en: title }, contents: { en: message }, url: link } }
  ];
}
function pushOneSignal_(externalId, title, message, targetUrl) {
  const props = PropertiesService.getScriptProperties();
  const appId = props.getProperty('ONESIGNAL_APP_ID');
  const key = props.getProperty('ONESIGNAL_REST_KEY');
  const user = externalId ? findUserByNickname(String(externalId)) : null;
  const subscriptionId = user ? String(user.push_subscription_id || '') : '';
  if (!appId || !key || !subscriptionId) return false;
  const attempts = oneSignalAttempts_(appId, key, subscriptionId, title, message, targetUrl);
  for (let i = 0; i < attempts.length; i++) {
    try {
      const r = UrlFetchApp.fetch(attempts[i].url, {
        method: 'post', contentType: 'application/json',
        headers: { Authorization: attempts[i].auth },
        payload: JSON.stringify(attempts[i].body), muteHttpExceptions: true
      });
      const code = r.getResponseCode(), txt = r.getContentText();
      if (code >= 200 && code < 300 && txt.indexOf('"recipients":0') < 0 && txt.indexOf('"errors"') < 0) return true;
    } catch (e) {}
  }
  return false;
}
// 診斷：回傳每種格式的 OneSignal 回應
function debugPush(params) {
  const props = PropertiesService.getScriptProperties();
  const appId = props.getProperty('ONESIGNAL_APP_ID');
  const key = props.getProperty('ONESIGNAL_REST_KEY');
  if (!appId || !key) return { ok: false, hasApp: !!appId, hasKey: !!key };
  const ext = String((params && params.nickname) || '柏翰');
  const user = findUserByNickname(ext);
  const subscriptionId = user ? String(user.push_subscription_id || '') : '';
  if (!subscriptionId) return { ok: false, error: '目前帳號尚未登記 APP 訂閱' };
  const attempts = oneSignalAttempts_(appId, key, subscriptionId, 'debug', 'debug push');
  const results = attempts.map(a => {
    try {
      const r = UrlFetchApp.fetch(a.url, { method: 'post', contentType: 'application/json', headers: { Authorization: a.auth }, payload: JSON.stringify(a.body), muteHttpExceptions: true });
      return { url: a.url, auth: a.auth.split(' ')[0], code: r.getResponseCode(), body: r.getContentText().slice(0, 250) };
    } catch (e) { return { url: a.url, auth: a.auth.split(' ')[0], err: String(e) }; }
  });
  return { ok: true, ext: ext, results: results };
}

// 同時發 LINE + OneSignal
function notifyUser_(user, title, body) {
  if (!user) return;
  if (user.line_user_id) pushLine_(user.line_user_id, title + '\n━━━━━━━━\n' + body);
  pushOneSignal_(user.nickname, title, body);
}

/**
 * 群發公告（admin 專用）：發給所有 active 使用者（不含 operator 自己），LINE + OneSignal 同步
 * params: { operator(admin), title, body, roles? }  roles 逗號分隔可過濾（如 'teacher,manager'）
 * GET 可用：?action=adminBroadcast&operator=柏翰&title=...&body=...
 */
function adminBroadcast(params) {
  const u = params.operator ? findUserByNickname(params.operator) : null;
  if (!u || u.role !== 'admin') return { ok: false, error: '僅限管理員操作' };
  const title = String(params.title || '').trim();
  const body = String(params.body || '').trim();
  if (!title || !body) return { ok: false, error: 'missing title/body' };
  const roles = params.roles ? String(params.roles).split(',') : null;
  const users = sheetToObjects(SHEET_NAMES.USERS).filter(x =>
    x.status === 'active' && x.nickname !== u.nickname &&
    (!roles || roles.indexOf(x.role) >= 0)
  );
  const sent = [];
  users.forEach(x => {
    try { notifyUser_(x, title, body); sent.push(x.nickname); } catch (e) { /* 單人失敗不擋其他人 */ }
  });
  logSystem(params.operator, 'broadcast', '', { title: title, count: sent.length });
  return { ok: true, sent: sent, count: sent.length };
}

function addDaysStr_(dateStr, n) {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return Utilities.formatDate(d, Session.getScriptTimeZone(), 'yyyy-MM-dd');
}

// 共用：依模式推播。morning=當天(含逾期)、evening=隔天預告。依老師彙整成一則。
function sendTaskReminders_(mode) {
  const today = todayStr();
  const tomorrow = addDaysStr_(today, 1);
  const open = sheetToObjects(SHEET_NAMES.TASKS).filter(t => t.status === 'open');
  open.forEach(t => { t.due_date = taskDateStr_(t.due_date); });   // 正規化日期
  let relevant, header;
  if (mode === 'evening') {
    relevant = open.filter(t => String(t.due_date) === tomorrow);
    header = '🌙 明日事項預告（' + tomorrow + '）';
  } else {
    relevant = open.filter(t => String(t.due_date) <= today);
    header = '☀️ 今日待辦事項提醒';
  }
  const users = sheetToObjects(SHEET_NAMES.USERS);
  const umap = {}; users.forEach(u => umap[u.nickname] = u);
  const byAssignee = {};
  relevant.forEach(t => { (byAssignee[t.assignee] = byAssignee[t.assignee] || []).push(t); });
  let sent = 0;
  Object.keys(byAssignee).forEach(nk => {
    const u = umap[nk];
    if (!u) return;
    const items = byAssignee[nk]
      .map((t, i) => (i + 1) + '. ' + t.title + '（' + t.due_date + (String(t.due_date) < today ? ' 逾期' : '') + '）')
      .join('\n');
    notifyUser_(u, header, items + '\n\n完成後請到系統標記 ✅');
    sent++;
  });
  return { ok: true, mode: mode, sent: sent };
}

// 觸發器用（不可帶參數，故拆兩個函式）
function sendMorningReminders() { return sendTaskReminders_('morning'); }
function sendEveningPreview() { return sendTaskReminders_('evening'); }

// LINE webhook：老師加好友後傳「綁定 暱稱」→ 綁定 line_user_id
function handleLineWebhook_(body) {
  const events = (body && body.events) || [];
  events.forEach(ev => {
    const userId = ev.source && ev.source.userId;
    if (!userId) return;
    if (ev.type === 'message' && ev.message && ev.message.type === 'text') {
      const text = String(ev.message.text || '').trim();
      const m = text.match(/^綁定\s*(.+)$/);
      let reply;
      if (m) {
        const verified = verifyLineBindingCode_(m[1].trim());
        const u = verified.user;
        if (!verified.ok || !u) {
          const legacyUser = findUserByNickname(m[1].trim());
          if (legacyUser && String(legacyUser.line_user_id || '') === String(userId)) {
            reply = '✅ ' + legacyUser.nickname + ' 已完成綁定。';
          } else {
            reply = '此綁定指令無效或已逾時。請先登入 KPI 系統，在「更多 → 帳號與通知」重新取得綁定指令。';
          }
        } else if (u.line_user_id && String(u.line_user_id) !== String(userId)) {
          reply = '此帳號已綁定其他 LINE，請由管理員先解除舊綁定。';
        } else {
          const sameLineUser = sheetToObjects(SHEET_NAMES.USERS).find(item => item.line_user_id && String(item.line_user_id) === String(userId) && item.nickname !== u.nickname);
          if (sameLineUser) {
            reply = '這個 LINE 已綁定「' + sameLineUser.nickname + '」，請由管理員先解除舊綁定。';
          } else {
            updateRow(SHEET_NAMES.USERS, u._row, { line_user_id: userId });
            reply = u.line_user_id ? '✅ ' + u.nickname + ' 已完成綁定。' : '✅ ' + u.nickname + ' 綁定成功！之後事項提醒會推播到這裡。';
          }
        }
      } else if (/^kpi/i.test(text)) {
        // 老闆專用：生成 KPI 日報 PDF（可能要跑一下，先回覆再推結果）
        if (ev.replyToken) replyLine_(ev.replyToken, '📄 日報生成中，約 1 分鐘後傳給你…');
        try { pushLine_(userId, handleKpiLineCommand_(userId, text)); }
        catch (e) { pushLine_(userId, '❌ 日報生成失敗：' + e.message); }
        return;
      } else {
        reply = '請先登入 KPI 系統，在「更多 → 帳號與通知」取得 LINE 綁定指令。\n（老闆可輸入「kpi」取得今日日報 PDF）';
      }
      if (ev.replyToken) replyLine_(ev.replyToken, reply);
    }
  });
}

function replyLine_(replyToken, text) {
  const token = getLineToken_();
  if (!token) return;
  try {
    UrlFetchApp.fetch('https://api.line.me/v2/bot/message/reply', {
      method: 'post',
      contentType: 'application/json',
      headers: { Authorization: 'Bearer ' + token },
      payload: JSON.stringify({ replyToken: replyToken, messages: [{ type: 'text', text: String(text) }] }),
      muteHttpExceptions: true
    });
  } catch (e) {}
}

// 一次性：在 Apps Script 編輯器執行此函式，建立兩個定時觸發器
// 晚上 20:00 預告隔天、早上 07:30 提醒當天(含逾期)
function setupTaskReminderTrigger() {
  const old = ['sendDailyTaskReminders', 'sendMorningReminders', 'sendEveningPreview'];
  ScriptApp.getProjectTriggers().forEach(t => {
    if (old.indexOf(t.getHandlerFunction()) >= 0) ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('sendEveningPreview').timeBased().everyDays(1).atHour(20).nearMinute(0).create();
  ScriptApp.newTrigger('sendMorningReminders').timeBased().everyDays(1).atHour(7).nearMinute(30).create();
  return { ok: true, msg: '已建立：晚上 20:00 預告隔天 + 早上 07:30 提醒當天' };
}

// ════════════════════════════════════════════════════════════
//  archivefiles.gs
// ════════════════════════════════════════════════════════════

/**
 * 列出既有 KPI PDF 歸檔。舊資料只以檔案供查閱，不匯入安親 V2 紀錄。
 */
function getKpiPdfRootFolder_() {
  const props = PropertiesService.getScriptProperties();
  const cached = props.getProperty('KPI_PDF_FOLDER_ID');
  if (cached) {
    try { return DriveApp.getFolderById(cached); } catch (error) {}
  }
  const roots = DriveApp.getFoldersByName('KPI日報PDF');
  const root = roots.hasNext() ? roots.next() : DriveApp.createFolder('KPI日報PDF');
  props.setProperty('KPI_PDF_FOLDER_ID', root.getId());
  return root;
}

/**
 * 日報、教案與證據只授權給資料本人及其正式管理鏈。
 * 不使用「知道連結即可查看」，避免連結被轉傳後繞過系統角色權限。
 */
function kpiDriveViewerUsers_(ownerUser, scope, extraUsers) {
  const ownerNickname = ownerUser && String(ownerUser.nickname || '');
  const ownerDepartment = ownerUser && normalizeDepartment_(ownerUser.department);
  const extras = Array.isArray(extraUsers) ? extraUsers : [];
  const extraKeys = {};
  extras.forEach(function (user) {
    if (user && user.nickname) extraKeys[String(user.nickname)] = true;
    if (user && user.email) extraKeys[String(user.email).toLowerCase()] = true;
  });
  const seen = {};
  return sheetToObjects(SHEET_NAMES.USERS).filter(function (user) {
    if (!user || user.status !== 'active' || !String(user.email || '').trim()) return false;
    const assignments = talentAssignments_(user);
    const included = user.nickname === ownerNickname || user.role === 'admin' || isGlobalManager_(user) ||
      extraKeys[user.nickname] || extraKeys[String(user.email || '').toLowerCase()] ||
      (scope === 'talent' && assignments.indexOf('talent-manager') >= 0) ||
      (scope !== 'talent' && user.role === 'manager' && ownerDepartment && sameDepartment_(user.department, ownerDepartment));
    const email = String(user.email || '').toLowerCase();
    if (!included || seen[email]) return false;
    seen[email] = true;
    return true;
  });
}

function kpiDriveAccessRevision_() {
  const props = PropertiesService.getScriptProperties();
  let revision = props.getProperty('KPI_DRIVE_ACCESS_REVISION');
  if (!revision) {
    revision = '20260826-initial';
    props.setProperty('KPI_DRIVE_ACCESS_REVISION', revision);
  }
  return revision;
}

function invalidateKpiDriveAccess_() {
  PropertiesService.getScriptProperties().setProperty(
    'KPI_DRIVE_ACCESS_REVISION',
    String(Date.now()) + '-' + Utilities.getUuid().slice(0, 8)
  );
}

/**
 * 刪除員工時立即收回其既有 Drive 權限。只掃描各 KPI 根資料夾內與該員工
 * 同名的分支，不碰其他老師的檔案；歷史檔本身不刪除。
 */
function revokeKpiDriveUserAccess_(user, email) {
  const normalizedEmail = String(email || '').trim().toLowerCase();
  const nickname = String(user && user.nickname || '').trim();
  if (!normalizedEmail || !nickname) return { ok: true, scanned: 0, removed: 0, complete: true };
  const rootNames = ['KPI日報PDF', 'KPI月歸檔', 'KPI教材', 'KPI證據'];
  const roots = [];
  const seenRoots = {};
  rootNames.forEach(function (name) {
    const iterator = DriveApp.getFoldersByName(name);
    while (iterator.hasNext()) {
      const folder = iterator.next();
      if (!seenRoots[folder.getId()]) {
        seenRoots[folder.getId()] = true;
        roots.push(folder);
      }
    }
  });

  const limit = 5000;
  let scanned = 0;
  let removed = 0;
  let complete = true;
  function normalizedName(value) {
    return String(value || '').trim().replace(/\s+/g, '').replace(/(?:老師|主管)$/, '').toLowerCase();
  }
  function revokeItem(item) {
    if (!item || scanned >= limit) {
      complete = false;
      return;
    }
    scanned += 1;
    try {
      item.getViewers().forEach(function (viewer) {
        if (String(viewer.getEmail() || '').trim().toLowerCase() !== normalizedEmail) return;
        try { item.removeViewer(normalizedEmail); removed += 1; } catch (error) {}
      });
    } catch (error) {}
    try {
      item.getEditors().forEach(function (editor) {
        if (String(editor.getEmail() || '').trim().toLowerCase() !== normalizedEmail) return;
        try { item.removeEditor(normalizedEmail); removed += 1; } catch (error) {}
      });
    } catch (error) {}
  }
  function revokeBranch(folder, depth) {
    if (depth > 6 || scanned >= limit) {
      complete = false;
      return;
    }
    revokeItem(folder);
    const files = folder.getFiles();
    while (files.hasNext() && scanned < limit) revokeItem(files.next());
    const children = folder.getFolders();
    while (children.hasNext() && scanned < limit) revokeBranch(children.next(), depth + 1);
    if ((files.hasNext() || children.hasNext()) && scanned >= limit) complete = false;
  }
  function findTeacherBranch(folder, depth) {
    if (depth > 3 || scanned >= limit) return;
    revokeItem(folder);
    const children = folder.getFolders();
    while (children.hasNext() && scanned < limit) {
      const child = children.next();
      if (normalizedName(child.getName()) === normalizedName(nickname)) revokeBranch(child, 0);
      else findTeacherBranch(child, depth + 1);
    }
  }
  roots.forEach(function (root) { findTeacherBranch(root, 0); });
  return { ok: true, scanned: scanned, removed: removed, complete: complete };
}

function secureKpiDriveItem_(item, ownerUser, scope, extraUsers) {
  if (!item) return;
  const allowed = {};
  const viewers = kpiDriveViewerUsers_(ownerUser, scope, extraUsers);
  viewers.forEach(function (user) {
    const email = String(user.email || '').trim().toLowerCase();
    if (email) allowed[email] = true;
  });
  let ownerEmail = '';
  const currentViewers = {};
  try { ownerEmail = String(item.getOwner().getEmail() || '').trim().toLowerCase(); } catch (error) {}
  try { item.setSharing(DriveApp.Access.PRIVATE, DriveApp.Permission.VIEW); } catch (error) {}
  try { item.setShareableByEditors(false); } catch (error) {}

  // 舊版曾授權過的主管可能已離職或換部門；每次開啟雲端日報時同步收斂權限。
  try {
    item.getEditors().forEach(function (user) {
      const email = String(user.getEmail() || '').trim().toLowerCase();
      if (!email || email === ownerEmail) return;
      try { item.removeEditor(email); } catch (error) {}
    });
  } catch (error) {}
  try {
    item.getViewers().forEach(function (user) {
      const email = String(user.getEmail() || '').trim().toLowerCase();
      if (!email || email === ownerEmail) return;
      if (allowed[email]) currentViewers[email] = true;
      else try { item.removeViewer(email); } catch (error) {}
    });
  } catch (error) {}

  viewers.forEach(function (user) {
    const email = String(user.email || '').trim().toLowerCase();
    if (!email || email === ownerEmail || currentViewers[email]) return;
    try { item.addViewer(email); } catch (error) {}
  });
}

function secureKpiReportPath_(root, departmentFolder, teacherFolder, workFolder, monthFolder, ownerUser, scope, extraUsers) {
  // 上層資料夾不授權部門主管，避免從父層看到其他老師或其他工作區。
  secureKpiDriveItem_(root, null, 'root', []);
  secureKpiDriveItem_(departmentFolder, null, 'root', []);
  secureKpiDriveItem_(teacherFolder, ownerUser, 'owner', []);
  secureKpiDriveItem_(workFolder, ownerUser, scope, extraUsers || []);
  if (monthFolder) secureKpiDriveItem_(monthFolder, ownerUser, scope, extraUsers || []);
}

function listArchivedKpiFiles(params) {
  const viewer = params && params.viewer ? findUserByNickname(params.viewer) : null;
  if (!viewer || viewer.status !== 'active') return { ok: false, error: '找不到可用帳號' };

  const requestedMonth = /^\d{4}-\d{2}$/.test(String(params.month || '')) ? String(params.month) : '';
  const limit = Math.max(1, Math.min(Number(params.limit) || 300, 500));
  const root = getKpiPdfRootFolder_();

  const users = sheetToObjects(SHEET_NAMES.USERS).filter(function (user) {
    return ['active', 'suspended', 'deleted'].indexOf(String(user.status || '')) >= 0;
  });
  let allowedNicknames = [];
  if (viewer.role === 'admin') {
    allowedNicknames = users.map(user => String(user.nickname || '')).filter(Boolean);
  } else if (isGlobalManager_(viewer)) {
    allowedNicknames = users.map(user => String(user.nickname || '')).filter(Boolean);
  } else if (viewer.role === 'manager') {
    allowedNicknames = users
      .filter(user => sameDepartment_(user.department, viewer.department) || user.nickname === viewer.nickname)
      .map(user => String(user.nickname || ''))
      .filter(Boolean);
  } else {
    allowedNicknames = [String(viewer.nickname || '')];
  }

  const files = [];
  const months = {};
  let scanned = 0;

  function addFile(file, monthHint) {
    if (scanned >= 1500) return;
    scanned += 1;
    const fileName = String(file.getName() || '');
    if (!/\.pdf$/i.test(fileName)) return;
    if (/^才藝日報_/.test(fileName)) return;

    const personMatch = /^KPI_(.+)_(\d{4}-\d{2}-\d{2})\.pdf$/i.exec(fileName);
    const dailyMatch = /^KPI日報_(\d{4}-\d{2}-\d{2})\.pdf$/i.exec(fileName);
    let nickname = '';
    let date = '';
    let kind = '';

    if (personMatch) {
      nickname = personMatch[1];
      date = personMatch[2];
      kind = 'person';
      if (viewer.role !== 'admin' && allowedNicknames.indexOf(nickname) < 0) return;
    } else if (dailyMatch && viewer.role === 'admin') {
      date = dailyMatch[1];
      kind = 'daily';
    } else {
      const embeddedDate = fileName.match(/\d{4}-\d{2}-\d{2}/);
      const matchedNickname = allowedNicknames.find(name => name && fileName.indexOf(name) >= 0);
      if (!embeddedDate || (!matchedNickname && viewer.role !== 'admin')) return;
      date = embeddedDate[0];
      nickname = matchedNickname || '';
      kind = nickname ? 'person' : 'other';
    }

    const month = date ? date.slice(0, 7) : monthHint;
    if (requestedMonth && month !== requestedMonth) return;
    if (month) months[month] = true;
    const ownerUser = nickname ? users.filter(function (user) { return String(user.nickname || '') === nickname; })[0] || null : null;
    secureKpiDriveItem_(file, ownerUser, 'anqin', [viewer]);
    files.push({
      id: file.getId(),
      fileName: fileName,
      nickname: nickname,
      date: date,
      month: month || '',
      kind: kind,
      url: file.getUrl(),
      updatedAt: Utilities.formatDate(file.getLastUpdated(), Session.getScriptTimeZone() || 'Asia/Taipei', "yyyy-MM-dd'T'HH:mm:ssXXX"),
    });
  }

  function scanFiles(folder, monthHint, depth) {
    if (depth > 4 || scanned >= 1500) return;
    const iterator = folder.getFiles();
    while (iterator.hasNext() && scanned < 1500) addFile(iterator.next(), monthHint);
    const children = folder.getFolders();
    while (children.hasNext() && scanned < 1500) {
      const child = children.next();
      const childName = String(child.getName() || '');
      const nextMonth = /^\d{4}-\d{2}$/.test(childName) ? childName : monthHint;
      if (!requestedMonth || !/^\d{4}-\d{2}$/.test(childName) || childName === requestedMonth) {
        scanFiles(child, nextMonth, depth + 1);
      }
    }
  }

  scanFiles(root, '', 0);

  files.sort((a, b) => String(b.date || b.updatedAt).localeCompare(String(a.date || a.updatedAt)) || a.fileName.localeCompare(b.fileName));
  return {
    ok: true,
    files: files.slice(0, limit),
    months: Object.keys(months).sort().reverse(),
  };
}

function teacherReportUsersFor_(viewer, scope) {
  let users = sheetToObjects(SHEET_NAMES.USERS).filter(function (user) {
    const allowedStatuses = scope === 'talent'
      ? ['active', 'pending', 'suspended', 'deleted']
      : ['active', 'suspended', 'deleted'];
    if (allowedStatuses.indexOf(String(user.status || '')) < 0) return false;
    if (scope === 'talent') {
      const assignments = talentAssignments_(user);
      return assignments.indexOf('talent-fulltime') >= 0 || assignments.indexOf('talent-pt') >= 0;
    }
    return ['東橋教室', '北區教室'].indexOf(normalizeDepartment_(user.department)) >= 0 && ['teacher', 'manager'].indexOf(user.role) >= 0;
  });
  if (viewer.role === 'admin' || isGlobalManager_(viewer)) return users;
  if (scope === 'talent' && talentAssignments_(viewer).indexOf('talent-manager') >= 0) return users;
  return users.filter(function (user) { return sameDepartment_(user.department, viewer.department); });
}

function existingChildFolder_(parent, name) {
  if (!parent) return null;
  const iterator = parent.getFoldersByName(name);
  return iterator.hasNext() ? iterator.next() : null;
}

function teacherFolderPdfStats_(folder) {
  let count = 0;
  let latest = '';
  let scanned = 0;
  function visit(current, depth) {
    if (depth > 2 || scanned >= 1000) return;
    const files = current.getFiles();
    while (files.hasNext() && scanned < 1000) {
      const file = files.next();
      scanned += 1;
      if (!/\.pdf$/i.test(String(file.getName() || ''))) continue;
      count += 1;
      const match = String(file.getName() || '').match(/\d{4}-\d{2}-\d{2}/);
      if (match && match[0] > latest) latest = match[0];
    }
    const folders = current.getFolders();
    while (folders.hasNext() && scanned < 1000) {
      const child = folders.next();
      visit(child, depth + 1);
    }
  }
  visit(folder, 0);
  return { count: count, latest: latest };
}

function talentReportStatsByTeacher_() {
  const stats = {};
  sheetToObjects(SHEET_NAMES.TALENT_RECORDS).forEach(function (row) {
    if (row.record_type !== 'lesson' || row.status !== 'submitted') return;
    const lesson = talentRecordObject_(row);
    if (!lesson.reportUrl) return;
    if (!stats[row.nickname]) stats[row.nickname] = { count: 0, latest: '', folderUrl: '', reportFileId: '' };
    stats[row.nickname].count += 1;
    const date = String(row.record_date || lesson.date || '').slice(0, 10);
    if (date >= stats[row.nickname].latest) {
      stats[row.nickname].latest = date;
      stats[row.nickname].folderUrl = String(lesson.reportFolderUrl || stats[row.nickname].folderUrl || '');
      stats[row.nickname].reportFileId = String(lesson.reportFileId || stats[row.nickname].reportFileId || '');
    }
  });
  return stats;
}

function talentIndexedReportFolder_(stats, openTeacherFolder) {
  if (!stats || !stats.count) return null;
  if (stats.folderUrl) {
    const match = String(stats.folderUrl).match(/\/folders\/([a-zA-Z0-9_-]+)/);
    if (match) {
      if (!openTeacherFolder) return { targetUrl: stats.folderUrl, targetId: match[1], workUrl: stats.folderUrl };
      const workFolder = DriveApp.getFolderById(match[1]);
      const parents = workFolder.getParents();
      const target = parents.hasNext() ? parents.next() : workFolder;
      return { targetUrl: target.getUrl(), targetId: target.getId(), workUrl: workFolder.getUrl() };
    }
  }
  if (!stats.reportFileId) return null;
  const file = DriveApp.getFileById(stats.reportFileId);
  const monthParents = file.getParents();
  if (!monthParents.hasNext()) return null;
  const monthFolder = monthParents.next();
  const workParents = monthFolder.getParents();
  if (!workParents.hasNext()) return null;
  const workFolder = workParents.next();
  if (!openTeacherFolder) return { targetUrl: workFolder.getUrl(), targetId: workFolder.getId(), workUrl: workFolder.getUrl() };
  const teacherParents = workFolder.getParents();
  const target = teacherParents.hasNext() ? teacherParents.next() : workFolder;
  return { targetUrl: target.getUrl(), targetId: target.getId(), workUrl: workFolder.getUrl() };
}

function ensureTeacherReportFolderViewer_(folderId, viewer) {
  const email = String(viewer && viewer.email || '').trim().toLowerCase();
  if (!folderId || !email || viewer.role === 'admin') return;
  const cache = CacheService.getScriptCache();
  const cacheKey = 'teacher-folder-viewer-v1-' + folderId + '-' + email;
  if (cache.get(cacheKey)) return;
  try {
    DriveApp.getFolderById(folderId).addViewer(email);
    cache.put(cacheKey, '1', 21600);
  } catch (error) {}
}

/**
 * 主管專用雲端日報入口。回傳的老師資料夾已依登入者權限與工作區篩選；
 * 東橋主管不會拿到北區或才藝資料夾，才藝主管只會拿到才藝工作成員。
 */
function listTeacherReportFolders(params) {
  const actor = params && params.__actor ? params.__actor : (params && params.viewer ? findUserByNickname(params.viewer) : null);
  if (!actor || actor.status !== 'active' || ['admin', 'manager'].indexOf(actor.role) < 0) {
    return { ok: false, error: '只有主管可查看雲端日報資料夾' };
  }
  let viewer = actor;
  if (actor.role === 'admin' && String(params.view_as || '').trim()) {
    const requestedViewer = findUserByNickname(String(params.view_as || '').trim());
    if (requestedViewer && ['admin', 'manager'].indexOf(requestedViewer.role) >= 0) viewer = requestedViewer;
  }
  const scope = String(params.scope || '') === 'talent' ? 'talent' : 'anqin';
  const assignments = talentAssignments_(viewer);
  if (viewer.role !== 'admin' && !isGlobalManager_(viewer)) {
    if (scope === 'talent' && assignments.indexOf('talent-manager') < 0) return { ok: false, error: '沒有才藝日報查看權限' };
    if (scope === 'anqin' && assignments.indexOf('anqin-manager') < 0) return { ok: false, error: '沒有安親日報查看權限' };
  }
  const cacheKey = 'teacher-folders-v6-' + scope + '-' + normalizeTalentNickname_(viewer.nickname) + '-' + viewer.role + '-actor-' + normalizeTalentNickname_(actor.nickname);
  const cache = CacheService.getScriptCache();
  if (!params.refresh) {
    const cached = cache.get(cacheKey);
    if (cached) {
      try {
        const parsed = JSON.parse(cached);
        parsed.cached = true;
        return parsed;
      } catch (error) {}
    }
  }
  const talentStats = scope === 'talent' ? talentReportStatsByTeacher_() : {};
  const root = scope === 'anqin' ? getKpiPdfRootFolder_() : null;
  const canOpenTeacherRoot = viewer.role === 'admin' || isGlobalManager_(viewer);
  const folders = teacherReportUsersFor_(viewer, scope).map(function (user) {
    const department = normalizeDepartment_(user.department) || '未分部門';
    const stats = scope === 'talent'
      ? (talentStats[user.nickname] || { count: 0, latest: '', folderUrl: '', reportFileId: '' })
      : { count: 0, latest: '' };
    let targetFolder = null;
    let workFolder = null;
    let targetUrl = '';
    let targetId = '';
    let workspaceUrl = '';
    if (scope === 'talent') {
      try {
        const indexed = talentIndexedReportFolder_(stats, canOpenTeacherRoot);
        targetUrl = indexed && indexed.targetUrl || '';
        targetId = indexed && indexed.targetId || '';
        workspaceUrl = indexed && indexed.workUrl || '';
      } catch (error) {}
    } else {
      const departmentFolder = existingChildFolder_(root, department);
      const teacherFolder = existingChildFolder_(departmentFolder, user.nickname);
      workFolder = existingChildFolder_(teacherFolder, '安親');
      const anqinStats = workFolder ? teacherFolderPdfStats_(workFolder) : { count: 0, latest: '' };
      stats.count = anqinStats.count;
      stats.latest = anqinStats.latest;
      targetFolder = canOpenTeacherRoot ? teacherFolder : workFolder;
      targetUrl = targetFolder ? targetFolder.getUrl() : '';
      targetId = targetFolder ? targetFolder.getId() : '';
      workspaceUrl = workFolder ? workFolder.getUrl() : '';
    }
    if (targetId && actor.nickname === viewer.nickname) ensureTeacherReportFolderViewer_(targetId, actor);
    return {
      nickname: user.nickname,
      department: department,
      employment_type: user.employment_type || '',
      status: user.status || '',
      deletedAt: user.deleted_at || '',
      reportCount: stats.count,
      latestDate: stats.latest,
      url: targetUrl,
      folderId: targetId,
      workspaceUrl: workspaceUrl,
      opensTeacherFolder: Boolean(canOpenTeacherRoot && targetUrl),
    };
  }).filter(function (folder) {
    return folder.status === 'active' || (scope === 'talent' && folder.status === 'pending') || folder.reportCount > 0;
  });
  folders.sort(function (left, right) {
    return left.department.localeCompare(right.department, 'zh-TW') || left.nickname.localeCompare(right.nickname, 'zh-TW');
  });
  const result = { ok: true, scope: scope, rootUrl: '', folders: folders, cached: false };
  try { cache.put(cacheKey, JSON.stringify(result), 300); } catch (error) {}
  return result;
}

/**
 * 將老師匯出的月歸檔 CSV 同步存入 Drive。
 * 路徑：KPI月歸檔 / 部門 / 暱稱 / YYYY-MM / YYYY-MM_暱稱_安親KPI月歸檔.csv
 */
function archiveMonthlyCsv(params) {
  const nickname = String(params.nickname || '').trim();
  const month = String(params.month || '').trim();
  const csv = String(params.csv || '');
  if (!nickname || !/^\d{4}-(0[1-9]|1[0-2])$/.test(month) || !csv) {
    return { ok: false, error: '月歸檔資料不完整' };
  }
  if (csv.length > 5 * 1024 * 1024) return { ok: false, error: '月歸檔超過 5 MB 上限' };
  const user = findUserByNickname(nickname);
  if (!user || user.status !== 'active') return { ok: false, error: '找不到可用帳號' };

  const roots = DriveApp.getFoldersByName('KPI月歸檔');
  const root = roots.hasNext() ? roots.next() : DriveApp.createFolder('KPI月歸檔');
  const department = normalizeDepartment_(user.department) || '未分部門';
  const departmentFolder = getOrCreateChildFolder_(root, department);
  const userFolder = getOrCreateChildFolder_(departmentFolder, nickname);
  const monthFolder = getOrCreateChildFolder_(userFolder, month);
  const safeNickname = nickname.replace(/[\\/:*?"<>|]/g, '-');
  const fileName = month + '_' + safeNickname + '_安親KPI月歸檔.csv';
  const existing = monthFolder.getFilesByName(fileName);
  while (existing.hasNext()) existing.next().setTrashed(true);
  const file = monthFolder.createFile(Utilities.newBlob(csv, 'text/csv;charset=utf-8', fileName));
  secureKpiReportPath_(root, departmentFolder, userFolder, monthFolder, null, user, 'anqin', []);
  secureKpiDriveItem_(file, user, 'anqin', []);
  const url = 'https://drive.google.com/file/d/' + file.getId() + '/view';
  logSystem(nickname, 'archive_monthly_csv', month, { fileName: fileName });
  return {
    ok: true,
    url: url,
    fileName: fileName,
    folderPath: ['KPI月歸檔', department, nickname, month].join(' / '),
  };
}

// ════════════════════════════════════════════════════════════
//  pdfreport.gs
// ════════════════════════════════════════════════════════════

/**
 * KPI 日報 PDF：每晚自動生成全員日報（含照片）→ 存 Drive → LINE 推連結給老闆
 * - 觸發器：setupKpiReportTrigger()（編輯器執行一次，每天 21:30）
 * - 手動/測試：?action=sendDailyKpiPdf&operator=柏翰&date=2026-07-09
 * - LINE 指令（限 admin）：「kpi」今日、「kpi昨天」、「kpi 2026-07-08」
 */

/** 品牌橫幅圖（放在 GitHub Pages；圖片在 Google 轉檔器一定會顯示，背景色則會被砍掉） */
function pdfBannerImg_() {
  try {
    const r = UrlFetchApp.fetch('https://teacher.blockplanetcamp.com/shared/img/pdf-banner.png', { muteHttpExceptions: true });
    if (r.getResponseCode() === 200) {
      const b = r.getBlob();
      return '<img src="data:image/png;base64,' + Utilities.base64Encode(b.getBytes()) + '" style="width:100%;">';
    }
  } catch (e) {}
  // 備援：橘框橘字（轉檔器會保留邊框與文字色）
  return '<div style="border:3px solid #E89B3C; border-radius:12px; padding:14px 20px; color:#E89B3C; font-size:22px; font-weight:bold;">🪐 布拉克星球 KPI 日報</div>';
}

/** 五彩手印圓點（呼應 Logo 的五位居民代表色，品牌記憶點） */
function pdfDots_() {
  const cs = ['#F4C842', '#5B9BD5', '#E63946', '#7CB342', '#2C3E50'];
  return '<div style="margin-top:10px;">' + cs.map(function (c) {
    return '<span style="display:inline-block; width:9px; height:9px; border-radius:50%; background:' + c + '; margin-right:6px;"></span>';
  }).join('') + '</div>';
}

function pdfEsc_(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/\n/g, '<br>');
}

function pdfSafeUrl_(value) {
  const url = String(value || '').trim();
  return /^https:\/\/[^\s"'<>]+$/i.test(url) ? pdfEsc_(url) : '';
}

/** 只把 PDF 轉檔器確定支援的真實圖片轉成 data URI。 */
function pdfImageDataUri_(blob, maxBytes) {
  if (!blob) return '';
  const contentType = String(blob.getContentType() || '').toLowerCase();
  if (!/^image\/(?:jpeg|jpg|png|gif)$/.test(contentType)) return '';
  const bytes = blob.getBytes();
  if (!bytes || !bytes.length || bytes.length > Number(maxBytes || 950000)) return '';
  return 'data:' + contentType + ';base64,' + Utilities.base64Encode(bytes);
}

/**
 * 取 PDF 圖片 data URI。
 * 先由具有權限的 Apps Script 直接讀取 Drive；只有原檔過大時才嘗試授權縮圖。
 * Google 的未登入頁也可能回傳 HTTP 200，因此每一個來源都必須驗證 MIME 類型。
 */
function pdfPhotoUri_(fileId) {
  if (!fileId) return '';
  try {
    const direct = pdfImageDataUri_(DriveApp.getFileById(fileId).getBlob(), 950000);
    if (direct) return direct;
  } catch (e) {}
  try {
    const r = UrlFetchApp.fetch('https://lh3.googleusercontent.com/d/' + encodeURIComponent(fileId) + '=w360', {
      headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() },
      muteHttpExceptions: true,
    });
    if (r.getResponseCode() === 200) return pdfImageDataUri_(r.getBlob(), 950000);
  } catch (e) {}
  return '';
}

function pdfRow_(label, val) {
  if (!val || !String(val).trim()) return '';
  return '<div style="margin:2px 0;"><span style="color:#C77A12; font-weight:bold;">' + label + '</span>　' + pdfEsc_(val) + '</div>';
}

/** 單人日誌卡片 HTML */
function pdfLogCard_(l) {
  const k1 = parseJsonField(l.kpi1_data) || {};
  const k2 = parseJsonField(l.kpi2_data) || {};
  const k3 = parseJsonField(l.kpi3_data) || {};
  const k5 = parseJsonField(l.kpi5_data) || {};
  const k6 = parseJsonField(l.kpi6_data) || {};
  const atts = parseJsonField(l.attachments);
  const attachments = Array.isArray(atts) ? atts.filter(a => a && typeof a === 'object') : [];
  const photos = attachments.filter(a => a.type === 'photo' && a.fileId);

  const submitted = l.submitted_at
    ? '<span style="background:#EDF5E3; color:#4E7A28; padding:2px 10px; border-radius:10px; font-size:11px; font-weight:bold;">✅ 已提交</span>'
      + (l.is_makeup === true ? ' <span style="background:#FFF1DD; color:#C77A12; padding:2px 10px; border-radius:10px; font-size:11px; font-weight:bold;">補繳</span>' : '')
    : '<span style="background:#FDEBEC; color:#E63946; padding:2px 10px; border-radius:10px; font-size:11px; font-weight:bold;">✏️ 草稿未送出</span>';

  let h = '<div style="background:#FFFDF5; border:1.5px solid #F0E0C0; box-shadow:3px 3px 0 rgba(61,40,23,0.06); border-left:6px solid #E89B3C; border-radius:8px; padding:12px 14px; margin:10px 0;">';
  h += '<div style="font-size:15px; font-weight:bold; color:#2C3E50; margin-bottom:6px;">👤 ' + pdfEsc_(l.nickname)
     + ' <span style="font-size:11px; color:#999; font-weight:normal;">' + pdfEsc_(l.department || '') + '</span>　' + submitted + '</div>';

  // 環境整潔
  const envMap = [['env_classroom', '教室'], ['env_tools', '教具'], ['env_trash', '垃圾'], ['env_toilet', '廁所']];
  const envLine = envMap.map(p => (k2[p[0]] === true ? '✅' : '⬜') + p[1]).join('　');
  h += '<div style="margin:2px 0;"><span style="color:#C77A12; font-weight:bold;">🧹 環境整潔</span>　' + envLine + '</div>';
  h += pdfRow_('🔧 設備問題', k2.equipment_issue);
  h += pdfRow_('🏫 班級狀況', k2.class_status);

  // 安親輔導
  const hasPrepFeedback = Boolean(k1.prep_strengths || k1.student_resonance || k1.prep_changes);
  if (hasPrepFeedback) {
    h += pdfRow_('✅ 教案／教材有效處', k1.prep_strengths);
    h += pdfRow_('✨ 孩子共鳴環節', k1.student_resonance);
    h += pdfRow_('📝 教案／教材更新', k1.prep_changes);
  } else {
    h += pdfRow_('📚 複習方式', k1.review_method);
    h += pdfRow_('❗ 常錯重點', k1.error_points);
    h += pdfRow_('💡 協助方法', k1.help_method);
    h += pdfRow_('🎓 輔導成果', k1.outcome);
  }

  // 課程
  const courses = Array.isArray(k3.courses) ? k3.courses : [];
  courses.forEach(c => {
    const bits = [];
    if (c.name) bits.push(c.name);
    if (c.class) bits.push(c.class);
    h += '<div style="margin:6px 0 2px; font-weight:bold; color:#2C3E50;">📘 ' + pdfEsc_(c.type || '課程') + (bits.length ? '｜' + pdfEsc_(bits.join('｜')) : '') + '</div>';
    if (c.prep_strengths || c.student_resonance || c.prep_changes) {
      h += pdfRow_('教案／教材有效處', c.prep_strengths);
      h += pdfRow_('孩子共鳴環節', c.student_resonance);
      h += pdfRow_('教案／教材更新', c.prep_changes);
    } else {
      h += pdfRow_('進度', c.progress);
      h += pdfRow_('學習狀況', c.learning);
      h += pdfRow_('下次計畫', c.next);
    }
  });
  // 專案
  if (k3.project && (k3.project.progress || k3.project.done || k3.project.problem || k3.project.plan)) {
    h += '<div style="margin:6px 0 2px; font-weight:bold; color:#2C3E50;">🎯 專案</div>';
    h += pdfRow_('進度', k3.project.progress) + pdfRow_('完成', k3.project.done)
       + pdfRow_('問題', k3.project.problem) + pdfRow_('計畫', k3.project.plan);
  }

  // 親師
  if (k5.parent_contacted === true) h += pdfRow_('🤝 親師溝通', k5.parent_summary || '有聯繫');
  else if (k5.parent_handoff_confirmed === true) h += pdfRow_('🚪 門口交接', k5.parent_handoff_note || '已親自完成交接');
  h += pdfRow_('👀 特別關注學生', (Array.isArray(k5.special_students) && k5.special_students.length ? k5.special_students.join('、') + '：' : '') + (k5.student_special || ''));

  // 工作紀錄
  h += pdfRow_('✔️ 今日完成', k6.today_done);
  h += pdfRow_('📌 明日待辦', k6.tomorrow_todo);
  h += pdfRow_('⚡ 特殊事件', k6.special_event);
  h += pdfRow_('🗂 行政成果', k6.admin_result);
  h += pdfRow_('💭 今日心得', l.reflection);
  if (l.help_needed === true) {
    h += '<div style="background:#FDEBEC; color:#E63946; padding:6px 10px; border-radius:6px; margin-top:6px; font-weight:bold;">🚨 求助：' + pdfEsc_(l.help_content || '') + '</div>';
  }

  // 照片牆（每列 4 張）
  if (photos.length) {
    const KPI_LABEL = { 1: '課業', 2: '環境', 3: '課程', 5: '親師', 6: '行政' };
    const previews = photos.map(function (photo) {
      return { photo: photo, uri: pdfPhotoUri_(photo.fileId) };
    }).filter(function (item) { return /^data:image\//.test(item.uri); });
    if (previews.length) {
      h += '<div style="margin-top:8px;"><span style="color:#C77A12; font-weight:bold;">📷 照片（' + previews.length + '）</span></div>';
      h += '<table style="border-collapse:collapse; margin-top:4px;"><tr>';
      previews.forEach(function (item, index) {
        if (index > 0 && index % 4 === 0) h += '</tr><tr>';
        h += '<td style="padding:3px; vertical-align:top; text-align:center;">'
           + '<img src="' + item.uri + '" style="width:150px; border-radius:6px;"><br>'
           + '<span style="font-size:9px; color:#999;">' + (KPI_LABEL[item.photo.kpi] || '') + '</span></td>';
      });
      h += '</tr></table>';
    }
    if (previews.length < photos.length) {
      h += '<div style="margin-top:5px; color:#A85A26; font-size:10px;">另有 ' + (photos.length - previews.length) + ' 張原檔無法轉成 PDF 預覽，請由下方成果附件開啟原檔。</div>';
    }
  }

  const linkedAttachments = attachments.filter(a => pdfSafeUrl_(a.url));
  if (linkedAttachments.length) {
    h += '<div style="margin-top:8px;"><span style="color:#C77A12; font-weight:bold;">🔗 成果附件（' + linkedAttachments.length + '）</span></div>';
    h += '<ul style="margin:4px 0 0 18px; padding:0;">';
    linkedAttachments.forEach(function (a, index) {
      const url = pdfSafeUrl_(a.url);
      const label = String(a.fileName || a.description || (a.type === 'photo' ? '成果照片 ' + (index + 1) : '成果附件 ' + (index + 1)));
      const note = a.description && String(a.description) !== label ? '｜' + pdfEsc_(a.description) : '';
      h += '<li style="margin:3px 0;"><a href="' + url + '" style="color:#2A7FA8;">' + pdfEsc_(label) + '</a>' + note + '</li>';
    });
    h += '</ul>';
  }
  h += '</div>';
  return h;
}

/** 全員日報 HTML */
function buildDailyKpiHtml_(dateStr) {
  const users = sheetToObjects(SHEET_NAMES.USERS).filter(u => u.status === 'active' && u.role !== 'admin');
  const logs = sheetToObjects(SHEET_NAMES.LOGS).filter(l => String(l.date) === dateStr);
  const logMap = {};
  logs.forEach(l => logMap[l.nickname] = l);

  const submittedNames = users.filter(u => logMap[u.nickname] && logMap[u.nickname].submitted_at).map(u => u.nickname);
  const draftNames = users.filter(u => logMap[u.nickname] && !logMap[u.nickname].submitted_at).map(u => u.nickname);
  const missingNames = users.filter(u => !logMap[u.nickname]).map(u => u.nickname);
  const helpNames = logs.filter(l => l.help_needed === true).map(l => l.nickname);

  let h = '<html><head><meta charset="UTF-8"><style>body{font-family:"Microsoft JhengHei","Noto Sans TC",sans-serif; font-size:12px; color:#3D2817; background:#FFF8E7; margin:0; padding:4px;}</style></head><body>';
  // 封面頁頭
  h += pdfBannerImg_()
     + '<div style="font-size:15px; font-weight:bold; color:#3D2817; margin:8px 0 0 2px;">📅 ' + dateStr + '　全員日報</div>';
  // 總覽
  h += '<table width="100%" cellpadding="0" cellspacing="0" style="margin:12px 0;"><tr><td bgcolor="#FFFDF5" style="background:#FFFDF5; border:2px solid #F4C842; border-radius:8px; padding:10px 14px;">'
     + '<b style="color:#2C3E50;">📊 今日總覽</b>　'
     + '✅ 已提交 ' + submittedNames.length + ' 人'
     + '　✏️ 草稿 ' + draftNames.length + ' 人'
     + '　❌ 未填 ' + missingNames.length + ' 人'
     + (helpNames.length ? '　🚨 求助 ' + helpNames.length + ' 人' : '')
     + (draftNames.length ? '<br><span style="color:#C77A12;">草稿：' + draftNames.join('、') + '</span>' : '')
     + (missingNames.length ? '<br><span style="color:#E63946;">未填：' + missingNames.join('、') + '</span>' : '')
     + (helpNames.length ? '<br><span style="color:#E63946; font-weight:bold;">求助：' + helpNames.join('、') + '</span>' : '')
     + '</td></tr></table>';

  // 部門分組
  const deptOrder = ['東橋教室', '北區教室', '才藝部門'];
  const depts = deptOrder.concat(users.map(u => normalizeDepartment_(u.department)).filter(d => d && deptOrder.indexOf(d) < 0));
  const seen = {};
  depts.forEach(d => {
    if (!d || seen[d]) return; seen[d] = true;
    const deptLogs = logs.filter(l => sameDepartment_(l.department, d));
    if (!deptLogs.length) return;
    h += '<div style="font-size:16px; font-weight:bold; color:#2C3E50; border-bottom:2.5px solid #E89B3C; padding-bottom:4px; margin:16px 0 4px;">🏫 ' + pdfEsc_(d) + '</div>';
    deptLogs.sort((a, b) => (a.role === 'manager' ? -1 : 1) - (b.role === 'manager' ? -1 : 1));
    deptLogs.forEach(l => { h += pdfLogCard_(l); });
  });

  h += '<div style="text-align:center; color:#A08B72; font-size:10px; margin-top:14px;">球球・布布・克克・拉拉・星星 陪你紀錄每一天 🪐 布拉克星球教育團隊</div>';
  h += '</body></html>';
  return { html: h, summary: { submitted: submittedNames.length, draft: draftNames.length, missing: missingNames.length, total: users.length, help: helpNames, missingNames: missingNames } };
}

/** 生成全體 PDF → 存 Drive（KPI日報PDF/年月）→ 回傳連結 */
function generateDailyKpiPdf_(dateStr) {
  const built = buildDailyKpiHtml_(dateStr);
  const blob = Utilities.newBlob(built.html, 'text/html', 'kpi.html').getAs('application/pdf').setName('KPI日報_' + dateStr + '.pdf');
  const root = getKpiPdfRootFolder_();
  const ymF = getOrCreateChildFolder_(root, dateStr.slice(0, 7));
  // 同日重跑先移除舊檔（避免堆一堆同名 PDF）
  const dup = ymF.getFilesByName('KPI日報_' + dateStr + '.pdf');
  while (dup.hasNext()) dup.next().setTrashed(true);
  const file = ymF.createFile(blob);
  secureKpiDriveItem_(root, null, 'root', []);
  secureKpiDriveItem_(ymF, null, 'anqin', bossUsers_());
  secureKpiDriveItem_(file, null, 'anqin', bossUsers_());
  return { url: 'https://drive.google.com/file/d/' + file.getId() + '/view', fileId: file.getId(), summary: built.summary };
}

/** 摘要文字（LINE 訊息用） */
function kpiPdfMsg_(dateStr, r) {
  let t = '📄 KPI 日報 ' + dateStr + '\n'
    + '✅ 已提交 ' + r.summary.submitted + '/' + r.summary.total
    + '｜✏️ 草稿 ' + r.summary.draft
    + '｜❌ 未填 ' + r.summary.missing;
  if (r.summary.missingNames && r.summary.missingNames.length) t += '\n未填：' + r.summary.missingNames.join('、');
  if (r.summary.help && r.summary.help.length) t += '\n🚨 求助：' + r.summary.help.join('、');
  t += '\n\n完整報告（含照片）👇\n' + r.url;
  return t;
}

/** 全體日報收件人：所有 active admin ＋ 可跨教室查看的小魚。 */
function bossUsers_() {
  return sheetToObjects(SHEET_NAMES.USERS).filter(x =>
    x.status === 'active' && (x.role === 'admin' || isGlobalManager_(x))
  );
}

/** 單一老師送出時：同教室主管、跨教室主管小魚，以及所有管理員。 */
function reportRecipientUsers_(log) {
  const seen = {};
  return sheetToObjects(SHEET_NAMES.USERS).filter(function (user) {
    if (!user || user.status !== 'active') return false;
    const included = user.role === 'admin' || isGlobalManager_(user) ||
      (user.role === 'manager' && sameDepartment_(user.department, log.department));
    if (!included || seen[user.nickname]) return false;
    seen[user.nickname] = true;
    return true;
  });
}

/** 以 Drive API 原地替換 PDF 內容，讓既有 LINE／APP 連結繼續有效。 */
function replacePdfContent_(fileId, blob) {
  try {
    const response = UrlFetchApp.fetch('https://www.googleapis.com/upload/drive/v3/files/' + encodeURIComponent(fileId) + '?uploadType=media', {
      method: 'patch',
      contentType: 'application/pdf',
      payload: blob.getBytes(),
      headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() },
      muteHttpExceptions: true,
    });
    const code = response.getResponseCode();
    return code >= 200 && code < 300;
  } catch (error) {
    return false;
  }
}

function savePersonPdf_(folder, fileName, blob) {
  const matches = folder.getFilesByName(fileName);
  if (matches.hasNext()) {
    const existing = matches.next();
    if (replacePdfContent_(existing.getId(), blob)) {
      while (matches.hasNext()) matches.next().setTrashed(true);
      return existing;
    }
    existing.setTrashed(true);
    while (matches.hasNext()) matches.next().setTrashed(true);
  }
  return folder.createFile(blob);
}

/** 單人日報 PDF（老師送出當下即時生成） */
function generatePersonKpiPdf_(nickname, dateStr) {
  const log = findObject(SHEET_NAMES.LOGS, 'log_id', 'LOG-' + String(dateStr).replace(/-/g, '') + '-' + nickname);
  if (!log) return null;
  let h = '<html><head><meta charset="UTF-8"><style>body{font-family:"Microsoft JhengHei","Noto Sans TC",sans-serif; font-size:12px; color:#3D2817; background:#FFF8E7; margin:0; padding:4px;}</style></head><body>';
  h += pdfBannerImg_()
     + '<div style="font-size:15px; font-weight:bold; color:#3D2817; margin:8px 0 0 2px;">👤 ' + pdfEsc_(nickname) + '　📅 ' + dateStr + '　' + pdfEsc_(log.department || '') + '</div>';
  h += pdfLogCard_(log);
  h += '<div style="text-align:center; color:#A08B72; font-size:10px; margin-top:14px;">球球・布布・克克・拉拉・星星 陪你紀錄每一天 🪐 布拉克星球教育團隊</div></body></html>';
  const blob = Utilities.newBlob(h, 'text/html', 'kpi.html').getAs('application/pdf').setName('KPI_' + nickname + '_' + dateStr + '.pdf');
  const root = getKpiPdfRootFolder_();
  const departmentFolder = getOrCreateChildFolder_(root, normalizeDepartment_(log.department) || '未分部門');
  const teacherFolder = getOrCreateChildFolder_(departmentFolder, nickname);
  const workFolder = getOrCreateChildFolder_(teacherFolder, '安親');
  const ymF = getOrCreateChildFolder_(workFolder, String(dateStr).slice(0, 7));
  const file = savePersonPdf_(ymF, 'KPI_' + nickname + '_' + dateStr + '.pdf', blob);
  const ownerUser = findUserByNickname(nickname);
  const recipients = reportRecipientUsers_(log);
  secureKpiReportPath_(root, departmentFolder, teacherFolder, workFolder, ymF, ownerUser, 'anqin', recipients);
  secureKpiDriveItem_(file, ownerUser, 'anqin', recipients);
  return { url: 'https://drive.google.com/file/d/' + file.getId() + '/view', folderUrl: workFolder.getUrl(), log: log };
}

/** 管理維護：重建今天所有已送出的單人 PDF，並保留既有檔案網址。 */
function repairTodayKpiPdfImages() {
  const dateStr = todayStr();
  const logs = sheetToObjects(SHEET_NAMES.LOGS).filter(function (log) {
    return String(log.date || '') === dateStr && Boolean(log.submitted_at);
  });
  const repaired = [];
  const failed = [];
  logs.forEach(function (log) {
    try {
      const result = generatePersonKpiPdf_(log.nickname, dateStr);
      if (!result) throw new Error('PDF 產生失敗');
      repaired.push({ nickname: log.nickname, url: result.url });
    } catch (error) {
      failed.push({ nickname: log.nickname, error: String(error && error.message || error) });
    }
  });
  return { ok: failed.length === 0, date: dateStr, repaired: repaired, failed: failed };
}

/**
 * 老師正式送出後，生成單人 PDF，並以 APP／LINE 通知同教室主管、小魚與管理員。
 * 每位收件人同一版本只需任一管道成功一次；失敗者可單獨重試，不重複打擾已送達者。
 */
function sendSubmitPdf(params) {
  const nickname = params.nickname;
  const dateStr = String(params.date || '');
  if (!nickname || !dateStr) return { ok: false, error: 'missing nickname/date' };
  const log_id = 'LOG-' + dateStr.replace(/-/g, '') + '-' + nickname;
  const props = PropertiesService.getScriptProperties();
  const log = findObject(SHEET_NAMES.LOGS, 'log_id', log_id);
  if (!log) return { ok: false, error: 'log not found' };
  if (!log.submitted_at) return { ok: false, error: 'not submitted' };
  const version = String(log.updated_at || log.submitted_at || nowIso());
  const pdfVersionKey = 'PERSONPDF_VERSION_' + log_id;
  const pdfUrlKey = 'PERSONPDF_URL_' + log_id;
  const cachedPdfVersion = props.getProperty(pdfVersionKey) || '';
  const cachedPdfUrl = props.getProperty(pdfUrlKey) || '';
  let r = cachedPdfVersion >= version && cachedPdfUrl
    ? { url: cachedPdfUrl, log: log }
    : generatePersonKpiPdf_(nickname, dateStr);
  if (!r) return { ok: false, error: 'pdf generation failed' };
  if (!(cachedPdfVersion >= version && cachedPdfUrl)) {
    props.setProperty(pdfVersionKey, version);
    props.setProperty(pdfUrlKey, r.url);
  }

  const md = dateStr.slice(5).replace('-', '/');
  let msg = '📄 ' + nickname + ' ' + md + ' KPI 日報已送出';
  if (r.log.is_makeup === true) msg += '（補繳）';
  if (r.log.help_needed === true) msg += '\n🚨 有求助：' + String(r.log.help_content || '').slice(0, 100);
  msg += '\n完整日報（含照片）👇\n' + r.url;

  const deliveries = [];
  reportRecipientUsers_(log).forEach(function (recipient) {
    if (recipient.nickname === nickname) return;
    const recipientKey = 'SENTPDF_USER_' + log_id + '_' + recipient.nickname;
    const lineKey = 'SENTPDF_LINE_' + log_id + '_' + recipient.nickname;
    const appKey = 'SENTPDF_APP_' + log_id + '_' + recipient.nickname;
    const lineBound = Boolean(recipient.line_user_id);
    const appBound = Boolean(recipient.push_subscription_id);
    const lineAlreadySent = lineBound && (props.getProperty(lineKey) || '') >= version;
    const appAlreadySent = appBound && (props.getProperty(appKey) || '') >= version;
    const previouslyReached = Boolean(lineAlreadySent || appAlreadySent || (props.getProperty(recipientKey) || '') >= version);
    const lineSent = lineBound && !lineAlreadySent && pushLine_(recipient.line_user_id, msg);
    const appSent = appBound && !appAlreadySent && pushOneSignal_(recipient.nickname, nickname + ' 已送出 KPI 日報', md + ' 的紀錄與成果證據已可查看');
    if (lineSent) props.setProperty(lineKey, version);
    if (appSent) props.setProperty(appKey, version);
    const lineReached = Boolean(lineAlreadySent || lineSent);
    const appReached = Boolean(appAlreadySent || appSent);
    const reached = Boolean(previouslyReached || lineReached || appReached);
    const channelsComplete = Boolean((lineBound || appBound) && (!lineBound || lineReached) && (!appBound || appReached));
    if (reached) props.setProperty(recipientKey, version);
    deliveries.push({
      nickname: recipient.nickname,
      lineBound: lineBound,
      appBound: appBound,
      lineSent: Boolean(lineSent),
      appSent: Boolean(appSent),
      lineReached: lineReached,
      appReached: appReached,
      alreadySent: Boolean(previouslyReached && !lineSent && !appSent),
      reached: reached,
      channelsComplete: channelsComplete,
    });
  });
  const pending = deliveries.filter(item => !item.reached).map(item => item.nickname);
  const partial = deliveries.filter(item => item.reached && !item.channelsComplete).map(item => item.nickname);
  const newlyReached = deliveries.filter(item => item.lineSent || item.appSent).map(item => item.nickname);
  const allReached = deliveries.length > 0 && pending.length === 0;
  if (allReached) props.setProperty('SENTPDF_' + log_id, version);
  const notification = {
    recipientCount: deliveries.length,
    reachedCount: deliveries.filter(item => item.reached).length,
    allReached: allReached,
    allChannelsReached: deliveries.length > 0 && deliveries.every(item => item.channelsComplete),
    pending: pending,
    partial: partial,
    deliveries: deliveries,
  };
  logSystem('system', 'pdf_person', log_id, { sent: newlyReached, notification: notification });
  return { ok: true, url: r.url, sent: newlyReached, notification: notification };
}

/** API：手動生成＋推播給所有 admin（?action=sendDailyKpiPdf&operator=柏翰&date=…） */
function sendDailyKpiPdf(params) {
  const u = params.operator ? findUserByNickname(params.operator) : null;
  if (!u || u.role !== 'admin') return { ok: false, error: '僅限管理員操作' };
  const dateStr = params.date ? String(params.date) : todayStr();
  const r = generateDailyKpiPdf_(dateStr);
  const msg = kpiPdfMsg_(dateStr, r);
  bossUsers_().forEach(a => {
    if (a.line_user_id) pushLine_(a.line_user_id, msg);
    pushOneSignal_(a.nickname, '📄 KPI 日報 ' + dateStr, '已提交 ' + r.summary.submitted + '/' + r.summary.total + '，點開看完整報告');
  });
  logSystem(params.operator, 'kpi_pdf', dateStr, r.summary);
  return { ok: true, url: r.url, summary: r.summary };
}

/** 觸發器用（每天 21:30 自動發當日報告給老闆） */
function sendDailyKpiReportAuto() {
  const dateStr = todayStr();
  const r = generateDailyKpiPdf_(dateStr);
  const msg = kpiPdfMsg_(dateStr, r);
  bossUsers_().forEach(a => {
    if (a.line_user_id) pushLine_(a.line_user_id, msg);
    pushOneSignal_(a.nickname, '📄 KPI 日報 ' + dateStr, '已提交 ' + r.summary.submitted + '/' + r.summary.total + '，點開看完整報告');
  });
  logSystem('system', 'kpi_pdf_auto', dateStr, r.summary);
}

/** 一次性：編輯器執行，建立每天 21:30 的日報觸發器 */
function setupKpiReportTrigger() {
  ScriptApp.getProjectTriggers().forEach(t => {
    if (t.getHandlerFunction() === 'sendDailyKpiReportAuto') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('sendDailyKpiReportAuto').timeBased().everyDays(1).atHour(21).nearMinute(30).create();
  return { ok: true, msg: '已建立：每天 21:30 自動發 KPI 日報 PDF 給老闆' };
}

/** LINE 指令：kpi / kpi昨天 / kpi 2026-07-08（限 admin） */
function handleKpiLineCommand_(lineUserId, text) {
  const users = sheetToObjects(SHEET_NAMES.USERS);
  const me = users.filter(x => x.line_user_id === lineUserId)[0];
  if (!me || me.role !== 'admin') return '此指令僅限老闆使用 🙏';
  let dateStr = todayStr();
  const dm = text.match(/(\d{4}-\d{2}-\d{2})/);
  if (dm) dateStr = dm[1];
  else if (text.indexOf('昨') >= 0) dateStr = addDaysStr_(todayStr(), -1);
  const r = generateDailyKpiPdf_(dateStr);
  return kpiPdfMsg_(dateStr, r);
}

// ════════════════════════════════════════════════════════════
//  courseprep.gs
// ════════════════════════════════════════════════════════════

/**
 * 安親 V2 備課教案建檔。
 * 教材原檔存放在 Drive；此表只保存可跨裝置還原的備課、教案與檔案連結。
 */

function ensureCoursePrepSheet_() {
  const ss = getSS();
  let sheet = ss.getSheetByName(SHEET_NAMES.COURSE_PREP);
  if (!sheet) sheet = ss.insertSheet(SHEET_NAMES.COURSE_PREP);
  ensureHeaders(sheet, [
    'prep_id', 'nickname', 'department', 'title', 'course_type',
    'created_date', 'status', 'data_json', 'created_at', 'updated_at'
  ]);
  return sheet;
}

function coursePrepPayload_(value) {
  const snapshot = JSON.parse(JSON.stringify(value || {}));
  function stripInlineMedia(item) {
    if (!item || typeof item !== 'object') return;
    if (Array.isArray(item)) {
      item.forEach(stripInlineMedia);
      return;
    }
    Object.keys(item).forEach(key => {
      if (key === 'dataUrl') item[key] = '';
      else stripInlineMedia(item[key]);
    });
  }
  stripInlineMedia(snapshot);
  return snapshot;
}

function saveCoursePrep(params) {
  const nickname = String(params.nickname || '').trim();
  const user = nickname ? findUserByNickname(nickname) : null;
  if (!user || user.status !== 'active' || !['teacher', 'manager'].includes(user.role)) {
    return { ok: false, error: '無備課建檔權限' };
  }
  const prep = coursePrepPayload_(params.prep);
  const plan = params.plan ? coursePrepPayload_(params.plan) : null;
  if (!prep.id || prep.type !== 'lessonprep' || !String(prep.title || '').trim()) {
    return { ok: false, error: '備課檔案資料不完整' };
  }
  const prepFiles = Array.isArray(prep.prepEvidence) ? prep.prepEvidence : [];
  const planFiles = plan && Array.isArray(plan.materials) ? plan.materials : [];
  const hasArchivedMaterial = prepFiles.concat(planFiles).some(function (item) {
    return /^https:\/\/drive\.google\.com\//i.test(String(item && (item.cloudUrl || item.url) || ''));
  });
  if (!hasArchivedMaterial) return { ok: false, error: '請至少上傳一份教案或教材資料' };
  const now = nowIso();
  ensureCoursePrepSheet_();
  const dataJson = JSON.stringify({ schema: 'anqin-course-prep-v1', prep: prep, plan: plan });
  if (dataJson.length > 45000) return { ok: false, error: '備課內容過大，請移除內嵌圖片後再試' };
  const normalizedTitle = String(prep.title || '').trim().replace(/\s+/g, ' ').toLowerCase();
  const normalizedCourseType = String(prep.details && prep.details.targetCourse || '').trim().replace(/\s+/g, ' ').toLowerCase();
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) return { ok: false, error: '系統正在儲存其他備課檔案，請稍後再試' };
  try {
    const existing = findObject(SHEET_NAMES.COURSE_PREP, 'prep_id', prep.id);
    if (existing && existing.nickname !== nickname && user.role !== 'admin') {
      return { ok: false, error: '不可覆蓋其他老師的備課檔案' };
    }
    const duplicate = sheetToObjects(SHEET_NAMES.COURSE_PREP).some(function (row) {
      return row.nickname === nickname
        && String(row.prep_id || '') !== String(prep.id)
        && String(row.title || '').trim().replace(/\s+/g, ' ').toLowerCase() === normalizedTitle
        && String(row.course_type || '').trim().replace(/\s+/g, ' ').toLowerCase() === normalizedCourseType;
    });
    if (duplicate) return { ok: false, error: '已有相同課程類型與名稱的備課檔案，請直接編輯原檔案' };
    upsertRow(SHEET_NAMES.COURSE_PREP, 'prep_id', {
      prep_id: prep.id,
      nickname: nickname,
      department: normalizeDepartment_(user.department),
      title: String(prep.title || '').trim(),
      course_type: String(prep.details && prep.details.targetCourse || ''),
      created_date: String(prep.date || todayStr()).slice(0, 10),
      status: String(prep.status || 'draft'),
      data_json: dataJson,
      created_at: existing ? existing.created_at : now,
      updated_at: now,
    });
  } finally {
    lock.releaseLock();
  }
  logSystem(nickname, 'save_course_prep', prep.id, { status: prep.status || 'draft' });
  return { ok: true, prep_id: prep.id, updated_at: now };
}

function listCoursePreps(params) {
  const viewer = String(params.viewer || '').trim();
  const viewerUser = viewer ? findUserByNickname(viewer) : null;
  if (!viewerUser || viewerUser.status !== 'active') return { ok: false, error: '無讀取權限' };
  ensureCoursePrepSheet_();
  let rows = sheetToObjects(SHEET_NAMES.COURSE_PREP);
  if (viewerUser.role === 'teacher' || viewerUser.role === 'admin_staff') {
    rows = rows.filter(row => row.nickname === viewer);
  } else if (viewerUser.role === 'manager' && !isGlobalManager_(viewerUser)) {
    rows = rows.filter(row => sameDepartment_(row.department, viewerUser.department) || row.nickname === viewer);
  }
  if (params.nickname) rows = rows.filter(row => row.nickname === String(params.nickname));
  rows.sort((a, b) => String(b.updated_at || '').localeCompare(String(a.updated_at || '')));
  const records = rows.map(row => {
    const data = parseJsonField(row.data_json) || {};
    return {
      prepId: row.prep_id,
      nickname: row.nickname,
      department: row.department,
      updatedAt: row.updated_at,
      prep: data.prep || null,
      plan: data.plan || null,
    };
  }).filter(record => record.prep && record.prep.id);
  return { ok: true, records: records };
}

function deleteCoursePrep(params) {
  const operator = String(params.operator || '').trim();
  const user = operator ? findUserByNickname(operator) : null;
  if (!user || user.status !== 'active') return { ok: false, error: '無刪除權限' };
  ensureCoursePrepSheet_();
  const existing = findObject(SHEET_NAMES.COURSE_PREP, 'prep_id', params.prep_id);
  if (!existing) return { ok: true, removed: false };
  if (user.role !== 'admin' && existing.nickname !== operator) return { ok: false, error: '不可刪除其他老師的備課檔案' };
  const normalizeName = function (value) {
    return String(value || '').trim().replace(/\s+/g, '').replace(/(?:老師|主管)$/, '').toLowerCase();
  };
  if (normalizeName(params.confirmation_name) !== normalizeName(existing.nickname)) {
    return { ok: false, error: '姓名確認不正確，未刪除備課檔案' };
  }
  deleteRow(SHEET_NAMES.COURSE_PREP, existing._row);
  logSystem(operator, 'delete_course_prep', params.prep_id, {});
  return { ok: true, removed: true };
}

// ════════════════════════════════════════════════════════════
//  talentrecords.gs
// ════════════════════════════════════════════════════════════

/**
 * 才藝 V2 正式資料層。
 * 一張 TalentRecords 以 record_type 分流課堂、備課、評分、對話與草稿；
 * 所有權限、PT 當日限制與鐘點計算都由後端重算，不能只信任前端。
 */

const TALENT_EFFECTIVE_DATE_ = '2026-09-01';

function ensureTalentRecordsSheet_() {
  const ss = getSS();
  let sheet = ss.getSheetByName(SHEET_NAMES.TALENT_RECORDS);
  if (!sheet) sheet = ss.insertSheet(SHEET_NAMES.TALENT_RECORDS);
  ensureHeaders(sheet, [
    'record_id', 'record_type', 'nickname', 'department', 'record_date',
    'year_month', 'status', 'data_json', 'created_by', 'updated_by',
    'created_at', 'updated_at', 'submitted_at'
  ]);
  return sheet;
}

function normalizeTalentNickname_(value) {
  return String(value || '').trim().replace(/\s+/g, '').replace(/(?:老師|主管)$/, '').toLowerCase();
}

function findTalentUser_(nickname) {
  const exact = findUserByNickname(String(nickname || '').trim());
  if (exact) return exact;
  const normalized = normalizeTalentNickname_(nickname);
  return sheetToObjects(SHEET_NAMES.USERS).find(function (user) {
    return normalizeTalentNickname_(user.nickname) === normalized;
  }) || null;
}

function talentAssignments_(user) {
  const explicit = parseUserListField_(user && user.work_assignments);
  if (explicit.length) return explicit;
  if (!user) return [];
  const department = normalizeDepartment_(user.department);
  if (user.role === 'admin') return ['anqin-manager', 'talent-payroll'];
  if (department === '才藝部門') {
    if (user.role === 'manager') return ['talent-manager'];
    return [String(user.employment_type || '').toLowerCase() === 'pt' ? 'talent-pt' : 'talent-fulltime'];
  }
  if (['東橋教室', '北區教室'].indexOf(department) >= 0) {
    return [user.role === 'manager' ? 'anqin-manager' : 'anqin-teacher'];
  }
  return [];
}

function userHasTalentWork_(user) {
  return talentAssignments_(user).some(function (assignment) {
    return ['talent-fulltime', 'talent-pt', 'talent-manager', 'talent-payroll'].indexOf(assignment) >= 0;
  });
}

function talentEmployment_(user) {
  const explicit = String(user && user.employment_type || '').toLowerCase();
  if (explicit) return explicit;
  const assignments = talentAssignments_(user);
  if (assignments.indexOf('talent-pt') >= 0) return 'pt';
  if (assignments.indexOf('talent-fulltime') >= 0) return 'fulltime';
  if (assignments.indexOf('talent-manager') >= 0) return 'manager';
  return user && user.role === 'admin' ? 'admin' : '';
}

function talentManagerCanReview_(actor) {
  return !!actor && actor.status === 'active' && (
    actor.role === 'admin' || talentAssignments_(actor).indexOf('talent-manager') >= 0
  );
}

function talentCanAccessUser_(actor, target) {
  if (!actor || !target || actor.status !== 'active' || target.status !== 'active') return false;
  if (actor.role === 'admin' || isGlobalManager_(actor) || actor.nickname === target.nickname) return true;
  if (talentAssignments_(actor).indexOf('talent-manager') >= 0 && userHasTalentWork_(target)) return true;
  return actor.role === 'manager' && sameDepartment_(actor.department, target.department);
}

function talentCanAccessHistoricalUser_(actor, target) {
  if (!actor || !target || actor.status !== 'active' || ['suspended', 'deleted'].indexOf(target.status) < 0) return false;
  if (actor.role === 'admin' || isGlobalManager_(actor)) return true;
  if (talentAssignments_(actor).indexOf('talent-manager') >= 0 && userHasTalentWork_(target)) return true;
  return actor.role === 'manager' && sameDepartment_(actor.department, target.department);
}

function talentCanAccessPendingUser_(actor, target) {
  if (!actor || !target || actor.status !== 'active' || target.status !== 'pending') return false;
  if (actor.role === 'admin' || isGlobalManager_(actor)) return true;
  if (talentAssignments_(actor).indexOf('talent-manager') >= 0 && userHasTalentWork_(target)) return true;
  return actor.role === 'manager' && sameDepartment_(actor.department, target.department);
}

function talentPublicUser_(user) {
  return {
    nickname: String(user.nickname || ''),
    role: String(user.role || ''),
    department: normalizeDepartment_(user.department),
    status: String(user.status || ''),
    deleted_at: user.deleted_at || '',
    employment_type: talentEmployment_(user),
    work_assignments: talentAssignments_(user),
    schedule_json: normalizeUserSchedule_(user.schedule_json),
    rest_days: normalizeRestDays_(user.rest_days),
  };
}

function talentSchedulesForDate_(user, date) {
  const weekday = new Date(String(date || '') + 'T12:00:00+08:00').getDay();
  return normalizeUserSchedule_(user && user.schedule_json).filter(function (item) {
    return Number(item.weekday) === weekday;
  });
}

function talentPayload_(value) {
  let snapshot;
  try { snapshot = JSON.parse(JSON.stringify(value || {})); }
  catch (error) { throw new Error('才藝資料格式不正確'); }
  function clean(item) {
    if (!item || typeof item !== 'object') return;
    if (Array.isArray(item)) {
      item.forEach(clean);
      return;
    }
    Object.keys(item).forEach(function (key) {
      if (key === 'dataUrl' || key === 'base64' || key === 'file') delete item[key];
      else clean(item[key]);
    });
  }
  clean(snapshot);
  return snapshot;
}

function talentAttachments_(items, required) {
  const list = Array.isArray(items) ? items.slice(0, 30) : [];
  const cleaned = list.map(function (item) {
    if (typeof item === 'string') return { fileName: item, url: '', fileId: '', mimeType: '' };
    const rawUrl = String(item.url || item.cloudUrl || '').slice(0, 500);
    const safeUrl = /^https:\/\/drive\.google\.com\//i.test(rawUrl) ? rawUrl : '';
    return {
      id: String(item.id || item.fileId || Utilities.getUuid()),
      fileName: String(item.fileName || item.name || '附件').slice(0, 160),
      url: safeUrl,
      fileId: String(item.fileId || '').slice(0, 160),
      mimeType: String(item.mimeType || item.type || '').slice(0, 120),
      category: String(item.category || '').slice(0, 80),
      fingerprint: String(item.fingerprint || '').slice(0, 160),
      size: Number(item.size || 0),
    };
  });
  if (required && (!cleaned.length || cleaned.some(function (item) { return !item.url; }))) {
    throw new Error('必填附件尚未完整上傳到雲端');
  }
  return cleaned;
}

function talentAppEvidence_(items, required) {
  const files = talentAttachments_(items, required);
  if (files.some(function (item) {
    return !/^image\//i.test(String(item.mimeType || '')) && !/\.(?:jpe?g|png|webp|gif|heic|heif)$/i.test(String(item.fileName || ''));
  })) {
    throw new Error('家長 APP 發布證據只接受圖片');
  }
  return files;
}

function talentRecordObject_(row) {
  const data = parseJsonField(row.data_json) || {};
  data.id = data.id || row.record_id;
  data.teacher = data.teacher || row.nickname;
  data.date = data.date || row.record_date;
  data.status = row.status || data.status;
  data.createdAt = data.createdAt || row.created_at;
  data.updatedAt = row.updated_at || data.updatedAt;
  return data;
}

function upsertTalentRecord_(type, nickname, data, actorNickname) {
  ensureTalentRecordsSheet_();
  const recordId = String(data.id || '').trim();
  if (!recordId) throw new Error('缺少才藝紀錄編號');
  const existing = findObject(SHEET_NAMES.TALENT_RECORDS, 'record_id', recordId);
  if (existing && (existing.record_type !== type || existing.nickname !== nickname)) {
    throw new Error('不可覆蓋其他人的才藝資料');
  }
  const now = nowIso();
  const user = findUserByNickname(nickname);
  const payload = talentPayload_(data);
  const json = JSON.stringify(payload);
  if (json.length > 45000) throw new Error('資料內容過大，請確認附件已改存雲端連結');
  upsertRow(SHEET_NAMES.TALENT_RECORDS, 'record_id', {
    record_id: recordId,
    record_type: type,
    nickname: nickname,
    department: normalizeDepartment_(user && user.department),
    record_date: String(data.date || '').slice(0, 10),
    year_month: String(data.month || data.date || '').slice(0, 7),
    status: String(data.status || 'draft'),
    data_json: json,
    created_by: existing ? existing.created_by : actorNickname,
    updated_by: actorNickname,
    created_at: existing ? existing.created_at : now,
    updated_at: now,
    submitted_at: data.status === 'submitted' ? (existing && existing.submitted_at || now) : (existing && existing.submitted_at || ''),
  });
  payload.updatedAt = now;
  if (!payload.createdAt) payload.createdAt = existing ? existing.created_at : now;
  return payload;
}

function removeTalentRecord_(recordId, nickname) {
  ensureTalentRecordsSheet_();
  const existing = findObject(SHEET_NAMES.TALENT_RECORDS, 'record_id', recordId);
  if (existing && (!nickname || existing.nickname === nickname)) deleteRow(SHEET_NAMES.TALENT_RECORDS, existing._row);
}

function getTalentWorkspaceData(params) {
  const actor = params.__actor || findUserByNickname(String(params.viewer || ''));
  if (!actor || actor.status !== 'active' || !userHasTalentWork_(actor)) {
    return { ok: false, error: '此帳號沒有才藝工作區權限' };
  }
  ensureTalentRecordsSheet_();
  const allUsers = sheetToObjects(SHEET_NAMES.USERS);
  const users = allUsers.filter(function (user) {
    return user.status === 'active' && userHasTalentWork_(user) && talentCanAccessUser_(actor, user);
  });
  const historicalUsers = allUsers.filter(function (user) {
    return userHasTalentWork_(user) && talentCanAccessHistoricalUser_(actor, user);
  });
  const pendingUsers = allUsers.filter(function (user) {
    return userHasTalentWork_(user) && talentCanAccessPendingUser_(actor, user);
  });
  const allowed = {};
  users.forEach(function (user) { allowed[user.nickname] = true; });
  historicalUsers.forEach(function (user) { allowed[user.nickname] = true; });
  const rows = sheetToObjects(SHEET_NAMES.TALENT_RECORDS).filter(function (row) { return allowed[row.nickname]; });
  const lessons = [];
  const preps = [];
  const scores = [];
  const conversations = [];
  let draft = null;
  rows.forEach(function (row) {
    const record = talentRecordObject_(row);
    if (row.record_type === 'lesson') lessons.push(record);
    else if (row.record_type === 'prep') preps.push(record);
    else if (row.record_type === 'score') scores.push(record);
    else if (row.record_type === 'conversation') conversations.push(record);
    else if (row.record_type === 'lesson_draft' && row.nickname === actor.nickname) draft = record.draft || null;
  });
  if (actor.role !== 'admin' && actor.role !== 'manager') {
    const publishedMonths = {};
    for (let index = scores.length - 1; index >= 0; index -= 1) {
      if (scores[index].published === true || scores[index].status === 'published') {
        publishedMonths[scores[index].month] = true;
        delete scores[index].history;
      }
      else scores.splice(index, 1);
    }
    for (let index = conversations.length - 1; index >= 0; index -= 1) {
      if (!publishedMonths[conversations[index].month]) conversations.splice(index, 1);
    }
  }
  lessons.sort(function (a, b) { return String(b.date || '').localeCompare(String(a.date || '')); });
  preps.sort(function (a, b) { return String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')); });
  return {
    ok: true,
    lessons: lessons,
    preps: preps,
    scores: scores,
    conversations: conversations,
    draft: draft,
    users: users.map(talentPublicUser_),
    pending_users: pendingUsers.map(talentPublicUser_),
    archived_users: historicalUsers.map(talentPublicUser_),
    settings: {
      ptStrictStart: (function () {
        const configured = PropertiesService.getScriptProperties().getProperty('TALENT_PT_STRICT_START') || TALENT_EFFECTIVE_DATE_;
        return configured > TALENT_EFFECTIVE_DATE_ ? configured : TALENT_EFFECTIVE_DATE_;
      })()
    }
  };
}

function talentLessonPay_(lesson, user) {
  if (lesson.lessonStatus === 'cancelled' || talentEmployment_(user) !== 'pt') {
    return { count: 0, rate: 0, amount: 0, tier: lesson.lessonStatus === 'cancelled' ? '停課' : '不適用', requiresReview: false };
  }
  const duration = Number(lesson.duration || 0);
  const count = Number(lesson.present || 0) + Number(lesson.makeup || 0);
  const isPartner = String(lesson.siteType || '') === 'partner';
  if (isPartner) return { count: count, rate: 600, amount: 900, tier: '合作校固定 1.5 小時', requiresReview: false };
  if (count < 2) return { count: count, rate: 0, amount: 0, tier: '低於開班人數', requiresReview: true };
  if (count <= 4) return { count: count, rate: 500, amount: Math.round(500 * duration), tier: '2-4 人', requiresReview: false };
  if (count <= 7) return { count: count, rate: 600, amount: Math.round(600 * duration), tier: '5-7 人', requiresReview: false };
  if (count <= 10) return { count: count, rate: 800, amount: Math.round(800 * duration), tier: '8-10 人', requiresReview: false };
  return { count: count, rate: 0, amount: 0, tier: '超過 10 人待主管確認', requiresReview: true };
}

function saveTalentDraft(params) {
  const actor = params.__actor;
  const nickname = String(params.nickname || actor && actor.nickname || '').trim();
  const user = findUserByNickname(nickname);
  if (!actor || !user || (!talentCanAccessUser_(actor, user)) || (actor.role !== 'admin' && actor.nickname !== nickname)) {
    return { ok: false, error: '無草稿儲存權限' };
  }
  const recordId = 'talent-lesson-draft-' + nickname;
  if (!params.draft) {
    removeTalentRecord_(recordId, nickname);
    return { ok: true, cleared: true };
  }
  const item = { id: recordId, teacher: nickname, date: String(params.draft.date || todayStr()).slice(0, 10), draft: talentPayload_(params.draft), status: 'draft' };
  const saved = upsertTalentRecord_('lesson_draft', nickname, item, actor.nickname);
  return { ok: true, draft: saved.draft, updatedAt: saved.updatedAt };
}

function validateTalentLessonRequiredFields_(lesson) {
  const labels = {
    courseType: '課程類型',
    courseName: '課程名稱',
    siteType: '上課場域',
    site: '上課地點',
    prepId: '本堂使用的備課檔案',
    issue: '課程問題及下次優化',
    parentStatus: '親師溝通狀態',
  };
  const missing = Object.keys(labels).filter(function (key) {
    return !String(lesson[key] || '').trim();
  });
  if (missing.length) {
    throw new Error('請完成：' + missing.map(function (key) { return labels[key]; }).join('、'));
  }
}

function saveTalentLesson(params) {
  const actor = params.__actor;
  const nickname = String(params.nickname || actor && actor.nickname || '').trim();
  const user = findUserByNickname(nickname);
  if (!actor || !user || !userHasTalentWork_(user) || (actor.role !== 'admin' && actor.nickname !== nickname)) {
    return { ok: false, error: '無課堂紀錄權限' };
  }
  const lesson = talentPayload_(params.lesson);
  if (!lesson.id) return { ok: false, error: '課堂紀錄編號遺失' };
  lesson.teacher = nickname;
  lesson.employment = talentEmployment_(user);
  lesson.date = String(lesson.date || '').slice(0, 10);
  lesson.lessonStatus = lesson.lessonStatus === 'cancelled' ? 'cancelled' : 'held';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(lesson.date) || lesson.date > todayStr()) return { ok: false, error: '課程日期不正確' };
  const employment = talentEmployment_(user);
  const userSchedules = employment === 'pt' ? normalizeUserSchedule_(user.schedule_json) : [];
  const dateSchedules = employment === 'pt' ? talentSchedulesForDate_(user, lesson.date) : [];
  let matchedSchedule = null;
  if (employment === 'pt') {
    if (!userSchedules.length) return { ok: false, error: '此 PT 帳號尚未設定固定排班，請先聯絡管理員' };
    const requestedScheduleKey = String(lesson.scheduleKey || '').trim();
    matchedSchedule = dateSchedules.filter(function (item) { return item.scheduleKey === requestedScheduleKey; })[0] || null;
    if (!matchedSchedule && !requestedScheduleKey && dateSchedules.length === 1) matchedSchedule = dateSchedules[0];
    if (!matchedSchedule) return { ok: false, error: '請選擇該日期原本安排的固定班次' };
    lesson.scheduleKey = matchedSchedule.scheduleKey;
    lesson.scheduleLabel = matchedSchedule.label;
    lesson.scheduleTime = matchedSchedule.time;
    lesson.siteType = matchedSchedule.siteType;
    lesson.site = matchedSchedule.site;
  }
  const initialExisting = findObject(SHEET_NAMES.TALENT_RECORDS, 'record_id', lesson.id);
  const initialLesson = initialExisting && initialExisting.record_type === 'lesson' && initialExisting.nickname === nickname
    ? talentRecordObject_(initialExisting) : null;
  ['reportUrl', 'reportFileId', 'reportFolderUrl', 'reportGeneratedAt', 'reportRevision'].forEach(function (key) {
    lesson[key] = initialLesson ? initialLesson[key] || '' : '';
  });
  if (initialLesson && initialLesson.createdAt) lesson.createdAt = initialLesson.createdAt;
  if (!initialExisting && lesson.lessonStatus === 'held' && lesson.date !== todayStr()) {
    return { ok: false, error: lesson.employment === 'pt' ? 'PT 正常課程只能在上課當日送出' : '正常課程請於上課當日送出' };
  }
  if (initialLesson && initialExisting.status === 'submitted') {
    if (String(initialLesson.date || '') !== todayStr()) return { ok: false, error: '已跨日的正式課堂不可修改' };
    if (String(initialLesson.date || '') !== lesson.date || initialLesson.lessonStatus !== lesson.lessonStatus) {
      return { ok: false, error: '補充紀錄時不可更換日期或上課狀態' };
    }
    if (employment === 'pt' && String(initialLesson.scheduleKey || '') && initialLesson.scheduleKey !== lesson.scheduleKey) {
      return { ok: false, error: '補充紀錄時不可更換原班次' };
    }
  }
  if (lesson.lessonStatus === 'cancelled') {
    if (lesson.employment !== 'pt') return { ok: false, error: '目前停課補登只適用才藝 PT 排課' };
    if (!String(lesson.courseName || '').trim() || !String(lesson.cancellationReason || '').trim()) return { ok: false, error: '請填寫停課課程與原因' };
    lesson.duration = 0;
    lesson.expected = lesson.present = lesson.leave = lesson.absent = lesson.makeup = lesson.trial = 0;
    lesson.attendanceFiles = [];
    lesson.learningFiles = [];
    lesson.roomFiles = [];
    lesson.newCount = 0;
    lesson.renewalCount = 0;
    lesson.pay = 0;
    lesson.payRate = 0;
    lesson.payTier = '停課';
    lesson.appStatus = 'not_required';
    lesson.appFiles = [];
    lesson.appUpdatedAt = '';
    lesson.appPublishedAt = '';
    lesson.backfilled = lesson.date !== todayStr();
  } else {
    validateTalentLessonRequiredFields_(lesson);
    ['expected', 'present', 'leave', 'absent', 'makeup', 'trial'].forEach(function (key) {
      lesson[key] = Math.max(0, Math.floor(Number(lesson[key] || 0)));
    });
    if (lesson.expected !== lesson.present + lesson.leave + lesson.absent) throw new Error('應到正式人數必須等於正式實到、請假與未請假缺席合計');
    lesson.duration = Number(lesson.duration || 0);
    if (lesson.siteType === 'partner') lesson.duration = 1.5;
    if ([1, 1.5].indexOf(lesson.duration) < 0) throw new Error('授課時數只可選 1 或 1.5 小時');
    const prepRow = findObject(SHEET_NAMES.TALENT_RECORDS, 'record_id', String(lesson.prepId || ''));
    if (!prepRow || prepRow.record_type !== 'prep' || prepRow.nickname !== nickname) {
      throw new Error('請選擇本人的備課檔案');
    }
    const selectedPrep = talentRecordObject_(prepRow);
    talentAttachments_(selectedPrep.materials, true);
    lesson.courseType = String(selectedPrep.courseType || '').trim();
    lesson.courseName = String(selectedPrep.courseName || selectedPrep.title || '').trim();
    if (!lesson.courseType || !lesson.courseName) throw new Error('所選備課檔案缺少課程資料，請先更新備課檔案');
    lesson.attendanceFiles = talentAttachments_(lesson.attendanceFiles, true);
    lesson.learningFiles = talentAttachments_(lesson.learningFiles, true);
    lesson.roomFiles = talentAttachments_(lesson.roomFiles, true);
    lesson.roomDone = lesson.roomFiles.length > 0;
    if (!lesson.roomDone) throw new Error('請上傳課後教室復原照片');
    if (['complete', 'followup'].indexOf(lesson.parentStatus) < 0) throw new Error('請選擇親師溝通狀態');
    if (lesson.parentStatus === 'followup' && !String(lesson.parentFollowup || '').trim()) throw new Error('請填寫個別追蹤與下一步');
    if (lesson.parentStatus !== 'followup') lesson.parentFollowup = '';
    lesson.newCount = lesson.siteType === 'self' && lesson.employment === 'fulltime' ? Math.max(0, Math.floor(Number(lesson.newCount || 0))) : 0;
    lesson.renewalCount = lesson.siteType === 'self' ? Math.max(0, Math.floor(Number(lesson.renewalCount || 0))) : 0;
    const pay = talentLessonPay_(lesson, user);
    lesson.pay = pay.amount;
    lesson.payRate = pay.rate;
    lesson.payTier = pay.tier;
    lesson.payRequiresReview = pay.requiresReview;
    if (lesson.siteType === 'partner') {
      lesson.appStatus = 'not_required';
      lesson.appFiles = [];
      lesson.appUpdatedAt = '';
      lesson.appPublishedAt = '';
    } else {
      lesson.appFiles = talentAppEvidence_(initialLesson && initialLesson.appFiles || lesson.appFiles || [], false);
      lesson.appStatus = lesson.appFiles.length ? 'published' : 'pending';
      lesson.appUpdatedAt = initialLesson && initialLesson.appUpdatedAt || lesson.appUpdatedAt || '';
      lesson.appPublishedAt = initialLesson && initialLesson.appPublishedAt || lesson.appPublishedAt || '';
    }
    lesson.backfilled = false;
    const bonusCountsChanged = initialLesson && (
      Number(initialLesson.newCount || 0) !== lesson.newCount || Number(initialLesson.renewalCount || 0) !== lesson.renewalCount
    );
    if (bonusCountsChanged) {
      lesson.bonusApproval = (lesson.newCount || lesson.renewalCount) ? 'pending' : 'not_required';
      lesson.approvedNewCount = 0;
      lesson.approvedRenewalCount = 0;
      lesson.bonusApprovedBy = '';
      lesson.bonusApprovedAt = '';
      lesson.bonusApprovalNote = '';
    } else if (!lesson.bonusApproval) {
      lesson.bonusApproval = (lesson.newCount || lesson.renewalCount) ? 'pending' : 'not_required';
    }
  }
  lesson.status = 'submitted';
  lesson.contentRevision = nowIso();
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) return { ok: false, error: '系統正在儲存另一筆紀錄，請稍後再送出' };
  let saved;
  try {
    const existing = findObject(SHEET_NAMES.TALENT_RECORDS, 'record_id', lesson.id);
    if (existing && existing.record_type === 'lesson' && existing.nickname === nickname && existing.status === 'submitted') {
      if (!String(lesson.updatedAt || '').trim()) return { ok: true, lesson: talentRecordObject_(existing), duplicate: true };
      if (String(lesson.updatedAt) !== String(existing.updated_at || '')) {
        return { ok: false, error: '這筆紀錄已在其他裝置更新，請重新整理後再補充' };
      }
    }
    if (!existing && employment === 'pt') {
      const firstScheduleKey = dateSchedules.length ? dateSchedules[0].scheduleKey : '';
      const duplicate = sheetToObjects(SHEET_NAMES.TALENT_RECORDS).some(function (row) {
        if (row.record_type !== 'lesson' || row.nickname !== nickname || String(row.record_date || '') !== lesson.date || row.status !== 'submitted') return false;
        const recorded = talentRecordObject_(row);
        return recorded.scheduleKey ? recorded.scheduleKey === lesson.scheduleKey : firstScheduleKey === lesson.scheduleKey;
      });
      if (duplicate) return { ok: false, error: '這個日期與班次已有送出紀錄，不能重複申報' };
    }
    saved = upsertTalentRecord_('lesson', nickname, lesson, actor.nickname);
    removeTalentRecord_('talent-lesson-draft-' + nickname, nickname);
  } finally {
    lock.releaseLock();
  }
  let pdf = null;
  let warning = '';
  try {
    pdf = generateTalentLessonPdf_(saved, user);
    if (pdf && pdf.url) {
      const pdfLock = LockService.getScriptLock();
      if (!pdfLock.tryLock(10000)) throw new Error('日報檔案已建立，但連結正在等候系統回寫');
      try {
        const latestRow = findObject(SHEET_NAMES.TALENT_RECORDS, 'record_id', lesson.id);
        if (!latestRow || latestRow.record_type !== 'lesson' || latestRow.nickname !== nickname) throw new Error('找不到剛儲存的課堂紀錄');
        const latest = talentRecordObject_(latestRow);
        latest.reportUrl = pdf.url;
        latest.reportFileId = pdf.fileId;
        latest.reportFolderUrl = pdf.folderUrl || latest.reportFolderUrl || '';
        latest.reportGeneratedAt = nowIso();
        latest.reportRevision = saved.contentRevision;
        const persisted = upsertTalentRecord_('lesson', nickname, latest, actor.nickname);
        saved = persisted;
        if (String(persisted.contentRevision || '') !== String(persisted.reportRevision || '')) {
          warning = '課堂內容已在另一台裝置更新；文字已保留，PDF 將由系統自動補成最新版本。';
        }
      } finally {
        pdfLock.releaseLock();
      }
      notifyTalentLesson_(saved, user, pdf.url);
    }
  } catch (error) {
    warning = '課堂紀錄已儲存，但 PDF／通知稍後需重試：' + String(error.message || error);
  }
  logSystem(nickname, 'save_talent_lesson', lesson.id, { date: lesson.date, status: lesson.lessonStatus });
  return { ok: true, lesson: saved, reportUrl: saved && saved.reportUrl || '', warning: warning };
}

function saveTalentPrep(params) {
  const actor = params.__actor;
  const nickname = String(params.nickname || actor && actor.nickname || '').trim();
  const user = findUserByNickname(nickname);
  if (!actor || !user || !userHasTalentWork_(user) || (actor.role !== 'admin' && actor.nickname !== nickname)) {
    return { ok: false, error: '無備課建檔權限' };
  }
  const prep = talentPayload_(params.prep);
  if (!prep.id || !String(prep.courseType || '').trim() || !String(prep.courseName || '').trim()) {
    return { ok: false, error: '請完成課程類型與課程名稱' };
  }
  prep.teacher = nickname;
  prep.title = String(prep.title || prep.courseName).trim();
  prep.status = 'ready';
  prep.date = String(prep.date || todayStr()).slice(0, 10);
  prep.materials = talentAttachments_(prep.materials, true);
  if (!prep.materials.length) return { ok: false, error: '請至少上傳一份教案或教材資料' };
  const normalizedTitle = String(prep.courseName || '').trim().replace(/\s+/g, ' ').toLowerCase();
  const normalizedCourseType = String(prep.courseType || '').trim().replace(/\s+/g, ' ').toLowerCase();
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) return { ok: false, error: '系統正在儲存其他備課檔案，請稍後再試' };
  let saved;
  try {
    const duplicate = sheetToObjects(SHEET_NAMES.TALENT_RECORDS).some(function (row) {
      if (row.record_type !== 'prep' || row.nickname !== nickname || String(row.record_id || '') === String(prep.id)) return false;
      const recorded = talentRecordObject_(row);
      return String(recorded.courseName || recorded.title || '').trim().replace(/\s+/g, ' ').toLowerCase() === normalizedTitle
        && String(recorded.courseType || '').trim().replace(/\s+/g, ' ').toLowerCase() === normalizedCourseType;
    });
    if (duplicate) return { ok: false, error: '已有相同課程類型與名稱的備課檔案，請直接編輯原檔案' };
    saved = upsertTalentRecord_('prep', nickname, prep, actor.nickname);
  } finally {
    lock.releaseLock();
  }
  logSystem(nickname, 'save_talent_prep', prep.id, { status: prep.status });
  return { ok: true, prep: saved };
}

function deleteTalentPrep(params) {
  const actor = params.__actor;
  const prepId = String(params.prep_id || '').trim();
  if (!actor || actor.status !== 'active' || !prepId) return { ok: false, error: '無備課檔案刪除權限' };
  ensureTalentRecordsSheet_();
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) return { ok: false, error: '系統正在處理其他備課檔案，請稍後再試' };
  try {
    const existing = findObject(SHEET_NAMES.TALENT_RECORDS, 'record_id', prepId);
    if (!existing) return { ok: true, removed: false };
    if (existing.record_type !== 'prep') return { ok: false, error: '這筆資料不是備課檔案' };
    if (actor.role !== 'admin' && existing.nickname !== actor.nickname) {
      return { ok: false, error: '不可刪除其他老師的備課檔案' };
    }
    if (normalizeTalentNickname_(params.confirmation_name) !== normalizeTalentNickname_(existing.nickname)) {
      return { ok: false, error: '姓名確認不正確，未刪除備課檔案' };
    }
    const usageCount = sheetToObjects(SHEET_NAMES.TALENT_RECORDS).filter(function (row) {
      if (row.record_type !== 'lesson' || row.nickname !== existing.nickname) return false;
      return String(talentRecordObject_(row).prepId || '') === prepId;
    }).length;
    if (usageCount) {
      return { ok: false, error: '已有 ' + usageCount + ' 筆課堂紀錄使用這份檔案，為保留歷史資料不能刪除' };
    }
    deleteRow(SHEET_NAMES.TALENT_RECORDS, existing._row);
  } finally {
    lock.releaseLock();
  }
  logSystem(actor.nickname, 'delete_talent_prep', prepId, { owner: actor.nickname });
  return { ok: true, removed: true };
}

function reviewTalentPrep(params) {
  return { ok: false, error: '備課檔案儲存後即可使用，不需要主管審核' };
}

function updateTalentAppStatus(params) {
  const actor = params.__actor;
  const nickname = String(params.nickname || actor && actor.nickname || '').trim();
  const row = findObject(SHEET_NAMES.TALENT_RECORDS, 'record_id', String(params.lesson_id || ''));
  if (!row || row.record_type !== 'lesson' || row.nickname !== nickname) return { ok: false, error: '找不到本人課堂紀錄' };
  if (!actor || (actor.role !== 'admin' && actor.nickname !== nickname)) return { ok: false, error: '只能更新自己的 APP 狀態' };
  const lesson = talentRecordObject_(row);
  if (lesson.lessonStatus === 'cancelled' || lesson.siteType === 'partner') {
    lesson.appStatus = 'not_required';
    lesson.appFiles = [];
    lesson.appUpdatedAt = '';
    lesson.appPublishedAt = '';
    return { ok: true, lesson: upsertTalentRecord_('lesson', nickname, lesson, actor.nickname), exempt: true };
  }
  if (params.status !== 'published') return { ok: false, error: '請上傳發布完成截圖後再確認' };
  lesson.appFiles = talentAppEvidence_(params.app_files, true);
  lesson.appStatus = 'published';
  lesson.appUpdatedAt = nowIso();
  lesson.appPublishedAt = lesson.appUpdatedAt;
  lesson.contentRevision = lesson.appUpdatedAt;
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) return { ok: false, error: '系統正在儲存其他課堂，請稍後重試' };
  let saved;
  try {
    saved = upsertTalentRecord_('lesson', nickname, lesson, actor.nickname);
  } finally {
    lock.releaseLock();
  }

  let warning = '';
  try {
    const user = findUserByNickname(nickname);
    const pdf = generateTalentLessonPdf_(saved, user);
    const pdfLock = LockService.getScriptLock();
    if (!pdfLock.tryLock(10000)) throw new Error('APP 證據已儲存，日報連結稍後更新');
    try {
      const latestRow = findObject(SHEET_NAMES.TALENT_RECORDS, 'record_id', saved.id);
      const latest = latestRow ? talentRecordObject_(latestRow) : null;
      if (!latest || latest.contentRevision !== saved.contentRevision) throw new Error('課堂已在其他裝置更新，日報將由系統自動補成最新版本');
      latest.reportUrl = pdf.url;
      latest.reportFileId = pdf.fileId;
      latest.reportFolderUrl = pdf.folderUrl || latest.reportFolderUrl || '';
      latest.reportGeneratedAt = nowIso();
      latest.reportRevision = latest.contentRevision;
      saved = upsertTalentRecord_('lesson', nickname, latest, actor.nickname);
    } finally {
      pdfLock.releaseLock();
    }
  } catch (error) {
    warning = 'APP 證據已儲存；雲端 PDF 稍後自動更新：' + String(error.message || error);
  }
  logSystem(actor.nickname, 'save_talent_app_evidence', lesson.id, { teacher: nickname, files: lesson.appFiles.length });
  return { ok: true, lesson: saved, warning: warning };
}

function saveTalentScore(params) {
  const actor = params.__actor;
  if (!talentManagerCanReview_(actor)) return { ok: false, error: '只有才藝主管可評分' };
  let nickname = String(params.nickname || '').trim();
  const target = findTalentUser_(nickname);
  if (!target || talentEmployment_(target) !== 'fulltime' || !talentCanAccessUser_(actor, target)) return { ok: false, error: '找不到可評分的才藝正職' };
  nickname = target.nickname;
  const month = String(params.month || '').trim();
  if (!/^\d{4}-\d{2}$/.test(month)) return { ok: false, error: '評分月份不正確' };
  const score = talentPayload_(params.score);
  const maxima = { prep: 25, evidence: 25, communication: 20, attendance: 15, room: 10, improvement: 5 };
  const values = {};
  let total = 0;
  Object.keys(maxima).forEach(function (key) {
    const value = Number(score.scores && score.scores[key] || 0);
    if (!Number.isFinite(value) || value < 0 || value > maxima[key]) throw new Error('評分超出構面上限：' + key);
    values[key] = value;
    total += value;
  });
  if (!String(score.reason || '').trim()) return { ok: false, error: '請填寫評分依據或調整理由' };
  const recordId = 'talent-score-' + nickname + '-' + month;
  const existingRow = findObject(SHEET_NAMES.TALENT_RECORDS, 'record_id', recordId);
  const existing = existingRow && existingRow.record_type === 'score' ? talentRecordObject_(existingRow) : null;
  const published = Boolean(existing && existing.published) || score.published === true;
  const history = existing && Array.isArray(existing.history) ? existing.history.slice(-19) : [];
  if (existing) {
    history.push({
      scores: existing.scores || {},
      total: Number(existing.total || 0),
      reason: String(existing.reason || ''),
      published: existing.published === true,
      evaluatedBy: String(existing.evaluatedBy || existingRow.updated_by || ''),
      evaluatedAt: String(existing.evaluatedAt || existingRow.updated_at || ''),
    });
  }
  const record = {
    id: recordId,
    teacher: nickname,
    date: month + '-01',
    month: month,
    scores: values,
    total: total,
    reason: String(score.reason).trim(),
    published: published,
    status: published ? 'published' : 'draft',
    evaluatedBy: actor.nickname,
    evaluatedAt: nowIso(),
    history: history,
  };
  const saved = upsertTalentRecord_('score', nickname, record, actor.nickname);
  logSystem(actor.nickname, 'save_talent_score', recordId, { teacher: nickname, month: month, total: total, published: published });
  return { ok: true, score: saved };
}

function addTalentMessage(params) {
  const actor = params.__actor;
  let nickname = String(params.nickname || '').trim();
  const target = findTalentUser_(nickname);
  if (!actor || !target || !talentCanAccessUser_(actor, target)) return { ok: false, error: '無權使用此對話' };
  nickname = target.nickname;
  if (actor.role !== 'admin' && actor.nickname !== nickname && !talentManagerCanReview_(actor)) return { ok: false, error: '只有本人或才藝主管可回覆' };
  const month = String(params.month || '').trim();
  const text = String(params.text || '').trim();
  if (!/^\d{4}-\d{2}$/.test(month) || !text) return { ok: false, error: '回覆內容不完整' };
  if (text.length > 1000) return { ok: false, error: '單則回覆最多 1000 字' };
  if (actor.nickname === nickname) {
    const scoreRow = findObject(SHEET_NAMES.TALENT_RECORDS, 'record_id', 'talent-score-' + nickname + '-' + month);
    if (!scoreRow || scoreRow.status !== 'published') return { ok: false, error: '主管公布評分後才能回覆' };
  }
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) return { ok: false, error: '對話正在同步，請稍後再送出' };
  try {
    const recordId = 'talent-chat-' + nickname + '-' + month;
    const existing = findObject(SHEET_NAMES.TALENT_RECORDS, 'record_id', recordId);
    const thread = existing ? talentRecordObject_(existing) : { id: recordId, teacher: nickname, date: month + '-01', month: month, messages: [], status: 'active' };
    thread.messages = Array.isArray(thread.messages) ? thread.messages : [];
    thread.messages.push({ author: actor.nickname, role: actor.nickname === nickname ? 'teacher' : 'manager', text: text, at: nowIso() });
    if (thread.messages.length > 300) thread.messages = thread.messages.slice(-300);
    const saved = upsertTalentRecord_('conversation', nickname, thread, actor.nickname);
    return { ok: true, conversation: saved };
  } finally {
    lock.releaseLock();
  }
}

function approveTalentBonus(params) {
  const actor = params.__actor;
  if (!actor || actor.role !== 'admin') return { ok: false, error: '只有管理員可核准獎金人數' };
  const row = findObject(SHEET_NAMES.TALENT_RECORDS, 'record_id', String(params.lesson_id || ''));
  if (!row || row.record_type !== 'lesson') return { ok: false, error: '找不到課堂紀錄' };
  const lesson = talentRecordObject_(row);
  if (lesson.lessonStatus === 'cancelled') return { ok: false, error: '停課沒有獎金事件' };
  const approvedNew = Math.max(0, Math.floor(Number(params.approved_new_count || 0)));
  const approvedRenewal = Math.max(0, Math.floor(Number(params.approved_renewal_count || 0)));
  if (approvedNew > Number(lesson.newCount || 0) || approvedRenewal > Number(lesson.renewalCount || 0)) {
    return { ok: false, error: '核准人數不可高於老師申報人數' };
  }
  const different = approvedNew !== Number(lesson.newCount || 0) || approvedRenewal !== Number(lesson.renewalCount || 0);
  const note = String(params.note || '').trim();
  if (different && !note) return { ok: false, error: '調整人數時必須填寫原因' };
  lesson.approvedNewCount = approvedNew;
  lesson.approvedRenewalCount = approvedRenewal;
  lesson.bonusApproval = 'approved';
  lesson.bonusApprovedBy = actor.nickname;
  lesson.bonusApprovedAt = nowIso();
  lesson.bonusApprovalNote = note;
  const saved = upsertTalentRecord_('lesson', row.nickname, lesson, actor.nickname);
  return { ok: true, lesson: saved };
}

function talentHtmlEsc_(value) {
  return String(value == null ? '' : value).replace(/[&<>"']/g, function (char) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[char];
  });
}

function talentAttachmentLinks_(title, items) {
  const list = Array.isArray(items) ? items : [];
  if (!list.length) return '';
  return '<h3>' + talentHtmlEsc_(title) + '</h3><ul>' + list.map(function (item) {
    const label = talentHtmlEsc_(item.fileName || item.name || '附件');
    const url = talentHtmlEsc_(item.url || '');
    return '<li>' + (url ? '<a href="' + url + '">' + label + '</a>' : label) + '</li>';
  }).join('') + '</ul>';
}

function generateTalentLessonPdf_(lesson, user) {
  const root = getKpiPdfRootFolder_();
  const department = normalizeDepartment_(user.department) || '才藝部門';
  const departmentFolder = getOrCreateChildFolder_(root, department);
  const teacherFolder = getOrCreateChildFolder_(departmentFolder, user.nickname);
  const workFolder = getOrCreateChildFolder_(teacherFolder, '才藝');
  const monthFolder = getOrCreateChildFolder_(workFolder, String(lesson.date).slice(0, 7));
  const safeId = String(lesson.id || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(-16) || Utilities.getUuid().slice(0, 8);
  const fileName = '才藝日報_' + user.nickname + '_' + lesson.date + '_' + safeId + '.pdf';
  const duplicates = monthFolder.getFilesByName(fileName);
  while (duplicates.hasNext()) duplicates.next().setTrashed(true);
  const prepRow = lesson.prepId ? findObject(SHEET_NAMES.TALENT_RECORDS, 'record_id', String(lesson.prepId)) : null;
  const prep = prepRow && prepRow.record_type === 'prep' ? talentRecordObject_(prepRow) : null;
  let html = '<html><head><meta charset="UTF-8"><style>body{font-family:"Microsoft JhengHei","Noto Sans TC",sans-serif;color:#322a25;font-size:12px;margin:24px}h1{font-size:22px}h2{font-size:16px;border-bottom:2px solid #f0b83b;padding-bottom:6px}h3{font-size:13px;margin:16px 0 5px}.meta{background:#fff7df;padding:12px}.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}.grid.six{grid-template-columns:repeat(6,1fr)}.box{border:1px solid #d8cfc4;padding:10px;margin:8px 0}.muted{color:#776d65;font-size:10px}.warning{background:#fff2d1;border-color:#e2bd62}a{color:#2563a7}</style></head><body>';
  html += '<h1>布拉克星球 KPI 系統｜才藝課堂日報</h1>';
  html += '<div class="meta"><strong>' + talentHtmlEsc_(user.nickname) + '</strong>　' + talentHtmlEsc_(lesson.date) + '　' + talentHtmlEsc_(lesson.scheduleTime || '') + '　' + talentHtmlEsc_(lesson.site || '') + '<div class="muted">紀錄版本：' + talentHtmlEsc_(lesson.contentRevision || lesson.updatedAt || '') + '</div></div>';
  if (lesson.lessonStatus === 'cancelled') {
    html += '<h2>停課回報</h2><div class="box"><strong>' + talentHtmlEsc_(lesson.courseName) + '</strong><p>' + talentHtmlEsc_(lesson.cancellationReason) + '</p><p>' + talentHtmlEsc_(lesson.cancellationNote || '') + '</p></div>';
  } else {
    html += '<h2>' + talentHtmlEsc_(lesson.courseName || lesson.courseType) + '</h2><div class="muted">' + talentHtmlEsc_(lesson.courseType || '') + '　' + talentHtmlEsc_(lesson.duration || '') + ' 小時</div>';
    html += '<div class="grid six"><div class="box">應到<br><strong>' + Number(lesson.expected || 0) + '</strong></div><div class="box">正式實到<br><strong>' + Number(lesson.present || 0) + '</strong></div><div class="box">請假<br><strong>' + Number(lesson.leave || 0) + '</strong></div><div class="box">未請假缺席<br><strong>' + Number(lesson.absent || 0) + '</strong></div><div class="box">補課<br><strong>' + Number(lesson.makeup || 0) + '</strong></div><div class="box">體驗<br><strong>' + Number(lesson.trial || 0) + '</strong></div></div>';
    html += '<h3>本堂使用的備課檔案</h3><div class="box' + (prep ? '' : ' warning') + '">' + (prep
      ? '<strong>' + talentHtmlEsc_(prep.courseName || prep.title || '備課檔案') + '</strong><div class="muted">' + talentHtmlEsc_(prep.courseType || '') + '</div>' + (prep.notes ? '<p>' + talentHtmlEsc_(prep.notes) + '</p>' : '')
      : '原備課檔案已不存在') + '</div>';
    if (prep) html += talentAttachmentLinks_('備課附件', prep.materials);
    html += '<h3>課程問題及下次優化</h3><div class="box">' + talentHtmlEsc_(lesson.issue) + '</div>';
    html += '<h3>親師溝通</h3><div class="box">' + talentHtmlEsc_(lesson.parentStatus === 'complete' ? '全班回報完成' : lesson.parentStatus === 'followup' ? '有個別追蹤' : '尚未完成') + (lesson.parentFollowup ? '<br>' + talentHtmlEsc_(lesson.parentFollowup) : '') + '</div>';
    if (lesson.siteType === 'partner') {
      html += '<h3>家長 APP 發布確認</h3><div class="box">合作校課程免發布，不列入缺件。</div>';
    } else {
      html += '<h3>家長 APP 發布確認</h3><div class="box">' + (lesson.appStatus === 'published' && Array.isArray(lesson.appFiles) && lesson.appFiles.length ? '已上傳發布完成截圖' : '尚未上傳發布完成截圖') + '</div>';
      html += talentAttachmentLinks_('家長 APP 發布完成截圖', lesson.appFiles);
    }
    if (lesson.employment === 'pt') html += '<h3>本堂鐘點試算</h3><div class="box">計薪人數 ' + Number(lesson.present || 0) + '＋補課 ' + Number(lesson.makeup || 0) + '；' + talentHtmlEsc_(lesson.payTier || '') + '；本堂 NT$' + Number(lesson.pay || 0).toLocaleString('en-US') + '</div>';
    if (lesson.siteType === 'self' && (Number(lesson.newCount || 0) || Number(lesson.renewalCount || 0))) html += '<h3>新生／續報申報</h3><div class="box">新生 ' + Number(lesson.newCount || 0) + ' 人；續報 ' + Number(lesson.renewalCount || 0) + ' 人；狀態：' + talentHtmlEsc_(lesson.bonusApproval === 'approved' ? '已核准' : '待核准') + '</div>';
    html += talentAttachmentLinks_('點名簿', lesson.attendanceFiles);
    html += talentAttachmentLinks_('學習過程與成果', lesson.learningFiles);
    html += talentAttachmentLinks_('課後教室復原', lesson.roomFiles);
  }
  html += '</body></html>';
  const blob = Utilities.newBlob(html, 'text/html', 'talent.html').getAs('application/pdf').setName(fileName);
  const file = monthFolder.createFile(blob);
  secureKpiReportPath_(root, departmentFolder, teacherFolder, workFolder, monthFolder, user, 'talent', []);
  secureKpiDriveItem_(file, user, 'talent', []);
  return { url: 'https://drive.google.com/file/d/' + file.getId() + '/view', fileId: file.getId(), folderUrl: workFolder.getUrl() };
}

function regenerateTalentLessonReport(params) {
  const actor = params && params.__actor;
  const lessonId = String(params && params.lesson_id || '').trim();
  const row = findObject(SHEET_NAMES.TALENT_RECORDS, 'record_id', lessonId);
  if (!actor || !row || row.record_type !== 'lesson' || row.status !== 'submitted') {
    return { ok: false, error: '找不到可重建的課堂紀錄' };
  }
  const user = findUserByNickname(row.nickname);
  if (!user || (!talentCanAccessUser_(actor, user) && !talentCanAccessHistoricalUser_(actor, user))) {
    return { ok: false, error: '無權重建此日報' };
  }
  const current = talentRecordObject_(row);
  if (current.reportUrl && params.force !== true) {
    return { ok: true, lesson: current, reportUrl: current.reportUrl, reused: true };
  }

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) return { ok: false, error: '系統正在處理其他日報，請稍後重試' };
  try {
    const latestRow = findObject(SHEET_NAMES.TALENT_RECORDS, 'record_id', lessonId);
    if (!latestRow || latestRow.record_type !== 'lesson' || latestRow.status !== 'submitted') {
      return { ok: false, error: '課堂紀錄已變更，請重新整理後再試' };
    }
    const latest = talentRecordObject_(latestRow);
    if (latest.reportUrl && params.force !== true) {
      return { ok: true, lesson: latest, reportUrl: latest.reportUrl, reused: true };
    }
    const pdf = generateTalentLessonPdf_(latest, user);
    latest.reportUrl = pdf.url;
    latest.reportFileId = pdf.fileId;
    latest.reportFolderUrl = pdf.folderUrl || latest.reportFolderUrl || '';
    latest.reportGeneratedAt = nowIso();
    latest.reportRevision = latest.contentRevision || latest.updatedAt;
    const saved = upsertTalentRecord_('lesson', row.nickname, latest, actor.nickname);
    notifyTalentLesson_(saved, user, pdf.url);
    logSystem(actor.nickname, 'regenerate_talent_lesson_pdf', lessonId, { teacher: row.nickname });
    return { ok: true, lesson: saved, reportUrl: pdf.url };
  } finally {
    lock.releaseLock();
  }
}

/** 每晚補齊因 Drive 短暫錯誤而缺少的才藝日報；每次限量避免超過 Apps Script 執行時間。 */
function repairMissingTalentLessonReportsAuto() {
  ensureTalentRecordsSheet_();
  const rows = sheetToObjects(SHEET_NAMES.TALENT_RECORDS).filter(function (row) {
    if (row.record_type !== 'lesson' || row.status !== 'submitted') return false;
    const lesson = talentRecordObject_(row);
    return !String(lesson.reportUrl || '').trim() ||
      !String(lesson.reportRevision || '').trim() ||
      String(lesson.reportRevision || '') !== String(lesson.contentRevision || lesson.updatedAt || '');
  }).slice(0, 20);
  let repaired = 0;
  const errors = [];
  rows.forEach(function (row) {
    try {
      const user = findUserByNickname(row.nickname);
      if (!user || ['active', 'suspended', 'deleted'].indexOf(user.status) < 0) throw new Error('找不到可稽核的老師資料');
      const sourceRow = findObject(SHEET_NAMES.TALENT_RECORDS, 'record_id', row.record_id);
      if (!sourceRow || sourceRow.record_type !== 'lesson' || sourceRow.status !== 'submitted') throw new Error('課堂紀錄已變更');
      const source = talentRecordObject_(sourceRow);
      const sourceRevision = source.contentRevision || source.updatedAt;
      const pdf = generateTalentLessonPdf_(source, user);
      const lock = LockService.getScriptLock();
      if (!lock.tryLock(10000)) throw new Error('系統正在處理其他紀錄');
      try {
        const latestRow = findObject(SHEET_NAMES.TALENT_RECORDS, 'record_id', row.record_id);
        if (!latestRow || latestRow.record_type !== 'lesson' || latestRow.status !== 'submitted') throw new Error('課堂紀錄已變更');
        const lesson = talentRecordObject_(latestRow);
        const hadReport = Boolean(lesson.reportUrl);
        lesson.reportUrl = pdf.url;
        lesson.reportFileId = pdf.fileId;
        lesson.reportFolderUrl = pdf.folderUrl || lesson.reportFolderUrl || '';
        lesson.reportGeneratedAt = nowIso();
        lesson.reportRevision = sourceRevision;
        const saved = upsertTalentRecord_('lesson', row.nickname, lesson, 'system');
        if (!hadReport && user.status === 'active') notifyTalentLesson_(saved, user, pdf.url);
        repaired += 1;
      } finally {
        lock.releaseLock();
      }
    } catch (error) {
      errors.push({ id: row.record_id, error: String(error.message || error) });
    }
  });
  return { ok: errors.length === 0, scanned: rows.length, repaired: repaired, errors: errors };
}

function setupTalentReportRepairTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (trigger) {
    if (trigger.getHandlerFunction() === 'repairMissingTalentLessonReportsAuto') ScriptApp.deleteTrigger(trigger);
  });
  ScriptApp.newTrigger('repairMissingTalentLessonReportsAuto').timeBased().everyDays(1).atHour(22).nearMinute(15).create();
}

function notifyTalentLesson_(lesson, user, pdfUrl) {
  if (!pdfUrl) return;
  const version = String(lesson.updatedAt || nowIso());
  const props = PropertiesService.getScriptProperties();
  const message = '📄 ' + user.nickname + ' ' + String(lesson.date || '').slice(5).replace('-', '/') + ' 才藝日報已送出\n' + String(lesson.courseName || '停課回報') + '\n完整日報👇\n' + pdfUrl;
  sheetToObjects(SHEET_NAMES.USERS).filter(function (recipient) {
    return recipient.status === 'active' && recipient.nickname !== user.nickname && (
      recipient.role === 'admin' || isGlobalManager_(recipient) || talentAssignments_(recipient).indexOf('talent-manager') >= 0
    );
  }).forEach(function (recipient) {
    const baseKey = 'TALENT_NOTICE_' + lesson.id + '_' + recipient.nickname;
    const lineKey = baseKey + '_LINE';
    const appKey = baseKey + '_APP';
    if (recipient.line_user_id && (props.getProperty(lineKey) || '') < version && pushLine_(recipient.line_user_id, message)) props.setProperty(lineKey, version);
    if (recipient.push_subscription_id && (props.getProperty(appKey) || '') < version && pushOneSignal_(recipient.nickname, user.nickname + ' 已送出才藝日報', lesson.courseName || '停課回報', 'https://teacher.blockplanetcamp.com/review/talent-v2/index.html?workspace=talent-manager&notify=1')) props.setProperty(appKey, version);
  });
}

// ════════════════════════════════════════════════════════════
//  adminmarketing.gs
// ════════════════════════════════════════════════════════════

/**
 * 行政美宣正式資料層。
 * 以 record_type 分流每日工作、週二追蹤、環境、專案、主管交辦、評分與對話。
 */

const ADMIN_MARKETING_RECORD_TYPES_ = ['daily', 'daily_check', 'tuesday', 'environment', 'project', 'trial', 'trial_day', 'assignment', 'score', 'message'];
const ADMIN_MARKETING_TRIAL_BONUS_ = 50;
const ADMIN_MARKETING_TRIAL_START_DATE_ = '2026-08-15';
const ADMIN_MARKETING_KPI_ = [
  { key: 'daily', label: '行政處理與工作留痕', max: 20 },
  { key: 'promotion', label: '美宣產出與發布品質', max: 25 },
  { key: 'followup', label: '試上、繳費與家長追蹤', max: 15 },
  { key: 'deadline', label: '期限與專案推進', max: 20 },
  { key: 'environment', label: '環境與資料維護', max: 10 },
  { key: 'supervisor', label: '正確性與主動回報', max: 10 },
];

function ensureAdminMarketingRecordsSheet_() {
  const ss = getSS();
  let sheet = ss.getSheetByName(SHEET_NAMES.ADMIN_MARKETING_RECORDS);
  if (!sheet) sheet = ss.insertSheet(SHEET_NAMES.ADMIN_MARKETING_RECORDS);
  ensureHeaders(sheet, [
    'record_id', 'record_type', 'nickname', 'department', 'record_date',
    'year_week', 'year_month', 'status', 'data_json', 'created_by', 'updated_by',
    'created_at', 'updated_at', 'reviewed_at'
  ]);
  return sheet;
}

function adminMarketingAssignments_(user) {
  const explicit = parseUserListField_(user && user.work_assignments);
  if (explicit.length) return explicit;
  if (!user) return [];
  if (user.role === 'admin') return ['admin-marketing-manager'];
  if (user.role === 'admin_staff' && String(user.subtype || '') === 'marketing') return ['admin-marketing'];
  return [];
}

function userHasAdminMarketingWork_(user) {
  return adminMarketingAssignments_(user).some(function (item) {
    return item === 'admin-marketing' || item === 'admin-marketing-manager';
  });
}

function adminMarketingManagerCanReview_(user) {
  return !!user && user.status === 'active' && (
    user.role === 'admin' || adminMarketingAssignments_(user).indexOf('admin-marketing-manager') >= 0
  );
}

function adminMarketingCanAccessUser_(actor, target) {
  if (!actor || !target || actor.status !== 'active' || target.status !== 'active') return false;
  if (actor.nickname === target.nickname) return true;
  return adminMarketingManagerCanReview_(actor) && adminMarketingAssignments_(target).indexOf('admin-marketing') >= 0;
}

function adminMarketingPublicUser_(user) {
  return {
    nickname: String(user.nickname || ''),
    role: String(user.role || ''),
    department: normalizeDepartment_(user.department),
    status: String(user.status || ''),
    subtype: String(user.subtype || ''),
    work_assignments: adminMarketingAssignments_(user),
  };
}

function adminMarketingText_(value, max) {
  return String(value == null ? '' : value).trim().slice(0, max || 2000);
}

function adminMarketingDate_(value, required) {
  const date = String(value || '').slice(0, 10);
  if (!date && !required) return '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('日期格式不正確');
  return date;
}

function adminMarketingPayload_(value) {
  let copy;
  try { copy = JSON.parse(JSON.stringify(value || {})); }
  catch (error) { throw new Error('行政美宣資料格式不正確'); }
  function clean(item) {
    if (!item || typeof item !== 'object') return;
    if (Array.isArray(item)) return item.forEach(clean);
    Object.keys(item).forEach(function (key) {
      if (key === 'dataUrl' || key === 'base64' || key === 'file') delete item[key];
      else clean(item[key]);
    });
  }
  clean(copy);
  return copy;
}

function adminMarketingAttachments_(items, required) {
  const list = Array.isArray(items) ? items.slice(0, 30) : [];
  const files = list.map(function (item) {
    const rawUrl = adminMarketingText_(item && (item.url || item.cloudUrl), 500);
    const url = /^https:\/\/drive\.google\.com\//i.test(rawUrl) ? rawUrl : '';
    return {
      id: adminMarketingText_(item && (item.id || item.fileId) || Utilities.getUuid(), 160),
      fileName: adminMarketingText_(item && (item.fileName || item.name) || '附件', 160),
      url: url,
      fileId: adminMarketingText_(item && item.fileId, 160),
      mimeType: adminMarketingText_(item && (item.mimeType || item.type), 120),
      category: adminMarketingText_(item && item.category, 80),
    };
  });
  if (required && (!files.length || files.some(function (item) { return !item.url; }))) {
    throw new Error('完成證據尚未完整上傳到雲端');
  }
  return files;
}

function adminMarketingTrialIdentity_(data) {
  const name = adminMarketingText_(data && data.studentName, 160).replace(/\s+/g, '').toLowerCase();
  const contact = adminMarketingText_(data && (data.contactDisplay || data.contactRef), 160).split('｜試上')[0].replace(/[\s\-()]/g, '').toLowerCase();
  const course = adminMarketingText_(data && data.course, 220).replace(/\s+/g, '').toLowerCase();
  const date = adminMarketingText_(data && data.date, 10);
  return name && contact && course && date ? name + '|' + contact + '|' + course + '|' + date : '';
}

function adminMarketingStudentIdentity_(data) {
  const name = adminMarketingText_(data && data.studentName, 160).replace(/\s+/g, '').toLowerCase();
  const contact = adminMarketingText_(data && (data.contactDisplay || data.contactRef), 160).split('｜試上')[0].replace(/[\s\-()]/g, '').toLowerCase();
  return name && contact ? name + '|' + contact : '';
}

function adminMarketingTrialBonusEligibility_(data) {
  if (!data || data.status !== 'converted') return { eligible: false, error: '尚未完成首次一期報名' };
  if (data.firstEnrollment !== true) return { eligible: false, error: '不是首次正式報名' };
  if (!data.enrollmentDate || !data.paymentDate || !data.enrollmentCourse) {
    return { eligible: false, error: '報名、繳費日期或正式課程尚未完整' };
  }
  if (!Array.isArray(data.paymentEvidence) || !data.paymentEvidence.length) return { eligible: false, error: '尚未附報名或繳費證明' };
  return { eligible: true, amount: ADMIN_MARKETING_TRIAL_BONUS_ };
}

function adminMarketingWeekKey_(dateValue) {
  const date = new Date(adminMarketingDate_(dateValue, true) + 'T12:00:00+08:00');
  const day = date.getDay() || 7;
  date.setDate(date.getDate() - day + 1);
  return Utilities.formatDate(date, 'Asia/Taipei', "yyyy-'W'ww");
}

function adminMarketingRecordObject_(row) {
  const item = parseJsonField(row.data_json) || {};
  item.id = item.id || row.record_id;
  item.type = item.type || row.record_type;
  item.nickname = item.nickname || row.nickname;
  item.date = item.date || row.record_date;
  item.status = row.status || item.status;
  item.createdAt = item.createdAt || row.created_at;
  item.updatedAt = row.updated_at || item.updatedAt;
  item.reviewedAt = row.reviewed_at || item.reviewedAt;
  return item;
}

function validateAdminMarketingDaily_(data) {
  data.date = adminMarketingDate_(data.date, true);
  if (data.date > todayStr()) throw new Error('不可建立未來日期的每日工作日誌');
  const messages = data.messages && typeof data.messages === 'object' ? data.messages : {};
  data.messages = {
    parentChecked: messages.parentChecked === true,
    officialLineChecked: messages.officialLineChecked === true,
    groupChecked: messages.groupChecked === true,
    unresolved: adminMarketingText_(messages.unresolved, 1500),
    reported: messages.reported === true,
  };
  if (!Array.isArray(data.items) || !data.items.length) throw new Error('每日工作日誌至少要有一項工作');
  data.items = data.items.slice(0, 30).map(function (raw) {
    const item = raw || {};
    const status = ['in_progress', 'waiting', 'completed'].indexOf(item.status) >= 0 ? item.status : 'in_progress';
    const progress = Math.max(0, Math.min(100, Number(item.progress) || 0));
    const category = adminMarketingText_(item.category, 80);
    const outputCategories = ['video', 'photo_post', 'poster', 'design', 'social_schedule'];
    const evidenceRequired = status === 'completed' && outputCategories.indexOf(category) >= 0;
    const cleaned = {
      id: adminMarketingText_(item.id || Utilities.getUuid(), 160),
      category: category,
      title: adminMarketingText_(item.title, 220),
      completedToday: adminMarketingText_(item.completedToday, 2500),
      progress: progress,
      status: status,
      remaining: adminMarketingText_(item.remaining, 1800),
      dueDate: adminMarketingDate_(item.dueDate, false),
      actualDate: adminMarketingDate_(item.actualDate, false),
      evidence: adminMarketingAttachments_(item.evidence, evidenceRequired),
    };
    if (!cleaned.category || !cleaned.title || !cleaned.completedToday) throw new Error('每項工作都要填寫工作類型、工作名稱與本次處理結果');
    if (cleaned.status !== 'completed' && (!cleaned.remaining || !cleaned.dueDate)) {
      throw new Error('未完成工作必須填寫剩餘工作與預計完成日期');
    }
    if (cleaned.status === 'completed') {
      cleaned.progress = 100;
      if (!cleaned.actualDate) throw new Error('已完成工作必須填寫實際完成日期');
    }
    return cleaned;
  });
  data.note = adminMarketingText_(data.note, 2000);
  data.status = 'submitted';
  return data;
}

function validateAdminMarketingDailyCheck_(data) {
  data.date = adminMarketingDate_(data.date, true);
  if (data.date > todayStr()) throw new Error('不可預先建立未來日期的訊息確認');
  data.status = data.status === 'needs_supervisor' ? 'needs_supervisor' : 'clear';
  data.note = data.status === 'needs_supervisor' ? adminMarketingText_(data.note, 1800) : '';
  data.reported = data.status === 'needs_supervisor' && data.reported === true;
  if (data.status === 'needs_supervisor' && !data.note) throw new Error('請寫明需要主管協助的事項');
  if (data.status === 'needs_supervisor' && !data.reported) throw new Error('請確認已主動回報主管');
  return data;
}

function validateAdminMarketingTuesday_(data) {
  data.date = adminMarketingDate_(data.date, true);
  data.weekKey = adminMarketingText_(data.weekKey || adminMarketingWeekKey_(data.date), 20);
  const checks = data.checks || {};
  data.checks = {
    paymentList: checks.paymentList === true,
    expiringStudents: checks.expiringStudents === true,
    unpaidParents: checks.unpaidParents === true,
    remindersSent: checks.remindersSent === true,
    exceptionsReported: checks.exceptionsReported === true,
  };
  if (!data.checks.paymentList || !data.checks.expiringStudents || !data.checks.unpaidParents || !data.checks.remindersSent) {
    throw new Error('週二行政確認的四項固定檢核必須完成');
  }
  data.followups = (Array.isArray(data.followups) ? data.followups : []).slice(0, 80).map(function (raw) {
    const item = raw || {};
    const status = item.status === 'closed' ? 'closed' : 'open';
    const cleaned = {
      id: adminMarketingText_(item.id || Utilities.getUuid(), 160),
      person: adminMarketingText_(item.person, 160),
      situation: adminMarketingText_(item.situation, 1200),
      handled: adminMarketingText_(item.handled, 1200),
      nextDate: adminMarketingDate_(item.nextDate, false),
      status: status,
    };
    if (!cleaned.person || !cleaned.situation || !cleaned.handled) throw new Error('追蹤事項需填寫學生／家長、目前狀況與已處理事項');
    if (status === 'open' && !cleaned.nextDate) throw new Error('尚未結束的家長事項必須設定下次追蹤日期');
    return cleaned;
  });
  data.note = adminMarketingText_(data.note, 1600);
  data.status = 'submitted';
  return data;
}

function validateAdminMarketingEnvironment_(data) {
  data.date = adminMarketingDate_(data.date, true);
  const allowed = [
    'counter', 'documents', 'floor', 'furniture', 'cabinets', 'supplies',
    'publicArea', 'announcements', 'shoeCabinet', 'entrance', 'outside', 'signage'
  ];
  const checks = data.checks || {};
  data.checks = {};
  allowed.forEach(function (key) { data.checks[key] = checks[key] === true; });
  const incomplete = allowed.filter(function (key) { return !data.checks[key]; });
  data.issue = adminMarketingText_(data.issue, 1600);
  data.improvementDue = adminMarketingDate_(data.improvementDue, false);
  data.evidence = adminMarketingAttachments_(data.evidence, false);
  if (incomplete.length && (!data.issue || !data.improvementDue)) {
    throw new Error('未通過的環境項目必須填寫問題與改善期限');
  }
  data.status = incomplete.length ? 'needs_action' : 'submitted';
  return data;
}

function validateAdminMarketingProject_(data) {
  data.date = adminMarketingDate_(data.date || todayStr(), true);
  data.title = adminMarketingText_(data.title, 220);
  data.projectType = adminMarketingText_(data.projectType, 100);
  data.summary = adminMarketingText_(data.summary, 2200);
  data.status = ['planning', 'active', 'waiting', 'completed', 'paused'].indexOf(data.status) >= 0 ? data.status : 'planning';
  const stageNames = ['企劃', '素材準備', '文案', '美宣', '主管審核', '修改', '排程', '發布'];
  data.currentStage = adminMarketingText_(data.currentStage, 80);
  if (stageNames.indexOf(data.currentStage) < 0) data.currentStage = stageNames[0];
  data.dueDate = adminMarketingDate_(data.dueDate, true);
  if (!data.title || !data.projectType || !data.summary) throw new Error('專案名稱、類型與目前結果為必填');
  const source = Array.isArray(data.stages) ? data.stages : [];
  data.stages = stageNames.map(function (name, index) {
    const raw = source[index] || source.filter(function (item) { return item.name === name; })[0] || {};
    const status = ['pending', 'active', 'completed'].indexOf(raw.status) >= 0 ? raw.status : 'pending';
    const dueDate = adminMarketingDate_(raw.dueDate, false);
    const actualDate = adminMarketingDate_(raw.actualDate, false);
    return { name: name, status: status, dueDate: dueDate, actualDate: actualDate, note: adminMarketingText_(raw.note, 800) };
  });
  data.evidence = adminMarketingAttachments_(data.evidence, data.status === 'completed');
  return data;
}

function validateAdminMarketingTrial_(data) {
  data.date = adminMarketingDate_(data.date, true);
  data.studentName = adminMarketingText_(data.studentName, 160);
  data.course = adminMarketingText_(data.course, 220);
  data.teacher = adminMarketingText_(data.teacher, 160);
  data.contactDisplay = adminMarketingText_(data.contactDisplay || data.contactRef, 160).split('｜試上')[0].trim();
  data.contactRef = data.contactDisplay;
  data.interest = ['high', 'medium', 'low', 'unknown'].indexOf(data.interest) >= 0 ? data.interest : 'unknown';
  data.owner = adminMarketingText_(data.owner || data.nickname, 160);
  data.note = adminMarketingText_(data.note, 1800);
  data.nextFollowupDate = adminMarketingDate_(data.nextFollowupDate, false);
  if (data.status === 'contacted' || data.status === 'followup_scheduled') data.status = 'considering';
  data.status = ['waiting_contact', 'considering', 'converted', 'not_enrolled'].indexOf(data.status) >= 0 ? data.status : 'waiting_contact';
  if (!data.studentName || !data.course || !data.teacher || !data.contactRef || !data.owner) {
    throw new Error('學生姓名、試上課程、授課老師、家長識別資料與負責人皆為必填');
  }
  data.followups = (Array.isArray(data.followups) ? data.followups : []).slice(0, 100).map(function (raw) {
    const item = raw || {};
    const cleaned = {
      id: adminMarketingText_(item.id || Utilities.getUuid(), 160),
      date: adminMarketingDate_(item.date || todayStr(), true),
      method: ['line', 'phone', 'in_person', 'other'].indexOf(item.method) >= 0 ? item.method : 'line',
      note: adminMarketingText_(item.note, 1800),
      nextDate: adminMarketingDate_(item.nextDate, false),
      author: adminMarketingText_(item.author, 160),
      at: adminMarketingText_(item.at, 80),
    };
    if (!cleaned.note) throw new Error('每次家長追蹤都要留下處理結果');
    if (cleaned.date > todayStr()) throw new Error('家長追蹤日期不可晚於今天');
    return cleaned;
  });
  data.enrollmentDate = adminMarketingDate_(data.enrollmentDate, false);
  data.paymentDate = adminMarketingDate_(data.paymentDate, false);
  data.enrollmentCourse = adminMarketingText_(data.enrollmentCourse, 220);
  data.firstEnrollment = data.firstEnrollment === true;
  data.paymentEvidence = adminMarketingAttachments_(data.paymentEvidence, data.status === 'converted' && data.firstEnrollment);
  data.lateReason = adminMarketingText_(data.lateReason, 1000);
  if (data.enrollmentDate > todayStr() || data.paymentDate > todayStr()) throw new Error('報名與繳費日期不可晚於今天');
  if ((data.enrollmentDate && data.enrollmentDate < data.date) || (data.paymentDate && data.paymentDate < data.date)) {
    throw new Error('報名與繳費日期不可早於試上日期');
  }
  if (data.status === 'converted') {
    if (!data.enrollmentDate || !data.paymentDate || !data.enrollmentCourse) {
      throw new Error('已報名一期必須填寫報名日期、繳費日期與正式課程');
    }
  }
  return data;
}

function validateAdminMarketingTrialDay_(data) {
  data.date = adminMarketingDate_(data.date, true);
  if (data.date > todayStr()) throw new Error('不可預先登記未來的試上狀態');
  data.noTrial = data.noTrial === true;
  data.note = adminMarketingText_(data.note, 500);
  data.status = data.noTrial ? 'confirmed' : 'superseded';
  return data;
}

function validateAdminMarketingRecord_(type, value) {
  if (ADMIN_MARKETING_RECORD_TYPES_.indexOf(type) < 0) throw new Error('行政美宣紀錄類型不正確');
  const data = adminMarketingPayload_(value);
  data.id = adminMarketingText_(data.id, 180);
  data.type = type;
  if (!data.id) throw new Error('紀錄編號遺失');
  if (type === 'daily') return validateAdminMarketingDaily_(data);
  if (type === 'daily_check') return validateAdminMarketingDailyCheck_(data);
  if (type === 'tuesday') return validateAdminMarketingTuesday_(data);
  if (type === 'environment') return validateAdminMarketingEnvironment_(data);
  if (type === 'project') return validateAdminMarketingProject_(data);
  if (type === 'trial') return validateAdminMarketingTrial_(data);
  if (type === 'trial_day') return validateAdminMarketingTrialDay_(data);
  return data;
}

function upsertAdminMarketingRecord_(type, nickname, data, actorNickname) {
  ensureAdminMarketingRecordsSheet_();
  const existing = findObject(SHEET_NAMES.ADMIN_MARKETING_RECORDS, 'record_id', data.id);
  if (existing && (existing.record_type !== type || existing.nickname !== nickname)) {
    throw new Error('不可覆蓋其他人的行政美宣資料');
  }
  const user = findUserByNickname(nickname);
  const now = nowIso();
  const date = adminMarketingDate_(data.date || todayStr(), true);
  const json = JSON.stringify(adminMarketingPayload_(data));
  if (json.length > 45000) throw new Error('資料內容過大，請確認附件已上傳至雲端');
  upsertRow(SHEET_NAMES.ADMIN_MARKETING_RECORDS, 'record_id', {
    record_id: data.id,
    record_type: type,
    nickname: nickname,
    department: normalizeDepartment_(user && user.department),
    record_date: date,
    year_week: data.weekKey || adminMarketingWeekKey_(date),
    year_month: String(data.month || date).slice(0, 7),
    status: String(data.status || 'draft'),
    data_json: json,
    created_by: existing ? existing.created_by : actorNickname,
    updated_by: actorNickname,
    created_at: existing ? existing.created_at : now,
    updated_at: now,
    reviewed_at: existing ? existing.reviewed_at : '',
  });
  data.createdAt = existing ? existing.created_at : now;
  data.updatedAt = now;
  return data;
}

function getAdminMarketingWorkspaceData(params) {
  const actor = params.__actor || findUserByNickname(String(params.viewer || ''));
  if (!actor || actor.status !== 'active' || !userHasAdminMarketingWork_(actor)) {
    return { ok: false, error: '此帳號沒有行政美宣工作區權限' };
  }
  ensureAdminMarketingRecordsSheet_();
  const allUsers = sheetToObjects(SHEET_NAMES.USERS);
  const users = allUsers.filter(function (user) {
    return user.status === 'active' && adminMarketingAssignments_(user).indexOf('admin-marketing') >= 0 && adminMarketingCanAccessUser_(actor, user);
  });
  const allowed = {};
  users.forEach(function (user) { allowed[user.nickname] = true; });
  if (adminMarketingAssignments_(actor).indexOf('admin-marketing') >= 0) allowed[actor.nickname] = true;
  const records = sheetToObjects(SHEET_NAMES.ADMIN_MARKETING_RECORDS).filter(function (row) {
    return allowed[row.nickname] === true;
  }).map(adminMarketingRecordObject_);
  records.sort(function (a, b) { return String(b.updatedAt || b.date || '').localeCompare(String(a.updatedAt || a.date || '')); });
  return {
    ok: true,
    users: users.map(adminMarketingPublicUser_),
    records: records,
    settings: {
      supervisor: '小魚',
      videoWeeklyTarget: 2,
      photoWeeklyTarget: 3,
      trialBonusAmount: ADMIN_MARKETING_TRIAL_BONUS_,
      trialBonusRule: '首次試上轉一期並完成繳費，每位 50 元',
      kpi: ADMIN_MARKETING_KPI_,
    },
  };
}

function existingAdminMarketingFolder_(root, department, nickname) {
  function child(parent, name) {
    const iterator = parent.getFoldersByName(name);
    return iterator.hasNext() ? iterator.next() : null;
  }
  const departmentFolder = child(root, normalizeDepartment_(department));
  const userFolder = departmentFolder ? child(departmentFolder, nickname) : null;
  return userFolder ? child(userFolder, '行政美宣') : null;
}

function getAdminMarketingDriveFolders(params) {
  const actor = params.__actor || findUserByNickname(String(params.viewer || ''));
  if (!actor || !adminMarketingManagerCanReview_(actor)) return { ok: false, error: '只有行政美宣主管可查看雲端資料夾' };
  const users = sheetToObjects(SHEET_NAMES.USERS).filter(function (user) {
    return user.status === 'active' && adminMarketingAssignments_(user).indexOf('admin-marketing') >= 0 && adminMarketingCanAccessUser_(actor, user);
  });
  const materialRoot = getMaterialRootFolder_();
  const evidenceRoot = getEvidenceRootFolder_();
  const folders = users.map(function (user) {
    const material = existingAdminMarketingFolder_(materialRoot, user.department, user.nickname);
    const evidence = existingAdminMarketingFolder_(evidenceRoot, user.department, user.nickname);
    return {
      nickname: user.nickname,
      department: normalizeDepartment_(user.department),
      materialUrl: material ? 'https://drive.google.com/drive/folders/' + material.getId() : '',
      evidenceUrl: evidence ? 'https://drive.google.com/drive/folders/' + evidence.getId() : '',
    };
  });
  return { ok: true, folders: folders };
}

function adminMarketingTrialRows_(nickname) {
  return sheetToObjects(SHEET_NAMES.ADMIN_MARKETING_RECORDS).filter(function (row) {
    return row.record_type === 'trial' && (!nickname || row.nickname === nickname);
  });
}

function adminMarketingFindDuplicateTrial_(nickname, data, excludeId) {
  const identity = adminMarketingTrialIdentity_(data);
  if (!identity) return null;
  const rows = adminMarketingTrialRows_(nickname);
  for (let i = 0; i < rows.length; i += 1) {
    if (rows[i].record_id === excludeId) continue;
    const item = adminMarketingRecordObject_(rows[i]);
    if (adminMarketingTrialIdentity_(item) === identity) return item;
  }
  return null;
}

function adminMarketingAppendTrialHistory_(data, original, actor, summary) {
  data.history = original && Array.isArray(original.history) ? original.history.slice(-99) : [];
  data.history.push({
    id: Utilities.getUuid(),
    author: actor.nickname,
    role: actor.role,
    at: nowIso(),
    summary: adminMarketingText_(summary, 500),
  });
  return data;
}

function saveAdminMarketingRecord(params) {
  const actor = params.__actor;
  const nickname = String(params.nickname || actor && actor.nickname || '').trim();
  const target = findUserByNickname(nickname);
  const type = String(params.record_type || '');
  const managerTrialEntry = type === 'trial' && actor && adminMarketingManagerCanReview_(actor) && target && adminMarketingCanAccessUser_(actor, target);
  if (!actor || !target || adminMarketingAssignments_(target).indexOf('admin-marketing') < 0 ||
      (actor.role !== 'admin' && actor.nickname !== target.nickname && !managerTrialEntry)) {
    return { ok: false, error: '只能儲存自己的行政美宣紀錄' };
  }
  if (['daily', 'daily_check', 'tuesday', 'environment', 'project', 'trial', 'trial_day'].indexOf(type) < 0) {
    return { ok: false, error: '此紀錄類型不可由行政端儲存' };
  }
  let data = validateAdminMarketingRecord_(type, params.record);
  const existingRow = findObject(SHEET_NAMES.ADMIN_MARKETING_RECORDS, 'record_id', data.id);
  const original = existingRow ? adminMarketingRecordObject_(existingRow) : null;
  if (type === 'trial') {
    if (!original && data.date < ADMIN_MARKETING_TRIAL_START_DATE_) {
      return { ok: false, error: '試上追蹤自 2026/08/15 起實施，不可建立更早日期的紀錄' };
    }
    if (!original && data.date < todayStr()) {
      if (!managerTrialEntry || !data.lateReason) return { ok: false, error: '過去日期屬補登；請由小魚或柏翰填寫原因' };
    }
    const duplicate = adminMarketingFindDuplicateTrial_('', data, data.id);
    if (duplicate) return { ok: false, error: '這位學生在同一天已有相同課程的試上預約，請更新原紀錄' };
    if (original && original.bonusStatus === 'approved') {
      const locked = ['studentName', 'contactRef', 'status', 'firstEnrollment', 'enrollmentDate', 'paymentDate', 'enrollmentCourse'];
      const changed = locked.some(function (key) { return String(original[key] == null ? '' : original[key]) !== String(data[key] == null ? '' : data[key]); });
      if (changed) return { ok: false, error: '此筆首報獎金已核准，報名與學生資料已鎖定；需修正請由主管處理' };
    }
    const eligible = adminMarketingTrialBonusEligibility_(data);
    data.bonusStatus = original && ['approved', 'rejected'].indexOf(original.bonusStatus) >= 0
      ? original.bonusStatus : (eligible.eligible ? 'pending_review' : 'not_eligible');
    data.bonusAmount = data.bonusStatus === 'approved' ? ADMIN_MARKETING_TRIAL_BONUS_ : 0;
    data.bonusReviewedBy = original && original.bonusReviewedBy || '';
    data.bonusReviewedAt = original && original.bonusReviewedAt || '';
    data.bonusReviewNote = original && original.bonusReviewNote || '';
    adminMarketingAppendTrialHistory_(data, original, actor, original ? '更新試上追蹤' : (data.lateReason ? '主管補登試上紀錄：' + data.lateReason : '建立試上紀錄'));
    const markerRow = sheetToObjects(SHEET_NAMES.ADMIN_MARKETING_RECORDS).filter(function (row) {
      return row.record_type === 'trial_day' && row.nickname === nickname && row.record_date === data.date;
    })[0];
    if (markerRow) {
      const marker = adminMarketingRecordObject_(markerRow);
      if (marker.noTrial === true) {
        marker.noTrial = false;
        marker.status = 'superseded';
        upsertAdminMarketingRecord_('trial_day', nickname, marker, actor.nickname);
      }
    }
  }
  if (type === 'trial_day') {
    if (data.date !== todayStr() && actor.role !== 'admin') return { ok: false, error: '「今日無試上」只能在當日確認' };
    const hasTrial = adminMarketingTrialRows_(nickname).some(function (row) {
      return row.record_date === data.date && row.record_id !== data.id;
    });
    if (data.noTrial && hasTrial) return { ok: false, error: '今天已有試上學生，不能標記為無試上' };
  }
  const saved = upsertAdminMarketingRecord_(type, nickname, data, actor.nickname);
  return { ok: true, record: saved };
}

function reviewAdminMarketingTrialBonus(params) {
  const actor = params.__actor;
  if (!adminMarketingManagerCanReview_(actor)) return { ok: false, error: '只有行政美宣主管可審核首報獎金' };
  const existing = findObject(SHEET_NAMES.ADMIN_MARKETING_RECORDS, 'record_id', String(params.record_id || ''));
  if (!existing || existing.record_type !== 'trial') return { ok: false, error: '找不到試上追蹤紀錄' };
  const target = findUserByNickname(existing.nickname);
  if (!target || !adminMarketingCanAccessUser_(actor, target)) return { ok: false, error: '無首報獎金審核權限' };
  const result = ['approved', 'rejected'].indexOf(params.result) >= 0 ? params.result : '';
  const note = adminMarketingText_(params.note, 1800);
  if (!result) return { ok: false, error: '請選擇通過或不符合' };
  if (result === 'rejected' && !note) return { ok: false, error: '判定不符合時必須寫明原因' };
  const data = adminMarketingRecordObject_(existing);
  if (result === 'approved') {
    const eligibility = adminMarketingTrialBonusEligibility_(data);
    if (!eligibility.eligible) return { ok: false, error: eligibility.error };
    const identity = adminMarketingStudentIdentity_(data);
    const duplicateApproved = adminMarketingTrialRows_().some(function (row) {
      if (row.record_id === data.id) return false;
      const other = adminMarketingRecordObject_(row);
      return other.bonusStatus === 'approved' && adminMarketingStudentIdentity_(other) === identity;
    });
    if (duplicateApproved) return { ok: false, error: '此學生過去已有核准的首報獎金，不能重複發放' };
  }
  data.bonusStatus = result;
  data.bonusAmount = result === 'approved' ? ADMIN_MARKETING_TRIAL_BONUS_ : 0;
  data.bonusReviewedBy = actor.nickname;
  data.bonusReviewedAt = nowIso();
  data.bonusReviewNote = note;
  adminMarketingAppendTrialHistory_(data, data, actor, result === 'approved' ? '核准首報獎金 50 元' : '首報獎金不符合：' + note);
  const saved = upsertAdminMarketingRecord_('trial', existing.nickname, data, actor.nickname);
  updateRow(SHEET_NAMES.ADMIN_MARKETING_RECORDS, existing._row, { reviewed_at: data.bonusReviewedAt });
  return { ok: true, record: saved };
}

function saveAdminMarketingAssignment(params) {
  const actor = params.__actor;
  const nickname = String(params.nickname || '').trim();
  const target = findUserByNickname(nickname);
  if (!actor || !target || adminMarketingAssignments_(target).indexOf('admin-marketing') < 0 || !adminMarketingCanAccessUser_(actor, target)) {
    return { ok: false, error: '無主管交辦權限' };
  }
  let data = adminMarketingPayload_(params.assignment);
  data.id = adminMarketingText_(data.id, 180);
  const existing = data.id ? findObject(SHEET_NAMES.ADMIN_MARKETING_RECORDS, 'record_id', data.id) : null;
  if (!data.id) return { ok: false, error: '交辦事項編號遺失' };
  if (actor.nickname === target.nickname && actor.role !== 'admin') {
    if (!existing || existing.record_type !== 'assignment' || existing.nickname !== target.nickname) return { ok: false, error: '找不到可更新的交辦事項' };
    const original = adminMarketingRecordObject_(existing);
    data = Object.assign({}, original, {
      progress: Math.max(0, Math.min(100, Number(data.progress) || 0)),
      status: ['pending', 'in_progress', 'waiting', 'completed'].indexOf(data.status) >= 0 ? data.status : original.status,
      progressNote: adminMarketingText_(data.progressNote, 1800),
      actualDate: adminMarketingDate_(data.actualDate, false),
      evidence: adminMarketingAttachments_(data.evidence, data.status === 'completed'),
    });
    if (!data.progressNote) return { ok: false, error: '請填寫目前結果與下一步' };
  } else {
    if (!adminMarketingManagerCanReview_(actor)) return { ok: false, error: '只有行政美宣主管可建立交辦事項' };
    data.title = adminMarketingText_(data.title, 220);
    data.detail = adminMarketingText_(data.detail, 2400);
    data.date = adminMarketingDate_(data.date || todayStr(), true);
    data.dueDate = adminMarketingDate_(data.dueDate, true);
    data.priority = ['normal', 'high', 'urgent'].indexOf(data.priority) >= 0 ? data.priority : 'normal';
    data.status = ['pending', 'in_progress', 'waiting', 'completed'].indexOf(data.status) >= 0 ? data.status : 'pending';
    data.progress = Math.max(0, Math.min(100, Number(data.progress) || 0));
    data.evidence = adminMarketingAttachments_(data.evidence, false);
    if (!data.title || !data.detail) return { ok: false, error: '工作內容與交辦說明為必填' };
  }
  data.type = 'assignment';
  data.nickname = nickname;
  if (data.status === 'completed') {
    data.progress = 100;
    if (!data.actualDate) data.actualDate = todayStr();
  }
  const saved = upsertAdminMarketingRecord_('assignment', nickname, data, actor.nickname);
  return { ok: true, assignment: saved };
}

function reviewAdminMarketingRecord(params) {
  const actor = params.__actor;
  if (!adminMarketingManagerCanReview_(actor)) return { ok: false, error: '只有行政美宣主管可審查' };
  const existing = findObject(SHEET_NAMES.ADMIN_MARKETING_RECORDS, 'record_id', String(params.record_id || ''));
  if (!existing) return { ok: false, error: '找不到紀錄' };
  const target = findUserByNickname(existing.nickname);
  if (!target || !adminMarketingCanAccessUser_(actor, target)) return { ok: false, error: '無審查權限' };
  const data = adminMarketingRecordObject_(existing);
  data.reviewStatus = ['approved', 'needs_revision'].indexOf(params.result) >= 0 ? params.result : 'approved';
  data.reviewComment = adminMarketingText_(params.note, 2400);
  data.reviewedBy = actor.nickname;
  data.reviewedAt = nowIso();
  const saved = upsertAdminMarketingRecord_(existing.record_type, existing.nickname, data, actor.nickname);
  updateRow(SHEET_NAMES.ADMIN_MARKETING_RECORDS, existing._row, { reviewed_at: data.reviewedAt });
  const month = String(data.date || todayStr()).slice(0, 7);
  const conversationId = 'admin-marketing-message-' + existing.nickname + '-' + month;
  const messageId = 'admin-marketing-review-' + existing.record_id;
  const conversationRow = findObject(SHEET_NAMES.ADMIN_MARKETING_RECORDS, 'record_id', conversationId);
  const conversation = conversationRow ? adminMarketingRecordObject_(conversationRow) : {
    id: conversationId, type: 'message', nickname: existing.nickname,
    date: month + '-01', month: month, messages: [], status: 'active'
  };
  conversation.messages = (Array.isArray(conversation.messages) ? conversation.messages : []).filter(function (message) {
    return message.id !== messageId;
  });
  if (data.reviewComment) {
    conversation.messages.push({
      id: messageId, author: actor.nickname, role: actor.role,
      text: '針對 ' + data.date + ' 工作紀錄：' + data.reviewComment,
      at: data.reviewedAt
    });
  }
  const conversationSaved = (data.reviewComment || conversationRow)
    ? upsertAdminMarketingRecord_('message', existing.nickname, conversation, actor.nickname)
    : null;
  return { ok: true, record: saved, conversation: conversationSaved };
}

function saveAdminMarketingScore(params) {
  const actor = params.__actor;
  if (!adminMarketingManagerCanReview_(actor)) return { ok: false, error: '只有行政美宣主管可評分' };
  const nickname = String(params.nickname || '').trim();
  const target = findUserByNickname(nickname);
  if (!target || !adminMarketingCanAccessUser_(actor, target)) return { ok: false, error: '無評分權限' };
  const raw = adminMarketingPayload_(params.score);
  const month = String(raw.month || params.month || '').slice(0, 7);
  if (!/^\d{4}-\d{2}$/.test(month)) return { ok: false, error: '評分月份不正確' };
  const scores = raw.scores || {};
  const cleanedScores = {};
  let total = 0;
  ADMIN_MARKETING_KPI_.forEach(function (item) {
    const value = Math.max(0, Math.min(item.max, Number(scores[item.key]) || 0));
    cleanedScores[item.key] = value;
    total += value;
  });
  const data = {
    id: 'admin-marketing-score-' + nickname + '-' + month,
    type: 'score', nickname: nickname, date: month + '-01', month: month,
    scores: cleanedScores, total: total,
    comment: adminMarketingText_(raw.comment, 3000),
    status: raw.published === true ? 'published' : 'draft',
    published: raw.published === true,
  };
  if (data.published && !data.comment) return { ok: false, error: '公布評核前必須填寫具體評語' };
  const saved = upsertAdminMarketingRecord_('score', nickname, data, actor.nickname);
  return { ok: true, score: saved };
}

function addAdminMarketingMessage(params) {
  const actor = params.__actor;
  const nickname = String(params.nickname || '').trim();
  const target = findUserByNickname(nickname);
  if (!actor || !target || !adminMarketingCanAccessUser_(actor, target)) return { ok: false, error: '無對話權限' };
  const month = String(params.month || todayStr()).slice(0, 7);
  const text = adminMarketingText_(params.text, 2400);
  if (!text) return { ok: false, error: '請輸入訊息' };
  const id = 'admin-marketing-message-' + nickname + '-' + month;
  const existing = findObject(SHEET_NAMES.ADMIN_MARKETING_RECORDS, 'record_id', id);
  const data = existing ? adminMarketingRecordObject_(existing) : {
    id: id, type: 'message', nickname: nickname, date: month + '-01', month: month, messages: [], status: 'active'
  };
  data.messages = Array.isArray(data.messages) ? data.messages.slice(-99) : [];
  data.messages.push({ id: Utilities.getUuid(), author: actor.nickname, role: actor.role, text: text, at: nowIso() });
  const saved = upsertAdminMarketingRecord_('message', nickname, data, actor.nickname);
  return { ok: true, conversation: saved };
}
