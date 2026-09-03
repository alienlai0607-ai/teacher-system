// Apps Script API 包裝
window.API = (function () {
  const API_URL = window.APP_CONFIG.API_URL;
  let authRedirectScheduled = false;
  const READ_RETRY_DELAYS_MS = [700, 1400];
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
    if (action === 'whoami' || !/^AUTH_/.test(String(data?.code || '')) || authRedirectScheduled) return;
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
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' }, // 避免 CORS preflight
      body: JSON.stringify(payload),
    });
    const responseText = await res.text();
    try {
      return JSON.parse(responseText.replace(/^\uFEFF/, ''));
    } catch (error) {
      const transportError = new Error('雲端服務暫時未正確回應');
      transportError.code = 'NON_JSON_RESPONSE';
      transportError.status = res.status;
      throw transportError;
    }
  }

  async function call(action, params = {}) {
    if (window.AUTH?.isImpersonating?.() && !IMPERSONATION_READ_ACTIONS.has(action)) {
      return {
        ok: false,
        code: 'READ_ONLY_TEST_VIEW',
        error: '目前是柏翰互動測試，已攔截正式寫入、上傳或送出',
      };
    }
    const payload = { action, ...params };
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
    return {
      ok: false,
      code: lastError?.code || 'NETWORK_ERROR',
      error: retryable
        ? '雲端連線暫時不穩，系統已自動重試，請再試一次'
        : '雲端回應未完成；請先到紀錄確認是否已儲存，再決定是否重送',
    };
  }

  return {
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
    listLogs: (params) => call('listLogs', params),
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
    saveTalentLesson: (nickname, lesson) => call('saveTalentLesson', { nickname, lesson }),
    regenerateTalentLessonReport: (lessonId) => call('regenerateTalentLessonReport', { lesson_id: lessonId }),
    saveTalentDraft: (nickname, draft) => call('saveTalentDraft', { nickname, draft }),
    saveTalentPrep: (nickname, prep) => call('saveTalentPrep', { nickname, prep }),
    deleteTalentPrep: (prepId, confirmationName) => call('deleteTalentPrep', {
      prep_id: prepId,
      confirmation_name: confirmationName,
    }),
    reviewTalentPrep: (prepId, result, note) => call('reviewTalentPrep', { prep_id: prepId, result, note }),
    updateTalentAppStatus: (nickname, lessonId, status, appFiles = []) => call('updateTalentAppStatus', { nickname, lesson_id: lessonId, status, app_files: appFiles }),
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
