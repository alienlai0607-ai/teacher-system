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
    'created_date', 'status', 'data_json', 'created_at', 'updated_at'
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
  const now = nowIso();
  const existing = (() => {
    ensureCoursePrepSheet_();
    return findObject(SHEET_NAMES.COURSE_PREP, 'prep_id', prep.id);
  })();
  if (existing && existing.nickname !== nickname && user.role !== 'admin') {
    return { ok: false, error: '不可覆蓋其他老師的備課檔案' };
  }
  const dataJson = JSON.stringify({ schema: 'anqin-course-prep-v1', prep: prep, plan: plan });
  if (dataJson.length > 45000) return { ok: false, error: '備課內容過大，請移除內嵌圖片後再試' };
  upsertRow(SHEET_NAMES.COURSE_PREP, 'prep_id', {
    prep_id: prep.id,
    nickname: nickname,
    department: user.department,
    title: String(prep.title || '').trim(),
    course_type: String(prep.details && prep.details.targetCourse || ''),
    created_date: String(prep.date || todayStr()).slice(0, 10),
    status: String(prep.status || 'draft'),
    data_json: dataJson,
    created_at: existing ? existing.created_at : now,
    updated_at: now,
  });
  logSystem(nickname, 'save_course_prep', prep.id, { status: prep.status || 'draft' });
  return { ok: true, prep_id: prep.id, updated_at: now };
}

function listCoursePreps(params) {
  const viewer = String(params.viewer || '').trim();
  const viewerUser = viewer ? findUserByNickname(viewer) : null;
  if (!viewerUser || viewerUser.status !== 'active') return { ok: false, error: '無讀取權限' };
  ensureCoursePrepSheet_();
  let rows = sheetToObjects(SHEET_NAMES.COURSE_PREP);
  if (viewerUser.role === 'teacher' || viewerUser.role === 'admin_staff') {
    rows = rows.filter(row => row.nickname === viewer);
  } else if (viewerUser.role === 'manager') {
    rows = rows.filter(row => row.department === viewerUser.department || row.nickname === viewer);
  }
  if (params.nickname) rows = rows.filter(row => row.nickname === String(params.nickname));
  rows.sort((a, b) => String(b.updated_at || '').localeCompare(String(a.updated_at || '')));
  const records = rows.map(row => {
    const data = parseJsonField(row.data_json) || {};
    return {
      prepId: row.prep_id,
      nickname: row.nickname,
      department: row.department,
      updatedAt: row.updated_at,
      prep: data.prep || null,
      plan: data.plan || null,
    };
  }).filter(record => record.prep && record.prep.id);
  return { ok: true, records: records };
}

function deleteCoursePrep(params) {
  const operator = String(params.operator || '').trim();
  const user = operator ? findUserByNickname(operator) : null;
  if (!user || user.status !== 'active') return { ok: false, error: '無刪除權限' };
  ensureCoursePrepSheet_();
  const existing = findObject(SHEET_NAMES.COURSE_PREP, 'prep_id', params.prep_id);
  if (!existing) return { ok: true, removed: false };
  if (user.role !== 'admin' && existing.nickname !== operator) return { ok: false, error: '不可刪除其他老師的備課檔案' };
  deleteRow(SHEET_NAMES.COURSE_PREP, existing._row);
  logSystem(operator, 'delete_course_prep', params.prep_id, {});
  return { ok: true, removed: true };
}
