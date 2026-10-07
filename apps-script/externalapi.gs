/**
 * AICEO 專用唯讀資料介面。
 *
 * - 金鑰只保存 SHA-256，不進 Sheet、Git、前端或網址。
 * - 只接受 POST JSON，且只有 externalData 一條唯讀路由。
 * - 原始資料分頁讀取；附件以獨立 base64 區塊讀取。
 */

const EXTERNAL_DATA_KEY_HASH_PROPERTY_ = 'EXTERNAL_DATA_API_KEY_SHA256';
const EXTERNAL_DATA_KEY_CREATED_PROPERTY_ = 'EXTERNAL_DATA_API_KEY_CREATED_AT';
const EXTERNAL_DATA_MAX_ROWS_ = 200;
const EXTERNAL_ATTACHMENT_CHUNK_BYTES_ = 512 * 1024;

function externalDatasetConfig_() {
  return {
    users: { sheet: SHEET_NAMES.USERS, omit: ['line_user_id', 'push_subscription_id'] },
    daily_logs: { sheet: SHEET_NAMES.LOGS },
    weekly_reports: { sheet: SHEET_NAMES.WEEKLY },
    okr_goals: { sheet: SHEET_NAMES.OKR },
    teacher_evaluations: { sheet: SHEET_NAMES.TEACHER_EVAL },
    manager_evaluations: { sheet: SHEET_NAMES.MANAGER_EVAL },
    feedback: { sheet: SHEET_NAMES.FEEDBACK },
    evidence: { sheet: SHEET_NAMES.EVIDENCE },
    observations: { sheet: SHEET_NAMES.OBSERVATION },
    posts: { sheet: SHEET_NAMES.POSTS },
    kpi_config: { sheet: SHEET_NAMES.KPI_CONFIG },
    students: { sheet: SHEET_NAMES.STUDENTS },
    tasks: { sheet: SHEET_NAMES.TASKS },
    course_preps: { sheet: SHEET_NAMES.COURSE_PREP },
    talent_records: { sheet: SHEET_NAMES.TALENT_RECORDS },
    admin_marketing_records: { sheet: SHEET_NAMES.ADMIN_MARKETING_RECORDS },
  };
}

function externalJsonHeaders_() {
  return {
    work_assignments: true, schedule_json: true, rest_days: true,
    kpi1_data: true, kpi2_data: true, kpi3_data: true,
    kpi4_data: true, kpi5_data: true, kpi6_data: true,
    attachments: true, photos: true, sub_items: true, grade_rules: true,
    data_json: true,
  };
}

function externalDataKeyHash_(value) {
  const bytes = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    String(value || ''),
    Utilities.Charset.UTF_8
  );
  return bytes.map(function (byte) {
    const unsigned = byte < 0 ? byte + 256 : byte;
    return unsigned.toString(16).padStart(2, '0');
  }).join('');
}

/**
 * 在 Apps Script 編輯器手動執行一次。彈出視窗與回傳值只會顯示這一次的原始金鑰；
 * 再次執行會立即輪替，舊金鑰失效。
 */
function setupExternalDataAccess() {
  const apiKey = 'bp_kpi_' + Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '');
  const createdAt = nowIso();
  const properties = PropertiesService.getScriptProperties();
  properties.setProperty(EXTERNAL_DATA_KEY_HASH_PROPERTY_, externalDataKeyHash_(apiKey));
  properties.setProperty(EXTERNAL_DATA_KEY_CREATED_PROPERTY_, createdAt);
  try {
    SpreadsheetApp.getUi().alert(
      'AICEO KPI 唯讀金鑰（僅顯示這一次）',
      apiKey + '\n\n請立即存入 AICEO 的 KPI_API_KEY，不要貼到 Git、前端、網址或日誌。',
      SpreadsheetApp.getUi().ButtonSet.OK
    );
  } catch (ignore) {}
  return {
    ok: true,
    api_key: apiKey,
    created_at: createdAt,
    note: '請立即存入 AICEO 的 KPI_API_KEY；不要貼到 Git、前端、網址或日誌。',
  };
}

