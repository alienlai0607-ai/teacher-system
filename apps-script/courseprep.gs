/**
 * 安親 V2 備課教案建檔。
 * 教材原檔存放在 Drive；此表只保存可跨裝置還原的備課、教案與檔案連結。
 */

function ensureCoursePrepSheet_() {
  const ss = getSS();
  let sheet = ss.getSheetByName(SHEET_NAMES.COURSE_PREP);
  if (!sheet) sheet = ss.insertSheet(SHEET_NAMES.COURSE_PREP);
  ensureHeaders(sheet, [
    'prep_id', 'nickname', 'department', 'title', 'course_type',
    'created_date', 'status', 'data_json', 'created_at', 'updated_at', 'record_revision', 'last_request_id'
  ]);
  return sheet;
}

function coursePrepPayload_(value) {
  const snapshot = JSON.parse(JSON.stringify(value || {}));
  function stripInlineMedia(item) {
    if (!item || typeof item !== 'object') return;
    if (Array.isArray(item)) {
      item.forEach(stripInlineMedia);
      return;
    }
    Object.keys(item).forEach(key => {
      if (key === 'dataUrl') item[key] = '';
      else stripInlineMedia(item[key]);
    });
  }
  stripInlineMedia(snapshot);
  return snapshot;
}

function saveCoursePrep(params) {
  const nickname = String(params.nickname || '').trim();
  const user = nickname ? findUserByNickname(nickname) : null;
  if (!user || user.status !== 'active' || !['teacher', 'manager'].includes(user.role)) {
    return { ok: false, error: '無備課建檔權限' };
  }
  const prep = coursePrepPayload_(params.prep);
  const plan = params.plan ? coursePrepPayload_(params.plan) : null;
  if (!prep.id || prep.type !== 'lessonprep' || !String(prep.title || '').trim()) {
    return { ok: false, error: '備課檔案資料不完整' };
  }
  const prepFiles = Array.isArray(prep.prepEvidence) ? prep.prepEvidence : [];
  const planFiles = plan && Array.isArray(plan.materials) ? plan.materials : [];
  const hasArchivedMaterial = prepFiles.concat(planFiles).some(function (item) {
    return /^https:\/\/drive\.google\.com\//i.test(String(item && (item.cloudUrl || item.url) || ''));
  });
  if (!hasArchivedMaterial) return { ok: false, error: '請至少上傳一份教案或教材資料' };
  const now = nowIso();
  ensureCoursePrepSheet_();
  const dataJson = JSON.stringify({ schema: 'anqin-course-prep-v1', prep: prep, plan: plan });
  if (dataJson.length > 45000) return { ok: false, error: '備課內容過大，請移除內嵌圖片後再試' };
  const normalizedTitle = String(prep.title || '').trim().replace(/\s+/g, ' ').toLowerCase();
  const normalizedCourseType = String(prep.details && prep.details.targetCourse || '').trim().replace(/\s+/g, ' ').toLowerCase();
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) return { ok: false, error: '系統正在儲存其他備課檔案，請稍後再試' };
  try {
    const existing = findObject(SHEET_NAMES.COURSE_PREP, 'prep_id', prep.id);
    if (existing && existing.nickname !== nickname && user.role !== 'admin') {
      return { ok: false, error: '不可覆蓋其他老師的備課檔案' };
    }
    if (existing && existing.status === 'deleted') return { ok: false, code: 'RECORD_DELETED', error: '這份備課檔案已被刪除；本機內容仍保留，請另建新檔' };
    if (existing && params.request_id && existing.last_request_id === params.request_id) return { ok: true, prep_id: prep.id, updated_at: existing.updated_at, revision: existing.record_revision, duplicate: true };
    if (existing && recordConflict_(prep.cloudRevision || prep.cloudUpdatedAt, existing.record_revision || existing.updated_at)) return recordConflictResult_();
    const duplicate = sheetToObjects(SHEET_NAMES.COURSE_PREP).some(function (row) {
      return row.status !== 'deleted' && row.nickname === nickname
        && String(row.prep_id || '') !== String(prep.id)
        && String(row.title || '').trim().replace(/\s+/g, ' ').toLowerCase() === normalizedTitle
        && String(row.course_type || '').trim().replace(/\s+/g, ' ').toLowerCase() === normalizedCourseType;
    });
    if (duplicate) return { ok: false, error: '已有相同課程類型與名稱的備課檔案，請直接編輯原檔案' };
    const revision = Utilities.getUuid();
    upsertRow(SHEET_NAMES.COURSE_PREP, 'prep_id', {
      prep_id: prep.id,
      nickname: nickname,
      department: normalizeDepartment_(user.department),
      title: String(prep.title || '').trim(),
      course_type: String(prep.details && prep.details.targetCourse || ''),
      created_date: String(prep.date || todayStr()).slice(0, 10),
      status: String(prep.status || 'draft'),
      data_json: dataJson,
      created_at: existing ? existing.created_at : now,
      updated_at: now,
      record_revision: revision,
      last_request_id: String(params.request_id || ''),
    });
    logSystem(nickname, 'save_course_prep', prep.id, { status: prep.status || 'draft' });
    return { ok: true, prep_id: prep.id, updated_at: now, revision: revision };
  } finally {
    lock.releaseLock();
  }
}

