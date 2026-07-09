/**
 * KPI 日報 PDF：每晚自動生成全員日報（含照片）→ 存 Drive → LINE 推連結給老闆
 * - 觸發器：setupKpiReportTrigger()（編輯器執行一次，每天 21:30）
 * - 手動/測試：?action=sendDailyKpiPdf&operator=柏翰&date=2026-07-09
 * - LINE 指令（限 admin）：「kpi」今日、「kpi昨天」、「kpi 2026-07-08」
 */

function pdfEsc_(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/\n/g, '<br>');
}

/** 取縮圖 dataURI（lh3 縮到 w360 控制檔案大小；失敗回空字串跳過該圖） */
function pdfPhotoUri_(fileId) {
  if (!fileId) return '';
  try {
    const r = UrlFetchApp.fetch('https://lh3.googleusercontent.com/d/' + fileId + '=w360', { muteHttpExceptions: true });
    if (r.getResponseCode() === 200) {
      const blob = r.getBlob();
      return 'data:' + blob.getContentType() + ';base64,' + Utilities.base64Encode(blob.getBytes());
    }
  } catch (e) {}
  try {   // 備援：直接抓原檔（老闆帳號有權限）
    const blob = DriveApp.getFileById(fileId).getBlob();
    if (blob.getBytes().length < 600000) {
      return 'data:' + blob.getContentType() + ';base64,' + Utilities.base64Encode(blob.getBytes());
    }
  } catch (e) {}
  return '';
}

function pdfRow_(label, val) {
  if (!val || !String(val).trim()) return '';
  return '<div style="margin:2px 0;"><span style="color:#C77A12; font-weight:bold;">' + label + '</span>　' + pdfEsc_(val) + '</div>';
}

