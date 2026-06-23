// Apps Script API 包裝
window.API = (function () {
  const URL = window.APP_CONFIG.API_URL;

  async function call(action, params = {}) {
    const payload = { action, ...params };
    try {
      const res = await fetch(URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' }, // 避免 CORS preflight
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!data.ok) {
        console.warn('[API]', action, 'failed:', data.error);
      }
      return data;
    } catch (err) {
      console.error('[API]', action, 'error:', err);
      return { ok: false, error: err.message };
    }
  }

  return {
    ping: () => call('ping'),
    whoami: (email) => call('whoami', { email }),
    listAvailableNicknames: () => call('listAvailableNicknames'),
    claimNickname: (email, nickname) => call('claimNickname', { email, nickname }),

    listUsers: () => call('listUsers'),
    addUser: (data) => call('addUser', data),
    updateUser: (data) => call('updateUser', data),

    saveLog: (data) => call('saveLog', data),
    getLog: (params) => call('getLog', params),
    getTodayLog: (nickname) => call('getTodayLog', { nickname }),
    listLogs: (params) => call('listLogs', params),
    uploadPhoto: (data) => call('uploadPhoto', data),

    saveWeekly: (data) => call('saveWeekly', data),
    getWeekly: (params) => call('getWeekly', params),
    listWeekly: (params) => call('listWeekly', params),

    addFeedback: (data) => call('addFeedback', data),
    listFeedback: (params) => call('listFeedback', params),
    markFeedbackRead: (id) => call('markFeedbackRead', { feedback_id: id }),

    addObservation: (data) => call('addObservation', data),
    listObservations: (params) => call('listObservations', params),

    addPost: (data) => call('addPost', data),
    listPosts: (params) => call('listPosts', params),
    getWeekPostCount: (nickname, date) => call('getWeekPostCount', { nickname, date }),

    saveOKR: (data) => call('saveOKR', data),
    getOKR: (params) => call('getOKR', params),
    updateOKRProgress: (data) => call('updateOKRProgress', data),

    getEvalEvidence: (nickname, year_month) => call('getEvalEvidence', { nickname, year_month }),
    saveEval: (data) => call('saveEval', data),
    getEval: (params) => call('getEval', params),
    listEvals: (params) => call('listEvals', params),

    getDashboard: (viewer) => call('getDashboard', { viewer }),
    getMyKpiPreview: (nickname) => call('getMyKpiPreview', { nickname }),
  };
})();
