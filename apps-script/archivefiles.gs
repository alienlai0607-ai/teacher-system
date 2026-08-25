/**
 * 列出既有 KPI PDF 歸檔。舊資料只以檔案供查閱，不匯入安親 V2 紀錄。
 */
function listArchivedKpiFiles(params) {
  const viewer = params && params.viewer ? findUserByNickname(params.viewer) : null;
  if (!viewer || viewer.status !== 'active') return { ok: false, error: '找不到可用帳號' };

  const requestedMonth = /^\d{4}-\d{2}$/.test(String(params.month || '')) ? String(params.month) : '';
  const limit = Math.max(1, Math.min(Number(params.limit) || 300, 500));
  const props = PropertiesService.getScriptProperties();
  let root = null;
  const cached = props.getProperty('KPI_PDF_FOLDER_ID');
  if (cached) {
    try { root = DriveApp.getFolderById(cached); } catch (e) {}
  }
  if (!root) {
    const roots = DriveApp.getFoldersByName('KPI日報PDF');
    if (roots.hasNext()) root = roots.next();
  }
  if (!root) return { ok: true, files: [], months: [] };

  const users = sheetToObjects(SHEET_NAMES.USERS).filter(user => user.status === 'active');
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

  function scanFiles(folder, monthHint) {
    const iterator = folder.getFiles();
    while (iterator.hasNext() && scanned < 1500) addFile(iterator.next(), monthHint);
  }

  scanFiles(root, '');
  if (requestedMonth) {
    const matchingFolders = root.getFoldersByName(requestedMonth);
    while (matchingFolders.hasNext() && scanned < 1500) scanFiles(matchingFolders.next(), requestedMonth);
  } else {
    const folders = root.getFolders();
    while (folders.hasNext() && scanned < 1500) {
      const folder = folders.next();
      scanFiles(folder, /^\d{4}-\d{2}$/.test(folder.getName()) ? folder.getName() : '');
    }
  }

  files.sort((a, b) => String(b.date || b.updatedAt).localeCompare(String(a.date || a.updatedAt)) || a.fileName.localeCompare(b.fileName));
  return {
    ok: true,
    files: files.slice(0, limit),
    months: Object.keys(months).sort().reverse(),
  };
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
  try { file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); } catch (error) {}
  const url = 'https://drive.google.com/file/d/' + file.getId() + '/view';
  logSystem(nickname, 'archive_monthly_csv', month, { fileName: fileName });
  return {
    ok: true,
    url: url,
    fileName: fileName,
    folderPath: ['KPI月歸檔', department, nickname, month].join(' / '),
  };
}
