(function () {
  'use strict';

  const APP_VERSION = 3;
  const MAX_ADMIN_FILE_BYTES = 25 * 1024 * 1024;
  const IMAGE_COMPRESSION_THRESHOLD_BYTES = 2.2 * 1024 * 1024;
  const PREVIEW_MODE = ['127.0.0.1', 'localhost'].includes(window.location.hostname)
    || window.location.hostname.endsWith('.trycloudflare.com');
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));
  const selectedFilesByInput = new WeakMap();
  let uploadWarning = '';
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
  function dateOffset(days, base = todayIso()) {
    const date = new Date(`${base}T12:00:00+08:00`);
    date.setDate(date.getDate() + Number(days || 0));
    return date.toLocaleDateString('sv-SE', { timeZone: 'Asia/Taipei' });
  }
  function trialLabeledValue(text, labels) {
    const pattern = new RegExp(`(?:^|\\n)\\s*(?:${labels.join('|')})\\s*[：:]\\s*([^\\n]+)`, 'im');
    const match = String(text || '').match(pattern);
    if (!match) return '';
    return match[1].split(/[｜|；;]/)[0].replace(/\s+(?=(?:日期|時間|時段|課程|老師|電話|手機|LINE|家長)\s*[：:])/i, '').trim();
  }
  function trialDateFromMessage(text) {
    const source = String(text || '');
    const today = todayIso();
    if (/(?:今天|今日)/.test(source)) return today;
    let year;
    let month;
    let day;
    const full = source.match(/(20\d{2})\s*[年\/.\-]\s*(\d{1,2})\s*[月\/.\-]\s*(\d{1,2})\s*日?/);
    if (full) {
      year = Number(full[1]); month = Number(full[2]); day = Number(full[3]);
    } else {
      const short = source.match(/(?:^|[^\d:])(\d{1,2})\s*[月\/.\-]\s*(\d{1,2})\s*日?/);
      if (!short) return '';
      year = Number(today.slice(0, 4)); month = Number(short[1]); day = Number(short[2]);
    }
    const iso = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const parsed = new Date(`${iso}T12:00:00+08:00`);
    if (Number.isNaN(parsed.getTime()) || parsed.getFullYear() !== year || parsed.getMonth() + 1 !== month || parsed.getDate() !== day) return '';
    return iso;
  }
  function parseTrialMessage(raw) {
    const text = String(raw || '').replace(/\r\n?/g, '\n').trim();
    if (!text) return {};
    const phone = text.match(/09\d{2}[\s\-]?\d{3}[\s\-]?\d{3}/)?.[0]?.replace(/[\s\-]/g, '') || '';
    const timeRange = text.match(/(\d{1,2})[：:](\d{2})\s*(?:[-~～—–至到])\s*(\d{1,2})[：:](\d{2})/);
    const labeledStudent = trialLabeledValue(text, ['學生姓名', '學生', '孩子姓名', '孩子', '學員姓名', '學員']);
    const leadingStudent = text.match(/(?:^|\n)\s*([\p{Script=Han}]{2,4})(?:同學|小朋友)?\s+(?=(?:20\d{2}[\/.\-])?\d{1,2}[月\/.\-]\d{1,2})/u)?.[1] || '';
    const labeledTeacher = trialLabeledValue(text, ['授課老師', '試上老師', '老師']);
    const knownTeacher = text.match(/(?:浩浩老師|RITA老師|皮皮老師|紅豆老師|小明老師|黑豹老師|柳丁(?:老師|主管)?)/i)?.[0] || '';
    const labeledCourse = trialLabeledValue(text, ['試上課程', '體驗課程', '課程名稱', '課程', '班別']);
    const courseLine = text.split('\n').map(line => line.trim()).find(line => /(?:機器人|STEAM|程式|樂高|科學|美術|繪畫|黏土|桌遊|作文|英文|數學|才藝).*(?:課|班|體驗)/i.test(line)) || '';
    const labeledContact = trialLabeledValue(text, ['家長聯絡方式', '聯絡方式', '家長電話', '聯絡電話', '手機', '電話', '家長LINE', 'LINE', '家長', '聯絡人']);
    const result = {
      date: trialDateFromMessage(text),
      studentName: (labeledStudent || leadingStudent).replace(/(?:同學|小朋友)$/u, '').trim(),
      course: labeledCourse || courseLine.replace(/^(?:試上|體驗)?課程\s*[：:]?\s*/i, ''),
      teacher: labeledTeacher || knownTeacher,
      contactRef: phone || labeledContact,
      trialTime: timeRange ? `${String(Number(timeRange[1])).padStart(2, '0')}:${timeRange[2]}–${String(Number(timeRange[3])).padStart(2, '0')}:${timeRange[4]}` : trialLabeledValue(text, ['試上時間', '上課時間', '時間', '時段']),
    };
    return Object.fromEntries(Object.entries(result).filter(([, value]) => String(value || '').trim()));
  }
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
    { key: 'daily', label: '行政處理與工作留痕', max: 20, rubric: '18–20：工作日皆有紀錄且重要訊息無漏接；14–17：偶有延遲但能補正；10–13：紀錄或回覆不穩定；0–9：多次漏填或未處理。' },
    { key: 'promotion', label: '美宣產出與發布品質', max: 25, rubric: '23–25：每週達成 2 支影片與 3 則照片宣傳，且證據可判讀；18–22：產量大致達標；13–17：多週缺件；0–12：產出或證據明顯不足。' },
    { key: 'followup', label: '試上、繳費與家長追蹤', max: 15, rubric: '14–15：到期事項皆按時追蹤並結案；11–13：少量延遲但有補正；8–10：多筆逾期；0–7：追蹤失聯或資料不完整。' },
    { key: 'deadline', label: '期限與專案推進', max: 20, rubric: '18–20：交辦與專案按期完成，變動會提前回報；14–17：少量延期且有新期限；10–13：多次被動追問；0–9：重大逾期或無進度。' },
    { key: 'environment', label: '環境與資料維護', max: 10, rubric: '9–10：環境、公告與素材持續維持；7–8：問題能於期限改善；5–6：重複出現缺失；0–4：未檢核或未改善。' },
    { key: 'supervisor', label: '正確性與主動回報', max: 10, rubric: '9–10：資料正確、異常提前回報；7–8：偶有疏漏但能主動修正；5–6：需主管多次提醒；0–4：隱匿、漏報或重複錯誤。' },
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
  const ENVIRONMENT_GROUPS = [
    ['counter_zone', '櫃檯與文件', ['counter', 'documents', 'supplies']],
    ['classroom_zone', '教室與公共區', ['floor', 'furniture', 'cabinets', 'publicArea']],
    ['notice_zone', '公告與宣傳物', ['announcements', 'signage']],
    ['shoe_zone', '鞋櫃區', ['shoeCabinet']],
    ['entrance_zone', '門口', ['entrance']],
    ['outside_zone', '外圍環境', ['outside']],
  ];
  const TRIAL_STATUSES = [
    ['waiting_contact', '已預約／待試上'], ['contacted', '試上後已聯絡'], ['considering', '家長考慮中'],
    ['followup_scheduled', '已約下次聯絡'], ['converted', '已報名一期'], ['not_enrolled', '未報名／暫不考慮'],
  ];
  const TRIAL_BONUS_AMOUNT = 50;
  const TRIAL_START_DATE = '2026-08-15';
  const NAV = {
    worker: [
      { route: 'today', label: '今日工作', icon: 'layout-dashboard' },
      { route: 'trials', label: '試上名單', icon: 'user-round-search' },
      { route: 'projects', label: '專案與交辦', icon: 'list-checks' },
      { route: 'performance', label: '成果與評核', icon: 'gauge' },
      { route: 'guide', label: '使用說明', icon: 'book-open-text' },
    ],
    manager: [
      { route: 'dashboard', label: '主管總覽', icon: 'layout-dashboard' },
      { route: 'trials', label: '家長與獎金', icon: 'badge-dollar-sign' },
      { route: 'reviews', label: '工作紀錄', icon: 'notebook-tabs' },
      { route: 'assignments', label: '交辦與專案', icon: 'list-todo' },
      { route: 'evaluation', label: '月度評核', icon: 'clipboard-check' },
      { route: 'cloud', label: '雲端資料', icon: 'folder-open' },
      { route: 'guide', label: '評分標準', icon: 'book-open-text' },
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
    reviewRibbon.innerHTML = `<img src="../../shared/icons/logo.png" alt="" aria-hidden="true"><strong>柏翰互動測試</strong><span aria-hidden="true"></span>目前查看：${esc(currentUser.nickname)} · 可操作完整頁面，不會寫入正式資料 <button type="button" class="test-view-exit" data-action="exit-impersonation">換老師</button>`;
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
      ui: { route: workspace.start, month: currentMonth(), performanceMonth: '', evaluationMonth: '', trialStatus: 'all', lastSavedAt: '' },
      records: [],
      users: [STAFF[0]],
      settings: { supervisor: '小魚', videoWeeklyTarget: 2, photoWeeklyTarget: 3, trialBonusAmount: TRIAL_BONUS_AMOUNT, kpi: KPI },
      drafts: {},
    };
  }
  const sharedStorageKey = 'bp_admin_marketing_v1_shared';
  const personalStorageOwner = TEST_VIEW_MODE
    ? `${identity.session?.impersonated_by || '柏翰'}_test_${currentUser.nickname}`
    : currentUser.nickname;
  const personalStorageKey = `bp_admin_marketing_v1_personal_${encodeURIComponent(personalStorageOwner)}_${workspaceId}`;
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
  function todayCommunication() {
    const current = workerRecords('daily_check').find(item => item.date === todayIso());
    if (current) return current;
    const legacy = todayDaily();
    const messages = legacy?.messages || {};
    if (messages.parentChecked && messages.officialLineChecked && messages.groupChecked) {
      return {
        id: '', date: legacy.date, status: messages.unresolved ? 'needs_supervisor' : 'clear',
        note: messages.unresolved || '', reported: messages.reported === true, legacy: true,
      };
    }
    return null;
  }
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
  function trialIdentity(studentName, contactRef, course, date) {
    const name = String(studentName || '').replace(/\s+/g, '').toLowerCase();
    const contact = String(contactRef || '').replace(/[\s\-()]/g, '').toLowerCase();
    const normalizedCourse = String(course || '').replace(/\s+/g, '').toLowerCase();
    const normalizedDate = String(date || '').slice(0, 10);
    return name && contact && normalizedCourse && normalizedDate ? `${name}|${contact}|${normalizedCourse}|${normalizedDate}` : '';
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
      waiting_contact: ['已預約／待試上', 'warning'], contacted: ['試上後已聯絡', 'info'], considering: ['家長考慮中', 'info'],
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
  function monthFacts(month) {
    const within = item => String(item.date || item.actualDate || '').slice(0, 7) === month;
    const daily = workerRecords('daily').filter(within);
    const dailyChecks = workerRecords('daily_check').filter(within);
    const workItems = daily.flatMap(record => record.items || []);
    const completed = workItems.filter(item => item.status === 'completed');
    const marketing = completed.filter(item => ['video', 'photo_post', 'poster', 'design', 'social_schedule'].includes(item.category));
    const videos = marketing.filter(item => item.category === 'video' && evidenceReady(item)).length;
    const photos = marketing.filter(item => item.category === 'photo_post' && evidenceReady(item)).length;
    const assignments = workerRecords('assignment').filter(item => String(item.date || item.dueDate || '').slice(0, 7) === month);
    const projects = workerRecords('project').filter(item => String(item.date || '').slice(0, 7) === month || String(item.dueDate || '').slice(0, 7) === month);
    const trials = trialRecords().filter(item => String(item.date || '').slice(0, 7) === month || String(item.paymentDate || '').slice(0, 7) === month);
    const overdueTrials = trials.filter(item => !['converted', 'not_enrolled'].includes(item.status) && item.nextFollowupDate && item.nextFollowupDate < todayIso()).length;
    const overdueWork = assignments.filter(item => item.status !== 'completed' && item.dueDate && item.dueDate < todayIso()).length
      + workItems.filter(item => item.status !== 'completed' && item.dueDate && item.dueDate < todayIso()).length;
    const environments = workerRecords('environment').filter(within);
    const environmentIssues = environments.filter(item => item.status === 'needs_action').length;
    const communication = dailyChecks.concat(daily.filter(item => item.messages?.parentChecked)).length;
    const escalations = dailyChecks.filter(item => item.status === 'needs_supervisor').length
      + daily.filter(item => item.messages?.unresolved).length;
    const reported = dailyChecks.filter(item => item.status === 'needs_supervisor' && item.reported).length
      + daily.filter(item => item.messages?.unresolved && item.messages?.reported).length;
    return {
      dailyDays: new Set(daily.map(item => item.date)).size,
      communicationDays: new Set(dailyChecks.map(item => item.date).concat(daily.filter(item => item.messages?.parentChecked).map(item => item.date))).size,
      workCount: workItems.length,
      completedCount: completed.length,
      videos,
      photos,
      overdueTrials,
      converted: trials.filter(item => item.status === 'converted').length,
      openTrials: trials.filter(item => !['converted', 'not_enrolled'].includes(item.status)).length,
      assignmentCount: assignments.length,
      projectCount: projects.length,
      overdueWork,
      environmentDays: environments.length,
      environmentIssues,
      escalations,
      reported,
    };
  }
  function kpiFactText(key, facts) {
    const map = {
      daily: `工作紀錄 ${facts.dailyDays} 天、共 ${facts.workCount} 項；訊息確認 ${facts.communicationDays} 天`,
      promotion: `可判讀完成證據：影片 ${facts.videos} 支、照片宣傳 ${facts.photos} 則`,
      followup: `追蹤中 ${facts.openTrials} 人、已轉一期 ${facts.converted} 人、逾期 ${facts.overdueTrials} 人`,
      deadline: `交辦 ${facts.assignmentCount} 項、專案 ${facts.projectCount} 項、目前逾期 ${facts.overdueWork} 項`,
      environment: `環境檢核 ${facts.environmentDays} 天，其中 ${facts.environmentIssues} 天有改善事項`,
      supervisor: `需主管協助 ${facts.escalations} 次，其中 ${facts.reported} 次已標記主動回報`,
    };
    return map[key] || '目前沒有可彙整資料';
  }
  function publishedScore(month = state.ui.month) {
    return workerRecords('score').find(item => item.month === month && item.published) || null;
  }
  function conversation(month = state.ui.month) {
    return workerRecords('message').find(item => item.month === month) || { messages: [] };
  }
  function scoreMonths(publishedOnly = false) {
    return Array.from(new Set(workerRecords('score')
      .filter(item => !publishedOnly || item.published)
      .map(item => String(item.month || ''))
      .filter(Boolean)))
      .sort((a, b) => b.localeCompare(a));
  }
  function selectedPerformanceMonth() {
    const months = scoreMonths(true);
    return months.includes(state.ui.performanceMonth) ? state.ui.performanceMonth : (months[0] || currentMonth());
  }
  function selectedEvaluationMonth() {
    return state.ui.evaluationMonth || scoreMonths(false)[0] || currentMonth();
  }
  function evaluationHistoryControl(formId, selectedMonth, months, label = '其他月份') {
    if (months.length < 2) return '';
    return `<form id="${formId}" class="month-confirm-form"><label class="field compact-control"><span>${esc(label)}</span><select name="month" aria-label="${esc(label)}">${months.map(month => `<option value="${esc(month)}" ${month === selectedMonth ? 'selected' : ''}>${esc(month)}</option>`).join('')}</select></label><button class="button small" type="submit">確認查看</button></form>`;
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
    if (!isManager && state.ui.route === 'performance') state.ui.performanceMonth = scoreMonths(true)[0] || currentMonth();
    if (isManager && state.ui.route === 'evaluation') state.ui.evaluationMonth = scoreMonths(false)[0] || currentMonth();
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
  function quickAction(label, status, note, iconName, action, tone = '') {
    return `<button type="button" class="quick-action ${tone}" data-action="${esc(action)}"><span class="quick-action-icon">${icon(iconName, 20)}</span><span><strong>${esc(label)}</strong><small>${esc(status)}${note ? ` · ${esc(note)}` : ''}</small></span>${icon('chevron-right', 18)}</button>`;
  }
  function renderTodayItems(daily) {
    const items = daily?.items || [];
    if (!items.length) return emptyState('notebook-pen', '今天還沒有工作紀錄', '完成一件或推進一件工作時再新增，不需要先寫流水帳。', '<button class="button primary" data-action="open-work-item">新增工作</button>');
    return `<div class="record-list compact-records">${items.map(item => `<article class="record-card"><div class="record-head"><div class="record-title"><strong>${esc(item.title)}</strong><small>${esc(categoryLabel(item.category))}${item.actualDate ? ` · ${formatDate(item.actualDate)} 完成` : item.dueDate ? ` · ${formatDate(item.dueDate)} 前處理` : ''}</small></div>${statusBadge(item.status)}</div><p class="record-copy">${nl2br(item.completedToday)}</p>${item.status !== 'completed' && item.remaining ? `<div class="next-action">${icon('arrow-right', 15)}<span><strong>下一步：</strong>${esc(item.remaining)}</span></div>` : ''}<div class="record-actions"><span class="badge ${evidenceReady(item) ? 'success' : ''}">${icon('paperclip', 13)}${(item.evidence || []).length} 份附件</span><button class="button small" data-action="open-work-item" data-id="${esc(item.id)}" data-record-id="${esc(daily.id)}">編輯</button></div></article>`).join('')}</div>`;
  }

  function renderWorkerDashboard() {
    const daily = todayDaily();
    const communication = todayCommunication();
    const weekly = weeklySummary();
    const env = currentEnvironment();
    const todayTrials = trialRecords().filter(item => item.date === todayIso());
    const noTrial = todayTrialMarker();
    const communicationStatus = communication ? (communication.status === 'needs_supervisor' ? '已回報主管' : '已確認') : '尚未確認';
    const envStatus = env ? (env.status === 'needs_action' ? '有待改善項目' : '正常') : '尚未確認';
    const trialStatus = todayTrials.length ? `${todayTrials.length} 位已登錄` : noTrial ? '今日無試上' : '尚未確認';
    return `<section class="page">${pageHead('今日工作', `${formatDate(todayIso())} · 例行事項一次確認，工作只留下結果或下一步`, `<button class="button primary" data-action="open-work-item">${icon('plus')}新增工作</button>`)}
      <div class="quick-actions">
        ${quickAction('訊息與 LINE', communicationStatus, communication?.note || '', communication ? 'message-circle-check' : 'message-circle', 'open-daily-check', communication ? 'done' : '')}
        ${quickAction('一樓環境', envStatus, env?.status === 'needs_action' ? `期限 ${formatDate(env.improvementDue)}` : '', env ? 'sparkles' : 'circle', 'open-environment', env?.status === 'needs_action' ? 'attention' : env ? 'done' : '')}
        ${quickAction('今日試上', trialStatus, '', todayTrials.length || noTrial ? 'user-round-check' : 'user-round-search', 'go-trials', todayTrials.length || noTrial ? 'done' : '')}
      </div>
      ${daily?.reviewComment ? `<div class="notice mt-16">${icon('message-square-text')}<div><strong>${esc(daily.reviewedBy || '主管')}回覆今日工作</strong><br>${nl2br(daily.reviewComment)}<div class="record-actions mt-16"><button class="button small" data-route="performance">前往回覆</button></div></div></div>` : ''}
      <section class="panel mt-16"><div class="panel-head"><div><div class="panel-title">${icon('notebook-pen')}今天的工作</div><div class="panel-subtitle">${daily?.items?.length || 0} 項；不使用主觀完成百分比</div></div><button class="button small" data-action="open-work-item">${icon('plus')}新增</button></div><div class="panel-body flush">${renderTodayItems(daily)}</div></section>
      <div class="grid cols-2 mt-16">
        <section class="panel"><div class="panel-head"><div><div class="panel-title">${icon('calendar-clock')}接下來要處理</div><div class="panel-subtitle">只列有期限且尚未完成的工作</div></div></div><div class="panel-body flush">${renderPriorityList()}</div></section>
        <section class="panel"><div class="panel-head"><div><div class="panel-title">${icon('images')}本週美宣成果</div><div class="panel-subtitle">由完成紀錄與附件自動統計</div></div></div><div class="panel-body"><div class="result-pair"><div><span>影片</span><strong>${weekly.video}/2</strong></div><div><span>照片宣傳</span><strong>${weekly.photo}/3</strong></div></div>${weekly.video >= 2 && weekly.photo >= 3 ? '<div class="notice mt-16">本週產出已達標。</div>' : '<div class="notice warning mt-16">只計入已完成且有可判讀附件的紀錄。</div>'}</div></section>
      </div>
    </section>`;
  }

  function renderPriorityList() {
    const assignments = workerRecords('assignment').filter(item => item.status !== 'completed');
    const work = workerRecords('daily').flatMap(record => (record.items || []).filter(item => item.status !== 'completed').map(item => ({
      id: item.id, recordId: record.id, title: item.title, dueDate: item.dueDate, status: item.status,
      source: '工作日誌', startedAt: record.date, progressNote: item.remaining,
    })));
    const list = assignments.concat(work).sort((a, b) => String(a.dueDate || '9999').localeCompare(String(b.dueDate || '9999'))).slice(0, 6);
    if (!list.length) return emptyState('circle-check-big', '沒有待處理工作', '新增工作或主管交辦後，系統會依期限排在這裡。');
    return `<div class="record-list" style="padding:12px">${list.map(item => `<article class="record-card"><div class="record-head"><div class="record-title"><strong>${esc(item.title)}</strong><small>${esc(item.source || '主管交辦')} · ${item.startedAt ? `建立 ${formatDate(item.startedAt)} · ` : ''}${item.dueDate ? `期限 ${formatDate(item.dueDate)}` : '尚未設定期限'}</small></div>${statusBadge(item.status)}</div>${item.progressNote ? `<p class="record-copy">${nl2br(item.progressNote)}</p>` : ''}<div class="record-actions">${item.source === '工作日誌' ? `<button class="button small" data-action="open-work-item" data-id="${esc(item.id)}" data-record-id="${esc(item.recordId)}">更新</button>` : `<button class="button small" data-action="update-assignment" data-id="${esc(item.id)}">更新</button>`}</div></article>`).join('')}</div>`;
  }

  function renderWeeklyParentCheck() {
    const item = currentTuesday();
    const week = weekBounds();
    const actions = isManager ? '' : `<button class="button small" data-action="open-tuesday-check">${icon(item ? 'pencil' : 'check')}${item ? '更新確認' : '本週確認'}</button><button class="button small teal" data-action="open-followup" ${item ? '' : 'disabled'}>${icon('user-round-plus')}新增家長事項</button>`;
    const checks = item?.checks || {};
    const completed = ['paymentList', 'expiringStudents', 'unpaidParents', 'remindersSent'].filter(key => checks[key]).length;
    return `<section class="panel parent-check"><div class="panel-head"><div><div class="panel-title">${icon('calendar-check-2')}本週收費與續課確認</div><div class="panel-subtitle">${formatDate(week.start)}–${formatDate(week.end)} · 名單一次核對，個別家長另外追蹤</div></div><div class="record-actions no-margin">${item ? '<span class="badge success">已確認</span>' : '<span class="badge warning">尚未確認</span>'}${actions}</div></div><div class="panel-body"><div class="summary-line"><span>固定名單</span><strong>${completed}/4</strong><span>未結案家長</span><strong>${(item?.followups || []).filter(entry => entry.status !== 'closed').length}</strong></div>${item?.note ? `<div class="notice warning mt-16">${icon('circle-alert')}<div>${nl2br(item.note)}</div></div>` : ''}<div class="mt-16">${renderFollowups(item?.followups || [])}</div></div></section>`;
  }

  function renderTrialsPage() {
    const summary = trialMonthSummary();
    const todayItems = trialRecords().filter(item => item.date === todayIso());
    const noTrial = todayTrialMarker();
    const filtered = summary.items.filter(item => state.ui.trialStatus === 'all' || item.status === state.ui.trialStatus);
    const controls = `<label class="field compact-control"><span class="visually-hidden">月份</span><input type="month" id="month-filter" value="${esc(state.ui.month)}"></label><label class="field compact-control"><span class="visually-hidden">追蹤狀態</span><select id="trial-status-filter"><option value="all">全部狀態</option>${TRIAL_STATUSES.map(([value,label]) => `<option value="${value}" ${state.ui.trialStatus === value ? 'selected' : ''}>${esc(label)}</option>`).join('')}</select></label>${isManager ? `<button class="button" data-action="print">${icon('printer')}列印月報</button>` : `<button class="button" data-action="mark-no-trial" ${todayItems.length || noTrial ? 'disabled' : ''}>${icon('calendar-x-2')}今日無試上</button><button class="button primary" data-action="open-trial">${icon('user-round-plus')}登錄試上</button>`}`;
    const todayState = isManager ? '' : `<div class="notice ${todayItems.length || noTrial ? '' : 'warning'}"><span>${icon(todayItems.length || noTrial ? 'circle-check' : 'circle-alert')}</span><div>${todayItems.length ? `今天已登錄 ${todayItems.length} 位試上學生。` : noTrial ? '今天已確認沒有試上學生。' : '今天尚未登錄試上學生，也尚未確認「今日無試上」。'}</div></div>`;
    return `<section class="page trial-page">${pageHead(isManager ? '試上名單與首報獎金' : '試上名單', isManager ? '查看預約進度與首報獎金，不重複輸入行政資料' : '每門試上課程各一筆；試上後只需更新目前結果', controls)}
      ${todayState}
      <div class="mt-16">${renderWeeklyParentCheck()}</div>
      <div class="grid cols-4 mt-16">
        ${metric('本月試上', summary.trials, '依試上日期統計', 'user-round-search')}
        ${metric('轉一期', summary.converted, `轉換率 ${summary.conversionRate}%`, 'user-round-check')}
        ${metric('待追蹤', summary.due.length, summary.due.length ? '含今日到期與逾期' : '目前沒有到期項目', 'calendar-clock')}
        ${metric('已核准獎金', `$${summary.bonus}`, `${summary.approved.length} 人；另 ${summary.pending.length} 人待審`, 'badge-dollar-sign')}
      </div>
      ${isManager && summary.pending.length ? `<div class="notice warning mt-16">${icon('badge-dollar-sign')}<div><strong>${summary.pending.length} 筆首報獎金待確認</strong><br>確認首次一期、繳費證明與未曾領取後再核准。</div></div>` : ''}
      <section class="panel mt-16"><div class="panel-head"><div><div class="panel-title">${icon('users-round')}${esc(state.ui.month)} 試上名單</div><div class="panel-subtitle">每次試上課程各一筆；同一學生可登記不同課程</div></div><span class="badge">${filtered.length} 筆</span></div><div class="panel-body flush">${filtered.length ? `<div class="trial-list">${filtered.map(renderTrialCard).join('')}</div>` : emptyState('user-round-search', '這個月份沒有符合的紀錄', isManager ? '行政登錄試上後會出現在這裡。' : '可提前登記未來試上；沒有試上仍需於當日確認。')}</div></section>
      ${isManager ? renderTrialBonusTable(summary) : ''}
    </section>`;
  }

  function renderTrialCard(item) {
    const overdue = !['converted', 'not_enrolled'].includes(item.status) && item.nextFollowupDate && item.nextFollowupDate < todayIso();
    const lastFollowup = (item.followups || []).slice(-1)[0];
    const action = isManager
      ? `<button class="button small" data-action="view-trial" data-id="${esc(item.id)}">${icon('eye')}查看</button>${['pending_review','rejected'].includes(item.bonusStatus) ? `<button class="button small teal" data-action="review-trial-bonus" data-id="${esc(item.id)}">${icon('badge-check')}${item.bonusStatus === 'rejected' ? '重新審核' : '確認獎金'}</button>` : ''}`
      : `<button class="button small" data-action="open-trial" data-id="${esc(item.id)}">${icon('pencil')}更新</button>`;
    return `<article class="trial-row"><div class="trial-main"><div class="record-head"><div class="record-title"><strong>${esc(item.studentName)}</strong><small>${formatDate(item.date)} 試上 · ${esc(item.course)} · ${esc(item.teacher)}</small></div>${statusBadge(item.status)}</div><div class="trial-meta"><span>${icon('phone',14)}${esc(maskContact(item.contactRef))}</span>${item.nextFollowupDate && !['converted','not_enrolled'].includes(item.status) ? `<span class="${overdue ? 'text-danger' : ''}">${icon('calendar-clock',14)}${overdue ? '已逾期 ' : '下次 '}${formatDate(item.nextFollowupDate)}</span>` : ''}</div>${lastFollowup ? `<p class="record-copy trial-last"><strong>最近追蹤：</strong>${esc(lastFollowup.note)}</p>` : ''}<div class="record-actions">${trialBonusBadge(item)}${action}</div></div></article>`;
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
    return `<div class="record-list" style="padding:12px">${items.map(item => `<article class="record-card"><div class="record-head"><div class="record-title"><strong>${esc(item.person)}</strong><small>${item.status === 'closed' ? '已結案' : `下次追蹤 ${formatDate(item.nextDate)}`}</small></div>${statusBadge(item.status === 'closed' ? 'completed' : 'in_progress')}</div><p class="record-copy"><strong>目前：</strong>${esc(item.situation)}<br><strong>已處理：</strong>${esc(item.handled)}</p>${isManager ? '' : `<div class="record-actions"><button class="button small" data-action="open-followup" data-followup-id="${esc(item.id)}">編輯</button></div>`}</article>`).join('')}</div>`;
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
    const assignments = workerRecords('assignment').slice().sort((a, b) => String(a.dueDate || '').localeCompare(String(b.dueDate || '')));
    return `<section class="page">${pageHead('專案與交辦', '主管交辦與較長期工作集中在同一頁', `<button class="button primary" data-action="open-project">${icon('plus')}新增專案</button>`)}
      <section class="panel"><div class="panel-head"><div><div class="panel-title">${icon('list-todo')}主管交辦</div><div class="panel-subtitle">依期限排列，直接更新下一步或完成狀態</div></div><span class="badge">${assignments.length} 項</span></div><div class="panel-body flush">${assignments.length ? `<div class="record-list compact-records">${assignments.map(renderAssignmentCard).join('')}</div>` : emptyState('list-todo', '目前沒有主管交辦', '小魚建立交辦後會自動出現在這裡。')}</div></section>
      <section class="panel mt-16"><div class="panel-head"><div><div class="panel-title">${icon('gantt-chart-square')}活動與宣傳專案</div><div class="panel-subtitle">只維護目前階段、下一步與期限</div></div><span class="badge">${list.length} 個</span></div><div class="panel-body flush">${list.length ? `<div class="record-list compact-records">${list.map(renderProjectCard).join('')}</div>` : emptyState('gantt-chart-square', '目前沒有專案', '招生活動、體驗週或大型宣傳工作再建立專案，不必把一般工作放進來。', '<button class="button primary" data-action="open-project">新增第一個專案</button>')}</div></section>
    </section>`;
  }
  function renderAssignmentCard(item) {
    return `<article class="record-card"><div class="record-head"><div class="record-title"><strong>${esc(item.title)}</strong><small>${item.dueDate ? `期限 ${formatDate(item.dueDate)}` : '未設定期限'}${item.priority === 'urgent' ? ' · 緊急' : item.priority === 'high' ? ' · 優先' : ''}</small></div>${statusBadge(item.status)}</div><p class="record-copy">${nl2br(item.progressNote || item.detail || '尚未更新')}</p>${item.status !== 'completed' && item.progressNote ? `<div class="next-action">${icon('arrow-right', 15)}<span>${esc(item.progressNote)}</span></div>` : ''}<div class="record-actions"><button class="button small" data-action="update-assignment" data-id="${esc(item.id)}">${item.status === 'completed' ? '查看' : '更新'}</button></div></article>`;
  }
  function renderProjectCard(item) {
    const stages = Array.isArray(item.stages) ? item.stages : [];
    const current = stages.find(stage => stage.status === 'active') || stages.slice().reverse().find(stage => stage.status === 'completed') || {};
    const currentStage = item.currentStage || current.name || '尚未設定';
    const dueDate = item.dueDate || current.dueDate || '';
    return `<article class="record-card"><div class="record-head"><div class="record-title"><strong>${esc(item.title)}</strong><small>${esc(item.projectType)} · ${esc(currentStage)}${dueDate ? ` · 期限 ${formatDate(dueDate)}` : ''}</small></div>${statusBadge(item.status)}</div><p class="record-copy">${nl2br(item.summary || '尚未留下下一步')}</p><div class="record-actions"><span class="badge ${evidenceReady(item) ? 'success' : ''}">${icon('paperclip', 13)}${(item.evidence || []).length} 份附件</span>${isManager ? `<button class="button small" data-action="review-record" data-id="${esc(item.id)}">查看／回覆</button>` : `<button class="button small" data-action="open-project" data-id="${esc(item.id)}">編輯</button>`}</div>${item.reviewComment ? `<div class="notice mt-16">${icon('message-square-text')}<div>${nl2br(item.reviewComment)}</div></div>` : ''}</article>`;
  }

  function renderPerformancePage() {
    const weekly = weeklySummary();
    const month = selectedPerformanceMonth();
    const trials = trialMonthSummary(month);
    const score = publishedScore(month);
    const messages = conversation(month).messages || [];
    const historyControl = evaluationHistoryControl('performance-history-form', month, scoreMonths(true));
    return `<section class="page">${pageHead('我的 KPI', `${month} · 已直接開啟最近一次公布的主管評核`, historyControl)}
      <div class="grid cols-4">${metric('影片宣傳', `${weekly.video}/2`, '本週完成並有證據', 'video')}${metric('照片宣傳', `${weekly.photo}/3`, '本週完成並有證據', 'images')}${metric('首報獎金', `$${trials.bonus}`, `${trials.approved.length} 人已核准 · ${trials.pending.length} 人待審`, 'badge-dollar-sign')}${metric('逾期交辦', weekly.overdue, weekly.overdue ? '請主動說明原因與新期限' : '目前沒有逾期', 'clock-alert')}</div>
      <div class="grid cols-2 mt-16"><section class="panel"><div class="panel-head"><div><div class="panel-title">${icon('gauge')}主管評核</div><div class="panel-subtitle">100 分制</div></div>${score ? `<span class="badge success">${score.total} 分</span>` : '<span class="badge warning">尚未公布</span>'}</div><div class="panel-body">${score ? `${renderKpiBars(score.scores)}${score.comment ? `<div class="notice mt-16">${icon('message-square-text')}<div><strong>主管評語</strong><br>${nl2br(score.comment)}</div></div>` : ''}` : emptyState('lock-keyhole', '主管尚未公布評核', '主管公布第一份評核後，系統會自動開啟最近一次結果。')}</div></section><section class="panel"><div class="panel-head"><div><div class="panel-title">${icon('messages-square')}與主管對話</div><div class="panel-subtitle">主管：小魚</div></div></div><div class="panel-body">${renderMessages(messages)}<form id="message-form" class="mt-16"><input type="hidden" name="month" value="${esc(month)}"><div class="field"><label for="message-text">回覆主管</label><textarea id="message-text" name="text" placeholder="補充進度、說明原因或回覆主管建議"></textarea></div><div class="record-actions"><button class="button teal" type="submit">${icon('send')}送出回覆</button></div></form></div></section></div>
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
    const facts = monthFacts(currentMonth());
    const projects = workerRecords('project').filter(item => item.status !== 'completed');
    return `<section class="page">${pageHead('行政美宣主管總覽', '小魚主管 · 先看事實、期限與需要決策的事項', `<button class="button primary" data-action="open-assignment">${icon('plus')}新增交辦</button>`)}
      <div class="grid cols-4">${metric('本月工作留痕', `${facts.dailyDays} 天`, `共 ${facts.workCount} 項工作`, 'notebook-tabs')}${metric('首報獎金待確認', trialSummary.pending.length, `本月已核准 $${trialSummary.bonus}`, 'badge-dollar-sign')}${metric('本週美宣', `${weekly.video + weekly.photo}/5`, `影片 ${weekly.video}/2 · 照片 ${weekly.photo}/3`, 'images')}${metric('目前逾期', facts.overdueWork + trialSummary.due.length, `工作 ${facts.overdueWork} · 家長 ${trialSummary.due.length}`, 'clock-alert')}</div>
      <div class="grid cols-2 mt-16"><section class="panel"><div class="panel-head"><div><div class="panel-title">${icon('triangle-alert')}主管現在要處理</div><div class="panel-subtitle">逾期、待補充與待審優先</div></div></div><div class="panel-body flush">${renderManagerAlerts()}</div></section><section class="panel"><div class="panel-head"><div><div class="panel-title">${icon('gantt-chart-square')}進行中專案</div><div class="panel-subtitle">目前 ${projects.length} 個</div></div></div><div class="panel-body flush">${projects.length ? `<div class="record-list" style="padding:12px">${projects.slice(0,5).map(item => `<article class="record-card"><div class="record-head"><div class="record-title"><strong>${esc(item.title)}</strong><small>${esc(item.projectType)}</small></div>${statusBadge(item.status)}</div></article>`).join('')}</div>` : emptyState('circle-check-big','沒有進行中專案','新專案建立後會顯示各階段期限。')}</div></section></div>
    </section>`;
  }
  function renderManagerAlerts() {
    const assignments = workerRecords('assignment').filter(item => item.status !== 'completed' && item.dueDate < todayIso()).map(item => ({ ...item, label: '交辦逾期' }));
    const bonuses = trialRecords().filter(item => item.bonusStatus === 'pending_review').map(item => ({ ...item, title: `${item.studentName} 首報獎金`, label: '50 元待確認' }));
    const trials = trialRecords().filter(item => !['converted', 'not_enrolled'].includes(item.status) && item.nextFollowupDate && item.nextFollowupDate <= todayIso()).map(item => ({ ...item, title: `${item.studentName} 家長追蹤`, label: '今日到期／逾期' }));
    const environments = workerRecords('environment').filter(item => item.status === 'needs_action' && item.improvementDue && item.improvementDue <= todayIso()).map(item => ({ ...item, title: `${formatDate(item.date)} 環境改善`, label: '改善期限到期' }));
    const list = bonuses.concat(assignments, trials, environments).slice(0, 8);
    if (!list.length) return emptyState('circle-check-big', '目前沒有急件', '新的獎金確認、逾期或改善事項會排在這裡。');
    return `<div class="record-list" style="padding:12px">${list.map(item => `<article class="record-card"><div class="record-head"><div class="record-title"><strong>${esc(item.title)}</strong><small>${esc(item.label)}${item.dueDate || item.nextFollowupDate || item.improvementDue ? ` · ${formatDate(item.dueDate || item.nextFollowupDate || item.improvementDue)}` : ''}</small></div>${statusBadge(item.bonusStatus || item.status)}</div><div class="record-actions">${item.type === 'trial' && item.bonusStatus === 'pending_review' ? `<button class="button small teal" data-action="review-trial-bonus" data-id="${esc(item.id)}">確認獎金</button>` : item.type === 'trial' ? `<button class="button small" data-action="view-trial" data-id="${esc(item.id)}">查看追蹤</button>` : item.type === 'environment' ? `<button class="button small" data-action="review-record" data-id="${esc(item.id)}">查看問題</button>` : `<button class="button small" data-route="assignments">查看交辦</button>`}</div></article>`).join('')}</div>`;
  }

  function renderReviewsPage() {
    const list = state.records.filter(item => ['daily', 'daily_check', 'tuesday', 'environment', 'project'].includes(item.type)).sort((a, b) => String(b.updatedAt || b.date).localeCompare(String(a.updatedAt || a.date)));
    const title = item => item.type === 'daily' ? `${formatDate(item.date)} 工作紀錄` : item.type === 'daily_check' ? `${formatDate(item.date)} 訊息確認` : item.type === 'tuesday' ? `${formatDate(item.date)} 收費與續課確認` : item.type === 'project' ? item.title : `${formatDate(item.date)} 環境確認`;
    const summary = item => item.type === 'daily' ? `${(item.items || []).length} 項工作` : item.type === 'daily_check' ? (item.status === 'needs_supervisor' ? item.note : '訊息皆已處理') : item.type === 'tuesday' ? `${(item.followups || []).filter(entry => entry.status !== 'closed').length} 項持續追蹤` : item.type === 'project' ? (item.summary || '未留下一步') : item.status === 'needs_action' ? item.issue : '環境正常';
    return `<section class="page">${pageHead('工作紀錄', '按日期查看行政做了什麼；只有需要時再留下主管回覆')}
      <section class="panel"><div class="panel-head"><div><div class="panel-title">${icon('notebook-tabs')}近期紀錄</div><div class="panel-subtitle">不要求逐筆核准，月底評核時可回看事實</div></div><span class="badge">${list.length} 筆</span></div><div class="panel-body flush">${list.length ? `<div class="record-list compact-records">${list.map(item => `<article class="record-card"><div class="record-head"><div class="record-title"><strong>${esc(title(item))}</strong><small>${esc(summary(item))} · 更新 ${formatDateTime(item.updatedAt)}</small></div>${item.reviewComment ? '<span class="badge info">已回覆</span>' : ''}</div><div class="record-actions"><button class="button small" data-action="review-record" data-id="${esc(item.id)}">查看${item.reviewComment ? '／更新回覆' : ''}</button></div></article>`).join('')}</div>` : emptyState('notebook-tabs','目前沒有工作紀錄','皮皮開始使用後，紀錄會依日期出現在這裡。')}</div></section>
    </section>`;
  }

  function renderAssignmentsPage() {
    const list = workerRecords('assignment');
    const projects = workerRecords('project');
    return `<section class="page">${pageHead('交辦與專案', '先看期限與下一步，不要求行政維護主觀百分比', `<button class="button primary" data-action="open-assignment">${icon('plus')}新增交辦</button>`)}
      <section class="panel"><div class="panel-head"><div><div class="panel-title">${icon('list-todo')}主管交辦</div><div class="panel-subtitle">${list.filter(item => item.status !== 'completed').length} 項尚未完成</div></div></div><div class="panel-body flush">${list.length ? `<div class="record-list compact-records">${list.map(renderAssignmentCard).join('')}</div>` : emptyState('list-todo','尚未建立交辦事項','新增後會直接出現在皮皮的今日工作。','<button class="button primary" data-action="open-assignment">新增第一項交辦</button>')}</div></section>
      <section class="panel mt-16"><div class="panel-head"><div><div class="panel-title">${icon('gantt-chart-square')}行政建立的專案</div><div class="panel-subtitle">主管查閱目前階段、下一步與期限</div></div><span class="badge">${projects.length} 個</span></div><div class="panel-body flush">${projects.length ? `<div class="record-list compact-records">${projects.map(renderProjectCard).join('')}</div>` : emptyState('gantt-chart-square','目前沒有專案','行政建立大型活動或宣傳專案後會出現在這裡。')}</div></section>
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
    const month = selectedEvaluationMonth();
    const existing = workerRecords('score').find(item => item.month === month) || { scores: {} };
    const messages = conversation(month).messages || [];
    const facts = monthFacts(month);
    const selection = `<form id="evaluation-selection-form" class="month-confirm-form"><label class="field compact-control"><span>評核月份</span><input type="month" name="month" value="${esc(month)}" max="${currentMonth()}"></label><button class="button small" type="submit">確認查看</button></form><button class="button" data-action="print">${icon('printer')}列印</button>`;
    return `<section class="page">${pageHead('月度評核', '先看系統事實，再依明確尺度評分；不憑印象打分', selection)}
      <div class="evaluation-layout"><section class="panel"><div class="panel-head"><div><div class="panel-title">${icon('clipboard-check')}100 分評核</div><div class="panel-subtitle">${esc(month)} · 每項分數旁皆有資料與評分尺度</div></div><span class="badge ${existing.published ? 'success' : 'warning'}">${existing.published ? '已公布' : '草稿'}</span></div><div class="panel-body"><form id="score-form"><input type="hidden" name="month" value="${esc(month)}"><div class="evaluation-list">${KPI.map(item => `<article class="evaluation-row"><div class="evaluation-copy"><div class="record-title"><strong>${esc(item.label)}</strong><small>滿分 ${item.max} 分</small></div><div class="evidence-fact">${icon('database', 15)}<span>${esc(kpiFactText(item.key, facts))}</span></div><details><summary>查看評分尺度</summary><p>${esc(item.rubric)}</p></details></div><label class="score-input" for="score-${item.key}"><span>分數</span><input id="score-${item.key}" name="${item.key}" type="number" min="0" max="${item.max}" value="${Number(existing.scores?.[item.key] || 0)}" required><small>/ ${item.max}</small></label></article>`).join('')}</div><div class="field full mt-16"><label for="score-comment">本月評語 <span class="conditional">公布時必填</span></label><textarea id="score-comment" name="comment" placeholder="分成：做得好的地方、需改善事項、下月具體重點">${esc(existing.comment || '')}</textarea></div><label class="check-row mt-16"><input type="checkbox" name="published" ${existing.published ? 'checked' : ''}><span>確認分數與評語後，公布給皮皮查看</span></label><div class="record-actions"><button class="button primary" type="submit">${icon('save')}儲存評核</button></div></form></div></section><section class="panel conversation-panel"><div class="panel-head"><div><div class="panel-title">${icon('messages-square')}主管與行政對話</div><div class="panel-subtitle">針對評核與工作進度持續回覆</div></div></div><div class="panel-body">${renderMessages(messages)}<form id="message-form" class="mt-16"><input type="hidden" name="month" value="${esc(month)}"><div class="field"><label for="message-text">給皮皮的訊息</label><textarea id="message-text" name="text" placeholder="詢問進度、說明評核或提供修正方向"></textarea></div><div class="record-actions"><button class="button teal" type="submit">${icon('send')}送出訊息</button></div></form></div></section></div>
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
    return `<section class="page">${pageHead(isManager ? '行政美宣評分標準' : '行政美宣使用說明', '規則集中在這裡，正式填寫頁只保留當下需要的欄位')}
      <div class="grid cols-2"><section class="panel"><div class="panel-head"><div><div class="panel-title">${icon('mouse-pointer-click')}最短填寫方式</div></div></div><div class="panel-body"><ol class="simple-steps"><li><strong>一天一次</strong><span>確認訊息與 LINE、環境、今日是否有試上。</span></li><li><strong>一件工作一筆</strong><span>只寫本次結果；未完成再寫下一步與期限。</span></li><li><strong>同一件持續更新</strong><span>試上、家長追蹤、交辦與專案都不重複建立。</span></li><li><strong>系統自動彙整</strong><span>每週產出、逾期、獎金與月度事實不需另做表格。</span></li></ol></div></section><section class="panel"><div class="panel-head"><div><div class="panel-title">${icon('paperclip')}什麼時候要附件</div></div></div><div class="panel-body"><div class="check-list"><div class="check-row"><span><strong>美宣完成</strong><br>附可發布成品、發布畫面或排程截圖。</span></div><div class="check-row"><span><strong>首次一期獎金</strong><br>附報名或完成繳費證明。</span></div><div class="check-row"><span><strong>一般行政</strong><br>只有主管需要核對結果時才附，不為拍照而拍照。</span></div></div></div></section></div>
      <section class="panel mt-16"><div class="panel-head"><div><div class="panel-title">${icon('target')}固定目標與獎金</div></div></div><div class="panel-body"><div class="rule-grid"><div><span>每週影片</span><strong>2 支</strong><small>完成至可發布狀態</small></div><div><span>照片宣傳</span><strong>3 則</strong><small>單張、多張或圖卡皆可</small></div><div><span>首報獎金</span><strong>50 元／人</strong><small>首次一期且完成繳費</small></div></div></div></section>
      <section class="panel mt-16"><div class="panel-head"><div><div class="panel-title">${icon('gauge')}100 分評核</div><div class="panel-subtitle">主管必須依系統事實與下列尺度評分</div></div></div><div class="panel-body"><div class="rubric-list">${KPI.map(item => `<details><summary><span>${esc(item.label)}</span><strong>${item.max} 分</strong></summary><p>${esc(item.rubric)}</p></details>`).join('')}</div></div></section>
      <section class="panel mt-16"><div class="panel-head"><div><div class="panel-title">${icon('siren')}必須主動回報</div></div></div><div class="panel-body"><div class="tag-list">${['家長客訴','繳費異常','家長長時間未回覆','宣傳延遲','活動資料不足','設備異常','環境無法改善','工作可能逾期'].map(item => `<span class="badge warning">${esc(item)}</span>`).join('')}</div></div></section>
    </section>`;
  }

  function renderRoute() {
    if (workspace.role === 'worker') {
      if (state.ui.route === 'trials') return renderTrialsPage();
      if (['daily', 'tuesday', 'environment'].includes(state.ui.route)) return renderWorkerDashboard();
      if (state.ui.route === 'projects') return renderProjectsPage();
      if (state.ui.route === 'performance') return renderPerformancePage();
      if (state.ui.route === 'guide') return renderGuidePage();
      return renderWorkerDashboard();
    }
    if (state.ui.route === 'trials') return renderTrialsPage();
    if (state.ui.route === 'reviews') return renderReviewsPage();
    if (state.ui.route === 'assignments') return renderAssignmentsPage();
    if (state.ui.route === 'weekly') return renderManagerDashboard();
    if (state.ui.route === 'projects') return renderAssignmentsPage();
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
    document.body.classList.add('dialog-open');
    $('#dialog-root').innerHTML = `<div class="dialog-backdrop" data-action="close-dialog"><section class="dialog ${wide ? 'wide' : ''}" role="dialog" aria-modal="true" aria-labelledby="dialog-title" data-dialog>${content}</section></div>`;
    hydrateIcons();
    window.setTimeout(() => $('#dialog-root input:not([type="hidden"]), #dialog-root textarea, #dialog-root select, #dialog-root button')?.focus(), 20);
  }
  function closeDialog() { $('#dialog-root').innerHTML = ''; document.body.classList.remove('dialog-open'); }
  function dialogShell(title, subtitle, body, submitLabel = '', formId = '') {
    return `<div class="dialog-head"><div><h2 id="dialog-title">${esc(title)}</h2><p>${esc(subtitle)}</p></div><button type="button" class="button icon-only" data-action="close-dialog" aria-label="關閉">${icon('x')}</button></div>${formId ? `<form id="${formId}">` : ''}<div class="dialog-body">${body}</div><div class="dialog-foot"><button type="button" class="button" data-action="close-dialog">取消</button>${submitLabel ? `<button type="submit" class="button primary">${icon('save')}${esc(submitLabel)}</button>` : ''}</div>${formId ? '</form>' : ''}`;
  }
  function existingFileControls(files, fieldName = 'removeEvidence') {
    if (!Array.isArray(files) || !files.length) return '';
    return `<div class="existing-files">${files.map(file => `<label class="file-chip"><span>${icon('paperclip', 13)}${esc(file.fileName || '附件')}</span><input type="checkbox" name="${esc(fieldName)}" value="${esc(file.id || file.fileId || file.url)}"><small>移除</small></label>`).join('')}</div>`;
  }
  function retainedFiles(files, formData, fieldName = 'removeEvidence') {
    const removed = new Set(formData.getAll(fieldName).map(String));
    return (Array.isArray(files) ? files : []).filter(file => !removed.has(String(file.id || file.fileId || file.url)));
  }
  function selectedFilesFor(input) {
    return selectedFilesByInput.get(input) || Array.from(input?.files || []);
  }
  function selectedFileKey(file) {
    return [file?.name || '', Number(file?.size || 0), Number(file?.lastModified || 0), file?.type || ''].join('|');
  }
  function mergeSelectedFiles(input) {
    if (!input) return;
    const combined = [];
    const seen = new Set();
    [...selectedFilesFor(input), ...Array.from(input.files || [])].forEach(file => {
      const key = selectedFileKey(file);
      if (seen.has(key)) return;
      seen.add(key);
      combined.push(file);
    });
    selectedFilesByInput.set(input, combined);
    input.value = '';
    renderSelectedFiles(input);
  }
  function renderSelectedFiles(input) {
    if (!input?.id) return;
    const target = $(`[data-file-preview="${input.id}"]`);
    if (!target) return;
    const files = selectedFilesFor(input);
    target.innerHTML = files.map((file, index) => `<span class="selected-file"><span>${icon('paperclip', 13)}${esc(file.name)}</span><button type="button" data-action="remove-selected-file" data-input-id="${esc(input.id)}" data-index="${index}" aria-label="移除 ${esc(file.name)}">${icon('x', 14)}</button></span>`).join('');
    hydrateIcons();
  }
  function removeSelectedFile(inputId, index) {
    const input = document.getElementById(inputId);
    if (!input) return;
    selectedFilesByInput.set(input, selectedFilesFor(input).filter((file, fileIndex) => fileIndex !== Number(index)));
    renderSelectedFiles(input);
  }

  function openDailyCheck() {
    const item = todayCommunication() || {};
    const status = item.status || 'clear';
    const body = `<div class="notice">${icon('message-circle-check')}<div>一次確認家長訊息、官方 LINE 與班級群組，不會在每一筆工作重複詢問。</div></div><div class="choice-grid mt-16"><label class="choice-card"><input type="radio" name="status" value="clear" ${status === 'clear' ? 'checked' : ''}><span>${icon('circle-check')}<strong>已處理完成</strong><small>目前沒有需要主管決定的事項</small></span></label><label class="choice-card"><input type="radio" name="status" value="needs_supervisor" ${status === 'needs_supervisor' ? 'checked' : ''}><span>${icon('circle-alert')}<strong>需要主管協助</strong><small>留下問題並確認已回報</small></span></label></div><div class="form-grid mt-16" data-daily-issue><div class="field full"><label for="daily-check-note">需要主管協助的事項 <span class="required">*</span></label><textarea id="daily-check-note" name="note" placeholder="寫清楚目前狀況與需要主管決定的內容">${esc(item.note || '')}</textarea></div><label class="check-row field full"><input type="checkbox" name="reported" ${item.reported ? 'checked' : ''}><span>我已主動回報小魚主管</span></label></div>`;
    showDialog(dialogShell('今日訊息確認', '一天只需完成一次', body, '儲存確認', 'daily-check-form'));
    updateDailyCheckVisibility();
  }
  function updateDailyCheckVisibility() {
    const status = $('#daily-check-form input[name="status"]:checked')?.value || 'clear';
    const block = $('[data-daily-issue]');
    if (block) block.hidden = status !== 'needs_supervisor';
  }

  function openWorkItem(itemId = '', recordId = '') {
    const daily = (recordId ? workerRecords('daily').find(record => record.id === recordId) : null) || todayDaily();
    const item = (daily?.items || []).find(entry => entry.id === itemId) || state.drafts.workItem || {};
    const body = `<input type="hidden" name="itemId" value="${esc(item.id || '')}"><input type="hidden" name="recordId" value="${esc(daily?.id || '')}"><div class="form-grid"><div class="field"><label for="work-category">工作類型 <span class="required">*</span></label><select id="work-category" name="category" required><option value="">請選擇</option>${CATEGORIES.map(([key,label]) => `<option value="${key}" ${item.category === key ? 'selected' : ''}>${esc(label)}</option>`).join('')}</select></div><div class="field"><label for="work-title">工作名稱 <span class="required">*</span></label><input id="work-title" name="title" value="${esc(item.title || '')}" placeholder="例：9 月體驗週海報" required></div><div class="field full"><label for="completed-today">本次處理結果 <span class="required">*</span></label><textarea id="completed-today" name="completedToday" placeholder="例：完成第一版海報並送主管確認" required>${esc(item.completedToday || '')}</textarea></div><div class="field full"><label for="work-status">目前狀態 <span class="required">*</span></label><select id="work-status" name="status"><option value="completed" ${item.status === 'completed' ? 'selected' : ''}>已完成</option><option value="in_progress" ${item.status === 'in_progress' || !item.status ? 'selected' : ''}>還要繼續</option><option value="waiting" ${item.status === 'waiting' ? 'selected' : ''}>等待主管／外部資料</option></select></div><div class="field full" data-work-next><label for="remaining">下一步 <span class="required">*</span></label><input id="remaining" name="remaining" value="${esc(item.remaining || '')}" placeholder="例：確認課程時間與 QR Code"></div><div class="field" data-work-next><label for="due-date">下次完成期限 <span class="required">*</span></label><input id="due-date" name="dueDate" type="date" value="${esc(item.dueDate || '')}"></div><div class="field full"><label for="work-evidence">附件 <span class="conditional">美宣標記完成時必填</span></label><input id="work-evidence" name="evidence" type="file" multiple accept="image/*,video/*,.pdf,.ppt,.pptx"><div class="field-help">可分次多選並逐檔移除；單檔上限 25 MB，大圖會自動壓縮。</div><div class="selected-files" data-file-preview="work-evidence"></div>${existingFileControls(item.evidence || [])}</div></div>`;
    showDialog(dialogShell(itemId ? '編輯工作' : '新增工作', '完成填結果；未完成再填下一步與期限', body, '儲存', 'work-item-form'));
    updateWorkFormVisibility();
  }
  function updateWorkFormVisibility() {
    const completed = $('#work-status')?.value === 'completed';
    $$('[data-work-next]').forEach(node => { node.hidden = completed; });
  }

  function openTrial(id = '') {
    const item = trialRecords().find(entry => entry.id === id) || {};
    const isNew = !item.id;
    const approved = item.bonusStatus === 'approved';
    const importPanel = isNew ? `<section class="trial-import"><label for="trial-message-import">貼上家長的試上訊息</label><textarea id="trial-message-import" placeholder="可直接貼上 LINE 訊息，例如：\n學生：王小明\n日期：9/1\n時間：19:00-20:30\n課程：機器人入門\n老師：皮皮老師\n電話：0912-345-678"></textarea><div class="trial-import-actions"><small id="trial-parse-status" class="trial-parse-status">系統只在目前頁面辨識，不會保存整段對話。</small><button type="button" class="button small teal" data-action="parse-trial-message">${icon('scan-text')}辨識並帶入</button></div></section>` : '';
    const body = `${importPanel}<input type="hidden" name="trialId" value="${esc(item.id || '')}"><div class="form-grid">
      <div class="field"><label for="trial-date">預約試上日期 <span class="required">*</span></label><input id="trial-date" name="date" type="date" min="${TRIAL_START_DATE}" value="${esc(item.date || todayIso())}" ${isNew ? '' : 'readonly'} required><div class="field-help">自 2026/08/15 起登記；家長預約後即可提前建立。</div></div>
      <div class="field"><label for="trial-student">學生姓名 <span class="required">*</span></label><input id="trial-student" name="studentName" value="${esc(item.studentName || '')}" ${approved ? 'readonly' : ''} required></div>
      <div class="field"><label for="trial-course">試上課程 <span class="required">*</span></label><input id="trial-course" name="course" value="${esc(item.course || '')}" placeholder="例：機器人入門" required></div>
      <div class="field"><label for="trial-time">試上時段</label><input id="trial-time" name="trialTime" value="${esc(item.trialTime || '')}" placeholder="例：19:00–20:30"></div>
      <div class="field"><label for="trial-teacher">授課老師 <span class="required">*</span></label><input id="trial-teacher" name="teacher" value="${esc(item.teacher || '')}" required></div>
      <div class="field"><label for="trial-contact">家長聯絡方式／識別資料 <span class="required">*</span></label><input id="trial-contact" name="contactRef" value="${esc(item.contactRef || '')}" placeholder="手機末碼、LINE 名稱或其他可辨識資料" ${approved ? 'readonly' : ''} required></div>
      ${isNew ? '<input type="hidden" name="status" value="waiting_contact">' : `<div class="field"><label for="trial-status">目前結果 <span class="required">*</span></label><select id="trial-status" name="status" ${approved ? 'disabled' : ''}>${TRIAL_STATUSES.map(([value,label]) => `<option value="${value}" ${(item.status || 'waiting_contact') === value ? 'selected' : ''}>${esc(label)}</option>`).join('')}</select>${approved ? `<input type="hidden" name="status" value="${esc(item.status)}">` : ''}</div>`}
      ${isNew ? '' : `<div class="field" data-trial-next><label for="trial-next">提醒日期 <span class="conditional">需要系統提醒時再填</span></label><input id="trial-next" name="nextFollowupDate" type="date" value="${esc(item.nextFollowupDate || '')}"></div>`}
    </div>${isNew ? '<div class="notice mt-16">新增後會先顯示「已預約／待試上」；試上結束後再按更新選擇結果。</div>' : ''}<details class="compact-details mt-16" ${item.note ? 'open' : ''}><summary>${icon('message-square-more')}家長回覆／特殊備註（選填）</summary><div class="compact-details-body"><div class="field full"><label for="trial-note">備註</label><textarea id="trial-note" name="note" placeholder="只有需要保留的家長回覆或特殊狀況才填">${esc(item.note || '')}</textarea></div></div></details>
    <section class="subsection conversion-fields" data-conversion-fields><h3>首次一期報名與繳費</h3><div class="notice">${icon('badge-dollar-sign')}<div>只有「首次正式報名並完成繳費」才會產生 50 元待審獎金；續報不計。</div></div><div class="form-grid mt-16"><div class="field"><label for="enrollment-date">一期報名日期 <span class="required">*</span></label><input id="enrollment-date" name="enrollmentDate" type="date" value="${esc(item.enrollmentDate || '')}" ${approved ? 'readonly' : ''}></div><div class="field"><label for="payment-date">繳費確認日期 <span class="required">*</span></label><input id="payment-date" name="paymentDate" type="date" value="${esc(item.paymentDate || '')}" ${approved ? 'readonly' : ''}></div><div class="field full"><label for="enrollment-course">正式報名課程 <span class="required">*</span></label><input id="enrollment-course" name="enrollmentCourse" value="${esc(item.enrollmentCourse || '')}" ${approved ? 'readonly' : ''}></div><div class="field"><label for="first-enrollment">是否為第一次正式報名 <span class="required">*</span></label><select id="first-enrollment" name="firstEnrollment" ${approved ? 'disabled' : ''}><option value="">請確認</option><option value="yes" ${item.firstEnrollment === true ? 'selected' : ''}>是，第一次報名一期</option><option value="no" ${item.firstEnrollment === false && item.status === 'converted' ? 'selected' : ''}>不是，屬續報／轉班</option></select>${approved ? '<input type="hidden" name="firstEnrollment" value="yes">' : ''}</div><div class="field"><label for="payment-evidence">報名／繳費證明 <span class="required">*</span> <span class="conditional">首次報名時</span></label><input id="payment-evidence" name="paymentEvidence" type="file" multiple accept="image/*,.pdf" ${approved ? 'disabled' : ''}><div class="field-help">可一次選多張截圖，儲存前可移除點錯的檔案。</div><div class="selected-files" data-file-preview="payment-evidence"></div>${approved ? '' : existingFileControls(item.paymentEvidence || [], 'removePaymentEvidence')}</div></div>${trialBonusBadge(item)}</section>`;
    showDialog(dialogShell(isNew ? '登錄試上預約' : `更新 ${item.studentName}`, isNew ? '可登記未來日期；同一學生的不同課程分開建立' : '只更新目前結果；不必另外新增追蹤紀錄', body, isNew ? '儲存預約' : '儲存更新', 'trial-form'), true);
    updateTrialFormVisibility();
  }

  function updateTrialFormVisibility() {
    const select = $('#trial-status');
    const section = $('[data-conversion-fields]');
    const concluded = ['converted', 'not_enrolled'].includes(select?.value || '');
    if (section) section.hidden = select?.value !== 'converted';
    const next = $('[data-trial-next]');
    if (next) next.hidden = concluded;
  }

  function applyTrialMessageParsing(overwrite = false) {
    const input = $('#trial-message-import');
    const status = $('#trial-parse-status');
    if (!input || !status) return;
    const parsed = parseTrialMessage(input.value);
    const fields = [
      ['date', '#trial-date', '日期'], ['studentName', '#trial-student', '學生'], ['course', '#trial-course', '課程'],
      ['trialTime', '#trial-time', '時段'], ['teacher', '#trial-teacher', '老師'], ['contactRef', '#trial-contact', '聯絡資料'],
    ];
    const filled = [];
    fields.forEach(([key, selector, label]) => {
      const control = $(selector);
      const hasValue = String(control?.value || '').trim();
      const mayReplaceDefaultDate = key === 'date' && hasValue === todayIso();
      if (!control || !parsed[key] || (!overwrite && hasValue && !mayReplaceDefaultDate)) return;
      control.value = parsed[key];
      filled.push(label);
    });
    const requiredMissing = [
      ['#trial-student', '學生'], ['#trial-course', '課程'], ['#trial-teacher', '老師'], ['#trial-contact', '聯絡資料'],
    ].filter(([selector]) => !String($(selector)?.value || '').trim()).map(([, label]) => label);
    const recognized = fields.filter(([key]) => parsed[key]).map(([, , label]) => label);
    status.className = `trial-parse-status ${requiredMissing.length ? 'is-partial' : 'is-ready'}`;
    status.textContent = filled.length
      ? `已帶入：${filled.join('、')}。${requiredMissing.length ? `請再確認：${requiredMissing.join('、')}。` : '必填資料已齊，請確認內容後儲存。'}`
      : recognized.length
        ? `已辨識：${recognized.join('、')}。欄位已有相同內容，請確認後儲存。`
        : '尚未辨識到可帶入的資料，請確認訊息中有姓名、課程、老師或電話等資訊。';
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
    const trialLabel = [formatDate(item.date), item.trialTime, item.course].filter(Boolean).join(' · ');
    const body = `<input type="hidden" name="recordId" value="${esc(item.id)}"><div class="detail-grid"><div><span>學生</span><strong>${esc(item.studentName)}</strong></div><div><span>家長識別</span><strong>${esc(item.contactRef)}</strong></div><div><span>試上</span><strong>${esc(trialLabel)}</strong></div><div><span>授課老師</span><strong>${esc(item.teacher)}</strong></div><div><span>目前狀態</span><strong>${esc(trialStatusLabel(item.status))}</strong></div><div><span>負責人</span><strong>${esc(item.owner || workerName)}</strong></div>${item.status === 'converted' ? `<div><span>正式報名</span><strong>${formatDate(item.enrollmentDate)} · ${esc(item.enrollmentCourse)}</strong></div><div><span>繳費確認</span><strong>${formatDate(item.paymentDate)}</strong></div><div><span>首次報名</span><strong>${item.firstEnrollment ? '是' : '否，不計獎金'}</strong></div><div><span>獎金狀態</span><strong>${item.bonusStatus === 'approved' ? '已核准 50 元' : item.bonusStatus === 'rejected' ? '不符合' : '待主管確認'}</strong></div>` : ''}</div>${evidence ? `<div class="file-list mt-16">${evidence}</div>` : ''}<h3>處理時間軸</h3>${renderTrialTimeline(item)}${review}`;
    showDialog(dialogShell(withReview ? '確認首報獎金' : '試上追蹤明細', `${item.studentName} · ${formatDate(item.date)} 試上`, body, withReview ? '儲存審核' : '', withReview ? 'trial-bonus-form' : ''), true);
  }

  function openNoTrialConfirm() {
    const body = `<div class="notice">${icon('calendar-x-2')}<div><strong>${formatDate(todayIso())} 沒有試上學生</strong><br>確認後今日完整度會標記完成；若稍後臨時有試上，新增學生時系統會自動取消此標記。</div></div>`;
    showDialog(dialogShell('確認今日無試上', '用來區分沒有試上與忘記登錄', body, '確認無試上', 'no-trial-form'));
  }

  function openTuesday(mode = 'check', followupId = '') {
    const item = currentTuesday() || {};
    const followup = (item.followups || []).find(entry => entry.id === followupId) || {};
    const checks = item.checks || {};
    if (mode === 'followup') {
      if (!item.id) {
        toast('請先完成本週行政確認，再新增個別追蹤', 'warning');
        return;
      }
      const body = `<input type="hidden" name="mode" value="followup"><input type="hidden" name="followupId" value="${esc(followup.id || '')}"><div class="form-grid"><div class="field"><label for="followup-person">學生／家長 <span class="required">*</span></label><input id="followup-person" name="person" value="${esc(followup.person || '')}" required></div><div class="field"><label for="followup-status">狀態</label><select id="followup-status" name="followupStatus"><option value="open" ${followup.status !== 'closed' ? 'selected' : ''}>持續追蹤</option><option value="closed" ${followup.status === 'closed' ? 'selected' : ''}>已結案</option></select></div><div class="field full"><label for="followup-situation">目前狀況 <span class="required">*</span></label><textarea id="followup-situation" name="situation" required>${esc(followup.situation || '')}</textarea></div><div class="field full"><label for="followup-handled">這次已處理 <span class="required">*</span></label><textarea id="followup-handled" name="handled" required>${esc(followup.handled || '')}</textarea></div><div class="field"><label for="followup-next">下次追蹤日期 <span class="conditional">持續追蹤時必填</span></label><input id="followup-next" name="nextDate" type="date" value="${esc(followup.nextDate || '')}"></div></div>`;
      showDialog(dialogShell(followupId ? '更新家長事項' : '新增家長事項', '同一筆持續更新，直到結案', body, '儲存追蹤', 'tuesday-form'));
      return;
    }
    const body = `<input type="hidden" name="mode" value="check"><div class="notice">${icon('calendar-check-2')}<div>每週只確認一次；個別未結案家長請另外新增追蹤，不塞在同一張表單。</div></div><div class="grid cols-2 mt-16"><label class="check-row"><input type="checkbox" name="paymentList" ${checks.paymentList ? 'checked' : ''}><span>需繳費名單已核對</span></label><label class="check-row"><input type="checkbox" name="expiringStudents" ${checks.expiringStudents ? 'checked' : ''}><span>到期／續課名單已核對</span></label><label class="check-row"><input type="checkbox" name="unpaidParents" ${checks.unpaidParents ? 'checked' : ''}><span>未繳費家長已核對</span></label><label class="check-row"><input type="checkbox" name="remindersSent" ${checks.remindersSent ? 'checked' : ''}><span>需要提醒者已完成聯絡</span></label></div><div class="form-grid mt-16"><div class="field"><label for="tuesday-date">確認日期</label><input id="tuesday-date" name="date" type="date" value="${esc(item.date || todayIso())}" required></div><div class="field full"><label for="tuesday-note">例外或需主管協助 <span class="conditional">沒有可留白</span></label><textarea id="tuesday-note" name="note" placeholder="只寫異常、爭議或需要主管決定的事項">${esc(item.note || '')}</textarea></div></div>`;
    showDialog(dialogShell('本週行政確認', '四項名單一次核對', body, '儲存確認', 'tuesday-form'));
  }

  function openEnvironment() {
    const item = currentEnvironment() || {};
    const hasIssue = item.status === 'needs_action';
    const affected = ENVIRONMENT_GROUPS.filter(([, , keys]) => keys.some(key => item.checks && item.checks[key] === false)).map(([key]) => key);
    const body = `<div class="choice-grid"><label class="choice-card"><input type="radio" name="environmentStatus" value="clear" ${hasIssue ? '' : 'checked'}><span>${icon('circle-check')}<strong>今日正常</strong><small>各區域皆已確認</small></span></label><label class="choice-card"><input type="radio" name="environmentStatus" value="issue" ${hasIssue ? 'checked' : ''}><span>${icon('triangle-alert')}<strong>有待改善</strong><small>選擇區域並設定期限</small></span></label></div><div data-environment-issue><h3>問題區域 <span class="required">*</span></h3><div class="compact-check-grid">${ENVIRONMENT_GROUPS.map(([key,label]) => `<label class="check-row"><input type="checkbox" name="issue-${key}" ${affected.includes(key) ? 'checked' : ''}><span>${esc(label)}</span></label>`).join('')}</div><div class="form-grid mt-16"><div class="field full"><label for="environment-issue">問題與改善方式 <span class="required">*</span></label><textarea id="environment-issue" name="issue" placeholder="例：門口紙箱未清，今日閉店前移除">${esc(item.issue || '')}</textarea></div><div class="field"><label for="environment-due">改善期限 <span class="required">*</span></label><input id="environment-due" name="improvementDue" type="date" value="${esc(item.improvementDue || '')}"></div></div></div><div class="field mt-16"><label for="environment-files">環境照片 <span class="conditional">選填</span></label><input id="environment-files" name="evidence" type="file" multiple accept="image/*"><div class="field-help">可一次選多張，不需要另外寫照片判讀說明。</div><div class="selected-files" data-file-preview="environment-files"></div>${existingFileControls(item.evidence || [])}</div>`;
    showDialog(dialogShell('今日環境確認', '正常一鍵完成，有問題才展開細節', body, '儲存', 'environment-form'));
    updateEnvironmentVisibility();
  }
  function updateEnvironmentVisibility() {
    const status = $('#environment-form input[name="environmentStatus"]:checked')?.value || 'clear';
    const block = $('[data-environment-issue]');
    if (block) block.hidden = status !== 'issue';
  }

  function openProject(id = '') {
    const item = workerRecords('project').find(entry => entry.id === id) || {};
    const stages = Array.isArray(item.stages) ? item.stages : [];
    const current = stages.find(stage => stage.status === 'active') || stages.slice().reverse().find(stage => stage.status === 'completed') || {};
    const currentStage = item.currentStage || current.name || PROJECT_STAGES[0];
    const dueDate = item.dueDate || current.dueDate || '';
    const body = `<input type="hidden" name="projectId" value="${esc(item.id || '')}"><div class="form-grid"><div class="field"><label for="project-title">專案名稱 <span class="required">*</span></label><input id="project-title" name="title" value="${esc(item.title || '')}" required></div><div class="field"><label for="project-type">專案類型 <span class="required">*</span></label><select id="project-type" name="projectType" required><option value="">請選擇</option>${['招生活動','體驗週','節慶活動','特別課程','比賽活動','新班招生','其他'].map(value => `<option ${item.projectType === value ? 'selected' : ''}>${value}</option>`).join('')}</select></div><div class="field"><label for="project-stage">目前階段 <span class="required">*</span></label><select id="project-stage" name="currentStage">${PROJECT_STAGES.map(name => `<option value="${esc(name)}" ${currentStage === name ? 'selected' : ''}>${esc(name)}</option>`).join('')}</select></div><div class="field"><label for="project-status">狀態</label><select id="project-status" name="status"><option value="planning" ${item.status === 'planning' || !item.status ? 'selected' : ''}>規劃中</option><option value="active" ${item.status === 'active' ? 'selected' : ''}>進行中</option><option value="waiting" ${item.status === 'waiting' ? 'selected' : ''}>等待主管／資料</option><option value="completed" ${item.status === 'completed' ? 'selected' : ''}>已完成</option><option value="paused" ${item.status === 'paused' ? 'selected' : ''}>暫停</option></select></div><div class="field full"><label for="project-summary">現在做到哪裡／下一步 <span class="required">*</span></label><textarea id="project-summary" name="summary" placeholder="例：海報初稿完成，下一步送主管確認文案" required>${esc(item.summary || '')}</textarea></div><div class="field"><label for="project-due">這一階段期限 <span class="required">*</span></label><input id="project-due" name="dueDate" type="date" value="${esc(dueDate)}" required></div><div class="field full"><label for="project-files">附件 <span class="conditional">完成時至少一份</span></label><input id="project-files" name="evidence" type="file" multiple accept="image/*,video/*,.pdf,.ppt,.pptx"><div class="selected-files" data-file-preview="project-files"></div>${existingFileControls(item.evidence || [])}</div></div>${stages.length ? `<details class="compact-details mt-16"><summary>${icon('history')}查看舊版階段紀錄</summary><div class="compact-details-body"><div class="check-list">${stages.map(stage => `<div class="check-row"><span><strong>${esc(stage.name)}</strong> · ${esc(stage.status === 'completed' ? '已完成' : stage.status === 'active' ? '進行中' : '未開始')}${stage.dueDate ? ` · ${formatDate(stage.dueDate)}` : ''}</span></div>`).join('')}</div></div></details>` : ''}`;
    showDialog(dialogShell(id ? '更新專案' : '新增專案', '只維護目前階段、下一步與期限', body, '儲存', 'project-form'));
  }

  function openAssignment(id = '') {
    const item = workerRecords('assignment').find(entry => entry.id === id) || {};
    const managerEdit = isManager;
    const body = managerEdit ? `<input type="hidden" name="assignmentId" value="${esc(item.id || '')}"><div class="form-grid"><div class="field full"><label for="assignment-title">工作內容 <span class="required">*</span></label><input id="assignment-title" name="title" value="${esc(item.title || '')}" required></div><div class="field full"><label for="assignment-detail">交辦說明 <span class="required">*</span></label><textarea id="assignment-detail" name="detail" required>${esc(item.detail || '')}</textarea></div><div class="field"><label for="assignment-date">交辦日期</label><input id="assignment-date" name="date" type="date" value="${esc(item.date || todayIso())}" required></div><div class="field"><label for="assignment-due">完成期限 <span class="required">*</span></label><input id="assignment-due" name="dueDate" type="date" value="${esc(item.dueDate || '')}" required></div><div class="field"><label for="assignment-priority">優先層級</label><select id="assignment-priority" name="priority"><option value="normal" ${item.priority === 'normal' || !item.priority ? 'selected' : ''}>一般</option><option value="high" ${item.priority === 'high' ? 'selected' : ''}>優先</option><option value="urgent" ${item.priority === 'urgent' ? 'selected' : ''}>緊急</option></select></div></div>` : `<input type="hidden" name="assignmentId" value="${esc(item.id || '')}"><div class="notice">${icon('clipboard-list')}<div><strong>${esc(item.title)}</strong><br>期限 ${formatDate(item.dueDate)}<br>${nl2br(item.detail)}</div></div><div class="form-grid mt-16"><div class="field"><label for="assignment-status">狀態 <span class="required">*</span></label><select id="assignment-status" name="status"><option value="pending" ${item.status === 'pending' ? 'selected' : ''}>待處理</option><option value="in_progress" ${item.status === 'in_progress' ? 'selected' : ''}>進行中</option><option value="waiting" ${item.status === 'waiting' ? 'selected' : ''}>等待確認／資料</option><option value="completed" ${item.status === 'completed' ? 'selected' : ''}>已完成</option></select></div><div class="field full"><label for="assignment-note" data-assignment-note-label>${item.status === 'completed' ? '完成結果' : '目前結果與下一步'} <span class="required">*</span></label><textarea id="assignment-note" name="progressNote" required>${esc(item.progressNote || '')}</textarea></div><div class="field full"><label for="assignment-evidence">附件 <span class="conditional">完成時至少一份</span></label><input id="assignment-evidence" name="evidence" type="file" multiple accept="image/*,video/*,.pdf,.ppt,.pptx"><div class="selected-files" data-file-preview="assignment-evidence"></div>${existingFileControls(item.evidence || [])}</div></div>`;
    showDialog(dialogShell(managerEdit ? (id ? '編輯主管交辦' : '新增主管交辦') : '更新交辦', managerEdit ? '期限是交辦的一部分，不建立沒有期限的待辦' : '留下結果或具體下一步，不填主觀百分比', body, managerEdit ? '儲存交辦' : '儲存', 'assignment-form'), true);
    if (!managerEdit) updateAssignmentVisibility();
  }
  function updateAssignmentVisibility() {
    const completed = $('#assignment-status')?.value === 'completed';
    const label = $('[data-assignment-note-label]');
    if (label) label.innerHTML = `${completed ? '完成結果' : '目前結果與下一步'} <span class="required">*</span>`;
  }

  function openReview(id) {
    const item = state.records.find(record => record.id === id);
    if (!item) return;
    let detail = '';
    if (item.type === 'daily') detail = (item.items || []).map(work => `<article class="record-card"><div class="record-head"><div class="record-title"><strong>${esc(work.title)}</strong><small>${esc(categoryLabel(work.category))}</small></div>${statusBadge(work.status)}</div><p class="record-copy">${nl2br(work.completedToday)}</p>${work.remaining ? `<div class="next-action">${icon('arrow-right', 15)}<span><strong>下一步：</strong>${esc(work.remaining)}${work.dueDate ? ` · ${formatDate(work.dueDate)}` : ''}</span></div>` : ''}<div class="file-list">${(work.evidence || []).map(file => `<a class="badge success" href="${esc(file.url)}" target="_blank" rel="noopener">${icon('paperclip',12)}${esc(file.fileName)}</a>`).join('')}</div></article>`).join('');
    else if (item.type === 'daily_check') detail = `<div class="notice ${item.status === 'needs_supervisor' ? 'warning' : ''}">${icon(item.status === 'needs_supervisor' ? 'circle-alert' : 'message-circle-check')}<div>${item.status === 'needs_supervisor' ? nl2br(item.note) : '家長訊息、官方 LINE 與班級群組皆已確認。'}${item.reported ? '<br><strong>已主動回報主管</strong>' : ''}</div></div>`;
    else if (item.type === 'tuesday') {
      const labels = { paymentList: '需繳費名單', expiringStudents: '到期／續課名單', unpaidParents: '未繳費家長', remindersSent: '提醒與追蹤' };
      detail = `<div class="check-list">${Object.entries(labels).map(([key,value]) => `<div class="check-row">${icon(item.checks?.[key] ? 'circle-check' : 'circle-x',19)}<span>${esc(value)}</span></div>`).join('')}</div>${item.note ? `<div class="notice warning mt-16">${nl2br(item.note)}</div>` : ''}${renderFollowups(item.followups || [])}`;
    }
    else if (item.type === 'project') detail = `<div class="record-card"><div class="record-title"><strong>${esc(item.title)}</strong><small>${esc(item.projectType)}</small></div><p class="record-copy">${nl2br(item.summary || '未填專案說明')}</p></div><div class="stage-list mt-16">${(item.stages || []).map(stage => `<div class="check-row">${icon(stage.status === 'completed' ? 'circle-check' : stage.status === 'active' ? 'loader-circle' : 'circle',19)}<span><strong>${esc(stage.name)}</strong>${stage.dueDate ? ` · 預計 ${formatDate(stage.dueDate)}` : ''}${stage.actualDate ? ` · 實際 ${formatDate(stage.actualDate)}` : ''}</span></div>`).join('')}</div>`;
    else detail = `<div class="grid cols-2">${ENVIRONMENT_CHECKS.map(([key,label]) => `<div class="check-row">${icon(item.checks?.[key] ? 'circle-check' : 'circle-x',19)}<span>${esc(label)}</span></div>`).join('')}</div>${item.issue ? `<div class="notice danger mt-16">${icon('triangle-alert')}<div>${esc(item.issue)} · 改善期限 ${formatDate(item.improvementDue)}</div></div>` : ''}`;
    const body = `${detail}<div class="field mt-16"><label for="review-note">主管回覆 <span class="conditional">需要時再填</span></label><textarea id="review-note" name="note" placeholder="指出做得好的地方、需調整事項或具體下一步">${esc(item.reviewComment || '')}</textarea></div>`;
    showDialog(dialogShell('查看工作紀錄', `${formatDate(item.date)} · ${item.nickname || workerName}`, `<input type="hidden" name="recordId" value="${esc(item.id)}">${body}`, '儲存主管回覆', 'review-form'), true);
  }

  function profileDialog() {
    const labels = (window.KPI_WORKSPACES?.getAssignments?.(currentUser) || []).map(item => item.shortLabel || item.label).join('、');
    const testAction = TEST_VIEW_MODE
      ? `<button type="button" class="button primary" data-action="exit-impersonation">${icon('undo-2')}換一位老師</button>`
      : canOpenTestView ? `<button type="button" class="button primary" data-action="open-test-view">${icon('scan-eye')}測試老師畫面</button>` : '';
    const body = `<div class="record-card"><div class="record-title"><strong>${esc(currentUser.nickname)}</strong><small>${esc(workspace.label)} · ${esc(currentUser.department || '')}</small></div></div>${window.KPI_WORKSPACES?.renderQuickSwitcher?.(currentUser, { currentId: workspaceId }) || ''}${TEST_VIEW_MODE ? '<div class="notice warning mt-16">目前為互動測試：可以開啟、輸入與切換完整流程；儲存、送出、核准、上傳與通知不會寫入正式資料。</div>' : ''}${testAction ? `<div class="record-actions mt-16">${testAction}</div>` : ''}`;
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
  function isImageFile(file) {
    return String(file?.type || '').startsWith('image/') || /\.(?:jpe?g|png|webp|gif|heic|heif)$/i.test(String(file?.name || ''));
  }
  async function compressAdminImage(file) {
    if (!isImageFile(file)) return file;
    if (file.size > MAX_ADMIN_FILE_BYTES) throw new Error(`${file.name} 超過 25 MB 上限`);
    const needsFormatConversion = /(?:heic|heif)$/i.test(String(file.name || ''))
      || /image\/(?:heic|heif)/i.test(String(file.type || ''));
    if (!needsFormatConversion && file.size <= IMAGE_COMPRESSION_THRESHOLD_BYTES) return file;
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
  async function uploadFiles(input, category) {
    const files = selectedFilesFor(input);
    const output = [];
    const failed = [];
    for (const file of files) {
      if (file.size > MAX_ADMIN_FILE_BYTES) {
        failed.push(`${file.name}（超過 25 MB）`);
        continue;
      }
      try {
        const source = isImageFile(file) ? await compressAdminImage(file) : file;
        if (PREVIEW_MODE) {
          output.push({ id: uid('file'), fileName: source.name, url: `preview://${encodeURIComponent(source.name)}`, mimeType: source.type || file.type, category, size: source.size });
          continue;
        }
        const dataUrl = await readFile(source);
        const payload = { nickname: currentUser.nickname, date: todayIso(), fileName: source.name, mimeType: source.type || file.type, base64: dataUrl.split(',')[1] || '' };
        const result = isImageFile(source)
          ? await window.API.uploadPhoto({ ...payload, kpi: `admin-marketing-${category}` })
          : await window.API.uploadFile({ ...payload, category: `admin-marketing-${category}` });
        if (!result?.ok) throw new Error(result?.error || `${file.name} 上傳失敗`);
        output.push({ id: result.fileId, fileId: result.fileId, fileName: result.fileName || source.name, url: result.url, mimeType: source.type || file.type, category, size: source.size });
      } catch (error) {
        failed.push(`${file.name}（${error.message || '上傳失敗'}）`);
      }
    }
    if (failed.length && !output.length) throw new Error(`附件未上傳：${failed.join('、')}`);
    if (failed.length) uploadWarning = `${output.length} 個附件已儲存；${failed.length} 個未上傳：${failed.join('、')}`;
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
    const followups = Array.isArray(existing.followups) ? existing.followups.slice() : [];
    const studentName = String(data.get('studentName') || '').trim();
    const contactRef = String(data.get('contactRef') || '').trim();
    const date = String(data.get('date') || todayIso());
    const course = String(data.get('course') || '').trim();
    const trialTime = String(data.get('trialTime') || '').trim();
    const teacher = String(data.get('teacher') || '').trim();
    const requestedReminder = String(data.get('nextFollowupDate') || '');
    const nextFollowupDate = ['converted', 'not_enrolled'].includes(status) ? '' : requestedReminder || (!existing.id ? (date >= todayIso() ? date : todayIso()) : '');
    const enrollmentDate = status === 'converted' ? String(data.get('enrollmentDate') || '') : '';
    const paymentDate = status === 'converted' ? String(data.get('paymentDate') || '') : '';
    const enrollmentCourse = status === 'converted' ? String(data.get('enrollmentCourse') || '').trim() : '';
    const firstEnrollmentChoice = String(data.get('firstEnrollment') || '');
    if (!studentName || !course || !teacher || !contactRef) throw new Error('學生、課程、授課老師與家長識別資料皆為必填');
    if (date < TRIAL_START_DATE) throw new Error('試上追蹤自 2026/08/15 起實施，請選擇 8/15 或之後的日期');
    if (status === 'converted') {
      if (!enrollmentDate || !paymentDate || !enrollmentCourse || !firstEnrollmentChoice) throw new Error('請完整填寫報名、繳費、正式課程與是否首次報名');
      if (enrollmentDate > todayIso() || paymentDate > todayIso()) throw new Error('報名與繳費日期不可晚於今天');
      if (enrollmentDate < date || paymentDate < date) throw new Error('報名與繳費日期不可早於試上日期');
    }
    const duplicate = trialRecords().find(item => item.id !== id && trialIdentity(item.studentName, item.contactRef, item.course, item.date) === trialIdentity(studentName, contactRef, course, date));
    if (duplicate) throw new Error('這位學生在同一天已有相同課程的試上預約，請更新原紀錄');
    const newEvidence = await uploadFiles(form.elements.paymentEvidence, 'trial-payment');
    const record = {
      ...existing, id, date, studentName, course, trialTime, teacher, contactRef,
      interest: String(data.get('interest') || 'unknown'), owner: workerName, nextFollowupDate,
      note: String(data.get('note') || '').trim(), status, followups,
      enrollmentDate, paymentDate, enrollmentCourse,
      firstEnrollment: status === 'converted' && firstEnrollmentChoice === 'yes',
      paymentEvidence: status === 'converted' ? retainedFiles(existing.paymentEvidence, data, 'removePaymentEvidence').concat(newEvidence) : [],
    };
    if (status === 'converted') {
      if (record.firstEnrollment && !evidenceReady({ evidence: record.paymentEvidence })) throw new Error('首次報名需附報名或繳費證明');
    }
    if (PREVIEW_MODE && !['approved', 'rejected'].includes(existing.bonusStatus)) {
      record.bonusStatus = status === 'converted' && record.firstEnrollment && record.paymentEvidence.length ? 'pending_review' : 'not_eligible';
      record.bonusAmount = 0;
      record.history = (existing.history || []).concat({ id: uid('history'), author: currentUser.nickname, role: currentUser.role, at: new Date().toISOString(), summary: existing.id ? '更新試上追蹤' : '建立試上紀錄' });
    }
    const result = await saveRecord('trial', record);
    if (!result?.ok) throw new Error(result?.error || '試上預約儲存失敗');
    if (PREVIEW_MODE) {
      const marker = todayTrialMarker();
      if (marker && marker.date === record.date) { marker.noTrial = false; marker.status = 'superseded'; upsertLocal(marker); persist(); }
    }
    state.ui.month = date.slice(0, 7);
    closeDialog(); renderApp(); toast(existing.id ? '試上結果已更新' : date > todayIso() ? '未來試上已登錄' : '今日試上已登錄');
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

  async function handleDailyCheck(form) {
    const data = new FormData(form);
    const status = String(data.get('status') || 'clear');
    const note = status === 'needs_supervisor' ? String(data.get('note') || '').trim() : '';
    const reported = status === 'needs_supervisor' && data.get('reported') === 'on';
    if (status === 'needs_supervisor' && !note) throw new Error('請寫清楚需要主管協助的事項');
    if (status === 'needs_supervisor' && !reported) throw new Error('請確認已主動回報小魚主管');
    const existing = workerRecords('daily_check').find(item => item.date === todayIso()) || {};
    const record = {
      ...existing,
      id: existing.id || `admin-marketing-daily-check-${normalizeName(workerName)}-${todayIso()}`,
      type: 'daily_check', nickname: workerName, date: todayIso(), status, note, reported,
    };
    const result = await saveRecord('daily_check', record);
    if (!result?.ok) throw new Error(result?.error || '今日訊息確認儲存失敗');
    closeDialog(); renderApp(); toast('今日訊息確認已儲存');
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
      completedToday: String(data.get('completedToday') || '').trim(), status,
      progress: status === 'completed' ? 100 : Math.max(1, Math.min(95, Number(existing.progress || 50))),
      remaining: status === 'completed' ? '' : String(data.get('remaining') || '').trim(),
      dueDate: status === 'completed' ? '' : String(data.get('dueDate') || ''),
      actualDate: status === 'completed' ? (existing.actualDate || todayIso()) : '',
    };
    if (!item.category || !item.title || !item.completedToday) throw new Error('工作類型、內容與今日完成皆為必填');
    if (status !== 'completed' && (!item.remaining || !item.dueDate)) throw new Error('未完成工作要填剩餘工作與預計完成日期');
    const newFiles = await uploadFiles(form.elements.evidence, item.category);
    item.evidence = retainedFiles(existing.evidence, data).concat(newFiles);
    if (status === 'completed' && ['video','photo_post','poster','design','social_schedule'].includes(item.category) && !evidenceReady(item)) throw new Error('美宣工作標記完成時必須附完成證據');
    const items = (daily.items || []).filter(entry => entry.id !== id).concat(item);
    const result = await saveRecord('daily', { ...daily, messages: daily.messages || {}, items, status: 'submitted' });
    if (!result?.ok) throw new Error(result?.error || '工作日誌儲存失敗');
    state.drafts.workItem = null;
    closeDialog(); renderApp(); toast('工作日誌已儲存');
  }

  async function handleTuesday(form) {
    const data = new FormData(form);
    const existing = currentTuesday() || { id: `admin-marketing-tuesday-${normalizeName(workerName)}-${weekBounds().key}`, type: 'tuesday', nickname: workerName, weekKey: weekBounds().key, followups: [] };
    const mode = String(data.get('mode') || 'check');
    let followups = existing.followups || [];
    if (mode === 'followup') {
      const person = String(data.get('person') || '').trim();
      if (!person) throw new Error('請填寫學生或家長姓名');
      const id = String(data.get('followupId') || '') || uid('followup');
      const followup = { id, person, situation: String(data.get('situation') || '').trim(), handled: String(data.get('handled') || '').trim(), nextDate: String(data.get('nextDate') || ''), status: String(data.get('followupStatus') || 'open') };
      if (!followup.situation || !followup.handled) throw new Error('家長事項要填目前狀況與已處理事項');
      if (followup.status === 'open' && !followup.nextDate) throw new Error('持續追蹤事項必須設定下次追蹤日期');
      followups = followups.filter(item => item.id !== id).concat(followup);
    }
    const checks = mode === 'check' ? {
      paymentList: data.get('paymentList') === 'on', expiringStudents: data.get('expiringStudents') === 'on',
      unpaidParents: data.get('unpaidParents') === 'on', remindersSent: data.get('remindersSent') === 'on',
      exceptionsReported: Boolean(String(data.get('note') || '').trim()),
    } : (existing.checks || {});
    const record = {
      ...existing,
      date: mode === 'check' ? String(data.get('date') || todayIso()) : (existing.date || todayIso()),
      weekKey: weekBounds().key, checks, followups,
      note: mode === 'check' ? String(data.get('note') || '').trim() : String(existing.note || ''), status: 'submitted',
    };
    if (!record.checks.paymentList || !record.checks.expiringStudents || !record.checks.unpaidParents || !record.checks.remindersSent) throw new Error('四項固定行政確認都必須完成');
    const result = await saveRecord('tuesday', record);
    if (!result?.ok) throw new Error(result?.error || '週二確認儲存失敗');
    closeDialog(); renderApp(); toast('本週行政確認已儲存');
  }

  async function handleEnvironment(form) {
    const data = new FormData(form);
    const existing = currentEnvironment() || { id: `admin-marketing-environment-${normalizeName(workerName)}-${todayIso()}`, type: 'environment', nickname: workerName, date: todayIso() };
    const environmentStatus = String(data.get('environmentStatus') || 'clear');
    const affectedGroups = new Set(ENVIRONMENT_GROUPS.filter(([key]) => data.get(`issue-${key}`) === 'on').map(([key]) => key));
    const checks = Object.fromEntries(ENVIRONMENT_CHECKS.map(([key]) => [key, true]));
    if (environmentStatus === 'issue') {
      if (!affectedGroups.size) throw new Error('請至少選擇一個有問題的區域');
      ENVIRONMENT_GROUPS.forEach(([groupKey, , keys]) => {
        if (affectedGroups.has(groupKey)) keys.forEach(key => { checks[key] = false; });
      });
    }
    const issue = environmentStatus === 'issue' ? String(data.get('issue') || '').trim() : '';
    const improvementDue = environmentStatus === 'issue' ? String(data.get('improvementDue') || '') : '';
    if (environmentStatus === 'issue' && (!issue || !improvementDue)) throw new Error('有待改善時，請填寫問題、改善方式與期限');
    const files = await uploadFiles(form.elements.evidence, 'environment');
    const record = { ...existing, checks, issue, improvementDue, evidence: retainedFiles(existing.evidence, data).concat(files), status: environmentStatus === 'issue' ? 'needs_action' : 'submitted' };
    const result = await saveRecord('environment', record);
    if (!result?.ok) throw new Error(result?.error || '環境檢核儲存失敗');
    closeDialog(); renderApp(); toast('今日環境檢核已儲存');
  }

  async function handleProject(form) {
    const data = new FormData(form);
    const id = String(data.get('projectId') || '') || uid('project');
    const existing = workerRecords('project').find(item => item.id === id) || {};
    const currentStage = String(data.get('currentStage') || PROJECT_STAGES[0]);
    const currentIndex = Math.max(0, PROJECT_STAGES.indexOf(currentStage));
    const status = String(data.get('status') || 'planning');
    const dueDate = String(data.get('dueDate') || '');
    const oldStages = Array.isArray(existing.stages) ? existing.stages : [];
    const stages = PROJECT_STAGES.map((name, index) => {
      const old = oldStages.find(stage => stage.name === name) || {};
      if (index < currentIndex || status === 'completed') return { ...old, name, status: 'completed', actualDate: old.actualDate || todayIso(), dueDate: old.dueDate || (index === currentIndex ? dueDate : '') };
      if (index === currentIndex) return { ...old, name, status: status === 'planning' ? 'pending' : 'active', dueDate, actualDate: '' };
      return { ...old, name, status: 'pending', dueDate: old.status === 'completed' ? old.dueDate || '' : '', actualDate: old.status === 'completed' ? old.actualDate || '' : '' };
    });
    const files = await uploadFiles(form.elements.evidence, 'project');
    const record = { ...existing, id, date: existing.date || todayIso(), title: String(data.get('title') || '').trim(), projectType: String(data.get('projectType') || ''), summary: String(data.get('summary') || '').trim(), status, currentStage, dueDate, stages, evidence: retainedFiles(existing.evidence, data).concat(files) };
    if (!record.title || !record.projectType || !record.summary || !record.dueDate) throw new Error('專案名稱、類型、目前結果與階段期限皆為必填');
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
      const status = String(data.get('status') || 'in_progress');
      record = { ...existing, id, progress: status === 'completed' ? 100 : Math.max(1, Math.min(95, Number(existing.progress || 50))), status, progressNote: String(data.get('progressNote') || '').trim(), actualDate: status === 'completed' ? (existing.actualDate || todayIso()) : '', evidence: retainedFiles(existing.evidence, data).concat(files) };
      if (!record.progressNote) throw new Error('請填寫目前結果與下一步');
      if (record.status === 'completed') {
        if (!evidenceReady(record)) throw new Error('交辦完成時至少要有一份可判讀附件');
      }
    }
    const result = await saveAssignment(record);
    if (!result?.ok) throw new Error(result?.error || '交辦事項儲存失敗');
    closeDialog(); renderApp(); toast(isManager ? '主管交辦已建立' : '交辦進度已更新');
  }

  async function handleReview(form) {
    const data = new FormData(form);
    const id = String(data.get('recordId') || '');
    const resultValue = 'approved';
    const note = String(data.get('note') || '').trim();
    if (PREVIEW_MODE) {
      const item = state.records.find(record => record.id === id);
      item.reviewStatus = resultValue; item.reviewComment = note; item.reviewedBy = currentUser.nickname; item.reviewedAt = new Date().toISOString();
      const month = String(item.date || todayIso()).slice(0, 7);
      const conversationId = `admin-marketing-message-${normalizeName(workerName)}-${month}`;
      const messageId = `admin-marketing-review-${id}`;
      const conversationRecord = state.records.find(record => record.id === conversationId) || { id: conversationId, type: 'message', nickname: workerName, date: `${month}-01`, month, messages: [], status: 'active' };
      conversationRecord.messages = (conversationRecord.messages || []).filter(message => message.id !== messageId);
      if (note) conversationRecord.messages.push({ id: messageId, author: currentUser.nickname, role: currentUser.role, text: `針對 ${formatDate(item.date)} 工作紀錄：${note}`, at: item.reviewedAt });
      upsertLocal(conversationRecord);
      persist();
    } else {
      const result = await window.API.reviewAdminMarketingRecord(id, resultValue, note);
      if (!result?.ok) throw new Error(result?.error || '審查儲存失敗');
      upsertLocal(result.record);
      if (result.conversation) upsertLocal(result.conversation);
    }
    closeDialog(); renderApp(); toast(note ? '主管回覆已儲存' : '已清除主管回覆');
  }

  async function handleScore(form) {
    const data = new FormData(form);
    const month = String(data.get('month') || selectedEvaluationMonth());
    const scores = {};
    KPI.forEach(item => { scores[item.key] = Number(data.get(item.key) || 0); });
    const score = { month, scores, comment: String(data.get('comment') || '').trim(), published: data.get('published') === 'on' };
    if (score.published && !score.comment) throw new Error('公布評核前，請填寫做得好的地方與下月具體重點');
    if (PREVIEW_MODE) {
      const total = KPI.reduce((sum,item) => sum + Math.max(0, Math.min(item.max, Number(scores[item.key] || 0))), 0);
      upsertLocal({ id: `admin-marketing-score-${normalizeName(workerName)}-${month}`, type: 'score', nickname: workerName, date: `${month}-01`, month, ...score, total, status: score.published ? 'published' : 'draft', updatedAt: new Date().toISOString() });
      persist();
    } else {
      const result = await window.API.saveAdminMarketingScore(workerName, month, score);
      if (!result?.ok) throw new Error(result?.error || '評核儲存失敗');
      upsertLocal(result.score);
    }
    renderApp(); toast(score.published ? '評核已公布給皮皮' : '評核草稿已儲存');
  }

  async function handleMessage(form) {
    const data = new FormData(form);
    const text = String(data.get('text') || '').trim();
    const month = String(data.get('month') || (isManager ? selectedEvaluationMonth() : selectedPerformanceMonth()));
    if (!text) throw new Error('請輸入訊息');
    if (PREVIEW_MODE) {
      const id = `admin-marketing-message-${normalizeName(workerName)}-${month}`;
      const item = state.records.find(record => record.id === id) || { id, type: 'message', nickname: workerName, date: `${month}-01`, month, messages: [], status: 'active' };
      item.messages.push({ id: uid('message'), author: currentUser.nickname, role: currentUser.role, text, at: new Date().toISOString() });
      upsertLocal(item); persist();
    } else {
      const result = await window.API.addAdminMarketingMessage(workerName, month, text);
      if (!result?.ok) throw new Error(result?.error || '訊息送出失敗');
      upsertLocal(result.conversation);
    }
    renderApp(); toast('訊息已送出');
  }

  async function runForm(handler, form) {
    const button = form.querySelector('[type="submit"]');
    const buttonHtml = button?.innerHTML || '';
    if (button) {
      button.disabled = true;
      button.setAttribute('aria-busy', 'true');
      button.textContent = '正在處理…';
    }
    uploadWarning = '';
    try {
      await handler(form);
      if (uploadWarning) toast(uploadWarning, 'warning');
    }
    catch (error) { toast(error.message || '操作失敗', 'danger'); }
    finally {
      if (button?.isConnected) {
        button.disabled = false;
        button.removeAttribute('aria-busy');
        button.innerHTML = buttonHtml;
        hydrateIcons();
      }
    }
  }

  let trialParseTimer = 0;
  document.addEventListener('click', event => {
    const route = event.target.closest('[data-route]');
    if (route) {
      state.ui.route = route.dataset.route;
      if (state.ui.route === 'performance') state.ui.performanceMonth = scoreMonths(true)[0] || currentMonth();
      if (state.ui.route === 'evaluation') state.ui.evaluationMonth = scoreMonths(false)[0] || currentMonth();
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
    else if (action === 'parse-trial-message') {
      window.clearTimeout(trialParseTimer);
      applyTrialMessageParsing(true);
    }
    else if (action === 'view-trial') openTrialDetail(actionNode.dataset.id || '', false);
    else if (action === 'review-trial-bonus') openTrialDetail(actionNode.dataset.id || '', true);
    else if (action === 'mark-no-trial') openNoTrialConfirm();
    else if (action === 'go-trials') { state.ui.route = 'trials'; persist(); closeDialog(); renderApp(); }
    else if (action === 'open-daily-check') openDailyCheck();
    else if (action === 'open-tuesday' || action === 'open-tuesday-check') openTuesday('check');
    else if (action === 'open-followup') openTuesday('followup', actionNode.dataset.followupId || '');
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
    else if (action === 'remove-selected-file') removeSelectedFile(actionNode.dataset.inputId || '', actionNode.dataset.index || '0');
    else if (action === 'print') window.print();
  });

  document.addEventListener('input', event => {
    const scoreForm = event.target.closest('#score-form');
    if (scoreForm) scoreForm.dataset.dirty = 'true';
    if (event.target.id === 'trial-message-import') {
      window.clearTimeout(trialParseTimer);
      trialParseTimer = window.setTimeout(() => applyTrialMessageParsing(false), 250);
    }
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
    if (event.target.id === 'work-status') updateWorkFormVisibility();
    if (event.target.id === 'assignment-status') updateAssignmentVisibility();
    if (event.target.matches('#daily-check-form input[name="status"]')) updateDailyCheckVisibility();
    if (event.target.matches('#environment-form input[name="environmentStatus"]')) updateEnvironmentVisibility();
    if (event.target.matches('input[type="file"]')) mergeSelectedFiles(event.target);
  });
  document.addEventListener('submit', event => {
    event.preventDefault();
    const form = event.target;
    if (form.id === 'performance-history-form') {
      state.ui.performanceMonth = String(new FormData(form).get('month') || selectedPerformanceMonth());
      persist('評核月份已切換'); renderApp();
    }
    else if (form.id === 'evaluation-selection-form') {
      const scoreForm = $('#score-form');
      if (scoreForm?.dataset.dirty === 'true' && !window.confirm('目前評核尚未儲存，確定要切換月份嗎？')) return;
      state.ui.evaluationMonth = String(new FormData(form).get('month') || selectedEvaluationMonth());
      persist('評核月份已切換'); renderApp();
    }
    else if (TEST_VIEW_MODE) {
      toast('測試模式：表單流程正常，最後寫入已攔截，不會儲存、送出或上傳正式資料', 'warning');
    }
    else if (form.id === 'trial-form') runForm(handleTrial, form);
    else if (form.id === 'no-trial-form') runForm(() => handleNoTrial(), form);
    else if (form.id === 'trial-bonus-form') runForm(handleTrialBonus, form);
    else if (form.id === 'daily-check-form') runForm(handleDailyCheck, form);
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

  if (!isManager && state.ui.route === 'performance') state.ui.performanceMonth = scoreMonths(true)[0] || currentMonth();
  if (isManager && state.ui.route === 'evaluation') state.ui.evaluationMonth = scoreMonths(false)[0] || currentMonth();
  renderApp();
  if (!PREVIEW_MODE) loadCloudData();
})();
