(function () {
  'use strict';

  const localHosts = new Set(['127.0.0.1', 'localhost']);
  if (!localHosts.has(window.location.hostname)) {
    document.body.innerHTML = '<main style="padding:24px;font-family:sans-serif"><h1>此驗收頁只允許在本機使用</h1></main>';
    throw new Error('QA harness is local-only');
  }

  const params = new URLSearchParams(window.location.search);
  const nickname = params.get('nickname') || '江江';
  const role = params.get('role') || 'teacher';
  const department = params.get('department') || '北區教室';
  const failOnceActions = new Set(String(params.get('failOnce') || '').split(',').map(value => value.trim()).filter(Boolean));
  const failedActions = new Set();
  const cloudStoreKey = 'kpi_qa_harness_cloud_v2';
  if (params.get('reset') === '1') {
    localStorage.removeItem(cloudStoreKey);
    params.delete('reset');
    const query = params.toString();
    window.history.replaceState(null, '', `${window.location.pathname}${query ? `?${query}` : ''}`);
  }

  const emptyCloudStore = () => ({ fileCounter: 0, files: {}, logs: {}, coursePreps: {}, feedback: [], tasks: {}, evals: {} });
  const loadCloudStore = () => {
    try {
      const parsed = JSON.parse(localStorage.getItem(cloudStoreKey) || 'null');
      return parsed && typeof parsed === 'object' ? { ...emptyCloudStore(), ...parsed } : emptyCloudStore();
    } catch (error) {
      return emptyCloudStore();
    }
  };
  const cloudStore = loadCloudStore();
  cloudStore.feedback = (cloudStore.feedback || []).map(row => ({ ...row, feedback_id: row.feedback_id || row.id }));
  const persistCloudStore = () => localStorage.setItem(cloudStoreKey, JSON.stringify(cloudStore));
  if (params.get('resetTasks') === '1') {
    cloudStore.tasks = {};
    persistCloudStore();
    params.delete('resetTasks');
    const query = params.toString();
    window.history.replaceState(null, '', `${window.location.pathname}${query ? `?${query}` : ''}`);
  }
  const normalizeNickname = value => String(value || '').trim().replace(/(?:老師|主管)$/, '');
  const evaluationTier = total => [
    { min: 95, grade: '卓越', bonus: 3000 },
    { min: 88, grade: '優良', bonus: 2000 },
    { min: 82, grade: '達標', bonus: 1000 },
    { min: 75, grade: '基本合格', bonus: 0 },
    { min: 0, grade: '待改善', bonus: 0 },
  ].find(item => total >= item.min);
  const cloneWithoutSession = value => {
    const copy = JSON.parse(JSON.stringify(value || {}));
    delete copy.session_token;
    return copy;
  };
  const qaSession = {
    nickname,
    role,
    department,
    status: 'active',
    session_token: 'qa-local-session',
  };
  window.AUTH.setSession(qaSession);
  window.AUTH.getSession = () => ({ ...qaSession });
  window.AUTH.setSession = value => {
    Object.assign(qaSession, value || {});
    return { ...qaSession };
  };

  const nativeFetch = window.fetch.bind(window);
  const tinyPng = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL1WQAAAABJRU5ErkJggg==';
  window.__KPI_QA_CLOUD__ = { calls: [], store: cloudStore };

  window.fetch = async function (input, init) {
    const url = String(input?.url || input || '');
    if (!url.includes('script.google.com/macros/s/')) return nativeFetch(input, init);

    let payload = {};
    try { payload = JSON.parse(String(init?.body || '{}')); } catch (error) { /* return generic success */ }
    Object.assign(cloudStore, loadCloudStore());
    cloudStore.feedback = (cloudStore.feedback || []).map(row => ({ ...row, feedback_id: row.feedback_id || row.id }));
    const action = String(payload.action || '');
    const call = {
      action,
      fileName: String(payload.fileName || ''),
      base64Bytes: payload.base64 ? Math.ceil(String(payload.base64).length * 0.75) : 0,
      createdAt: new Date().toISOString(),
    };
    window.__KPI_QA_CLOUD__.calls.push(call);

    if (failOnceActions.has(action) && !failedActions.has(action)) {
      failedActions.add(action);
      throw new TypeError(`QA 模擬網路中斷：${action}`);
    }

    let result = { ok: true };
    if (action === 'ping') result = { ok: true, time: new Date().toISOString() };
    else if (action === 'getSessionIdentity') result = { ok: true, user: { nickname, role, department, status: 'active' } };
    else if (action === 'listCoursePreps') {
      const target = normalizeNickname(payload.nickname);
      result = {
        ok: true,
        records: Object.values(cloudStore.coursePreps).filter(record => !target || normalizeNickname(record.nickname) === target),
      };
    }
    else if (action === 'listTasks') {
      const viewer = normalizeNickname(payload.viewer || nickname);
      const tasks = Object.values(cloudStore.tasks || {}).filter(task => role !== 'teacher' || normalizeNickname(task.assignee) === viewer);
      result = { ok: true, tasks };
    }
    else if (action === 'getTodayLog' || action === 'getLog') {
      const target = normalizeNickname(payload.nickname);
      const candidates = Object.values(cloudStore.logs)
        .filter(log => !target || normalizeNickname(log.nickname) === target)
        .filter(log => !payload.date || log.date === payload.date)
        .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
      const log = candidates[0] || null;
      result = { ok: true, log, attachments: log?.attachments || [] };
    } else if (action === 'listLogs') {
      const target = normalizeNickname(payload.nickname);
      const logs = Object.values(cloudStore.logs)
        .filter(log => !target || normalizeNickname(log.nickname) === target)
        .filter(log => !payload.from || String(log.date || '') >= String(payload.from))
        .filter(log => !payload.to || String(log.date || '') <= String(payload.to))
        .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
      result = { ok: true, logs };
    } else if (action === 'listArchivedKpiFiles') {
      const viewer = normalizeNickname(payload.viewer || nickname);
      const files = Object.values(cloudStore.logs)
        .filter(log => log.submitted !== false)
        .filter(log => role !== 'teacher' || normalizeNickname(log.nickname) === viewer)
        .map(log => ({
          fileName: `${log.date}_${log.nickname}_KPI日報.pdf`, nickname: log.nickname,
          date: log.date, month: String(log.date || '').slice(0, 7), kind: 'teacher',
          url: `https://drive.google.com/file/d/QA-PDF-${normalizeNickname(log.nickname)}-${log.date}/view`,
        }));
      result = { ok: true, files };
    } else if (action === 'listTeacherReportFolders') {
      if (!['manager', 'admin'].includes(role)) result = { ok: false, error: '只有主管可查看雲端日報資料夾' };
      else {
        const grouped = new Map();
        Object.values(cloudStore.logs).filter(log => log.submitted !== false).forEach(log => {
          const snapshot = log.kpi6_data?.v2_snapshot || {};
          const teacher = snapshot.submission?.teacher || log.nickname;
          const key = normalizeNickname(teacher);
          const current = grouped.get(key) || {
            nickname: teacher, department: snapshot.submission?.department || department,
            reportCount: 0, latestDate: '', status: 'active',
            url: `https://drive.google.com/drive/folders/QA-ANQIN-${key}`,
          };
          current.reportCount += 1;
          if (String(log.date || '') > current.latestDate) current.latestDate = log.date;
          grouped.set(key, current);
        });
        const isGlobalManager = role === 'admin' || normalizeNickname(nickname) === normalizeNickname('小魚');
        const folders = Array.from(grouped.values()).filter(folder => isGlobalManager || folder.department === department);
        result = { ok: true, scope: 'anqin', folders };
      }
    } else if (action === 'listFeedback' || action === 'listFeedbackThread') {
      const target = normalizeNickname(payload.nickname);
      const feedback = cloudStore.feedback.filter(row => {
        if (payload.log_id && row.log_id !== payload.log_id) return false;
        return !target || normalizeNickname(row.from_nickname) === target || normalizeNickname(row.to_nickname) === target;
      });
      result = { ok: true, feedback };
    }
    else if (action === 'listUsers') result = { ok: true, users: [] };
    else if (action === 'getSystemReadiness') result = { ok: true, services: { productionIntegrity: true } };
    else if (action === 'uploadFile' || action === 'uploadPhoto') {
      const fileCounter = Number(cloudStore.fileCounter || 0) + 1;
      const fileId = `QAF${Date.now().toString(36)}${crypto.randomUUID().replaceAll('-', '').slice(0, 10)}`;
      cloudStore.fileCounter = fileCounter;
      cloudStore.files[fileId] = {
        ...call,
        fileName: payload.fileName || `QA-photo-${fileCounter}.jpg`,
        mimeType: payload.mimeType || 'application/octet-stream',
        base64: String(payload.mimeType || '').startsWith('image/') ? String(payload.base64 || '') : '',
      };
      persistCloudStore();
      result = {
        ok: true,
        fileId,
        fileName: payload.fileName || `QA-photo-${fileCounter}.jpg`,
        url: `https://drive.google.com/file/d/${fileId}/view`,
      };
    } else if (action === 'getAttachmentPreviews') {
      const fileIds = Array.isArray(payload.file_ids) ? payload.file_ids : [];
      result = {
        ok: true,
        previews: fileIds.map(fileId => {
          const file = cloudStore.files[fileId] || {};
          const mimeType = String(file.mimeType || 'image/png');
          const dataUrl = file.base64 && mimeType.startsWith('image/')
            ? `data:${mimeType};base64,${file.base64}`
            : tinyPng;
          return { fileId, fileName: file.fileName || '', mimeType, dataUrl };
        }),
        errors: [],
      };
    } else if (action === 'saveCoursePrep') {
      const updatedAt = new Date().toISOString();
      const key = `${normalizeNickname(payload.nickname)}:${payload.prep?.id || updatedAt}`;
      cloudStore.coursePreps[key] = {
        nickname: payload.nickname,
        prep: cloneWithoutSession(payload.prep),
        plan: cloneWithoutSession(payload.plan),
        updatedAt,
      };
      persistCloudStore();
      result = { ok: true, updated_at: updatedAt };
    } else if (action === 'saveLog') {
      const savedAt = new Date().toISOString();
      const key = `${normalizeNickname(payload.nickname)}:${payload.date || savedAt.slice(0, 10)}`;
      const storedLog = cloneWithoutSession(payload);
      storedLog.saved_at = savedAt;
      cloudStore.logs[key] = storedLog;
      persistCloudStore();
      result = { ok: true, log_id: payload.log_id || key, saved_at: savedAt };
    } else if (action === 'sendSubmitPdf') {
      result = { ok: true, pdf_url: 'https://drive.google.com/file/d/QA-PDF/view', notification: { allReached: true, pending: [] } };
    } else if (action === 'addFeedback') {
      const row = {
        feedback_id: `QA-FEEDBACK-${cloudStore.feedback.length + 1}`,
        log_id: payload.log_id,
        from_nickname: payload.from_nickname,
        to_nickname: payload.to_nickname,
        content: payload.content,
        tag: payload.tag || '一般回覆',
        created_at: new Date().toISOString(),
      };
      cloudStore.feedback.push(row);
      persistCloudStore();
      result = { ok: true, feedback_id: row.feedback_id, feedback: row };
    } else if (action === 'addTask') {
      const assignees = Array.isArray(payload.assignees) ? payload.assignees : String(payload.assignees || '').split(',').map(value => value.trim()).filter(Boolean);
      const taskIds = [];
      let created = 0;
      let updated = 0;
      assignees.forEach((assignee, index) => {
        const taskId = String(payload.task_id || `QA-TASK-${Date.now()}-${index}`);
        const existing = cloudStore.tasks[taskId];
        cloudStore.tasks[taskId] = {
          task_id: taskId,
          title: String(payload.title || ''),
          detail: String(payload.detail || ''),
          assignee,
          department,
          due_date: String(payload.due_date || '').slice(0, 10),
          status: 'open',
          created_by: nickname,
          created_at: existing?.created_at || new Date().toISOString(),
          updated_at: new Date().toISOString(),
          done_at: '',
        };
        taskIds.push(taskId);
        if (existing) updated += 1;
        else created += 1;
      });
      persistCloudStore();
      result = { ok: true, created, updated, task_ids: taskIds, updated_at: new Date().toISOString() };
    } else if (action === 'updateTaskStatus') {
      const task = cloudStore.tasks[String(payload.task_id || '')];
      if (!task) result = { ok: false, error: 'task not found' };
      else {
        task.status = payload.status === 'done' ? 'done' : 'open';
        task.updated_at = new Date().toISOString();
        task.done_at = task.status === 'done' ? task.updated_at : '';
        persistCloudStore();
        result = { ok: true, updated_at: task.updated_at };
      }
    } else if (action === 'getEvalEvidence') {
      const logs = Object.values(cloudStore.logs).filter(log => normalizeNickname(log.nickname) === normalizeNickname(payload.nickname) && String(log.date || '').startsWith(String(payload.year_month || '')));
      const evidenceCount = logs.reduce((sum, log) => sum + Number(log.attachments?.length || 0), 0);
      result = {
        ok: true,
        summary: { log_count: logs.length, evidence_count: evidenceCount, feedback_count: cloudStore.feedback.length, observation_count: 0, makeup_count: 0 },
        evidence_by_kpi: { 1: logs, 2: [], 3: [], 4: [], 5: [], 6: [] },
        suggestion: { k1: 0, k2: 0, k3: 0, k4: 0, k5: 0, k6: 0 },
      };
    } else if (action === 'saveEval') {
      const updatedAt = new Date().toISOString();
      const key = `${normalizeNickname(payload.nickname)}:${payload.year_month}`;
      const scores = Array.from({ length: 6 }, (_, index) => Number(payload[`score_k${index + 1}`] || 0));
      const makeupPenalty = Number(payload.makeup_penalty || 0);
      const totalScore = Math.max(0, scores.reduce((sum, score) => sum + score, 0) - makeupPenalty);
      const tier = evaluationTier(totalScore);
      cloudStore.evals[key] = {
        ...cloneWithoutSession(payload), total_score: totalScore, grade: tier.grade, bonus: tier.bonus,
        makeup_count: Number(payload.makeup_count || 0), makeup_penalty: makeupPenalty,
        updated_at: updatedAt,
      };
      persistCloudStore();
      result = { ok: true, total_score: totalScore, grade: tier.grade, bonus: tier.bonus, updated_at: updatedAt };
    } else if (action === 'getEval') {
      const available = Object.values(cloudStore.evals)
        .filter(item => normalizeNickname(item.nickname) === normalizeNickname(payload.nickname))
        .filter(item => role !== 'teacher' || item.status === 'submitted');
      const months = available
        .map(item => item.year_month)
        .sort().reverse();
      const selectedMonth = payload.year_month === 'latest' ? months[0] : payload.year_month;
      const selected = available.find(item => item.year_month === selectedMonth) || null;
      result = { ok: true, eval: selected, months, selected_month: selectedMonth || '' };
    } else if (action === 'listEvals') {
      result = { ok: true, evals: Object.values(cloudStore.evals) };
    }

    if (params.get('trace') === '1') console.debug(`[KPI QA CLOUD] ${action} ${JSON.stringify({ payload, result })}`);
    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };
})();
