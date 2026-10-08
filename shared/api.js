// Apps Script API 包裝
window.API = (function () {
  const API_URL = window.APP_CONFIG.API_URL;
  let authRedirectScheduled = false;
  const READ_RETRY_DELAYS_MS = [700, 1400];
  const WRITE_RECEIPT_DELAYS_MS = [0, 700, 1400];
  const WRITE_BUSY_DELAYS_MS = [1500, 3500];
  const SLOW_READ_ACTIONS = new Set([
    'getEvalEvidence', 'getEval', 'listEvals',
    'listLogs', 'listUsers', 'listStudents', 'listCoursePreps',
  ]);
  const RESUMABLE_UPLOADS = new Set(['uploadPhoto', 'uploadPhotos', 'uploadFile']);
  const RECEIPTED_ACTIONS = new Set([
    'saveLog', 'saveCoursePrep', 'deleteCoursePrep', 'saveTalentLesson', 'saveTalentDraft',
    'saveTalentPrep', 'deleteTalentPrep', 'reviewTalentPrep', 'updateTalentAppStatus',
    'saveTalentScore', 'addTalentMessage', 'approveTalentBonus', 'forfeitTalentMonthlyBonus',
    'saveAdminMarketingRecord', 'saveAdminMarketingAssignment', 'reviewAdminMarketingRecord',
    'reviewAdminMarketingTrialBonus', 'saveAdminMarketingScore', 'addAdminMarketingMessage',
    'saveClassRosterMutation', 'saveWeekly', 'addFeedback', 'markFeedbackRead',
    'addObservation', 'addPost', 'saveOKR', 'updateOKRProgress', 'saveEval',
    'addTask', 'saveSelfTask', 'deleteSelfTask', 'updateTaskStatus', 'deleteTask',
    'addStudent', 'updateStudent', 'deleteStudent'
  ]);
  const activeRequests = new Map();
  const pendingMutationIds = new Map();
  const connectionMetrics = [];
  const attemptMetrics = [];
  const logRevisions = new Map();
  const pendingMetrics = [];
  let metricTimer = null;
  function queueMetric(metric) {
    pendingMetrics.push(metric);
    if (pendingMetrics.length > 100) pendingMetrics.shift();
    if (!metricTimer) metricTimer = window.setTimeout(flushMetrics, 15000);
  }
  async function flushMetrics() {
    metricTimer = null;
    const token = window.AUTH?.getSession?.()?.session_token;
    if (!token || !pendingMetrics.length || window.AUTH?.isImpersonating?.()) return;
    const batch = pendingMetrics.splice(0, 50);
    try {
      const result = await requestJson({ action: 'reportClientMetrics', events_batch: batch, session_token: token });
      if (!result.ok) pendingMetrics.unshift(...batch);
    } catch (error) { pendingMetrics.unshift(...batch); }
    if (pendingMetrics.length > 100) pendingMetrics.splice(0, pendingMetrics.length - 100);
  }
  window.addEventListener?.('error', () => queueMetric({ action: 'runtime-error', ok: false, code: 'UNCAUGHT_ERROR', ms: 0 }));
  window.addEventListener?.('unhandledrejection', () => queueMetric({ action: 'runtime-error', ok: false, code: 'UNHANDLED_REJECTION', ms: 0 }));
  window.addEventListener?.('online', () => { if (pendingMetrics.length && !metricTimer) metricTimer = window.setTimeout(flushMetrics, 1000); });
  const IMPERSONATION_READ_ACTIONS = new Set([
    'ping', 'whoami', 'getSessionIdentity', 'getMutationReceipt', 'listUsers',
    'getLog', 'getTodayLog', 'listLogs', 'getEvidenceLog', 'getMakeupQuota', 'getAttachmentPreviews',
    'listTasks', 'getWeekly', 'listWeekly', 'listFeedback', 'listFeedbackThread',
    'listObservations', 'listPosts', 'getWeekPostCount', 'getOKR',
    'getEvalEvidence', 'getEval', 'listEvals', 'listStudents',
    'getDashboard', 'getMyKpiPreview', 'listArchivedKpiFiles',
    'listTeacherReportFolders', 'listCoursePreps', 'getTalentWorkspaceData',
    'getAdminMarketingWorkspaceData',
    'getAdminMarketingDriveFolders', 'getClassRosterData',
    'getSystemReadiness',
  ]);

  function handleAuthFailure(action, data) {
    if (action === 'whoami' || !['AUTH_REQUIRED', 'AUTH_INVALID', 'AUTH_EXPIRED'].includes(String(data?.code || '')) || authRedirectScheduled) return;
    authRedirectScheduled = true;
    window.AUTH?.clearSession?.();
    window.setTimeout(() => {
      const root = window.AUTH?.relativeRoot?.() || new URL('./', window.location.href).href;
      const rootUrl = new URL(root, window.location.href);
      const current = new URL(window.location.href);
      let returnPath = '';
      if (current.origin === rootUrl.origin && current.pathname.startsWith(rootUrl.pathname)) {
        returnPath = current.pathname.slice(rootUrl.pathname.length) + current.search + current.hash;
      }
      window.location.replace(rootUrl.href + 'index.html' + (returnPath ? `?return=${encodeURIComponent(returnPath)}` : ''));
    }, 500);
  }

  function isRetryableRead(action) {
    return action === 'ping'
      || action === 'whoami'
      || action.startsWith('get')
      || action.startsWith('list');
  }

  function wait(ms) {
    return new Promise(resolve => window.setTimeout(resolve, ms));
  }

  async function requestJson(payload, context = {}) {
    const started = Date.now();
    let status = 0;
    let stage = 'request';
    const track = outcome => {
      if (payload.action === 'reportClientMetrics') return;
      const metric = { kind: 'attempt', action: payload.action, request_id: context.requestId || payload.request_id || '', attempt: context.attempt || 1, phase: context.phase || 'request', stage, status, ...outcome, ms: Date.now() - started };
      attemptMetrics.push(metric);
      if (attemptMetrics.length > 200) attemptMetrics.shift();
      queueMetric(metric);
    };
    const controller = new AbortController();
    // 行政與班級資料會讀取較多正式試算表；Apps Script 冷啟動時可能超過
    // 一般讀取的 25 秒。給這兩個唯讀 API 較長時間，避免資料其實仍在整理時
    // 前端先誤判失敗。
    const slowAction = SLOW_READ_ACTIONS.has(payload.action)
      || /^(upload|saveAdminMarketingRecord|saveClassRosterMutation|saveTalentLesson|updateTalentAppStatus|sendSubmitPdf|regenerate|runProduction|getAdminMarketingWorkspaceData|getClassRosterData)/.test(payload.action);
    const timeoutMs = slowAction ? 90000 : 25000;
    let timer;
    const deadline = new Promise((_, reject) => {
      timer = window.setTimeout(() => {
        controller.abort();
        const error = new Error('雲端回應逾時');
        error.code = 'REQUEST_TIMEOUT';
        reject(error);
      }, timeoutMs);
    });
    try {
      const result = await Promise.race([deadline, (async () => {
        const res = await fetch(API_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' }, // 避免 CORS preflight
          body: JSON.stringify(payload),
          signal: controller.signal,
        });
        status = res.status;
        stage = res.redirected ? 'redirected_response' : 'response';
        const responseText = await res.text();
        if (res.status >= 400) {
          const error = new Error('雲端服務暫時未正確回應');
          error.code = 'HTTP_ERROR';
          error.status = res.status;
          throw error;
        }
        try {
          const data = JSON.parse(responseText.replace(/^\uFEFF/, ''));
          if (!data || typeof data.ok !== 'boolean') throw new Error('Invalid response');
          return data;
        } catch (error) {
          const transportError = new Error('雲端服務暫時未正確回應');
          transportError.code = 'NON_JSON_RESPONSE';
          transportError.status = res.status;
          throw transportError;
        }
      })()]);
      track({ ok: result.ok === true, code: result.code || '', uncertain: result.uncertain === true });
      return result;
    } catch (error) {
      track({ ok: false, code: error.code || 'NETWORK_ERROR', uncertain: !isRetryableRead(payload.action) });
      throw error;
    } finally {
      window.clearTimeout(timer);
    }
  }

  function call(action, params = {}) {
    const key = JSON.stringify([window.AUTH?.getSession?.()?.nickname || '', action, params]);
    if (activeRequests.has(key)) return activeRequests.get(key);
    const start = Date.now();
    const request = performCall(action, params).then(result => {
      if (result?.ok) {
        (result.logs || (result.log ? [result.log] : [])).forEach(log => logRevisions.set(log.log_id, log.record_revision || log.updated_at || ''));
        if (action === 'saveLog' && result.log_id && result.revision) logRevisions.set(result.log_id, result.revision);
      }
      connectionMetrics.push({ kind: 'operation', action, ok: Boolean(result?.ok), code: result?.code || '', uncertain: result?.uncertain === true, recovered: result?.recovered === true || result?.recovered_auth_response === true, ms: Date.now() - start, at: new Date().toISOString() });
      if (connectionMetrics.length > 100) connectionMetrics.shift();
      queueMetric(connectionMetrics[connectionMetrics.length - 1]);
      return result;
    }).finally(() => activeRequests.delete(key));
    activeRequests.set(key, request);
    return request;
  }

  async function confirmMissingAuthResponse(action, payload, data) {
    if (data?.code !== 'AUTH_REQUIRED' || !payload.session_token) return data;
    const uncertain = { ok: false, code: 'AUTH_CHECK_UNCERTAIN', uncertain: !isRetryableRead(action), error: '雲端身分回應異常，尚未確認操作結果；登入仍保留，請稍後再試' };
    try {
      const identity = await requestJson({ action: 'getSessionIdentity', session_token: payload.session_token });
      if (!identity.ok) return ['AUTH_INVALID', 'AUTH_EXPIRED'].includes(identity.code) ? identity : uncertain;
      if (action === 'getSessionIdentity') return { ...identity, recovered_auth_response: true };
      // Only reads and content-addressed uploads are safe to replay here.
      if (isRetryableRead(action) || ['uploadPhoto', 'uploadPhotos', 'uploadFile'].includes(action)) {
        const retry = await requestJson(payload);
        return retry.code === 'AUTH_REQUIRED' ? uncertain : { ...retry, recovered_auth_response: retry.ok === true };
      }
      return uncertain;
    } catch (error) {
      return uncertain;
    }
  }

  function readPendingMutation(storageKey) {
    for (const name of ['localStorage', 'sessionStorage']) {
      try {
        const stored = JSON.parse(window[name].getItem(storageKey) || 'null');
        if (stored && typeof stored.id === 'string' && stored.id && stored.id.length <= 160) {
          return { id: stored.id, ...(Object.prototype.hasOwnProperty.call(stored, 'baseRevision') ? { baseRevision: stored.baseRevision } : {}) };
        }
      } catch (error) { /* Try the legacy per-tab store if unavailable or malformed. */ }
    }
    return null;
  }

  function storePendingMutation(storageKey, entry) {
    if (!storageKey) return;
    for (const name of ['localStorage', 'sessionStorage']) {
      try { window[name].setItem(storageKey, JSON.stringify(entry)); return; }
      catch (error) { /* Keep the existing per-tab fallback when persistence is unavailable. */ }
    }
  }

  function clearPendingMutation(storageKey) {
    if (!storageKey) return;
    for (const name of ['localStorage', 'sessionStorage']) {
      try { window[name].removeItem(storageKey); } catch (error) {}
    }
  }

  async function performCall(action, params = {}) {
    const key = JSON.stringify([window.AUTH?.getSession?.()?.nickname || '', action, params]);
    let storageKey = '';
    if (RECEIPTED_ACTIONS.has(action) && window.crypto?.subtle && window.AUTH?.getSession?.()?.session_token) {
      try {
        const actor = window.AUTH.getSession();
        const clean = { ...params };
        delete clean.session_token;
        const digest = await window.crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify([actor.nickname, actor.email, actor.role, actor.department, action, clean])));
        storageKey = 'kpi-pending-operation-' + Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
        const stored = readPendingMutation(storageKey);
        if (stored && typeof stored.id === 'string' && stored.id.length <= 160 && !pendingMutationIds.has(key)) pendingMutationIds.set(key, stored);
      } catch (error) { storageKey = ''; }
    }
    const result = await performRequest(action, params, key, storageKey);
    if (!result?.uncertain) {
      pendingMutationIds.delete(key);
      clearPendingMutation(storageKey);
    }
    return result;
  }

  async function performRequest(action, params, key, storageKey) {
    if (window.AUTH?.isImpersonating?.() && !IMPERSONATION_READ_ACTIONS.has(action)) {
      return {
        ok: false,
        code: 'READ_ONLY_TEST_VIEW',
        error: '目前是柏翰互動測試，已攔截正式寫入、上傳或送出',
      };
    }
    const payload = { ...params, action };
    if (action === 'saveLog' && !Object.prototype.hasOwnProperty.call(payload, 'base_revision')) {
      payload.base_revision = logRevisions.get(`LOG-${String(payload.date || '').replace(/-/g, '')}-${payload.nickname}`) || '';
    }
    const previous = pendingMutationIds.get(key);
    if (!payload.request_id) payload.request_id = previous?.id || window.crypto?.randomUUID?.() || `req-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    if (action === 'saveLog' && previous && Object.prototype.hasOwnProperty.call(previous, 'baseRevision')) payload.base_revision = previous.baseRevision;
    if (RECEIPTED_ACTIONS.has(action)) {
      const entry = { id: payload.request_id, ...(action === 'saveLog' ? { baseRevision: payload.base_revision } : {}) };
      pendingMutationIds.set(key, entry);
      storePendingMutation(storageKey, entry);
    }
    const sessionToken = window.AUTH?.getSession?.()?.session_token || '';
    if (sessionToken && !payload.session_token) payload.session_token = sessionToken;
    const retryable = isRetryableRead(action);
    const resumableUpload = RESUMABLE_UPLOADS.has(action);
    const receiptedWrite = RECEIPTED_ACTIONS.has(action);
    const maxAttempts = retryable || resumableUpload ? READ_RETRY_DELAYS_MS.length + 1 : receiptedWrite ? WRITE_BUSY_DELAYS_MS.length + 1 : 1;
    let lastError = null;
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      try {
        const data = await confirmMissingAuthResponse(action, payload, await requestJson(payload, { attempt: attempt + 1 }));
        if (data.code === 'OPERATION_INTERRUPTED') return data;
        if (data.uncertain) { lastError = data; break; }
        if (!data.ok) {
          console.warn('[API]', action, 'failed:', data.error);
          handleAuthFailure(action, data);
          // Rejecting this retry cannot establish whether the earlier request
          // committed. Keep its receipt ID and caller's payload across login.
          if (receiptedWrite && previous && ['AUTH_REQUIRED', 'AUTH_INVALID', 'AUTH_EXPIRED'].includes(data.code)) {
            return {
              ...data,
              uncertain: true,
              request_id: payload.request_id,
              error: '登入已失效，請重新登入；先前送出結果仍待確認，內容已保留，重新登入後會沿用原操作確認',
            };
          }
          if (receiptedWrite && data.code === 'WRITE_BUSY' && data.retry_safe === true && attempt < maxAttempts - 1) {
            await wait(WRITE_BUSY_DELAYS_MS[attempt] + Math.floor(Math.random() * 500));
            continue;
          }
          if (resumableUpload && ['WRITE_BUSY', 'FILE_ACCESS_PENDING'].includes(data.code) && attempt < maxAttempts - 1) {
            await wait(READ_RETRY_DELAYS_MS[attempt]);
            continue;
          }
        }
        return data.ok && attempt > 0 ? { ...data, recovered: true } : data;
      } catch (err) {
        lastError = err;
        // Apps Script 在瀏覽器 abort 後仍可能繼續讀表；慢速唯讀逾時時不要
        // 立刻再送兩份相同重查，避免冷啟動變成多個執行互相拖慢。
        const timeoutStillRunning = err?.code === 'REQUEST_TIMEOUT' && SLOW_READ_ACTIONS.has(action);
        const hasRetry = (retryable || resumableUpload) && !timeoutStillRunning && attempt < maxAttempts - 1;
        console.warn('[API]', action, hasRetry ? 'retrying:' : 'error:', err.message);
        if (hasRetry) await wait(READ_RETRY_DELAYS_MS[attempt]);
        else break;
      }
    }
    console.error('[API]', action, 'failed after transport handling:', lastError);
    if (RECEIPTED_ACTIONS.has(action) && sessionToken) {
      for (const delay of WRITE_RECEIPT_DELAYS_MS) {
        if (delay) await wait(delay);
        try {
          const check = await requestJson({ action: 'getMutationReceipt', mutation_action: action, mutation_id: payload.request_id, session_token: sessionToken }, { phase: 'receipt', requestId: payload.request_id });
          if (check.ok && check.state === 'done' && check.result && typeof check.result.ok === 'boolean') {
            return { ...check.result, recovered: check.result.ok === true };
          }
          if (check.code === 'AUTH_INVALID' || check.code === 'AUTH_EXPIRED') break;
        } catch (error) { /* Never replay an ordinary write when its result is missing. */ }
      }
    }
    if (action === 'saveLog' && payload.nickname && payload.date) {
      try {
        const check = await requestJson({ action: 'getLog', nickname: payload.nickname, date: payload.date, session_token: sessionToken });
        if (check.ok && check.log?.last_request_id === payload.request_id) {
          return { ok: true, log_id: check.log.log_id, revision: check.log.record_revision, recovered: true };
        }
      } catch (error) { /* The original request may still complete; do not resend. */ }
    }
    const receiptRead = action === 'saveCoursePrep' ? 'listCoursePreps'
      : action === 'saveTalentLesson' || action === 'updateTalentAppStatus' ? 'getTalentWorkspaceData'
      : action === 'saveClassRosterMutation' ? 'getClassRosterData'
      : action === 'saveAdminMarketingRecord' ? 'getAdminMarketingWorkspaceData' : '';
    if (receiptRead) {
      for (const delay of WRITE_RECEIPT_DELAYS_MS) {
        if (delay) await wait(delay);
        try {
          const check = await requestJson({ action: receiptRead, viewer: payload.nickname, nickname: payload.nickname, scope: payload.scope, session_token: sessionToken });
          if (check.ok) {
            if (action === 'saveClassRosterMutation') {
              const receipt = (check.history || []).find(row => row.requestId === payload.request_id);
              if (receipt) return { ok: true, classRoster: check, recovered: true };
              continue;
            }
            const rows = action === 'saveTalentLesson' || action === 'updateTalentAppStatus' ? check.lessons : check.records;
            const id = payload.prep?.id || payload.lesson?.id || payload.record?.id || payload.lesson_id;
            const saved = (rows || []).find(row => (row.id || row.prepId) === id && row.lastRequestId === payload.request_id);
            if (saved && action === 'saveCoursePrep') return { ok: true, prep_id: id, revision: saved.revision, updated_at: saved.updatedAt, recovered: true };
            if (saved && action === 'saveTalentLesson') return { ok: true, lesson: saved, reportStatus: 'pending', recovered: true };
            if (saved && action === 'updateTalentAppStatus') return { ok: true, lesson: saved, reportStatus: 'pending', recovered: true };
            if (saved) return { ok: true, record: saved, recovered: true };
          }
        } catch (error) { /* The original request can still finish while the receipt is checked again. */ }
      }
    }
    return {
      ok: false,
      request_id: payload.request_id || '',
      uncertain: !retryable,
      code: lastError?.code || 'NETWORK_ERROR',
      error: retryable
        ? '雲端連線暫時不穩，系統已自動重試，請再試一次'
        : resumableUpload ? '檔案傳送暫時中斷；已選檔案仍保留，可直接重試'
        : '尚未取得儲存確認，內容仍保留；請稍後再試，系統會先確認上次結果',
    };
  }

  return {
    getConnectionDiagnostics: () => connectionMetrics.map(item => ({ ...item })),
    getTransportDiagnostics: () => attemptMetrics.map(item => ({ ...item })),
    ping: () => call('ping'),
    whoami: (email, credential = '') => call('whoami', { email, credential }),
    getSessionIdentity: () => call('getSessionIdentity'),

    listUsers: (operator) => call('listUsers', { operator: operator || window.AUTH?.getSession?.()?.nickname || '' }),
    addUser: (data) => call('addUser', data),
    updateUser: (data) => call('updateUser', data),
    approveUser: (data) => call('approveUser', data),
    deleteUser: (nickname, confirmNickname) => call('deleteUser', { nickname, confirm_nickname: confirmNickname }),

    saveLog: (data) => call('saveLog', data),
    getLog: (params) => call('getLog', params),
    getTodayLog: (nickname) => call('getTodayLog', { nickname }),
    listLogs: async (params = {}) => {
      const logs = new Map();
      let cursor = '';
      for (let page = 0; page < 100; page += 1) {
        const result = await call('listLogs', { ...params, cursor });
        if (!result.ok) return result;
        (result.logs || []).forEach(log => logs.set(log.log_id, log));
        if (!result.next_cursor) return { ...result, logs: Array.from(logs.values()), complete: true };
        if (result.next_cursor === cursor) break;
        cursor = result.next_cursor;
      }
      return { ok: false, code: 'INCOMPLETE_HISTORY', error: '紀錄尚未全部讀取，請縮小日期範圍後再試；原有內容仍保留' };
    },
    uploadPhoto: (data) => call('uploadPhoto', data),
    uploadPhotos: (data) => call('uploadPhotos', data),
    uploadFile: (data) => call('uploadFile', data),
    getAttachmentPreviews: (fileIds) => call('getAttachmentPreviews', { file_ids: fileIds }),
    getEvidenceLog: (params) => call('getEvidenceLog', params),
    getMakeupQuota: (nickname) => call('getMakeupQuota', { nickname }),

    addTask: (data) => call('addTask', data),
    saveSelfTask: (data) => call('saveSelfTask', data),
    deleteSelfTask: (taskId, nickname) => call('deleteSelfTask', { task_id: taskId, nickname }),
    listTasks: (params) => call('listTasks', params),
    updateTaskStatus: (data) => call('updateTaskStatus', data),
    deleteTask: (id) => call('deleteTask', { task_id: id }),

    saveWeekly: (data) => call('saveWeekly', data),
    getWeekly: (params) => call('getWeekly', params),
    listWeekly: (params) => call('listWeekly', params),

    addFeedback: (data) => call('addFeedback', data),
    listFeedback: (params) => call('listFeedback', params),
    listFeedbackThread: (params) => call('listFeedbackThread', params),
    markFeedbackRead: (id) => call('markFeedbackRead', { feedback_id: id }),

    addObservation: (data) => call('addObservation', data),
    listObservations: (params) => call('listObservations', params),

    addPost: (data) => call('addPost', data),
    listPosts: (params) => call('listPosts', params),
    getWeekPostCount: (nickname, date) => call('getWeekPostCount', { nickname, date }),

    saveOKR: (data) => call('saveOKR', data),
    getOKR: (params) => call('getOKR', params),
    updateOKRProgress: (data) => call('updateOKRProgress', data),

    getEvalEvidence: (nickname, year_month) => call('getEvalEvidence', {
      nickname,
      year_month,
      viewer: window.AUTH?.getSession?.()?.nickname || '',
    }),
    saveEval: (data) => call('saveEval', data),
    getEval: (params) => call('getEval', {
      ...params,
      viewer: params?.viewer || window.AUTH?.getSession?.()?.nickname || '',
    }),
    listEvals: (params = {}) => call('listEvals', {
      ...params,
      viewer: params.viewer || window.AUTH?.getSession?.()?.nickname || '',
    }),

    listStudents: (params) => call('listStudents', params),
    addStudent: (data) => call('addStudent', data),
    updateStudent: (data) => call('updateStudent', data),
    deleteStudent: (id) => call('deleteStudent', { student_id: id }),

    getDashboard: (viewer) => call('getDashboard', { viewer }),
    getMyKpiPreview: (nickname) => call('getMyKpiPreview', { nickname }),

    sendSubmitPdf: (nickname, date) => call('sendSubmitPdf', { nickname, date }),
    listArchivedKpiFiles: (params = {}) => call('listArchivedKpiFiles', {
      ...params,
      viewer: params.viewer || window.AUTH?.getSession?.()?.nickname || '',
    }),
    listTeacherReportFolders: (params = {}) => {
      const session = window.AUTH?.getSession?.() || {};
      return call('listTeacherReportFolders', {
        ...params,
        viewer: params.viewer || session.nickname || '',
        view_as: window.AUTH?.isImpersonating?.() ? session.nickname || '' : '',
      });
    },
    archiveMonthlyCsv: (data) => call('archiveMonthlyCsv', data),
    saveCoursePrep: (data) => call('saveCoursePrep', data),
    listCoursePreps: (params) => call('listCoursePreps', params),
    deleteCoursePrep: (prepId, operator, confirmationName) => call('deleteCoursePrep', {
      prep_id: prepId,
      operator,
      confirmation_name: confirmationName,
    }),

    getTalentWorkspaceData: (params = {}) => call('getTalentWorkspaceData', {
      ...params,
      viewer: params.viewer || window.AUTH?.getSession?.()?.nickname || '',
    }),
    saveTalentLesson: (nickname, lesson) => call('saveTalentLesson', { nickname, lesson, defer_report: true }),
    regenerateTalentLessonReport: (lessonId) => call('regenerateTalentLessonReport', { lesson_id: lessonId }),
    saveTalentDraft: (nickname, draft) => call('saveTalentDraft', { nickname, draft }),
    saveTalentPrep: (nickname, prep) => call('saveTalentPrep', { nickname, prep }),
    deleteTalentPrep: (prepId, confirmationName) => call('deleteTalentPrep', {
      prep_id: prepId,
      confirmation_name: confirmationName,
    }),
    reviewTalentPrep: (prepId, result, note) => call('reviewTalentPrep', { prep_id: prepId, result, note }),
    updateTalentAppStatus: (nickname, lessonId, status, appFiles = []) => call('updateTalentAppStatus', { nickname, lesson_id: lessonId, status, app_files: appFiles, defer_report: true }),
    saveTalentScore: (nickname, month, score) => call('saveTalentScore', { nickname, month, score }),
    addTalentMessage: (nickname, month, text) => call('addTalentMessage', { nickname, month, text }),
    approveTalentBonus: (lessonId, approvedNewCount, approvedRenewalCount, note = '') => call('approveTalentBonus', {
      lesson_id: lessonId,
      approved_new_count: approvedNewCount,
      approved_renewal_count: approvedRenewalCount,
      note,
    }),
    forfeitTalentMonthlyBonus: (nickname, month, reason, confirmed) => call('forfeitTalentMonthlyBonus', {
      nickname,
      month,
      reason,
      confirmed: confirmed === true,
    }),
    getAdminMarketingWorkspaceData: (params = {}) => call('getAdminMarketingWorkspaceData', {
      ...params,
      viewer: params.viewer || window.AUTH?.getSession?.()?.nickname || '',
    }),
    getAdminMarketingDriveFolders: (params = {}) => call('getAdminMarketingDriveFolders', {
      ...params,
      viewer: params.viewer || window.AUTH?.getSession?.()?.nickname || '',
    }),
    saveAdminMarketingRecord: (nickname, recordType, record) => call('saveAdminMarketingRecord', {
      nickname,
      record_type: recordType,
      record,
    }),
    saveAdminMarketingAssignment: (nickname, assignment) => call('saveAdminMarketingAssignment', { nickname, assignment }),
    reviewAdminMarketingRecord: (recordId, result, note = '') => call('reviewAdminMarketingRecord', {
      record_id: recordId,
      result,
      note,
    }),
    reviewAdminMarketingTrialBonus: (recordId, result, note = '') => call('reviewAdminMarketingTrialBonus', {
      record_id: recordId,
      result,
      note,
    }),
    saveAdminMarketingScore: (nickname, month, score) => call('saveAdminMarketingScore', { nickname, month, score }),
    addAdminMarketingMessage: (nickname, month, text) => call('addAdminMarketingMessage', { nickname, month, text }),
    getClassRosterData: (options = {}) => call('getClassRosterData', options),
    saveClassRosterMutation: (operation, payload = {}, options = {}) => call('saveClassRosterMutation', { ...options, operation, payload }),
    setConfig: (data) => call('setConfig', data),
    getSystemReadiness: (operator) => call('getSystemReadiness', { operator }),
    runProductionIntegrityCheck: () => call('runProductionIntegrityCheck'),
    setupSystemAutomation: (operator) => call('setupSystemAutomation', { operator }),
    testMyNotifications: (operator) => call('testMyNotifications', { operator }),
    registerPushSubscription: (subscriptionId) => call('registerPushSubscription', { subscription_id: subscriptionId }),
    unregisterPushSubscription: () => call('unregisterPushSubscription'),
    getLineBindingCode: () => call('getLineBindingCode'),
    debugPush: (nickname) => call('debugPush', { nickname }),
    adminBroadcast: (data) => call('adminBroadcast', data),

    purgeTestData: (params) => call('purgeTestData', params),
  };
})();
