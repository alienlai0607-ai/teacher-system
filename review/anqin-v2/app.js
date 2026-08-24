(function () {
  'use strict';

  const STORAGE_KEY = 'bp_anqin_v2_review_live_trial_20260805';
  const LEGACY_TEST_STORAGE_KEYS = ['bp_anqin_v2_review_20260803'];
  const BACKUP_KEY = `${STORAGE_KEY}_safe_backup`;
  const DRAFT_KEY = `${STORAGE_KEY}_open_drafts`;
  const HEALTH_PROBE_KEY = `${STORAGE_KEY}_health_probe`;
  const APP_VERSION = 13;
  const MAX_EVIDENCE_FILES = 8;
  let loadStateIssue = '';

  const ACTIVITY_TYPES = {
    tutoring: { label: '安親課業指導', icon: 'book-open-check', tone: '', track: 'academic', kpi: '課業指導', evidence: true, requiresPlan: true },
    project: { label: '專案／選修課程', icon: 'blocks', tone: 'project', track: 'enrichment', kpi: '專案課程', evidence: true, requiresPlan: true },
    robotics: { label: '機器人／STEAM 課程', icon: 'bot', tone: 'project', track: 'enrichment', kpi: '專案課程', evidence: true, requiresPlan: true },
    portfolio: { label: '學習歷程', icon: 'folder-kanban', tone: 'project', track: 'enrichment', kpi: '專案課程', evidence: true, requiresPlan: true },
    sel: { label: 'SEL 聊心室', icon: 'heart-handshake', tone: 'classroom', track: 'enrichment', kpi: '班級經營', evidence: true, requiresPlan: true },
    classroom: { label: '班級經營', icon: 'users', tone: 'classroom', track: 'supplemental', kpi: '班級經營', evidence: true, requiresPlan: false },
    lessonprep: { label: '課程備課檔案', icon: 'notebook-tabs', tone: 'plan', track: 'archive', kpi: '課程研發', evidence: false, requiresPlan: false },
    support: { label: '教室協作', icon: 'handshake', tone: 'classroom', track: 'supplemental', kpi: '個人態度與表現', evidence: true, requiresPlan: false },
  };

  const PREP_SOURCE_TYPES = ['tutoring', 'project', 'robotics', 'portfolio', 'sel'];

  const ACTIVITY_GUIDES = {
    tutoring: {
      objective: ['今天希望學生學會什麼', '學生下課前能自己完成什麼？請寫人數、題數或具體表現。', '例：12 人中至少 10 人能獨立完成 6 題異分母加減。'],
      action: ['老師怎麼講解與引導', '實際用了哪種示範、提問、分組或個別協助？', '例：先用分數條示範，再請學生口述步驟，最後做 6 題個別練習。'],
      result: ['學生今天實際完成得怎麼樣', '用人數、題目、作品或常見錯誤寫出實際情況。', '例：11 人中 9 人能獨立完成；2 人仍會漏寫通分後分母。'],
      issue: ['學生還有哪些地方需要再教', '寫出仍不理解的概念、題型或需要個別協助的地方。', '例：2 人看到文字題仍會猜運算，需要再練習把題意畫成圖。'],
      next: ['下次要怎麼再教與確認', '只寫教學與檢核行動；負責人與日期請用下方欄位。', '例：用 3 題圖像題個別說明，再請學生獨立完成同類題。'],
      prep: '課前題目分析、補救步驟、分層題或示範素材',
    },
    project: {
      objective: ['本堂課要學習或完成什麼', '寫出這堂課預計理解的內容、練習的能力或完成的作品部分。', '例：學生能說明成本與售價的差別，並完成菜單成本表第一版。'],
      action: ['老師怎麼引導與安排活動', '實際如何說明、示範、提問、分組，並在什麼時候介入？', '例：先比較兩份菜單，再用三個問題引導各組查價、計算並說明定價依據。'],
      result: ['學生／小組實際完成情況', '寫完成組數、理解程度、作品內容或實際做出的決定。', '例：3 組完成第一版；2 組能說明定價，1 組仍漏列包材成本。'],
      issue: ['本堂課遇到的問題', '寫出學生理解、活動安排、分工、材料或時間上實際發生的問題。', '例：各組對成本欄位的理解不同，計算結果無法直接比較。'],
      next: ['下次要調整的課程行動', '只寫要改的講法、活動、材料或分工；負責人與日期另填。', '例：先用共同範例統一成本欄位，再讓各組修正成本表。'],
      prep: '專案任務單、課程示例、材料與本堂課引導安排',
    },
    robotics: {
      objective: ['本堂課要理解或完成什麼', '寫出要理解的原理，以及要完成的結構、程式或操作任務。', '例：學生理解循線感測原理，並讓車子在 60 秒內走完指定路線。'],
      action: ['原理、程式與操作實際怎麼引導', '寫出今天怎麼講原理、帶程式步驟、示範操作及協助學生除錯。', '例：先比較黑白表面的感測值，再請學生預測條件判斷結果，每次只改一個參數。'],
      result: ['學生實際理解與完成情況', '寫學生能否說明原理、完成組數、測試條件、成功率或版本差異。', '例：3 組能說明感測值差異；2 組走完全程，1 組在第二個彎道偏離。'],
      issue: ['本堂課遇到的問題', '寫出學生理解、結構、接線、程式邏輯、操作或合作上實際發生的問題。', '例：第三組尚未理解左右馬達輸出差異，因此轉彎時持續偏移。'],
      next: ['下次怎麼調整、延伸或改造', '只寫要改的原理講法、程式引導、遊戲規則或作品設計。', '例：先用左右輪實測圖重講輸出差異，再加入限時挑戰並改造彎道。'],
      prep: '核心原理、講解方式、程式引導、器材版本、遊戲或改造設計與安全規則',
    },
    portfolio: {
      objective: ['本次歷程整理目標', '要完成哪一件作品、反思或成長證據？', '例：每位學生完成一張作品前後對照與 80 字反思。'],
      action: ['整理與引導方式', '如何選件、追問、修訂與保留版本？', '例：先比較 v1/v2，再用三個反思句型引導學生說明修改理由。'],
      result: ['歷程產出結果', '寫完成人數、版本與反思品質差異。', '例：8 人完成；6 人能說明修改原因，2 人仍只描述外觀。'],
      issue: ['歷程品質缺口', '哪些證據或反思仍無法呈現學習變化？', '例：兩位學生缺少第一版照片，無法做前後對照。'],
      next: ['補件或修訂行動', '只寫要補的版本、證據或引導；負責人與日期另填。', '例：補齊過程圖，並完成第二次反思。'],
      prep: '選件標準、反思題目、版本命名與隱私檢核',
    },
    sel: {
      objective: ['本次社會情緒能力目標', '學生要辨識、說出或練習哪一個具體行為？', '例：學生能說出衝突時的情緒與一個可行回應。'],
      action: ['引導結構與安全做法', '用了哪個情境、句型、演練與界線？', '例：用情境卡兩人演練，再由同伴回饋語氣與請求句型。'],
      result: ['可觀察行為或學生原句', '只保留必要的行為與原句，不寫人格判斷。', '例：2 人能說出情緒；1 人能用「我希望…」提出請求。'],
      issue: ['需支持或轉介的訊號', '寫具體情境與風險，不下診斷。', '例：學生遇衝突仍只會離開現場，尚未能提出請求。'],
      next: ['下一次支持', '只寫要再練的句型、情境或支持方法；接手人與日期另填。', '例：加入「提出請求」句型並再演練一次。'],
      prep: '情境卡、提問句型、安全界線與觀察紀錄表',
    },
    classroom: {
      objective: ['本次班級經營目標', '哪一個秩序、合作或自主管理行為要改變？', '例：轉場時間由 8 分鐘降至 5 分鐘，且學生能自行完成收拾。'],
      action: ['規則與介入做法', '用了哪個提示、角色、流程或增強方式？', '例：將收拾分成三區並設區長，以倒數提示完成轉場。'],
      result: ['班級行為變化', '寫時間、人數、頻率或具體行為。', '例：本次 5 分 20 秒完成，僅 2 人需二次提醒。'],
      issue: ['反覆出現的管理問題', '記錄發生時段、位置與觸發情境。', '例：點心後收拾最慢，水壺區仍會壅塞。'],
      next: ['規則調整與複查', '只寫要保留、刪除或改的流程；負責人與複查日另填。', '例：將水壺區改成分組進出並再計時。'],
      prep: '班級流程、視覺提示、角色分工與觀察指標',
    },
    lessonprep: {
      objective: ['教案要讓學生學會什麼', '寫出學生完成課程後能做到的具體表現。', '例：學生能區分三類成本並完成一份菜單成本表。'],
      action: ['老師如何講解與引導', '整理流程、提問、示範、分組及個別支持方式。', '例：先完成共同範例，再由各組查價、計算並說明定價依據。'],
      result: ['這份備課包含哪些內容', '列出已完成的教案、簡報、學習單與檢核工具。', '例：完成 90 分鐘教案、簡報、成本表與離場題。'],
      issue: ['還有哪些內容待補', '寫出教材、材料或教學安排仍需處理的地方。', '例：材料預算尚未確認，學習單第 3 題需要降低文字難度。'],
      next: ['下次要補什麼', '只寫下一次要完成的具體備課內容。', '例：補齊材料清單並完成兩種難度的學習單。'],
      prep: '教案內容、正式教材與參考資料',
    },
    support: {
      objective: ['本次協作交付目標', '要支援誰、完成什麼交付或交接？', '例：協助小明老師完成五年級自然實驗材料分裝與安全檢核。'],
      action: ['協作內容與分工', '實際協助了什麼、雙方如何分工？', '例：依組別分裝 6 份材料，核對清單後完成交接。'],
      result: ['交付與接手結果', '寫完成數量、接手人與是否可直接使用。', '例：6 組材料齊全，由小明老師 15:30 確認接手。'],
      issue: ['協作缺口', '記錄材料、責任或時程上的未完成項目。', '例：護目鏡少 2 副，無法按原分組進行。'],
      next: ['後續要補齊或確認什麼', '只寫要完成的後續行動；負責人與期限另填。', '例：向行政補領兩副護目鏡，並請授課老師再點收。'],
      prep: '交付清單、責任分工、時程與驗收方式',
    },
  };

  const OPERATION_CHECKS = {
    classroom: { label: '教室桌面與動線', focus: '桌面、地面、走道與逃生動線；需看得出無雜物阻擋。' },
    tools: { label: '教具與共用物品歸位', focus: '教具櫃、數量與標籤；照片需看得出歸位位置。' },
    trash: { label: '垃圾與回收處理', focus: '垃圾桶、回收分類與周邊地面；需看得出已清空或分類。' },
    toilet: { label: '廁所與洗手區', focus: '洗手台、地面、備品與安全；避免只拍門口廣角。' },
  };

  const ACTIVITY_DETAIL_SCHEMAS = {
    tutoring: [
      { key: 'unit', label: '科目／單元與作業範圍', placeholder: '例：四年級數學第 6 單元，習作 P42–45。', min: 6 },
      { key: 'baseline', label: '學生原本會什麼／常錯在哪裡', placeholder: '例：11 人中 4 人會直接相加分母；2 人無法從文字題判斷運算。', min: 12 },
    ],
    project: [
      { key: 'stage', label: '目前專案進度與本堂課內容', placeholder: '例：目前進行菜單成本單元；本堂課要理解三類成本，並開始第一版定價。', min: 10 },
    ],
    robotics: [
      { key: 'principle', label: '這堂課的核心原理', placeholder: '例：紅外線感測器會因黑白表面反射量不同而產生不同數值，程式再依數值控制轉向。', min: 12 },
      { key: 'buildVersion', label: '器材配置與程式／作品版本', placeholder: '例：mBot v2、雙紅外線感測器、程式檔 follow-line_v1.3。', min: 10 },
      { key: 'extension', label: '有沒有遊戲設計或作品改造', placeholder: '例：有，完成基本循線後加入限時闖關；學生可改造車頭並比較是否影響感測。若本堂沒有，也要寫明原因。', min: 10 },
      { key: 'testProtocol', label: '測試方式、安全規則與紀錄表', placeholder: '例：同一路線測 3 次；每次只調一個參數，啟動前完成接線與電池檢核。', min: 12 },
    ],
    portfolio: [
      { key: 'artifact', label: '本次選件與版本', placeholder: '例：橋梁作品 v1／v2、承重測試表及 80 字反思。', min: 8 },
      { key: 'reflectionPrompt', label: '學生反思引導題', placeholder: '例：你改了哪裡？依據是什麼？下一版還想測試什麼？', min: 10 },
    ],
    sel: [
      { key: 'boundary', label: '安全界線與需轉介條件', placeholder: '例：不追問家庭隱私；若提及自傷、持續霸凌或安全風險立即通知主管。', min: 12 },
    ],
    classroom: [],
    lessonprep: [
      { key: 'targetCourse', label: '備課課程類型', control: 'select', options: ['安親課業指導', '專案／選修課程', '機器人／STEAM 課程', '學習歷程', 'SEL 聊心室'], min: 2, span: 1 },
    ],
    support: [
      { key: 'recipient', label: '協作對象與責任邊界', placeholder: '例：支援小明老師五年級自然課；我負責材料分裝，他負責授課與點收。', min: 10 },
      { key: 'acceptance', label: '完成與驗收標準', placeholder: '例：材料數量符合清單、安全標示完成、接手人確認可直接使用。', min: 10 },
    ],
  };

  const PREP_EVIDENCE_CATEGORIES = {
    lesson_plan: '教案／流程',
    slides: '簡報／示範素材',
    worksheet: '學習單／任務單',
    assessment: '檢核題／評量表',
    checklist: '規格／檢核清單',
    reference: '來源／參考資料',
    material: '教具／材料配置',
    other: '其他備課依據',
  };

  const EVIDENCE_TYPES = {
    process: '教學過程關鍵畫面',
    artifact: '學生作品／學習單',
    before_after: '前後差異／訂正成果',
    assessment: '達成結果／測試紀錄',
    plan_asset: '教案／教材成品',
    environment: '環境異常／改善',
  };

  const STUDENTS = ['陳品安', '林子晴', '王柏宇', '張語芯', '許宥辰', '黃可恩', '蔡承翰', '李昕妤'];

  const TEACHER_NAV = [
    { route: 'today', label: '今日紀錄', icon: 'clipboard-pen-line' },
    { route: 'weekly', label: '本週整理', icon: 'calendar-range' },
    { route: 'plans', label: '備課教案建檔', icon: 'notebook-tabs' },
    { route: 'records', label: '我的紀錄', icon: 'history' },
    { route: 'tasks', label: '追蹤事項', icon: 'list-checks', count: () => openTasks().length },
    { route: 'guide', label: '填寫指南', icon: 'circle-help' },
  ];

  const MANAGER_NAV = [
    { route: 'dashboard', label: '管理總覽', icon: 'layout-dashboard' },
    { route: 'reviews', label: '日報審查', icon: 'messages-square', count: () => pendingReviews().length },
    { route: 'evidence', label: '證據中心', icon: 'scan-search', count: () => allEvidence().filter(item => item.evidence.status !== 'accepted').length },
    { route: 'operations-review', label: '班務稽核', icon: 'school', count: () => operationRecords().filter(item => item.confirmedAt && item.reviewStatus !== 'accepted').length },
    { route: 'students', label: '學生追蹤', icon: 'user-round-search', count: () => state.studentCases.filter(item => item.status !== 'closed').length },
    { route: 'plans-review', label: '教案審查', icon: 'file-check-2', count: () => state.lessonPlans.filter(item => item.status === 'review').length },
    { route: 'team', label: '團隊狀態', icon: 'users-round' },
  ];

  const TODAY_TABS = [
    { key: 'activities', label: '工作紀錄', icon: 'clipboard-list' },
    { key: 'students', label: '學生追蹤', icon: 'user-round-search' },
    { key: 'parents', label: '親師溝通', icon: 'messages-square' },
    { key: 'operations', label: '班務檢核', icon: 'school' },
    { key: 'submit', label: '確認送出', icon: 'send' },
  ];

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));
  const clone = value => JSON.parse(JSON.stringify(value));
  const todayIso = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Taipei' });
  const addDays = (dateString, amount) => {
    const date = new Date(dateString + 'T12:00:00');
    date.setDate(date.getDate() + amount);
    return date.toLocaleDateString('sv-SE');
  };
  const uid = prefix => `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
  const esc = value => String(value == null ? '' : value).replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
  })[char]);
  const nl2br = value => esc(value).replace(/\n/g, '<br>');
  const formatDate = value => {
    if (!value) return '—';
    const parts = String(value).slice(0, 10).split('-');
    return parts.length === 3 ? `${parts[0]}/${parts[1]}/${parts[2]}` : String(value);
  };
  const formatShortDate = value => {
    if (!value) return '—';
    const parts = String(value).slice(0, 10).split('-');
    return parts.length === 3 ? `${Number(parts[1])}/${Number(parts[2])}` : String(value);
  };
  const dayDistance = (from, to) => {
    const start = new Date(`${from}T12:00:00`);
    const end = new Date(`${to}T12:00:00`);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;
    return Math.round((end.getTime() - start.getTime()) / 86400000);
  };
  const formatTime = value => {
    if (!value) return '';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? String(value).slice(11, 16) : date.toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit', hour12: false });
  };
  const truncate = (value, length = 68) => {
    const text = String(value || '');
    return text.length > length ? `${text.slice(0, length)}…` : text;
  };
  const icon = (name, size = 18) => `<i data-lucide="${name}" width="${size}" height="${size}" aria-hidden="true"></i>`;

  function createSeed() {
    const today = todayIso();
    return {
      version: APP_VERSION,
      ui: {
        role: 'teacher', route: 'today', todayTab: 'activities', lastSavedAt: null, guideType: 'tutoring', guidePromptDismissed: false, evidenceStandardsSeen: false, visualTheme: 'playful',
        filters: {
          plans: { status: 'all' }, tasks: { status: 'open' }, records: { period: '30d', status: 'all', query: '' },
          reviews: { status: 'open', teacher: 'all', date: '', query: '' },
          evidence: { type: 'all', status: 'open', kpi: 'all', query: '' },
          students: { urgency: 'all', status: 'open', query: '' },
          planReview: { status: 'review', teacher: 'all', query: '' },
          operationsReview: { status: 'open', owner: 'all' },
        },
      },
      context: { department: '北區教室', teacher: '羊羊老師', manager: '小魚', reviewDate: today },
      people: [
        { nickname: '羊羊老師', department: '北區教室', role: 'teacher', initials: '羊羊' },
        { nickname: '小明老師', department: '北區教室', role: 'teacher', initials: '小明' },
        { nickname: '樂樂老師', department: '北區教室', role: 'teacher', initials: '樂樂' },
        { nickname: '小魚', department: '北區教室', role: 'manager', initials: '小魚' },
      ],
      daily: {
        date: today, status: 'draft', submittedAt: '', parentStatus: '', noStudentFollowupConfirmed: false,
        summary: { keyResult: '', followup: '', tomorrowPriority: '', teacherNote: '' },
      },
      activities: [],
      studentCases: [],
      contacts: [],
      operations: {
        id: 'op_today', date: today, room: '北區 2F 安親教室', dutyOwner: '羊羊老師', status: 'draft',
        checks: { classroom: true, tools: true, trash: true, toilet: true }, evidenceByCheck: {},
        exception: '', action: '', evidence: null, confirmedAt: '', reviewStatus: 'pending', managerFeedback: '', reviewedAt: '', reviewedBy: '',
      },
      operationHistory: [],
      weekly: { weekLabel: '', status: 'draft', keyChange: '', priorityRisks: '', nextWeek: '', decisionNeeded: '' },
      lessonPlans: [],
      tasks: [],
      submissions: [],
      managerNotes: [],
      feedbackThreads: {},
    };
  }

  function normalizeEvidenceRecord(record) {
    if (!record || typeof record !== 'object') return record;
    let attachments = Array.isArray(record.attachments) ? record.attachments : [];
    if (!attachments.length && (record.fileName || record.dataUrl || record.placeholder)) {
      attachments = [{
        id: `attachment_${record.id || 'legacy'}_1`,
        fileName: record.fileName || '成果檔案',
        mimeType: record.mimeType || 'application/octet-stream',
        dataUrl: record.dataUrl || '',
        size: record.size || '',
        note: '',
        placeholder: Boolean(record.placeholder && !record.dataUrl),
      }];
    }
    record.attachments = attachments.map((attachment, index) => ({
      id: attachment.id || `attachment_${record.id || 'item'}_${index + 1}`,
      fileName: attachment.fileName || `成果檔案 ${index + 1}`,
      mimeType: attachment.mimeType || 'application/octet-stream',
      dataUrl: attachment.dataUrl || '',
      size: attachment.size || '',
      note: attachment.note || '',
      placeholder: Boolean(attachment.placeholder && !attachment.dataUrl),
    }));
    const primary = record.attachments.find(item => item.id === record.primaryAttachmentId) || record.attachments[0];
    record.primaryAttachmentId = primary?.id || '';
    if (primary) {
      record.fileName = primary.fileName;
      record.mimeType = primary.mimeType;
      record.dataUrl = primary.dataUrl || '';
      record.placeholder = Boolean(primary.placeholder && !primary.dataUrl);
    }
    return record;
  }

  function normalizeLoadedState(parsed) {
    const seed = createSeed();
    parsed.ui = { ...seed.ui, ...(parsed.ui || {}), filters: { ...seed.ui.filters, ...(parsed.ui?.filters || {}) } };
    parsed.context = { ...seed.context, ...(parsed.context || {}) };
    parsed.daily = { ...seed.daily, ...(parsed.daily || {}), summary: { ...seed.daily.summary, ...(parsed.daily?.summary || {}) } };
    parsed.weekly = { ...seed.weekly, ...(parsed.weekly || {}) };
    parsed.operations = { ...seed.operations, ...(parsed.operations || {}), evidenceByCheck: { ...seed.operations.evidenceByCheck, ...(parsed.operations?.evidenceByCheck || {}) } };
    parsed.operationHistory = Array.isArray(parsed.operationHistory) ? parsed.operationHistory : clone(seed.operationHistory);
    ['people', 'activities', 'studentCases', 'contacts', 'lessonPlans', 'tasks', 'submissions', 'managerNotes'].forEach(key => {
      if (!Array.isArray(parsed[key])) parsed[key] = clone(seed[key] || []);
    });
    parsed.feedbackThreads = parsed.feedbackThreads && typeof parsed.feedbackThreads === 'object' && !Array.isArray(parsed.feedbackThreads) ? parsed.feedbackThreads : {};
    Object.entries(parsed.feedbackThreads).forEach(([key, messages]) => {
      parsed.feedbackThreads[key] = (Array.isArray(messages) ? messages : []).filter(message => message && String(message.text || '').trim()).map(message => ({
        id: message.id || uid('msg'),
        author: message.author || (message.role === 'teacher' ? parsed.context.teacher : parsed.context.manager),
        role: message.role === 'teacher' ? 'teacher' : 'manager',
        text: String(message.text || '').trim(),
        createdAt: message.createdAt || new Date().toISOString(),
      }));
    });
    const migrateLegacyFeedback = (key, text, createdAt, author = parsed.context.manager) => {
      const value = String(text || '').trim();
      if (!value) return;
      const thread = parsed.feedbackThreads[key] || (parsed.feedbackThreads[key] = []);
      if (thread.some(message => message.role === 'manager' && message.text === value)) return;
      thread.push({ id: uid('msg'), author, role: 'manager', text: value, createdAt: createdAt || new Date().toISOString() });
    };
    parsed.activities.forEach(activity => {
      if (activity.type === 'lessonprep' && activity.details?.stage === '教案草稿') activity.details.stage = '教學設計中';
      activity.evidence = Array.isArray(activity.evidence) ? activity.evidence : [];
      activity.evidence.forEach(evidence => {
        normalizeEvidenceRecord(evidence);
        if (activity.result) evidence.claim = activity.result;
      });
    });
    parsed.lessonPlans.forEach(plan => {
      const linkedPrep = parsed.activities.find(activity => activity.type === 'lessonprep' && activity.planId === plan.id);
      if (linkedPrep) {
        plan.sourceActivityId = linkedPrep.id;
        syncPlanIdentityFromPrep(plan, linkedPrep);
      }
      migrateLegacyFeedback(`plan:${plan.id}`, plan.managerFeedback, plan.updatedAt);
    });
    if (parsed.operations?.evidence) normalizeEvidenceRecord(parsed.operations.evidence);
    parsed.submissions.forEach(submission => {
      submission.activityIds = Array.isArray(submission.activityIds) ? submission.activityIds : [];
      submission.studentCaseIds = Array.isArray(submission.studentCaseIds) ? submission.studentCaseIds : [];
      submission.contactIds = Array.isArray(submission.contactIds) ? submission.contactIds : [];
      if (!Array.isArray(submission.activitySnapshots)) {
        submission.activitySnapshots = submission.activityIds.map(id => parsed.activities.find(item => item.id === id)).filter(Boolean).map(clone);
      }
      if (!Array.isArray(submission.studentCaseSnapshots)) {
        submission.studentCaseSnapshots = submission.studentCaseIds.map(id => parsed.studentCases.find(item => item.id === id)).filter(Boolean).map(clone);
      }
      if (!Array.isArray(submission.contactSnapshots)) {
        submission.contactSnapshots = submission.contactIds.map(id => parsed.contacts.find(item => item.id === id)).filter(Boolean).map(clone);
      }
      submission.activitySnapshots.forEach(activity => (activity.evidence || []).forEach(normalizeEvidenceRecord));
      migrateLegacyFeedback(`submission:${submission.id}`, submission.feedback, submission.reviewedAt || submission.submittedAt);
    });
    parsed.activities.forEach(activity => (activity.evidence || []).forEach(evidence => {
      migrateLegacyFeedback(`evidence:${activity.id}:${evidence.id}`, evidence.managerFeedback, evidence.reviewedAt || evidence.createdAt);
    }));
    [parsed.operations, ...(parsed.operationHistory || [])].filter(Boolean).forEach(operation => {
      migrateLegacyFeedback(`operation:${operation.id}`, operation.previousManagerFeedback, operation.reviewedAt || operation.confirmedAt, operation.reviewedBy || parsed.context.manager);
      migrateLegacyFeedback(`operation:${operation.id}`, operation.managerFeedback, operation.reviewedAt || operation.confirmedAt, operation.reviewedBy || parsed.context.manager);
    });
    parsed.managerNotes.forEach(note => migrateLegacyFeedback(`case:${note.caseId}`, note.note, note.createdAt, note.author || parsed.context.manager));
    if (!['calm', 'playful'].includes(parsed.ui.visualTheme)) parsed.ui.visualTheme = 'playful';
    parsed.version = APP_VERSION;
    return parsed;
  }

  function mediaFreeState(source) {
    const snapshot = clone(source);
    const stripEvidence = evidence => {
      if (!evidence) return;
      evidence.dataUrl = '';
      evidence.placeholder = Boolean(evidence.fileName);
      (evidence.attachments || []).forEach(attachment => {
        attachment.dataUrl = '';
        attachment.placeholder = true;
      });
    };
    snapshot.activities.forEach(activity => (activity.evidence || []).forEach(stripEvidence));
    (snapshot.submissions || []).forEach(submission => (submission.activitySnapshots || []).forEach(activity => (activity.evidence || []).forEach(stripEvidence)));
    if (snapshot.operations?.evidence) stripEvidence(snapshot.operations.evidence);
    Object.values(snapshot.operations?.evidenceByCheck || {}).forEach(item => {
      if (item) item.dataUrl = '';
    });
    snapshot.ui = snapshot.ui || {};
    snapshot.ui.mediaRecovery = true;
    return snapshot;
  }

  function loadState() {
    let raw = '';
    let backupRaw = '';
    try {
      LEGACY_TEST_STORAGE_KEYS.forEach(key => {
        localStorage.removeItem(key);
        localStorage.removeItem(`${key}_safe_backup`);
        localStorage.removeItem(`${key}_open_drafts`);
        try { sessionStorage.removeItem(`${key}_open_drafts`); } catch (error) { /* no-op */ }
      });
      raw = localStorage.getItem(STORAGE_KEY) || '';
      backupRaw = localStorage.getItem(BACKUP_KEY) || '';
    } catch (error) {
      loadStateIssue = '瀏覽器目前不允許讀取本機資料，已開啟空白審查資料。';
      return createSeed();
    }
    if (!raw && !backupRaw) return createSeed();
    let parsed = null;
    let backup = null;
    try {
      if (raw) parsed = JSON.parse(raw);
    } catch (error) {
      loadStateIssue = '主要資料無法解析，系統正在嘗試安全備份。';
    }
    try {
      if (backupRaw) backup = JSON.parse(backupRaw);
    } catch (error) {
      backup = null;
    }
    if (backup && (!parsed || Number(backup.ui?.saveRevision || 0) > Number(parsed.ui?.saveRevision || 0))) {
      parsed = backup;
      loadStateIssue = '已恢復最近一次文字安全備份；未完成儲存的照片可能需要重新選擇。';
    }
    if (!parsed) {
      loadStateIssue = '主要資料與安全備份皆無法載入，已保留原資料並開啟空白審查頁。';
      return createSeed();
    }
    if (![8, 9, 10, 11, 12, APP_VERSION].includes(parsed.version)) {
      loadStateIssue = '資料版本無法辨識，舊資料未被覆蓋；目前先開啟空白審查頁。';
      return createSeed();
    }
    return normalizeLoadedState(parsed);
  }

  let state = loadState();
  let saveTimer = null;
  let filterTimer = null;
  let activityDraft = null;
  let returnActivityDraft = null;
  let evidenceDraft = null;
  let planDraft = null;
  let activePinPosition = null;
  let draftTimer = null;
  let currentDrawerDraftKey = '';
  let currentDrawerDraftKind = '';
  let currentDrawerDraftDirty = false;
  let restoredDraftAt = '';
  let lastStorageToastAt = 0;
  let runtimeHealth = {
    loadIssue: loadStateIssue,
    persistError: '',
    lastPersistOk: !loadStateIssue,
    lastPersistAt: state.ui.lastSavedAt || '',
  };
  let openDraftStore = loadOpenDraftStore();

  function feedbackThreadKey(kind, id, secondaryId = '') {
    return [kind, id, secondaryId].filter(Boolean).join(':');
  }

  function feedbackThreadMessages(key) {
    return (state.feedbackThreads?.[key] || []).filter(message => String(message.text || '').trim()).slice().sort((a, b) => {
      const aTime = Date.parse(a.createdAt || '');
      const bTime = Date.parse(b.createdAt || '');
      if (Number.isFinite(aTime) && Number.isFinite(bTime)) return aTime - bTime;
      return String(a.createdAt || '').localeCompare(String(b.createdAt || ''));
    });
  }

  function appendFeedbackMessage(key, text, role = state.ui.role, author = '') {
    const value = String(text || '').trim();
    if (!value) return null;
    state.feedbackThreads = state.feedbackThreads || {};
    const messages = state.feedbackThreads[key] || (state.feedbackThreads[key] = []);
    const normalizedRole = role === 'teacher' ? 'teacher' : 'manager';
    const normalizedAuthor = author || (normalizedRole === 'teacher' ? state.context.teacher : state.context.manager);
    const latest = messages[messages.length - 1];
    if (latest && latest.role === normalizedRole && latest.author === normalizedAuthor && latest.text === value) return latest;
    const message = { id: uid('msg'), author: normalizedAuthor, role: normalizedRole, text: value, createdAt: new Date().toISOString() };
    messages.push(message);
    return message;
  }

  function feedbackMessageTime(value) {
    if (!value) return '';
    const date = String(value).slice(0, 10);
    const hasTime = String(value).includes('T');
    return `${formatShortDate(date)}${hasTime ? ` ${formatTime(value)}` : ''}`;
  }

  function feedbackThreadExport(key) {
    return feedbackThreadMessages(key).map(message => `${feedbackMessageTime(message.createdAt)} ${message.author}：${message.text}`).join('\n');
  }

  function renderFeedbackThread(key, { inline = false } = {}) {
    const messages = feedbackThreadMessages(key);
    const inputId = `feedback-reply-${key.replace(/[^a-zA-Z0-9_-]/g, '-')}`;
    const placeholder = state.ui.role === 'manager' ? '補充意見或回覆老師' : '回覆主管，或說明已完成的調整';
    const wrapperClass = inline ? 'feedback-thread feedback-thread-inline' : 'panel feedback-thread';
    const headClass = inline ? 'feedback-thread-head' : 'panel-head';
    const bodyClass = inline ? 'feedback-thread-body' : 'panel-body';
    return `<section class="${wrapperClass}" data-feedback-thread="${esc(key)}" data-feedback-inline="${inline}">
      <div class="${headClass}"><div><div class="panel-title">${icon('messages-square')}主管與老師對話</div><div class="panel-subtitle">${messages.length ? `${messages.length} 則訊息` : '尚無訊息'}</div></div></div>
      <div class="${bodyClass}">
        <div class="feedback-message-list" aria-live="polite">${messages.length ? messages.map(message => `<article class="feedback-message is-${message.role === 'teacher' ? 'teacher' : 'manager'}"><div class="feedback-message-meta"><strong>${esc(message.author)}</strong><time datetime="${esc(message.createdAt || '')}">${esc(feedbackMessageTime(message.createdAt))}</time></div><div class="feedback-message-copy">${nl2br(message.text)}</div></article>`).join('') : '<div class="feedback-thread-empty">尚無對話</div>'}</div>
        <div class="feedback-composer"><label class="sr-only" for="${inputId}">回覆內容</label><textarea id="${inputId}" data-feedback-input rows="2" placeholder="${esc(placeholder)}"></textarea><button type="button" class="btn btn-primary" data-action="send-feedback-message" data-thread-key="${esc(key)}">${icon('send', 15)}送出回覆</button></div>
      </div>
    </section>`;
  }

  function currentVisualTheme() {
    return state.ui.visualTheme === 'calm' ? 'calm' : 'playful';
  }

  function applyVisualTheme() {
    const theme = currentVisualTheme();
    document.documentElement.dataset.visualTheme = theme;
    const themeColor = document.querySelector('meta[name="theme-color"]');
    if (themeColor) themeColor.content = theme === 'calm' ? '#f4f6f5' : '#fff8e8';
  }

  function getFilters(group, defaults) {
    state.ui.filters = state.ui.filters || {};
    state.ui.filters[group] = { ...defaults, ...(state.ui.filters[group] || {}) };
    return state.ui.filters[group];
  }

  function writeSafeBackup(snapshot) {
    const serialized = JSON.stringify(mediaFreeState(snapshot));
    try {
      localStorage.setItem(BACKUP_KEY, serialized);
      return true;
    } catch (error) {
      try {
        localStorage.removeItem(BACKUP_KEY);
        localStorage.setItem(BACKUP_KEY, serialized);
        return true;
      } catch (retryError) {
        return false;
      }
    }
  }

  function storageFailureMessage(error) {
    return error?.name === 'QuotaExceededError'
      ? '儲存空間不足：文字已嘗試安全備份，請移除部分照片後再儲存'
      : '資料儲存失敗：請先不要關閉頁面，並執行系統健康檢查';
  }

  function persist(message = '草稿已儲存') {
    const previousSavedAt = state.ui.lastSavedAt;
    const previousRevision = state.ui.saveRevision;
    const savedAt = new Date().toISOString();
    state.ui.lastSavedAt = savedAt;
    state.ui.saveRevision = Date.now();
    const snapshot = clone(state);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      writeSafeBackup(snapshot);
      runtimeHealth.loadIssue = '';
      runtimeHealth.persistError = '';
      runtimeHealth.lastPersistOk = true;
      runtimeHealth.lastPersistAt = savedAt;
      updateSaveIndicator('saved', message);
      return true;
    } catch (error) {
      const backupSaved = writeSafeBackup(snapshot);
      state.ui.lastSavedAt = previousSavedAt;
      state.ui.saveRevision = previousRevision;
      runtimeHealth.persistError = storageFailureMessage(error);
      runtimeHealth.lastPersistOk = false;
      updateSaveIndicator('error', backupSaved ? '照片未存入，文字已有安全備份' : '儲存失敗，請勿關閉頁面');
      if (Date.now() - lastStorageToastAt > 5000) {
        toast(runtimeHealth.persistError, 'danger');
        lastStorageToastAt = Date.now();
      }
      return false;
    }
  }

  function schedulePersist() {
    updateSaveIndicator('saving', '儲存中');
    window.clearTimeout(saveTimer);
    saveTimer = window.setTimeout(() => persist(), 450);
  }

  function loadOpenDraftStore() {
    const read = storage => {
      try {
        return JSON.parse(storage.getItem(DRAFT_KEY) || '{}');
      } catch (error) {
        return {};
      }
    };
    const local = read(localStorage);
    const session = read(sessionStorage);
    const merged = { ...local };
    Object.entries(session).forEach(([key, draft]) => {
      if (!merged[key] || String(draft?.savedAt || '') > String(merged[key]?.savedAt || '')) merged[key] = draft;
    });
    return merged;
  }

  function writeOpenDraftStore() {
    const serialized = JSON.stringify(openDraftStore);
    try {
      localStorage.setItem(DRAFT_KEY, serialized);
      try { sessionStorage.removeItem(DRAFT_KEY); } catch (error) { /* no-op */ }
      return 'local';
    } catch (error) {
      try {
        sessionStorage.setItem(DRAFT_KEY, serialized);
        return 'session';
      } catch (sessionError) {
        return '';
      }
    }
  }

  function drawerDraftKey(kind, id = '', subtype = '') {
    const identity = id || `new_${subtype || 'default'}`;
    return `${kind}:${state.context.teacher}:${state.daily.date}:${identity}`;
  }

  function getOpenDraft(key) {
    return key ? openDraftStore[key] || null : null;
  }

  function setOpenDraft(key, kind, payload) {
    if (!key || !payload) return false;
    openDraftStore[key] = { kind, payload: clone(payload), savedAt: new Date().toISOString() };
    const location = writeOpenDraftStore();
    if (!location && kind === 'evidence') {
      const fallback = clone(payload);
      (fallback.attachments || []).forEach(item => { item.dataUrl = ''; item.placeholder = true; });
      fallback.dataUrl = '';
      fallback.placeholder = Boolean(fallback.fileName);
      openDraftStore[key] = { kind, payload: fallback, savedAt: new Date().toISOString(), mediaOmitted: true };
      return Boolean(writeOpenDraftStore());
    }
    return Boolean(location);
  }

  function removeOpenDraft(key) {
    if (!key) return;
    delete openDraftStore[key];
    writeOpenDraftStore();
  }

  function serializeFormControls(form) {
    const fields = {};
    Array.from(form?.elements || []).forEach(control => {
      if (!control.id || ['file', 'button', 'submit', 'reset'].includes(control.type)) return;
      fields[control.id] = ['checkbox', 'radio'].includes(control.type)
        ? { value: control.value, checked: control.checked }
        : { value: control.value };
    });
    return fields;
  }

  function restoreFormControls(form, fields) {
    Object.entries(fields || {}).forEach(([id, saved]) => {
      const control = document.getElementById(id);
      if (!control || !form.contains(control)) return;
      if (['checkbox', 'radio'].includes(control.type)) control.checked = Boolean(saved.checked);
      else control.value = saved.value == null ? '' : saved.value;
    });
  }

  function setDrawerDraftContext(kind, key, restored = null) {
    currentDrawerDraftKind = kind;
    currentDrawerDraftKey = key;
    currentDrawerDraftDirty = false;
    restoredDraftAt = restored?.savedAt || '';
  }

  function persistCurrentDrawerDraft(force = false) {
    if (!currentDrawerDraftKey || (!currentDrawerDraftDirty && !force)) return false;
    let payload = null;
    if (currentDrawerDraftKind === 'activity') payload = captureActivityFormDraft();
    else if (currentDrawerDraftKind === 'evidence') payload = syncEvidenceDraftFromForm();
    else {
      const form = $('[data-draft-form]') || $('#student-case-form') || $('#contact-form');
      if (form) payload = { fields: serializeFormControls(form) };
    }
    if (!payload) return false;
    const saved = setOpenDraft(currentDrawerDraftKey, currentDrawerDraftKind, payload);
    currentDrawerDraftDirty = false;
    updateSaveIndicator(saved ? 'saved' : 'error', saved ? '未送出內容已保留' : '未送出內容暫存失敗');
    return saved;
  }

  function scheduleCurrentDrawerDraft() {
    if (!currentDrawerDraftKey) return;
    currentDrawerDraftDirty = true;
    updateSaveIndicator('saving', '保留未送出內容');
    window.clearTimeout(draftTimer);
    draftTimer = window.setTimeout(() => persistCurrentDrawerDraft(), 300);
  }

  function clearCurrentDrawerDraft() {
    window.clearTimeout(draftTimer);
    removeOpenDraft(currentDrawerDraftKey);
    currentDrawerDraftKey = '';
    currentDrawerDraftKind = '';
    currentDrawerDraftDirty = false;
    restoredDraftAt = '';
  }

  function draftRecoveryNotice(savedAt = restoredDraftAt, mediaOmitted = false) {
    if (!savedAt) return '';
    return `<div class="notice-band success draft-recovery-notice">${icon('history', 19)}<div><div class="notice-title">已恢復 ${formatTime(savedAt)} 的未送出內容</div><div class="notice-copy">可從原位置繼續填寫；正式儲存後這份暫存會自動清除。${mediaOmitted ? ' 文字已恢復，照片因儲存空間不足需重新選擇。' : ''}</div></div><button type="button" class="btn btn-small" data-action="discard-open-draft">放棄暫存</button></div>`;
  }

  function applyRestoredFormDraft(formSelector, saved) {
    if (!saved?.payload?.fields) return;
    const form = $(formSelector);
    if (!form) return;
    restoreFormControls(form, saved.payload.fields);
    const body = $('#drawer-body');
    if (body) body.insertAdjacentHTML('afterbegin', draftRecoveryNotice(saved.savedAt, saved.mediaOmitted));
    hydrateIcons();
  }

  function isDateInPeriod(dateString, period) {
    if (!dateString || period === 'all') return true;
    const date = String(dateString).slice(0, 10);
    const reference = state.daily.date;
    if (period === '30d') return date >= addDays(reference, -29) && date <= reference;
    if (period === 'month') return date.slice(0, 7) === reference.slice(0, 7);
    if (period === 'last-month') {
      const month = new Date(reference + 'T12:00:00');
      month.setMonth(month.getMonth() - 1);
      return date.slice(0, 7) === month.toLocaleDateString('sv-SE').slice(0, 7);
    }
    return true;
  }

  function downloadCsv(fileName, rows) {
    const csv = '\ufeff' + rows.map(row => row.map(value => `"${String(value == null ? '' : value).replace(/"/g, '""')}"`).join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function exportRecords() {
    const rows = [['日期', '老師', '狀態', '系統彙整成果', '系統彙整追蹤', '系統彙整待辦', '老師補充', '主管與老師對話']];
    const currentSummary = buildDailySummary();
    const currentSubmission = state.submissions.find(item => item.teacher === state.context.teacher && item.date === state.daily.date);
    rows.push([
      state.daily.date, state.context.teacher, state.daily.submittedAt ? '已提交' : '草稿',
      currentSummary.keyResult, currentSummary.followup, currentSummary.tomorrowPriority, state.daily.summary.teacherNote || '', currentSubmission ? feedbackThreadExport(feedbackThreadKey('submission', currentSubmission.id)) : '',
    ]);
    state.submissions.filter(item => item.teacher === state.context.teacher && item.id !== currentSubmission?.id).forEach(item => rows.push([
      item.date, item.teacher, item.status === 'accepted' ? '已採認' : item.status === 'clarify' ? '待補充' : '待審查',
      item.keyResult, item.followup, item.tomorrowPriority, item.teacherNote || '', feedbackThreadExport(feedbackThreadKey('submission', item.id)),
    ]));
    downloadCsv(`安親KPI_我的紀錄_${state.context.teacher}_${state.daily.date}.csv`, rows);
    toast('紀錄已匯出', 'success');
  }

  function exportStudentCases() {
    const rows = [['日期', '學生', '老師', '類別', '優先度', '客觀觀察', '已採取介入', '可觀察結果', '下一步', '期限', '狀態', '已同步家長', '主管與老師對話']];
    state.studentCases.forEach(item => rows.push([
      item.date, item.student, item.teacher, item.category, item.urgency, item.observation, item.intervention,
      item.outcome, item.nextAction, item.dueDate, item.status === 'closed' ? '已結案' : '追蹤中', item.parentContacted ? '是' : '否', feedbackThreadExport(feedbackThreadKey('case', item.id)),
    ]));
    downloadCsv(`安親KPI_學生追蹤_${state.daily.date}.csv`, rows);
    toast('學生追蹤表已匯出', 'success');
  }

  function updateSaveIndicator(status, text) {
    const element = $('#save-state');
    if (!element) return;
    element.className = `save-state is-${status}`;
    const iconName = status === 'saving' ? 'refresh-cw' : status === 'error' ? 'circle-alert' : 'circle-check';
    element.innerHTML = `${icon(iconName, 14)}<span>${esc(text)}</span>`;
    hydrateIcons();
  }

  function markRequiredFields(root = document) {
    $$('[required][id]', root).forEach(control => {
      const label = root.querySelector(`label[for="${CSS.escape(control.id)}"]`) || document.querySelector(`label[for="${CSS.escape(control.id)}"]`);
      if (!label || label.querySelector('.required')) return;
      label.insertAdjacentHTML('beforeend', ' <span class="required" aria-hidden="true">*</span><span class="sr-only">必填</span>');
    });
  }

  function renderSystemStatusNotice() {
    const message = runtimeHealth.persistError || runtimeHealth.loadIssue;
    if (!message) return '';
    return `<div class="system-status-notice"><div class="notice-band danger">${icon('database-zap', 19)}<div><div class="notice-title">資料安全提醒</div><div class="notice-copy">${esc(message)}</div></div><button type="button" class="btn btn-small" data-action="open-health">健康檢查</button></div></div>`;
  }

  function hydrateIcons() {
    if (window.lucide && typeof window.lucide.createIcons === 'function') {
      window.lucide.createIcons({ attrs: { 'stroke-width': 1.9 } });
    }
  }

  function toast(message, type = '') {
    const root = $('#toast-root');
    if (!root) return;
    const node = document.createElement('div');
    node.className = `toast ${type}`.trim();
    node.innerHTML = `${icon(type === 'danger' ? 'circle-alert' : 'circle-check', 17)}<span>${esc(message)}</span>`;
    root.appendChild(node);
    hydrateIcons();
    window.setTimeout(() => node.remove(), 3200);
  }

  function roleNav() {
    return state.ui.role === 'manager' ? MANAGER_NAV : TEACHER_NAV;
  }

  function defaultRoute(role) {
    return role === 'manager' ? 'dashboard' : 'today';
  }

  function routeTitle() {
    const item = roleNav().find(nav => nav.route === state.ui.route);
    return item ? item.label : '安親工作台';
  }

  function currentPerson() {
    const nickname = state.ui.role === 'manager' ? state.context.manager : state.context.teacher;
    return state.people.find(person => person.nickname === nickname) || state.people[0];
  }

  function renderApp() {
    const app = $('#app');
    if (!app) return;
    applyVisualTheme();
    const person = currentPerson();
    const nav = roleNav();
    app.innerHTML = `
      <header class="topbar">
        <div class="brand-block">
          <img class="brand-logo" src="assets/kpi-logo.png" alt="布拉克星球 KPI Logo">
          <div class="brand-copy">
            <div class="brand-name"><span class="brand-name-full">布拉克星球KPI系統</span><span class="brand-name-short">布拉克星球KPI系統</span></div>
            <div class="brand-product">安親工作台 · V2</div>
          </div>
        </div>
        <div class="topbar-center">
          <div class="crumb">${esc(state.context.department)} / ${esc(routeTitle())}</div>
          <div id="save-state" class="save-state is-saved">${icon('circle-check', 14)}<span>${state.ui.lastSavedAt ? `已儲存 ${formatTime(state.ui.lastSavedAt)}` : '審查資料已隔離'}</span></div>
        </div>
        <div class="topbar-actions">
          <div class="role-switch" aria-label="切換審查角色">
            <button type="button" data-action="switch-role" data-role="teacher" class="${state.ui.role === 'teacher' ? 'active' : ''}">老師視角</button>
            <button type="button" data-action="switch-role" data-role="manager" class="${state.ui.role === 'manager' ? 'active' : ''}">主管視角</button>
          </div>
          ${state.ui.role === 'teacher' ? `<button type="button" class="icon-button topbar-help" data-action="navigate" data-route="guide" aria-label="開啟填寫指南" title="填寫指南">${icon('circle-help', 19)}</button>` : ''}
          <button type="button" class="profile-button" data-action="open-profile" aria-label="開啟使用者選單">
            <span class="avatar">${esc(person.initials || person.nickname.slice(0, 2))}</span>
            <span class="profile-text"><span class="profile-name">${esc(person.nickname)}</span><span class="profile-meta">${esc(person.department)}</span></span>
            ${icon('chevron-down', 16)}
          </button>
        </div>
      </header>

      <aside class="sidebar">
        <div class="nav-group-label">${state.ui.role === 'manager' ? '主管工作區' : '老師工作區'}</div>
        <nav class="side-nav" aria-label="主要導覽">
          ${nav.map(item => renderNavButton(item)).join('')}
        </nav>
        <div class="sidebar-foot">
          <span class="sidebar-crew" aria-hidden="true"><img src="../../shared/icons/bg.jpg" alt=""></span>
          <strong>${esc(state.context.department)}</strong><br>
          新版尚未連接正式資料庫
        </div>
      </aside>

      <main class="app-main" id="main-content">${renderSystemStatusNotice()}${renderRoute()}</main>

      <nav class="mobile-bottom-nav" aria-label="行動版主要導覽">
        ${renderMobileNav(nav)}
      </nav>
    `;
    hydrateIcons();
    markRequiredFields(app);
    window.scrollTo({ top: 0, behavior: 'instant' });
  }

  function renderNavButton(item) {
    const count = typeof item.count === 'function' ? item.count() : 0;
    return `<button type="button" class="nav-button ${state.ui.route === item.route ? 'active' : ''}" data-action="navigate" data-route="${item.route}">
      ${icon(item.icon, 18)}<span>${esc(item.label)}</span>${count ? `<span class="nav-count">${count}</span>` : ''}
    </button>`;
  }

  function renderMobileNav(nav) {
    const visible = nav.length <= 5 ? nav : nav.slice(0, 4);
    const buttons = visible.map(item => `<button type="button" class="mobile-nav-button ${state.ui.route === item.route ? 'active' : ''}" data-action="navigate" data-route="${item.route}">${icon(item.icon, 19)}<span>${esc(item.label)}</span></button>`);
    if (nav.length > 5) {
      buttons.push(`<button type="button" class="mobile-nav-button" data-action="open-more-nav">${icon('menu', 19)}<span>更多</span></button>`);
    }
    return buttons.join('');
  }

  function renderRoute() {
    const routes = state.ui.role === 'manager' ? {
      dashboard: renderManagerDashboard,
      reviews: renderManagerReviews,
      evidence: renderManagerEvidence,
      'operations-review': renderManagerOperations,
      students: renderManagerStudents,
      'plans-review': renderPlanReviews,
      team: renderTeamStatus,
    } : {
      today: renderTeacherToday,
      weekly: renderWeekly,
      plans: renderLessonPlans,
      records: renderRecords,
      tasks: renderTasks,
      guide: renderTeacherGuide,
    };
    const renderer = routes[state.ui.route] || routes[defaultRoute(state.ui.role)];
    return renderer();
  }

  function pageHead(title, subtitle, actions = '') {
    const mascotByRoute = {
      today: 'mascot-blue', weekly: 'mascot-green', plans: 'mascot-coral', records: 'mascot-black', tasks: 'mascot-green', guide: 'mascot-blue',
      dashboard: 'mascot-black', reviews: 'mascot-blue', evidence: 'mascot-black', students: 'mascot-green',
      'operations-review': 'mascot-green', 'plans-review': 'mascot-coral', team: 'mascot-blue',
    };
    const mascotClass = mascotByRoute[state.ui.route] || 'mascot-coral';
    return `<div class="page-head"><div class="page-heading"><span class="mascot-peek ${mascotClass}" aria-hidden="true"><img src="../../shared/icons/bg.jpg" alt=""></span><div><h1>${esc(title)}</h1><p class="page-subtitle">${esc(subtitle)}</p></div></div><div class="page-actions">${actions}</div></div>`;
  }

  function allEvidence() {
    return state.activities.flatMap(activity => (activity.evidence || []).map(evidence => ({ activity, evidence })));
  }

  function openTasks() {
    return state.tasks.filter(task => task.status !== 'done');
  }

  function pendingReviews() {
    return state.submissions.filter(submission => submission.status === 'pending' || submission.status === 'clarify');
  }

  function todayActivities() {
    return state.activities.filter(activity => activity.teacher === state.context.teacher && activity.date === state.daily.date && activity.type !== 'lessonprep');
  }

  function activityTrack(type) {
    return (ACTIVITY_TYPES[type] || ACTIVITY_TYPES.tutoring).track || 'supplemental';
  }

  function activityTrackMeta(track) {
    return {
      academic: { label: '學科內｜課業輔導', shortLabel: '學科內必填', icon: 'book-open-check', tone: 'blue', description: '國語、數學、英文、自然、社會等課內學習與作業輔導。' },
      enrichment: { label: '學科外｜當日特色課程', shortLabel: '學科外必填', icon: 'sparkles', tone: 'purple', description: '專案、機器人／STEAM、學習歷程或 SEL 等當日特色課程。' },
      supplemental: { label: '額外工作紀錄', shortLabel: '額外紀錄', icon: 'plus-circle', tone: 'outline', description: '班級經營與教室協作；不能取代每日兩項必填。' },
    }[track] || { label: '額外工作紀錄', shortLabel: '額外紀錄', icon: 'plus-circle', tone: 'outline', description: '' };
  }

  function dailyTrackStatus(activities = todayActivities()) {
    const build = track => {
      const items = activities.filter(activity => activityTrack(activity.type) === track);
      return { items, count: items.length, complete: items.filter(activityComplete).length, covered: items.length > 0 };
    };
    return { academic: build('academic'), enrichment: build('enrichment'), supplemental: build('supplemental') };
  }

  function dailyRequiredTracksReady(activities = todayActivities()) {
    const tracks = dailyTrackStatus(activities);
    return tracks.academic.covered && tracks.enrichment.covered;
  }

  function activityDetailSchema(type) {
    return ACTIVITY_DETAIL_SCHEMAS[type] || ACTIVITY_DETAIL_SCHEMAS.tutoring;
  }

  function activityNeedsPrepSource(type) {
    return PREP_SOURCE_TYPES.includes(type);
  }

  function prepSourceById(id) {
    return state.activities.find(item => item.id === id && item.type === 'lessonprep');
  }

  function prepSourceMatchesType(source, type) {
    return Boolean(source && source.type === 'lessonprep' && source.details?.targetCourse === ACTIVITY_TYPES[type]?.label);
  }

  function availablePrepSources(type) {
    if (!activityNeedsPrepSource(type)) return [];
    return state.activities
      .filter(item => item.teacher === state.context.teacher && prepSourceMatchesType(item, type))
      .sort((a, b) => String(b.updatedAt || b.date).localeCompare(String(a.updatedAt || a.date)));
  }

  function directPlanReady(planId) {
    const plan = planById(planId);
    return Boolean(plan && planReadiness(plan) === 100);
  }

  function prepSourceReadinessIssues(source, executionType, executionDate = state.daily.date) {
    if (!source) return ['尚未選擇備課檔案'];
    const issues = [];
    if (!prepSourceMatchesType(source, executionType)) issues.push('課程類型不相符');
    if (dayDistance(source.date, executionDate) == null || dayDistance(source.date, executionDate) < 0) issues.push('備課檔案建立日不可晚於授課日');
    if (!directPlanReady(source.planId)) issues.push('教案內容或正式教材尚未完整');
    return issues;
  }

  function prepSourceUsable(source, type, executionDate = state.daily.date) {
    return prepSourceReadinessIssues(source, type, executionDate).length === 0;
  }

  function defaultPrepSourceId(type) {
    return availablePrepSources(type).find(source => prepSourceUsable(source, type))?.id || '';
  }

  function effectivePlanId(activity) {
    if (activityNeedsPrepSource(activity.type)) return prepSourceById(activity.prepSourceId)?.planId || activity.planId || '';
    return activity.planId || '';
  }

  function prepFeedbackComplete(activity) {
    if (!activityNeedsPrepSource(activity.type)) return true;
    const feedback = activity.prepFeedback || {};
    return ['strengths', 'resonance', 'changes'].every(key => String(feedback[key] || '').trim().length >= 8);
  }

  function activityDetailsComplete(activity) {
    const details = activity.details || {};
    return activityDetailSchema(activity.type).every(field => String(details[field.key] || '').trim().length >= field.min);
  }

  function crossDayScheduleIssues(activity) {
    return [];
  }

  function prepEvidenceComplete(items) {
    return Boolean((items || []).length) && items.every(item => PREP_EVIDENCE_CATEGORIES[item.category] && String(item.note || '').trim().length >= 8);
  }

  function planById(planId) {
    return state.lessonPlans.find(plan => plan.id === planId);
  }

  function activityPlanReady(activity) {
    const config = ACTIVITY_TYPES[activity.type] || ACTIVITY_TYPES.tutoring;
    if (!config.requiresPlan) return true;
    return directPlanReady(effectivePlanId(activity));
  }

  function activityPreparationReady(activity) {
    if (activity.type === 'lessonprep') {
      return Boolean(activity.title && activity.details?.targetCourse && directPlanReady(activity.planId));
    }
    if (activityNeedsPrepSource(activity.type)) {
      const source = prepSourceById(activity.prepSourceId);
      if (source) return prepSourceUsable(source, activity.type, activity.date) && prepFeedbackComplete(activity);
      const legacyPrep = activity.prep || {};
      return String(legacyPrep.summary || '').length >= 12 && String(legacyPrep.adjustment || '').length >= 8 && prepEvidenceComplete(activity.prepEvidence) && activityPlanReady(activity);
    }
    return true;
  }

  function operationRecords() {
    return [state.operations, ...(state.operationHistory || [])].filter(Boolean);
  }

  function operationRecordById(id) {
    return operationRecords().find(item => item.id === id);
  }

  function operationProofCount(operation) {
    const proof = operation.evidenceByCheck || {};
    return Object.keys(OPERATION_CHECKS).filter(key => proof[key]?.fileName && ['normal', 'exception'].includes(proof[key]?.status)).length;
  }

  function operationExceptionCount(operation) {
    const proof = operation.evidenceByCheck || {};
    return Object.keys(OPERATION_CHECKS).filter(key => proof[key]?.status === 'exception').length;
  }

  function activityComplete(activity) {
    if (activity.type === 'lessonprep') return activityPreparationReady(activity);
    const basic = activity.title && activity.className && String(activity.objective || '').length >= 8 && String(activity.action || '').length >= 8 && String(activity.result || '').length >= 8 && String(activity.nextAction || '').length >= 6 && String(activity.owner || '').trim() && String(activity.dueDate || '').trim();
    if (!basic || !activityDetailsComplete(activity) || crossDayScheduleIssues(activity).length) return false;
    if (!activityPreparationReady(activity)) return false;
    if (!activityPlanReady(activity)) return false;
    const config = ACTIVITY_TYPES[activity.type] || ACTIVITY_TYPES.tutoring;
    if (!config.evidence) return true;
    return (activity.evidence || []).some(evidence => evidence.quality >= 80);
  }

  function activityReadinessChecks(activity) {
    if (activity.type === 'lessonprep') {
      const plan = planById(activity.planId);
      return [
        { key: 'record', label: '備課檔案資料', ready: Boolean(activity.title && activity.details?.targetCourse) },
        { key: 'plan', label: '教案內容', ready: Boolean(plan && planReadiness(plan) === 100) },
        { key: 'materials', label: '教材附件', ready: Boolean((plan?.materials || []).length) },
      ];
    }
    const basic = Boolean(activity.title && activity.className && String(activity.objective || '').length >= 8 && String(activity.action || '').length >= 8 && String(activity.result || '').length >= 8 && String(activity.nextAction || '').length >= 6 && String(activity.owner || '').trim() && String(activity.dueDate || '').trim() && activityDetailsComplete(activity));
    const evidenceReady = (activity.evidence || []).some(item => item.quality >= 80);
    const checks = [{ key: 'record', label: '工作內容', ready: basic }];
    if (activityNeedsPrepSource(activity.type)) {
      checks.push(
        { key: 'source', label: '備課檔案', ready: prepSourceUsable(prepSourceById(activity.prepSourceId), activity.type, activity.date) },
        { key: 'plan', label: '教學設計與教材', ready: activityPlanReady(activity) },
        { key: 'feedback', label: '課後回饋', ready: prepFeedbackComplete(activity) },
      );
    }
    const config = ACTIVITY_TYPES[activity.type] || ACTIVITY_TYPES.tutoring;
    if (config.evidence) checks.push({ key: 'evidence', label: '成果證據', ready: evidenceReady });
    return checks;
  }

  function operationsComplete(operation = state.operations, respectDutyOwner = true) {
    if (respectDutyOwner && operation.dutyOwner !== state.context.teacher) return true;
    const proof = operation.evidenceByCheck || {};
    const items = Object.keys(OPERATION_CHECKS).map(key => proof[key]);
    return Boolean(operation.confirmedAt) && items.every(item => item && item.fileName && ['normal', 'exception'].includes(item.status) && (item.status !== 'exception' || String(item.action || '').trim().length >= 8));
  }

  function todaySectionStatus() {
    const activities = todayActivities();
    return {
      activities: dailyRequiredTracksReady(activities) && activities.every(activityComplete),
      students: state.daily.noStudentFollowupConfirmed || state.studentCases.some(item => item.date === state.daily.date && item.teacher === state.context.teacher),
      parents: state.daily.parentStatus === 'none' || state.contacts.some(item => item.date === state.daily.date && item.teacher === state.context.teacher),
      operations: operationsComplete(),
      submit: Boolean(state.daily.submittedAt),
    };
  }

  function dailyCompletion() {
    const status = todaySectionStatus();
    const readySections = ['activities', 'students', 'parents', 'operations'].filter(key => status[key]).length;
    return Math.round(readySections / 4 * 100);
  }

  function renderGuideInvite() {
    if (state.ui.guidePromptDismissed) return '';
    return `<div class="guide-invite">${icon('book-open-text', 22)}<div><strong>第一次使用，先看填寫指南</strong><small>工作類型、五個欄位、備課教案建檔與證據標準都集中在獨立頁面，正式表單不再重複顯示。</small></div><div class="guide-invite-actions"><button type="button" class="btn btn-small btn-primary" data-action="navigate" data-route="guide">開啟指南</button><button type="button" class="icon-button" data-action="dismiss-guide-prompt" aria-label="略過填寫指南提示" title="略過">${icon('x', 15)}</button></div></div>`;
  }

  function renderTeacherToday() {
    const activities = todayActivities();
    const tracks = dailyTrackStatus(activities);
    const evidenceCount = activities.reduce((sum, activity) => sum + (activity.evidence || []).length, 0);
    const evidenceReady = activities.reduce((sum, activity) => sum + (activity.evidence || []).filter(item => item.quality >= 80).length, 0);
    const prepRequired = activities.filter(activity => activityNeedsPrepSource(activity.type));
    const prepReady = prepRequired.filter(activityPreparationReady).length;
    const completion = dailyCompletion();
    const tabStatus = todaySectionStatus();
    const actions = `<button type="button" class="btn" data-action="open-student-case">${icon('user-round-plus', 16)}<span class="btn-label-mobile-hide">快速記學生</span></button><button type="button" class="btn" data-action="open-activity" data-type="lessonprep">${icon('notebook-tabs', 16)}<span class="btn-label-mobile-hide">新增備課檔案</span></button><button type="button" class="btn btn-primary" data-action="open-activity">${icon('plus', 17)}<span class="btn-label-mobile-hide">新增工作紀錄</span></button>`;
    return `<div class="page">
      ${pageHead('今日工作紀錄', `${formatDate(state.daily.date)} · ${state.context.department} · ${state.context.teacher}`, actions)}
      ${renderGuideInvite()}
      <div class="status-strip">
        <div class="status-cell"><div class="status-label">今日完成度</div><div class="status-value">${completion}%</div><div class="status-note">${state.daily.status === 'submitted' ? '已正式送出' : '草稿持續自動儲存'}</div></div>
        <div class="status-cell"><div class="status-label">每日兩項必填</div><div class="status-value">${Number(tracks.academic.covered) + Number(tracks.enrichment.covered)}/2</div><div class="status-note">學科內 ${tracks.academic.count} 筆 · 學科外 ${tracks.enrichment.count} 筆</div></div>
        <div class="status-cell"><div class="status-label">備課檔案已連結</div><div class="status-value">${prepReady}/${prepRequired.length}</div><div class="status-note">成果證據 ${evidenceReady}/${evidenceCount} 份可判讀</div></div>
        <div class="status-cell"><div class="status-label">待追蹤</div><div class="status-value">${openTasks().length}</div><div class="status-note">${openTasks().filter(item => item.priority === 'high').length} 項優先</div></div>
      </div>
      <div class="workflow-tabs" role="tablist" aria-label="今日紀錄步驟">
        ${TODAY_TABS.map((tab, index) => `<button type="button" role="tab" aria-selected="${state.ui.todayTab === tab.key}" class="workflow-tab ${state.ui.todayTab === tab.key ? 'active' : ''} ${tabStatus[tab.key] ? 'complete' : ''}" data-action="today-tab" data-tab="${tab.key}"><span class="step-dot">${tabStatus[tab.key] ? icon('check', 13) : index + 1}</span><span>${esc(tab.label)}</span></button>`).join('')}
      </div>
      ${renderTodayTab()}
    </div>`;
  }

  function renderTodayTab() {
    switch (state.ui.todayTab) {
      case 'students': return renderTodayStudents();
      case 'parents': return renderTodayParents();
      case 'operations': return renderTodayOperations();
      case 'submit': return renderTodaySubmit();
      default: return renderTodayActivities();
    }
  }

  function renderTodayActivities() {
    const activities = todayActivities();
    const tracks = dailyTrackStatus(activities);
    const ready = activities.filter(activityComplete).length;
    return `<div class="content-grid">
      <section class="panel">
        <div class="panel-head"><div><div class="panel-title">${icon('clipboard-list')}工作紀錄</div><div class="panel-subtitle">每日固定 1 筆學科內、1 筆學科外；目前 ${ready}/${activities.length || 0} 筆資料完整</div></div><button type="button" class="btn btn-small" data-action="open-activity">${icon('plus', 15)}新增</button></div>
        <div class="panel-body">
          <div class="daily-track-requirements">${['academic', 'enrichment'].map(track => {
            const meta = activityTrackMeta(track);
            const status = tracks[track];
            const fullyComplete = status.covered && status.complete === status.count;
            return `<article class="daily-track-row ${status.covered ? 'is-covered' : ''} ${fullyComplete ? 'is-complete' : ''}"><span class="daily-track-icon">${icon(meta.icon, 20)}</span><div><strong>${esc(meta.label)}</strong><small>${esc(meta.description)}</small><div class="daily-track-progress">${status.count ? `${status.complete}/${status.count} 筆完整` : '尚未新增，今日紀錄無法送出'}</div></div><button type="button" class="btn btn-small ${status.covered ? '' : 'btn-primary'}" data-action="open-activity" data-track="${track}">${icon(status.covered ? 'plus' : 'plus-circle', 14)}${status.covered ? '再記一筆' : '新增必填'}</button></article>`;
          }).join('')}</div>
          ${tracks.supplemental.count ? `<div class="supplemental-summary">${icon('layers-3', 15)}另有 ${tracks.supplemental.count} 筆班級經營或教室協作紀錄；這些不取代每日兩項必填。</div>` : ''}
          <div class="section-divider"></div>
          ${activities.length ? `<div class="activity-list">${activities.map(renderActivityRow).join('')}</div>` : renderEmpty('clipboard-plus', '尚無工作紀錄', '請先完成學科內課業輔導與學科外特色課程各一筆。', '新增學科內紀錄', 'open-activity')}
        </div>
      </section>
      <aside class="stack">
        ${renderDailySummaryPanel()}
        ${renderEvidenceStandardPanel()}
      </aside>
    </div>`;
  }

  function renderActivityRow(activity) {
    const config = ACTIVITY_TYPES[activity.type] || ACTIVITY_TYPES.tutoring;
    const evidence = activity.evidence || [];
    const prepSource = prepSourceById(activity.prepSourceId);
    const prepEvidence = activityNeedsPrepSource(activity.type) && prepSource ? prepSource.prepEvidence || [] : activity.prepEvidence || [];
    const plan = planById(effectivePlanId(activity));
    const track = activityTrackMeta(activityTrack(activity.type));
    const isCrossDay = activity.type === 'lessonprep';
    const detailSummary = activityDetailSchema(activity.type).slice(0, 2).map(field => {
      const value = activity.details?.[field.key];
      return `<span><strong>${esc(field.label)}：</strong>${field.control === 'date' ? formatDate(value) : esc(value || '尚未填寫')}</span>`;
    }).join('');
    const complete = activityComplete(activity);
    const readiness = activityReadinessChecks(activity);
    const missing = readiness.filter(item => !item.ready);
    const readyCount = readiness.length - missing.length;
    const isCalm = currentVisualTheme() === 'calm';
    const evidenceAction = evidence.length ? 'open-evidence' : 'new-evidence';
    const evidenceActionLabel = evidence.length ? '查看證據' : (isCrossDay ? '上傳本日產出' : '上傳成果');
    const completionLabel = complete ? '資料完整' : missing.length === 1 ? `缺${missing[0].label}` : `缺 ${missing.length} 項`;
    const titleBadges = isCalm
      ? `<span class="badge ${complete ? 'green' : 'red'}">${esc(completionLabel)}</span>${activity.isSample ? `<span class="badge outline">${icon('sparkles', 12)}完整範例</span>` : ''}`
      : `<span class="badge ${complete ? 'green' : 'red'}">${esc(completionLabel)}</span>${activity.isSample ? `<span class="badge blue">${icon('sparkles', 12)}完整填寫範例</span>` : ''}<span class="badge ${track.tone}">${esc(track.shortLabel)}</span><span class="badge outline">${esc(config.kpi)}</span>`;
    const readinessMarkup = isCalm
      ? `<div class="activity-readiness-summary ${missing.length ? 'has-missing' : 'is-complete'}">${icon(missing.length ? 'circle-alert' : 'circle-check', 14)}<strong>${readyCount}/${readiness.length} 完成</strong><span>${missing.length ? `待補：${esc(missing.map(item => item.label).join('、'))}` : '必填資料均已完成'}</span></div>`
      : `<div class="activity-readiness" aria-label="資料完成條件">${readiness.map(item => `<span class="${item.ready ? 'is-ready' : 'is-missing'}">${icon(item.ready ? 'check' : 'circle-alert', 12)}${esc(item.label)}</span>`).join('')}</div>`;
    const supportingBadges = isCalm
      ? `${config.requiresPlan ? `<span class="badge ${activityPlanReady(activity) ? 'green' : 'red'}">${icon('notebook-tabs', 12)}${plan ? `教案 ${planReadiness(plan)}%` : '缺備課檔案'}</span>` : ''}<span class="badge ${evidence.some(item => item.quality >= 80) ? 'blue' : 'red'}">${icon('scan-line', 12)}成果 ${evidence.length} 份</span>${activity.nextAction ? `<span class="badge outline">${icon('calendar-clock', 12)}${formatShortDate(activity.dueDate)} 追蹤</span>` : ''}`
      : `${config.requiresPlan ? `<span class="badge ${activityPlanReady(activity) ? 'green' : 'red'}">${icon('notebook-tabs', 12)}${plan ? `教案 ${planReadiness(plan)}%` : '缺備課檔案'}</span>` : ''}${activityNeedsPrepSource(activity.type) ? `<span class="badge ${prepSourceUsable(prepSource, activity.type, activity.date) ? 'green' : 'red'}">${icon('package-check', 12)}${prepSource ? '已連結備課檔案' : '缺備課檔案'}</span>` : ''}<span class="badge ${evidence.some(item => item.quality >= 80) ? 'blue' : 'red'}">${icon('scan-line', 12)}成果 ${evidence.length} 份</span>${activity.nextAction ? `<span class="badge outline">${icon('calendar-clock', 12)}${formatShortDate(activity.dueDate)} 追蹤</span>` : ''}`;
    return `<article class="activity-row">
      <div class="activity-icon ${config.tone}">${icon(config.icon, 20)}</div>
      <div class="activity-main">
        <div class="activity-title-row"><button type="button" class="activity-title activity-title-link" data-action="view-activity" data-activity-id="${activity.id}">${esc(activity.title)}</button>${titleBadges}</div>
        <div class="activity-meta">${esc(config.label)} · ${esc(activity.className || '未指定班級')} · ${isCrossDay ? `預計 ${formatDate(activity.details?.useDate)} 使用` : (activity.students || []).length ? `${activity.students.length} 位學生` : '全班'}</div>
        <div class="activity-glance"><strong>${isCrossDay ? '本日進度' : '今日成果'}</strong><span>${esc(truncate(activity.result || '尚未填寫', 100))}</span></div>
        ${missing.length ? `<div class="activity-missing activity-missing-compact">${icon('triangle-alert', 14)}<strong>待補：</strong>${esc(missing.map(item => item.label).join('、'))}</div>` : ''}
        <div class="activity-quick-meta"><span class="badge ${evidence.some(item => item.quality >= 80) ? 'blue' : 'red'}">${icon('scan-line', 12)}${isCrossDay ? '本日產出' : '成果'} ${evidence.length} 份</span>${activity.nextAction ? `<span class="badge outline">${icon('calendar-clock', 12)}${formatShortDate(activity.dueDate)} ${isCrossDay ? '下一步' : '追蹤'}</span>` : ''}</div>
        <details class="activity-record-details"><summary>${icon('list-tree', 14)}<span>展開完整紀錄</span>${icon('chevron-down', 14)}</summary><div class="activity-record-details-body"><div class="activity-detail-summary">${detailSummary}</div>${activityNeedsPrepSource(activity.type) ? `<div class="activity-prep-line"><strong>採用備課檔案：</strong>${esc(prepSource ? `${prepSource.title} · ${formatDate(prepSource.date)} 建立` : '尚未連結備課檔案')}</div>` : ''}<div class="activity-outcome"><strong>完整可觀察結果：</strong>${esc(activity.result || '尚未填寫')}</div>${readinessMarkup}<div class="flex flex-wrap gap-6 mt-8">${supportingBadges}</div></div></details>
      </div>
      <div class="activity-actions">
        <button type="button" class="btn btn-small" data-action="view-activity" data-activity-id="${activity.id}">${icon('eye', 14)}查看</button>
        ${plan ? `<button type="button" class="btn btn-small" data-action="view-plan" data-plan-id="${plan.id}">${icon('notebook-tabs', 14)}教案</button>` : ''}
        <button type="button" class="btn btn-small ${evidence.length ? '' : 'btn-primary'}" data-action="${evidenceAction}" data-activity-id="${activity.id}">${icon(evidence.length ? 'scan-search' : 'camera', 14)}${esc(evidenceActionLabel)}</button>
        <button type="button" class="icon-button" data-action="edit-activity" data-activity-id="${activity.id}" aria-label="編輯工作紀錄" title="編輯工作紀錄">${icon('pencil', 16)}</button>
      </div>
    </article>`;
  }

  function renderEmpty(iconName, title, copy, buttonLabel, action) {
    return `<div class="empty-state"><div><span class="empty-crew" aria-hidden="true"><img src="../../shared/icons/bg.jpg" alt=""></span><div class="empty-icon">${icon(iconName, 23)}</div><div class="empty-title">${esc(title)}</div><div class="empty-copy">${esc(copy)}</div>${action ? `<button type="button" class="btn" data-action="${action}">${icon('plus', 15)}${esc(buttonLabel)}</button>` : ''}</div></div>`;
  }

  function buildDailySummary() {
    const activities = todayActivities();
    const outcomes = activities.filter(item => item.result).map(item => `${item.title}：${item.result}`);
    const issues = activities.filter(item => item.issue).map(item => `${item.title}：${item.issue}`);
    const cases = state.studentCases
      .filter(item => item.teacher === state.context.teacher && item.status !== 'closed')
      .sort((a, b) => String(a.dueDate || '').localeCompare(String(b.dueDate || '')));
    const actions = openTasks()
      .filter(item => item.owner === state.context.teacher)
      .sort((a, b) => String(a.dueDate || '').localeCompare(String(b.dueDate || '')));
    const caseSummaries = cases.slice(0, 3).map(item => `${item.student}：${item.nextAction || item.observation}`);
    return {
      keyResult: outcomes.length ? outcomes.join('；') : activities.length ? `今日已有 ${activities.length} 筆工作紀錄，尚無可彙整的完成結果。` : '今日尚未新增工作紀錄。',
      followup: [...caseSummaries, ...issues].slice(0, 4).join('；') || '目前沒有需要持續追蹤的事項。',
      tomorrowPriority: actions.slice(0, 3).map(item => `${formatShortDate(item.dueDate)} ${item.title}`).join('；') || '目前沒有未完成的追蹤事項。',
    };
  }

  function renderDailySummaryPanel() {
    const summary = buildDailySummary();
    return `<section class="panel">
      <div class="panel-head"><div><div class="panel-title">${icon('sparkles')}系統今日摘要</div><div class="panel-subtitle">依結構化紀錄即時彙整</div></div></div>
      <div class="panel-body">
        <div class="summary-list">
          <div class="summary-line"><span class="summary-index">1</span><div><div class="summary-title">今日成果</div><div class="summary-copy">${esc(truncate(summary.keyResult, 140))}</div></div></div>
          <div class="summary-line"><span class="summary-index">2</span><div><div class="summary-title">持續追蹤</div><div class="summary-copy">${esc(truncate(summary.followup, 120))}</div></div></div>
          <div class="summary-line"><span class="summary-index">3</span><div><div class="summary-title">最近待辦</div><div class="summary-copy">${esc(truncate(summary.tomorrowPriority, 120))}</div></div></div>
        </div>
      </div>
    </section>`;
  }

  function renderEvidenceStandardsControl(context = 'today', expanded = !state.ui.evidenceStandardsSeen) {
    const bodyId = `evidence-standards-${context}-body`;
    const subtitle = state.ui.evidenceStandardsSeen
      ? '需要時再展開，不會影響目前填寫內容'
      : '第一次完整顯示；完成第一份成果證據後會預設收合';
    return `<section class="panel evidence-standards-panel ${expanded ? 'is-expanded' : 'is-collapsed'}" data-evidence-standards="${esc(context)}">
      <div class="panel-head">
        <div><div class="panel-title">${icon('badge-check')}課程與工作證據標準</div><div class="panel-subtitle">${subtitle}</div></div>
        <button type="button" class="btn btn-small evidence-standards-toggle" data-action="toggle-evidence-standards" data-context="${esc(context)}" aria-expanded="${expanded}" aria-controls="${bodyId}">${icon(expanded ? 'eye-off' : 'eye', 15)}${expanded ? '隱藏證據標準' : '查看證據標準'}</button>
      </div>
      <div id="${bodyId}" class="panel-body" ${expanded ? '' : 'hidden'}>
        <div class="check-list evidence-standard-list">
          <div class="check-item done"><span class="check-icon">${icon('check', 12)}</span><span>授課前：選擇教案內容與教材已完整的備課檔案</span></div>
          <div class="check-item done"><span class="check-icon">${icon('check', 12)}</span><span>班級經營、教室協作：不要求教案或備課附件</span></div>
          <div class="check-item done"><span class="check-icon">${icon('check', 12)}</span><span>成果證據：直接對應本次目標與實際結果</span></div>
          <div class="check-item done"><span class="check-icon">${icon('check', 12)}</span><span>指出主管應查看的具體位置或差異</span></div>
          <div class="check-item done"><span class="check-icon">${icon('check', 12)}</span><span>完成隱私確認，避免無關個資</span></div>
        </div>
      </div>
    </section>`;
  }

  function renderEvidenceStandardPanel() {
    return renderEvidenceStandardsControl('today');
  }

  function renderTodayStudents() {
    const cases = state.studentCases.filter(item => item.date === state.daily.date && item.teacher === state.context.teacher);
    return `<div class="content-grid">
      <section class="panel">
        <div class="panel-head"><div><div class="panel-title">${icon('user-round-search')}學生追蹤</div><div class="panel-subtitle">只記錄需要介入、追蹤或有明確變化的學生</div></div><button type="button" class="btn btn-small" data-action="open-student-case">${icon('plus', 15)}新增</button></div>
        <div class="panel-body">
          ${cases.length ? `<div class="activity-list">${cases.map(renderStudentCaseRow).join('')}</div>` : renderEmpty('user-check', '今天沒有追蹤紀錄', '若全班狀況穩定，可直接確認今日無需個別追蹤。', '新增學生追蹤', 'open-student-case')}
          <div class="section-divider"></div>
          <label class="choice-chip"><input type="checkbox" data-change="confirm-no-student" ${state.daily.noStudentFollowupConfirmed ? 'checked' : ''}>${icon('circle-check', 15)}今日無需個別追蹤</label>
        </div>
      </section>
      <aside class="stack">
        <section class="panel"><div class="panel-head"><div><div class="panel-title">${icon('route')}追蹤閉環</div></div></div><div class="panel-body"><div class="check-list">
          <div class="check-item done"><span class="check-icon">${icon('check', 12)}</span><span>具體觀察：發生什麼、在哪種情境</span></div>
          <div class="check-item done"><span class="check-icon">${icon('check', 12)}</span><span>老師介入：實際採取的方法</span></div>
          <div class="check-item done"><span class="check-icon">${icon('check', 12)}</span><span>可觀察結果：學生反應或差異</span></div>
          <div class="check-item done"><span class="check-icon">${icon('check', 12)}</span><span>下一步、負責人與追蹤日期</span></div>
        </div></div></section>
        ${renderOpenCaseSummary()}
      </aside>
    </div>`;
  }

  function renderStudentCaseRow(item) {
    const urgency = item.urgency === 'high' ? ['高優先', 'red'] : item.urgency === 'medium' ? ['持續追蹤', 'yellow'] : ['一般', 'blue'];
    const category = { learning: '學習', behavior: '行為／情緒', attendance: '出席', peer: '同儕互動', health: '健康' }[item.category] || item.category;
    return `<article class="activity-row">
      <div class="activity-icon classroom">${icon('user-round', 20)}</div>
      <div class="activity-main">
        <div class="activity-title-row"><span class="activity-title">${esc(item.student)}</span><span class="badge ${urgency[1]}">${urgency[0]}</span><span class="badge outline">${esc(category)}</span></div>
        <div class="activity-outcome"><strong>觀察：</strong>${esc(item.observation)}</div>
        <div class="activity-meta">下次追蹤 ${formatDate(item.dueDate)} · ${item.parentContacted ? '已同步家長' : '尚未同步家長'}</div>
      </div>
      <div class="activity-actions">${feedbackThreadMessages(feedbackThreadKey('case', item.id)).length ? `<button type="button" class="icon-button" data-action="open-case-detail" data-case-id="${item.id}" aria-label="查看主管對話" title="主管對話">${icon('messages-square', 16)}</button>` : ''}<button type="button" class="icon-button" data-action="edit-student-case" data-case-id="${item.id}" aria-label="編輯學生追蹤" title="編輯學生追蹤">${icon('pencil', 16)}</button></div>
    </article>`;
  }

  function renderOpenCaseSummary() {
    const cases = state.studentCases.filter(item => item.teacher === state.context.teacher && item.status !== 'closed');
    return `<section class="panel"><div class="panel-head"><div><div class="panel-title">${icon('radar')}跨日追蹤</div><div class="panel-subtitle">${cases.length} 件尚未結案</div></div></div><div class="panel-body">${cases.length ? `<div class="risk-list">${cases.slice(0, 4).map(item => `<div class="risk-row"><span class="risk-level ${item.urgency === 'high' ? 'high' : item.urgency === 'low' ? 'low' : ''}"></span><div><div class="risk-title">${esc(item.student)}</div><div class="risk-meta">${esc(truncate(item.nextAction, 48))}</div></div><span class="badge outline">${formatShortDate(item.dueDate)}</span></div>`).join('')}</div>` : '<div class="muted text-small">目前沒有未結案追蹤</div>'}</div></section>`;
  }

  function renderTodayParents() {
    const contacts = state.contacts.filter(item => item.date === state.daily.date && item.teacher === state.context.teacher);
    return `<div class="content-grid">
      <section class="panel">
        <div class="panel-head"><div><div class="panel-title">${icon('messages-square')}親師溝通</div><div class="panel-subtitle">記錄共識、承諾與後續追蹤</div></div><button type="button" class="btn btn-small" data-action="open-contact">${icon('plus', 15)}新增</button></div>
        <div class="panel-body">
          <div class="segmented" aria-label="今日親師聯繫狀態">
            <button type="button" class="${state.daily.parentStatus === 'recorded' ? 'active' : ''}" data-action="set-parent-status" data-status="recorded">有聯繫</button>
            <button type="button" class="${state.daily.parentStatus === 'none' ? 'active' : ''}" data-action="set-parent-status" data-status="none">今日無聯繫</button>
          </div>
          <div class="section-divider"></div>
          ${contacts.length ? `<div class="activity-list">${contacts.map(renderContactRow).join('')}</div>` : renderEmpty('message-circle-off', '尚無親師溝通紀錄', state.daily.parentStatus === 'none' ? '已確認今日無家長聯繫。' : '有聯繫時，記錄溝通結論與下一步。', '新增溝通紀錄', 'open-contact')}
        </div>
      </section>
      <aside class="stack">
        <section class="panel"><div class="panel-head"><div><div class="panel-title">${icon('shield-check')}有效紀錄</div></div></div><div class="panel-body"><div class="check-list">
          <div class="check-item done"><span class="check-icon">${icon('check', 12)}</span><span>對應學生與溝通主題</span></div>
          <div class="check-item done"><span class="check-icon">${icon('check', 12)}</span><span>只保留必要摘要，不寫情緒性評語</span></div>
          <div class="check-item done"><span class="check-icon">${icon('check', 12)}</span><span>明確記錄雙方共識或承諾</span></div>
          <div class="check-item done"><span class="check-icon">${icon('check', 12)}</span><span>需要追蹤時建立日期與負責人</span></div>
        </div></div></section>
      </aside>
    </div>`;
  }

  function renderContactRow(item) {
    return `<article class="activity-row">
      <div class="activity-icon">${icon('message-circle', 20)}</div>
      <div class="activity-main">
        <div class="activity-title-row"><span class="activity-title">${esc(item.student)}｜${esc(item.topic)}</span><span class="badge blue">${esc(item.channel)}</span><span class="badge ${item.status === 'closed' ? 'green' : 'yellow'}">${item.status === 'closed' ? '已結案' : '待追蹤'}</span></div>
        <div class="activity-outcome"><strong>共識／承諾：</strong>${esc(item.decision)}</div>
        <div class="activity-meta">${item.nextAction ? `${esc(item.nextAction)} · ${formatDate(item.dueDate)}` : '無後續事項'}</div>
      </div>
      <div class="activity-actions"><button type="button" class="icon-button" data-action="edit-contact" data-contact-id="${item.id}" aria-label="編輯親師溝通" title="編輯親師溝通">${icon('pencil', 16)}</button></div>
    </article>`;
  }

  function renderOperationPhoto(item, key, label) {
    return `<div id="operation-preview-${key}" class="operation-photo-preview ${item.dataUrl ? 'has-image' : ''}">${item.dataUrl ? `<img src="${item.dataUrl}" alt="${esc(label)}證據預覽">` : `<span>${icon(item.fileName ? 'image' : 'camera', 28)}</span>`}<div><strong id="operation-photo-name-${key}">${esc(item.fileName || `加入${label}照片`)}</strong><small>${item.fileName ? `${esc(item.size || '已加入')} · 點照片可更換` : '拍清楚指定範圍，不用另寫照片說明'}</small></div></div>`;
  }

  function renderTodayOperations() {
    const operation = state.operations;
    const isDutyOwner = operation.dutyOwner === state.context.teacher;
    const proof = operation.evidenceByCheck || {};
    const proofCount = operationProofCount(operation);
    const exceptionCount = operationExceptionCount(operation);
    const review = operationReviewStatus(operation.reviewStatus);
    const operationThreadKey = feedbackThreadKey('operation', operation.id);
    const operationHasConversation = feedbackThreadMessages(operationThreadKey).length > 0;
    return `<div class="content-grid">
      <section class="panel">
        <div class="panel-head"><div><div class="panel-title">${icon('school')}班務與環境逐項檢核</div><div class="panel-subtitle">${esc(operation.room)} · 今日值日 ${esc(operation.dutyOwner)} · 4 個面向各自留證</div></div><div class="flex gap-6 flex-wrap">${isDutyOwner ? statusBadge('今日負責', 'yellow') : statusBadge('非今日值日', 'green')}${operation.confirmedAt ? statusBadge(review[0], review[1]) : statusBadge('尚未確認', 'outline')}</div></div>
        <div class="panel-body">
          ${operationHasConversation ? renderFeedbackThread(operationThreadKey, { inline: true }) : ''}
          ${!isDutyOwner ? `<div class="notice-band success">${icon('circle-check', 19)}<div><div class="notice-title">今日由 ${esc(operation.dutyOwner)} 統一檢核</div><div class="notice-copy">非值日老師不必重複上傳；發現異常請通知值日老師，讓異常、處理與交接留在同一筆紀錄。</div></div></div>` : `<div class="notice-band info">${icon('camera', 19)}<div><div class="notice-title">四個項目各拍一張，再選正常或異常</div><div class="notice-copy">正常不必寫說明；只有異常才需要補上狀況、已處理內容與後續安排。</div></div></div>`}
          <form id="operations-form" data-form="operations">
            <div class="operation-proof-list mt-16">
              ${Object.entries(OPERATION_CHECKS).map(([key, config], index) => {
                const item = { status: operation.checks?.[key] === false ? 'exception' : 'normal', action: '', ...(proof[key] || {}) };
                const isException = item.status === 'exception';
                return `<article class="operation-proof-item ${item.fileName ? 'has-proof' : ''} ${isException ? 'is-exception' : ''}" data-operation-item="${key}"><div class="operation-proof-head"><span class="operation-proof-index">${index + 1}</span><div><strong>${esc(config.label)}</strong><small>${esc(config.focus)}</small></div><span id="operation-proof-badge-${key}" class="badge ${item.fileName ? 'green' : 'red'}">${item.fileName ? '已附照片' : '缺照片'}</span></div><div class="operation-proof-fields"><div><label class="operation-photo-control" for="operation-photo-${key}">${renderOperationPhoto(item, key, config.label)}</label><input class="sr-only" id="operation-photo-${key}" type="file" accept="image/*" data-change="operation-photo" data-check-key="${key}" ${!isDutyOwner ? 'disabled' : ''}></div><div class="operation-proof-decision"><div class="form-label">本項結果 <span class="required">*</span></div><div class="segmented compact"><label><input type="radio" name="status_${key}" value="normal" data-change="operation-status" data-check-key="${key}" ${!isException ? 'checked' : ''} ${!isDutyOwner ? 'disabled' : ''} required>正常</label><label><input type="radio" name="status_${key}" value="exception" data-change="operation-status" data-check-key="${key}" ${isException ? 'checked' : ''} ${!isDutyOwner ? 'disabled' : ''} required>異常</label></div><div class="form-field operation-action-field" ${isException ? '' : 'hidden'}><label class="form-label" for="operation-action-${key}">異常狀況與處理安排 <span class="required">*</span></label><textarea id="operation-action-${key}" name="action_${key}" minlength="8" placeholder="例：右側白板筆缺兩盒；已標示缺件，交由美萱明日補齊。" ${!isDutyOwner ? 'disabled' : ''} ${isException ? 'required' : ''}>${esc(item.action || '')}</textarea></div></div></div></article>`;
              }).join('')}
            </div>
            <div class="flex gap-8 mt-16"><button type="submit" class="btn btn-primary" ${!isDutyOwner ? 'disabled' : ''}>${icon('check-check', 16)}確認四項班務並送主管稽核</button></div>
          </form>
        </div>
      </section>
      <aside class="stack">
        <section class="panel"><div class="panel-head"><div><div class="panel-title">${icon('camera')}拍照原則</div><div class="panel-subtitle">畫面清楚即可，不需重複寫說明</div></div></div><div class="panel-body"><div class="check-list">
          <div class="check-item done"><span class="check-icon">${icon('check', 12)}</span><span>桌面動線、教具、垃圾回收、廁所洗手區各有專屬近照</span></div>
          <div class="check-item done"><span class="check-icon">${icon('check', 12)}</span><span>正常與異常都留證，不能只在出問題時拍照</span></div>
          <div class="check-item done"><span class="check-icon">${icon('check', 12)}</span><span>正常只需照片；異常才補狀況與後續處理</span></div>
          <div class="check-item done"><span class="check-icon">${icon('check', 12)}</span><span>系統比對檔名與影像指紋，防止同一張照片跨項共用</span></div>
        </div></div></section>
        <section class="panel"><div class="panel-head"><div><div class="panel-title">${icon('clipboard-check')}目前狀態</div></div></div><div class="panel-body"><div class="metric-row"><span class="metric-value">${proofCount}/4 已附照片</span><div class="progress-track"><div class="progress-fill ${proofCount < 4 ? 'warn' : ''}" style="width:${proofCount / 4 * 100}%"></div></div></div><div class="operation-metrics mt-12"><div><strong>${4 - exceptionCount}</strong><small>正常</small></div><div class="${exceptionCount ? 'danger' : ''}"><strong>${exceptionCount}</strong><small>異常</small></div><div><strong>${operation.confirmedAt ? review[0] : '未送出'}</strong><small>主管狀態</small></div></div><div class="text-small muted mt-8">${operation.confirmedAt && operationsComplete() ? `已於 ${formatTime(operation.confirmedAt)} 完成檢核` : '四個面向都有照片與判定；異常另補處理安排後即可確認'}</div></div></section>
      </aside>
    </div>`;
  }

  function renderTodaySubmit() {
    const completion = dailyCompletion();
    const status = todaySectionStatus();
    const tracks = dailyTrackStatus();
    const summary = buildDailySummary();
    const blockers = [];
    if (!tracks.academic.covered) blockers.push('新增至少 1 筆「學科內｜課業輔導」紀錄');
    if (!tracks.enrichment.covered) blockers.push('新增至少 1 筆「學科外｜當日特色課程」紀錄');
    if (dailyRequiredTracksReady() && !status.activities) blockers.push('課程需選擇內容完整的備課檔案並完成課後回饋；班級經營與協作只需工作欄位及可判讀成果證據');
    if (!status.students) blockers.push('新增學生追蹤，或確認今日無需個別追蹤');
    if (!status.parents) blockers.push('新增親師溝通，或確認今日無聯繫');
    if (!status.operations) blockers.push('今日值日班務尚未確認');
    return `<div class="content-grid wide-aside">
      <section class="panel">
        <div class="panel-head"><div><div class="panel-title">${icon('send')}確認並送出</div><div class="panel-subtitle">系統直接彙整今天已填資料，老師不用再寫一次</div></div><span class="badge ${completion === 100 ? 'green' : 'yellow'}">完成度 ${completion}%</span></div>
        <div class="panel-body">
          ${state.daily.submittedAt ? `<div class="notice-band success">${icon('circle-check', 19)}<div><div class="notice-title">已於 ${formatTime(state.daily.submittedAt)} 送出</div><div class="notice-copy">修改後需重新送出，主管才會看到最新版本。</div></div></div>` : ''}
          <form id="daily-summary-form" data-form="daily-summary">
            <div class="notice-band info">${icon('wand-sparkles', 19)}<div><div class="notice-title">以下內容由系統產生</div><div class="notice-copy">摘要保留原文事實，主管可再開啟每筆工作、學生追蹤與證據查看來源。</div></div></div>
            <div class="summary-list mt-16">
              <div class="summary-line"><span class="summary-index">1</span><div><div class="summary-title">今日成果</div><div class="summary-copy">${esc(summary.keyResult)}</div></div></div>
              <div class="summary-line"><span class="summary-index">2</span><div><div class="summary-title">需持續追蹤</div><div class="summary-copy">${esc(summary.followup)}</div></div></div>
              <div class="summary-line"><span class="summary-index">3</span><div><div class="summary-title">最近待辦</div><div class="summary-copy">${esc(summary.tomorrowPriority)}</div></div></div>
            </div>
            <div class="form-field mt-16"><label class="form-label" for="summary-teacher-note">給主管補充</label><textarea id="summary-teacher-note" name="teacherNote" placeholder="只有系統紀錄看不出的背景或需要主管決定的事才填；沒有可留白。">${esc(state.daily.summary.teacherNote || '')}</textarea><div class="field-hint">非必填，輸入內容會自動暫存。</div></div>
            <div class="flex gap-8 mt-16"><button type="button" class="btn btn-primary" data-action="submit-daily" ${blockers.length ? 'disabled' : ''}>${icon(state.daily.submittedAt ? 'refresh-cw' : 'send', 16)}${state.daily.submittedAt ? '更新送出' : '確認送出'}</button></div>
          </form>
        </div>
      </section>
      <aside class="stack">
        <section class="panel"><div class="panel-head"><div><div class="panel-title">${icon('list-checks')}送出檢查</div></div></div><div class="panel-body"><div class="check-list">
          ${[['activities', '工作紀錄與證據'], ['students', '學生追蹤狀態'], ['parents', '親師聯繫狀態'], ['operations', '值日班務']].map(([key, label]) => {
            const done = status[key];
            return `<div class="check-item ${done ? 'done' : 'pending'}"><span class="check-icon">${icon(done ? 'check' : 'minus', 12)}</span><span>${label}</span></div>`;
          }).join('')}
        </div></div></section>
        ${blockers.length ? `<section class="panel"><div class="panel-head"><div><div class="panel-title">${icon('circle-alert')}尚待完成</div></div></div><div class="panel-body"><div class="risk-list">${blockers.map(item => `<div class="risk-row"><span class="risk-level"></span><div><div class="risk-title">${esc(item)}</div></div></div>`).join('')}</div></div></section>` : `<div class="notice-band success">${icon('badge-check', 20)}<div><div class="notice-title">資料已符合送出條件</div><div class="notice-copy">主管可從摘要追到每一筆原始紀錄與證據。</div></div></div>`}
      </aside>
    </div>`;
  }

  function activityGuide(type) {
    return ACTIVITY_GUIDES[type] || ACTIVITY_GUIDES.tutoring;
  }

  function renderActivityTypeExamples(type) {
    const guide = activityGuide(type);
    return `<div class="activity-example-head"><span class="activity-icon ${ACTIVITY_TYPES[type]?.tone || ''}">${icon(ACTIVITY_TYPES[type]?.icon || 'clipboard-list', 18)}</span><div><strong>${esc(ACTIVITY_TYPES[type]?.label || '工作紀錄')}怎麼寫</strong><small>各欄位目的不同，不需要重複同一句話</small></div></div><div class="activity-example-grid">${[['目標', guide.objective[2]], ['做法', guide.action[2]], ['結果', guide.result[2]], ['問題', guide.issue[2]], ['下一步', guide.next[2]]].map(([label, example]) => `<div><span>${label}</span><p>${esc(example)}</p></div>`).join('')}</div>`;
  }

  function renderTeacherGuide() {
    const selectedType = ACTIVITY_TYPES[state.ui.guideType] && state.ui.guideType !== 'lessonprep' ? state.ui.guideType : 'tutoring';
    const config = ACTIVITY_TYPES[selectedType];
    const guide = activityGuide(selectedType);
    const purpose = {
      tutoring: '記錄國語、數學、英文、自然、社會等學科內課業指導與個別補救。',
      project: '記錄專案任務、選修活動、老師的引導方法與學生每堂課的實際進度。',
      robotics: '記錄核心原理、講解方式、程式引導、遊戲或改造設計，以及學生的測試結果。',
      portfolio: '記錄作品版本、反思與學生學習變化。',
      sel: '記錄社會情緒能力、演練與可觀察行為，不做人格判斷。',
      classroom: '記錄秩序、流程、合作與自主管理的具體改變。',
      support: '記錄支援對象、責任邊界、交付內容與接手結果。',
    }[selectedType];
    const fieldExamples = [guide.objective, guide.action, guide.result, guide.issue, guide.next];
    const dailySteps = [
      ['1', '學科內課業輔導', '每天至少一筆，寫出題目範圍、學生原本會什麼及實際完成情況。'],
      ['2', '學科外特色課程', '每天至少一筆，從專案、機器人、學習歷程或 SEL 選擇。'],
      ['3', '選取備課檔案並補成果', '課程帶入已完成的教案與教材；班級經營與協作不需要備課檔案。'],
      ['4', '完成學生、親師與班務', '有狀況就留下追蹤；值日班務四項各拍一張，正常不寫說明，異常才補處理安排。'],
      ['5', '確認後送主管', '系統直接彙整成果、追蹤與待辦；主管提出意見後，老師可在同一筆資料接續回覆。'],
    ];
    return `<div class="page guide-page">
      ${pageHead('填寫指南', '說明與範例集中管理，不占用正式填寫畫面', `<button type="button" class="btn btn-primary" data-action="navigate" data-route="today">${icon('clipboard-pen-line', 16)}<span>開始今天的紀錄</span></button>`)}
      <section class="guide-start-band"><div><span class="guide-kicker">每日工作順序</span><h2>先完成兩項課程，再確認系統彙整</h2><p>以下是固定流程；詳細範例只留在本頁，工作表單只保留必要欄位。</p></div><div class="guide-day-flow">${dailySteps.map(([number, title, copy]) => `<div class="guide-day-step"><span>${number}</span><div><strong>${esc(title)}</strong><small>${esc(copy)}</small></div></div>`).join('')}</div></section>

      <section class="panel guide-section">
        <div class="panel-head"><div><div class="panel-title">${icon('list-tree')}工作類型與欄位怎麼寫</div><div class="panel-subtitle">選一種類型查看專屬欄位及五個欄位的差異</div></div></div>
        <div class="panel-body">
          <div class="guide-type-picker">${Object.entries(ACTIVITY_TYPES).filter(([key]) => key !== 'lessonprep').map(([key, item]) => `<button type="button" class="guide-type-button ${selectedType === key ? 'active' : ''}" data-action="set-guide-type" data-type="${key}">${icon(item.icon, 16)}<span>${esc(item.label)}</span></button>`).join('')}</div>
          <div class="guide-selected-head"><span class="activity-icon ${config.tone}">${icon(config.icon, 21)}</span><div><strong>${esc(config.label)}</strong><p>${esc(purpose)}</p></div><span class="badge ${activityTrackMeta(config.track).tone}">${esc(activityTrackMeta(config.track).shortLabel)}</span></div>
          <div class="guide-specific-fields"><strong>這種類型另外要填</strong><div>${activityDetailSchema(selectedType).length ? activityDetailSchema(selectedType).map(field => `<span>${icon(field.control === 'date' ? 'calendar-days' : 'check', 13)}${esc(field.label)}</span>`).join('') : '<span>沒有額外欄位，直接完成五項工作紀錄</span>'}</div></div>
          <div class="guide-field-list">${fieldExamples.map((field, index) => `<article><span class="guide-field-number">${index + 1}</span><div><strong>${esc(field[0])}</strong><small>${esc(field[1])}</small><p><span>範例</span>${esc(field[2])}</p></div></article>`).join('')}</div>
        </div>
      </section>

      <div class="guide-split">
        <section class="panel guide-section"><div class="panel-head"><div><div class="panel-title">${icon('package-check')}備課檔案怎麼用</div><div class="panel-subtitle">備課與每日工作分開，教案與教材只整理一次</div></div></div><div class="panel-body"><div class="guide-source-flow"><div><span>1</span><strong>新增備課檔案</strong><small>選擇課程類型並命名；班級可選填。</small></div><div><span>2</span><strong>完成教案與教材</strong><small>整理目標、流程、引導方法、檢核方式及正式附件。</small></div><div><span>3</span><strong>內容完整即可選用</strong><small>不需先填授課日、版本、送審日或鎖定日。</small></div><div><span>4</span><strong>授課當天選用並回饋</strong><small>依建立日期找到檔案，只記實際成果與需調整處。</small></div></div><div class="guide-rule">${icon('info', 17)}<span>班級經營與教室協作不需要備課檔案，直接記錄實際做法、結果、問題、下一步與成果證據。</span></div></div></section>
        <section class="panel guide-section"><div class="panel-head"><div><div class="panel-title">${icon('scan-search')}什麼才算可判讀證據</div><div class="panel-subtitle">主管要能直接看懂資料證明了什麼</div></div></div><div class="panel-body"><div class="guide-evidence-compare"><div><span class="badge yellow">授課前</span><strong>備課檔案</strong><p>教案、任務單、簡報、材料與檢核工具集中管理，不在當日重複上傳。</p></div><div><span class="badge blue">授課後</span><strong>成果證據</strong><p>學生作品、訂正前後、測試數據或行為變化；不能只放一張看不出重點的廣角照。</p></div></div><div class="guide-rule">${icon('scan-line', 17)}<span>工作結果由系統帶入，不用重寫；老師只需標示主管要看檔案的哪個位置，照片可加編號。</span></div><div class="guide-rule">${icon('eye', 17)}<span>工作頁的「課程與工作證據標準」第一次完整顯示；完成第一份成果證據後預設收合，可隨時按「查看證據標準」再次開啟。</span></div></div></section>
      </div>

      <div class="notice-band info">${icon('split', 19)}<div><div class="notice-title">備課與授課紀錄分工</div><div class="notice-copy">備課檔案保存課前設計與教材；每日工作紀錄保存這堂課實際發生的結果、學生反應與下次調整。</div></div></div>
    </div>`;
  }

  function activityDetailDefaults(type) {
    if (type !== 'lessonprep') return {};
    return { targetCourse: '' };
  }

  function renderActivityDetailControl(field, value, type) {
    const fieldId = `activity-detail-${field.key}`;
    const wrapperClass = field.span === 1 ? 'form-field' : 'form-field span-2';
    const changeAttribute = '';
    let control = '';
    if (field.control === 'select') {
      control = `<select id="${fieldId}" name="detail_${esc(field.key)}" data-detail-key="${esc(field.key)}"${changeAttribute} required><option value="">請選擇</option>${field.options.map(option => `<option value="${esc(option)}" ${value === option ? 'selected' : ''}>${esc(option)}</option>`).join('')}</select>`;
    } else if (field.control === 'date') {
      const minimum = state.daily.date;
      control = `<input id="${fieldId}" type="date" name="detail_${esc(field.key)}" data-detail-key="${esc(field.key)}" value="${esc(value)}" min="${minimum}"${changeAttribute} required>`;
    } else if (field.control === 'text') {
      control = `<input id="${fieldId}" name="detail_${esc(field.key)}" data-detail-key="${esc(field.key)}" value="${esc(value)}" minlength="${field.min}" placeholder="${esc(field.placeholder || '')}" required>`;
    } else {
      control = `<textarea id="${fieldId}" name="detail_${esc(field.key)}" data-detail-key="${esc(field.key)}" minlength="${field.min}" placeholder="${esc(field.placeholder || '')}" required>${esc(value)}</textarea>`;
    }
    const hint = field.control === 'date'
      ? '請依實際發生日期填寫。'
      : field.control === 'select'
        ? '此欄會用於主管分類與進度判讀。'
        : `至少 ${field.min} 字，請保留可供主管判讀的具體條件。`;
    return `<div class="${wrapperClass}"><label class="form-label" for="${fieldId}">${esc(field.label)} <span class="required">*</span></label>${control}<div class="field-hint">${esc(hint)}</div></div>`;
  }

  function renderCrossDayTimeline(details = {}) {
    return '';
  }

  function renderActivitySpecificFields(type, details = {}) {
    const config = ACTIVITY_TYPES[type] || ACTIVITY_TYPES.tutoring;
    const schema = activityDetailSchema(type);
    if (!schema.length) return '';
    const values = { ...activityDetailDefaults(type), ...details };
    const isCoursePrep = type === 'lessonprep';
    const specificCopy = {
      tutoring: '先確認教學範圍、學生原本會什麼，以及要怎麼確認真的學會',
      project: '先寫清楚目前進度、本堂內容，以及預計使用的引導方法',
      robotics: '先規劃核心原理、講解方式、程式引導，以及遊戲或改造設計',
      classroom: '直接記錄要改善的班級行為、發生情境與介入流程，不需要教案或備課附件',
      support: '直接記錄協作對象、交付內容與驗收標準，不需要教案或備課附件',
    }[type] || '切換工作類型時，以下欄位與檢核標準會一起更換';
    return `<section class="activity-specific-block">
      <div class="activity-specific-head"><span class="activity-icon ${config.tone}">${icon(config.icon, 18)}</span><div><strong>${esc(config.label)}資料</strong><small>${isCoursePrep ? '選擇這份備課檔案所屬的課程類型' : esc(specificCopy)}</small></div>${statusBadge(isCoursePrep ? '檔案分類' : '類型必填', isCoursePrep ? 'blue' : 'purple')}</div>
      <div class="form-grid">${schema.map(field => renderActivityDetailControl(field, values[field.key] || '', type)).join('')}</div>
    </section>`;
  }

  function renderActivityTrackIndicator(type) {
    const meta = activityTrackMeta(activityTrack(type));
    const isRequired = ['academic', 'enrichment'].includes(activityTrack(type));
    return `<div class="activity-track-indicator ${activityTrack(type)}">${icon(meta.icon, 17)}<div><strong>${esc(meta.label)}</strong><small>${isRequired ? '可完成每日必填軌道' : '不會取代學科內與學科外必填紀錄'}</small></div></div>`;
  }

  function renderActivityTypeOptions(selectedType) {
    return ['academic', 'enrichment', 'supplemental'].map(track => `<optgroup label="${esc(activityTrackMeta(track).label)}">${Object.entries(ACTIVITY_TYPES).filter(([key, config]) => key !== 'lessonprep' && config.track === track).map(([key, config]) => `<option value="${key}" ${selectedType === key ? 'selected' : ''}>${esc(config.label)}</option>`).join('')}</optgroup>`).join('');
  }

  function renderPlanLinkStatus(planId, type) {
    const config = ACTIVITY_TYPES[type] || ACTIVITY_TYPES.tutoring;
    const plan = planById(planId);
    if (!plan) {
      const optionalTitle = type === 'lessonprep' ? '教案內容與教材尚未完成' : '此類工作可選擇關聯教學設計';
      const optionalCopy = type === 'lessonprep' ? '可先儲存備課檔案；完成課程流程、檢核方式與至少一份正式教材後，即可供授課紀錄選用。' : '若本次是在製作或協作既有內容，可在此關聯。';
      const missing = config.requiresPlan || type === 'lessonprep';
      return `<div class="plan-link-status ${missing ? 'is-missing' : ''}">${icon(missing ? 'circle-alert' : 'info', 16)}<div><strong>${config.requiresPlan ? '此類工作必須連結教學設計與教材' : optionalTitle}</strong><small>${config.requiresPlan ? '請先選擇內容完整的備課檔案。' : optionalCopy}</small></div></div>`;
    }
    const readiness = planReadiness(plan);
    const completionReady = type === 'lessonprep' ? readiness === 100 : !config.requiresPlan || readiness === 100;
    const materialCount = (plan.materials || []).length;
    const statusCopy = completionReady ? '內容完整，可供授課選用' : '尚有歸檔必填內容未完成';
    return `<div class="plan-link-status ${completionReady ? 'is-ready' : 'is-missing'}">${icon(completionReady ? 'badge-check' : 'circle-alert', 16)}<div><strong>教案內容與教材 · ${readiness}%</strong><small>${materialCount} 份教材 · ${statusCopy}</small></div></div>`;
  }

  function renderActivityPlanField(type, planId = '') {
    const plan = planById(planId);
    return `<div id="activity-plan-wrap" class="form-field span-2"><input id="activity-plan" type="hidden" name="planId" value="${esc(planId)}"><div class="plan-source-guide">${icon('notebook-tabs', 19)}<div><strong>教案內容與教材</strong><small>教學目標、課程流程、引導方法、檢核方式與正式教材都歸在這一份備課檔案。</small></div><button type="button" id="edit-selected-plan-button" class="btn btn-small ${plan ? '' : 'btn-primary'}" data-action="${plan ? 'edit-selected-activity-plan' : 'create-activity-plan'}" ${plan ? `data-plan-id="${esc(plan.id)}"` : ''}>${icon(plan ? 'file-pen-line' : 'file-plus-2', 14)}${plan ? '編輯教案內容' : '填寫教案內容'}</button></div><div id="activity-plan-status">${renderPlanLinkStatus(planId, type)}</div></div>`;
  }

  function renderPrepSourceStatus(sourceId, type) {
    const source = prepSourceById(sourceId);
    if (!source) {
      return `<div id="activity-prep-source-status" class="prep-source-empty">${icon('folder-search-2', 21)}<div><strong>尚未選擇備課檔案</strong><small>請選擇同課程類型、且教案內容與教材已完整的檔案。</small></div></div>`;
    }
    const issues = prepSourceReadinessIssues(source, type, activityDraft?.date || state.daily.date);
    const plan = planById(source.planId);
    const updatedDate = String(source.updatedAt || '').slice(0, 10) || source.date;
    const materialCount = (plan?.materials || []).length;
    return `<div id="activity-prep-source-status" class="prep-source-card ${issues.length ? 'is-blocked' : 'is-ready'}">
      <div class="prep-source-card-head"><span>${icon(issues.length ? 'circle-alert' : 'badge-check', 19)}</span><div><strong>${esc(source.title)}</strong><small>${formatDate(source.date)} 建立 · ${formatDate(updatedDate)} 更新</small></div>${statusBadge(issues.length ? '尚不可使用' : '可供選用', issues.length ? 'red' : 'green')}</div>
      <div class="prep-source-facts"><span><strong>課程類型</strong>${esc(source.details?.targetCourse || '尚未分類')}</span><span><strong>適用對象</strong>${esc(source.className || '跨班適用')}</span><span><strong>教案完整度</strong>${plan ? `${planReadiness(plan)}%` : '尚未填寫'}</span><span><strong>正式教材</strong>${materialCount} 份</span></div>
      ${source.prep?.summary ? `<div class="prep-source-summary"><strong>備課補充</strong><p>${esc(source.prep.summary)}</p></div>` : ''}
      ${issues.length ? `<div class="prep-source-issues">${icon('triangle-alert', 16)}<span>${esc(issues.join('、'))}</span></div>` : `<div class="prep-source-linked">${icon('link-2', 15)}<span>系統會帶入這份教案與教材；本堂只需記錄實際成果及課後回饋。</span></div>`}
    </div>`;
  }

  function renderActivityPreparationSection(value) {
    const type = value.type;
    if (type === 'lessonprep') {
      const copy = activityFormCopy(type);
      const guide = activityGuide(type);
      return `<section id="activity-preparation-section" class="activity-form-section prep-section"><div class="activity-section-title"><span>${icon('files', 18)}</span><div><strong id="activity-prep-title">${esc(copy.prepTitle)}</strong><small id="activity-prep-subtitle">${esc(copy.prepSubtitle)}</small></div><span id="activity-prep-badge" class="badge blue">${esc(copy.prepBadge)}</span></div><div class="form-grid">${renderActivityPlanField(type, value.planId || '')}<div class="form-field span-2"><label class="form-label" id="activity-prep-summary-label" for="activity-prep-summary">${esc(copy.prepSummaryLabel || `本次${guide.prep}`)} <span class="required">*</span></label><textarea id="activity-prep-summary" name="prepSummary" minlength="12" placeholder="${esc(copy.prepSummaryPlaceholder)}" required>${esc(value.prep?.summary || '')}</textarea></div><div class="form-field span-2"><label class="form-label" id="activity-prep-adjustment-label" for="activity-prep-adjustment">${esc(copy.adjustmentLabel)} <span class="required">*</span></label><textarea id="activity-prep-adjustment" name="prepAdjustment" minlength="8" placeholder="${esc(copy.adjustmentPlaceholder)}" required>${esc(value.prep?.adjustment || '')}</textarea></div><div class="form-field span-2"><label class="form-label" id="activity-prep-files-label" for="activity-prep-files">備課依據附件 <span class="required">*</span></label><label class="file-drop" for="activity-prep-files">${icon('upload-cloud', 21)}<span><strong id="activity-file-title">${esc(copy.fileTitle)}</strong><small id="activity-file-copy">${esc(copy.fileCopy)}</small></span></label><input class="sr-only" id="activity-prep-files" type="file" multiple data-change="prep-files"><div id="prep-file-list">${renderPrepEvidenceList(value.prepEvidence || [])}</div></div></div></section>`;
    }
    if (!activityNeedsPrepSource(type)) return '<div id="activity-preparation-section" hidden></div>';
    const candidates = availablePrepSources(type);
    const selectedId = value.prepSourceId || defaultPrepSourceId(type);
    return `<section id="activity-preparation-section" class="activity-form-section prep-section linked-prep-section"><div class="activity-section-title"><span>${icon('package-check', 18)}</span><div><strong id="activity-prep-title">本堂採用的備課檔案</strong><small id="activity-prep-subtitle">帶入既有教案與教材，當天不必重複填寫或上傳</small></div><span id="activity-prep-badge" class="badge yellow">授課前選取</span></div><div class="form-field"><label class="form-label" for="activity-prep-source">選擇備課檔案 <span class="required">*</span></label><select id="activity-prep-source" name="prepSourceId" data-change="activity-prep-source" required><option value="">請選擇備課檔案</option>${candidates.map(source => { const issues = prepSourceReadinessIssues(source, type, activityDraft?.date || state.daily.date); const created = formatShortDate(source.date); return `<option value="${source.id}" ${selectedId === source.id ? 'selected' : ''} ${issues.length && selectedId !== source.id ? 'disabled' : ''}>${esc(source.title)} · ${created} 建立 · ${issues.length ? issues[0] : '可使用'}</option>`; }).join('')}</select><div class="field-hint">依建立日期辨識檔案；系統會帶入教案、教材、學習單與簡報。</div></div>${renderPrepSourceStatus(selectedId, type)}</section>`;
  }

  function renderActivityPrepFeedbackFields(type, feedback = {}) {
    if (!activityNeedsPrepSource(type)) return '<div id="activity-prep-feedback-fields" hidden></div>';
    return `<div id="activity-prep-feedback-fields" class="prep-feedback-block span-2"><div class="prep-feedback-head">${icon('message-square-heart', 19)}<div><strong>這份備課檔案實際用起來如何</strong><small>以下回饋會連回所選檔案，成為下次調整的依據</small></div></div><div class="form-grid"><div class="form-field span-2"><label class="form-label" for="activity-prep-strengths">教學設計／教材哪裡有效 <span class="required">*</span></label><textarea id="activity-prep-strengths" name="prepStrengths" minlength="8" placeholder="例：共同範例能讓學生很快分辨三種成本，角色卡也讓小組分工更清楚。" required>${esc(feedback.strengths || '')}</textarea></div><div class="form-field span-2"><label class="form-label" for="activity-student-resonance">孩子在哪個環節最有反應／共鳴 <span class="required">*</span></label><textarea id="activity-student-resonance" name="studentResonance" minlength="8" placeholder="例：學生對替自己的餐點定價最投入，會主動比較成本並說明想法。" required>${esc(feedback.resonance || '')}</textarea></div><div class="form-field span-2"><label class="form-label" for="activity-prep-changes">教學設計／教材哪裡需要調整 <span class="required">*</span></label><textarea id="activity-prep-changes" name="prepChanges" minlength="8" placeholder="例：下次要先加入共同完成的標準範例；若不需修正，也請寫明可沿用的原因。" required>${esc(feedback.changes || '')}</textarea></div></div></div>`;
  }

  function renderPrepEvidenceList(items, editable = true) {
    if (!(items || []).length) return '<div class="prep-file-empty">尚未加入前置／研發附件，此筆工作無法完成。</div>';
    return `<div class="prep-file-list">${items.map(item => {
      const category = item.category || '';
      if (!editable) return `<div class="prep-file-row read-only">${icon('file-check-2', 18)}<div class="prep-file-main"><strong>${esc(item.fileName)}</strong><small>${esc(item.size || '')} · ${esc(PREP_EVIDENCE_CATEGORIES[category] || '未分類')}</small><p>${esc(item.note || '尚未標示主管判讀重點')}</p></div>${statusBadge(category && String(item.note || '').trim().length >= 8 ? '可判讀' : '待補說明', category && String(item.note || '').trim().length >= 8 ? 'green' : 'red')}</div>`;
      return `<div class="prep-file-row editable" data-prep-row data-prep-id="${item.id}">${icon('file-check-2', 18)}<div class="prep-file-main"><strong>${esc(item.fileName)}</strong><small>${esc(item.size || '')} · 上傳於 ${formatTime(item.addedAt) || '本次編輯'}</small><div class="prep-file-controls"><div class="form-field"><label class="form-label" for="prep-category-${item.id}">附件類別 <span class="required">*</span></label><select id="prep-category-${item.id}" data-prep-category required><option value="">請選擇</option>${Object.entries(PREP_EVIDENCE_CATEGORIES).map(([key, label]) => `<option value="${key}" ${category === key ? 'selected' : ''}>${esc(label)}</option>`).join('')}</select></div><div class="form-field"><label class="form-label" for="prep-note-${item.id}">主管判讀重點 <span class="required">*</span></label><input id="prep-note-${item.id}" data-prep-note value="${esc(item.note || '')}" minlength="8" placeholder="例：請核對第 2 頁分層題與達標門檻是否一致" required></div></div></div><button type="button" class="icon-button" data-action="remove-prep-file" data-id="${item.id}" aria-label="移除 ${esc(item.fileName)}" title="移除">${icon('x', 15)}</button></div>`;
    }).join('')}</div>`;
  }

  function activityFormCopy(type) {
    const isCrossDay = type === 'lessonprep';
    return isCrossDay ? {
      classLabel: '適用班級／對象', classPlaceholder: '例：五六年級混齡班；可跨班使用則留白',
      titleLabel: '備課檔案名稱', titlePlaceholder: '例：餐車計畫｜菜單成本教學', hideStudents: true,
      prepTitle: '教案內容與教材', prepSubtitle: '教學設計、教材附件與參考資料集中在同一份檔案', prepBadge: '同一份檔案',
      prepSummaryLabel: '備課補充', prepSummaryPlaceholder: '例：第一次接觸成本概念的班級，需先完成共同範例。',
      adjustmentLabel: '使用提醒', adjustmentPlaceholder: '例：混齡班可分為基礎版與進階版學習單。',
      fileTitle: '加入參考資料', fileCopy: '正式授課教材請在上方「教案內容與教材」管理',
      resultTitle: '備課內容', resultSubtitle: '集中整理教案與教材', resultBadge: '備課檔案',
      ownerLabel: '備課老師', dueLabel: '更新日期',
    } : {
      classLabel: '班級／對象', classPlaceholder: '例：四年級 A 班',
      titleLabel: '紀錄標題', titlePlaceholder: '例：數學｜異分母分數加減', hideStudents: false,
      prepTitle: '本堂採用的備課檔案', prepSubtitle: '由內容完整的教案與教材帶入', prepBadge: '授課前選取',
      prepSummaryLabel: '', prepSummaryPlaceholder: '',
      adjustmentLabel: '', adjustmentPlaceholder: '',
      fileTitle: '', fileCopy: '',
      resultTitle: '課後紀錄與下次調整', resultSubtitle: '寫下實際引導、學生表現、遇到的問題與下次做法；照片或作品請儲存後加入', resultBadge: '課後必填',
      ownerLabel: '負責人', dueLabel: '追蹤日期',
    };
  }

  function renderSimplePrepFiles(items = []) {
    if (!items.length) return '<div class="prep-file-empty">尚未加入參考資料；可直接在教學設計中上傳正式教材。</div>';
    return `<div class="prep-file-list">${items.map(item => `<div class="prep-file-row editable" data-prep-id="${esc(item.id)}">${icon('paperclip', 18)}<div class="prep-file-main"><strong>${esc(item.fileName)}</strong><small>${esc(item.size || '')} · ${formatDate(String(item.addedAt || '').slice(0, 10))}</small></div><button type="button" class="icon-button" data-action="remove-prep-file" data-id="${esc(item.id)}" aria-label="移除 ${esc(item.fileName)}" title="移除">${icon('x', 15)}</button></div>`).join('')}</div>`;
  }

  function renderCoursePrepForm(activity) {
    const value = activity || {
      id: '', type: 'lessonprep', title: '', className: '', details: activityDetailDefaults('lessonprep'), planId: '', prep: { summary: '', adjustment: '' }, prepEvidence: [],
    };
    const details = { ...activityDetailDefaults('lessonprep'), ...(value.details || {}) };
    return `<form id="course-prep-form" data-form="course-prep">
      <input type="hidden" name="id" value="${esc(value.id)}">
      <input type="hidden" name="type" value="lessonprep">
      <input id="activity-plan" type="hidden" name="planId" value="${esc(value.planId || '')}">
      <section class="activity-form-section course-prep-file-section">
        <div class="activity-section-title"><span>${icon('folder-open', 18)}</span><div><strong>備課檔案</strong><small>先選課程類型並命名，建立日期由系統自動保留</small></div><span class="badge blue">獨立歸檔</span></div>
        <div class="form-grid">
          <div class="form-field"><label class="form-label" for="course-prep-type">備課課程類型 <span class="required">*</span></label><select id="course-prep-type" name="targetCourse" required><option value="">請選擇課程</option>${ACTIVITY_DETAIL_SCHEMAS.lessonprep[0].options.map(option => `<option value="${esc(option)}" ${details.targetCourse === option ? 'selected' : ''}>${esc(option)}</option>`).join('')}</select></div>
          <div class="form-field"><div class="form-label">備課建立日期</div><div class="course-prep-date">${icon('calendar-days', 16)}${formatDate(value.date || state.daily.date)}</div></div>
          <div class="form-field span-2"><label class="form-label" for="course-prep-title">備課檔案名稱 <span class="required">*</span></label><input id="course-prep-title" name="title" value="${esc(value.title || '')}" placeholder="例：餐車計畫｜菜單成本教學" required></div>
          <div class="form-field span-2"><label class="form-label" for="course-prep-class">適用班級／對象</label><input id="course-prep-class" name="className" value="${esc(value.className || '')}" placeholder="例：五六年級混齡班；可跨班使用則留白"><div class="field-hint">選填。可重複用於不同班級的教案不必限定班級。</div></div>
        </div>
      </section>
      <section class="activity-form-section prep-section"><div class="activity-section-title"><span>${icon('notebook-tabs', 18)}</span><div><strong>教案內容與教材</strong><small>課程流程、引導方式、學習檢核與正式教材集中在同一份檔案</small></div><span class="badge purple">歸檔內容</span></div><div class="form-grid">${renderActivityPlanField('lessonprep', value.planId || '')}</div></section>
      <section class="activity-form-section"><div class="activity-section-title"><span>${icon('paperclip', 18)}</span><div><strong>備課補充</strong><small>只放教學設計以外的備註或參考來源，沒有可留白</small></div><span class="badge outline">選填</span></div><div class="form-grid">
        <div class="form-field span-2"><label class="form-label" for="course-prep-note">補充備註</label><textarea id="course-prep-note" name="prepSummary" placeholder="例：這份教案適合第一次接觸成本概念的學生；查價網站需於授課前確認。">${esc(value.prep?.summary || '')}</textarea></div>
        <div class="form-field span-2"><label class="file-drop" for="activity-prep-files">${icon('upload-cloud', 21)}<span><strong>加入參考資料</strong><small>需求來源、參考文章或舊教材；正式授課附件請放在教學設計與教材</small></span></label><input class="sr-only" id="activity-prep-files" type="file" multiple data-change="prep-files"><div id="prep-file-list">${renderSimplePrepFiles(value.prepEvidence || [])}</div></div>
      </div></section>
    </form>`;
  }

  function renderActivityForm(activity) {
    const value = activity || {
      id: '', type: 'tutoring', title: '', className: '', students: [], details: {}, prepSourceId: '', planId: '', objective: '', action: '', result: '', issue: '', nextAction: '', owner: state.context.teacher, dueDate: addDays(state.daily.date, 1), prepFeedback: { strengths: '', resonance: '', changes: '' }, prep: { summary: '', adjustment: '' }, prepEvidence: [],
    };
    const guide = activityGuide(value.type);
    const copy = activityFormCopy(value.type);
    return `<form id="activity-form" data-form="activity">
      <input type="hidden" name="id" value="${esc(value.id)}">
      <div class="form-grid">
        <div class="form-field"><div class="form-label">系統歸類</div><div id="activity-track-indicator">${renderActivityTrackIndicator(value.type)}</div></div>
        <div class="form-field"><label class="form-label" for="activity-type">工作類型 <span class="required">*</span></label><select id="activity-type" name="type" data-change="activity-type" required>${renderActivityTypeOptions(value.type)}</select></div>
        <div class="form-field"><label class="form-label" id="activity-class-label" for="activity-class">${esc(copy.classLabel)} <span class="required">*</span></label><input id="activity-class" name="className" value="${esc(value.className)}" placeholder="${esc(copy.classPlaceholder)}" required></div>
        <div class="form-field span-2"><label class="form-label" id="activity-title-label" for="activity-title">${esc(copy.titleLabel)} <span class="required">*</span></label><input id="activity-title" name="title" value="${esc(value.title)}" placeholder="${esc(copy.titlePlaceholder)}" required></div>
        <div id="activity-students-field" class="form-field span-2" ${copy.hideStudents ? 'hidden' : ''}><div class="form-label">關聯學生</div><div class="chip-list">${STUDENTS.map(student => `<label class="choice-chip"><input type="checkbox" name="students" value="${esc(student)}" ${(value.students || []).includes(student) ? 'checked' : ''}>${esc(student)}</label>`).join('')}</div><div class="field-hint">全班共同活動可不勾；個別結果請選擇學生。</div></div>
      </div>
      <div id="activity-specific-fields">${renderActivitySpecificFields(value.type, value.details || {})}</div>
      ${renderActivityPreparationSection(value)}
      <section class="activity-form-section result-section"><div class="activity-section-title"><span>${icon('scan-search', 18)}</span><div><strong id="activity-result-title">${esc(copy.resultTitle)}</strong><small id="activity-result-subtitle">${esc(copy.resultSubtitle)}</small></div><span id="activity-result-badge" class="badge blue">${esc(copy.resultBadge)}</span></div><div class="form-grid">
        <div class="form-field span-2"><label class="form-label" id="activity-objective-label" for="activity-objective">${esc(guide.objective[0])} <span class="required">*</span></label><textarea id="activity-objective" name="objective" placeholder="${esc(guide.objective[1])}" required>${esc(value.objective)}</textarea></div>
        <div class="form-field span-2"><label class="form-label" id="activity-action-label" for="activity-action">${esc(guide.action[0])} <span class="required">*</span></label><textarea id="activity-action" name="action" placeholder="${esc(guide.action[1])}" required>${esc(value.action)}</textarea></div>
        <div class="form-field span-2"><label class="form-label" id="activity-result-label" for="activity-result">${esc(guide.result[0])} <span class="required">*</span></label><textarea id="activity-result" name="result" placeholder="${esc(guide.result[1])}" required>${esc(value.result)}</textarea></div>
        <div class="form-field span-2"><label class="form-label" id="activity-issue-label" for="activity-issue">${esc(guide.issue[0])}</label><textarea id="activity-issue" name="issue" placeholder="${esc(guide.issue[1])}">${esc(value.issue)}</textarea></div>
        <div class="form-field span-2"><label class="form-label" id="activity-next-label" for="activity-next">${esc(guide.next[0])} <span class="required">*</span></label><textarea id="activity-next" name="nextAction" placeholder="${esc(guide.next[1])}" required>${esc(value.nextAction)}</textarea></div>
        ${renderActivityPrepFeedbackFields(value.type, value.prepFeedback || {})}
        <div class="form-field"><label class="form-label" id="activity-owner-label" for="activity-owner">${esc(copy.ownerLabel)} <span class="required">*</span></label><input id="activity-owner" name="owner" value="${esc(value.owner || state.context.teacher)}" required></div>
        <div class="form-field"><label class="form-label" id="activity-due-label" for="activity-due">${esc(copy.dueLabel)} <span class="required">*</span></label><input id="activity-due" type="date" name="dueDate" value="${esc(value.dueDate)}" min="${state.daily.date}" required></div>
      </div></section>
    </form>`;
  }

  function renderStudentCaseForm(item) {
    const value = item || { id: '', student: '', category: 'learning', urgency: 'medium', observation: '', intervention: '', outcome: '', nextAction: '', dueDate: addDays(state.daily.date, 1), status: 'open', parentContacted: false };
    return `<form id="student-case-form" data-form="student-case" data-draft-form><input type="hidden" name="id" value="${esc(value.id)}"><div class="form-grid">
      <div class="form-field"><label class="form-label" for="case-student">學生 <span class="required">*</span></label><select id="case-student" name="student" required><option value="">請選擇</option>${STUDENTS.map(student => `<option ${value.student === student ? 'selected' : ''}>${esc(student)}</option>`).join('')}</select></div>
      <div class="form-field"><label class="form-label" for="case-category">類型 <span class="required">*</span></label><select id="case-category" name="category" required><option value="learning" ${value.category === 'learning' ? 'selected' : ''}>學習</option><option value="behavior" ${value.category === 'behavior' ? 'selected' : ''}>行為／情緒</option><option value="peer" ${value.category === 'peer' ? 'selected' : ''}>同儕互動</option><option value="attendance" ${value.category === 'attendance' ? 'selected' : ''}>出席</option><option value="health" ${value.category === 'health' ? 'selected' : ''}>健康</option></select></div>
      <div class="form-field"><label class="form-label" for="case-urgency">追蹤層級</label><select id="case-urgency" name="urgency"><option value="low" ${value.urgency === 'low' ? 'selected' : ''}>一般</option><option value="medium" ${value.urgency === 'medium' ? 'selected' : ''}>持續追蹤</option><option value="high" ${value.urgency === 'high' ? 'selected' : ''}>高優先</option></select></div>
      <div class="form-field"><label class="form-label" for="case-date">下次追蹤日</label><input id="case-date" type="date" name="dueDate" value="${esc(value.dueDate)}"></div>
      <div class="form-field span-2"><label class="form-label" for="case-observation">具體觀察 <span class="required">*</span></label><textarea id="case-observation" name="observation" placeholder="描述可觀察行為與發生情境。" required>${esc(value.observation)}</textarea></div>
      <div class="form-field span-2"><label class="form-label" for="case-intervention">已採取方法 <span class="required">*</span></label><textarea id="case-intervention" name="intervention" placeholder="老師實際做了什麼。" required>${esc(value.intervention)}</textarea></div>
      <div class="form-field span-2"><label class="form-label" for="case-outcome">目前結果 <span class="required">*</span></label><textarea id="case-outcome" name="outcome" placeholder="學生反應、改善或仍未改善的地方。" required>${esc(value.outcome)}</textarea></div>
      <div class="form-field span-2"><label class="form-label" for="case-next">下一步 <span class="required">*</span></label><textarea id="case-next" name="nextAction" required>${esc(value.nextAction)}</textarea></div>
      <div class="form-field"><label class="choice-chip"><input type="checkbox" name="parentContacted" ${value.parentContacted ? 'checked' : ''}>已同步家長</label></div>
      <div class="form-field"><label class="form-label" for="case-status">狀態</label><select id="case-status" name="status"><option value="open" ${value.status === 'open' ? 'selected' : ''}>追蹤中</option><option value="closed" ${value.status === 'closed' ? 'selected' : ''}>已結案</option></select></div>
    </div></form>`;
  }

  function renderContactForm(item) {
    const value = item || { id: '', student: '', channel: 'LINE', topic: '學習狀況', summary: '', decision: '', nextAction: '', dueDate: addDays(state.daily.date, 1), status: 'open' };
    return `<form id="contact-form" data-form="contact" data-draft-form><input type="hidden" name="id" value="${esc(value.id)}"><div class="form-grid">
      <div class="form-field"><label class="form-label" for="contact-student">學生 <span class="required">*</span></label><select id="contact-student" name="student" required><option value="">請選擇</option>${STUDENTS.map(student => `<option ${value.student === student ? 'selected' : ''}>${esc(student)}</option>`).join('')}</select></div>
      <div class="form-field"><label class="form-label" for="contact-channel">管道</label><select id="contact-channel" name="channel"><option ${value.channel === 'LINE' ? 'selected' : ''}>LINE</option><option ${value.channel === '電話' ? 'selected' : ''}>電話</option><option ${value.channel === '面談' ? 'selected' : ''}>面談</option><option ${value.channel === '聯絡簿' ? 'selected' : ''}>聯絡簿</option></select></div>
      <div class="form-field span-2"><label class="form-label" for="contact-topic">溝通主題 <span class="required">*</span></label><input id="contact-topic" name="topic" value="${esc(value.topic)}" placeholder="例：分數學習狀況" required></div>
      <div class="form-field span-2"><label class="form-label" for="contact-summary">必要摘要 <span class="required">*</span></label><textarea id="contact-summary" name="summary" placeholder="只記錄與學生支持有關的客觀內容。" required>${esc(value.summary)}</textarea></div>
      <div class="form-field span-2"><label class="form-label" for="contact-decision">雙方共識／承諾 <span class="required">*</span></label><textarea id="contact-decision" name="decision" placeholder="例：家長今晚先讓孩子口述步驟，不額外加題。" required>${esc(value.decision)}</textarea></div>
      <div class="form-field span-2"><label class="form-label" for="contact-next">後續行動</label><textarea id="contact-next" name="nextAction">${esc(value.nextAction)}</textarea></div>
      <div class="form-field"><label class="form-label" for="contact-date">追蹤日期</label><input id="contact-date" type="date" name="dueDate" value="${esc(value.dueDate)}"></div>
      <div class="form-field"><label class="form-label" for="contact-status">狀態</label><select id="contact-status" name="status"><option value="open" ${value.status === 'open' ? 'selected' : ''}>待追蹤</option><option value="closed" ${value.status === 'closed' ? 'selected' : ''}>已結案</option></select></div>
    </div></form>`;
  }

  function defaultEvidenceType(activity) {
    return {
      tutoring: 'before_after', project: 'artifact', robotics: 'assessment', portfolio: 'artifact',
      sel: 'assessment', classroom: 'assessment', lessonprep: 'plan_asset', support: 'assessment',
    }[activity.type] || 'assessment';
  }

  function evidenceQuality(data) {
    let score = 0;
    const attachments = evidenceAttachments(data);
    if (attachments.length) score += 20;
    if (data.type) score += 15;
    if (String(data.claim || '').trim().length >= 8) score += 20;
    if (String(data.observation || '').trim().length >= 12) score += 20;
    if (data.privacy) score += 15;
    if ((data.pins || []).length > 0 || attachments.every(item => String(item.note || '').trim().length >= 4) || String(data.observation || '').trim().length >= 32) score += 10;
    return score;
  }

  function evidenceAttachments(data) {
    if (!data) return [];
    normalizeEvidenceRecord(data);
    return data.attachments || [];
  }

  function evidencePrimaryAttachment(data) {
    const attachments = evidenceAttachments(data);
    return attachments.find(item => item.id === data.primaryAttachmentId) || attachments[0] || null;
  }

  function syncEvidencePrimaryFields(data) {
    const primary = evidencePrimaryAttachment(data);
    data.primaryAttachmentId = primary?.id || '';
    data.fileName = primary?.fileName || '';
    data.mimeType = primary?.mimeType || '';
    data.dataUrl = primary?.dataUrl || '';
    data.placeholder = Boolean(primary?.placeholder && !primary?.dataUrl);
    return data;
  }

  function renderEvidenceAttachmentList(data, editable = true) {
    const attachments = evidenceAttachments(data);
    if (!attachments.length) return '<div class="evidence-attachment-empty">尚未加入成果照片或檔案。</div>';
    const requireNotes = attachments.length > 1;
    return `<div class="evidence-attachment-grid">${attachments.map((attachment, index) => {
      const primary = attachment.id === data.primaryAttachmentId;
      const preview = attachment.dataUrl
        ? `<img src="${attachment.dataUrl}" alt="${esc(attachment.fileName)}">`
        : `<span class="evidence-attachment-file">${icon(attachment.mimeType === 'application/pdf' ? 'file-text' : 'file-check-2', 24)}</span>`;
      return `<article class="evidence-attachment-item ${primary ? 'is-primary' : ''}" data-attachment-id="${esc(attachment.id)}">
        <button type="button" class="evidence-attachment-preview" data-action="set-evidence-primary" data-attachment-id="${esc(attachment.id)}" ${editable ? '' : 'disabled'} aria-label="${primary ? '目前標註主圖' : `設為標註主圖：${esc(attachment.fileName)}`}">${preview}<span class="evidence-attachment-index">${index + 1}</span></button>
        <div class="evidence-attachment-main"><div class="evidence-attachment-head"><strong>${esc(attachment.fileName)}</strong><span class="badge ${primary ? 'blue' : 'outline'}">${primary ? '標註主圖' : esc(attachment.size || '已加入')}</span></div>
        <label class="form-label" for="evidence-attachment-note-${esc(attachment.id)}">這張要主管看什麼？${requireNotes ? ' <span class="required">*</span>' : ''}</label>
        <input id="evidence-attachment-note-${esc(attachment.id)}" data-evidence-attachment-note data-attachment-id="${esc(attachment.id)}" value="${esc(attachment.note || '')}" minlength="4" placeholder="例：請看右下角學生訂正後的第二次答案" ${requireNotes ? 'required' : ''} ${editable ? '' : 'disabled'}></div>
        ${editable ? `<button type="button" class="icon-button evidence-attachment-remove" data-action="remove-evidence-attachment" data-attachment-id="${esc(attachment.id)}" aria-label="移除 ${esc(attachment.fileName)}" title="移除">${icon('x', 15)}</button>` : ''}
      </article>`;
    }).join('')}</div>`;
  }

  function renderEvidenceCanvas(data) {
    const primary = evidencePrimaryAttachment(data);
    if (!primary) return '<div><div class="empty-icon">' + icon('image-plus', 24) + '</div><div class="empty-title">尚未選擇檔案</div><div class="empty-copy">加入照片後，可點選關鍵位置加上編號標記。</div></div>';
    if (primary.dataUrl) return `<img src="${primary.dataUrl}" alt="證據預覽">${renderPins(data.pins)}`;
    return `<div><div class="empty-icon">${icon(primary.mimeType === 'application/pdf' ? 'file-text' : 'file-check-2', 24)}</div><div class="empty-title">${esc(primary.fileName)}</div><div class="empty-copy">檔案已加入；非照片檔請用文字說明主管應查看的頁面或位置。</div></div>`;
  }

  function renderEvidenceForm(activity, evidence) {
    const isCrossDay = activity.type === 'lessonprep';
    const value = clone(evidence || {
      id: '', fileName: '', mimeType: '', dataUrl: '', attachments: [], primaryAttachmentId: '', type: defaultEvidenceType(activity), stage: isCrossDay ? 'during' : 'after', title: '', claim: activity.result || '', observation: '', students: isCrossDay ? [] : clone(activity.students || []), privacy: false, pins: [], placeholder: false,
    });
    normalizeEvidenceRecord(value);
    value.claim = activity.result || value.claim || '';
    evidenceDraft = clone(value);
    evidenceDraft.activityId = activity.id;
    evidenceDraft.pins = clone(value.pins || []);
    syncEvidencePrimaryFields(evidenceDraft);
    const attachmentCount = evidenceDraft.attachments.length;
    const score = evidenceQuality(evidenceDraft);
    return `<form id="evidence-form" data-form="evidence">
      <input type="hidden" name="id" value="${esc(value.id)}">
      <input type="hidden" name="activityId" value="${esc(activity.id)}">
      <div class="notice-band info">${icon('link', 19)}<div><div class="notice-title">${isCrossDay ? '關聯課程備課' : '關聯工作'}：${esc(activity.title)}</div><div class="notice-copy">${isCrossDay ? '本次備課目標' : '目標'}：${esc(activity.objective)}</div></div></div>
      <div class="detail-split">
        <div>
          <div class="evidence-upload-zone ${attachmentCount ? 'has-file' : ''}" id="evidence-upload-zone">
            <span class="evidence-upload-icon">${icon(attachmentCount ? 'images' : 'camera', 24)}</span>
            <div class="evidence-upload-copy"><strong id="evidence-upload-title">${attachmentCount ? `已加入 ${attachmentCount} 份成果` : (isCrossDay ? '上傳今天完成的版本' : '成果照片／檔案')} <span class="required">*</span></strong><small>${isCrossDay ? `可一次選擇多份今日實際完成的教案、教材或版本檔案，最多 ${MAX_EVIDENCE_FILES} 份。` : `可一次選取多張照片，最多 ${MAX_EVIDENCE_FILES} 張；請拍作品、學習單或測試結果本身。`}</small><span id="evidence-file-name">${attachmentCount ? esc(evidenceDraft.attachments.map(item => item.fileName).join('、')) : '尚未選擇檔案 · 單檔上限 15 MB'}</span></div>
            <div class="evidence-upload-actions">
              ${isCrossDay ? '' : `<label class="btn btn-primary evidence-file-button">${icon('camera', 16)}直接拍照<input id="evidence-camera" type="file" data-change="evidence-file" accept="image/*" capture="environment" aria-label="直接拍照"></label>`}
              <label class="btn ${isCrossDay ? 'btn-primary' : ''} evidence-file-button">${icon('folder-up', 16)}${isCrossDay ? '選擇版本檔案' : '從相簿／檔案多選'}<input id="evidence-file" type="file" multiple data-change="evidence-file" accept="image/*,.pdf,.ppt,.pptx,.doc,.docx,.xls,.xlsx" aria-label="${isCrossDay ? '選擇一份或多份版本檔案' : '從相簿或檔案選擇一張或多張'}"></label>
            </div>
          </div>
          <div id="evidence-attachment-list">${renderEvidenceAttachmentList(evidenceDraft)}</div>
          <div class="annotation-canvas ${evidenceDraft.dataUrl ? 'has-image' : ''}" id="evidence-canvas" data-action="place-evidence-pin" aria-label="標註主圖預覽與重點標記">
            ${renderEvidenceCanvas(evidenceDraft)}
          </div>
          <div id="pin-list" class="pin-list">${renderPinList(value.pins)}</div>
        </div>
        <div class="stack">
          <div class="quality-box" id="evidence-quality">${renderEvidenceQuality(score)}</div>
          <div class="form-field"><label class="form-label" for="evidence-type">證據類型 <span class="required">*</span></label><select id="evidence-type" name="type" data-input="evidence-quality" required><option value="">請選擇</option>${Object.entries(EVIDENCE_TYPES).map(([key, label]) => `<option value="${key}" ${value.type === key ? 'selected' : ''}>${esc(label)}</option>`).join('')}</select></div>
          <div class="form-field"><div class="form-label">紀錄階段 <span class="required">*</span></div><div class="segmented"><label><input type="radio" name="stage" value="before" ${value.stage === 'before' ? 'checked' : ''} required>${isCrossDay ? '接續依據' : '課前'}</label><label><input type="radio" name="stage" value="during" ${value.stage === 'during' ? 'checked' : ''} required>${isCrossDay ? '本日製作' : '進行中'}</label><label><input type="radio" name="stage" value="after" ${value.stage === 'after' ? 'checked' : ''} required>${isCrossDay ? '本日完成' : '成果'}</label></div></div>
        </div>
      </div>
      <div class="section-divider"></div>
      <div class="form-grid">
        <div class="form-field span-2"><label class="form-label" for="evidence-title">${isCrossDay ? '本日產出標題' : '證據標題'} <span class="required">*</span></label><input id="evidence-title" name="title" value="${esc(value.title)}" placeholder="${isCrossDay ? '例：餐車課程教案與學習單 v1.2' : '例：三組菜單成本表與定價初稿'}" minlength="4" data-input="evidence-quality" required></div>
        <div class="form-field span-2"><div class="form-label">對應的工作結果</div><div class="evidence-linked-result">${esc(value.claim || activity.result || '請先回到工作紀錄完成實際結果')}</div><input id="evidence-claim" type="hidden" name="claim" value="${esc(value.claim || activity.result || '')}"><div class="field-hint">系統已從工作紀錄帶入，不必再寫一次；本頁只需標示主管要看照片或檔案的哪裡。</div></div>
        <div class="form-field span-2"><label class="form-label" for="evidence-observation">主管請看哪裡？ <span class="required">*</span></label><textarea id="evidence-observation" name="observation" placeholder="${isCrossDay ? '例：請核對教案第 2、3 段與簡報第 8–15 頁，以及檔名 v1.2。' : '例：請看左側兩組的完整三類成本，以及右側紅筆補上的耗材。'}" minlength="12" data-input="evidence-quality" required>${esc(value.observation)}</textarea><div class="field-hint">照片可直接點選關鍵位置，加上編號標記與說明；若不加標記，請至少寫 32 字。</div></div>
        <div class="form-field span-2" ${isCrossDay ? 'hidden' : ''}><div class="form-label">關聯學生</div><div class="chip-list">${STUDENTS.map(student => `<label class="choice-chip"><input type="checkbox" name="students" value="${esc(student)}" ${(value.students || []).includes(student) ? 'checked' : ''}>${esc(student)}</label>`).join('')}</div></div>
        <div class="form-field span-2"><label class="choice-chip" for="evidence-privacy"><input id="evidence-privacy" type="checkbox" name="privacy" data-change="evidence-privacy" ${value.privacy ? 'checked' : ''} required>${icon('shield-check', 15)}已確認檔案不含無關姓名、聯絡資訊或不必要的正面影像 <span class="required">*</span></label></div>
      </div>
    </form>`;
  }

  function renderPins(pins) {
    return (pins || []).map((pin, index) => `<span class="evidence-pin" style="left:${Number(pin.x)}%;top:${Number(pin.y)}%;" title="${esc(pin.note)}">${index + 1}</span>`).join('');
  }

  function renderPinList(pins) {
    if (!pins || !pins.length) return '<div class="text-tiny muted">點照片的關鍵位置可新增標記。</div>';
    return pins.map((pin, index) => `<div class="pin-row"><span class="pin-number">${index + 1}</span><span>${esc(pin.note)}</span><button type="button" class="icon-button" data-action="remove-evidence-pin" data-pin-index="${index}" aria-label="刪除標記" title="刪除標記">${icon('x', 14)}</button></div>`).join('');
  }

  function renderEvidenceQuality(score) {
    const tone = score >= 80 ? 'good' : score >= 60 ? 'warn' : 'bad';
    const label = score >= 80 ? '可送主管判讀' : score >= 60 ? '建議再補一項' : '資料不足';
    return `<div class="quality-head"><div><div class="text-small text-strong">證據完整度</div><div class="text-tiny muted">內容完整度與主管採認分開計算</div></div><div class="quality-score ${tone}">${score}</div></div><div class="progress-track"><div class="progress-fill ${score < 60 ? 'danger' : score < 80 ? 'warn' : ''}" style="width:${score}%"></div></div><div class="text-tiny muted mt-8">${label}</div>`;
  }

  function weeklySourceData() {
    const start = addDays(state.daily.date, -6);
    const inRange = date => String(date || '').slice(0, 10) >= start && String(date || '').slice(0, 10) <= state.daily.date;
    const activities = state.activities.filter(item => item.teacher === state.context.teacher && item.type !== 'lessonprep' && inRange(item.date));
    const evidence = activities.flatMap(activity => (activity.evidence || []).map(item => ({ activity, evidence: item })));
    const openCases = state.studentCases.filter(item => item.teacher === state.context.teacher && item.status !== 'closed');
    const contacts = state.contacts.filter(item => item.teacher === state.context.teacher && inRange(item.date));
    const actions = openTasks().filter(item => item.owner === state.context.teacher).sort((a, b) => String(a.dueDate || '').localeCompare(String(b.dueDate || '')));
    return { start, inRange, activities, evidence, openCases, contacts, actions };
  }

  function buildWeeklySummary(source = weeklySourceData()) {
    const results = source.activities.filter(item => item.result).map(item => `${item.title}：${item.result}`);
    return {
      keyChange: results.slice(0, 6).join('；') || '本週尚無可彙整的工作結果。',
      priorityRisks: source.openCases.slice(0, 5).map(item => `${item.student}：${item.nextAction || item.observation}`).join('；') || '目前沒有未結案的學生追蹤。',
      nextWeek: source.actions.slice(0, 5).map(item => `${formatShortDate(item.dueDate)} ${item.title}`).join('；') || '目前沒有未完成的追蹤事項。',
    };
  }

  function weeklyActivityCoreReady(activity) {
    return activityReadinessChecks(activity).filter(check => check.key !== 'evidence').every(check => check.ready);
  }

  function weeklyCoverageRows(source) {
    const dates = [...new Set(source.activities.map(activity => activity.date).filter(Boolean))].sort((a, b) => String(b).localeCompare(String(a))).slice(0, 5);
    return dates.map(date => {
      const activities = source.activities.filter(activity => activity.date === date);
      const tracks = dailyTrackStatus(activities);
      const academicReady = tracks.academic.covered && tracks.academic.items.every(weeklyActivityCoreReady);
      const enrichmentReady = tracks.enrichment.covered && tracks.enrichment.items.every(weeklyActivityCoreReady);
      const evidenceRequired = activities.filter(activity => (ACTIVITY_TYPES[activity.type] || ACTIVITY_TYPES.tutoring).evidence);
      const evidenceReady = evidenceRequired.filter(activity => (activity.evidence || []).some(evidence => evidence.quality >= 80)).length;
      const operation = operationRecords().find(item => item.date === date);
      const ownDuty = operation?.dutyOwner === state.context.teacher;
      const operationReady = ownDuty ? operationsComplete(operation, false) : null;
      const missing = [];
      if (!tracks.academic.covered) missing.push('學科內');
      else if (!academicReady) missing.push('學科內內容');
      if (!tracks.enrichment.covered) missing.push('學科外');
      else if (!enrichmentReady) missing.push('學科外內容');
      if (evidenceReady < evidenceRequired.length) missing.push('成果證據');
      if (ownDuty && !operationReady) missing.push('班務');
      return {
        date, academicReady, enrichmentReady, evidenceReady, evidenceRequired: evidenceRequired.length,
        operationLabel: !operation ? '—' : ownDuty ? operationReady ? '完整' : '待補' : '非值日',
        operationTone: !operation || !ownDuty ? 'neutral' : operationReady ? 'done' : 'pending',
        missing, complete: missing.length === 0,
        submission: state.submissions.find(item => item.teacher === state.context.teacher && item.date === date),
      };
    });
  }

  function renderWeeklyCoverageCell(label, value, tone) {
    const iconName = tone === 'done' ? 'check' : tone === 'pending' ? 'circle-alert' : 'minus';
    return `<span class="weekly-coverage-cell ${tone}"><small>${esc(label)}</small><strong>${icon(iconName, 13)}${esc(value)}</strong></span>`;
  }

  function renderWeeklyCoverageRow(row) {
    const action = row.submission ? ` data-action="open-record" data-submission-id="${esc(row.submission.id)}"` : row.date === state.daily.date ? ' data-action="navigate" data-route="today"' : '';
    const tag = action ? 'button' : 'div';
    const evidenceLabel = row.evidenceRequired ? `${row.evidenceReady}/${row.evidenceRequired}` : '不需';
    const evidenceTone = !row.evidenceRequired ? 'neutral' : row.evidenceReady >= row.evidenceRequired ? 'done' : 'pending';
    return `<${tag} class="weekly-coverage-row ${row.complete ? 'is-complete' : 'is-pending'}"${action}>
      <span class="weekly-coverage-date"><strong>${formatShortDate(row.date)}</strong><small>${row.complete ? '資料完整' : '仍有待補'}</small></span>
      ${renderWeeklyCoverageCell('學科內', row.academicReady ? '完整' : '待補', row.academicReady ? 'done' : 'pending')}
      ${renderWeeklyCoverageCell('學科外', row.enrichmentReady ? '完整' : '待補', row.enrichmentReady ? 'done' : 'pending')}
      ${renderWeeklyCoverageCell('成果證據', evidenceLabel, evidenceTone)}
      ${renderWeeklyCoverageCell('班務', row.operationLabel, row.operationTone)}
      <span class="weekly-coverage-result"><strong>${row.complete ? '完整' : '待補'}</strong><small>${row.complete ? '沒有缺漏' : row.missing.join('、')}</small></span>
      ${action ? icon('chevron-right', 16) : ''}
    </${tag}>`;
  }

  function renderWeekly() {
    const source = weeklySourceData();
    const summary = buildWeeklySummary(source);
    const acceptedOrReady = source.evidence.filter(item => item.evidence.status === 'accepted' || item.evidence.quality >= 80).length;
    const coverageRows = weeklyCoverageRows(source);
    const completeCoverageDays = coverageRows.filter(row => row.complete).length;
    return `<div class="page">
      ${pageHead('本週工作整理', `${formatDate(source.start)}–${formatDate(state.daily.date)} · 由每日紀錄自動彙整`, `<button type="button" class="btn" data-action="print-weekly">${icon('printer', 16)}<span>列印摘要</span></button>`)}
      <div class="status-strip">
        <div class="status-cell"><div class="status-label">教學／工作事件</div><div class="status-value">${source.activities.length}</div><div class="status-note">只計最近 7 天</div></div>
        <div class="status-cell"><div class="status-label">可判讀證據</div><div class="status-value">${acceptedOrReady}/${source.evidence.length}</div><div class="status-note">不以照片張數作為績效</div></div>
        <div class="status-cell"><div class="status-label">學生追蹤</div><div class="status-value">${source.openCases.length}</div><div class="status-note">這位老師尚未結案件</div></div>
        <div class="status-cell"><div class="status-label">親師聯繫／待辦</div><div class="status-value">${source.contacts.length}/${source.actions.length}</div><div class="status-note">本週聯繫 / 未完成行動</div></div>
      </div>
      <div class="content-grid wide-aside">
        <section class="panel">
          <div class="panel-head"><div><div class="panel-title">${icon('sparkles')}系統週整理</div><div class="panel-subtitle">成果、風險與下週待辦由既有資料產生，不再重寫</div></div><span class="badge ${state.weekly.status === 'submitted' ? 'green' : 'yellow'}">${state.weekly.status === 'submitted' ? '已送出' : '草稿'}</span></div>
          <div class="panel-body"><form id="weekly-form" data-form="weekly"><div class="summary-list"><div class="summary-line"><span class="summary-index">1</span><div><div class="summary-title">本週成果</div><div class="summary-copy">${esc(summary.keyChange)}</div></div></div><div class="summary-line"><span class="summary-index">2</span><div><div class="summary-title">持續追蹤</div><div class="summary-copy">${esc(summary.priorityRisks)}</div></div></div><div class="summary-line"><span class="summary-index">3</span><div><div class="summary-title">最近待辦</div><div class="summary-copy">${esc(summary.nextWeek)}</div></div></div></div><div class="form-field mt-16"><label class="form-label" for="weekly-decision">需要主管決定／提供資源</label><textarea id="weekly-decision" name="decisionNeeded" placeholder="只有系統紀錄看不出的需求才填；無則留白。">${esc(state.weekly.decisionNeeded)}</textarea><div class="field-hint">非必填，輸入內容會自動暫存。</div></div><div class="flex gap-8 mt-16"><button type="button" class="btn btn-primary" data-action="submit-weekly">${icon('send', 16)}確認送出週整理</button></div></form></div>
        </section>
        <aside class="stack">
          <section class="panel weekly-coverage-panel"><div class="panel-head"><div><div class="panel-title">${icon('calendar-check-2')}最近工作日完成狀態</div><div class="panel-subtitle">只顯示有紀錄的日期</div></div>${coverageRows.length ? `<span class="badge ${completeCoverageDays === coverageRows.length ? 'green' : 'yellow'}">${completeCoverageDays}/${coverageRows.length} 日完整</span>` : ''}</div><div class="panel-body">${coverageRows.length ? `<div class="weekly-coverage-list">${coverageRows.map(renderWeeklyCoverageRow).join('')}</div>` : `<div class="weekly-coverage-empty">${icon('calendar-plus', 21)}<div><strong>資料累積中</strong><span>完成工作紀錄後，這裡只顯示有內容的日期。</span></div></div>`}</div></section>
        </aside>
      </div>
    </div>`;
  }

  function planCriteria(plan) {
    const totalMinutes = (plan.flow || []).reduce((sum, item) => sum + Number(item.minutes || 0), 0);
    const flowComplete = (plan.flow || []).length >= 2 && (plan.flow || []).every(item =>
      String(item.stage || '').trim() && Number(item.minutes || 0) > 0 && String(item.teacher || '').trim() && String(item.student || '').trim() && String(item.checkpoint || '').trim()
    );
    return [
      { key: 'meta', label: '課程名稱、類型與總時數', done: Boolean(plan.title && plan.courseType && plan.duration) },
      { key: 'context', label: '學習者背景與先備能力', done: String(plan.learnerContext || '').trim().length >= 12 },
      { key: 'objectives', label: '可觀察學習目標', done: String(plan.objectives || '').trim().length >= 12 },
      { key: 'flow', label: '教學流程、時間、師生活動與逐段檢核', done: flowComplete && totalMinutes === Number(plan.duration) },
      { key: 'assessment', label: '學習檢核與達成標準', done: String(plan.assessment || '').trim().length >= 12 },
      { key: 'differentiation', label: '差異化與支持方式', done: String(plan.differentiation || '').trim().length >= 8 },
      { key: 'materials', label: '至少一份正式教材附件', done: (plan.materials || []).length >= 1 },
      { key: 'privacy', label: '安全與隱私確認', done: String(plan.safetyPrivacy || '').trim().length >= 8 },
    ];
  }

  function planReadiness(plan) {
    const criteria = planCriteria(plan);
    return Math.round(criteria.filter(item => item.done).length / criteria.length * 100);
  }

  function planStatus(plan) {
    return {
      draft: ['草稿', 'yellow'], review: ['待主管審查', 'blue'], changes: ['退回補件', 'red'], approved: ['已核准', 'green'], taught: ['已授課', 'purple'], archived: ['已歸檔', 'outline'],
    }[plan.status] || ['草稿', 'yellow'];
  }

  function prepActivityForPlan(plan) {
    if (!plan) return null;
    return state.activities.find(activity => activity.type === 'lessonprep' && (activity.id === plan.sourceActivityId || activity.planId === plan.id)) || null;
  }

  function prepRecordCriteria(activity) {
    const plan = planById(activity?.planId);
    const criteria = plan ? planCriteria(plan) : [];
    const criterion = key => Boolean(criteria.find(item => item.key === key)?.done);
    return [
      { label: '備課檔案名稱與課程類型', done: Boolean(activity?.title && activity?.details?.targetCourse) },
      { label: '學習者背景與可觀察目標', done: criterion('context') && criterion('objectives') },
      { label: '教學流程與逐段檢核', done: criterion('flow') },
      { label: '學習檢核、支持方式與安全確認', done: criterion('assessment') && criterion('differentiation') && criterion('privacy') },
      { label: '至少一份正式教材附件', done: criterion('materials') },
    ];
  }

  function prepRecordReadiness(activity) {
    const criteria = prepRecordCriteria(activity);
    return Math.round(criteria.filter(item => item.done).length / criteria.length * 100);
  }

  function prepRecordStatus(activity) {
    const plan = planById(activity.planId);
    if (!plan || planReadiness(plan) < 100) return ['編輯中', 'yellow', 'draft'];
    if (plan.status === 'changes') return ['需修改', 'red', 'draft'];
    if (['approved', 'taught', 'archived'].includes(plan.status)) return ['已歸檔', 'green', 'archived'];
    if (plan.status === 'review') return ['可使用｜審查中', 'blue', 'ready'];
    return ['可供選用', 'green', 'ready'];
  }

  function renderLessonPlans() {
    const allPreps = state.activities
      .filter(activity => activity.teacher === state.context.teacher && activity.type === 'lessonprep')
      .sort((a, b) => String(b.updatedAt || b.date).localeCompare(String(a.updatedAt || a.date)));
    const legacyPlans = state.lessonPlans.filter(plan => plan.teacher === state.context.teacher && !prepActivityForPlan(plan));
    const filters = getFilters('plans', { status: 'all' });
    const preps = allPreps.filter(activity => filters.status === 'all' || prepRecordStatus(activity)[2] === filters.status);
    const focusPrep = preps[0] || allPreps[0] || null;
    return `<div class="page">
      ${pageHead('備課教案建檔', '建立、編輯與歸檔可重複使用的教案與教材', `<button type="button" class="btn btn-primary" data-action="open-activity" data-type="lessonprep">${icon('folder-plus', 17)}<span>新增備課檔案</span></button>`)}
      <div class="notice-band info">${icon('files', 19)}<div><div class="notice-title">備課檔案獨立於每日工作紀錄</div><div class="notice-copy">這裡只準備教案與教材；授課當天選擇實際使用的檔案，再記錄學生成果與課後回饋。</div></div></div>
      <section class="panel">
        <div class="panel-head"><div><div class="panel-title">${icon('notebook-tabs')}我的備課檔案</div><div class="panel-subtitle">顯示 ${preps.length} / ${allPreps.length} 筆</div></div><div class="segmented"><button type="button" data-action="set-view-filter" data-filter-group="plans" data-filter-key="status" data-filter-value="all" class="${filters.status === 'all' ? 'active' : ''}">全部</button><button type="button" data-action="set-view-filter" data-filter-group="plans" data-filter-key="status" data-filter-value="draft" class="${filters.status === 'draft' ? 'active' : ''}">編輯中</button><button type="button" data-action="set-view-filter" data-filter-group="plans" data-filter-key="status" data-filter-value="ready" class="${filters.status === 'ready' ? 'active' : ''}">可使用</button><button type="button" data-action="set-view-filter" data-filter-group="plans" data-filter-key="status" data-filter-value="archived" class="${filters.status === 'archived' ? 'active' : ''}">已歸檔</button></div></div>
        <div class="panel-body flush"><div class="table-wrap"><table class="data-table plan-table"><thead><tr><th>備課檔案</th><th>課程類型</th><th>建立／更新</th><th>教案內容與教材</th><th>狀態</th><th></th></tr></thead><tbody>${preps.length ? preps.map(renderPrepRecordRow).join('') : '<tr><td colspan="6" class="muted">此篩選條件沒有備課檔案</td></tr>'}</tbody></table></div></div>
      </section>
      <div class="content-grid mt-16">
        ${focusPrep ? `<section class="panel"><div class="panel-head"><div><div class="panel-title">${icon('badge-check')}最近一筆檢核</div><div class="panel-subtitle">${esc(focusPrep.title)}</div></div></div><div class="panel-body"><div class="check-list">${prepRecordCriteria(focusPrep).map(item => `<div class="check-item ${item.done ? 'done' : 'pending'}"><span class="check-icon">${icon(item.done ? 'check' : 'minus', 12)}</span><span>${esc(item.label)}</span></div>`).join('')}</div></div></section>` : '<div></div>'}
        <div class="stack">
          <div class="notice-band success">${icon('badge-check', 19)}<div><div class="notice-title">內容完整即可供授課選用</div><div class="notice-copy">不另建「正式教案」；教案內容與教材都歸在同一份備課檔案中。</div></div></div>
          ${legacyPlans.length ? `<section class="panel"><div class="panel-head"><div><div class="panel-title">${icon('archive')}舊版未整併資料</div><div class="panel-subtitle">${legacyPlans.length} 份舊教案保留供查閱</div></div></div><div class="panel-body"><div class="check-list">${legacyPlans.map(plan => `<button type="button" class="check-item plan-prep-link" data-action="view-plan" data-plan-id="${plan.id}"><span class="check-icon">${icon('arrow-right', 12)}</span><span>${esc(plan.title)} · ${esc(plan.version)}</span></button>`).join('')}</div></div></section>` : ''}
        </div>
      </div>
    </div>`;
  }

  function renderPrepRecordRow(activity) {
    const plan = planById(activity.planId);
    const designReadiness = plan ? planReadiness(plan) : 0;
    const status = prepRecordStatus(activity);
    const updatedDate = String(activity.updatedAt || '').slice(0, 10) || activity.date;
    const criterionCount = prepRecordCriteria(activity).filter(item => item.done).length;
    return `<tr><td><div class="table-primary">${esc(activity.title)}</div><div class="table-secondary">${esc(activity.className || '跨班適用')}</div></td><td><div class="table-primary">${esc(activity.details?.targetCourse || '尚未分類')}</div></td><td><div class="table-primary">${formatShortDate(activity.date)} 建立</div><div class="table-secondary">${formatShortDate(updatedDate)} 更新</div></td><td><div class="table-primary">${plan ? `${designReadiness}% · ${(plan.materials || []).length} 份教材` : '尚未開始填寫'}</div><div class="table-secondary">${plan ? `${plan.duration} 分鐘 · ${criterionCount}/5 項歸檔條件` : '開啟檔案後填寫教案內容'}</div></td><td><span class="badge ${status[1]}">${status[0]}</span></td><td class="text-right"><button type="button" class="btn btn-small" data-action="edit-activity" data-activity-id="${activity.id}">${icon('arrow-right', 14)}開啟檔案</button></td></tr>`;
  }

  function renderRecordTimelineEntry(entry) {
    const action = entry.route ? 'navigate' : 'open-record';
    const target = entry.route ? `data-route="${esc(entry.route)}"` : `data-submission-id="${esc(entry.submissionId)}"`;
    const tone = entry.status === '待補充' ? 'red' : entry.status === '已採認' ? 'green' : 'yellow';
    return `<div class="timeline-item"><div class="timeline-date">${formatDate(entry.date)}</div><span class="timeline-dot"></span><button type="button" class="timeline-content record-entry-button" data-action="${action}" ${target}><span class="record-entry-head"><span class="text-strong">${esc(entry.title)}</span><span class="badge ${tone}">${esc(entry.status)}</span></span><span class="text-small muted">${esc(entry.copy)}</span><span class="record-entry-open">查看完整內容 ${icon('chevron-right', 16)}</span></button></div>`;
  }

  function renderRecords() {
    const filters = getFilters('records', { period: '30d', status: 'all', query: '' });
    const todayEvidenceCount = todayActivities().reduce((sum, activity) => sum + (activity.evidence || []).length, 0);
    const teacherSubmissions = state.submissions.filter(item => item.teacher === state.context.teacher);
    const currentSubmission = teacherSubmissions.find(item => item.date === state.daily.date);
    const submissionEntry = item => {
      const activities = item.activitySnapshots || [];
      const cases = item.studentCaseSnapshots || [];
      const contacts = item.contactSnapshots || [];
      const searchText = [item.keyResult, item.followup, item.tomorrowPriority, item.teacherNote, item.feedback,
        ...activities.flatMap(activity => [activity.title, activity.className, activity.objective, activity.action, activity.result, activity.issue, activity.nextAction, ...(activity.students || [])]),
        ...cases.flatMap(entry => [entry.student, entry.observation, entry.intervention, entry.outcome, entry.nextAction]),
        ...contacts.flatMap(entry => [entry.student, entry.topic, entry.summary, entry.decision, entry.nextAction]),
      ].filter(Boolean).join(' ');
      return { date: item.date, statusKey: item.status, status: item.status === 'accepted' ? '已採認' : item.status === 'clarify' ? '待補充' : '待審查', title: '每日工作紀錄', copy: item.feedback || item.keyResult || item.followup, searchText, submissionId: item.id };
    };
    const todaySearchText = [
      ...todayActivities().flatMap(activity => [activity.title, activity.className, activity.objective, activity.action, activity.result, activity.issue, activity.nextAction, ...(activity.students || [])]),
      ...state.studentCases.filter(item => item.date === state.daily.date && item.teacher === state.context.teacher).flatMap(item => [item.student, item.observation, item.intervention, item.outcome, item.nextAction]),
      ...state.contacts.filter(item => item.date === state.daily.date && item.teacher === state.context.teacher).flatMap(item => [item.student, item.topic, item.summary, item.decision, item.nextAction]),
    ].filter(Boolean).join(' ');
    const currentEntry = currentSubmission
      ? submissionEntry(currentSubmission)
      : { date: state.daily.date, statusKey: 'draft', status: '草稿', title: '今日工作紀錄', copy: `${todayActivities().length} 筆工作、${state.studentCases.filter(item => item.date === state.daily.date && item.teacher === state.context.teacher).length} 筆學生追蹤、${todayEvidenceCount} 份證據`, searchText: todaySearchText, route: 'today' };
    const allEntries = [currentEntry, ...teacherSubmissions.filter(item => item.id !== currentSubmission?.id).map(submissionEntry)];
    const query = filters.query.trim().toLowerCase();
    const entries = allEntries.filter(entry => isDateInPeriod(entry.date, filters.period) && (filters.status === 'all' || entry.statusKey === filters.status) && (!query || `${entry.title} ${entry.copy} ${entry.searchText || ''}`.toLowerCase().includes(query)));
    const filtersMarkup = `<div class="filter-bar"><div class="filter-field"><label for="records-period">期間</label><select id="records-period" aria-label="紀錄期間" data-change="view-filter" data-filter-group="records" data-filter-key="period"><option value="30d" ${filters.period === '30d' ? 'selected' : ''}>最近 30 天</option><option value="month" ${filters.period === 'month' ? 'selected' : ''}>本月</option><option value="last-month" ${filters.period === 'last-month' ? 'selected' : ''}>上月</option><option value="all" ${filters.period === 'all' ? 'selected' : ''}>全部</option></select></div><div class="filter-field"><label for="records-status">狀態</label><select id="records-status" data-change="view-filter" data-filter-group="records" data-filter-key="status" aria-label="紀錄狀態"><option value="all" ${filters.status === 'all' ? 'selected' : ''}>全部</option><option value="pending" ${filters.status === 'pending' ? 'selected' : ''}>待審查</option><option value="clarify" ${filters.status === 'clarify' ? 'selected' : ''}>待補充</option><option value="accepted" ${filters.status === 'accepted' ? 'selected' : ''}>已採認</option><option value="draft" ${filters.status === 'draft' ? 'selected' : ''}>草稿</option></select></div><div class="filter-field grow"><label for="records-query">搜尋</label><input id="records-query" value="${esc(filters.query)}" data-input="view-filter" data-filter-group="records" data-filter-key="query" placeholder="搜尋課程、學生或關鍵字"></div></div>`;
    const empty = '<div class="empty-state"><div><div class="empty-icon">' + icon('search-x', 22) + '</div><div class="empty-title">沒有符合的紀錄</div></div></div>';
    return `<div class="page">${pageHead('我的紀錄', '點選任一日期，查看完整內容與對話紀錄', `<button type="button" class="btn" data-action="export-records">${icon('download', 16)}<span>匯出</span></button>`)}${filtersMarkup}<section class="panel mt-16"><div class="panel-body"><div class="timeline">${entries.length ? entries.map(renderRecordTimelineEntry).join('') : empty}</div></div></section></div>`;
  }

  function renderTasks() {
    const allTasks = state.tasks.filter(task => task.owner === state.context.teacher);
    const filters = getFilters('tasks', { status: 'open' });
    const tasks = allTasks.filter(task => filters.status === 'done' ? task.status === 'done' : task.status !== 'done');
    const open = allTasks.filter(task => task.status !== 'done');
    return `<div class="page">${pageHead('追蹤事項', `${open.length} 項待完成 · 由工作、學生、親師與主管交辦集中產生`, `<button type="button" class="btn btn-primary" data-action="open-task">${icon('plus', 16)}<span>新增事項</span></button>`)}<div class="content-grid"><section class="panel"><div class="panel-head"><div><div class="panel-title">${icon('list-checks')}我的事項</div><div class="panel-subtitle">依期限與優先度排序</div></div><div class="segmented"><button type="button" data-action="set-view-filter" data-filter-group="tasks" data-filter-key="status" data-filter-value="open" class="${filters.status === 'open' ? 'active' : ''}">進行中</button><button type="button" data-action="set-view-filter" data-filter-group="tasks" data-filter-key="status" data-filter-value="done" class="${filters.status === 'done' ? 'active' : ''}">已完成</button></div></div><div class="panel-body flush"><div class="table-wrap"><table class="data-table"><thead><tr><th>完成</th><th>事項</th><th>來源</th><th>期限</th><th>優先度</th></tr></thead><tbody>${tasks.length ? tasks.map(task => `<tr><td><input type="checkbox" data-change="toggle-task" data-task-id="${task.id}" ${task.status === 'done' ? 'checked' : ''} aria-label="${esc(task.title)}"></td><td><div class="table-primary" style="${task.status === 'done' ? 'text-decoration:line-through;color:var(--muted);' : ''}">${esc(task.title)}</div></td><td><span class="badge outline">${esc(task.source)}</span></td><td>${formatDate(task.dueDate)}</td><td><span class="badge ${task.priority === 'high' ? 'red' : task.priority === 'medium' ? 'yellow' : 'blue'}">${task.priority === 'high' ? '高' : task.priority === 'medium' ? '中' : '一般'}</span></td></tr>`).join('') : '<tr><td colspan="5" class="muted">此狀態目前沒有事項</td></tr>'}</tbody></table></div></div></section><aside class="stack"><section class="panel"><div class="panel-head"><div><div class="panel-title">${icon('pie-chart')}事項來源</div></div></div><div class="panel-body"><div class="summary-list">${['學生追蹤', '工作紀錄', '親師溝通', '主管交辦'].map((source, index) => `<div class="summary-line"><span class="summary-index">${index + 1}</span><div><div class="summary-title">${source}</div><div class="summary-copy">${allTasks.filter(task => task.source === source && task.status !== 'done').length} 項進行中</div></div></div>`).join('')}</div></div></section></aside></div></div>`;
  }

  function renderManagerDashboard() {
    const pending = pendingReviews();
    const urgentCases = state.studentCases.filter(item => item.status !== 'closed' && item.urgency !== 'low');
    const pendingPlans = state.lessonPlans.filter(plan => plan.status === 'review');
    const evidenceAttention = allEvidence().filter(item => item.evidence.status !== 'accepted');
    const pendingOperations = operationRecords().filter(item => item.confirmedAt && item.reviewStatus !== 'accepted');
    const teachers = state.people.filter(person => person.role === 'teacher');
    const teacherRows = teachers.map(person => {
      const name = person.nickname;
      const activities = state.activities.filter(item => item.teacher === name && item.date === state.daily.date && item.type !== 'lessonprep');
      const submission = state.submissions.find(item => item.teacher === name && item.date === state.daily.date);
      const submitted = Boolean(submission || (name === state.context.teacher && state.daily.submittedAt));
      const quality = activities.length ? Math.round(activities.filter(activityComplete).length / activities.length * 100) : null;
      const queue = pending.filter(item => item.teacher === name).length
        + pendingPlans.filter(item => item.teacher === name).length
        + evidenceAttention.filter(item => item.activity.teacher === name).length
        + pendingOperations.filter(item => item.dutyOwner === name).length;
      return {
        name, department: person.department, quality, queue,
        submit: submitted ? '已交' : activities.length ? '草稿' : '未開始',
        submitTone: submitted ? 'green' : activities.length ? 'yellow' : 'outline',
        cases: state.studentCases.filter(item => item.teacher === name && item.status !== 'closed').length,
        contacts: state.contacts.filter(item => item.teacher === name && item.status !== 'closed').length,
      };
    });
    const queueItems = [
      ...pending.map(submission => `<div class="risk-row"><span class="risk-level ${submission.status === 'clarify' ? 'high' : 'low'}"></span><div><div class="risk-title">日報${submission.status === 'clarify' ? '待補充' : '待審'}｜${esc(submission.teacher)}</div><div class="risk-meta">${formatDate(submission.date)} · ${esc(truncate(submission.followup || submission.keyResult || '等待主管判讀', 58))}</div></div><button type="button" class="btn btn-small" data-action="open-review" data-submission-id="${submission.id}">查看</button></div>`),
      ...urgentCases.map(item => `<div class="risk-row"><span class="risk-level"></span><div><div class="risk-title">${esc(item.student)}｜${esc(truncate(item.observation, 54))}</div><div class="risk-meta">${esc(item.teacher)} · ${formatDate(item.dueDate)} 追蹤</div></div><button type="button" class="btn btn-small" data-action="open-case-detail" data-case-id="${item.id}">查看</button></div>`),
      ...pendingPlans.map(plan => `<div class="risk-row"><span class="risk-level low"></span><div><div class="risk-title">教案待審｜${esc(plan.title)}</div><div class="risk-meta">${esc(plan.teacher)} · ${planReadiness(plan)}% 完整</div></div><button type="button" class="btn btn-small" data-action="review-plan" data-plan-id="${plan.id}">審查</button></div>`),
      ...pendingOperations.map(operation => `<div class="risk-row"><span class="risk-level ${operation.reviewStatus === 'clarify' ? 'high' : 'low'}"></span><div><div class="risk-title">班務${operation.reviewStatus === 'clarify' ? '待補充' : '待稽核'}｜${formatShortDate(operation.date)} ${esc(operation.room)}</div><div class="risk-meta">${esc(operation.dutyOwner)} · ${operationProofCount(operation)}/4 已附照片 · ${operationExceptionCount(operation)} 項異常</div></div><button type="button" class="btn btn-small" data-action="review-operation" data-operation-id="${operation.id}">稽核</button></div>`),
    ].slice(0, 8);
    const dueTasks = openTasks().slice().sort((a, b) => String(a.dueDate || '').localeCompare(String(b.dueDate || ''))).slice(0, 4);
    const start = addDays(state.daily.date, -6);
    const weeklyActivities = state.activities.filter(item => item.type !== 'lessonprep' && item.date >= start && item.date <= state.daily.date);
    const structure = [
      { label: '課業指導', track: 'academic' },
      { label: '特色課程', track: 'enrichment' },
      { label: '班級／協作', track: 'supplemental' },
    ].map(item => ({ ...item, count: weeklyActivities.filter(activity => activityTrack(activity.type) === item.track).length })).filter(item => item.count);
    return `<div class="page">
      ${pageHead('管理總覽', `${state.context.department} · ${formatDate(state.daily.date)}`, `<button type="button" class="btn" data-action="manager-refresh">${icon('refresh-cw', 16)}<span>更新狀態</span></button>`)}
      <div class="status-strip">
        <div class="status-cell"><div class="status-label">待審日報</div><div class="status-value">${pending.length}</div><div class="status-note">含 ${pending.filter(item => item.status === 'clarify').length} 件待老師補充</div></div>
        <div class="status-cell"><div class="status-label">優先學生事件</div><div class="status-value">${urgentCases.length}</div><div class="status-note">依到期日與追蹤層級排序</div></div>
        <div class="status-cell"><div class="status-label">待審教案</div><div class="status-value">${pendingPlans.length}</div><div class="status-note">教材版本與流程一併審查</div></div>
        <div class="status-cell"><div class="status-label">成果證據／班務</div><div class="status-value">${evidenceAttention.length}/${pendingOperations.length}</div><div class="status-note">待判讀證據 / 待稽核班務</div></div>
      </div>
      <div class="content-grid wide-aside">
        <div class="stack">
          <section class="panel"><div class="panel-head"><div><div class="panel-title">${icon('triangle-alert')}今日需處理</div><div class="panel-subtitle">只顯示真人送出的待處理資料</div></div><button type="button" class="btn btn-small" data-action="navigate" data-route="reviews">全部審查</button></div><div class="panel-body">${queueItems.length ? `<div class="risk-list">${queueItems.join('')}</div>` : '<div class="text-small muted">目前沒有待處理內容。</div>'}</div></section>
          <section class="panel"><div class="panel-head"><div><div class="panel-title">${icon('users-round')}老師工作狀態</div><div class="panel-subtitle">尚無資料時不顯示推估分數</div></div></div><div class="panel-body flush"><div class="table-wrap"><table class="data-table"><thead><tr><th>老師</th><th>日報</th><th>資料完整度</th><th>學生追蹤</th><th>家長承諾</th><th>待審</th></tr></thead><tbody>${teacherRows.map(row => `<tr><td><div class="teacher-status"><span class="status-avatar">${esc(row.name.slice(0, 2))}</span><div><div class="table-primary">${esc(row.name)}</div><div class="table-secondary">${esc(row.department)}</div></div></div></td><td><span class="badge ${row.submitTone}">${row.submit}</span></td><td>${row.quality == null ? '—' : `<div class="metric-row"><span class="metric-value">${row.quality}</span><div class="progress-track"><div class="progress-fill ${row.quality < 70 ? 'danger' : row.quality < 85 ? 'warn' : ''}" style="width:${row.quality}%"></div></div></div>`}</td><td>${row.cases}</td><td>${row.contacts}</td><td>${row.queue ? `<span class="badge red">${row.queue}</span>` : '—'}</td></tr>`).join('')}</tbody></table></div></div></section>
        </div>
        <aside class="stack">
          <section class="panel"><div class="panel-head"><div><div class="panel-title">${icon('calendar-clock')}即將到期</div></div></div><div class="panel-body">${dueTasks.length ? `<div class="timeline">${dueTasks.map(task => `<div class="timeline-item"><div class="timeline-date">${formatShortDate(task.dueDate)}</div><span class="timeline-dot"></span><div class="timeline-content"><div class="text-small text-strong">${esc(task.title)}</div><div class="text-tiny muted">${esc(task.owner)} · ${esc(task.source)}</div></div></div>`).join('')}</div>` : '<div class="text-small muted">目前沒有即將到期事項。</div>'}</div></section>
          <section class="panel"><div class="panel-head"><div><div class="panel-title">${icon('activity')}本週結構</div></div></div><div class="panel-body">${structure.length ? `<div class="summary-list">${structure.map((item, index) => `<div class="summary-line"><span class="summary-index">${index + 1}</span><div><div class="summary-title">${item.label} ${Math.round(item.count / weeklyActivities.length * 100)}%</div><div class="summary-copy">${item.count} 筆工作紀錄</div></div></div>`).join('')}</div>` : '<div class="text-small muted">有真人工作紀錄後才會顯示。</div>'}</div></section>
        </aside>
      </div>
    </div>`;
  }

  function statusBadge(label, tone = 'outline') {
    return `<span class="badge ${tone}">${esc(label)}</span>`;
  }

  function reviewStatusBadge(status) {
    const map = { pending: ['待審查', 'yellow'], clarify: ['待老師補充', 'red'], accepted: ['已採認', 'green'] };
    const item = map[status] || map.pending;
    return `<span class="badge ${item[1]}">${item[0]}</span>`;
  }

  function operationReviewStatus(status) {
    return { pending: ['待主管稽核', 'yellow'], clarify: ['待老師補充', 'red'], accepted: ['已通過', 'green'] }[status] || ['待主管稽核', 'yellow'];
  }

  function renderManagerReviews() {
    const filters = getFilters('reviews', { status: 'open', teacher: 'all', date: '', query: '' });
    const query = filters.query.trim().toLowerCase();
    const submissions = state.submissions.filter(item => {
      const statusMatch = filters.status === 'all' || (filters.status === 'open' ? ['pending', 'clarify'].includes(item.status) : item.status === filters.status);
      const teacherMatch = filters.teacher === 'all' || item.teacher === filters.teacher;
      const dateMatch = !filters.date || item.date === filters.date;
      const queryMatch = !query || `${item.teacher} ${item.keyResult} ${item.followup} ${item.tomorrowPriority}`.toLowerCase().includes(query);
      return statusMatch && teacherMatch && dateMatch && queryMatch;
    }).sort((a, b) => String(b.submittedAt).localeCompare(String(a.submittedAt)));
    return `<div class="page">
      ${pageHead('日報審查', '先看風險、待辦與證據，再回到完整日報', '')}
      <div class="filter-bar"><div class="filter-field"><label for="review-status">狀態</label><select id="review-status" aria-label="日報審查狀態" data-change="view-filter" data-filter-group="reviews" data-filter-key="status"><option value="open" ${filters.status === 'open' ? 'selected' : ''}>待處理</option><option value="all" ${filters.status === 'all' ? 'selected' : ''}>全部</option><option value="pending" ${filters.status === 'pending' ? 'selected' : ''}>待審查</option><option value="clarify" ${filters.status === 'clarify' ? 'selected' : ''}>待老師補充</option><option value="accepted" ${filters.status === 'accepted' ? 'selected' : ''}>已採認</option></select></div><div class="filter-field"><label for="review-teacher">老師</label><select id="review-teacher" aria-label="日報審查老師" data-change="view-filter" data-filter-group="reviews" data-filter-key="teacher"><option value="all">全部老師</option>${state.people.filter(item => item.role === 'teacher').map(item => `<option value="${esc(item.nickname)}" ${filters.teacher === item.nickname ? 'selected' : ''}>${esc(item.nickname)}</option>`).join('')}</select></div><div class="filter-field"><label for="review-date">日期</label><input id="review-date" aria-label="日報審查日期" type="date" value="${esc(filters.date)}" data-change="view-filter" data-filter-group="reviews" data-filter-key="date"></div><div class="filter-field grow"><label for="review-query">搜尋</label><input id="review-query" value="${esc(filters.query)}" data-input="view-filter" data-filter-group="reviews" data-filter-key="query" placeholder="搜尋學生、課程或關鍵字"></div></div>
      <section class="panel mt-16"><div class="panel-body flush"><div class="table-wrap"><table class="data-table"><thead><tr><th>老師／日期</th><th>關鍵成果</th><th>風險與追蹤</th><th>證據</th><th>狀態</th><th></th></tr></thead><tbody>${submissions.map(submission => {
        const activityCount = submission.activityIds.length || (submission.activitySnapshots || []).length;
        const submissionActivities = submission.activityIds.map(id => state.activities.find(item => item.id === id)).filter(Boolean);
        const tracks = dailyTrackStatus(submissionActivities);
        const evidenceCount = submission.activityIds.reduce((sum, id) => {
          const activity = state.activities.find(item => item.id === id);
          return sum + ((activity && activity.evidence) || []).length;
        }, 0);
        const prepRequiredCount = submissionActivities.filter(activity => activity.type === 'lessonprep' || activityNeedsPrepSource(activity.type)).length;
        const prepCount = submissionActivities.filter(activityPreparationReady).filter(activity => activity.type === 'lessonprep' || activityNeedsPrepSource(activity.type)).length;
        return `<tr><td><div class="teacher-status"><span class="status-avatar">${esc(submission.teacher.slice(0, 2))}</span><div><div class="table-primary">${esc(submission.teacher)}</div><div class="table-secondary">${formatDate(submission.date)} · ${formatTime(submission.submittedAt)}</div></div></div></td><td><div class="table-primary">${esc(truncate(submission.keyResult, 60))}</div><div class="table-secondary">學科內 ${tracks.academic.count}／學科外 ${tracks.enrichment.count} · 共 ${activityCount} 筆</div></td><td>${esc(truncate(submission.followup, 48))}</td><td><span class="badge ${prepCount >= prepRequiredCount && evidenceCount >= activityCount ? 'blue' : 'red'}">備課 ${prepCount}/${prepRequiredCount} · 成果 ${evidenceCount}</span></td><td>${reviewStatusBadge(submission.status)}</td><td><button type="button" class="btn btn-small" data-action="open-review" data-submission-id="${submission.id}">審查</button></td></tr>`;
      }).join('') || '<tr><td colspan="6" class="muted">沒有符合條件的日報</td></tr>'}</tbody></table></div></div></section>
    </div>`;
  }

  function renderEvidenceCard(item) {
    const activity = item.activity;
    const evidence = item.evidence;
    const attachments = evidenceAttachments(evidence);
    const primary = evidencePrimaryAttachment(evidence);
    const status = evidence.status === 'accepted' ? ['已採認', 'green'] : evidence.status === 'clarify' ? ['待補充', 'red'] : ['待審查', 'yellow'];
    return `<article class="evidence-card">
      <div class="evidence-thumb">${primary?.dataUrl ? `<img src="${primary.dataUrl}" alt="${esc(evidence.title)}">${renderPins(evidence.pins)}` : icon(primary?.mimeType === 'application/pdf' ? 'file-text' : evidence.type === 'plan_asset' ? 'archive' : 'image', 44)}<span class="badge ${evidence.quality >= 80 ? 'green' : 'red'} quality-pill">完整度 ${evidence.quality}</span>${attachments.length > 1 ? `<span class="badge blue evidence-count-pill">${icon('images', 12)}${attachments.length} 份</span>` : ''}</div>
      <div class="evidence-card-body"><div class="evidence-title">${esc(evidence.title)}</div><div class="evidence-caption">${esc(truncate(evidence.claim, 82))}</div><div class="evidence-meta"><span class="badge ${status[1]}">${status[0]}</span><button type="button" class="btn btn-small" data-action="inspect-evidence" data-activity-id="${activity.id}" data-evidence-id="${evidence.id}">判讀</button></div></div>
    </article>`;
  }

  function renderManagerEvidence() {
    const allItems = allEvidence();
    const prepItems = state.activities.filter(activity => activity.type === 'lessonprep').flatMap(activity => (activity.prepEvidence || []).map(evidence => ({ activity, evidence })));
    const filters = getFilters('evidence', { type: 'all', status: 'open', kpi: 'all', query: '' });
    const query = filters.query.trim().toLowerCase();
    const evidenceItems = allItems.filter(item => {
      const config = ACTIVITY_TYPES[item.activity.type] || ACTIVITY_TYPES.tutoring;
      const typeMatch = filters.type === 'all' || item.evidence.type === filters.type;
      const statusMatch = filters.status === 'all' || (filters.status === 'open' ? item.evidence.status !== 'accepted' : item.evidence.status === filters.status);
      const kpiMatch = filters.kpi === 'all' || config.kpi === filters.kpi;
      const queryMatch = !query || `${item.activity.teacher} ${item.activity.title} ${item.evidence.title} ${item.evidence.claim} ${(item.evidence.students || []).join(' ')}`.toLowerCase().includes(query);
      return typeMatch && statusMatch && kpiMatch && queryMatch;
    });
    const ready = allItems.filter(item => item.evidence.quality >= 80).length;
    const accepted = allItems.filter(item => item.evidence.status === 'accepted').length;
    return `<div class="page">
      ${pageHead('證據中心', '從「這份資料證明什麼」進入，不用逐張猜測照片內容', '')}
      <div class="status-strip"><div class="status-cell"><div class="status-label">備課參考資料</div><div class="status-value">${prepItems.length}</div><div class="status-note">集中保留在備課檔案</div></div><div class="status-cell"><div class="status-label">成果證據完整</div><div class="status-value">${ready}/${allItems.length}</div><div class="status-note">欄位完整度達 80</div></div><div class="status-cell"><div class="status-label">主管已採認</div><div class="status-value">${accepted}</div><div class="status-note">採認與自動完整度分開</div></div><div class="status-cell"><div class="status-label">待補充</div><div class="status-value">${allItems.filter(item => item.evidence.status === 'clarify').length}</div><div class="status-note">已回到老師待辦</div></div></div>
      <div class="filter-bar"><div class="filter-field"><label for="evidence-type-filter">證據類型</label><select id="evidence-type-filter" aria-label="證據類型篩選" data-change="view-filter" data-filter-group="evidence" data-filter-key="type"><option value="all">全部</option>${Object.entries(EVIDENCE_TYPES).map(([key, label]) => `<option value="${key}" ${filters.type === key ? 'selected' : ''}>${esc(label)}</option>`).join('')}</select></div><div class="filter-field"><label for="evidence-status-filter">主管狀態</label><select id="evidence-status-filter" aria-label="證據主管狀態" data-change="view-filter" data-filter-group="evidence" data-filter-key="status"><option value="open" ${filters.status === 'open' ? 'selected' : ''}>待處理</option><option value="all" ${filters.status === 'all' ? 'selected' : ''}>全部</option><option value="pending" ${filters.status === 'pending' ? 'selected' : ''}>待審查</option><option value="clarify" ${filters.status === 'clarify' ? 'selected' : ''}>待補充</option><option value="accepted" ${filters.status === 'accepted' ? 'selected' : ''}>已採認</option></select></div><div class="filter-field"><label for="evidence-kpi-filter">KPI 支持項目</label><select id="evidence-kpi-filter" aria-label="證據 KPI 支持項目" data-change="view-filter" data-filter-group="evidence" data-filter-key="kpi"><option value="all">全部</option>${['課業指導', '專案課程', '班級經營', '親師溝通', '個人態度與表現', '班級環境整潔'].map(label => `<option value="${label}" ${filters.kpi === label ? 'selected' : ''}>${label}</option>`).join('')}</select></div><div class="filter-field grow"><label for="evidence-query">搜尋</label><input id="evidence-query" value="${esc(filters.query)}" data-input="view-filter" data-filter-group="evidence" data-filter-key="query" placeholder="搜尋老師、課程、學生或證明主張"></div></div>
      <section class="panel mt-16"><div class="panel-head"><div><div class="panel-title">${icon('scan-search')}${filters.status === 'open' ? '待判讀證據' : '證據清單'}</div><div class="panel-subtitle">${evidenceItems.length} 份</div></div></div><div class="panel-body">${evidenceItems.length ? `<div class="evidence-grid">${evidenceItems.map(renderEvidenceCard).join('')}</div>` : renderEmpty(allItems.length ? 'search-x' : 'folder-search-2', allItems.length ? '沒有符合篩選的證據' : '目前沒有證據', allItems.length ? '調整主管狀態、證據類型、KPI 或搜尋條件後再試一次。' : '老師送出關聯證據後會顯示在這裡。')}</div></section>
    </div>`;
  }

  function renderManagerOperations() {
    const filters = getFilters('operationsReview', { status: 'open', owner: 'all' });
    const allRecords = operationRecords().filter(item => item.confirmedAt).sort((a, b) => String(b.date).localeCompare(String(a.date)));
    const records = allRecords.filter(item => {
      const statusMatch = filters.status === 'all' || (filters.status === 'open' ? ['pending', 'clarify'].includes(item.reviewStatus) : item.reviewStatus === filters.status);
      const ownerMatch = filters.owner === 'all' || item.dutyOwner === filters.owner;
      return statusMatch && ownerMatch;
    });
    const completeRecords = allRecords.filter(item => operationsComplete(item, false));
    const pending = allRecords.filter(item => item.confirmedAt && item.reviewStatus === 'pending').length;
    const clarify = allRecords.filter(item => item.reviewStatus === 'clarify').length;
    const exceptions = allRecords.reduce((sum, item) => sum + operationExceptionCount(item), 0);
    const owners = [...new Set(allRecords.map(item => item.dutyOwner))];
    return `<div class="page">
      ${pageHead('班務稽核', '逐項判讀正常與異常證據，退回內容直接形成老師待辦', '')}
      <div class="status-strip"><div class="status-cell"><div class="status-label">逐項完整</div><div class="status-value">${completeRecords.length}/${allRecords.length}</div><div class="status-note">四面向均有照片與說明</div></div><div class="status-cell"><div class="status-label">待主管稽核</div><div class="status-value">${pending}</div><div class="status-note">老師已確認送出</div></div><div class="status-cell"><div class="status-label">待老師補充</div><div class="status-value">${clarify}</div><div class="status-note">已建立具體補件待辦</div></div><div class="status-cell"><div class="status-label">異常面向</div><div class="status-value">${exceptions}</div><div class="status-note">需檢查處理、接手與期限</div></div></div>
      <div class="filter-bar"><div class="filter-field"><label for="operation-review-status">稽核狀態</label><select id="operation-review-status" data-change="view-filter" data-filter-group="operationsReview" data-filter-key="status"><option value="open" ${filters.status === 'open' ? 'selected' : ''}>待處理</option><option value="all" ${filters.status === 'all' ? 'selected' : ''}>全部</option><option value="pending" ${filters.status === 'pending' ? 'selected' : ''}>待主管稽核</option><option value="clarify" ${filters.status === 'clarify' ? 'selected' : ''}>待老師補充</option><option value="accepted" ${filters.status === 'accepted' ? 'selected' : ''}>已通過</option></select></div><div class="filter-field"><label for="operation-review-owner">值日老師</label><select id="operation-review-owner" data-change="view-filter" data-filter-group="operationsReview" data-filter-key="owner"><option value="all">全部老師</option>${owners.map(owner => `<option value="${esc(owner)}" ${filters.owner === owner ? 'selected' : ''}>${esc(owner)}</option>`).join('')}</select></div></div>
      <section class="panel mt-16"><div class="panel-head"><div><div class="panel-title">${icon('clipboard-check')}班務紀錄</div><div class="panel-subtitle">${records.length} 筆符合條件</div></div></div><div class="panel-body flush"><div class="table-wrap"><table class="data-table operation-review-table"><thead><tr><th>日期／教室</th><th>值日老師</th><th>逐項證據</th><th>正常／異常</th><th>主管狀態</th><th></th></tr></thead><tbody>${records.map(item => {
        const review = operationReviewStatus(item.reviewStatus);
        const exceptionsForItem = operationExceptionCount(item);
        return `<tr><td><div class="table-primary">${formatDate(item.date)}</div><div class="table-secondary">${esc(item.room)}</div></td><td><div class="teacher-status"><span class="status-avatar">${esc(item.dutyOwner.slice(0, 2))}</span><div><div class="table-primary">${esc(item.dutyOwner)}</div><div class="table-secondary">${item.confirmedAt ? `${formatTime(item.confirmedAt)} 送出` : '尚未送出'}</div></div></div></td><td><span class="badge ${operationProofCount(item) === 4 ? 'green' : 'red'}">${operationProofCount(item)}/4 已附照片</span></td><td><span class="badge ${exceptionsForItem ? 'red' : 'green'}">${4 - exceptionsForItem} 正常／${exceptionsForItem} 異常</span></td><td><span class="badge ${review[1]}">${item.confirmedAt ? review[0] : '老師草稿'}</span></td><td><button type="button" class="btn btn-small" data-action="review-operation" data-operation-id="${item.id}" ${!item.confirmedAt ? 'disabled' : ''}>${icon('scan-search', 14)}稽核</button></td></tr>`;
      }).join('') || '<tr><td colspan="6" class="muted">沒有符合條件的班務紀錄</td></tr>'}</tbody></table></div></div></section>
    </div>`;
  }

  function renderOperationReview(operation) {
    const review = operationReviewStatus(operation.reviewStatus);
    const proof = operation.evidenceByCheck || {};
    const exceptions = operationExceptionCount(operation);
    const threadKey = feedbackThreadKey('operation', operation.id);
    return `<div class="stack">
      <div class="notice-band ${exceptions ? 'danger' : 'success'}">${icon(exceptions ? 'triangle-alert' : 'badge-check', 19)}<div><div class="notice-title">${exceptions ? `${exceptions} 個面向有異常，需確認處理閉環` : '四個面向皆回報正常'}</div><div class="notice-copy">${esc(operation.room)} · ${esc(operation.dutyOwner)} · ${formatDate(operation.date)} ${formatTime(operation.confirmedAt)}</div></div>${statusBadge(review[0], review[1])}</div>
      <div class="operation-review-grid">${Object.entries(OPERATION_CHECKS).map(([key, config], index) => {
        const item = proof[key] || {};
        const isException = item.status === 'exception';
        return `<article class="operation-review-card ${isException ? 'is-exception' : ''}"><div class="operation-review-card-head"><span class="operation-proof-index">${index + 1}</span><div><strong>${esc(config.label)}</strong><small>${isException ? '異常面向' : '正常面向'}</small></div>${statusBadge(isException ? '異常' : '正常', isException ? 'red' : 'green')}</div><div class="operation-review-media">${item.dataUrl ? `<img src="${item.dataUrl}" alt="${esc(config.label)}班務證據">` : `<span>${icon('image', 32)}</span><div><strong>${esc(item.fileName || '缺少照片')}</strong><small>${esc(item.size || '尚無可預覽原圖')}</small></div>`}</div>${isException ? `<div class="operation-review-copy danger"><span>異常狀況與處理安排</span><p>${esc(item.action || '尚未填寫')}</p></div>` : ''}</article>`;
      }).join('')}</div>
      ${renderFeedbackThread(threadKey)}
      <section class="panel"><div class="panel-head"><div><div class="panel-title">${icon('clipboard-check')}本次稽核結論</div><div class="panel-subtitle">退回時請指出面向、照片或缺少的交接資訊</div></div></div><div class="panel-body"><div class="form-field"><label class="form-label" for="operation-review-feedback">通過說明或補充要求</label><textarea id="operation-review-feedback" placeholder="例：教具櫃照片看不到右側缺件標示；請補拍近照並填入行政接手人與預計補齊日。"></textarea></div></div></section>
    </div>`;
  }

  function renderManagerStudents() {
    const filters = getFilters('students', { urgency: 'all', status: 'open', query: '' });
    const query = filters.query.trim().toLowerCase();
    const cases = state.studentCases.filter(item => {
      const urgencyMatch = filters.urgency === 'all' || item.urgency === filters.urgency;
      const statusMatch = filters.status === 'all' || item.status === filters.status;
      const queryMatch = !query || `${item.student} ${item.teacher} ${item.observation} ${item.intervention}`.toLowerCase().includes(query);
      return urgencyMatch && statusMatch && queryMatch;
    });
    return `<div class="page">
      ${pageHead('學生追蹤', '跨老師、跨日期追蹤介入、結果與親師同步', `<button type="button" class="btn" data-action="export-students">${icon('file-down', 16)}<span>匯出追蹤表</span></button>`)}
      <div class="filter-bar"><div class="filter-field"><label for="student-urgency-filter">優先度</label><select id="student-urgency-filter" aria-label="學生追蹤優先度" data-change="view-filter" data-filter-group="students" data-filter-key="urgency"><option value="all">全部</option><option value="high" ${filters.urgency === 'high' ? 'selected' : ''}>高優先</option><option value="medium" ${filters.urgency === 'medium' ? 'selected' : ''}>持續追蹤</option><option value="low" ${filters.urgency === 'low' ? 'selected' : ''}>一般</option></select></div><div class="filter-field"><label for="student-status-filter">狀態</label><select id="student-status-filter" aria-label="學生追蹤狀態" data-change="view-filter" data-filter-group="students" data-filter-key="status"><option value="open" ${filters.status === 'open' ? 'selected' : ''}>追蹤中</option><option value="all" ${filters.status === 'all' ? 'selected' : ''}>全部</option><option value="closed" ${filters.status === 'closed' ? 'selected' : ''}>已結案</option></select></div><div class="filter-field grow"><label for="student-query-filter">搜尋</label><input id="student-query-filter" value="${esc(filters.query)}" data-input="view-filter" data-filter-group="students" data-filter-key="query" placeholder="搜尋學生或觀察內容"></div></div>
      <section class="panel mt-16"><div class="panel-body flush"><div class="table-wrap"><table class="data-table"><thead><tr><th>學生</th><th>負責老師</th><th>目前觀察</th><th>最近介入</th><th>家長同步</th><th>下次追蹤</th><th></th></tr></thead><tbody>${cases.length ? cases.map(item => `<tr><td><div class="table-primary">${esc(item.student)}</div><div class="table-secondary"><span class="status-dot ${item.urgency === 'high' ? 'bad' : item.urgency === 'medium' ? 'warn' : 'good'}"></span>${item.urgency === 'high' ? '高優先' : item.urgency === 'medium' ? '持續追蹤' : '一般'}</div></td><td>${esc(item.teacher)}</td><td>${esc(truncate(item.observation, 58))}</td><td>${esc(truncate(item.intervention, 52))}</td><td><span class="badge ${item.parentContacted ? 'green' : 'yellow'}">${item.parentContacted ? '已同步' : '待同步'}</span></td><td>${formatDate(item.dueDate)}</td><td><button type="button" class="btn btn-small" data-action="open-case-detail" data-case-id="${item.id}">查看</button></td></tr>`).join('') : '<tr><td colspan="7" class="muted">沒有符合條件的學生追蹤</td></tr>'}</tbody></table></div></div></section>
    </div>`;
  }

  function renderPlanReviews() {
    const filters = getFilters('planReview', { status: 'review', teacher: 'all', query: '' });
    const query = filters.query.trim().toLowerCase();
    const plans = state.lessonPlans.filter(plan => {
      const statusMatch = filters.status === 'all' || plan.status === filters.status;
      const teacherMatch = filters.teacher === 'all' || plan.teacher === filters.teacher;
      const queryMatch = !query || `${plan.title} ${plan.className} ${plan.courseType} ${plan.teacher}`.toLowerCase().includes(query);
      return statusMatch && teacherMatch && queryMatch;
    });
    return `<div class="page">
      ${pageHead('教案審查', '教學流程、學習檢核與附件版本集中判讀', '')}
      <div class="filter-bar"><div class="filter-field"><label for="plan-review-status">狀態</label><select id="plan-review-status" aria-label="教案審查狀態" data-change="view-filter" data-filter-group="planReview" data-filter-key="status"><option value="review" ${filters.status === 'review' ? 'selected' : ''}>待審查</option><option value="all" ${filters.status === 'all' ? 'selected' : ''}>全部</option><option value="approved" ${filters.status === 'approved' ? 'selected' : ''}>已核准</option><option value="changes" ${filters.status === 'changes' ? 'selected' : ''}>退回補件</option><option value="draft" ${filters.status === 'draft' ? 'selected' : ''}>草稿</option></select></div><div class="filter-field"><label for="plan-review-teacher">老師</label><select id="plan-review-teacher" aria-label="教案審查老師" data-change="view-filter" data-filter-group="planReview" data-filter-key="teacher"><option value="all">全部老師</option>${state.people.filter(item => item.role === 'teacher').map(item => `<option value="${esc(item.nickname)}" ${filters.teacher === item.nickname ? 'selected' : ''}>${esc(item.nickname)}</option>`).join('')}</select></div><div class="filter-field grow"><label for="plan-review-query">搜尋</label><input id="plan-review-query" value="${esc(filters.query)}" data-input="view-filter" data-filter-group="planReview" data-filter-key="query" placeholder="搜尋教案、班級或課程類型"></div></div>
      <section class="panel mt-16"><div class="panel-body flush"><div class="table-wrap"><table class="data-table"><thead><tr><th>教案</th><th>老師</th><th>流程時間</th><th>教材附件</th><th>完整度</th><th>狀態</th><th></th></tr></thead><tbody>${plans.map(plan => {
        const readiness = planReadiness(plan); const status = planStatus(plan); const total = (plan.flow || []).reduce((sum, item) => sum + Number(item.minutes || 0), 0);
        return `<tr><td><div class="table-primary">${esc(plan.title)}</div><div class="table-secondary">${esc(plan.version)} · ${esc(plan.className)}</div></td><td>${esc(plan.teacher)}</td><td><span class="badge ${total === Number(plan.duration) ? 'green' : 'red'}">${total}/${plan.duration} 分</span></td><td>${(plan.materials || []).length} 份</td><td><div class="metric-row"><span class="metric-value">${readiness}</span><div class="progress-track"><div class="progress-fill ${readiness < 80 ? 'warn' : ''}" style="width:${readiness}%"></div></div></div></td><td><span class="badge ${status[1]}">${status[0]}</span></td><td><button type="button" class="btn btn-small" data-action="review-plan" data-plan-id="${plan.id}">審查</button></td></tr>`;
      }).join('') || '<tr><td colspan="7" class="muted">沒有符合條件的教案</td></tr>'}</tbody></table></div></div></section>
    </div>`;
  }

  function renderTeamStatus() {
    const teachers = state.people.filter(person => person.role === 'teacher');
    const tutoring = state.activities.filter(activity => activity.type === 'tutoring');
    const projects = state.activities.filter(activity => ['project', 'robotics', 'portfolio'].includes(activity.type));
    const classroomActivities = state.activities.filter(activity => ['sel', 'classroom'].includes(activity.type));
    const support = state.activities.filter(activity => activity.type === 'support');
    const contacts = state.contacts || [];
    const operations = operationRecords().filter(operation => operation.confirmedAt);
    const rate = (items, predicate) => items.length ? Math.round(items.filter(predicate).length / items.length * 100) : null;
    const activitySource = items => `${items.length} 筆工作 · ${items.reduce((sum, activity) => sum + (activity.evidence || []).filter(evidence => evidence.status === 'accepted').length, 0)} 份採認證據`;
    const classroomTotal = classroomActivities.length + state.studentCases.length;
    const classroomComplete = classroomActivities.filter(activityComplete).length + state.studentCases.filter(item => item.observation && item.intervention && item.outcome && item.nextAction && item.dueDate).length;
    const scoreRows = [
      { label: '課業指導', value: rate(tutoring, activityComplete), source: tutoring.length ? activitySource(tutoring) : '尚無資料' },
      { label: '專案課程', value: rate(projects, activityComplete), source: projects.length || state.lessonPlans.length ? `${projects.length} 筆工作 · ${state.lessonPlans.length} 份教案` : '尚無資料' },
      { label: '班級經營', value: classroomTotal ? Math.round(classroomComplete / classroomTotal * 100) : null, source: classroomTotal ? `${classroomActivities.length} 筆活動 · ${state.studentCases.length} 件學生追蹤` : '尚無資料' },
      { label: '親師溝通', value: rate(contacts, item => item.summary && item.nextAction), source: contacts.length ? `${contacts.length} 次聯繫 · ${contacts.filter(item => item.status !== 'closed').length} 項待追` : '尚無資料' },
      { label: '態度與表現', value: rate(support, activityComplete), source: support.length ? `${support.length} 筆教室協作紀錄` : '尚無資料' },
      { label: '環境整潔', value: rate(operations, operation => operationsComplete(operation, false)), source: operations.length ? `${operations.length} 筆已送出班務` : '尚無資料' },
    ];
    const teamRows = teachers.map(person => {
      const activities = state.activities.filter(activity => activity.teacher === person.nickname && activity.type !== 'lessonprep');
      return {
        name: person.nickname,
        activities: activities.length,
        cases: state.studentCases.filter(item => item.teacher === person.nickname && item.status !== 'closed').length,
        tasks: state.tasks.filter(item => item.owner === person.nickname && item.status !== 'done').length,
        plans: state.lessonPlans.filter(plan => plan.teacher === person.nickname).length,
        quality: rate(activities, activityComplete),
      };
    });
    const pendingItems = [
      ...state.submissions.filter(item => ['pending', 'clarify'].includes(item.status)).map(item => ({ title: `${item.teacher}｜${item.status === 'clarify' ? '日報待補充' : '日報待審查'}`, dueDate: item.date })),
      ...state.studentCases.filter(item => item.status !== 'closed').map(item => ({ title: `${item.student}｜學生追蹤`, dueDate: item.dueDate })),
      ...state.lessonPlans.filter(item => ['review', 'changes'].includes(item.status)).map(item => ({ title: `${item.title}｜${item.status === 'changes' ? '教案待補件' : '教案待審查'}`, dueDate: item.updatedAt })),
      ...state.tasks.filter(item => item.status !== 'done').map(item => ({ title: item.title, dueDate: item.dueDate })),
    ].sort((a, b) => String(a.dueDate || '').localeCompare(String(b.dueDate || ''))).slice(0, 5);
    return `<div class="page">
      ${pageHead('團隊狀態', '完成率、資料品質與績效判斷分開呈現', `<span class="badge outline">${icon('calendar-range', 15)}<span>${state.daily.date.slice(0, 4)} 年 ${Number(state.daily.date.slice(5, 7))} 月</span></span>`)}
      <div class="notice-band info">${icon('scale', 19)}<div><div class="notice-title">資料完整度不是績效分數</div><div class="notice-copy">系統只提示證據是否足以判讀；最終 KPI 由主管依成果、影響與持續性做專業評核。</div></div></div>
      <section class="panel"><div class="panel-head"><div><div class="panel-title">${icon('chart-no-axes-combined')}部門評核準備度</div><div class="panel-subtitle">來源筆數可追溯至原始事件與主管觀察</div></div></div><div class="panel-body"><div class="score-matrix">${scoreRows.map(item => `<div class="score-cell"><div class="score-label">${esc(item.label)}</div><div class="score-main">${item.value === null ? '—' : item.value}</div><div class="score-source">${esc(item.source)}</div></div>`).join('')}</div></div></section>
      <div class="content-grid mt-16"><section class="panel"><div class="panel-head"><div><div class="panel-title">${icon('gauge')}團隊工作量</div></div></div><div class="panel-body flush"><div class="table-wrap"><table class="data-table"><thead><tr><th>老師</th><th>工作事件</th><th>學生案件</th><th>待辦</th><th>教案</th><th>資料品質</th></tr></thead><tbody>${teamRows.map(row => `<tr><td><div class="table-primary">${esc(row.name)}</div></td><td>${row.activities}</td><td>${row.cases}</td><td>${row.tasks}</td><td>${row.plans}</td><td>${row.quality === null ? '—' : `<div class="metric-row"><span class="metric-value">${row.quality}</span><div class="progress-track"><div class="progress-fill ${row.quality < 70 ? 'danger' : row.quality < 85 ? 'warn' : ''}" style="width:${row.quality}%"></div></div></div>`}</td></tr>`).join('')}</tbody></table></div></div></section><aside class="panel"><div class="panel-head"><div><div class="panel-title">${icon('clipboard-check')}待完成事項</div></div></div><div class="panel-body">${pendingItems.length ? `<div class="check-list">${pendingItems.map((item, index) => `<div class="check-item pending"><span class="check-icon">${index + 1}</span><span>${esc(item.title)}${item.dueDate ? ` · ${formatShortDate(item.dueDate)}` : ''}</span></div>`).join('')}</div>` : '<div class="text-small muted">目前沒有待完成事項。</div>'}</div></aside></div>
    </div>`;
  }

  function prepCourseType(activity) {
    return {
      '安親課業指導': '安親輔導',
      '專案／選修課程': '專案選修',
      '機器人／STEAM 課程': '專案選修',
      '學習歷程': '學習歷程',
      'SEL 聊心室': 'SEL 聊心室',
    }[activity?.details?.targetCourse] || '專案選修';
  }

  function prepVersionCode(activity, fallback = 'v0.1') {
    const raw = String(activity?.details?.version || '').trim();
    return raw.match(/v\d+(?:\.\d+)*/i)?.[0] || raw || fallback;
  }

  function syncPlanIdentityFromPrep(plan, activity) {
    if (!plan || !activity || activity.type !== 'lessonprep') return plan;
    plan.title = activity.title || plan.title;
    plan.className = activity.className || plan.className;
    plan.courseType = prepCourseType(activity);
    plan.version = prepVersionCode(activity, plan.version);
    return plan;
  }

  function renderPlanForm(plan) {
    const value = plan || {
      id: '', teacher: state.context.teacher, title: '', courseType: '安親輔導', className: '', duration: 60, version: 'v0.1',
      updatedAt: state.daily.date, status: 'draft', sourceActivityId: '', learnerContext: '', objectives: '', assessment: '',
      differentiation: '', safetyPrivacy: '', reflection: '', flow: [], materials: [], managerFeedback: '',
    };
    const sourceActivity = prepActivityForPlan(value) || (returnActivityDraft?.type === 'lessonprep' ? returnActivityDraft : null);
    planDraft = {
      ...clone(value),
      ...(sourceActivity ? {
        title: sourceActivity.title || value.title,
        courseType: prepCourseType(sourceActivity),
        className: sourceActivity.className || value.className,
        version: prepVersionCode(sourceActivity, value.version),
      } : {}),
    };
    planDraft.flow = clone(value.flow || []);
    planDraft.materials = clone(value.materials || []);
    const readiness = planReadiness(planDraft);
    const totalMinutes = planDraft.flow.reduce((sum, item) => sum + Number(item.minutes || 0), 0);
    if (sourceActivity?.id) planDraft.sourceActivityId = sourceActivity.id;
    const basicFields = sourceActivity ? `
      <input type="hidden" name="title" value="${esc(planDraft.title)}">
      <input type="hidden" name="courseType" value="${esc(planDraft.courseType)}">
      <input type="hidden" name="className" value="${esc(planDraft.className)}">
      <input type="hidden" name="version" value="${esc(planDraft.version)}">
      <div class="prep-source-facts plan-linked-facts"><span><strong>備課檔案</strong>${esc(planDraft.title)}</span><span><strong>課程類型</strong>${esc(sourceActivity.details?.targetCourse || planDraft.courseType)}</span><span><strong>建立日期</strong>${formatDate(sourceActivity.date)}</span><span><strong>適用對象</strong>${esc(planDraft.className || '跨班適用')}</span></div>
      <div class="form-grid mt-16">
        <div class="form-field"><label class="form-label" for="plan-duration">總時數（分鐘） <span class="required">*</span></label><input id="plan-duration" type="number" min="10" step="5" name="duration" value="${Number(planDraft.duration || 60)}" required></div>
        <div class="form-field span-2"><label class="form-label" for="plan-context">學習者背景與先備能力 <span class="required">*</span></label><textarea id="plan-context" name="learnerContext" required>${esc(planDraft.learnerContext)}</textarea></div>
        <div class="form-field span-2"><label class="form-label" for="plan-objectives">可觀察學習目標 <span class="required">*</span></label><textarea id="plan-objectives" name="objectives" placeholder="每項目標使用「學生能……」並可被檢核。" required>${esc(planDraft.objectives)}</textarea></div>
      </div>` : `<div class="form-grid mt-16">
        <div class="form-field span-2"><label class="form-label" for="plan-title">教學設計名稱 <span class="required">*</span></label><input id="plan-title" name="title" value="${esc(planDraft.title)}" required></div>
        <div class="form-field"><label class="form-label" for="plan-course">課程類型</label><select id="plan-course" name="courseType">${['安親輔導', '專案選修', '學習歷程', 'SEL 聊心室', '暑期營隊'].map(type => `<option ${planDraft.courseType === type ? 'selected' : ''}>${type}</option>`).join('')}</select></div>
        <div class="form-field"><label class="form-label" for="plan-class">班級／對象 <span class="required">*</span></label><input id="plan-class" name="className" value="${esc(planDraft.className)}" required></div>
        <div class="form-field"><label class="form-label" for="plan-duration">總時數（分鐘） <span class="required">*</span></label><input id="plan-duration" type="number" min="10" step="5" name="duration" value="${Number(planDraft.duration || 60)}" required></div>
        <div class="form-field"><label class="form-label" for="plan-version">版本 <span class="required">*</span></label><input id="plan-version" name="version" value="${esc(planDraft.version)}" placeholder="例：v1.0" required></div>
        <div class="form-field span-2"><label class="form-label" for="plan-context">學習者背景與先備能力 <span class="required">*</span></label><textarea id="plan-context" name="learnerContext" required>${esc(planDraft.learnerContext)}</textarea></div>
        <div class="form-field span-2"><label class="form-label" for="plan-objectives">可觀察學習目標 <span class="required">*</span></label><textarea id="plan-objectives" name="objectives" placeholder="每項目標使用「學生能……」並可被檢核。" required>${esc(planDraft.objectives)}</textarea></div>
      </div>`;
    return `<form id="plan-form" data-form="plan">
      <input type="hidden" name="id" value="${esc(value.id)}">
      <input type="hidden" name="sourceActivityId" value="${esc(sourceActivity?.id || value.sourceActivityId || '')}">
      <div class="notice-band ${sourceActivity ? 'success' : 'danger'}">${icon(sourceActivity ? 'link-2' : 'triangle-alert', 19)}<div><div class="notice-title">${sourceActivity ? '正在編輯這份備課檔案的教案內容與教材' : '這是舊版獨立資料，尚未整併至備課教案建檔'}</div><div class="notice-copy">${sourceActivity ? '儲存後會直接回到同一份備課檔案，不會另外建立第二筆資料。' : '既有資料可繼續編輯；新的內容請一律從「備課教案建檔」建立。'}</div></div></div>
      <div class="section-divider"></div>
      <div class="flex justify-between items-center gap-12"><div><h3 class="section-title mb-0">${icon('file-pen-line')}教案內容</h3><div class="section-copy mb-0">${sourceActivity ? '檔案名稱、課程類型與建立日期已由備課檔案帶入。' : '補齊教案內容的基本資料。'}</div></div><div class="quality-score ${readiness >= 100 ? 'good' : readiness >= 75 ? 'warn' : 'bad'}">${readiness}%</div></div>
      ${basicFields}
      <div class="section-divider"></div>
      <div class="flex justify-between items-center gap-12"><div><h3 class="section-title mb-0">${icon('route')}課程流程</h3><div class="section-copy mb-0">目前 ${totalMinutes}/${Number(planDraft.duration || 0)} 分鐘，總和需與課程時數一致。</div></div><button type="button" class="btn btn-small" data-action="add-plan-flow">${icon('plus', 14)}新增階段</button></div>
      <div class="flow-list mt-12" id="plan-flow-list">${planDraft.flow.length ? planDraft.flow.map(renderFlowRow).join('') : '<div class="empty-state"><div><div class="empty-icon">' + icon('list-plus', 22) + '</div><div class="empty-title">尚無課程流程</div><div class="empty-copy">教學設計至少需要兩個階段，並包含師生活動與檢核點。</div></div></div>'}</div>
      <div class="section-divider"></div>
      <div class="form-grid">
        <div class="form-field span-2"><label class="form-label" for="plan-assessment">學習檢核與達成標準 <span class="required">*</span></label><textarea id="plan-assessment" name="assessment" placeholder="寫出檢核方式、作品／表現與通過標準。" required>${esc(value.assessment)}</textarea></div>
        <div class="form-field span-2"><label class="form-label" for="plan-diff">差異化與支持方式 <span class="required">*</span></label><textarea id="plan-diff" name="differentiation" placeholder="基礎支持、進階挑戰或個別調整。" required>${esc(value.differentiation)}</textarea></div>
        <div class="form-field span-2"><label class="form-label" for="plan-safety">安全與隱私確認 <span class="required">*</span></label><textarea id="plan-safety" name="safetyPrivacy" placeholder="器材安全、影像使用與個資處理。" required>${esc(value.safetyPrivacy)}</textarea></div>
      </div>
      <div class="section-divider"></div>
      <div class="flex justify-between items-center gap-12"><div><h3 class="section-title mb-0">${icon('paperclip')}正式教材附件</h3><div class="section-copy mb-0">集中放置實際授課會使用的 PPT、學習單、教師指引與評量工具。</div></div><label class="btn btn-small" for="plan-material-file">${icon('upload', 14)}加入附件</label><input class="sr-only" id="plan-material-file" type="file" data-change="plan-material" multiple accept=".pdf,.ppt,.pptx,.doc,.docx,.xls,.xlsx,image/*"></div>
      <div class="material-list mt-12" id="plan-material-list">${renderMaterials(planDraft.materials)}</div>
      <div class="section-divider"></div>
      <div class="form-field"><label class="form-label" for="plan-reflection">備課備註</label><textarea id="plan-reflection" name="reflection" placeholder="可補充這份設計的使用提醒；沒有可留白。">${esc(value.reflection)}</textarea><div class="field-hint">選填；實際授課後的效果與調整請回到當日工作紀錄填寫。</div></div>
    </form>`;
  }

  function renderFlowRow(flow, index) {
    return `<div class="flow-row" data-flow-row data-flow-id="${esc(flow.id)}">
      <input name="flow_stage_${index}" value="${esc(flow.stage)}" placeholder="階段" aria-label="第 ${index + 1} 段名稱" required>
      <input type="number" min="1" name="flow_minutes_${index}" value="${Number(flow.minutes || 0)}" placeholder="分鐘" aria-label="第 ${index + 1} 段分鐘數" required>
      <textarea name="flow_teacher_${index}" placeholder="老師做什麼" aria-label="第 ${index + 1} 段老師活動" required>${esc(flow.teacher)}</textarea>
      <textarea name="flow_student_${index}" placeholder="學生做什麼" aria-label="第 ${index + 1} 段學生活動" required>${esc(flow.student || '')}</textarea>
      <textarea name="flow_checkpoint_${index}" placeholder="本段如何確認學生理解或完成" aria-label="第 ${index + 1} 段檢核方式" required>${esc(flow.checkpoint || '')}</textarea>
      <button type="button" class="icon-button" data-action="remove-plan-flow" data-flow-id="${esc(flow.id)}" aria-label="刪除流程" title="刪除流程">${icon('trash-2', 16)}</button>
    </div>`;
  }

  function renderMaterials(materials, editable = true) {
    if (!materials || !materials.length) return '<div class="text-small muted">尚無附件，至少加入一份可直接使用的教材或評量工具。</div>';
    const iconByType = { slides: 'presentation', worksheet: 'file-text', teacher: 'notebook-pen', assessment: 'clipboard-check', other: 'paperclip' };
    return materials.map(material => `<div class="material-row"><span class="file-icon">${icon(iconByType[material.category] || 'paperclip', 17)}</span><div><div class="file-name">${esc(material.name)}</div><div class="file-meta">${esc(material.size || '本機附件')}</div></div><span class="badge green">已歸檔</span>${editable ? `<button type="button" class="icon-button" data-action="remove-plan-material" data-material-id="${material.id}" aria-label="移除附件" title="移除附件">${icon('x', 15)}</button>` : '<span></span>'}</div>`).join('');
  }

  function renderPlanDetail(plan, managerMode) {
    const criteria = planCriteria(plan);
    const readiness = planReadiness(plan);
    const status = planStatus(plan);
    const totalMinutes = (plan.flow || []).reduce((sum, item) => sum + Number(item.minutes || 0), 0);
    const sourceActivity = prepActivityForPlan(plan);
    const threadKey = feedbackThreadKey('plan', plan.id);
    const showThread = managerMode || feedbackThreadMessages(threadKey).length > 0;
    const identityCopy = sourceActivity ? `${formatDate(sourceActivity.date)} 建立 · ${esc(sourceActivity.details?.targetCourse || plan.courseType)}` : esc(plan.version || '舊版教案');
    return `<div class="stack">
      <div class="notice-band ${readiness === 100 ? 'success' : 'info'}">${icon(readiness === 100 ? 'badge-check' : 'circle-alert', 19)}<div><div class="notice-title">教案內容完整度 ${readiness}%${managerMode ? ` · ${status[0]}` : ''}</div><div class="notice-copy">流程 ${totalMinutes}/${plan.duration} 分鐘 · ${(plan.materials || []).length} 份教材附件 · ${identityCopy}</div></div></div>
      <div class="detail-split">
        <section class="panel"><div class="panel-head"><div><div class="panel-title">${icon('target')}課程設計</div><div class="panel-subtitle">${esc(plan.courseType)} · ${esc(plan.className)}</div></div></div><div class="panel-body">
          <h3 class="section-title">學習者背景</h3><div class="text-small">${nl2br(plan.learnerContext || '尚未填寫')}</div>
          <div class="section-divider"></div><h3 class="section-title">學習目標</h3><div class="text-small">${nl2br(plan.objectives || '尚未填寫')}</div>
          <div class="section-divider"></div><h3 class="section-title">檢核與標準</h3><div class="text-small">${nl2br(plan.assessment || '尚未填寫')}</div>
          <div class="section-divider"></div><h3 class="section-title">差異化支持</h3><div class="text-small">${nl2br(plan.differentiation || '尚未填寫')}</div>
        </div></section>
        <section class="panel"><div class="panel-head"><div><div class="panel-title">${icon('list-checks')}歸檔條件</div></div></div><div class="panel-body"><div class="check-list">${criteria.map(item => `<div class="check-item ${item.done ? 'done' : 'pending'}"><span class="check-icon">${icon(item.done ? 'check' : 'minus', 12)}</span><span>${esc(item.label)}</span></div>`).join('')}</div></div></section>
      </div>
      <section class="panel"><div class="panel-head"><div><div class="panel-title">${icon('route')}教學流程</div></div></div><div class="panel-body flush"><div class="table-wrap"><table class="data-table"><thead><tr><th>階段</th><th>時間</th><th>老師行動</th><th>學生行動</th><th>檢核點</th></tr></thead><tbody>${(plan.flow || []).map(flow => `<tr><td><div class="table-primary">${esc(flow.stage)}</div></td><td>${flow.minutes} 分</td><td>${esc(flow.teacher)}</td><td>${esc(flow.student)}</td><td>${esc(flow.checkpoint)}</td></tr>`).join('') || '<tr><td colspan="5" class="muted">尚無流程</td></tr>'}</tbody></table></div></div></section>
      <section class="panel"><div class="panel-head"><div><div class="panel-title">${icon('files')}正式教材附件</div><div class="panel-subtitle">共 ${(plan.materials || []).length} 份</div></div></div><div class="panel-body"><div class="material-list">${renderMaterials(plan.materials, false)}</div></div></section>
      ${showThread ? renderFeedbackThread(threadKey) : ''}
      ${managerMode ? `<section class="panel"><div class="panel-head"><div><div class="panel-title">${icon('clipboard-check')}本次審查結論</div></div></div><div class="panel-body"><div class="review-checks">${['目標可被觀察與檢核', '流程時間合理且總和一致', '師生活動能支持目標', '評量標準具體', '教材內容與流程一致', '差異化與安全措施完整'].map((label, index) => `<label class="review-check"><input type="checkbox" data-review-check data-change="plan-review-check" ${index < 5 ? 'checked' : ''}><span>${label}</span></label>`).join('')}</div><div class="form-field mt-16"><label class="form-label" for="plan-review-feedback">核准說明或修改要求</label><textarea id="plan-review-feedback" placeholder="指出需修改的段落、附件或判準。"></textarea></div></div></section>` : ''}
    </div>`;
  }

  function resolveSubmissionItems(ids, snapshots, currentItems) {
    const snapshotItems = Array.isArray(snapshots) ? snapshots : [];
    const resolved = (ids || []).map(id => snapshotItems.find(item => item.id === id) || currentItems.find(item => item.id === id)).filter(Boolean);
    snapshotItems.forEach(item => {
      if (!resolved.some(existing => existing.id === item.id)) resolved.push(item);
    });
    return resolved;
  }

  function renderArchivedActivityRow(activity, submissionId) {
    const config = ACTIVITY_TYPES[activity.type] || ACTIVITY_TYPES.tutoring;
    const evidenceCount = (activity.evidence || []).length;
    return `<button type="button" class="archived-activity-row" data-action="view-archived-activity" data-submission-id="${esc(submissionId)}" data-activity-id="${esc(activity.id)}"><span class="activity-icon ${config.tone}">${icon(config.icon, 19)}</span><span class="archived-activity-main"><strong>${esc(activity.title)}</strong><small>${esc(config.label)} · ${esc(activity.className || '未指定班級')}</small><span>${esc(truncate(activity.result || '尚未填寫結果', 100))}</span></span><span class="archived-activity-meta"><span class="badge ${evidenceCount ? 'blue' : 'red'}">成果 ${evidenceCount} 份</span>${icon('chevron-right', 17)}</span></button>`;
  }

  function renderActivityFullDetail(activity) {
    const config = ACTIVITY_TYPES[activity.type] || ACTIVITY_TYPES.tutoring;
    const details = activityDetailSchema(activity.type).map(field => `<div class="metadata-row"><div class="metadata-label">${esc(field.label)}</div><div class="metadata-value">${field.control === 'date' ? formatDate(activity.details?.[field.key]) : nl2br(activity.details?.[field.key] || '未填寫')}</div></div>`).join('');
    const evidence = activity.evidence || [];
    const outcomeRows = [
      ['本次目標', activity.objective], ['實際做法／引導', activity.action], ['可觀察結果', activity.result],
      ['遇到的問題', activity.issue || '本次未記錄問題'], ['下次調整／行動', activity.nextAction],
    ];
    return `<div class="stack"><div class="notice-band info">${icon(config.icon, 19)}<div><div class="notice-title">${esc(config.label)} · ${esc(activity.className || '未指定班級')}</div><div class="notice-copy">${formatDate(activity.date)} · ${esc(activity.teacher || state.context.teacher)} · ${(activity.students || []).length ? `${activity.students.length} 位關聯學生` : '全班紀錄'}</div></div></div><section class="panel"><div class="panel-head"><div><div class="panel-title">${icon('clipboard-check')}完整填寫內容</div></div></div><div class="panel-body"><div class="metadata-list">${outcomeRows.map(([label, value]) => `<div class="metadata-row"><div class="metadata-label">${label}</div><div class="metadata-value">${nl2br(value || '未填寫')}</div></div>`).join('')}</div></div></section><section class="panel"><div class="panel-head"><div><div class="panel-title">${icon('list-tree')}依工作類型填寫</div></div></div><div class="panel-body"><div class="metadata-list">${details}</div></div></section><section class="panel"><div class="panel-head"><div><div class="panel-title">${icon('images')}成果證據</div><div class="panel-subtitle">${evidence.length} 筆證據</div></div></div><div class="panel-body">${evidence.length ? evidence.map(item => { const attachments = evidenceAttachments(item); return `<article class="archived-evidence-block"><div><strong>${esc(item.title)}</strong><p>${esc(item.claim)}</p><small>主管請看：${esc(item.observation)}</small></div><div class="archived-evidence-thumbs">${attachments.map(attachment => attachment.dataUrl ? `<img src="${attachment.dataUrl}" alt="${esc(attachment.fileName)}">` : `<span>${icon('file-check-2', 18)}</span>`).join('')}</div></article>`; }).join('') : '<div class="text-small muted">此筆送出紀錄沒有成果證據。</div>'}</div></section></div>`;
  }

  function renderSubmissionReview(submission, readOnly = false) {
    const activities = resolveSubmissionItems(submission.activityIds, submission.activitySnapshots, state.activities);
    const tracks = dailyTrackStatus(activities);
    const cases = resolveSubmissionItems(submission.studentCaseIds, submission.studentCaseSnapshots, state.studentCases);
    const contacts = resolveSubmissionItems(submission.contactIds, submission.contactSnapshots, state.contacts);
    const evidence = activities.reduce((sum, item) => sum + (item.evidence || []).length, 0);
    const prepRequired = activities.filter(item => item.type === 'lessonprep' || activityNeedsPrepSource(item.type));
    const prepReady = prepRequired.filter(activityPreparationReady).length;
    const threadKey = feedbackThreadKey('submission', submission.id);
    const showThread = !readOnly || feedbackThreadMessages(threadKey).length > 0;
    return `<div class="stack">
      <section class="panel"><div class="panel-head"><div><div class="panel-title">${icon('sparkles')}主管摘要</div><div class="panel-subtitle">${esc(submission.teacher)} · ${formatDate(submission.date)} · ${formatTime(submission.submittedAt)} · 系統依原始紀錄彙整</div></div>${reviewStatusBadge(submission.status)}</div><div class="panel-body"><div class="summary-list"><div class="summary-line"><span class="summary-index">1</span><div><div class="summary-title">今日成果</div><div class="summary-copy">${esc(submission.keyResult)}</div></div></div><div class="summary-line"><span class="summary-index">2</span><div><div class="summary-title">需追蹤</div><div class="summary-copy">${esc(submission.followup)}</div></div></div><div class="summary-line"><span class="summary-index">3</span><div><div class="summary-title">最近待辦</div><div class="summary-copy">${esc(submission.tomorrowPriority)}</div></div></div>${submission.teacherNote ? `<div class="summary-line"><span class="summary-index">4</span><div><div class="summary-title">老師補充</div><div class="summary-copy">${esc(submission.teacherNote)}</div></div></div>` : ''}</div></div></section>
      <div class="status-strip"><div class="status-cell"><div class="status-label">學科內／學科外</div><div class="status-value">${tracks.academic.count}/${tracks.enrichment.count}</div><div class="status-note">兩項皆需至少 1 筆</div></div><div class="status-cell"><div class="status-label">備課檔案／成果</div><div class="status-value">${prepReady}/${prepRequired.length} · ${evidence}</div></div><div class="status-cell"><div class="status-label">學生追蹤</div><div class="status-value">${cases.length}</div></div><div class="status-cell"><div class="status-label">親師溝通</div><div class="status-value">${contacts.length}</div></div></div>
      <section class="panel"><div class="panel-head"><div><div class="panel-title">${icon('clipboard-list')}工作與證據</div><div class="panel-subtitle">點選任一筆查看送出當下的完整內容</div></div></div><div class="panel-body">${activities.length ? `<div class="archived-activity-list">${activities.map(item => renderArchivedActivityRow(item, submission.id)).join('')}</div>` : `<div class="notice-band danger">${icon('file-question', 19)}<div><div class="notice-title">沒有可追溯的工作事件</div><div class="notice-copy">摘要無法連回班級、教學方法、學生結果與原始證據。</div></div></div>`}</div></section>
      <div class="detail-split"><section class="panel"><div class="panel-head"><div><div class="panel-title">${icon('user-round-search')}學生追蹤</div></div></div><div class="panel-body">${cases.length ? `<div class="metadata-list">${cases.map(item => `<div class="metadata-row"><div class="metadata-label">${esc(item.student)}</div><div class="metadata-value">${esc(item.observation)}<br><span class="muted">下一步：${esc(item.nextAction)}</span></div></div>`).join('')}</div>` : '<div class="text-small muted">當日無學生追蹤紀錄。</div>'}</div></section><section class="panel"><div class="panel-head"><div><div class="panel-title">${icon('messages-square')}親師溝通</div></div></div><div class="panel-body">${contacts.length ? `<div class="metadata-list">${contacts.map(item => `<div class="metadata-row"><div class="metadata-label">${esc(item.student)}</div><div class="metadata-value">${esc(item.summary)}<br><span class="muted">共識：${esc(item.decision)}</span></div></div>`).join('')}</div>` : '<div class="text-small muted">當日無親師溝通紀錄。</div>'}</div></section></div>
      ${showThread ? renderFeedbackThread(threadKey) : ''}
      ${readOnly ? '' : `<section class="panel"><div class="panel-head"><div><div class="panel-title">${icon('clipboard-check')}本次審查結論</div></div></div><div class="panel-body"><div class="form-field"><label class="form-label" for="submission-feedback">核准說明或補充要求</label><textarea id="submission-feedback" placeholder="指出哪一筆紀錄、哪個欄位或哪份證據需要調整。"></textarea></div></div></section>`}
    </div>`;
  }

  function renderEvidenceDetail(activity, evidence) {
    const config = ACTIVITY_TYPES[activity.type] || ACTIVITY_TYPES.tutoring;
    const attachments = evidenceAttachments(evidence);
    const primary = evidencePrimaryAttachment(evidence);
    const managerMode = state.ui.role === 'manager';
    const threadKey = feedbackThreadKey('evidence', activity.id, evidence.id);
    const showThread = managerMode || feedbackThreadMessages(threadKey).length > 0;
    const checks = [
      ['與工作目標直接相關', Boolean(activity.objective && evidence.claim)],
      ['工作結果可追溯', String(evidence.claim || '').length >= 8],
      ['主管看點明確', String(evidence.observation || '').length >= 12],
      ['關聯學生／班級可追溯', Boolean(activity.className)],
      ['隱私確認完成', Boolean(evidence.privacy)],
    ];
    return `<div class="stack"><div class="detail-split">
      <div><div class="annotation-canvas ${primary?.dataUrl ? 'has-image' : ''}">${primary?.dataUrl ? `<img src="${primary.dataUrl}" alt="${esc(evidence.title)}">${renderPins(evidence.pins)}` : `<div><div class="empty-icon">${icon(primary?.mimeType === 'application/pdf' ? 'file-text' : evidence.type === 'plan_asset' ? 'archive' : 'image', 28)}</div><div class="empty-title">${esc(primary?.fileName || evidence.fileName)}</div><div class="empty-copy">檔案名稱與判讀欄位已保留；此裝置沒有可顯示的原始預覽。</div></div>`}</div><div class="pin-list">${(evidence.pins || []).length ? renderPinList(evidence.pins).replaceAll('data-action="remove-evidence-pin"', 'disabled') : ''}</div>${attachments.length ? `<div class="evidence-detail-files"><div class="text-small text-strong">全部成果（${attachments.length} 份）</div>${attachments.map((attachment, index) => `<article class="evidence-detail-file"><span class="evidence-detail-thumb">${attachment.dataUrl ? `<img src="${attachment.dataUrl}" alt="${esc(attachment.fileName)}">` : icon(attachment.mimeType === 'application/pdf' ? 'file-text' : 'file-check-2', 20)}</span><div><strong>${index + 1}. ${esc(attachment.fileName)}</strong><small>${esc(attachment.note || (index === 0 ? evidence.observation : '未另外標註'))}</small></div>${attachment.id === evidence.primaryAttachmentId ? '<span class="badge blue">標註主圖</span>' : ''}</article>`).join('')}</div>` : ''}</div>
      <div class="stack">
        <div class="quality-box">${renderEvidenceQuality(evidence.quality)}</div>
        <div class="metadata-list"><div class="metadata-row"><div class="metadata-label">工作</div><div class="metadata-value">${esc(activity.title)}</div></div><div class="metadata-row"><div class="metadata-label">支持 KPI</div><div class="metadata-value">${esc(config.kpi)}</div></div><div class="metadata-row"><div class="metadata-label">類型</div><div class="metadata-value">${esc(EVIDENCE_TYPES[evidence.type] || evidence.type)}</div></div><div class="metadata-row"><div class="metadata-label">證明主張</div><div class="metadata-value">${esc(evidence.claim)}</div></div><div class="metadata-row"><div class="metadata-label">主管看點</div><div class="metadata-value">${esc(evidence.observation)}</div></div><div class="metadata-row"><div class="metadata-label">關聯學生</div><div class="metadata-value">${esc((evidence.students || []).join('、') || '全班／未指定')}</div></div></div>
        <div class="check-list">${checks.map(([label, done]) => `<div class="check-item ${done ? 'done' : 'pending'}"><span class="check-icon">${icon(done ? 'check' : 'minus', 12)}</span><span>${label}</span></div>`).join('')}</div>
        ${managerMode ? `<div class="form-field"><label class="form-label" for="evidence-feedback">本次判讀結論</label><textarea id="evidence-feedback" placeholder="需補充時，指出缺少的判讀資訊。"></textarea></div>` : ''}
      </div>
    </div>${showThread ? renderFeedbackThread(threadKey) : ''}</div>`;
  }

  function renderCaseDetail(item) {
    return `<div class="stack"><div class="notice-band ${item.urgency === 'high' ? 'danger' : 'info'}">${icon('user-round-search', 19)}<div><div class="notice-title">${esc(item.student)} · ${item.status === 'closed' ? '已結案' : '追蹤中'}</div><div class="notice-copy">${esc(item.teacher)} · 下次追蹤 ${formatDate(item.dueDate)}</div></div></div><section class="panel"><div class="panel-body"><div class="metadata-list"><div class="metadata-row"><div class="metadata-label">具體觀察</div><div class="metadata-value">${esc(item.observation)}</div></div><div class="metadata-row"><div class="metadata-label">老師介入</div><div class="metadata-value">${esc(item.intervention)}</div></div><div class="metadata-row"><div class="metadata-label">目前結果</div><div class="metadata-value">${esc(item.outcome)}</div></div><div class="metadata-row"><div class="metadata-label">下一步</div><div class="metadata-value">${esc(item.nextAction)}</div></div><div class="metadata-row"><div class="metadata-label">親師同步</div><div class="metadata-value">${item.parentContacted ? '已同步' : '尚未同步'}</div></div></div></div></section>${renderFeedbackThread(feedbackThreadKey('case', item.id))}</div>`;
  }

  function openDrawer({ title, subtitle = '', body, footer = '', wide = false }) {
    const root = $('#drawer-root');
    root.innerHTML = `<div class="drawer-backdrop" data-action="backdrop-close-drawer"><section class="drawer-panel ${wide ? 'wide' : ''}" role="dialog" aria-modal="true" aria-labelledby="drawer-title" data-drawer-panel><header class="drawer-head"><div class="drawer-title"><h2 id="drawer-title">${esc(title)}</h2>${subtitle ? `<p>${esc(subtitle)}</p>` : ''}</div><button type="button" class="icon-button" data-action="close-drawer" aria-label="關閉" title="關閉">${icon('x', 19)}</button></header><div class="drawer-body" id="drawer-body">${body}</div><footer class="drawer-foot">${footer || `<button type="button" class="btn" data-action="close-drawer">關閉</button>`}</footer></section></div>`;
    document.body.style.overflow = 'hidden';
    hydrateIcons();
    markRequiredFields(root);
    window.setTimeout(() => {
      const first = $('input:not([type="hidden"]), textarea, select, button', root);
      if (first) first.focus({ preventScroll: true });
    }, 80);
  }

  function closeDrawer() {
    persistCurrentDrawerDraft();
    $('#drawer-root').innerHTML = '';
    document.body.style.overflow = '';
    activityDraft = null;
    returnActivityDraft = null;
    evidenceDraft = null;
    activePinPosition = null;
    currentDrawerDraftKey = '';
    currentDrawerDraftKind = '';
    currentDrawerDraftDirty = false;
    restoredDraftAt = '';
  }

  function openDialog({ title, body, footer = '' }) {
    const root = $('#dialog-root');
    root.innerHTML = `<div class="dialog-backdrop" data-action="backdrop-close-dialog"><section class="dialog-box" role="dialog" aria-modal="true" aria-labelledby="dialog-title" data-dialog-box><header class="dialog-head"><h2 id="dialog-title">${esc(title)}</h2><button type="button" class="icon-button" data-action="close-dialog" aria-label="關閉" title="關閉">${icon('x', 18)}</button></header><div class="dialog-body">${body}</div><footer class="dialog-foot">${footer || `<button type="button" class="btn" data-action="close-dialog">關閉</button>`}</footer></section></div>`;
    hydrateIcons();
    markRequiredFields(root);
  }

  function closeDialog() {
    $('#dialog-root').innerHTML = '';
  }

  function showActivityEditor(draft, draftContext = {}) {
    setDrawerDraftContext('activity', draftContext.key || drawerDraftKey('activity', draft.id, draft.type), draftContext.saved || null);
    activityDraft = clone(draft);
    activityDraft.details = clone(activityDraft.details || {});
    activityDraft.detailCache = activityDraft.detailCache || { [activityDraft.type]: clone(activityDraft.details) };
    activityDraft.prepSourceCache = activityDraft.prepSourceCache || { [activityDraft.type]: activityDraft.prepSourceId || '' };
    const isExisting = Boolean(activityDraft.id);
    const isCoursePrep = activityDraft.type === 'lessonprep';
    openDrawer({
      title: isCoursePrep ? `${isExisting ? '編輯' : '新增'}備課檔案` : isExisting ? '編輯工作紀錄' : '新增工作紀錄',
      subtitle: isCoursePrep ? '選擇課程類型，集中完成並歸檔教案內容與教材' : activityNeedsPrepSource(activityDraft.type) ? '選擇備課檔案，再記錄實際教學與課後回饋' : '記錄實際做法、結果、問題與後續行動',
      body: `${draftRecoveryNotice(draftContext.saved?.savedAt, draftContext.saved?.mediaOmitted)}${isCoursePrep ? renderCoursePrepForm(activityDraft) : renderActivityForm(activityDraft)}`,
      footer: `${isExisting ? `<button type="button" class="btn btn-danger" style="margin-right:auto" data-action="delete-activity" data-activity-id="${activityDraft.id}">${icon('trash-2', 15)}刪除</button>` : ''}<button type="button" class="btn" data-action="close-drawer">稍後繼續</button><button type="submit" form="${isCoursePrep ? 'course-prep-form' : 'activity-form'}" class="btn btn-primary">${icon('save', 16)}${isCoursePrep ? '儲存備課檔案' : '儲存紀錄'}</button>`,
    });
    if (!isCoursePrep) refreshActivityFormCopy(activityDraft.type);
  }

  function openActivityEditor(activityId, requestedTrack = '', requestedType = '') {
    const activity = activityId ? state.activities.find(item => item.id === activityId) : null;
    const defaultType = requestedType && ACTIVITY_TYPES[requestedType] ? requestedType : requestedTrack === 'enrichment' ? 'project' : requestedTrack === 'supplemental' ? 'classroom' : 'tutoring';
    const key = drawerDraftKey('activity', activityId || '', activity?.type || defaultType);
    const saved = getOpenDraft(key);
    const base = activity || {
      id: '', type: defaultType, title: '', className: '', students: [], details: {}, prepSourceId: defaultPrepSourceId(defaultType), planId: '', objective: '', action: '', result: '', issue: '', nextAction: '', owner: state.context.teacher, dueDate: addDays(state.daily.date, 1), prepFeedback: { strengths: '', resonance: '', changes: '' }, prep: { summary: '', adjustment: '' }, prepEvidence: [], evidence: [],
    };
    if (!activity && defaultType === 'lessonprep') base.details = activityDetailDefaults('lessonprep');
    showActivityEditor(saved?.kind === 'activity' && saved.payload ? saved.payload : base, { key, saved: saved?.kind === 'activity' ? saved : null });
  }

  function openStudentCaseEditor(caseId) {
    const item = caseId ? state.studentCases.find(entry => entry.id === caseId) : null;
    const key = drawerDraftKey('student-case', caseId || '');
    const saved = getOpenDraft(key);
    setDrawerDraftContext('student-case', key, saved);
    openDrawer({
      title: item ? '編輯學生追蹤' : '新增學生追蹤', subtitle: '從具體觀察到下一次檢核', body: renderStudentCaseForm(item),
      footer: `${item ? `<button type="button" class="btn btn-danger" style="margin-right:auto" data-action="delete-student-case" data-case-id="${item.id}">${icon('trash-2', 15)}刪除</button>` : ''}<button type="button" class="btn" data-action="close-drawer">稍後繼續</button><button type="submit" form="student-case-form" class="btn btn-primary">${icon('save', 16)}儲存追蹤</button>`,
    });
    applyRestoredFormDraft('#student-case-form', saved);
  }

  function openContactEditor(contactId) {
    const item = contactId ? state.contacts.find(entry => entry.id === contactId) : null;
    const key = drawerDraftKey('contact', contactId || '');
    const saved = getOpenDraft(key);
    setDrawerDraftContext('contact', key, saved);
    openDrawer({
      title: item ? '編輯親師溝通' : '新增親師溝通', subtitle: '保留必要摘要、共識與後續行動', body: renderContactForm(item),
      footer: `${item ? `<button type="button" class="btn btn-danger" style="margin-right:auto" data-action="delete-contact" data-contact-id="${item.id}">${icon('trash-2', 15)}刪除</button>` : ''}<button type="button" class="btn" data-action="close-drawer">稍後繼續</button><button type="submit" form="contact-form" class="btn btn-primary">${icon('save', 16)}儲存溝通</button>`,
    });
    applyRestoredFormDraft('#contact-form', saved);
  }

  function renderCoursePrepEvidenceOverview(activity, plan, planLink) {
    const references = activity.prepEvidence || [];
    const legacyOutputs = activity.evidence || [];
    const referenceCount = references.length + legacyOutputs.length;
    const usageRecords = state.activities.filter(item => item.prepSourceId === activity.id);
    const updatedDate = String(activity.updatedAt || '').slice(0, 10) || activity.date;
    const readiness = plan ? planReadiness(plan) : 0;
    const referenceList = referenceCount
      ? `<div class="prep-file-list">${references.map(item => `<div class="prep-file-row read-only">${icon('file-check-2', 18)}<div class="prep-file-main"><strong>${esc(item.fileName)}</strong><small>${esc(item.size || '')}${item.addedAt ? ` · ${formatDate(String(item.addedAt).slice(0, 10))}` : ''}</small>${item.note ? `<p>${esc(item.note)}</p>` : ''}</div></div>`).join('')}${legacyOutputs.map(item => `<div class="prep-file-row read-only">${icon('archive', 18)}<div class="prep-file-main"><strong>${esc(item.title || item.fileName || '舊版備課附件')}</strong><small>舊版資料保留</small>${item.claim ? `<p>${esc(item.claim)}</p>` : ''}</div></div>`).join('')}</div>`
      : '<div class="prep-file-empty">沒有額外參考資料；正式授課附件請查看上方教案內容。</div>';
    const usageList = usageRecords.length
      ? `<div class="prep-version-uses">${usageRecords.map(item => { const feedback = item.prepFeedback || {}; return `<article><div class="prep-use-head"><div><strong>${esc(item.title)}</strong><small>${formatDate(item.date)} · ${esc(item.className || '未指定班級')}</small></div>${statusBadge(prepFeedbackComplete(item) ? '回饋完整' : '待補', prepFeedbackComplete(item) ? 'green' : 'red')}</div><div class="prep-feedback-review"><div><strong>有效處</strong><p>${esc(feedback.strengths || '尚未填寫')}</p></div><div><strong>孩子共鳴</strong><p>${esc(feedback.resonance || '尚未填寫')}</p></div><div><strong>下次調整</strong><p>${esc(feedback.changes || '尚未填寫')}</p></div></div></article>`; }).join('')}</div>`
      : '<div class="prep-file-empty">這份備課檔案尚未被授課紀錄選用。</div>';
    return `<div class="notice-band info">${icon('folder-open', 19)}<div><div class="notice-title">${esc(activity.title)}</div><div class="notice-copy">${esc(activity.details?.targetCourse || '尚未分類')} · ${formatDate(activity.date)} 建立 · ${formatDate(updatedDate)} 更新</div></div></div>
      <section class="evidence-stage"><div class="evidence-stage-head"><span class="evidence-stage-number">1</span><div><strong>教案內容與正式教材</strong><small>教學目標、流程、引導方法、檢核與授課附件集中在同一份檔案</small></div>${statusBadge(readiness === 100 ? '可供選用' : `完整度 ${readiness}%`, readiness === 100 ? 'green' : 'yellow')}</div>${planLink || '<div class="prep-file-empty">尚未填寫教案內容與教材。</div>'}</section>
      <section class="evidence-stage"><div class="evidence-stage-head"><span class="evidence-stage-number">2</span><div><strong>備課補充與參考資料</strong><small>${esc(activity.prep?.summary || '沒有補充備註')}</small></div>${statusBadge(referenceCount ? `${referenceCount} 份` : '選填', referenceCount ? 'blue' : 'outline')}</div>${referenceList}</section>
      <section class="evidence-stage"><div class="evidence-stage-head"><span class="evidence-stage-number">3</span><div><strong>實際授課與課後回饋</strong><small>所有選用這份檔案的課程紀錄會自動彙整在這裡</small></div>${statusBadge(usageRecords.length ? `${usageRecords.length} 次使用` : '尚未使用', usageRecords.length ? 'purple' : 'yellow')}</div>${usageList}</section>`;
  }

  function renderDailyCourseEvidenceOverview(activity, plan, planLink) {
    const evidence = activity.evidence || [];
    const evidenceReady = evidence.some(item => item.quality >= 80);
    const source = prepSourceById(activity.prepSourceId);
    const sourceReady = prepSourceUsable(source, activity.type, activity.date);
    const feedback = activity.prepFeedback || {};
    const updatedDate = source ? String(source.updatedAt || '').slice(0, 10) || source.date : '';
    return `<div class="notice-band info">${icon('target', 19)}<div><div class="notice-title">本堂課目標</div><div class="notice-copy">${esc(activity.objective)}</div></div></div>
      <section class="evidence-stage"><div class="evidence-stage-head"><span class="evidence-stage-number">1</span><div><strong>採用的備課檔案</strong><small>${source ? `${esc(source.title)} · ${formatDate(source.date)} 建立 · ${formatDate(updatedDate)} 更新` : '尚未選擇備課檔案'}</small></div>${statusBadge(sourceReady && plan ? '可追溯' : '待補連結', sourceReady && plan ? 'green' : 'red')}</div>${planLink}${source ? `<div class="plan-evidence-link"><div><strong>${esc(source.title)}</strong><small>${esc(source.details?.targetCourse || '尚未分類')} · ${(plan?.materials || []).length} 份正式教材</small></div><button type="button" class="btn btn-small" data-action="open-evidence" data-activity-id="${source.id}">${icon('arrow-right', 14)}查看備課檔案</button></div>${source.prep?.summary ? `<div class="prep-source-summary"><strong>備課補充</strong><p>${esc(source.prep.summary)}</p></div>` : ''}` : ''}</section>
      <section class="evidence-stage"><div class="evidence-stage-head"><span class="evidence-stage-number">2</span><div><strong>課後回饋</strong><small>主管可直接看到教材有效處、學生共鳴與下次調整依據</small></div>${statusBadge(prepFeedbackComplete(activity) ? '回饋完整' : '待補回饋', prepFeedbackComplete(activity) ? 'blue' : 'red')}</div><div class="prep-feedback-review"><div><strong>教學設計／教材有效處</strong><p>${esc(feedback.strengths || '尚未填寫')}</p></div><div><strong>孩子有反應／共鳴的環節</strong><p>${esc(feedback.resonance || '尚未填寫')}</p></div><div><strong>下次需要調整</strong><p>${esc(feedback.changes || '尚未填寫')}</p></div></div></section>
      <section class="evidence-stage"><div class="evidence-stage-head"><span class="evidence-stage-number">3</span><div><strong>學生實際成果與變化證據</strong><small>用作品、訂正、測試數據或可觀察行為證明本堂結果</small></div>${statusBadge(evidenceReady ? '可判讀' : '待補', evidenceReady ? 'blue' : 'red')}</div>${evidence.length ? `<div class="evidence-grid">${evidence.map(item => renderEvidenceCard({ activity, evidence: item })).join('')}</div>` : '<div class="prep-file-empty">尚未加入成果證據。</div>'}</section>`;
  }

  function renderActivityEvidenceOverview(activity) {
    const evidence = activity.evidence || [];
    const plan = planById(effectivePlanId(activity));
    const planReady = activityPlanReady(activity);
    const evidenceReady = evidence.some(item => item.quality >= 80);
    const planLink = plan ? `<div class="plan-evidence-link"><div><strong>教案內容與教材</strong><small>完整度 ${planReadiness(plan)}% · ${(plan.materials || []).length} 份教材 · ${(plan.flow || []).length} 個流程階段</small></div><button type="button" class="btn btn-small" data-action="view-plan" data-plan-id="${plan.id}">${icon('arrow-right', 14)}查看內容</button></div>` : '';
    if (activity.type === 'lessonprep') return renderCoursePrepEvidenceOverview(activity, plan, planLink);
    if (activityNeedsPrepSource(activity.type)) return renderDailyCourseEvidenceOverview(activity, plan, planLink);
    if (activity.type === 'legacy-lessonprep') {
      const details = activity.details || {};
      const scheduleReady = !crossDayScheduleIssues(activity).length;
      const usageRecords = state.activities.filter(item => item.prepSourceId === activity.id);
      return `<div class="notice-band info">${icon('target', 19)}<div><div class="notice-title">本次備課進度</div><div class="notice-copy">${esc(activity.objective)}</div></div></div><section class="evidence-stage"><div class="evidence-stage-head"><span class="evidence-stage-number">1</span><div><strong>課程備課｜未來使用與版本時程</strong><small>${esc(details.targetCourse || '尚未選擇課程')} · ${esc(details.stage || '尚未設定階段')} · ${esc(details.version || '尚未設定版本')}</small></div>${statusBadge(scheduleReady ? '時程有效' : '日期待修正', scheduleReady ? 'green' : 'red')}</div><div class="crossday-evidence-dates"><span><strong>送審</strong>${formatDate(details.reviewDate)}</span><span><strong>鎖版</strong>${formatDate(details.lockDate)}</span><span><strong>正式使用</strong>${formatDate(details.useDate)}</span></div>${planLink}</section><section class="evidence-stage"><div class="evidence-stage-head"><span class="evidence-stage-number">2</span><div><strong>備課依據｜接續版本與參考資料</strong><small>${esc(activity.prep?.summary || '尚未填寫接續基準')}</small></div>${statusBadge(prepEvidenceComplete(activity.prepEvidence) ? '可判讀' : '缺件／缺說明', prepEvidenceComplete(activity.prepEvidence) ? 'green' : 'red')}</div>${renderPrepEvidenceList(activity.prepEvidence || [], false)}</section><section class="evidence-stage"><div class="evidence-stage-head"><span class="evidence-stage-number">3</span><div><strong>本次完成｜授課版成品與進度證據</strong><small>主管需能看出這次實際推進了什麼，而不是重複上傳上一版</small></div>${statusBadge(evidenceReady ? '可判讀' : '待補', evidenceReady ? 'blue' : 'red')}</div>${evidence.length ? `<div class="evidence-grid">${evidence.map(item => renderEvidenceCard({ activity, evidence: item })).join('')}</div>` : `<div class="prep-file-empty">尚未加入本次備課成品。</div>`}</section><section class="evidence-stage"><div class="evidence-stage-head"><span class="evidence-stage-number">4</span><div><strong>實際授課回饋｜下一版修訂依據</strong><small>所有選用此版本的課程紀錄會自動回到這裡</small></div>${statusBadge(usageRecords.length ? `${usageRecords.length} 次使用` : '尚未使用', usageRecords.length ? 'purple' : 'yellow')}</div>${usageRecords.length ? `<div class="prep-version-uses">${usageRecords.map(item => { const feedback = item.prepFeedback || {}; return `<article><div class="prep-use-head"><div><strong>${esc(item.title)}</strong><small>${formatDate(item.date)} · ${esc(item.className)}</small></div>${statusBadge(prepFeedbackComplete(item) ? '回饋完整' : '待補', prepFeedbackComplete(item) ? 'green' : 'red')}</div><div class="prep-feedback-review"><div><strong>有效處</strong><p>${esc(feedback.strengths || '尚未填寫')}</p></div><div><strong>孩子共鳴</strong><p>${esc(feedback.resonance || '尚未填寫')}</p></div><div><strong>下版修正</strong><p>${esc(feedback.changes || '尚未填寫')}</p></div></div></article>`; }).join('')}</div>` : `<div class="prep-file-empty">此版本尚未被授課紀錄選用。</div>`}</section>`;
    }
    if (!activityNeedsPrepSource(activity.type)) {
      return `<div class="notice-band info">${icon('target', 19)}<div><div class="notice-title">本次工作目的</div><div class="notice-copy">${esc(activity.objective)}</div></div></div><section class="evidence-stage"><div class="evidence-stage-head"><span class="evidence-stage-number">1</span><div><strong>實際執行與後續</strong><small>此類工作不需要課程備課、教學設計或備課附件</small></div>${statusBadge('直接記錄', 'green')}</div><div class="prep-feedback-review"><div><strong>實際做法</strong><p>${esc(activity.action || '尚未填寫')}</p></div><div><strong>完成情況</strong><p>${esc(activity.result || '尚未填寫')}</p></div><div><strong>下次行動</strong><p>${esc(activity.nextAction || '尚未填寫')}</p></div></div></section><section class="evidence-stage"><div class="evidence-stage-head"><span class="evidence-stage-number">2</span><div><strong>成果與變化證據</strong><small>主管需能直接判讀工作是否完成</small></div>${statusBadge(evidenceReady ? '可判讀' : '待補', evidenceReady ? 'blue' : 'red')}</div>${evidence.length ? `<div class="evidence-grid">${evidence.map(item => renderEvidenceCard({ activity, evidence: item })).join('')}</div>` : `<div class="prep-file-empty">尚未加入成果證據。</div>`}</section>`;
    }
    const source = prepSourceById(activity.prepSourceId);
    const sourceReady = prepSourceUsable(source, activity.type, activity.date);
    const feedback = activity.prepFeedback || {};
    return `<div class="notice-band info">${icon('target', 19)}<div><div class="notice-title">本堂課目標</div><div class="notice-copy">${esc(activity.objective)}</div></div></div><section class="evidence-stage"><div class="evidence-stage-head"><span class="evidence-stage-number">1</span><div><strong>採用的課程備課｜教學設計與教材</strong><small>${source ? `${esc(source.title)} · ${esc(source.details?.version || '未標版本')} · ${formatDate(source.date)} 完成` : '尚未連結課程備課'}</small></div>${statusBadge(sourceReady && planReady ? '可追溯' : '待補連結', sourceReady && planReady ? 'green' : 'red')}</div>${planLink}${source ? `<div class="plan-evidence-link"><div><strong>${esc(source.title)} · ${esc(source.details?.version || '未標版本')}</strong><small>查看完整備課時程、附件、授課版成品與所有使用回饋</small></div><button type="button" class="btn btn-small" data-action="open-evidence" data-activity-id="${source.id}">${icon('arrow-right', 14)}查看課程備課</button></div><div class="prep-source-summary"><strong>授課版內容</strong><p>${esc(source.details?.bundle || source.result || '尚未填寫')}</p></div>${renderPrepEvidenceList(source.prepEvidence || [], false)}` : ''}</section><section class="evidence-stage"><div class="evidence-stage-head"><span class="evidence-stage-number">2</span><div><strong>課後回到課程備課的回饋</strong><small>主管可直接看到教材有效處、學生共鳴與下一版修正依據</small></div>${statusBadge(prepFeedbackComplete(activity) ? '回饋完整' : '待補回饋', prepFeedbackComplete(activity) ? 'blue' : 'red')}</div><div class="prep-feedback-review"><div><strong>教學設計／教材有效處</strong><p>${esc(feedback.strengths || '尚未填寫')}</p></div><div><strong>孩子有反應／共鳴的環節</strong><p>${esc(feedback.resonance || '尚未填寫')}</p></div><div><strong>下一版需要調整</strong><p>${esc(feedback.changes || '尚未填寫')}</p></div></div></section><section class="evidence-stage"><div class="evidence-stage-head"><span class="evidence-stage-number">3</span><div><strong>學生實際成果與變化證據</strong><small>用作品、訂正、測試數據或可觀察行為證明本堂結果</small></div>${statusBadge(evidenceReady ? '可判讀' : '待補', evidenceReady ? 'blue' : 'red')}</div>${evidence.length ? `<div class="evidence-grid">${evidence.map(item => renderEvidenceCard({ activity, evidence: item })).join('')}</div>` : `<div class="prep-file-empty">尚未加入成果證據。</div>`}</section>`;
  }

  function openEvidenceList(activityId) {
    const activity = state.activities.find(item => item.id === activityId);
    if (!activity) return;
    const isCoursePrep = activity.type === 'lessonprep';
    openDrawer({
      title: isCoursePrep ? '備課檔案內容' : '工作證據', subtitle: activity.title,
      body: renderActivityEvidenceOverview(activity),
      footer: isCoursePrep
        ? `<button type="button" class="btn" data-action="close-drawer">關閉</button><button type="button" class="btn btn-primary" data-action="edit-activity" data-activity-id="${activity.id}">${icon('file-pen-line', 16)}編輯備課檔案</button>`
        : `<button type="button" class="btn" data-action="close-drawer">關閉</button><button type="button" class="btn btn-primary" data-action="new-evidence" data-activity-id="${activity.id}">${icon('camera', 16)}上傳新的成果</button>`,
    });
  }

  function openEvidenceEditor(activityId, evidenceId) {
    const activity = activityId === 'operations'
      ? { id: 'operations', type: 'classroom', title: `${state.operations.room} 班務檢核`, className: state.operations.room, objective: '確認教室可安全、整潔地供學生使用。' }
      : state.activities.find(item => item.id === activityId);
    if (!activity) return;
    const evidence = activityId === 'operations'
      ? state.operations.evidence
      : (activity.evidence || []).find(item => item.id === evidenceId);
    const key = drawerDraftKey('evidence', evidenceId || '', activityId);
    const saved = getOpenDraft(key);
    setDrawerDraftContext('evidence', key, saved);
    const formValue = saved?.kind === 'evidence' && saved.payload ? saved.payload : evidence;
    openDrawer({
      title: evidence ? '編輯證據' : '新增可判讀證據', subtitle: activity.title, body: `${draftRecoveryNotice(saved?.savedAt, saved?.mediaOmitted)}${renderEvidenceForm(activity, formValue)}`, wide: true,
      footer: `${evidence ? `<button type="button" class="btn btn-danger" style="margin-right:auto" data-action="delete-evidence" data-activity-id="${activityId}" data-evidence-id="${evidence.id}">${icon('trash-2', 15)}刪除</button>` : ''}<button type="button" class="btn" data-action="close-drawer">稍後繼續</button><button type="submit" form="evidence-form" class="btn btn-primary">${icon('save', 16)}儲存證據</button>`,
    });
  }

  function planSeedFromActivityDraft(draft) {
    const details = draft.details || {};
    const courseType = {
      tutoring: '安親輔導', project: '專案選修', robotics: '專案選修', portfolio: '學習歷程', sel: 'SEL 聊心室', lessonprep: prepCourseType(draft),
    }[draft.type] || '安親輔導';
    const isCrossDay = draft.type === 'lessonprep';
    const assessment = isCrossDay ? '' : details.testProtocol || details.reflectionPrompt || '';
    return {
      id: '', teacher: state.context.teacher, title: draft.title || '', courseType, className: draft.className || '',
      duration: draft.type === 'tutoring' ? 35 : draft.type === 'sel' ? 45 : 90,
      version: prepVersionCode(draft), updatedAt: state.daily.date, status: 'draft',
      sourceActivityId: draft.id && state.activities.some(item => item.id === draft.id) ? draft.id : '',
      learnerContext: isCrossDay ? '' : details.baseline || '', objectives: isCrossDay ? '' : draft.objective || '', assessment,
      differentiation: draft.prep?.adjustment || '', safetyPrivacy: details.boundary || '', reflection: '', flow: [], materials: [], managerFeedback: '',
    };
  }

  function openPlanEditor(planId, sourceDraft = null) {
    const existingPlan = planId ? state.lessonPlans.find(item => item.id === planId) : null;
    const plan = existingPlan || (sourceDraft ? planSeedFromActivityDraft(sourceDraft) : null);
    const returningToActivity = Boolean(returnActivityDraft);
    openDrawer({
      title: '教案內容與教材',
      subtitle: returningToActivity ? '內容會儲存在同一份備課檔案中' : '集中管理課程流程、檢核方式與正式教材', body: renderPlanForm(plan), wide: true,
      footer: `${existingPlan ? `<button type="button" class="btn btn-danger" style="margin-right:auto" data-action="delete-plan" data-plan-id="${existingPlan.id}">${icon('trash-2', 15)}刪除</button>` : ''}<button type="button" class="btn" data-action="${returningToActivity ? 'return-to-activity' : 'close-drawer'}">${returningToActivity ? '返回備課檔案' : '取消'}</button><button type="submit" form="plan-form" class="btn btn-primary">${icon('save', 16)}儲存教案內容</button>`,
    });
  }

  function openPlanDetail(planId) {
    const plan = state.lessonPlans.find(item => item.id === planId);
    if (!plan) return;
    const readiness = planReadiness(plan);
    const sourceActivity = prepActivityForPlan(plan);
    openDrawer({
      title: plan.title, subtitle: sourceActivity ? `${formatDate(sourceActivity.date)} 建立 · ${plan.teacher}` : `${plan.version} · ${plan.teacher}`, body: renderPlanDetail(plan, false), wide: true,
      footer: `<button type="button" class="btn" data-action="close-drawer">關閉</button><button type="button" class="btn" data-action="edit-plan" data-plan-id="${plan.id}">${icon('pencil', 16)}編輯</button><button type="button" class="btn btn-primary" data-action="submit-plan-review" data-plan-id="${plan.id}" ${readiness < 100 || plan.status === 'review' ? 'disabled' : ''}>${icon('send', 16)}${plan.status === 'review' ? '已送主管檢視' : '送主管檢視（選填）'}</button>`,
    });
  }

  function openPlanReview(planId) {
    const plan = state.lessonPlans.find(item => item.id === planId);
    if (!plan) return;
    openDrawer({
      title: '教案審查', subtitle: `${plan.teacher} · ${plan.title}`, body: renderPlanDetail(plan, true), wide: true,
      footer: `<button type="button" class="btn" data-action="close-drawer">稍後處理</button><button type="button" class="btn" data-action="request-plan-changes" data-plan-id="${plan.id}">${icon('undo-2', 16)}退回補件</button><button type="button" id="approve-plan-button" class="btn btn-primary" data-action="approve-plan" data-plan-id="${plan.id}" disabled>${icon('badge-check', 16)}核准教案</button>`,
    });
  }

  function openSubmissionReview(submissionId, readOnly = false) {
    const submission = state.submissions.find(item => item.id === submissionId);
    if (!submission) return;
    openDrawer({
      title: readOnly ? '送出紀錄' : '日報審查', subtitle: `${submission.teacher} · ${formatDate(submission.date)}`, body: renderSubmissionReview(submission, readOnly), wide: true,
      footer: readOnly ? `<button type="button" class="btn" data-action="close-drawer">關閉</button>` : `<button type="button" class="btn" data-action="close-drawer">稍後處理</button><button type="button" class="btn" data-action="request-submission-clarify" data-submission-id="${submission.id}">${icon('message-square-warning', 16)}要求補充</button><button type="button" class="btn btn-primary" data-action="accept-submission" data-submission-id="${submission.id}">${icon('check-check', 16)}完成審查</button>`,
    });
  }

  function openActivityDetail(activityId) {
    const activity = state.activities.find(item => item.id === activityId);
    if (!activity) {
      toast('找不到這筆工作紀錄，請從「我的紀錄」開啟送出快照', 'danger');
      return;
    }
    const canEdit = activity.teacher === state.context.teacher && state.ui.role === 'teacher';
    openDrawer({
      title: activity.title,
      subtitle: `${formatDate(activity.date)} · ${activity.teacher}`,
      body: renderActivityFullDetail(activity),
      wide: true,
      footer: `<button type="button" class="btn" data-action="close-drawer">關閉</button>${canEdit ? `<button type="button" class="btn btn-primary" data-action="edit-activity" data-activity-id="${activity.id}">${icon('pencil', 16)}編輯紀錄</button>` : ''}`,
    });
  }

  function openArchivedActivityDetail(submissionId, activityId) {
    const submission = state.submissions.find(item => item.id === submissionId);
    const activity = submission && resolveSubmissionItems(submission.activityIds, submission.activitySnapshots, state.activities).find(item => item.id === activityId);
    if (!submission || !activity) {
      toast('這筆送出內容目前無法讀取', 'danger');
      return;
    }
    openDrawer({
      title: activity.title,
      subtitle: `${formatDate(submission.date)} 送出快照 · ${submission.teacher}`,
      body: renderActivityFullDetail({ ...activity, date: submission.date }),
      wide: true,
      footer: `<button type="button" class="btn" data-action="open-record" data-submission-id="${submission.id}">${icon('arrow-left', 16)}返回當日紀錄</button><button type="button" class="btn" data-action="close-drawer">關閉</button>`,
    });
  }

  function openEvidenceInspection(activityId, evidenceId) {
    const activity = state.activities.find(item => item.id === activityId);
    const evidence = activity && (activity.evidence || []).find(item => item.id === evidenceId);
    if (!activity || !evidence) return;
    const managerMode = state.ui.role === 'manager';
    openDrawer({
      title: evidence.title, subtitle: `${activity.teacher} · ${activity.title}`, body: renderEvidenceDetail(activity, evidence), wide: true,
      footer: managerMode ? `<button type="button" class="btn" data-action="close-drawer">稍後處理</button><button type="button" class="btn" data-action="request-evidence-clarify" data-activity-id="${activity.id}" data-evidence-id="${evidence.id}">${icon('message-square-warning', 16)}要求補充</button><button type="button" class="btn btn-primary" data-action="accept-evidence" data-activity-id="${activity.id}" data-evidence-id="${evidence.id}">${icon('badge-check', 16)}採認證據</button>` : `<button type="button" class="btn" data-action="close-drawer">關閉</button><button type="button" class="btn btn-primary" data-action="edit-evidence" data-activity-id="${activity.id}" data-evidence-id="${evidence.id}">${icon('pencil', 16)}編輯證據</button>`,
    });
  }

  function openOperationReview(operationId) {
    const operation = operationRecordById(operationId);
    if (!operation || !operation.confirmedAt) return;
    openDrawer({
      title: '班務稽核', subtitle: `${operation.dutyOwner} · ${formatDate(operation.date)} · ${operation.room}`, body: renderOperationReview(operation), wide: true,
      footer: `<button type="button" class="btn" data-action="close-drawer">稍後處理</button><button type="button" class="btn" data-action="request-operation-clarify" data-operation-id="${operation.id}">${icon('message-square-warning', 16)}要求補充</button><button type="button" class="btn btn-primary" data-action="accept-operation" data-operation-id="${operation.id}">${icon('badge-check', 16)}通過稽核</button>`,
    });
  }

  function openCaseDetail(caseId) {
    const item = state.studentCases.find(entry => entry.id === caseId);
    if (!item) return;
    openDrawer({ title: '學生追蹤詳情', subtitle: `${item.student} · ${item.teacher}`, body: renderCaseDetail(item), footer: `<button type="button" class="btn" data-action="close-drawer">關閉</button>` });
  }

  function openTaskEditor() {
    openDrawer({
      title: '新增追蹤事項', subtitle: '新增未由工作紀錄自動產生的事項',
      body: `<form id="task-form" data-form="task"><div class="form-grid"><div class="form-field span-2"><label class="form-label" for="task-title">事項 <span class="required">*</span></label><input id="task-title" name="title" required></div><div class="form-field"><label class="form-label" for="task-source">來源</label><select id="task-source" name="source"><option>老師自建</option><option>主管交辦</option></select></div><div class="form-field"><label class="form-label" for="task-priority">優先度</label><select id="task-priority" name="priority"><option value="low">一般</option><option value="medium">中</option><option value="high">高</option></select></div><div class="form-field"><label class="form-label" for="task-due">期限 <span class="required">*</span></label><input id="task-due" type="date" name="dueDate" value="${addDays(state.daily.date, 1)}" required></div></div></form>`,
      footer: `<button type="button" class="btn" data-action="close-drawer">取消</button><button type="submit" form="task-form" class="btn btn-primary">${icon('save', 16)}新增事項</button>`,
    });
  }

  function appStorageUsage() {
    let bytes = 0;
    [STORAGE_KEY, BACKUP_KEY, DRAFT_KEY].forEach(key => {
      try {
        const value = localStorage.getItem(key) || '';
        bytes += (key.length + value.length) * 2;
      } catch (error) { /* health check reports access separately */ }
    });
    return bytes;
  }

  function formatStorageUsage(bytes) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
  }

  function runSystemHealthChecks() {
    let storageWritable = false;
    try {
      localStorage.setItem(HEALTH_PROBE_KEY, String(Date.now()));
      storageWritable = Boolean(localStorage.getItem(HEALTH_PROBE_KEY));
      localStorage.removeItem(HEALTH_PROBE_KEY);
    } catch (error) {
      storageWritable = false;
    }
    let primaryReadable = true;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) JSON.parse(raw);
    } catch (error) {
      primaryReadable = false;
    }
    const usage = appStorageUsage();
    const usageTone = usage >= 4.4 * 1024 * 1024 ? 'bad' : usage >= 3.5 * 1024 * 1024 ? 'warn' : 'good';
    const attachmentCount = allEvidence().reduce((sum, item) => sum + evidenceAttachments(item.evidence).length, 0);
    const openDraftCount = Object.keys(openDraftStore).length;
    return [
      { label: '本機儲存讀寫', tone: storageWritable ? 'good' : 'bad', value: storageWritable ? '正常' : '失敗', copy: storageWritable ? '瀏覽器允許本系統讀寫資料。' : '請勿關閉頁面；可能是隱私模式、瀏覽器限制或空間不足。' },
      { label: '主要資料解析', tone: primaryReadable && !runtimeHealth.loadIssue ? 'good' : primaryReadable ? 'warn' : 'bad', value: primaryReadable ? '可讀取' : '無法讀取', copy: runtimeHealth.loadIssue || '目前資料結構可正常載入。' },
      { label: '最近一次儲存', tone: runtimeHealth.lastPersistOk ? 'good' : 'bad', value: runtimeHealth.lastPersistOk ? (formatTime(runtimeHealth.lastPersistAt) || '尚未寫入') : '失敗', copy: runtimeHealth.persistError || '沒有未處理的儲存錯誤。' },
      { label: '本機使用量', tone: usageTone, value: formatStorageUsage(usage), copy: usageTone === 'good' ? '容量仍在建議範圍內。' : usageTone === 'warn' ? '接近瀏覽器常見上限，建議減少不必要照片。' : '已接近容量上限，請先移除部分照片再繼續。' },
      { label: '成果附件', tone: attachmentCount > 0 ? 'good' : 'warn', value: `${attachmentCount} 份`, copy: '照片會先縮圖壓縮再儲存，非圖片檔只保留名稱與判讀資訊。' },
      { label: '未送出暫存', tone: 'good', value: `${openDraftCount} 份`, copy: openDraftCount ? '重新打開對應表單即可繼續填寫。' : '目前沒有待恢復的表單內容。' },
    ];
  }

  function renderHealthCheckBody() {
    const checks = runSystemHealthChecks();
    const hasBad = checks.some(item => item.tone === 'bad');
    const hasWarn = checks.some(item => item.tone === 'warn');
    const headline = hasBad ? ['系統需要處理', 'danger', 'triangle-alert'] : hasWarn ? ['系統可使用，但有提醒', 'info', 'circle-alert'] : ['系統健康', 'success', 'badge-check'];
    return `<div class="stack"><div class="notice-band ${headline[1]}">${icon(headline[2], 20)}<div><div class="notice-title">${headline[0]}</div><div class="notice-copy">檢查資料讀取、即時草稿、照片容量與最近儲存結果。</div></div></div><div class="health-check-list">${checks.map(item => `<div class="health-check-row ${item.tone}"><span class="health-check-icon">${icon(item.tone === 'good' ? 'check' : item.tone === 'warn' ? 'alert-triangle' : 'x', 14)}</span><div><strong>${esc(item.label)}</strong><small>${esc(item.copy)}</small></div><span class="health-check-value">${esc(item.value)}</span></div>`).join('')}</div><div class="notice-band info">${icon('shield-check', 19)}<div><div class="notice-title">資料保護機制已啟用</div><div class="notice-copy">完整資料儲存失敗時，系統會另存不含照片的文字安全備份，避免重新開啟後整筆消失。</div></div></div></div>`;
  }

  function openHealthDialog() {
    openDialog({
      title: '系統健康檢查',
      body: renderHealthCheckBody(),
      footer: `<button type="button" class="btn" data-action="run-health-check">${icon('refresh-cw', 15)}重新檢查</button><button type="button" class="btn btn-primary" data-action="close-dialog">完成</button>`,
    });
  }

  function openProfileDialog() {
    const person = currentPerson();
    const visualTheme = currentVisualTheme();
    openDialog({
      title: '使用者與介面',
      body: `<div class="teacher-status"><span class="status-avatar">${esc(person.initials || person.nickname.slice(0, 2))}</span><div><div class="table-primary">${esc(person.nickname)}</div><div class="table-secondary">${esc(person.department)} · ${state.ui.role === 'manager' ? '主管' : '安親老師'}</div></div></div><div class="section-divider"></div><section class="visual-mode-setting" aria-labelledby="visual-mode-title"><div class="visual-mode-heading"><div><strong id="visual-mode-title">介面風格</strong><small>只調整外觀，工作紀錄與上傳資料不會改變</small></div><span class="badge outline">可隨時切換</span></div><div class="theme-choice-group" role="group" aria-label="選擇介面風格"><button type="button" class="theme-choice ${visualTheme === 'playful' ? 'active' : ''}" data-action="set-visual-theme" data-theme="playful" aria-pressed="${visualTheme === 'playful'}"><span class="theme-choice-icon playful">${icon('sparkles', 18)}</span><span><strong>布拉克可愛版</strong><small>暖色背景、角色圖案與清楚的品牌色按鈕</small></span><span class="theme-choice-check">${visualTheme === 'playful' ? icon('check', 15) : ''}</span></button><button type="button" class="theme-choice ${visualTheme === 'calm' ? 'active' : ''}" data-action="set-visual-theme" data-theme="calm" aria-pressed="${visualTheme === 'calm'}"><span class="theme-choice-icon">${icon('align-justify', 18)}</span><span><strong>清爽版</strong><small>減少色彩與裝飾，適合偏好簡潔的老師</small></span><span class="theme-choice-check">${visualTheme === 'calm' ? icon('check', 15) : ''}</span></button></div></section><div class="section-divider"></div><div class="notice-band info">${icon('database', 19)}<div><div class="notice-title">審查資料已與正式系統隔離</div><div class="notice-copy">這裡的新增、修改、上傳與審查只保存在本機瀏覽器。</div></div></div>`,
      footer: `<button type="button" class="btn btn-danger" data-action="reset-demo">${icon('rotate-ccw', 15)}清空審查資料</button><button type="button" class="btn" data-action="open-health">${icon('activity', 15)}健康檢查</button><button type="button" class="btn" data-action="close-dialog">關閉</button>`,
    });
  }

  function openMoreNav() {
    openDialog({ title: '更多功能', body: `<nav class="side-nav">${roleNav().map(renderNavButton).join('')}</nav>` });
  }

  function captureActivityDetailFields(type = activityDraft?.type) {
    if (!activityDraft || !type) return {};
    const details = {};
    $$('[data-detail-key]', $('#activity-form') || document).forEach(field => {
      details[field.dataset.detailKey] = field.value.trim();
    });
    activityDraft.detailCache = activityDraft.detailCache || {};
    activityDraft.detailCache[type] = details;
    activityDraft.details = details;
    return details;
  }

  function capturePrepEvidenceRows() {
    if (!activityDraft) return [];
    const byId = new Map((activityDraft.prepEvidence || []).map(item => [item.id, item]));
    $$('[data-prep-row]', $('#activity-form') || document).forEach(row => {
      const item = byId.get(row.dataset.prepId);
      if (!item) return;
      item.category = $('[data-prep-category]', row)?.value || '';
      item.note = String($('[data-prep-note]', row)?.value || '').trim();
    });
    return activityDraft.prepEvidence || [];
  }

  function capturePrepFeedbackFields() {
    if (!activityDraft) return {};
    const feedback = {
      strengths: String($('#activity-prep-strengths')?.value || activityDraft.prepFeedback?.strengths || '').trim(),
      resonance: String($('#activity-student-resonance')?.value || activityDraft.prepFeedback?.resonance || '').trim(),
      changes: String($('#activity-prep-changes')?.value || activityDraft.prepFeedback?.changes || '').trim(),
    };
    activityDraft.prepFeedback = feedback;
    return feedback;
  }

  function captureCoursePrepFormDraft() {
    const form = $('#course-prep-form');
    if (!form || !activityDraft) return activityDraft;
    const data = new FormData(form);
    Object.assign(activityDraft, {
      id: String(data.get('id') || activityDraft.id || ''),
      type: 'lessonprep',
      title: String(data.get('title') || '').trim(),
      className: String(data.get('className') || '').trim(),
      students: [],
      details: { targetCourse: String(data.get('targetCourse') || '') },
      planId: String(data.get('planId') || activityDraft.planId || ''),
      prep: { summary: String(data.get('prepSummary') || '').trim(), adjustment: '' },
      owner: activityDraft.owner || state.context.teacher,
      dueDate: '',
    });
    activityDraft.detailCache = { lessonprep: clone(activityDraft.details) };
    return activityDraft;
  }

  function captureActivityFormDraft() {
    if ($('#course-prep-form')) return captureCoursePrepFormDraft();
    const form = $('#activity-form');
    if (!form || !activityDraft) return activityDraft;
    captureActivityDetailFields(activityDraft.type);
    capturePrepEvidenceRows();
    capturePrepFeedbackFields();
    const data = new FormData(form);
    const type = String(data.get('type') || activityDraft.type || 'tutoring');
    const details = clone(activityDraft.detailCache?.[type] || activityDraft.details || {});
    Object.assign(activityDraft, {
      id: String(data.get('id') || activityDraft.id || ''),
      type,
      title: String(data.get('title') || '').trim(),
      className: String(data.get('className') || '').trim(),
      students: type === 'lessonprep' ? [] : data.getAll('students'),
      details,
      prepSourceId: String(data.get('prepSourceId') || activityDraft.prepSourceId || ''),
      planId: String(data.get('planId') || prepSourceById(data.get('prepSourceId'))?.planId || ''),
      objective: String(data.get('objective') || '').trim(),
      action: String(data.get('action') || '').trim(),
      result: String(data.get('result') || '').trim(),
      issue: String(data.get('issue') || '').trim(),
      nextAction: String(data.get('nextAction') || '').trim(),
      owner: String(data.get('owner') || state.context.teacher).trim(),
      dueDate: String(data.get('dueDate') || ''),
      prep: {
        summary: String(data.get('prepSummary') || '').trim(),
        adjustment: String(data.get('prepAdjustment') || '').trim(),
      },
      prepFeedback: {
        strengths: String(data.get('prepStrengths') || activityDraft.prepFeedback?.strengths || '').trim(),
        resonance: String(data.get('studentResonance') || activityDraft.prepFeedback?.resonance || '').trim(),
        changes: String(data.get('prepChanges') || activityDraft.prepFeedback?.changes || '').trim(),
      },
    });
    activityDraft.detailCache = activityDraft.detailCache || {};
    activityDraft.detailCache[type] = clone(details);
    return activityDraft;
  }

  function saveCoursePrepForm(form) {
    if (!form.reportValidity()) return;
    const draft = captureCoursePrepFormDraft();
    const data = new FormData(form);
    const id = String(data.get('id') || uid('prep'));
    const existing = state.activities.find(item => item.id === id && item.type === 'lessonprep');
    const planId = String(data.get('planId') || draft?.planId || '');
    const item = {
      id,
      date: existing?.date || state.daily.date,
      updatedAt: new Date().toISOString(),
      teacher: existing?.teacher || state.context.teacher,
      type: 'lessonprep',
      title: String(data.get('title') || '').trim(),
      className: String(data.get('className') || '').trim(),
      students: [],
      details: { targetCourse: String(data.get('targetCourse') || '') },
      prepSourceId: '',
      planId,
      objective: '', action: '', result: '', issue: '', nextAction: '',
      owner: existing?.owner || state.context.teacher,
      dueDate: '',
      status: directPlanReady(planId) ? 'complete' : 'draft',
      prep: { summary: String(data.get('prepSummary') || '').trim(), adjustment: '' },
      prepFeedback: { strengths: '', resonance: '', changes: '' },
      prepEvidence: clone(draft?.prepEvidence || existing?.prepEvidence || []),
      evidence: clone(existing?.evidence || []),
    };
    if (existing) Object.assign(existing, item);
    else state.activities.unshift(item);
    if (planId) {
      const linkedPlan = planById(planId);
      if (linkedPlan) {
        linkedPlan.sourceActivityId = id;
        syncPlanIdentityFromPrep(linkedPlan, item);
      }
    }
    clearCurrentDrawerDraft();
    closeDrawer();
    persist();
    renderApp();
    toast(item.status === 'complete' ? '備課檔案已歸檔，可於授課紀錄選用' : '備課檔案草稿已儲存', 'success');
  }

  function saveActivityForm(form) {
    if (!form.reportValidity()) return;
    captureActivityDetailFields(activityDraft?.type);
    capturePrepEvidenceRows();
    capturePrepFeedbackFields();
    const data = new FormData(form);
    const id = data.get('id') || uid('act');
    const existing = state.activities.find(item => item.id === id);
    const type = data.get('type');
    const prepSourceId = activityNeedsPrepSource(type) ? String(data.get('prepSourceId') || activityDraft?.prepSourceId || '') : '';
    const prepSource = prepSourceById(prepSourceId);
    const prepEvidence = type === 'lessonprep' ? clone(activityDraft?.prepEvidence || existing?.prepEvidence || []) : [];
    const details = clone(activityDraft?.detailCache?.[type] || activityDraft?.details || {});
    const activity = {
      id,
      date: existing ? existing.date : state.daily.date,
      teacher: existing ? existing.teacher : state.context.teacher,
      type,
      title: data.get('title').trim(),
      className: data.get('className').trim(),
      students: type === 'lessonprep' ? [] : data.getAll('students'),
      details,
      prepSourceId,
      planId: type === 'lessonprep' ? String(data.get('planId') || '') : prepSource?.planId || '',
      objective: data.get('objective').trim(),
      action: data.get('action').trim(),
      result: data.get('result').trim(),
      issue: data.get('issue').trim(),
      nextAction: data.get('nextAction').trim(),
      owner: data.get('owner').trim() || state.context.teacher,
      dueDate: data.get('dueDate'),
      status: 'complete',
      prep: type === 'lessonprep' ? { summary: String(data.get('prepSummary') || '').trim(), adjustment: String(data.get('prepAdjustment') || '').trim() } : { summary: '', adjustment: '' },
      prepFeedback: activityNeedsPrepSource(type) ? {
        strengths: String(data.get('prepStrengths') || '').trim(),
        resonance: String(data.get('studentResonance') || '').trim(),
        changes: String(data.get('prepChanges') || '').trim(),
      } : { strengths: '', resonance: '', changes: '' },
      prepEvidence,
      evidence: existing ? clone(existing.evidence || []) : [],
    };
    activity.evidence.forEach(evidence => { evidence.claim = activity.result; });
    const missingDetails = activityDetailSchema(activity.type).filter(field => String(activity.details[field.key] || '').length < field.min);
    if (missingDetails.length) {
      toast(`請完整填寫：${missingDetails.map(field => field.label).join('、')}`, 'danger');
      return;
    }
    const scheduleIssues = crossDayScheduleIssues(activity);
    if (scheduleIssues.length) {
      toast(scheduleIssues[0], 'danger');
      return;
    }
    if (type === 'lessonprep' && activity.details.stage === '授課版鎖定') {
      if (!directPlanReady(activity.planId)) {
        toast('授課版鎖定前，教學設計與教材需完成八項門檻並至少送主管審查', 'danger');
        return;
      }
      if (!(activity.evidence || []).some(item => item.quality >= 80)) {
        toast('授課版鎖定前，請先儲存研發進度並加入可判讀的教案／教材成品', 'danger');
        return;
      }
    }
    if (type === 'lessonprep' && !activityPreparationReady(activity)) {
      toast('請完成接續依據、未來使用調整，且每份研發附件都要有類別與主管判讀重點', 'danger');
      return;
    }
    if (activityNeedsPrepSource(type) && !prepSourceUsable(prepSource, type, activity.date)) {
      toast(prepSourceReadinessIssues(prepSource, type, activity.date)[0] || '請選擇可使用的備課版本', 'danger');
      return;
    }
    if (activityNeedsPrepSource(type) && !prepFeedbackComplete(activity)) {
      toast('請完整填寫教案有效處、孩子共鳴與需要調整的地方', 'danger');
      return;
    }
    const planPending = !activityPlanReady(activity);
    activity.status = activityComplete(activity) ? 'complete' : 'evidence-needed';
    if (existing) Object.assign(existing, activity);
    else state.activities.unshift(activity);
    if (type === 'lessonprep' && activity.planId) {
      const linkedPlan = planById(activity.planId);
      if (linkedPlan) {
        linkedPlan.sourceActivityId = id;
        syncPlanIdentityFromPrep(linkedPlan, activity);
      }
    }
    upsertDerivedTask(`activity:${id}`, activity.nextAction, type === 'lessonprep' ? '課程備課' : '工作紀錄', activity.owner, activity.dueDate, activity.issue ? 'high' : 'medium');
    state.daily.status = 'draft';
    clearCurrentDrawerDraft();
    closeDrawer();
    persist();
    renderApp();
    toast(planPending ? '工作草稿已儲存；課程備課完成並送審後才能送出今日紀錄' : type === 'lessonprep' ? '課程備課已儲存，下一步已加入追蹤' : '工作紀錄已儲存', planPending ? '' : 'success');
  }

  function saveStudentCaseForm(form) {
    if (!form.reportValidity()) return;
    const data = new FormData(form);
    const id = data.get('id') || uid('case');
    const existing = state.studentCases.find(item => item.id === id);
    const item = {
      id, date: existing ? existing.date : state.daily.date, teacher: existing ? existing.teacher : state.context.teacher,
      student: data.get('student'), category: data.get('category'), urgency: data.get('urgency'),
      observation: data.get('observation').trim(), intervention: data.get('intervention').trim(), outcome: data.get('outcome').trim(),
      nextAction: data.get('nextAction').trim(), dueDate: data.get('dueDate'), status: data.get('status'),
      parentContacted: data.get('parentContacted') === 'on',
    };
    if (existing) Object.assign(existing, item);
    else state.studentCases.unshift(item);
    state.daily.noStudentFollowupConfirmed = false;
    upsertDerivedTask(`case:${id}`, `${item.student}｜${item.nextAction}`, '學生追蹤', item.teacher, item.dueDate, item.urgency === 'high' ? 'high' : 'medium', item.status === 'closed');
    clearCurrentDrawerDraft();
    closeDrawer(); persist(); renderApp(); toast('學生追蹤已儲存', 'success');
  }

  function saveContactForm(form) {
    if (!form.reportValidity()) return;
    const data = new FormData(form);
    const id = data.get('id') || uid('contact');
    const existing = state.contacts.find(item => item.id === id);
    const item = {
      id, date: existing ? existing.date : state.daily.date, teacher: existing ? existing.teacher : state.context.teacher,
      student: data.get('student'), channel: data.get('channel'), topic: data.get('topic').trim(), summary: data.get('summary').trim(),
      decision: data.get('decision').trim(), nextAction: data.get('nextAction').trim(), dueDate: data.get('dueDate'), status: data.get('status'),
    };
    if (existing) Object.assign(existing, item);
    else state.contacts.unshift(item);
    state.daily.parentStatus = 'recorded';
    if (item.nextAction) upsertDerivedTask(`contact:${id}`, `${item.student}｜${item.nextAction}`, '親師溝通', item.teacher, item.dueDate, 'medium', item.status === 'closed');
    clearCurrentDrawerDraft();
    closeDrawer(); persist(); renderApp(); toast('親師溝通已儲存', 'success');
  }

  function saveOperationsForm(form) {
    if (state.operations.dutyOwner !== state.context.teacher) {
      toast('只有今日值日老師可以送出班務檢核', 'danger');
      return;
    }
    if (!form.reportValidity()) return;
    const data = new FormData(form);
    const evidenceByCheck = clone(state.operations.evidenceByCheck || {});
    const checks = {};
    Object.keys(OPERATION_CHECKS).forEach(key => {
      evidenceByCheck[key] = evidenceByCheck[key] || {};
      evidenceByCheck[key].status = String(data.get(`status_${key}`) || '');
      evidenceByCheck[key].action = String(data.get(`action_${key}`) || '').trim();
      checks[key] = evidenceByCheck[key].status === 'normal';
    });
    const missingProof = Object.entries(OPERATION_CHECKS).filter(([key]) => {
      const item = evidenceByCheck[key] || {};
      return !item.fileName || !['normal', 'exception'].includes(item.status);
    });
    if (missingProof.length) {
      toast(`尚缺 ${missingProof.map(([, config]) => config.label).join('、')} 的照片或判定`, 'danger');
      return;
    }
    const incompleteExceptions = Object.entries(OPERATION_CHECKS).filter(([key]) => evidenceByCheck[key]?.status === 'exception' && String(evidenceByCheck[key]?.action || '').length < 8);
    if (incompleteExceptions.length) {
      toast(`請補齊 ${incompleteExceptions.map(([, config]) => config.label).join('、')} 的異常處理、接手人或期限`, 'danger');
      return;
    }
    const fileNames = Object.values(evidenceByCheck).map(item => String(item?.fileName || '').trim().toLowerCase()).filter(Boolean);
    if (new Set(fileNames).size !== fileNames.length) {
      toast('四個面向不可使用相同檔名的照片，請分別拍攝', 'danger');
      return;
    }
    const fingerprints = Object.values(evidenceByCheck).map(item => String(item?.fingerprint || '')).filter(Boolean);
    if (new Set(fingerprints).size !== fingerprints.length) {
      toast('系統偵測到重複影像；同一張照片不能跨面向共用', 'danger');
      return;
    }
    const exceptionEntries = Object.entries(OPERATION_CHECKS).filter(([key]) => evidenceByCheck[key]?.status === 'exception');
    state.operations.status = exceptionEntries.length ? 'exception' : 'normal';
    state.operations.checks = checks;
    state.operations.evidenceByCheck = evidenceByCheck;
    state.operations.exception = exceptionEntries.map(([, config]) => config.label).join('、');
    state.operations.action = exceptionEntries.map(([key, config]) => `${config.label}：${evidenceByCheck[key].action}`).join('；');
    state.operations.confirmedAt = new Date().toISOString();
    if (state.operations.reviewStatus === 'clarify' && state.operations.managerFeedback) state.operations.previousManagerFeedback = state.operations.managerFeedback;
    state.operations.reviewStatus = 'pending';
    state.operations.managerFeedback = '';
    state.operations.reviewedAt = '';
    state.operations.reviewedBy = '';
    persist(); renderApp(); toast('班務檢核已送主管稽核', 'success');
  }

  function saveDailySummaryForm(form, notify = true) {
    const data = new FormData(form);
    const summary = buildDailySummary();
    state.daily.summary.keyResult = summary.keyResult;
    state.daily.summary.followup = summary.followup;
    state.daily.summary.tomorrowPriority = summary.tomorrowPriority;
    state.daily.summary.teacherNote = String(data.get('teacherNote') || '').trim();
    persist();
    if (notify) {
      renderApp();
      toast('給主管的補充已儲存', 'success');
    }
    return true;
  }

  function saveWeeklyForm(form, notify = true) {
    const data = new FormData(form);
    const summary = buildWeeklySummary();
    state.weekly.keyChange = summary.keyChange;
    state.weekly.priorityRisks = summary.priorityRisks;
    state.weekly.nextWeek = summary.nextWeek;
    state.weekly.decisionNeeded = String(data.get('decisionNeeded') || '').trim();
    persist();
    if (notify) {
      renderApp();
      toast('週整理已儲存', 'success');
    }
    return true;
  }

  function saveTaskForm(form) {
    if (!form.reportValidity()) return;
    const data = new FormData(form);
    state.tasks.unshift({ id: uid('task'), title: data.get('title').trim(), source: data.get('source'), owner: state.context.teacher, dueDate: data.get('dueDate'), status: 'open', priority: data.get('priority') });
    closeDrawer(); persist(); renderApp(); toast('事項已新增', 'success');
  }

  function upsertDerivedTask(ref, title, source, owner, dueDate, priority, done = false) {
    if (!title) return;
    let task = state.tasks.find(item => item.ref === ref);
    if (!task) {
      task = { id: uid('task'), ref };
      state.tasks.push(task);
    }
    Object.assign(task, { title, source, owner, dueDate, priority, status: done ? 'done' : 'open' });
  }

  function syncEvidenceDraftFromForm() {
    const form = $('#evidence-form');
    if (!form || !evidenceDraft) return evidenceDraft;
    const data = new FormData(form);
    evidenceDraft.type = data.get('type');
    evidenceDraft.stage = data.get('stage') || 'after';
    evidenceDraft.title = String(data.get('title') || '').trim();
    evidenceDraft.claim = String(data.get('claim') || '').trim();
    evidenceDraft.observation = String(data.get('observation') || '').trim();
    evidenceDraft.students = data.getAll('students');
    evidenceDraft.privacy = data.get('privacy') === 'on';
    $$('[data-evidence-attachment-note]', form).forEach(control => {
      const attachment = evidenceDraft.attachments?.find(item => item.id === control.dataset.attachmentId);
      if (attachment) attachment.note = String(control.value || '').trim();
    });
    return syncEvidencePrimaryFields(evidenceDraft);
  }

  function updateEvidenceQualityFromForm() {
    const draft = syncEvidenceDraftFromForm();
    const box = $('#evidence-quality');
    if (draft && box) box.innerHTML = renderEvidenceQuality(evidenceQuality(draft));
  }

  function saveEvidenceForm(form) {
    if (!form.reportValidity()) return;
    const draft = syncEvidenceDraftFromForm();
    const attachments = evidenceAttachments(draft);
    if (!draft || !attachments.length) {
      toast('請先選擇照片或檔案', 'danger');
      return;
    }
    const attachmentsMissingNotes = attachments.length > 1 ? attachments.filter(item => String(item.note || '').trim().length < 4) : [];
    if (attachmentsMissingNotes.length) {
      toast(`請補上 ${attachmentsMissingNotes.length} 張照片的主管判讀重點`, 'danger');
      return;
    }
    const score = evidenceQuality(draft);
    const item = {
      id: draft.id || uid('ev'), fileName: draft.fileName, mimeType: draft.mimeType, dataUrl: draft.dataUrl || '', type: draft.type,
      stage: draft.stage, title: draft.title, claim: draft.claim, observation: draft.observation, students: draft.students,
      privacy: draft.privacy, pins: clone(draft.pins || []), quality: score, status: score >= 80 ? 'pending' : 'draft',
      createdAt: draft.createdAt || new Date().toISOString(), placeholder: Boolean(draft.placeholder && !draft.dataUrl),
      attachments: clone(attachments), primaryAttachmentId: draft.primaryAttachmentId || attachments[0].id,
    };
    const activityId = form.elements.activityId.value;
    if (activityId === 'operations') {
      state.operations.evidence = item;
    } else {
      const activity = state.activities.find(entry => entry.id === activityId);
      if (!activity) return;
      activity.evidence = activity.evidence || [];
      const existing = activity.evidence.find(entry => entry.id === item.id);
      if (existing) Object.assign(existing, item);
      else activity.evidence.push(item);
      activity.status = activityComplete(activity) ? 'complete' : 'evidence-needed';
    }
    state.ui.evidenceStandardsSeen = true;
    clearCurrentDrawerDraft();
    evidenceDraft = null;
    closeDrawer(); persist(); renderApp();
    toast(score >= 80 ? '證據已達可判讀標準' : '證據已儲存，送出前仍需補充', score >= 80 ? 'success' : '');
  }

  function capturePlanForm() {
    const form = $('#plan-form');
    if (!form || !planDraft) return planDraft;
    const data = new FormData(form);
    Object.assign(planDraft, {
      id: data.get('id') || planDraft.id,
      teacher: planDraft.teacher || state.context.teacher,
      title: String(data.get('title') || '').trim(), courseType: data.get('courseType'), className: String(data.get('className') || '').trim(),
      duration: Number(data.get('duration') || 0), version: String(data.get('version') || '').trim(), sourceActivityId: String(data.get('sourceActivityId') || planDraft.sourceActivityId || ''),
      learnerContext: String(data.get('learnerContext') || '').trim(), objectives: String(data.get('objectives') || '').trim(),
      assessment: String(data.get('assessment') || '').trim(), differentiation: String(data.get('differentiation') || '').trim(),
      safetyPrivacy: String(data.get('safetyPrivacy') || '').trim(), reflection: String(data.get('reflection') || '').trim(),
      updatedAt: state.daily.date,
    });
    planDraft.flow = $$('[data-flow-row]', form).map(row => {
      const inputs = $$('input', row);
      const areas = $$('textarea', row);
      return { id: row.dataset.flowId, stage: inputs[0] ? inputs[0].value.trim() : '', minutes: Number(inputs[1] ? inputs[1].value : 0), teacher: areas[0] ? areas[0].value.trim() : '', student: areas[1] ? areas[1].value.trim() : '', checkpoint: areas[2] ? areas[2].value.trim() : '' };
    });
    return planDraft;
  }

  function refreshPlanEditor() {
    const body = $('#drawer-body');
    if (!body || !planDraft) return;
    body.innerHTML = renderPlanForm(planDraft);
    hydrateIcons();
  }

  function savePlanForm(form) {
    if (!form.reportValidity()) return;
    const value = capturePlanForm();
    const id = value.id || uid('plan');
    const existing = state.lessonPlans.find(item => item.id === id);
    value.id = id;
    value.status = existing ? existing.status : 'draft';
    if (existing) Object.assign(existing, clone(value));
    else state.lessonPlans.unshift(clone(value));
    if (value.sourceActivityId) {
      const sourceActivity = state.activities.find(item => item.id === value.sourceActivityId);
      if (sourceActivity) {
        sourceActivity.planId = id;
        syncPlanIdentityFromPrep(value, sourceActivity);
        const savedPlan = state.lessonPlans.find(item => item.id === id);
        if (savedPlan) syncPlanIdentityFromPrep(savedPlan, sourceActivity);
      }
    }
    const activityToRestore = returnActivityDraft ? clone(returnActivityDraft) : null;
    persist();
    if (activityToRestore) {
      activityToRestore.planId = id;
      returnActivityDraft = null;
      showActivityEditor(activityToRestore);
      toast('教案內容與教材已儲存並帶回同一份備課檔案', 'success');
      return;
    }
    closeDrawer(); renderApp(); toast('教案內容與教材已儲存', 'success');
  }

  function planMaterialCategory(fileName) {
    const ext = String(fileName).split('.').pop().toLowerCase();
    if (['ppt', 'pptx', 'key'].includes(ext)) return 'slides';
    if (['pdf', 'doc', 'docx'].includes(ext)) return 'worksheet';
    if (['xls', 'xlsx', 'csv'].includes(ext)) return 'assessment';
    return 'other';
  }

  function formatFileSize(bytes) {
    if (!bytes) return '0 KB';
    if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  }

  function submitDaily() {
    const form = $('#daily-summary-form');
    if (form) saveDailySummaryForm(form, false);
    if (dailyCompletion() < 100) {
      toast('尚有必要資料未完成', 'danger');
      renderApp();
      return;
    }
    state.daily.status = 'submitted';
    state.daily.submittedAt = new Date().toISOString();
    const existing = state.submissions.find(item => item.date === state.daily.date && item.teacher === state.context.teacher);
    const payload = {
      id: existing ? existing.id : uid('sub'), date: state.daily.date, teacher: state.context.teacher, department: state.context.department,
      submittedAt: state.daily.submittedAt, status: 'pending', activityIds: todayActivities().map(item => item.id),
      studentCaseIds: state.studentCases.filter(item => item.date === state.daily.date && item.teacher === state.context.teacher).map(item => item.id),
      contactIds: state.contacts.filter(item => item.date === state.daily.date && item.teacher === state.context.teacher).map(item => item.id),
      activitySnapshots: todayActivities().map(clone),
      studentCaseSnapshots: state.studentCases.filter(item => item.date === state.daily.date && item.teacher === state.context.teacher).map(clone),
      contactSnapshots: state.contacts.filter(item => item.date === state.daily.date && item.teacher === state.context.teacher).map(clone),
      keyResult: state.daily.summary.keyResult, followup: state.daily.summary.followup, tomorrowPriority: state.daily.summary.tomorrowPriority,
      teacherNote: state.daily.summary.teacherNote || '', feedback: '',
    };
    if (existing) Object.assign(existing, payload);
    else state.submissions.unshift(payload);
    persist(); renderApp(); toast('今日紀錄已送出主管審查', 'success');
  }

  function submitWeekly() {
    const form = $('#weekly-form');
    if (form) saveWeeklyForm(form, false);
    state.weekly.status = 'submitted';
    persist(); renderApp(); toast('本週整理已送出', 'success');
  }

  function navigate(route) {
    state.ui.route = route;
    if (route === 'guide') state.ui.guidePromptDismissed = true;
    closeDialog();
    closeDrawer();
    persist();
    renderApp();
  }

  function openDeleteDialog(kind, id, parentId = '') {
    const prep = kind === 'activity' ? prepSourceById(id) : null;
    const usageCount = prep ? state.activities.filter(item => item.prepSourceId === id).length : 0;
    if (prep && usageCount) {
      openDialog({
        title: '無法刪除備課檔案',
        body: `<div class="notice-band danger">${icon('link-2', 19)}<div><div class="notice-title">已有 ${usageCount} 筆授課紀錄使用這份檔案</div><div class="notice-copy">為保留主管追溯與歷史紀錄，已被使用的備課檔案不能刪除。</div></div></div>`,
        footer: '<button type="button" class="btn btn-primary" data-action="close-dialog">知道了</button>',
      });
      return;
    }
    const labels = { activity: prep ? '備課檔案' : '工作紀錄', student: '學生追蹤', contact: '親師溝通', evidence: '證據', plan: '教案' };
    openDialog({
      title: `刪除${labels[kind] || '資料'}`,
      body: `<div class="notice-band danger">${icon('triangle-alert', 19)}<div><div class="notice-title">刪除後無法復原</div><div class="notice-copy">${prep ? '同一份檔案內的教案內容與教材會一併刪除。' : '此操作只影響新版審查資料，不會改動正式系統。'}</div></div></div>`,
      footer: `<button type="button" class="btn" data-action="close-dialog">取消</button><button type="button" class="btn btn-danger" data-action="confirm-delete" data-kind="${kind}" data-id="${esc(id)}" data-parent-id="${esc(parentId)}">${icon('trash-2', 15)}確認刪除</button>`,
    });
  }

  function confirmDelete(kind, id, parentId) {
    if (kind === 'activity') {
      const activity = state.activities.find(item => item.id === id);
      const linkedPlanId = activity?.type === 'lessonprep' ? activity.planId : '';
      state.activities = state.activities.filter(item => item.id !== id);
      state.tasks = state.tasks.filter(item => item.ref !== `activity:${id}`);
      if (linkedPlanId) state.lessonPlans = state.lessonPlans.filter(item => item.id !== linkedPlanId);
    } else if (kind === 'student') {
      state.studentCases = state.studentCases.filter(item => item.id !== id);
      state.tasks = state.tasks.filter(item => item.ref !== `case:${id}`);
    } else if (kind === 'contact') {
      state.contacts = state.contacts.filter(item => item.id !== id);
      state.tasks = state.tasks.filter(item => item.ref !== `contact:${id}`);
    } else if (kind === 'evidence') {
      if (parentId === 'operations') state.operations.evidence = null;
      else {
        const activity = state.activities.find(item => item.id === parentId);
        if (activity) activity.evidence = (activity.evidence || []).filter(item => item.id !== id);
      }
    } else if (kind === 'plan') {
      state.lessonPlans = state.lessonPlans.filter(item => item.id !== id);
      state.activities.forEach(activity => {
        if (activity.planId === id) activity.planId = '';
      });
    }
    clearCurrentDrawerDraft();
    closeDialog(); closeDrawer(); persist(); renderApp(); toast('資料已刪除', 'success');
  }

  function generatePlanOutline() {
    const current = capturePlanForm();
    const source = state.activities.find(item => item.id === current.sourceActivityId);
    if (!source) {
      toast('請先選擇來源工作紀錄', 'danger');
      return;
    }
    const total = Number(current.duration || 60);
    const warmup = Math.max(5, Math.round(total * 0.15 / 5) * 5);
    const model = Math.max(10, Math.round(total * 0.25 / 5) * 5);
    const close = Math.max(5, Math.round(total * 0.15 / 5) * 5);
    const practice = Math.max(10, total - warmup - model - close);
    Object.assign(planDraft, {
      title: current.title || source.title,
      courseType: ACTIVITY_TYPES[source.type] ? ACTIVITY_TYPES[source.type].label : current.courseType,
      className: current.className || source.className,
      learnerContext: current.learnerContext || `${source.className} 已進行相關基礎學習；本次需特別留意：${source.issue || '學生程度差異與個別支持。'}`,
      objectives: current.objectives || source.objective,
      assessment: current.assessment || `以課堂產出與口頭說明進行檢核。達成標準：${source.result || '學生能獨立完成主要任務。'}`,
      differentiation: current.differentiation || '基礎組提供步驟提示與範例；進階組增加解釋、延伸或同儕教學任務。',
      safetyPrivacy: current.safetyPrivacy || '教材與成果照片不顯示完整姓名；拍攝前確認學生影像使用範圍。',
      flow: [
        { id: uid('flow'), stage: '引起動機', minutes: warmup, teacher: `連結學生經驗並說明任務：${source.title}`, student: '回應問題、說出先備經驗。', checkpoint: '確認先備概念與常見迷思。' },
        { id: uid('flow'), stage: '示範與建模', minutes: model, teacher: source.action, student: '觀察步驟、提出問題並口述關鍵方法。', checkpoint: '用一題或一個示例即時檢核。' },
        { id: uid('flow'), stage: '練習／任務', minutes: practice, teacher: '巡迴觀察、提問與提供分層支持。', student: '完成個別或小組任務，保留可判讀產出。', checkpoint: '依目標逐項記錄學生表現。' },
        { id: uid('flow'), stage: '統整與離場檢核', minutes: close, teacher: '整理重點並說明下一步。', student: '完成離場題或口頭說明。', checkpoint: '確認是否達成學習目標。' },
      ],
    });
    refreshPlanEditor();
    toast('已由工作紀錄產生教案骨架', 'success');
  }

  async function fileToPreview(file) {
    if (!file.type.startsWith('image/')) return '';
    const dataUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
    return await new Promise(resolve => {
      const image = new Image();
      image.onload = () => {
        const max = 1200;
        const scale = Math.min(1, max / Math.max(image.width, image.height));
        const width = Math.max(1, Math.round(image.width * scale));
        const height = Math.max(1, Math.round(image.height * scale));
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext('2d');
        context.fillStyle = '#ffffff';
        context.fillRect(0, 0, width, height);
        context.drawImage(image, 0, 0, width, height);
        let quality = 0.76;
        let preview = canvas.toDataURL('image/jpeg', quality);
        const estimatedBytes = value => Math.ceil((value.length - value.indexOf(',') - 1) * 0.75);
        while (estimatedBytes(preview) > 460 * 1024 && quality > 0.44) {
          quality -= 0.08;
          preview = canvas.toDataURL('image/jpeg', quality);
        }
        if (estimatedBytes(preview) > 460 * 1024) {
          const resizeScale = Math.max(0.58, Math.sqrt((460 * 1024) / estimatedBytes(preview)));
          const reduced = document.createElement('canvas');
          reduced.width = Math.max(1, Math.round(width * resizeScale));
          reduced.height = Math.max(1, Math.round(height * resizeScale));
          const reducedContext = reduced.getContext('2d');
          reducedContext.fillStyle = '#ffffff';
          reducedContext.fillRect(0, 0, reduced.width, reduced.height);
          reducedContext.drawImage(canvas, 0, 0, reduced.width, reduced.height);
          preview = reduced.toDataURL('image/jpeg', 0.62);
        }
        resolve(preview);
      };
      image.onerror = () => resolve('');
      image.src = dataUrl;
    });
  }

  function refreshEvidenceAttachmentUI() {
    if (!evidenceDraft) return;
    syncEvidencePrimaryFields(evidenceDraft);
    const attachments = evidenceAttachments(evidenceDraft);
    const uploadZone = $('#evidence-upload-zone');
    if (uploadZone) uploadZone.classList.toggle('has-file', Boolean(attachments.length));
    const uploadTitle = $('#evidence-upload-title');
    if (uploadTitle) uploadTitle.innerHTML = `${attachments.length ? `已加入 ${attachments.length} 份成果` : '成果照片／檔案'} <span class="required">*</span>`;
    const fileName = $('#evidence-file-name');
    if (fileName) fileName.textContent = attachments.length ? attachments.map(item => item.fileName).join('、') : '尚未選擇檔案 · 單檔上限 15 MB';
    const list = $('#evidence-attachment-list');
    if (list) list.innerHTML = renderEvidenceAttachmentList(evidenceDraft);
    const canvas = $('#evidence-canvas');
    if (canvas) {
      canvas.classList.toggle('has-image', Boolean(evidenceDraft.dataUrl));
      canvas.innerHTML = renderEvidenceCanvas(evidenceDraft);
    }
    const pinList = $('#pin-list');
    if (pinList) pinList.innerHTML = renderPinList(evidenceDraft.pins || []);
    updateEvidenceQualityFromForm();
    markRequiredFields($('#evidence-form') || document);
    hydrateIcons();
    scheduleCurrentDrawerDraft();
  }

  async function handleEvidenceFile(input) {
    const files = Array.from(input.files || []);
    if (!files.length || !evidenceDraft) return;
    syncEvidenceDraftFromForm();
    evidenceDraft.attachments = evidenceAttachments(evidenceDraft);
    const availableSlots = MAX_EVIDENCE_FILES - evidenceDraft.attachments.length;
    if (availableSlots <= 0) {
      input.value = '';
      toast(`每筆證據最多 ${MAX_EVIDENCE_FILES} 份照片或檔案`, 'danger');
      return;
    }
    const selected = files.slice(0, availableSlots);
    const oversized = selected.filter(file => file.size > 15 * 1024 * 1024);
    const accepted = selected.filter(file => file.size <= 15 * 1024 * 1024);
    const fileName = $('#evidence-file-name');
    if (fileName) fileName.textContent = `正在處理 ${accepted.length} 份檔案…`;
    try {
      let added = 0;
      for (const file of accepted) {
        const fingerprint = await hashFile(file);
        const duplicate = evidenceDraft.attachments.some(item => item.fingerprint === fingerprint);
        if (duplicate) continue;
        const dataUrl = await fileToPreview(file);
        const attachment = {
          id: uid('attachment'),
          fileName: file.name,
          mimeType: file.type || 'application/octet-stream',
          dataUrl,
          size: formatFileSize(file.size),
          note: '',
          fingerprint,
          placeholder: !dataUrl,
        };
        evidenceDraft.attachments.push(attachment);
        if (!evidenceDraft.primaryAttachmentId) evidenceDraft.primaryAttachmentId = attachment.id;
        added += 1;
      }
      syncEvidencePrimaryFields(evidenceDraft);
      refreshEvidenceAttachmentUI();
      input.value = '';
      if (files.length > availableSlots) toast(`已加入前 ${availableSlots} 份；每筆上限 ${MAX_EVIDENCE_FILES} 份`, 'danger');
      else if (oversized.length) toast(`${oversized.length} 份超過 15 MB，其他 ${added} 份已加入`, 'danger');
      else if (added < accepted.length) toast(`已加入 ${added} 份；重複檔案已略過`, 'success');
      else toast(`已一次加入 ${added} 份成果`, 'success');
    } catch (error) {
      input.value = '';
      toast('部分檔案處理失敗，已加入的內容仍會保留', 'danger');
    }
  }

  function placeEvidencePin(event, canvas) {
    if (!evidenceDraft || !evidenceDraft.dataUrl || event.target.closest('.evidence-pin') || event.target.closest('.pin-composer')) return;
    const rect = canvas.getBoundingClientRect();
    const x = Math.max(5, Math.min(95, (event.clientX - rect.left) / rect.width * 100));
    const y = Math.max(5, Math.min(88, (event.clientY - rect.top) / rect.height * 100));
    activePinPosition = { x: Number(x.toFixed(1)), y: Number(y.toFixed(1)) };
    const existing = $('.pin-composer', canvas);
    if (existing) existing.remove();
    canvas.insertAdjacentHTML('beforeend', `<div class="pin-composer" style="left:${x}%;top:${y}%;"><input id="pin-note-input" maxlength="80" placeholder="這個位置要主管看什麼？"><div class="pin-composer-actions"><button type="button" class="btn btn-small btn-primary" data-action="save-evidence-pin">加入標記</button><button type="button" class="btn btn-small" data-action="cancel-evidence-pin">取消</button></div></div>`);
    $('#pin-note-input', canvas).focus();
  }

  function refreshEvidencePins() {
    const canvas = $('#evidence-canvas');
    if (canvas) {
      $$('.evidence-pin', canvas).forEach(node => node.remove());
      canvas.insertAdjacentHTML('beforeend', renderPins(evidenceDraft.pins));
    }
    const list = $('#pin-list');
    if (list) list.innerHTML = renderPinList(evidenceDraft.pins);
    updateEvidenceQualityFromForm();
    hydrateIcons();
  }

  function refreshActivityFormCopy(type) {
    const copy = activityFormCopy(type);
    const guide = activityGuide(type);
    const setText = (selector, value) => { const node = $(selector); if (node) node.textContent = value; };
    const classLabel = $('#activity-class-label');
    const titleLabel = $('#activity-title-label');
    if (classLabel) classLabel.innerHTML = `${esc(copy.classLabel)} <span class="required">*</span>`;
    if (titleLabel) titleLabel.innerHTML = `${esc(copy.titleLabel)} <span class="required">*</span>`;
    const classInput = $('#activity-class');
    const titleInput = $('#activity-title');
    if (classInput) classInput.placeholder = copy.classPlaceholder;
    if (titleInput) titleInput.placeholder = copy.titlePlaceholder;
    const students = $('#activity-students-field');
    if (students) students.hidden = copy.hideStudents;
    if (type === 'lessonprep') {
      setText('#activity-prep-title', copy.prepTitle);
      setText('#activity-prep-subtitle', copy.prepSubtitle);
      const prepBadge = $('#activity-prep-badge');
      if (prepBadge) { prepBadge.className = 'badge blue'; prepBadge.textContent = copy.prepBadge; }
      const prepSummaryLabel = $('#activity-prep-summary-label');
      if (prepSummaryLabel) prepSummaryLabel.innerHTML = `${esc(copy.prepSummaryLabel || `本次${guide.prep}`)} <span class="required">*</span>`;
      const prepSummary = $('#activity-prep-summary');
      if (prepSummary) prepSummary.placeholder = copy.prepSummaryPlaceholder;
      const adjustmentLabel = $('#activity-prep-adjustment-label');
      if (adjustmentLabel) adjustmentLabel.innerHTML = `${esc(copy.adjustmentLabel)} <span class="required">*</span>`;
      const adjustment = $('#activity-prep-adjustment');
      if (adjustment) adjustment.placeholder = copy.adjustmentPlaceholder;
      const filesLabel = $('#activity-prep-files-label');
      if (filesLabel) filesLabel.innerHTML = '備課依據附件 <span class="required">*</span>';
      setText('#activity-file-title', copy.fileTitle);
      setText('#activity-file-copy', copy.fileCopy);
    }
    setText('#activity-result-title', copy.resultTitle);
    setText('#activity-result-subtitle', copy.resultSubtitle);
    const resultBadge = $('#activity-result-badge');
    if (resultBadge) { resultBadge.className = 'badge blue'; resultBadge.textContent = copy.resultBadge; }
    const ownerLabel = $('#activity-owner-label');
    if (ownerLabel) ownerLabel.innerHTML = `${esc(copy.ownerLabel)} <span class="required">*</span>`;
    const dueLabel = $('#activity-due-label');
    if (dueLabel) dueLabel.innerHTML = `${esc(copy.dueLabel)} <span class="required">*</span>`;
    const due = $('#activity-due');
    if (due) {
      due.required = true;
      due.removeAttribute('max');
    }
    const editing = Boolean($('#activity-form input[name="id"]')?.value);
    setText('#drawer-title', type === 'lessonprep' ? `${editing ? '編輯' : '新增'}課程備課` : `${editing ? '編輯' : '新增'}工作紀錄`);
    const drawerSubtitle = $('.drawer-title p');
    if (drawerSubtitle) drawerSubtitle.textContent = type === 'lessonprep' ? '教案內容與教材集中在同一份備課檔案' : activityNeedsPrepSource(type) ? '選擇備課檔案，再記錄實際教學與課後回饋' : '記錄實際做法、結果、問題與後續行動';
  }

  function refreshCrossDayTimeline() {
    return;
  }

  function refreshActivityGuide(type) {
    const previousType = activityDraft?.type;
    if (previousType) captureActivityDetailFields(previousType);
    capturePrepFeedbackFields();
    capturePrepEvidenceRows();
    const selectedPlan = $('#activity-plan');
    if (activityDraft && selectedPlan) activityDraft.planId = selectedPlan.value;
    const selectedPrepSource = $('#activity-prep-source');
    if (activityDraft && selectedPrepSource) {
      activityDraft.prepSourceCache = activityDraft.prepSourceCache || {};
      activityDraft.prepSourceCache[previousType] = selectedPrepSource.value;
    }
    const guide = activityGuide(type);
    if (activityDraft) {
      activityDraft.type = type;
      activityDraft.detailCache = activityDraft.detailCache || {};
      activityDraft.details = clone(activityDraft.detailCache[type] || {});
      activityDraft.prepSourceId = activityNeedsPrepSource(type) ? activityDraft.prepSourceCache?.[type] || defaultPrepSourceId(type) : '';
    }
    const specificFields = $('#activity-specific-fields');
    if (specificFields) specificFields.innerHTML = renderActivitySpecificFields(type, activityDraft?.details || {});
    const trackIndicator = $('#activity-track-indicator');
    if (trackIndicator) trackIndicator.innerHTML = renderActivityTrackIndicator(type);
    const preparationSection = $('#activity-preparation-section');
    if (preparationSection) preparationSection.outerHTML = renderActivityPreparationSection(activityDraft || { type });
    const feedbackFields = $('#activity-prep-feedback-fields');
    if (feedbackFields) feedbackFields.outerHTML = renderActivityPrepFeedbackFields(type, activityDraft?.prepFeedback || {});
    const guideNode = $('#activity-guide');
    if (guideNode) guideNode.innerHTML = renderActivityTypeExamples(type);
    const fields = [
      ['objective', guide.objective], ['action', guide.action], ['result', guide.result], ['issue', guide.issue], ['next', guide.next],
    ];
    fields.forEach(([key, config]) => {
      const label = $(`#activity-${key}-label`);
      const input = $(`#activity-${key}`);
      if (label) label.innerHTML = `${esc(config[0])}${key === 'issue' ? '' : ' <span class="required">*</span>'}`;
      if (input) input.placeholder = config[1];
    });
    refreshActivityFormCopy(type);
    hydrateIcons();
  }

  function refreshActivityPlanStatus(planId) {
    if (activityDraft) activityDraft.planId = planId;
    const node = $('#activity-plan-status');
    if (node) node.innerHTML = renderPlanLinkStatus(planId, activityDraft?.type || $('#activity-type')?.value || 'tutoring');
    const editButton = $('#edit-selected-plan-button');
    if (editButton) {
      editButton.disabled = !planId;
      if (planId) editButton.dataset.planId = planId;
      else delete editButton.dataset.planId;
    }
    hydrateIcons();
  }

  function refreshActivityPrepSource(sourceId) {
    if (!activityDraft) return;
    activityDraft.prepSourceId = sourceId;
    activityDraft.prepSourceCache = activityDraft.prepSourceCache || {};
    activityDraft.prepSourceCache[activityDraft.type] = sourceId;
    const source = prepSourceById(sourceId);
    activityDraft.planId = source?.planId || '';
    const node = $('#activity-prep-source-status');
    if (node) node.outerHTML = renderPrepSourceStatus(sourceId, activityDraft.type);
    hydrateIcons();
  }

  function inferPrepCategory(fileName) {
    const name = String(fileName || '').toLowerCase();
    if (/教案|流程|lesson/.test(name)) return 'lesson_plan';
    if (/ppt|簡報|slides?/.test(name)) return 'slides';
    if (/學習單|任務單|worksheet/.test(name)) return 'worksheet';
    if (/評量|檢核題|測驗|assessment/.test(name)) return 'assessment';
    if (/規格|清單|checklist/.test(name)) return 'checklist';
    if (/材料|教具|material/.test(name)) return 'material';
    if (/參考|來源|reference/.test(name)) return 'reference';
    return 'other';
  }

  function handlePrepFiles(input) {
    if (!activityDraft) return;
    if (!$('#course-prep-form')) capturePrepEvidenceRows();
    Array.from(input.files || []).forEach(file => {
      activityDraft.prepEvidence = activityDraft.prepEvidence || [];
      activityDraft.prepEvidence.push({ id: uid('prep'), fileName: file.name, size: formatFileSize(file.size), category: inferPrepCategory(file.name), note: '', addedAt: new Date().toISOString() });
    });
    const node = $('#prep-file-list');
    if (node) node.innerHTML = $('#course-prep-form') ? renderSimplePrepFiles(activityDraft.prepEvidence || []) : renderPrepEvidenceList(activityDraft.prepEvidence || []);
    hydrateIcons();
    toast('參考資料已加入', 'success');
  }

  async function hashFile(file) {
    try {
      if (!window.crypto?.subtle) throw new Error('digest unavailable');
      const buffer = await file.arrayBuffer();
      const digest = await window.crypto.subtle.digest('SHA-256', buffer);
      return Array.from(new Uint8Array(digest)).map(value => value.toString(16).padStart(2, '0')).join('');
    } catch (error) {
      return `${file.size}:${file.lastModified}:${file.name.toLowerCase()}`;
    }
  }

  function toggleOperationStatus(control) {
    const item = control.closest('.operation-proof-item');
    if (!item) return;
    const isException = control.value === 'exception' && control.checked;
    item.classList.toggle('is-exception', isException);
    const action = $('[name^="action_"]', item);
    const field = $('.operation-action-field', item);
    if (action) action.required = isException;
    if (field) field.hidden = !isException;
    state.operations.evidenceByCheck = state.operations.evidenceByCheck || {};
    const key = control.dataset.checkKey;
    state.operations.evidenceByCheck[key] = state.operations.evidenceByCheck[key] || {};
    state.operations.evidenceByCheck[key].status = isException ? 'exception' : 'normal';
    state.operations.confirmedAt = '';
    schedulePersist();
  }

  async function handleOperationPhoto(input) {
    const file = input.files && input.files[0];
    const key = input.dataset.checkKey;
    if (!file || !OPERATION_CHECKS[key]) return;
    if (!file.type.startsWith('image/')) {
      input.value = '';
      toast('班務證據需使用照片格式', 'danger');
      return;
    }
    if (file.size > 12 * 1024 * 1024) {
      input.value = '';
      toast('單張照片上限為 12 MB', 'danger');
      return;
    }
    const preview = $(`#operation-preview-${key}`);
    if (preview) preview.classList.add('is-loading');
    try {
      const fingerprint = await hashFile(file);
      const duplicate = Object.entries(state.operations.evidenceByCheck || {}).find(([otherKey, item]) => otherKey !== key && (item?.fingerprint === fingerprint || String(item?.fileName || '').trim().toLowerCase() === file.name.trim().toLowerCase()));
      if (duplicate) {
        input.value = '';
        toast(`這張照片已用於「${OPERATION_CHECKS[duplicate[0]].label}」，請重新拍攝`, 'danger');
        return;
      }
      const dataUrl = await fileToPreview(file);
      state.operations.evidenceByCheck = state.operations.evidenceByCheck || {};
      state.operations.evidenceByCheck[key] = { ...(state.operations.evidenceByCheck[key] || {}), fileName: file.name, size: formatFileSize(file.size), dataUrl, fingerprint, addedAt: new Date().toISOString() };
      state.operations.confirmedAt = '';
      const current = state.operations.evidenceByCheck[key];
      if (preview) {
        preview.className = `operation-photo-preview ${dataUrl ? 'has-image' : ''}`;
        preview.innerHTML = dataUrl ? `<img src="${dataUrl}" alt="${esc(OPERATION_CHECKS[key].label)}證據預覽"><div><strong id="operation-photo-name-${key}">${esc(file.name)}</strong><small>${esc(current.size)}</small></div>` : `<span>${icon('image', 28)}</span><div><strong id="operation-photo-name-${key}">${esc(file.name)}</strong><small>${esc(current.size)}</small></div>`;
      }
      const item = input.closest('.operation-proof-item');
      if (item) item.classList.add('has-proof');
      const badge = $(`#operation-proof-badge-${key}`);
      if (badge) {
        badge.className = 'badge green';
        badge.textContent = '已附照片';
      }
      schedulePersist();
      hydrateIcons();
      toast(`${OPERATION_CHECKS[key].label}照片已加入`, 'success');
    } catch (error) {
      input.value = '';
      toast('照片處理失敗，請重新選擇', 'danger');
    } finally {
      if (preview) preview.classList.remove('is-loading');
    }
  }

  function handleReviewDecision(kind, id, secondaryId) {
    if (kind === 'submission-accept' || kind === 'submission-clarify') {
      const submission = state.submissions.find(item => item.id === id);
      if (!submission) return;
      const feedback = String($('#submission-feedback')?.value || '').trim();
      if (kind === 'submission-clarify' && !feedback) {
        toast('請先寫明需要補充的內容', 'danger');
        return;
      }
      submission.feedback = feedback;
      submission.status = kind === 'submission-accept' ? 'accepted' : 'clarify';
      submission.reviewedAt = new Date().toISOString();
      submission.reviewedBy = state.context.manager;
      if (feedback) appendFeedbackMessage(feedbackThreadKey('submission', id), feedback, 'manager', state.context.manager);
      if (kind === 'submission-clarify') upsertDerivedTask(`review:${id}`, `補充 ${formatShortDate(submission.date)} 日報：${feedback}`, '主管交辦', submission.teacher, addDays(state.daily.date, 1), 'high');
    }
    if (kind === 'evidence-accept' || kind === 'evidence-clarify') {
      const activity = state.activities.find(item => item.id === id);
      const evidence = activity && (activity.evidence || []).find(item => item.id === secondaryId);
      if (!evidence) return;
      const feedback = String($('#evidence-feedback')?.value || '').trim();
      if (kind === 'evidence-clarify' && !feedback) {
        toast('請先寫明需要補充的判讀資訊', 'danger');
        return;
      }
      evidence.status = kind === 'evidence-accept' ? 'accepted' : 'clarify';
      evidence.managerFeedback = feedback;
      evidence.reviewedAt = new Date().toISOString();
      evidence.reviewedBy = state.context.manager;
      if (feedback) appendFeedbackMessage(feedbackThreadKey('evidence', id, secondaryId), feedback, 'manager', state.context.manager);
      if (kind === 'evidence-clarify') upsertDerivedTask(`evidence:${secondaryId}`, `補充證據「${evidence.title}」：${feedback}`, '主管交辦', activity.teacher, addDays(state.daily.date, 1), 'high');
    }
    if (kind === 'plan-approve' || kind === 'plan-changes') {
      const plan = state.lessonPlans.find(item => item.id === id);
      if (!plan) return;
      const feedback = String($('#plan-review-feedback')?.value || '').trim();
      if (kind === 'plan-changes' && !feedback) {
        toast('請先寫明教案需修改的內容', 'danger');
        return;
      }
      plan.managerFeedback = feedback;
      plan.status = kind === 'plan-approve' ? 'approved' : 'changes';
      plan.reviewedAt = new Date().toISOString();
      plan.reviewedBy = state.context.manager;
      if (feedback) appendFeedbackMessage(feedbackThreadKey('plan', id), feedback, 'manager', state.context.manager);
      if (kind === 'plan-changes') upsertDerivedTask(`plan:${id}`, `修正教案「${plan.title}」：${feedback}`, '主管交辦', plan.teacher, addDays(state.daily.date, 2), 'high');
    }
    if (kind === 'operation-accept' || kind === 'operation-clarify') {
      const operation = operationRecordById(id);
      if (!operation || !operation.confirmedAt) return;
      if (!operationsComplete(operation, false)) {
        toast('此筆班務仍缺逐項照片、結果判定或異常處理，無法完成稽核', 'danger');
        return;
      }
      const feedback = String($('#operation-review-feedback')?.value || '').trim();
      if (kind === 'operation-clarify' && !feedback) {
        toast('請先寫明需補充的面向與內容', 'danger');
        return;
      }
      operation.managerFeedback = feedback;
      operation.reviewStatus = kind === 'operation-accept' ? 'accepted' : 'clarify';
      operation.reviewedAt = new Date().toISOString();
      operation.reviewedBy = state.context.manager;
      if (feedback) appendFeedbackMessage(feedbackThreadKey('operation', id), feedback, 'manager', state.context.manager);
      if (kind === 'operation-clarify') {
        upsertDerivedTask(`operations:${id}`, `補充 ${formatShortDate(operation.date)} 班務證據：${feedback}`, '主管交辦', operation.dutyOwner, addDays(state.daily.date, 1), 'high');
      } else {
        const task = state.tasks.find(item => item.ref === `operations:${id}`);
        if (task) task.status = 'done';
      }
    }
    closeDrawer(); persist(); renderApp(); toast(kind.includes('accept') || kind.includes('approve') ? '審查已完成' : '已建立補充待辦', 'success');
  }

  document.addEventListener('submit', event => {
    const form = event.target.closest('form[data-form]');
    if (!form) return;
    event.preventDefault();
    const type = form.dataset.form;
    if (type === 'activity') saveActivityForm(form);
    if (type === 'course-prep') saveCoursePrepForm(form);
    if (type === 'student-case') saveStudentCaseForm(form);
    if (type === 'contact') saveContactForm(form);
    if (type === 'operations') saveOperationsForm(form);
    if (type === 'daily-summary') saveDailySummaryForm(form);
    if (type === 'weekly') saveWeeklyForm(form);
    if (type === 'evidence') saveEvidenceForm(form);
    if (type === 'plan') savePlanForm(form);
    if (type === 'task') saveTaskForm(form);
  });

  document.addEventListener('click', event => {
    const control = event.target.closest('[data-action]');
    if (!control || control.disabled) return;
    const action = control.dataset.action;
    if ((action === 'backdrop-close-drawer' || action === 'backdrop-close-dialog') && event.target !== control) return;

    if (action === 'close-drawer' || action === 'backdrop-close-drawer') closeDrawer();
    else if (action === 'close-dialog' || action === 'backdrop-close-dialog') closeDialog();
    else if (action === 'discard-open-draft') {
      clearCurrentDrawerDraft();
      closeDrawer();
      toast('未送出暫存已清除', 'success');
    }
    else if (action === 'navigate') navigate(control.dataset.route);
    else if (action === 'switch-role') {
      state.ui.role = control.dataset.role;
      state.ui.route = defaultRoute(state.ui.role);
      closeDialog(); closeDrawer(); persist(); renderApp();
    }
    else if (action === 'today-tab') {
      state.ui.todayTab = control.dataset.tab;
      persist(); renderApp();
    }
    else if (action === 'set-view-filter') {
      const filters = getFilters(control.dataset.filterGroup, {});
      filters[control.dataset.filterKey] = control.dataset.filterValue;
      persist(); renderApp();
    }
    else if (action === 'set-guide-type') {
      state.ui.guideType = control.dataset.type;
      persist(); renderApp();
    }
    else if (action === 'dismiss-guide-prompt') {
      state.ui.guidePromptDismissed = true;
      persist(); renderApp();
    }
    else if (action === 'toggle-evidence-standards') {
      const context = control.dataset.context || 'today';
      const expanded = control.getAttribute('aria-expanded') === 'true';
      const wrapper = control.closest('[data-evidence-standards]');
      if (expanded) {
        state.ui.evidenceStandardsSeen = true;
        persist('證據標準已收合');
      }
      if (wrapper) wrapper.outerHTML = renderEvidenceStandardsControl(context, !expanded);
      hydrateIcons();
    }
    else if (action === 'send-feedback-message') {
      const thread = control.closest('[data-feedback-thread]');
      const input = thread?.querySelector('[data-feedback-input]');
      const key = control.dataset.threadKey || thread?.dataset.feedbackThread || '';
      const message = String(input?.value || '').trim();
      if (!key || !message) {
        toast('請先輸入回覆內容', 'danger');
      } else {
        appendFeedbackMessage(key, message);
        const inline = thread?.dataset.feedbackInline === 'true';
        persist('對話已儲存');
        if (thread) thread.outerHTML = renderFeedbackThread(key, { inline });
        hydrateIcons();
        toast('回覆已送出', 'success');
      }
    }
    else if (action === 'open-activity') openActivityEditor(undefined, control.dataset.track || '', control.dataset.type || '');
    else if (action === 'view-activity') openActivityDetail(control.dataset.activityId);
    else if (action === 'edit-activity') openActivityEditor(control.dataset.activityId);
    else if (action === 'delete-activity') openDeleteDialog('activity', control.dataset.activityId);
    else if (action === 'remove-prep-file') {
      if (activityDraft) {
        if (!$('#course-prep-form')) capturePrepEvidenceRows();
        activityDraft.prepEvidence = (activityDraft.prepEvidence || []).filter(item => item.id !== control.dataset.id);
        const node = $('#prep-file-list');
        if (node) node.innerHTML = $('#course-prep-form') ? renderSimplePrepFiles(activityDraft.prepEvidence || []) : renderPrepEvidenceList(activityDraft.prepEvidence || []);
        hydrateIcons();
      }
    }
    else if (action === 'open-student-case') openStudentCaseEditor();
    else if (action === 'edit-student-case') openStudentCaseEditor(control.dataset.caseId);
    else if (action === 'delete-student-case') openDeleteDialog('student', control.dataset.caseId);
    else if (action === 'open-contact') openContactEditor();
    else if (action === 'edit-contact') openContactEditor(control.dataset.contactId);
    else if (action === 'delete-contact') openDeleteDialog('contact', control.dataset.contactId);
    else if (action === 'set-parent-status') {
      if (control.dataset.status === 'none' && state.contacts.some(item => item.date === state.daily.date && item.teacher === state.context.teacher)) {
        toast('今天已有親師溝通紀錄，無法標記為無聯繫', 'danger');
      } else {
        state.daily.parentStatus = control.dataset.status;
        persist(); renderApp();
      }
    }
    else if (action === 'open-evidence') openEvidenceList(control.dataset.activityId);
    else if (action === 'new-evidence') openEvidenceEditor(control.dataset.activityId);
    else if (action === 'edit-evidence') openEvidenceEditor(control.dataset.activityId, control.dataset.evidenceId);
    else if (action === 'delete-evidence') openDeleteDialog('evidence', control.dataset.evidenceId, control.dataset.activityId);
    else if (action === 'inspect-evidence') openEvidenceInspection(control.dataset.activityId, control.dataset.evidenceId);
    else if (action === 'review-operation') openOperationReview(control.dataset.operationId);
    else if (action === 'accept-operation') handleReviewDecision('operation-accept', control.dataset.operationId);
    else if (action === 'request-operation-clarify') handleReviewDecision('operation-clarify', control.dataset.operationId);
    else if (action === 'place-evidence-pin') placeEvidencePin(event, control);
    else if (action === 'set-evidence-primary') {
      if (!evidenceDraft || evidenceDraft.primaryAttachmentId === control.dataset.attachmentId) return;
      syncEvidenceDraftFromForm();
      evidenceDraft.primaryAttachmentId = control.dataset.attachmentId;
      evidenceDraft.pins = [];
      activePinPosition = null;
      refreshEvidenceAttachmentUI();
      toast('已切換標註主圖，請重新加入位置標記', 'success');
    }
    else if (action === 'remove-evidence-attachment') {
      if (!evidenceDraft) return;
      syncEvidenceDraftFromForm();
      const removingPrimary = evidenceDraft.primaryAttachmentId === control.dataset.attachmentId;
      evidenceDraft.attachments = evidenceAttachments(evidenceDraft).filter(item => item.id !== control.dataset.attachmentId);
      if (removingPrimary) {
        evidenceDraft.primaryAttachmentId = evidenceDraft.attachments[0]?.id || '';
        evidenceDraft.pins = [];
      }
      refreshEvidenceAttachmentUI();
    }
    else if (action === 'save-evidence-pin') {
      const input = $('#pin-note-input');
      const note = String(input ? input.value : '').trim();
      if (!note || !activePinPosition || !evidenceDraft) {
        toast('請輸入標記說明', 'danger');
      } else {
        evidenceDraft.pins.push({ ...activePinPosition, note });
        const composer = $('.pin-composer');
        if (composer) composer.remove();
        activePinPosition = null;
        refreshEvidencePins();
      }
    }
    else if (action === 'cancel-evidence-pin') {
      const composer = $('.pin-composer');
      if (composer) composer.remove();
      activePinPosition = null;
    }
    else if (action === 'remove-evidence-pin') {
      if (evidenceDraft) {
        evidenceDraft.pins.splice(Number(control.dataset.pinIndex), 1);
        refreshEvidencePins();
      }
    }
    else if (action === 'submit-daily') submitDaily();
    else if (action === 'submit-weekly') submitWeekly();
    else if (action === 'open-plan') openActivityEditor(undefined, '', 'lessonprep');
    else if (action === 'create-activity-plan') {
      const draft = captureActivityFormDraft();
      const missingPrepIdentity = draft?.type === 'lessonprep' && (!draft.title || !draft.details?.targetCourse);
      if (missingPrepIdentity) {
        toast('請先選擇備課課程類型並填寫備課檔案名稱', 'danger');
      } else if (draft) {
        returnActivityDraft = clone(draft);
        openPlanEditor('', draft);
      }
    }
    else if (action === 'edit-selected-activity-plan') {
      const draft = captureActivityFormDraft();
      const planId = control.dataset.planId || $('#activity-plan')?.value;
      if (!draft || !planId) toast('這份備課檔案尚未建立教案內容與教材', 'danger');
      else {
        returnActivityDraft = clone(draft);
        openPlanEditor(planId);
      }
    }
    else if (action === 'return-to-activity') {
      const draft = returnActivityDraft ? clone(returnActivityDraft) : null;
      returnActivityDraft = null;
      if (draft) showActivityEditor(draft);
      else closeDrawer();
    }
    else if (action === 'view-plan') openPlanDetail(control.dataset.planId);
    else if (action === 'edit-plan') openPlanEditor(control.dataset.planId);
    else if (action === 'delete-plan') openDeleteDialog('plan', control.dataset.planId);
    else if (action === 'generate-plan-outline') generatePlanOutline();
    else if (action === 'add-plan-flow') {
      capturePlanForm();
      planDraft.flow.push({ id: uid('flow'), stage: '', minutes: 10, teacher: '', student: '', checkpoint: '' });
      refreshPlanEditor();
    }
    else if (action === 'remove-plan-flow') {
      capturePlanForm();
      planDraft.flow = planDraft.flow.filter(item => item.id !== control.dataset.flowId);
      refreshPlanEditor();
    }
    else if (action === 'remove-plan-material') {
      capturePlanForm();
      planDraft.materials = planDraft.materials.filter(item => item.id !== control.dataset.materialId);
      refreshPlanEditor();
    }
    else if (action === 'submit-plan-review') {
      const plan = state.lessonPlans.find(item => item.id === control.dataset.planId);
      if (!plan || planReadiness(plan) < 100) toast('教案內容與教材尚未符合八項歸檔條件', 'danger');
      else { plan.status = 'review'; closeDrawer(); persist(); renderApp(); toast('已送主管檢視；不影響這份完整備課檔案被授課紀錄選用', 'success'); }
    }
    else if (action === 'review-plan') openPlanReview(control.dataset.planId);
    else if (action === 'approve-plan') handleReviewDecision('plan-approve', control.dataset.planId);
    else if (action === 'request-plan-changes') handleReviewDecision('plan-changes', control.dataset.planId);
    else if (action === 'open-review') openSubmissionReview(control.dataset.submissionId);
    else if (action === 'open-record') openSubmissionReview(control.dataset.submissionId, true);
    else if (action === 'view-archived-activity') openArchivedActivityDetail(control.dataset.submissionId, control.dataset.activityId);
    else if (action === 'accept-submission') handleReviewDecision('submission-accept', control.dataset.submissionId);
    else if (action === 'request-submission-clarify') handleReviewDecision('submission-clarify', control.dataset.submissionId);
    else if (action === 'accept-evidence') handleReviewDecision('evidence-accept', control.dataset.activityId, control.dataset.evidenceId);
    else if (action === 'request-evidence-clarify') handleReviewDecision('evidence-clarify', control.dataset.activityId, control.dataset.evidenceId);
    else if (action === 'open-case-detail') openCaseDetail(control.dataset.caseId);
    else if (action === 'open-task') openTaskEditor();
    else if (action === 'open-profile') openProfileDialog();
    else if (action === 'open-health' || action === 'run-health-check') openHealthDialog();
    else if (action === 'set-visual-theme') {
      const theme = control.dataset.theme === 'playful' ? 'playful' : 'calm';
      state.ui.visualTheme = theme;
      applyVisualTheme();
      persist('介面風格已儲存');
      renderApp();
      openProfileDialog();
      toast(theme === 'calm' ? '已切換為清爽版' : '已切換為布拉克可愛版', 'success');
    }
    else if (action === 'open-more-nav') openMoreNav();
    else if (action === 'reset-demo') {
      openDialog({ title: '清空審查資料', body: `<div class="notice-band danger">${icon('triangle-alert', 19)}<div><div class="notice-title">這個審查瀏覽器內的所有真人測試資料都會被清除</div><div class="notice-copy">正式 KPI 系統資料不受影響。</div></div></div>`, footer: `<button type="button" class="btn" data-action="close-dialog">取消</button><button type="button" class="btn btn-danger" data-action="confirm-reset">確認清空</button>` });
    }
    else if (action === 'confirm-reset') {
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(BACKUP_KEY);
      localStorage.removeItem(DRAFT_KEY);
      try { sessionStorage.removeItem(DRAFT_KEY); } catch (error) { /* no-op */ }
      openDraftStore = {};
      state = createSeed();
      runtimeHealth = { loadIssue: '', persistError: '', lastPersistOk: true, lastPersistAt: '' };
      closeDialog(); closeDrawer(); persist(); renderApp(); toast('審查資料已清空', 'success');
    }
    else if (action === 'confirm-delete') confirmDelete(control.dataset.kind, control.dataset.id, control.dataset.parentId);
    else if (action === 'print-weekly') window.print();
    else if (action === 'export-records') exportRecords();
    else if (action === 'export-students') exportStudentCases();
    else if (action === 'manager-refresh') toast('狀態已更新', 'success');
  });

  document.addEventListener('change', async event => {
    const control = event.target.closest('[data-change]');
    if (event.target.closest('#activity-form, #evidence-form, [data-draft-form]')) scheduleCurrentDrawerDraft();
    if (!control) return;
    const change = control.dataset.change;
    if (change === 'view-filter') {
      const filters = getFilters(control.dataset.filterGroup, {});
      filters[control.dataset.filterKey] = control.value;
      persist(); renderApp();
    }
    if (change === 'activity-type') refreshActivityGuide(control.value);
    if (change === 'activity-plan') refreshActivityPlanStatus(control.value);
    if (change === 'activity-prep-source') refreshActivityPrepSource(control.value);
    if (change === 'crossday-schedule') refreshCrossDayTimeline();
    if (change === 'prep-files') handlePrepFiles(control);
    if (change === 'operation-photo') await handleOperationPhoto(control);
    if (change === 'operation-status') toggleOperationStatus(control);
    if (change === 'confirm-no-student') {
      if (control.checked && state.studentCases.some(item => item.date === state.daily.date && item.teacher === state.context.teacher)) {
        control.checked = false;
        toast('今天已有學生追蹤紀錄', 'danger');
        return;
      }
      state.daily.noStudentFollowupConfirmed = control.checked;
      schedulePersist();
    }
    if (change === 'toggle-task') {
      const task = state.tasks.find(item => item.id === control.dataset.taskId);
      if (task) task.status = control.checked ? 'done' : 'open';
      persist(); renderApp();
    }
    if (change === 'evidence-file') await handleEvidenceFile(control);
    if (change === 'evidence-privacy') updateEvidenceQualityFromForm();
    if (change === 'plan-review-check') {
      const checks = $$('[data-review-check]');
      const approve = $('#approve-plan-button');
      if (approve) approve.disabled = !checks.length || checks.some(item => !item.checked);
    }
    if (change === 'plan-material') {
      capturePlanForm();
      Array.from(control.files || []).forEach(file => planDraft.materials.push({ id: uid('mat'), category: planMaterialCategory(file.name), name: file.name, size: formatFileSize(file.size), status: 'ready' }));
      refreshPlanEditor();
      toast('教材附件已加入教案', 'success');
    }
  });

  document.addEventListener('input', event => {
    if (event.target.closest('#activity-form, #evidence-form, [data-draft-form]')) scheduleCurrentDrawerDraft();
    const dailyForm = event.target.closest('#daily-summary-form');
    if (dailyForm) {
      const data = new FormData(dailyForm);
      state.daily.summary.teacherNote = String(data.get('teacherNote') || '').trim();
      schedulePersist();
    }
    const weeklyForm = event.target.closest('#weekly-form');
    if (weeklyForm) {
      const data = new FormData(weeklyForm);
      state.weekly.decisionNeeded = String(data.get('decisionNeeded') || '').trim();
      schedulePersist();
    }
    const operationNote = event.target.closest('[id^="operation-action-"]');
    if (operationNote) {
      const key = operationNote.id.replace(/^operation-action-/, '');
      state.operations.evidenceByCheck = state.operations.evidenceByCheck || {};
      state.operations.evidenceByCheck[key] = state.operations.evidenceByCheck[key] || {};
      state.operations.evidenceByCheck[key].action = operationNote.value;
      state.operations.confirmedAt = '';
      schedulePersist();
    }
    if (event.target.matches('[data-input="evidence-quality"]')) updateEvidenceQualityFromForm();
    if (event.target.matches('[data-evidence-attachment-note]')) updateEvidenceQualityFromForm();
    if (event.target.matches('[data-input="view-filter"]') && !event.isComposing) {
      const control = event.target;
      const group = control.dataset.filterGroup;
      const key = control.dataset.filterKey;
      const value = control.value;
      const filters = getFilters(group, {});
      filters[key] = value;
      window.clearTimeout(filterTimer);
      filterTimer = window.setTimeout(() => {
        persist();
        renderApp();
        const restored = document.querySelector(`[data-input="view-filter"][data-filter-group="${group}"][data-filter-key="${key}"]`);
        if (restored) {
          restored.focus();
          restored.setSelectionRange(value.length, value.length);
        }
      }, 450);
    }
  });

  document.addEventListener('keydown', event => {
    if (event.key !== 'Escape') return;
    if ($('#dialog-root').children.length) closeDialog();
    else if ($('#drawer-root').children.length) closeDrawer();
  });

  window.addEventListener('beforeunload', () => {
    window.clearTimeout(draftTimer);
    persistCurrentDrawerDraft(true);
    if (saveTimer) {
      window.clearTimeout(saveTimer);
      persist();
    }
  });

  renderApp();
})();