function listCoursePreps(params) {
  const viewer = String(params.viewer || '').trim();
  const viewerUser = viewer ? findUserByNickname(viewer) : null;
  if (!viewerUser || viewerUser.status !== 'active') return { ok: false, error: '無讀取權限' };
  ensureCoursePrepSheet_();
  let rows = sheetToObjects(SHEET_NAMES.COURSE_PREP);
  if (viewerUser.role === 'teacher' || viewerUser.role === 'admin_staff') {
    rows = rows.filter(row => row.nickname === viewer);
  } else if (viewerUser.role === 'manager' && !isGlobalManager_(viewerUser)) {
    rows = rows.filter(row => sameDepartment_(row.department, viewerUser.department) || row.nickname === viewer);
  }
  if (params.nickname) rows = rows.filter(row => row.nickname === String(params.nickname));
  rows.sort((a, b) => String(b.updated_at || '').localeCompare(String(a.updated_at || '')));
  const deletedIds = rows.filter(row => row.status === 'deleted').map(row => row.prep_id);
  const records = rows.filter(row => row.status !== 'deleted').map(row => {
    const data = parseJsonField(row.data_json) || {};
    return {
      prepId: row.prep_id,
      nickname: row.nickname,
      department: row.department,
      updatedAt: row.updated_at,
      revision: row.record_revision || row.updated_at,
      lastRequestId: row.last_request_id || '',
      prep: data.prep || null,
      plan: data.plan || null,
    };
  }).filter(record => record.prep && record.prep.id);
  return { ok: true, records: records, deletedIds: deletedIds, complete: true };
}

function deleteCoursePrep(params) {
  return withRecordWriteLock_(function () { return deleteCoursePrepRecord_(params); });
}

function deleteCoursePrepRecord_(params) {
  const operator = String(params.operator || '').trim();
  const user = operator ? findUserByNickname(operator) : null;
  if (!user || user.status !== 'active') return { ok: false, error: '無刪除權限' };
  ensureCoursePrepSheet_();
  const existing = findObject(SHEET_NAMES.COURSE_PREP, 'prep_id', params.prep_id);
  if (!existing) return { ok: true, removed: false };
  if (user.role !== 'admin' && existing.nickname !== operator) return { ok: false, error: '不可刪除其他老師的備課檔案' };
  const normalizeName = function (value) {
    return String(value || '').trim().replace(/\s+/g, '').replace(/(?:老師|主管)$/, '').toLowerCase();
  };
  if (normalizeName(params.confirmation_name) !== normalizeName(existing.nickname)) {
    return { ok: false, error: '姓名確認不正確，未刪除備課檔案' };
  }
  upsertRow(SHEET_NAMES.COURSE_PREP, 'prep_id', Object.assign({}, existing, { status: 'deleted', updated_at: nowIso(), record_revision: Utilities.getUuid() }));
  logSystem(operator, 'delete_course_prep', params.prep_id, {});
  return { ok: true, removed: true };
}