function revokeExternalDataAccess() {
  const properties = PropertiesService.getScriptProperties();
  properties.deleteProperty(EXTERNAL_DATA_KEY_HASH_PROPERTY_);
  properties.deleteProperty(EXTERNAL_DATA_KEY_CREATED_PROPERTY_);
  return { ok: true, revoked_at: nowIso() };
}

function getExternalDataAccessStatus() {
  const properties = PropertiesService.getScriptProperties();
  const keyHash = properties.getProperty(EXTERNAL_DATA_KEY_HASH_PROPERTY_) || '';
  return {
    ok: true,
    enabled: !!keyHash,
    key_fingerprint: keyHash ? keyHash.slice(0, 12) : '',
    created_at: properties.getProperty(EXTERNAL_DATA_KEY_CREATED_PROPERTY_) || '',
  };
}

function authenticateExternalDataRequest_(params, method) {
  if (method !== 'POST') {
    return { ok: false, error: 'AICEO 資料介面只接受 POST', code: 'EXTERNAL_POST_REQUIRED' };
  }
  const apiKey = String(params && params.api_key || '');
  const storedHash = PropertiesService.getScriptProperties().getProperty(EXTERNAL_DATA_KEY_HASH_PROPERTY_) || '';
  if (!storedHash || apiKey.length < 40 || apiKey.length > 160 ||
      !constantTimeTextEqual_(externalDataKeyHash_(apiKey), storedHash)) {
    return { ok: false, error: 'AICEO 資料金鑰無效', code: 'EXTERNAL_AUTH_INVALID' };
  }
  return { ok: true };
}

function externalData(params) {
  if (!params || params.__external_authenticated !== true) {
    return { ok: false, error: 'AICEO 資料金鑰無效', code: 'EXTERNAL_AUTH_INVALID' };
  }
  const operation = String(params.operation || 'manifest');
  if (operation === 'manifest') return externalDataManifest_();
  if (operation === 'summary') return externalOperationalSummary_();
  if (operation === 'read') return externalReadDataset_(params);
  if (operation === 'attachment') return externalReadAttachment_(params);
  return { ok: false, error: '不支援的唯讀操作', code: 'EXTERNAL_OPERATION_INVALID' };
}

function externalSerializeCell_(header, value) {
  if (value instanceof Date) {
    return Utilities.formatDate(value, 'Asia/Taipei', "yyyy-MM-dd'T'HH:mm:ssXXX");
  }
  if (externalJsonHeaders_()[header] && typeof value === 'string' && value.trim()) {
    try { return JSON.parse(value); } catch (ignore) {}
  }
  return value === undefined || value === null ? '' : value;
}

function externalSheetObjects_(sheetName, omittedHeaders) {
  const sheet = getSS().getSheetByName(sheetName);
  if (!sheet || sheet.getLastRow() <= 1 || sheet.getLastColumn() <= 0) return [];
  const headers = getHeaders(sheet);
  const omitted = {};
  (omittedHeaders || []).forEach(function (header) { omitted[header] = true; });
  const values = sheet.getRange(2, 1, sheet.getLastRow() - 1, headers.length).getValues();
  return values.map(function (row) {
    const item = {};
    headers.forEach(function (header, index) {
      if (!omitted[header]) item[header] = externalSerializeCell_(header, row[index]);
    });
    return item;
  });
}

function externalDataManifest_() {
  const spreadsheet = getSS();
  const datasets = externalDatasetConfig_();
  const manifest = Object.keys(datasets).map(function (key) {
    const config = datasets[key];
    const sheet = spreadsheet.getSheetByName(config.sheet);
    const omitted = {};
    (config.omit || []).forEach(function (header) { omitted[header] = true; });
    const columns = sheet ? getHeaders(sheet).filter(function (header) { return !omitted[header]; }) : [];
    return {
      dataset: key,
      available: !!sheet,
      row_count: sheet ? Math.max(0, sheet.getLastRow() - 1) : 0,
      columns: columns,
    };
  });
  return {
    ok: true,
    client: 'aiceo',
    access: 'read_only',
    schema_version: '1.0',
    generated_at: nowIso(),
    datasets: manifest,
    operations: ['manifest', 'summary', 'read', 'attachment'],
  };
}

