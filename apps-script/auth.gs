/**
 * 認證與使用者管理
 *
 * 流程：
 * 1. 前端用 Google Identity Services 取得 ID token
 * 2. 後端向 Google 驗證 ID token，再依 email 查使用者
 * 3. 後端簽發 24 小時工作階段；其餘 API 每次都驗簽與重新核對帳號狀態
 * 4. 新人由管理員預先建立 email 綁定，避免未綁定暱稱被陌生帳號認領
 */

const GOOGLE_OAUTH_CLIENT_ID_ = '110974418283-75a7ifti599cauhptkcd0jsqshfrupbf.apps.googleusercontent.com';
const API_SESSION_TTL_MS_ = 24 * 60 * 60 * 1000;

function whoami(params) {
  const identity = verifyLoginIdentity_(params || {});
  if (!identity.ok) return identity;
  const email = identity.email;

  const user = findUserByEmail(email);
  if (!user) {
    return {
      ok: true,
      registered: false,
      email,
      msg: '此 Email 尚未開通，請管理員先建立帳號並綁定 Email'
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
      department: normalizeDepartment_(user.department),
      status: user.status,
      subtype: user.subtype || '',
      employment_type: user.employment_type || '',
      work_assignments: parseUserListField_(user.work_assignments),
      schedule_json: parseUserListField_(user.schedule_json),
      rest_days: parseUserListField_(user.rest_days)
    },
    session_token: user.status === 'active' ? issueSessionToken_(user) : ''
  };
}

function getSessionIdentity(params) {
  const user = params && params.__actor;
  if (!user || user.status !== 'active') {
    return { ok: false, error: '登入狀態已失效，請重新登入', code: 'AUTH_REQUIRED' };
  }
  return {
    ok: true,
    user: {
      nickname: user.nickname,
      email: user.email,
      role: user.role,
      department: normalizeDepartment_(user.department),
      status: user.status,
      subtype: user.subtype || '',
      employment_type: user.employment_type || '',
      work_assignments: parseUserListField_(user.work_assignments),
      schedule_json: parseUserListField_(user.schedule_json),
      rest_days: parseUserListField_(user.rest_days)
    }
  };
}

function parseUserListField_(value) {
  if (Array.isArray(value)) return value;
  if (!value) return [];
  try {
    const parsed = JSON.parse(String(value));
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    return String(value).split(/[,、;|]/).map(function (item) { return item.trim(); }).filter(Boolean);
  }
}

function userScheduleKey_(item) {
  if (!item || typeof item !== 'object') return '';
  if (item.scheduleKey || item.key) return String(item.scheduleKey || item.key).trim().slice(0, 240);
  return [
    'w' + Number(item.weekday),
    String(item.time || '').trim(),
    String(item.siteType || '').trim(),
    String(item.site || '').trim()
  ].map(function (value) { return encodeURIComponent(value); }).join('__');
}

function normalizeUserSchedule_(value) {
  const list = parseUserListField_(value);
  if (list.length > 28) throw new Error('固定排班最多 28 筆');
  const weekdayLabels = ['週日', '週一', '週二', '週三', '週四', '週五', '週六'];
  const seen = {};
  return list.map(function (item) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) throw new Error('固定排班格式不正確');
    const weekday = Number(item.weekday);
    const time = String(item.time || '').trim().slice(0, 80);
    const siteType = String(item.siteType || 'self').trim();
    const site = String(item.site || '').trim().slice(0, 100);
    if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6) throw new Error('固定排班星期不正確');
    if (!time || !site) throw new Error('固定排班必須包含時間與地點');
    if (['self', 'partner'].indexOf(siteType) < 0) throw new Error('固定排班場域不正確');
    const normalized = {
      weekday: weekday,
      label: String(item.label || weekdayLabels[weekday]).trim().slice(0, 20),
      time: time,
      siteType: siteType,
      site: site
    };
    normalized.scheduleKey = userScheduleKey_(Object.assign({}, normalized, { scheduleKey: item.scheduleKey || item.key || '' }));
    if (!normalized.scheduleKey || seen[normalized.scheduleKey]) throw new Error('固定排班有重複班次，請確認星期、時間與地點');
    seen[normalized.scheduleKey] = true;
    return normalized;
  });
}

function normalizeRestDays_(value) {
  const allowed = ['週日', '週一', '週二', '週三', '週四', '週五', '週六'];
  const seen = {};
  return parseUserListField_(value).map(function (item) { return String(item || '').trim(); }).filter(function (item) {
    if (allowed.indexOf(item) < 0) throw new Error('固定休假日期不正確');
    if (seen[item]) return false;
    seen[item] = true;
    return true;
  });
}

