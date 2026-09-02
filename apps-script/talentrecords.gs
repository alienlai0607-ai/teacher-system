/**
 * 才藝 V2 正式資料層。
 * 一張 TalentRecords 以 record_type 分流課堂、備課、評分、對話與草稿；
 * 所有權限、PT 當日限制與鐘點計算都由後端重算，不能只信任前端。
 */

const TALENT_EFFECTIVE_DATE_ = '2026-09-01';

function ensureTalentRecordsSheet_() {
  const ss = getSS();
  let sheet = ss.getSheetByName(SHEET_NAMES.TALENT_RECORDS);
  if (!sheet) sheet = ss.insertSheet(SHEET_NAMES.TALENT_RECORDS);
  ensureHeaders(sheet, [
    'record_id', 'record_type', 'nickname', 'department', 'record_date',
    'year_month', 'status', 'data_json', 'created_by', 'updated_by',
    'created_at', 'updated_at', 'submitted_at'
  ]);
  return sheet;
}

function normalizeTalentNickname_(value) {
  return String(value || '').trim().replace(/\s+/g, '').replace(/(?:老師|主管)$/, '').toLowerCase();
}

function findTalentUser_(nickname) {
  const exact = findUserByNickname(String(nickname || '').trim());
  if (exact) return exact;
  const normalized = normalizeTalentNickname_(nickname);
  return sheetToObjects(SHEET_NAMES.USERS).find(function (user) {
    return normalizeTalentNickname_(user.nickname) === normalized;
  }) || null;
}

function talentAssignments_(user) {
  const explicit = parseUserListField_(user && user.work_assignments);
  if (explicit.length) return explicit;
  if (!user) return [];
  const department = normalizeDepartment_(user.department);
  if (user.role === 'admin') return ['anqin-manager', 'talent-payroll'];
  if (department === '才藝部門') {
    if (user.role === 'manager') return ['talent-manager'];
    return [String(user.employment_type || '').toLowerCase() === 'pt' ? 'talent-pt' : 'talent-fulltime'];
  }
  if (['東橋教室', '北區教室'].indexOf(department) >= 0) {
    return [user.role === 'manager' ? 'anqin-manager' : 'anqin-teacher'];
  }
  return [];
}

function userHasTalentWork_(user) {
  return talentAssignments_(user).some(function (assignment) {
    return ['talent-fulltime', 'talent-pt', 'talent-manager', 'talent-payroll'].indexOf(assignment) >= 0;
  });
}

function talentEmployment_(user) {
  const explicit = String(user && user.employment_type || '').toLowerCase();
  if (explicit) return explicit;
  const assignments = talentAssignments_(user);
  if (assignments.indexOf('talent-pt') >= 0) return 'pt';
  if (assignments.indexOf('talent-fulltime') >= 0) return 'fulltime';
  if (assignments.indexOf('talent-manager') >= 0) return 'manager';
  return user && user.role === 'admin' ? 'admin' : '';
}

function talentManagerCanReview_(actor) {
  return !!actor && actor.status === 'active' && (
    actor.role === 'admin' || talentAssignments_(actor).indexOf('talent-manager') >= 0
  );
}

function talentCanAccessUser_(actor, target) {
  if (!actor || !target || actor.status !== 'active' || target.status !== 'active') return false;
  if (actor.role === 'admin' || isGlobalManager_(actor) || actor.nickname === target.nickname) return true;
  if (talentAssignments_(actor).indexOf('talent-manager') >= 0 && userHasTalentWork_(target)) return true;
  return actor.role === 'manager' && sameDepartment_(actor.department, target.department);
}

function talentCanAccessHistoricalUser_(actor, target) {
  if (!actor || !target || actor.status !== 'active' || ['suspended', 'deleted'].indexOf(target.status) < 0) return false;
  if (actor.role === 'admin' || isGlobalManager_(actor)) return true;
  if (talentAssignments_(actor).indexOf('talent-manager') >= 0 && userHasTalentWork_(target)) return true;
  return actor.role === 'manager' && sameDepartment_(actor.department, target.department);
}

function talentCanAccessPendingUser_(actor, target) {
  if (!actor || !target || actor.status !== 'active' || target.status !== 'pending') return false;
  if (actor.role === 'admin' || isGlobalManager_(actor)) return true;
  if (talentAssignments_(actor).indexOf('talent-manager') >= 0 && userHasTalentWork_(target)) return true;
  return actor.role === 'manager' && sameDepartment_(actor.department, target.department);
}

function talentPublicUser_(user) {
  return {
    nickname: String(user.nickname || ''),
    role: String(user.role || ''),
    department: normalizeDepartment_(user.department),
    status: String(user.status || ''),
    deleted_at: user.deleted_at || '',
    employment_type: talentEmployment_(user),
    work_assignments: talentAssignments_(user),
    schedule_json: normalizeUserSchedule_(user.schedule_json),
    rest_days: normalizeRestDays_(user.rest_days),
  };
}

function talentSchedulesForDate_(user, date) {
  const weekday = new Date(String(date || '') + 'T12:00:00+08:00').getDay();
  return normalizeUserSchedule_(user && user.schedule_json).filter(function (item) {
    return Number(item.weekday) === weekday;
  });
}

function talentPayload_(value) {
  let snapshot;
  try { snapshot = JSON.parse(JSON.stringify(value || {})); }
  catch (error) { throw new Error('才藝資料格式不正確'); }
  function clean(item) {
    if (!item || typeof item !== 'object') return;
    if (Array.isArray(item)) {
      item.forEach(clean);
      return;
    }
    Object.keys(item).forEach(function (key) {
      if (key === 'dataUrl' || key === 'base64' || key === 'file') delete item[key];
      else clean(item[key]);
    });
  }
  clean(snapshot);
  return snapshot;
}

function talentAttachments_(items, required) {
  const list = Array.isArray(items) ? items.slice(0, 30) : [];
  const cleaned = list.map(function (item) {
    if (typeof item === 'string') return { fileName: item, url: '', fileId: '', mimeType: '' };
    const rawUrl = String(item.url || item.cloudUrl || '').slice(0, 500);
    const safeUrl = /^https:\/\/drive\.google\.com\//i.test(rawUrl) ? rawUrl : '';
    return {
      id: String(item.id || item.fileId || Utilities.getUuid()),
      fileName: String(item.fileName || item.name || '附件').slice(0, 160),
      url: safeUrl,
      fileId: String(item.fileId || '').slice(0, 160),
      mimeType: String(item.mimeType || item.type || '').slice(0, 120),
      category: String(item.category || '').slice(0, 80),
      fingerprint: String(item.fingerprint || '').slice(0, 160),
      size: Number(item.size || 0),
    };
  });
  if (required && (!cleaned.length || cleaned.some(function (item) { return !item.url; }))) {
    throw new Error('必填附件尚未完整上傳到雲端');
  }
  return cleaned;
}

