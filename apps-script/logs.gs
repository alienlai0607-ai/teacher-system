/**
 * 每日工作日誌 CRUD
 */

/**
 * 儲存日誌（工作日當天或下一個工作日皆可正常交付；更早日期沿用補繳規則）
 */
function saveLog(params) {
  return withRecordWriteLock_(function () { return saveLogRecord_(params); }, true);
}

function previousKpiWorkday_(dateStr) {
  let date = addDaysStr_(dateStr, -1);
  while (isKpiWeekend_(date)) date = addDaysStr_(date, -1);
  return date;
}

function saveLogRecord_(params) {
  const { nickname, date } = params;
  if (!nickname || !date) return { ok: false, error: 'missing nickname or date' };
  const parsedDate = new Date(String(date) + 'T00:00:00Z');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date)) || isNaN(parsedDate.getTime()) || parsedDate.toISOString().slice(0, 10) !== date || date > todayStr()) return { ok: false, error: '工作日期不正確，不可填寫未來日期的日報' };

  const user = findUserByNickname(nickname);
  if (!user) return { ok: false, error: 'user not found' };
  if (user.status !== 'active') return { ok: false, error: '帳號目前未啟用' };

  const log_id = 'LOG-' + String(date).replace(/-/g, '') + '-' + nickname;
  const existing = findObject(SHEET_NAMES.LOGS, 'log_id', log_id);
  if (existing && params.request_id && existing.last_request_id === params.request_id) {
    return { ok: true, log_id: log_id, revision: existing.record_revision, duplicate: true };
  }
  if (existing && existing.submitted_at && params.submitted !== true) {
    return { ok: false, code: 'ALREADY_SUBMITTED', error: '此日紀錄已正式送出，舊草稿未覆蓋；如需修改，請開啟已送出的紀錄' };
  }
  if (existing && recordConflict_(params.base_revision, existing.record_revision || existing.updated_at)) return recordConflictResult_();
  const formatTransitionError = validateAnqinLogFormatTransition_(params, user, existing);
  if (formatTransitionError) return formatTransitionError;
  const normalizedEvidence = normalizeAnqinEvidenceAttachments_(params, user, existing);
  if (!normalizedEvidence.ok) return normalizedEvidence;
  if (normalizedEvidence.normalized) params = Object.assign({}, params, { attachments: normalizedEvidence.attachments });
  const courseRecordError = validateAnqinCourseRecord_(params, user);
  if (courseRecordError) return courseRecordError;
  ensureHeaders(getSheet(SHEET_NAMES.LOGS), ['record_revision', 'last_request_id', 'delivery_state', 'delivery_error', 'evidence_state', 'delivery_attempted_at']);

  // ===== 補繳判定 =====
  // 前一個工作日是正式交付寬限期，不列補繳、不扣分；週五可於週一完成。
  // 照片與課程證據規則不因跨工作日交付而放寬。
  const today = todayStr();
  const isBackdated = String(date) < today;
  const isNextDayGrace = String(date) === previousKpiWorkday_(today);
  const needMakeup = isBackdated && !isNextDayGrace && (!existing || existing.locked === true);
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
  } else if (existing && existing.locked === true && !isNextDayGrace) {
    // 鎖定檢查（補繳模式可越過鎖定）
    return { ok: false, error: '日誌已鎖定（過 24 小時），無法修改' };
  }
  const isMakeup = isNextDayGrace ? false : (needMakeup || (existing && existing.is_makeup === true));

  // ===== 空白覆蓋防護 =====
  // 自動存檔（非正式提交）若內容幾乎全空，而雲端已有實質內容（文字/照片），
  // 一律跳過不寫入——防止快取舊頁面或尚未載入完成的空白表單把整天的紀錄蓋掉
  if (params.submitted !== true && existing) {
    const incomingScore = logContentScore_(params);
    const existingScore = logContentScore_(existing);
    if (incomingScore < 20 && existingScore >= 100) {
      logSystem(nickname, 'skip_empty_autosave', log_id, { incoming: incomingScore, existing: existingScore });
      return { ok: false, code: 'EMPTY_OVERWRITE_BLOCKED', log_id, revision: existing.record_revision || existing.updated_at, error: '雲端已有內容，空白草稿未覆蓋；請重新讀取並確認紀錄' };
    }
  }

  const data = {
    log_id,
    date,
    nickname,
    department: normalizeDepartment_(user.department),
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
    record_revision: Utilities.getUuid(),
    last_request_id: String(params.request_id || ''),
    delivery_state: params.submitted === true ? 'pending' : '',
    delivery_error: '',
    evidence_state: params.submitted === true ? 'pending' : '',
    updated_at: nowIso(),
    locked: false,
    is_makeup: isMakeup === true,
    submitted_at: (existing && existing.submitted_at) || ''
  };

  // 正式提交（非草稿自動存）：首次提交蓋時間戳。
  // PDF 與主管通知由前端在 saveLog 成功後呼叫 sendSubmitPdf，避免同次送出收到兩則通知。
  const firstSubmit = params.submitted === true && !data.submitted_at;
  if (firstSubmit) data.submitted_at = nowIso();

  if (!existing) {
    data.created_at = nowIso();
    appendRow(SHEET_NAMES.LOGS, data);
  } else {
    updateRow(SHEET_NAMES.LOGS, existing._row, data);
  }

  // 附件 → Evidence：只在「正式提交」時寫入，且整份取代
  // （舊版每次草稿自動存都 append 一次，一天可灌出上百筆重複證據）
  if (params.submitted === true) {
    try {
      replaceEvidenceForLog_(log_id, nickname, date, params.attachments);
      const savedRow = findObject(SHEET_NAMES.LOGS, 'log_id', log_id);
      updateRow(SHEET_NAMES.LOGS, savedRow._row, { evidence_state: 'ready' });
    } catch (error) {
      console.error('Evidence index pending for ' + log_id);
    }
  }

  // 處理發文（如果是主管）→ 寫入 Posts
  if (user.role === 'manager' && params.posts && Array.isArray(params.posts)) {
    saveManagerPosts(nickname, user.department, date, params.posts);
  }

  logSystem(nickname, 'save_log', log_id, { date });

  let reportQueued = false;
  if (params.submitted === true && typeof queueDeferredTeacherReport_ === 'function') {
    reportQueued = queueDeferredTeacherReport_({ type: 'kpi', nickname: nickname, date: date }).queued;
  }

  return {
    ok: true,
    log_id,
    revision: data.record_revision,
    msg: '已儲存',
    is_makeup: isMakeup === true,
    next_day_grace: isNextDayGrace,
    next_workday_grace: isNextDayGrace,
    makeup_remaining: makeupRemaining,
    report_queued: reportQueued,
  };
}

