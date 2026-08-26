(function () {
  'use strict';

  const APP_VERSION = 13;
  const PREVIEW_MODE = ['127.0.0.1', 'localhost'].includes(window.location.hostname)
    || window.location.hostname.endsWith('.trycloudflare.com');
  const reviewRibbon = document.getElementById('review-ribbon');
  if (reviewRibbon) reviewRibbon.hidden = !PREVIEW_MODE;
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));
  const esc = value => String(value == null ? '' : value).replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
  })[char]);
  const icon = (name, size = 18) => `<i data-lucide="${name}" width="${size}" height="${size}" aria-hidden="true"></i>`;
  const todayIso = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Taipei' });
  const currentMonth = () => todayIso().slice(0, 7);
  const uid = prefix => `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
  const formatDate = value => {
    const parts = String(value || '').slice(0, 10).split('-');
    return parts.length === 3 ? `${Number(parts[1])}/${Number(parts[2])}` : String(value || '');
  };
  const formatMoney = value => `NT$${Number(value || 0).toLocaleString('zh-TW')}`;
  const formatTime = value => {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? '' : date.toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit', hour12: false });
  };
  const nl2br = value => esc(value).replace(/\n/g, '<br>');

  const WORKSPACES = {
    'talent-fulltime': { label: '才藝正職', role: 'fulltime', start: 'today', icon: 'sparkles' },
    'talent-pt': { label: '才藝 PT', role: 'pt', start: 'today', icon: 'clock-3' },
    'talent-manager': { label: '才藝主管', role: 'manager', start: 'dashboard', icon: 'chart-no-axes-combined' },
    'talent-payroll': { label: '才藝薪資檢視', role: 'payroll', start: 'settlement', icon: 'calculator' },
  };

  const STAFF = [
    { nickname: '浩浩老師', role: 'teacher', department: '才藝部門', employment: 'fulltime', work_assignments: ['talent-fulltime'], restDays: ['週一', '週日'], campus: '自營教室' },
    { nickname: 'RITA老師', role: 'teacher', department: '才藝部門', status: 'pending', employment: 'fulltime', work_assignments: ['talent-fulltime'], restDays: ['週二', '週日'], campus: '自營教室' },
    { nickname: '皮皮老師', role: 'teacher', department: '才藝部門', employment: 'pt', work_assignments: ['talent-pt'], schedule: [{ weekday: 4, label: '週四', time: '19:00–20:30', siteType: 'self', site: '布拉克自營教室' }] },
    { nickname: '紅豆老師', role: 'teacher', department: '東橋教室', employment: 'pt', work_assignments: ['anqin-teacher', 'talent-pt'], schedule: [1, 3, 4, 5].map(weekday => ({ weekday, label: `週${['日', '一', '二', '三', '四', '五', '六'][weekday]}`, time: '19:00–20:30', siteType: 'self', site: '布拉克自營教室' })) },
    { nickname: '小明老師', role: 'teacher', department: '北區教室', employment: 'pt', work_assignments: ['anqin-teacher', 'talent-pt'], schedule: [{ weekday: 3, label: '週三', time: '19:00–20:30', siteType: 'self', site: '布拉克自營教室' }] },
    { nickname: '黑豹老師', role: 'teacher', department: '才藝部門', status: 'pending', employment: 'pt', work_assignments: ['talent-pt'], schedule: [1, 4].map(weekday => ({ weekday, label: `週${weekday === 1 ? '一' : '四'}`, time: '19:00–20:30', siteType: 'partner', site: '善化合作校' })) },
    { nickname: '柳丁主管', role: 'manager', department: '才藝部門', employment: 'manager', work_assignments: ['talent-manager'], campus: '全才藝部' },
    { nickname: '柏翰', role: 'admin', department: '管理部', employment: 'admin', work_assignments: ['anqin-manager', 'talent-payroll'], campus: '全校' },
    { nickname: '小魚主管', role: 'manager', department: '管理部', employment: 'manager', work_assignments: ['anqin-manager', 'talent-payroll'], campus: '全校' },
  ];

  const COURSE_TYPES = ['幼兒積木', 'WeDo 機器人', 'SPIKE 機器人', '程式設計', '科學實驗', '競賽培訓', '其他才藝課程'];
  const KPI_DIMENSIONS = [
    { key: 'prep', label: '備課教案建檔與審查', max: 25, description: '教案完整、課前核准、版本修正可追溯' },
    { key: 'evidence', label: '本堂紀錄與學習證據', max: 25, description: '記錄完整、證據對應課程、下次調整具體' },
    { key: 'communication', label: 'APP 與親師溝通', max: 20, description: '週六前完成 APP、溝通與個案追蹤完整' },
    { key: 'attendance', label: '出席與班級穩定追蹤', max: 15, description: '點名一致、缺席追蹤、續報追蹤' },
    { key: 'room', label: '教室整理與安全復原', max: 10, description: '每堂完成整理確認與課後照片' },
    { key: 'improvement', label: '課程改善與協作', max: 5, description: '根據課後結果修正教案或完成改善' },
  ];

  const NAV = {
    fulltime: [
      { route: 'today', label: '今日上課', icon: 'clipboard-pen-line' },
      { route: 'prep', label: '備課教案', icon: 'notebook-tabs' },
      { route: 'weekly', label: 'APP 發布', icon: 'images' },
      { route: 'performance', label: 'KPI 與獎金', icon: 'gauge' },
      { route: 'records', label: '我的紀錄', icon: 'history' },
      { route: 'guide', label: '使用與規則', icon: 'circle-help' },
    ],
    pt: [
      { route: 'today', label: '今日上課', icon: 'clipboard-pen-line' },
      { route: 'prep', label: '備課教案', icon: 'notebook-tabs' },
      { route: 'pay', label: '鐘點與續報', icon: 'badge-dollar-sign' },
      { route: 'records', label: '我的紀錄', icon: 'history' },
      { route: 'guide', label: '使用與規則', icon: 'circle-help' },
    ],
    manager: [
      { route: 'dashboard', label: '主管總覽', icon: 'layout-dashboard' },
      { route: 'prep-review', label: '備課審查', icon: 'file-check-2' },
      { route: 'log-review', label: '工作紀錄', icon: 'scan-search' },
      { route: 'scoring', label: 'KPI 評分', icon: 'gauge' },
      { route: 'settlement', label: '薪資獎金', icon: 'calculator' },
      { route: 'people', label: '人員與排班', icon: 'users-round' },
      { route: 'cloud-reports', label: '雲端日報', icon: 'folder-open' },
      { route: 'guide', label: '制度規則', icon: 'book-open-text' },
    ],
    payroll: [
      { route: 'settlement', label: 'PT 月結', icon: 'calculator' },
      { route: 'bonus-approval', label: '獎金核准', icon: 'badge-check' },
      { route: 'cloud-reports', label: '雲端日報', icon: 'folder-open' },
      { route: 'guide', label: '制度規則', icon: 'book-open-text' },
    ],
  };

  function authSession() {
    try { return window.AUTH?.getSession?.() || null; } catch (error) { return null; }
  }

  function normalizeName(value) {
    return String(value || '').trim().replace(/\s+/g, '').replace(/(?:老師|主管)$/, '').toLowerCase();
  }

  function findStaff(value) {
    const normalized = normalizeName(value);
    return STAFF.find(person => normalizeName(person.nickname) === normalized) || null;
  }

  function requestedWorkspace() {
    const requested = new URLSearchParams(window.location.search).get('workspace');
    return WORKSPACES[requested] ? requested : 'talent-pt';
  }

  function resolveIdentity() {
    const session = authSession();
    const requested = requestedWorkspace();
    if (session) {
      const person = findStaff(session.nickname) || { ...session, employment: requested === 'talent-fulltime' ? 'fulltime' : requested === 'talent-manager' ? 'manager' : requested === 'talent-payroll' ? 'admin' : 'pt' };
      const merged = { ...person, ...session, work_assignments: session.work_assignments || person.work_assignments };
      const assignments = window.KPI_WORKSPACES?.getAssignments?.(merged) || [];
      const talentAssignments = assignments.filter(item => item.group === 'talent');
      if (talentAssignments.length) {
        const current = talentAssignments.some(item => item.id === requested) ? requested : talentAssignments[0].id;
        return { session, user: merged, workspace: current };
      }
    }

    if (!PREVIEW_MODE) return { session: null, user: null, workspace: '' };
    const params = new URLSearchParams(window.location.search);
    const requestedUser = findStaff(params.get('reviewUser'));
    const fallbackName = requested === 'talent-manager' ? '柳丁主管' : requested === 'talent-payroll' ? '柏翰' : requested === 'talent-fulltime' ? '浩浩老師' : '紅豆老師';
    const user = requestedUser || findStaff(fallbackName);
    const assignments = window.KPI_WORKSPACES?.getAssignments?.(user) || [];
    const workspace = assignments.some(item => item.id === requested)
      ? requested
      : (assignments.find(item => item.group === 'talent')?.id || requested);
    return { session: null, user, workspace };
  }

  const identity = resolveIdentity();
  const currentUser = identity.user;
  const workspaceId = identity.workspace;
  const workspace = WORKSPACES[workspaceId];
  if (!currentUser || !workspace) {
    const app = $('#app');
    if (app) app.innerHTML = '<main class="auth-required"><img src="../../shared/icons/logo.png" alt="布拉克星球 Logo"><h1>請先登入正式帳號</h1><p>正在返回登入頁面…</p></main>';
    const root = window.AUTH?.relativeRoot?.() || '../../';
    window.setTimeout(() => window.location.replace(`${root}index.html?return=${encodeURIComponent('review/talent-v2/index.html')}`), 300);
    return;
  }
  window.KPI_REVIEW_USER = currentUser;
  const TEST_VIEW_MODE = Boolean(identity.session?.impersonate);
  const realActor = TEST_VIEW_MODE ? (window.AUTH?.getRealSession?.() || null) : identity.session;
  const isBohanAdmin = Boolean(realActor?.role === 'admin' && normalizeName(realActor.nickname) === normalizeName('柏翰'));
  if (TEST_VIEW_MODE && reviewRibbon) {
    reviewRibbon.hidden = false;
    reviewRibbon.classList.add('test-view');
    reviewRibbon.innerHTML = `${icon('scan-eye', 15)}<strong>柏翰測試視角</strong><span class="review-separator" aria-hidden="true"></span>目前查看：${esc(currentUser.nickname)} · 唯讀，不會寫入正式資料 <button type="button" class="test-view-exit" data-action="exit-impersonation">回到管理頁</button>`;
  }

  function createSeed() {
    const month = currentMonth();
    const date = todayIso();
    return {
      version: APP_VERSION,
      ui: { route: workspace.start, lastSavedAt: '', month },
      settings: { ptStrictStart: date, ptExceptions: [] },
      users: PREVIEW_MODE ? STAFF.filter(person => person.status !== 'pending') : [],
      pendingUsers: PREVIEW_MODE ? STAFF.filter(person => person.status === 'pending') : [],
      archivedUsers: [],
      draftLog: null,
      draftPrep: null,
      preps: PREVIEW_MODE ? [
        { id: 'prep_robot_1', teacher: '紅豆老師', courseType: 'WeDo 機器人', courseName: '齒輪轉速實驗', title: '齒輪轉速與傳動', version: 'v1.1', objective: '學生能比較兩種齒輪配置的速度差異。', principle: '主動齒輪與從動齒輪的齒數比會改變轉速與扭力。', guidance: '先請學生預測，每次只改一個變因，測試後用實驗表比較。', game: '限時轉速挑戰，進階組自行改造第三種配置。', flow: '預測 10 分鐘／示範 15 分鐘／分組測試 45 分鐘／分享 20 分鐘。', materials: ['齒輪轉速實驗_v1.1.pdf', '實驗紀錄單.pdf'], status: 'approved', reviewedBy: '柳丁主管', reviewedAt: date, reviewNote: '通過，請保留學生預測與實測的差異。' },
        { id: 'prep_spike_1', teacher: '浩浩老師', courseType: 'SPIKE 機器人', courseName: '循線挑戰', title: '感測值與條件判斷', version: 'v1.0', objective: '學生能說明黑白反射差異並完成循線。', principle: '反射光感測值作為程式條件判斷依據。', guidance: '先實測黑白值，再讓學生自己設定中間值並觀察結果。', game: '循線計時闖關與彎道改造。', flow: '原理 15 分鐘／程式 20 分鐘／測試改造 45 分鐘／反思 10 分鐘。', materials: ['SPIKE_循線_v1.0.pdf'], status: 'pending', reviewedBy: '', reviewedAt: '', reviewNote: '' },
      ] : [],
      logs: PREVIEW_MODE ? [
        { id: 'log_sample_1', teacher: '紅豆老師', employment: 'pt', date, lessonStatus: 'held', courseType: 'WeDo 機器人', courseName: '齒輪轉速實驗', siteType: 'self', site: '布拉克自營教室', duration: 1.5, expected: 6, present: 5, leave: 1, absent: 0, makeup: 1, trial: 1, prepId: 'prep_robot_1', completed: '完成兩組齒輪配置測試，5 位學生能說明速度差異。', response: '學生對限時挑戰參與度高，有兩組主動要求改造。', issue: '一組尚會同時更換兩個齒輪，下次改用變因卡限制。', parentStatus: 'complete', roomDone: true, attendanceFiles: ['點名簿_0826.jpg'], learningFiles: ['齒輪測試.jpg', '挑戰影片.mov'], roomFiles: ['課後教室.jpg'], newCount: 0, renewalCount: 1, appStatus: 'pending', status: 'submitted', pay: 900, createdAt: new Date().toISOString(), sample: true },
      ] : [],
      scores: PREVIEW_MODE ? [
        { teacher: '浩浩老師', month, scores: { prep: 23, evidence: 22, communication: 18, attendance: 14, room: 10, improvement: 4 }, reason: '本月資料完整，一筆 APP 紀錄逾期補齊。', published: false },
        { teacher: 'RITA老師', month, scores: { prep: 24, evidence: 23, communication: 19, attendance: 14, room: 9, improvement: 5 }, reason: '審查樣本，待月底正式核定。', published: false },
      ] : [],
      conversations: PREVIEW_MODE ? [
        { id: 'chat_1', teacher: '浩浩老師', month, messages: [{ author: '柳丁主管', role: 'manager', text: '這個月的課程證據很完整，下個月請再留意 APP 發布時間。', at: new Date().toISOString() }] },
      ] : [],
    };
  }

  const sharedStorageKey = 'bp_talent_kpi_v13_shared';
  const personalStorageKey = `bp_talent_kpi_v13_personal_${encodeURIComponent(TEST_VIEW_MODE ? `${realActor?.nickname || 'admin'}_test_${currentUser?.nickname || 'review'}` : currentUser?.nickname || 'review')}_${workspaceId}`;

  function loadState() {
    const seed = createSeed();
    let shared = null;
    let personal = null;
    if (PREVIEW_MODE) {
      try { shared = JSON.parse(localStorage.getItem(sharedStorageKey) || 'null'); } catch (error) { shared = null; }
    }
    try { personal = JSON.parse(localStorage.getItem(personalStorageKey) || 'null'); } catch (error) { personal = null; }
    if (!shared || shared.version !== APP_VERSION) {
      shared = { version: APP_VERSION, settings: seed.settings, users: seed.users, pendingUsers: seed.pendingUsers, preps: seed.preps, logs: seed.logs, scores: seed.scores, conversations: seed.conversations };
    }
    if (!personal || personal.version !== APP_VERSION) {
      personal = { version: APP_VERSION, ui: seed.ui, draftLog: null, draftPrep: null };
    }
    return { ...shared, ui: personal.ui, draftLog: personal.draftLog, draftPrep: personal.draftPrep };
  }

  let state = loadState();
  state.settings = state.settings || { ptStrictStart: todayIso(), ptExceptions: [] };
  state.users = Array.isArray(state.users) ? state.users : [];
  state.pendingUsers = Array.isArray(state.pendingUsers) ? state.pendingUsers : [];
  state.archivedUsers = Array.isArray(state.archivedUsers) ? state.archivedUsers : [];
  let pendingFiles = { attendance: [], learning: [], room: [], prep: [] };
  let activeLogSource = null;
  const cloudRuntime = {
    status: PREVIEW_MODE ? 'preview' : 'loading',
    message: PREVIEW_MODE ? '內部審查資料只保存在這台裝置' : '正在讀取正式資料',
    foldersStatus: 'idle',
    foldersMessage: '',
    folders: [],
  };
  let cloudDraftTimer = 0;
  let cloudDraftChain = Promise.resolve();

  function persist(message = '已儲存') {
    state.ui.lastSavedAt = new Date().toISOString();
    try {
      if (PREVIEW_MODE) {
        localStorage.setItem(sharedStorageKey, JSON.stringify({ version: APP_VERSION, settings: state.settings, users: state.users, pendingUsers: state.pendingUsers, archivedUsers: state.archivedUsers, preps: state.preps, logs: state.logs, scores: state.scores, conversations: state.conversations }));
      } else {
        localStorage.removeItem(sharedStorageKey);
      }
      localStorage.setItem(personalStorageKey, JSON.stringify({ version: APP_VERSION, ui: state.ui, draftLog: state.draftLog, draftPrep: state.draftPrep }));
    } catch (error) {
      console.warn('[Talent] local draft storage unavailable:', error);
    }
    const node = $('#save-state');
    if (node) node.innerHTML = `${icon('circle-check', 14)}<span>${esc(message)} ${formatTime(state.ui.lastSavedAt)}</span>`;
    hydrateIcons();
  }

  async function loadCloudData(notify = false) {
    if (PREVIEW_MODE) return { ok: true };
    cloudRuntime.status = 'loading';
    cloudRuntime.message = '正在讀取正式資料';
    renderApp();
    const result = await window.API?.getTalentWorkspaceData?.({ viewer: currentUser.nickname });
    if (!result?.ok) {
      cloudRuntime.status = 'error';
      cloudRuntime.message = result?.error || '正式資料讀取失敗，請勿在離線畫面繼續填寫';
      renderApp();
      if (notify) toast(cloudRuntime.message, 'danger');
      return result || { ok: false };
    }
    state.logs = Array.isArray(result.lessons) ? result.lessons : [];
    state.preps = Array.isArray(result.preps) ? result.preps : [];
    state.scores = Array.isArray(result.scores) ? result.scores : [];
    state.conversations = Array.isArray(result.conversations) ? result.conversations : [];
    state.users = Array.isArray(result.users) ? result.users : [];
    state.pendingUsers = Array.isArray(result.pending_users) ? result.pending_users : [];
    state.archivedUsers = Array.isArray(result.archived_users) ? result.archived_users : [];
    state.settings = { ...state.settings, ...(result.settings || {}) };
    if (!TEST_VIEW_MODE && result.draft && !state.draftLog) state.draftLog = result.draft;
    const profile = (result.users || []).find(user => normalizeName(user.nickname) === normalizeName(currentUser.nickname));
    if (profile) {
      currentUser.employment = profile.employment_type || currentUser.employment;
      currentUser.work_assignments = profile.work_assignments || currentUser.work_assignments;
      currentUser.schedule = Array.isArray(profile.schedule_json) ? profile.schedule_json : (currentUser.schedule || []);
      currentUser.restDays = Array.isArray(profile.rest_days) ? profile.rest_days : (currentUser.restDays || []);
    }
    cloudRuntime.status = 'ready';
    cloudRuntime.message = `已同步 ${state.logs.length} 筆課堂、${state.preps.length} 份教案`;
    persist('雲端已同步');
    renderApp();
    if (state.ui.route === 'cloud-reports' && cloudRuntime.foldersStatus === 'idle') window.setTimeout(loadCloudFolders, 0);
    window.setTimeout(maybeShowPushReminder, 250);
    if (notify) toast(cloudRuntime.message);
    return result;
  }

  function talentStaff() {
    const source = state.users.length ? state.users : STAFF;
    return source.map(person => ({
      ...person,
      employment: person.employment || person.employment_type || '',
      schedule: Array.isArray(person.schedule) ? person.schedule : Array.isArray(person.schedule_json) ? person.schedule_json : [],
      restDays: Array.isArray(person.restDays) ? person.restDays : Array.isArray(person.rest_days) ? person.rest_days : [],
      work_assignments: Array.isArray(person.work_assignments) ? person.work_assignments : [],
      campus: person.campus || person.department || '',
    }));
  }

  function archivedTalentStaff() {
    return (Array.isArray(state.archivedUsers) ? state.archivedUsers : []).map(person => ({
      ...person,
      employment: person.employment || person.employment_type || '',
      schedule: Array.isArray(person.schedule) ? person.schedule : Array.isArray(person.schedule_json) ? person.schedule_json : [],
      restDays: Array.isArray(person.restDays) ? person.restDays : Array.isArray(person.rest_days) ? person.rest_days : [],
      work_assignments: Array.isArray(person.work_assignments) ? person.work_assignments : [],
      campus: person.campus || person.department || '',
    }));
  }

  function pendingTalentStaff() {
    return (Array.isArray(state.pendingUsers) ? state.pendingUsers : []).map(person => ({
      ...person,
      employment: person.employment || person.employment_type || '',
      schedule: Array.isArray(person.schedule) ? person.schedule : Array.isArray(person.schedule_json) ? person.schedule_json : [],
      restDays: Array.isArray(person.restDays) ? person.restDays : Array.isArray(person.rest_days) ? person.rest_days : [],
      work_assignments: Array.isArray(person.work_assignments) ? person.work_assignments : [],
      campus: person.campus || person.department || '',
    }));
  }

  function visibleTalentStaff() {
    const active = talentStaff();
    const activeNames = new Set(active.map(person => normalizeName(person.nickname)));
    return active.concat(pendingTalentStaff().filter(person => !activeNames.has(normalizeName(person.nickname))));
  }

  function isActiveTalentTeacher(nickname) {
    return talentStaff().some(person => normalizeName(person.nickname) === normalizeName(nickname));
  }

  function settlementStaff() {
    const active = talentStaff();
    const existing = {};
    active.forEach(person => { existing[normalizeName(person.nickname)] = true; });
    const historical = archivedTalentStaff().filter(person => {
      if (existing[normalizeName(person.nickname)]) return false;
      const hasLesson = state.logs.some(item => normalizeName(item.teacher) === normalizeName(person.nickname) && String(item.date || '').slice(0, 7) === state.ui.month);
      const hasScore = state.scores.some(item => normalizeName(item.teacher) === normalizeName(person.nickname) && item.month === state.ui.month);
      return hasLesson || hasScore;
    });
    return active.concat(historical);
  }

  function maybeShowPushReminder() {
    if (PREVIEW_MODE || !isTeacher() || identity.session?.impersonate || !('Notification' in window) || Notification.permission !== 'default') return;
    const key = `talent_push_reminder_seen_${normalizeName(currentUser.nickname)}`;
    try {
      if (localStorage.getItem(key)) return;
      localStorage.setItem(key, '1');
    } catch (error) {}
    openDialog({
      title: '開啟 APP 通知',
      body: `<div class="notice info">${icon('bell-ring', 19)}<div><strong>即時收到教案審查與主管回覆</strong><span>只有按下「開啟通知」後，瀏覽器才會詢問系統授權。</span></div></div>`,
      footer: `<button type="button" class="btn" data-action="close-dialog">稍後</button><button type="button" class="btn btn-primary" data-action="enable-push">${icon('bell-plus', 16)}開啟通知</button>`,
    });
  }

  function cloudGate() {
    if (PREVIEW_MODE || cloudRuntime.status === 'ready') return '';
    if (cloudRuntime.status === 'loading') {
      return `${pageHead('正在讀取正式資料', '請稍候，完成前不開放填寫。')}<section class="panel"><div class="empty-state"><span>${icon('loader-circle', 28)}</span><h3>正在同步</h3><p>系統正在核對帳號、課堂、教案與月結資料。</p></div></section>`;
    }
    return `${pageHead('正式資料暫時無法讀取', '為避免覆蓋既有內容，目前已停止新增與修改。')}<div class="notice strict">${icon('cloud-alert', 19)}<div><strong>資料尚未載入</strong><span>${esc(cloudRuntime.message)}</span></div><button type="button" class="btn btn-small" data-action="retry-cloud">重新讀取</button></div>`;
  }

  function hydrateIcons() {
    if (window.lucide?.createIcons) window.lucide.createIcons({ attrs: { 'stroke-width': 1.9 } });
  }

  function toast(message, type = 'success') {
    const root = $('#toast-root');
    if (!root) return;
    const node = document.createElement('div');
    node.className = `toast ${type}`;
    node.innerHTML = `${icon(type === 'danger' ? 'circle-alert' : type === 'warning' ? 'triangle-alert' : 'circle-check', 17)}<span>${esc(message)}</span>`;
    root.appendChild(node);
    hydrateIcons();
    window.setTimeout(() => node.remove(), 3200);
  }

  function modeRole() { return workspace.role; }
  function isTeacher() { return ['fulltime', 'pt'].includes(modeRole()); }
  function isPt() { return modeRole() === 'pt'; }
  function isPayroll() { return modeRole() === 'payroll'; }
  function navItems() { return NAV[modeRole()]; }
  function routeTitle() { return navItems().find(item => item.route === state.ui.route)?.label || workspace.label; }
  function initials() { return String(currentUser.nickname || '才藝').replace(/(?:老師|主管)$/, '').slice(0, 2); }
  function ownLogs() { return state.logs.filter(item => !isTeacher() || normalizeName(item.teacher) === normalizeName(currentUser.nickname)); }
  function ownPreps() { return state.preps.filter(item => !isTeacher() || normalizeName(item.teacher) === normalizeName(currentUser.nickname)); }

  function renderApp() {
    if (!navItems().some(item => item.route === state.ui.route)) state.ui.route = workspace.start;
    const app = $('#app');
    app.innerHTML = `
      <header class="topbar">
        <div class="brand-block">
          <img class="brand-logo" src="../../shared/icons/logo.png" alt="布拉克星球 Logo">
          <div class="brand-copy"><div class="brand-name">布拉克星球KPI系統</div><div class="brand-product">才藝工作台</div></div>
        </div>
        <div class="topbar-center">
          <div class="crumb">${esc(workspace.label)} / ${esc(routeTitle())}</div>
          <div id="save-state" class="save-state">${icon('circle-check', 14)}<span>${state.ui.lastSavedAt ? `已儲存 ${formatTime(state.ui.lastSavedAt)}` : '尚無變更'}</span></div>
        </div>
        <div class="topbar-actions">
          ${window.KPI_WORKSPACES?.renderSwitcher?.(currentUser, { currentId: workspaceId }) || ''}
          <button type="button" class="profile-button" data-action="open-profile" aria-label="開啟使用者選單">
            <span class="avatar">${esc(initials())}</span>
            <span class="profile-text"><span class="profile-name">${esc(currentUser.nickname)}</span><span class="profile-meta">${esc(workspace.label)}</span></span>
            ${icon('chevron-down', 16)}
          </button>
        </div>
      </header>
      <aside class="sidebar">
        <div class="nav-group-label">${esc(workspace.label)}工作區</div>
        <nav class="side-nav" aria-label="主要導覽">${navItems().map(renderNavButton).join('')}</nav>
        <div class="sidebar-foot"><img src="../../shared/icons/bg.jpg" alt="" aria-hidden="true"><div><strong>資料只填一次</strong><span>系統自動分流至 KPI、APP 與結算</span></div></div>
      </aside>
      <main class="app-main" id="main-content">${window.KPI_WORKSPACES?.renderQuickSwitcher?.(currentUser, { currentId: workspaceId }) || ''}${renderRoute()}</main>
      <nav class="mobile-bottom-nav" aria-label="行動版導覽">${renderMobileNav()}</nav>
    `;
    hydrateIcons();
    window.scrollTo({ top: 0, behavior: 'instant' });
  }

  function renderNavButton(item) {
    const count = item.route === 'prep-review' ? state.preps.filter(prep => prep.status === 'pending').length : 0;
    return `<button type="button" class="nav-button ${state.ui.route === item.route ? 'active' : ''}" data-action="navigate" data-route="${item.route}">
      ${icon(item.icon, 18)}<span>${esc(item.label)}</span>${count ? `<span class="nav-count">${count}</span>` : ''}
    </button>`;
  }

  function renderMobileNav() {
    const items = navItems();
    const visible = items.length <= 5 ? items : items.slice(0, 4);
    const buttons = visible.map(item => `<button type="button" class="mobile-nav-button ${state.ui.route === item.route ? 'active' : ''}" data-action="navigate" data-route="${item.route}">${icon(item.icon, 19)}<span>${esc(item.label)}</span></button>`);
    if (items.length > 5) buttons.push(`<button type="button" class="mobile-nav-button" data-action="more-nav">${icon('menu', 19)}<span>更多</span></button>`);
    return buttons.join('');
  }

  function pageHead(title, subtitle, actions = '') {
    return `<div class="page-head"><div><div class="page-kicker">${icon(workspace.icon, 16)}${esc(workspace.label)}</div><h1>${esc(title)}</h1>${subtitle ? `<p>${esc(subtitle)}</p>` : ''}</div>${actions ? `<div class="page-actions">${actions}</div>` : ''}</div>`;
  }

  function renderRoute() {
    const gate = cloudGate();
    if (gate) return gate;
    const routes = {
      today: renderToday,
      prep: renderPrep,
      weekly: renderWeekly,
      performance: renderPerformance,
      pay: renderPay,
      records: renderRecords,
      guide: renderGuide,
      dashboard: renderManagerDashboard,
      'prep-review': renderPrepReview,
      'log-review': renderLogReview,
      scoring: renderScoring,
      settlement: renderSettlement,
      'bonus-approval': renderBonusApproval,
      people: renderPeople,
      'cloud-reports': renderCloudReports,
    };
    return (routes[state.ui.route] || routes[workspace.start])();
  }

  function todaySchedule() {
    const weekday = new Date(`${todayIso()}T12:00:00+08:00`).getDay();
    if (currentUser.employment === 'fulltime') {
      const weekLabel = `週${['日', '一', '二', '三', '四', '五', '六'][weekday]}`;
      if ((currentUser.restDays || []).includes(weekLabel)) return [];
      return [{ weekday, label: weekLabel, time: '依當日正式班表', siteType: 'self', site: '布拉克自營教室' }];
    }
    return userScheduleEntries(currentUser).filter(item => item.weekday === weekday);
  }

  function scheduleKey(schedule) {
    if (!schedule) return '';
    return String(schedule.scheduleKey || schedule.key || [
      `w${Number(schedule.weekday)}`,
      schedule.time || '',
      schedule.siteType || '',
      schedule.site || '',
    ].map(value => encodeURIComponent(String(value).trim())).join('__'));
  }

  function userScheduleEntries(person = currentUser) {
    return (person?.schedule || []).map(item => ({ ...item, scheduleKey: scheduleKey(item) }));
  }

  function schedulesForDate(person, date) {
    const weekday = new Date(`${date}T12:00:00+08:00`).getDay();
    return userScheduleEntries(person).filter(item => Number(item.weekday) === weekday);
  }

  function renderToday() {
    const schedules = todaySchedule();
    const logs = ownLogs().filter(item => item.date === todayIso());
    const primary = schedules[0];
    return `${pageHead('今日上課', '從排課開始，完成點名、教學紀錄、證據與課後復原。', `<button type="button" class="btn btn-primary" data-action="new-log">${icon('plus', 17)}新增本堂紀錄</button>`)}
      <section class="status-grid">
        <article class="status-card"><span class="status-icon yellow">${icon('calendar-days', 20)}</span><div><small>今日排課</small><strong>${schedules.length ? schedules.map(item => item.time).join('、') : '無固定排課'}</strong><span>${schedules.length ? schedules.map(item => item.site).join('、') : '休假日不會產生缺件'}</span></div></article>
        <article class="status-card"><span class="status-icon blue">${icon('clipboard-check', 20)}</span><div><small>今日紀錄</small><strong>${logs.length} 堂</strong><span>${logs.filter(item => item.status === 'submitted').length} 堂已送出</span></div></article>
        <article class="status-card"><span class="status-icon green">${icon(isPt() ? 'badge-dollar-sign' : 'gauge', 20)}</span><div><small>${isPt() ? '本月鐘點預估' : '本月 KPI'}</small><strong>${isPt() ? formatMoney(ownLogs().reduce((sum, item) => sum + Number(item.pay || 0), 0)) : `${scoreTotal(scoreFor(currentUser.nickname))} 分`}</strong><span>${isPt() ? '體驗不計級距，補課計入' : '月底由主管核定'}</span></div></article>
      </section>
      ${isPt() ? `<div class="notice strict">${icon('lock', 19)}<div><strong>PT 正常課程只能當日送出</strong><span>任一堂正常課程漏填即取消當月續報獎金；只有停課可補選過去排課日。</span></div></div>` : ''}
      ${state.draftLog ? `<div class="notice warning">${icon('file-pen-line', 19)}<div><strong>有一筆今日未完成草稿</strong><span>上次輸入已保留，請在今日結束前送出。</span></div><button type="button" class="btn btn-small" data-action="new-log">繼續填寫</button><button type="button" class="icon-button" data-action="discard-log-draft" aria-label="刪除這筆草稿" title="刪除草稿">${icon('trash-2', 16)}</button></div>` : ''}
      <section class="panel">
        <div class="panel-head"><div><h2>今日課程</h2><p>${primary ? `已帶入 ${primary.label} ${primary.time}` : '若有代課或補登，仍可手動新增。'}</p></div></div>
        <div class="panel-body">${logs.length ? logs.map(renderLogRow).join('') : renderEmpty('還沒有今日紀錄', '上課後用同一張表完成紀錄，不需要分散重寫。', 'clipboard-pen-line', '<button type="button" class="btn btn-primary" data-action="new-log">新增紀錄</button>')}</div>
      </section>`;
  }

  function renderLogRow(item) {
    if (item.lessonStatus === 'cancelled') {
      return `<article class="record-row">
        <div class="record-date"><strong>${formatDate(item.date)}</strong><span>${item.backfilled ? '補登停課' : '當日回報'}</span></div>
        <div class="record-main"><div class="record-title">${esc(item.courseName || '停課')} ${statusBadge('cancelled')}</div><div class="record-meta">${esc(item.site)} · ${esc(item.teacher)}</div><div class="record-note">${esc(item.cancellationReason)}${item.cancellationNote ? ` · ${esc(item.cancellationNote)}` : ''}</div></div>
        <div class="record-side"><strong>${formatMoney(0)}</strong><span>不計鐘點</span><button type="button" class="icon-button" data-action="view-log" data-id="${item.id}" aria-label="查看停課紀錄">${icon('chevron-right', 18)}</button></div>
      </article>`;
    }
    const count = Number(item.present || 0) + Number(item.makeup || 0);
    return `<article class="record-row">
      <div class="record-date"><strong>${formatDate(item.date)}</strong><span>${esc(item.duration)} 小時</span></div>
      <div class="record-main"><div class="record-title">${esc(item.courseName || item.courseType)} ${statusBadge(item.status)}</div><div class="record-meta">${esc(item.site)} · 計薪實到 ${count} 人 · ${esc(item.teacher)}</div><div class="record-note">${esc(item.completed)}</div></div>
      <div class="record-side">${item.employment === 'pt' ? `<strong>${formatMoney(item.pay)}</strong><span>本堂預估</span>` : `<strong>${item.appStatus === 'published' ? 'APP 已發布' : 'APP 待發布'}</strong><span>最晚週六</span>`}${isTeacher() && item.date === todayIso() && normalizeName(item.teacher) === normalizeName(currentUser.nickname) ? `<button type="button" class="icon-button" data-action="edit-log" data-id="${item.id}" aria-label="補充今日紀錄" title="補充今日紀錄">${icon('pencil', 16)}</button>` : ''}<button type="button" class="icon-button" data-action="view-log" data-id="${item.id}" aria-label="查看紀錄">${icon('chevron-right', 18)}</button></div>
    </article>`;
  }

  function renderPrep() {
    const preps = ownPreps();
    return `${pageHead('備課教案', '教案只在這裡建檔一次；授課當天只選用已核准版本。', `<button type="button" class="btn btn-primary" data-action="new-prep">${icon('plus', 17)}新增備課教案</button>`)}
      <div class="filter-bar"><span>${icon('folder-open', 17)}${preps.length} 份備課檔案</span><span class="filter-note">核准後才能於本堂紀錄選用</span></div>
      <section class="card-list">${preps.length ? preps.map(renderPrepCard).join('') : renderEmpty('尚無備課教案', '先建立核心原理、引導方法、遊戲挑戰與教材。', 'notebook-tabs', '<button type="button" class="btn btn-primary" data-action="new-prep">開始建檔</button>')}</section>`;
  }

  function renderPrepCard(prep) {
    return `<article class="prep-card">
      <div class="prep-card-head"><span class="course-icon">${icon('notebook-tabs', 21)}</span><div><div class="record-title">${esc(prep.title)} ${statusBadge(prep.status)}</div><div class="record-meta">${esc(prep.courseType)} · ${esc(prep.courseName)} · ${esc(prep.version)}</div></div></div>
      <p>${esc(prep.objective)}</p>
      <div class="tag-row"><span>${icon('lightbulb', 14)}核心原理</span><span>${icon('route', 14)}引導流程</span><span>${icon('gamepad-2', 14)}遊戲／改造</span><span>${icon('paperclip', 14)}${prep.materials.length} 份教材</span></div>
      ${prep.reviewNote ? `<div class="review-note"><strong>${esc(prep.reviewedBy || '主管回覆')}</strong><span>${esc(prep.reviewNote)}</span></div>` : ''}
      <div class="card-actions"><button type="button" class="btn" data-action="view-prep" data-id="${prep.id}">${icon('eye', 16)}查看完整教案</button>${isTeacher() && prep.status !== 'approved' ? `<button type="button" class="btn btn-primary" data-action="edit-prep" data-id="${prep.id}">${icon('pencil', 16)}繼續編輯</button>` : ''}</div>
    </article>`;
  }

  function renderWeekly() {
    const logs = ownLogs().filter(item => item.date.slice(0, 7) === state.ui.month && item.lessonStatus !== 'cancelled');
    return `${pageHead('APP 發布', '沿用本堂教學日誌與照片影片，這裡只確認發布狀態。')}
      <div class="notice info">${icon('info', 19)}<div><strong>不需要重寫一份 APP 文案</strong><span>系統直接帶入本堂完成內容、孩子反應與證據；預設每週六 23:59 前完成。</span></div></div>
      <section class="panel"><div class="panel-head"><div><h2>本月課堂</h2><p>${logs.filter(item => item.appStatus === 'published').length}/${logs.length} 已發布</p></div></div><div class="panel-body">${logs.length ? logs.map(item => `<article class="record-row"><div class="record-date"><strong>${formatDate(item.date)}</strong><span>${esc(item.courseType)}</span></div><div class="record-main"><div class="record-title">${esc(item.courseName)}</div><div class="record-note">${esc(item.completed)}</div></div><div class="record-side">${statusBadge(item.appStatus === 'published' ? 'published' : 'pending')}<button type="button" class="btn btn-small ${item.appStatus === 'published' ? '' : 'btn-primary'}" data-action="toggle-app" data-id="${item.id}">${item.appStatus === 'published' ? '改為待發布' : '標記已發布'}</button></div></article>`).join('') : renderEmpty('本月尚無課堂', '完成本堂紀錄後，將自動出現在這裡。', 'images')}</div></section>`;
  }

  function scoreFor(teacher) {
    return state.scores.find(item => normalizeName(item.teacher) === normalizeName(teacher) && item.month === state.ui.month)
      || { teacher, month: state.ui.month, scores: Object.fromEntries(KPI_DIMENSIONS.map(item => [item.key, 0])), reason: '', published: false };
  }

  function scoreTotal(record) { return KPI_DIMENSIONS.reduce((sum, item) => sum + Number(record?.scores?.[item.key] || 0), 0); }
  function kpiBonus(score) { return score >= 95 ? 2500 : score >= 90 ? 1500 : score >= 85 ? 1000 : 0; }

  function renderPerformance() {
    const record = scoreFor(currentUser.nickname);
    const published = record.published === true;
    const total = published ? scoreTotal(record) : 0;
    const logs = ownLogs().filter(item => item.date.slice(0, 7) === state.ui.month && item.siteType === 'self' && item.lessonStatus !== 'cancelled');
    const reportedNew = logs.reduce((sum, item) => sum + Number(item.newCount || 0), 0);
    const reportedRenewal = logs.reduce((sum, item) => sum + Number(item.renewalCount || 0), 0);
    const approvedLogs = logs.filter(item => item.bonusApproval === 'approved');
    const newCount = approvedLogs.reduce((sum, item) => sum + Number(item.approvedNewCount || 0), 0);
    const renewalCount = approvedLogs.reduce((sum, item) => sum + Number(item.approvedRenewalCount || 0), 0);
    const pendingCount = logs.filter(item => (Number(item.newCount || 0) || Number(item.renewalCount || 0)) && item.bonusApproval !== 'approved').length;
    const totalBonus = (published ? kpiBonus(total) : 0) + (newCount + renewalCount) * 200;
    return `${pageHead('KPI 與獎金', '主管公布後可查看各構面、評分說明與獎金結果。')}
      <section class="hero-summary"><div><span>${state.ui.month} 月度結果</span><strong>${published ? total : '待公布'}${published ? '<small> / 100</small>' : ''}</strong><p>${published ? '主管已公布' : '主管尚未公布本月評分'}</p></div><div class="bonus-total"><span>目前核定獎金</span><strong>${formatMoney(totalBonus)}</strong><small>KPI ${published ? formatMoney(kpiBonus(total)) : '待公布'} ＋ 新生／續報 ${formatMoney((newCount + renewalCount) * 200)}</small></div></section>
      ${published ? `<section class="panel"><div class="panel-head"><div><h2>100 分 KPI 構面</h2><p>主管已依系統證據完成本月評分。</p></div></div><div class="panel-body"><div class="score-list">${KPI_DIMENSIONS.map(item => renderScoreRow(item, record.scores[item.key])).join('')}</div><div class="review-note"><strong>主管評分說明</strong><span>${esc(record.reason || '主管未另外補充說明')}</span></div></div></section>` : '<div class="notice info"><span>' + icon('clock-3', 19) + '</span><div><strong>評分仍在主管審查中</strong><span>公布前不顯示草稿分數、主管意見，也不提前列入獎金。</span></div></div>'}
      <section class="two-column"><article class="panel"><div class="panel-head"><div><h2>獎金明細</h2><p>核准人數／老師申報人數</p></div></div><div class="panel-body money-lines"><div><span>KPI 獎金</span><strong>${published ? formatMoney(kpiBonus(total)) : '待公布'}</strong></div><div><span>新生 ${newCount}／${reportedNew} 人</span><strong>${formatMoney(newCount * 200)}</strong></div><div><span>續報 ${renewalCount}／${reportedRenewal} 人</span><strong>${formatMoney(renewalCount * 200)}</strong></div>${pendingCount ? `<small class="text-danger">尚有 ${pendingCount} 堂新生／續報資料待行政核准，未列入目前金額。</small>` : ''}</div></article>${renderConversation(currentUser.nickname)}</section>`;
  }

  function renderScoreRow(item, value) {
    const number = Number(value || 0);
    const width = item.max ? Math.round(number / item.max * 100) : 0;
    return `<div class="score-row"><div class="score-copy"><strong>${esc(item.label)}</strong><span>${esc(item.description)}</span></div><div class="score-progress"><div><span style="width:${width}%"></span></div><strong>${number} / ${item.max}</strong></div></div>`;
  }

  function renderConversation(teacher) {
    const thread = state.conversations.find(item => normalizeName(item.teacher) === normalizeName(teacher) && item.month === state.ui.month);
    const score = scoreFor(teacher);
    const canReply = !isTeacher() || score.published;
    const visibleThread = canReply ? thread : null;
    return `<article class="panel"><div class="panel-head"><div><h2>主管意見與回覆</h2><p>評分公布後仍可在同一串對話</p></div></div><div class="panel-body"><div class="conversation">${visibleThread?.messages?.length ? visibleThread.messages.map(message => `<div class="message ${message.role === 'teacher' ? 'mine' : ''}"><strong>${esc(message.author)}</strong><p>${esc(message.text)}</p><span>${formatTime(message.at)}</span></div>`).join('') : `<div class="empty-inline">${canReply ? '尚無主管意見' : '評分公布後顯示主管意見'}</div>`}</div>${canReply ? `<form id="reply-form" class="reply-form"><input type="hidden" name="teacher" value="${esc(teacher)}"><label class="sr-only" for="reply-text">回覆內容</label><input id="reply-text" name="text" required placeholder="${isTeacher() ? '回覆主管…' : '寫給老師的具體意見…'}"><button type="submit" class="btn btn-primary">${icon('send', 16)}送出</button></form>` : '<div class="empty-inline">主管公布本月評分後即可回覆</div>'}</div></article>`;
  }

  function monthEndIso(month) {
    const [year, monthNumber] = month.split('-').map(Number);
    return new Date(Date.UTC(year, monthNumber, 0)).toISOString().slice(0, 10);
  }

  function expectedPtSessions(person, month = state.ui.month) {
    if (!person?.schedule?.length) return [];
    const firstDate = `${month}-01`;
    const strictStart = String(state.settings.ptStrictStart || firstDate);
    const start = strictStart > firstDate ? strictStart : firstDate;
    const monthEnd = monthEndIso(month);
    let end = todayIso() < monthEnd ? todayIso() : monthEnd;
    const deletedDate = person.status === 'deleted' ? String(person.deleted_at || '').slice(0, 10) : '';
    if (/^\d{4}-\d{2}-\d{2}$/.test(deletedDate) && deletedDate < end) end = deletedDate;
    if (start > end) return [];
    const slots = [];
    const cursor = new Date(`${start}T12:00:00+08:00`);
    const last = new Date(`${end}T12:00:00+08:00`);
    while (cursor <= last) {
      const date = cursor.toLocaleDateString('sv-SE', { timeZone: 'Asia/Taipei' });
      schedulesForDate(person, date).forEach(schedule => {
        slots.push({ key: `${date}_${schedule.scheduleKey}`, date, schedule, scheduleKey: schedule.scheduleKey });
      });
      cursor.setDate(cursor.getDate() + 1);
    }
    return slots;
  }

  function ptComplianceDetails(person, logs) {
    const expected = expectedPtSessions(person);
    const exceptions = state.settings.ptExceptions || [];
    const usedLogIndexes = new Set();
    const missing = expected.filter(slot => {
      const exempt = exceptions.some(item => normalizeName(item.teacher) === normalizeName(person.nickname) && item.date === slot.date && ['official_cancel', 'system_outage'].includes(item.type));
      if (exempt) return false;
      const exactIndex = logs.findIndex((item, index) => !usedLogIndexes.has(index) && item.date === slot.date && item.status === 'submitted' && logComplete(item) && item.scheduleKey === slot.scheduleKey);
      if (exactIndex >= 0) {
        usedLogIndexes.add(exactIndex);
        return false;
      }
      // 舊資料沒有班次鍵；只可依序抵一個固定班次，避免同一筆紀錄重複抵扣。
      const legacyIndex = logs.findIndex((item, index) => !usedLogIndexes.has(index) && item.date === slot.date && item.status === 'submitted' && logComplete(item) && !item.scheduleKey);
      if (legacyIndex >= 0) {
        usedLogIndexes.add(legacyIndex);
        return false;
      }
      return true;
    });
    const incomplete = logs.filter(item => item.status !== 'submitted' || !logComplete(item));
    return { expected: expected.length, missing, incomplete, eligible: expected.length > 0 && missing.length === 0 && incomplete.length === 0 };
  }

  function ptCompliance(logs, person = currentUser) {
    return ptComplianceDetails(person, logs).eligible;
  }

  function renderPay() {
    const logs = ownLogs().filter(item => item.date.slice(0, 7) === state.ui.month);
    const heldLogs = logs.filter(item => item.lessonStatus !== 'cancelled');
    const cancelledLogs = logs.filter(item => item.lessonStatus === 'cancelled');
    const wage = logs.reduce((sum, item) => sum + Number(item.pay || 0), 0);
    const compliance = ptComplianceDetails(currentUser, logs);
    const eligible = compliance.eligible;
    const renewal = logs.filter(item => item.siteType === 'self').reduce((sum, item) => sum + Number(item.renewalCount || 0), 0);
    const renewalBonus = eligible ? renewal * 200 : 0;
    return `${pageHead('鐘點與續報', 'PT 不做 100 分 KPI；這裡只顯示本堂鐘點與當月履約資格。')}
      <section class="hero-summary compact"><div><span>${state.ui.month} 鐘點預估</span><strong>${formatMoney(wage)}</strong><p>${heldLogs.length} 堂上課${cancelledLogs.length ? ` · ${cancelledLogs.length} 堂停課` : ''}</p></div><div class="bonus-total"><span>續報獎金預估</span><strong>${formatMoney(renewalBonus)}</strong><small>${eligible ? '當月應填課堂均完成' : compliance.missing.length ? `已缺交 ${compliance.missing.length} 堂，當月續報獎金不適用` : '尚未完成當月履約資格'} · 僅限自營教室</small></div></section>
      ${compliance.missing.length ? `<div class="notice strict">${icon('ban', 19)}<div><strong>當月續報獎金資格已取消</strong><span>未當日送出：${compliance.missing.map(item => formatDate(item.date)).join('、')}。過期課堂不開放補寫。</span></div></div>` : ''}
      <section class="panel"><div class="panel-head"><div><h2>本月明細</h2><p>計薪實到＝正式實到＋補課；體驗不計。</p></div></div><div class="panel-body">${logs.length ? logs.map(renderPayRow).join('') : renderEmpty('本月尚無記錄', '送出第一堂後，系統會自動列出鐘點級距。', 'badge-dollar-sign')}</div></section>
      <section class="rule-strip"><div><strong>2–4 人</strong><span>500／小時</span></div><div><strong>5–7 人</strong><span>600／小時</span></div><div><strong>8–10 人</strong><span>800／小時</span></div><div class="partner"><strong>黑豹／善化</strong><span>每堂固定 900，無續報獎金</span></div></section>`;
  }

  function renderPayRow(item) {
    if (item.lessonStatus === 'cancelled') {
      return `<article class="record-row"><div class="record-date"><strong>${formatDate(item.date)}</strong><span>${item.backfilled ? '補登' : '當日'}</span></div><div class="record-main"><div class="record-title">${esc(item.courseName)} ${statusBadge('cancelled')}</div><div class="record-meta">${esc(item.cancellationReason)} · 不列入堂次與鐘點</div></div><div class="record-side"><strong>${formatMoney(0)}</strong><span>停課</span></div></article>`;
    }
    const payable = Number(item.present || 0) + Number(item.makeup || 0);
    const tier = item.siteType === 'partner' ? '善化固定' : payable <= 4 ? '2–4 人' : payable <= 7 ? '5–7 人' : '8–10 人';
    return `<article class="record-row"><div class="record-date"><strong>${formatDate(item.date)}</strong><span>${esc(item.duration)} 小時</span></div><div class="record-main"><div class="record-title">${esc(item.courseName)}</div><div class="record-meta">正式 ${item.present} ＋ 補課 ${item.makeup} ＋ 體驗 ${item.trial} · ${tier}</div></div><div class="record-side"><strong>${formatMoney(item.pay)}</strong><span>${item.siteType === 'partner' ? '合作校固定' : '本堂預估'}</span></div></article>`;
  }

  function renderRecords() {
    const logs = ownLogs().sort((a, b) => String(b.date).localeCompare(String(a.date)));
    return `${pageHead('我的紀錄', '可重新點入每一筆，查看當時教案版本、證據與結算結果。', `<button type="button" class="btn" data-action="export-own">${icon('download', 16)}匯出本月</button>`)}
      <section class="panel"><div class="panel-head"><div><h2>課堂紀錄</h2><p>${logs.length} 筆可查看</p></div></div><div class="panel-body">${logs.length ? logs.map(renderLogRow).join('') : renderEmpty('尚無記錄', '本堂紀錄送出後會保留在這裡。', 'history')}</div></section>`;
  }

  function renderManagerDashboard() {
    const pendingPreps = state.preps.filter(item => item.status === 'pending' && isActiveTalentTeacher(item.teacher)).length;
    const logs = state.logs.filter(item => item.date.slice(0, 7) === state.ui.month);
    const incomplete = logs.filter(item => !logComplete(item)).length;
    const missedPt = talentStaff().filter(person => person.employment === 'pt').reduce((sum, person) => {
      const personLogs = logs.filter(item => normalizeName(item.teacher) === normalizeName(person.nickname));
      return sum + ptComplianceDetails(person, personLogs).missing.length;
    }, 0);
    const missing = incomplete + missedPt;
    return `${pageHead('主管總覽', '先看缺件與待決策，再進入單筆證據。')}
      <section class="status-grid manager"><article class="status-card"><span class="status-icon yellow">${icon('file-clock', 20)}</span><div><small>待審備課</small><strong>${pendingPreps} 份</strong><span>授課前需完成</span></div></article><article class="status-card"><span class="status-icon blue">${icon('notebook-pen', 20)}</span><div><small>本月課堂</small><strong>${logs.length} 堂</strong><span>正職與 PT 分開結算</span></div></article><article class="status-card"><span class="status-icon red">${icon('triangle-alert', 20)}</span><div><small>缺件／資格失效</small><strong>${missing} 堂</strong><span>${missedPt ? `含 PT 未當日送出 ${missedPt} 堂` : '不將不完整資料列入結算'}</span></div></article></section>
      <section class="two-column manager-grid"><article class="panel"><div class="panel-head"><div><h2>待處理</h2><p>依時效排序</p></div></div><div class="panel-body action-list">${pendingPreps ? `<button type="button" data-action="navigate" data-route="prep-review"><span class="action-icon yellow">${icon('file-check-2', 19)}</span><span><strong>${pendingPreps} 份備課等待審查</strong><small>檢查原理、引導、遊戲與教材</small></span>${icon('chevron-right', 18)}</button>` : ''}<button type="button" data-action="navigate" data-route="scoring"><span class="action-icon blue">${icon('gauge', 19)}</span><span><strong>本月 KPI 尚未公布</strong><small>核對系統證據後再確定分數</small></span>${icon('chevron-right', 18)}</button><button type="button" data-action="navigate" data-route="settlement"><span class="action-icon green">${icon('calculator', 19)}</span><span><strong>鐘點與獎金待行政核准</strong><small>老師申報僅為預估，正式金額需核准</small></span>${icon('chevron-right', 18)}</button></div></article><article class="panel"><div class="panel-head"><div><h2>人員概況</h2><p>含待開通人員；未啟用前不列入計薪與漏填</p></div></div><div class="panel-body people-mini">${visibleTalentStaff().filter(person => ['fulltime', 'pt'].includes(person.employment)).map(person => `<div><span class="mini-avatar">${esc(person.nickname.replace('老師', '').slice(0, 2))}</span><span><strong>${esc(person.nickname)}</strong><small>${person.employment === 'pt' ? 'PT' : '正職'} · ${person.schedule?.[0]?.site || person.campus}</small></span>${statusBadge(person.status === 'pending' ? '待開通' : '正常')}</div>`).join('')}</div></article></section>`;
  }

  function renderPrepReview() {
    const preps = state.preps.filter(item => item.status !== 'pending' || isActiveTalentTeacher(item.teacher)).sort((a, b) => (a.status === 'pending' ? -1 : 1));
    return `${pageHead('備課審查', '核准後老師才能在授課紀錄選用該版本。')}
      <section class="card-list">${preps.map(prep => `<article class="prep-card review"><div class="prep-card-head"><span class="course-icon">${icon('notebook-tabs', 21)}</span><div><div class="record-title">${esc(prep.title)} ${statusBadge(prep.status)}</div><div class="record-meta">${esc(prep.teacher)} · ${esc(prep.courseType)} · ${esc(prep.version)}</div></div></div><p>${esc(prep.objective)}</p><div class="card-actions"><button type="button" class="btn" data-action="view-prep" data-id="${prep.id}">${icon('eye', 16)}完整內容</button>${prep.status === 'pending' ? `<button type="button" class="btn btn-primary" data-action="review-prep" data-id="${prep.id}">${icon('file-check-2', 16)}開始審查</button>` : ''}</div></article>`).join('')}</section>`;
  }

  function renderLogReview() {
    const logs = state.logs.slice().sort((a, b) => String(b.date).localeCompare(String(a.date)));
    return `${pageHead('工作紀錄', '先看資料完整度，再查看教案、學習證據與課後調整是否相互對應。')}
      <section class="panel"><div class="panel-head"><div><h2>所有課堂</h2><p>${logs.length} 筆紀錄</p></div></div><div class="panel-body">${logs.length ? logs.map(renderLogRow).join('') : renderEmpty('尚無紀錄', '老師送出後會出現在這裡。', 'scan-search')}</div></section>`;
  }

  function renderScoring() {
    const fulltime = talentStaff().filter(person => person.employment === 'fulltime');
    return `${pageHead('KPI 評分', '僅正職使用 100 分 KPI；PT 不出現在本頁。')}
      <section class="panel"><div class="panel-head"><div><h2>${state.ui.month} 評分</h2><p>主管人工調整需填理由，公布後老師可回覆。</p></div></div><div class="panel-body">${fulltime.map(person => { const record = scoreFor(person.nickname); const total = scoreTotal(record); return `<article class="score-person"><div class="teacher-status"><span class="mini-avatar">${esc(person.nickname.slice(0, 2))}</span><div><strong>${esc(person.nickname)}</strong><span>${record.published ? '已公布' : '草稿'}</span></div></div><div class="score-number"><strong>${total}</strong><span>/ 100 · ${formatMoney(kpiBonus(total))}</span></div><button type="button" class="btn" data-action="edit-score" data-teacher="${esc(person.nickname)}">${icon('pencil', 16)}查看與評分</button></article>`; }).join('')}</div></section>`;
  }

  function settlementRows() {
    return settlementStaff().filter(person => ['fulltime', 'pt'].includes(person.employment)).map(person => {
      const logs = state.logs.filter(log => normalizeName(log.teacher) === normalizeName(person.nickname) && log.date.slice(0, 7) === state.ui.month);
      const heldLogs = logs.filter(log => log.lessonStatus !== 'cancelled');
      const cancelledLogs = logs.filter(log => log.lessonStatus === 'cancelled');
      const wage = heldLogs.reduce((sum, log) => sum + Number(log.pay || 0), 0);
      const hours = heldLogs.reduce((sum, log) => sum + Number(log.duration || 0), 0);
      const selfLogs = heldLogs.filter(log => log.siteType === 'self');
      const reportedNewCount = selfLogs.reduce((sum, log) => sum + Number(log.newCount || 0), 0);
      const reportedRenewal = selfLogs.reduce((sum, log) => sum + Number(log.renewalCount || 0), 0);
      const bonusLogs = selfLogs.filter(log => Number(log.newCount || 0) > 0 || Number(log.renewalCount || 0) > 0);
      const pendingBonusLogs = bonusLogs.filter(log => log.bonusApproval !== 'approved');
      const newCount = bonusLogs.filter(log => log.bonusApproval === 'approved').reduce((sum, log) => sum + Number(log.approvedNewCount || 0), 0);
      const renewal = bonusLogs.filter(log => log.bonusApproval === 'approved').reduce((sum, log) => sum + Number(log.approvedRenewalCount || 0), 0);
      const scoreRecord = person.employment === 'fulltime' ? scoreFor(person.nickname) : null;
      const score = scoreRecord ? scoreTotal(scoreRecord) : 0;
      const scorePublished = Boolean(scoreRecord?.published);
      const kpi = scorePublished ? kpiBonus(score) : 0;
      const compliance = person.employment === 'pt' ? ptComplianceDetails(person, logs) : null;
      const renewalBonus = person.employment === 'fulltime' || compliance?.eligible ? renewal * 200 : 0;
      const newBonus = person.employment === 'fulltime' ? newCount * 200 : 0;
      return { person, logs, heldLogs, cancelledLogs, hours, wage, score, scorePublished, kpi, newCount, renewal, reportedNewCount, reportedRenewal, pendingBonusLogs, newBonus, renewalBonus, compliance, total: wage + kpi + newBonus + renewalBonus };
    });
  }

  function monthControl() {
    return `<label class="month-control"><span>查看月份</span><input type="month" value="${esc(state.ui.month)}" max="${currentMonth()}" data-month-picker></label>`;
  }

  function renderSettlement() {
    const rows = settlementRows();
    if (isPayroll()) return renderPtPayroll(rows.filter(row => row.person.employment === 'pt'));
    return `${pageHead('薪資獎金', '系統顯示預估；行政核對繳費、退費與歸屬後才成為正式發放金額。', `${monthControl()}<button type="button" class="btn" data-action="export-settlement">${icon('download', 16)}匯出月結 CSV</button>`)}
      <section class="panel"><div class="panel-head"><div><h2>${state.ui.month} 核定與待處理明細</h2><p>只將已公布 KPI 與已核准人數列入目前合計；草稿及待核准資料不會提前發放。</p></div></div><div class="table-wrap"><table><thead><tr><th>人員</th><th>職別</th><th>上課／停課</th><th>鐘點</th><th>KPI</th><th>新生</th><th>續報</th><th>目前合計</th><th>明細</th></tr></thead><tbody>${rows.map(row => `<tr><td><strong>${esc(row.person.nickname)}</strong>${row.person.status === 'deleted' ? '<small class="table-sub">離職保留</small>' : row.person.status === 'suspended' ? '<small class="table-sub">帳號停用</small>' : ''}${row.pendingBonusLogs.length ? `<small class="table-sub text-danger">${row.pendingBonusLogs.length} 堂獎金待核准</small>` : ''}${row.person.employment === 'fulltime' && !row.scorePublished ? '<small class="table-sub text-danger">KPI 尚未公布</small>' : ''}</td><td>${row.person.employment === 'pt' ? 'PT' : '正職'}</td><td>${row.heldLogs.length}／${row.cancelledLogs.length}</td><td>${formatMoney(row.wage)}</td><td>${row.person.employment === 'fulltime' ? `${row.score} 分／${row.scorePublished ? formatMoney(row.kpi) : '待公布'}` : '不適用'}</td><td>${row.person.employment === 'fulltime' ? `${row.newCount}/${row.reportedNewCount} 人／${formatMoney(row.newBonus)}` : '不適用'}</td><td>${row.renewal}/${row.reportedRenewal} 人／${formatMoney(row.renewalBonus)}</td><td><strong>${formatMoney(row.total)}</strong></td><td>${row.person.employment === 'pt' ? `<button type="button" class="btn btn-small" data-action="view-pt-statement" data-teacher="${esc(row.person.nickname)}">${icon('printer', 15)}月結單</button>` : '—'}</td></tr>`).join('')}</tbody></table></div></section>`;
  }

  function renderPtPayroll(rows) {
    const totalWage = rows.reduce((sum, row) => sum + row.wage, 0);
    const totalHours = rows.reduce((sum, row) => sum + row.hours, 0);
    const totalRenewal = rows.reduce((sum, row) => sum + row.renewalBonus, 0);
    return `${pageHead('PT 月度鐘點費', '逐堂資料直接由老師送出的紀錄彙整，不需要再次人工輸入。', `${monthControl()}<button type="button" class="btn" data-action="export-pt-detail">${icon('download', 16)}匯出逐堂 CSV</button>`)}
      <section class="hero-summary compact payroll-hero"><div><span>${state.ui.month} PT 鐘點費</span><strong>${formatMoney(totalWage)}</strong><p>${totalHours} 小時 · ${rows.reduce((sum, row) => sum + row.heldLogs.length, 0)} 堂正常上課</p></div><div class="bonus-total"><span>符合資格的續報獎金</span><strong>${formatMoney(totalRenewal)}</strong><small>停課不計鐘點；漏填正常課程會取消當月續報獎金</small></div></section>
      <section class="panel"><div class="panel-head"><div><h2>${state.ui.month} PT 月結</h2><p>點「列印月結單」可直接交給個別老師核對。</p></div></div><div class="table-wrap"><table><thead><tr><th>老師</th><th>正常上課</th><th>停課</th><th>時數</th><th>鐘點費</th><th>漏填</th><th>續報資格</th><th>續報核准／申報</th><th>續報獎金</th><th>個人月結單</th></tr></thead><tbody>${rows.map(row => `<tr><td><strong>${esc(row.person.nickname)}</strong>${row.person.status === 'deleted' ? '<small class="table-sub">離職保留</small>' : row.person.status === 'suspended' ? '<small class="table-sub">帳號停用</small>' : ''}<small class="table-sub">${esc(row.person.schedule?.map(item => `${item.label} ${item.time}`).join('、') || '')}</small></td><td>${row.heldLogs.length} 堂</td><td>${row.cancelledLogs.length} 堂</td><td>${row.hours} 小時</td><td><strong>${formatMoney(row.wage)}</strong></td><td class="${row.compliance?.missing.length ? 'text-danger' : ''}">${row.compliance?.missing.length || 0} 堂</td><td>${row.compliance?.eligible ? statusBadge('complete') : row.compliance?.missing.length ? statusBadge('資格取消') : statusBadge('待完成')}</td><td class="${row.pendingBonusLogs.length ? 'text-danger' : ''}">${row.renewal}／${row.reportedRenewal} 人</td><td>${formatMoney(row.renewalBonus)}</td><td><button type="button" class="btn btn-small" data-action="view-pt-statement" data-teacher="${esc(row.person.nickname)}">${icon('printer', 15)}列印月結單</button></td></tr>`).join('')}</tbody></table></div></section>`;
  }

  function renderBonusApproval() {
    const logs = state.logs.filter(item => item.date?.slice(0, 7) === state.ui.month && item.siteType === 'self' && item.lessonStatus !== 'cancelled' && (Number(item.newCount || 0) > 0 || Number(item.renewalCount || 0) > 0));
    const canApprove = currentUser.role === 'admin';
    return `${pageHead('新生與續報核准', '老師填寫的是申報數；管理員核對點名與繳費後才列入正式獎金。', monthControl())}
      ${!canApprove ? `<div class="notice info">${icon('eye', 19)}<div><strong>目前是檢視權限</strong><span>小魚可查看進度；正式核准由柏翰管理員完成。</span></div></div>` : ''}
      <section class="panel"><div class="panel-head"><div><h2>${state.ui.month} 申報紀錄</h2><p>${logs.filter(item => item.bonusApproval !== 'approved').length} 筆待核准</p></div></div><div class="table-wrap"><table><thead><tr><th>日期</th><th>老師</th><th>課程</th><th>新生申報</th><th>續報申報</th><th>狀態</th><th></th></tr></thead><tbody>${logs.length ? logs.map(item => `<tr><td>${formatDate(item.date)}</td><td><strong>${esc(item.teacher)}</strong></td><td>${esc(item.courseName)}</td><td>${Number(item.newCount || 0)} 人</td><td>${Number(item.renewalCount || 0)} 人</td><td>${item.bonusApproval === 'approved' ? statusBadge('approved') : statusBadge('pending')}</td><td>${canApprove ? `<button type="button" class="btn btn-small ${item.bonusApproval === 'approved' ? '' : 'btn-primary'}" data-action="open-bonus-approval" data-id="${esc(item.id)}">${icon(item.bonusApproval === 'approved' ? 'eye' : 'badge-check', 15)}${item.bonusApproval === 'approved' ? '查看／調整' : '核准'}</button>` : '—'}</td></tr>`).join('') : '<tr><td colspan="7">本月沒有新生或續報申報</td></tr>'}</tbody></table></div></section>`;
  }

  function openBonusApproval(item) {
    if (!item) return;
    openDialog({
      title: `核准：${item.teacher} ${formatDate(item.date)}`,
      body: `<form id="bonus-approval-form"><input type="hidden" name="lessonId" value="${esc(item.id)}"><div class="notice info">${icon('clipboard-check', 18)}<div><strong>${esc(item.courseName)}</strong><span>請以點名簿圈記與實際繳費／續報資料為準。</span></div></div><div class="form-grid"><label class="form-field"><span>核准新生人數 <b>*</b></span><input type="number" min="0" max="${Number(item.newCount || 0)}" name="approvedNewCount" value="${Number(item.approvedNewCount ?? item.newCount ?? 0)}" required><small>老師申報 ${Number(item.newCount || 0)} 人</small></label><label class="form-field"><span>核准續報人數 <b>*</b></span><input type="number" min="0" max="${Number(item.renewalCount || 0)}" name="approvedRenewalCount" value="${Number(item.approvedRenewalCount ?? item.renewalCount ?? 0)}" required><small>老師申報 ${Number(item.renewalCount || 0)} 人</small></label><label class="form-field span-all"><span>調整原因</span><textarea name="note" placeholder="核准數與申報數不同時必填。">${esc(item.bonusApprovalNote || '')}</textarea></label></div></form>`,
      footer: `<button type="button" class="btn" data-action="close-dialog">取消</button><button type="submit" form="bonus-approval-form" class="btn btn-primary">${icon('badge-check', 16)}確認核准</button>`,
    });
  }

  function renderPeople() {
    const people = visibleTalentStaff().filter(person => ['fulltime', 'pt'].includes(person.employment));
    return `${pageHead('人員與排班', '排班與工作身分有生效日，新設定不會回頭改算已結算月份。')}
      <section class="people-grid">${people.map(person => `<article class="person-card ${person.status === 'pending' ? 'is-pending' : ''}"><div class="person-head"><span class="large-avatar">${esc(person.nickname.replace('老師', '').slice(0, 2))}</span><div><h2>${esc(person.nickname)}</h2><p>${person.employment === 'pt' ? '才藝 PT' : '才藝正職'}${person.status === 'pending' ? ' · 待開通' : ''}</p></div>${person.status === 'pending' ? '<span class="badge yellow">尚未綁定登入</span>' : ''}</div><div class="person-rules">${person.restDays?.length ? `<div><span>固定休假</span><strong>${person.restDays.join('、')}</strong></div>` : (person.schedule || []).map(item => `<div><span>${esc(item.label)}</span><strong>${esc(item.time)}</strong><small>${esc(item.site)}</small></div>`).join('')}${normalizeName(person.nickname) === normalizeName('黑豹老師') ? '<div class="special-rule"><span>善化合作校</span><strong>每堂 900，無續報獎金</strong></div>' : ''}</div><div class="assignment-tags">${(person.work_assignments || []).map(id => `<span>${id === 'anqin-teacher' ? '安親老師' : id === 'talent-pt' ? '才藝 PT' : id === 'talent-fulltime' ? '才藝正職' : esc(id)}</span>`).join('')}</div></article>`).join('')}</section>`;
  }

  async function loadCloudFolders(notify = false) {
    if (PREVIEW_MODE) {
      cloudRuntime.foldersStatus = 'preview';
      cloudRuntime.foldersMessage = '正式登入後會依權限列出老師資料夾';
      renderApp();
      return { ok: true, folders: [] };
    }
    cloudRuntime.foldersStatus = 'loading';
    cloudRuntime.foldersMessage = '正在讀取才藝日報資料夾';
    renderApp();
    let timeoutId = 0;
    const timeoutResult = new Promise(resolve => {
      timeoutId = window.setTimeout(() => resolve({ ok: false, error: '雲端資料夾讀取逾時，請重新整理' }), 20000);
    });
    const result = await Promise.race([
      window.API?.listTeacherReportFolders?.({ scope: 'talent' }) || Promise.resolve({ ok: false, error: '雲端服務尚未載入' }),
      timeoutResult,
    ]);
    window.clearTimeout(timeoutId);
    if (!result?.ok) {
      cloudRuntime.foldersStatus = 'error';
      cloudRuntime.foldersMessage = result?.error || '雲端資料夾讀取失敗';
    } else {
      cloudRuntime.foldersStatus = 'ready';
      cloudRuntime.folders = Array.isArray(result.folders) ? result.folders : [];
      cloudRuntime.foldersMessage = cloudRuntime.folders.length ? `已讀取 ${cloudRuntime.folders.length} 位老師` : '尚無老師資料夾';
    }
    renderApp();
    if (notify) toast(cloudRuntime.foldersMessage, result?.ok ? 'success' : 'danger');
    return result;
  }

  function renderCloudReports() {
    const status = cloudRuntime.foldersStatus;
    let body = '';
    if (status === 'idle' || status === 'loading') {
      body = renderEmpty('正在讀取雲端日報', '只會顯示這個帳號可查看的才藝老師資料夾。', 'loader-circle');
    } else if (status === 'error') {
      body = `<div class="notice strict">${icon('cloud-alert', 19)}<div><strong>讀取失敗</strong><span>${esc(cloudRuntime.foldersMessage)}</span></div></div>`;
    } else if (status === 'preview') {
      body = renderEmpty('審查版不開啟正式雲端', '使用主管正式帳號登入後，會看到老師資料夾與日報。', 'folder-lock');
    } else if (!cloudRuntime.folders.length) {
      body = renderEmpty('目前沒有日報資料夾', '老師送出第一筆正式才藝日報後會自動歸檔。', 'folder-search');
    } else {
      body = `<div class="cloud-folder-list">${cloudRuntime.folders.map(folder => {
        const content = `<span class="course-icon">${icon(folder.url ? 'folder-open' : 'folder-clock', 21)}</span><span><strong>${esc(folder.nickname)}${folder.status === 'deleted' ? ' · 離職保留' : folder.status === 'suspended' ? ' · 帳號停用' : ''}</strong><small>${esc(folder.department)} · ${folder.reportCount ? `${folder.reportCount} 份日報${folder.latestDate ? ` · 最近 ${formatDate(folder.latestDate)}` : ''}` : '尚未產生正式日報'}${folder.opensTeacherFolder ? ' · 開啟老師資料夾' : ''}</small></span><span class="badge ${folder.reportCount ? 'green' : 'gray'}">${folder.reportCount || 0} 份</span>${folder.url ? icon('external-link', 17) : ''}`;
        return folder.url
          ? `<a class="cloud-folder-row" href="${esc(folder.url)}" target="_blank" rel="noopener noreferrer">${content}</a>`
          : `<div class="cloud-folder-row is-disabled" aria-disabled="true">${content}</div>`;
      }).join('')}</div>`;
    }
    return `${pageHead('雲端日報', '依老師與月份整理的正式日報資料夾。', `<button type="button" class="btn" data-action="refresh-cloud-folders">${icon('refresh-cw', 16)}重新整理</button>`)}<div class="notice info">${icon('shield-check', 19)}<div><strong>依登入權限顯示</strong><span>才藝主管查看才藝老師；小魚與管理員依全域權限查看。開啟 Drive 時請使用系統綁定的 Google 帳號。</span></div></div><section class="panel"><div class="panel-body">${body}</div></section>`;
  }

  function renderGuide() {
    if (isPayroll()) {
      return `${pageHead('PT 月結制度規則', '本頁只保留月結所需的計薪口徑、停課與續報資格。')}
        <section class="guide-grid"><article class="guide-card"><span>${icon('calculator', 22)}</span><div><h2>鐘點計算</h2><ul><li>計薪人數＝正式實到＋補課；體驗不計。</li><li>2–4 人 500／小時；5–7 人 600／小時；8–10 人 800／小時。</li><li>黑豹善化合作校固定 600／小時，每堂 1.5 小時為 900 元。</li></ul></div></article><article class="guide-card"><span>${icon('calendar-x-2', 22)}</span><div><h2>停課與漏填</h2><ul><li>正常上課只能當日送出，不能事後補寫。</li><li>停課可補登過去排課日，需保留原因與補登標記。</li><li>停課不計鐘點；正常課程漏填會取消整月續報獎金。</li></ul></div></article><article class="guide-card"><span>${icon('printer', 22)}</span><div><h2>月結輸出</h2><ul><li>按月份彙整所有 PT 的堂次、時數與金額。</li><li>個人月結單列出每一堂計算來源，可直接列印交老師核對。</li><li>逐堂 CSV 可供薪資歸檔，不需要再次人工輸入。</li><li>正職 KPI 須公布、新生與續報人數須核准後，才列入目前核定合計。</li></ul></div></article><article class="guide-card"><span>${icon('folder-open', 22)}</span><div><h2>雲端日報</h2><ul><li>依老師與月份自動整理正式 PDF，不需人工搬檔。</li><li>需以系統綁定的 Google 帳號開啟 Drive。</li><li>主管只會看到自己獲授權的老師資料夾；小魚與管理員可依全域權限查看。</li></ul></div></article></section>`;
    }
    return `${pageHead(isPt() ? 'PT 使用與規則' : modeRole() === 'fulltime' ? '正職使用與規則' : '才藝部制度規則', '將說明集中在這裡，正式填寫頁面只保留當下需要的提示。')}
      <section class="guide-grid">
        <article class="guide-card"><span>${icon('route', 22)}</span><div><h2>一次填寫流程</h2><ol><li>課前建立備課教案並送審。</li><li>上課當天選擇固定班次與已核准版本。</li><li>上傳點名、學習證據與教室復原照片。</li><li>輸入會自動暫存；正式送出後沿用同一份日誌與素材發布 APP。</li></ol></div></article>
        <article class="guide-card"><span>${icon('images', 22)}</span><div><h2>證據怎麼拍</h2><ul><li>點名簿要看得出日期、課程與圈記。</li><li>過程證據要看得出操作、討論或引導。</li><li>成果證據要能對應本堂目標，不以張數加分。</li><li>可一次多選照片與影片。</li></ul></div></article>
        ${isPt() || ['manager', 'payroll'].includes(modeRole()) ? `<article class="guide-card"><span>${icon('badge-dollar-sign', 22)}</span><div><h2>PT 鐘點規則</h2><ul><li>2–4 人 500／小時；5–7 人 600／小時；8–10 人 800／小時。</li><li>體驗不計級距，補課計入。</li><li>正常上課若任一堂未於當日送出，當月續報獎金資格取消且不能補寫。</li><li>停課可補選過去排課日；需填原因，不計鐘點，也不算漏填。</li><li>黑豹善化合作校每堂固定 900，無續報獎金。</li><li>PT 沒有新生獎金；自營教室續報獎金須通過當月履約。</li></ul></div></article>` : ''}
        ${['fulltime', 'manager'].includes(modeRole()) ? `<article class="guide-card"><span>${icon('gauge', 22)}</span><div><h2>正職 KPI 獎金</h2><ul><li>80–84 分：符合職務標準，不另發。</li><li>85–89 分：1,000 元。</li><li>90–94 分：1,500 元。</li><li>95–100 分：2,500 元。</li></ul></div></article>` : ''}
        ${modeRole() === 'manager' ? `<article class="guide-card"><span>${icon('folder-open', 22)}</span><div><h2>雲端日報</h2><ul><li>正式送出後依老師與月份自動產生 PDF。</li><li>請用系統綁定的 Google 帳號開啟 Drive。</li><li>柳丁查看才藝老師；小魚與管理員依全域權限查看。</li></ul></div></article>` : ''}
      </section>`;
  }

  function renderEmpty(title, text, iconName, action = '') {
    return `<div class="empty-state"><span>${icon(iconName, 28)}</span><h3>${esc(title)}</h3><p>${esc(text)}</p>${action}</div>`;
  }

  function statusBadge(status) {
    const map = {
      approved: ['已核准', 'green'], pending: ['待審', 'yellow'], returned: ['退回修改', 'red'], draft: ['草稿', 'gray'], submitted: ['已送出', 'green'], cancelled: ['已停課', 'gray'], published: ['已發布', 'green'], '正常': ['正常', 'green'], '待開通': ['待開通', 'yellow'], complete: ['完整', 'green'], '資格取消': ['資格取消', 'red'], '待完成': ['待完成', 'yellow']
    };
    const item = map[status] || [status, 'gray'];
    return `<span class="badge ${item[1]}">${esc(item[0])}</span>`;
  }

  function openDrawer({ title, subtitle = '', body, footer = '' }) {
    $('#drawer-root').innerHTML = `<div class="drawer-backdrop" data-action="close-drawer"></div><section class="drawer" role="dialog" aria-modal="true" aria-label="${esc(title)}"><header class="drawer-head"><div><h2>${esc(title)}</h2>${subtitle ? `<p>${esc(subtitle)}</p>` : ''}</div><button type="button" class="icon-button" data-action="close-drawer" aria-label="關閉">${icon('x', 21)}</button></header><div class="drawer-body">${body}</div>${footer ? `<footer class="drawer-foot">${footer}</footer>` : ''}</section>`;
    hydrateIcons();
  }

  function closeDrawer() { $('#drawer-root').innerHTML = ''; }

  function openDialog({ title, body, footer = '' }) {
    $('#dialog-root').innerHTML = `<div class="dialog-backdrop" data-dialog-backdrop><section class="dialog" role="dialog" aria-modal="true" aria-label="${esc(title)}"><header><h2>${esc(title)}</h2><button type="button" class="icon-button" data-action="close-dialog" aria-label="關閉">${icon('x', 20)}</button></header><div class="dialog-body">${body}</div>${footer ? `<footer>${footer}</footer>` : ''}</section></div>`;
    hydrateIcons();
  }

  function closeDialog() { $('#dialog-root').innerHTML = ''; }

  function formValue(name, fallback = '') {
    return activeLogSource?.[name] ?? fallback;
  }

  function approvedPreps() {
    return state.preps.filter(prep => prep.status === 'approved' && (normalizeName(prep.teacher) === normalizeName(currentUser.nickname) || prep.teacher === '共用'));
  }

  function openLogEditor(existing = null) {
    const draft = existing || state.draftLog || {};
    const editing = Boolean(existing || (draft.id && state.logs.some(item => item.id === draft.id)));
    activeLogSource = draft;
    const availableSchedules = schedulesForDate(currentUser, draft.date || todayIso());
    const schedule = availableSchedules.find(item => item.scheduleKey === draft.scheduleKey)
      || availableSchedules[0]
      || userScheduleEntries(currentUser)[0]
      || { scheduleKey: '', time: '19:00–20:30', siteType: 'self', site: '布拉克自營教室' };
    pendingFiles = {
      attendance: draft.attendanceFiles || [], learning: draft.learningFiles || [], room: draft.roomFiles || [], prep: []
    };
    const prepOptions = approvedPreps();
    openDrawer({
      title: editing ? '補充本堂紀錄' : state.draftLog ? '繼續本堂紀錄' : '新增本堂紀錄',
      subtitle: editing ? '今日內更新同一筆，不會重複計薪。' : '同一頁完成一堂課，系統會自動草稿保留。',
      body: `<form id="log-form" novalidate><input type="hidden" name="id" value="${esc(draft.id || '')}"><input type="hidden" name="updatedAt" value="${esc(draft.updatedAt || '')}">
        <div class="draft-sync-status" data-draft-sync-status>${icon('circle-check', 16)}<span>輸入內容會自動暫存</span></div>
        ${editing ? `<div class="notice info inline-rule">${icon('pencil', 18)}<div><strong>正在補充今天已送出的紀錄</strong><span>儲存後更新原日報；日期、班次與上課狀態不可更換。</span></div></div>` : ''}
        ${isPt() ? `<div class="notice strict inline-rule">${icon('lock', 18)}<div><strong>正常課程必須在今日送出</strong><span>只有停課可補選過去排課日，並會留下補登標記。</span></div></div>` : ''}
        ${isPt() ? `<section class="form-section status-section"><div class="section-title"><span class="section-number">1</span><div><h3>本堂狀態</h3><p>先確認今天有上課，或是要登記停課。</p></div></div>
          <fieldset class="lesson-status-segment"><legend>上課狀態 <b>*</b></legend><label><input type="radio" name="lessonStatus" value="held" ${formValue('lessonStatus', 'held') !== 'cancelled' ? 'checked' : ''}><span>${icon('circle-play', 18)}正常上課</span></label><label><input type="radio" name="lessonStatus" value="cancelled" ${formValue('lessonStatus') === 'cancelled' ? 'checked' : ''}><span>${icon('calendar-x-2', 18)}停課</span></label></fieldset>
          <div class="form-grid"><label class="form-field"><span>課程日期 <b>*</b></span><input type="date" name="date" value="${esc(formValue('date', todayIso()))}" max="${todayIso()}" required><small data-date-hint>正常上課固定為今天</small></label><label class="form-field"><span>本堂排課 <b>*</b></span><select name="scheduleKey" data-schedule-select data-initial-value="${esc(formValue('scheduleKey', schedule.scheduleKey))}" required></select><small>同一天有多堂課時，請選這一堂的時間與地點。</small></label></div>
          <div data-cancelled-only hidden><div class="form-grid">${field('停課課程名稱', 'cancelledCourseName', 'text', formValue('cancelledCourseName'), true, '例：週三 WeDo 機器人')}${selectField('停課原因', 'cancellationReason', ['招生人數不足', '學員請假／無人到課', '中心或合作校通知', '天候／停班停課', '其他'], formValue('cancellationReason', '學員請假／無人到課'), true)}</div><label class="form-field span-all"><span>補充說明</span><textarea name="cancellationNote" placeholder="可補充通知來源或後續安排。">${esc(formValue('cancellationNote'))}</textarea></label><div class="notice info compact-notice">${icon('info', 18)}<div><strong>停課補登會保留標記</strong><span>本堂不計鐘點，也不算漏填；主管月結仍看得到補登日期與原因。</span></div></div></div>
        </section>` : ''}
        <div data-held-only>
        <section class="form-section"><div class="section-title"><span class="section-number">${isPt() ? '2' : '1'}</span><div><h3>課程與點名</h3><p>${isPt() ? '場域與地點依固定排班帶入。' : '請確認今天的課程、地點與點名人數。'}</p></div></div><div class="form-grid three">
          ${isPt() ? '' : `<label class="form-field"><span>授課日期 <b>*</b></span><input type="date" name="date" value="${esc(formValue('date', todayIso()))}" max="${todayIso()}" readonly required><small>正常課程固定為今天</small></label>`}
          ${selectField('課程類型', 'courseType', COURSE_TYPES, formValue('courseType', COURSE_TYPES[1]), true)}
          ${field('課程名稱', 'courseName', 'text', formValue('courseName'), true, '例：齒輪轉速實驗')}
          ${isPt() ? `<label class="form-field"><span>上課場域 <b>*</b></span><input data-schedule-site-type-display value="${schedule.siteType === 'partner' ? '合作校／外派' : '布拉克自營教室'}" readonly><input type="hidden" name="siteType" value="${esc(schedule.siteType || 'self')}"><small>依所選固定班次帶入</small></label>` : selectField('上課場域', 'siteType', ['self|布拉克自營教室', 'partner|合作校／外派'], formValue('siteType', schedule.siteType), true, true)}
          ${isPt() ? `<label class="form-field"><span>上課地點 <b>*</b></span><input name="site" data-schedule-site-display value="${esc(schedule.site || '')}" readonly required><small>如排班有異動，請先由管理員更新</small></label>` : field('上課地點', 'site', 'text', formValue('site', schedule.site), true)}
          ${selectField('授課時數', 'duration', ['1|1 小時', '1.5|1.5 小時'], String(formValue('duration', '1.5')), true, true)}
        </div><div class="count-grid">
          ${numberField('應到正式', 'expected', formValue('expected', 0), true)}${numberField('正式實到', 'present', formValue('present', 0), true)}${numberField('請假', 'leave', formValue('leave', 0), true)}${numberField('未請假缺席', 'absent', formValue('absent', 0), true)}${numberField('補課實到', 'makeup', formValue('makeup', 0), true)}${numberField('體驗人數', 'trial', formValue('trial', 0), true)}
        </div>${uploadField('點名簿照片', 'attendance', '要看得出日期、課程與圈記；可一次多選。', 'image/*', true)}</section>
        <section class="form-section"><div class="section-title"><span class="section-number">${isPt() ? '3' : '2'}</span><div><h3>本堂教案與教學日誌</h3><p>只選用已核准的備課版本，不再重填完整教案。</p></div></div>
          <label class="form-field span-all"><span>本堂採用的備課教案 <b>*</b></span><select name="prepId" required><option value="">請選擇已核准版本</option>${prepOptions.map(prep => `<option value="${prep.id}" ${formValue('prepId') === prep.id ? 'selected' : ''}>${esc(prep.courseName)} · ${esc(prep.title)} · ${esc(prep.version)}</option>`).join('')}</select>${prepOptions.length ? '' : '<small class="field-error">目前沒有可用的已核准教案，請先到「備課教案」建檔送審。</small>'}</label>
          <div class="form-grid">${textareaField('本堂實際完成內容', 'completed', formValue('completed'), true, '寫完成的任務、作品或理解結果。')}${textareaField('孩子反應／學習證據', 'response', formValue('response'), true, '寫可觀察的行為、作品差異或學生原句。')}${textareaField('課程問題與下次優化', 'issue', formValue('issue'), true, '寫本堂遇到的問題，以及下次要改的講法、活動或材料。')}</div>
          ${uploadField('學習過程與成果', 'learning', '照片、影片可一次多選；須能對應本堂目標。', 'image/*,video/*', true)}
        </section>
        <section class="form-section"><div class="section-title"><span class="section-number">${isPt() ? '4' : '3'}</span><div><h3>溝通、復原與獎金事件</h3><p>新生與續報只在自營教室顯示，沿用同一張點名照片。</p></div></div>
          <div class="form-grid">${selectField('親師溝通狀態', 'parentStatus', ['complete|全班回報完成', 'followup|有個別追蹤', 'pending|尚未完成'], formValue('parentStatus', 'complete'), true, true)}<label class="check-card"><input type="checkbox" name="roomDone" ${formValue('roomDone', false) ? 'checked' : ''} required><span>${icon('sparkles', 20)}<strong>教室與器材已復原 <b>*</b></strong><small>課後完成後勾選</small></span></label></div>
          <label class="form-field span-all followup-field" ${formValue('parentStatus', 'complete') === 'followup' ? '' : 'hidden'}><span>個別追蹤與下一步 <b>*</b></span><textarea name="parentFollowup" placeholder="只記錄需要繼續處理的具體狀況。">${esc(formValue('parentFollowup'))}</textarea></label>
          ${uploadField('課後教室復原照片', 'room', '不需要另寫照片判讀說明。', 'image/*', true)}
          <div class="bonus-fields"><div class="form-grid">${isPt() ? '' : numberField('新生確定報名', 'newCount', formValue('newCount', 0), false, '藍筆圈選「新」')}${numberField('續報確定', 'renewalCount', formValue('renewalCount', 0), false, '紅筆圈選「續」')}</div></div>
          ${isPt() ? '<div id="pay-preview" class="calculation-card"></div>' : ''}
        </section></div>
      </form>`,
      footer: `<button type="button" class="btn" data-action="close-drawer">關閉</button><button type="button" class="btn" data-action="save-log-draft">${icon('save', 16)}儲存草稿</button><button type="button" data-action="submit-log" class="btn btn-primary">${icon(editing ? 'save' : 'send', 16)}${editing ? '更新紀錄' : '送出紀錄'}</button>`,
    });
    updateLogFormLogic();
  }

  function field(label, name, type, value, required = false, placeholder = '') {
    return `<label class="form-field"><span>${esc(label)} ${required ? '<b>*</b>' : ''}</span><input type="${type}" name="${name}" value="${esc(value)}" ${required ? 'required' : ''} placeholder="${esc(placeholder)}"></label>`;
  }

  function numberField(label, name, value, required = false, hint = '') {
    return `<label class="form-field count-field"><span>${esc(label)} ${required ? '<b>*</b>' : ''}</span><input type="number" min="0" step="1" name="${name}" value="${esc(value)}" ${required ? 'required' : ''}>${hint ? `<small>${esc(hint)}</small>` : ''}</label>`;
  }

  function selectField(label, name, options, value, required = false, encoded = false) {
    return `<label class="form-field"><span>${esc(label)} ${required ? '<b>*</b>' : ''}</span><select name="${name}" ${required ? 'required' : ''}>${options.map(option => { const parts = encoded ? option.split('|') : [option, option]; return `<option value="${esc(parts[0])}" ${String(value) === parts[0] ? 'selected' : ''}>${esc(parts[1])}</option>`; }).join('')}</select></label>`;
  }

  function textareaField(label, name, value, required, placeholder) {
    return `<label class="form-field"><span>${esc(label)} ${required ? '<b>*</b>' : ''}</span><textarea name="${name}" minlength="8" ${required ? 'required' : ''} placeholder="${esc(placeholder)}">${esc(value)}</textarea></label>`;
  }

  function uploadField(label, category, hint, accept, required) {
    const existing = pendingFiles[category] || [];
    const names = existing.map(item => attachmentName(item));
    return `<div class="upload-control"><label class="upload-row"><span class="upload-icon">${icon(category === 'attendance' ? 'clipboard-list' : category === 'room' ? 'sparkles' : 'images', 21)}</span><span class="upload-copy"><strong>${esc(label)} ${required ? '<b>*</b>' : ''}</strong><small>${esc(hint)}</small><span class="file-summary" data-file-summary="${category}">${existing.length ? `已上傳 ${existing.length} 個檔案：${esc(names.join('、'))}` : '尚未選擇檔案'}</span></span><span class="btn btn-small">${icon('upload', 15)}選擇檔案</span><input type="file" data-upload-category="${category}" accept="${accept}" multiple></label><div class="selected-file-list" data-file-items="${category}">${selectedFileItems(category)}</div></div>`;
  }

  function selectedFileItems(category) {
    return (pendingFiles[category] || []).map((item, index) => `<span class="selected-file"><span>${icon('paperclip', 13)}${esc(attachmentName(item))}</span><button type="button" data-action="remove-upload" data-category="${esc(category)}" data-index="${index}" aria-label="移除 ${esc(attachmentName(item))}" title="移除附件">${icon('x', 13)}</button></span>`).join('');
  }

  function refreshUploadControl(category) {
    const files = pendingFiles[category] || [];
    const summary = document.querySelector(`[data-file-summary="${category}"]`);
    const list = document.querySelector(`[data-file-items="${category}"]`);
    if (summary) summary.textContent = files.length ? `已上傳 ${files.length} 個檔案：${attachmentText(files)}` : '尚未選擇檔案';
    if (list) list.innerHTML = selectedFileItems(category);
    hydrateIcons();
  }

  function attachmentName(item) {
    return String(typeof item === 'string' ? item : item?.fileName || item?.name || '附件');
  }

  function attachmentText(items) {
    return (items || []).map(attachmentName).join('、');
  }

  function captureLogDraft(syncCloud = true) {
    if (TEST_VIEW_MODE) return;
    const form = $('#log-form');
    if (!form) return;
    const data = new FormData(form);
    state.draftLog = {
      ...Object.fromEntries(data.entries()),
      roomDone: Boolean(form.elements.roomDone?.checked),
      attendanceFiles: pendingFiles.attendance,
      learningFiles: pendingFiles.learning,
      roomFiles: pendingFiles.room,
    };
    persist('草稿已保留');
    const status = $('[data-draft-sync-status]');
    if (status) status.innerHTML = `${icon('save', 16)}<span>本機已暫存，等待雲端同步</span>`;
    hydrateIcons();
    if (!syncCloud || PREVIEW_MODE) return;
    window.clearTimeout(cloudDraftTimer);
    cloudDraftTimer = window.setTimeout(queueCloudDraftSave, 1200);
  }

  function queueCloudDraftSave() {
    if (PREVIEW_MODE || TEST_VIEW_MODE || !state.draftLog) return;
    const snapshot = JSON.parse(JSON.stringify(state.draftLog));
    cloudDraftChain = cloudDraftChain.then(async () => {
      if (!state.draftLog) return;
      const status = $('[data-draft-sync-status]');
      if (status) status.innerHTML = `${icon('cloud-upload', 16)}<span>正在同步雲端草稿…</span>`;
      hydrateIcons();
      const result = await API.saveTalentDraft(currentUser.nickname, snapshot);
      const currentStatus = $('[data-draft-sync-status]');
      if (!currentStatus) return;
      currentStatus.innerHTML = result?.ok
        ? `${icon('circle-check', 16)}<span>雲端草稿已同步 ${formatTime(new Date().toISOString())}</span>`
        : `${icon('cloud-alert', 16)}<span>雲端暫存失敗，本機內容仍保留</span>`;
      hydrateIcons();
    }).catch(() => {
      const status = $('[data-draft-sync-status]');
      if (status) status.innerHTML = `${icon('cloud-alert', 16)}<span>雲端暫存失敗，本機內容仍保留</span>`;
      hydrateIcons();
    });
  }

  function fileAsBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || '').split(',')[1] || '');
      reader.onerror = () => reject(new Error(`無法讀取 ${file.name}`));
      reader.readAsDataURL(file);
    });
  }

  function isImageFile(file) {
    return String(file?.type || '').startsWith('image/') || /\.(?:jpe?g|png|webp|gif|heic|heif)$/i.test(String(file?.name || ''));
  }

  async function compressImage(file) {
    if (!isImageFile(file) || file.size <= 2.2 * 1024 * 1024) return file;
    const url = URL.createObjectURL(file);
    try {
      const image = new Image();
      await new Promise((resolve, reject) => {
        image.onload = resolve;
        image.onerror = () => reject(new Error(`${file.name} 無法轉換，請改用 JPG 或 PNG`));
        image.src = url;
      });
      const maxSide = 1600;
      const scale = Math.min(1, maxSide / Math.max(image.naturalWidth || 1, image.naturalHeight || 1));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
      canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.82));
      if (!blob) throw new Error(`${file.name} 壓縮失敗`);
      return new File([blob], file.name.replace(/\.[^.]+$/, '') + '.jpg', { type: 'image/jpeg' });
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  async function uploadTalentFile(file, category) {
    if (TEST_VIEW_MODE) throw new Error('測試視角為唯讀，不能上傳正式附件');
    if (PREVIEW_MODE) {
      return { id: uid('preview_file'), fileName: file.name, mimeType: file.type || '', url: '', category };
    }
    let source = file;
    const isImage = isImageFile(file);
    if (isImage) source = await compressImage(file);
    if (!isImage && source.size > 15 * 1024 * 1024) throw new Error(`${file.name} 超過 15 MB，請縮小後再上傳`);
    const base64 = await fileAsBase64(source);
    const result = isImage
      ? await API.uploadPhoto({ nickname: currentUser.nickname, date: todayIso(), kpi: `talent-${category}`, mimeType: source.type || 'image/jpeg', base64, description: category })
      : await API.uploadFile({ nickname: currentUser.nickname, date: todayIso(), category: `talent-${category}`, fileName: file.name, mimeType: source.type || 'application/octet-stream', base64 });
    if (!result?.ok) throw new Error(result?.error || `${file.name} 上傳失敗`);
    return {
      id: result.fileId || uid('file'),
      fileId: result.fileId || '',
      fileName: result.fileName || file.name,
      mimeType: source.type || file.type || '',
      url: result.url || '',
      category,
    };
  }

  async function handleTalentFiles(input) {
    const category = input.dataset.uploadCategory;
    const files = Array.from(input.files || []);
    if (!files.length) return;
    const summary = document.querySelector(`[data-file-summary="${category}"]`);
    input.disabled = true;
    if (summary) summary.textContent = `正在上傳 0 / ${files.length}`;
    const uploaded = [];
    try {
      for (let index = 0; index < files.length; index += 1) {
        if (summary) summary.textContent = `正在上傳 ${index + 1} / ${files.length}：${files[index].name}`;
        uploaded.push(await uploadTalentFile(files[index], category));
      }
      pendingFiles[category] = [...(pendingFiles[category] || []), ...uploaded];
      refreshUploadControl(category);
      if (input.closest('#log-form')) captureLogDraft();
      toast(`${files.length} 個檔案已上傳`);
    } catch (error) {
      if (uploaded.length) pendingFiles[category] = [...(pendingFiles[category] || []), ...uploaded];
      const itemList = document.querySelector(`[data-file-items="${category}"]`);
      if (itemList) itemList.innerHTML = selectedFileItems(category);
      if (summary) summary.textContent = uploaded.length
        ? `已上傳 ${uploaded.length} 個；其餘失敗：${error.message || error}`
        : `上傳失敗：${error.message || error}`;
      toast(error.message || '附件上傳失敗，請重試', 'danger');
    } finally {
      input.disabled = false;
      input.value = '';
    }
  }

  function payFor({ teacher, lessonStatus, siteType, present, makeup, duration }) {
    if (lessonStatus === 'cancelled') return 0;
    if (siteType === 'partner' || normalizeName(teacher) === normalizeName('黑豹老師')) return 900;
    const count = Number(present || 0) + Number(makeup || 0);
    if (count < 2) return 0;
    if (count > 10) return 0;
    const hourly = count <= 4 ? 500 : count <= 7 ? 600 : 800;
    return hourly * Number(duration || 1.5);
  }

  function payBreakdown(item) {
    if (item.lessonStatus === 'cancelled') return { count: 0, rate: 0, tier: '停課', amount: 0 };
    const count = Number(item.present || 0) + Number(item.makeup || 0);
    if (item.siteType === 'partner' || normalizeName(item.teacher) === normalizeName('黑豹老師')) {
      return { count, rate: 600, tier: '合作校固定 600／小時', amount: Number(item.pay || 900) };
    }
    const rate = count < 2 || count > 10 ? 0 : count <= 4 ? 500 : count <= 7 ? 600 : 800;
    const tier = count < 2 ? '未達開班人數' : count > 10 ? '超過 10 人待主管確認' : count <= 4 ? '2–4 人' : count <= 7 ? '5–7 人' : '8–10 人';
    return { count, rate, tier, amount: Number(item.pay || 0) };
  }

  function updateLogFormLogic() {
    const form = $('#log-form');
    if (!form) return;
    let data = new FormData(form);
    const cancelled = isPt() && data.get('lessonStatus') === 'cancelled';
    const heldRoot = $('[data-held-only]', form);
    const cancelledRoot = $('[data-cancelled-only]', form);
    if (heldRoot) {
      heldRoot.hidden = cancelled;
      $$('input, select, textarea', heldRoot).forEach(control => { control.disabled = cancelled; });
    }
    if (cancelledRoot) {
      cancelledRoot.hidden = !cancelled;
      $$('input, select, textarea', cancelledRoot).forEach(control => { control.disabled = !cancelled; });
    }
    const dateInput = form.elements.date;
    if (isPt() && dateInput) {
      dateInput.readOnly = !cancelled;
      if (!cancelled && dateInput.value !== todayIso()) dateInput.value = todayIso();
      const hint = $('[data-date-hint]', form);
      if (hint) hint.textContent = cancelled ? '停課可選過去的固定排課日' : '正常上課固定為今天';
    }
    if (isPt()) updatePtScheduleSelect(form);
    data = new FormData(form);
    const siteType = data.get('siteType');
    $$('.bonus-fields', form).forEach(node => { node.hidden = siteType !== 'self'; });
    const followup = $('.followup-field', form);
    const needsFollowup = data.get('parentStatus') === 'followup';
    if (followup) followup.hidden = !needsFollowup;
    if (form.elements.parentFollowup) form.elements.parentFollowup.required = needsFollowup;
    const preview = $('#pay-preview');
    if (preview) {
      const count = Number(data.get('present') || 0) + Number(data.get('makeup') || 0);
      const pay = payFor({ teacher: currentUser.nickname, lessonStatus: data.get('lessonStatus'), siteType, present: data.get('present'), makeup: data.get('makeup'), duration: data.get('duration') });
      const rule = siteType === 'partner' || normalizeName(currentUser.nickname) === normalizeName('黑豹老師') ? '合作校固定鐘點，無新生或續報獎金' : count < 2 ? '計薪實到低於 2 人，請由主管確認是否開班' : count > 10 ? '超過 10 人不自動計薪，需主管確認' : `計薪實到 ${count} 人（體驗不計）`;
      preview.innerHTML = `<span>${icon('calculator', 20)}</span><div><small>本堂鐘點預估</small><strong>${formatMoney(pay)}</strong><p>${esc(rule)}</p></div>`;
      hydrateIcons();
    }
  }

  function updatePtScheduleSelect(form) {
    const select = form.elements.scheduleKey;
    const dateInput = form.elements.date;
    if (!select || !dateInput?.value) return;
    const schedules = schedulesForDate(currentUser, dateInput.value);
    const previous = select.value || select.dataset.initialValue || '';
    const signature = schedules.map(item => item.scheduleKey).join('|');
    if (select.dataset.signature !== signature) {
      select.innerHTML = schedules.length
        ? schedules.map(item => `<option value="${esc(item.scheduleKey)}">${esc(`${item.label || ''} ${item.time || '依班表'} · ${item.site || '未設定地點'}`.trim())}</option>`).join('')
        : '<option value="">該日期沒有固定排課</option>';
      select.dataset.signature = signature;
      if (schedules.some(item => item.scheduleKey === previous)) select.value = previous;
      else if (schedules.length === 1) select.value = schedules[0].scheduleKey;
    }
    const selected = schedules.find(item => item.scheduleKey === select.value);
    if (selected && select.dataset.appliedKey !== selected.scheduleKey) {
      if (form.elements.siteType) form.elements.siteType.value = selected.siteType || 'self';
      if (form.elements.site) form.elements.site.value = selected.site || '';
      const siteTypeDisplay = $('[data-schedule-site-type-display]', form);
      const siteDisplay = $('[data-schedule-site-display]', form);
      if (siteTypeDisplay) siteTypeDisplay.value = selected.siteType === 'partner' ? '合作校／外派' : '布拉克自營教室';
      if (siteDisplay) siteDisplay.value = selected.site || '';
      if (form.elements.duration && /1\.5/.test(String(selected.time || ''))) form.elements.duration.value = '1.5';
      select.dataset.appliedKey = selected.scheduleKey;
    }
  }

  function logComplete(item) {
    if (item.lessonStatus === 'cancelled') return Boolean(item.cancellationReason && item.courseName);
    return Boolean(item.prepId && item.attendanceFiles?.length && item.learningFiles?.length && item.roomDone && item.roomFiles?.length && item.parentStatus !== 'pending');
  }

  function putLocalLesson(item) {
    const index = state.logs.findIndex(record => record.id === item.id);
    if (index >= 0) state.logs[index] = item;
    else state.logs.unshift(item);
  }

  async function submitLog(form) {
    if (!form.checkValidity()) {
      form.reportValidity();
      toast('請先完成紅色米字的必填項目', 'danger');
      return;
    }
    window.clearTimeout(cloudDraftTimer);
    await cloudDraftChain;
    const data = new FormData(form);
    const lessonStatus = String(data.get('lessonStatus') || 'held');
    const lessonDate = String(data.get('date') || todayIso());
    if (isPt() && lessonStatus !== 'cancelled' && lessonDate !== todayIso()) {
      toast('PT 紀錄僅能於授課當日送出，不開放補寫', 'danger');
      return;
    }
    const selectedScheduleKey = String(data.get('scheduleKey') || '');
    const dateSchedules = schedulesForDate(currentUser, lessonDate);
    const selectedSchedule = dateSchedules.find(item => item.scheduleKey === selectedScheduleKey);
    if (isPt() && !selectedSchedule) {
      toast('請選擇這個日期原本安排的固定班次', 'danger');
      return;
    }
    const editingId = String(data.get('id') || '');
    const duplicateLesson = isPt() && state.logs.some(item => {
      if (item.id === editingId) return false;
      if (normalizeName(item.teacher) !== normalizeName(currentUser.nickname) || item.date !== lessonDate || item.status !== 'submitted') return false;
      if (item.scheduleKey) return item.scheduleKey === selectedScheduleKey;
      return dateSchedules[0]?.scheduleKey === selectedScheduleKey;
    });
    if (duplicateLesson) {
      toast('這個日期與班次已有送出紀錄，不能重複申報', 'danger');
      return;
    }
    if (isPt() && lessonStatus === 'cancelled') {
      const weekday = new Date(`${lessonDate}T12:00:00+08:00`).getDay();
      const matchedSchedule = schedulesForDate(currentUser, lessonDate).find(item => item.scheduleKey === selectedScheduleKey);
      if (!matchedSchedule) {
        toast('請選擇該日期原本安排的固定班次', 'danger');
        return;
      }
      const values = Object.fromEntries(data.entries());
      const item = {
        id: editingId || uid('log'), updatedAt: String(data.get('updatedAt') || ''), teacher: currentUser.nickname, employment: 'pt', lessonStatus: 'cancelled', scheduleKey: matchedSchedule.scheduleKey,
        scheduleLabel: matchedSchedule.label || '', scheduleTime: matchedSchedule.time || '',
        date: lessonDate, courseType: '停課', courseName: String(values.cancelledCourseName || '').trim(),
        siteType: matchedSchedule.siteType, site: matchedSchedule.site, duration: 0,
        expected: 0, present: 0, leave: 0, absent: 0, makeup: 0, trial: 0,
        cancellationReason: values.cancellationReason, cancellationNote: String(values.cancellationNote || '').trim(),
        attendanceFiles: [], learningFiles: [], roomFiles: [], newCount: 0, renewalCount: 0,
        appStatus: 'not_required', roomDone: false, status: 'submitted', pay: 0,
        backfilled: lessonDate !== todayIso(), createdAt: new Date().toISOString(),
      };
      const submitButton = document.querySelector('[data-action="submit-log"]');
      if (submitButton) { submitButton.disabled = true; submitButton.textContent = '正在儲存…'; }
      const result = PREVIEW_MODE ? { ok: true, lesson: item } : await API.saveTalentLesson(currentUser.nickname, item);
      if (!result?.ok) {
        if (submitButton) { submitButton.disabled = false; submitButton.innerHTML = `${icon(editingId ? 'save' : 'send', 16)}${editingId ? '更新紀錄' : '送出紀錄'}`; hydrateIcons(); }
        toast(`停課尚未儲存：${result?.error || '請稍後重試'}`, 'danger');
        return;
      }
      putLocalLesson(result.lesson || item);
      state.draftLog = null;
      pendingFiles = { attendance: [], learning: [], room: [], prep: [] };
      persist(item.backfilled ? '停課已補登' : '停課已登記');
      closeDrawer();
      renderApp();
      toast(result.warning || (item.backfilled ? '過去停課已補登，不計鐘點' : '今日停課已登記，不計鐘點'), result.warning ? 'warning' : 'success');
      return;
    }
    const expected = Number(data.get('expected') || 0);
    const present = Number(data.get('present') || 0);
    const leave = Number(data.get('leave') || 0);
    const absent = Number(data.get('absent') || 0);
    if (expected !== present + leave + absent) {
      toast('應到正式人數必須等於「正式實到＋請假＋未請假缺席」', 'danger');
      return;
    }
    if (!pendingFiles.attendance.length || !pendingFiles.learning.length || !pendingFiles.room.length) {
      toast('請上傳點名簿、學習證據與課後復原照片', 'danger');
      return;
    }
    if (data.get('parentStatus') === 'followup' && !String(data.get('parentFollowup') || '').trim()) {
      toast('請填寫個別追蹤的下一步', 'danger');
      return;
    }
      const values = Object.fromEntries(data.entries());
    const siteType = values.siteType;
    const existingLog = editingId ? state.logs.find(record => record.id === editingId) : null;
    const item = {
      ...(existingLog || {}),
      id: editingId || uid('log'), updatedAt: String(values.updatedAt || existingLog?.updatedAt || ''), teacher: currentUser.nickname, employment: currentUser.employment === 'fulltime' ? 'fulltime' : 'pt', lessonStatus: 'held',
      ...values, expected, present, leave, absent, makeup: Number(values.makeup || 0), trial: Number(values.trial || 0), duration: Number(values.duration || 1.5),
      scheduleLabel: selectedSchedule?.label || '', scheduleTime: selectedSchedule?.time || '',
      siteType, roomDone: Boolean(form.elements.roomDone.checked), attendanceFiles: [...pendingFiles.attendance], learningFiles: [...pendingFiles.learning], roomFiles: [...pendingFiles.room],
      newCount: siteType === 'self' && !isPt() ? Number(values.newCount || 0) : 0,
      renewalCount: siteType === 'self' ? Number(values.renewalCount || 0) : 0,
      appStatus: 'pending', status: 'submitted', createdAt: existingLog?.createdAt || new Date().toISOString(),
    };
    item.pay = item.employment === 'pt' ? payFor(item) : 0;
    const submitButton = document.querySelector('[data-action="submit-log"]');
    if (submitButton) { submitButton.disabled = true; submitButton.textContent = '正在儲存與產生日報…'; }
    const result = PREVIEW_MODE ? { ok: true, lesson: item } : await API.saveTalentLesson(currentUser.nickname, item);
    if (!result?.ok) {
      if (submitButton) { submitButton.disabled = false; submitButton.innerHTML = `${icon(editingId ? 'save' : 'send', 16)}${editingId ? '更新紀錄' : '送出紀錄'}`; hydrateIcons(); }
      toast(`紀錄尚未送出：${result?.error || '請稍後重試'}；草稿仍保留`, 'danger');
      return;
    }
    putLocalLesson(result.lesson || item);
    state.draftLog = null;
    pendingFiles = { attendance: [], learning: [], room: [], prep: [] };
    persist('紀錄已送出');
    closeDrawer();
    renderApp();
    toast(result.warning || '本堂紀錄已送出並歸檔', result.warning ? 'warning' : 'success');
  }

  function openPrepEditor(existing = null) {
    const prep = existing || state.draftPrep || {};
    pendingFiles.prep = prep.materials || [];
    openDrawer({ title: existing ? '編輯備課教案' : '新增備課教案', subtitle: '先把原理、引導與遊戲設計建檔，授課當天不再重寫。', body: `<form id="prep-form" novalidate><input type="hidden" name="id" value="${esc(prep.id || '')}"><section class="form-section"><div class="section-title"><span class="section-number">1</span><div><h3>課程識別</h3></div></div><div class="form-grid">${selectField('課程類型', 'courseType', COURSE_TYPES, prep.courseType || COURSE_TYPES[1], true)}${field('課程名稱', 'courseName', 'text', prep.courseName || '', true, '例：齒輪轉速實驗')}${field('教案標題', 'title', 'text', prep.title || '', true, '例：齒輪轉速與傳動')}${field('版本', 'version', 'text', prep.version || 'v1.0', true)}</div></section><section class="form-section"><div class="section-title"><span class="section-number">2</span><div><h3>正式教案</h3><p>主管需能判讀這堂課教什麼、怎麼引導、孩子會做到什麼。</p></div></div><div class="form-grid">${textareaField('教學目標', 'objective', prep.objective || '', true, '寫學生下課前能完成、說明、操作或改造什麼。')}${textareaField('課程核心原理／技能', 'principle', prep.principle || '', true, '寫這堂課真正要理解的原理、程式邏輯或操作技能。')}${textareaField('引導方法', 'guidance', prep.guidance || '', true, '老師要問什麼、怎麼拆解、什麼時候給提示。')}${textareaField('遊戲／挑戰／改造設計', 'game', prep.game || '', true, '寫規則、關卡、分組、計分或改造；不適用可寫不適用與原因。')}${textareaField('教學流程', 'flow', prep.flow || '', true, '開場、示範、操作、挑戰、分享與收尾的時間安排。')}</div>${uploadField('教案與教材附件', 'prep', 'PPT、學習單、程式、示範作品或器材清單；可一次多選。', '*/*', true)}</section></form>`, footer: `<button type="button" class="btn" data-action="close-drawer">取消</button><button type="button" class="btn" data-action="save-prep-draft">${icon('save', 16)}儲存草稿</button><button type="button" data-action="submit-prep" class="btn btn-primary">${icon('send', 16)}送主管審查</button>` });
  }

  async function runFormAction(form, action) {
    if (!form || form.dataset.submitting === 'true') return;
    form.dataset.submitting = 'true';
    try { await action(); }
    finally { delete form.dataset.submitting; }
  }

  function capturePrep(form, status) {
    const data = Object.fromEntries(new FormData(form).entries());
    return { ...data, id: data.id || uid('prep'), teacher: currentUser.nickname, materials: [...pendingFiles.prep], status, reviewedBy: '', reviewedAt: '', reviewNote: '' };
  }

  async function savePrep(form, submit) {
    if (submit && !form.checkValidity()) { form.reportValidity(); toast('請完成所有必填教案內容', 'danger'); return; }
    if (submit && !pendingFiles.prep.length) { toast('請至少上傳一份實際使用的教案或教材', 'danger'); return; }
    const item = capturePrep(form, submit ? 'pending' : 'draft');
    const result = PREVIEW_MODE ? { ok: true, prep: item } : await API.saveTalentPrep(currentUser.nickname, item);
    if (!result?.ok) {
      toast(`備課教案尚未儲存：${result?.error || '請稍後重試'}`, 'danger');
      return;
    }
    const saved = result.prep || item;
    const index = state.preps.findIndex(prep => prep.id === saved.id);
    if (index >= 0) state.preps[index] = saved; else state.preps.unshift(saved);
    state.draftPrep = submit ? null : saved;
    persist(submit ? '教案已送審' : '教案草稿已儲存');
    closeDrawer(); renderApp(); toast(submit ? '備課教案已送主管審查' : '教案草稿已保留');
  }

  function openPrepView(prep) {
    openDrawer({ title: prep.title, subtitle: `${prep.teacher} · ${prep.courseType} · ${prep.version}`, body: `<div class="detail-stack">${detailBlock('教學目標', prep.objective)}${detailBlock('核心原理／技能', prep.principle)}${detailBlock('引導方法', prep.guidance)}${detailBlock('遊戲／挑戰／改造', prep.game)}${detailBlock('教學流程', prep.flow)}${detailAttachments('教案與教材', prep.materials)}${prep.reviewNote ? detailBlock('主管審查意見', prep.reviewNote) : ''}</div>`, footer: `<button type="button" class="btn" data-action="close-drawer">關閉</button>` });
  }

  function detailBlock(label, value) { return `<section class="detail-block"><h3>${esc(label)}</h3><p>${nl2br(value || '—')}</p></section>`; }

  function detailAttachments(label, items) {
    const attachments = items || [];
    if (!attachments.length) return detailBlock(label, '無附件');
    return `<section class="detail-block"><h3>${esc(label)}</h3><div class="detail-file-list">${attachments.map(item => { const name = attachmentName(item); const url = typeof item === 'object' ? item.url : ''; return url ? `<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${icon('paperclip', 14)}${esc(name)}${icon('external-link', 13)}</a>` : `<span>${icon('paperclip', 14)}${esc(name)}</span>`; }).join('')}</div></section>`;
  }

  function lessonReportBlock(item) {
    if (item.reportUrl) return detailAttachments('正式日報 PDF', [{ fileName: '開啟本堂日報', url: item.reportUrl }]);
    return `<div class="notice warning report-retry">${icon('file-warning', 19)}<div><strong>日報 PDF 尚未生成</strong><span>課堂紀錄已安全保留，可直接補建檔案，不需要重新填寫。</span></div><button type="button" class="btn btn-small" data-action="retry-report" data-id="${esc(item.id)}">${icon('refresh-cw', 15)}重新生成</button></div>`;
  }

  function openLogView(item) {
    if (item.lessonStatus === 'cancelled') {
      openDrawer({ title: item.courseName || '停課紀錄', subtitle: `${formatDate(item.date)} · ${item.teacher} · ${item.site}`, body: `<div class="notice info">${icon('calendar-x-2', 19)}<div><strong>${item.backfilled ? '補登停課' : '當日停課'}</strong><span>本堂不計鐘點，也不需要教案、點名與成果證據。</span></div></div><div class="detail-stack">${detailBlock('停課原因', item.cancellationReason)}${item.cancellationNote ? detailBlock('補充說明', item.cancellationNote) : ''}${detailBlock('系統結果', '鐘點費 0 元；已列入排課回報，不判定為漏填。')}${lessonReportBlock(item)}</div>`, footer: `<button type="button" class="btn" data-action="close-drawer">關閉</button>` });
      return;
    }
    const prep = state.preps.find(record => record.id === item.prepId);
    openDrawer({ title: item.courseName || item.courseType, subtitle: `${formatDate(item.date)} · ${item.teacher} · ${item.site}`, body: `<div class="detail-metrics"><div><span>應到</span><strong>${item.expected}</strong></div><div><span>正式實到</span><strong>${item.present}</strong></div><div><span>補課</span><strong>${item.makeup}</strong></div><div><span>體驗</span><strong>${item.trial}</strong></div></div><div class="detail-stack">${detailBlock('本堂採用教案', prep ? `${prep.title} · ${prep.version}` : '教案已移除')}${detailBlock('實際完成內容', item.completed)}${detailBlock('孩子反應／學習證據', item.response)}${detailBlock('課程問題與下次優化', item.issue)}${detailAttachments('點名證據', item.attendanceFiles)}${detailAttachments('學習證據', item.learningFiles)}${detailAttachments('教室復原', item.roomFiles)}${lessonReportBlock(item)}</div>${item.employment === 'pt' ? `<div class="calculation-card static"><span>${icon('badge-dollar-sign', 20)}</span><div><small>本堂預估鐘點</small><strong>${formatMoney(item.pay)}</strong></div></div>` : ''}`, footer: `<button type="button" class="btn" data-action="close-drawer">關閉</button>${prep ? `<button type="button" class="btn" data-action="view-prep" data-id="${prep.id}">${icon('notebook-tabs', 16)}查看教案</button>` : ''}` });
  }

  function openPtStatement(teacher) {
    const row = settlementRows().find(item => item.person.employment === 'pt' && normalizeName(item.person.nickname) === normalizeName(teacher));
    if (!row) return;
    const details = row.logs.slice().sort((a, b) => String(a.date).localeCompare(String(b.date)));
    const missingDates = row.compliance?.missing?.map(item => formatDate(item.date)) || [];
    const eligibility = row.compliance?.eligible ? '符合' : missingDates.length ? '已取消' : '待完成';
    const rowsHtml = details.length ? details.map(item => {
      if (item.lessonStatus === 'cancelled') {
        return `<tr><td>${formatDate(item.date)}</td><td>${esc(item.courseName)}</td><td>停課${item.backfilled ? '（補登）' : ''}</td><td colspan="5">${esc(item.cancellationReason)}${item.cancellationNote ? `；${esc(item.cancellationNote)}` : ''}</td><td>${formatMoney(0)}</td></tr>`;
      }
      const pay = payBreakdown(item);
      return `<tr><td>${formatDate(item.date)}</td><td>${esc(item.courseName)}</td><td>正常上課</td><td>${Number(item.present || 0)}</td><td>${Number(item.makeup || 0)}</td><td>${Number(item.trial || 0)}</td><td>${pay.count} 人／${esc(pay.tier)}</td><td>${Number(item.duration || 0)} 小時 × ${formatMoney(pay.rate)}</td><td>${formatMoney(pay.amount)}</td></tr>`;
    }).join('') : '<tr><td colspan="9">本月尚無回報紀錄</td></tr>';
    openDrawer({
      title: `${row.person.nickname}｜${state.ui.month} 月結單`,
      subtitle: '系統依逐堂紀錄自動彙整，可直接列印交老師核對。',
      body: `<article class="print-sheet" id="pt-statement"><header class="statement-head"><img src="../../shared/icons/logo.png" alt="布拉克星球 Logo"><div><span>布拉克星球 KPI 系統</span><h2>才藝 PT 月度鐘點費明細</h2></div><strong>${esc(state.ui.month)}</strong></header><section class="statement-meta"><div><span>老師</span><strong>${esc(row.person.nickname)}</strong></div><div><span>固定排班</span><strong>${esc(row.person.schedule?.map(item => `${item.label} ${item.time}`).join('、') || '依班表')}</strong></div><div><span>產生日期</span><strong>${esc(todayIso().replace(/-/g, '/'))}</strong></div></section><div class="table-wrap statement-table"><table><thead><tr><th>日期</th><th>課程</th><th>狀態</th><th>正式</th><th>補課</th><th>體驗</th><th>計薪人數／級距</th><th>時數與單價</th><th>本堂金額</th></tr></thead><tbody>${rowsHtml}</tbody></table></div><section class="statement-summary"><div><span>正常上課</span><strong>${row.heldLogs.length} 堂／${row.hours} 小時</strong></div><div><span>停課</span><strong>${row.cancelledLogs.length} 堂</strong></div><div><span>鐘點費合計</span><strong>${formatMoney(row.wage)}</strong></div><div><span>續報 ${row.renewal} 人</span><strong>${eligibility}／${formatMoney(row.renewalBonus)}</strong></div><div class="grand-total"><span>本月預估合計</span><strong>${formatMoney(row.total)}</strong></div></section>${missingDates.length ? `<div class="statement-warning"><strong>續報獎金資格取消</strong><span>正常課程未於當日送出：${missingDates.join('、')}</span></div>` : ''}<footer class="statement-signatures"><span>老師核對：________________</span><span>主管／行政核對：________________</span></footer></article>`,
      footer: `<button type="button" class="btn" data-action="close-drawer">關閉</button><button type="button" class="btn btn-primary" data-action="print-statement">${icon('printer', 16)}列印月結單</button>`,
    });
  }

  function openPrepReviewDialog(prep) {
    openDialog({ title: `審查：${prep.title}`, body: `<div class="review-checks"><label><input type="checkbox" required><span>核心原理／技能正確且可教</span></label><label><input type="checkbox" required><span>引導方法能讓孩子自己完成</span></label><label><input type="checkbox" required><span>遊戲／挑戰／改造與目標相符</span></label><label><input type="checkbox" required><span>教材與流程可支援正式授課</span></label></div><label class="form-field"><span>審查意見 <b>*</b></span><textarea id="review-note" required placeholder="寫給老師的具體修改或採用提示。"></textarea></label>`, footer: `<button type="button" class="btn btn-danger" data-action="finish-prep-review" data-id="${prep.id}" data-result="returned">退回修改</button><button type="button" class="btn btn-primary" data-action="finish-prep-review" data-id="${prep.id}" data-result="approved">核准版本</button>` });
  }

  function openScoreEditor(teacher) {
    const record = scoreFor(teacher);
    openDrawer({ title: `${teacher}｜${state.ui.month} KPI`, subtitle: '每個分數都必須能回到系統證據。', body: `<form id="score-form"><input type="hidden" name="teacher" value="${esc(teacher)}"><div class="score-editor">${KPI_DIMENSIONS.map(item => `<label><span><strong>${esc(item.label)}</strong><small>${esc(item.description)}</small></span><input type="number" name="${item.key}" min="0" max="${item.max}" value="${Number(record.scores[item.key] || 0)}" required><em>/ ${item.max}</em></label>`).join('')}</div><label class="form-field span-all"><span>評分說明／調分理由 <b>*</b></span><textarea name="reason" required>${esc(record.reason || '')}</textarea></label><label class="publish-check"><input type="checkbox" name="published" ${record.published ? 'checked disabled' : ''}><span>${record.published ? '已公布；後續修正會保留版本並直接更新給老師' : '公布給老師查看與回覆'}</span></label></form><div class="drawer-conversation">${renderConversation(teacher)}</div>`, footer: `<button type="button" class="btn" data-action="close-drawer">取消</button><button type="submit" form="score-form" class="btn btn-primary">${icon('save', 16)}儲存評分</button>` });
  }

  function openProfile() {
    const assignments = window.KPI_WORKSPACES?.getAssignments?.(currentUser) || [];
    const testNotice = TEST_VIEW_MODE ? `<div class="notice info">${icon('scan-eye', 19)}<div><strong>柏翰正在測試 ${esc(currentUser.nickname)} 的畫面</strong><span>所有新增、上傳、儲存、送出與通知功能都已停用。</span></div></div>` : '';
    const sessionActions = TEST_VIEW_MODE
      ? `<button type="button" class="btn btn-primary" data-action="exit-impersonation">${icon('undo-2', 16)}回到測試人員清單</button>`
      : identity.session
        ? `<button type="button" class="btn btn-danger" data-action="logout">登出</button><button type="button" class="btn" data-action="enable-push">開啟 APP 通知</button>${isBohanAdmin ? `<button type="button" class="btn btn-primary" data-action="open-test-view">${icon('scan-eye', 16)}測試老師視角</button>` : ''}${['admin', 'manager'].includes(currentUser.role) ? '<button type="button" class="btn" data-action="system-health">系統健康檢查</button><button type="button" class="btn" data-action="test-notifications">測試 APP／LINE</button>' : ''}`
        : '';
    openDialog({ title: '帳號與工作模式', body: `${testNotice}<div class="profile-summary"><span class="large-avatar">${esc(initials())}</span><div><strong>${esc(currentUser.nickname)}</strong><span>${esc(currentUser.department)} · ${esc(workspace.label)}</span></div></div><div class="assignment-list"><h3>這個帳號可使用</h3>${assignments.map(item => `<div class="assignment-item"><span>${icon(item.icon, 18)}</span><div><strong>${esc(item.label)}</strong><small>${esc(item.description)}</small></div>${item.id === workspaceId ? statusBadge('正常') : ''}</div>`).join('')}</div>${!identity.session && PREVIEW_MODE ? `<div class="review-samples"><h3>內部審查樣本</h3><div><a class="btn" href="?workspace=talent-pt&reviewUser=紅豆老師">PT／紅豆</a><a class="btn" href="?workspace=talent-fulltime&reviewUser=浩浩老師">正職／浩浩</a><a class="btn" href="?workspace=talent-manager&reviewUser=柳丁主管">主管／柳丁</a><a class="btn" href="?workspace=talent-payroll&reviewUser=柏翰">薪資／柏翰</a><a class="btn" href="?workspace=talent-pt&reviewUser=黑豹老師">合作校／黑豹</a></div></div>` : ''}`, footer: `${sessionActions}<button type="button" class="btn" data-action="close-dialog">關閉</button>` });
  }

  function healthStatusRow(label, ok, detail) {
    return `<div class="assignment-item"><span>${icon(ok ? 'circle-check-big' : 'circle-alert', 18)}</span><div><strong>${esc(label)}</strong><small>${esc(detail)}</small></div>${statusBadge(ok ? '正常' : '未完成')}</div>`;
  }

  async function openSystemHealth() {
    if (PREVIEW_MODE) {
      openDialog({ title: '系統健康檢查', body: '<div class="notice info"><div><strong>審查模式不讀取正式服務設定</strong><span>正式登入後才會檢查通知金鑰與 Apps Script 排程。</span></div></div>', footer: '<button type="button" class="btn" data-action="close-dialog">關閉</button>' });
      return;
    }
    openDialog({ title: '系統健康檢查', body: '<div class="empty-inline">正在檢查正式服務與自動排程…</div>', footer: '<button type="button" class="btn" data-action="close-dialog">關閉</button>' });
    const result = await API.getSystemReadiness(currentUser.nickname);
    if (!result?.ok) {
      openDialog({ title: '系統健康檢查', body: `<div class="notice strict"><div><strong>無法取得健康狀態</strong><span>${esc(result?.error || '請稍後重試')}</span></div></div>`, footer: '<button type="button" class="btn" data-action="close-dialog">關閉</button>' });
      return;
    }
    const appReady = Boolean(result.services?.oneSignalApp && result.services?.oneSignalKey);
    const automationReady = Boolean(result.triggers?.dailyKpiPdf && result.triggers?.dailyTaskReminder && result.triggers?.talentPdfRepair);
    const body = `<div class="assignment-list">
      ${healthStatusRow('LINE 通知服務', Boolean(result.services?.line), result.services?.line ? 'Channel token 已設定' : '尚未設定 LINE token')}
      ${healthStatusRow('APP 通知服務', appReady, appReady ? 'OneSignal App 與 REST key 已設定' : 'OneSignal 設定尚未完整')}
      ${healthStatusRow('安親每日 PDF', Boolean(result.triggers?.dailyKpiPdf), result.triggers?.dailyKpiPdf ? '每日排程已啟用' : '每日排程尚未建立')}
      ${healthStatusRow('才藝日報自動補修', Boolean(result.triggers?.talentPdfRepair), result.triggers?.talentPdfRepair ? '缺檔會於夜間自動補建' : '夜間補修排程尚未建立')}
      ${healthStatusRow('事項提醒', Boolean(result.triggers?.dailyTaskReminder), result.triggers?.dailyTaskReminder ? '早晚提醒皆已啟用' : '早晚提醒排程尚未完整')}
    </div>`;
    openDialog({ title: '系統健康檢查', body, footer: `<button type="button" class="btn" data-action="close-dialog">關閉</button>${currentUser.role === 'admin' && !automationReady ? `<button type="button" class="btn btn-primary" data-action="setup-automation">${icon('wrench', 16)}補齊自動排程</button>` : ''}` });
  }

  function moreNav() {
    openDialog({ title: `${workspace.label}功能`, body: `<div class="more-nav-list">${navItems().map(item => `<button type="button" data-action="navigate" data-route="${item.route}">${icon(item.icon, 18)}<span><strong>${esc(item.label)}</strong></span>${icon('chevron-right', 17)}</button>`).join('')}</div>` });
  }

  function downloadCsv(rows, filename) {
    const csv = rows.map(row => row.map(value => `"${String(value ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([`\ufeff${csv}`], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url; link.download = filename; document.body.appendChild(link); link.click(); link.remove(); URL.revokeObjectURL(url);
  }

  function exportOwn() {
    const rows = [['日期', '老師', '課程', '狀態', '場域', '正式實到', '補課', '體驗', '預估鐘點', '續報', '停課原因', '補登停課']];
    ownLogs().filter(item => item.date.slice(0, 7) === state.ui.month).forEach(item => rows.push([item.date, item.teacher, item.courseName, item.lessonStatus === 'cancelled' ? '停課' : '正常上課', item.site, item.present, item.makeup, item.trial, item.pay, item.renewalCount, item.cancellationReason || '', item.backfilled ? '是' : '否']));
    downloadCsv(rows, `${currentUser.nickname}_${state.ui.month}_才藝紀錄.csv`);
    toast('本月紀錄已匯出');
  }

  function exportSettlement() {
    const rows = [['月份', '人員', '職別', '課堂數', '鐘點', 'KPI分數', 'KPI狀態', 'KPI核定獎金', '新生核准/申報', '新生獎金', '續報核准/申報', '續報獎金', '目前核定合計']];
    settlementRows().forEach(row => rows.push([
      state.ui.month,
      row.person.nickname,
      row.person.employment === 'pt' ? 'PT' : '正職',
      row.logs.length,
      row.wage,
      row.person.employment === 'fulltime' ? row.score : '',
      row.person.employment === 'fulltime' ? (row.scorePublished ? '已公布' : '草稿/待公布') : '不適用',
      row.kpi,
      `${row.newCount}/${row.reportedNewCount}`,
      row.newBonus,
      `${row.renewal}/${row.reportedRenewal}`,
      row.renewalBonus,
      row.total,
    ]));
    downloadCsv(rows, `${state.ui.month}_才藝薪資獎金核定與待處理.csv`);
    toast('月結 CSV 已匯出，待核定項目已分開標示');
  }

  function exportPtDetail() {
    const rows = [['月份', '老師', '日期', '課程', '狀態', '正式實到', '補課', '體驗', '計薪人數', '級距', '時數', '單價', '本堂鐘點費', '停課原因', '補登停課', '續報申報', '續報核准', '獎金核准狀態', '當月續報資格']];
    settlementRows().filter(row => row.person.employment === 'pt').forEach(row => {
      row.logs.slice().sort((a, b) => String(a.date).localeCompare(String(b.date))).forEach(item => {
        const pay = payBreakdown(item);
        rows.push([state.ui.month, row.person.nickname, item.date, item.courseName, item.lessonStatus === 'cancelled' ? '停課' : '正常上課', item.present || 0, item.makeup || 0, item.trial || 0, pay.count, pay.tier, item.duration || 0, pay.rate, pay.amount, item.cancellationReason || '', item.backfilled ? '是' : '否', item.renewalCount || 0, item.approvedRenewalCount || 0, item.bonusApproval || '不適用', row.compliance?.eligible ? '符合' : row.compliance?.missing.length ? '取消' : '待完成']);
      });
      if (!row.logs.length) rows.push([state.ui.month, row.person.nickname, '', '', '本月無紀錄', 0, 0, 0, 0, '', 0, 0, 0, '', '', 0, 0, '不適用', row.compliance?.missing.length ? '取消' : '待完成']);
    });
    downloadCsv(rows, `${state.ui.month}_才藝PT逐堂鐘點明細.csv`);
    toast('PT 逐堂月結 CSV 已匯出');
  }

  const TEST_VIEW_MUTATION_ACTIONS = new Set([
    'new-log', 'edit-log', 'submit-log', 'save-log-draft', 'discard-log-draft',
    'new-prep', 'submit-prep', 'edit-prep', 'save-prep-draft', 'remove-upload',
    'retry-report', 'toggle-app', 'review-prep', 'finish-prep-review', 'edit-score',
    'open-bonus-approval', 'setup-automation', 'enable-push', 'test-notifications',
  ]);

  document.addEventListener('click', async event => {
    if (event.target.matches('[data-dialog-backdrop]')) {
      closeDialog();
      return;
    }
    const control = event.target.closest('[data-action]');
    if (!control) return;
    const action = control.dataset.action;
    if (action === 'exit-impersonation') {
      window.AUTH?.exitImpersonate?.();
      window.location.href = `${window.AUTH?.relativeRoot?.() || '../../'}admin/dashboard.html#test-view`;
      return;
    }
    if (action === 'open-test-view') {
      window.location.href = `${window.AUTH?.relativeRoot?.() || '../../'}admin/dashboard.html#test-view`;
      return;
    }
    if (TEST_VIEW_MODE && TEST_VIEW_MUTATION_ACTIONS.has(action)) {
      toast('目前是柏翰測試視角，只能查看，不能修改正式資料', 'warning');
      return;
    }
    if (action === 'navigate') {
      state.ui.route = control.dataset.route; closeDialog(); closeDrawer(); persist(); renderApp();
      if (state.ui.route === 'cloud-reports' && cloudRuntime.foldersStatus === 'idle') window.setTimeout(loadCloudFolders, 0);
    }
    else if (action === 'more-nav') moreNav();
    else if (action === 'open-profile') openProfile();
    else if (action === 'close-drawer') {
      const logForm = $('#log-form');
      if (logForm?.dataset.dirty === 'true') captureLogDraft();
      closeDrawer();
    }
    else if (action === 'close-dialog') closeDialog();
    else if (action === 'new-log') openLogEditor();
    else if (action === 'edit-log') {
      const item = state.logs.find(log => log.id === control.dataset.id);
      if (item && item.date === todayIso() && normalizeName(item.teacher) === normalizeName(currentUser.nickname)) openLogEditor(item);
    }
    else if (action === 'submit-log') await runFormAction($('#log-form'), () => submitLog($('#log-form')));
    else if (action === 'save-log-draft') {
      window.clearTimeout(cloudDraftTimer);
      captureLogDraft(false);
      if (!PREVIEW_MODE) {
        await cloudDraftChain;
        const result = await API.saveTalentDraft(currentUser.nickname, state.draftLog);
        if (!result?.ok) { toast(`雲端草稿尚未儲存：${result?.error || '請稍後重試'}；本機仍保留`, 'warning'); return; }
      }
      closeDrawer(); renderApp(); toast('未完成紀錄已保留');
    }
    else if (action === 'discard-log-draft') {
      const result = PREVIEW_MODE ? { ok: true } : await API.saveTalentDraft(currentUser.nickname, null);
      if (!result?.ok) { toast(`草稿尚未刪除：${result?.error || '請稍後重試'}`, 'danger'); return; }
      state.draftLog = null;
      persist('草稿已刪除');
      renderApp();
      toast('未完成草稿已刪除');
    }
    else if (action === 'new-prep') openPrepEditor();
    else if (action === 'submit-prep') await runFormAction($('#prep-form'), () => savePrep($('#prep-form'), true));
    else if (action === 'edit-prep') openPrepEditor(state.preps.find(item => item.id === control.dataset.id));
    else if (action === 'save-prep-draft') { const form = $('#prep-form'); if (form) await savePrep(form, false); }
    else if (action === 'view-prep') { const prep = state.preps.find(item => item.id === control.dataset.id); if (prep) { closeDrawer(); openPrepView(prep); } }
    else if (action === 'view-log') { const item = state.logs.find(log => log.id === control.dataset.id); if (item) openLogView(item); }
    else if (action === 'remove-upload') {
      const category = String(control.dataset.category || '');
      const index = Number(control.dataset.index);
      if (!Array.isArray(pendingFiles[category]) || !Number.isInteger(index) || index < 0 || index >= pendingFiles[category].length) return;
      pendingFiles[category].splice(index, 1);
      refreshUploadControl(category);
      if ($('#log-form')) captureLogDraft();
      toast('附件已從本筆資料移除');
    }
    else if (action === 'retry-report') {
      const item = state.logs.find(log => log.id === control.dataset.id);
      if (!item) return;
      if (PREVIEW_MODE) { toast('審查模式不會建立正式雲端 PDF', 'warning'); return; }
      control.disabled = true;
      const originalLabel = control.innerHTML;
      control.innerHTML = `${icon('loader-circle', 15)}生成中`;
      const result = await API.regenerateTalentLessonReport(item.id);
      control.disabled = false;
      control.innerHTML = originalLabel;
      if (!result?.ok) { toast(`日報 PDF 尚未生成：${result?.error || '請稍後再試'}`, 'danger'); return; }
      Object.assign(item, result.lesson || { reportUrl: result.reportUrl });
      persist();
      closeDrawer();
      openLogView(item);
      toast(result.reused ? '已開啟既有日報' : '日報 PDF 已補建完成');
    }
    else if (action === 'toggle-app') {
      const item = state.logs.find(log => log.id === control.dataset.id);
      if (item) {
        const next = item.appStatus === 'published' ? 'pending' : 'published';
        const result = PREVIEW_MODE ? { ok: true, lesson: { ...item, appStatus: next } } : await API.updateTalentAppStatus(currentUser.nickname, item.id, next);
        if (!result?.ok) { toast(`APP 狀態未更新：${result?.error || '請稍後重試'}`, 'danger'); return; }
        Object.assign(item, result.lesson || { appStatus: next });
        persist(); renderApp(); toast(item.appStatus === 'published' ? '已標記 APP 發布' : '已改為待發布');
      }
    }
    else if (action === 'review-prep') { const prep = state.preps.find(item => item.id === control.dataset.id); if (prep) openPrepReviewDialog(prep); }
    else if (action === 'finish-prep-review') {
      const note = $('#review-note')?.value.trim();
      const checks = $$('.review-checks input');
      if (!note) { toast('請填寫審查意見', 'danger'); return; }
      if (control.dataset.result === 'approved' && checks.some(item => !item.checked)) { toast('核准前請完成四項檢查', 'danger'); return; }
      const prep = state.preps.find(item => item.id === control.dataset.id);
      if (prep) {
        const result = PREVIEW_MODE
          ? { ok: true, prep: { ...prep, status: control.dataset.result, reviewNote: note, reviewedBy: currentUser.nickname, reviewedAt: todayIso() } }
          : await API.reviewTalentPrep(prep.id, control.dataset.result, note);
        if (!result?.ok) { toast(`審查未儲存：${result?.error || '請稍後重試'}`, 'danger'); return; }
        Object.assign(prep, result.prep);
        persist(); closeDialog(); renderApp(); toast(prep.status === 'approved' ? '教案版本已核准' : '已退回老師修改');
      }
    }
    else if (action === 'edit-score') openScoreEditor(control.dataset.teacher);
    else if (action === 'export-own') exportOwn();
    else if (action === 'export-settlement') exportSettlement();
    else if (action === 'export-pt-detail') exportPtDetail();
    else if (action === 'view-pt-statement') openPtStatement(control.dataset.teacher);
    else if (action === 'open-bonus-approval') openBonusApproval(state.logs.find(item => item.id === control.dataset.id));
    else if (action === 'print-statement') window.print();
    else if (action === 'retry-cloud') await loadCloudData(true);
    else if (action === 'refresh-cloud-folders') await loadCloudFolders(true);
    else if (action === 'system-health') await openSystemHealth();
    else if (action === 'setup-automation') {
      control.disabled = true;
      const result = await API.setupSystemAutomation(currentUser.nickname);
      control.disabled = false;
      if (!result?.ok) { toast(`自動排程尚未完成：${result?.error || '請稍後重試'}`, 'danger'); return; }
      toast('每日 PDF、才藝補修與事項提醒排程已補齊');
      await openSystemHealth();
    }
    else if (action === 'enable-push') {
      if (typeof window.promptPush !== 'function') { toast('APP 通知服務尚未載入，請重新整理後再試', 'danger'); return; }
      control.disabled = true;
      const status = await window.promptPush();
      control.disabled = false;
      if (status?.subscribed) { closeDialog(); toast('APP 通知已開啟並綁定目前帳號'); }
      else if (status?.nativePermission === 'denied') toast('通知已被瀏覽器封鎖，請到網站設定改為允許', 'danger');
      else toast(status?.error || 'APP 通知尚未完成，請再試一次', 'warning');
    }
    else if (action === 'test-notifications') {
      control.disabled = true;
      const result = await API.testMyNotifications(currentUser.nickname);
      control.disabled = false;
      if (!result?.ok) toast(`通知測試失敗：${result?.error || '請稍後重試'}`, 'danger');
      else if (result.lineSent && result.appSent) toast('APP 與 LINE 測試通知皆已送出');
      else if (result.lineSent) toast('LINE 已送出；APP 尚未訂閱或未送達', 'warning');
      else if (result.appSent) toast('APP 已送出；LINE 尚未綁定或未送達', 'warning');
      else toast('APP 尚未訂閱，且 LINE 尚未綁定或未送達', 'danger');
    }
    else if (action === 'logout') window.AUTH?.logout?.();
  });

  document.addEventListener('submit', async event => {
    event.preventDefault();
    if (TEST_VIEW_MODE) {
      toast('目前是柏翰測試視角，表單不會送出', 'warning');
      return;
    }
    if (event.target.id === 'log-form') { await runFormAction(event.target, () => submitLog(event.target)); return; }
    if (event.target.id === 'prep-form') { await runFormAction(event.target, () => savePrep(event.target, true)); return; }
    const submittedForm = event.target;
    if (submittedForm.dataset.submitting === 'true') return;
    submittedForm.dataset.submitting = 'true';
    try {
    if (event.target.id === 'reply-form') {
      const data = new FormData(event.target); const text = String(data.get('text') || '').trim(); const teacher = String(data.get('teacher') || '');
      if (!text) return;
      const result = PREVIEW_MODE ? null : await API.addTalentMessage(teacher, state.ui.month, text);
      if (!PREVIEW_MODE && !result?.ok) { toast(`回覆未送出：${result?.error || '請稍後重試'}`, 'danger'); return; }
      if (result?.conversation) {
        const index = state.conversations.findIndex(item => item.id === result.conversation.id);
        if (index >= 0) state.conversations[index] = result.conversation; else state.conversations.push(result.conversation);
      } else {
        let thread = state.conversations.find(item => normalizeName(item.teacher) === normalizeName(teacher) && item.month === state.ui.month);
        if (!thread) { thread = { id: uid('chat'), teacher, month: state.ui.month, messages: [] }; state.conversations.push(thread); }
        thread.messages.push({ author: currentUser.nickname, role: isTeacher() ? 'teacher' : 'manager', text, at: new Date().toISOString() });
      }
      persist(); renderApp(); toast('回覆已送出');
    }
    if (event.target.id === 'score-form') {
      const data = new FormData(event.target); const teacher = String(data.get('teacher'));
      const scores = Object.fromEntries(KPI_DIMENSIONS.map(item => [item.key, Number(data.get(item.key) || 0)]));
      const reason = String(data.get('reason') || '').trim();
      if (!reason) { toast('請填寫評分說明', 'danger'); return; }
      const scorePayload = { scores, reason, published: Boolean(event.target.elements.published.checked) };
      const result = PREVIEW_MODE ? null : await API.saveTalentScore(teacher, state.ui.month, scorePayload);
      if (!PREVIEW_MODE && !result?.ok) { toast(`評分未儲存：${result?.error || '請稍後重試'}`, 'danger'); return; }
      let record = state.scores.find(item => normalizeName(item.teacher) === normalizeName(teacher) && item.month === state.ui.month);
      const saved = result?.score || { teacher, month: state.ui.month, ...scorePayload };
      if (!record) { state.scores.push(saved); record = saved; }
      else Object.assign(record, saved);
      persist(); closeDrawer(); renderApp(); toast('月度 KPI 評分已儲存');
    }
    if (event.target.id === 'bonus-approval-form') {
      const data = new FormData(event.target);
      const lessonId = String(data.get('lessonId') || '');
      const approvedNew = Number(data.get('approvedNewCount') || 0);
      const approvedRenewal = Number(data.get('approvedRenewalCount') || 0);
      const note = String(data.get('note') || '').trim();
      const item = state.logs.find(log => log.id === lessonId);
      if (!item) { toast('找不到要核准的課堂', 'danger'); return; }
      if ((approvedNew !== Number(item.newCount || 0) || approvedRenewal !== Number(item.renewalCount || 0)) && !note) {
        toast('核准數與申報數不同時，請填寫調整原因', 'danger');
        return;
      }
      const result = PREVIEW_MODE
        ? { ok: true, lesson: { ...item, approvedNewCount: approvedNew, approvedRenewalCount: approvedRenewal, bonusApproval: 'approved', bonusApprovalNote: note } }
        : await API.approveTalentBonus(lessonId, approvedNew, approvedRenewal, note);
      if (!result?.ok) { toast(`尚未核准：${result?.error || '請稍後重試'}`, 'danger'); return; }
      Object.assign(item, result.lesson);
      persist(); closeDialog(); renderApp(); toast('新生與續報人數已核准');
    }
    } finally {
      delete submittedForm.dataset.submitting;
    }
  });

  document.addEventListener('input', event => {
    if (TEST_VIEW_MODE) return;
    if (event.target.closest('#log-form')) {
      event.target.closest('#log-form').dataset.dirty = 'true';
      window.clearTimeout(window.__talentDraftTimer);
      window.__talentDraftTimer = window.setTimeout(() => { captureLogDraft(); updateLogFormLogic(); }, 450);
    }
  });

  document.addEventListener('change', async event => {
    if (event.target.matches('[data-month-picker]')) {
      state.ui.month = event.target.value || currentMonth();
      persist('月份已切換');
      renderApp();
      return;
    }
    const fileInput = event.target.closest('[data-upload-category]');
    if (fileInput) {
      if (TEST_VIEW_MODE) {
        fileInput.value = '';
        toast('測試視角不能上傳正式附件', 'warning');
        return;
      }
      const form = fileInput.closest('#log-form');
      if (form) form.dataset.dirty = 'true';
      await handleTalentFiles(fileInput);
    }
    if (event.target.closest('#log-form')) {
      event.target.closest('#log-form').dataset.dirty = 'true';
      updateLogFormLogic();
    }
  });

  document.addEventListener('keydown', event => {
    if (event.key !== 'Escape') return;
    if ($('#dialog-root').children.length) closeDialog(); else if ($('#drawer-root').children.length) closeDrawer();
  });

  window.addEventListener('beforeunload', () => {
    const form = $('#log-form');
    if (form?.dataset.dirty === 'true') captureLogDraft(false);
  });

  renderApp();
  if (!PREVIEW_MODE) window.setTimeout(loadCloudData, 0);
})();
