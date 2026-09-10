// Apps Script API 包裝
window.API = (function () {
  const API_URL = window.APP_CONFIG.API_URL;
  let authRedirectScheduled = false;
  const READ_RETRY_DELAYS_MS = [700, 1400];
  const WRITE_RECEIPT_DELAYS_MS = [0, 700, 1400];
  const activeRequests = new Map();
  const connectionMetrics = [];
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
    'ping', 'whoami', 'getSessionIdentity', 'listUsers',
    'getLog', 'getTodayLog', 'listLogs', 'getEvidenceLog', 'getMakeupQuota', 'getAttachmentPreviews',
    'listTasks', 'getWeekly', 'listWeekly', 'listFeedback', 'listFeedbackThread',
    'listObservations', 'listPosts', 'getWeekPostCount', 'getOKR',
    'getEvalEvidence', 'getEval', 'listEvals', 'listStudents',
    'getDashboard', 'getMyKpiPreview', 'listArchivedKpiFiles',
    'listTeacherReportFolders', 'listCoursePreps', 'getTalentWorkspaceData',
    'getAdminMarketingWorkspaceData',
    'getAdminMarketingDriveFolders',
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

  async function requestJson(payload) {
    const controller = new AbortController();
    const slowAction = /^(upload|saveAdminMarketingRecord|saveTalentLesson|updateTalentAppStatus|sendSubmitPdf|regenerate|runProduction)/.test(payload.action);
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
      return await Promise.race([deadline, (async () => {
        const res = await fetch(API_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' }, // 避免 CORS preflight
          body: JSON.stringify(payload),
          signal: controller.signal,
        });
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
      connectionMetrics.push({ action, ok: Boolean(result?.ok), code: result?.code || '', ms: Date.now() - start, at: new Date().toISOString() });
      if (connectionMetrics.length > 100) connectionMetrics.shift();
      queueMetric(connectionMetrics[connectionMetrics.length - 1]);
      return result;
    }).finally(() => activeRequests.delete(key));
    activeRequests.set(key, request);
    return request;
  }

  async function performCall(action, params = {}) {
    if (window.AUTH?.isImpersonating?.() && !IMPERSONATION_READ_ACTIONS.has(action)) {
      return {
        ok: false,
        code: 'READ_ONLY_TEST_VIEW',
        error: '目前是柏翰互動測試，已攔截正式寫入、上傳或送出',
      };
    }
    const payload = { action, ...params };
    if (action === 'saveLog' && !Object.prototype.hasOwnProperty.call(payload, 'base_revision')) {
      payload.base_revision = logRevisions.get(`LOG-${String(payload.date || '').replace(/-/g, '')}-${payload.nickname}`) || '';
    }
    if (!isRetryableRead(action) && !payload.request_id) payload.request_id = window.crypto?.randomUUID?.() || `req-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const sessionToken = window.AUTH?.getSession?.()?.session_token || '';
    if (sessionToken && !payload.session_token) payload.session_token = sessionToken;
    const retryable = isRetryableRead(action);
    const maxAttempts = retryable ? READ_RETRY_DELAYS_MS.length + 1 : 1;
    let lastError = null;
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      try {
        const data = await requestJson(payload);
        if (!data.ok) {
          console.warn('[API]', action, 'failed:', data.error);
          handleAuthFailure(action, data);
        }
        return data;
      } catch (err) {
        lastError = err;
        const hasRetry = retryable && attempt < maxAttempts - 1;
        console.warn('[API]', action, hasRetry ? 'retrying:' : 'error:', err.message);
        if (hasRetry) await wait(READ_RETRY_DELAYS_MS[attempt]);
      }
    }
    console.error('[API]', action, 'failed after transport handling:', lastError);
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
      : action === 'saveAdminMarketingRecord' ? 'getAdminMarketingWorkspaceData' : '';
    if (receiptRead) {
      for (const delay of WRITE_RECEIPT_DELAYS_MS) {
        if (delay) await wait(delay);
        try {
          const check = await requestJson({ action: receiptRead, viewer: payload.nickname, nickname: payload.nickname, session_token: sessionToken });
          if (check.ok) {
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
        : '雲端回應未完成；請先到紀錄確認是否已儲存，再決定是否重送',
    };
  }

  return {
    getConnectionDiagnostics: () => connectionMetrics.map(item => ({ ...item })),
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