function talentAppEvidence_(items, required) {
  const files = talentAttachments_(items, required);
  if (files.some(function (item) {
    return !/^image\//i.test(String(item.mimeType || '')) && !/\.(?:jpe?g|png|webp|gif|heic|heif)$/i.test(String(item.fileName || ''));
  })) {
    throw new Error('家長 APP 發布證據只接受圖片');
  }
  return files;
}

function talentRecordObject_(row) {
  const data = parseJsonField(row.data_json) || {};
  data.id = data.id || row.record_id;
  data.teacher = data.teacher || row.nickname;
  data.date = data.date || row.record_date;
  data.status = row.status || data.status;
  data.createdAt = data.createdAt || row.created_at;
  data.updatedAt = row.updated_at || data.updatedAt;
  return data;
}

function upsertTalentRecord_(type, nickname, data, actorNickname) {
  ensureTalentRecordsSheet_();
  const recordId = String(data.id || '').trim();
  if (!recordId) throw new Error('缺少才藝紀錄編號');
  const existing = findObject(SHEET_NAMES.TALENT_RECORDS, 'record_id', recordId);
  if (existing && (existing.record_type !== type || existing.nickname !== nickname)) {
    throw new Error('不可覆蓋其他人的才藝資料');
  }
  const now = nowIso();
  const user = findUserByNickname(nickname);
  const payload = talentPayload_(data);
  const json = JSON.stringify(payload);
  if (json.length > 45000) throw new Error('資料內容過大，請確認附件已改存雲端連結');
  upsertRow(SHEET_NAMES.TALENT_RECORDS, 'record_id', {
    record_id: recordId,
    record_type: type,
    nickname: nickname,
    department: normalizeDepartment_(user && user.department),
    record_date: String(data.date || '').slice(0, 10),
    year_month: String(data.month || data.date || '').slice(0, 7),
    status: String(data.status || 'draft'),
    data_json: json,
    created_by: existing ? existing.created_by : actorNickname,
    updated_by: actorNickname,
    created_at: existing ? existing.created_at : now,
    updated_at: now,
    submitted_at: data.status === 'submitted' ? (existing && existing.submitted_at || now) : (existing && existing.submitted_at || ''),
  });
  payload.updatedAt = now;
  if (!payload.createdAt) payload.createdAt = existing ? existing.created_at : now;
  return payload;
}

function removeTalentRecord_(recordId, nickname) {
  ensureTalentRecordsSheet_();
  const existing = findObject(SHEET_NAMES.TALENT_RECORDS, 'record_id', recordId);
  if (existing && (!nickname || existing.nickname === nickname)) deleteRow(SHEET_NAMES.TALENT_RECORDS, existing._row);
}

