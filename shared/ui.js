// 共用 UI 元件
window.UI = (function () {
  function toast(msg, type = 'info', duration = 2500) {
    const div = document.createElement('div');
    div.className = `toast toast-${type}`;
    div.textContent = msg;
    document.body.appendChild(div);
    requestAnimationFrame(() => div.classList.add('show'));
    setTimeout(() => {
      div.classList.remove('show');
      setTimeout(() => div.remove(), 300);
    }, duration);
  }

  function loading(show = true) {
    let el = document.getElementById('global-loading');
    if (show) {
      if (!el) {
        el = document.createElement('div');
        el.id = 'global-loading';
        el.innerHTML = '<div class="spinner"></div>';
        document.body.appendChild(el);
      }
      el.classList.add('show');
    } else if (el) {
      el.classList.remove('show');
    }
  }

  function confirmDialog(msg) {
    return new Promise(resolve => {
      const ans = window.confirm(msg);
      resolve(ans);
    });
  }

  function modal(title, contentHtml, buttons = []) {
    return new Promise(resolve => {
      const overlay = document.createElement('div');
      overlay.className = 'modal-overlay';
      overlay.innerHTML = `
        <div class="modal-box">
          <div class="modal-title">${title}</div>
          <div class="modal-content">${contentHtml}</div>
          <div class="modal-actions"></div>
        </div>
      `;
      const actions = overlay.querySelector('.modal-actions');
      buttons.forEach(b => {
        const btn = document.createElement('button');
        btn.className = 'btn ' + (b.primary ? 'btn-primary' : '');
        btn.textContent = b.label;
        btn.onclick = () => {
          document.body.removeChild(overlay);
          resolve(b.value);
        };
        actions.appendChild(btn);
      });
      document.body.appendChild(overlay);
    });
  }

  function formatDate(d) {
    if (!d) return '';
    const dt = new Date(d);
    if (isNaN(dt)) return String(d);
    return dt.getFullYear() + '/' +
      String(dt.getMonth() + 1).padStart(2, '0') + '/' +
      String(dt.getDate()).padStart(2, '0');
  }

  function formatDateTime(d) {
    if (!d) return '';
    const dt = new Date(d);
    if (isNaN(dt)) return String(d);
    return formatDate(d) + ' ' +
      String(dt.getHours()).padStart(2, '0') + ':' +
      String(dt.getMinutes()).padStart(2, '0');
  }

  function renderHeader(user) {
    const root = AUTH.relativeRoot();
    const isAdmin = user.role === 'admin';
    const isManager = user.role === 'manager';
    const isTeacher = user.role === 'teacher';
    return `
      <header class="top-bar">
        <div class="brand">🪐 KPI 系統</div>
        <nav class="top-nav">
          ${isTeacher ? `
            <a href="${root}teacher/today.html">今日日誌</a>
            <a href="${root}teacher/mylog.html">我的 KPI</a>
            <a href="${root}teacher/okr.html">OKR</a>
          ` : ''}
          ${isManager ? `
            <a href="${root}manager/dashboard.html">部門儀表板</a>
            <a href="${root}manager/teachers.html">老師列表</a>
            <a href="${root}manager/eval.html">月度評核</a>
            <a href="${root}manager/observe.html">觀課紀錄</a>
            <a href="${root}manager/mylog.html">我的日誌</a>
            <a href="${root}manager/myeval.html">我的 KPI</a>
          ` : ''}
          ${isAdmin ? `
            <a href="${root}admin/dashboard.html">總覽</a>
            <a href="${root}admin/eval-manager.html">評核主管</a>
            <a href="${root}admin/users.html">人員管理</a>
            <a href="${root}admin/bonus.html">獎金核發</a>
          ` : ''}
        </nav>
        <div class="user-info">
          <span class="user-name">${user.nickname}</span>
          <span class="user-role">${user.department} · ${roleLabel(user.role)}</span>
          <button class="btn-logout" onclick="AUTH.logout()">登出</button>
        </div>
      </header>
    `;
  }

  function roleLabel(role) {
    return { admin: '管理員', manager: '主管', teacher: '老師', admin_staff: '行政' }[role] || role;
  }

  function mountHeader(user) {
    const el = document.getElementById('app-header');
    if (el) el.innerHTML = renderHeader(user);
    // 切換身份橫條
    if (AUTH.isImpersonating()) {
      mountImpersonateBanner(user);
    }
  }

  function mountImpersonateBanner(user) {
    if (document.getElementById('impersonate-banner')) return;
    const div = document.createElement('div');
    div.id = 'impersonate-banner';
    div.innerHTML = `
      🎭 <strong>測試模式</strong>：你正在以 <strong>${user.nickname}</strong>（${roleLabel(user.role)} · ${user.department}）身份檢視
      <button class="btn-exit-impersonate" onclick="UI.exitImpersonateBack()">離開 →</button>
    `;
    document.body.insertBefore(div, document.body.firstChild);
  }

  // 離開切換身份 → 依真實角色（admin / manager）回到對應 dashboard
  function exitImpersonateBack() {
    const realRole = AUTH.getRealRole();
    AUTH.exitImpersonate();
    const root = AUTH.relativeRoot();
    if (realRole === 'manager') window.location.href = root + 'manager/dashboard.html';
    else window.location.href = root + 'admin/dashboard.html'; // 預設 admin
  }

  return { toast, loading, confirmDialog, modal, formatDate, formatDateTime, renderHeader, mountHeader, roleLabel, exitImpersonateBack };
})();