function validateUserWorkConfiguration_(role, employment, assignments, schedule) {
  const work = Array.isArray(assignments) ? assignments : [];
  const employmentType = String(employment || '');
  if (work.indexOf('talent-pt') >= 0) {
    if (employmentType !== 'pt') throw new Error('才藝 PT 工作區必須搭配 PT 聘用身分');
    if (!Array.isArray(schedule) || !schedule.length) throw new Error('才藝 PT 必須先設定至少一筆固定排班');
  }
  if (work.indexOf('talent-fulltime') >= 0 && employmentType !== 'fulltime') {
    throw new Error('才藝正職工作區必須搭配正職聘用身分');
  }
  if (work.indexOf('talent-manager') >= 0 && role !== 'manager' && role !== 'admin') {
    throw new Error('才藝主管工作區只可指派給主管或管理員');
  }
  if (work.indexOf('talent-payroll') >= 0 && role !== 'manager' && role !== 'admin') {
    throw new Error('才藝薪資工作區只可指派給主管或管理員');
  }
  if (work.indexOf('admin-marketing') >= 0 && role !== 'admin_staff' && role !== 'admin') {
    throw new Error('行政美宣工作區只可指派給行政美宣人員');
  }
  if (work.indexOf('admin-marketing-manager') >= 0 && role !== 'manager' && role !== 'admin') {
    throw new Error('行政美宣主管工作區只可指派給主管或管理員');
  }
}

/** 驗證首次 Google 登入，或用尚未過期的後端工作階段重新核對身分。 */
function verifyLoginIdentity_(params) {
  const requestedEmail = String(params.email || '').toLowerCase().trim();
  if (params.credential) return verifyGoogleCredential_(String(params.credential), requestedEmail);
  if (params.session_token) {
    const session = verifySessionToken_(String(params.session_token));
    if (!session.ok) return session;
    if (requestedEmail && requestedEmail !== String(session.user.email || '').toLowerCase()) {
      return { ok: false, error: '登入身分不一致', code: 'AUTH_INVALID' };
    }
    return { ok: true, email: String(session.user.email || '').toLowerCase(), user: session.user };
  }
  return { ok: false, error: '請重新使用 Google 登入', code: 'AUTH_REQUIRED' };
}

/** Google ID token 必須由後端驗證，不能只相信前端 decode 出來的 email。 */
function verifyGoogleCredential_(credential, requestedEmail) {
  if (!credential) return { ok: false, error: '缺少 Google 登入憑證', code: 'AUTH_REQUIRED' };
  try {
    const response = UrlFetchApp.fetch(
      'https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(credential),
      { muteHttpExceptions: true }
    );
    if (response.getResponseCode() !== 200) {
      return { ok: false, error: 'Google 登入憑證無效，請重新登入', code: 'AUTH_INVALID' };
    }
    const profile = JSON.parse(response.getContentText() || '{}');
    const expectedClientId = PropertiesService.getScriptProperties().getProperty('GOOGLE_CLIENT_ID') || GOOGLE_OAUTH_CLIENT_ID_;
    const email = String(profile.email || '').toLowerCase().trim();
    const issuer = String(profile.iss || '');
    const expiresAt = Number(profile.exp || 0) * 1000;
    if (!email || String(profile.aud || '') !== expectedClientId ||
        !['accounts.google.com', 'https://accounts.google.com'].includes(issuer) ||
        String(profile.email_verified || '') !== 'true' || expiresAt <= Date.now()) {
      return { ok: false, error: 'Google 登入驗證失敗，請重新登入', code: 'AUTH_INVALID' };
    }
    if (requestedEmail && requestedEmail !== email) {
      return { ok: false, error: 'Google 帳號與登入資料不一致', code: 'AUTH_INVALID' };
    }
    return { ok: true, email: email };
  } catch (error) {
    return { ok: false, error: '暫時無法驗證 Google 登入，請稍後重試', code: 'AUTH_UNAVAILABLE' };
  }
}

function apiSessionSecret_() {
  const props = PropertiesService.getScriptProperties();
  let secret = props.getProperty('API_SESSION_SECRET');
  if (!secret) {
    secret = Utilities.getUuid() + Utilities.getUuid() + Utilities.getUuid();
    props.setProperty('API_SESSION_SECRET', secret);
  }
  return secret;
}

function base64UrlText_(text) {
  return Utilities.base64EncodeWebSafe(String(text), Utilities.Charset.UTF_8).replace(/=+$/g, '');
}