function getTalentWorkspaceData(params) {
  const actor = params.__actor || findUserByNickname(String(params.viewer || ''));
  if (!actor || actor.status !== 'active' || !userHasTalentWork_(actor)) {
    return { ok: false, error: '此帳號沒有才藝工作區權限' };
  }
  ensureTalentRecordsSheet_();
  const allUsers = sheetToObjects(SHEET_NAMES.USERS);
  const users = allUsers.filter(function (user) {
    return user.status === 'active' && userHasTalentWork_(user) && talentCanAccessUser_(actor, user);
  });
  const historicalUsers = allUsers.filter(function (user) {
    return userHasTalentWork_(user) && talentCanAccessHistoricalUser_(actor, user);
  });
  const pendingUsers = allUsers.filter(function (user) {
    return userHasTalentWork_(user) && talentCanAccessPendingUser_(actor, user);
  });
  const allowed = {};
  users.forEach(function (user) { allowed[user.nickname] = true; });
  historicalUsers.forEach(function (user) { allowed[user.nickname] = true; });
  const rows = sheetToObjects(SHEET_NAMES.TALENT_RECORDS).filter(function (row) { return allowed[row.nickname]; });
  const lessons = [];
  const preps = [];
  const scores = [];
  const conversations = [];
  let draft = null;
  rows.forEach(function (row) {
    const record = talentRecordObject_(row);
    if (row.record_type === 'lesson') lessons.push(record);
    else if (row.record_type === 'prep') preps.push(record);
    else if (row.record_type === 'score') scores.push(record);
    else if (row.record_type === 'conversation') conversations.push(record);
    else if (row.record_type === 'lesson_draft' && row.nickname === actor.nickname) draft = record.draft || null;
  });
  if (actor.role !== 'admin' && actor.role !== 'manager') {
    const publishedMonths = {};
    for (let index = scores.length - 1; index >= 0; index -= 1) {
      if (scores[index].published === true || scores[index].status === 'published') {
        publishedMonths[scores[index].month] = true;
        delete scores[index].history;
      }
      else scores.splice(index, 1);
    }
    for (let index = conversations.length - 1; index >= 0; index -= 1) {
      if (!publishedMonths[conversations[index].month]) conversations.splice(index, 1);
    }
  }
  lessons.sort(function (a, b) { return String(b.date || '').localeCompare(String(a.date || '')); });
  preps.sort(function (a, b) { return String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')); });
  return {
    ok: true,
    lessons: lessons,
    preps: preps,
    scores: scores,
    conversations: conversations,
    draft: draft,
    users: users.map(talentPublicUser_),
    pending_users: pendingUsers.map(talentPublicUser_),
    archived_users: historicalUsers.map(talentPublicUser_),
    settings: {
      ptStrictStart: (function () {
        const configured = PropertiesService.getScriptProperties().getProperty('TALENT_PT_STRICT_START') || TALENT_EFFECTIVE_DATE_;
        return configured > TALENT_EFFECTIVE_DATE_ ? configured : TALENT_EFFECTIVE_DATE_;
      })()
    }
  };
}

function talentLessonPay_(lesson, user) {
  if (lesson.lessonStatus === 'cancelled' || talentEmployment_(user) !== 'pt') {
    return { count: 0, rate: 0, amount: 0, tier: lesson.lessonStatus === 'cancelled' ? '停課' : '不適用', requiresReview: false };
  }
  const duration = Number(lesson.duration || 0);
  const count = Number(lesson.present || 0) + Number(lesson.makeup || 0);
  const isPartner = String(lesson.siteType || '') === 'partner';
  if (isPartner) return { count: count, rate: 600, amount: 900, tier: '合作校固定 1.5 小時', requiresReview: false };
  if (count < 2) return { count: count, rate: 0, amount: 0, tier: '低於開班人數', requiresReview: true };
  if (count <= 4) return { count: count, rate: 500, amount: Math.round(500 * duration), tier: '2-4 人', requiresReview: false };
  if (count <= 7) return { count: count, rate: 600, amount: Math.round(600 * duration), tier: '5-7 人', requiresReview: false };
  if (count <= 10) return { count: count, rate: 800, amount: Math.round(800 * duration), tier: '8-10 人', requiresReview: false };
  return { count: count, rate: 0, amount: 0, tier: '超過 10 人待主管確認', requiresReview: true };
}

function saveTalentDraft(params) {
  const actor = params.__actor;
  const nickname = String(params.nickname || actor && actor.nickname || '').trim();
  const user = findUserByNickname(nickname);
  if (!actor || !user || (!talentCanAccessUser_(actor, user)) || (actor.role !== 'admin' && actor.nickname !== nickname)) {
    return { ok: false, error: '無草稿儲存權限' };
  }
  const recordId = 'talent-lesson-draft-' + nickname;
  if (!params.draft) {
    removeTalentRecord_(recordId, nickname);
    return { ok: true, cleared: true };
  }
  const item = { id: recordId, teacher: nickname, date: String(params.draft.date || todayStr()).slice(0, 10), draft: talentPayload_(params.draft), status: 'draft' };
  const saved = upsertTalentRecord_('lesson_draft', nickname, item, actor.nickname);
  return { ok: true, draft: saved.draft, updatedAt: saved.updatedAt };
}

function saveTalentLesson(params) {
  const actor = params.__actor;
  const nickname = String(params.nickname || actor && actor.nickname || '').trim();
  const user = findUserByNickname(nickname);
  if (!actor || !user || !userHasTalentWork_(user) || (actor.role !== 'admin' && actor.nickname !== nickname)) {
    return { ok: false, error: '無課堂紀錄權限' };
  }
  const lesson = talentPayload_(params.lesson);
  if (!lesson.id) return { ok: false, error: '課堂紀錄編號遺失' };
  lesson.teacher = nickname;
  lesson.employment = talentEmployment_(user);
  lesson.date = String(lesson.date || '').slice(0, 10);
  lesson.lessonStatus = lesson.lessonStatus === 'cancelled' ? 'cancelled' : 'held';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(lesson.date) || lesson.date > todayStr()) return { ok: false, error: '課程日期不正確' };
  const employment = talentEmployment_(user);
  const userSchedules = employment === 'pt' ? normalizeUserSchedule_(user.schedule_json) : [];
  const dateSchedules = employment === 'pt' ? talentSchedulesForDate_(user, lesson.date) : [];
  let matchedSchedule = null;
  if (employment === 'pt') {
    if (!userSchedules.length) return { ok: false, error: '此 PT 帳號尚未設定固定排班，請先聯絡管理員' };
    const requestedScheduleKey = String(lesson.scheduleKey || '').trim();
    matchedSchedule = dateSchedules.filter(function (item) { return item.scheduleKey === requestedScheduleKey; })[0] || null;
    if (!matchedSchedule && !requestedScheduleKey && dateSchedules.length === 1) matchedSchedule = dateSchedules[0];
    if (!matchedSchedule) return { ok: false, error: '請選擇該日期原本安排的固定班次' };
    lesson.scheduleKey = matchedSchedule.scheduleKey;
    lesson.scheduleLabel = matchedSchedule.label;
    lesson.scheduleTime = matchedSchedule.time;
    lesson.siteType = matchedSchedule.siteType;
    lesson.site = matchedSchedule.site;
  }
  const initialExisting = findObject(SHEET_NAMES.TALENT_RECORDS, 'record_id', lesson.id);
  const initialLesson = initialExisting && initialExisting.record_type === 'lesson' && initialExisting.nickname === nickname
    ? talentRecordObject_(initialExisting) : null;
  ['reportUrl', 'reportFileId', 'reportFolderUrl', 'reportGeneratedAt', 'reportRevision'].forEach(function (key) {
    lesson[key] = initialLesson ? initialLesson[key] || '' : '';
  });
  if (initialLesson && initialLesson.createdAt) lesson.createdAt = initialLesson.createdAt;
  if (!initialExisting && lesson.lessonStatus === 'held' && lesson.date !== todayStr()) {
    return { ok: false, error: lesson.employment === 'pt' ? 'PT 正常課程只能在上課當日送出' : '正常課程請於上課當日送出' };
  }
  if (initialLesson && initialExisting.status === 'submitted') {
    if (String(initialLesson.date || '') !== todayStr()) return { ok: false, error: '已跨日的正式課堂不可修改' };
    if (String(initialLesson.date || '') !== lesson.date || initialLesson.lessonStatus !== lesson.lessonStatus) {
      return { ok: false, error: '補充紀錄時不可更換日期或上課狀態' };
    }
    if (employment === 'pt' && String(initialLesson.scheduleKey || '') && initialLesson.scheduleKey !== lesson.scheduleKey) {
      return { ok: false, error: '補充紀錄時不可更換原班次' };
    }
  }
  if (lesson.lessonStatus === 'cancelled') {
    if (lesson.employment !== 'pt') return { ok: false, error: '目前停課補登只適用才藝 PT 排課' };
    if (!String(lesson.courseName || '').trim() || !String(lesson.cancellationReason || '').trim()) return { ok: false, error: '請填寫停課課程與原因' };
    lesson.duration = 0;
    lesson.expected = lesson.present = lesson.leave = lesson.absent = lesson.makeup = lesson.trial = 0;
    lesson.attendanceFiles = [];
    lesson.learningFiles = [];
    lesson.roomFiles = [];
    lesson.newCount = 0;
    lesson.renewalCount = 0;
    lesson.pay = 0;
    lesson.payRate = 0;
    lesson.payTier = '停課';
    lesson.appStatus = 'not_required';
    lesson.appFiles = [];
    lesson.appUpdatedAt = '';
    lesson.appPublishedAt = '';
    lesson.backfilled = lesson.date !== todayStr();
  } else {
    ['courseType', 'courseName', 'siteType', 'site', 'prepId', 'completed', 'response', 'issue', 'parentStatus'].forEach(function (key) {
      if (!String(lesson[key] || '').trim()) throw new Error('本堂必填內容不完整：' + key);
    });
    ['expected', 'present', 'leave', 'absent', 'makeup', 'trial'].forEach(function (key) {
      lesson[key] = Math.max(0, Math.floor(Number(lesson[key] || 0)));
    });
    if (lesson.expected !== lesson.present + lesson.leave + lesson.absent) throw new Error('應到正式人數必須等於正式實到、請假與未請假缺席合計');
    lesson.duration = Number(lesson.duration || 0);
    if (lesson.siteType === 'partner') lesson.duration = 1.5;
    if ([1, 1.5].indexOf(lesson.duration) < 0) throw new Error('授課時數只可選 1 或 1.5 小時');
    const prepRow = findObject(SHEET_NAMES.TALENT_RECORDS, 'record_id', String(lesson.prepId || ''));
    if (!prepRow || prepRow.record_type !== 'prep' || prepRow.nickname !== nickname) {
      throw new Error('請選擇本人的備課檔案');
    }
    const selectedPrep = talentRecordObject_(prepRow);
    talentAttachments_(selectedPrep.materials, true);
    lesson.attendanceFiles = talentAttachments_(lesson.attendanceFiles, true);
    lesson.learningFiles = talentAttachments_(lesson.learningFiles, true);
    lesson.roomFiles = talentAttachments_(lesson.roomFiles, true);
    if (lesson.roomDone !== true) throw new Error('請確認教室與器材已完成復原');
    if (lesson.parentStatus === 'followup' && !String(lesson.parentFollowup || '').trim()) throw new Error('請填寫個別追蹤與下一步');
    lesson.newCount = lesson.siteType === 'self' && lesson.employment === 'fulltime' ? Math.max(0, Math.floor(Number(lesson.newCount || 0))) : 0;
    lesson.renewalCount = lesson.siteType === 'self' ? Math.max(0, Math.floor(Number(lesson.renewalCount || 0))) : 0;
    const pay = talentLessonPay_(lesson, user);
    lesson.pay = pay.amount;
    lesson.payRate = pay.rate;
    lesson.payTier = pay.tier;
    lesson.payRequiresReview = pay.requiresReview;
    if (lesson.siteType === 'partner') {
      lesson.appStatus = 'not_required';
      lesson.appFiles = [];
      lesson.appUpdatedAt = '';
      lesson.appPublishedAt = '';
    } else {
      lesson.appFiles = talentAppEvidence_(initialLesson && initialLesson.appFiles || lesson.appFiles || [], false);
      lesson.appStatus = lesson.appFiles.length ? 'published' : 'pending';
      lesson.appUpdatedAt = initialLesson && initialLesson.appUpdatedAt || lesson.appUpdatedAt || '';
      lesson.appPublishedAt = initialLesson && initialLesson.appPublishedAt || lesson.appPublishedAt || '';
    }
    lesson.backfilled = false;
    const bonusCountsChanged = initialLesson && (
      Number(initialLesson.newCount || 0) !== lesson.newCount || Number(initialLesson.renewalCount || 0) !== lesson.renewalCount
    );
    if (bonusCountsChanged) {
      lesson.bonusApproval = (lesson.newCount || lesson.renewalCount) ? 'pending' : 'not_required';
      lesson.approvedNewCount = 0;
      lesson.approvedRenewalCount = 0;
      lesson.bonusApprovedBy = '';
      lesson.bonusApprovedAt = '';
      lesson.bonusApprovalNote = '';
    } else if (!lesson.bonusApproval) {
      lesson.bonusApproval = (lesson.newCount || lesson.renewalCount) ? 'pending' : 'not_required';
    }
  }
  lesson.status = 'submitted';
  lesson.contentRevision = nowIso();
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) return { ok: false, error: '系統正在儲存另一筆紀錄，請稍後再送出' };
  let saved;
  try {
    const existing = findObject(SHEET_NAMES.TALENT_RECORDS, 'record_id', lesson.id);
    if (existing && existing.record_type === 'lesson' && existing.nickname === nickname && existing.status === 'submitted') {
      if (!String(lesson.updatedAt || '').trim()) return { ok: true, lesson: talentRecordObject_(existing), duplicate: true };
      if (String(lesson.updatedAt) !== String(existing.updated_at || '')) {
        return { ok: false, error: '這筆紀錄已在其他裝置更新，請重新整理後再補充' };
      }
    }
    if (!existing && employment === 'pt') {
      const firstScheduleKey = dateSchedules.length ? dateSchedules[0].scheduleKey : '';
      const duplicate = sheetToObjects(SHEET_NAMES.TALENT_RECORDS).some(function (row) {
        if (row.record_type !== 'lesson' || row.nickname !== nickname || String(row.record_date || '') !== lesson.date || row.status !== 'submitted') return false;
        const recorded = talentRecordObject_(row);
        return recorded.scheduleKey ? recorded.scheduleKey === lesson.scheduleKey : firstScheduleKey === lesson.scheduleKey;
      });
      if (duplicate) return { ok: false, error: '這個日期與班次已有送出紀錄，不能重複申報' };
    }
    saved = upsertTalentRecord_('lesson', nickname, lesson, actor.nickname);
    removeTalentRecord_('talent-lesson-draft-' + nickname, nickname);
  } finally {
    lock.releaseLock();
  }
  let pdf = null;
  let warning = '';
  try {
    pdf = generateTalentLessonPdf_(saved, user);
    if (pdf && pdf.url) {
      const pdfLock = LockService.getScriptLock();
      if (!pdfLock.tryLock(10000)) throw new Error('日報檔案已建立，但連結正在等候系統回寫');
      try {
        const latestRow = findObject(SHEET_NAMES.TALENT_RECORDS, 'record_id', lesson.id);
        if (!latestRow || latestRow.record_type !== 'lesson' || latestRow.nickname !== nickname) throw new Error('找不到剛儲存的課堂紀錄');
        const latest = talentRecordObject_(latestRow);
        latest.reportUrl = pdf.url;
        latest.reportFileId = pdf.fileId;
        latest.reportFolderUrl = pdf.folderUrl || latest.reportFolderUrl || '';
        latest.reportGeneratedAt = nowIso();
        latest.reportRevision = saved.contentRevision;
        const persisted = upsertTalentRecord_('lesson', nickname, latest, actor.nickname);
        saved = persisted;
        if (String(persisted.contentRevision || '') !== String(persisted.reportRevision || '')) {
          warning = '課堂內容已在另一台裝置更新；文字已保留，PDF 將由系統自動補成最新版本。';
        }
      } finally {
        pdfLock.releaseLock();
      }
      notifyTalentLesson_(saved, user, pdf.url);
    }
  } catch (error) {
    warning = '課堂紀錄已儲存，但 PDF／通知稍後需重試：' + String(error.message || error);
  }
  logSystem(nickname, 'save_talent_lesson', lesson.id, { date: lesson.date, status: lesson.lessonStatus });
  return { ok: true, lesson: saved, reportUrl: saved && saved.reportUrl || '', warning: warning };
}

