/**
 * 列出既有 KPI PDF 歸檔。舊資料只以檔案供查閱，不匯入安親 V2 紀錄。
 */
function getKpiPdfRootFolder_() {
  const props = PropertiesService.getScriptProperties();
  const cached = props.getProperty('KPI_PDF_FOLDER_ID');
  if (cached) {
    try { return DriveApp.getFolderById(cached); } catch (error) {}
  }
  const roots = DriveApp.getFoldersByName('KPI日報PDF');
  const root = roots.hasNext() ? roots.next() : DriveApp.createFolder('KPI日報PDF');
  props.setProperty('KPI_PDF_FOLDER_ID', root.getId());
  return root;
}

/**
 * 日報、教案與證據只授權給資料本人及其正式管理鏈。
 * 不使用「知道連結即可查看」，避免連結被轉傳後繞過系統角色權限。
 */
function kpiDriveViewerUsers_(ownerUser, scope, extraUsers) {
  const ownerNickname = ownerUser && String(ownerUser.nickname || '');
  const ownerDepartment = ownerUser && normalizeDepartment_(ownerUser.department);
  const extras = Array.isArray(extraUsers) ? extraUsers : [];
  const extraKeys = {};
  extras.forEach(function (user) {
    if (user && user.nickname) extraKeys[String(user.nickname)] = true;
    if (user && user.email) extraKeys[String(user.email).toLowerCase()] = true;
  });
  const seen = {};
  return sheetToObjects(SHEET_NAMES.USERS).filter(function (user) {
    if (!user || user.status !== 'active' || !String(user.email || '').trim()) return false;
    const assignments = talentAssignments_(user);
    const included = user.nickname === ownerNickname || user.role === 'admin' || isGlobalManager_(user) ||
      extraKeys[user.nickname] || extraKeys[String(user.email || '').toLowerCase()] ||
      (scope === 'talent' && assignments.indexOf('talent-manager') >= 0) ||
      (scope !== 'talent' && user.role === 'manager' && ownerDepartment && sameDepartment_(user.department, ownerDepartment));
    const email = String(user.email || '').toLowerCase();
    if (!included || seen[email]) return false;
    seen[email] = true;
    return true;
  });
}

function kpiDriveAccessRevision_() {
  const props = PropertiesService.getScriptProperties();
  let revision = props.getProperty('KPI_DRIVE_ACCESS_REVISION');
  if (!revision) {
    revision = '20260826-initial';
    props.setProperty('KPI_DRIVE_ACCESS_REVISION', revision);
  }
  return revision;
}

function invalidateKpiDriveAccess_() {
  PropertiesService.getScriptProperties().setProperty(
    'KPI_DRIVE_ACCESS_REVISION',
    String(Date.now()) + '-' + Utilities.getUuid().slice(0, 8)
  );
}

/**
 * 刪除員工時立即收回其既有 Drive 權限。只掃描各 KPI 根資料夾內與該員工
 * 同名的分支，不碰其他老師的檔案；歷史檔本身不刪除。
 */