function sessionSignature_(encodedPayload) {
  const bytes = Utilities.computeHmacSha256Signature(
    String(encodedPayload), apiSessionSecret_(), Utilities.Charset.UTF_8
  );
  return Utilities.base64EncodeWebSafe(bytes).replace(/=+$/g, '');
}

function constantTimeTextEqual_(left, right) {
  left = String(left || '');
  right = String(right || '');
  if (left.length !== right.length) return false;
  let mismatch = 0;
  for (let i = 0; i < left.length; i++) mismatch |= left.charCodeAt(i) ^ right.charCodeAt(i);
  return mismatch === 0;
}

function issueSessionToken_(user) {
  const now = Date.now();
  const payload = base64UrlText_(JSON.stringify({
    v: 1,
    nickname: String(user.nickname || ''),
    email: String(user.email || '').toLowerCase(),
    role: String(user.role || ''),
    department: String(user.department || ''),
    issued_at: now,
    expires_at: now + API_SESSION_TTL_MS_,
  }));
  return payload + '.' + sessionSignature_(payload);
}

function verifySessionToken_(token) {
  const parts = String(token || '').split('.');
  if (parts.length !== 2 || !parts[0] || !parts[1] ||
      !constantTimeTextEqual_(parts[1], sessionSignature_(parts[0]))) {
    return { ok: false, error: '登入工作階段無效，請重新登入', code: 'AUTH_INVALID' };
  }
  let payload;
  try {
    payload = JSON.parse(Utilities.newBlob(Utilities.base64DecodeWebSafe(parts[0])).getDataAsString());
  } catch (error) {
    return { ok: false, error: '登入工作階段無效，請重新登入', code: 'AUTH_INVALID' };
  }
  if (payload.v !== 1 || Number(payload.expires_at || 0) <= Date.now()) {
    return { ok: false, error: '登入已逾時，請重新登入', code: 'AUTH_EXPIRED' };
  }
  const user = findUserByNickname(String(payload.nickname || ''));
  if (!user || user.status !== 'active' ||
      String(user.email || '').toLowerCase() !== String(payload.email || '').toLowerCase() ||
      String(user.role || '') !== String(payload.role || '') ||
      String(user.department || '') !== String(payload.department || '')) {
    return { ok: false, error: '帳號權限已變更，請重新登入', code: 'AUTH_INVALID' };
  }
  return { ok: true, user: user };
}

function authenticateApiRequest_(params) {
  if (!params || !params.session_token) {
    return { ok: false, error: '請先登入再操作', code: 'AUTH_REQUIRED' };
  }
  return verifySessionToken_(String(params.session_token));
}

function actorCanAccessUser_(actor, target) {
  if (!actor || !target || actor.status !== 'active') return false;
  if (actor.role === 'admin' || isGlobalManager_(actor)) return true;
  if (actor.nickname === target.nickname) return true;
  return actor.role === 'manager' && sameDepartment_(actor.department, target.department);
}

function requireApiRole_(actor, allowedRoles) {
  if (!actor || allowedRoles.indexOf(actor.role) < 0) throw new Error('權限不足');
}

function requireApiUserScope_(actor, nickname) {
  const target = nickname ? findUserByNickname(String(nickname)) : null;
  if (!target || !actorCanAccessUser_(actor, target)) throw new Error('無權存取此人員資料');
  return target;
}

function authorizeTaskResource_(actor, taskId, deleting) {
  const task = taskId ? findObject(SHEET_NAMES.TASKS, 'task_id', taskId) : null;
  if (!task) return;
  const assignee = findUserByNickname(String(task.assignee || ''));
  const scopedManager = actor.role === 'manager' && assignee && actorCanAccessUser_(actor, assignee);
  const own = task.assignee === actor.nickname || task.created_by === actor.nickname;
  if (actor.role !== 'admin' && !scopedManager && !own) throw new Error('無權操作此事項');
  if (deleting && actor.role !== 'admin' && !scopedManager && task.created_by !== actor.nickname) {
    throw new Error('只有建立者或主管可以刪除事項');
  }
}

/**
 * 每個 HTTP API 的單一權限入口。這裡會以已驗簽 actor 覆蓋前端傳入的
 * viewer / operator / evaluator，並對資料對象再次做部門範圍判斷。
 */