function saveTalentPrep(params) {
  const actor = params.__actor;
  const nickname = String(params.nickname || actor && actor.nickname || '').trim();
  const user = findUserByNickname(nickname);
  if (!actor || !user || !userHasTalentWork_(user) || (actor.role !== 'admin' && actor.nickname !== nickname)) {
    return { ok: false, error: '無備課建檔權限' };
  }
  const prep = talentPayload_(params.prep);
  if (!prep.id || !String(prep.courseType || '').trim() || !String(prep.courseName || '').trim()) {
    return { ok: false, error: '請完成課程類型與課程名稱' };
  }
  prep.teacher = nickname;
  prep.title = String(prep.title || prep.courseName).trim();
  prep.status = 'ready';
  prep.date = String(prep.date || todayStr()).slice(0, 10);
  prep.materials = talentAttachments_(prep.materials, true);
  if (!prep.materials.length) return { ok: false, error: '請至少上傳一份教案或教材資料' };
  const normalizedTitle = String(prep.courseName || '').trim().replace(/\s+/g, ' ').toLowerCase();
  const normalizedCourseType = String(prep.courseType || '').trim().replace(/\s+/g, ' ').toLowerCase();
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) return { ok: false, error: '系統正在儲存其他備課檔案，請稍後再試' };
  let saved;
  try {
    const duplicate = sheetToObjects(SHEET_NAMES.TALENT_RECORDS).some(function (row) {
      if (row.record_type !== 'prep' || row.nickname !== nickname || String(row.record_id || '') === String(prep.id)) return false;
      const recorded = talentRecordObject_(row);
      return String(recorded.courseName || recorded.title || '').trim().replace(/\s+/g, ' ').toLowerCase() === normalizedTitle
        && String(recorded.courseType || '').trim().replace(/\s+/g, ' ').toLowerCase() === normalizedCourseType;
    });
    if (duplicate) return { ok: false, error: '已有相同課程類型與名稱的備課檔案，請直接編輯原檔案' };
    saved = upsertTalentRecord_('prep', nickname, prep, actor.nickname);
  } finally {
    lock.releaseLock();
  }
  logSystem(nickname, 'save_talent_prep', prep.id, { status: prep.status });
  return { ok: true, prep: saved };
}