function revokeKpiDriveUserAccess_(user, email) {
  const normalizedEmail = String(email || '').trim().toLowerCase();
  const nickname = String(user && user.nickname || '').trim();
  if (!normalizedEmail || !nickname) return { ok: true, scanned: 0, removed: 0, complete: true };
  const rootNames = ['KPI日報PDF', 'KPI月歸檔', 'KPI教材', 'KPI證據'];
  const roots = [];
  const seenRoots = {};
  rootNames.forEach(function (name) {
    const iterator = DriveApp.getFoldersByName(name);
    while (iterator.hasNext()) {
      const folder = iterator.next();
      if (!seenRoots[folder.getId()]) {
        seenRoots[folder.getId()] = true;
        roots.push(folder);
      }
    }
  });

  const limit = 5000;
  let scanned = 0;
  let removed = 0;
  let complete = true;
  function normalizedName(value) {
    return String(value || '').trim().replace(/\s+/g, '').replace(/(?:老師|主管)$/, '').toLowerCase();
  }
  function revokeItem(item) {
    if (!item || scanned >= limit) {
      complete = false;
      return;
    }
    scanned += 1;
    try {
      item.getViewers().forEach(function (viewer) {
        if (String(viewer.getEmail() || '').trim().toLowerCase() !== normalizedEmail) return;
        try { item.removeViewer(normalizedEmail); removed += 1; } catch (error) {}
      });
    } catch (error) {}
    try {
      item.getEditors().forEach(function (editor) {
        if (String(editor.getEmail() || '').trim().toLowerCase() !== normalizedEmail) return;
        try { item.removeEditor(normalizedEmail); removed += 1; } catch (error) {}
      });
    } catch (error) {}
  }
  function revokeBranch(folder, depth) {
    if (depth > 6 || scanned >= limit) {
      complete = false;
      return;
    }
    revokeItem(folder);
    const files = folder.getFiles();
    while (files.hasNext() && scanned < limit) revokeItem(files.next());
    const children = folder.getFolders();
    while (children.hasNext() && scanned < limit) revokeBranch(children.next(), depth + 1);
    if ((files.hasNext() || children.hasNext()) && scanned >= limit) complete = false;
  }
  function findTeacherBranch(folder, depth) {
    if (depth > 3 || scanned >= limit) return;
    revokeItem(folder);
    const children = folder.getFolders();
    while (children.hasNext() && scanned < limit) {
      const child = children.next();
      if (normalizedName(child.getName()) === normalizedName(nickname)) revokeBranch(child, 0);
      else findTeacherBranch(child, depth + 1);
    }
  }
  roots.forEach(function (root) { findTeacherBranch(root, 0); });
  return { ok: true, scanned: scanned, removed: removed, complete: complete };
}

function secureKpiDriveItem_(item, ownerUser, scope, extraUsers) {
  if (!item) return;
  const allowed = {};
  const viewers = kpiDriveViewerUsers_(ownerUser, scope, extraUsers);
  viewers.forEach(function (user) {
    const email = String(user.email || '').trim().toLowerCase();
    if (email) allowed[email] = true;
  });
  let ownerEmail = '';
  const currentViewers = {};
  try { ownerEmail = String(item.getOwner().getEmail() || '').trim().toLowerCase(); } catch (error) {}
  try { item.setSharing(DriveApp.Access.PRIVATE, DriveApp.Permission.VIEW); } catch (error) {}
  try { item.setShareableByEditors(false); } catch (error) {}

  // 舊版曾授權過的主管可能已離職或換部門；每次開啟雲端日報時同步收斂權限。
  try {
    item.getEditors().forEach(function (user) {
      const email = String(user.getEmail() || '').trim().toLowerCase();
      if (!email || email === ownerEmail) return;
      try { item.removeEditor(email); } catch (error) {}
    });
  } catch (error) {}
  try {
    item.getViewers().forEach(function (user) {
      const email = String(user.getEmail() || '').trim().toLowerCase();
      if (!email || email === ownerEmail) return;
      if (allowed[email]) currentViewers[email] = true;
      else try { item.removeViewer(email); } catch (error) {}
    });
  } catch (error) {}

  viewers.forEach(function (user) {
    const email = String(user.email || '').trim().toLowerCase();
    if (!email || email === ownerEmail || currentViewers[email]) return;
    try { item.addViewer(email); } catch (error) {}
  });
}

function secureKpiReportPath_(root, departmentFolder, teacherFolder, workFolder, monthFolder, ownerUser, scope, extraUsers) {
  // 上層資料夾不授權部門主管，避免從父層看到其他老師或其他工作區。
  secureKpiDriveItem_(root, null, 'root', []);
  secureKpiDriveItem_(departmentFolder, null, 'root', []);
  secureKpiDriveItem_(teacherFolder, ownerUser, 'owner', []);
  secureKpiDriveItem_(workFolder, ownerUser, scope, extraUsers || []);
  if (monthFolder) secureKpiDriveItem_(monthFolder, ownerUser, scope, extraUsers || []);
}

