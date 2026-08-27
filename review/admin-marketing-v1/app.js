(function () {
  'use strict';

  const APP_VERSION = 2;
  const PREVIEW_MODE = ['127.0.0.1', 'localhost'].includes(window.location.hostname)
    || window.location.hostname.endsWith('.trycloudflare.com');
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));
  const esc = value => String(value == null ? '' : value).replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
  })[char]);
  const icon = (name, size = 18) => `<i data-lucide="${name}" width="${size}" height="${size}" aria-hidden="true"></i>`;
  const nl2br = value => esc(value).replace(/\n/g, '<br>');
  const todayIso = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Taipei' });
  const currentMonth = () => todayIso().slice(0, 7);
  const uid = prefix => `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const formatDate = value => {
    const parts = String(value || '').slice(0, 10).split('-');
    return parts.length === 3 ? `${Number(parts[1])}/${Number(parts[2])}` : String(value || '');
  };
  const formatDateTime = value => {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? '' : date.toLocaleString('zh-TW', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });
  };
  const reviewRibbon = $('#review-ribbon');
  if (reviewRibbon) reviewRibbon.hidden = !PREVIEW_MODE;

  const WORKSPACES = {
    'admin-marketing': { label: '行政美宣', role: 'worker', start: 'today', icon: 'megaphone' },
    'admin-marketing-manager': { label: '行政美宣主管', role: 'manager', start: 'dashboard', icon: 'clipboard-list' },
  };
  const STAFF = [
    { nickname: '皮皮老師', role: 'admin_staff', department: '北區教室', subtype: 'marketing', employment_type: 'pt', work_assignments: ['talent-pt', 'admin-marketing'] },
    { nickname: '小魚主管', role: 'manager', department: '北區教室', employment_type: 'manager', work_assignments: ['anqin-manager', 'talent-payroll', 'admin-marketing-manager'] },
    { nickname: '柏翰', role: 'admin', department: '總部', employment_type: 'admin', work_assignments: ['anqin-manager', 'talent-payroll', 'admin-marketing-manager'] },
  ];
  const KPI = [
    { key: 'daily', label: '每日行政與訊息處理', max: 20 },
    { key: 'promotion', label: '每週美宣產出與完成證據', max: 25 },
    { key: 'followup', label: '繳費與家長事項追蹤', max: 15 },
    { key: 'deadline', label: '期限與活動專案管理', max: 20 },
    { key: 'environment', label: '環境、公告與素材管理', max: 10 },
    { key: 'supervisor', label: '正確性、主動回報與溝通', max: 10 },
  ];
  const CATEGORIES = [
    ['message', '家長／LINE 訊息'], ['admin', '行政作業'], ['payment', '繳費追蹤'],
    ['parent_followup', '家長事項追蹤'], ['video', '影片宣傳'], ['photo_post', '照片宣傳'],
    ['poster', '海報／圖卡'], ['design', '課程／活動設計'], ['social_schedule', '社群排程'],
    ['photography', '活動拍攝'], ['materials', '宣傳素材整理'], ['announcement', '公告／資訊更新'],
    ['project', '活動專案'], ['other', '其他交辦'],
  ];
  const PROJECT_STAGES = ['企劃', '素材準備', '文案', '美宣', '主管審核', '修改', '排程', '發布'];
  const ENVIRONMENT_CHECKS = [
    ['counter', '櫃檯整潔'], ['documents', '文件與文具定位'], ['floor', '地板清潔'],
    ['furniture', '桌椅整齊'], ['cabinets', '櫃子物品定位'], ['supplies', '公共用品補充'],
    ['publicArea', '公共區域無雜物'], ['announcements', '過期公告／海報已更新'],
    ['shoeCabinet', '鞋櫃、鞋子與拖鞋定位'], ['entrance', '門口無垃圾與落葉'],
    ['outside', '外圍雜草、紙箱與雜物已整理'], ['signage', '招牌與宣傳物整齊'],
  ];
  const TRIAL_STATUSES = [
    ['waiting_contact', '待第一次詢問'], ['contacted', '已聯絡'], ['considering', '考慮中'],
    ['followup_scheduled', '已約下次聯絡'], ['converted', '已報名一期'], ['not_enrolled', '未報名／暫不考慮'],
  ];
  const TRIAL_BONUS_AMOUNT = 50;
  const NAV = {
    worker: [
      { route: 'today', label: '今日總覽', icon: 'layout-dashboard' },
      { route: 'trials', label: '試上追蹤', icon: 'user-round-search' },
      { route: 'daily', label: '工作日誌', icon: 'notebook-pen' },
      { route: 'tuesday', label: '週二追蹤', icon: 'calendar-check-2' },
      { route: 'environment', label: '環境檢核', icon: 'sparkles' },
      { route: 'projects', label: '專案進度', icon: 'gantt-chart-square' },
      { route: 'performance', label: '我的 KPI', icon: 'gauge' },
      { route: 'guide', label: '使用規則', icon: 'book-open-text' },
    ],
    manager: [
      { route: 'dashboard', label: '主管總覽', icon: 'layout-dashboard' },
      { route: 'trials', label: '試上與獎金', icon: 'badge-dollar-sign' },
      { route: 'reviews', label: '工作審查', icon: 'scan-search' },
      { route: 'assignments', label: '交辦事項', icon: 'list-todo' },
      { route: 'weekly', label: '每週 KPI', icon: 'chart-no-axes-column-increasing' },
      { route: 'projects', label: '專案追蹤', icon: 'gantt-chart-square' },
      { route: 'evaluation', label: '月度評核', icon: 'clipboard-check' },
      { route: 'cloud', label: '雲端資料', icon: 'folder-open' },
      { route: 'guide', label: '制度規則', icon: 'book-open-text' },
    ],
  };

  function normalizeName(value) {
    return String(value || '').trim().replace(/\s+/g, '').replace(/(?:老師|主管)$/, '').toLowerCase();
  }
  function authSession() {
    try { return window.AUTH?.getSession?.() || null; } catch (error) { return null; }
  }
  function findStaff(value) {
    const key = normalizeName(value);
    return STAFF.find(person => normalizeName(person.nickname) === key) || null;
  }
  function requestedWorkspace() {
    const value = new URLSearchParams(window.location.search).get('workspace');
    return WORKSPACES[value] ? value : 'admin-marketing';
  }
  function resolveIdentity() {
    const session = authSession();
    const requested = requestedWorkspace();
    if (session) {
      const person = { ...(findStaff(session.nickname) || {}), ...session };
      const assignments = window.KPI_WORKSPACES?.getAssignments?.(person) || [];
      const available = assignments.filter(item => item.group === 'admin-marketing');
      if (available.length) {
        return { session, user: person, workspace: available.some(item => item.id === requested) ? requested : available[0].id };
      }
    }
    if (!PREVIEW_MODE) return { session: null, user: null, workspace: '' };
    const params = new URLSearchParams(window.location.search);
    const fallback = requested === 'admin-marketing-manager' ? '小魚主管' : '皮皮老師';
    return { session: null, user: findStaff(params.get('reviewUser')) || findStaff(fallback), workspace: requested };
  }

  const identity = resolveIdentity();
  const currentUser = identity.user;
  const workspaceId = identity.workspace;
  const workspace = WORKSPACES[workspaceId];
  if (!currentUser || !workspace) {
    $('#app').innerHTML = '<main class="auth-required"><img src="../../shared/icons/logo.png" alt="布拉克星球 Logo"><h1>請先登入正式帳號</h1><p>正在返回登入頁面…</p></main>';
    const root = window.AUTH?.relativeRoot?.() || '../../';
    window.setTimeout(() => window.location.replace(`${root}index.html?return=${encodeURIComponent('review/admin-marketing-v1/index.html')}`), 300);
    return;
  }
  window.KPI_REVIEW_USER = currentUser;
  const TEST_VIEW_MODE = Boolean(identity.session?.impersonate);
  const canOpenTestView = !TEST_VIEW_MODE && currentUser.role === 'admin' && normalizeName(currentUser.nickname) === '柏翰';
  const isManager = workspace.role === 'manager';
  const workerName = '皮皮老師';
  if (reviewRibbon && TEST_VIEW_MODE) {
    reviewRibbon.hidden = false;
    reviewRibbon.innerHTML = `<img src="../../shared/icons/logo.png" alt="" aria-hidden="true"><strong>柏翰測試視角</strong><span aria-hidden="true"></span>目前查看：${esc(currentUser.nickname)} · 唯讀 <button type="button" class="test-view-exit" data-action="exit-impersonation">換老師</button>`;
  }

  function weekBounds(dateValue = todayIso()) {
    const date = new Date(`${dateValue}T12:00:00+08:00`);
    const day = date.getDay() || 7;
    const start = new Date(date);
    start.setDate(start.getDate() - day + 1);
    const end = new Date(start);
    end.setDate(end.getDate() + 6);
    const iso = date => date.toLocaleDateString('sv-SE', { timeZone: 'Asia/Taipei' });
    return { start: iso(start), end: iso(end), key: iso(start) };
  }
  function createSeed() {
    return {
      version: APP_VERSION,
      ui: { route: workspace.start, month: currentMonth(), trialStatus: 'all', lastSavedAt: '' },
      records: [],
      users: [STAFF[0]],
      settings: { supervisor: '小魚', videoWeeklyTarget: 2, photoWeeklyTarget: 3, trialBonusAmount: TRIAL_BONUS_AMOUNT, kpi: KPI },
      drafts: {},
    };
  }
  const sharedStorageKey = 'bp_admin_marketing_v1_shared';
  const personalStorageKey = `bp_admin_marketing_v1_personal_${encodeURIComponent(currentUser.nickname)}_${workspaceId}`;
  function loadState() {
    const seed = createSeed();
    if (!PREVIEW_MODE) return seed;
    try {
      const shared = JSON.parse(localStorage.getItem(sharedStorageKey) || 'null');
      const personal = JSON.parse(localStorage.getItem(personalStorageKey) || 'null');
      return {
        ...seed,
        ...(shared && shared.version === APP_VERSION ? {
          records: Array.isArray(shared.records) ? shared.records : [],
          users: Array.isArray(shared.users) ? shared.users : seed.users,
          settings: { ...seed.settings, ...(shared.settings || {}) },
        } : {}),
        ...(personal && personal.version === APP_VERSION ? {
          ui: { ...seed.ui, ...(personal.ui || {}) },
          drafts: personal.drafts || {},
        } : {}),
      };
    } catch (error) { return seed; }
  }
  let state = loadState();
  let cloud = { status: PREVIEW_MODE ? 'preview' : 'loading', message: PREVIEW_MODE ? '審查資料只保存在這台裝置' : '正在讀取正式資料' };
  let driveCloud = {
    status: PREVIEW_MODE ? 'preview' : 'idle',
    message: PREVIEW_MODE ? '內部審查不連正式雲端' : '',
    folders: [],
  };

  function persist(message = '已儲存') {
    state.ui.lastSavedAt = new Date().toISOString();
    if (PREVIEW_MODE) {
      try {
        localStorage.setItem(sharedStorageKey, JSON.stringify({ version: APP_VERSION, records: state.records, users: state.users, settings: state.settings }));
        localStorage.setItem(personalStorageKey, JSON.stringify({ version: APP_VERSION, ui: state.ui, drafts: state.drafts }));
      } catch (error) { console.warn(error); }
    }
    const node = $('#save-state');
    if (node) node.innerHTML = `${icon('circle-check', 14)}<span>${esc(message)}</span>`;
    hydrateIcons();
  }
  function hydrateIcons() {
    try { window.lucide?.createIcons?.(); } catch (error) { /* icon failure must not block forms */ }
  }
  function toast(message, tone = 'success') {
    const root = $('#toast-root');
    if (!root) return;
    const node = document.createElement('div');
    node.className = `toast ${tone}`;
    node.textContent = message;
    root.appendChild(node);
    window.setTimeout(() => node.remove(), 3200);
  }
  function upsertLocal(record) {
    const index = state.records.findIndex(item => item.id === record.id);
    if (index >= 0) state.records[index] = record;
    else state.records.push(record);
    state.records.sort((a, b) => String(b.updatedAt || b.date || '').localeCompare(String(a.updatedAt || a.date || '')));
  }
  function records(type) { return state.records.filter(item => item.type === type); }
  function workerRecords(type) { return records(type).filter(item => normalizeName(item.nickname) === normalizeName(workerName)); }
  function todayDaily() { return workerRecords('daily').find(item => item.date === todayIso()) || null; }
  function currentTuesday() {
    const week = weekBounds();
    return workerRecords('tuesday').find(item => item.weekKey === week.key || (item.date >= week.start && item.date <= week.end)) || null;
  }
  function currentEnvironment() { return workerRecords('environment').find(item => item.date === todayIso()) || null; }
  function trialRecords() { return workerRecords('trial').slice().sort((a, b) => String(b.updatedAt || b.date).localeCompare(String(a.updatedAt || a.date))); }
  function todayTrialMarker() { return workerRecords('trial_day').find(item => item.date === todayIso() && item.noTrial === true) || null; }
  function trialStatusLabel(status) { return TRIAL_STATUSES.find(item => item[0] === status)?.[1] || '待追蹤'; }
  function trialInterestLabel(value) { return ({ high: '意願高', medium: '考慮中', low: '意願低', unknown: '尚未確認' })[value] || '尚未確認'; }
  function maskContact(value) {
    const text = String(value || '').trim();
    if (text.length <= 4) return text ? `${text.slice(0, 1)}***` : '';
    return `${text.slice(0, 3)}***${text.slice(-2)}`;
  }
  function trialIdentity(studentName, contactRef) {
    const name = String(studentName || '').replace(/\s+/g, '').toLowerCase();
    const contact = String(contactRef || '').replace(/[\s\-()]/g, '').toLowerCase();
    return name && contact ? `${name}|${contact}` : '';
  }
  function trialBonusBadge(item) {
    if (item.bonusStatus === 'approved') return '<span class="badge success">首報獎金 50 元已核准</span>';
    if (item.bonusStatus === 'pending_review') return '<span class="badge warning">50 元待主管確認</span>';
    if (item.bonusStatus === 'rejected') return '<span class="badge danger">獎金不符合</span>';
    if (item.status === 'converted' && item.firstEnrollment !== true) return '<span class="badge">非首次報名</span>';
    return '';
  }
  function trialMonthSummary(month = state.ui.month) {
    const all = trialRecords();
    const monthItems = all.filter(item => String(item.date || '').slice(0, 7) === month || String(item.paymentDate || '').slice(0, 7) === month);
    const trialItems = all.filter(item => String(item.date || '').slice(0, 7) === month);
    const approved = all.filter(item => item.bonusStatus === 'approved' && String(item.paymentDate || '').slice(0, 7) === month);
    const pending = all.filter(item => item.bonusStatus === 'pending_review' && String(item.paymentDate || '').slice(0, 7) === month);
    const converted = trialItems.filter(item => item.status === 'converted');
    const due = all.filter(item => !['converted', 'not_enrolled'].includes(item.status) && item.nextFollowupDate && item.nextFollowupDate <= todayIso());
    return {
      items: monthItems, trials: trialItems.length, converted: converted.length,
      conversionRate: trialItems.length ? Math.round(converted.length / trialItems.length * 100) : 0,
      approved, pending, due,
      bonus: approved.reduce((sum, item) => sum + Number(item.bonusAmount || TRIAL_BONUS_AMOUNT), 0),
    };
  }
  function categoryLabel(key) { return CATEGORIES.find(item => item[0] === key)?.[1] || key || '未分類'; }
  function statusBadge(status) {
    const map = {
      completed: ['完成', 'success'], submitted: ['已送出', 'success'], approved: ['已通過', 'success'],
      in_progress: ['進行中', 'info'], active: ['進行中', 'info'], planning: ['規劃中', 'info'],
      waiting: ['待確認', 'warning'], pending: ['待處理', 'warning'], needs_action: ['待改善', 'danger'],
      needs_revision: ['需補充', 'danger'], paused: ['暫停', 'warning'], published: ['已公布', 'success'], draft: ['草稿', 'warning'],
      confirmed: ['已確認', 'success'], pending_review: ['待主管確認', 'warning'], rejected: ['不符合', 'danger'],
      waiting_contact: ['待第一次詢問', 'warning'], contacted: ['已聯絡', 'info'], considering: ['考慮中', 'info'],
      followup_scheduled: ['已約下次聯絡', 'info'], converted: ['已報名一期', 'success'], not_enrolled: ['未報名', ''],
    };
    const item = map[status] || [status || '未設定', ''];
    return `<span class="badge ${item[1]}">${esc(item[0])}</span>`;
  }
  function evidenceReady(item) { return Array.isArray(item.evidence) && item.evidence.some(file => file.url || PREVIEW_MODE); }
  function weeklySummary() {
    const week = weekBounds();
    const recordsInWeek = workerRecords('daily').filter(record => record.date >= week.start && record.date <= week.end);
    const items = recordsInWeek.flatMap(record => record.items || []);
    const completed = workerRecords('daily').flatMap(record => (record.items || []).map(item => ({
      ...item,
      completedOn: item.actualDate || record.date,
    }))).filter(item => item.status === 'completed' && item.completedOn >= week.start && item.completedOn <= week.end && evidenceReady(item));
    const video = completed.filter(item => item.category === 'video').length;
    const photo = completed.filter(item => item.category === 'photo_post').length;
    const assignments = workerRecords('assignment');
    const openAssignments = assignments.filter(item => item.status !== 'completed');
    const overdue = openAssignments.filter(item => item.dueDate && item.dueDate < todayIso()).length;
    const projects = workerRecords('project').filter(item => item.status !== 'completed');
    return { week, video, photo, openAssignments, overdue, projects, tuesday: currentTuesday() };
  }
  function publishedScore(month = state.ui.month) {
    return workerRecords('score').find(item => item.month === month && item.published) || null;
  }
  function conversation(month = state.ui.month) {
    return workerRecords('message').find(item => item.month === month) || { messages: [] };
  }

  async function loadCloudData(notify = false) {
    if (PREVIEW_MODE) return { ok: true };
    cloud = { status: 'loading', message: '正在讀取正式資料' };
    renderApp();
    const result = await window.API?.getAdminMarketingWorkspaceData?.({ viewer: currentUser.nickname });
    if (!result?.ok) {
      cloud = { status: 'error', message: result?.error || '行政美宣資料載入失敗' };
      renderApp();
      if (notify) toast(cloud.message, 'danger');
      return result || { ok: false };
    }
    state.records = Array.isArray(result.records) ? result.records : [];
    state.users = Array.isArray(result.users) ? result.users : [];
    state.settings = { ...state.settings, ...(result.settings || {}) };
    cloud = { status: 'ready', message: `已同步 ${state.records.length} 筆紀錄` };
    persist('雲端已同步');
    renderApp();
    if (notify) toast(cloud.message);
    return result;
  }

  async function loadDriveFolders(notify = false) {
    if (!isManager) return { ok: false, error: '此工作區沒有主管權限' };
    if (PREVIEW_MODE) {
      driveCloud = { status: 'preview', message: '內部審查不連正式雲端', folders: [] };
      renderApp();
      return { ok: true, folders: [] };
    }
    driveCloud = { status: 'loading', message: '正在讀取雲端資料夾', folders: [] };
    renderApp();
    const result = await window.API?.getAdminMarketingDriveFolders?.({ viewer: currentUser.nickname });
    if (!result?.ok) {
      driveCloud = { status: 'error', message: result?.error || '雲端資料夾載入失敗', folders: [] };
      renderApp();
      if (notify) toast(driveCloud.message, 'danger');
      return result || { ok: false };
    }
    driveCloud = {
      status: 'ready',
      message: `已找到 ${result.folders?.length || 0} 位行政人員的資料夾`,
      folders: Array.isArray(result.folders) ? result.folders : [],
    };
    renderApp();
    if (notify) toast('雲端資料已更新');
    return result;
  }

  function renderTopbar() {
    const initial = String(currentUser.nickname || '?').replace(/老師|主管/g, '').slice(0, 2);
    return `<header class="topbar">
      <div class="brand"><img src="../../shared/icons/logo.png" alt="布拉克星球 Logo"><div class="brand-copy"><strong>布拉克星球KPI系統</strong><span>行政美宣工作台</span></div></div>
      <div class="save-state" id="save-state">${icon(cloud.status === 'error' ? 'cloud-off' : 'cloud', 14)}<span>${esc(cloud.message)}</span></div>
      <button type="button" class="profile-button" data-action="profile" aria-label="帳號與工作切換" title="帳號與工作切換">${esc(initial)}</button>
    </header>`;
  }
  function renderNav() {
    const items = NAV[workspace.role];
    return `<nav class="nav-list">${items.map(item => `<button type="button" class="nav-button ${state.ui.route === item.route ? 'is-active' : ''}" data-route="${item.route}">${icon(item.icon)}<span>${esc(item.label)}</span></button>`).join('')}</nav>`;
  }
  function renderMobileNav() {
    const items = NAV[workspace.role];
    const visible = items.slice(0, 4);
    return `<nav class="mobile-nav" aria-label="主要功能">${visible.map(item => `<button type="button" class="nav-button ${state.ui.route === item.route ? 'is-active' : ''}" data-route="${item.route}">${icon(item.icon)}<span>${esc(item.label)}</span></button>`).join('')}<button type="button" class="nav-button ${items.slice(4).some(item => item.route === state.ui.route) ? 'is-active' : ''}" data-action="more-nav">${icon('menu')}<span>更多</span></button></nav>`;
  }
  function pageHead(title, subtitle, actions = '') {
    return `<div class="page-head"><div><h1>${esc(title)}</h1><p>${esc(subtitle)}</p></div>${actions ? `<div class="page-actions">${actions}</div>` : ''}</div>`;
  }
  function emptyState(iconName, title, text, action = '') {
    return `<div class="empty"><div class="empty-icon">${icon(iconName, 24)}</div><strong>${esc(title)}</strong><p>${esc(text)}</p>${action ? `<div class="mt-16">${action}</div>` : ''}</div>`;
  }
  function metric(label, value, note, iconName = 'chart-no-axes-column-increasing') {
    return `<article class="metric"><div class="metric-top"><span>${esc(label)}</span><span class="metric-icon">${icon(iconName, 19)}</span></div><div class="metric-value">${value}</div><div class="metric-note">${esc(note)}</div></article>`;
  }

  function renderWorkerDashboard() {
    const daily = todayDaily();
    const weekly = weeklySummary();
    const env = currentEnvironment();
    const todayTrials = trialRecords().filter(item => item.date === todayIso());
    const noTrial = todayTrialMarker();
    const items = daily?.items || [];
    const unfinished = items.filter(item => item.status !== 'completed').length;
    return `<section class="page">${pageHead('今日總覽', `${formatDate(todayIso())} · 先處理期限，再留下完成證據`, `<button class="button primary" data-action="open-work-item">${icon('plus')}新增工作</button>`)}
      <div class="grid cols-4">
        ${metric('今日工作日誌', daily ? `${items.length} 項` : '尚未填', daily ? `${unfinished} 項尚未完成` : '工作日需留下紀錄', 'notebook-pen')}
        ${metric('本週影片', `${weekly.video}/2`, weekly.video >= 2 ? '已達每週標準' : `還差 ${2 - weekly.video} 支完成證據`, 'video')}
        ${metric('本週照片宣傳', `${weekly.photo}/3`, weekly.photo >= 3 ? '已達每週標準' : `還差 ${3 - weekly.photo} 則完成證據`, 'images')}
        ${metric('主管交辦', weekly.openAssignments.length, weekly.overdue ? `${weekly.overdue} 項已逾期` : '目前無逾期', 'list-todo')}
      </div>
      <div class="grid cols-2 mt-16">
        <section class="panel"><div class="panel-head"><div><div class="panel-title">${icon('calendar-clock')}今天先做</div><div class="panel-subtitle">依期限與尚未完成狀態排列</div></div></div><div class="panel-body flush">${renderPriorityList()}</div></section>
        <section class="panel"><div class="panel-head"><div><div class="panel-title">${icon('circle-check-big')}今日完整度</div><div class="panel-subtitle">只顯示今天需要確認的項目</div></div></div><div class="panel-body"><div class="check-list">
          <div class="check-row">${icon(daily ? 'circle-check' : 'circle', 19)}<span>訊息確認與工作日誌 ${daily ? '已留存' : '尚未完成'}</span></div>
          <div class="check-row">${icon(todayTrials.length || noTrial ? 'circle-check' : 'circle', 19)}<span>今日試上 ${todayTrials.length ? `已登錄 ${todayTrials.length} 位` : noTrial ? '已確認無試上' : '尚未確認'}</span></div>
          <div class="check-row">${icon(env ? 'circle-check' : 'circle', 19)}<span>一樓環境 ${env ? (env.status === 'needs_action' ? '已記錄待改善' : '已檢核') : '尚未檢核'}</span></div>
          <div class="check-row">${icon(weekly.tuesday ? 'circle-check' : 'calendar-days', 19)}<span>本週繳費追蹤 ${weekly.tuesday ? '已完成' : '週二需完成'}</span></div>
        </div></div></section>
      </div>
    </section>`;
  }

  function renderPriorityList() {
    const assignments = workerRecords('assignment').filter(item => item.status !== 'completed');
    const work = workerRecords('daily').flatMap(record => (record.items || []).filter(item => item.status !== 'completed').map(item => ({
      id: item.id, recordId: record.id, title: item.title, dueDate: item.dueDate, status: item.status,
      source: '工作日誌', progress: item.progress, startedAt: record.date,
    })));
    const list = assignments.concat(work).sort((a, b) => String(a.dueDate || '9999').localeCompare(String(b.dueDate || '9999'))).slice(0, 6);
    if (!list.length) return emptyState('circle-check-big', '沒有待處理工作', '新增工作或主管交辦後，系統會依期限排在這裡。');
    return `<div class="record-list" style="padding:12px">${list.map(item => `<article class="record-card"><div class="record-head"><div class="record-title"><strong>${esc(item.title)}</strong><small>${esc(item.source || '主管交辦')} · ${item.startedAt ? `建立 ${formatDate(item.startedAt)} · ` : ''}${item.dueDate ? `期限 ${formatDate(item.dueDate)}` : '尚未設定期限'}</small></div>${statusBadge(item.status)}</div><div class="progress"><span style="width:${Number(item.progress || 0)}%"></span></div><div class="progress-label"><span>目前進度</span><strong>${Number(item.progress || 0)}%</strong></div><div class="record-actions">${item.source === '工作日誌' ? `<button class="button small" data-action="open-work-item" data-id="${esc(item.id)}" data-record-id="${esc(item.recordId)}">更新進度</button>` : `<button class="button small" data-action="update-assignment" data-id="${esc(item.id)}">更新進度</button>`}</div></article>`).join('')}</div>`;
  }

  function renderTrialsPage() {
    const summary = trialMonthSummary();
    const todayItems = trialRecords().filter(item => item.date === todayIso());
    const noTrial = todayTrialMarker();
    const filtered = summary.items.filter(item => state.ui.trialStatus === 'all' || item.status === state.ui.trialStatus);
    const controls = `<label class="field compact-control"><span class="visually-hidden">月份</span><input type="month" id="month-filter" value="${esc(state.ui.month)}"></label><label class="field compact-control"><span class="visually-hidden">追蹤狀態</span><select id="trial-status-filter"><option value="all">全部狀態</option>${TRIAL_STATUSES.map(([value,label]) => `<option value="${value}" ${state.ui.trialStatus === value ? 'selected' : ''}>${esc(label)}</option>`).join('')}</select></label>${isManager ? `<button class="button" data-action="print">${icon('printer')}列印月報</button>` : `<button class="button" data-action="mark-no-trial" ${todayItems.length || noTrial ? 'disabled' : ''}>${icon('calendar-x-2')}今日無試上</button><button class="button primary" data-action="open-trial">${icon('user-round-plus')}登錄試上</button>`}`;
    const todayState = isManager ? '' : `<div class="notice ${todayItems.length || noTrial ? '' : 'warning'}"><span>${icon(todayItems.length || noTrial ? 'circle-check' : 'circle-alert')}</span><div>${todayItems.length ? `今天已登錄 ${todayItems.length} 位試上學生。` : noTrial ? '今天已確認沒有試上學生。' : '今天尚未登錄試上學生，也尚未確認「今日無試上」。'}</div></div>`;
    return `<section class="page trial-page">${pageHead(isManager ? '試上與首報獎金' : '試上追蹤', isManager ? '小魚與柏翰只需確認候選名單，不必重複輸入資料' : '當日登錄一次，後續聯絡、報名與獎金都更新同一筆', controls)}
      ${todayState}
      <div class="grid cols-4 mt-16">
        ${metric('本月試上', summary.trials, '依試上日期統計', 'user-round-search')}
        ${metric('轉一期', summary.converted, `轉換率 ${summary.conversionRate}%`, 'user-round-check')}
        ${metric('待追蹤', summary.due.length, summary.due.length ? '含今日到期與逾期' : '目前沒有到期項目', 'calendar-clock')}
        ${metric('已核准獎金', `$${summary.bonus}`, `${summary.approved.length} 人；另 ${summary.pending.length} 人待審`, 'badge-dollar-sign')}
      </div>
      ${isManager && summary.pending.length ? `<div class="notice warning mt-16">${icon('badge-dollar-sign')}<div><strong>${summary.pending.length} 筆首報獎金待確認</strong><br>確認首次一期、繳費證明與未曾領取後再核准。</div></div>` : ''}
      <section class="panel mt-16"><div class="panel-head"><div><div class="panel-title">${icon('users-round')}${esc(state.ui.month)} 試上名單</div><div class="panel-subtitle">報名月份跨月時仍會列入，核准獎金歸在繳費月份</div></div><span class="badge">${filtered.length} 筆</span></div><div class="panel-body flush">${filtered.length ? `<div class="trial-list">${filtered.map(renderTrialCard).join('')}</div>` : emptyState('user-round-search', '這個月份沒有符合的紀錄', isManager ? '行政登錄試上後會出現在這裡。' : '有試上時當日新增；沒有試上請按「今日無試上」。')}</div></section>
      ${isManager ? renderTrialBonusTable(summary) : ''}
    </section>`;
  }

  function renderTrialCard(item) {
    const overdue = !['converted', 'not_enrolled'].includes(item.status) && item.nextFollowupDate && item.nextFollowupDate < todayIso();
    const lastFollowup = (item.followups || []).slice(-1)[0];
    const action = isManager
      ? `<button class="button small" data-action="view-trial" data-id="${esc(item.id)}">${icon('eye')}查看</button>${['pending_review','rejected'].includes(item.bonusStatus) ? `<button class="button small teal" data-action="review-trial-bonus" data-id="${esc(item.id)}">${icon('badge-check')}${item.bonusStatus === 'rejected' ? '重新審核' : '確認獎金'}</button>` : ''}`
      : `<button class="button small" data-action="open-trial" data-id="${esc(item.id)}">${icon('pencil')}更新</button>`;
    return `<article class="trial-row"><div class="trial-main"><div class="record-head"><div class="record-title"><strong>${esc(item.studentName)}</strong><small>${formatDate(item.date)} 試上 · ${esc(item.course)} · ${esc(item.teacher)}</small></div>${statusBadge(item.status)}</div><div class="trial-meta"><span>${icon('phone',14)}${esc(maskContact(item.contactRef))}</span><span>${icon('sparkles',14)}${esc(trialInterestLabel(item.interest))}</span>${item.nextFollowupDate && !['converted','not_enrolled'].includes(item.status) ? `<span class="${overdue ? 'text-danger' : ''}">${icon('calendar-clock',14)}${overdue ? '已逾期 ' : '下次 '}${formatDate(item.nextFollowupDate)}</span>` : ''}</div>${lastFollowup ? `<p class="record-copy trial-last"><strong>最近追蹤：</strong>${esc(lastFollowup.note)}</p>` : ''}<div class="record-actions">${trialBonusBadge(item)}${action}</div></div></article>`;
  }

  function renderTrialBonusTable(summary) {
    const rows = summary.approved.concat(summary.pending).sort((a,b) => String(a.paymentDate).localeCompare(String(b.paymentDate)));
    return `<section class="panel mt-16 bonus-report"><div class="panel-head"><div><div class="panel-title">${icon('receipt-text')}首報獎金月報</div><div class="panel-subtitle">只列首次試上轉一期；續報不計</div></div><strong class="bonus-total">$${summary.bonus}</strong></div><div class="panel-body flush">${rows.length ? `<div class="table-scroll"><table class="data-table"><thead><tr><th>學生</th><th>試上</th><th>繳費</th><th>正式課程</th><th>審核</th><th>金額</th></tr></thead><tbody>${rows.map(item => `<tr><td>${esc(item.studentName)}</td><td>${formatDate(item.date)}</td><td>${formatDate(item.paymentDate)}</td><td>${esc(item.enrollmentCourse)}</td><td>${item.bonusStatus === 'approved' ? '已核准' : '待確認'}</td><td>${item.bonusStatus === 'approved' ? '$50' : '—'}</td></tr>`).join('')}</tbody></table></div>` : emptyState('receipt-text','本月尚無獎金明細','符合條件並經主管核准後，會自動列入本月總額。')}</div></section>`;
  }

  function renderDailyPage() {
    const list = workerRecords('daily').slice().sort((a, b) => String(b.date).localeCompare(String(a.date)));
    const today = todayDaily();
    return `<section class="page">${pageHead('每日工作日誌', '做了什麼、做到哪裡、何時完成，未完成就留下下一個期限', `<button class="button primary" data-action="open-work-item">${icon('plus')}新增工作</button>`)}
      ${today ? `<div class="notice">${icon('message-circle-check')}<div>今天已確認家長訊息、官方 LINE 與班級群組。${today.messages?.unresolved ? `待主管確認：${esc(today.messages.unresolved)}` : '目前沒有未處理訊息。'}</div></div>` : `<div class="notice warning">${icon('circle-alert')}<div>今天尚未建立工作日誌。新增第一項工作時，會一起完成訊息確認；跨日未完成工作仍可從今日總覽更新。</div></div>`}
      <div class="stack mt-16">${list.length ? list.map(renderDailyRecord).join('') : `<section class="panel">${emptyState('notebook-pen', '還沒有工作日誌', '新增工作後會依日期整合，不需要重複填同一句話。', `<button class="button primary" data-action="open-work-item">新增第一項工作</button>`)}</section>`}</div>
    </section>`;
  }
  function renderDailyRecord(record) {
    const items = record.items || [];
    return `<section class="panel"><div class="panel-head"><div><div class="panel-title">${icon('calendar-days')}${esc(record.date === todayIso() ? '今天' : formatDate(record.date))}</div><div class="panel-subtitle">${items.length} 項工作 · ${items.filter(item => item.status === 'completed').length} 項完成</div></div>${record.reviewStatus ? statusBadge(record.reviewStatus) : statusBadge(record.status)}</div><div class="panel-body"><div class="record-list">${items.map(item => `<article class="record-card"><div class="record-head"><div class="record-title"><strong>${esc(item.title)}</strong><small>${esc(categoryLabel(item.category))}${item.dueDate ? ` · 預計 ${formatDate(item.dueDate)}` : ''}${item.actualDate ? ` · 完成 ${formatDate(item.actualDate)}` : ''}</small></div>${statusBadge(item.status)}</div><p class="record-copy">${nl2br(item.completedToday)}</p><div class="progress"><span style="width:${Number(item.progress || 0)}%"></span></div><div class="progress-label"><span>${item.remaining ? `剩餘：${esc(item.remaining)}` : '已完成'}</span><strong>${Number(item.progress || 0)}%</strong></div><div class="record-actions"><span class="badge ${evidenceReady(item) ? 'success' : ''}">${icon('paperclip', 13)}${(item.evidence || []).length} 份證據</span>${record.date === todayIso() || item.status !== 'completed' ? `<button class="button small" data-action="open-work-item" data-id="${esc(item.id)}" data-record-id="${esc(record.id)}">${record.date === todayIso() ? '編輯' : '更新進度'}</button>` : ''}</div></article>`).join('')}</div>${record.reviewComment ? `<div class="notice ${record.reviewStatus === 'needs_revision' ? 'danger' : ''} mt-16">${icon('message-square-text')}<div><strong>主管回覆</strong><br>${nl2br(record.reviewComment)}</div></div>` : ''}</div></section>`;
  }

  function renderTuesdayPage() {
    const item = currentTuesday();
    const week = weekBounds();
    return `<section class="page">${pageHead('每週二行政確認', `${formatDate(week.start)}–${formatDate(week.end)} · 繳費、續課與家長後續集中處理`, `<button class="button primary" data-action="open-tuesday">${icon(item ? 'pencil' : 'plus')}${item ? '更新本週' : '開始本週確認'}</button>`)}
      ${item ? `<div class="grid cols-2"><section class="panel"><div class="panel-head"><div><div class="panel-title">${icon('badge-check')}固定檢核</div><div class="panel-subtitle">完成日期 ${formatDate(item.date)}</div></div>${statusBadge(item.status)}</div><div class="panel-body"><div class="check-list">${[['paymentList','需繳費學生名單'],['expiringStudents','即將到期／需續課學生'],['unpaidParents','尚未繳費家長'],['remindersSent','提醒與後續追蹤']].map(([key,label]) => `<div class="check-row">${icon(item.checks?.[key] ? 'circle-check' : 'circle-x', 19)}<span>${esc(label)}</span></div>`).join('')}</div></div></section><section class="panel"><div class="panel-head"><div><div class="panel-title">${icon('users-round')}家長事項</div><div class="panel-subtitle">不以已傳訊息視為完成，追蹤到結案</div></div></div><div class="panel-body flush">${renderFollowups(item.followups || [])}</div></section></div>` : `<section class="panel">${emptyState('calendar-check-2', '本週尚未完成週二確認', '完成名單、續課、未繳費與提醒後再送出；未結案事項一定要設定下次追蹤日期。', `<button class="button primary" data-action="open-tuesday">開始確認</button>`)}</section>`}
    </section>`;
  }
  function renderFollowups(items) {
    if (!items.length) return emptyState('circle-check-big', '本週沒有待追蹤家長', '若有特殊狀況，再新增學生／家長與下次追蹤日期。');
    return `<div class="record-list" style="padding:12px">${items.map(item => `<article class="record-card"><div class="record-head"><div class="record-title"><strong>${esc(item.person)}</strong><small>${item.status === 'closed' ? '已結案' : `下次追蹤 ${formatDate(item.nextDate)}`}</small></div>${statusBadge(item.status === 'closed' ? 'completed' : 'in_progress')}</div><p class="record-copy"><strong>目前：</strong>${esc(item.situation)}<br><strong>已處理：</strong>${esc(item.handled)}</p><div class="record-actions"><button class="button small" data-action="open-tuesday" data-followup-id="${esc(item.id)}">編輯</button></div></article>`).join('')}</div>`;
  }

  function renderEnvironmentPage() {
    const item = currentEnvironment();
    const passed = item ? ENVIRONMENT_CHECKS.filter(([key]) => item.checks?.[key]).length : 0;
    return `<section class="page">${pageHead('東橋一樓環境', '用小型檢核快速確認；有問題才補充說明與改善期限', `<button class="button primary" data-action="open-environment">${icon(item ? 'pencil' : 'check-square')}${item ? '更新今日檢核' : '開始今日檢核'}</button>`)}
      <section class="panel"><div class="panel-head"><div><div class="panel-title">${icon('sparkles')}今日環境狀態</div><div class="panel-subtitle">櫃檯、鞋櫃、門口與外部環境</div></div>${item ? statusBadge(item.status) : '<span class="badge warning">尚未檢核</span>'}</div><div class="panel-body">${item ? `<div class="grid cols-3">${ENVIRONMENT_CHECKS.map(([key,label]) => `<div class="check-row">${icon(item.checks?.[key] ? 'circle-check' : 'circle-x', 19)}<span>${esc(label)}</span></div>`).join('')}</div><div class="notice ${item.status === 'needs_action' ? 'danger' : ''} mt-16">${icon(item.status === 'needs_action' ? 'triangle-alert' : 'badge-check')}<div>${item.status === 'needs_action' ? `${esc(item.issue)}，改善期限 ${formatDate(item.improvementDue)}` : `12 項全部通過，已附 ${(item.evidence || []).length} 份照片。`}</div></div>` : emptyState('sparkles', '今天尚未檢核', '按一次即可勾選各區域，不顯示大面積照相框。')}</div></section>
      ${item ? `<div class="mt-16">${metric('已通過項目', `${passed}/12`, item.status === 'needs_action' ? '未通過項目已建立改善期限' : '今日環境完整', 'circle-check-big')}</div>` : ''}
    </section>`;
  }

  function renderProjectsPage() {
    const list = workerRecords('project');
    return `<section class="page">${pageHead(isManager ? '活動與宣傳專案' : '專案進度', '企劃到發布逐階段排程，避免活動前集中趕工', isManager ? '' : `<button class="button primary" data-action="open-project">${icon('plus')}新增專案</button>`)}
      <div class="stack">${list.length ? list.map(renderProjectCard).join('') : `<section class="panel">${emptyState('gantt-chart-square', '目前沒有進行中的專案', '招生活動、體驗週、節慶活動或新班招生，都可建立完整八階段排程。', isManager ? '' : `<button class="button primary" data-action="open-project">新增第一個專案</button>`)}</section>`}</div>
    </section>`;
  }
  function renderProjectCard(item) {
    const complete = (item.stages || []).filter(stage => stage.status === 'completed').length;
    const next = (item.stages || []).find(stage => stage.status !== 'completed');
    return `<section class="panel"><div class="panel-head"><div><div class="panel-title">${icon('gantt-chart-square')}${esc(item.title)}</div><div class="panel-subtitle">${esc(item.projectType)}${next?.dueDate ? ` · 下一階段 ${next.name} ${formatDate(next.dueDate)}` : ''}</div></div>${item.reviewStatus ? statusBadge(item.reviewStatus) : statusBadge(item.status)}</div><div class="panel-body"><div class="progress"><span style="width:${Math.round(complete / 8 * 100)}%"></span></div><div class="progress-label"><span>${complete}/8 階段完成</span><strong>${Math.round(complete / 8 * 100)}%</strong></div><div class="stage-list mt-16">${(item.stages || []).map(stage => `<div class="check-row">${icon(stage.status === 'completed' ? 'circle-check' : stage.status === 'active' ? 'loader-circle' : 'circle', 19)}<span><strong>${esc(stage.name)}</strong>${stage.dueDate ? ` · 預計 ${formatDate(stage.dueDate)}` : ''}${stage.actualDate ? ` · 實際 ${formatDate(stage.actualDate)}` : ''}</span></div>`).join('')}</div><div class="record-actions">${isManager ? `<button class="button teal" data-action="review-record" data-id="${esc(item.id)}">${icon('scan-search')}審查專案</button>` : `<button class="button" data-action="open-project" data-id="${esc(item.id)}">${icon('pencil')}更新專案</button>`}</div>${item.reviewComment ? `<div class="notice ${item.reviewStatus === 'needs_revision' ? 'danger' : ''} mt-16">${icon('message-square-text')}<div>${nl2br(item.reviewComment)}</div></div>` : ''}</div></section>`;
  }

  function renderPerformancePage() {
    const weekly = weeklySummary();
    const trials = trialMonthSummary();
    const score = publishedScore();
    const messages = conversation().messages || [];
    return `<section class="page">${pageHead('我的 KPI', `${state.ui.month} · 系統彙整工作證據，主管評核公布後才能看到正式分數`)}
      <div class="grid cols-4">${metric('影片宣傳', `${weekly.video}/2`, '本週完成並有證據', 'video')}${metric('照片宣傳', `${weekly.photo}/3`, '本週完成並有證據', 'images')}${metric('首報獎金', `$${trials.bonus}`, `${trials.approved.length} 人已核准 · ${trials.pending.length} 人待審`, 'badge-dollar-sign')}${metric('逾期交辦', weekly.overdue, weekly.overdue ? '請主動說明原因與新期限' : '目前沒有逾期', 'clock-alert')}</div>
      <div class="grid cols-2 mt-16"><section class="panel"><div class="panel-head"><div><div class="panel-title">${icon('gauge')}主管評核</div><div class="panel-subtitle">100 分制</div></div>${score ? `<span class="badge success">${score.total} 分</span>` : '<span class="badge warning">尚未公布</span>'}</div><div class="panel-body">${score ? renderKpiBars(score.scores) : emptyState('lock-keyhole', '主管尚未公布本月評核', '日誌與證據仍會持續自動彙整，不需要月底再次整理。')}</div></section><section class="panel"><div class="panel-head"><div><div class="panel-title">${icon('messages-square')}與主管對話</div><div class="panel-subtitle">主管：小魚</div></div></div><div class="panel-body">${renderMessages(messages)}<form id="message-form" class="mt-16"><div class="field"><label for="message-text">回覆主管</label><textarea id="message-text" name="text" placeholder="補充進度、說明原因或回覆主管建議"></textarea></div><div class="record-actions"><button class="button teal" type="submit">${icon('send')}送出回覆</button></div></form></div></section></div>
    </section>`;
  }
  function renderKpiBars(scores = {}) {
    return KPI.map(item => { const value = Number(scores[item.key] || 0); return `<div class="kpi-bar"><div class="kpi-name">${esc(item.label)}</div><div class="kpi-track"><span style="width:${Math.round(value / item.max * 100)}%"></span></div><div class="kpi-score">${value}/${item.max}</div></div>`; }).join('');
  }
  function renderMessages(messages) {
    if (!messages.length) return `<div class="empty" style="padding:18px 0"><strong>目前沒有對話</strong><p>主管評核或追蹤事項可直接在這裡來回回覆。</p></div>`;
    return `<div class="record-list">${messages.map(item => `<article class="record-card"><div class="record-title"><strong>${esc(item.author)}</strong><small>${formatDateTime(item.at)}</small></div><p class="record-copy">${nl2br(item.text)}</p></article>`).join('')}</div>`;
  }

  function renderManagerDashboard() {
    const weekly = weeklySummary();
    const trialSummary = trialMonthSummary();
    const reviewable = workerRecords('daily').filter(item => !item.reviewStatus).length + workerRecords('tuesday').filter(item => !item.reviewStatus).length + workerRecords('environment').filter(item => !item.reviewStatus).length + workerRecords('project').filter(item => !item.reviewStatus).length;
    const projects = workerRecords('project').filter(item => item.status !== 'completed');
    return `<section class="page">${pageHead('行政美宣主管總覽', '小魚主管 · 只看期限、缺件與需要決策的事項', `<button class="button primary" data-action="open-assignment">${icon('plus')}新增交辦</button>`)}
      <div class="grid cols-4">${metric('待審紀錄', reviewable, '工作日誌、週二追蹤與環境', 'scan-search')}${metric('首報獎金待審', trialSummary.pending.length, `本月已核准 $${trialSummary.bonus}`, 'badge-dollar-sign')}${metric('本週美宣', `${weekly.video + weekly.photo}/5`, `影片 ${weekly.video}/2 · 照片 ${weekly.photo}/3`, 'images')}${metric('逾期事項', weekly.overdue + trialSummary.due.length, `交辦 ${weekly.overdue} · 試上追蹤 ${trialSummary.due.length}`, 'clock-alert')}</div>
      <div class="grid cols-2 mt-16"><section class="panel"><div class="panel-head"><div><div class="panel-title">${icon('triangle-alert')}主管現在要處理</div><div class="panel-subtitle">逾期、待補充與待審優先</div></div></div><div class="panel-body flush">${renderManagerAlerts()}</div></section><section class="panel"><div class="panel-head"><div><div class="panel-title">${icon('gantt-chart-square')}進行中專案</div><div class="panel-subtitle">目前 ${projects.length} 個</div></div></div><div class="panel-body flush">${projects.length ? `<div class="record-list" style="padding:12px">${projects.slice(0,5).map(item => `<article class="record-card"><div class="record-head"><div class="record-title"><strong>${esc(item.title)}</strong><small>${esc(item.projectType)}</small></div>${statusBadge(item.status)}</div></article>`).join('')}</div>` : emptyState('circle-check-big','沒有進行中專案','新專案建立後會顯示各階段期限。')}</div></section></div>
    </section>`;
  }
  function renderManagerAlerts() {
    const assignments = workerRecords('assignment').filter(item => item.status !== 'completed' && item.dueDate < todayIso()).map(item => ({ ...item, label: '交辦逾期' }));
    const reviews = workerRecords('daily').filter(item => !item.reviewStatus).map(item => ({ ...item, title: `${formatDate(item.date)} 工作日誌`, label: '待審' }));
    const bonuses = trialRecords().filter(item => item.bonusStatus === 'pending_review').map(item => ({ ...item, title: `${item.studentName} 首報獎金`, label: '50 元待確認' }));
    const list = bonuses.concat(assignments, reviews).slice(0, 8);
    if (!list.length) return emptyState('circle-check-big', '目前沒有急件', '新的待審、逾期或需補充事項會排在這裡。');
    return `<div class="record-list" style="padding:12px">${list.map(item => `<article class="record-card"><div class="record-head"><div class="record-title"><strong>${esc(item.title)}</strong><small>${esc(item.label)}${item.dueDate ? ` · ${formatDate(item.dueDate)}` : ''}</small></div>${statusBadge(item.bonusStatus || item.status)}</div><div class="record-actions">${item.type === 'trial' ? `<button class="button small teal" data-action="review-trial-bonus" data-id="${esc(item.id)}">確認獎金</button>` : item.type === 'daily' ? `<button class="button small" data-action="review-record" data-id="${esc(item.id)}">開啟審查</button>` : `<button class="button small" data-route="assignments">查看交辦</button>`}</div></article>`).join('')}</div>`;
  }

  function renderReviewsPage() {
    const list = state.records.filter(item => ['daily', 'tuesday', 'environment', 'project'].includes(item.type));
    return `<section class="page">${pageHead('工作審查', '查看完整內容與證據，再決定通過或退回補充')}
      <div class="stack">${list.length ? list.map(item => `<section class="panel"><div class="panel-head"><div><div class="panel-title">${icon(item.type === 'daily' ? 'notebook-pen' : item.type === 'tuesday' ? 'calendar-check-2' : item.type === 'project' ? 'gantt-chart-square' : 'sparkles')}${esc(item.type === 'daily' ? `${formatDate(item.date)} 工作日誌` : item.type === 'tuesday' ? `${formatDate(item.date)} 週二確認` : item.type === 'project' ? item.title : `${formatDate(item.date)} 環境檢核`)}</div><div class="panel-subtitle">${esc(item.nickname || workerName)} · 更新 ${formatDateTime(item.updatedAt)}</div></div>${item.reviewStatus ? statusBadge(item.reviewStatus) : '<span class="badge warning">待審</span>'}</div><div class="panel-body"><div class="record-actions"><button class="button teal" data-action="review-record" data-id="${esc(item.id)}">${icon('scan-search')}查看完整內容</button></div></div></section>`).join('') : `<section class="panel">${emptyState('scan-search','目前沒有可審紀錄','皮皮送出工作日誌、週二追蹤、環境檢核或專案後會出現在這裡。')}</section>`}</div>
    </section>`;
  }

  function renderAssignmentsPage() {
    const list = workerRecords('assignment');
    return `<section class="page">${pageHead('主管交辦事項', '每件工作都有交辦日、期限、進度、實際完成日與證據', `<button class="button primary" data-action="open-assignment">${icon('plus')}新增交辦</button>`)}
      <div class="stack">${list.length ? list.map(item => `<section class="panel"><div class="panel-head"><div><div class="panel-title">${icon('list-todo')}${esc(item.title)}</div><div class="panel-subtitle">交辦 ${formatDate(item.date)} · 期限 ${formatDate(item.dueDate)} · ${esc(item.nickname)}</div></div>${statusBadge(item.status)}</div><div class="panel-body"><p class="record-copy">${nl2br(item.detail)}</p><div class="progress"><span style="width:${Number(item.progress || 0)}%"></span></div><div class="progress-label"><span>${item.progressNote ? esc(item.progressNote) : '尚未更新進度'}</span><strong>${Number(item.progress || 0)}%</strong></div><div class="record-actions"><button class="button small" data-action="open-assignment" data-id="${esc(item.id)}">編輯交辦</button></div></div></section>`).join('') : `<section class="panel">${emptyState('list-todo','尚未建立交辦事項','新增後會直接出現在皮皮的今日優先工作。',`<button class="button primary" data-action="open-assignment">新增第一項交辦</button>`)}</section>`}</div>
    </section>`;
  }

  function renderWeeklyPage() {
    const summary = weeklySummary();
    const dailyDates = new Set(workerRecords('daily').filter(item => item.date >= summary.week.start && item.date <= summary.week.end).map(item => item.date));
    return `<section class="page">${pageHead('每週 KPI', `${formatDate(summary.week.start)}–${formatDate(summary.week.end)} · 系統直接從每日工作與證據彙整`)}
      <div class="grid cols-4">${metric('工作日誌', `${dailyDates.size} 天`, '本週已送出日期', 'notebook-pen')}${metric('影片完成', `${summary.video}/2`, '需可發布且有證據', 'video')}${metric('照片宣傳', `${summary.photo}/3`, '需可發布且有證據', 'images')}${metric('週二行政', summary.tuesday ? '已完成' : '未完成', summary.tuesday ? `${(summary.tuesday.followups || []).filter(item => item.status === 'open').length} 項持續追蹤` : '需完成繳費與續課確認', 'calendar-check-2')}</div>
      <section class="panel mt-16"><div class="panel-head"><div><div class="panel-title">${icon('badge-check')}完成判定</div><div class="panel-subtitle">單純拍攝素材不列入完成</div></div></div><div class="panel-body"><div class="check-list"><div class="check-row">${icon(summary.video >= 2 ? 'circle-check' : 'circle',19)}<span>影片每週至少 2 支，完成至可發布狀態並附證據</span></div><div class="check-row">${icon(summary.photo >= 3 ? 'circle-check' : 'circle',19)}<span>照片宣傳每週至少 3 則，單張、多張或圖卡皆可</span></div><div class="check-row">${icon(summary.tuesday ? 'circle-check' : 'circle',19)}<span>週二完成繳費、到期、續課與未繳費追蹤</span></div><div class="check-row">${icon(summary.overdue === 0 ? 'circle-check' : 'circle-alert',19)}<span>交辦逾期 ${summary.overdue} 項；逾期須說明原因與新期限</span></div></div></div></section>
    </section>`;
  }

  function renderEvaluationPage() {
    const existing = workerRecords('score').find(item => item.month === state.ui.month) || { scores: {} };
    const messages = conversation().messages || [];
    return `<section class="page">${pageHead('月度評核', '工作數據由系統彙整，主管只評判品質、結果與需要改善的地方', `<label class="field" style="min-width:150px"><span class="visually-hidden">月份</span><input type="month" id="month-filter" value="${esc(state.ui.month)}"></label><button class="button" data-action="print">${icon('printer')}列印</button>`)}
      <div class="grid cols-2"><section class="panel"><div class="panel-head"><div><div class="panel-title">${icon('clipboard-check')}100 分評核</div><div class="panel-subtitle">分數輸入就在項目旁，不需橫向滑動</div></div><span class="badge ${existing.published ? 'success' : 'warning'}">${existing.published ? '已公布' : '草稿'}</span></div><div class="panel-body"><form id="score-form"><div class="stack">${KPI.map(item => `<div class="record-card"><div class="record-head"><div class="record-title"><strong>${esc(item.label)}</strong><small>滿分 ${item.max}</small></div><div class="field" style="width:92px"><label for="score-${item.key}">分數</label><input id="score-${item.key}" name="${item.key}" type="number" min="0" max="${item.max}" value="${Number(existing.scores?.[item.key] || 0)}" required></div></div></div>`).join('')}</div><div class="field full mt-16"><label for="score-comment">主管建議</label><textarea id="score-comment" name="comment" placeholder="寫出做得好的地方、需要改善的地方與下個月重點">${esc(existing.comment || '')}</textarea></div><label class="check-row mt-16"><input type="checkbox" name="published" ${existing.published ? 'checked' : ''}><span>公布給皮皮查看</span></label><div class="record-actions"><button class="button primary" type="submit">${icon('save')}儲存評核</button></div></form></div></section><section class="panel"><div class="panel-head"><div><div class="panel-title">${icon('messages-square')}主管與行政對話</div><div class="panel-subtitle">公布評核後仍可來回補充</div></div></div><div class="panel-body">${renderMessages(messages)}<form id="message-form" class="mt-16"><div class="field"><label for="message-text">給皮皮的訊息</label><textarea id="message-text" name="text" placeholder="詢問進度、說明評核或提供修正方向"></textarea></div><div class="record-actions"><button class="button teal" type="submit">${icon('send')}送出訊息</button></div></form></div></section></div>
    </section>`;
  }

  function recordEvidenceFiles() {
    const files = [];
    workerRecords('daily').forEach(record => (record.items || []).forEach(item => {
      (item.evidence || []).forEach(file => files.push({ ...file, label: item.title, date: record.date }));
    }));
    ['environment', 'project', 'assignment'].forEach(type => workerRecords(type).forEach(record => {
      (record.evidence || []).forEach(file => files.push({ ...file, label: record.title || (type === 'environment' ? '環境檢核' : '主管交辦'), date: record.date || record.actualDate }));
    }));
    const seen = new Set();
    return files.filter(file => {
      const key = String(file.fileId || file.url || `${file.fileName}-${file.date}`);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    }).sort((a, b) => String(b.date || '').localeCompare(String(a.date || ''))).slice(0, 12);
  }

  function renderCloudPage() {
    const folder = driveCloud.folders.find(item => normalizeName(item.nickname) === normalizeName(workerName)) || {};
    const files = recordEvidenceFiles();
    const loading = driveCloud.status === 'loading';
    return `<section class="page">${pageHead('雲端資料', '皮皮老師的行政美宣素材與完成證據', `<button class="button" data-action="refresh-drive" ${loading ? 'disabled' : ''}>${icon('refresh-cw')}${loading ? '讀取中' : '重新整理'}</button>`)}
      <section class="panel"><div class="panel-head"><div><div class="panel-title">${icon('folder-open')}皮皮老師</div><div class="panel-subtitle">行政美宣 · 主管小魚</div></div>${driveCloud.status === 'error' ? '<span class="badge danger">載入失敗</span>' : driveCloud.status === 'ready' ? '<span class="badge success">已連線</span>' : '<span class="badge warning">審查模式</span>'}</div><div class="panel-body">
        <div class="record-actions cloud-actions">
          ${folder.materialUrl ? `<a class="button teal" href="${esc(folder.materialUrl)}" target="_blank" rel="noopener">${icon('folder')}檔案與素材${icon('external-link', 14)}</a>` : `<span class="button is-disabled">${icon('folder')}檔案與素材尚未建立</span>`}
          ${folder.evidenceUrl ? `<a class="button teal" href="${esc(folder.evidenceUrl)}" target="_blank" rel="noopener">${icon('folder-check')}照片證據${icon('external-link', 14)}</a>` : `<span class="button is-disabled">${icon('folder-check')}照片證據尚未建立</span>`}
        </div>
        ${driveCloud.status === 'error' ? `<div class="notice danger mt-16">${icon('cloud-off')}<div>${esc(driveCloud.message)}</div></div>` : (!folder.materialUrl && !folder.evidenceUrl ? `<div class="notice mt-16">${icon('info')}<div>皮皮第一次上傳行政美宣檔案後，資料夾會自動出現。</div></div>` : '')}
      </div></section>
      <section class="panel mt-16"><div class="panel-head"><div><div class="panel-title">${icon('paperclip')}近期附件</div><div class="panel-subtitle">可直接開啟最近 12 份完成證據</div></div><span class="badge">${files.length} 份</span></div><div class="panel-body flush">${files.length ? `<div class="record-list cloud-file-list">${files.map(file => `<a class="cloud-file" href="${esc(file.url)}" target="_blank" rel="noopener"><span class="cloud-file-icon">${icon('file-image')}</span><span><strong>${esc(file.fileName || '未命名附件')}</strong><small>${esc(file.label || '行政美宣證據')}${file.date ? ` · ${formatDate(file.date)}` : ''}</small></span>${icon('external-link', 16)}</a>`).join('')}</div>` : emptyState('paperclip', '目前沒有附件', '皮皮上傳完成證據後，主管可直接從這裡開啟。')}</div></section>
    </section>`;
  }

  function renderGuidePage() {
    return `<section class="page">${pageHead(isManager ? '行政美宣 KPI 制度' : '行政美宣使用規則', '說明集中放在這一頁，正式填寫畫面保持乾淨')}
      <div class="grid cols-2"><section class="panel"><div class="panel-head"><div><div class="panel-title">${icon('notebook-pen')}每日怎麼填</div></div></div><div class="panel-body"><div class="check-list"><div class="check-row"><span><strong>今日完成</strong><br>只寫今天實際完成或推進的內容。</span></div><div class="check-row"><span><strong>目前進度</strong><br>用百分比表示，不用重複今日完成的句子。</span></div><div class="check-row"><span><strong>尚未完成</strong><br>寫剩餘工作並設定預計完成日。</span></div><div class="check-row"><span><strong>實際完成</strong><br>完成時補上日期及可判讀證據。</span></div></div></div></section><section class="panel"><div class="panel-head"><div><div class="panel-title">${icon('images')}美宣完成標準</div></div></div><div class="panel-body"><div class="notice warning">${icon('circle-alert')}<div>拍到素材不等於完成。影片、照片分享、海報與排程需達到可發布狀態。</div></div><div class="check-list mt-16"><div class="check-row"><span>每週至少 2 支完成影片</span></div><div class="check-row"><span>每週至少 3 則照片宣傳</span></div><div class="check-row"><span>證據可用發布、排程、海報／圖卡或影片完成截圖</span></div></div></div></section></div>
      <section class="panel mt-16"><div class="panel-head"><div><div class="panel-title">${icon('badge-dollar-sign')}試上轉首次一期獎金</div><div class="panel-subtitle">獎金與 KPI 分數分開計算</div></div><span class="badge success">每人 50 元</span></div><div class="panel-body"><div class="check-list"><div class="check-row"><span><strong>當日登錄</strong><br>有試上就建立學生；沒有試上按「今日無試上」，不用在工作日誌再抄一次。</span></div><div class="check-row"><span><strong>更新同一筆</strong><br>後續聯絡、家長回覆與報名結果都留在原學生紀錄。</span></div><div class="check-row"><span><strong>符合條件</strong><br>第一次正式報名一期、完成繳費、有追蹤紀錄及證明，續報不計。</span></div><div class="check-row"><span><strong>主管確認</strong><br>每位學生終身只核發一次；小魚或柏翰審核通過後才列入月獎金。</span></div></div></div></section>
      <section class="panel mt-16"><div class="panel-head"><div><div class="panel-title">${icon('gauge')}100 分評核結構</div><div class="panel-subtitle">工作量不是唯一分數，期限、結果、回報與證據同時判讀</div></div></div><div class="panel-body">${KPI.map(item => `<div class="kpi-bar"><div class="kpi-name">${esc(item.label)}</div><div class="kpi-track"><span style="width:${item.max}%"></span></div><div class="kpi-score">${item.max} 分</div></div>`).join('')}</div></section>
      <section class="panel mt-16"><div class="panel-head"><div><div class="panel-title">${icon('siren')}需要主動回報</div></div></div><div class="panel-body"><div class="grid cols-3">${['家長客訴','繳費異常','家長長時間未回覆','宣傳工作延遲','活動資料不足','設備異常','環境無法自行改善','工作可能逾期'].map(item => `<div class="check-row"><span>${esc(item)}</span></div>`).join('')}</div></div></section>
    </section>`;
  }

  function renderRoute() {
    if (workspace.role === 'worker') {
      if (state.ui.route === 'trials') return renderTrialsPage();
      if (state.ui.route === 'daily') return renderDailyPage();
      if (state.ui.route === 'tuesday') return renderTuesdayPage();
      if (state.ui.route === 'environment') return renderEnvironmentPage();
      if (state.ui.route === 'projects') return renderProjectsPage();
      if (state.ui.route === 'performance') return renderPerformancePage();
      if (state.ui.route === 'guide') return renderGuidePage();
      return renderWorkerDashboard();
    }
    if (state.ui.route === 'trials') return renderTrialsPage();
    if (state.ui.route === 'reviews') return renderReviewsPage();
    if (state.ui.route === 'assignments') return renderAssignmentsPage();
    if (state.ui.route === 'weekly') return renderWeeklyPage();
    if (state.ui.route === 'projects') return renderProjectsPage();
    if (state.ui.route === 'evaluation') return renderEvaluationPage();
    if (state.ui.route === 'cloud') return renderCloudPage();
    if (state.ui.route === 'guide') return renderGuidePage();
    return renderManagerDashboard();
  }
  function renderApp() {
    if (!PREVIEW_MODE && cloud.status === 'loading') {
      $('#app').innerHTML = `${renderTopbar()}<main class="loading-page"><div><img src="../../shared/icons/logo.png" alt=""><h1>正在讀取正式資料</h1><p>完成前不開放填寫，避免覆蓋既有內容。</p></div></main>`;
      hydrateIcons();
      return;
    }
    if (!PREVIEW_MODE && cloud.status === 'error') {
      $('#app').innerHTML = `${renderTopbar()}<main class="loading-page"><div><img src="../../shared/icons/logo.png" alt=""><h1>資料載入失敗</h1><p>${esc(cloud.message)}</p><button class="button primary" data-action="retry-cloud">重新載入</button></div></main>`;
      hydrateIcons();
      return;
    }
    $('#app').innerHTML = `${renderTopbar()}<div class="layout"><aside class="sidebar"><div class="sidebar-title">${esc(workspace.label)}工作區</div>${renderNav()}<div class="sidebar-foot">${window.KPI_WORKSPACES?.renderQuickSwitcher?.(currentUser, { currentId: workspaceId }) || ''}</div></aside><main class="main">${renderRoute()}</main></div>${renderMobileNav()}`;
    hydrateIcons();
    if (isManager && state.ui.route === 'cloud' && driveCloud.status === 'idle') {
      window.setTimeout(() => loadDriveFolders(), 0);
    }
  }

  function showDialog(content, wide = false) {
    $('#dialog-root').innerHTML = `<div class="dialog-backdrop" data-action="close-dialog"><section class="dialog ${wide ? 'wide' : ''}" role="dialog" aria-modal="true" aria-labelledby="dialog-title" data-dialog>${content}</section></div>`;
    hydrateIcons();
    window.setTimeout(() => $('#dialog-root input, #dialog-root textarea, #dialog-root button')?.focus(), 20);
  }
  function closeDialog() { $('#dialog-root').innerHTML = ''; }
  function dialogShell(title, subtitle, body, submitLabel = '', formId = '') {
    return `<div class="dialog-head"><div><h2 id="dialog-title">${esc(title)}</h2><p>${esc(subtitle)}</p></div><button type="button" class="button icon-only" data-action="close-dialog" aria-label="關閉">${icon('x')}</button></div>${formId ? `<form id="${formId}">` : ''}<div class="dialog-body">${body}</div><div class="dialog-foot"><button type="button" class="button" data-action="close-dialog">取消</button>${submitLabel ? `<button type="submit" class="button primary">${icon('save')}${esc(submitLabel)}</button>` : ''}</div>${formId ? '</form>' : ''}`;
  }

  function openWorkItem(itemId = '', recordId = '') {
    const daily = (recordId ? workerRecords('daily').find(record => record.id === recordId) : null) || todayDaily();
    const item = (daily?.items || []).find(entry => entry.id === itemId) || state.drafts.workItem || {};
    const messages = daily?.messages || state.drafts.messages || {};
    const messageFields = `<div class="grid cols-3"><label class="check-row"><input type="checkbox" name="parentChecked" ${messages.parentChecked ? 'checked' : ''}><span>家長訊息已確認</span></label><label class="check-row"><input type="checkbox" name="officialLineChecked" ${messages.officialLineChecked ? 'checked' : ''}><span>官方 LINE 已確認</span></label><label class="check-row"><input type="checkbox" name="groupChecked" ${messages.groupChecked ? 'checked' : ''}><span>班級群組已確認</span></label></div><div class="form-grid mt-16"><div class="field full"><label for="unresolved">需主管確認／無法立即處理</label><textarea id="unresolved" name="unresolved" placeholder="沒有可留白；若有，寫清楚目前狀況與需要主管決定的內容">${esc(messages.unresolved || '')}</textarea></div><label class="check-row field full"><input type="checkbox" name="reported" ${messages.reported ? 'checked' : ''}><span>有未解決事項時，我已主動回報主管</span></label></div>`;
    const messageBlock = daily
      ? `<details class="compact-details"><summary>${icon('message-circle-check')}當日訊息已確認，需要時可展開修改</summary><div class="compact-details-body">${messageFields}</div></details>`
      : `<h3>今日訊息確認 <span class="required">*</span></h3>${messageFields}`;
    const body = `${daily ? '' : `<div class="notice">${icon('info')}<div>同一天新增的工作會整合在同一份日誌。美宣標記完成時必須附可判讀的完成證據。</div></div>`}${messageBlock}
      <h3>本項工作</h3><input type="hidden" name="itemId" value="${esc(item.id || '')}"><input type="hidden" name="recordId" value="${esc(daily?.id || '')}"><div class="form-grid"><div class="field"><label for="work-category">工作類型 <span class="required">*</span></label><select id="work-category" name="category" required><option value="">請選擇</option>${CATEGORIES.map(([key,label]) => `<option value="${key}" ${item.category === key ? 'selected' : ''}>${esc(label)}</option>`).join('')}</select></div><div class="field"><label for="work-title">工作內容 <span class="required">*</span></label><input id="work-title" name="title" value="${esc(item.title || '')}" placeholder="例：9 月體驗週海報" required></div><div class="field full"><label for="completed-today">本次完成／處理 <span class="required">*</span></label><textarea id="completed-today" name="completedToday" placeholder="寫本次實際完成或推進的內容" required>${esc(item.completedToday || '')}</textarea></div><div class="field"><label for="work-progress">目前進度：<span id="progress-value">${Number(item.progress || 0)}%</span></label><input id="work-progress" name="progress" type="range" min="0" max="100" step="5" value="${Number(item.progress || 0)}"></div><div class="field"><label for="work-status">狀態 <span class="required">*</span></label><select id="work-status" name="status"><option value="in_progress" ${item.status === 'in_progress' || !item.status ? 'selected' : ''}>進行中</option><option value="waiting" ${item.status === 'waiting' ? 'selected' : ''}>等待主管／外部資料</option><option value="completed" ${item.status === 'completed' ? 'selected' : ''}>已完成</option></select></div><div class="field full"><label for="remaining">尚未完成／剩餘工作 <span class="required">*</span> <span class="conditional">未完成時</span></label><textarea id="remaining" name="remaining" placeholder="例：剩餘課程時間與 QR Code 確認">${esc(item.remaining || '')}</textarea></div><div class="field"><label for="due-date">預計完成日期 <span class="required">*</span> <span class="conditional">未完成時</span></label><input id="due-date" name="dueDate" type="date" value="${esc(item.dueDate || '')}"></div><div class="field"><label for="actual-date">實際完成日期 <span class="required">*</span> <span class="conditional">完成時</span></label><input id="actual-date" name="actualDate" type="date" value="${esc(item.actualDate || '')}"></div><div class="field full"><label for="work-evidence">完成證據 <span class="required">*</span> <span class="conditional">美宣完成時</span></label><input id="work-evidence" name="evidence" type="file" multiple accept="image/*,video/*,.pdf,.ppt,.pptx"><div class="field-help">可一次選多個檔案；已發布、排程、海報／圖卡或影片完成截圖皆可。</div>${(item.evidence || []).length ? `<div class="file-list">${item.evidence.map(file => `<span class="badge success">${icon('paperclip',12)}${esc(file.fileName)}</span>`).join('')}</div>` : ''}</div></div>`;
    showDialog(dialogShell(itemId ? '編輯工作紀錄' : '新增工作紀錄', '保留可供主管判讀的進度、期限與證據', body, '儲存工作', 'work-item-form'), true);
  }

  function openTrial(id = '') {
    const item = trialRecords().find(entry => entry.id === id) || {};
    const isNew = !item.id;
    const approved = item.bonusStatus === 'approved';
    const body = `<input type="hidden" name="trialId" value="${esc(item.id || '')}"><div class="form-grid">
      <div class="field"><label for="trial-date">試上日期 <span class="required">*</span></label><input id="trial-date" name="date" type="date" max="${todayIso()}" value="${esc(item.date || todayIso())}" ${isNew ? '' : 'readonly'} required><div class="field-help">新紀錄需於試上當日建立。</div></div>
      <div class="field"><label for="trial-student">學生姓名 <span class="required">*</span></label><input id="trial-student" name="studentName" value="${esc(item.studentName || '')}" ${approved ? 'readonly' : ''} required></div>
      <div class="field"><label for="trial-course">試上課程 <span class="required">*</span></label><input id="trial-course" name="course" value="${esc(item.course || '')}" placeholder="例：機器人入門" required></div>
      <div class="field"><label for="trial-teacher">授課老師 <span class="required">*</span></label><input id="trial-teacher" name="teacher" value="${esc(item.teacher || '')}" required></div>
      <div class="field"><label for="trial-contact">家長聯絡方式／識別資料 <span class="required">*</span></label><input id="trial-contact" name="contactRef" value="${esc(item.contactRef || '')}" placeholder="手機末碼、LINE 名稱或其他可辨識資料" ${approved ? 'readonly' : ''} required></div>
      <div class="field"><label for="trial-interest">目前意願</label><select id="trial-interest" name="interest">${[['unknown','尚未確認'],['high','意願高'],['medium','考慮中'],['low','意願低']].map(([value,label]) => `<option value="${value}" ${item.interest === value ? 'selected' : ''}>${label}</option>`).join('')}</select></div>
      <div class="field"><label for="trial-status">追蹤狀態 <span class="required">*</span></label><select id="trial-status" name="status" ${approved ? 'disabled' : ''}>${TRIAL_STATUSES.map(([value,label]) => `<option value="${value}" ${(item.status || 'waiting_contact') === value ? 'selected' : ''}>${esc(label)}</option>`).join('')}</select>${approved ? `<input type="hidden" name="status" value="${esc(item.status)}">` : ''}</div>
      <div class="field"><label for="trial-next">下一次追蹤日期 <span class="required">*</span> <span class="conditional">未結案時</span></label><input id="trial-next" name="nextFollowupDate" type="date" value="${esc(item.nextFollowupDate || '')}"></div>
      <div class="field full"><label for="trial-note">當日備註</label><textarea id="trial-note" name="note" placeholder="只寫需要保留的特殊狀況">${esc(item.note || '')}</textarea></div>
    </div>
    ${isNew ? '' : `<section class="subsection"><h3>新增一筆追蹤</h3><div class="form-grid"><div class="field"><label for="followup-date">聯絡日期</label><input id="followup-date" name="followupDate" type="date" max="${todayIso()}" value="${todayIso()}"></div><div class="field"><label for="followup-method">聯絡方式</label><select id="followup-method" name="followupMethod"><option value="line">LINE／訊息</option><option value="phone">電話</option><option value="in_person">現場</option><option value="other">其他</option></select></div><div class="field full"><label for="followup-note">本次家長回覆／處理結果</label><textarea id="followup-note" name="followupNote" placeholder="有聯絡才填；儲存後會加入時間軸"></textarea></div></div></section>`}
    <section class="subsection conversion-fields" data-conversion-fields><h3>首次一期報名與繳費</h3><div class="notice">${icon('badge-dollar-sign')}<div>只有「首次正式報名並完成繳費」才會產生 50 元待審獎金；續報不計。</div></div><div class="form-grid mt-16"><div class="field"><label for="enrollment-date">一期報名日期 <span class="required">*</span></label><input id="enrollment-date" name="enrollmentDate" type="date" value="${esc(item.enrollmentDate || '')}" ${approved ? 'readonly' : ''}></div><div class="field"><label for="payment-date">繳費確認日期 <span class="required">*</span></label><input id="payment-date" name="paymentDate" type="date" value="${esc(item.paymentDate || '')}" ${approved ? 'readonly' : ''}></div><div class="field full"><label for="enrollment-course">正式報名課程 <span class="required">*</span></label><input id="enrollment-course" name="enrollmentCourse" value="${esc(item.enrollmentCourse || '')}" ${approved ? 'readonly' : ''}></div><div class="field"><label for="first-enrollment">是否為第一次正式報名 <span class="required">*</span></label><select id="first-enrollment" name="firstEnrollment" ${approved ? 'disabled' : ''}><option value="">請確認</option><option value="yes" ${item.firstEnrollment === true ? 'selected' : ''}>是，第一次報名一期</option><option value="no" ${item.firstEnrollment === false && item.status === 'converted' ? 'selected' : ''}>不是，屬續報／轉班</option></select>${approved ? '<input type="hidden" name="firstEnrollment" value="yes">' : ''}</div><div class="field"><label for="payment-evidence">報名／繳費證明 <span class="required">*</span> <span class="conditional">首次報名時</span></label><input id="payment-evidence" name="paymentEvidence" type="file" multiple accept="image/*,.pdf" ${approved ? 'disabled' : ''}><div class="field-help">可一次選多張截圖。</div>${(item.paymentEvidence || []).length ? `<div class="file-list">${item.paymentEvidence.map(file => `<span class="badge success">${icon('paperclip',12)}${esc(file.fileName)}</span>`).join('')}</div>` : ''}</div></div>${trialBonusBadge(item)}</section>`;
    showDialog(dialogShell(isNew ? '登錄今日試上' : `更新 ${item.studentName}`, isNew ? '建立一次後，所有聯絡與報名都更新同一筆' : '更新狀態或加入新的家長追蹤', body, '儲存試上追蹤', 'trial-form'), true);
    updateTrialFormVisibility();
  }

  function updateTrialFormVisibility() {
    const select = $('#trial-status');
    const section = $('[data-conversion-fields]');
    if (section) section.hidden = select?.value !== 'converted';
  }

  function renderTrialTimeline(item) {
    const entries = (item.followups || []).map(entry => ({ at: entry.at || entry.date, title: `${entry.date} 家長追蹤`, text: entry.note, author: entry.author }))
      .concat((item.history || []).map(entry => ({ at: entry.at, title: entry.summary, text: '', author: entry.author })))
      .sort((a,b) => String(b.at).localeCompare(String(a.at)));
    if (!entries.length) return '<div class="empty"><strong>尚無追蹤時間軸</strong></div>';
    return `<div class="timeline">${entries.map(entry => `<div class="timeline-item"><span></span><div><strong>${esc(entry.title)}</strong><small>${esc(entry.author || '')}${entry.at ? ` · ${formatDateTime(entry.at) || formatDate(entry.at)}` : ''}</small>${entry.text ? `<p>${nl2br(entry.text)}</p>` : ''}</div></div>`).join('')}</div>`;
  }

  function openTrialDetail(id, withReview = false) {
    const item = trialRecords().find(entry => entry.id === id);
    if (!item) return;
    const evidence = (item.paymentEvidence || []).map(file => `<a class="badge success" href="${esc(file.url)}" target="_blank" rel="noopener">${icon('paperclip',12)}${esc(file.fileName)}</a>`).join('');
    const review = withReview ? `<div class="field mt-16"><label for="trial-review-note">主管審核說明</label><textarea id="trial-review-note" name="note" placeholder="不符合時必須寫明原因">${esc(item.bonusReviewNote || '')}</textarea></div><div class="grid cols-2 mt-16"><label class="check-row"><input type="radio" name="result" value="approved" ${item.bonusStatus !== 'rejected' ? 'checked' : ''}><span>確認符合，核發 50 元</span></label><label class="check-row"><input type="radio" name="result" value="rejected" ${item.bonusStatus === 'rejected' ? 'checked' : ''}><span>不符合</span></label></div>` : '';
    const body = `<input type="hidden" name="recordId" value="${esc(item.id)}"><div class="detail-grid"><div><span>學生</span><strong>${esc(item.studentName)}</strong></div><div><span>家長識別</span><strong>${esc(item.contactRef)}</strong></div><div><span>試上</span><strong>${formatDate(item.date)} · ${esc(item.course)}</strong></div><div><span>授課老師</span><strong>${esc(item.teacher)}</strong></div><div><span>目前狀態</span><strong>${esc(trialStatusLabel(item.status))}</strong></div><div><span>負責人</span><strong>${esc(item.owner || workerName)}</strong></div>${item.status === 'converted' ? `<div><span>正式報名</span><strong>${formatDate(item.enrollmentDate)} · ${esc(item.enrollmentCourse)}</strong></div><div><span>繳費確認</span><strong>${formatDate(item.paymentDate)}</strong></div><div><span>首次報名</span><strong>${item.firstEnrollment ? '是' : '否，不計獎金'}</strong></div><div><span>獎金狀態</span><strong>${item.bonusStatus === 'approved' ? '已核准 50 元' : item.bonusStatus === 'rejected' ? '不符合' : '待主管確認'}</strong></div>` : ''}</div>${evidence ? `<div class="file-list mt-16">${evidence}</div>` : ''}<h3>處理時間軸</h3>${renderTrialTimeline(item)}${review}`;
    showDialog(dialogShell(withReview ? '確認首報獎金' : '試上追蹤明細', `${item.studentName} · ${formatDate(item.date)} 試上`, body, withReview ? '儲存審核' : '', withReview ? 'trial-bonus-form' : ''), true);
  }

  function openNoTrialConfirm() {
    const body = `<div class="notice">${icon('calendar-x-2')}<div><strong>${formatDate(todayIso())} 沒有試上學生</strong><br>確認後今日完整度會標記完成；若稍後臨時有試上，新增學生時系統會自動取消此標記。</div></div>`;
    showDialog(dialogShell('確認今日無試上', '用來區分沒有試上與忘記登錄', body, '確認無試上', 'no-trial-form'));
  }

  function openTuesday(followupId = '') {
    const item = currentTuesday() || {};
    const followup = (item.followups || []).find(entry => entry.id === followupId) || {};
    const checks = item.checks || {};
    const body = `<h3>固定行政檢核 <span class="required">*</span></h3><div class="grid cols-2"><label class="check-row"><input type="checkbox" name="paymentList" ${checks.paymentList ? 'checked' : ''}><span>確認需繳費學生名單</span></label><label class="check-row"><input type="checkbox" name="expiringStudents" ${checks.expiringStudents ? 'checked' : ''}><span>確認即將到期／需續課學生</span></label><label class="check-row"><input type="checkbox" name="unpaidParents" ${checks.unpaidParents ? 'checked' : ''}><span>確認尚未完成繳費之家長</span></label><label class="check-row"><input type="checkbox" name="remindersSent" ${checks.remindersSent ? 'checked' : ''}><span>已完成提醒與後續追蹤</span></label></div><label class="check-row mt-16"><input type="checkbox" name="exceptionsReported" ${checks.exceptionsReported ? 'checked' : ''}><span>特殊狀況已主動回報主管；若沒有特殊狀況也可勾選確認</span></label><h3>${followupId ? '編輯追蹤事項' : '新增家長事項（沒有可留白）'}</h3><input type="hidden" name="followupId" value="${esc(followup.id || '')}"><div class="form-grid"><div class="field"><label for="followup-person">學生／家長</label><input id="followup-person" name="person" value="${esc(followup.person || '')}"></div><div class="field"><label for="followup-status">狀態</label><select id="followup-status" name="followupStatus"><option value="open" ${followup.status !== 'closed' ? 'selected' : ''}>持續追蹤</option><option value="closed" ${followup.status === 'closed' ? 'selected' : ''}>已結案</option></select></div><div class="field full"><label for="followup-situation">目前狀況 <span class="required">*</span> <span class="conditional">建立追蹤時</span></label><textarea id="followup-situation" name="situation">${esc(followup.situation || '')}</textarea></div><div class="field full"><label for="followup-handled">已處理事項 <span class="required">*</span> <span class="conditional">建立追蹤時</span></label><textarea id="followup-handled" name="handled">${esc(followup.handled || '')}</textarea></div><div class="field"><label for="followup-next">下次追蹤日期 <span class="required">*</span> <span class="conditional">未結案時</span></label><input id="followup-next" name="nextDate" type="date" value="${esc(followup.nextDate || '')}"></div><div class="field"><label for="tuesday-date">完成日期 <span class="required">*</span></label><input id="tuesday-date" name="date" type="date" value="${esc(item.date || todayIso())}" required></div><div class="field full"><label for="tuesday-note">補充說明</label><textarea id="tuesday-note" name="note">${esc(item.note || '')}</textarea></div></div>`;
    showDialog(dialogShell('每週二行政確認', '未結案事項一定要有下一次追蹤日期', body, '儲存本週確認', 'tuesday-form'), true);
  }

  function openEnvironment() {
    const item = currentEnvironment() || {};
    const body = `<h3>逐項檢核 <span class="required">*</span></h3><div class="grid cols-2">${ENVIRONMENT_CHECKS.map(([key,label]) => `<label class="check-row"><input type="checkbox" name="check-${key}" ${item.checks?.[key] ? 'checked' : ''}><span>${esc(label)}</span></label>`).join('')}</div><div class="form-grid mt-16"><div class="field full"><label for="environment-issue">未通過項目與改善方式 <span class="required">*</span> <span class="conditional">有未通過時</span></label><textarea id="environment-issue" name="issue" placeholder="全部正常可留白">${esc(item.issue || '')}</textarea></div><div class="field"><label for="environment-due">改善期限 <span class="required">*</span> <span class="conditional">有未通過時</span></label><input id="environment-due" name="improvementDue" type="date" value="${esc(item.improvementDue || '')}"></div><div class="field"><label for="environment-files">環境照片（選填）</label><input id="environment-files" name="evidence" type="file" multiple accept="image/*"><div class="field-help">可一次選多張，不需要另外寫照片判讀說明。</div></div></div>`;
    showDialog(dialogShell('今日環境檢核', '只用勾選完成日常確認，有問題才填改善內容', body, '儲存環境檢核', 'environment-form'), true);
  }

  function openProject(id = '') {
    const item = workerRecords('project').find(entry => entry.id === id) || {};
    const stages = PROJECT_STAGES.map(name => (item.stages || []).find(stage => stage.name === name) || { name, status: 'pending', dueDate: '', actualDate: '' });
    const body = `<div class="form-grid"><div class="field"><label for="project-title">專案名稱 <span class="required">*</span></label><input id="project-title" name="title" value="${esc(item.title || '')}" required></div><div class="field"><label for="project-type">專案類型 <span class="required">*</span></label><select id="project-type" name="projectType" required><option value="">請選擇</option>${['招生活動','體驗週','節慶活動','特別課程','比賽活動','新班招生','其他'].map(value => `<option ${item.projectType === value ? 'selected' : ''}>${value}</option>`).join('')}</select></div><div class="field full"><label for="project-summary">專案說明</label><textarea id="project-summary" name="summary">${esc(item.summary || '')}</textarea></div><div class="field"><label for="project-status">專案狀態</label><select id="project-status" name="status"><option value="planning" ${item.status === 'planning' || !item.status ? 'selected' : ''}>規劃中</option><option value="active" ${item.status === 'active' ? 'selected' : ''}>進行中</option><option value="completed" ${item.status === 'completed' ? 'selected' : ''}>已完成</option><option value="paused" ${item.status === 'paused' ? 'selected' : ''}>暫停</option></select></div><div class="field"><label for="project-files">完成證據 <span class="required">*</span> <span class="conditional">專案完成時</span></label><input id="project-files" name="evidence" type="file" multiple accept="image/*,video/*,.pdf,.ppt,.pptx"></div></div><h3>八階段時程</h3><div class="stage-list">${stages.map((stage,index) => `<div class="stage-row"><strong>${esc(stage.name)}</strong><label class="stage-cell"><span>狀態</span><select name="stageStatus-${index}"><option value="pending" ${stage.status === 'pending' ? 'selected' : ''}>未開始</option><option value="active" ${stage.status === 'active' ? 'selected' : ''}>進行中</option><option value="completed" ${stage.status === 'completed' ? 'selected' : ''}>已完成</option></select></label><label class="stage-cell"><span>預計完成</span><input type="date" name="stageDue-${index}" value="${esc(stage.dueDate || '')}" aria-label="${esc(stage.name)}預計完成日期"></label><label class="stage-cell"><span>實際完成</span><input type="date" name="stageActual-${index}" value="${esc(stage.actualDate || '')}" aria-label="${esc(stage.name)}實際完成日期"></label></div>`).join('')}</div>`;
    showDialog(dialogShell(id ? '更新專案' : '新增活動／宣傳專案', '每一階段設定日期，主管審核與修改也列入排程', `<input type="hidden" name="projectId" value="${esc(item.id || '')}">${body}`, '儲存專案', 'project-form'), true);
  }

  function openAssignment(id = '') {
    const item = workerRecords('assignment').find(entry => entry.id === id) || {};
    const managerEdit = isManager;
    const body = managerEdit ? `<input type="hidden" name="assignmentId" value="${esc(item.id || '')}"><div class="form-grid"><div class="field full"><label for="assignment-title">工作內容 <span class="required">*</span></label><input id="assignment-title" name="title" value="${esc(item.title || '')}" required></div><div class="field full"><label for="assignment-detail">交辦說明 <span class="required">*</span></label><textarea id="assignment-detail" name="detail" required>${esc(item.detail || '')}</textarea></div><div class="field"><label for="assignment-date">交辦日期</label><input id="assignment-date" name="date" type="date" value="${esc(item.date || todayIso())}" required></div><div class="field"><label for="assignment-due">完成期限 <span class="required">*</span></label><input id="assignment-due" name="dueDate" type="date" value="${esc(item.dueDate || '')}" required></div><div class="field"><label for="assignment-priority">優先層級</label><select id="assignment-priority" name="priority"><option value="normal" ${item.priority === 'normal' || !item.priority ? 'selected' : ''}>一般</option><option value="high" ${item.priority === 'high' ? 'selected' : ''}>優先</option><option value="urgent" ${item.priority === 'urgent' ? 'selected' : ''}>緊急</option></select></div></div>` : `<input type="hidden" name="assignmentId" value="${esc(item.id || '')}"><div class="notice">${icon('clipboard-list')}<div><strong>${esc(item.title)}</strong><br>期限 ${formatDate(item.dueDate)}<br>${nl2br(item.detail)}</div></div><div class="form-grid mt-16"><div class="field"><label for="assignment-progress">目前進度：<span id="progress-value">${Number(item.progress || 0)}%</span></label><input id="assignment-progress" name="progress" type="range" min="0" max="100" step="5" value="${Number(item.progress || 0)}"></div><div class="field"><label for="assignment-status">狀態</label><select id="assignment-status" name="status"><option value="pending" ${item.status === 'pending' ? 'selected' : ''}>待處理</option><option value="in_progress" ${item.status === 'in_progress' ? 'selected' : ''}>進行中</option><option value="waiting" ${item.status === 'waiting' ? 'selected' : ''}>等待確認／資料</option><option value="completed" ${item.status === 'completed' ? 'selected' : ''}>已完成</option></select></div><div class="field full"><label for="assignment-note">進度說明</label><textarea id="assignment-note" name="progressNote">${esc(item.progressNote || '')}</textarea></div><div class="field"><label for="assignment-actual">實際完成日期</label><input id="assignment-actual" name="actualDate" type="date" value="${esc(item.actualDate || '')}"></div><div class="field"><label for="assignment-evidence">完成證據</label><input id="assignment-evidence" name="evidence" type="file" multiple accept="image/*,video/*,.pdf,.ppt,.pptx"></div></div>`;
    showDialog(dialogShell(managerEdit ? (id ? '編輯主管交辦' : '新增主管交辦') : '更新交辦進度', managerEdit ? '期限是交辦的一部分，不建立沒有期限的待辦' : '更新進度、完成日期與證據', body, managerEdit ? '儲存交辦' : '更新進度', 'assignment-form'), true);
  }

  function openReview(id) {
    const item = state.records.find(record => record.id === id);
    if (!item) return;
    let detail = '';
    if (item.type === 'daily') detail = (item.items || []).map(work => `<article class="record-card"><div class="record-head"><div class="record-title"><strong>${esc(work.title)}</strong><small>${esc(categoryLabel(work.category))}</small></div>${statusBadge(work.status)}</div><p class="record-copy">${nl2br(work.completedToday)}</p><div class="progress"><span style="width:${Number(work.progress || 0)}%"></span></div><div class="progress-label"><span>${work.remaining ? `剩餘：${esc(work.remaining)}` : '完成'}</span><strong>${Number(work.progress || 0)}%</strong></div><div class="file-list">${(work.evidence || []).map(file => `<a class="badge success" href="${esc(file.url)}" target="_blank" rel="noopener">${icon('paperclip',12)}${esc(file.fileName)}</a>`).join('')}</div></article>`).join('');
    else if (item.type === 'tuesday') detail = `<div class="check-list">${Object.entries(item.checks || {}).map(([key,value]) => `<div class="check-row">${icon(value ? 'circle-check' : 'circle-x',19)}<span>${esc(key)}</span></div>`).join('')}</div>${renderFollowups(item.followups || [])}`;
    else if (item.type === 'project') detail = `<div class="record-card"><div class="record-title"><strong>${esc(item.title)}</strong><small>${esc(item.projectType)}</small></div><p class="record-copy">${nl2br(item.summary || '未填專案說明')}</p></div><div class="stage-list mt-16">${(item.stages || []).map(stage => `<div class="check-row">${icon(stage.status === 'completed' ? 'circle-check' : stage.status === 'active' ? 'loader-circle' : 'circle',19)}<span><strong>${esc(stage.name)}</strong>${stage.dueDate ? ` · 預計 ${formatDate(stage.dueDate)}` : ''}${stage.actualDate ? ` · 實際 ${formatDate(stage.actualDate)}` : ''}</span></div>`).join('')}</div>`;
    else detail = `<div class="grid cols-2">${ENVIRONMENT_CHECKS.map(([key,label]) => `<div class="check-row">${icon(item.checks?.[key] ? 'circle-check' : 'circle-x',19)}<span>${esc(label)}</span></div>`).join('')}</div>${item.issue ? `<div class="notice danger mt-16">${icon('triangle-alert')}<div>${esc(item.issue)} · 改善期限 ${formatDate(item.improvementDue)}</div></div>` : ''}`;
    const body = `${detail}<div class="field mt-16"><label for="review-note">主管意見</label><textarea id="review-note" name="note" placeholder="通過可寫做得好的地方；退回需說明要補什麼">${esc(item.reviewComment || '')}</textarea></div><div class="grid cols-2 mt-16"><label class="check-row"><input type="radio" name="result" value="approved" ${item.reviewStatus !== 'needs_revision' ? 'checked' : ''}><span>通過</span></label><label class="check-row"><input type="radio" name="result" value="needs_revision" ${item.reviewStatus === 'needs_revision' ? 'checked' : ''}><span>退回補充</span></label></div>`;
    showDialog(dialogShell('審查完整紀錄', `${formatDate(item.date)} · ${item.nickname || workerName}`, `<input type="hidden" name="recordId" value="${esc(item.id)}">${body}`, '儲存審查', 'review-form'), true);
  }

  function profileDialog() {
    const labels = (window.KPI_WORKSPACES?.getAssignments?.(currentUser) || []).map(item => item.shortLabel || item.label).join('、');
    const testAction = TEST_VIEW_MODE
      ? `<button type="button" class="button primary" data-action="exit-impersonation">${icon('undo-2')}換一位老師</button>`
      : canOpenTestView ? `<button type="button" class="button primary" data-action="open-test-view">${icon('scan-eye')}測試老師畫面</button>` : '';
    const body = `<div class="record-card"><div class="record-title"><strong>${esc(currentUser.nickname)}</strong><small>${esc(workspace.label)} · ${esc(currentUser.department || '')}</small></div></div>${window.KPI_WORKSPACES?.renderQuickSwitcher?.(currentUser, { currentId: workspaceId }) || ''}${TEST_VIEW_MODE ? '<div class="notice warning mt-16">目前為唯讀測試視角，不能寫入正式資料。</div>' : ''}${testAction ? `<div class="record-actions mt-16">${testAction}</div>` : ''}`;
    showDialog(dialogShell('帳號與工作切換', `不需重新登入，可切換：${labels || workspace.label}`, body, '', ''), false);
  }
  function moreNavDialog() {
    const items = NAV[workspace.role].slice(4);
    const body = `<div class="nav-list">${items.map(item => `<button type="button" class="nav-button ${state.ui.route === item.route ? 'is-active' : ''}" data-route="${item.route}" data-action="close-after-route">${icon(item.icon)}<span>${esc(item.label)}</span></button>`).join('')}</div>`;
    showDialog(dialogShell('更多功能', '選擇要前往的頁面', body, '', ''), false);
  }

  function readFile(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(reader.error || new Error('檔案讀取失敗'));
      reader.readAsDataURL(file);
    });
  }
  async function uploadFiles(input, category) {
    const files = Array.from(input?.files || []);
    const output = [];
    for (const file of files) {
      if (file.size > 15 * 1024 * 1024) throw new Error(`${file.name} 超過 15 MB`);
      if (PREVIEW_MODE) {
        output.push({ id: uid('file'), fileName: file.name, url: `preview://${encodeURIComponent(file.name)}`, mimeType: file.type, category });
        continue;
      }
      const dataUrl = await readFile(file);
      const payload = { nickname: currentUser.nickname, date: todayIso(), fileName: file.name, mimeType: file.type, base64: dataUrl.split(',')[1] || '' };
      const imageEvidence = String(file.type || '').startsWith('image/') && file.size <= 8 * 1024 * 1024;
      const result = imageEvidence
        ? await window.API.uploadPhoto({ ...payload, kpi: `admin-marketing-${category}` })
        : await window.API.uploadFile({ ...payload, category: `admin-marketing-${category}` });
      if (!result?.ok) throw new Error(result?.error || `${file.name} 上傳失敗`);
      output.push({ id: result.fileId, fileId: result.fileId, fileName: result.fileName || file.name, url: result.url, mimeType: file.type, category });
    }
    return output;
  }
  async function saveRecord(type, record) {
    record.nickname = workerName;
    record.type = type;
    record.updatedAt = new Date().toISOString();
    if (PREVIEW_MODE) {
      upsertLocal(record);
      persist();
      return { ok: true, record };
    }
    const result = await window.API.saveAdminMarketingRecord(currentUser.nickname, type, record);
    if (result?.ok) upsertLocal(result.record);
    return result;
  }
  async function saveAssignment(record) {
    record.nickname = workerName;
    record.type = 'assignment';
    record.updatedAt = new Date().toISOString();
    if (PREVIEW_MODE) {
      upsertLocal(record);
      persist();
      return { ok: true, assignment: record };
    }
    const result = await window.API.saveAdminMarketingAssignment(workerName, record);
    if (result?.ok) upsertLocal(result.assignment);
    return result;
  }

  async function handleTrial(form) {
    const data = new FormData(form);
    const id = String(data.get('trialId') || '') || uid('admin-marketing-trial');
    const existing = trialRecords().find(item => item.id === id) || {};
    const status = String(data.get('status') || 'waiting_contact');
    let followups = Array.isArray(existing.followups) ? existing.followups.slice() : [];
    const followupNote = String(data.get('followupNote') || '').trim();
    if (followupNote) {
      followups.push({ id: uid('trial-followup'), date: String(data.get('followupDate') || todayIso()), method: String(data.get('followupMethod') || 'line'), note: followupNote, nextDate: String(data.get('nextFollowupDate') || ''), author: currentUser.nickname, at: new Date().toISOString() });
    }
    const studentName = String(data.get('studentName') || '').trim();
    const contactRef = String(data.get('contactRef') || '').trim();
    const date = String(data.get('date') || todayIso());
    const course = String(data.get('course') || '').trim();
    const teacher = String(data.get('teacher') || '').trim();
    const nextFollowupDate = String(data.get('nextFollowupDate') || '');
    const enrollmentDate = status === 'converted' ? String(data.get('enrollmentDate') || '') : '';
    const paymentDate = status === 'converted' ? String(data.get('paymentDate') || '') : '';
    const enrollmentCourse = status === 'converted' ? String(data.get('enrollmentCourse') || '').trim() : '';
    const firstEnrollmentChoice = String(data.get('firstEnrollment') || '');
    if (!studentName || !course || !teacher || !contactRef) throw new Error('學生、課程、授課老師與家長識別資料皆為必填');
    if (!['converted', 'not_enrolled'].includes(status) && !nextFollowupDate) throw new Error('尚未結案的學生必須設定下一次追蹤日期');
    if (nextFollowupDate && nextFollowupDate < date) throw new Error('下一次追蹤日期不可早於試上日期');
    if (status === 'converted') {
      if (!enrollmentDate || !paymentDate || !enrollmentCourse || !firstEnrollmentChoice) throw new Error('請完整填寫報名、繳費、正式課程與是否首次報名');
      if (enrollmentDate > todayIso() || paymentDate > todayIso()) throw new Error('報名與繳費日期不可晚於今天');
      if (enrollmentDate < date || paymentDate < date) throw new Error('報名與繳費日期不可早於試上日期');
      if (firstEnrollmentChoice === 'yes' && !followups.length) throw new Error('首報獎金至少要有一筆家長追蹤紀錄');
    }
    const duplicate = trialRecords().find(item => item.id !== id && trialIdentity(item.studentName, item.contactRef) === trialIdentity(studentName, contactRef));
    if (duplicate) throw new Error('此學生已有試上追蹤紀錄，請更新原紀錄，不要重複新增');
    const newEvidence = await uploadFiles(form.elements.paymentEvidence, 'trial-payment');
    const record = {
      ...existing, id, date, studentName, course, teacher, contactRef,
      interest: String(data.get('interest') || 'unknown'), owner: workerName, nextFollowupDate,
      note: String(data.get('note') || '').trim(), status, followups,
      enrollmentDate, paymentDate, enrollmentCourse,
      firstEnrollment: status === 'converted' && firstEnrollmentChoice === 'yes',
      paymentEvidence: status === 'converted' ? (existing.paymentEvidence || []).concat(newEvidence) : [],
    };
    if (status === 'converted') {
      if (record.firstEnrollment && !evidenceReady({ evidence: record.paymentEvidence })) throw new Error('首次報名需附報名或繳費證明');
    }
    if (PREVIEW_MODE && !['approved', 'rejected'].includes(existing.bonusStatus)) {
      record.bonusStatus = status === 'converted' && record.firstEnrollment && followups.length && record.paymentEvidence.length ? 'pending_review' : 'not_eligible';
      record.bonusAmount = 0;
      record.history = (existing.history || []).concat({ id: uid('history'), author: currentUser.nickname, role: currentUser.role, at: new Date().toISOString(), summary: existing.id ? '更新試上追蹤' : '建立試上紀錄' });
    }
    const result = await saveRecord('trial', record);
    if (!result?.ok) throw new Error(result?.error || '試上追蹤儲存失敗');
    if (PREVIEW_MODE) {
      const marker = todayTrialMarker();
      if (marker && marker.date === record.date) { marker.noTrial = false; marker.status = 'superseded'; upsertLocal(marker); persist(); }
    }
    closeDialog(); renderApp(); toast(existing.id ? '試上追蹤已更新' : '今日試上已登錄');
  }

  async function handleNoTrial() {
    const record = { id: `admin-marketing-trial-day-${normalizeName(workerName)}-${todayIso()}`, type: 'trial_day', nickname: workerName, date: todayIso(), noTrial: true, status: 'confirmed' };
    if (trialRecords().some(item => item.date === todayIso())) throw new Error('今天已有試上學生，不能標記為無試上');
    const result = await saveRecord('trial_day', record);
    if (!result?.ok) throw new Error(result?.error || '今日試上狀態儲存失敗');
    closeDialog(); renderApp(); toast('已確認今日無試上');
  }

  async function handleTrialBonus(form) {
    const data = new FormData(form);
    const id = String(data.get('recordId') || '');
    const resultValue = String(data.get('result') || 'approved');
    const note = String(data.get('note') || '').trim();
    if (resultValue === 'rejected' && !note) throw new Error('判定不符合時必須寫明原因');
    if (PREVIEW_MODE) {
      const item = trialRecords().find(record => record.id === id);
      if (!item) throw new Error('找不到試上紀錄');
      item.bonusStatus = resultValue;
      item.bonusAmount = resultValue === 'approved' ? TRIAL_BONUS_AMOUNT : 0;
      item.bonusReviewedBy = currentUser.nickname;
      item.bonusReviewedAt = new Date().toISOString();
      item.bonusReviewNote = note;
      item.history = (item.history || []).concat({ id: uid('history'), author: currentUser.nickname, role: currentUser.role, at: item.bonusReviewedAt, summary: resultValue === 'approved' ? '核准首報獎金 50 元' : `首報獎金不符合：${note}` });
      upsertLocal(item); persist();
    } else {
      const result = await window.API.reviewAdminMarketingTrialBonus(id, resultValue, note);
      if (!result?.ok) throw new Error(result?.error || '首報獎金審核失敗');
      upsertLocal(result.record);
    }
    closeDialog(); renderApp(); toast(resultValue === 'approved' ? '已核准首報獎金 50 元' : '已記錄不符合');
  }

  async function handleWorkItem(form) {
    const data = new FormData(form);
    const recordId = String(data.get('recordId') || '');
    const daily = (recordId ? workerRecords('daily').find(record => record.id === recordId) : null) || todayDaily() || { id: `admin-marketing-daily-${normalizeName(workerName)}-${todayIso()}`, type: 'daily', nickname: workerName, date: todayIso(), items: [], messages: {} };
    const id = String(data.get('itemId') || '') || uid('work');
    const existing = (daily.items || []).find(item => item.id === id) || {};
    const status = String(data.get('status') || 'in_progress');
    const item = {
      ...existing, id,
      category: String(data.get('category') || ''), title: String(data.get('title') || '').trim(),
      completedToday: String(data.get('completedToday') || '').trim(), progress: Number(data.get('progress') || 0), status,
      remaining: String(data.get('remaining') || '').trim(), dueDate: String(data.get('dueDate') || ''), actualDate: String(data.get('actualDate') || ''),
    };
    if (!item.category || !item.title || !item.completedToday) throw new Error('工作類型、內容與今日完成皆為必填');
    if (status !== 'completed' && (!item.remaining || !item.dueDate)) throw new Error('未完成工作要填剩餘工作與預計完成日期');
    if (status === 'completed') {
      item.progress = 100;
      if (!item.actualDate) throw new Error('已完成工作要填實際完成日期');
    }
    const newFiles = await uploadFiles(form.elements.evidence, item.category);
    item.evidence = (existing.evidence || []).concat(newFiles);
    if (status === 'completed' && ['video','photo_post','poster','design','social_schedule'].includes(item.category) && !evidenceReady(item)) throw new Error('美宣工作標記完成時必須附完成證據');
    const messages = {
      parentChecked: data.get('parentChecked') === 'on', officialLineChecked: data.get('officialLineChecked') === 'on', groupChecked: data.get('groupChecked') === 'on',
      unresolved: String(data.get('unresolved') || '').trim(), reported: data.get('reported') === 'on',
    };
    if (!messages.parentChecked || !messages.officialLineChecked || !messages.groupChecked) throw new Error('請先完成三個訊息確認');
    if (messages.unresolved && !messages.reported) throw new Error('有待主管確認事項時必須勾選已主動回報');
    const items = (daily.items || []).filter(entry => entry.id !== id).concat(item);
    const result = await saveRecord('daily', { ...daily, messages, items, status: 'submitted' });
    if (!result?.ok) throw new Error(result?.error || '工作日誌儲存失敗');
    state.drafts.workItem = null;
    closeDialog(); renderApp(); toast('工作日誌已儲存');
  }

  async function handleTuesday(form) {
    const data = new FormData(form);
    const existing = currentTuesday() || { id: `admin-marketing-tuesday-${normalizeName(workerName)}-${weekBounds().key}`, type: 'tuesday', nickname: workerName, weekKey: weekBounds().key, followups: [] };
    let followups = existing.followups || [];
    const person = String(data.get('person') || '').trim();
    if (person) {
      const id = String(data.get('followupId') || '') || uid('followup');
      const followup = { id, person, situation: String(data.get('situation') || '').trim(), handled: String(data.get('handled') || '').trim(), nextDate: String(data.get('nextDate') || ''), status: String(data.get('followupStatus') || 'open') };
      if (!followup.situation || !followup.handled) throw new Error('家長事項要填目前狀況與已處理事項');
      if (followup.status === 'open' && !followup.nextDate) throw new Error('持續追蹤事項必須設定下次追蹤日期');
      followups = followups.filter(item => item.id !== id).concat(followup);
    }
    const record = { ...existing, date: String(data.get('date') || todayIso()), weekKey: weekBounds().key, checks: { paymentList: data.get('paymentList') === 'on', expiringStudents: data.get('expiringStudents') === 'on', unpaidParents: data.get('unpaidParents') === 'on', remindersSent: data.get('remindersSent') === 'on', exceptionsReported: data.get('exceptionsReported') === 'on' }, followups, note: String(data.get('note') || '').trim(), status: 'submitted' };
    if (!record.checks.paymentList || !record.checks.expiringStudents || !record.checks.unpaidParents || !record.checks.remindersSent) throw new Error('四項固定行政確認都必須完成');
    const result = await saveRecord('tuesday', record);
    if (!result?.ok) throw new Error(result?.error || '週二確認儲存失敗');
    closeDialog(); renderApp(); toast('本週行政確認已儲存');
  }

  async function handleEnvironment(form) {
    const data = new FormData(form);
    const existing = currentEnvironment() || { id: `admin-marketing-environment-${normalizeName(workerName)}-${todayIso()}`, type: 'environment', nickname: workerName, date: todayIso() };
    const checks = {};
    ENVIRONMENT_CHECKS.forEach(([key]) => { checks[key] = data.get(`check-${key}`) === 'on'; });
    const issue = String(data.get('issue') || '').trim();
    const improvementDue = String(data.get('improvementDue') || '');
    if (Object.values(checks).some(value => !value) && (!issue || !improvementDue)) throw new Error('未通過項目必須填寫問題與改善期限');
    const files = await uploadFiles(form.elements.evidence, 'environment');
    const record = { ...existing, checks, issue, improvementDue, evidence: (existing.evidence || []).concat(files), status: Object.values(checks).every(Boolean) ? 'submitted' : 'needs_action' };
    const result = await saveRecord('environment', record);
    if (!result?.ok) throw new Error(result?.error || '環境檢核儲存失敗');
    closeDialog(); renderApp(); toast('今日環境檢核已儲存');
  }

  async function handleProject(form) {
    const data = new FormData(form);
    const id = String(data.get('projectId') || '') || uid('project');
    const existing = workerRecords('project').find(item => item.id === id) || {};
    const stages = PROJECT_STAGES.map((name,index) => ({ name, status: String(data.get(`stageStatus-${index}`) || 'pending'), dueDate: String(data.get(`stageDue-${index}`) || ''), actualDate: String(data.get(`stageActual-${index}`) || '') }));
    for (const stage of stages) {
      if (stage.status !== 'pending' && !stage.dueDate) throw new Error(`${stage.name}階段需設定預計完成日期`);
      if (stage.status === 'completed' && !stage.actualDate) throw new Error(`${stage.name}階段完成時需填實際完成日期`);
    }
    const files = await uploadFiles(form.elements.evidence, 'project');
    const record = { ...existing, id, date: existing.date || todayIso(), title: String(data.get('title') || '').trim(), projectType: String(data.get('projectType') || ''), summary: String(data.get('summary') || '').trim(), status: String(data.get('status') || 'planning'), stages, evidence: (existing.evidence || []).concat(files) };
    if (!record.title || !record.projectType) throw new Error('專案名稱與類型為必填');
    if (record.status === 'completed' && !evidenceReady(record)) throw new Error('專案完成時必須附完成證據');
    const result = await saveRecord('project', record);
    if (!result?.ok) throw new Error(result?.error || '專案儲存失敗');
    closeDialog(); renderApp(); toast('專案進度已儲存');
  }

  async function handleAssignment(form) {
    const data = new FormData(form);
    const id = String(data.get('assignmentId') || '') || uid('assignment');
    const existing = workerRecords('assignment').find(item => item.id === id) || {};
    let record;
    if (isManager) {
      record = { ...existing, id, date: String(data.get('date') || todayIso()), title: String(data.get('title') || '').trim(), detail: String(data.get('detail') || '').trim(), dueDate: String(data.get('dueDate') || ''), priority: String(data.get('priority') || 'normal'), status: existing.status || 'pending', progress: Number(existing.progress || 0), evidence: existing.evidence || [] };
      if (!record.title || !record.detail || !record.dueDate) throw new Error('交辦內容、說明與期限皆為必填');
    } else {
      const files = await uploadFiles(form.elements.evidence, 'assignment');
      record = { ...existing, id, progress: Number(data.get('progress') || 0), status: String(data.get('status') || 'in_progress'), progressNote: String(data.get('progressNote') || '').trim(), actualDate: String(data.get('actualDate') || ''), evidence: (existing.evidence || []).concat(files) };
      if (record.status === 'completed') {
        record.progress = 100;
        if (!record.actualDate || !evidenceReady(record)) throw new Error('交辦完成時必須填實際完成日並附證據');
      }
    }
    const result = await saveAssignment(record);
    if (!result?.ok) throw new Error(result?.error || '交辦事項儲存失敗');
    closeDialog(); renderApp(); toast(isManager ? '主管交辦已建立' : '交辦進度已更新');
  }

  async function handleReview(form) {
    const data = new FormData(form);
    const id = String(data.get('recordId') || '');
    const resultValue = String(data.get('result') || 'approved');
    const note = String(data.get('note') || '').trim();
    if (resultValue === 'needs_revision' && !note) throw new Error('退回補充時必須寫明要補什麼');
    if (PREVIEW_MODE) {
      const item = state.records.find(record => record.id === id);
      item.reviewStatus = resultValue; item.reviewComment = note; item.reviewedBy = currentUser.nickname; item.reviewedAt = new Date().toISOString();
      persist();
    } else {
      const result = await window.API.reviewAdminMarketingRecord(id, resultValue, note);
      if (!result?.ok) throw new Error(result?.error || '審查儲存失敗');
      upsertLocal(result.record);
    }
    closeDialog(); renderApp(); toast('主管審查已儲存');
  }

  async function handleScore(form) {
    const data = new FormData(form);
    const scores = {};
    KPI.forEach(item => { scores[item.key] = Number(data.get(item.key) || 0); });
    const score = { month: state.ui.month, scores, comment: String(data.get('comment') || '').trim(), published: data.get('published') === 'on' };
    if (PREVIEW_MODE) {
      const total = KPI.reduce((sum,item) => sum + Math.max(0, Math.min(item.max, Number(scores[item.key] || 0))), 0);
      upsertLocal({ id: `admin-marketing-score-${normalizeName(workerName)}-${state.ui.month}`, type: 'score', nickname: workerName, date: `${state.ui.month}-01`, month: state.ui.month, ...score, total, status: score.published ? 'published' : 'draft', updatedAt: new Date().toISOString() });
      persist();
    } else {
      const result = await window.API.saveAdminMarketingScore(workerName, state.ui.month, score);
      if (!result?.ok) throw new Error(result?.error || '評核儲存失敗');
      upsertLocal(result.score);
    }
    renderApp(); toast(score.published ? '評核已公布給皮皮' : '評核草稿已儲存');
  }

  async function handleMessage(form) {
    const data = new FormData(form);
    const text = String(data.get('text') || '').trim();
    if (!text) throw new Error('請輸入訊息');
    if (PREVIEW_MODE) {
      const id = `admin-marketing-message-${normalizeName(workerName)}-${state.ui.month}`;
      const item = state.records.find(record => record.id === id) || { id, type: 'message', nickname: workerName, date: `${state.ui.month}-01`, month: state.ui.month, messages: [], status: 'active' };
      item.messages.push({ id: uid('message'), author: currentUser.nickname, role: currentUser.role, text, at: new Date().toISOString() });
      upsertLocal(item); persist();
    } else {
      const result = await window.API.addAdminMarketingMessage(workerName, state.ui.month, text);
      if (!result?.ok) throw new Error(result?.error || '訊息送出失敗');
      upsertLocal(result.conversation);
    }
    renderApp(); toast('訊息已送出');
  }

  async function runForm(handler, form) {
    const button = form.querySelector('[type="submit"]');
    if (button) button.disabled = true;
    try { await handler(form); }
    catch (error) { toast(error.message || '操作失敗', 'danger'); if (button) button.disabled = false; }
  }

  document.addEventListener('click', event => {
    const route = event.target.closest('[data-route]');
    if (route) {
      state.ui.route = route.dataset.route;
      persist('頁面已切換');
      closeDialog(); renderApp();
      return;
    }
    const actionNode = event.target.closest('[data-action]');
    if (!actionNode) return;
    const action = actionNode.dataset.action;
    if (action === 'close-dialog') {
      if (actionNode.classList.contains('dialog-backdrop') && event.target !== actionNode) return;
      closeDialog();
    } else if (action === 'open-work-item') openWorkItem(actionNode.dataset.id || '', actionNode.dataset.recordId || '');
    else if (action === 'open-trial') openTrial(actionNode.dataset.id || '');
    else if (action === 'view-trial') openTrialDetail(actionNode.dataset.id || '', false);
    else if (action === 'review-trial-bonus') openTrialDetail(actionNode.dataset.id || '', true);
    else if (action === 'mark-no-trial') openNoTrialConfirm();
    else if (action === 'open-tuesday') openTuesday(actionNode.dataset.followupId || '');
    else if (action === 'open-environment') openEnvironment();
    else if (action === 'open-project') openProject(actionNode.dataset.id || '');
    else if (action === 'open-assignment' || action === 'update-assignment') openAssignment(actionNode.dataset.id || '');
    else if (action === 'review-record') openReview(actionNode.dataset.id || '');
    else if (action === 'profile') profileDialog();
    else if (action === 'open-test-view') {
      const root = window.AUTH?.relativeRoot?.() || '../../';
      window.location.href = `${root}admin/dashboard.html?v=20260827-test-view-fast-1#test-view`;
    }
    else if (action === 'exit-impersonation') {
      window.AUTH?.exitImpersonate?.();
      const root = window.AUTH?.relativeRoot?.() || '../../';
      window.location.href = `${root}admin/dashboard.html?v=20260827-test-view-fast-1#test-view`;
    }
    else if (action === 'more-nav') moreNavDialog();
    else if (action === 'retry-cloud') loadCloudData(true);
    else if (action === 'refresh-drive') loadDriveFolders(true);
    else if (action === 'print') window.print();
  });

  document.addEventListener('input', event => {
    if (event.target.matches('input[type="range"]')) {
      const label = $('#progress-value');
      if (label) label.textContent = `${event.target.value}%`;
    }
  });
  document.addEventListener('change', event => {
    if (event.target.id === 'month-filter') {
      state.ui.month = event.target.value || currentMonth();
      persist('月份已切換'); renderApp();
    }
    if (event.target.id === 'trial-status-filter') {
      state.ui.trialStatus = event.target.value || 'all';
      persist('篩選已更新'); renderApp();
    }
    if (event.target.id === 'trial-status') updateTrialFormVisibility();
  });
  document.addEventListener('submit', event => {
    event.preventDefault();
    const form = event.target;
    if (form.id === 'trial-form') runForm(handleTrial, form);
    else if (form.id === 'no-trial-form') runForm(() => handleNoTrial(), form);
    else if (form.id === 'trial-bonus-form') runForm(handleTrialBonus, form);
    else if (form.id === 'work-item-form') runForm(handleWorkItem, form);
    else if (form.id === 'tuesday-form') runForm(handleTuesday, form);
    else if (form.id === 'environment-form') runForm(handleEnvironment, form);
    else if (form.id === 'project-form') runForm(handleProject, form);
    else if (form.id === 'assignment-form') runForm(handleAssignment, form);
    else if (form.id === 'review-form') runForm(handleReview, form);
    else if (form.id === 'score-form') runForm(handleScore, form);
    else if (form.id === 'message-form') runForm(handleMessage, form);
  });
  document.addEventListener('keydown', event => { if (event.key === 'Escape') closeDialog(); });

  renderApp();
  if (!PREVIEW_MODE) loadCloudData();
})();
