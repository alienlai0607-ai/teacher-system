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
