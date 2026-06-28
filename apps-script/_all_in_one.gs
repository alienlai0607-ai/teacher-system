/**
 * 布拉克星球 KPI 系統 - 合併版（All-in-One v3，已填 SHEET_ID）
 * 觸發詞：kpi系統
 * Sheet ID 已自動填入，直接貼上後執行 setupSheets() 即可
 * 合併日期：2026-05-21
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
      'phone', 'joined_at', 'last_login', 'notes', 'subtype', 'line_user_id'
    ],
    [SHEET_NAMES.LOGS]: [
      'log_id', 'date', 'nickname', 'department', 'role',
      'checkin_at', 'checkout_at',
      'kpi1_data', 'kpi2_data', 'kpi3_data', 'kpi4_data', 'kpi5_data', 'kpi6_data',
      'reflection', 'help_needed', 'help_content', 'attachments',
      'created_at', 'updated_at', 'locked'
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
      'score_late_count', 'late_penalty', 'bonus_granted',
      'manager_comment', 'interview_notes',
      'status', 'created_at', 'updated_at'
    ],
    [SHEET_NAMES.MANAGER_EVAL]: [
      'eval_id', 'year_month', 'nickname', 'evaluator',
      'self_m1', 'self_m2', 'self_m3', 'self_m4', 'self_m5', 'self_m6',
      'self_summary',
      'score_m1', 'score_m2', 'score_m3', 'score_m4', 'score_m5', 'score_m6',
      'score_okr', 'total_score', 'grade', 'bonus', 'bonus_granted',
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
      'type', 'url', 'description', 'created_at'
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
  };

  Object.entries(schemas).forEach(([name, headers]) => {
    let sheet = ss.getSheetByName(name);
    if (!sheet) {
      sheet = ss.insertSheet(name);
    }
    ensureHeaders(sheet, headers);  // 自動補缺欄（含舊表新增的 subtype 等）
  });

  // 預填初始使用者
  const usersSheet = ss.getSheetByName(SHEET_NAMES.USERS);
  if (usersSheet.getLastRow() === 1) {
    const now = new Date().toISOString();
    const rows = INITIAL_USERS.map(u => [
      u.nickname, '', u.role, u.department, u.status,
      '', now, '', '', u.subtype || ''
    ]);
    usersSheet.getRange(2, 1, rows.length, rows[0].length).setValues(rows);
  }

  // 預填 KPI 規則
  seedKpiConfig();

  Logger.log('Setup completed');
  return { ok: true };
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

  // 行政宣傳 KPI（美萱）
  const ADMIN_MARKETING_KPI = [
    { kpi: 1, max: 15, name: '社群內容產出', items: [
      { name: 'FB粉專貼文(週≥3篇)', max: 4 },
      { name: 'IG貼文與限動(週≥3篇+每日限動)', max: 4 },
      { name: '影片/Reels短影音(月≥2支)', max: 3 },
      { name: '內容品質與品牌一致性', max: 2 },
      { name: '節慶與時事連動', max: 2 },
    ]},
    { kpi: 2, max: 15, name: '社群成效與互動', items: [
      { name: '粉專追蹤數淨增(月≥30人)', max: 3 },
      { name: 'IG追蹤數淨增(月≥20人)', max: 3 },
      { name: '平均互動率', max: 3 },
      { name: '觸及人數成長(月對月)', max: 3 },
      { name: '私訊/留言回覆時效(2小時內)', max: 3 },
    ]},
    { kpi: 3, max: 15, name: '招生與轉換漏斗', items: [
      { name: '線上諮詢量', max: 3 },
      { name: '諮詢→體驗 轉換率(≥40%)', max: 4 },
      { name: '體驗→報名 轉換率(≥60%)', max: 4 },
      { name: '招生活動素材製作', max: 2 },
      { name: '招生數據紀錄與分析', max: 2 },
    ]},
    { kpi: 4, max: 10, name: '活動宣傳與現場支援', items: [
      { name: '活動預熱宣傳(前2週開跑)', max: 3 },
      { name: '活動直播/紀錄', max: 3 },
      { name: '活動後成果發布(72小時內)', max: 2 },
      { name: '活動現場行政支援', max: 2 },
    ]},
    { kpi: 5, max: 10, name: '設計與素材管理', items: [
      { name: '文宣設計品質', max: 3 },
      { name: '素材庫整理', max: 2 },
      { name: '品牌素材使用規範', max: 2 },
      { name: '跨部門設計需求支援', max: 3 },
    ]},
    { kpi: 6, max: 5, name: '個人工作態度與表現', items: [
      { name: '出勤/時間觀念', max: 3 },
      { name: '主動性/工作態度', max: 2 },
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
    headers.forEach((h, i) => obj[h] = row[i]);
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
  headers.forEach((h, i) => obj[h] = values[i]);
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

function deleteRow(name, rowNum) {
  if (rowNum <= 1) return; // 不刪表頭
  getSheet(name).deleteRow(rowNum);
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
 * 1. 前端用 Google Identity Services 取得 email
 * 2. 呼叫 whoami(email) 拿到使用者資料
 * 3. 若 email 沒對應，前端引導去「自我認領暱稱」頁面
 * 4. claimNickname(email, nickname) 把 email 寫入該暱稱
 */

