/**
 * 行政美宣正式資料層。
 * 以 record_type 分流每日工作、週二追蹤、環境、專案、主管交辦、評分與對話。
 */

const ADMIN_MARKETING_RECORD_TYPES_ = ['daily', 'daily_check', 'tuesday', 'environment', 'project', 'trial', 'trial_day', 'assignment', 'score', 'message'];
const ADMIN_MARKETING_TRIAL_BONUS_ = 50;
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
  const contact = adminMarketingText_(data && data.contactRef, 160).replace(/[\s\-()]/g, '').toLowerCase();
  return name && contact ? name + '|' + contact : '';
}

function adminMarketingTrialBonusEligibility_(data) {
  if (!data || data.status !== 'converted') return { eligible: false, error: '尚未完成首次一期報名' };
  if (data.firstEnrollment !== true) return { eligible: false, error: '不是首次正式報名' };
  if (!data.enrollmentDate || !data.paymentDate || !data.enrollmentCourse) {
    return { eligible: false, error: '報名、繳費日期或正式課程尚未完整' };
  }
  if (!Array.isArray(data.followups) || !data.followups.length) return { eligible: false, error: '尚未留下家長追蹤紀錄' };
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
  data.contactRef = adminMarketingText_(data.contactRef, 160);
  data.interest = ['high', 'medium', 'low', 'unknown'].indexOf(data.interest) >= 0 ? data.interest : 'unknown';
  data.owner = adminMarketingText_(data.owner || data.nickname, 160);
  data.note = adminMarketingText_(data.note, 1800);
  data.nextFollowupDate = adminMarketingDate_(data.nextFollowupDate, false);
  data.status = ['waiting_contact', 'contacted', 'considering', 'followup_scheduled', 'converted', 'not_enrolled'].indexOf(data.status) >= 0
    ? data.status : 'waiting_contact';
  if (!data.studentName || !data.course || !data.teacher || !data.contactRef || !data.owner) {
    throw new Error('學生姓名、試上課程、授課老師、家長識別資料與負責人皆為必填');
  }
  if (['waiting_contact', 'contacted', 'considering', 'followup_scheduled'].indexOf(data.status) >= 0 && !data.nextFollowupDate) {
    throw new Error('尚未結案的試上學生必須設定下一次追蹤日期');
  }
  if (data.nextFollowupDate && data.nextFollowupDate < todayStr()) throw new Error('下一次追蹤日期不可早於今天');
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
    if (data.firstEnrollment && !data.followups.length) throw new Error('首報獎金需至少有一筆家長追蹤紀錄');
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
    if (!original && data.date < todayStr()) {
      if (!managerTrialEntry || !data.lateReason) return { ok: false, error: '過去日期屬補登；請由小魚或柏翰填寫原因' };
    }
    const duplicate = adminMarketingFindDuplicateTrial_('', data, data.id);
    if (duplicate) return { ok: false, error: '此學生已有試上追蹤紀錄，請更新原紀錄，不要重複新增' };
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
    const identity = adminMarketingTrialIdentity_(data);
    const duplicateApproved = adminMarketingTrialRows_().some(function (row) {
      if (row.record_id === data.id) return false;
      const other = adminMarketingRecordObject_(row);
      return other.bonusStatus === 'approved' && adminMarketingTrialIdentity_(other) === identity;
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
