(function () {
  'use strict';

  const LAST_WORKSPACE_PREFIX = 'kpi_last_workspace_';

  const DEFINITIONS = {
    'anqin-teacher': {
      id: 'anqin-teacher',
      group: 'anqin',
      label: '安親老師',
      shortLabel: '安親',
      description: '安親工作紀錄與班務',
      icon: 'book-open-check',
      path: 'review/anqin-v2/index.html?v=20260902-anqin-live-tasks-1',
    },
    'anqin-manager': {
      id: 'anqin-manager',
      group: 'anqin',
      label: '安親主管',
      shortLabel: '安親主管',
      description: '安親審核與主管管理',
      icon: 'clipboard-check',
      path: 'review/anqin-v2/index.html?v=20260902-anqin-live-tasks-1',
    },
    'talent-fulltime': {
      id: 'talent-fulltime',
      group: 'talent',
      label: '才藝正職',
      shortLabel: '才藝正職',
      description: '工作日誌、KPI 與獎金',
      icon: 'sparkles',
      path: 'review/talent-v2/index.html?workspace=talent-fulltime&v=20260902-talent-stability-9',
    },
    'talent-pt': {
      id: 'talent-pt',
      group: 'talent',
      label: '才藝 PT',
      shortLabel: '才藝 PT',
      description: '上課紀錄、鐘點與續報',
      icon: 'clock-3',
      path: 'review/talent-v2/index.html?workspace=talent-pt&v=20260902-talent-stability-9',
    },
    'talent-manager': {
      id: 'talent-manager',
      group: 'talent',
      label: '才藝主管',
      shortLabel: '才藝主管',
      description: '備課查閱、評分與結算',
      icon: 'chart-no-axes-combined',
      path: 'review/talent-v2/index.html?workspace=talent-manager&v=20260902-talent-stability-9',
    },
    'talent-payroll': {
      id: 'talent-payroll',
      group: 'talent',
      label: '才藝薪資檢視',
      shortLabel: '才藝薪資',
      description: 'PT 月度鐘點與續報資格',
      icon: 'calculator',
      path: 'review/talent-v2/index.html?workspace=talent-payroll&v=20260902-talent-stability-9',
    },
    'admin-marketing': {
      id: 'admin-marketing',
      group: 'admin-marketing',
      label: '行政美宣',
      shortLabel: '行政美宣',
      description: '行政日誌、美宣產出與期限追蹤',
      icon: 'megaphone',
      path: 'review/admin-marketing-v1/index.html?workspace=admin-marketing&v=20260902-admin-stability-6',
    },
    'admin-marketing-manager': {
      id: 'admin-marketing-manager',
      group: 'admin-marketing',
      label: '行政美宣主管',
      shortLabel: '行政美宣主管',
      description: '期限管理、週 KPI 與主管評核',
      icon: 'clipboard-list',
      path: 'review/admin-marketing-v1/index.html?workspace=admin-marketing-manager&v=20260902-admin-stability-6',
    },
  };

  const ASSIGNMENT_ALIASES = {
    anqin: 'anqin-teacher',
    anqin_teacher: 'anqin-teacher',
    anqin_manager: 'anqin-manager',
    talent: 'talent-fulltime',
    talent_teacher: 'talent-fulltime',
    talent_fulltime: 'talent-fulltime',
    talent_ft: 'talent-fulltime',
    talent_pt: 'talent-pt',
    talent_manager: 'talent-manager',
    talent_payroll: 'talent-payroll',
    admin_marketing: 'admin-marketing',
    admin_marketing_manager: 'admin-marketing-manager',
  };

  // 正式後端提供 work_assignments 時會優先採用；此表供審查版與既有帳號過渡使用。
  const LEGACY_ASSIGNMENTS = {
    '柏翰': ['anqin-manager', 'talent-payroll', 'admin-marketing-manager'],
    '小魚': ['anqin-manager', 'talent-payroll', 'admin-marketing-manager'],
    '酸酸': ['anqin-manager'],
    '柳丁': ['talent-manager'],
    '浩浩': ['talent-fulltime'],
    RITA: ['talent-fulltime'],
    Rita: ['talent-fulltime'],
    rita: ['talent-fulltime'],
    '紅豆': ['anqin-teacher', 'talent-pt'],
    '小明': ['anqin-teacher', 'talent-pt'],
    '皮皮': ['talent-pt', 'admin-marketing'],
    '黑豹': ['talent-pt'],
  };

  function rootUrl() {
    try {
      const scriptUrl = document.currentScript?.src
        || Array.from(document.scripts).map(script => script.src).find(src => /\/shared\/workspaces\.js(?:\?|$)/.test(src));
      if (scriptUrl) return new URL('../', scriptUrl).href;
    } catch (error) { /* fall through */ }
    return new URL('./', window.location.href).href;
  }

  const ROOT_URL = rootUrl();

  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, char => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
    })[char]);
  }

  function normalizeNickname(value) {
    return String(value || '')
      .trim()
      .replace(/\s+/g, '')
      .replace(/(?:老師|主管)$/, '');
  }

  function normalizeAssignment(value) {
    const raw = String(value || '').trim();
    return DEFINITIONS[raw] ? raw : (ASSIGNMENT_ALIASES[raw] || '');
  }

  function parseAssignments(value) {
    let items = value;
    if (typeof items === 'string') {
      try {
        const parsed = JSON.parse(items);
        items = Array.isArray(parsed) ? parsed : items.split(/[,、;|]/);
      } catch (error) {
        items = items.split(/[,、;|]/);
      }
    }
    if (!Array.isArray(items)) return [];
    return [...new Set(items.map(item => normalizeAssignment(typeof item === 'object' ? item.id : item)).filter(Boolean))];
  }

  function inferredAssignments(user = {}) {
    const nickname = normalizeNickname(user.nickname);
    if (LEGACY_ASSIGNMENTS[nickname]) return [...LEGACY_ASSIGNMENTS[nickname]];

    const role = String(user.role || '').trim();
    const department = String(user.department || '').trim();
    const subtype = String(user.subtype || user.employment_type || '').toLowerCase();
    if (role === 'admin') return ['anqin-manager', 'talent-manager', 'admin-marketing-manager'];
    if (role === 'admin_staff' && String(user.subtype || '').toLowerCase() === 'marketing') {
      return ['admin-marketing'];
    }
    if (department.includes('才藝')) {
      if (role === 'manager') return ['talent-manager'];
      return [subtype.includes('pt') || subtype.includes('兼職') ? 'talent-pt' : 'talent-fulltime'];
    }
    if (['東橋教室', '永康教室', '北區教室'].includes(department)) {
      return [role === 'manager' ? 'anqin-manager' : 'anqin-teacher'];
    }
    return [];
  }

  function getAssignments(user = {}) {
    const explicit = parseAssignments(user.work_assignments || user.workAssignments || user.assignments);
    const ids = explicit.length ? explicit : inferredAssignments(user);
    return ids.map(id => DEFINITIONS[id]).filter(Boolean);
  }

  function storageKey(user = {}) {
    return `${LAST_WORKSPACE_PREFIX}${encodeURIComponent(String(user.email || user.nickname || 'review'))}`;
  }

  function workspaceFromLocation(assignments = []) {
    const params = new URLSearchParams(window.location.search);
    const requested = normalizeAssignment(params.get('workspace'));
    if (requested && assignments.some(item => item.id === requested)) return requested;
    const path = window.location.pathname;
    if (path.includes('/anqin-v2/')) {
      return assignments.find(item => item.group === 'anqin')?.id || '';
    }
    if (path.includes('/talent-v2/')) {
      return assignments.find(item => item.group === 'talent')?.id || '';
    }
    if (path.includes('/admin-marketing-v1/')) {
      return assignments.find(item => item.group === 'admin-marketing')?.id || '';
    }
    return '';
  }

  function currentId(user = {}, preferredId = '') {
    const assignments = getAssignments(user);
    if (!assignments.length) return '';
    const preferred = normalizeAssignment(preferredId);
    if (preferred && assignments.some(item => item.id === preferred)) return preferred;
    const fromLocation = workspaceFromLocation(assignments);
    if (fromLocation) return fromLocation;
    try {
      const saved = normalizeAssignment(localStorage.getItem(storageKey(user)));
      if (saved && assignments.some(item => item.id === saved)) return saved;
    } catch (error) { /* storage unavailable */ }
    return assignments[0].id;
  }

  function hrefFor(id) {
    const definition = DEFINITIONS[normalizeAssignment(id)];
    return definition ? new URL(definition.path, ROOT_URL).href : new URL('index.html', ROOT_URL).href;
  }

  function defaultHref(user = {}) {
    return hrefFor(currentId(user));
  }

  function renderSwitcher(user = {}, options = {}) {
    const assignments = getAssignments(user);
    if (!assignments.length) return '';
    const selectedId = currentId(user, options.currentId);
    const selected = DEFINITIONS[selectedId] || assignments[0];
    if (assignments.length === 1 && options.hideSingle === true) return '';

    if (assignments.length === 1) {
      return `<div class="workspace-static" aria-label="目前工作模式">
        <i data-lucide="${esc(selected.icon)}" aria-hidden="true"></i>
        <span><small>目前工作</small><strong>${esc(selected.shortLabel)}</strong></span>
      </div>`;
    }

    return `<div class="workspace-switcher" data-workspace-switcher>
      <button type="button" class="workspace-trigger" data-workspace-toggle aria-haspopup="menu" aria-expanded="false" aria-label="切換工作模式，目前是${esc(selected.label)}" title="切換工作模式">
        <i data-lucide="${esc(selected.icon)}" aria-hidden="true"></i>
        <span><small>切換工作</small><strong>${esc(selected.shortLabel)}</strong></span>
        <i class="workspace-chevron" data-lucide="chevrons-up-down" aria-hidden="true"></i>
      </button>
      <div class="workspace-menu" role="menu" hidden>
        <div class="workspace-menu-head">切換要處理的工作</div>
        ${assignments.map(item => `<button type="button" role="menuitem" class="workspace-option ${item.id === selected.id ? 'is-active' : ''}" data-workspace-id="${esc(item.id)}">
          <span class="workspace-option-icon"><i data-lucide="${esc(item.icon)}" aria-hidden="true"></i></span>
          <span class="workspace-option-copy"><strong>${esc(item.label)}</strong><small>${esc(item.description)}</small></span>
          ${item.id === selected.id ? '<i class="workspace-check" data-lucide="check" aria-hidden="true"></i>' : ''}
        </button>`).join('')}
      </div>
    </div>`;
  }

  function renderQuickSwitcher(user = {}, options = {}) {
    const assignments = getAssignments(user);
    if (assignments.length < 2) return '';
    const selectedId = currentId(user, options.currentId);
    const selected = DEFINITIONS[selectedId] || assignments[0];
    return `<section class="workspace-quick-switch" aria-label="切換工作模式">
      <div class="workspace-quick-title">
        <span class="workspace-quick-title-icon"><i data-lucide="repeat-2" aria-hidden="true"></i></span>
        <span><strong>切換工作模式</strong><small>目前：${esc(selected.label)}</small></span>
      </div>
      <div class="workspace-quick-options">
        ${assignments.map(item => `<button type="button" class="workspace-quick-option ${item.id === selected.id ? 'is-active' : ''}" data-workspace-id="${esc(item.id)}" ${item.id === selected.id ? 'aria-current="page"' : ''}>
          <i data-lucide="${esc(item.icon)}" aria-hidden="true"></i><span>${esc(item.shortLabel)}</span>${item.id === selected.id ? '<i class="workspace-quick-check" data-lucide="check" aria-hidden="true"></i>' : ''}
        </button>`).join('')}
      </div>
    </section>`;
  }

  function closeMenus(except) {
    document.querySelectorAll('[data-workspace-switcher]').forEach(root => {
      if (root === except) return;
      const menu = root.querySelector('.workspace-menu');
      const trigger = root.querySelector('[data-workspace-toggle]');
      if (menu) menu.hidden = true;
      if (trigger) trigger.setAttribute('aria-expanded', 'false');
    });
  }

  function switchTo(id, user = {}) {
    const normalized = normalizeAssignment(id);
    if (!getAssignments(user).some(item => item.id === normalized)) return false;
    try { localStorage.setItem(storageKey(user), normalized); } catch (error) { /* continue */ }
    const destination = new URL(hrefFor(normalized));
    const isReviewPreviewHost = ['127.0.0.1', 'localhost'].includes(window.location.hostname)
      || window.location.hostname.endsWith('.trycloudflare.com');
    const isReviewPreview = isReviewPreviewHost && window.location.pathname.includes('/review/');
    if (isReviewPreview) {
      const requestedUser = new URLSearchParams(window.location.search).get('reviewUser') || user.nickname;
      if (requestedUser) destination.searchParams.set('reviewUser', requestedUser);
    }
    window.location.href = destination.href;
    return true;
  }

  document.addEventListener('click', event => {
    const toggle = event.target.closest('[data-workspace-toggle]');
    if (toggle) {
      const root = toggle.closest('[data-workspace-switcher]');
      const menu = root?.querySelector('.workspace-menu');
      if (!root || !menu) return;
      const willOpen = menu.hidden;
      closeMenus(root);
      menu.hidden = !willOpen;
      toggle.setAttribute('aria-expanded', willOpen ? 'true' : 'false');
      return;
    }

    const option = event.target.closest('[data-workspace-id]');
    if (option) {
      // Use the same resolved identity that rendered the switcher. This avoids a
      // stale auth snapshot rejecting a workspace that is visibly selectable.
      const session = window.KPI_REVIEW_USER || window.AUTH?.getSession?.() || {};
      switchTo(option.dataset.workspaceId, session);
      return;
    }
    if (!event.target.closest('[data-workspace-switcher]')) closeMenus();
  });

  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') closeMenus();
  });

  window.KPI_WORKSPACES = {
    definitions: DEFINITIONS,
    getAssignments,
    currentId,
    defaultHref,
    hrefFor,
    renderSwitcher,
    renderQuickSwitcher,
    switchTo,
    normalizeNickname,
  };
})();