function authorizeApiAction_(action, params, actor) {
  const adminOnly = [
    'addUser', 'updateUser', 'approveUser', 'deleteUser', 'setConfig', 'setupSystemAutomation',
    'cleanupDuplicateEvidence', 'adminStampSubmitted', 'adminBroadcast',
    'sendDailyKpiPdf', 'setupSheets', 'purgeTestData', 'approveTalentBonus'
  ];
  if (adminOnly.indexOf(action) >= 0) {
    requireApiRole_(actor, ['admin']);
    params.operator = actor.nickname;
    return;
  }

  if (action === 'listUsers') {
    requireApiRole_(actor, ['admin', 'manager', 'admin_staff']);
    params.operator = actor.nickname;
    return;
  }
  if (action === 'getSystemReadiness') {
    requireApiRole_(actor, ['admin', 'manager']);
    params.operator = actor.nickname;
    return;
  }
  if (action === 'testMyNotifications' || action === 'debugPush') {
    params.operator = actor.nickname;
    params.nickname = actor.nickname;
    return;
  }
  if (action === 'registerPushSubscription' || action === 'unregisterPushSubscription' || action === 'getLineBindingCode') {
    params.operator = actor.nickname;
    params.nickname = actor.nickname;
    return;
  }

  if (action === 'getAttachmentPreviews') {
    params.viewer = actor.nickname;
    return;
  }

  const viewerActions = [
    'listLogs', 'getEvidenceLog', 'listWeekly', 'listCoursePreps',
    'listArchivedKpiFiles', 'listTeacherReportFolders', 'getTalentWorkspaceData',
    'getAdminMarketingWorkspaceData',
    'getAdminMarketingDriveFolders',
    'getEvalEvidence', 'getEval', 'listEvals',
    'listTasks', 'getDashboard'
  ];
  if (viewerActions.indexOf(action) >= 0) params.viewer = actor.nickname;

  if (action === 'listTeacherReportFolders') {
    requireApiRole_(actor, ['admin', 'manager']);
    params.viewer = actor.nickname;
    return;
  }

  if (action === 'getTalentWorkspaceData') {
    params.viewer = actor.nickname;
    return;
  }

  if (action === 'getAdminMarketingWorkspaceData') {
    params.viewer = actor.nickname;
    return;
  }

  if (action === 'getAdminMarketingDriveFolders') {
    requireApiRole_(actor, ['admin', 'manager']);
    params.viewer = actor.nickname;
    return;
  }

  if (action === 'saveAdminMarketingRecord') {
    const target = requireApiUserScope_(actor, params.nickname || actor.nickname);
    if (target.status !== 'active') throw new Error('此員工帳號已停用，不能新增或修改行政美宣資料');
    params.nickname = target.nickname;
    if (actor.role !== 'admin' && target.nickname !== actor.nickname) throw new Error('只能修改自己的行政美宣紀錄');
    return;
  }

  if (action === 'saveAdminMarketingAssignment' || action === 'addAdminMarketingMessage') {
    requireApiUserScope_(actor, params.nickname);
    params.operator = actor.nickname;
    return;
  }

  if (action === 'reviewAdminMarketingRecord' || action === 'saveAdminMarketingScore') {
    requireApiRole_(actor, ['admin', 'manager']);
    params.operator = actor.nickname;
    return;
  }

  if (['saveTalentLesson', 'saveTalentDraft', 'saveTalentPrep', 'updateTalentAppStatus'].indexOf(action) >= 0) {
    const target = requireApiUserScope_(actor, params.nickname || actor.nickname);
    if (target.status !== 'active') throw new Error('此員工帳號已停用或刪除，不能新增或修改才藝資料');
    params.nickname = target.nickname;
    if (actor.role !== 'admin' && target.nickname !== actor.nickname) throw new Error('只能修改自己的才藝資料');
    return;
  }

  if (action === 'deleteTalentPrep' || action === 'deleteCoursePrep') {
    params.operator = actor.nickname;
    return;
  }

  if (action === 'regenerateTalentLessonReport') {
    params.operator = actor.nickname;
    return;
  }

  if (['reviewTalentPrep', 'saveTalentScore'].indexOf(action) >= 0) {
    requireApiRole_(actor, ['admin', 'manager']);
    params.operator = actor.nickname;
    return;
  }

  if (action === 'addTalentMessage') {
    params.operator = actor.nickname;
    return;
  }

  const ownContentActions = [
    'saveLog', 'uploadPhoto', 'uploadFile', 'saveWeekly', 'saveCoursePrep',
    'saveSelfTask', 'deleteSelfTask', 'addPost', 'saveOKR'
  ];
  if (ownContentActions.indexOf(action) >= 0) {
    const target = requireApiUserScope_(actor, params.nickname || actor.nickname);
    if (target.status !== 'active') throw new Error('此員工帳號已停用或刪除，不能新增或修改資料');
    params.nickname = target.nickname;
    if (actor.role !== 'admin' && target.nickname !== actor.nickname) throw new Error('只能修改自己的資料');
    return;
  }

  // 匯出與通知不改寫老師原始紀錄，主管可在既有查閱範圍內代為重建。
  if (['sendSubmitPdf', 'archiveMonthlyCsv'].indexOf(action) >= 0) {
    const target = requireApiUserScope_(actor, params.nickname || actor.nickname);
    params.nickname = target.nickname;
    return;
  }

  if (['getTodayLog', 'getMakeupQuota', 'getWeekly', 'getOKR', 'getMyKpiPreview', 'getWeekPostCount'].indexOf(action) >= 0) {
    const target = requireApiUserScope_(actor, params.nickname || actor.nickname);
    params.nickname = target.nickname;
    params.viewer = actor.nickname;
    return;
  }

  if (action === 'getLog') {
    let nickname = params.nickname || '';
    if (!nickname && params.log_id) {
      const log = findObject(SHEET_NAMES.LOGS, 'log_id', params.log_id);
      nickname = log ? log.nickname : '';
    }
    if (nickname) requireApiUserScope_(actor, nickname);
    params.viewer = actor.nickname;
    return;
  }

  if (action === 'saveEval') {
    requireApiRole_(actor, ['admin', 'manager']);
    requireApiUserScope_(actor, params.nickname);
    params.evaluator = actor.nickname;
    return;
  }
  if (action === 'getEvalEvidence' || action === 'getEval') {
    requireApiUserScope_(actor, params.nickname);
    return;
  }
  if (action === 'listEvals') {
    requireApiRole_(actor, ['admin', 'manager']);
    return;
  }

  if (action === 'addFeedback') {
    const target = requireApiUserScope_(actor, params.to_nickname);
    if (actor.role === 'teacher' || actor.role === 'admin_staff') {
      if (!(target.role === 'admin' || (target.role === 'manager' && (sameDepartment_(target.department, actor.department) || isGlobalManager_(target))))) {
        throw new Error('只能回覆主管或管理員');
      }
    }
    params.from_nickname = actor.nickname;
    return;
  }
  if (action === 'listFeedback') {
    if (actor.role !== 'admin') params.nickname = actor.nickname;
    else if (params.nickname) requireApiUserScope_(actor, params.nickname);
    params.viewer = actor.nickname;
    return;
  }
  if (action === 'listFeedbackThread') {
    const messages = sheetToObjects(SHEET_NAMES.FEEDBACK).filter(item => item.log_id === params.log_id);
    if (messages.length && actor.role !== 'admin') {
      const allowed = messages.some(item => item.from_nickname === actor.nickname || item.to_nickname === actor.nickname ||
        actorCanAccessUser_(actor, findUserByNickname(item.from_nickname)) || actorCanAccessUser_(actor, findUserByNickname(item.to_nickname)));
      if (!allowed) throw new Error('無權讀取此對話');
    }
    params.viewer = actor.nickname;
    return;
  }
  if (action === 'markFeedbackRead') {
    const item = findObject(SHEET_NAMES.FEEDBACK, 'feedback_id', params.feedback_id);
    if (item && actor.role !== 'admin' && item.to_nickname !== actor.nickname) throw new Error('無權更新此訊息');
    params.reader = actor.nickname;
    return;
  }

  if (action === 'addObservation') {
    requireApiRole_(actor, ['admin', 'manager']);
    requireApiUserScope_(actor, params.observed);
    params.observer = actor.nickname;
    return;
  }
  if (action === 'listObservations') {
    if (params.observed) requireApiUserScope_(actor, params.observed);
    if (actor.role === 'teacher' || actor.role === 'admin_staff') params.observed = actor.nickname;
    else if (actor.role === 'manager' && !params.observed) params.observer = actor.nickname;
    params.viewer = actor.nickname;
    return;
  }
  if (action === 'listPosts') {
    if (params.nickname) requireApiUserScope_(actor, params.nickname);
    if (actor.role !== 'admin' && !params.nickname) params.nickname = actor.nickname;
    params.viewer = actor.nickname;
    return;
  }

  if (action === 'updateOKRProgress') {
    const okr = findObject(SHEET_NAMES.OKR, 'okr_id', params.okr_id);
    if (okr && actor.role !== 'admin' && okr.nickname !== actor.nickname) throw new Error('只能更新自己的 OKR');
    params.operator = actor.nickname;
    return;
  }

  if (action === 'addTask') {
    requireApiRole_(actor, ['admin', 'manager', 'admin_staff']);
    let assignees = params.assignees;
    if (typeof assignees === 'string') assignees = assignees.split(',').map(item => item.trim()).filter(Boolean);
    (assignees || []).forEach(nickname => requireApiUserScope_(actor, nickname));
    params.created_by = actor.nickname;
    return;
  }
  if (action === 'updateTaskStatus' || action === 'deleteTask') {
    authorizeTaskResource_(actor, params.task_id, action === 'deleteTask');
    params.operator = actor.nickname;
    return;
  }

  if (action === 'listStudents') {
    if (actor.role === 'teacher' || actor.role === 'admin_staff') {
      params.teacher = actor.nickname;
      params.department = '';
    } else if (actor.role === 'manager' && !isGlobalManager_(actor)) {
      if (params.teacher) requireApiUserScope_(actor, params.teacher);
      params.department = actor.department;
    } else if (params.teacher) requireApiUserScope_(actor, params.teacher);
    params.viewer = actor.nickname;
    return;
  }
  if (action === 'addStudent' || action === 'updateStudent' || action === 'deleteStudent') {
    requireApiRole_(actor, ['admin', 'manager']);
    if (action === 'addStudent') requireApiUserScope_(actor, params.teacher);
    else {
      const student = findObject(SHEET_NAMES.STUDENTS, 'student_id', params.student_id);
      if (student) requireApiUserScope_(actor, student.teacher);
      if (params.teacher) requireApiUserScope_(actor, params.teacher);
    }
    params.operator = actor.nickname;
    return;
  }

  if (['deleteCoursePrep'].indexOf(action) >= 0) {
    params.operator = actor.nickname;
    const prep = findObject(SHEET_NAMES.COURSE_PREP, 'prep_id', params.prep_id);
    if (prep) {
      requireApiUserScope_(actor, prep.nickname);
      if (actor.role !== 'admin' && prep.nickname !== actor.nickname) throw new Error('只能刪除自己的備課檔案');
    }
    return;
  }

  // 已在前面覆蓋 viewer，個別函式仍會依角色/部門過濾。
  if (['listLogs', 'getEvidenceLog', 'listWeekly', 'listCoursePreps',
       'listArchivedKpiFiles', 'listTasks', 'getDashboard'].indexOf(action) >= 0) return;

  throw new Error('此功能尚未設定安全權限');
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
  return { ok: false, error: '新人請由管理員先建立帳號並綁定 Email' };
}