function listArchivedKpiFiles(params) {
  const viewer = params && params.viewer ? findUserByNickname(params.viewer) : null;
  if (!viewer || viewer.status !== 'active') return { ok: false, error: '找不到可用帳號' };

  const requestedMonth = /^\d{4}-\d{2}$/.test(String(params.month || '')) ? String(params.month) : '';
  const limit = Math.max(1, Math.min(Number(params.limit) || 300, 500));
  const root = getKpiPdfRootFolder_();

  const users = sheetToObjects(SHEET_NAMES.USERS).filter(function (user) {
    return ['active', 'suspended', 'deleted'].indexOf(String(user.status || '')) >= 0;
  });
  let allowedNicknames = [];
  if (viewer.role === 'admin') {
    allowedNicknames = users.map(user => String(user.nickname || '')).filter(Boolean);
  } else if (isGlobalManager_(viewer)) {
    allowedNicknames = users.map(user => String(user.nickname || '')).filter(Boolean);
  } else if (viewer.role === 'manager') {
    allowedNicknames = users
      .filter(user => sameDepartment_(user.department, viewer.department) || user.nickname === viewer.nickname)
      .map(user => String(user.nickname || ''))
      .filter(Boolean);
  } else {
    allowedNicknames = [String(viewer.nickname || '')];
  }

  const files = [];
  const months = {};
  let scanned = 0;

  function addFile(file, monthHint) {
    if (scanned >= 1500) return;
    scanned += 1;
    const fileName = String(file.getName() || '');
    if (!/\.pdf$/i.test(fileName)) return;
    if (/^才藝日報_/.test(fileName)) return;

    const personMatch = /^KPI_(.+)_(\d{4}-\d{2}-\d{2})\.pdf$/i.exec(fileName);
    const dailyMatch = /^KPI日報_(\d{4}-\d{2}-\d{2})\.pdf$/i.exec(fileName);
    let nickname = '';
    let date = '';
    let kind = '';

    if (personMatch) {
      nickname = personMatch[1];
      date = personMatch[2];
      kind = 'person';
      if (viewer.role !== 'admin' && allowedNicknames.indexOf(nickname) < 0) return;
    } else if (dailyMatch && viewer.role === 'admin') {
      date = dailyMatch[1];
      kind = 'daily';
    } else {
      const embeddedDate = fileName.match(/\d{4}-\d{2}-\d{2}/);
      const matchedNickname = allowedNicknames.find(name => name && fileName.indexOf(name) >= 0);
      if (!embeddedDate || (!matchedNickname && viewer.role !== 'admin')) return;
      date = embeddedDate[0];
      nickname = matchedNickname || '';
      kind = nickname ? 'person' : 'other';
    }

    const month = date ? date.slice(0, 7) : monthHint;
    if (requestedMonth && month !== requestedMonth) return;
    if (month) months[month] = true;
    const ownerUser = nickname ? users.filter(function (user) { return String(user.nickname || '') === nickname; })[0] || null : null;
    secureKpiDriveItem_(file, ownerUser, 'anqin', [viewer]);
    files.push({
      id: file.getId(),
      fileName: fileName,
      nickname: nickname,
      date: date,
      month: month || '',
      kind: kind,
      url: file.getUrl(),
      updatedAt: Utilities.formatDate(file.getLastUpdated(), Session.getScriptTimeZone() || 'Asia/Taipei', "yyyy-MM-dd'T'HH:mm:ssXXX"),
    });
  }

  function scanFiles(folder, monthHint, depth) {
    if (depth > 4 || scanned >= 1500) return;
    const iterator = folder.getFiles();
    while (iterator.hasNext() && scanned < 1500) addFile(iterator.next(), monthHint);
    const children = folder.getFolders();
    while (children.hasNext() && scanned < 1500) {
      const child = children.next();
      const childName = String(child.getName() || '');
      const nextMonth = /^\d{4}-\d{2}$/.test(childName) ? childName : monthHint;
      if (!requestedMonth || !/^\d{4}-\d{2}$/.test(childName) || childName === requestedMonth) {
        scanFiles(child, nextMonth, depth + 1);
      }
    }
  }

  scanFiles(root, '', 0);

  files.sort((a, b) => String(b.date || b.updatedAt).localeCompare(String(a.date || a.updatedAt)) || a.fileName.localeCompare(b.fileName));
  return {
    ok: true,
    files: files.slice(0, limit),
    months: Object.keys(months).sort().reverse(),
  };
}

