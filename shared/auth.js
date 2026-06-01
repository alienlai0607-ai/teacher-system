// Google 登入 + 本地 Session 管理
window.AUTH = (function () {
  const SESSION_KEY = 'kpi_session';
  const REAL_SESSION_KEY = 'kpi_real_session'; // 切換身份時保留真實 admin session

  function getSession() {
    try {
      const raw = localStorage.getItem(SESSION_KEY);
      if (!raw) return null;
      const s = JSON.parse(raw);
      // 1 小時過期（切換身份時不過期）
      if (!s.impersonate && Date.now() - s.t > 3600 * 1000) {
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
      const sameDept = targetUser.department === real.department;
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
    setSession({ ...targetUser, impersonate: true });
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
    if (!raw) return;
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
    // 計算相對根路徑（依當前頁面深度）
    const path = window.location.pathname;
    const segs = path.split('/').filter(Boolean);
    // 若在 /teacher/today.html 之類，要回退 1 層
    if (path.endsWith('.html') && segs.length >= 2) return '../';
    return './';
  }

  function logout() {
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

  function routeByRole(role) {
    const root = relativeRoot();
    if (role === 'admin') window.location.href = root + 'admin/dashboard.html';
    else if (role === 'manager') window.location.href = root + 'manager/dashboard.html';
    else window.location.href = root + 'teacher/today.html';
  }

  return { getSession, setSession, clearSession, requireRole, logout, decodeJwt, routeByRole, relativeRoot, impersonate, exitImpersonate, isImpersonating, getRealRole };
})();
