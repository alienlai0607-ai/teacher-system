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