function deleteTalentPrep(params) {
  const actor = params.__actor;
  const prepId = String(params.prep_id || '').trim();
  if (!actor || actor.status !== 'active' || !prepId) return { ok: false, error: '無備課檔案刪除權限' };
  ensureTalentRecordsSheet_();
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) return { ok: false, error: '系統正在處理其他備課檔案，請稍後再試' };
  try {
    const existing = findObject(SHEET_NAMES.TALENT_RECORDS, 'record_id', prepId);
    if (!existing) return { ok: true, removed: false };
    if (existing.record_type !== 'prep') return { ok: false, error: '這筆資料不是備課檔案' };
    if (actor.role !== 'admin' && existing.nickname !== actor.nickname) {
      return { ok: false, error: '不可刪除其他老師的備課檔案' };
    }
    if (normalizeTalentNickname_(params.confirmation_name) !== normalizeTalentNickname_(existing.nickname)) {
      return { ok: false, error: '姓名確認不正確，未刪除備課檔案' };
    }
    const usageCount = sheetToObjects(SHEET_NAMES.TALENT_RECORDS).filter(function (row) {
      if (row.record_type !== 'lesson' || row.nickname !== existing.nickname) return false;
      return String(talentRecordObject_(row).prepId || '') === prepId;
    }).length;
    if (usageCount) {
      return { ok: false, error: '已有 ' + usageCount + ' 筆課堂紀錄使用這份檔案，為保留歷史資料不能刪除' };
    }
    deleteRow(SHEET_NAMES.TALENT_RECORDS, existing._row);
  } finally {
    lock.releaseLock();
  }
  logSystem(actor.nickname, 'delete_talent_prep', prepId, { owner: actor.nickname });
  return { ok: true, removed: true };
}

function reviewTalentPrep(params) {
  return { ok: false, error: '備課檔案儲存後即可使用，不需要主管審核' };
}

function updateTalentAppStatus(params) {
  const actor = params.__actor;
  const nickname = String(params.nickname || actor && actor.nickname || '').trim();
  const row = findObject(SHEET_NAMES.TALENT_RECORDS, 'record_id', String(params.lesson_id || ''));
  if (!row || row.record_type !== 'lesson' || row.nickname !== nickname) return { ok: false, error: '找不到本人課堂紀錄' };
  if (!actor || (actor.role !== 'admin' && actor.nickname !== nickname)) return { ok: false, error: '只能更新自己的 APP 狀態' };
  const lesson = talentRecordObject_(row);
  if (lesson.lessonStatus === 'cancelled' || lesson.siteType === 'partner') {
    lesson.appStatus = 'not_required';
    lesson.appFiles = [];
    lesson.appUpdatedAt = '';
    lesson.appPublishedAt = '';
    return { ok: true, lesson: upsertTalentRecord_('lesson', nickname, lesson, actor.nickname), exempt: true };
  }
  if (params.status !== 'published') return { ok: false, error: '請上傳發布完成截圖後再確認' };
  lesson.appFiles = talentAppEvidence_(params.app_files, true);
  lesson.appStatus = 'published';
  lesson.appUpdatedAt = nowIso();
  lesson.appPublishedAt = lesson.appUpdatedAt;
  lesson.contentRevision = lesson.appUpdatedAt;
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) return { ok: false, error: '系統正在儲存其他課堂，請稍後重試' };
  let saved;
  try {
    saved = upsertTalentRecord_('lesson', nickname, lesson, actor.nickname);
  } finally {
    lock.releaseLock();
  }

  let warning = '';
  try {
    const user = findUserByNickname(nickname);
    const pdf = generateTalentLessonPdf_(saved, user);
    const pdfLock = LockService.getScriptLock();
    if (!pdfLock.tryLock(10000)) throw new Error('APP 證據已儲存，日報連結稍後更新');
    try {
      const latestRow = findObject(SHEET_NAMES.TALENT_RECORDS, 'record_id', saved.id);
      const latest = latestRow ? talentRecordObject_(latestRow) : null;
      if (!latest || latest.contentRevision !== saved.contentRevision) throw new Error('課堂已在其他裝置更新，日報將由系統自動補成最新版本');
      latest.reportUrl = pdf.url;
      latest.reportFileId = pdf.fileId;
      latest.reportFolderUrl = pdf.folderUrl || latest.reportFolderUrl || '';
      latest.reportGeneratedAt = nowIso();
      latest.reportRevision = latest.contentRevision;
      saved = upsertTalentRecord_('lesson', nickname, latest, actor.nickname);
    } finally {
      pdfLock.releaseLock();
    }
  } catch (error) {
    warning = 'APP 證據已儲存；雲端 PDF 稍後自動更新：' + String(error.message || error);
  }
  logSystem(actor.nickname, 'save_talent_app_evidence', lesson.id, { teacher: nickname, files: lesson.appFiles.length });
  return { ok: true, lesson: saved, warning: warning };
}

