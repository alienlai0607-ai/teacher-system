// Google 登入 + 本地 Session 管理
window.AUTH = (function () {
  const SESSION_KEY = 'kpi_session';
  const REAL_SESSION_KEY = 'kpi_real_session'; // 切換身份時保留真實 admin session
  const ROOT_URL = (() => {
    try {
      const scriptUrl = document.currentScript?.src
        || Array.from(document.scripts).map(script => script.src).find(src => /\/shared\/auth\.js(?:\?|$)/.test(src));
      if (scriptUrl) return new URL('../', scriptUrl).href;
    } catch (e) { /* fall through */ }
    return new URL('./', window.location.href).href;
  })();

  function getSession() {
    try {
      const raw = localStorage.getItem(SESSION_KEY);
      if (!raw) return null;
      const s = JSON.parse(raw);
      if (s.impersonate && Date.now() - s.t > 30 * 60 * 1000) {
        const realRaw = localStorage.getItem(REAL_SESSION_KEY);
        localStorage.removeItem(REAL_SESSION_KEY);
        if (!realRaw) {
          localStorage.removeItem(SESSION_KEY);
          return null;
        }
        const real = JSON.parse(realRaw);
        if (Date.now() - Number(real.t || 0) > 12 * 3600 * 1000) {
          localStorage.removeItem(SESSION_KEY);
          return null;
        }
        localStorage.setItem(SESSION_KEY, JSON.stringify(real));
        return real;
      }
      // 覆蓋完整工作日，避免老師上午登入、晚間送出前被迫重新登入。
      if (!s.impersonate && Date.now() - s.t > 12 * 3600 * 1000) {
        localStorage.removeItem(SESSION_KEY);
        return null;
      }
      return s;
    } catch (e) { return null; }
  }

  function setSession(user) {
    localStorage.setItem(SESSION_KEY, JSON.stringify({ ...user, t: Date.now() }));
  }

  function clearSession() {
    localStorage.removeItem(SESSION_KEY);
    localStorage.removeItem(REAL_SESSION_KEY);
  }

  /**
   * 切換身份檢視（測試/檢核用）
   * - admin 可切換任何人
   * - manager 只能切換成自己部門的 teacher / admin_staff
   */
  function impersonate(targetUser) {
    const real = getSession();
    if (!real) throw new Error('需要先登入');
    if (real.role === 'admin') {
      // OK，無限制
    } else if (real.role === 'manager') {
      const normalizeDepartment = value => String(value || '').trim() === '永康教室' ? '東橋教室' : String(value || '').trim();
      const sameDept = normalizeDepartment(targetUser.department) === normalizeDepartment(real.department);
      const okRole = targetUser.role === 'teacher' || targetUser.role === 'admin_staff';
      if (!sameDept || !okRole) {
        throw new Error('主管只能切換成自己部門的老師或行政');
      }
    } else {
      throw new Error('只有 admin 或主管可以切換身份');
    }
    // 保留真實身份（不覆蓋已存在的 real_session）
    if (!localStorage.getItem(REAL_SESSION_KEY)) {
      localStorage.setItem(REAL_SESSION_KEY, JSON.stringify(real));
    }
    // API 永遠以已驗簽的真實主管／管理員權限判斷；切換身份只改變前端檢視對象。
    setSession({
      ...targetUser,
      session_token: real.session_token || '',
      impersonate: true,
      impersonated_by: real.nickname,
    });
  }

  /**
   * 取得切換身份前的真實角色（離開時用於決定回到哪個 dashboard）
   */
  function getRealRole() {
    try {
      const raw = localStorage.getItem(REAL_SESSION_KEY);
      if (!raw) return null;
      return JSON.parse(raw).role || null;
    } catch (e) { return null; }
  }

  /**
   * 結束切換身份，回到 admin
   */
  function exitImpersonate() {
    const raw = localStorage.getItem(REAL_SESSION_KEY);
    if (!raw) {
      const current = getSession();
      if (current?.impersonate) localStorage.removeItem(SESSION_KEY);
      return;
    }
    localStorage.setItem(SESSION_KEY, raw);
    localStorage.removeItem(REAL_SESSION_KEY);
  }

  function isImpersonating() {
    const s = getSession();
    return s && s.impersonate === true;
  }

  function requireRole(allowedRoles) {
    const s = getSession();
    if (!s) {
      window.location.href = relativeRoot() + 'index.html';
      return null;
    }
    if (allowedRoles && !allowedRoles.includes(s.role)) {
      alert('權限不足');
      window.location.href = relativeRoot() + 'index.html';
      return null;
    }
    return s;
  }

  function relativeRoot() {
    return ROOT_URL;
  }

  async function logout() {
    try {
      if (window.API?.unregisterPushSubscription && getSession()?.session_token) {
        await Promise.race([
          window.API.unregisterPushSubscription(),
          new Promise(resolve => window.setTimeout(resolve, 1200)),
        ]);
      }
    } catch (e) { /* 登出仍須繼續 */ }
    clearSession();
    if (window.google && google.accounts && google.accounts.id) {
      google.accounts.id.disableAutoSelect();
    }
    window.location.href = relativeRoot() + 'index.html';
  }

  function decodeJwt(token) {
    try {
      const payload = token.split('.')[1];
      const decoded = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
      return JSON.parse(decoded);
    } catch (e) {
      return null;
    }
  }

  function routeByRole(role, user) {
    const root = relativeRoot();
    const session = user || getSession() || {};
    if (window.KPI_WORKSPACES?.getAssignments?.(session).length) {
      window.location.href = window.KPI_WORKSPACES.defaultHref(session);
      return;
    }
    const anqinDepartments = ['東橋教室', '永康教室', '北區教室'];
    const usesAnqinWorkspace = role === 'admin'
      || (['manager', 'teacher'].includes(role) && anqinDepartments.includes(session.department));
    if (usesAnqinWorkspace) window.location.href = root + 'review/anqin-v2/index.html?v=20260825-profile-fix-3';
    else if (role === 'manager') window.location.href = root + 'manager/dashboard.html';
    else window.location.href = root + 'teacher/today.html';
  }

  return { getSession, setSession, clearSession, requireRole, logout, decodeJwt, routeByRole, relativeRoot, impersonate, exitImpersonate, isImpersonating, getRealRole };
})();