/**
 * 老師認領暱稱：把 email 寫入該暱稱
 */
function claimNickname(params) {
  return { ok: false, error: '自助認領已停用，請由管理員先綁定 Email' };
}

/**
 * 列出所有使用者（admin 用）
 */
function listUsers(params) {
  const operator = params && params.operator ? findUserByNickname(params.operator) : null;
  if (!operator || operator.status !== 'active' || !['admin', 'manager', 'admin_staff'].includes(operator.role)) {
    return { ok: false, error: '無查看人員權限' };
  }
  let users = sheetToObjects(SHEET_NAMES.USERS);
  if (operator.role !== 'admin' && !isGlobalManager_(operator)) {
    users = users.filter(user => sameDepartment_(user.department, operator.department) || user.nickname === operator.nickname);
  }
  users = users.map(function (user) {
    const copy = Object.assign({}, user);
    delete copy._row;
    copy.department = normalizeDepartment_(copy.department);
    copy.work_assignments = parseUserListField_(copy.work_assignments);
    try {
      copy.schedule_json = normalizeUserSchedule_(copy.schedule_json);
      copy.rest_days = normalizeRestDays_(copy.rest_days);
      copy.configuration_error = '';
    } catch (error) {
      copy.schedule_json = [];
      copy.rest_days = [];
      copy.configuration_error = String(error.message || error);
    }
    return copy;
  });
  return { ok: true, users };
}