function saveTalentScore(params) {
  const actor = params.__actor;
  if (!talentManagerCanReview_(actor)) return { ok: false, error: '只有才藝主管可評分' };
  let nickname = String(params.nickname || '').trim();
  const target = findTalentUser_(nickname);
  if (!target || talentEmployment_(target) !== 'fulltime' || !talentCanAccessUser_(actor, target)) return { ok: false, error: '找不到可評分的才藝正職' };
  nickname = target.nickname;
  const month = String(params.month || '').trim();
  if (!/^\d{4}-\d{2}$/.test(month)) return { ok: false, error: '評分月份不正確' };
  const score = talentPayload_(params.score);
  const maxima = { prep: 25, evidence: 25, communication: 20, attendance: 15, room: 10, improvement: 5 };
  const values = {};
  let total = 0;
  Object.keys(maxima).forEach(function (key) {
    const value = Number(score.scores && score.scores[key] || 0);
    if (!Number.isFinite(value) || value < 0 || value > maxima[key]) throw new Error('評分超出構面上限：' + key);
    values[key] = value;
    total += value;
  });
  if (!String(score.reason || '').trim()) return { ok: false, error: '請填寫評分依據或調整理由' };
  const recordId = 'talent-score-' + nickname + '-' + month;
  const existingRow = findObject(SHEET_NAMES.TALENT_RECORDS, 'record_id', recordId);
  const existing = existingRow && existingRow.record_type === 'score' ? talentRecordObject_(existingRow) : null;
  const published = Boolean(existing && existing.published) || score.published === true;
  const history = existing && Array.isArray(existing.history) ? existing.history.slice(-19) : [];
  if (existing) {
    history.push({
      scores: existing.scores || {},
      total: Number(existing.total || 0),
      reason: String(existing.reason || ''),
      published: existing.published === true,
      evaluatedBy: String(existing.evaluatedBy || existingRow.updated_by || ''),
      evaluatedAt: String(existing.evaluatedAt || existingRow.updated_at || ''),
    });
  }
  const record = {
    id: recordId,
    teacher: nickname,
    date: month + '-01',
    month: month,
    scores: values,
    total: total,
    reason: String(score.reason).trim(),
    published: published,
    status: published ? 'published' : 'draft',
    evaluatedBy: actor.nickname,
    evaluatedAt: nowIso(),
    history: history,
  };
  const saved = upsertTalentRecord_('score', nickname, record, actor.nickname);
  logSystem(actor.nickname, 'save_talent_score', recordId, { teacher: nickname, month: month, total: total, published: published });
  return { ok: true, score: saved };
}

function addTalentMessage(params) {
  const actor = params.__actor;
  let nickname = String(params.nickname || '').trim();
  const target = findTalentUser_(nickname);
  if (!actor || !target || !talentCanAccessUser_(actor, target)) return { ok: false, error: '無權使用此對話' };
  nickname = target.nickname;
  if (actor.role !== 'admin' && actor.nickname !== nickname && !talentManagerCanReview_(actor)) return { ok: false, error: '只有本人或才藝主管可回覆' };
  const month = String(params.month || '').trim();
  const text = String(params.text || '').trim();
  if (!/^\d{4}-\d{2}$/.test(month) || !text) return { ok: false, error: '回覆內容不完整' };
  if (text.length > 1000) return { ok: false, error: '單則回覆最多 1000 字' };
  if (actor.nickname === nickname) {
    const scoreRow = findObject(SHEET_NAMES.TALENT_RECORDS, 'record_id', 'talent-score-' + nickname + '-' + month);
    if (!scoreRow || scoreRow.status !== 'published') return { ok: false, error: '主管公布評分後才能回覆' };
  }
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) return { ok: false, error: '對話正在同步，請稍後再送出' };
  try {
    const recordId = 'talent-chat-' + nickname + '-' + month;
    const existing = findObject(SHEET_NAMES.TALENT_RECORDS, 'record_id', recordId);
    const thread = existing ? talentRecordObject_(existing) : { id: recordId, teacher: nickname, date: month + '-01', month: month, messages: [], status: 'active' };
    thread.messages = Array.isArray(thread.messages) ? thread.messages : [];
    thread.messages.push({ author: actor.nickname, role: actor.nickname === nickname ? 'teacher' : 'manager', text: text, at: nowIso() });
    if (thread.messages.length > 300) thread.messages = thread.messages.slice(-300);
    const saved = upsertTalentRecord_('conversation', nickname, thread, actor.nickname);
    return { ok: true, conversation: saved };
  } finally {
    lock.releaseLock();
  }
}

function approveTalentBonus(params) {
  const actor = params.__actor;
  if (!actor || actor.role !== 'admin') return { ok: false, error: '只有管理員可核准獎金人數' };
  const row = findObject(SHEET_NAMES.TALENT_RECORDS, 'record_id', String(params.lesson_id || ''));
  if (!row || row.record_type !== 'lesson') return { ok: false, error: '找不到課堂紀錄' };
  const lesson = talentRecordObject_(row);
  if (lesson.lessonStatus === 'cancelled') return { ok: false, error: '停課沒有獎金事件' };
  const approvedNew = Math.max(0, Math.floor(Number(params.approved_new_count || 0)));
  const approvedRenewal = Math.max(0, Math.floor(Number(params.approved_renewal_count || 0)));
  if (approvedNew > Number(lesson.newCount || 0) || approvedRenewal > Number(lesson.renewalCount || 0)) {
    return { ok: false, error: '核准人數不可高於老師申報人數' };
  }
  const different = approvedNew !== Number(lesson.newCount || 0) || approvedRenewal !== Number(lesson.renewalCount || 0);
  const note = String(params.note || '').trim();
  if (different && !note) return { ok: false, error: '調整人數時必須填寫原因' };
  lesson.approvedNewCount = approvedNew;
  lesson.approvedRenewalCount = approvedRenewal;
  lesson.bonusApproval = 'approved';
  lesson.bonusApprovedBy = actor.nickname;
  lesson.bonusApprovedAt = nowIso();
  lesson.bonusApprovalNote = note;
  const saved = upsertTalentRecord_('lesson', row.nickname, lesson, actor.nickname);
  return { ok: true, lesson: saved };
}

function talentHtmlEsc_(value) {
  return String(value == null ? '' : value).replace(/[&<>"']/g, function (char) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[char];
  });
}

function talentAttachmentLinks_(title, items) {
  const list = Array.isArray(items) ? items : [];
  if (!list.length) return '';
  return '<h3>' + talentHtmlEsc_(title) + '</h3><ul>' + list.map(function (item) {
    const label = talentHtmlEsc_(item.fileName || item.name || '附件');
    const url = talentHtmlEsc_(item.url || '');
    return '<li>' + (url ? '<a href="' + url + '">' + label + '</a>' : label) + '</li>';
  }).join('') + '</ul>';
}