/** 單人日誌卡片 HTML */
function pdfLogCard_(l) {
  const k1 = parseJsonField(l.kpi1_data) || {};
  const k2 = parseJsonField(l.kpi2_data) || {};
  const k3 = parseJsonField(l.kpi3_data) || {};
  const k5 = parseJsonField(l.kpi5_data) || {};
  const k6 = parseJsonField(l.kpi6_data) || {};
  const atts = parseJsonField(l.attachments);
  const photos = Array.isArray(atts) ? atts.filter(a => a && a.type === 'photo' && a.fileId) : [];

  const submitted = l.submitted_at
    ? '<span style="background:#E3F3E8; color:#1a8a4a; padding:2px 10px; border-radius:10px; font-size:11px; font-weight:bold;">✅ 已提交</span>'
      + (l.is_makeup === true ? ' <span style="background:#FFF1DD; color:#C77A12; padding:2px 10px; border-radius:10px; font-size:11px; font-weight:bold;">補繳</span>' : '')
    : '<span style="background:#FDEBEC; color:#C62828; padding:2px 10px; border-radius:10px; font-size:11px; font-weight:bold;">✏️ 草稿未送出</span>';

  let h = '<div style="border:1.5px solid #FFE9CC; border-left:6px solid #F5941E; border-radius:8px; padding:12px 14px; margin:10px 0; page-break-inside:avoid;">';
  h += '<div style="font-size:15px; font-weight:bold; color:#1F3A68; margin-bottom:6px;">👤 ' + pdfEsc_(l.nickname)
     + ' <span style="font-size:11px; color:#999; font-weight:normal;">' + pdfEsc_(l.department || '') + '</span>　' + submitted + '</div>';

  // 環境整潔
  const envMap = [['env_classroom', '教室'], ['env_tools', '教具'], ['env_trash', '垃圾'], ['env_toilet', '廁所']];
  const envLine = envMap.map(p => (k2[p[0]] === true ? '✅' : '⬜') + p[1]).join('　');
  h += '<div style="margin:2px 0;"><span style="color:#C77A12; font-weight:bold;">🧹 環境整潔</span>　' + envLine + '</div>';
  h += pdfRow_('🔧 設備問題', k2.equipment_issue);
  h += pdfRow_('🏫 班級狀況', k2.class_status);

  // 安親輔導
  h += pdfRow_('📚 複習方式', k1.review_method);
  h += pdfRow_('❗ 常錯重點', k1.error_points);
  h += pdfRow_('💡 協助方法', k1.help_method);
  h += pdfRow_('🎓 輔導成果', k1.outcome);

  // 課程
  const courses = Array.isArray(k3.courses) ? k3.courses : [];
  courses.forEach(c => {
    const bits = [];
    if (c.name) bits.push(c.name);
    if (c.class) bits.push(c.class);
    h += '<div style="margin:6px 0 2px; font-weight:bold; color:#1F3A68;">📘 ' + pdfEsc_(c.type || '課程') + (bits.length ? '｜' + pdfEsc_(bits.join('｜')) : '') + '</div>';
    h += pdfRow_('進度', c.progress);
    h += pdfRow_('學習狀況', c.learning);
    h += pdfRow_('下次計畫', c.next);
  });
  // 專案
  if (k3.project && (k3.project.progress || k3.project.done || k3.project.problem || k3.project.plan)) {
    h += '<div style="margin:6px 0 2px; font-weight:bold; color:#1F3A68;">🎯 專案</div>';
    h += pdfRow_('進度', k3.project.progress) + pdfRow_('完成', k3.project.done)
       + pdfRow_('問題', k3.project.problem) + pdfRow_('計畫', k3.project.plan);
  }

  // 親師
  if (k5.parent_contacted === true) h += pdfRow_('🤝 親師溝通', k5.parent_summary || '有聯繫');
  h += pdfRow_('👀 特別關注學生', (Array.isArray(k5.special_students) && k5.special_students.length ? k5.special_students.join('、') + '：' : '') + (k5.student_special || ''));

  // 工作紀錄
  h += pdfRow_('✔️ 今日完成', k6.today_done);
  h += pdfRow_('📌 明日待辦', k6.tomorrow_todo);
  h += pdfRow_('⚡ 特殊事件', k6.special_event);
  h += pdfRow_('🗂 行政成果', k6.admin_result);
  h += pdfRow_('💭 今日心得', l.reflection);
  if (l.help_needed === true) {
    h += '<div style="background:#FDEBEC; color:#C62828; padding:6px 10px; border-radius:6px; margin-top:6px; font-weight:bold;">🚨 求助：' + pdfEsc_(l.help_content || '') + '</div>';
  }

  // 照片牆（每列 4 張）
  if (photos.length) {
    const KPI_LABEL = { 1: '課業', 2: '環境', 3: '課程', 5: '親師', 6: '行政' };
    h += '<div style="margin-top:8px;"><span style="color:#C77A12; font-weight:bold;">📷 照片（' + photos.length + '）</span></div>';
    h += '<table style="border-collapse:collapse; margin-top:4px;"><tr>';
    let cell = 0;
    photos.forEach(p => {
      const uri = pdfPhotoUri_(p.fileId);
      if (!uri) return;
      if (cell > 0 && cell % 4 === 0) h += '</tr><tr>';
      h += '<td style="padding:3px; vertical-align:top; text-align:center;">'
         + '<img src="' + uri + '" style="width:150px; border-radius:6px;"><br>'
         + '<span style="font-size:9px; color:#999;">' + (KPI_LABEL[p.kpi] || '') + '</span></td>';
      cell++;
    });
    h += '</tr></table>';
  }
  h += '</div>';
  return h;
}