/** Course-sharing proof uses the same uploaded originals as the daily PDF. */
function anqinCourseFileId_(attachment) {
  if (!attachment || typeof attachment !== 'object') return '';
  const explicit = String(attachment.cloudFileId || attachment.fileId || '').trim();
  const url = String(attachment.cloudUrl || attachment.url || '').trim();
  const match = url.match(/^https:\/\/drive\.google\.com\/file\/d\/([A-Za-z0-9_-]+)(?:\/[^\s"'<>]*)?$/);
  if (url && !match) return '';
  if (explicit && !/^[A-Za-z0-9_-]+$/.test(explicit)) return '';
  if (explicit && match && explicit !== match[1]) return '';
  return explicit || (match ? match[1] : '');
}

function anqinCourseScreenshots_(record, attachments) {
  const submitted = Array.isArray(attachments) ? attachments : [];
  const screenshots = record && Array.isArray(record.attachments) ? record.attachments : [];
  return screenshots.filter(function (item) {
    if (!item || !item.id || item.legacyMissing || item.placeholder || !/^image\/[a-z0-9.+-]+$/i.test(String(item.mimeType || ''))) return false;
    const fileId = anqinCourseFileId_(item);
    if (!fileId) return false;
    return submitted.some(function (attachment) {
      return attachment && attachment.forType === 'v2-course-record' && attachment.type === 'photo'
        && String(attachment.attachmentId || '') === String(item.id)
        && /^image\/[a-z0-9.+-]+$/i.test(String(attachment.mimeType || ''))
        && Boolean(attachment.fileId) && Boolean(attachment.url)
        && anqinCourseFileId_({ fileId: attachment.fileId, url: attachment.url }) === fileId;
    });
  });
}

function anqinV2Snapshot_(rawKpi6) {
  const kpi6 = parseJsonField(rawKpi6);
  const snapshot = kpi6 && typeof kpi6 === 'object' ? kpi6.v2_snapshot : null;
  return snapshot && typeof snapshot === 'object' && snapshot.schema === 'anqin-v2'
    && snapshot.submission && typeof snapshot.submission === 'object' ? snapshot : null;
}

function validateAnqinLogFormatTransition_(params, user, existing) {
  if (!isAnqinUser(user) || !existing || !existing.submitted_at || params.submitted !== true) return null;
  if (anqinV2Snapshot_(existing.kpi6_data) && !anqinV2Snapshot_(params.kpi6_data)) {
    return {
      ok: false,
      code: 'ANQIN_FORMAT_DOWNGRADE',
      error: '此日誌已使用新版格式，不能以舊版頁面覆蓋；請重新整理後再送出',
    };
  }
  return null;
}

function anqinVersionedEvidenceSource_(value) {
  return /^(v2-|env_)/.test(String(value || ''));
}

function anqinEvidenceIdentity_(attachment) {
  const item = attachment && typeof attachment === 'object' ? attachment : {};
  const tokens = {};
  const kinds = { attachment: {}, file: {}, url: {} };
  const fileIds = {};
  function token(kind, value) {
    const text = String(value || '').trim();
    if (text) {
      tokens[kind + ':' + text] = true;
      kinds[kind][text] = true;
    }
  }
  token('attachment', item.attachmentId);
  [item.fileId, item.cloudFileId].forEach(function (value) {
    const id = String(value || '').trim();
    if (/^[A-Za-z0-9_-]+$/.test(id)) fileIds[id] = true;
  });
  [item.url, item.cloudUrl].forEach(function (value) {
    const url = String(value || '').trim();
    if (!url) return;
    token('url', url.replace(/[?#].*$/, '').replace(/\/+$/, ''));
    const match = url.match(/^https:\/\/drive\.google\.com\/file\/d\/([A-Za-z0-9_-]+)(?:\/[^\s"'<>]*)?$/);
    if (match) fileIds[match[1]] = true;
  });
  Object.keys(fileIds).forEach(function (id) { token('file', id); });
  return {
    tokens: Object.keys(tokens),
    attachmentIds: Object.keys(kinds.attachment),
    fileIds: Object.keys(kinds.file),
    urls: Object.keys(kinds.url),
    conflictingFileIds: Object.keys(fileIds).length > 1,
  };
}

function anqinV2EvidenceClaims_(snapshot) {
  const claims = [];
  let error = '';
  function addClaim(attachment, forType, kpi, fallbackAttachmentId) {
    if (!attachment || typeof attachment !== 'object' || error) return;
    const identity = anqinEvidenceIdentity_(Object.assign({}, attachment, {
      attachmentId: attachment.id || attachment.attachmentId || fallbackAttachmentId || '',
    }));
    if (identity.conflictingFileIds) {
      error = '新版日誌內的附件檔案識別不一致，未儲存任何變更';
      return;
    }
    if (!identity.tokens.length) return;
    claims.push({ identity: identity, forType: forType, kpi: kpi });
  }

  const submission = snapshot && snapshot.submission || {};
  (Array.isArray(submission.activitySnapshots) ? submission.activitySnapshots : []).forEach(function (activity) {
    const type = String(activity && activity.type || '');
    if (!type || type === 'lessonprep') return;
    const kpi = type === 'tutoring' ? 1
      : ['project', 'robotics', 'portfolio'].indexOf(type) >= 0 ? 2
        : ['classroom', 'sel'].indexOf(type) >= 0 ? 3 : 5;
    (Array.isArray(activity.evidence) ? activity.evidence : []).forEach(function (evidence) {
      let attachments = Array.isArray(evidence && evidence.attachments) ? evidence.attachments : [];
      if (!attachments.length && evidence && (evidence.fileName || evidence.cloudFileId || evidence.cloudUrl || evidence.url)) {
        attachments = [Object.assign({}, evidence, { id: evidence.id ? 'attachment_' + evidence.id + '_1' : '' })];
      }
      attachments.forEach(function (attachment) { addClaim(attachment, 'v2-' + type, kpi); });
    });
  });

  const operation = snapshot && snapshot.operation;
  const operationEvidence = operation && operation.evidenceByCheck || {};
  ['classroom', 'tools', 'trash', 'toilet'].forEach(function (key) {
    addClaim(operationEvidence[key], 'env_' + key, 6, 'env_' + key);
  });
  const courseRecord = submission && submission.courseRecord;
  (courseRecord && Array.isArray(courseRecord.attachments) ? courseRecord.attachments : []).forEach(function (attachment) {
    addClaim(attachment, 'v2-course-record', 2);
  });
  return error
    ? { ok: false, code: 'EVIDENCE_SOURCE_CONFLICT', error: error }
    : { ok: true, claims: claims };
}

function normalizeAnqinEvidenceAttachments_(params, user, existing) {
  if (!isAnqinUser(user) || params.submitted !== true) {
    return { ok: true, normalized: false, attachments: params.attachments };
  }
  const snapshot = anqinV2Snapshot_(params.kpi6_data);
  if (!snapshot) return { ok: true, normalized: false, attachments: params.attachments };
  const parsedIncoming = parseJsonField(params.attachments);
  const incoming = parsedIncoming == null ? [] : parsedIncoming;
  if (!Array.isArray(incoming)) {
    return { ok: false, code: 'EVIDENCE_SOURCE_CONFLICT', error: '新版日誌的附件清單格式不正確，未儲存任何變更' };
  }
  const expected = anqinV2EvidenceClaims_(snapshot);
  if (!expected.ok) return expected;

  const preservedCandidates = [];
  const existingAttachments = parseJsonField(existing && existing.attachments);
  (Array.isArray(existingAttachments) ? existingAttachments : []).forEach(function (attachment) {
    if (!attachment || !anqinVersionedEvidenceSource_(attachment.forType)) return;
    const identity = anqinEvidenceIdentity_(attachment);
    if (!identity.tokens.length) return;
    preservedCandidates.push({
      identity: identity,
      forType: String(attachment.forType),
      kpi: attachment.kpi,
    });
  });

  function matchingClaims(identity, candidates) {
    function overlaps(left, right) {
      const wanted = {};
      left.forEach(function (value) { wanted[value] = true; });
      return right.some(function (value) { return wanted[value]; });
    }
    return candidates.filter(function (candidate) {
      const other = candidate.identity;
      // A canonical Drive file ID is strongest.  A copied attachment ID must not
      // be able to relabel a different uploaded original.
      if (identity.fileIds.length && other.fileIds.length) return overlaps(identity.fileIds, other.fileIds);
      if (identity.attachmentIds.length && other.attachmentIds.length
          && overlaps(identity.attachmentIds, other.attachmentIds)) return true;
      return identity.urls.length && other.urls.length && overlaps(identity.urls, other.urls);
    });
  }
  function oneMetadata(matches) {
    const metadata = {};
    matches.forEach(function (candidate) {
      metadata[JSON.stringify([candidate.forType, String(candidate.kpi === undefined ? '' : candidate.kpi)])] = candidate;
    });
    const keys = Object.keys(metadata);
    return keys.length === 1 ? { value: metadata[keys[0]] } : { conflict: keys.length > 1 };
  }

  const normalized = [];
  for (let index = 0; index < incoming.length; index++) {
    const attachment = incoming[index];
    if (!attachment || typeof attachment !== 'object') {
      normalized.push(attachment);
      continue;
    }
    const identity = anqinEvidenceIdentity_(attachment);
    if (identity.conflictingFileIds) {
      return { ok: false, code: 'EVIDENCE_SOURCE_CONFLICT', error: '附件檔案識別不一致，未覆蓋原日誌；請重新讀取後再送出' };
    }
    let metadata = oneMetadata(matchingClaims(identity, expected.claims));
    if (metadata.conflict) {
      return { ok: false, code: 'EVIDENCE_SOURCE_CONFLICT', error: '附件來源版本互相衝突，未覆蓋原日誌；請重新讀取後再送出' };
    }
    if (!metadata.value) {
      metadata = oneMetadata(matchingClaims(identity, preservedCandidates));
      if (metadata.conflict) {
        return { ok: false, code: 'EVIDENCE_SOURCE_CONFLICT', error: '既有附件來源版本互相衝突，未覆蓋原日誌；請重新讀取後再送出' };
      }
    }
    if (!metadata.value) {
      return { ok: false, code: 'EVIDENCE_SOURCE_UNVERIFIED', error: '附件不屬於本次新版日誌內容，未儲存任何變更；請重新讀取後再送出' };
    }
    normalized.push(Object.assign({}, attachment, { forType: metadata.value.forType, kpi: metadata.value.kpi }));
  }
  return { ok: true, normalized: true, attachments: normalized };
}

function validateAnqinCourseRecord_(params, user) {
  // Historical reports and optional weekend entries keep their original rules.
  if (params.submitted !== true || String(params.date) < '2026-09-18' || isKpiWeekend_(params.date)) return null;
  const kpi6 = parseJsonField(params.kpi6_data) || {};
  const snapshot = kpi6.v2_snapshot;
  if (!isAnqinUser(user) && (!snapshot || snapshot.schema !== 'anqin-v2')) return null;
  const submission = snapshot && snapshot.schema === 'anqin-v2' && snapshot.submission;
  const record = submission && submission.courseRecord;
  const failure = { ok: false, code: 'COURSE_RECORD_REQUIRED', error: '請完成課程紀錄：確認當日課程照片已分享到群組或家長通，並上傳至少一張分享截圖後再送出' };
  if (!submission || submission.date !== params.date || !record || !Array.isArray(record.channels)
      || !record.channels.length || !record.channels.every(function (channel) { return channel === 'group' || channel === 'parent_app'; })) return failure;
  const screenshots = Array.isArray(record.attachments) ? record.attachments : [];
  if (!screenshots.length || anqinCourseScreenshots_(record, parseJsonField(params.attachments)).length !== screenshots.length) return failure;
  return null;
}

/**
 * 日誌內容分數：自由文字長度 + 附件數×50（排除 type/work_types 這類選單值）
 * 用於空白覆蓋防護與補蓋提交時間戳的判斷
 */
function logContentScore_(o) {
  let n = 0;
  const SKIP_KEYS = { type: 1, work_types: 1, forType: 1, special_students: 1 };
  function walk(x) {
    if (x == null) return;
    if (typeof x === 'string') { n += x.trim().length; return; }
    if (Array.isArray(x)) { x.forEach(walk); return; }
    if (typeof x === 'object') { Object.keys(x).forEach(k => { if (!SKIP_KEYS[k]) walk(x[k]); }); }
  }
  ['kpi1_data', 'kpi2_data', 'kpi3_data', 'kpi4_data', 'kpi5_data', 'kpi6_data'].forEach(k => {
    walk(parseJsonField(o[k]));
  });
  n += String(o.reflection || '').trim().length * 3;
  n += String(o.help_content || '').trim().length;
  const att = parseJsonField(o.attachments);
  if (Array.isArray(att)) n += att.length * 50;
  return n;
}

/**
 * 補蓋提交時間戳（admin 修復用）：指定日期中「有實質內容但 submitted_at 空白」的日誌
 * 一律把 submitted_at 補成該筆 updated_at（歷史資料是舊版後端存的，沒蓋到時間戳）
 * params: { operator(admin), date, nickname? }，不發通知
 */
function adminStampSubmitted(params) {
  const u = params.operator ? findUserByNickname(params.operator) : null;
  if (!u || u.role !== 'admin') return { ok: false, error: '僅限管理員操作' };
  if (!params.date) return { ok: false, error: 'missing date' };
  const sheet = getSheet(SHEET_NAMES.LOGS);
  const headers = getHeaders(sheet);
  const col = headers.indexOf('submitted_at') + 1;
  if (col === 0) return { ok: false, error: 'LOGS 缺 submitted_at 欄，請先執行 setupSheets' };
  const all = sheetToObjects(SHEET_NAMES.LOGS);   // 依表列順序，index+2 = 實際列號
  const stamped = [];
  all.forEach((l, i) => {
    if (String(l.date) !== String(params.date)) return;
    if (params.nickname && l.nickname !== params.nickname) return;
    if (l.submitted_at) return;
    if (logContentScore_(l) < 100) return;   // 幾乎沒內容的草稿不補蓋
    const t = l.updated_at ? new Date(l.updated_at).toISOString() : nowIso();
    sheet.getRange(i + 2, col).setValue(t);
    stamped.push(l.nickname);
  });
  logSystem(params.operator, 'stamp_submitted', String(params.date), { stamped });
  return { ok: true, date: String(params.date), stamped };
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
  } else if (viewerUser.role === 'manager' && !isGlobalManager_(viewerUser)) {
    logs = logs.filter(l => sameDepartment_(l.department, viewerUser.department) || l.nickname === viewer);
  }
  // admin 看全部

  // 條件過濾
  if (nickname) logs = logs.filter(l => l.nickname === nickname);
  if (department) logs = logs.filter(l => sameDepartment_(l.department, department));
  if (from) logs = logs.filter(l => String(l.date) >= from);
  if (to) logs = logs.filter(l => String(l.date) <= to);

  // 排序：新→舊
  const orderKey = function (log) { return String(log.date) + '|' + String(log.log_id || ''); };
  logs.sort((a, b) => orderKey(b).localeCompare(orderKey(a)));

  const total = logs.length;
  if (params.cursor) logs = logs.filter(log => orderKey(log).localeCompare(String(params.cursor)) < 0);
  const offset = Math.max(0, Number(params.offset) || 0);
  const pageSize = limit ? Math.min(500, Math.max(1, Number(limit) || 100)) : 500;
  const remaining = logs.length;
  logs = logs.slice(offset, offset + pageSize);
  logs.forEach(l => {
    ['kpi1_data','kpi2_data','kpi3_data','kpi4_data','kpi5_data','kpi6_data','attachments'].forEach(k => { l[k] = parseJsonField(l[k]); });
  });
  const hasMore = offset + logs.length < remaining;
  return { ok: true, logs, total: total, next_offset: hasMore ? offset + logs.length : null, next_cursor: hasMore ? orderKey(logs[logs.length - 1]) : null };
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
      source_type: att.forType || '',
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
  else if (vu.role === 'manager') scope = users.filter(u => isGlobalManager_(vu) || sameDepartment_(u.department, vu.department)).map(u => u.nickname);
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
    const nk = e.nickname, d = String(e.date);
    const person = usersMap[nk] || null;
    const k = normalizeEvalEvidenceKpi_(person, e);
    const environmentKpi = isAnqinUser(person) ? 6 : 2;
    const lessonKpi = isAnqinUser(person) ? 2 : 3;
    if (k !== environmentKpi && k !== lessonKpi) return;
    byPerson[nk] = byPerson[nk] || {};
    byPerson[nk][d] = byPerson[nk][d] || { date: d, env: 0, lesson: 0, urls: [] };
    if (k === environmentKpi) byPerson[nk][d].env++;
    if (k === lessonKpi) byPerson[nk][d].lesson++;
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
    upsertManagerPost_({
      date,
      nickname,
      department,
      platform: p.platform || 'FB',
      url: p.url || '',
      screenshot: p.screenshot || '',
      content_type: p.content_type || '其他',
      week_of: week
    });
  });
}

// Both callers hold the write lock; a daily autosave must not add another post.
function upsertManagerPost_(post) {
  const clean = value => String(value || '').trim();
  post.url = clean(post.url);
  post.screenshot = clean(post.screenshot);
  post.platform = clean(post.platform);
  const existing = sheetToObjects(SHEET_NAMES.POSTS).find(row =>
    row.nickname === post.nickname && cellDateStr_(row.date) === cellDateStr_(post.date) &&
    clean(row.platform) === post.platform &&
    (post.url ? clean(row.url) === post.url : !clean(row.url) && clean(row.screenshot) === post.screenshot));
  const record = Object.assign({}, existing || {}, post, {
    post_id: existing ? existing.post_id : Utilities.getUuid(),
    created_at: existing ? existing.created_at : nowIso()
  });
  upsertRow(SHEET_NAMES.POSTS, 'post_id', record);
  return record;
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
    const d = String(cellDateStr_(sheet.getRange(r, dateCol).getValue()));
    if (d < cutoffStr) {
      sheet.getRange(r, lockedCol).setValue(true);
    }
  }
}

/**
 * 拍照存證：把前端壓縮後的照片存進 Google Drive，回傳授權檢視網址
 * params: { nickname, date, kpi, mimeType, base64, description }
 * 資料夾結構：KPI證據 / 部門 / 暱稱 / 年月
 * 權限：資料本人、所屬主管、全域主管與管理員
 */
function photoUploadScope_(kpi) {
  const key = String(kpi || '');
  return key.indexOf('talent-') === 0 ? 'talent'
    : key.indexOf('admin-marketing') === 0 ? 'admin-marketing'
    : 'anqin';
}

function photoUploadFolder_(cache, user, nickname, dateStr, scope) {
  const ym = dateStr.slice(0, 7);
  const cacheKey = scope + '|' + ym;
  if (cache[cacheKey]) return cache[cacheKey];
  const root = cache.root || (cache.root = getEvidenceRootFolder_());
  const deptF = cache.department || (cache.department = getOrCreateChildFolder_(root, normalizeDepartment_(user.department) || '未分部門'));
  const userF = cache.user || (cache.user = getOrCreateChildFolder_(deptF, nickname));
  const workLabel = scope === 'talent' ? '才藝' : scope === 'admin-marketing' ? '行政美宣' : '安親';
  const workF = getOrCreateChildFolder_(userF, workLabel);
  const monthF = getOrCreateChildFolder_(workF, ym);
  secureKpiReportPath_(root, deptF, userF, workF, monthF, user, scope, []);
  return cache[cacheKey] = { folder: monthF, scope: scope };
}

function savePhotoBatchItem_(item, context) {
  const base64 = String(item.base64 || '');
  if (!base64) throw new Error('missing base64');
  if (base64.length > 12 * 1024 * 1024) throw new Error('照片內容過大，請壓縮後再上傳');
  const scopeKey = String(item.kpi || '');
  const scope = photoUploadScope_(scopeKey);
  const target = photoUploadFolder_(context.folders, context.user, context.nickname, context.date, scope);
  const mimeType = String(item.mimeType || 'image/jpeg');
  const ext = mimeType.indexOf('png') >= 0 ? 'png'
    : mimeType.indexOf('webp') >= 0 ? 'webp'
    : mimeType.indexOf('gif') >= 0 ? 'gif'
    : mimeType.indexOf('heif') >= 0 ? 'heif'
    : mimeType.indexOf('heic') >= 0 ? 'heic'
    : 'jpg';
  const blob = Utilities.newBlob(Utilities.base64Decode(base64), mimeType, 'K' + (item.kpi || 0) + '-' + context.date + '.' + ext);
  const file = createOrResumeKpiUpload_(target.folder, blob, context.nickname, scopeKey, context.date, base64);
  secureKpiDriveItem_(file, context.user, scope, []);
  assertKpiFileReadable_(file, context.user, scope);
  const fileId = file.getId();
  return { ok: true, clientId: String(item.clientId || ''), url: 'https://drive.google.com/file/d/' + fileId + '/view', fileId: fileId };
}

/** 一次儲存多張壓縮照片，共用登入、資料夾與權限檢查，避免 8 張照片做 8 次完整連線。 */
function uploadPhotos(params) {
  const nickname = String(params.nickname || '');
  const photos = Array.isArray(params.photos) ? params.photos.slice(0, 12) : [];
  if (!nickname || !photos.length) return { ok: false, error: 'missing nickname or photos' };
  if (photos.length !== params.photos.length) return { ok: false, error: '單次最多上傳 12 張照片' };
  const totalLength = photos.reduce(function (sum, item) { return sum + String(item && item.base64 || '').length; }, 0);
  if (totalLength > 18 * 1024 * 1024) return { ok: false, error: '這批照片過大，請分批上傳' };
  const user = findUserByNickname(nickname);
  if (!user) return { ok: false, error: 'user not found' };
  const context = { nickname: nickname, date: String(params.date || todayStr()), user: user, folders: {} };
  const results = photos.map(function (item) {
    try { return savePhotoBatchItem_(item || {}, context); }
    catch (error) { return { ok: false, clientId: String(item && item.clientId || ''), code: String(error && error.code || ''), error: String(error && error.message || '照片上傳失敗') }; }
  });
  const uploaded = results.filter(function (item) { return item.ok; });
  if (uploaded.length) logSystem(nickname, 'upload_photo_batch', uploaded.map(function (item) { return item.fileId; }).join(','), { date: context.date, count: uploaded.length });
  return { ok: true, results: results, uploaded: uploaded.length, failed: results.length - uploaded.length };
}

function uploadPhoto(params) {
  const result = uploadPhotos({
    nickname: params.nickname,
    date: params.date,
    photos: [{ clientId: 'single', kpi: params.kpi, mimeType: params.mimeType, base64: params.base64, description: params.description }]
  });
  if (!result.ok) return result;
  const photo = result.results[0];
  if (!photo || !photo.ok) return { ok: false, code: photo && photo.code || '', error: photo && photo.error || '照片上傳失敗' };
  return { ok: true, url: photo.url, fileId: photo.fileId };
}

/**
 * 教案與教材原始檔上傳。
 * 資料夾結構：KPI教材 / 部門 / 暱稱 / 年月
 */
function uploadFile(params) {
  const { nickname, date, mimeType, base64 } = params;
  if (!nickname || !base64) return { ok: false, error: 'missing nickname or base64' };

  const user = findUserByNickname(nickname);
  if (!user) return { ok: false, error: 'user not found' };
  if (String(base64).length > 36 * 1024 * 1024) return { ok: false, error: '檔案超過 25 MB 上限' };

  const dateStr = String(date || todayStr());
  const ym = dateStr.slice(0, 7);
  const originalName = String(params.fileName || '教材檔案')
    .replace(/[\\/:*?"<>|]/g, '-')
    .replace(/^\.+/, '')
    .slice(0, 120) || '教材檔案';
  const uniqueName = originalName;
  const bytes = Utilities.base64Decode(base64);
  const blob = Utilities.newBlob(bytes, mimeType || 'application/octet-stream', uniqueName);

  const categoryKey = String(params.category || '');
  const scope = categoryKey.indexOf('talent-') === 0 ? 'talent'
    : categoryKey.indexOf('admin-marketing') === 0 ? 'admin-marketing'
    : 'anqin';
  const root = getMaterialRootFolder_();
  const deptF = getOrCreateChildFolder_(root, normalizeDepartment_(user.department) || '未分部門');
  const userF = getOrCreateChildFolder_(deptF, nickname);
  const workLabel = scope === 'talent' ? '才藝' : scope === 'admin-marketing' ? '行政美宣' : '安親';
  const workF = getOrCreateChildFolder_(userF, workLabel);
  const ymF = getOrCreateChildFolder_(workF, ym);
  const file = createOrResumeKpiUpload_(ymF, blob, nickname, categoryKey, dateStr, base64);
  secureKpiReportPath_(root, deptF, userF, workF, ymF, user, scope, []);
  secureKpiDriveItem_(file, user, scope, []);
  assertKpiFileReadable_(file, user, scope);

  const fileId = file.getId();
  const url = 'https://drive.google.com/file/d/' + fileId + '/view';
  logSystem(nickname, 'upload_material', fileId, { date: dateStr, fileName: originalName, category: params.category || '' });
  return { ok: true, url, fileId, fileName: originalName };
}

/**
 * 私密雲端照片預覽。
 * Drive 私密縮圖會受第三方 Cookie 影響，因此由已驗簽的 KPI 工作階段讀取，
 * 並只回傳目前角色有權查看的影像。一次最多 12 張，避免單次回應過大。
 */
function getAttachmentPreviews(params) {
  const actor = params && params.__actor;
  if (!actor) return { ok: false, error: '請先登入再查看照片' };

  const input = Array.isArray(params.file_ids)
    ? params.file_ids
    : String(params.file_ids || '').split(',');
  const ids = [];
  input.forEach(function (value) {
    const id = String(value || '').trim();
    if (!/^[A-Za-z0-9_-]{10,200}$/.test(id) || ids.indexOf(id) >= 0 || ids.length >= 12) return;
    ids.push(id);
  });
  if (!ids.length) return { ok: true, previews: [], errors: [] };

  function actorListedOnFile(file) {
    if (actor.role === 'admin' || isGlobalManager_(actor)) return true;
    const email = String(actor.email || '').trim().toLowerCase();
    if (!email) return false;
    // Text in a submitted log is not proof of file ownership. Use Drive's ACL.
    try {
      const access = file.getAccess(email);
      if ([DriveApp.Permission.VIEW, DriveApp.Permission.EDIT, DriveApp.Permission.OWNER].indexOf(access) >= 0) return true;
    } catch (error) {}
    try {
      if (String(file.getOwner().getEmail() || '').trim().toLowerCase() === email) return true;
    } catch (error) {}
    try {
      if (file.getViewers().some(function (user) {
        return String(user.getEmail() || '').trim().toLowerCase() === email;
      })) return true;
    } catch (error) {}
    try {
      if (file.getEditors().some(function (user) {
        return String(user.getEmail() || '').trim().toLowerCase() === email;
      })) return true;
    } catch (error) {}
    return false;
  }

  const previews = [];
  const errors = [];
  ids.forEach(function (fileId) {
    try {
      const file = DriveApp.getFileById(fileId);
      const allowed = actorListedOnFile(file);
      if (!allowed) {
        errors.push({ fileId: fileId, error: '無權查看此照片' });
        return;
      }
      const sourceMimeType = String(file.getMimeType() || '');
      if (sourceMimeType.indexOf('image/') !== 0) {
        errors.push({ fileId: fileId, error: '此附件不是照片格式' });
        return;
      }
      let blob = null;
      try { blob = file.getThumbnail(); } catch (error) {}
      if (!blob) blob = file.getBlob();
      const bytes = blob.getBytes();
      if (bytes.length > 1200 * 1024) {
        errors.push({ fileId: fileId, error: '照片預覽過大，請開啟原檔' });
        return;
      }
      const mimeType = String(blob.getContentType() || sourceMimeType || 'image/jpeg');
      previews.push({
        fileId: fileId,
        fileName: file.getName(),
        mimeType: mimeType,
        dataUrl: 'data:' + mimeType + ';base64,' + Utilities.base64Encode(bytes),
      });
    } catch (error) {
      errors.push({ fileId: fileId, error: '照片預覽讀取失敗' });
    }
  });
  return { ok: true, previews: previews, errors: errors };
}

function getMaterialRootFolder_() {
  const props = PropertiesService.getScriptProperties();
  const cached = props.getProperty('MATERIAL_ROOT_FOLDER_ID');
  if (cached) {
    try { return DriveApp.getFolderById(cached); } catch (e) { /* 失效則重建 */ }
  }
  const name = 'KPI教材';
  const it = DriveApp.getFoldersByName(name);
  const folder = it.hasNext() ? it.next() : DriveApp.createFolder(name);
  props.setProperty('MATERIAL_ROOT_FOLDER_ID', folder.getId());
  return folder;
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
  if (user.status !== 'active') return { ok: false, error: '帳號目前未啟用' };

  const week_id = 'WK-' + week_of + '-' + nickname;
  const existing = findObject(SHEET_NAMES.WEEKLY, 'week_id', week_id);
  const data = {
    week_id, week_of, nickname, department: normalizeDepartment_(user.department), role: user.role,
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
  } else if (viewerUser.role === 'manager' && !isGlobalManager_(viewerUser)) {
    list = list.filter(w => sameDepartment_(w.department, viewerUser.department) || w.nickname === viewer);
  }
  // admin 看全部
  if (nickname) list = list.filter(w => w.nickname === nickname);
  if (week_of) list = list.filter(w => w.week_of === week_of);
  list.sort((a, b) => String(b.week_of).localeCompare(String(a.week_of)));
  return { ok: true, weeklies: list };
}