function whoami(params) {
  const email = (params.email || '').toLowerCase().trim();
  if (!email) return { ok: false, error: 'missing email' };

  const user = findUserByEmail(email);
  if (!user) {
    return {
      ok: true,
      registered: false,
      email,
      msg: '此 Email 尚未綁定暱稱，請選擇您的暱稱'
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
      department: user.department,
      status: user.status
    }
  };
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
  const users = sheetToObjects(SHEET_NAMES.USERS);
  const available = users
    .filter(u => !u.email || String(u.email).trim() === '')
    .filter(u => u.status === 'active' || u.status === 'pending')
    .map(u => ({
      nickname: u.nickname,
      role: u.role,
      department: u.department
    }));
  return { ok: true, nicknames: available };
}

/**
 * 老師認領暱稱：把 email 寫入該暱稱
 */
function claimNickname(params) {
  const email = (params.email || '').toLowerCase().trim();
  const nickname = (params.nickname || '').trim();
  if (!email || !nickname) return { ok: false, error: 'missing email or nickname' };

  // 檢查暱稱是否存在且未被綁定
  const user = findUserByNickname(nickname);
  if (!user) return { ok: false, error: '此暱稱不存在' };
  if (user.email && String(user.email).trim() !== '') {
    return { ok: false, error: '此暱稱已被綁定其他帳號' };
  }

  // 檢查 email 是否已綁定其他暱稱
  const existing = findUserByEmail(email);
  if (existing) return { ok: false, error: '此 Email 已綁定暱稱：' + existing.nickname };

  // 寫入 email
  updateRow(SHEET_NAMES.USERS, user._row, {
    email,
    last_login: nowIso()
  });
  logSystem(nickname, 'claim_nickname', email, { nickname });

  return {
    ok: true,
    msg: '綁定成功',
    user: {
      nickname: user.nickname,
      email,
      role: user.role,
      department: user.department,
      status: user.status
    }
  };
}

/**
 * 列出所有使用者（admin 用）
 */
function listUsers(params) {
  // TODO: 權限檢查（呼叫者必須是 admin）
  const users = sheetToObjects(SHEET_NAMES.USERS);
  return { ok: true, users };
}

/**
 * admin 新增使用者
 */