/** 全員日報 HTML */
function buildDailyKpiHtml_(dateStr) {
  const users = sheetToObjects(SHEET_NAMES.USERS).filter(u => u.status === 'active' && u.role !== 'admin');
  const logs = sheetToObjects(SHEET_NAMES.LOGS).filter(l => String(l.date) === dateStr);
  const logMap = {};
  logs.forEach(l => logMap[l.nickname] = l);

  const submittedNames = users.filter(u => logMap[u.nickname] && logMap[u.nickname].submitted_at).map(u => u.nickname);
  const draftNames = users.filter(u => logMap[u.nickname] && !logMap[u.nickname].submitted_at).map(u => u.nickname);
  const missingNames = users.filter(u => !logMap[u.nickname]).map(u => u.nickname);
  const helpNames = logs.filter(l => l.help_needed === true).map(l => l.nickname);

  let h = '<html><head><meta charset="UTF-8"><style>body{font-family:"Microsoft JhengHei","Noto Sans TC",sans-serif; font-size:12px; color:#2c2c2c; margin:0;}</style></head><body>';
  // 封面頁頭
  h += '<div style="background:#F5941E; color:#fff; padding:18px 20px; border-radius:10px;">'
     + '<div style="font-size:22px; font-weight:bold;">🪐 布拉克星球 KPI 日報</div>'
     + '<div style="font-size:14px; margin-top:4px;">' + dateStr + '</div></div>';
  // 總覽
  h += '<div style="background:#FFF6E8; border:1.5px solid #FFE9CC; border-radius:8px; padding:10px 14px; margin:12px 0;">'
     + '<b style="color:#1F3A68;">📊 今日總覽</b>　'
     + '✅ 已提交 ' + submittedNames.length + ' 人'
     + '　✏️ 草稿 ' + draftNames.length + ' 人'
     + '　❌ 未填 ' + missingNames.length + ' 人'
     + (helpNames.length ? '　🚨 求助 ' + helpNames.length + ' 人' : '')
     + (draftNames.length ? '<br><span style="color:#C77A12;">草稿：' + draftNames.join('、') + '</span>' : '')
     + (missingNames.length ? '<br><span style="color:#C62828;">未填：' + missingNames.join('、') + '</span>' : '')
     + (helpNames.length ? '<br><span style="color:#C62828; font-weight:bold;">求助：' + helpNames.join('、') + '</span>' : '')
     + '</div>';

  // 部門分組
  const deptOrder = ['永康教室', '北區教室', '才藝部門'];
  const depts = deptOrder.concat(users.map(u => u.department).filter(d => d && deptOrder.indexOf(d) < 0));
  const seen = {};
  depts.forEach(d => {
    if (!d || seen[d]) return; seen[d] = true;
    const deptLogs = logs.filter(l => l.department === d);
    if (!deptLogs.length) return;
    h += '<div style="font-size:16px; font-weight:bold; color:#1F3A68; border-bottom:2.5px solid #F5941E; padding-bottom:4px; margin:16px 0 4px;">🏫 ' + pdfEsc_(d) + '</div>';
    deptLogs.sort((a, b) => (a.role === 'manager' ? -1 : 1) - (b.role === 'manager' ? -1 : 1));
    deptLogs.forEach(l => { h += pdfLogCard_(l); });
  });

  h += '<div style="text-align:center; color:#bbb; font-size:10px; margin-top:14px;">布拉克星球教育團隊｜teacher.blockplanetcamp.com</div>';
  h += '</body></html>';
  return { html: h, summary: { submitted: submittedNames.length, draft: draftNames.length, missing: missingNames.length, total: users.length, help: helpNames, missingNames: missingNames } };
}

/** 生成 PDF → 存 Drive（KPI日報PDF/年月）→ 回傳連結 */
function generateDailyKpiPdf_(dateStr) {
  const built = buildDailyKpiHtml_(dateStr);
  const blob = Utilities.newBlob(built.html, 'text/html', 'kpi.html').getAs('application/pdf').setName('KPI日報_' + dateStr + '.pdf');
  const props = PropertiesService.getScriptProperties();
  let root;
  const cached = props.getProperty('KPI_PDF_FOLDER_ID');
  if (cached) { try { root = DriveApp.getFolderById(cached); } catch (e) {} }
  if (!root) {
    const it = DriveApp.getFoldersByName('KPI日報PDF');
    root = it.hasNext() ? it.next() : DriveApp.createFolder('KPI日報PDF');
    props.setProperty('KPI_PDF_FOLDER_ID', root.getId());
  }
  const ymF = getOrCreateChildFolder_(root, dateStr.slice(0, 7));
  // 同日重跑先移除舊檔（避免堆一堆同名 PDF）
  const dup = ymF.getFilesByName('KPI日報_' + dateStr + '.pdf');
  while (dup.hasNext()) dup.next().setTrashed(true);
  const file = ymF.createFile(blob);
  try { file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); } catch (e) {}
  return { url: 'https://drive.google.com/file/d/' + file.getId() + '/view', fileId: file.getId(), summary: built.summary };
}

