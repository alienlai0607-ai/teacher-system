/**
 * 認證與使用者管理
 *
 * 流程：
 * 1. 前端用 Google Identity Services 取得 email
 * 2. 呼叫 whoami(email) 拿到使用者資料
 * 3. 若 email 沒對應，前端引導去「自我認領暱稱」頁面
 * 4. claimNickname(email, nickname) 把 email 寫入該暱稱
 */

function whoami(params) {
  const email = (params.email || '').toLowerCase().trim();
  if (!email) return { ok: false, error: 'missing email' };

  const user = findUserByEmail(email);
  if (!user) {
    return {
      ok: true,
      registered: false,
      email,
      msg: '此 Email 尚未綁定暱稱，請選擇您的暱稱'
    };
  }

  // 更新最後登入時間
  updateRow(SHEET_NAMES.USERS, user._row, { last_login: nowIso() });

  return {
    ok: true,
    registered: true,
    user: {
      nickname: user.nickname,
      email: user.email,
      role: user.role,
      department: user.department,
      status: user.status
    }
  };
}

function findUserByEmail(email) {
  if (!email) return null;
  const users = sheetToObjects(SHEET_NAMES.USERS);
  for (let i = 0; i < users.length; i++) {
    if (String(users[i].email || '').toLowerCase() === email.toLowerCase()) {
      users[i]._row = i + 2;
      return users[i];
    }
  }
  return null;
}

function findUserByNickname(nickname) {
  return findObject(SHEET_NAMES.USERS, 'nickname', nickname);
}

/**
 * 列出尚未綁定 email 的暱稱（給首次登入者選）
 */
function listAvailableNicknames() {
  const users = sheetToObjects(SHEET_NAMES.USERS);
  const available = users
    .filter(u => !u.email || String(u.email).trim() === '')
    .filter(u => u.status === 'active' || u.status === 'pending')
    .map(u => ({
      nickname: u.nickname,
      role: u.role,
      department: u.department
    }));
  return { ok: true, nicknames: available };
}

/**
 * 老師認領暱稱：把 email 寫入該暱稱
 */
function claimNickname(params) {
  const email = (params.email || '').toLowerCase().trim();
  const nickname = (params.nickname || '').trim();
  if (!email || !nickname) return { ok: false, error: 'missing email or nickname' };

  // 檢查暱稱是否存在且未被綁定
  const user = findUserByNickname(nickname);
  if (!user) return { ok: false, error: '此暱稱不存在' };
  if (user.email && String(user.email).trim() !== '') {
    return { ok: false, error: '此暱稱已被綁定其他帳號' };
  }

  // 檢查 email 是否已綁定其他暱稱
  const existing = findUserByEmail(email);
  if (existing) return { ok: false, error: '此 Email 已綁定暱稱：' + existing.nickname };

  // 寫入 email
  updateRow(SHEET_NAMES.USERS, user._row, {
    email,
    last_login: nowIso()
  });
  logSystem(nickname, 'claim_nickname', email, { nickname });

  return {
    ok: true,
    msg: '綁定成功',
    user: {
      nickname: user.nickname,
      email,
      role: user.role,
      department: user.department,
      status: user.status
    }
  };
}

/**
 * 列出所有使用者（admin 用）
 */
function listUsers(params) {
  // TODO: 權限檢查（呼叫者必須是 admin）
  const users = sheetToObjects(SHEET_NAMES.USERS);
  return { ok: true, users };
}

/**
 * admin 新增使用者
 */
function addUser(params) {
  const { nickname, role, department, email, phone, notes } = params;
  if (!nickname || !role || !department) {
    return { ok: false, error: 'missing required fields' };
  }
  if (!ROLES.includes(role)) return { ok: false, error: 'invalid role' };
  if (!DEPARTMENTS.includes(department)) return { ok: false, error: 'invalid department' };

  // 檢查暱稱重複
  if (findUserByNickname(nickname)) {
    return { ok: false, error: '暱稱已存在' };
  }
  // 檢查 email 重複
  if (email && findUserByEmail(email)) {
    return { ok: false, error: 'Email 已綁定其他暱稱' };
  }

  appendRow(SHEET_NAMES.USERS, {
    nickname,
    email: email || '',
    role,
    department,
    status: 'active',
    phone: phone || '',
    joined_at: nowIso(),
    last_login: '',
    notes: notes || ''
  });
  logSystem(params.operator || 'system', 'add_user', nickname, { role, department });

  return { ok: true, msg: '新增成功' };
}

/**
 * admin 更新使用者
 */
function updateUser(params) {
  const { nickname } = params;
  if (!nickname) return { ok: false, error: 'missing nickname' };
  const user = findUserByNickname(nickname);
  if (!user) return { ok: false, error: 'user not found' };

  const updates = {};
  ['email', 'role', 'department', 'status', 'phone', 'notes'].forEach(k => {
    if (params[k] !== undefined) updates[k] = params[k];
  });
  updateRow(SHEET_NAMES.USERS, user._row, updates);
  logSystem(params.operator || 'system', 'update_user', nickname, updates);

  return { ok: true, msg: '更新成功' };
}

function approveUser(params) {
  return updateUser({ ...params, status: 'active' });
}

/**
 * 權限檢查 helper
 */
function requireRole(nickname, allowedRoles) {
  const user = findUserByNickname(nickname);
  if (!user) throw new Error('User not found: ' + nickname);
  if (!allowedRoles.includes(user.role)) {
    throw new Error('Permission denied: requires ' + allowedRoles.join('/'));
  }
  return user;
}