function externalReadDataset_(params) {
  const dataset = String(params.dataset || '');
  const config = externalDatasetConfig_()[dataset];
  if (!config) return { ok: false, error: '資料集不在允許清單', code: 'EXTERNAL_DATASET_INVALID' };
  const sheet = getSS().getSheetByName(config.sheet);
  if (!sheet) return { ok: false, error: '資料表尚未建立', code: 'EXTERNAL_DATASET_UNAVAILABLE' };

  const allHeaders = getHeaders(sheet);
  const omitted = {};
  (config.omit || []).forEach(function (header) { omitted[header] = true; });
  const visibleHeaders = allHeaders.filter(function (header) { return !omitted[header]; });
  const total = Math.max(0, sheet.getLastRow() - 1);
  const rawCursor = Number(params.cursor || 0);
  const cursor = Number.isFinite(rawCursor) ? Math.max(0, Math.floor(rawCursor)) : 0;
  const rawLimit = Number(params.limit || 100);
  const limit = Number.isFinite(rawLimit)
    ? Math.max(1, Math.min(EXTERNAL_DATA_MAX_ROWS_, Math.floor(rawLimit)))
    : 100;
  const start = Math.min(cursor, total);
  const count = Math.min(limit, total - start);
  const values = count > 0
    ? sheet.getRange(start + 2, 1, count, allHeaders.length).getValues()
    : [];
  const rows = values.map(function (row) {
    const item = {};
    allHeaders.forEach(function (header, index) {
      if (!omitted[header]) item[header] = externalSerializeCell_(header, row[index]);
    });
    return item;
  });
  const next = start + rows.length;
  return {
    ok: true,
    dataset: dataset,
    access: 'read_only',
    generated_at: nowIso(),
    columns: visibleHeaders,
    rows: rows,
    page: {
      cursor: String(start),
      limit: limit,
      returned: rows.length,
      total: total,
      next_cursor: next < total ? String(next) : '',
      has_more: next < total,
    },
  };
}

/**
 * 只回傳不含姓名與附件的營運彙總；才藝人數以每個固定班次／課程最近一堂紀錄為準。
 * 原始紀錄仍可透過 read 分頁取得，但不應直接送入模型 prompt。
 */
function externalOperationalSummary_() {
  const students = externalSheetObjects_(SHEET_NAMES.STUDENTS);
  const dailyLogs = externalSheetObjects_(SHEET_NAMES.LOGS);
  const tasks = externalSheetObjects_(SHEET_NAMES.TASKS);
  const talentRows = externalSheetObjects_(SHEET_NAMES.TALENT_RECORDS);
  const rosterMap = {};
  students.filter(function (student) {
    return !student.status || String(student.status) === 'active';
  }).forEach(function (student) {
    const key = String(student.department || '') + '|' + String(student.teacher || '');
    if (!rosterMap[key]) {
      rosterMap[key] = {
        department: String(student.department || ''),
        teacher: String(student.teacher || ''),
        active_students: 0,
      };
    }
    rosterMap[key].active_students += 1;
  });

  const latestClasses = {};
  talentRows.filter(function (row) { return String(row.record_type || '') === 'lesson'; }).forEach(function (row) {
    const lesson = row.data_json && typeof row.data_json === 'object' ? row.data_json : {};
    const teacher = String(lesson.teacher || row.nickname || '');
    const classKey = String(lesson.scheduleKey || [
      teacher, lesson.courseName || '', lesson.site || '', lesson.scheduleTime || ''
    ].join('|'));
    const stamp = String(row.record_date || lesson.date || '') + '|' + String(row.updated_at || lesson.updatedAt || '');
    if (!latestClasses[classKey] || stamp > latestClasses[classKey].stamp) {
      latestClasses[classKey] = {
        stamp: stamp,
        value: {
          class_key: classKey,
          course_name: String(lesson.courseName || ''),
          course_type: String(lesson.courseType || ''),
          teacher: teacher,
          site: String(lesson.site || ''),
          site_type: String(lesson.siteType || ''),
          schedule_label: String(lesson.scheduleLabel || ''),
          schedule_time: String(lesson.scheduleTime || ''),
          lesson_kind: String(lesson.lessonKind || 'scheduled'),
          duration_hours: Number(lesson.duration || 0),
          latest_lesson_date: String(lesson.date || row.record_date || ''),
          latest_status: String(lesson.lessonStatus || 'held'),
          expected_students: Number(lesson.expected || 0),
          present_students: Number(lesson.present || 0),
          leave_students: Number(lesson.leave || 0),
          absent_students: Number(lesson.absent || 0),
          makeup_students: Number(lesson.makeup || 0),
          trial_students: Number(lesson.trial || 0),
        },
      };
    }
  });
  const talentClasses = Object.keys(latestClasses).map(function (key) {
    return latestClasses[key].value;
  }).sort(function (left, right) {
    return String(left.course_name).localeCompare(String(right.course_name), 'zh-Hant');
  });
  const heldClasses = talentClasses.filter(function (item) { return item.latest_status !== 'cancelled'; });

  const today = todayStr();
  const submittedToday = dailyLogs.filter(function (log) {
    return String(log.date || '') === today && !!log.submitted_at;
  }).length;
  const openTasks = tasks.filter(function (task) {
    return ['done', 'completed', 'cancelled'].indexOf(String(task.status || '').toLowerCase()) < 0;
  }).length;

  return {
    ok: true,
    access: 'read_only',
    generated_at: nowIso(),
    count_basis: {
      talent_classes: '每個固定班次或課程最近一堂老師回報；不是收費或學籍主檔',
      student_rosters: 'Students 資料表中目前有效名冊',
    },
    talent: {
      class_count: talentClasses.length,
      latest_held_class_count: heldClasses.length,
      latest_expected_students: heldClasses.reduce(function (sum, item) { return sum + item.expected_students; }, 0),
      latest_present_students: heldClasses.reduce(function (sum, item) { return sum + item.present_students; }, 0),
      latest_trial_students: heldClasses.reduce(function (sum, item) { return sum + item.trial_students; }, 0),
      classes: talentClasses,
    },
    student_rosters: Object.keys(rosterMap).map(function (key) { return rosterMap[key]; }),
    daily_logs: { date: today, submitted_count: submittedToday, total_rows: dailyLogs.length },
    tasks: { open_count: openTasks, total_rows: tasks.length },
  };
}

