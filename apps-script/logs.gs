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
    locked: false,
    is_makeup: isMakeup === true,
    submitted_at: (existing && existing.submitted_at) || ''
  };

  // 正式提交（非草稿自動存）：首次提交蓋時間戳並通知主管+老闆
  const firstSubmit = params.submitted === true && !data.submitted_at;
  if (firstSubmit) data.submitted_at = nowIso();

  if (!existing) {
    data.created_at = nowIso();
    appendRow(SHEET_NAMES.LOGS, data);
  } else {
    updateRow(SHEET_NAMES.LOGS, existing._row, data);
  }

  if (firstSubmit) notifyLogSubmitted_(user, String(date), isMakeup === true, data.help_needed);

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

/** 日報正式提交 → 即時推播給部門主管 + admin（LINE + OneSignal） */
function notifyLogSubmitted_(user, date, isMakeup, helpNeeded) {
  try {
    const recipients = sheetToObjects(SHEET_NAMES.USERS).filter(u =>
      u.status === 'active' && u.nickname !== user.nickname &&
      (u.role === 'admin' || (u.role === 'manager' && u.department === user.department)));
    const title = '📥 ' + user.nickname + ' 已提交日報' + (isMakeup ? '（補繳）' : '');
    const body = (user.department || '') + '｜' + date + (helpNeeded ? '\n⚠️ 需要主管協助' : '');
    recipients.forEach(r => { try { notifyUser_(r, title, body); } catch (e) { /* 單人推播失敗不影響其他人 */ } });
  } catch (e) { /* 通知失敗不影響日誌儲存 */ }
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