function addUser(params) {
  const { nickname, role, department, email, phone, notes } = params;
  if (!nickname || !role || !department) {
    return { ok: false, error: 'missing required fields' };
  }
  if (!ROLES.includes(role)) return { ok: false, error: 'invalid role' };
  if (!DEPARTMENTS.includes(department)) return { ok: false, error: 'invalid department' };

  // 行政美編行銷必須有 subtype（general/marketing），否則 KPI_Config 查不到
  const subtype = role === 'admin_staff'
    ? (ADMIN_STAFF_SUBTYPES.includes(params.subtype) ? params.subtype : 'general')
    : '';

  // 檢查暱稱重複
  if (findUserByNickname(nickname)) {
    return { ok: false, error: '暱稱已存在' };
  }
  // 檢查 email 重複
  if (email && findUserByEmail(email)) {
    return { ok: false, error: 'Email 已綁定其他暱稱' };
  }

  appendRow(SHEET_NAMES.USERS, {
    nickname,
    email: email || '',
    role,
    department,
    status: 'active',
    phone: phone || '',
    joined_at: nowIso(),
    last_login: '',
    notes: notes || '',
    subtype
  });
  logSystem(params.operator || 'system', 'add_user', nickname, { role, department });

  return { ok: true, msg: '新增成功' };
}

/**
 * admin 更新使用者
 */
function updateUser(params) {
  const { nickname } = params;
  if (!nickname) return { ok: false, error: 'missing nickname' };
  const user = findUserByNickname(nickname);
  if (!user) return { ok: false, error: 'user not found' };

  const updates = {};
  ['email', 'role', 'department', 'status', 'phone', 'notes', 'subtype'].forEach(k => {
    if (params[k] !== undefined) updates[k] = params[k];
  });
  updateRow(SHEET_NAMES.USERS, user._row, updates);
  logSystem(params.operator || 'system', 'update_user', nickname, updates);

  return { ok: true, msg: '更新成功' };
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

  const log_id = 'LOG-' + String(date).replace(/-/g, '') + '-' + nickname;
  const existing = findObject(SHEET_NAMES.LOGS, 'log_id', log_id);

  // 鎖定檢查
  if (existing && existing.locked === true) {
    return { ok: false, error: '日誌已鎖定（過 24 小時），無法修改' };
  }

  const data = {
    log_id,
    date,
    nickname,
    department: user.department,
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
    locked: false
  };

  if (!existing) {
    data.created_at = nowIso();
    appendRow(SHEET_NAMES.LOGS, data);
  } else {
    updateRow(SHEET_NAMES.LOGS, existing._row, data);
  }

  // 處理附件 → 寫入 Evidence
  saveEvidenceFromLog(log_id, nickname, date, params.attachments);

  // 處理發文（如果是主管）→ 寫入 Posts
  if (user.role === 'manager' && params.posts && Array.isArray(params.posts)) {
    saveManagerPosts(nickname, user.department, date, params.posts);
  }

  logSystem(nickname, 'save_log', log_id, { date });

  return { ok: true, log_id, msg: '已儲存' };
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
  } else if (viewerUser.role === 'manager') {
    logs = logs.filter(l => l.department === viewerUser.department || l.nickname === viewer);
  }
  // admin 看全部

  // 條件過濾
  if (nickname) logs = logs.filter(l => l.nickname === nickname);
  if (department) logs = logs.filter(l => l.department === department);
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
      created_at: nowIso()
    });
  });
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
 * 拍照存證：把前端壓縮後的照片存進 Google Drive，回傳可公開檢視的網址
 * params: { nickname, date, kpi, mimeType, base64, description }
 * 資料夾結構：KPI證據 / 部門 / 暱稱 / 年月
 * 權限：知道連結即可檢視（檔名用 UUID 亂碼，實務上猜不到）
 */
