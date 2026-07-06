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

    const ROUTES = {
      // 認證
      'ping': () => ({ ok: true, time: new Date().toISOString() }),
      'whoami': () => whoami(params),
      'claimNickname': () => claimNickname(params),
      'listAvailableNicknames': () => listAvailableNicknames(),

      // 使用者管理（admin）
      'listUsers': () => listUsers(params),
      'addUser': () => addUser(params),
      'updateUser': () => updateUser(params),
      'approveUser': () => approveUser(params),

      // 日誌
      'saveLog': () => saveLog(params),
      'getLog': () => getLog(params),
      'listLogs': () => listLogs(params),
      'getTodayLog': () => getTodayLog(params),
      'uploadPhoto': () => uploadPhoto(params),
      'getEvidenceLog': () => getEvidenceLog(params),
      'getMakeupQuota': () => getMakeupQuota(params),

      // 週報
      'saveWeekly': () => saveWeekly(params),
      'getWeekly': () => getWeekly(params),
      'listWeekly': () => listWeekly(params),

      // 回饋
      'addFeedback': () => addFeedback(params),
      'listFeedback': () => listFeedback(params),
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
      'debugPush': () => debugPush(params),
      'addTask': () => addTask(params),
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
    return jsonOut({ ok: false, error: err.message, stack: err.stack });
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
};

const DEPARTMENTS = ['永康教室', '北區教室', '才藝部門', '總部'];
// 安親部門：這些部門的「老師」改用 100 分制（才藝部門老師與所有主管維持舊制）
const ANQIN_DEPARTMENTS = ['永康教室', '北區教室'];
const ROLES = ['admin', 'manager', 'teacher', 'admin_staff'];
// admin_staff 子類型：'general'（行政總務）/ 'marketing'（行政宣傳）
const ADMIN_STAFF_SUBTYPES = ['general', 'marketing'];

const INITIAL_USERS = [
  { nickname: '柏翰',     role: 'admin',       department: '總部',     status: 'active' },
  { nickname: '酸酸',     role: 'manager',     department: '永康教室', status: 'active' },
  { nickname: '小魚',     role: 'manager',     department: '北區教室', status: 'active' },
  { nickname: '柳丁',     role: 'manager',     department: '才藝部門', status: 'active' },
  { nickname: '松鼠',     role: 'teacher',     department: '永康教室', status: 'active' },
  { nickname: '羊羊',     role: 'teacher',     department: '永康教室', status: 'active' },
  { nickname: '紅豆',     role: 'teacher',     department: '永康教室', status: 'active' },
  { nickname: '江江',     role: 'teacher',     department: '北區教室', status: 'active' },
  { nickname: '小明',     role: 'teacher',     department: '北區教室', status: 'active' },
  { nickname: '浩浩',     role: 'teacher',     department: '才藝部門', status: 'active' },
  { nickname: '毛毛',     role: 'teacher',     department: '才藝部門', status: 'active' },
  // 行政美編行銷（歸北區教室，由小魚評核）
  { nickname: '皮皮老師', role: 'admin_staff', department: '北區教室', status: 'active', subtype: 'marketing' },
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
    && ANQIN_DEPARTMENTS.indexOf(user.department) >= 0;
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