function generateTalentLessonPdf_(lesson, user) {
  const root = getKpiPdfRootFolder_();
  const department = normalizeDepartment_(user.department) || '才藝部門';
  const departmentFolder = getOrCreateChildFolder_(root, department);
  const teacherFolder = getOrCreateChildFolder_(departmentFolder, user.nickname);
  const workFolder = getOrCreateChildFolder_(teacherFolder, '才藝');
  const monthFolder = getOrCreateChildFolder_(workFolder, String(lesson.date).slice(0, 7));
  const safeId = String(lesson.id || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(-16) || Utilities.getUuid().slice(0, 8);
  const fileName = '才藝日報_' + user.nickname + '_' + lesson.date + '_' + safeId + '.pdf';
  const duplicates = monthFolder.getFilesByName(fileName);
  while (duplicates.hasNext()) duplicates.next().setTrashed(true);
  const prepRow = lesson.prepId ? findObject(SHEET_NAMES.TALENT_RECORDS, 'record_id', String(lesson.prepId)) : null;
  const prep = prepRow && prepRow.record_type === 'prep' ? talentRecordObject_(prepRow) : null;
  let html = '<html><head><meta charset="UTF-8"><style>body{font-family:"Microsoft JhengHei","Noto Sans TC",sans-serif;color:#322a25;font-size:12px;margin:24px}h1{font-size:22px}h2{font-size:16px;border-bottom:2px solid #f0b83b;padding-bottom:6px}h3{font-size:13px;margin:16px 0 5px}.meta{background:#fff7df;padding:12px}.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}.grid.six{grid-template-columns:repeat(6,1fr)}.box{border:1px solid #d8cfc4;padding:10px;margin:8px 0}.muted{color:#776d65;font-size:10px}.warning{background:#fff2d1;border-color:#e2bd62}a{color:#2563a7}</style></head><body>';
  html += '<h1>布拉克星球 KPI 系統｜才藝課堂日報</h1>';
  html += '<div class="meta"><strong>' + talentHtmlEsc_(user.nickname) + '</strong>　' + talentHtmlEsc_(lesson.date) + '　' + talentHtmlEsc_(lesson.scheduleTime || '') + '　' + talentHtmlEsc_(lesson.site || '') + '<div class="muted">紀錄版本：' + talentHtmlEsc_(lesson.contentRevision || lesson.updatedAt || '') + '</div></div>';
  if (lesson.lessonStatus === 'cancelled') {
    html += '<h2>停課回報</h2><div class="box"><strong>' + talentHtmlEsc_(lesson.courseName) + '</strong><p>' + talentHtmlEsc_(lesson.cancellationReason) + '</p><p>' + talentHtmlEsc_(lesson.cancellationNote || '') + '</p></div>';
  } else {
    html += '<h2>' + talentHtmlEsc_(lesson.courseName || lesson.courseType) + '</h2><div class="muted">' + talentHtmlEsc_(lesson.courseType || '') + '　' + talentHtmlEsc_(lesson.duration || '') + ' 小時</div>';
    html += '<div class="grid six"><div class="box">應到<br><strong>' + Number(lesson.expected || 0) + '</strong></div><div class="box">正式實到<br><strong>' + Number(lesson.present || 0) + '</strong></div><div class="box">請假<br><strong>' + Number(lesson.leave || 0) + '</strong></div><div class="box">未請假缺席<br><strong>' + Number(lesson.absent || 0) + '</strong></div><div class="box">補課<br><strong>' + Number(lesson.makeup || 0) + '</strong></div><div class="box">體驗<br><strong>' + Number(lesson.trial || 0) + '</strong></div></div>';
    html += '<h3>本堂使用的備課檔案</h3><div class="box' + (prep ? '' : ' warning') + '">' + (prep
      ? '<strong>' + talentHtmlEsc_(prep.courseName || prep.title || '備課檔案') + '</strong><div class="muted">' + talentHtmlEsc_(prep.courseType || '') + '</div>' + (prep.notes ? '<p>' + talentHtmlEsc_(prep.notes) + '</p>' : '')
      : '原備課檔案已不存在') + '</div>';
    if (prep) html += talentAttachmentLinks_('備課附件', prep.materials);
    html += '<h3>本堂實際完成內容</h3><div class="box">' + talentHtmlEsc_(lesson.completed) + '</div>';
    html += '<h3>孩子反應／學習證據</h3><div class="box">' + talentHtmlEsc_(lesson.response) + '</div>';
    html += '<h3>課程問題與下次優化</h3><div class="box">' + talentHtmlEsc_(lesson.issue) + '</div>';
    html += '<h3>親師溝通</h3><div class="box">' + talentHtmlEsc_(lesson.parentStatus === 'complete' ? '全班回報完成' : lesson.parentStatus === 'followup' ? '有個別追蹤' : '尚未完成') + (lesson.parentFollowup ? '<br>' + talentHtmlEsc_(lesson.parentFollowup) : '') + '</div>';
    if (lesson.siteType === 'partner') {
      html += '<h3>家長 APP 發布確認</h3><div class="box">合作校課程免發布，不列入缺件。</div>';
    } else {
      html += '<h3>家長 APP 發布確認</h3><div class="box">' + (lesson.appStatus === 'published' && Array.isArray(lesson.appFiles) && lesson.appFiles.length ? '已上傳發布完成截圖' : '尚未上傳發布完成截圖') + '</div>';
      html += talentAttachmentLinks_('家長 APP 發布完成截圖', lesson.appFiles);
    }
    if (lesson.employment === 'pt') html += '<h3>本堂鐘點試算</h3><div class="box">計薪人數 ' + Number(lesson.present || 0) + '＋補課 ' + Number(lesson.makeup || 0) + '；' + talentHtmlEsc_(lesson.payTier || '') + '；本堂 NT$' + Number(lesson.pay || 0).toLocaleString('en-US') + '</div>';
    if (lesson.siteType === 'self' && (Number(lesson.newCount || 0) || Number(lesson.renewalCount || 0))) html += '<h3>新生／續報申報</h3><div class="box">新生 ' + Number(lesson.newCount || 0) + ' 人；續報 ' + Number(lesson.renewalCount || 0) + ' 人；狀態：' + talentHtmlEsc_(lesson.bonusApproval === 'approved' ? '已核准' : '待核准') + '</div>';
    html += talentAttachmentLinks_('點名簿', lesson.attendanceFiles);
    html += talentAttachmentLinks_('學習過程與成果', lesson.learningFiles);
    html += talentAttachmentLinks_('課後教室復原', lesson.roomFiles);
  }
  html += '</body></html>';
  const blob = Utilities.newBlob(html, 'text/html', 'talent.html').getAs('application/pdf').setName(fileName);
  const file = monthFolder.createFile(blob);
  secureKpiReportPath_(root, departmentFolder, teacherFolder, workFolder, monthFolder, user, 'talent', []);
  secureKpiDriveItem_(file, user, 'talent', []);
  return { url: 'https://drive.google.com/file/d/' + file.getId() + '/view', fileId: file.getId(), folderUrl: workFolder.getUrl() };
}

function regenerateTalentLessonReport(params) {
  const actor = params && params.__actor;
  const lessonId = String(params && params.lesson_id || '').trim();
  const row = findObject(SHEET_NAMES.TALENT_RECORDS, 'record_id', lessonId);
  if (!actor || !row || row.record_type !== 'lesson' || row.status !== 'submitted') {
    return { ok: false, error: '找不到可重建的課堂紀錄' };
  }
  const user = findUserByNickname(row.nickname);
  if (!user || (!talentCanAccessUser_(actor, user) && !talentCanAccessHistoricalUser_(actor, user))) {
    return { ok: false, error: '無權重建此日報' };
  }
  const current = talentRecordObject_(row);
  if (current.reportUrl && params.force !== true) {
    return { ok: true, lesson: current, reportUrl: current.reportUrl, reused: true };
  }

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) return { ok: false, error: '系統正在處理其他日報，請稍後重試' };
  try {
    const latestRow = findObject(SHEET_NAMES.TALENT_RECORDS, 'record_id', lessonId);
    if (!latestRow || latestRow.record_type !== 'lesson' || latestRow.status !== 'submitted') {
      return { ok: false, error: '課堂紀錄已變更，請重新整理後再試' };
    }
    const latest = talentRecordObject_(latestRow);
    if (latest.reportUrl && params.force !== true) {
      return { ok: true, lesson: latest, reportUrl: latest.reportUrl, reused: true };
    }
    const pdf = generateTalentLessonPdf_(latest, user);
    latest.reportUrl = pdf.url;
    latest.reportFileId = pdf.fileId;
    latest.reportFolderUrl = pdf.folderUrl || latest.reportFolderUrl || '';
    latest.reportGeneratedAt = nowIso();
    latest.reportRevision = latest.contentRevision || latest.updatedAt;
    const saved = upsertTalentRecord_('lesson', row.nickname, latest, actor.nickname);
    notifyTalentLesson_(saved, user, pdf.url);
    logSystem(actor.nickname, 'regenerate_talent_lesson_pdf', lessonId, { teacher: row.nickname });
    return { ok: true, lesson: saved, reportUrl: pdf.url };
  } finally {
    lock.releaseLock();
  }
}