function externalAttachmentIsReferenced_(fileId) {
  const spreadsheet = getSS();
  const datasets = externalDatasetConfig_();
  return Object.keys(datasets).some(function (key) {
    const sheet = spreadsheet.getSheetByName(datasets[key].sheet);
    if (!sheet || sheet.getLastRow() <= 1) return false;
    return !!sheet.createTextFinder(fileId).matchCase(true).useRegularExpression(false).findNext();
  });
}

function externalReadAttachment_(params) {
  const fileId = String(params.file_id || '').trim();
  if (!/^[A-Za-z0-9_-]{10,200}$/.test(fileId) || !externalAttachmentIsReferenced_(fileId)) {
    return { ok: false, error: '附件不存在或不在 KPI 授權資料中', code: 'EXTERNAL_ATTACHMENT_NOT_FOUND' };
  }
  const rawOffset = Number(params.offset || 0);
  const offset = Number.isFinite(rawOffset) ? Math.max(0, Math.floor(rawOffset)) : 0;
  const rawLength = Number(params.length || EXTERNAL_ATTACHMENT_CHUNK_BYTES_);
  const length = Number.isFinite(rawLength)
    ? Math.max(1, Math.min(EXTERNAL_ATTACHMENT_CHUNK_BYTES_, Math.floor(rawLength)))
    : EXTERNAL_ATTACHMENT_CHUNK_BYTES_;
  try {
    const file = DriveApp.getFileById(fileId);
    const bytes = file.getBlob().getBytes();
    const start = Math.min(offset, bytes.length);
    const end = Math.min(bytes.length, start + length);
    const chunk = bytes.slice(start, end);
    return {
      ok: true,
      file_id: fileId,
      file_name: file.getName(),
      mime_type: file.getMimeType(),
      total_size: bytes.length,
      offset: start,
      chunk_size: chunk.length,
      chunk_base64: Utilities.base64Encode(chunk),
      next_offset: end < bytes.length ? end : null,
      has_more: end < bytes.length,
    };
  } catch (error) {
    return { ok: false, error: '附件目前無法讀取', code: 'EXTERNAL_ATTACHMENT_UNAVAILABLE' };
  }
}
