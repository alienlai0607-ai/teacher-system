/**
 * 行政美宣正式資料層。
 * 以 record_type 分流每日工作、週二追蹤、環境、專案、主管交辦、評分與對話。
 */

const ADMIN_MARKETING_RECORD_TYPES_ = ['daily', 'tuesday', 'environment', 'project', 'assignment', 'score', 'message'];
const ADMIN_MARKETING_KPI_ = [
  { key: 'daily', label: '每日行政與訊息處理', max: 20 },
  { key: 'promotion', label: '每週美宣產出與完成證據', max: 25 },
  { key: 'followup', label: '繳費與家長事項追蹤', max: 15 },
  { key: 'deadline', label: '期限與活動專案管理', max: 20 },
  { key: 'environment', label: '環境、公告與素材管理', max: 10 },
  { key: 'supervisor', label: '正確性、主動回報與溝通', max: 10 },
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
  if (!data.messages.parentChecked || !data.messages.officialLineChecked || !data.messages.groupChecked) {
    throw new Error('請完成家長訊息、官方 LINE 與班級群組確認');
  }
  if (data.messages.unresolved && !data.messages.reported) throw new Error('有待主管確認事項時，必須勾選已主動回報');
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
    if (!cleaned.category || !cleaned.title || !cleaned.completedToday) throw new Error('每項工作都要填寫類型、內容與今日完成進度');
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
  data.status = ['planning', 'active', 'completed', 'paused'].indexOf(data.status) >= 0 ? data.status : 'planning';
  if (!data.title || !data.projectType) throw new Error('專案名稱與活動類型為必填');
  const stageNames = ['企劃', '素材準備', '文案', '美宣', '主管審核', '修改', '排程', '發布'];
  const source = Array.isArray(data.stages) ? data.stages : [];
  data.stages = stageNames.map(function (name, index) {
    const raw = source[index] || source.filter(function (item) { return item.name === name; })[0] || {};
    const status = ['pending', 'active', 'completed'].indexOf(raw.status) >= 0 ? raw.status : 'pending';
    const dueDate = adminMarketingDate_(raw.dueDate, false);
    const actualDate = adminMarketingDate_(raw.actualDate, false);
    if ((status === 'active' || status === 'completed') && !dueDate) throw new Error(name + '階段必須設定完成日期');
    if (status === 'completed' && !actualDate) throw new Error(name + '階段完成時必須填寫實際完成日期');
    return { name: name, status: status, dueDate: dueDate, actualDate: actualDate, note: adminMarketingText_(raw.note, 800) };
  });
  data.evidence = adminMarketingAttachments_(data.evidence, data.status === 'completed');
  return data;
}

function validateAdminMarketingRecord_(type, value) {
  if (ADMIN_MARKETING_RECORD_TYPES_.indexOf(type) < 0) throw new Error('行政美宣紀錄類型不正確');
  const data = adminMarketingPayload_(value);
  data.id = adminMarketingText_(data.id, 180);
  data.type = type;
  if (!data.id) throw new Error('紀錄編號遺失');
  if (type === 'daily') return validateAdminMarketingDaily_(data);
  if (type === 'tuesday') return validateAdminMarketingTuesday_(data);
  if (type === 'environment') return validateAdminMarketingEnvironment_(data);
  if (type === 'project') return validateAdminMarketingProject_(data);
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

function saveAdminMarketingRecord(params) {
  const actor = params.__actor;
  const nickname = String(params.nickname || actor && actor.nickname || '').trim();
  const target = findUserByNickname(nickname);
  if (!actor || !target || adminMarketingAssignments_(target).indexOf('admin-marketing') < 0 ||
      (actor.role !== 'admin' && actor.nickname !== target.nickname)) {
    return { ok: false, error: '只能儲存自己的行政美宣紀錄' };
  }
  const type = String(params.record_type || '');
  if (['daily', 'tuesday', 'environment', 'project'].indexOf(type) < 0) return { ok: false, error: '此紀錄類型不可由行政端儲存' };
  const saved = upsertAdminMarketingRecord_(type, nickname, validateAdminMarketingRecord_(type, params.record), actor.nickname);
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
  return { ok: true, record: saved };
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