function teacherReportUsersFor_(viewer, scope) {
  let users = sheetToObjects(SHEET_NAMES.USERS).filter(function (user) {
    if (['active', 'suspended', 'deleted'].indexOf(String(user.status || '')) < 0) return false;
    if (scope === 'talent') {
      const assignments = talentAssignments_(user);
      return assignments.indexOf('talent-fulltime') >= 0 || assignments.indexOf('talent-pt') >= 0;
    }
    return ['東橋教室', '北區教室'].indexOf(normalizeDepartment_(user.department)) >= 0 && ['teacher', 'manager'].indexOf(user.role) >= 0;
  });
  if (viewer.role === 'admin' || isGlobalManager_(viewer)) return users;
  if (scope === 'talent' && talentAssignments_(viewer).indexOf('talent-manager') >= 0) return users;
  return users.filter(function (user) { return sameDepartment_(user.department, viewer.department); });
}

function existingChildFolder_(parent, name) {
  if (!parent) return null;
  const iterator = parent.getFoldersByName(name);
  return iterator.hasNext() ? iterator.next() : null;
}

function teacherFolderPdfStats_(folder) {
  let count = 0;
  let latest = '';
  let scanned = 0;
  function visit(current, depth) {
    if (depth > 2 || scanned >= 1000) return;
    const files = current.getFiles();
    while (files.hasNext() && scanned < 1000) {
      const file = files.next();
      scanned += 1;
      if (!/\.pdf$/i.test(String(file.getName() || ''))) continue;
      count += 1;
      const match = String(file.getName() || '').match(/\d{4}-\d{2}-\d{2}/);
      if (match && match[0] > latest) latest = match[0];
    }
    const folders = current.getFolders();
    while (folders.hasNext() && scanned < 1000) {
      const child = folders.next();
      visit(child, depth + 1);
    }
  }
  visit(folder, 0);
  return { count: count, latest: latest };
}

function talentReportStatsByTeacher_() {
  const stats = {};
  sheetToObjects(SHEET_NAMES.TALENT_RECORDS).forEach(function (row) {
    if (row.record_type !== 'lesson' || row.status !== 'submitted') return;
    const lesson = talentRecordObject_(row);
    if (!lesson.reportUrl) return;
    if (!stats[row.nickname]) stats[row.nickname] = { count: 0, latest: '', folderUrl: '', reportFileId: '' };
    stats[row.nickname].count += 1;
    const date = String(row.record_date || lesson.date || '').slice(0, 10);
    if (date >= stats[row.nickname].latest) {
      stats[row.nickname].latest = date;
      stats[row.nickname].folderUrl = String(lesson.reportFolderUrl || stats[row.nickname].folderUrl || '');
      stats[row.nickname].reportFileId = String(lesson.reportFileId || stats[row.nickname].reportFileId || '');
    }
  });
  return stats;
}

function talentIndexedReportFolder_(stats, openTeacherFolder) {
  if (!stats || !stats.count) return null;
  if (stats.folderUrl) {
    const match = String(stats.folderUrl).match(/\/folders\/([a-zA-Z0-9_-]+)/);
    if (match) {
      if (!openTeacherFolder) return { targetUrl: stats.folderUrl, targetId: match[1], workUrl: stats.folderUrl };
      const workFolder = DriveApp.getFolderById(match[1]);
      const parents = workFolder.getParents();
      const target = parents.hasNext() ? parents.next() : workFolder;
      return { targetUrl: target.getUrl(), targetId: target.getId(), workUrl: workFolder.getUrl() };
    }
  }
  if (!stats.reportFileId) return null;
  const file = DriveApp.getFileById(stats.reportFileId);
  const monthParents = file.getParents();
  if (!monthParents.hasNext()) return null;
  const monthFolder = monthParents.next();
  const workParents = monthFolder.getParents();
  if (!workParents.hasNext()) return null;
  const workFolder = workParents.next();
  if (!openTeacherFolder) return { targetUrl: workFolder.getUrl(), targetId: workFolder.getId(), workUrl: workFolder.getUrl() };
  const teacherParents = workFolder.getParents();
  const target = teacherParents.hasNext() ? teacherParents.next() : workFolder;
  return { targetUrl: target.getUrl(), targetId: target.getId(), workUrl: workFolder.getUrl() };
}