/** 摘要文字（LINE 訊息用） */
function kpiPdfMsg_(dateStr, r) {
  let t = '📄 KPI 日報 ' + dateStr + '\n'
    + '✅ 已提交 ' + r.summary.submitted + '/' + r.summary.total
    + '｜✏️ 草稿 ' + r.summary.draft
    + '｜❌ 未填 ' + r.summary.missing;
  if (r.summary.missingNames && r.summary.missingNames.length) t += '\n未填：' + r.summary.missingNames.join('、');
  if (r.summary.help && r.summary.help.length) t += '\n🚨 求助：' + r.summary.help.join('、');
  t += '\n\n完整報告（含照片）👇\n' + r.url;
  return t;
}

/** API：手動生成＋推播給所有 admin（?action=sendDailyKpiPdf&operator=柏翰&date=…） */
function sendDailyKpiPdf(params) {
  const u = params.operator ? findUserByNickname(params.operator) : null;
  if (!u || u.role !== 'admin') return { ok: false, error: '僅限管理員操作' };
  const dateStr = params.date ? String(params.date) : todayStr();
  const r = generateDailyKpiPdf_(dateStr);
  const msg = kpiPdfMsg_(dateStr, r);
  const admins = sheetToObjects(SHEET_NAMES.USERS).filter(x => x.role === 'admin' && x.status === 'active');
  admins.forEach(a => {
    if (a.line_user_id) pushLine_(a.line_user_id, msg);
    pushOneSignal_(a.nickname, '📄 KPI 日報 ' + dateStr, '已提交 ' + r.summary.submitted + '/' + r.summary.total + '，點開看完整報告');
  });
  logSystem(params.operator, 'kpi_pdf', dateStr, r.summary);
  return { ok: true, url: r.url, summary: r.summary };
}

/** 觸發器用（每天 21:30 自動發當日報告給老闆） */
function sendDailyKpiReportAuto() {
  const dateStr = todayStr();
  const r = generateDailyKpiPdf_(dateStr);
  const msg = kpiPdfMsg_(dateStr, r);
  const admins = sheetToObjects(SHEET_NAMES.USERS).filter(x => x.role === 'admin' && x.status === 'active');
  admins.forEach(a => {
    if (a.line_user_id) pushLine_(a.line_user_id, msg);
    pushOneSignal_(a.nickname, '📄 KPI 日報 ' + dateStr, '已提交 ' + r.summary.submitted + '/' + r.summary.total + '，點開看完整報告');
  });
  logSystem('system', 'kpi_pdf_auto', dateStr, r.summary);
}

/** 一次性：編輯器執行，建立每天 21:30 的日報觸發器 */
function setupKpiReportTrigger() {
  ScriptApp.getProjectTriggers().forEach(t => {
    if (t.getHandlerFunction() === 'sendDailyKpiReportAuto') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('sendDailyKpiReportAuto').timeBased().everyDays(1).atHour(21).nearMinute(30).create();
  return { ok: true, msg: '已建立：每天 21:30 自動發 KPI 日報 PDF 給老闆' };
}

/** LINE 指令：kpi / kpi昨天 / kpi 2026-07-08（限 admin） */
function handleKpiLineCommand_(lineUserId, text) {
  const users = sheetToObjects(SHEET_NAMES.USERS);
  const me = users.filter(x => x.line_user_id === lineUserId)[0];
  if (!me || me.role !== 'admin') return '此指令僅限老闆使用 🙏';
  let dateStr = todayStr();
  const dm = text.match(/(\d{4}-\d{2}-\d{2})/);
  if (dm) dateStr = dm[1];
  else if (text.indexOf('昨') >= 0) dateStr = addDaysStr_(todayStr(), -1);
  const r = generateDailyKpiPdf_(dateStr);
  return kpiPdfMsg_(dateStr, r);
}