/**
 * admin 新增使用者
 */
function addUser(params) {
  const operator = params && params.operator ? findUserByNickname(params.operator) : null;
  if (!operator || operator.role !== 'admin' || operator.status !== 'active') return { ok: false, error: '需 admin 權限' };
  const { nickname, role, department, email, phone, notes } = params;
  const normalizedEmail = String(email || '').toLowerCase().trim();
  const normalizedDepartment = normalizeDepartment_(department);
  if (!nickname || !role || !department || !normalizedEmail) {
    return { ok: false, error: '暱稱、Google Email、角色與部門皆為必填' };
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) return { ok: false, error: 'Google Email 格式不正確' };
  if (!ROLES.includes(role)) return { ok: false, error: 'invalid role' };
  if (!DEPARTMENTS.includes(normalizedDepartment)) return { ok: false, error: 'invalid department' };
  if (params.employment_type && !['fulltime', 'pt', 'manager', 'admin'].includes(String(params.employment_type))) {
    return { ok: false, error: 'invalid employment_type' };
  }
  const workAssignments = parseUserListField_(params.work_assignments);
  const allowedAssignments = ['anqin-teacher', 'anqin-manager', 'talent-fulltime', 'talent-pt', 'talent-manager', 'talent-payroll', 'admin-marketing', 'admin-marketing-manager'];
  if (workAssignments.some(function (item) { return allowedAssignments.indexOf(item) < 0; })) {
    return { ok: false, error: 'invalid work_assignments' };
  }
  const normalizedSchedule = normalizeUserSchedule_(params.schedule_json);
  const normalizedRestDays = normalizeRestDays_(params.rest_days);
  validateUserWorkConfiguration_(role, params.employment_type, workAssignments, normalizedSchedule);

  // 行政美編行銷必須有 subtype（general/marketing），否則 KPI_Config 查不到
  const subtype = role === 'admin_staff'
    ? (ADMIN_STAFF_SUBTYPES.includes(params.subtype) ? params.subtype : 'general')
    : '';

  // 檢查暱稱重複
  if (findUserByNickname(nickname)) {
    return { ok: false, error: '暱稱已存在' };
  }
  // 檢查 email 重複
  if (findUserByEmail(normalizedEmail)) {
    return { ok: false, error: 'Email 已綁定其他暱稱' };
  }

  appendRow(SHEET_NAMES.USERS, {
    nickname,
    email: normalizedEmail,
    role,
    department: normalizedDepartment,
    status: 'active',
    phone: phone || '',
    joined_at: nowIso(),
    last_login: '',
    notes: notes || '',
    subtype,
    employment_type: params.employment_type || '',
    work_assignments: workAssignments,
    schedule_json: normalizedSchedule,
    rest_days: normalizedRestDays
  });
  invalidateKpiDriveAccess_();
  logSystem(params.operator || 'system', 'add_user', nickname, { role, department });

  return { ok: true, msg: '新增成功' };
}