function uploadPhoto(params) {
  const { nickname, date, kpi, mimeType, base64 } = params;
  if (!nickname || !base64) return { ok: false, error: 'missing nickname or base64' };

  const user = findUserByNickname(nickname);
  if (!user) return { ok: false, error: 'user not found' };

  const dateStr = String(date || todayStr());
  const ym = dateStr.slice(0, 7); // YYYY-MM
  const mt = mimeType || 'image/jpeg';
  const ext = mt.indexOf('png') >= 0 ? 'png' : 'jpg';

  // 資料夾：KPI證據 / 部門 / 暱稱 / 年月
  const root = getEvidenceRootFolder_();
  const deptF = getOrCreateChildFolder_(root, user.department || '未分部門');
  const userF = getOrCreateChildFolder_(deptF, nickname);
  const ymF = getOrCreateChildFolder_(userF, ym);

  const bytes = Utilities.base64Decode(base64);
  const filename = `K${kpi || 0}-${dateStr}-${Utilities.getUuid().slice(0, 8)}.${ext}`;
  const blob = Utilities.newBlob(bytes, mt, filename);
  const file = ymF.createFile(blob);
  try {
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  } catch (e) {
    // 部分帳號政策會擋公開分享，仍回傳網址（登入有權限者可看）
  }

  const fileId = file.getId();
  const url = 'https://drive.google.com/file/d/' + fileId + '/view';

  logSystem(nickname, 'upload_photo', fileId, { kpi, date: dateStr });
  return { ok: true, url, fileId };
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

  const week_id = 'WK-' + week_of + '-' + nickname;
  const existing = findObject(SHEET_NAMES.WEEKLY, 'week_id', week_id);
  const data = {
    week_id, week_of, nickname, department: user.department, role: user.role,
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
  } else if (viewerUser.role === 'manager') {
    list = list.filter(w => w.department === viewerUser.department || w.nickname === viewer);
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
  appendRow(SHEET_NAMES.FEEDBACK, {
    feedback_id: Utilities.getUuid(),
    log_id,
    from_nickname,
    to_nickname,
    content,
    tag: tag || '已知悉',
    created_at: nowIso(),
    read_at: ''
  });
  logSystem(from_nickname, 'add_feedback', log_id, { to: to_nickname, tag });
  return { ok: true };
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
    department: user.department,
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
  const { nickname, year_month } = params;
  if (!nickname || !year_month) return { ok: false, error: 'missing nickname or year_month' };

  const [year, month] = year_month.split('-').map(Number);
  const from = `${year}-${String(month).padStart(2, '0')}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const to = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

  const user = findUserByNickname(nickname);
  if (!user) return { ok: false, error: 'user not found' };

  // 1. 當月所有日誌
  const logs = sheetToObjects(SHEET_NAMES.LOGS)
    .filter(l => l.nickname === nickname && String(l.date) >= from && String(l.date) <= to);

  // 2. 附件證據（依 KPI 分類）
  const evidence = sheetToObjects(SHEET_NAMES.EVIDENCE)
    .filter(e => e.nickname === nickname && String(e.date) >= from && String(e.date) <= to);
  // 安親新制 KPI 項目順序與舊日報的 kpi_category 編號不同，需對應
  // 舊日報：1課業 2班級(含環境照) 3課程/專案 4群組 5親師 6態度
  // 安親新制：1課業 2專案 3班級 4親師 5態度 6班級環境整潔
  const anqinUser = isAnqinUser(user);
  const ANQIN_EVIDENCE_MAP = { 1: 1, 2: 6, 3: 2, 4: 4, 5: 4, 6: 5 };
  const evidenceByKpi = { 1: [], 2: [], 3: [], 4: [], 5: [], 6: [] };
  evidence.forEach(e => {
    let k = Number(e.kpi_category);
    if (anqinUser && ANQIN_EVIDENCE_MAP[k]) k = ANQIN_EVIDENCE_MAP[k];
    if (k >= 1 && k <= 6) evidenceByKpi[k].push(e);
  });
  // 證據以「天」計：環境整潔(KPI2)、教案歸檔(KPI3) 各算有幾天執行（同一天多張只算 1）
  const _evDay = {};
  evidence.forEach(e => {
    const k = Number(e.kpi_category), d = String(e.date);
    _evDay[d] = _evDay[d] || { env: false, lesson: false };
    if (k === 2) _evDay[d].env = true;
    if (k === 3) _evDay[d].lesson = true;
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
    department: user.department,
    summary: {
      log_count: logs.length,
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
 * 自動建議分數（依日誌頻率、證據數量、回饋標籤）
 */
function suggestKpiScores(user, logs, evidence, feedback, observations, postsByWeek) {
  const role = user.role;
  const anqin = isAnqinUser(user);
  // 安親 100 分制配分；其餘維持 70 分制
  const max = anqin
    ? { 1: 20, 2: 20, 3: 20, 4: 20, 5: 12, 6: 8 }
    : { 1: 15, 2: 15, 3: 10, 4: 10, 5: 15, 6: 5 };

  // 根據日誌完整度、證據數量、主管回饋標籤推算
  // 這只是建議，最終由評核者決定
  const result = {};
  const positive = feedback.filter(f => f.tag === '優秀表現').length;
  const negative = feedback.filter(f => f.tag === '需改進').length;

  for (let k = 1; k <= 6; k++) {
    const kEvidence = evidence.filter(e => Number(e.kpi_category) === k).length;
    const baseScore = Math.min(max[k], Math.round(max[k] * 0.8 + kEvidence * 0.5));
    let score = baseScore + positive - negative * 2;
    score = Math.max(0, Math.min(max[k], score));

    // 主管發文 KPI4 特別處理
    if (role === 'manager' && k === 4) {
      const weeksMet = Object.values(postsByWeek).filter(c => c >= 3).length;
      const totalWeeks = Math.max(1, Object.keys(postsByWeek).length || 4);
      const postScore = Math.round((weeksMet / totalWeeks) * 2);
      score = baseScore - 2 + postScore;
      score = Math.max(0, Math.min(max[k], score));
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
  const user = findUserByNickname(nickname);
  if (!user) return { ok: false, error: 'user not found' };

  const isManager = user.role === 'manager';
  const sheetName = isManager ? SHEET_NAMES.MANAGER_EVAL : SHEET_NAMES.TEACHER_EVAL;
  const prefix = isManager ? 'MEVAL' : 'EVAL';
  const eval_id = `${prefix}-${year_month}-${nickname}`;
  const existing = findObject(sheetName, 'eval_id', eval_id);

  const prefixK = isManager ? 'm' : 'k';
  let kpiTotal = 0;
  for (let i = 1; i <= 6; i++) {
    const v = Number(params[`score_${prefixK}${i}`] || 0);
    kpiTotal += v;
  }
  const anqin = isAnqinUser(user);
  // 安親：KPI 滿分 100、OKR 獨立另計（不納入總分）；其餘：KPI 70 + OKR 30
  const okrScore = anqin ? 0 : Number(params.score_okr || 0);
  const totalScore = kpiTotal + okrScore;

  // 等第與獎金（安親看 100 分級距，其餘看 70 分級距）
  let tier = calcBonusForUser(kpiTotal, user);

  // ===== 安親遲到扣分（獨立於 100 分之外）=====
  // 當月遲到累計 ≥3 次：自 KPI 總分「每次額外扣 5 分」或「直接降一個獎金等級」，擇重者
  let lateCount = 0, latePenalty = 0;
  if (anqin) {
    lateCount = Number(params.score_late_count || 0);
    if (lateCount >= 3) {
      const penaltyPoints = (lateCount - 2) * 5; // 第 3 次起才扣，每次 5 分
      const tierByPoints = calcBonusForUser(Math.max(0, kpiTotal - penaltyPoints), user); // 方案A：扣分
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
    bonus_granted: bonusGranted,
    manager_comment: params.manager_comment || params.boss_comment || '',
    interview_notes: params.interview_notes || '',
    status: params.status || 'draft',
    updated_at: nowIso()
  };

  // 自評與評分欄位
  for (let i = 1; i <= 6; i++) {
    if (params[`self_${prefixK}${i}`] !== undefined) data[`self_${prefixK}${i}`] = params[`self_${prefixK}${i}`];
    if (params[`score_${prefixK}${i}`] !== undefined) data[`score_${prefixK}${i}`] = params[`score_${prefixK}${i}`];
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
  const { nickname, year_month } = params;
  if (!nickname || !year_month) return { ok: false, error: 'missing fields' };
  const user = findUserByNickname(nickname);
  if (!user) return { ok: false, error: 'user not found' };
  const isManager = user.role === 'manager';
  const sheetName = isManager ? SHEET_NAMES.MANAGER_EVAL : SHEET_NAMES.TEACHER_EVAL;
  const prefix = isManager ? 'MEVAL' : 'EVAL';
  const eval_id = `${prefix}-${year_month}-${nickname}`;
  const e = findObject(sheetName, 'eval_id', eval_id);
  return { ok: true, eval: e };
}

function listEvals(params) {
  const { evaluator, year_month, role } = params;
  const sheetName = role === 'manager' ? SHEET_NAMES.MANAGER_EVAL : SHEET_NAMES.TEACHER_EVAL;
  let list = sheetToObjects(sheetName);
  if (evaluator) list = list.filter(e => e.evaluator === evaluator);
  if (year_month) list = list.filter(e => e.year_month === year_month);
  return { ok: true, evals: list };
}

function calcDeptAvg(department, year_month) {
  const evals = sheetToObjects(SHEET_NAMES.TEACHER_EVAL)
    .filter(e => e.year_month === year_month);
  const users = sheetToObjects(SHEET_NAMES.USERS);
  const deptTeachers = users.filter(u => u.department === department && u.role === 'teacher').map(u => u.nickname);
  const deptEvals = evals.filter(e => deptTeachers.includes(e.nickname));
  if (deptEvals.length === 0) return 0;
  const sum = deptEvals.reduce((s, e) => s + Number(e.total_score || 0), 0);
  return Math.round((sum / deptEvals.length) * 10) / 10;
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
  const ev = getEvalEvidence({ nickname, year_month: ym });
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
    department: user.department,
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
    const deptTeachers = users.filter(u => u.department === user.department && u.role === 'teacher');
    // 部門成員（含行政美編行銷，皆需每日填報）
    const deptMembers = users.filter(u => u.department === user.department && (u.role === 'teacher' || u.role === 'admin_staff'));
    const todayLogs = sheetToObjects(SHEET_NAMES.LOGS)
      .filter(l => l.date === today && l.department === user.department);
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
      department: user.department,
      date: today,
      teachers_count: deptMembers.length,
      submitted_count: submittedCount,
      help_count: helpCount,
      status,
      month_avg: avg
    };
  }

  if (user.role === 'admin') {
    const deptStats = DEPARTMENTS.filter(d => d !== '總部').map(dept => {
      const teachers = users.filter(u => u.department === dept && u.role === 'teacher');
      const manager = users.find(u => u.department === dept && u.role === 'manager');
      const todayLogs = sheetToObjects(SHEET_NAMES.LOGS)
        .filter(l => l.date === today && l.department === dept);
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
//  students.gs — 學生名冊（後台統一建，每位老師自己的班）
// ════════════════════════════════════════════════════════════

function listStudents(params) {
  const { teacher, department, includeInactive } = params || {};
  let list = sheetToObjects(SHEET_NAMES.STUDENTS);
  if (teacher) list = list.filter(s => s.teacher === teacher);
  if (department) list = list.filter(s => s.department === department);
  if (!includeInactive) list = list.filter(s => s.status !== 'inactive');
  list.sort((a, b) => String(a.name).localeCompare(String(b.name), 'zh-Hant'));
  return { ok: true, students: list };
}

function addStudent(params) {
  const { name, teacher } = params;
  if (!name || !teacher) return { ok: false, error: '缺少姓名或老師' };
  const t = findUserByNickname(teacher);
  if (!t) return { ok: false, error: '老師不存在：' + teacher };
  const dup = sheetToObjects(SHEET_NAMES.STUDENTS)
    .some(s => s.teacher === teacher && s.name === name && s.status !== 'inactive');
  if (dup) return { ok: false, error: '此老師班上已有同名學生' };

  appendRow(SHEET_NAMES.STUDENTS, {
    student_id: Utilities.getUuid(),
    name: String(name).trim(),
    teacher,
    department: t.department,
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
  if (params.teacher) {
    const t = findUserByNickname(params.teacher);
    if (t) updates.department = t.department;
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
  else if (vu.role === 'manager') scope = users.filter(u => u.department === vu.department).map(u => u.nickname);
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
    const nk = e.nickname, d = String(e.date), k = Number(e.kpi_category);
    if (k !== 2 && k !== 3) return;
    byPerson[nk] = byPerson[nk] || {};
    byPerson[nk][d] = byPerson[nk][d] || { date: d, env: 0, lesson: 0, urls: [] };
    if (k === 2) byPerson[nk][d].env++;
    if (k === 3) byPerson[nk][d].lesson++;
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
function canCreateTask_(role) {
  return role === 'admin' || role === 'manager' || role === 'admin_staff';
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

function addTask(params) {
  const { title, created_by } = params;
  if (!title) return { ok: false, error: '缺少事項標題' };
  const creator = findUserByNickname(created_by);
  if (!creator || !canCreateTask_(creator.role)) return { ok: false, error: '無建立事項權限' };

  let assignees = params.assignees;
  if (typeof assignees === 'string') assignees = assignees.split(',').map(s => s.trim()).filter(Boolean);
  if (!Array.isArray(assignees) || !assignees.length) return { ok: false, error: '請指定至少一位老師' };

  const due = params.due_date || todayStr();
  const now = nowIso();
  let created = 0;
  assignees.forEach(nk => {
    const u = findUserByNickname(nk);
    if (!u) return;
    appendRow(SHEET_NAMES.TASKS, {
      task_id: Utilities.getUuid(),
      title: String(title).trim(),
      detail: params.detail || '',
      assignee: nk,
      department: u.department,
      due_date: due,
      status: 'open',
      created_by: created_by,
      created_at: now,
      updated_at: now,
      done_at: ''
    });
    created++;
    if (params.notify !== false) notifyUser_(u, '🆕 你有新事項：' + title, (params.detail ? params.detail + '\n' : '') + '期限 ' + due);
  });
  logSystem(created_by, 'add_task', title, { assignees: assignees, due: due });
  return { ok: true, created: created };
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
  } else if (vu.role === 'manager') {
    list = list.filter(t => t.department === vu.department || t.assignee === viewer || t.created_by === viewer);
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
    UrlFetchApp.fetch('https://api.line.me/v2/bot/message/push', {
      method: 'post',
      contentType: 'application/json',
      headers: { Authorization: 'Bearer ' + token },
      payload: JSON.stringify({ to: userId, messages: [{ type: 'text', text: String(text) }] }),
      muteHttpExceptions: true
    });
    return true;
  } catch (e) { return false; }
}

// OneSignal Web Push（用暱稱當 external_id）。自動嘗試新版/舊版格式。
function oneSignalAttempts_(appId, key, externalId, title, message) {
  const link = 'https://teacher.blockplanetcamp.com/teacher/today.html?notify=1';
  return [
    { url: 'https://api.onesignal.com/notifications', auth: 'Key ' + key,
      body: { app_id: appId, target_channel: 'push', include_aliases: { external_id: [String(externalId)] }, headings: { en: title }, contents: { en: message }, url: link } },
    { url: 'https://onesignal.com/api/v1/notifications', auth: 'Basic ' + key,
      body: { app_id: appId, include_external_user_ids: [String(externalId)], headings: { en: title }, contents: { en: message }, url: link } }
  ];
}
function pushOneSignal_(externalId, title, message) {
  const props = PropertiesService.getScriptProperties();
  const appId = props.getProperty('ONESIGNAL_APP_ID');
  const key = props.getProperty('ONESIGNAL_REST_KEY');
  if (!appId || !key || !externalId) return false;
  const attempts = oneSignalAttempts_(appId, key, externalId, title, message);
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
  const attempts = oneSignalAttempts_(appId, key, ext, 'debug', 'debug push');
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
        const nk = m[1].trim();
        const u = findUserByNickname(nk);
        if (!u) {
          reply = '找不到暱稱「' + nk + '」，請確認後再試。';
        } else {
          updateRow(SHEET_NAMES.USERS, u._row, { line_user_id: userId });
          reply = '✅ ' + nk + ' 綁定成功！之後事項提醒會推播到這裡。';
        }
      } else {
        reply = '請輸入「綁定 你的暱稱」來接收事項提醒，例如：綁定 松鼠';
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