/** 每晚補齊因 Drive 短暫錯誤而缺少的才藝日報；每次限量避免超過 Apps Script 執行時間。 */
function repairMissingTalentLessonReportsAuto() {
  ensureTalentRecordsSheet_();
  const rows = sheetToObjects(SHEET_NAMES.TALENT_RECORDS).filter(function (row) {
    if (row.record_type !== 'lesson' || row.status !== 'submitted') return false;
    const lesson = talentRecordObject_(row);
    return !String(lesson.reportUrl || '').trim() ||
      !String(lesson.reportRevision || '').trim() ||
      String(lesson.reportRevision || '') !== String(lesson.contentRevision || lesson.updatedAt || '');
  }).slice(0, 20);
  let repaired = 0;
  const errors = [];
  rows.forEach(function (row) {
    try {
      const user = findUserByNickname(row.nickname);
      if (!user || ['active', 'suspended', 'deleted'].indexOf(user.status) < 0) throw new Error('找不到可稽核的老師資料');
      const sourceRow = findObject(SHEET_NAMES.TALENT_RECORDS, 'record_id', row.record_id);
      if (!sourceRow || sourceRow.record_type !== 'lesson' || sourceRow.status !== 'submitted') throw new Error('課堂紀錄已變更');
      const source = talentRecordObject_(sourceRow);
      const sourceRevision = source.contentRevision || source.updatedAt;
      const pdf = generateTalentLessonPdf_(source, user);
      const lock = LockService.getScriptLock();
      if (!lock.tryLock(10000)) throw new Error('系統正在處理其他紀錄');
      try {
        const latestRow = findObject(SHEET_NAMES.TALENT_RECORDS, 'record_id', row.record_id);
        if (!latestRow || latestRow.record_type !== 'lesson' || latestRow.status !== 'submitted') throw new Error('課堂紀錄已變更');
        const lesson = talentRecordObject_(latestRow);
        const hadReport = Boolean(lesson.reportUrl);
        lesson.reportUrl = pdf.url;
        lesson.reportFileId = pdf.fileId;
        lesson.reportFolderUrl = pdf.folderUrl || lesson.reportFolderUrl || '';
        lesson.reportGeneratedAt = nowIso();
        lesson.reportRevision = sourceRevision;
        const saved = upsertTalentRecord_('lesson', row.nickname, lesson, 'system');
        if (!hadReport && user.status === 'active') notifyTalentLesson_(saved, user, pdf.url);
        repaired += 1;
      } finally {
        lock.releaseLock();
      }
    } catch (error) {
      errors.push({ id: row.record_id, error: String(error.message || error) });
    }
  });
  return { ok: errors.length === 0, scanned: rows.length, repaired: repaired, errors: errors };
}

function setupTalentReportRepairTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (trigger) {
    if (trigger.getHandlerFunction() === 'repairMissingTalentLessonReportsAuto') ScriptApp.deleteTrigger(trigger);
  });
  ScriptApp.newTrigger('repairMissingTalentLessonReportsAuto').timeBased().everyDays(1).atHour(22).nearMinute(15).create();
}

function notifyTalentLesson_(lesson, user, pdfUrl) {
  if (!pdfUrl) return;
  const version = String(lesson.updatedAt || nowIso());
  const props = PropertiesService.getScriptProperties();
  const message = '📄 ' + user.nickname + ' ' + String(lesson.date || '').slice(5).replace('-', '/') + ' 才藝日報已送出\n' + String(lesson.courseName || '停課回報') + '\n完整日報👇\n' + pdfUrl;
  sheetToObjects(SHEET_NAMES.USERS).filter(function (recipient) {
    return recipient.status === 'active' && recipient.nickname !== user.nickname && (
      recipient.role === 'admin' || isGlobalManager_(recipient) || talentAssignments_(recipient).indexOf('talent-manager') >= 0
    );
  }).forEach(function (recipient) {
    const baseKey = 'TALENT_NOTICE_' + lesson.id + '_' + recipient.nickname;
    const lineKey = baseKey + '_LINE';
    const appKey = baseKey + '_APP';
    if (recipient.line_user_id && (props.getProperty(lineKey) || '') < version && pushLine_(recipient.line_user_id, message)) props.setProperty(lineKey, version);
    if (recipient.push_subscription_id && (props.getProperty(appKey) || '') < version && pushOneSignal_(recipient.nickname, user.nickname + ' 已送出才藝日報', lesson.courseName || '停課回報', 'https://teacher.blockplanetcamp.com/review/talent-v2/index.html?workspace=talent-manager&notify=1')) props.setProperty(appKey, version);
  });
}
