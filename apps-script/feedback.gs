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
    const dateStr = String(log_id).replace(/^LOG-(\d{4})(\d{2})(\d{2})-.*$/, '$1/$2/$3');
    const title = isBoss ? ('💬 ' + from_nickname + ' 給你回饋') : ('💬 ' + from_nickname + ' 回覆了你');
    const body = (dateStr ? ('（' + dateStr + ' 日報）\n') : '') + String(content).slice(0, 120);
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
