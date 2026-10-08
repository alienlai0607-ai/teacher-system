/**
 * 才藝 V2 正式資料層。
 * 一張 TalentRecords 以 record_type 分流課堂、備課、評分、對話與草稿；
 * 所有權限、PT 當日限制與鐘點計算都由後端重算，不能只信任前端。
 */

const TALENT_EFFECTIVE_DATE_ = '2026-09-01';
const TALENT_SIMPLE_ENTRY_VERSION_ = 2;
const TALENT_SIMPLE_ONLY_START_ = '2026-10-08';
const TALENT_RUBRIC_V2_START_MONTH_ = '2026-10';

function ensureTalentRecordsSheet_() {
  const ss = getSS();
  let sheet = ss.getSheetByName(SHEET_NAMES.TALENT_RECORDS);
  if (!sheet) sheet = ss.insertSheet(SHEET_NAMES.TALENT_RECORDS);
  ensureHeaders(sheet, [
    'record_id', 'record_type', 'nickname', 'department', 'record_date',
    'year_month', 'status', 'data_json', 'created_by', 'updated_by',
    'created_at', 'updated_at', 'submitted_at', 'report_attempted_at'
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
    actor.role === 'admin' || isGlobalManager_(actor) || talentAssignments_(actor).indexOf('talent-manager') >= 0
  );
}

function talentCanAccessUser_(actor, target) {
  if (!actor || !target || actor.status !== 'active' || target.status !== 'active') return false;
  if (actor.role === 'admin' || isGlobalManager_(actor) || actor.nickname === target.nickname) return true;
  if (talentAssignments_(actor).indexOf('talent-manager') >= 0 && userHasTalentWork_(target)) return true;
  return false;
}

function talentCanAccessHistoricalUser_(actor, target) {
  if (!actor || !target || actor.status !== 'active' || ['suspended', 'deleted'].indexOf(target.status) < 0) return false;
  if (actor.role === 'admin' || isGlobalManager_(actor)) return true;
  if (talentAssignments_(actor).indexOf('talent-manager') >= 0 && userHasTalentWork_(target)) return true;
  return false;
}

function talentCanAccessPendingUser_(actor, target) {
  if (!actor || !target || actor.status !== 'active' || target.status !== 'pending') return false;
  if (actor.role === 'admin' || isGlobalManager_(actor)) return true;
  if (talentAssignments_(actor).indexOf('talent-manager') >= 0 && userHasTalentWork_(target)) return true;
  return false;
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
  const normalizedDate = String(date || '').slice(0, 10);
  const weekday = new Date(normalizedDate + 'T12:00:00+08:00').getDay();
  return normalizeUserSchedule_(user && user.schedule_json).filter(function (item) {
    if (Number(item.weekday) !== weekday) return false;
    if (item.effectiveFrom && normalizedDate < item.effectiveFrom) return false;
    if (item.effectiveUntil && normalizedDate > item.effectiveUntil) return false;
    return true;
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

function talentDriveFileIdFromUrl_(value) {
  const url = String(value || '').trim();
  if (!/^https:\/\/drive\.google\.com\//i.test(url)) return '';
  const pathMatch = url.match(/\/file\/d\/([A-Za-z0-9_-]{10,200})(?:[/?#]|$)/i);
  const queryMatch = url.match(/[?&]id=([A-Za-z0-9_-]{10,200})(?:[&#]|$)/i);
  return String(pathMatch && pathMatch[1] || queryMatch && queryMatch[1] || '');
}

function talentDriveItemTrashed_(item) {
  try { return !item || typeof item.isTrashed !== 'function' || item.isTrashed() === true; }
  catch (error) { return true; }
}

function talentDriveParents_(item) {
  const result = [];
  try {
    if (!item || typeof item.getParents !== 'function') return result;
    const iterator = item.getParents();
    while (iterator && iterator.hasNext() && result.length < 20) result.push(iterator.next());
  } catch (error) { return []; }
  return result;
}

function talentDriveFolderMatches_(folder, expectedName) {
  try {
    return !talentDriveItemTrashed_(folder)
      && typeof folder.getName === 'function'
      && String(folder.getName() || '') === expectedName;
  } catch (error) { return false; }
}

function talentRoomFileInEvidencePath_(file, user, lessonDate) {
  const expectedDepartment = normalizeDepartment_(user && user.department) || '未分部門';
  const expectedNickname = String(user && user.nickname || '').trim();
  const expectedMonth = String(lessonDate || '').slice(0, 7);
  if (!expectedNickname || !/^\d{4}-\d{2}$/.test(expectedMonth)) return false;
  let evidenceRoot;
  try { evidenceRoot = getEvidenceRootFolder_(); }
  catch (error) { return false; }
  if (talentDriveItemTrashed_(evidenceRoot)) return false;
  let evidenceRootId = '';
  try { evidenceRootId = String(evidenceRoot.getId() || ''); }
  catch (error) { return false; }
  if (!evidenceRootId) return false;

  return talentDriveParents_(file).some(function (monthFolder) {
    let monthName = '';
    try { monthName = String(monthFolder.getName() || ''); }
    catch (error) { return false; }
    if (talentDriveItemTrashed_(monthFolder) || monthName !== expectedMonth) return false;
    return talentDriveParents_(monthFolder).some(function (workFolder) {
      if (!talentDriveFolderMatches_(workFolder, '才藝')) return false;
      return talentDriveParents_(workFolder).some(function (teacherFolder) {
        if (!talentDriveFolderMatches_(teacherFolder, expectedNickname)) return false;
        return talentDriveParents_(teacherFolder).some(function (departmentFolder) {
          if (!talentDriveFolderMatches_(departmentFolder, expectedDepartment)) return false;
          return talentDriveParents_(departmentFolder).some(function (rootFolder) {
            if (!talentDriveFolderMatches_(rootFolder, 'KPI證據')) return false;
            try { return String(rootFolder.getId() || '') === evidenceRootId; }
            catch (error) { return false; }
          });
        });
      });
    });
  });
}

function verifyTalentRoomDriveFile_(item, user, lessonDate) {
  const fileId = String(item && item.fileId || '').trim();
  const urlFileId = talentDriveFileIdFromUrl_(item && item.url);
  if (!/^[A-Za-z0-9_-]{10,200}$/.test(fileId) || !urlFileId || fileId !== urlFileId) {
    throw new Error('課後教室整潔照片連結或檔案識別碼不正確');
  }
  let file;
  try { file = DriveApp.getFileById(fileId); }
  catch (error) { throw new Error('課後教室整潔照片不存在或無法存取'); }
  try {
    if (!file || String(file.getId() || '') !== fileId) throw new Error('invalid file');
  } catch (error) {
    throw new Error('課後教室整潔照片不存在或無法存取');
  }
  if (talentDriveItemTrashed_(file)) throw new Error('課後教室整潔照片已移到垃圾桶');
  let actualMimeType = '';
  try { actualMimeType = String(file.getMimeType() || ''); }
  catch (error) { throw new Error('無法確認課後教室整潔照片類型'); }
  if (!/^image\//i.test(actualMimeType)) throw new Error('課後教室整潔證據只接受圖片');
  if (!talentRoomFileInEvidencePath_(file, user, lessonDate)) {
    throw new Error('課後教室整潔照片不在本人的 KPI 證據資料夾');
  }
  item.fileId = fileId;
  item.url = 'https://drive.google.com/file/d/' + fileId + '/view';
  item.mimeType = actualMimeType;
  try { item.fileName = String(file.getName() || item.fileName || '教室整潔照片').slice(0, 160); }
  catch (error) { /* 保留原有顯示檔名 */ }
  return item;
}

function talentRoomEvidence_(items, required, user, lessonDate) {
  const files = talentAttachments_(items, required);
  if (!required) return files;
  if (!user || !String(user.nickname || '').trim()) throw new Error('無法確認教室整潔照片所屬老師');
  return files.map(function (item) { return verifyTalentRoomDriveFile_(item, user, lessonDate); });
}

function mergeTalentAppEvidence_(existingItems, incomingItems) {
  const existing = talentAppEvidence_(existingItems, false).filter(function (item) { return Boolean(item.url); });
  const incoming = talentAppEvidence_(incomingItems, true);
  const seen = {};
  return incoming.concat(existing).filter(function (item) {
    const key = String(item.fingerprint || item.fileId || item.url || (item.fileName + '|' + item.size));
    if (seen[key]) return false;
    seen[key] = true;
    return true;
  }).slice(0, 30);
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
  if (!talentManagerCanReview_(actor)) {
    const publishedMonths = {};
    for (let index = scores.length - 1; index >= 0; index -= 1) {
      const published = scores[index].published === true || scores[index].status === 'published';
      if (published || scores[index].appPhotoBonusForfeited === true) {
        if (published) publishedMonths[scores[index].month] = true;
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
  if (lesson.adminPayOverrideApproved === true && Number(lesson.adminPayOverrideAmount || 0) > 0) {
    return {
      count: count,
      rate: Number(lesson.adminPayOverrideRate || 0),
      amount: Math.round(Number(lesson.adminPayOverrideAmount || 0)),
      tier: String(lesson.adminPayOverrideTier || '管理員核定'),
      requiresReview: false
    };
  }
  const isPartner = String(lesson.siteType || '') === 'partner' && String(lesson.lessonKind || 'scheduled') !== 'coverage';
  if (isPartner) return { count: count, rate: 600, amount: 900, tier: '合作校固定 1.5 小時', requiresReview: false };
  if (count < 2) return { count: count, rate: 0, amount: 0, tier: '低於開班人數', requiresReview: true };
  if (count <= 4) return { count: count, rate: 500, amount: Math.round(500 * duration), tier: '2-4 人', requiresReview: false };
  if (count <= 7) return { count: count, rate: 600, amount: Math.round(600 * duration), tier: '5-7 人', requiresReview: false };
  if (count <= 10) return { count: count, rate: 800, amount: Math.round(800 * duration), tier: '8-10 人', requiresReview: false };
  return { count: count, rate: 0, amount: 0, tier: '超過 10 人待主管確認', requiresReview: true };
}

function talentCoverageSchedule_(lesson) {
  const start = String(lesson.coverageStart || '').trim();
  const end = String(lesson.coverageEnd || '').trim();
  if (!/^\d{2}:\d{2}$/.test(start) || !/^\d{2}:\d{2}$/.test(end)) throw new Error('請選擇帶班開始與結束時間');
  const startParts = start.split(':').map(Number);
  const endParts = end.split(':').map(Number);
  if (startParts[0] > 23 || endParts[0] > 23 || startParts[1] > 59 || endParts[1] > 59) throw new Error('帶班時間不正確');
  const minutes = endParts[0] * 60 + endParts[1] - startParts[0] * 60 - startParts[1];
  if (minutes < 30 || minutes > 240 || minutes % 30 !== 0) throw new Error('帶班時數須為 0.5 小時倍數，且介於 0.5～4 小時');
  const siteType = String(lesson.siteType || lesson.coverageSiteType || 'self') === 'partner' ? 'partner' : 'self';
  const site = String(lesson.site || lesson.coverageSite || '').trim();
  if (!site) throw new Error('請填寫帶班地點');
  return {
    scheduleKey: ['coverage', lesson.date, start, end, siteType, site].map(function (value) { return encodeURIComponent(String(value || '')); }).join('__'),
    scheduleLabel: '帶班',
    scheduleTime: start + '–' + end,
    coverageStart: start,
    coverageEnd: end,
    duration: minutes / 60,
    siteType: siteType,
    site: site
  };
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

function validateTalentLessonRequiredFields_(lesson) {
  const labels = {
    courseType: '課程類型',
    courseName: '課程名稱',
    siteType: '上課場域',
    site: '上課地點',
    prepId: '本堂使用的備課檔案',
    issue: '課程問題及下次優化',
    parentStatus: '親師溝通狀態',
  };
  const missing = Object.keys(labels).filter(function (key) {
    return !String(lesson[key] || '').trim();
  });
  if (missing.length) {
    throw new Error('請完成：' + missing.map(function (key) { return labels[key]; }).join('、'));
  }
}

function talentLessonEntryVersion_(lesson) {
  return Number(lesson && lesson.entryVersion || 0) >= TALENT_SIMPLE_ENTRY_VERSION_
    ? TALENT_SIMPLE_ENTRY_VERSION_
    : 1;
}

function talentLessonSaveVersionError_(existingRow, existingLesson, requestedVersion) {
  if (existingRow && existingRow.status === 'submitted'
      && existingLesson && talentLessonEntryVersion_(existingLesson) < TALENT_SIMPLE_ENTRY_VERSION_) {
    return '此歷史紀錄為舊版格式，只能查看；如需補傳 APP 截圖，請從紀錄詳情使用「補傳 APP 截圖」';
  }
  if (existingRow && existingRow.status === 'submitted'
      && existingLesson && talentLessonEntryVersion_(existingLesson) >= TALENT_SIMPLE_ENTRY_VERSION_
      && Number(requestedVersion || 0) < TALENT_SIMPLE_ENTRY_VERSION_) {
    return '此頁面版本已過期，既有新版紀錄不可降級；請重新整理後再送出';
  }
  if (!existingRow && todayStr() >= TALENT_SIMPLE_ONLY_START_
      && Number(requestedVersion || 0) < TALENT_SIMPLE_ENTRY_VERSION_) {
    return '此頁面版本已過期，請重新整理並使用新版才藝表單後再送出';
  }
  return '';
}

function preserveTalentAdminBackfillState_(lesson, initialLesson) {
  const hasOwn = Object.prototype.hasOwnProperty;
  ['adminBackfillApproved', 'adminBackfillApprovedBy', 'adminBackfillApprovedAt', 'adminBackfillNote'].forEach(function (key) {
    if (initialLesson && hasOwn.call(initialLesson, key)) lesson[key] = initialLesson[key];
    else delete lesson[key];
  });
}

function applyTalentBonusState_(lesson, initialLesson) {
  const hasOwn = Object.prototype.hasOwnProperty;
  const declaredNew = Number(lesson.newCount || 0);
  const declaredRenewal = Number(lesson.renewalCount || 0);
  const countsChanged = !initialLesson
    || Number(initialLesson.newCount || 0) !== declaredNew
    || Number(initialLesson.renewalCount || 0) !== declaredRenewal;
  const approvalFields = [
    'bonusApproval', 'approvedNewCount', 'approvedRenewalCount',
    'bonusApprovedBy', 'bonusApprovedAt', 'bonusApprovalNote'
  ];
  if (!countsChanged) {
    approvalFields.forEach(function (key) {
      if (hasOwn.call(initialLesson, key)) lesson[key] = initialLesson[key];
      else delete lesson[key];
    });
    if (!hasOwn.call(initialLesson, 'bonusApproval')) {
      lesson.bonusApproval = declaredNew || declaredRenewal ? 'pending' : 'not_required';
    }
    if (!hasOwn.call(initialLesson, 'approvedNewCount')) lesson.approvedNewCount = 0;
    if (!hasOwn.call(initialLesson, 'approvedRenewalCount')) lesson.approvedRenewalCount = 0;
    return;
  }
  lesson.bonusApproval = declaredNew || declaredRenewal ? 'pending' : 'not_required';
  lesson.approvedNewCount = 0;
  lesson.approvedRenewalCount = 0;
  lesson.bonusApprovedBy = '';
  lesson.bonusApprovedAt = '';
  lesson.bonusApprovalNote = '';
}

function talentScheduleDuration_(time) {
  const match = String(time || '').trim().match(/^(\d{1,2}):(\d{2})\s*[-–~～]\s*(\d{1,2}):(\d{2})$/);
  if (!match) return 0;
  const start = Number(match[1]) * 60 + Number(match[2]);
  const end = Number(match[3]) * 60 + Number(match[4]);
  const minutes = end - start;
  return minutes > 0 ? minutes / 60 : 0;
}

function talentRequiredCount_(value, label) {
  if (value === '' || value === null || value === undefined) throw new Error('請填寫' + label);
  const count = Number(value);
  if (!Number.isFinite(count) || count < 0 || !Number.isInteger(count) || count > 999) {
    throw new Error(label + '必須是 0～999 的整數');
  }
  return count;
}

function normalizeTalentSimpleLesson_(lesson, user, matchedSchedule, isCoverage) {
  const hasOwn = Object.prototype.hasOwnProperty;
  const rawPresent = hasOwn.call(lesson, 'present') ? lesson.present
    : hasOwn.call(lesson, 'studentCount') ? lesson.studentCount
      : hasOwn.call(lesson, 'attendanceCount') ? lesson.attendanceCount : '';
  const rawRenewal = hasOwn.call(lesson, 'renewalCount') ? lesson.renewalCount
    : hasOwn.call(lesson, 'renewal_count') ? lesson.renewal_count : '';
  const rawNew = hasOwn.call(lesson, 'newCount') ? lesson.newCount
    : hasOwn.call(lesson, 'new_count') ? lesson.new_count : '';
  const rawTrial = hasOwn.call(lesson, 'trial') ? lesson.trial
    : hasOwn.call(lesson, 'trialCount') ? lesson.trialCount : '';
  const present = talentRequiredCount_(rawPresent, '本堂正式上課人數');
  const renewal = talentRequiredCount_(rawRenewal, '續報人數');
  const newCount = talentRequiredCount_(rawNew, '新生人數');
  const trial = talentRequiredCount_(rawTrial, '體驗人數');
  if (newCount + renewal > present) {
    throw new Error('新生與續報都包含在正式總數內，兩者合計不可超過正式學員到課總數');
  }
  const bonusExempt = isCoverage || String(lesson.siteType || '') === 'partner';

  if (matchedSchedule) {
    lesson.courseName = String(matchedSchedule.courseName || lesson.courseName || matchedSchedule.label || lesson.courseType || '').trim();
    lesson.courseType = String(matchedSchedule.courseType || lesson.courseType || lesson.courseName || '').trim();
  } else {
    lesson.courseName = String(lesson.courseName || lesson.courseType || '').trim();
    lesson.courseType = String(lesson.courseType || lesson.courseName || '').trim();
  }
  if (!lesson.courseName) throw new Error('請選擇課程');

  lesson.entryVersion = TALENT_SIMPLE_ENTRY_VERSION_;
  lesson.expected = present;
  lesson.present = present;
  lesson.leave = 0;
  lesson.absent = 0;
  lesson.makeup = 0;
  lesson.trial = trial;
  lesson.renewalCount = bonusExempt ? 0 : renewal;
  lesson.newCount = bonusExempt ? 0 : newCount;
  lesson.prepId = '';
  lesson.issue = '';
  lesson.parentStatus = 'not_required';
  lesson.parentFollowup = '';
  lesson.attendanceFiles = talentAttachments_(lesson.attendanceFiles, false);
  lesson.learningFiles = talentAttachments_(lesson.learningFiles, false);
  lesson.roomFiles = talentRoomEvidence_(lesson.roomFiles, true, user, lesson.date);
  lesson.roomDone = lesson.roomFiles.length > 0;
  if (!lesson.roomDone) throw new Error('請上傳課後教室整潔照片');

  if (!isCoverage) {
    const scheduledDuration = talentScheduleDuration_(matchedSchedule && matchedSchedule.time);
    const requestedDuration = Number(lesson.duration || 0);
    lesson.duration = scheduledDuration || ([1, 1.5].indexOf(requestedDuration) >= 0 ? requestedDuration : 1.5);
    if ([1, 1.5].indexOf(lesson.duration) < 0) throw new Error('固定課程時數只可為 1 或 1.5 小時');
  }
  if (!lesson.siteType) lesson.siteType = 'self';
  if (!lesson.site) {
    const department = normalizeDepartment_(user && user.department);
    lesson.site = department === '才藝部門' ? '布拉克自營教室' : department;
  }
  lesson.appStatus = 'not_required';
  lesson.appFiles = [];
  lesson.appUpdatedAt = '';
  lesson.appPublishedAt = '';
}

function saveTalentLesson(params) {
  const actor = params.__actor;
  const nickname = String(params.nickname || actor && actor.nickname || '').trim();
  const user = findUserByNickname(nickname);
  if (!actor || !user || !userHasTalentWork_(user) || (actor.role !== 'admin' && actor.nickname !== nickname)) {
    return { ok: false, error: '無課堂紀錄權限' };
  }
  const lesson = talentPayload_(params.lesson);
  const baseContentRevision = String(lesson.contentRevision || '');
  if (!lesson.id) return { ok: false, error: '課堂紀錄編號遺失' };
  lesson.entryVersion = talentLessonEntryVersion_(lesson);
  lesson.teacher = nickname;
  const employment = talentEmployment_(user);
  lesson.employment = employment;
  lesson.date = String(lesson.date || '').slice(0, 10);
  const requestedLessonStatus = String(lesson.lessonStatus || 'held');
  lesson.lessonKind = lesson.lessonKind === 'coverage' || requestedLessonStatus === 'coverage' ? 'coverage' : 'scheduled';
  lesson.lessonStatus = requestedLessonStatus === 'cancelled' ? 'cancelled' : 'held';
  if (lesson.lessonKind === 'coverage' && employment !== 'pt') return { ok: false, error: '帶班紀錄只適用才藝 PT' };
  if (lesson.lessonStatus === 'cancelled') lesson.lessonKind = 'scheduled';
  const isCoverage = employment === 'pt' && lesson.lessonKind === 'coverage';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(lesson.date) || lesson.date > todayStr()) return { ok: false, error: '課程日期不正確' };
  const userSchedules = employment === 'pt' ? normalizeUserSchedule_(user.schedule_json) : [];
  const dateSchedules = employment === 'pt' ? talentSchedulesForDate_(user, lesson.date) : [];
  let matchedSchedule = null;
  if (employment === 'pt' && !isCoverage) {
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
  } else if (isCoverage) {
    const coverageSchedule = talentCoverageSchedule_(lesson);
    Object.keys(coverageSchedule).forEach(function (key) { lesson[key] = coverageSchedule[key]; });
  }
  const initialExisting = findObject(SHEET_NAMES.TALENT_RECORDS, 'record_id', lesson.id);
  const initialLesson = initialExisting && initialExisting.record_type === 'lesson' && initialExisting.nickname === nickname
    ? talentRecordObject_(initialExisting) : null;
  const initialVersionError = talentLessonSaveVersionError_(initialExisting, initialLesson, lesson.entryVersion);
  if (initialVersionError) return { ok: false, error: initialVersionError };
  preserveTalentAdminBackfillState_(lesson, initialLesson);
  ['reportUrl', 'reportFileId', 'reportFolderUrl', 'reportGeneratedAt', 'reportRevision'].forEach(function (key) {
    lesson[key] = initialLesson ? initialLesson[key] || '' : '';
  });
  if (initialLesson && initialLesson.createdAt) lesson.createdAt = initialLesson.createdAt;
  if (initialLesson && initialLesson.adminPayOverrideApproved === true) {
    ['adminPayOverrideApproved', 'adminPayOverrideAmount', 'adminPayOverrideRate', 'adminPayOverrideTier', 'adminPayOverrideReason', 'adminPayOverrideBy', 'adminPayOverrideAt'].forEach(function (key) {
      lesson[key] = initialLesson[key];
    });
  } else if (!actor || actor.role !== 'admin') {
    ['adminPayOverrideApproved', 'adminPayOverrideAmount', 'adminPayOverrideRate', 'adminPayOverrideTier', 'adminPayOverrideReason', 'adminPayOverrideBy', 'adminPayOverrideAt'].forEach(function (key) {
      delete lesson[key];
    });
  }
  if (!initialExisting && lesson.lessonStatus === 'held' && !isCoverage && lesson.date !== todayStr()) {
    return { ok: false, error: lesson.employment === 'pt' ? 'PT 正常課程只能在上課當日送出' : '正常課程請於上課當日送出' };
  }
  if (initialLesson && initialExisting.status === 'submitted') {
    if (String(initialLesson.date || '') !== todayStr()) return { ok: false, error: '已跨日的正式課堂不可修改' };
    if (String(initialLesson.date || '') !== lesson.date || initialLesson.lessonStatus !== lesson.lessonStatus) {
      return { ok: false, error: '補充紀錄時不可更換日期或上課狀態' };
    }
    if (String(initialLesson.lessonKind || 'scheduled') !== lesson.lessonKind) return { ok: false, error: '補充紀錄時不可更換固定課程或帶班類型' };
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
    const simpleEntry = lesson.entryVersion >= TALENT_SIMPLE_ENTRY_VERSION_;
    if (simpleEntry) {
      normalizeTalentSimpleLesson_(lesson, user, matchedSchedule, isCoverage);
    } else {
      validateTalentLessonRequiredFields_(lesson);
      ['expected', 'present', 'leave', 'absent', 'makeup', 'trial'].forEach(function (key) {
        lesson[key] = Math.max(0, Math.floor(Number(lesson[key] || 0)));
      });
      if (lesson.expected !== lesson.present + lesson.leave + lesson.absent) throw new Error('應到正式人數必須等於正式實到、請假與未請假缺席合計');
      lesson.duration = Number(lesson.duration || 0);
      if (lesson.siteType === 'partner' && !isCoverage) lesson.duration = 1.5;
      if (!isCoverage && [1, 1.5].indexOf(lesson.duration) < 0) throw new Error('授課時數只可選 1 或 1.5 小時');
      const prepRow = findObject(SHEET_NAMES.TALENT_RECORDS, 'record_id', String(lesson.prepId || ''));
      if (!prepRow || prepRow.record_type !== 'prep' || prepRow.nickname !== nickname) {
        throw new Error('請選擇本人的備課檔案');
      }
      const selectedPrep = talentRecordObject_(prepRow);
      talentAttachments_(selectedPrep.materials, true);
      lesson.courseType = String(selectedPrep.courseType || '').trim();
      lesson.courseName = String(selectedPrep.courseName || selectedPrep.title || '').trim();
      if (!lesson.courseType || !lesson.courseName) throw new Error('所選備課檔案缺少課程資料，請先更新備課檔案');
      lesson.attendanceFiles = talentAttachments_(lesson.attendanceFiles, true);
      lesson.learningFiles = talentAttachments_(lesson.learningFiles, true);
      lesson.roomFiles = talentAttachments_(lesson.roomFiles, true);
      lesson.roomDone = lesson.roomFiles.length > 0;
      if (!lesson.roomDone) throw new Error('請上傳課後教室復原照片');
      if (['complete', 'followup'].indexOf(lesson.parentStatus) < 0) throw new Error('請選擇親師溝通狀態');
      if (lesson.parentStatus === 'followup' && !String(lesson.parentFollowup || '').trim()) throw new Error('請填寫個別追蹤與下一步');
      if (lesson.parentStatus !== 'followup') lesson.parentFollowup = '';
      lesson.newCount = lesson.siteType === 'self' && lesson.employment === 'fulltime' ? Math.max(0, Math.floor(Number(lesson.newCount || 0))) : 0;
      lesson.renewalCount = lesson.siteType === 'self' && !isCoverage ? Math.max(0, Math.floor(Number(lesson.renewalCount || 0))) : 0;
      if (lesson.renewalCount > lesson.present) throw new Error('續報人數不可大於上課人數');
    }
    const pay = talentLessonPay_(lesson, user);
    lesson.pay = pay.amount;
    lesson.payRate = pay.rate;
    lesson.payTier = pay.tier;
    lesson.payRequiresReview = pay.requiresReview;
    if (simpleEntry || lesson.siteType === 'partner' || isCoverage) {
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
    lesson.backfilled = isCoverage && lesson.date !== todayStr();
  }
  applyTalentBonusState_(lesson, initialLesson);
  lesson.status = 'submitted';
  lesson.contentRevision = nowIso() + '-' + Utilities.getUuid().slice(0, 8);
  lesson.lastRequestId = String(params.request_id || '');
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) return { ok: false, error: '系統正在儲存另一筆紀錄，請稍後再送出' };
  let saved;
  let duplicateSubmission = false;
  try {
    const existing = findObject(SHEET_NAMES.TALENT_RECORDS, 'record_id', lesson.id);
    const existingLesson = existing && existing.record_type === 'lesson' && existing.nickname === nickname
      ? talentRecordObject_(existing) : null;
    const lockedVersionError = talentLessonSaveVersionError_(existing, existingLesson, lesson.entryVersion);
    if (lockedVersionError) return { ok: false, error: lockedVersionError };
    if (existing && existing.record_type === 'lesson' && existing.nickname === nickname && existing.status === 'submitted') {
      if ((params.request_id && existingLesson.lastRequestId === params.request_id) || !String(lesson.updatedAt || '').trim()) {
        saved = existingLesson;
        duplicateSubmission = true;
      } else if (baseContentRevision ? baseContentRevision !== String(existingLesson.contentRevision || '') : String(lesson.updatedAt) !== String(existing.updated_at || '')) {
        return { ok: false, code: 'RECORD_CONFLICT', error: '這筆紀錄已在其他裝置更新，您的草稿仍保留；請先查看最新紀錄再補充' };
      }
    }
    if (!duplicateSubmission && !existing && employment === 'pt') {
      const firstScheduleKey = dateSchedules.length ? dateSchedules[0].scheduleKey : '';
      const duplicate = sheetToObjects(SHEET_NAMES.TALENT_RECORDS).some(function (row) {
        if (row.record_type !== 'lesson' || row.nickname !== nickname || String(row.record_date || '') !== lesson.date || row.status !== 'submitted') return false;
        const recorded = talentRecordObject_(row);
        return recorded.scheduleKey ? recorded.scheduleKey === lesson.scheduleKey : firstScheduleKey === lesson.scheduleKey;
      });
      if (duplicate) return { ok: false, error: '這個日期與班次已有送出紀錄，不能重複申報' };
    }
    if (!duplicateSubmission) {
      preserveTalentAdminBackfillState_(lesson, existingLesson);
      applyTalentBonusState_(lesson, existingLesson);
      saved = upsertTalentRecord_('lesson', nickname, lesson, actor.nickname);
      removeTalentRecord_('talent-lesson-draft-' + nickname, nickname);
    }
  } finally {
    lock.releaseLock();
  }
  const reportJob = typeof queueDeferredTeacherReport_ === 'function'
    ? queueDeferredTeacherReport_({ type: 'talent', lessonId: lesson.id })
    : { queued: false, scheduled: false };
  const warning = reportJob.queued ? '' : '課堂紀錄已儲存，日報將由系統的例行檢查補建。';
  logSystem(nickname, 'save_talent_lesson', lesson.id, { date: lesson.date, status: lesson.lessonStatus, lesson_kind: lesson.lessonKind });
  return {
    ok: true,
    lesson: saved,
    reportUrl: saved && saved.reportUrl || '',
    reportPending: true,
    reportQueued: reportJob.queued,
    duplicate: duplicateSubmission,
    warning: warning,
  };
}

/**
 * 僅供 Apps Script 編輯器手動執行：依柏翰確認，補入紅豆 2026/09/19 代酸酸帶 WEDO 班。
 * 11 人由管理員按最高既有級距 800 元／小時核定，10:40–12:10 共 1.5 小時，合計 1,200 元。
 */
function backfillHongdouCoverage20260919FromEditor() {
  const email = String(Session.getActiveUser().getEmail() || '').trim().toLowerCase();
  const operator = email ? findUserByEmail(email) : null;
  if (!operator || operator.status !== 'active' || operator.role !== 'admin') {
    throw new Error('只有正式管理員可以補入帶班鐘點');
  }
  const teacher = findTalentUser_('紅豆');
  if (!teacher || teacher.status !== 'active' || talentEmployment_(teacher) !== 'pt') throw new Error('找不到紅豆的才藝 PT 帳號');
  const recordId = 'talent-coverage-hongdou-20260919-wedo-1040';
  ensureTalentRecordsSheet_();
  const rows = sheetToObjects(SHEET_NAMES.TALENT_RECORDS);
  const duplicateRow = rows.find(function (row) {
    if (row.record_type !== 'lesson' || row.nickname !== teacher.nickname || row.status !== 'submitted') return false;
    const existingLesson = talentRecordObject_(row);
    if (String(existingLesson.date || '') !== '2026-09-19') return false;
    return String(row.record_id || '') === recordId || (existingLesson.lessonKind === 'coverage' && existingLesson.scheduleTime === '10:40–12:10' && /wedo/i.test(String(existingLesson.courseName || '')));
  });
  let saved;
  let duplicate = false;
  if (duplicateRow) {
    saved = talentRecordObject_(duplicateRow);
    duplicate = true;
  } else {
    const now = nowIso();
    const lesson = {
      id: recordId,
      teacher: teacher.nickname,
      employment: 'pt',
      lessonStatus: 'held',
      lessonKind: 'coverage',
      date: '2026-09-19',
      scheduleKey: 'coverage__2026-09-19__10%3A40__12%3A10__self__%E6%9D%B1%E6%A9%8B%E6%95%99%E5%AE%A4',
      scheduleLabel: '帶班',
      scheduleTime: '10:40–12:10',
      coverageStart: '10:40',
      coverageEnd: '12:10',
      courseType: 'WeDo 機器人',
      courseName: 'WEDO（代酸酸帶班）',
      siteType: 'self',
      site: '東橋教室',
      duration: 1.5,
      expected: 11,
      present: 11,
      leave: 0,
      absent: 0,
      makeup: 0,
      trial: 0,
      prepId: '',
      issue: '行政依老師回報補登：代酸酸帶 WEDO 班。',
      parentStatus: 'complete',
      attendanceFiles: [],
      learningFiles: [],
      roomFiles: [],
      roomDone: false,
      appStatus: 'not_required',
      appFiles: [],
      newCount: 0,
      renewalCount: 0,
      bonusApproval: 'not_required',
      status: 'submitted',
      pay: 1200,
      payRate: 800,
      payTier: '11 人（管理員核定最高級距）',
      payRequiresReview: false,
      adminPayOverrideApproved: true,
      adminPayOverrideAmount: 1200,
      adminPayOverrideRate: 800,
      adminPayOverrideTier: '11 人（管理員核定最高級距）',
      adminPayOverrideReason: '柏翰依老師 2026/09/19 LINE 回報確認補入計算',
      adminPayOverrideBy: operator.nickname,
      adminPayOverrideAt: now,
      adminBackfillApproved: true,
      adminBackfillNote: '紅豆代酸酸上 WEDO，共 11 人；未補登 2026/09/10 加班。',
      backfilled: true,
      contentRevision: now + '-' + Utilities.getUuid().slice(0, 8)
    };
    saved = upsertTalentRecord_('lesson', teacher.nickname, lesson, operator.nickname);
    logSystem(operator.nickname, 'backfill_talent_coverage', recordId, { teacher: teacher.nickname, date: lesson.date, amount: lesson.pay });
  }
  const septemberTotal = sheetToObjects(SHEET_NAMES.TALENT_RECORDS).filter(function (row) {
    if (row.record_type !== 'lesson' || row.nickname !== teacher.nickname || row.status !== 'submitted') return false;
    return String(talentRecordObject_(row).date || '').slice(0, 7) === '2026-09';
  }).reduce(function (sum, row) { return sum + Number(talentRecordObject_(row).pay || 0); }, 0);
  const result = { ok: true, duplicate: duplicate, record_id: saved.id || recordId, teacher: teacher.nickname, date: '2026-09-19', time: '10:40–12:10', students: 11, amount: Number(saved.pay || 0), september_wage_total: septemberTotal };
  Logger.log(JSON.stringify(result));
  return result;
}

function suansuanSeptemberBackfillLesson_(entry, teacher, operator, timestamp) {
  const lesson = {
    id: entry.id,
    entryVersion: TALENT_SIMPLE_ENTRY_VERSION_,
    teacher: teacher.nickname,
    employment: 'pt',
    lessonStatus: 'held',
    lessonKind: 'scheduled',
    date: entry.date,
    scheduleKey: entry.schedule.scheduleKey,
    scheduleLabel: entry.schedule.label,
    scheduleTime: entry.schedule.time,
    courseType: entry.schedule.courseType || entry.schedule.courseName || entry.schedule.label,
    courseName: entry.schedule.courseName || entry.schedule.label,
    siteType: entry.schedule.siteType,
    site: entry.schedule.site,
    duration: talentScheduleDuration_(entry.schedule.time) || 1.5,
    expected: entry.present,
    present: entry.present,
    leave: 0,
    absent: 0,
    makeup: 0,
    trial: 0,
    prepId: '',
    issue: '',
    parentStatus: 'not_required',
    attendanceFiles: [],
    learningFiles: [],
    roomFiles: [],
    roomDone: false,
    appStatus: 'not_required',
    appFiles: [],
    newCount: 0,
    renewalCount: entry.renewal,
    approvedNewCount: 0,
    approvedRenewalCount: 0,
    bonusApproval: entry.renewal > 0 ? 'pending' : 'not_required',
    status: 'submitted',
    adminBackfillApproved: true,
    adminBackfillApprovedBy: operator.nickname,
    adminBackfillApprovedAt: timestamp,
    adminBackfillNote: '柏翰確認的 2026/09 酸酸才藝 PT 歷史課程；當時無整潔照，不偽造附件。',
    backfilled: true,
    contentRevision: timestamp + '-' + Utilities.getUuid().slice(0, 8)
  };
  const calculatedPay = talentLessonPay_(lesson, teacher);
  if (calculatedPay.requiresReview || calculatedPay.amount <= 0) {
    throw new Error(entry.date + ' ' + lesson.courseName + ' 鐘點計算無法強制列入薪資');
  }
  lesson.adminPayOverrideApproved = true;
  lesson.adminPayOverrideAmount = calculatedPay.amount;
  lesson.adminPayOverrideRate = calculatedPay.rate;
  lesson.adminPayOverrideTier = calculatedPay.tier + '（管理員核定歷史回填）';
  lesson.adminPayOverrideReason = '柏翰確認酸酸 2026/09 才藝 PT 課程必須列入薪資';
  lesson.adminPayOverrideBy = operator.nickname;
  lesson.adminPayOverrideAt = timestamp;
  const forcedPay = talentLessonPay_(lesson, teacher);
  lesson.pay = forcedPay.amount;
  lesson.payRate = forcedPay.rate;
  lesson.payTier = forcedPay.tier;
  lesson.payRequiresReview = forcedPay.requiresReview;
  return lesson;
}

function validateSuansuanSeptemberBackfillDuplicate_(row, expected) {
  const actual = talentRecordObject_(row);
  const differences = [];
  function text(value) { return String(value == null ? '' : value).trim().replace(/\s+/g, ' ').toLowerCase(); }
  function sameNumber(left, right) { return Math.abs(Number(left) - Number(right)) < 0.0001; }
  function requireText(label, actualValue, expectedValue) {
    if (text(actualValue) !== text(expectedValue)) differences.push(label);
  }
  function requireNumber(label, actualValue, expectedValue) {
    if (!sameNumber(actualValue, expectedValue)) differences.push(label);
  }
  function requireBoolean(label, actualValue, expectedValue) {
    if (actualValue !== expectedValue) differences.push(label);
  }
  requireText('資料類型', row.record_type, 'lesson');
  requireText('老師', row.nickname, expected.teacher);
  requireText('送出狀態', row.status, 'submitted');
  requireText('資料老師', actual.teacher, expected.teacher);
  requireNumber('表單版本', actual.entryVersion, expected.entryVersion);
  requireText('聘用身分', actual.employment, expected.employment);
  requireText('上課狀態', actual.lessonStatus, expected.lessonStatus);
  requireText('課程類別', actual.lessonKind, expected.lessonKind);
  requireText('日期', actual.date, expected.date);
  requireText('排班識別碼', actual.scheduleKey, expected.scheduleKey);
  requireText('班次', actual.scheduleLabel, expected.scheduleLabel);
  requireText('時間', actual.scheduleTime, expected.scheduleTime);
  requireText('課程類型', actual.courseType, expected.courseType);
  requireText('課程名稱', actual.courseName, expected.courseName);
  requireText('場域', actual.siteType, expected.siteType);
  requireText('地點', actual.site, expected.site);
  requireNumber('時數', actual.duration, expected.duration);
  requireNumber('應到人數', actual.expected, expected.expected);
  requireNumber('實到人數', actual.present, expected.present);
  requireNumber('請假人數', actual.leave, expected.leave);
  requireNumber('缺席人數', actual.absent, expected.absent);
  requireNumber('補課人數', actual.makeup, expected.makeup);
  requireNumber('體驗人數', actual.trial, expected.trial);
  requireNumber('續報人數', actual.renewalCount, expected.renewalCount);
  requireNumber('鐘點', actual.pay, expected.pay);
  requireNumber('時薪', actual.payRate, expected.payRate);
  requireText('鐘點級距', actual.payTier, expected.payTier);
  requireBoolean('鐘點核定', actual.adminPayOverrideApproved, true);
  requireNumber('核定鐘點', actual.adminPayOverrideAmount, expected.adminPayOverrideAmount);
  requireNumber('核定時薪', actual.adminPayOverrideRate, expected.adminPayOverrideRate);
  requireText('核定級距', actual.adminPayOverrideTier, expected.adminPayOverrideTier);
  requireText('鐘點核定人', actual.adminPayOverrideBy, expected.adminPayOverrideBy);
  requireBoolean('薪資待審', actual.payRequiresReview, false);
  requireBoolean('歷史回填核定', actual.adminBackfillApproved, true);
  requireText('歷史回填核定人', actual.adminBackfillApprovedBy, expected.adminBackfillApprovedBy);
  requireBoolean('歷史回填', actual.backfilled, true);
  requireText('續報審核', actual.bonusApproval, expected.bonusApproval);
  if (differences.length) {
    throw new Error(expected.date + ' ' + expected.courseName + ' 已有正式紀錄，但 ' + differences.join('、') + ' 不一致；未寫入任何回填資料');
  }
  return actual;
}

function appendTalentBackfillLessonsAtomically_(sheet, lessons, teacher, operator, timestamp) {
  if (!lessons.length) return;
  const headers = getHeaders(sheet);
  const rows = lessons.map(function (lesson) {
    const record = {
      record_id: lesson.id,
      record_type: 'lesson',
      nickname: teacher.nickname,
      department: normalizeDepartment_(teacher.department),
      record_date: lesson.date,
      year_month: String(lesson.date || '').slice(0, 7),
      status: 'submitted',
      data_json: JSON.stringify(talentPayload_(lesson)),
      created_by: operator.nickname,
      updated_by: operator.nickname,
      created_at: timestamp,
      updated_at: timestamp,
      submitted_at: timestamp,
      report_attempted_at: ''
    };
    return headers.map(function (header) { return sheetValueForWrite_(record[header]); });
  });
  sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, headers.length).setValues(rows);
}

/**
 * 僅供 Apps Script 編輯器手動執行：
 * 1. 將酸酸保留為安親主管，並開通才藝 PT 與 2026/10/10 起的週六兩班。
 * 2. 依柏翰確認的人數，幂等回填 2026/09 五筆歷史課程。
 *
 * 五筆會先在同一把鎖內完整預檢；任一重複紀錄的課程或薪資不符即全數不寫入。
 * 歷史課程沒有整潔照，只標示為管理員核定回填，不偽造附件。
 */
function backfillSuansuanTalentPtSeptember2026FromEditor() {
  const email = String(Session.getActiveUser().getEmail() || '').trim().toLowerCase();
  const operator = email ? findUserByEmail(email) : null;
  if (!operator || operator.status !== 'active' || operator.role !== 'admin') {
    throw new Error('只有正式管理員可以開通酸酸才藝 PT 並回填鐘點');
  }

  migrateTalentUserProfiles_();
  const teacher = findTalentUser_('酸酸');
  const assignments = talentAssignments_(teacher);
  if (!teacher || teacher.status !== 'active' || teacher.role !== 'manager' || talentEmployment_(teacher) !== 'pt'
      || assignments.indexOf('anqin-manager') < 0 || assignments.indexOf('talent-pt') < 0) {
    throw new Error('酸酸的安親主管／才藝 PT 雙身分尚未完整建立');
  }
  const schedules = normalizeUserSchedule_(teacher.schedule_json);
  function findSchedule(time, courseName) {
    const schedule = schedules.filter(function (item) {
      return Number(item.weekday) === 6 && item.time === time
        && String(item.courseName || item.label || '').toLowerCase() === String(courseName || '').toLowerCase();
    })[0];
    if (!schedule) throw new Error('找不到酸酸週六 ' + courseName + ' ' + time + ' 排班');
    return schedule;
  }

  const simpleSchedule = findSchedule('09:00–10:30', '簡易');
  const wedoSchedule = findSchedule('10:40–12:10', 'WeDo');
  const entries = [
    { id: 'talent-admin-backfill-suansuan-20260905-simple', date: '2026-09-05', schedule: simpleSchedule, present: 6, renewal: 0 },
    { id: 'talent-admin-backfill-suansuan-20260912-simple', date: '2026-09-12', schedule: simpleSchedule, present: 8, renewal: 0 },
    { id: 'talent-admin-backfill-suansuan-20260919-simple', date: '2026-09-19', schedule: simpleSchedule, present: 4, renewal: 0 },
    { id: 'talent-admin-backfill-suansuan-20260905-wedo', date: '2026-09-05', schedule: wedoSchedule, present: 10, renewal: 4 },
    { id: 'talent-admin-backfill-suansuan-20260912-wedo', date: '2026-09-12', schedule: wedoSchedule, present: 10, renewal: 4 }
  ];
  const sheet = ensureTalentRecordsSheet_();
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) throw new Error('系統正在處理其他才藝資料，未寫入回填，請稍後再試');
  const results = [];
  const createdLessons = [];
  let septemberWageTotal = 0;
  let pendingRenewalApproval = 0;
  try {
    const rows = sheetToObjects(SHEET_NAMES.TALENT_RECORDS).slice();
    const timestamp = nowIso();
    const plans = entries.map(function (entry) {
      return { entry: entry, lesson: suansuanSeptemberBackfillLesson_(entry, teacher, operator, timestamp) };
    });

    // 先預檢全部五筆，不可邊檢查邊寫入，避免後段衝突時只留下半套資料。
    plans.forEach(function (plan) {
      const entry = plan.entry;
      const matches = rows.filter(function (row) {
        if (String(row.record_id || '') === entry.id) return true;
        if (row.record_type !== 'lesson' || row.nickname !== teacher.nickname || row.status !== 'submitted') return false;
        const recorded = talentRecordObject_(row);
        return String(recorded.date || '') === entry.date && (
          String(recorded.scheduleKey || '') === entry.schedule.scheduleKey
          || String(recorded.scheduleTime || '') === entry.schedule.time
          || normalizeTalentNickname_(recorded.courseName) === normalizeTalentNickname_(entry.schedule.courseName || entry.schedule.label)
        );
      });
      if (matches.length > 1) {
        throw new Error(entry.date + ' ' + plan.lesson.courseName + ' 有多筆重複正式紀錄；未寫入任何回填資料');
      }
      if (matches.length === 1) {
        const existing = validateSuansuanSeptemberBackfillDuplicate_(matches[0], plan.lesson);
        results.push({ id: existing.id || matches[0].record_id, duplicate: true, date: entry.date, course: existing.courseName, present: entry.present, renewal: entry.renewal, amount: Number(existing.pay || 0) });
      } else {
        createdLessons.push(plan.lesson);
        results.push({ id: plan.lesson.id, duplicate: false, date: entry.date, course: plan.lesson.courseName, present: entry.present, renewal: entry.renewal, amount: Number(plan.lesson.pay || 0) });
      }
    });

    // 所有預檢都通過後，以單一 setValues 批次寫入新紀錄。
    appendTalentBackfillLessonsAtomically_(sheet, createdLessons, teacher, operator, timestamp);

    const septemberLessons = rows.filter(function (row) {
      if (row.record_type !== 'lesson' || row.nickname !== teacher.nickname || row.status !== 'submitted') return false;
      return String(talentRecordObject_(row).date || '').slice(0, 7) === '2026-09';
    }).map(talentRecordObject_).concat(createdLessons);
    septemberWageTotal = septemberLessons.reduce(function (sum, lesson) {
      return sum + Number(lesson.pay || 0);
    }, 0);
    pendingRenewalApproval = septemberLessons.reduce(function (sum, lesson) {
      return sum + (lesson.bonusApproval === 'approved' ? 0 : Number(lesson.renewalCount || 0));
    }, 0);
  } finally {
    lock.releaseLock();
  }

  createdLessons.forEach(function (lesson) {
    logSystem(operator.nickname, 'backfill_talent_lesson', lesson.id, {
      teacher: teacher.nickname,
      date: lesson.date,
      course: lesson.courseName,
      present: lesson.present,
      renewal: lesson.renewalCount,
      amount: lesson.pay
    });
  });
  const result = {
    ok: true,
    teacher: teacher.nickname,
    role: teacher.role,
    employment_type: talentEmployment_(teacher),
    work_assignments: assignments,
    schedule_effective_from: '2026-10-10',
    records: results,
    created: createdLessons.length,
    duplicates: results.length - createdLessons.length,
    september_wage_total: septemberWageTotal,
    pending_renewal_approval: pendingRenewalApproval
  };
  Logger.log(JSON.stringify(result));
  return result;
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
  if (!actor || (actor.role !== 'admin' && actor.nickname !== nickname)) return { ok: false, error: '只能更新自己的 APP 狀態' };
  const lessonId = String(params.lesson_id || '').trim();
  const requestId = String(params.request_id || '');
  if (!lessonId) return { ok: false, error: '找不到本人課堂紀錄' };
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) return { ok: false, error: '系統正在儲存其他課堂，請稍後重試' };
  let saved;
  let lesson;
  try {
    const row = findObject(SHEET_NAMES.TALENT_RECORDS, 'record_id', lessonId);
    if (!row || row.record_type !== 'lesson' || row.nickname !== nickname) return { ok: false, error: '找不到本人課堂紀錄' };
    lesson = talentRecordObject_(row);
    if (requestId && lesson.lastRequestId === requestId) {
      return { ok: true, lesson: lesson, duplicate: true, reportStatus: params.defer_report === true ? 'pending' : '' };
    }
    if (lesson.lessonStatus === 'cancelled' || lesson.siteType === 'partner' || lesson.lessonKind === 'coverage') {
      lesson.appStatus = 'not_required';
      lesson.appFiles = [];
      lesson.appUpdatedAt = '';
      lesson.appPublishedAt = '';
      lesson.lastRequestId = requestId;
      lesson.contentRevision = nowIso() + '-' + Utilities.getUuid().slice(0, 8);
      return { ok: true, lesson: upsertTalentRecord_('lesson', nickname, lesson, actor.nickname), exempt: true };
    }
    if (params.status !== 'published') return { ok: false, error: '請上傳發布完成截圖後再確認' };
    lesson.appFiles = mergeTalentAppEvidence_(lesson.appFiles, params.app_files);
    lesson.appStatus = 'published';
    lesson.appUpdatedAt = nowIso();
    lesson.appPublishedAt = lesson.appUpdatedAt;
    lesson.contentRevision = lesson.appUpdatedAt + '-' + Utilities.getUuid().slice(0, 8);
    lesson.lastRequestId = requestId;
    saved = upsertTalentRecord_('lesson', nickname, lesson, actor.nickname);
  } finally {
    lock.releaseLock();
  }

  logSystem(actor.nickname, 'save_talent_app_evidence', lesson.id, { teacher: nickname, files: lesson.appFiles.length });
  if (params.defer_report === true) {
    return { ok: true, lesson: saved, reportStatus: 'pending' };
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
  return { ok: true, lesson: saved, warning: warning };
}

function talentRubricVersionForMonth_(month) {
  return String(month || '') >= TALENT_RUBRIC_V2_START_MONTH_ ? 2 : 1;
}

function saveTalentScore(params) {
  const actor = params.__actor;
  if (!talentManagerCanReview_(actor)) return { ok: false, error: '只有才藝主管可評分' };
  let nickname = String(params.nickname || '').trim();
  const target = findTalentUser_(nickname);
  if (!target || talentEmployment_(target) !== 'fulltime' || !talentCanAccessUser_(actor, target)) return { ok: false, error: '找不到可評分的才藝正職' };
  nickname = target.nickname;
  const month = String(params.month || '').trim();
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return { ok: false, error: '評分月份不正確' };
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
  const result = withRecordWriteLock_(function () {
    const existingRow = findObject(SHEET_NAMES.TALENT_RECORDS, 'record_id', recordId);
    const existing = existingRow && existingRow.record_type === 'score' ? talentRecordObject_(existingRow) : null;
    // 評分版本只由月份決定，不能信任前端 payload 或既有錯誤版本。
    const rubricVersion = talentRubricVersionForMonth_(month);
    const published = Boolean(existing && existing.published) || score.published === true;
    const history = existing && Array.isArray(existing.history) ? existing.history.slice(-19) : [];
    if (existing) {
      history.push({
        rubricVersion: Number(existing.rubricVersion || 1),
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
      rubricVersion: rubricVersion,
      scores: values,
      total: total,
      reason: String(score.reason).trim(),
      published: published,
      status: published ? 'published' : 'draft',
      evaluatedBy: actor.nickname,
      evaluatedAt: nowIso(),
      history: history,
      appPhotoBonusForfeited: Boolean(existing && existing.appPhotoBonusForfeited === true),
      appPhotoBonusForfeitedBy: String(existing && existing.appPhotoBonusForfeitedBy || ''),
      appPhotoBonusForfeitedAt: String(existing && existing.appPhotoBonusForfeitedAt || ''),
      appPhotoBonusForfeitedReason: String(existing && existing.appPhotoBonusForfeitedReason || ''),
    };
    return { ok: true, score: upsertTalentRecord_('score', nickname, record, actor.nickname), published: published };
  });
  if (!result || !result.ok) return result;
  logSystem(actor.nickname, 'save_talent_score', recordId, { teacher: nickname, month: month, total: total, published: result.published });
  delete result.published;
  return result;
}

function forfeitTalentMonthlyBonus(params) {
  const actor = params.__actor;
  if (!talentManagerCanReview_(actor)) return { ok: false, error: '只有才藝主管可查證並取消當月獎金' };
  if (params.confirmed !== true) return { ok: false, error: '請明確確認此操作不可恢復' };
  const month = String(params.month || '').trim();
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return { ok: false, error: '月份不正確' };
  if (month >= todayStr().slice(0, 7)) return { ok: false, error: '只能在月份結束後查證並取消該月獎金' };
  const reason = String(params.reason || '').trim();
  if (!reason) return { ok: false, error: '請填寫主管查證原因' };
  let nickname = String(params.nickname || '').trim();
  const target = findTalentUser_(nickname);
  const canAccessTarget = target && (
    talentCanAccessUser_(actor, target) || talentCanAccessHistoricalUser_(actor, target)
  );
  if (!target || !userHasTalentWork_(target) || !canAccessTarget) {
    return { ok: false, error: '找不到可處理的才藝人員' };
  }
  nickname = target.nickname;
  const recordId = 'talent-score-' + nickname + '-' + month;
  return withRecordWriteLock_(function () {
    const existingRow = findObject(SHEET_NAMES.TALENT_RECORDS, 'record_id', recordId);
    if (existingRow && (existingRow.record_type !== 'score' || existingRow.nickname !== nickname)) {
      return { ok: false, error: '獎金資料識別衝突，請聯絡管理員' };
    }
    const existing = existingRow ? talentRecordObject_(existingRow) : null;
    if (existing && existing.appPhotoBonusForfeited === true) {
      return { ok: true, score: existing, duplicate: true, irreversible: true };
    }
    const record = existing ? talentPayload_(existing) : {
      id: recordId,
      teacher: nickname,
      date: month + '-01',
      month: month,
      rubricVersion: talentRubricVersionForMonth_(month),
      scores: {},
      total: 0,
      reason: '',
      published: false,
      status: 'penalty_only',
      history: [],
    };
    record.appPhotoBonusForfeited = true;
    record.appPhotoBonusForfeitedBy = actor.nickname;
    record.appPhotoBonusForfeitedAt = nowIso();
    record.appPhotoBonusForfeitedReason = reason.slice(0, 1000);
    const saved = upsertTalentRecord_('score', nickname, record, actor.nickname);
    logSystem(actor.nickname, 'forfeit_talent_monthly_bonus', recordId, {
      teacher: nickname,
      month: month,
      reason: record.appPhotoBonusForfeitedReason,
      irreversible: true,
    });
    return { ok: true, score: saved, irreversible: true };
  });
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
  const lessonId = String(params.lesson_id || '').trim();
  if (!lessonId) return { ok: false, error: '找不到課堂紀錄' };
  const rawApprovedNew = params.approved_new_count;
  const rawApprovedRenewal = params.approved_renewal_count;
  const approvedNew = Number(rawApprovedNew);
  const approvedRenewal = Number(rawApprovedRenewal);
  const approvedNewTypeValid = typeof rawApprovedNew === 'number' ||
    (typeof rawApprovedNew === 'string' && /^\d+$/.test(rawApprovedNew.trim()));
  const approvedRenewalTypeValid = typeof rawApprovedRenewal === 'number' ||
    (typeof rawApprovedRenewal === 'string' && /^\d+$/.test(rawApprovedRenewal.trim()));
  if (!approvedNewTypeValid || !approvedRenewalTypeValid ||
      !Number.isFinite(approvedNew) || !Number.isInteger(approvedNew) || approvedNew < 0 ||
      !Number.isFinite(approvedRenewal) || !Number.isInteger(approvedRenewal) || approvedRenewal < 0) {
    return { ok: false, error: '核准人數必須是 0 以上整數' };
  }
  const note = String(params.note || '').trim();
  const result = withRecordWriteLock_(function () {
    // 必須在與老師寫入相同的 ScriptLock 內重新讀取，避免核准覆蓋同期更新。
    const row = findObject(SHEET_NAMES.TALENT_RECORDS, 'record_id', lessonId);
    if (!row || row.record_type !== 'lesson') return { ok: false, error: '找不到課堂紀錄' };
    const lesson = talentRecordObject_(row);
    if (lesson.lessonStatus === 'cancelled') return { ok: false, error: '停課沒有獎金事件' };
    const declaredNew = Number(lesson.newCount || 0);
    const declaredRenewal = Number(lesson.renewalCount || 0);
    if (approvedNew > declaredNew || approvedRenewal > declaredRenewal) {
      return { ok: false, error: '核准人數不可高於老師申報人數' };
    }
    if (approvedNew + approvedRenewal > Number(lesson.present || 0)) {
      return { ok: false, error: '核准的新生與續報合計不可超過正式學員到課總數' };
    }
    const different = approvedNew !== declaredNew || approvedRenewal !== declaredRenewal;
    if (different && !note) return { ok: false, error: '調整人數時必須填寫原因' };
    lesson.approvedNewCount = approvedNew;
    lesson.approvedRenewalCount = approvedRenewal;
    lesson.bonusApproval = 'approved';
    lesson.bonusApprovedBy = actor.nickname;
    lesson.bonusApprovedAt = nowIso();
    lesson.bonusApprovalNote = note;
    lesson.contentRevision = lesson.bonusApprovedAt + '-' + Utilities.getUuid().slice(0, 8);
    // 舊連結內容不含這次核准結果；先隱藏並以 revision 觸發背景重建。
    lesson.reportUrl = '';
    lesson.reportFileId = '';
    lesson.reportGeneratedAt = '';
    return { ok: true, lesson: upsertTalentRecord_('lesson', row.nickname, lesson, actor.nickname) };
  });
  if (!result || !result.ok) return result;
  const reportJob = typeof queueDeferredTeacherReport_ === 'function'
    ? queueDeferredTeacherReport_({ type: 'talent', lessonId: lessonId })
    : { queued: false, scheduled: false };
  logSystem(actor.nickname, 'approve_talent_bonus', lessonId, {
    teacher: result.lesson.teacher,
    approvedNewCount: approvedNew,
    approvedRenewalCount: approvedRenewal,
    reportQueued: reportJob.queued,
  });
  return Object.assign({}, result, { reportPending: true, reportQueued: reportJob.queued });
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
    if (talentLessonEntryVersion_(lesson) >= TALENT_SIMPLE_ENTRY_VERSION_) {
      html += '<div class="grid"><div class="box">正式到課總數<br><strong>' + Number(lesson.present || 0) + '</strong></div><div class="box">其中新生<br><strong>' + Number(lesson.newCount || 0) + '</strong></div><div class="box">其中續報<br><strong>' + Number(lesson.renewalCount || 0) + '</strong></div><div class="box">體驗另計<br><strong>' + Number(lesson.trial || 0) + '</strong></div><div class="box">教室整潔<br><strong>' + (Array.isArray(lesson.roomFiles) && lesson.roomFiles.length ? '已拍照' : lesson.adminBackfillApproved ? '歷史回填' : '未附照') + '</strong></div></div>';
      if (lesson.adminBackfillApproved && (!Array.isArray(lesson.roomFiles) || !lesson.roomFiles.length)) {
        html += '<div class="box warning">此筆為管理員核定的歷史課程；當時無整潔照，系統未偽造附件。</div>';
      }
    } else {
      html += '<div class="grid six"><div class="box">應到<br><strong>' + Number(lesson.expected || 0) + '</strong></div><div class="box">正式實到<br><strong>' + Number(lesson.present || 0) + '</strong></div><div class="box">請假<br><strong>' + Number(lesson.leave || 0) + '</strong></div><div class="box">未請假缺席<br><strong>' + Number(lesson.absent || 0) + '</strong></div><div class="box">補課<br><strong>' + Number(lesson.makeup || 0) + '</strong></div><div class="box">體驗<br><strong>' + Number(lesson.trial || 0) + '</strong></div></div>';
      html += '<h3>本堂使用的備課檔案</h3><div class="box' + (prep ? '' : ' warning') + '">' + (prep
        ? '<strong>' + talentHtmlEsc_(prep.courseName || prep.title || '備課檔案') + '</strong><div class="muted">' + talentHtmlEsc_(prep.courseType || '') + '</div>' + (prep.notes ? '<p>' + talentHtmlEsc_(prep.notes) + '</p>' : '')
        : '原備課檔案已不存在') + '</div>';
      if (prep) html += talentAttachmentLinks_('備課附件', prep.materials);
      html += '<h3>課程問題及下次優化</h3><div class="box">' + talentHtmlEsc_(lesson.issue) + '</div>';
      html += '<h3>親師溝通</h3><div class="box">' + talentHtmlEsc_(lesson.parentStatus === 'complete' ? '全班回報完成' : lesson.parentStatus === 'followup' ? '有個別追蹤' : '尚未完成') + (lesson.parentFollowup ? '<br>' + talentHtmlEsc_(lesson.parentFollowup) : '') + '</div>';
      if (lesson.lessonKind === 'coverage') {
        html += '<h3>家長 APP 發布確認</h3><div class="box">帶班免發布，不列入缺件。</div>';
      } else if (lesson.siteType === 'partner') {
        html += '<h3>家長 APP 發布確認</h3><div class="box">合作校課程免發布，不列入缺件。</div>';
      } else {
        html += '<h3>家長 APP 發布確認</h3><div class="box">' + (lesson.appStatus === 'published' && Array.isArray(lesson.appFiles) && lesson.appFiles.length ? '已上傳發布完成截圖' : '尚未上傳發布完成截圖') + '</div>';
        html += talentAttachmentLinks_('家長 APP 發布完成截圖', lesson.appFiles);
      }
      html += talentAttachmentLinks_('點名簿', lesson.attendanceFiles);
      html += talentAttachmentLinks_('學習過程與成果', lesson.learningFiles);
    }
    if (lesson.employment === 'pt') html += '<h3>本堂鐘點試算</h3><div class="box">計薪只採正式學員到課總數 ' + Number(lesson.present || 0) + '＋補課 ' + Number(lesson.makeup || 0) + '（體驗另計、不列入）；' + talentHtmlEsc_(lesson.payTier || '') + '；本堂 NT$' + Number(lesson.pay || 0).toLocaleString('en-US') + '</div>';
    if (lesson.siteType === 'self' && (Number(lesson.newCount || 0) || Number(lesson.renewalCount || 0))) html += '<h3>新生／續報申報</h3><div class="box">新生 ' + Number(lesson.newCount || 0) + ' 人；續報 ' + Number(lesson.renewalCount || 0) + ' 人；狀態：' + talentHtmlEsc_(lesson.bonusApproval === 'approved' ? '已核准' : '待核准') + '</div>';
    html += talentAttachmentLinks_('課後教室整潔', lesson.roomFiles);
  }
  html += '</body></html>';
  const blob = Utilities.newBlob(html, 'text/html', 'talent.html').getAs('application/pdf').setName(fileName);
  const file = monthFolder.createFile(blob);
  secureKpiReportPath_(root, departmentFolder, teacherFolder, workFolder, monthFolder, user, 'talent', []);
  secureKpiDriveItem_(file, user, 'talent', []);
  return { url: 'https://drive.google.com/file/d/' + file.getId() + '/view', fileId: file.getId(), folderUrl: workFolder.getUrl() };
}

function regenerateTalentLessonReport(params) {
  return withResourceLease_('talent-pdf-' + String(params.lesson_id || ''), function () { return regenerateTalentLessonReportRequest_(params); });
}

function regenerateTalentLessonReportRequest_(params) {
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
  const revision = current.contentRevision || current.updatedAt;
  if (current.reportUrl && current.reportRevision === revision && params.force !== true) {
    return { ok: true, lesson: current, reportUrl: current.reportUrl, reused: true };
  }
  withRecordWriteLock_(function () { const latest = findObject(SHEET_NAMES.TALENT_RECORDS, 'record_id', lessonId); if (latest) updateRow(SHEET_NAMES.TALENT_RECORDS, latest._row, { report_attempted_at: nowIso() }); });

  const pdf = generateTalentLessonPdf_(current, user);
  const result = withRecordWriteLock_(function () {
    const latestRow = findObject(SHEET_NAMES.TALENT_RECORDS, 'record_id', lessonId);
    if (!latestRow || latestRow.record_type !== 'lesson' || latestRow.status !== 'submitted') {
      return { ok: false, error: '課堂紀錄已變更，請重新整理後再試' };
    }
    const latest = talentRecordObject_(latestRow);
    if ((latest.contentRevision || latest.updatedAt) !== revision) return { ok: false, code: 'RECORD_CONFLICT', error: '紀錄已更新，日報將接續重建為最新內容' };
    latest.reportUrl = pdf.url;
    latest.reportFileId = pdf.fileId;
    latest.reportFolderUrl = pdf.folderUrl || latest.reportFolderUrl || '';
    latest.reportGeneratedAt = nowIso();
    latest.reportRevision = latest.contentRevision || latest.updatedAt;
    updateRow(SHEET_NAMES.TALENT_RECORDS, latestRow._row, { data_json: JSON.stringify(talentPayload_(latest)) });
    const saved = talentRecordObject_(findObject(SHEET_NAMES.TALENT_RECORDS, 'record_id', lessonId));
    return { ok: true, lesson: saved, reportUrl: pdf.url };
  });
  if (result.ok) {
    notifyTalentLesson_(result.lesson, user, pdf.url);
    logSystem(actor.nickname, 'regenerate_talent_lesson_pdf', lessonId, { teacher: row.nickname });
  }
  return result;
}

function repairTalentLessonReportById_(lessonId) {
  const row = findObject(SHEET_NAMES.TALENT_RECORDS, 'record_id', String(lessonId || ''));
  if (!row || row.record_type !== 'lesson' || row.status !== 'submitted') {
    return { ok: true, skipped: true, current: true };
  }
  const result = regenerateTalentLessonReport({
    __actor: { nickname: 'system', role: 'admin', status: 'active' },
    lesson_id: row.record_id,
  });
  if (!result || !result.ok) throw new Error(result && result.error || '日報待重試');
  const lesson = result.lesson || {};
  const current = String(lesson.reportRevision || '') === String(lesson.contentRevision || lesson.updatedAt || '');
  return Object.assign({}, result, { current: current });
}

/** 補齊因 Drive 短暫錯誤而缺少的才藝日報；每次限量避免超過 Apps Script 執行時間。 */
function repairMissingTalentLessonReportsAuto() {
  ensureTalentRecordsSheet_();
  const rows = sheetToObjects(SHEET_NAMES.TALENT_RECORDS).filter(function (row) {
    if (row.record_type !== 'lesson' || row.status !== 'submitted') return false;
    const lesson = talentRecordObject_(row);
    return !String(lesson.reportUrl || '').trim() ||
      !String(lesson.reportRevision || '').trim() ||
      String(lesson.reportRevision || '') !== String(lesson.contentRevision || lesson.updatedAt || '');
  }).sort(function (a, b) { return String(a.report_attempted_at || '').localeCompare(String(b.report_attempted_at || '')); }).slice(0, 3);
  let repaired = 0;
  const errors = [];
  rows.forEach(function (row) {
    try {
      const result = repairTalentLessonReportById_(row.record_id);
      if (result.ok && result.current) repaired += 1;
    } catch (error) {
      errors.push({ id: row.record_id, error: String(error.message || error) });
    }
  });
  return { ok: errors.length === 0, scanned: rows.length, repaired: repaired, errors: errors };
}

function setupTalentReportRepairTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (trigger) {
    if (['repairMissingTalentLessonReportsAuto', 'processDeferredTeacherReportsAuto'].indexOf(trigger.getHandlerFunction()) >= 0) {
      ScriptApp.deleteTrigger(trigger);
    }
  });
  ScriptApp.newTrigger('repairMissingTalentLessonReportsAuto').timeBased().everyDays(1).atHour(22).nearMinute(15).create();
  ScriptApp.newTrigger('processDeferredTeacherReportsAuto').timeBased().everyDays(1).atHour(22).nearMinute(45).create();
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
