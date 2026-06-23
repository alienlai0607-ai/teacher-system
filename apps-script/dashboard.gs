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
  const tier = calcBonus(kpiTotal, user.role);

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
  // 注意：teachers_count 改用 deptMembers（見上方）；month_avg 仍只算 teacher

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
