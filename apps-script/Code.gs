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
      'reviewTalentPrep': () => reviewTalentPrep(params),
      'updateTalentAppStatus': () => updateTalentAppStatus(params),
      'saveTalentScore': () => saveTalentScore(params),
      'addTalentMessage': () => addTalentMessage(params),
      'approveTalentBonus': () => approveTalentBonus(params),

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
};

const DEPARTMENTS = ['東橋教室', '北區教室', '才藝部門', '總部'];
// 安親部門：這些部門的「老師」改用 100 分制（才藝部門老師與所有主管維持舊制）
const ANQIN_DEPARTMENTS = ['東橋教室', '北區教室'];
const ROLES = ['admin', 'manager', 'teacher', 'admin_staff'];
// admin_staff 子類型：'general'（行政總務）/ 'marketing'（行政宣傳）
const ADMIN_STAFF_SUBTYPES = ['general', 'marketing'];

const INITIAL_USERS = [
  { nickname: '柏翰',     role: 'admin',       department: '總部',     status: 'active', employment_type: 'admin', work_assignments: ['anqin-manager', 'talent-payroll'] },
  { nickname: '酸酸',     role: 'manager',     department: '東橋教室', status: 'active', employment_type: 'manager', work_assignments: ['anqin-manager'] },
  { nickname: '小魚',     role: 'manager',     department: '北區教室', status: 'active', employment_type: 'manager', work_assignments: ['anqin-manager', 'talent-payroll'] },
  { nickname: '柳丁',     role: 'manager',     department: '才藝部門', status: 'pending', employment_type: 'manager', work_assignments: ['talent-manager'] },
  { nickname: '松鼠',     role: 'teacher',     department: '東橋教室', status: 'active' },
  { nickname: '羊羊',     role: 'teacher',     department: '東橋教室', status: 'active' },
  { nickname: '紅豆',     role: 'teacher',     department: '東橋教室', status: 'active', employment_type: 'pt', work_assignments: ['anqin-teacher', 'talent-pt'] },
  { nickname: '江江',     role: 'teacher',     department: '北區教室', status: 'active' },
  { nickname: '小明',     role: 'teacher',     department: '北區教室', status: 'active', employment_type: 'pt', work_assignments: ['anqin-teacher', 'talent-pt'] },
  { nickname: '浩浩',     role: 'teacher',     department: '才藝部門', status: 'pending', employment_type: 'fulltime', work_assignments: ['talent-fulltime'] },
  { nickname: '毛毛',     role: 'teacher',     department: '才藝部門', status: 'pending', employment_type: 'fulltime', work_assignments: ['talent-fulltime'] },
  // 行政美編行銷（歸北區教室，由小魚評核）
  { nickname: '皮皮老師', role: 'admin_staff', department: '北區教室', status: 'active', subtype: 'marketing', employment_type: 'pt', work_assignments: ['talent-pt'] },
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