/**
 * admin 更新使用者
 */
function updateUser(params) {
  const operator = params && params.operator ? findUserByNickname(params.operator) : null;
  if (!operator || operator.role !== 'admin' || operator.status !== 'active') return { ok: false, error: '需 admin 權限' };
  const { nickname } = params;
  if (!nickname) return { ok: false, error: 'missing nickname' };
  const user = findUserByNickname(nickname);
  if (!user) return { ok: false, error: 'user not found' };
  if (user.status === 'deleted') return { ok: false, error: '此員工帳號已刪除，不能重新啟用或修改' };

  const updates = {};
  ['email', 'line_user_id', 'role', 'department', 'status', 'phone', 'notes', 'subtype',
   'employment_type', 'work_assignments', 'schedule_json', 'rest_days'].forEach(k => {
    if (params[k] !== undefined) updates[k] = params[k];
  });
  if (updates.email !== undefined) {
    updates.email = String(updates.email || '').toLowerCase().trim();
    if (updates.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(updates.email)) return { ok: false, error: 'Google Email 格式不正確' };
    const duplicate = updates.email ? findUserByEmail(updates.email) : null;
    if (duplicate && duplicate.nickname !== nickname) return { ok: false, error: 'Email 已綁定其他暱稱' };
  }
  if (updates.role !== undefined && !ROLES.includes(updates.role)) return { ok: false, error: 'invalid role' };
  if (updates.department !== undefined) {
    updates.department = normalizeDepartment_(updates.department);
    if (!DEPARTMENTS.includes(updates.department)) return { ok: false, error: 'invalid department' };
  }
  if (updates.status !== undefined && !['active', 'pending', 'suspended'].includes(updates.status)) return { ok: false, error: 'invalid status' };
  if (updates.subtype !== undefined && updates.subtype && !ADMIN_STAFF_SUBTYPES.includes(updates.subtype)) return { ok: false, error: 'invalid subtype' };
  if (updates.employment_type !== undefined && updates.employment_type && !['fulltime', 'pt', 'manager', 'admin'].includes(String(updates.employment_type))) return { ok: false, error: 'invalid employment_type' };
  if (updates.work_assignments !== undefined) {
    const assignments = parseUserListField_(updates.work_assignments);
    const allowed = ['anqin-teacher', 'anqin-manager', 'talent-fulltime', 'talent-pt', 'talent-manager', 'talent-payroll', 'admin-marketing', 'admin-marketing-manager'];
    if (assignments.some(function (item) { return allowed.indexOf(item) < 0; })) return { ok: false, error: 'invalid work_assignments' };
    updates.work_assignments = assignments;
  }
  if (updates.schedule_json !== undefined) updates.schedule_json = normalizeUserSchedule_(updates.schedule_json);
  if (updates.rest_days !== undefined) updates.rest_days = normalizeRestDays_(updates.rest_days);
  const resultingRole = updates.role !== undefined ? updates.role : user.role;
  const resultingEmployment = updates.employment_type !== undefined ? updates.employment_type : user.employment_type;
  const resultingAssignments = updates.work_assignments !== undefined ? updates.work_assignments : parseUserListField_(user.work_assignments);
  const resultingSchedule = updates.schedule_json !== undefined ? updates.schedule_json : normalizeUserSchedule_(user.schedule_json);
  validateUserWorkConfiguration_(resultingRole, resultingEmployment, resultingAssignments, resultingSchedule);
  const resultingStatus = updates.status !== undefined ? updates.status : user.status;
  const resultingEmail = updates.email !== undefined ? updates.email : String(user.email || '').trim();
  if (resultingStatus === 'active' && !resultingEmail) return { ok: false, error: '啟用帳號前必須先綁定 Google Email' };
  updateRow(SHEET_NAMES.USERS, user._row, updates);
  invalidateKpiDriveAccess_();
  logSystem(params.operator || 'system', 'update_user', nickname, updates);

  return { ok: true, msg: '更新成功' };
}