function ensureTeacherReportFolderViewer_(folderId, viewer) {
  const email = String(viewer && viewer.email || '').trim().toLowerCase();
  if (!folderId || !email || viewer.role === 'admin') return;
  const cache = CacheService.getScriptCache();
  const cacheKey = 'teacher-folder-viewer-v1-' + folderId + '-' + email;
  if (cache.get(cacheKey)) return;
  try {
    DriveApp.getFolderById(folderId).addViewer(email);
    cache.put(cacheKey, '1', 21600);
  } catch (error) {}
}

/**
 * 主管專用雲端日報入口。回傳的老師資料夾已依登入者權限與工作區篩選；
 * 東橋主管不會拿到北區或才藝資料夾，才藝主管只會拿到才藝工作成員。
 */
function listTeacherReportFolders(params) {
  const actor = params && params.__actor ? params.__actor : (params && params.viewer ? findUserByNickname(params.viewer) : null);
  if (!actor || actor.status !== 'active' || ['admin', 'manager'].indexOf(actor.role) < 0) {
    return { ok: false, error: '只有主管可查看雲端日報資料夾' };
  }
  let viewer = actor;
  if (actor.role === 'admin' && String(params.view_as || '').trim()) {
    const requestedViewer = findUserByNickname(String(params.view_as || '').trim());
    if (requestedViewer && ['admin', 'manager'].indexOf(requestedViewer.role) >= 0) viewer = requestedViewer;
  }
  const scope = String(params.scope || '') === 'talent' ? 'talent' : 'anqin';
  const assignments = talentAssignments_(viewer);
  if (viewer.role !== 'admin' && !isGlobalManager_(viewer)) {
    if (scope === 'talent' && assignments.indexOf('talent-manager') < 0) return { ok: false, error: '沒有才藝日報查看權限' };
    if (scope === 'anqin' && assignments.indexOf('anqin-manager') < 0) return { ok: false, error: '沒有安親日報查看權限' };
  }
  const cacheKey = 'teacher-folders-v5-' + scope + '-' + normalizeTalentNickname_(viewer.nickname) + '-' + viewer.role + '-actor-' + normalizeTalentNickname_(actor.nickname);
  const cache = CacheService.getScriptCache();
  if (!params.refresh) {
    const cached = cache.get(cacheKey);
    if (cached) {
      try {
        const parsed = JSON.parse(cached);
        parsed.cached = true;
        return parsed;
      } catch (error) {}
    }
  }
  const talentStats = scope === 'talent' ? talentReportStatsByTeacher_() : {};
  const root = scope === 'anqin' ? getKpiPdfRootFolder_() : null;
  const canOpenTeacherRoot = viewer.role === 'admin' || isGlobalManager_(viewer);
  const folders = teacherReportUsersFor_(viewer, scope).map(function (user) {
    const department = normalizeDepartment_(user.department) || '未分部門';
    const stats = scope === 'talent'
      ? (talentStats[user.nickname] || { count: 0, latest: '', folderUrl: '', reportFileId: '' })
      : { count: 0, latest: '' };
    let targetFolder = null;
    let workFolder = null;
    let targetUrl = '';
    let targetId = '';
    let workspaceUrl = '';
    if (scope === 'talent') {
      try {
        const indexed = talentIndexedReportFolder_(stats, canOpenTeacherRoot);
        targetUrl = indexed && indexed.targetUrl || '';
        targetId = indexed && indexed.targetId || '';
        workspaceUrl = indexed && indexed.workUrl || '';
      } catch (error) {}
    } else {
      const departmentFolder = existingChildFolder_(root, department);
      const teacherFolder = existingChildFolder_(departmentFolder, user.nickname);
      workFolder = existingChildFolder_(teacherFolder, '安親');
      const anqinStats = workFolder ? teacherFolderPdfStats_(workFolder) : { count: 0, latest: '' };
      stats.count = anqinStats.count;
      stats.latest = anqinStats.latest;
      targetFolder = canOpenTeacherRoot ? teacherFolder : workFolder;
      targetUrl = targetFolder ? targetFolder.getUrl() : '';
      targetId = targetFolder ? targetFolder.getId() : '';
      workspaceUrl = workFolder ? workFolder.getUrl() : '';
    }
    if (targetId && actor.nickname === viewer.nickname) ensureTeacherReportFolderViewer_(targetId, actor);
    return {
      nickname: user.nickname,
      department: department,
      employment_type: user.employment_type || '',
      status: user.status || '',
      deletedAt: user.deleted_at || '',
      reportCount: stats.count,
      latestDate: stats.latest,
      url: targetUrl,
      folderId: targetId,
      workspaceUrl: workspaceUrl,
      opensTeacherFolder: Boolean(canOpenTeacherRoot && targetUrl),
    };
  }).filter(function (folder) {
    return folder.status === 'active' || folder.reportCount > 0;
  });
  folders.sort(function (left, right) {
    return left.department.localeCompare(right.department, 'zh-TW') || left.nickname.localeCompare(right.nickname, 'zh-TW');
  });
  const result = { ok: true, scope: scope, rootUrl: '', folders: folders, cached: false };
  try { cache.put(cacheKey, JSON.stringify(result), 300); } catch (error) {}
  return result;
}