/**
 * 永久刪除員工帳號。保留暱稱、職務與排班快照，讓既有日報、薪資及評分
 * 仍可稽核；登入資料與所有通知綁定會立即移除，且不可由一般更新流程復原。
 */
function deleteUser(params) {
  const operator = params && params.operator ? findUserByNickname(params.operator) : null;
  const operatorName = String(operator && operator.nickname || '').trim().replace(/(?:老師|主管)$/, '');
  if (!operator || operator.role !== 'admin' || operator.status !== 'active' || operatorName !== '柏翰') {
    return { ok: false, error: '只有柏翰管理員可以刪除員工' };
  }
  ensureHeaders(getSheet(SHEET_NAMES.USERS), ['deleted_at', 'deleted_by']);
  const nickname = String(params.nickname || '').trim();
  const confirmation = String(params.confirm_nickname || '').trim();
  if (!nickname || confirmation !== nickname) return { ok: false, error: '請完整輸入員工暱稱以確認刪除' };
  if (nickname === operator.nickname) return { ok: false, error: '不能刪除目前登入的管理員帳號' };

  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  let user;
  let previousEmail = '';
  try {
    user = findUserByNickname(nickname);
    if (!user) return { ok: false, error: '找不到此員工' };
    if (user.role === 'admin') return { ok: false, error: '管理員帳號不可從此處刪除' };
    if (user.status === 'deleted') return { ok: false, error: '此員工帳號已刪除' };
    previousEmail = String(user.email || '').trim().toLowerCase();
    updateRow(SHEET_NAMES.USERS, user._row, {
      status: 'deleted',
      email: '',
      phone: '',
      line_user_id: '',
      push_subscription_id: '',
      last_login: '',
      notes: '',
      deleted_at: nowIso(),
      deleted_by: operator.nickname,
    });
  } finally {
    lock.releaseLock();
  }

  invalidateKpiDriveAccess_();
  let driveRevocation = { ok: true, scanned: 0, removed: 0, complete: true };
  if (previousEmail) {
    try {
      driveRevocation = revokeKpiDriveUserAccess_(user, previousEmail);
    } catch (error) {
      driveRevocation = { ok: false, error: String(error.message || error) };
    }
  }
  logSystem(operator.nickname, 'delete_user', nickname, {
    deleted_at: nowIso(),
    had_google_binding: Boolean(previousEmail),
    drive_revocation: driveRevocation,
  });
  return {
    ok: true,
    msg: '員工帳號已刪除；歷史日報、薪資與評分保留供稽核',
    drive_revocation: driveRevocation,
  };
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

/** 小魚主管需跨校區支援；其他主管仍只看自己的校區。 */
function isGlobalManager_(user) {
  const nickname = String(user && user.nickname || '').trim().replace(/(?:老師|主管)$/, '');
  return !!user && user.role === 'manager' && nickname === '小魚';
}

function canViewDepartment_(user, department) {
  return !!user && (user.role === 'admin' || isGlobalManager_(user) ||
    (user.role === 'manager' && sameDepartment_(user.department, department)));
}