/**
 * 將老師匯出的月歸檔 CSV 同步存入 Drive。
 * 路徑：KPI月歸檔 / 部門 / 暱稱 / YYYY-MM / YYYY-MM_暱稱_安親KPI月歸檔.csv
 */
function archiveMonthlyCsv(params) {
  const nickname = String(params.nickname || '').trim();
  const month = String(params.month || '').trim();
  const csv = String(params.csv || '');
  if (!nickname || !/^\d{4}-(0[1-9]|1[0-2])$/.test(month) || !csv) {
    return { ok: false, error: '月歸檔資料不完整' };
  }
  if (csv.length > 5 * 1024 * 1024) return { ok: false, error: '月歸檔超過 5 MB 上限' };
  const user = findUserByNickname(nickname);
  if (!user || user.status !== 'active') return { ok: false, error: '找不到可用帳號' };

  const roots = DriveApp.getFoldersByName('KPI月歸檔');
  const root = roots.hasNext() ? roots.next() : DriveApp.createFolder('KPI月歸檔');
  const department = normalizeDepartment_(user.department) || '未分部門';
  const departmentFolder = getOrCreateChildFolder_(root, department);
  const userFolder = getOrCreateChildFolder_(departmentFolder, nickname);
  const monthFolder = getOrCreateChildFolder_(userFolder, month);
  const safeNickname = nickname.replace(/[\\/:*?"<>|]/g, '-');
  const fileName = month + '_' + safeNickname + '_安親KPI月歸檔.csv';
  const existing = monthFolder.getFilesByName(fileName);
  while (existing.hasNext()) existing.next().setTrashed(true);
  const file = monthFolder.createFile(Utilities.newBlob(csv, 'text/csv;charset=utf-8', fileName));
  secureKpiReportPath_(root, departmentFolder, userFolder, monthFolder, null, user, 'anqin', []);
  secureKpiDriveItem_(file, user, 'anqin', []);
  const url = 'https://drive.google.com/file/d/' + file.getId() + '/view';
  logSystem(nickname, 'archive_monthly_csv', month, { fileName: fileName });
  return {
    ok: true,
    url: url,
    fileName: fileName,
    folderPath: ['KPI月歸檔', department, nickname, month].join(' / '),
  };
}
