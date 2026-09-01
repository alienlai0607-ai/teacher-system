(function () {
  'use strict';

  const INITIAL_AUTH_SESSION = (() => {
    try {
      return window.AUTH?.getSession?.() || null;
    } catch (error) {
      return null;
    }
  })();
  const TEST_VIEW_MODE = INITIAL_AUTH_SESSION?.impersonate === true;
  const STORAGE_SCOPE = INITIAL_AUTH_SESSION?.nickname
    ? encodeURIComponent(INITIAL_AUTH_SESSION.impersonate
      ? `impersonation:${INITIAL_AUTH_SESSION.impersonated_by || 'reviewer'}:${INITIAL_AUTH_SESSION.nickname}`
      : `${INITIAL_AUTH_SESSION.role || 'user'}:${INITIAL_AUTH_SESSION.nickname}`)
    : 'internal-review';
  const STORAGE_KEY = `bp_anqin_v2_review_live_trial_20260805_${STORAGE_SCOPE}`;
  const LEGACY_TEST_STORAGE_KEYS = ['bp_anqin_v2_review_20260803'];
  const BACKUP_KEY = `${STORAGE_KEY}_safe_backup`;
  const DRAFT_KEY = `${STORAGE_KEY}_open_drafts`;
  const HEALTH_PROBE_KEY = `${STORAGE_KEY}_health_probe`;
  const IS_REVIEW_BUILD = window.location.pathname.includes('/review/');
  const IS_QA_HARNESS = window.location.pathname.endsWith('/qa-harness.html');
  const LOCAL_REVIEW_NICKNAME = new URLSearchParams(window.location.search).get('reviewUser') || '';
  const IS_PREVIEW_REVIEW_SESSION = IS_REVIEW_BUILD
    && (['127.0.0.1', 'localhost'].includes(window.location.hostname)
      || window.location.hostname.endsWith('.trycloudflare.com'))
    && Boolean(LOCAL_REVIEW_NICKNAME);
  const APP_VERSION = 21;
  const MAX_EVIDENCE_FILES = 8;
  const MAX_DOCUMENT_FILE_BYTES = 25 * 1024 * 1024;
  const MAX_IMAGE_SOURCE_BYTES = 25 * 1024 * 1024;
  const GLOBAL_MANAGER_NICKNAMES = ['小魚'];
  let loadStateIssue = '';

  function normalizeReviewNickname(value) {
    return String(value || '')
      .trim()
      .replace(/\s+/g, '')
      .replace(/(?:老師|主管)$/u, '')
      .toLowerCase();
  }

  function sameReviewIdentity(left, right) {
    const normalizedLeft = normalizeReviewNickname(left);
    const normalizedRight = normalizeReviewNickname(right);
    return Boolean(normalizedLeft && normalizedRight && normalizedLeft === normalizedRight);
  }

  const ACTIVITY_TYPES = {
    tutoring: { label: '安親課業指導', icon: 'book-open-check', tone: '', track: 'academic', kpi: '課業指導', evidence: true, requiresPlan: false },
    project: { label: '專案／選修課程', icon: 'blocks', tone: 'project', track: 'enrichment', kpi: '專案課程', evidence: true, requiresPlan: false },
    robotics: { label: '機器人／STEAM 課程', icon: 'bot', tone: 'project', track: 'enrichment', kpi: '專案課程', evidence: true, requiresPlan: false },
    portfolio: { label: '學習歷程', icon: 'folder-kanban', tone: 'project', track: 'enrichment', kpi: '專案課程', evidence: true, requiresPlan: false },
    sel: { label: 'SEL 聊心室', icon: 'heart-handshake', tone: 'classroom', track: 'enrichment', kpi: '班級經營', evidence: true, requiresPlan: false },
    classroom: { label: '班級經營', icon: 'users', tone: 'classroom', track: 'academic', kpi: '班級經營', evidence: true, requiresPlan: false },
    lessonprep: { label: '備課檔案', icon: 'notebook-tabs', tone: 'plan', track: 'archive', kpi: '課程研發', evidence: false, requiresPlan: false },
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

  const STAFF_ROSTER = [
    { nickname: '松鼠老師', department: '東橋教室', role: 'teacher', canTeach: true, initials: '松鼠', students: ['宥縈', '彥呈', '浩軒', '久珹', '荏苒', '宥銨', '宥熹', '梓涵', '芮語', '尊瑋'], note: '' },
    { nickname: '紅豆老師', department: '東橋教室', role: 'teacher', canTeach: true, initials: '紅豆', students: ['佳揚', '沛杰', '紫瑀', '呈諺', '琝程', '米樂', '沐雅', '立喆', '雋翔'], note: '' },
    { nickname: '羊羊老師', department: '東橋教室', role: 'teacher', canTeach: true, initials: '羊羊', students: ['琮諺', '唯恩', '知澈', '知牧', '浩宸', '軒婕'], note: '' },
    { nickname: '酸酸主管', department: '東橋教室', role: 'manager', canTeach: true, initials: '酸酸', students: ['炳兆', '宸瑋', '羽芯', '丞澤', '詣壹', '亦辰', '采華', '靚芯', '萓臻'], note: '之後轉交新老師' },
    { nickname: '江江老師', department: '北區教室', role: 'teacher', canTeach: true, initials: '江江', students: ['宥鈞', '翊辰', '恩弦', '偲芮', '士宸', '允樂', '岩真', '軒瑀', '秐菲'], note: '' },
    { nickname: '小明老師', department: '北區教室', role: 'teacher', canTeach: true, initials: '小明', students: ['陳硯', '尹睿', '承叡', '宥騫', '登睿', '宇綸', '映竹', '秉融', '守博'], note: '' },
    { nickname: '小魚主管', department: '北區教室', role: 'manager', canTeach: true, initials: '小魚', students: ['陳泱', '雨霏', '亭榛', '鎧宸', '芊妤', '沛豊', '宇翔', '宸熙', '寅熙', '浚宸', '奕瀚', '毓祥'], note: '未來轉交新老師' },
  ];

  const MANAGER_BY_DEPARTMENT = {
    東橋教室: '酸酸主管',
    北區教室: '小魚主管',
  };

  const LEGACY_IDENTITY_MAP = {
    松鼠老師: '松鼠', 紅豆老師: '紅豆', 羊羊老師: '羊羊', 酸酸主管: '酸酸',
    江江老師: '江江', 小明老師: '小明', 小魚主管: '小魚',
  };

  const ANQIN_KPI_STANDARDS = [
    {
      name: '課業指導', points: 20, icon: 'book-open-check', position: '主科紮實，與學校學科對接',
      check: '每學期第 7、14 週作業抽查＋學生成績紀錄',
      items: [['作業完成率與正確率檢查', 5], ['訂正執行與追蹤（查核訂正本）', 4], ['字體工整與作業整潔', 2], ['每日挑戰本／課業複習設計', 4], ['考試準備與個別弱點補強追蹤', 5]],
    },
    {
      name: '專案課程', points: 20, icon: 'blocks', position: '教室特色，布拉克星球的識別度',
      check: '每月一次正式觀課 20–30 分鐘',
      items: [['教案與材料課前準備', 5], ['引導能力與學生互動狀況', 6], ['課程流程與節奏掌握', 4], ['專案進度掌握與成果產出', 5]],
    },
    {
      name: '班級經營', points: 20, icon: 'users-round', position: '帶班基礎，穩定的學習環境',
      check: '每月不定期巡班觀察',
      items: [['作業時段秩序與學生專注度', 5], ['班級獎勵與規範執行', 5], ['班級氛圍與主動學習風氣', 5], ['學生情緒與衝突狀況處理', 5]],
    },
    {
      name: '親師溝通', points: 20, icon: 'messages-square', position: '續班命脈，親師信任的關鍵',
      check: '群組紀錄＋客訴紀錄＋接送觀察',
      items: [['主動回饋學生狀況（每週至少 1 次，含學習／情緒／生活）', 5], ['溝通內容專業度與溫度（具體、有觀察、有建議）', 5], ['每日親自在接送時段進行親師互動與信任建立', 5], ['群組回覆＋課程紀錄上傳（每天都需上傳 app）', 5]],
    },
    {
      name: '個人態度與表現', points: 12, icon: 'badge-check', position: '一切教學品質的基本盤',
      check: '打卡紀錄＋每日工作日誌',
      items: [['出勤準時（遲到為重點扣分，詳見出勤紀律）', 4], ['工作責任感與交辦事項完成度', 3], ['主動性與配合度', 2], ['每日課前備課是否落實', 3]],
    },
    {
      name: '班級環境整潔', points: 8, icon: 'sparkles', position: '自班級經營獨立，確保每日落實',
      check: '每日上傳系統照片佐證＋不定期檢查',
      items: [['教室整潔：地板、桌椅、公共區域、廁所', 2], ['教具、教材與個人物品歸位', 2], ['每日環境整理確實完成', 2], ['每日上傳佐證照片', 2]],
    },
  ];

  const ANQIN_BONUS_TIERS = [
    { range: '95–100', grade: '卓越', bonus: 'NT$3,000', tone: 'green' },
    { range: '88–94', grade: '優良', bonus: 'NT$2,000', tone: 'blue' },
    { range: '82–87', grade: '達標', bonus: 'NT$1,000', tone: 'purple' },
    { range: '75–81', grade: '基本合格', bonus: '無獎金', tone: 'outline' },
    { range: '≤74', grade: '待改善', bonus: '無獎金，需改善追蹤回報', tone: 'red' },
  ];

  const TEACHER_NAV = [
    { route: 'today', label: '今日紀錄', icon: 'clipboard-pen-line' },
    { route: 'weekly', label: '本週整理', icon: 'calendar-range', moreOnly: true },
    { route: 'plans', label: '備課檔案', icon: 'notebook-tabs' },
    { route: 'records', label: '我的紀錄', icon: 'history' },
    { route: 'evaluation', label: '主管評核', icon: 'chart-no-axes-column-increasing' },
    { route: 'tasks', label: '追蹤事項', icon: 'list-checks', count: () => state.tasks.filter(task => task.owner === state.context.teacher && task.status !== 'done').length },
    { route: 'guide', label: '填寫指南', icon: 'circle-help' },
    { route: 'scoring', label: '評分標準', icon: 'scale' },
    { route: 'settings', label: '帳號與通知', icon: 'settings-2' },
  ];

  const MANAGER_NAV = [
    { route: 'dashboard', label: '管理總覽', icon: 'layout-dashboard' },
    { route: 'reviews', label: '日報審查', icon: 'messages-square', count: () => pendingReviews().length },
    { route: 'evidence', label: '證據中心', icon: 'scan-search', count: () => allEvidence().filter(item => item.evidence.status !== 'accepted').length },
    { route: 'operations-review', label: '班務稽核', icon: 'school', count: () => operationRecords().filter(item => item.confirmedAt && item.reviewStatus !== 'accepted').length },
    { route: 'students', label: '學生追蹤', icon: 'user-round-search', count: () => state.studentCases.filter(item => managerScopeMatches(item.teacher) && item.status !== 'closed').length },
    { route: 'plans-review', label: '備課檔案', icon: 'notebook-tabs' },
    { route: 'team', label: '團隊狀態', icon: 'users-round' },
    { route: 'evaluations', label: '月度評核', icon: 'chart-no-axes-column-increasing' },
    { route: 'scoring', label: '評分標準', icon: 'scale' },
    { route: 'cloud-reports', label: '雲端日報', icon: 'folder-open' },
    { route: 'settings', label: '系統設定', icon: 'settings-2' },
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
  const isoWeekString = dateString => {
    const source = dateString ? new Date(`${dateString}T12:00:00`) : new Date();
    const date = new Date(Date.UTC(source.getFullYear(), source.getMonth(), source.getDate()));
    const day = date.getUTCDay() || 7;
    date.setUTCDate(date.getUTCDate() + 4 - day);
    const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
    const week = Math.ceil((((date - yearStart) / 86400000) + 1) / 7);
    return `${date.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
  };
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

  function teachingStaff() {
    const people = state.people.filter(person => person.canTeach !== false && Array.isArray(person.students));
    const department = managerScopeDepartment();
    return department ? people.filter(person => person.department === department) : people;
  }

  function managerScopeDepartment() {
    if (state.ui.role !== 'manager') return '';
    const session = legacySession();
    if (session?.role === 'admin' || (session?.role === 'manager' && GLOBAL_MANAGER_NICKNAMES.includes(session.nickname))) return '';
    return normalizeDepartmentScope(state.context.department);
  }

  function managerScopeLabel() {
    if (state.ui.role !== 'manager') return state.context.department;
    return managerScopeDepartment() ? state.context.department : '全教室';
  }

  function normalizeDepartmentScope(department = '') {
    return String(department || '').trim() === '永康教室' ? '東橋教室' : String(department || '').trim();
  }

  function managerScopeMatches(teacher = '', department = '') {
    const scope = managerScopeDepartment();
    if (!scope) return true;
    const resolvedDepartment = normalizeDepartmentScope(department || staffMember(teacher)?.department || '');
    return resolvedDepartment === scope;
  }

  function ensureManagerScope(teacher = '', department = '') {
    if (state.ui.role !== 'manager' || managerScopeMatches(teacher, department)) return true;
    toast('沒有查看其他教室資料的權限', 'danger');
    return false;
  }

  function staffMember(nickname) {
    return state.people.find(person => person.nickname === nickname) || null;
  }

  function assignedStudents(teacher = state.context.teacher) {
    const students = staffMember(teacher)?.students;
    return Array.isArray(students) ? students : [];
  }

  function studentsForTeacher(teacher = state.context.teacher, selected = []) {
    return [...new Set([...assignedStudents(teacher), ...(selected || []).filter(Boolean)])];
  }

  function renderStudentChoices(teacher, selected = []) {
    const selectedSet = new Set(selected || []);
    return studentsForTeacher(teacher, selected).map(student => `<label class="choice-chip"><input type="checkbox" name="students" value="${esc(student)}" ${selectedSet.has(student) ? 'checked' : ''}>${esc(student)}</label>`).join('');
  }

  function renderStudentOptions(teacher, selected = '') {
    return studentsForTeacher(teacher, selected ? [selected] : []).map(student => `<option value="${esc(student)}" ${selected === student ? 'selected' : ''}>${esc(student)}</option>`).join('');
  }

  function mergeCloudRoster(users = []) {
    (Array.isArray(users) ? users : []).forEach(user => {
      if (!user?.nickname || user.status === 'suspended' || !['teacher', 'manager'].includes(user.role)) return;
      const department = normalizeDepartmentScope(user.department || '');
      if (!['東橋教室', '北區教室'].includes(department)) return;
      const displayName = displayNameForBackend(user.nickname);
      const existing = state.people.find(person => sameReviewIdentity(person.nickname, user.nickname));
      const person = {
        nickname: displayName,
        department,
        role: user.role,
        canTeach: true,
        initials: String(displayName).slice(0, 2),
        students: existing?.students || [],
        note: existing?.note || '',
      };
      if (existing) Object.assign(existing, person);
      else state.people.push(person);
    });
  }

  function mergeCloudStudents(students = []) {
    const grouped = new Map();
    (Array.isArray(students) ? students : []).forEach(student => {
      const teacher = String(student.teacher || '').trim();
      const name = String(student.name || '').trim();
      if (!teacher || !name) return;
      const list = grouped.get(teacher) || [];
      if (!list.includes(name)) list.push(name);
      grouped.set(teacher, list);
    });
    grouped.forEach((studentsForPerson, nickname) => {
      const person = state.people.find(item => sameReviewIdentity(item.nickname, nickname));
      if (person) person.students = studentsForPerson;
    });
  }

  function createSeed() {
    const today = todayIso();
    return {
      version: APP_VERSION,
      ui: {
        role: 'teacher', route: 'today', todayTab: 'activities', lastSavedAt: null, guideType: 'tutoring', guidePromptDismissed: false, evidenceStandardsSeen: false, pushPermissionReminderSeen: false, visualTheme: 'playful',
        filters: {
          plans: { status: 'all' }, tasks: { status: 'open' }, records: { period: '30d', status: 'all', query: '' },
          reviews: { status: 'open', teacher: 'all', date: '', query: '' },
          evidence: { type: 'all', status: 'open', kpi: 'all', query: '' },
          students: { urgency: 'all', status: 'open', query: '' },
          planReview: { status: 'review', teacher: 'all', query: '' },
          operationsReview: { status: 'open', owner: 'all' },
        },
      },
      integration: {
        cloudSyncEnabled: !IS_REVIEW_BUILD || Boolean(INITIAL_AUTH_SESSION && INITIAL_AUTH_SESSION.status !== 'suspended' && ['admin', 'manager', 'teacher'].includes(INITIAL_AUTH_SESSION.role)),
        pdfOnSubmit: true,
        lastCloudSaveAt: '',
        lastCloudDraftAt: '',
        dailyDraftSyncPending: false,
      },
      context: { department: '東橋教室', teacher: '羊羊老師', manager: '酸酸主管' },
      people: clone(STAFF_ROSTER),
      daily: {
        date: today, status: 'draft', submittedAt: '', parentStatus: '', parentHandoffConfirmed: false, parentHandoffNote: '', noStudentFollowupConfirmed: false,
        summary: { keyResult: '', followup: '', tomorrowPriority: '', teacherNote: '' },
      },
      activities: [],
      studentCases: [],
      contacts: [],
      operations: {
        id: `op_${today}_羊羊老師`, date: today, room: '東橋教室', dutyOwner: '羊羊老師', status: 'draft',
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
    record.attachments = attachments.map((attachment, index) => {
      const cloudUrl = attachment.cloudUrl || attachment.url || '';
      const cloudFileId = attachment.cloudFileId || attachment.fileId || '';
      const hasCloudCopy = Boolean(cloudUrl || cloudFileId);
      const dataUrl = hasCloudCopy ? '' : (attachment.dataUrl || '');
      const recorded = attachment.recorded !== undefined
        ? Boolean(attachment.recorded)
        : Boolean(attachment.fileName || attachment.name || dataUrl || hasCloudCopy);
      return {
        id: attachment.id || `attachment_${record.id || 'item'}_${index + 1}`,
        fileName: attachment.fileName || attachment.name || (recorded ? `成果檔案 ${index + 1}` : ''),
        mimeType: attachment.mimeType || 'application/octet-stream',
        dataUrl,
        size: attachment.size || '',
        note: attachment.note || '',
        fingerprint: attachment.fingerprint || attachment.fileFingerprint || '',
        cloudUrl,
        cloudFileId,
        uploadStatus: attachment.uploadStatus || (hasCloudCopy ? 'uploaded' : dataUrl ? 'local' : 'incomplete'),
        uploadError: attachment.uploadError || '',
        placeholder: Boolean(!hasCloudCopy && !dataUrl),
        recorded,
      };
    });
    const primary = record.attachments.find(item => item.id === record.primaryAttachmentId) || record.attachments[0];
    record.primaryAttachmentId = primary?.id || '';
    if (primary) {
      record.fileName = primary.fileName;
      record.mimeType = primary.mimeType;
      record.dataUrl = primary.dataUrl || '';
      record.cloudUrl = primary.cloudUrl || '';
      record.cloudFileId = primary.cloudFileId || '';
      record.placeholder = Boolean(!primary.dataUrl && !primary.cloudUrl && !primary.cloudFileId);
    }
    if (record.quality === undefined || record.quality === null || record.quality === '') {
      record.quality = record.attachments.length ? 100 : 0;
      record.qualityInferred = true;
    }
    return record;
  }

  function normalizeOperationPhotoRecord(record) {
    if (!record || typeof record !== 'object') return record;
    record.cloudUrl = record.cloudUrl || record.url || '';
    record.cloudFileId = record.cloudFileId || record.fileId || '';
    if (record.cloudUrl || record.cloudFileId) record.dataUrl = '';
    record.uploadStatus = record.uploadStatus || (record.cloudUrl || record.cloudFileId ? 'uploaded' : record.dataUrl ? 'local' : 'incomplete');
    record.placeholder = Boolean(record.fileName && !record.dataUrl && !record.cloudUrl && !record.cloudFileId);
    return record;
  }

  function normalizePrepTitle(value) {
    return String(value || '').trim().replace(/\s+/g, '').replace(/[｜|:：]/g, '').toLowerCase();
  }

  function targetCourseForPlan(plan) {
    return {
      '安親輔導': '安親課業指導',
      '專案選修': '專案／選修課程',
      '機器人／STEAM': '機器人／STEAM 課程',
      '學習歷程': '學習歷程',
      'SEL 聊心室': 'SEL 聊心室',
    }[plan?.courseType] || (String(plan?.courseType || '').includes('安親') ? '安親課業指導' : '專案／選修課程');
  }

  function mergePlanMaterialsIntoPrep(activity, plan) {
    if (!activity || !plan) return;
    activity.prepEvidence = Array.isArray(activity.prepEvidence) ? activity.prepEvidence : [];
    (plan.materials || []).forEach(material => {
      const fileName = String(material.name || material.fileName || '既有教材附件').trim();
      const cloudUrl = materialCloudUrl(material);
      const duplicate = activity.prepEvidence.some(item =>
        (material.cloudFileId && item.cloudFileId === material.cloudFileId)
        || (cloudUrl && materialCloudUrl(item) === cloudUrl)
        || (String(item.fileName || '').trim() === fileName && String(item.size || '') === String(material.size || ''))
      );
      if (duplicate) return;
      activity.prepEvidence.push({
        id: material.id || uid('prep'),
        fileName,
        size: material.size || '附件',
        category: material.category || inferPrepCategory(fileName),
        note: '',
        addedAt: material.uploadedAt || material.addedAt || plan.updatedAt || new Date().toISOString(),
        mimeType: material.mimeType || '',
        cloudUrl,
        cloudFileId: material.cloudFileId || '',
      });
    });
  }

  function reconcileLegacyPlans(parsed) {
    parsed.lessonPlans.forEach(plan => {
      let linkedPrep = parsed.activities.find(activity => activity.type === 'lessonprep' && (activity.id === plan.sourceActivityId || activity.planId === plan.id));
      if (!linkedPrep) {
        const titleKey = normalizePrepTitle(plan.title);
        linkedPrep = parsed.activities.find(activity =>
          activity.type === 'lessonprep'
          && normalizeReviewNickname(activity.teacher) === normalizeReviewNickname(plan.teacher)
          && normalizePrepTitle(activity.title) === titleKey
        );
      }
      if (!linkedPrep) {
        linkedPrep = {
          id: `prep_${plan.id}`,
          date: String(plan.updatedAt || '').slice(0, 10) || parsed.daily.date,
          updatedAt: plan.updatedAt || new Date().toISOString(),
          teacher: plan.teacher || parsed.context.teacher,
          type: 'lessonprep',
          title: plan.title || '既有備課檔案',
          className: '',
          students: [],
          details: { targetCourse: targetCourseForPlan(plan) },
          prepSourceId: '',
          planId: plan.id,
          objective: '', action: '', result: '', issue: '', nextAction: '',
          owner: plan.teacher || parsed.context.teacher,
          dueDate: '',
          status: 'complete',
          prep: { summary: plan.reflection || '', adjustment: '' },
          prepFeedback: { strengths: '', resonance: '', changes: '' },
          prepEvidence: [],
          evidence: [],
        };
        parsed.activities.push(linkedPrep);
      }
      linkedPrep.details = linkedPrep.details && typeof linkedPrep.details === 'object' ? linkedPrep.details : {};
      if (!String(linkedPrep.title || '').trim()) linkedPrep.title = plan.title || '既有備課檔案';
      if (!String(linkedPrep.details.targetCourse || '').trim()) linkedPrep.details.targetCourse = targetCourseForPlan(plan);
      linkedPrep.prep = linkedPrep.prep && typeof linkedPrep.prep === 'object' ? linkedPrep.prep : { summary: '', adjustment: '' };
      linkedPrep.prepEvidence = Array.isArray(linkedPrep.prepEvidence) ? linkedPrep.prepEvidence : [];
      linkedPrep.planId = plan.id;
      linkedPrep.status = linkedPrep.title && linkedPrep.details?.targetCourse ? 'complete' : 'draft';
      plan.sourceActivityId = linkedPrep.id;
      syncPlanIdentityFromPrep(plan, linkedPrep);
      mergePlanMaterialsIntoPrep(linkedPrep, plan);
    });
  }

  function normalizeLoadedState(parsed) {
    const seed = createSeed();
    parsed.ui = { ...seed.ui, ...(parsed.ui || {}), filters: { ...seed.ui.filters, ...(parsed.ui?.filters || {}) } };
    parsed.integration = { ...seed.integration, ...(parsed.integration || {}) };
    parsed.context = { ...seed.context, ...(parsed.context || {}) };
    parsed.daily = { ...seed.daily, ...(parsed.daily || {}), summary: { ...seed.daily.summary, ...(parsed.daily?.summary || {}) } };
    if (parsed.daily.parentStatus === 'none') parsed.daily.parentStatus = 'handoff';
    parsed.weekly = { ...seed.weekly, ...(parsed.weekly || {}) };
    parsed.operations = { ...seed.operations, ...(parsed.operations || {}), evidenceByCheck: { ...seed.operations.evidenceByCheck, ...(parsed.operations?.evidenceByCheck || {}) } };
    Object.values(parsed.operations.evidenceByCheck || {}).forEach(normalizeOperationPhotoRecord);
    if (!parsed.operations.id || parsed.operations.id === 'op_today') parsed.operations.id = `op_${parsed.operations.date}_${parsed.operations.dutyOwner || parsed.context.teacher}`;
    parsed.operationHistory = Array.isArray(parsed.operationHistory) ? parsed.operationHistory : clone(seed.operationHistory);
    parsed.operationHistory.forEach(operation => Object.values(operation?.evidenceByCheck || {}).forEach(normalizeOperationPhotoRecord));
    ['people', 'activities', 'studentCases', 'contacts', 'lessonPlans', 'tasks', 'submissions', 'managerNotes'].forEach(key => {
      if (!Array.isArray(parsed[key])) parsed[key] = clone(seed[key] || []);
    });
    const previousTeacher = parsed.context.teacher;
    const previousDepartment = parsed.context.department;
    const activeTeacher = STAFF_ROSTER.find(person => person.nickname === parsed.context.teacher && person.canTeach)
      || STAFF_ROSTER.find(person => person.department === previousDepartment && person.role === 'teacher')
      || STAFF_ROSTER.find(person => person.role === 'teacher');
    parsed.people = clone(STAFF_ROSTER);
    parsed.context.teacher = activeTeacher.nickname;
    parsed.context.department = activeTeacher.department;
    parsed.context.manager = MANAGER_BY_DEPARTMENT[activeTeacher.department];
    if (parsed.operations.date === parsed.daily.date && !parsed.operations.confirmedAt && (parsed.operations.dutyOwner === previousTeacher || !STAFF_ROSTER.some(person => person.nickname === parsed.operations.dutyOwner))) {
      parsed.operations.dutyOwner = activeTeacher.nickname;
      parsed.operations.room = activeTeacher.department;
    }
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
      activity.evidence = Array.isArray(activity.evidence) ? activity.evidence : [];
      activity.evidence.forEach(evidence => {
        normalizeEvidenceRecord(evidence);
        const linkedResult = activityFeedbackSummary(activity);
        if (linkedResult) evidence.claim = linkedResult;
      });
    });
    reconcileLegacyPlans(parsed);
    parsed.lessonPlans.forEach(plan => {
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
      evidence.placeholder = Boolean(evidence.fileName && !materialCloudUrl(evidence) && !evidence.cloudFileId);
      (evidence.attachments || []).forEach(attachment => {
        attachment.dataUrl = '';
        attachment.placeholder = Boolean(!materialCloudUrl(attachment) && !attachment.cloudFileId);
      });
    };
    snapshot.activities.forEach(activity => (activity.evidence || []).forEach(stripEvidence));
    (snapshot.submissions || []).forEach(submission => (submission.activitySnapshots || []).forEach(activity => (activity.evidence || []).forEach(stripEvidence)));
    if (snapshot.operations?.evidence) stripEvidence(snapshot.operations.evidence);
    Object.values(snapshot.operations?.evidenceByCheck || {}).forEach(item => {
      if (item) {
        item.dataUrl = '';
        item.placeholder = Boolean(item.fileName && !materialCloudUrl(item) && !item.cloudFileId);
      }
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
    const storedVersion = Number(parsed.version);
    if (!Number.isInteger(storedVersion) || storedVersion < 8 || storedVersion > APP_VERSION) {
      loadStateIssue = '資料版本無法辨識，舊資料未被覆蓋；目前先開啟空白審查頁。';
      return createSeed();
    }
    return normalizeLoadedState(parsed);
  }

  let state = loadState();
  let saveTimer = null;
  let cloudDraftTimer = null;
  let taskSyncTimer = null;
  const pendingTaskSyncIds = new Set();
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
  let dailySubmitInFlight = false;
  let weeklySubmitInFlight = false;
  let runtimeHealth = {
    loadIssue: loadStateIssue,
    persistError: '',
    lastPersistOk: !loadStateIssue,
    lastPersistAt: state.ui.lastSavedAt || '',
  };
  let integrationRuntime = {
    checking: false,
    apiStatus: 'unknown',
    apiMessage: '尚未檢查',
    checkedAt: '',
    users: [],
    userLoadStatus: 'unknown',
    readinessStatus: 'unknown',
    readiness: null,
    readinessMessage: '',
    cloudStatus: 'idle',
    cloudMessage: '',
    cloudErrorContext: '',
    draftSyncStatus: 'idle',
    draftSyncAt: '',
    prepSyncStatus: 'idle',
    prepSyncMessage: '',
    taskSyncStatus: 'idle',
    taskSyncMessage: '',
    evaluationStatus: 'idle',
    evaluationMonth: '',
    evaluationMonths: [],
    evaluation: null,
    evaluationMessage: '',
    managerEvaluationStatus: 'idle',
    managerEvaluationTeacher: '',
    managerEvaluationMonth: '',
    managerEvaluationEvidence: null,
    managerEvaluation: null,
    managerEvaluationMessage: '',
    managerSyncStatus: 'idle',
    managerSyncMessage: '',
    managerSyncAt: '',
    pushStatus: null,
    pushStatusState: 'unknown',
    legacyArchiveStatus: 'idle',
    legacyArchiveMessage: '',
    legacyArchiveFiles: [],
    legacyArchiveMonth: '',
    reportFolderStatus: 'idle',
    reportFolderMessage: '',
    reportFolders: [],
  };
  let openDraftStore = loadOpenDraftStore();

  function backendNickname(displayName = '') {
    const value = String(displayName || '').trim();
    return LEGACY_IDENTITY_MAP[value] || value.replace(/(?:老師|主管)$/, '');
  }

  function displayNameForBackend(nickname = '') {
    return STAFF_ROSTER.find(person => sameReviewIdentity(person.nickname, nickname))?.nickname || nickname;
  }

  function cloudLogId(teacher, date) {
    return `LOG-${String(date || '').replaceAll('-', '')}-${backendNickname(teacher)}`;
  }

  function legacySession() {
    try {
      return window.AUTH?.getSession?.() || null;
    } catch (error) {
      return null;
    }
  }

  function cloudTeacherNickname(displayName = state.context.teacher) {
    const session = legacySession();
    if (session?.role === 'teacher' && sameReviewIdentity(session.nickname, displayName)) return session.nickname;
    return backendNickname(displayName);
  }

  function personForSession(session = legacySession()) {
    if (!session?.nickname) return null;
    const known = state.people.find(person => sameReviewIdentity(person.nickname, session.nickname))
      || STAFF_ROSTER.find(person => sameReviewIdentity(person.nickname, session.nickname));
    if (known) return known;
    const department = normalizeDepartmentScope(session.department || '');
    if (!department || !['teacher', 'manager'].includes(session.role)) return null;
    return {
      nickname: displayNameForBackend(session.nickname),
      department,
      role: session.role,
      canTeach: true,
      initials: String(session.nickname).slice(0, 2),
      students: [],
      note: '由正式帳號載入',
    };
  }

  function cloudIdentityReady() {
    const session = legacySession();
    if (!session || session.status === 'suspended' || session.impersonate === true) return false;
    return session.role === 'teacher' && sameReviewIdentity(session.nickname, state.context.teacher);
  }

  async function ensureCloudTeacherIdentity() {
    const current = legacySession();
    if (cloudIdentityReady()) return { ok: true, user: current };
    if (!current) return { ok: false, error: '尚未登入正式帳號' };
    if (current.impersonate === true) {
      return { ok: false, error: '目前為主管互動測試，正式寫入已停用' };
    }
    if (!current.session_token) return { ok: false, error: '登入資料不完整，請重新登入' };
    if (!window.API?.getSessionIdentity) return { ok: false, error: '帳號驗證服務尚未載入，請重新整理' };

    const result = await API.getSessionIdentity();
    if (!result?.ok || !result.user) return { ok: false, error: result?.error || '無法確認登入帳號' };
    const user = result.user;
    if (user.role !== 'teacher') {
      return { ok: false, error: `目前正式登入為${sessionRoleLabel(user.role)} ${user.nickname || ''}`.trim() };
    }
    if (!sameReviewIdentity(user.nickname, state.context.teacher)) {
      return { ok: false, error: `目前正式登入為 ${user.nickname}，畫面是 ${state.context.teacher}` };
    }
    window.AUTH?.setSession?.({ ...current, ...user, session_token: current.session_token });
    applyLegacySessionContext();
    return cloudIdentityReady()
      ? { ok: true, user: legacySession(), repaired: true }
      : { ok: false, error: '登入帳號已確認，但老師工作區仍不一致，請重新登入' };
  }

  function applyLegacySessionContext() {
    const session = legacySession();
    const person = personForSession(session);
    if (!session) return;
    state.integration.cloudSyncEnabled = session.status !== 'suspended' && ['admin', 'manager', 'teacher'].includes(session.role);
    if (session.role === 'admin') {
      state.context.department = '全教室';
      state.context.manager = session.nickname || '柏翰';
      state.ui.role = 'manager';
      if (!MANAGER_NAV.some(item => item.route === state.ui.route)) state.ui.route = 'dashboard';
      return;
    }
    if (!person) {
      state.integration.cloudSyncEnabled = false;
      runtimeHealth.loadIssue = '登入帳號尚未完成安親角色或教室設定，已停止沿用先前使用者畫面。';
      return;
    }
    const existingPerson = state.people.find(item => sameReviewIdentity(item.nickname, session.nickname));
    if (existingPerson) Object.assign(existingPerson, person);
    else state.people.push(person);
    state.context.department = normalizeDepartmentScope(person.department);
    state.context.manager = MANAGER_BY_DEPARTMENT[state.context.department] || state.context.manager;
    if (session.role === 'manager') {
      state.context.manager = person.nickname;
      state.ui.role = 'manager';
      if (!MANAGER_NAV.some(item => item.route === state.ui.route)) state.ui.route = 'dashboard';
      return;
    }
    if (session.role === 'teacher') {
      state.context.teacher = person.nickname;
      state.ui.role = 'teacher';
      state.integration.cloudSyncEnabled = true;
      if (state.operations.date === state.daily.date && !state.operations.confirmedAt) {
        state.operations.dutyOwner = person.nickname;
        state.operations.room = person.department;
        state.operations.id = `op_${state.daily.date}_${person.nickname}`;
      }
      if (!TEACHER_NAV.some(item => item.route === state.ui.route)) state.ui.route = 'today';
    }
  }

  function rollWorkspaceToToday() {
    const today = todayIso();
    const previousDate = String(state.daily?.date || '');
    if (!previousDate || previousDate >= today) return '';
    const teacher = state.context.teacher;
    const activities = state.activities.filter(item => item.teacher === teacher && item.date === previousDate && item.type !== 'lessonprep');
    const cases = state.studentCases.filter(item => item.teacher === teacher && item.date === previousDate);
    const contacts = state.contacts.filter(item => item.teacher === teacher && item.date === previousDate);
    const existingSubmission = state.submissions.find(item => item.teacher === teacher && item.date === previousDate);
    if (!existingSubmission && (activities.length || cases.length || contacts.length || state.daily.submittedAt)) {
      state.submissions.unshift({
        id: `draft_${previousDate.replaceAll('-', '')}_${backendNickname(teacher)}`,
        date: previousDate,
        teacher,
        department: state.context.department,
        submittedAt: state.daily.submittedAt || '',
        status: state.daily.submittedAt ? 'pending' : 'draft',
        activityIds: activities.map(item => item.id),
        studentCaseIds: cases.map(item => item.id),
        contactIds: contacts.map(item => item.id),
        activitySnapshots: activities.map(clone),
        studentCaseSnapshots: cases.map(clone),
        contactSnapshots: contacts.map(clone),
        keyResult: state.daily.summary?.keyResult || '',
        followup: state.daily.summary?.followup || '',
        tomorrowPriority: state.daily.summary?.tomorrowPriority || '',
        teacherNote: state.daily.summary?.teacherNote || '',
        parentStatus: state.daily.parentStatus || '',
        parentHandoffConfirmed: Boolean(state.daily.parentHandoffConfirmed),
        parentHandoffNote: state.daily.parentHandoffNote || '',
        feedback: '',
      });
    }
    const operation = state.operations;
    const hasOperationContent = operation?.date === previousDate && (operation.confirmedAt || Object.values(operation.evidenceByCheck || {}).some(item => item?.fileName));
    if (hasOperationContent && !(state.operationHistory || []).some(item => item.id === operation.id)) {
      state.operationHistory.unshift(clone(operation));
    }
    const seed = createSeed();
    state.daily = clone(seed.daily);
    state.daily.date = today;
    state.operations = {
      ...clone(seed.operations),
      id: `op_${today}_${teacher}`,
      date: today,
      room: state.context.department,
      dutyOwner: teacher,
    };
    if (isoWeekString(previousDate) !== isoWeekString(today)) state.weekly = clone(seed.weekly);
    state.ui.todayTab = 'activities';
    state.ui.lastRolloverFrom = previousDate;
    return previousDate;
  }

  function sessionRoleLabel(role = '') {
    return { admin: '管理員', manager: '主管', teacher: '老師', admin_staff: '行政' }[role] || '未登入';
  }

  function loginReturnPath(target = 'review/anqin-v2/index.html') {
    return `../../index.html?return=${encodeURIComponent(target)}`;
  }

  function browserNotificationStatus() {
    if (!('Notification' in window)) return { label: '此瀏覽器不支援', tone: 'red' };
    const push = integrationRuntime.pushStatus;
    if (push) {
      if (!push.supported) return { label: '此瀏覽器不支援', tone: 'red' };
      if (push.nativePermission === 'denied') return { label: '已被瀏覽器封鎖', tone: 'red' };
      if (push.subscribed) return { label: '已訂閱', tone: 'green' };
      if (push.permission) return { label: '尚未完成訂閱', tone: 'yellow' };
      if (push.error) return { label: '服務未載入', tone: 'red' };
    }
    if (Notification.permission === 'denied') return { label: '已封鎖', tone: 'red' };
    if (Notification.permission === 'granted') return { label: '正在確認訂閱', tone: 'yellow' };
    return { label: '尚未開啟', tone: 'yellow' };
  }

  async function refreshPushStatus(renderWhenReady = false) {
    if (typeof window.getPushStatus !== 'function') {
      integrationRuntime.pushStatusState = 'unavailable';
      return null;
    }
    integrationRuntime.pushStatusState = 'loading';
    const status = await window.getPushStatus();
    integrationRuntime.pushStatus = status || null;
    integrationRuntime.pushStatusState = status?.ready ? 'ready' : 'error';
    if (renderWhenReady && state.ui.route === 'settings') renderApp();
    return status;
  }

  function maybeShowPushPermissionReminder() {
    const session = legacySession();
    if (session?.role !== 'teacher' || session.status === 'suspended' || session.impersonate === true) return;
    if (state.ui.pushPermissionReminderSeen || !('Notification' in window) || Notification.permission !== 'default') return;
    state.ui.pushPermissionReminderSeen = true;
    persist();
    openDialog({
      title: '開啟 APP 通知',
      body: `<div class="notice-band info">${icon('bell-ring', 19)}<div><div class="notice-title">即時收到主管回覆與追蹤提醒</div><div class="notice-copy">只有按下「開啟通知」後，瀏覽器才會詢問是否允許。稍後也能到「帳號與通知」開啟。</div></div></div>`,
      footer: `<button type="button" class="btn" data-action="close-dialog">稍後</button><button type="button" class="btn btn-primary" data-action="enable-push" data-source="login-reminder">${icon('bell-plus', 16)}開啟通知</button>`,
    });
  }

  function sessionCanInspectAccounts(session = legacySession()) {
    return Boolean(session && ['admin', 'manager'].includes(session.role));
  }

  function sessionCanManageAccounts(session = legacySession()) {
    return Boolean(session && session.role === 'admin');
  }

  function formalIdentityMessage() {
    const session = legacySession();
    if (!session) return '尚未登入正式帳號';
    if (session.status === 'suspended') return '帳號已停用';
    if (session.impersonate === true) return `${session.impersonated_by || '主管'}正在互動測試 ${session.nickname}，正式送出會被攔截`;
    if (session.role !== 'teacher') return `目前登入為${sessionRoleLabel(session.role)}`;
    if (!sameReviewIdentity(session.nickname, state.context.teacher)) return `目前登入為 ${session.nickname}`;
    return `${session.nickname} 已登入`;
  }

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

  function cloudFeedbackContext(threadKey) {
    const [kind, id] = String(threadKey || '').split(':');
    if (kind === 'submission') {
      const submission = state.submissions.find(item => item.id === id);
      return submission ? { teacher: submission.teacher, department: submission.department, logId: cloudLogId(submission.teacher, submission.date) } : null;
    }
    if (kind === 'plan') {
      const plan = state.lessonPlans.find(item => item.id === id);
      const person = plan ? STAFF_ROSTER.find(item => item.nickname === plan.teacher) : null;
      return plan ? { teacher: plan.teacher, department: person?.department || state.context.department, logId: `V2-${threadKey}` } : null;
    }
    if (kind === 'evidence') {
      const activity = state.activities.find(item => item.id === id);
      const person = activity ? STAFF_ROSTER.find(item => item.nickname === activity.teacher) : null;
      return activity ? { teacher: activity.teacher, department: person?.department || state.context.department, logId: `V2-${threadKey}` } : null;
    }
    if (kind === 'operation') {
      const operation = operationRecordById(id);
      const person = operation ? STAFF_ROSTER.find(item => item.nickname === operation.dutyOwner) : null;
      return operation ? { teacher: operation.dutyOwner, department: person?.department || operation.room, logId: `V2-${threadKey}` } : null;
    }
    if (kind === 'case') {
      const item = state.studentCases.find(entry => entry.id === id);
      const person = item ? STAFF_ROSTER.find(entry => entry.nickname === item.teacher) : null;
      return item ? { teacher: item.teacher, department: person?.department || state.context.department, logId: `V2-${threadKey}` } : null;
    }
    return null;
  }

  async function sendCloudSubmissionMessage(threadKey, message, tag = '一般回覆') {
    if (!state.integration.cloudSyncEnabled) return { ok: true, localOnly: true };
    const session = legacySession();
    const context = cloudFeedbackContext(threadKey);
    if (!session || !context) return { ok: false, error: '找不到正式登入身分或對話資料' };
    const teacherNickname = backendNickname(context.teacher);
    if (session.role === 'teacher' && !sameReviewIdentity(session.nickname, teacherNickname)) return { ok: false, error: '只能回覆自己的資料' };
    if (session.role === 'manager' && !managerScopeMatches(context.teacher, context.department)) return { ok: false, error: '沒有回覆其他教室資料的權限' };
    if (!['teacher', 'manager', 'admin'].includes(session.role)) return { ok: false, error: '目前身分無法送出回覆' };
    const toNickname = session.role === 'teacher' ? backendNickname(MANAGER_BY_DEPARTMENT[context.department] || state.context.manager) : teacherNickname;
    return API.addFeedback({
      log_id: context.logId,
      from_nickname: session.nickname,
      to_nickname: toNickname,
      content: message,
      tag,
    });
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
      ? '本機暫存空間不足：文字已安全備份；照片改由雲端保存，請重新整理後重試未完成的上傳'
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
    else if (currentDrawerDraftKind === 'plan') payload = capturePlanForm();
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

  function csvText(rows) {
    return '\ufeff' + rows.map(row => row.map(value => `"${String(value == null ? '' : value).replace(/"/g, '""')}"`).join(',')).join('\r\n');
  }

  function downloadCsv(fileName, rows) {
    const csv = csvText(rows);
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function archiveFolderPath(month, teacher = state.context.teacher) {
    const normalizedMonth = String(month || state.daily.date.slice(0, 7));
    const person = staffMember(teacher);
    const department = person?.department || state.context.department || '未分部門';
    return `KPI月歸檔／${department}／${backendNickname(teacher)}／${normalizedMonth}`;
  }

  function safeFilePart(value) {
    return String(value || '').replace(/[\\/:*?"<>|]/g, '-').replace(/\s+/g, '_');
  }

  function activityFeedbackExport(activity) {
    return (activity.evidence || []).map(evidence => {
      const messages = feedbackThreadExport(feedbackThreadKey('evidence', activity.id, evidence.id));
      return messages ? `${evidence.title || '成果證據'}\n${messages}` : '';
    }).filter(Boolean).join('\n\n');
  }

  function monthlyArchiveRows(month) {
    const teacher = state.context.teacher;
    const person = staffMember(teacher);
    const roster = assignedStudents(teacher);
    const inMonth = value => String(value || '').slice(0, 7) === month;
    const byDate = (a, b) => String(a.date || '').localeCompare(String(b.date || ''));
    const rows = [
      ['布拉克星球 KPI 系統｜安親部月歸檔'],
      ['老師', teacher],
      ['教室', person?.department || state.context.department],
      ['月份', month],
      ['負責學生', roster.join('、')],
      ...(person?.note ? [['班級備註', person.note]] : []),
      ['建議雲端資料夾', archiveFolderPath(month, teacher)],
      ['匯出時間', new Date().toLocaleString('zh-TW', { timeZone: 'Asia/Taipei', hour12: false })],
      [],
    ];
    const submissions = state.submissions.filter(item => item.teacher === teacher && inMonth(item.date)).slice().sort(byDate);
    const currentSubmission = submissions.find(item => item.date === state.daily.date);
    const dailyRows = submissions.map(item => [
      item.date, item.status === 'accepted' ? '已採認' : item.status === 'clarify' ? '待補充' : item.status === 'draft' && item.previousStatus ? '待重新送出' : item.status === 'draft' ? '草稿' : '待審查',
      item.keyResult || '', item.followup || '', item.tomorrowPriority || '', item.teacherNote || '',
      (item.contactSnapshots || []).length ? '有重要事項' : item.parentHandoffConfirmed ? '無重要事項／已門口交接' : '', item.parentHandoffNote || '',
      feedbackThreadExport(feedbackThreadKey('submission', item.id)),
    ]);
    if (inMonth(state.daily.date) && !currentSubmission) {
      const summary = buildDailySummary();
      dailyRows.push([state.daily.date, state.daily.submittedAt ? '已提交' : '草稿', summary.keyResult, summary.followup, summary.tomorrowPriority, state.daily.summary.teacherNote || '', state.daily.parentStatus === 'recorded' ? '有重要事項' : state.daily.parentHandoffConfirmed ? '無重要事項／已門口交接' : '', state.daily.parentHandoffNote || '', '']);
      dailyRows.sort((a, b) => String(a[0]).localeCompare(String(b[0])));
    }
    rows.push(['【每日彙整】'], ['日期', '狀態', '今日成果', '持續追蹤', '最近待辦', '老師補充', '親師狀態', '門口交接備註', '主管與老師對話'], ...dailyRows, []);

    const activities = state.activities.filter(item => item.teacher === teacher && item.type !== 'lessonprep' && inMonth(item.date)).slice().sort(byDate);
    rows.push(['【工作紀錄明細】'], ['日期', '分類', '工作類型', '標題', '課程／班級', '教案／教材有效處', '孩子共鳴環節', '教案／教材更新', '班級經營目標', '班級經營做法', '班級經營結果', '班級經營問題', '班級經營下一步', '追蹤日期', '備課檔案', '成果份數', '成果對話']);
    activities.forEach(activity => {
      const source = prepSourceById(activity.prepSourceId);
      rows.push([
        activity.date, activityTrackMeta(activityTrack(activity.type)).shortLabel, ACTIVITY_TYPES[activity.type]?.label || activity.type,
        activity.title, activity.className || '', activity.prepFeedback?.strengths || '', activity.prepFeedback?.resonance || '', activity.prepFeedback?.changes || '',
        activity.objective || '', activity.action || '', activity.result || '', activity.issue || '', activity.nextAction || '',
        activity.dueDate || '', source?.title || '', (activity.evidence || []).length, activityFeedbackExport(activity),
      ]);
    });
    rows.push([]);

    rows.push(['【成果證據索引】'], ['日期', '工作標題', '證據標題', '附件檔名', '附件連結', '對應工作結果', '舊版補充說明', '附件狀態', '主管狀態', '主管與老師對話']);
    activities.forEach(activity => (activity.evidence || []).forEach(evidence => {
      const attachments = evidenceAttachments(evidence);
      rows.push([
        activity.date, activity.title, evidence.title || '', attachments.map(item => item.fileName).join('、'),
        attachments.map(item => materialCloudUrl(item)).filter(Boolean).join('\n'), evidence.claim || '', evidence.observation || '',
        evidenceReady(evidence) ? '已上傳' : '未上傳', evidence.status || '', feedbackThreadExport(feedbackThreadKey('evidence', activity.id, evidence.id)),
      ]);
    }));
    rows.push([]);

    const cases = state.studentCases.filter(item => item.teacher === teacher && inMonth(item.date)).slice().sort(byDate);
    rows.push(['【學生追蹤】'], ['日期', '學生', '類別', '優先度', '具體觀察', '已採取方法', '目前結果', '下一步', '追蹤日期', '狀態', '主管與老師對話']);
    cases.forEach(item => rows.push([item.date, item.student, item.category, item.urgency, item.observation, item.intervention, item.outcome, item.nextAction, item.dueDate, item.status === 'closed' ? '已結案' : '追蹤中', feedbackThreadExport(feedbackThreadKey('case', item.id))]));
    rows.push([]);

    const contacts = state.contacts.filter(item => item.teacher === teacher && inMonth(item.date)).slice().sort(byDate);
    rows.push(['【親師溝通】'], ['日期', '學生', '管道', '主題', '必要摘要', '共識與後續行動', '追蹤日期', '狀態']);
    contacts.forEach(item => rows.push([item.date, item.student, item.channel, item.topic, item.summary, [item.decision, item.nextAction].filter(Boolean).join('；'), item.dueDate || '', item.status === 'closed' ? '已結案' : '待追蹤']));
    rows.push([]);

    const operations = operationRecords().filter(item => item.dutyOwner === teacher && inMonth(item.date)).slice().sort(byDate);
    rows.push(['【班務與環境】'], ['日期', '教室', '已附照片', '異常數', '主管狀態', '逐項結果', '主管與老師對話']);
    operations.forEach(operation => {
      const details = Object.entries(OPERATION_CHECKS).map(([key, config]) => {
        const item = operation.evidenceByCheck?.[key] || {};
        const link = materialCloudUrl(item);
        return `${config.label}：${item.status === 'exception' ? `異常｜${item.action || '未填處理'}` : '正常'}｜${item.fileName || '未附照片'}${link ? `｜${link}` : ''}`;
      }).join('\n');
      rows.push([operation.date, operation.room, operationProofCount(operation), operationExceptionCount(operation), operationReviewStatus(operation.reviewStatus)[0], details, feedbackThreadExport(feedbackThreadKey('operation', operation.id))]);
    });
    rows.push([]);

    const prepFiles = state.activities.filter(item => item.teacher === teacher && item.type === 'lessonprep' && inMonth(item.date)).slice().sort(byDate);
    rows.push(['【備課檔案】'], ['建立日期', '課程名稱', '課程類型', '上課內容／提醒', '附件數', '附件檔名', '附件連結', '使用次數']);
    prepFiles.forEach(item => {
      const materials = item.prepEvidence || [];
      rows.push([
        item.date, item.title, item.details?.targetCourse || '', item.prep?.summary || '', materials.length,
        materials.map(material => material.fileName || material.name || '附件').join('、'),
        materials.map(material => materialCloudUrl(material)).filter(Boolean).join('\n'),
        state.activities.filter(activity => activity.prepSourceId === item.id).length,
      ]);
    });
    return rows;
  }

  function openMonthlyExportDialog() {
    const month = state.daily.date.slice(0, 7);
    openDialog({
      title: '匯出每月彙整',
      body: `<form id="monthly-export-form"><div class="form-field"><label class="form-label" for="archive-month">歸檔月份 <span class="required">*</span></label><input id="archive-month" name="month" type="month" value="${month}" data-change="archive-month" required></div><div class="archive-path-preview">${icon('folders', 18)}<div><strong>雲端歸檔位置</strong><code id="archive-folder-path">${esc(archiveFolderPath(month))}</code></div></div><div class="notice-band info mt-12">${icon('messages-square', 18)}<div><div class="notice-title">對話會一起匯出</div><div class="notice-copy">日結、成果證據、學生追蹤、班務與教案的主管意見及老師回覆，都會依日期收進同一份月檔。</div></div></div></form>`,
      footer: `<button type="button" class="btn" data-action="close-dialog">取消</button><button type="button" class="btn btn-primary" data-action="export-monthly-archive">${icon('file-down', 16)}匯出月歸檔</button>`,
    });
  }

  async function exportMonthlyArchive() {
    const monthInput = $('#archive-month');
    if (!monthInput?.reportValidity()) return;
    const month = monthInput.value;
    const rows = monthlyArchiveRows(month);
    const fileName = `${safeFilePart(month)}_${safeFilePart(state.context.teacher)}_安親KPI月歸檔.csv`;
    downloadCsv(fileName, rows);
    let cloudResult = null;
    const session = legacySession();
    if (state.integration.cloudSyncEnabled && session && cloudIdentityReady() && window.API?.archiveMonthlyCsv) {
      cloudResult = await API.archiveMonthlyCsv({
        nickname: cloudTeacherNickname(),
        month,
        csv: csvText(rows),
      });
    }
    closeDialog();
    if (cloudResult?.ok) toast(`${month} 月歸檔已下載並存入雲端`, 'success');
    else if (cloudResult && !cloudResult.ok) toast(`檔案已下載；雲端歸檔失敗：${cloudResult.error || '請稍後重試'}`, 'warning');
    else toast(`${month} 月歸檔已下載`, 'success');
  }

  function exportStudentCases() {
    const rows = [['日期', '學生', '老師', '類別', '優先度', '客觀觀察', '已採取介入', '可觀察結果', '下一步', '期限', '狀態', '已同步家長', '主管與老師對話']];
    const visibleCases = state.ui.role === 'manager'
      ? state.studentCases.filter(item => managerScopeMatches(item.teacher))
      : state.studentCases.filter(item => item.teacher === state.context.teacher);
    visibleCases.forEach(item => rows.push([
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
    const session = legacySession();
    if (session?.impersonate === true) {
      return `<div class="system-status-notice"><div class="notice-band info">${icon('scan-eye', 19)}<div><div class="notice-title">${esc(session.impersonated_by || '柏翰')}互動測試：${esc(session.nickname)}</div><div class="notice-copy">可以開啟、輸入與切換完整流程；儲存、送出、核准、上傳與通知不會寫入正式資料。</div></div><button type="button" class="btn btn-small" data-action="exit-impersonation">回到測試人員清單</button></div></div>`;
    }
    const message = runtimeHealth.persistError || runtimeHealth.loadIssue;
    if (message) return `<div class="system-status-notice"><div class="notice-band danger">${icon('database-zap', 19)}<div><div class="notice-title">資料安全提醒</div><div class="notice-copy">${esc(message)}</div></div><button type="button" class="btn btn-small" data-action="open-health">健康檢查</button></div></div>`;
    if (state.ui.role === 'teacher' && state.integration.cloudSyncEnabled && !cloudIdentityReady()) {
      return `<div class="system-status-notice"><div class="notice-band warning">${icon('log-in', 19)}<div><div class="notice-title">請重新確認老師帳號</div><div class="notice-copy">畫面草稿仍保留；重新登入後即可繼續上傳與正式送出。</div></div><button type="button" class="btn btn-small" data-action="open-formal-login">重新登入</button></div></div>`;
    }
    if (session?.role === 'teacher' && integrationRuntime.cloudStatus === 'error') {
      const readFailure = integrationRuntime.cloudErrorContext === 'read';
      const title = readFailure ? '雲端資料讀取失敗' : '雲端處理未完成';
      const fallback = readFailure ? '目前只顯示本機保留內容，請重新讀取。' : '本機草稿仍保留，請依訊息修正後重新送出。';
      const action = readFailure
        ? '<button type="button" class="btn btn-small" data-action="sync-teacher-records">重新讀取</button>'
        : '<button type="button" class="btn btn-small" data-action="today-tab" data-tab="submit">回到送出</button>';
      return `<div class="system-status-notice"><div class="notice-band danger">${icon('cloud-alert', 19)}<div><div class="notice-title">${title}</div><div class="notice-copy">${esc(integrationRuntime.cloudMessage || fallback)}</div></div>${action}</div></div>`;
    }
    if (['manager', 'admin'].includes(session?.role) && integrationRuntime.managerSyncStatus === 'error') {
      return `<div class="system-status-notice"><div class="notice-band danger">${icon('cloud-alert', 19)}<div><div class="notice-title">主管資料讀取失敗</div><div class="notice-copy">${esc(integrationRuntime.managerSyncMessage || '目前資料可能不完整，請重新讀取後再審查。')}</div></div><button type="button" class="btn btn-small" data-action="manager-refresh">重新讀取</button></div></div>`;
    }
    if (session?.role === 'teacher' && state.integration.dailyDraftSyncPending) {
      return `<div class="system-status-notice"><div class="notice-band warning">${icon('cloud-upload', 19)}<div><div class="notice-title">本機草稿尚未同步雲端</div><div class="notice-copy">內容仍保留在這個裝置；完成同步前，請不要只依賴其他裝置查看。</div></div><button type="button" class="btn btn-small" data-action="retry-draft-sync">立即重試</button></div></div>`;
    }
    if (integrationRuntime.prepSyncStatus === 'error') {
      return `<div class="system-status-notice"><div class="notice-band warning">${icon('folder-sync', 19)}<div><div class="notice-title">備課檔案讀取不完整</div><div class="notice-copy">${esc(integrationRuntime.prepSyncMessage || '部分雲端備課檔案尚未載入。')}</div></div><button type="button" class="btn btn-small" data-action="retry-prep-sync">重新讀取</button></div></div>`;
    }
    if (integrationRuntime.taskSyncStatus === 'error') {
      return `<div class="system-status-notice"><div class="notice-band warning">${icon('list-restart', 19)}<div><div class="notice-title">追蹤事項讀取不完整</div><div class="notice-copy">${esc(integrationRuntime.taskSyncMessage || '部分主管交辦與追蹤事項尚未載入。')}</div></div><button type="button" class="btn btn-small" data-action="retry-task-sync">重新讀取</button></div></div>`;
    }
    return '';
  }

  function hydrateIcons() {
    if (window.lucide && typeof window.lucide.createIcons === 'function') {
      window.lucide.createIcons({ attrs: { 'stroke-width': 1.9 } });
    }
  }

  function toast(message, type = '') {
    const root = $('#toast-root');
    if (!root) return;
    const duplicate = Array.from(root.children).find(item => item.dataset.message === String(message));
    if (duplicate) {
      duplicate.className = `toast ${type}`.trim();
      return;
    }
    const node = document.createElement('div');
    node.className = `toast ${type}`.trim();
    node.dataset.message = String(message);
    node.innerHTML = `${icon(type === 'danger' ? 'circle-alert' : type === 'warning' ? 'triangle-alert' : 'circle-check', 17)}<span>${esc(message)}</span>`;
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
    const session = legacySession();
    if (session?.role === 'admin') {
      return { nickname: session.nickname || '柏翰', department: '管理員 · 全教室', initials: String(session.nickname || '柏翰').slice(0, 2) };
    }
    const nickname = state.ui.role === 'manager' ? state.context.manager : state.context.teacher;
    const person = state.people.find(item => item.nickname === nickname) || state.people[0];
    return state.ui.role === 'manager' && !managerScopeDepartment() ? { ...person, department: '全教室' } : person;
  }

  function renderApp() {
    const app = $('#app');
    if (!app) return;
    applyVisualTheme();
    const person = currentPerson();
    const nav = roleNav();
    const primaryNav = nav.filter(item => !item.moreOnly);
    const session = legacySession();
    const canSwitchReviewRole = IS_REVIEW_BUILD && !session;
    const workspaceLabel = session?.role === 'admin' ? '管理員工作區' : state.ui.role === 'manager' ? '主管工作區' : '老師工作區';
    const workspaceUser = session || {
      nickname: person.nickname,
      role: state.ui.role,
      department: person.department,
    };
    const workspaceId = state.ui.role === 'manager' ? 'anqin-manager' : 'anqin-teacher';
    window.KPI_REVIEW_USER = workspaceUser;
    app.innerHTML = `
      <header class="topbar">
        <div class="brand-block">
          <img class="brand-logo" src="assets/kpi-logo.png" alt="布拉克星球 KPI Logo">
          <div class="brand-copy">
            <div class="brand-name"><span class="brand-name-full">布拉克星球KPI系統</span><span class="brand-name-short">KPI</span></div>
            <div class="brand-product">安親工作台</div>
          </div>
        </div>
        <div class="topbar-center">
          <div class="crumb">${esc(state.ui.role === 'manager' ? managerScopeLabel() : state.context.department)} / ${esc(routeTitle())}</div>
          <div id="save-state" class="save-state is-saved">${icon('circle-check', 14)}<span>${state.ui.lastSavedAt ? `已儲存 ${formatTime(state.ui.lastSavedAt)}` : '尚無變更'}</span></div>
        </div>
        <div class="topbar-actions">
          ${window.KPI_WORKSPACES?.renderSwitcher?.(workspaceUser, { currentId: workspaceId }) || ''}
          ${canSwitchReviewRole ? `<div class="role-switch" aria-label="切換審查角色">
            <button type="button" data-action="switch-role" data-role="teacher" class="${state.ui.role === 'teacher' ? 'active' : ''}">老師視角</button>
            <button type="button" data-action="switch-role" data-role="manager" class="${state.ui.role === 'manager' ? 'active' : ''}">主管視角</button>
          </div>` : ''}
          ${state.ui.role === 'teacher' ? `<button type="button" class="icon-button topbar-help" data-action="navigate" data-route="guide" aria-label="開啟填寫指南" title="填寫指南">${icon('circle-help', 19)}</button>` : ''}
          <button type="button" class="profile-button" data-action="open-profile" aria-label="開啟使用者選單">
            <span class="avatar">${esc(person.initials || person.nickname.slice(0, 2))}</span>
            <span class="profile-text"><span class="profile-name">${esc(person.nickname)}</span><span class="profile-meta">${esc(person.department)}</span></span>
            ${icon('chevron-down', 16)}
          </button>
        </div>
      </header>

      <aside class="sidebar">
        <div class="nav-group-label">${workspaceLabel}</div>
        <nav class="side-nav" aria-label="主要導覽">
          ${primaryNav.map(item => renderNavButton(item)).join('')}
          ${nav.some(item => item.moreOnly) ? `<button type="button" class="nav-button" data-action="open-more-nav">${icon('menu', 18)}<span>更多</span></button>` : ''}
        </nav>
        <div class="sidebar-foot">
          <span class="sidebar-crew" aria-hidden="true"><img src="../../shared/icons/bg.jpg" alt=""></span>
          <strong>${esc(state.ui.role === 'manager' ? managerScopeLabel() : state.context.department)}</strong>
        </div>
      </aside>

      <main class="app-main" id="main-content">${renderSystemStatusNotice()}${window.KPI_WORKSPACES?.renderQuickSwitcher?.(workspaceUser, { currentId: workspaceId }) || ''}${renderRoute()}</main>

      <nav class="mobile-bottom-nav" aria-label="行動版主要導覽">
        ${renderMobileNav(primaryNav, nav)}
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

  function renderMobileNav(nav, fullNav = nav) {
    const visible = nav.length <= 5 ? nav : nav.slice(0, 4);
    const buttons = visible.map(item => `<button type="button" class="mobile-nav-button ${state.ui.route === item.route ? 'active' : ''}" data-action="navigate" data-route="${item.route}">${icon(item.icon, 19)}<span>${esc(item.label)}</span></button>`);
    if (fullNav.length > visible.length || fullNav.some(item => item.moreOnly)) {
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
      evaluations: renderManagerEvaluations,
      scoring: renderScoringStandards,
      'cloud-reports': renderManagerCloudReports,
      settings: renderIntegrationSettings,
    } : {
      today: renderTeacherToday,
      weekly: renderWeekly,
      plans: renderLessonPlans,
      records: renderRecords,
      evaluation: renderTeacherEvaluation,
      tasks: renderTasks,
      guide: renderTeacherGuide,
      scoring: renderScoringStandards,
      settings: renderIntegrationSettings,
    };
    const renderer = routes[state.ui.route] || routes[defaultRoute(state.ui.role)];
    return renderer();
  }

  function pageHead(title, subtitle, actions = '') {
    const mascotByRoute = {
      today: 'mascot-blue', weekly: 'mascot-green', plans: 'mascot-coral', records: 'mascot-black', evaluation: 'mascot-coral', tasks: 'mascot-green', guide: 'mascot-blue', scoring: 'mascot-coral',
      dashboard: 'mascot-black', reviews: 'mascot-blue', evidence: 'mascot-black', students: 'mascot-green',
      'operations-review': 'mascot-green', 'plans-review': 'mascot-coral', team: 'mascot-blue', evaluations: 'mascot-coral', 'cloud-reports': 'mascot-green', settings: 'mascot-black',
    };
    const mascotClass = mascotByRoute[state.ui.route] || 'mascot-coral';
    return `<div class="page-head"><div class="page-heading"><span class="mascot-peek ${mascotClass}" aria-hidden="true"><img src="../../shared/icons/bg.jpg" alt=""></span><div><h1>${esc(title)}</h1><p class="page-subtitle">${esc(subtitle)}</p></div></div><div class="page-actions">${actions}</div></div>`;
  }

  function allEvidence() {
    return state.activities
      .filter(activity => managerScopeMatches(activity.teacher))
      .flatMap(activity => (activity.evidence || []).map(evidence => ({ activity, evidence: normalizeEvidenceRecord(evidence) })));
  }

  function openTasks() {
    return state.tasks.filter(task => managerScopeMatches(task.owner || task.assignee, task.department) && task.status !== 'done');
  }

  function pendingReviews() {
    return state.submissions.filter(submission => managerScopeMatches(submission.teacher, submission.department) && (submission.status === 'pending' || submission.status === 'clarify'));
  }

  function todayActivities() {
    return state.activities.filter(activity => activity.teacher === state.context.teacher && activity.date === state.daily.date && activity.type !== 'lessonprep');
  }

  function activityTrack(type) {
    return (ACTIVITY_TYPES[type] || ACTIVITY_TYPES.tutoring).track || 'academic';
  }

  function activityTrackMeta(track) {
    return {
      academic: { label: '學科內｜課業輔導／班級經營', shortLabel: '學科內', icon: 'book-open-check', tone: 'blue', description: '今天有學科內工作就填寫；班級經營有實際事件時再記。' },
      enrichment: { label: '學科外｜特色課程', shortLabel: '學科外', icon: 'sparkles', tone: 'purple', description: '今天有專案、機器人／STEAM、學習歷程或 SEL 就填寫。' },
      legacy: { label: '歷史紀錄', shortLabel: '歷史資料', icon: 'archive', tone: 'outline', description: '只保留舊資料，不提供新增。' },
    }[track] || { label: '學科內', shortLabel: '學科內', icon: 'book-open-check', tone: 'blue', description: '' };
  }

  function dailyTrackStatus(activities = todayActivities()) {
    const build = track => {
      const items = activities.filter(activity => activityTrack(activity.type) === track);
      return { items, count: items.length, complete: items.filter(activityComplete).length, covered: items.length > 0 };
    };
    return { academic: build('academic'), enrichment: build('enrichment') };
  }

  function dailyRequiredTracksReady(activities = todayActivities()) {
    const tracks = dailyTrackStatus(activities);
    return tracks.academic.covered || tracks.enrichment.covered;
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
    return Boolean(plan && plan.title && plan.courseType);
  }

  function prepSourceReadinessIssues(source, executionType, executionDate = state.daily.date) {
    if (!source) return ['尚未選擇備課檔案'];
    const issues = [];
    if (!prepSourceMatchesType(source, executionType)) issues.push('課程類型不相符');
    if (!(source.prepEvidence || []).some(item => materialCloudUrl(item))) issues.push('缺少教案或教材附件');
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

  function activityFeedbackSummary(activity, empty = '') {
    if (!activityNeedsPrepSource(activity.type)) return String(activity.result || '').trim() || empty;
    const feedback = activity.prepFeedback || {};
    return [
      feedback.strengths ? `有效處：${feedback.strengths}` : '',
      feedback.resonance ? `孩子共鳴：${feedback.resonance}` : '',
      feedback.changes ? `下次調整：${feedback.changes}` : '',
    ].filter(Boolean).join('；') || empty;
  }

  function activityIssueSummary(activity, empty = '') {
    if (activityNeedsPrepSource(activity.type)) return String(activity.prepFeedback?.changes || '').trim() || empty;
    return String(activity.issue || '').trim() || empty;
  }

  function activityDetailsComplete(activity) {
    if (activityNeedsPrepSource(activity.type)) return true;
    const details = activity.details || {};
    return activityDetailSchema(activity.type).every(field => String(details[field.key] || '').trim().length >= field.min);
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
      return Boolean(activity.title && activity.details?.targetCourse && (activity.prepEvidence || []).some(item => materialCloudUrl(item)));
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
    return [state.operations, ...(state.operationHistory || [])].filter(item => item && managerScopeMatches(item.dutyOwner, item.room));
  }

  function operationRecordById(id) {
    return operationRecords().find(item => item.id === id);
  }

  function operationProofCount(operation) {
    const proof = operation.evidenceByCheck || {};
    return Object.keys(OPERATION_CHECKS).filter(key => attachmentRecorded(proof[key]) && ['normal', 'exception'].includes(proof[key]?.status)).length;
  }

  function operationExceptionCount(operation) {
    const proof = operation.evidenceByCheck || {};
    return Object.keys(OPERATION_CHECKS).filter(key => proof[key]?.status === 'exception').length;
  }

  function activityComplete(activity) {
    if (activity.type === 'lessonprep') return activityPreparationReady(activity);
    const feedbackOnly = activityNeedsPrepSource(activity.type);
    const identityReady = Boolean(activity.title && activity.className);
    const basic = feedbackOnly
      ? identityReady
      : identityReady && String(activity.objective || '').length >= 8 && String(activity.action || '').length >= 8 && String(activity.result || '').length >= 8 && String(activity.nextAction || '').length >= 6 && String(activity.owner || '').trim() && String(activity.dueDate || '').trim();
    if (!basic || !activityDetailsComplete(activity)) return false;
    if (!activityPreparationReady(activity)) return false;
    if (!activityPlanReady(activity)) return false;
    const config = ACTIVITY_TYPES[activity.type] || ACTIVITY_TYPES.tutoring;
    if (!config.evidence) return true;
    return (activity.evidence || []).some(evidenceReady);
  }

  function activityReadinessChecks(activity) {
    if (activity.type === 'lessonprep') {
      return [
        { key: 'record', label: '課程名稱與類型', ready: Boolean(activity.title && activity.details?.targetCourse) },
        { key: 'material', label: '至少一份教案或教材附件', ready: (activity.prepEvidence || []).some(item => materialCloudUrl(item)) },
      ];
    }
    const feedbackOnly = activityNeedsPrepSource(activity.type);
    const identityReady = Boolean(activity.title && activity.className);
    const basic = feedbackOnly
      ? identityReady
      : Boolean(identityReady && String(activity.objective || '').length >= 8 && String(activity.action || '').length >= 8 && String(activity.result || '').length >= 8 && String(activity.nextAction || '').length >= 6 && String(activity.owner || '').trim() && String(activity.dueDate || '').trim() && activityDetailsComplete(activity));
    const hasEvidence = (activity.evidence || []).some(evidenceReady);
    const checks = [{ key: 'record', label: feedbackOnly ? '課程資料' : '工作內容', ready: basic }];
    if (activityNeedsPrepSource(activity.type)) {
      checks.push(
        { key: 'source', label: '備課檔案', ready: prepSourceUsable(prepSourceById(activity.prepSourceId), activity.type, activity.date) },
        { key: 'feedback', label: '課後回饋', ready: prepFeedbackComplete(activity) },
      );
    }
    const config = ACTIVITY_TYPES[activity.type] || ACTIVITY_TYPES.tutoring;
    if (config.evidence) checks.push({ key: 'evidence', label: '成果證據', ready: hasEvidence });
    return checks;
  }

  function operationsComplete(operation = state.operations, respectDutyOwner = true) {
    if (respectDutyOwner && operation.dutyOwner !== state.context.teacher) return true;
    const proof = operation.evidenceByCheck || {};
    const items = Object.keys(OPERATION_CHECKS).map(key => proof[key]);
    return Boolean(operation.confirmedAt) && items.every(item => attachmentRecorded(item) && ['normal', 'exception'].includes(item.status) && (item.status !== 'exception' || String(item.action || '').trim().length >= 8));
  }

  function markDailyNeedsResubmit(date = state.daily.date, teacher = state.context.teacher) {
    if (date !== state.daily.date || teacher !== state.context.teacher) return false;
    const wasSubmitted = Boolean(state.daily.submittedAt || state.daily.status === 'submitted');
    state.daily.status = 'draft';
    state.daily.submittedAt = '';
    const existing = state.submissions.find(item => item.date === date && item.teacher === teacher);
    if (existing && ['pending', 'accepted', 'clarify'].includes(existing.status)) {
      existing.previousStatus = existing.status;
      existing.status = 'draft';
    }
    return wasSubmitted;
  }

  function todaySectionStatus() {
    const activities = todayActivities();
    return {
      activities: dailyRequiredTracksReady(activities) && activities.every(activityComplete),
      students: state.daily.noStudentFollowupConfirmed || state.studentCases.some(item => item.date === state.daily.date && item.teacher === state.context.teacher),
      parents: state.contacts.some(item => item.date === state.daily.date && item.teacher === state.context.teacher)
        || (state.daily.parentStatus === 'handoff' && state.daily.parentHandoffConfirmed && String(state.daily.parentHandoffNote || '').trim().length >= 4),
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
    return `<div class="guide-invite">${icon('book-open-text', 22)}<div><strong>第一次使用可先查看填寫指南</strong></div><div class="guide-invite-actions"><button type="button" class="btn btn-small btn-primary" data-action="navigate" data-route="guide">開啟指南</button><button type="button" class="icon-button" data-action="dismiss-guide-prompt" aria-label="略過填寫指南提示" title="略過">${icon('x', 15)}</button></div></div>`;
  }

  function renderTeacherToday() {
    const activities = todayActivities();
    const tracks = dailyTrackStatus(activities);
    const evidenceRequired = activities.filter(activity => (ACTIVITY_TYPES[activity.type] || ACTIVITY_TYPES.tutoring).evidence);
    const evidenceReadyCount = evidenceRequired.filter(activity => (activity.evidence || []).some(evidenceReady)).length;
    const prepRequired = activities.filter(activity => activityNeedsPrepSource(activity.type));
    const prepReady = prepRequired.filter(activityPreparationReady).length;
    const completion = dailyCompletion();
    const tabStatus = todaySectionStatus();
    const actions = `<button type="button" class="btn" data-action="open-student-case">${icon('user-round-plus', 16)}<span class="btn-label-mobile-hide">快速記學生</span></button><button type="button" class="btn" data-action="open-activity" data-type="lessonprep">${icon('notebook-tabs', 16)}<span class="btn-label-mobile-hide">新增備課檔案</span></button>`;
    return `<div class="page">
      ${pageHead('今日工作紀錄', `${formatDate(state.daily.date)} · ${state.context.department} · ${state.context.teacher}`, actions)}
      ${renderGuideInvite()}
      <div class="status-strip">
        <div class="status-cell"><div class="status-label">今日完成度</div><div class="status-value">${completion}%</div><div class="status-note">${state.daily.status === 'submitted' ? '已送出' : '草稿'}</div></div>
        <div class="status-cell"><div class="status-label">今日課程</div><div class="status-value">${Number(tracks.academic.covered || tracks.enrichment.covered)}/1</div><div class="status-note">學科內／學科外擇一</div></div>
        <div class="status-cell"><div class="status-label">備課／成果</div><div class="status-value">${prepReady}/${prepRequired.length}</div><div class="status-note">成果 ${evidenceReadyCount}/${evidenceRequired.length} 筆</div></div>
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
        <div class="panel-head"><div><div class="panel-title">${icon('clipboard-list')}工作紀錄</div><div class="panel-subtitle">學科內或學科外每天至少記錄一筆 · 完整 ${ready}/${activities.length || 0}</div></div></div>
        <div class="panel-body">
          <div class="daily-track-requirements">${['academic', 'enrichment'].map(track => {
            const meta = activityTrackMeta(track);
            const status = tracks[track];
            const fullyComplete = status.covered && status.complete === status.count;
            const progress = status.count
              ? `${status.complete}/${status.count} 筆完整`
              : tracks.academic.covered || tracks.enrichment.covered
                ? '今天沒有這類課程可留白'
                : '尚未記錄；兩類至少選一類填寫';
            const buttonLabel = status.covered ? '再記一筆' : track === 'academic' ? '新增學科內' : '新增學科外';
            const buttonClass = !tracks.academic.covered && !tracks.enrichment.covered && track === 'academic' ? 'btn-primary' : '';
            return `<article class="daily-track-row ${status.covered ? 'is-covered' : ''} ${fullyComplete ? 'is-complete' : ''}"><span class="daily-track-icon">${icon(meta.icon, 20)}</span><div><strong>${esc(meta.label)}</strong><div class="daily-track-progress">${esc(progress)}</div></div><button type="button" class="btn btn-small ${buttonClass}" data-action="open-activity" data-track="${track}">${icon(status.covered ? 'plus' : 'plus-circle', 14)}${buttonLabel}</button></article>`;
          }).join('')}</div>
          <div class="section-divider"></div>
          ${activities.length ? `<div class="activity-list">${activities.map(renderActivityRow).join('')}</div>` : renderEmpty('clipboard-plus', '尚無工作紀錄', '請依今天實際內容，新增一筆學科內或學科外紀錄。', '', '')}
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
    const evidenceFileCount = evidence.reduce((count, item) => count + evidenceAttachments(item).filter(attachmentRecorded).length, 0);
    const prepSource = prepSourceById(activity.prepSourceId);
    const isCrossDay = activity.type === 'lessonprep';
    const feedbackOnly = activityNeedsPrepSource(activity.type);
    const detailSummary = (feedbackOnly ? [] : activityDetailSchema(activity.type)).slice(0, 2).map(field => {
      const value = activity.details?.[field.key];
      return `<span><strong>${esc(field.label)}：</strong>${field.control === 'date' ? formatDate(value) : esc(value || '尚未填寫')}</span>`;
    }).join('');
    const complete = activityComplete(activity);
    const readiness = activityReadinessChecks(activity);
    const missing = readiness.filter(item => !item.ready);
    const evidenceAction = evidence.length ? 'open-evidence' : 'new-evidence';
    const evidenceActionLabel = evidence.length ? '查看證據' : (isCrossDay ? '上傳本日產出' : '上傳成果');
    const completionLabel = complete ? '資料完整' : missing.length === 1 ? `缺${missing[0].label}` : `缺 ${missing.length} 項`;
    const titleBadges = `<span class="badge ${complete ? 'green' : 'red'}">${esc(completionLabel)}</span>${activity.isSample ? `<span class="badge blue">${icon('sparkles', 12)}完整範例</span>` : ''}`;
    const resultPreview = feedbackOnly ? activity.prepFeedback?.strengths : activity.result;
    const contextMeta = feedbackOnly
      ? esc(activity.className || '未指定課程／班級')
      : `${esc(activity.className || '未指定班級')} · ${(activity.students || []).length ? `${activity.students.length} 位關聯學生` : '全班'}`;
    const feedbackDetails = feedbackOnly ? `<div class="activity-outcome"><strong>有效處：</strong>${esc(activity.prepFeedback?.strengths || '尚未填寫')}</div><div class="activity-outcome"><strong>孩子共鳴：</strong>${esc(activity.prepFeedback?.resonance || '尚未填寫')}</div><div class="activity-outcome"><strong>下次調整：</strong>${esc(activity.prepFeedback?.changes || '尚未填寫')}</div>` : `<div class="activity-outcome"><strong>結果：</strong>${esc(activity.result || '尚未填寫')}</div>`;
    return `<article class="activity-row">
      <div class="activity-icon ${config.tone}">${icon(config.icon, 20)}</div>
      <div class="activity-main">
        <div class="activity-title-row"><button type="button" class="activity-title activity-title-link" data-action="view-activity" data-activity-id="${activity.id}">${esc(activity.title)}</button>${titleBadges}</div>
        <div class="activity-meta">${esc(config.label)} · ${isCrossDay ? `${formatDate(activity.date)} 建立` : contextMeta}</div>
        <div class="activity-glance"><strong>${isCrossDay ? '本日進度' : feedbackOnly ? '課後備課回饋' : '今日成果'}</strong><span>${esc(truncate(resultPreview || '尚未填寫', 100))}</span></div>
        ${missing.length ? `<div class="activity-missing activity-missing-compact">${icon('triangle-alert', 14)}<strong>待補：</strong>${esc(missing.map(item => item.label).join('、'))}</div>` : ''}
        <div class="activity-quick-meta"><span class="badge ${evidence.some(evidenceReady) ? 'blue' : 'red'}">${icon('scan-line', 12)}${isCrossDay ? '本日產出' : '成果檔案'} ${evidenceFileCount} 份</span>${activity.nextAction ? `<span class="badge outline">${icon('calendar-clock', 12)}${formatShortDate(activity.dueDate)} ${isCrossDay ? '下一步' : '追蹤'}</span>` : ''}</div>
        <details class="activity-record-details"><summary>${icon('list-tree', 14)}<span>完整紀錄</span>${icon('chevron-down', 14)}</summary><div class="activity-record-details-body">${detailSummary ? `<div class="activity-detail-summary">${detailSummary}</div>` : ''}${feedbackOnly ? `<div class="activity-prep-line"><strong>備課檔案：</strong>${esc(prepSource ? `${prepSource.title} · ${formatDate(prepSource.date)} 建立` : '尚未連結')}</div>` : ''}${feedbackDetails}</div></details>
      </div>
      <div class="activity-actions">
        <button type="button" class="btn btn-small" data-action="view-activity" data-activity-id="${activity.id}">${icon('eye', 14)}查看</button>
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
    const outcomes = activities.map(item => [item, activityFeedbackSummary(item)]).filter(([, value]) => value).map(([item, value]) => `${item.title}：${value}`);
    const issues = activities.map(item => [item, activityIssueSummary(item)]).filter(([, value]) => value).map(([item, value]) => `${item.title}：${value}`);
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
      <div class="panel-head"><div><div class="panel-title">${icon('sparkles')}今日摘要</div></div></div>
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
    const subtitle = state.ui.evidenceStandardsSeen ? '' : '首次使用時顯示';
    return `<section class="panel evidence-standards-panel ${expanded ? 'is-expanded' : 'is-collapsed'}" data-evidence-standards="${esc(context)}">
      <div class="panel-head">
        <div><div class="panel-title">${icon('badge-check')}課程與工作證據標準</div>${subtitle ? `<div class="panel-subtitle">${subtitle}</div>` : ''}</div>
        <button type="button" class="btn btn-small evidence-standards-toggle" data-action="toggle-evidence-standards" data-context="${esc(context)}" aria-expanded="${expanded}" aria-controls="${bodyId}">${icon(expanded ? 'eye-off' : 'eye', 15)}${expanded ? '隱藏證據標準' : '查看證據標準'}</button>
      </div>
      <div id="${bodyId}" class="panel-body" ${expanded ? '' : 'hidden'}>
        <div class="check-list evidence-standard-list">
          <div class="check-item done"><span class="check-icon">${icon('check', 12)}</span><span>授課前：選擇本堂課實際使用的備課檔案</span></div>
          <div class="check-item done"><span class="check-icon">${icon('check', 12)}</span><span>班級經營：歸在學科內，不要求教案或備課附件</span></div>
          <div class="check-item done"><span class="check-icon">${icon('check', 12)}</span><span>課程成果證據對應課後備課回饋；班級經營證據對應實際結果</span></div>
          <div class="check-item done"><span class="check-icon">${icon('check', 12)}</span><span>成果內容需清楚可辨識；主管會依完整性、清楚度與可判讀性評分</span></div>
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
    const handoffMode = state.daily.parentStatus === 'handoff';
    return `<div class="content-grid teacher-single-panel">
      <section class="panel">
        <div class="panel-head"><div><div class="panel-title">${icon('messages-square')}親師溝通</div><div class="panel-subtitle">重要事項留下完整紀錄；無重要事項仍需親自完成門口交接</div></div><button type="button" class="btn btn-small" data-action="open-contact">${icon('plus', 15)}新增重要事項</button></div>
        <div class="panel-body">
          <div class="segmented" aria-label="今日親師聯繫狀態">
            <button type="button" class="${state.daily.parentStatus === 'recorded' ? 'active' : ''}" data-action="set-parent-status" data-status="recorded">有重要事項</button>
            <button type="button" class="${handoffMode ? 'active' : ''}" data-action="set-parent-status" data-status="handoff">無重要事項</button>
          </div>
          <div class="section-divider"></div>
          ${handoffMode ? `<section class="activity-form-section"><div class="activity-section-title"><span>${icon('hand-heart', 18)}</span><div><strong>今日門口交接</strong></div></div><div class="form-grid"><div class="form-field span-2"><label class="choice-chip"><input type="checkbox" data-change="parent-handoff-confirmed" ${state.daily.parentHandoffConfirmed ? 'checked' : ''}>${icon('circle-check', 15)}已親自在門口攜帶並交接孩子給家長 <span class="required">*</span></label></div><div class="form-field span-2"><label class="form-label" for="parent-handoff-note">交接備註 <span class="required">*</span></label><textarea id="parent-handoff-note" data-input="parent-handoff-note" minlength="4" placeholder="例：今日無需個別溝通，已逐一完成交接；彥呈由阿嬤接回。">${esc(state.daily.parentHandoffNote || '')}</textarea><div class="field-hint">至少 4 字；只記錄必要的交接情況。</div></div></div></section>` : contacts.length ? `<div class="activity-list">${contacts.map(renderContactRow).join('')}</div>` : renderEmpty('message-circle-off', state.daily.parentStatus === 'recorded' ? '尚未新增重要事項' : '請選擇今天的親師狀態', state.daily.parentStatus === 'recorded' ? '有重要事項時，記錄溝通內容、共識與後續行動。' : '若沒有重要事項，仍需確認已親自在門口交接孩子。', '新增重要事項', 'open-contact')}
        </div>
      </section>
    </div>`;
  }

  function renderContactRow(item) {
    return `<article class="activity-row">
      <div class="activity-icon">${icon('message-circle', 20)}</div>
      <div class="activity-main">
        <div class="activity-title-row"><span class="activity-title">${esc(item.student)}｜${esc(item.topic)}</span><span class="badge blue">${esc(item.channel)}</span><span class="badge ${item.status === 'closed' ? 'green' : 'yellow'}">${item.status === 'closed' ? '已結案' : '待追蹤'}</span></div>
        <div class="activity-outcome"><strong>共識與後續行動：</strong>${esc([item.decision, item.nextAction].filter(Boolean).join('；'))}</div>
        <div class="activity-meta">${item.status === 'closed' ? '已完成，不需再追蹤' : `下次追蹤 ${formatDate(item.dueDate)}`}</div>
      </div>
      <div class="activity-actions"><button type="button" class="icon-button" data-action="edit-contact" data-contact-id="${item.id}" aria-label="編輯親師溝通" title="編輯親師溝通">${icon('pencil', 16)}</button></div>
    </article>`;
  }

  function renderOperationPhoto(item, key, label) {
    const hasPhoto = Boolean(item.fileName);
    const previewUrl = attachmentPreviewUrl(item);
    return `<div id="operation-preview-${key}" class="operation-photo-preview ${previewUrl ? 'has-image' : ''}">${previewUrl ? `<img src="${esc(previewUrl)}" alt="${esc(label)}證據預覽">` : `<span>${icon('image-plus', 17)}</span>`}<div><strong id="operation-photo-name-${key}">${hasPhoto ? '更換照片' : '選擇照片'}</strong><small>${hasPhoto ? `${esc(item.fileName)} · ${esc(item.size || '已加入')}` : '每項一張'}</small></div></div>`;
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
        <div class="panel-head"><div><div class="panel-title">${icon('school')}班務與環境逐項檢核</div><div class="panel-subtitle">${esc(operation.room)} · 值日 ${esc(operation.dutyOwner)}</div></div><div class="flex gap-6 flex-wrap">${isDutyOwner ? statusBadge('今日負責', 'yellow') : statusBadge('非今日值日', 'green')}${operation.confirmedAt ? statusBadge(review[0], review[1]) : statusBadge('尚未確認', 'outline')}</div></div>
        <div class="panel-body">
          ${operationHasConversation ? renderFeedbackThread(operationThreadKey, { inline: true }) : ''}
          ${!isDutyOwner ? `<div class="notice-band success">${icon('circle-check', 19)}<div><div class="notice-title">今日由 ${esc(operation.dutyOwner)} 檢核</div><div class="notice-copy">發現異常請通知值日老師。</div></div></div>` : `<div class="notice-band info">${icon('camera', 19)}<div><div class="notice-title">四項各附 1 張照片</div><div class="notice-copy">異常時再填處理安排。</div></div></div>`}
          <form id="operations-form" data-form="operations">
            <div class="operation-proof-list mt-16">
              ${Object.entries(OPERATION_CHECKS).map(([key, config], index) => {
                const item = { status: operation.checks?.[key] === false ? 'exception' : 'normal', action: '', ...(proof[key] || {}) };
                const isException = item.status === 'exception';
                return `<article class="operation-proof-item ${item.fileName ? 'has-proof' : ''} ${isException ? 'is-exception' : ''}" data-operation-item="${key}"><div class="operation-proof-head"><span class="operation-proof-index">${index + 1}</span><div><strong>${esc(config.label)}</strong><small>${esc(config.focus)}</small></div><span id="operation-proof-badge-${key}" class="badge ${item.fileName ? 'green' : 'red'}">${item.fileName ? '已附照片' : '缺照片'}</span></div><div class="operation-proof-fields"><div class="operation-photo-field"><label class="operation-photo-control" for="operation-photo-${key}">${renderOperationPhoto(item, key, config.label)}</label>${item.fileName && isDutyOwner ? `<button type="button" class="icon-button operation-photo-remove" data-action="remove-operation-photo" data-check-key="${key}" aria-label="移除${esc(config.label)}照片" title="移除照片">${icon('x', 15)}</button>` : ''}<input class="sr-only" id="operation-photo-${key}" type="file" accept="image/*" data-change="operation-photo" data-check-key="${key}" ${!isDutyOwner ? 'disabled' : ''}></div><div class="operation-proof-decision"><div class="form-label">本項結果 <span class="required">*</span></div><div class="segmented compact"><label><input type="radio" name="status_${key}" value="normal" data-change="operation-status" data-check-key="${key}" ${!isException ? 'checked' : ''} ${!isDutyOwner ? 'disabled' : ''} required>正常</label><label><input type="radio" name="status_${key}" value="exception" data-change="operation-status" data-check-key="${key}" ${isException ? 'checked' : ''} ${!isDutyOwner ? 'disabled' : ''} required>異常</label></div><div class="form-field operation-action-field" ${isException ? '' : 'hidden'}><label class="form-label" for="operation-action-${key}">異常狀況與處理安排 <span class="required">*</span></label><textarea id="operation-action-${key}" name="action_${key}" minlength="8" placeholder="例：右側白板筆缺兩盒；已標示缺件，交由美萱明日補齊。" ${!isDutyOwner ? 'disabled' : ''} ${isException ? 'required' : ''}>${esc(item.action || '')}</textarea></div></div></div></article>`;
              }).join('')}
            </div>
            <div class="flex gap-8 mt-16"><button type="submit" class="btn btn-primary" ${!isDutyOwner ? 'disabled' : ''}>${icon('check-check', 16)}送出班務檢核</button></div>
          </form>
        </div>
      </section>
      <aside class="stack">
        <section class="panel"><div class="panel-head"><div><div class="panel-title">${icon('clipboard-check')}目前狀態</div></div></div><div class="panel-body"><div class="metric-row"><span class="metric-value" id="operation-proof-count">${proofCount}/4 ${proofCount ? '已上傳' : '待上傳'}</span><div class="progress-track"><div id="operation-proof-progress" class="progress-fill ${proofCount < 4 ? 'warn' : ''}" style="width:${proofCount / 4 * 100}%"></div></div></div><div class="operation-metrics mt-12"><div><strong>${4 - exceptionCount}</strong><small>正常</small></div><div class="${exceptionCount ? 'danger' : ''}"><strong>${exceptionCount}</strong><small>異常</small></div><div><strong>${operation.confirmedAt ? review[0] : '未送出'}</strong><small>主管狀態</small></div></div><div class="text-small muted mt-8" id="operation-proof-help">${operation.confirmedAt && operationsComplete() ? `已於 ${formatTime(operation.confirmedAt)} 完成檢核` : proofCount === 4 ? '照片已上傳，可送出班務檢核' : '補齊照片與異常處理後即可送出'}</div></div></section>
      </aside>
    </div>`;
  }

  function renderTodaySubmit() {
    const completion = dailyCompletion();
    const submitting = integrationRuntime.cloudStatus === 'submitting';
    const status = todaySectionStatus();
    const tracks = dailyTrackStatus();
    const summary = buildDailySummary();
    const blockers = [];
    if (!dailyRequiredTracksReady()) blockers.push('新增一筆學科內或學科外紀錄');
    if (dailyRequiredTracksReady() && !status.activities) blockers.push('已新增的課程需選擇備課檔案並完成課後回饋；班級經營只需工作欄位及可判讀成果證據');
    if (!status.students) blockers.push('新增學生追蹤，或確認今日無需個別追蹤');
    if (!status.parents) blockers.push('新增重要親師溝通，或完成門口交接確認與備註');
    if (!status.operations) blockers.push('今日值日班務尚未確認');
    return `<div class="content-grid wide-aside">
      <section class="panel">
        <div class="panel-head"><div><div class="panel-title">${icon('send')}確認並送出</div></div><span class="badge ${completion === 100 ? 'green' : 'yellow'}">完成度 ${completion}%</span></div>
        <div class="panel-body">
          ${state.daily.submittedAt ? `<div class="notice-band success">${icon('circle-check', 19)}<div><div class="notice-title">已於 ${formatTime(state.daily.submittedAt)} 送出</div><div class="notice-copy">${state.integration.cloudSyncEnabled ? '修改後需重新送出，主管才會收到最新版本。' : '目前為審查紀錄，未通知真人主管。'}</div></div></div>` : ''}
          <form id="daily-summary-form" data-form="daily-summary">
            <div class="summary-list">
              <div class="summary-line"><span class="summary-index">1</span><div><div class="summary-title">今日成果</div><div class="summary-copy">${esc(summary.keyResult)}</div></div></div>
              <div class="summary-line"><span class="summary-index">2</span><div><div class="summary-title">需持續追蹤</div><div class="summary-copy">${esc(summary.followup)}</div></div></div>
              <div class="summary-line"><span class="summary-index">3</span><div><div class="summary-title">最近待辦</div><div class="summary-copy">${esc(summary.tomorrowPriority)}</div></div></div>
            </div>
            <div class="form-field mt-16"><label class="form-label" for="summary-teacher-note">給主管補充（選填）</label><textarea id="summary-teacher-note" name="teacherNote" placeholder="補充紀錄未呈現的背景或需要主管協助的事項。">${esc(state.daily.summary.teacherNote || '')}</textarea></div>
            <div class="flex gap-8 mt-16"><button type="button" class="btn btn-primary" data-action="submit-daily" ${blockers.length || submitting ? 'disabled' : ''}>${icon(submitting || state.daily.submittedAt ? 'refresh-cw' : 'send', 16)}${submitting ? '正在送出' : state.daily.submittedAt ? '更新送出' : '確認送出'}</button></div>
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
        ${blockers.length ? `<section class="panel"><div class="panel-head"><div><div class="panel-title">${icon('circle-alert')}尚待完成</div></div></div><div class="panel-body"><div class="risk-list">${blockers.map(item => `<div class="risk-row"><span class="risk-level"></span><div><div class="risk-title">${esc(item)}</div></div></div>`).join('')}</div></div></section>` : `<div class="notice-band success">${icon('badge-check', 20)}<div><div class="notice-title">可以送出</div></div></div>`}
      </aside>
    </div>`;
  }

  function activityGuide(type) {
    return ACTIVITY_GUIDES[type] || ACTIVITY_GUIDES.tutoring;
  }

  function renderActivityTypeExamples(type) {
    const guide = activityGuide(type);
    const feedback = activityPrepFeedbackExamples(type);
    const examples = activityNeedsPrepSource(type)
      ? [['教案／教材有效處', feedback.strengths], ['孩子共鳴環節', feedback.resonance], ['下次要更新什麼', feedback.changes]]
      : [['目標', guide.objective[2]], ['做法', guide.action[2]], ['結果', guide.result[2]], ['問題', guide.issue[2]], ['下一步', guide.next[2]]];
    return `<div class="activity-example-head"><span class="activity-icon ${ACTIVITY_TYPES[type]?.tone || ''}">${icon(ACTIVITY_TYPES[type]?.icon || 'clipboard-list', 18)}</span><div><strong>${esc(ACTIVITY_TYPES[type]?.label || '工作紀錄')}怎麼寫</strong><small>只填本類型真正需要的內容</small></div></div><div class="activity-example-grid">${examples.map(([label, example]) => `<div><span>${label}</span><p>${esc(example)}</p></div>`).join('')}</div>`;
  }

  function renderTeacherGuide() {
    const selectedConfig = ACTIVITY_TYPES[state.ui.guideType];
    const selectedType = selectedConfig && selectedConfig.selectable !== false && state.ui.guideType !== 'lessonprep' ? state.ui.guideType : 'tutoring';
    const config = ACTIVITY_TYPES[selectedType];
    const guide = activityGuide(selectedType);
    const purpose = {
      tutoring: '記錄國語、數學、英文、自然、社會等學科內課業指導與個別補救。',
      project: '記錄專案任務、選修活動、老師的引導方法與學生每堂課的實際進度。',
      robotics: '記錄核心原理、講解方式、程式引導、遊戲或改造設計，以及學生的測試結果。',
      portfolio: '記錄作品版本、反思與學生學習變化。',
      sel: '記錄社會情緒能力、演練與可觀察行為，不做人格判斷。',
      classroom: '記錄秩序、流程、合作與自主管理的具體改變。',
    }[selectedType];
    const prepExamples = activityPrepFeedbackExamples(selectedType);
    const fieldExamples = activityNeedsPrepSource(selectedType) ? [
      ['這份教案／教材哪裡有效', '寫出實際有效的教學設計、教材位置與學生反應。', prepExamples.strengths],
      ['孩子對哪個教案環節最有反應', '記錄最投入、主動回應或理解明顯改變的環節。', prepExamples.resonance],
      ['這份教案／教材要更新什麼', '寫出下次要調整的講法、流程或教材。', prepExamples.changes],
    ] : [guide.objective, guide.action, guide.result, guide.issue, guide.next];
    const dailySteps = [
      ['1', '學科內', '從學科內入口新增；安親課業指導每天至少一筆，班級經營有實際事件時再記。'],
      ['2', '學科外（如有則填）', '當天有特色課程才從學科外入口新增；選取備課檔案後，只填課後備課回饋與成果證據。'],
      ['3', '選取備課檔案並補成果', '選擇本堂課使用的課程名稱；班級經營不需要備課檔案。'],
      ['4', '完成學生、親師與班務', '有狀況就留下追蹤；無重要親師事項也要親自在門口完成交接；值日班務四項各拍一張。'],
      ['5', '確認後送主管', '送出後仍可編輯；只要修改就會退回待送出，重新確認後再送主管。'],
    ];
    return `<div class="page guide-page">
      ${pageHead('填寫指南', '說明與範例集中管理，不占用正式填寫畫面', `<button type="button" class="btn btn-primary" data-action="navigate" data-route="today">${icon('clipboard-pen-line', 16)}<span>開始今天的紀錄</span></button>`)}
      <section class="guide-start-band"><div><span class="guide-kicker">每日工作順序</span><h2>先完成課業輔導，有特色課程再記錄</h2><p>課業輔導每天必填；學科外當天有開課才填，新增後仍須完整留下教學與成果。</p></div><div class="guide-day-flow">${dailySteps.map(([number, title, copy]) => `<div class="guide-day-step"><span>${number}</span><div><strong>${esc(title)}</strong><small>${esc(copy)}</small></div></div>`).join('')}</div></section>
      <div class="notice-band info">${icon('folder-down', 19)}<div><div class="notice-title">每月雲端歸檔</div><div class="notice-copy">到「我的紀錄」選擇匯出月份；系統會依老師、年份與月份命名，並把各日期紀錄及主管對話收進同一份月檔。</div></div></div>
      <div class="notice-band info">${icon('scale', 19)}<div><div class="notice-title">隨時查閱評分標準</div><div class="notice-copy">手機請從底部「更多」進入；電腦請從左側選單開啟。正式填寫頁只保留工作欄位，不重複放制度說明。</div></div></div>

      <section class="panel guide-section">
        <div class="panel-head"><div><div class="panel-title">${icon('list-tree')}工作類型與欄位怎麼寫</div><div class="panel-subtitle">課程只填三項課後備課回饋；班級經營保留事件紀錄</div></div></div>
        <div class="panel-body">
          <div class="guide-type-picker">${Object.entries(ACTIVITY_TYPES).filter(([key, item]) => key !== 'lessonprep' && item.selectable !== false).map(([key, item]) => `<button type="button" class="guide-type-button ${selectedType === key ? 'active' : ''}" data-action="set-guide-type" data-type="${key}">${icon(item.icon, 16)}<span>${esc(item.label)}</span></button>`).join('')}</div>
          <div class="guide-selected-head"><span class="activity-icon ${config.tone}">${icon(config.icon, 21)}</span><div><strong>${esc(config.label)}</strong><p>${esc(purpose)}</p></div><span class="badge ${activityTrackMeta(config.track).tone}">${esc(activityTrackMeta(config.track).shortLabel)}</span></div>
          <div class="guide-specific-fields"><strong>這種類型要填</strong><div>${activityNeedsPrepSource(selectedType) ? '<span>選擇備課檔案，再完成三項課後備課回饋</span>' : '<span>班級經營事件、關聯學生、實際做法、結果與下一步</span>'}</div></div>
          <div class="guide-field-list">${fieldExamples.map((field, index) => `<article><span class="guide-field-number">${index + 1}</span><div><strong>${esc(field[0])}</strong><small>${esc(field[1])}</small><p><span>範例</span>${esc(field[2])}</p></div></article>`).join('')}</div>
        </div>
      </section>

      <div class="guide-split">
        <section class="panel guide-section"><div class="panel-head"><div><div class="panel-title">${icon('package-check')}備課檔案怎麼用</div><div class="panel-subtitle">先記錄課程，授課當天直接選用</div></div></div><div class="panel-body"><div class="guide-source-flow"><div><span>1</span><strong>新增備課檔案</strong><small>選擇課程類型並填寫課程名稱。</small></div><div><span>2</span><strong>上傳教案或教材</strong><small>至少一份，可上傳文件、簡報、照片或備課影片。</small></div><div><span>3</span><strong>授課當天選用</strong><small>儲存後即可使用，不需主管審核。</small></div><div><span>4</span><strong>留下課後回饋</strong><small>記錄有效處、孩子反應與下次調整。</small></div></div><div class="guide-rule">${icon('info', 17)}<span>只有班級經營需要選擇特殊狀況學生；課業指導與學科外課程不顯示關聯學生。</span></div></div></section>
        <section class="panel guide-section"><div class="panel-head"><div><div class="panel-title">${icon('scan-search')}什麼才算可判讀證據</div><div class="panel-subtitle">主管要能直接看懂資料呈現的成果</div></div></div><div class="panel-body"><div class="guide-evidence-compare"><div><span class="badge yellow">授課前</span><strong>備課檔案</strong><p>記錄課程名稱，並保留至少一份教案、任務單、簡報或教材。</p></div><div><span class="badge blue">授課後</span><strong>成果證據</strong><p>學生作品、訂正前後、測試數據或行為變化；避免只有看不出成果的廣角照。</p></div></div><div class="guide-rule">${icon('scan-line', 17)}<span>工作結果由系統帶入，老師不需重寫，也不必另外說明主管要看哪裡。</span></div><div class="guide-rule">${icon('images', 17)}<span>可從相簿一次選多張；選錯照片可按右上角叉號移除，照片重點標記為選用功能。</span></div><div class="guide-rule">${icon('badge-check', 17)}<span>主管會依成果內容的完整性、清楚度與可判讀性進行判斷與評分。</span></div><div class="guide-rule">${icon('eye', 17)}<span>工作頁的「課程與工作證據標準」第一次完整顯示；完成第一份成果證據後預設收合，可隨時按「查看證據標準」再次開啟。</span></div></div></section>
      </div>

      <div class="notice-band info">${icon('split', 19)}<div><div class="notice-title">備課與授課紀錄分工</div><div class="notice-copy">備課檔案記錄課程並保留至少一份教案或教材；授課當天只需留下課後回饋與成果證據。</div></div></div>
    </div>`;
  }

  async function loadTeacherEvaluation(month = 'latest') {
    const session = legacySession();
    if (!session || session.role !== 'teacher' || !sameReviewIdentity(session.nickname, state.context.teacher)) {
      integrationRuntime.evaluationStatus = 'restricted';
      integrationRuntime.evaluationMessage = '請先登入目前老師的正式帳號';
      renderApp();
      return;
    }
    integrationRuntime.evaluationStatus = 'loading';
    if (month !== 'latest') integrationRuntime.evaluationMonth = month;
    integrationRuntime.evaluationMessage = '正在讀取主管評核';
    renderApp();
    const result = await API.getEval({ nickname: session.nickname, year_month: month, viewer: session.nickname });
    integrationRuntime.evaluationStatus = result?.ok ? 'saved' : 'error';
    integrationRuntime.evaluation = result?.ok ? (result.eval || null) : null;
    integrationRuntime.evaluationMonths = result?.ok && Array.isArray(result.months) ? result.months : [];
    integrationRuntime.evaluationMonth = result?.ok
      ? (result.eval?.year_month || result.selected_month || (month === 'latest' ? state.daily.date.slice(0, 7) : month))
      : (month === 'latest' ? state.daily.date.slice(0, 7) : month);
    integrationRuntime.evaluationMessage = result?.ok ? (result.eval ? '已讀取主管評核' : '這個月份尚未公布評核') : (result?.error || '評核讀取失敗');
    renderApp();
  }

  function renderTeacherEvaluation() {
    const month = integrationRuntime.evaluationMonth || state.daily.date.slice(0, 7);
    const evaluation = integrationRuntime.evaluation;
    const loading = integrationRuntime.evaluationStatus === 'loading';
    const months = integrationRuntime.evaluationMonths || [];
    const monthOptions = months.map(value => `<option value="${esc(value)}" ${value === month ? 'selected' : ''}>${esc(value)}</option>`).join('');
    const actions = months.length > 1
      ? `<form class="month-picker" data-form="evaluation-history"><label><span>其他月份</span><select name="month" aria-label="其他評核月份">${monthOptions}</select></label><button type="submit" class="btn btn-small">確認查看</button></form>`
      : '';
    if (loading) return `<div class="page">${pageHead('主管評核', '查看每月評分與主管建議', actions)}<section class="panel"><div class="panel-body"><div class="integration-empty-state">${icon('loader-circle', 24)}<div><strong>正在讀取</strong></div></div></div></section></div>`;
    if (!evaluation) return `<div class="page">${pageHead('主管評核', '查看每月評分與主管建議', actions)}<section class="panel"><div class="panel-body"><div class="empty-state"><div><div class="empty-icon">${icon('clipboard-list', 22)}</div><div class="empty-title">${esc(integrationRuntime.evaluationMessage || '這個月份尚未公布評核')}</div></div></div></div></section></div>`;
    const granted = ![false, 'FALSE', 'false'].includes(evaluation.bonus_granted);
    const scoreValues = ANQIN_KPI_STANDARDS.map((category, index) => Number(evaluation[`score_k${index + 1}`] || 0));
    const invalidScores = scoreValues.map((score, index) => !Number.isFinite(score) || score < 0 || score > ANQIN_KPI_STANDARDS[index].points);
    const hasInvalidScores = invalidScores.some(Boolean);
    const scoreRows = ANQIN_KPI_STANDARDS.map((category, index) => {
      const score = scoreValues[index];
      return `<div class="evaluation-score-row"><div class="evaluation-score-category">${icon(category.icon, 16)}<strong>${esc(category.name)}</strong></div><div class="evaluation-score-value">${invalidScores[index] ? statusBadge('待主管確認', 'red') : `<strong>${score}</strong><span>/ ${category.points}</span>`}</div></div>`;
    }).join('');
    const managerComment = String(evaluation.manager_comment || '').trim();
    const interviewNotes = String(evaluation.interview_notes || '').trim();
    return `<div class="page evaluation-page">
      ${pageHead('主管評核', `${esc(month)} · ${state.context.teacher}`, actions)}
      ${hasInvalidScores ? `<div class="notice-band danger">${icon('triangle-alert', 19)}<div><div class="notice-title">這份評核需要主管重新確認</div><div class="notice-copy">部分舊資料超過新版項目配分，系統暫不顯示錯誤分數與總分。</div></div></div>` : ''}
      <div class="status-strip"><div class="status-cell"><div class="status-label">KPI 總分</div><div class="status-value">${hasInvalidScores ? '待確認' : `${Number(evaluation.total_score || 0)} / 100`}</div></div><div class="status-cell"><div class="status-label">等第</div><div class="status-value status-value-badge">${statusBadge(hasInvalidScores ? '待確認' : (evaluation.grade || '—'), hasInvalidScores ? 'red' : 'blue')}</div></div><div class="status-cell"><div class="status-label">績效獎金</div><div class="status-value">${hasInvalidScores ? '待確認' : granted ? `NT$${Number(evaluation.bonus || 0).toLocaleString('zh-TW')}` : '未核發'}</div></div><div class="status-cell"><div class="status-label">評核狀態</div><div class="status-value status-value-badge">${statusBadge(hasInvalidScores ? '需修正' : '已完成', hasInvalidScores ? 'red' : 'green')}</div></div></div>
      <div class="content-grid mt-16"><section class="panel"><div class="panel-head"><div><div class="panel-title">${icon('chart-no-axes-column-increasing')}各項評分</div></div></div><div class="panel-body flush"><div class="evaluation-score-list">${scoreRows}</div></div></section><aside class="stack"><section class="panel"><div class="panel-head"><div><div class="panel-title">${icon('message-square-text')}主管建議</div></div></div><div class="panel-body"><p class="text-small">${nl2br(managerComment || '主管未填寫其他建議。')}</p>${interviewNotes ? `<div class="section-divider"></div><h3 class="section-title">面談紀錄</h3><p class="text-small">${nl2br(interviewNotes)}</p>` : ''}</div></section>${Number(evaluation.makeup_penalty || 0) || Number(evaluation.late_penalty || 0) ? `<section class="panel"><div class="panel-head"><div><div class="panel-title">${icon('circle-alert')}扣分紀錄</div></div></div><div class="panel-body"><div class="metadata-list">${Number(evaluation.makeup_penalty || 0) ? `<div class="metadata-row"><div class="metadata-label">補繳</div><div class="metadata-value">${Number(evaluation.makeup_count || 0)} 次，扣 ${Number(evaluation.makeup_penalty)} 分</div></div>` : ''}${Number(evaluation.late_penalty || 0) ? `<div class="metadata-row"><div class="metadata-label">遲到</div><div class="metadata-value">${Number(evaluation.score_late_count || 0)} 次，扣 ${Number(evaluation.late_penalty)} 分</div></div>` : ''}</div></div></section>` : ''}</aside></div>
    </div>`;
  }

  function managerEvaluationTeachers() {
    return teachingStaff().filter(person => person.role === 'teacher');
  }

  function evaluationTier(total) {
    const score = Number(total || 0);
    return ANQIN_BONUS_TIERS.find(item => {
      const match = String(item.range).match(/(\d+)[–-](\d+)/);
      if (match) return score >= Number(match[1]) && score <= Number(match[2]);
      return String(item.range).includes('≤') && score <= Number(String(item.range).replace(/\D/g, ''));
    }) || ANQIN_BONUS_TIERS[ANQIN_BONUS_TIERS.length - 1];
  }

  async function loadManagerEvaluation(teacher = integrationRuntime.managerEvaluationTeacher, month = integrationRuntime.managerEvaluationMonth) {
    const session = legacySession();
    const teachers = managerEvaluationTeachers();
    const selectedTeacher = teacher || teachers[0]?.nickname || '';
    const selectedMonth = month || state.daily.date.slice(0, 7);
    const person = teachers.find(item => item.nickname === selectedTeacher);
    if (!session || !['manager', 'admin'].includes(session.role) || !person || !managerScopeMatches(person.nickname, person.department)) {
      integrationRuntime.managerEvaluationStatus = 'error';
      integrationRuntime.managerEvaluationMessage = person ? '沒有評核這位老師的權限' : '目前沒有可評核的老師';
      integrationRuntime.managerEvaluationEvidence = null;
      integrationRuntime.managerEvaluation = null;
      renderApp();
      return;
    }
    integrationRuntime.managerEvaluationTeacher = selectedTeacher;
    integrationRuntime.managerEvaluationMonth = selectedMonth;
    integrationRuntime.managerEvaluationStatus = 'loading';
    integrationRuntime.managerEvaluationMessage = '正在彙整評核資料';
    renderApp();
    const nickname = backendNickname(selectedTeacher);
    const [evidenceResult, evaluationResult] = await Promise.all([
      API.getEvalEvidence(nickname, selectedMonth),
      API.getEval({ nickname, year_month: selectedMonth, viewer: session.nickname }),
    ]);
    if (!evidenceResult?.ok || !evaluationResult?.ok) {
      integrationRuntime.managerEvaluationStatus = 'error';
      integrationRuntime.managerEvaluationMessage = evidenceResult?.error || evaluationResult?.error || '評核資料讀取失敗';
      integrationRuntime.managerEvaluationEvidence = null;
      integrationRuntime.managerEvaluation = null;
      renderApp();
      return;
    }
    integrationRuntime.managerEvaluationStatus = 'saved';
    integrationRuntime.managerEvaluationMessage = evaluationResult.eval ? '已載入既有評核' : '尚未建立本月評核';
    integrationRuntime.managerEvaluationEvidence = evidenceResult;
    integrationRuntime.managerEvaluation = evaluationResult.eval || null;
    renderApp();
  }

  async function loadLatestManagerEvaluation() {
    const session = legacySession();
    const teachers = managerEvaluationTeachers();
    if (!session || !['manager', 'admin'].includes(session.role) || !teachers.length) {
      await loadManagerEvaluation();
      return;
    }
    const result = await API.listEvals({ role: 'teacher', viewer: session.nickname });
    const teacherMap = new Map(teachers.map(person => [normalizeReviewNickname(backendNickname(person.nickname)), person.nickname]));
    const latest = (result?.ok && Array.isArray(result.evals) ? result.evals : [])
      .filter(item => teacherMap.has(normalizeReviewNickname(item.nickname)))
      .sort((a, b) => {
        const monthCompare = String(b.year_month || '').localeCompare(String(a.year_month || ''));
        if (monthCompare) return monthCompare;
        return String(b.updated_at || b.created_at || '').localeCompare(String(a.updated_at || a.created_at || ''));
      })[0];
    if (latest) {
      await loadManagerEvaluation(teacherMap.get(normalizeReviewNickname(latest.nickname)), latest.year_month);
      return;
    }
    await loadManagerEvaluation(teachers[0].nickname, state.daily.date.slice(0, 7));
  }

  function managerEvaluationValues() {
    const evaluation = integrationRuntime.managerEvaluation;
    const suggestion = integrationRuntime.managerEvaluationEvidence?.suggestion || {};
    return ANQIN_KPI_STANDARDS.map((category, index) => {
      const stored = evaluation?.[`score_k${index + 1}`];
      const score = stored !== undefined && stored !== null && stored !== '' ? Number(stored) : Number(suggestion[`k${index + 1}`] || 0);
      return Number.isFinite(score) ? score : 0;
    });
  }

  function renderManagerEvaluations() {
    const teachers = managerEvaluationTeachers();
    const selectedTeacher = integrationRuntime.managerEvaluationTeacher || teachers[0]?.nickname || '';
    const selectedMonth = integrationRuntime.managerEvaluationMonth || state.daily.date.slice(0, 7);
    const loading = integrationRuntime.managerEvaluationStatus === 'loading';
    const evidence = integrationRuntime.managerEvaluationEvidence;
    const evaluation = integrationRuntime.managerEvaluation;
    const teacherOptions = teachers.map(person => `<option value="${esc(person.nickname)}" ${selectedTeacher === person.nickname ? 'selected' : ''}>${esc(person.nickname)} · ${esc(person.department)}</option>`).join('');
    const actions = `<form class="month-picker" data-form="manager-evaluation-selection"><label><span>老師</span><select name="teacher" aria-label="評核老師">${teacherOptions}</select></label><label><span>月份</span><input name="month" type="month" value="${esc(selectedMonth)}" aria-label="評核月份"></label><button type="submit" class="btn btn-small">確認查看</button></form>`;
    if (!teachers.length) return `<div class="page manager-evaluation-page">${pageHead('月度評核', '依紀錄、證據、觀課與工作表現完成評分', '')}<section class="panel"><div class="panel-body">${renderEmpty('user-x', '目前沒有可評核的老師', '請先到人員管理完成老師帳號與部門設定。')}</div></section></div>`;
    if (loading) return `<div class="page manager-evaluation-page">${pageHead('月度評核', `${esc(selectedMonth)} · ${esc(selectedTeacher)}`, actions)}<section class="panel"><div class="panel-body"><div class="integration-empty-state">${icon('loader-circle', 24)}<div><strong>正在彙整評核資料</strong></div></div></div></section></div>`;
    if (!evidence) return `<div class="page manager-evaluation-page">${pageHead('月度評核', `${esc(selectedMonth)} · ${esc(selectedTeacher)}`, actions)}<section class="panel"><div class="panel-body"><div class="empty-state"><div><div class="empty-icon">${icon('cloud-alert', 22)}</div><div class="empty-title">${esc(integrationRuntime.managerEvaluationMessage || '尚未讀取評核資料')}</div><button type="button" class="btn mt-12" data-action="reload-manager-evaluation">重新讀取</button></div></div></div></section></div>`;
    const values = managerEvaluationValues();
    const invalid = values.some((score, index) => score < 0 || score > ANQIN_KPI_STANDARDS[index].points);
    const makeupPenalty = Number(evidence.summary?.makeup_count || 0) * 2;
    const total = Math.max(0, values.reduce((sum, score) => sum + score, 0) - makeupPenalty);
    const tier = evaluationTier(total);
    const granted = ![false, 'FALSE', 'false'].includes(evaluation?.bonus_granted);
    const status = evaluation?.status === 'submitted' ? ['已完成', 'green'] : evaluation ? ['草稿', 'yellow'] : ['未建立', 'outline'];
    const scoreInputs = ANQIN_KPI_STANDARDS.map((category, index) => {
      const evidenceCount = (evidence.evidence_by_kpi?.[index + 1] || []).length;
      return `<div class="manager-eval-score-row"><div class="manager-eval-score-copy"><strong>${esc(category.name)}</strong><small>${category.points} 分 · ${evidenceCount} 件直接證據</small></div><label class="manager-eval-score-input"><span class="sr-only">${esc(category.name)}分數</span><input type="number" name="score_k${index + 1}" min="0" max="${category.points}" step="1" value="${values[index]}" data-input="manager-eval-score" required><span>/ ${category.points}</span></label></div>`;
    }).join('');
    const summary = evidence.summary || {};
    return `<div class="page manager-evaluation-page">
      ${pageHead('月度評核', `${esc(selectedMonth)} · ${esc(selectedTeacher)}`, actions)}
      ${invalid ? `<div class="notice-band danger">${icon('triangle-alert', 19)}<div><div class="notice-title">既有分數超過新版配分</div><div class="notice-copy">請逐項修正後再完成評核；系統不會儲存超過上限的分數。</div></div></div>` : ''}
      <div class="status-strip"><div class="status-cell"><div class="status-label">日報</div><div class="status-value">${Number(summary.log_count || 0)}</div></div><div class="status-cell"><div class="status-label">成果證據</div><div class="status-value">${Number(summary.evidence_count || 0)}</div></div><div class="status-cell"><div class="status-label">主管回饋</div><div class="status-value">${Number(summary.feedback_count || 0)}</div></div><div class="status-cell"><div class="status-label">觀課／巡班</div><div class="status-value">${Number(summary.observation_count || 0)}</div></div></div>
      <form id="manager-evaluation-form" class="content-grid wide-aside">
        <section class="panel"><div class="panel-head"><div><div class="panel-title">${icon('sliders-horizontal')}六項 KPI 評分</div><div class="panel-subtitle">各項分數受正式配分上限限制</div></div>${statusBadge(status[0], status[1])}</div><div class="panel-body"><div class="manager-eval-score-list">${scoreInputs}</div>${makeupPenalty ? `<div class="notice-band danger mt-16">${icon('clock-alert', 19)}<div><div class="notice-title">本月補繳扣 ${makeupPenalty} 分</div><div class="notice-copy">依雲端日誌的補繳紀錄自動計算。</div></div></div>` : ''}<div class="section-divider"></div><div class="form-grid"><div class="form-field span-2"><label class="form-label" for="manager-eval-comment">主管評語 <span class="required">*</span></label><textarea id="manager-eval-comment" name="manager_comment" placeholder="寫出本月具體優點、需要調整的地方與下一步。">${esc(evaluation?.manager_comment || '')}</textarea><div class="field-hint">完成評核時至少 8 字；儲存草稿可稍後補寫。</div></div><div class="form-field span-2"><label class="form-label" for="manager-eval-interview">面談紀錄（選填）</label><textarea id="manager-eval-interview" name="interview_notes" placeholder="面談日期、共識與下月調整。">${esc(evaluation?.interview_notes || '')}</textarea></div><div class="form-field"><label class="form-label" for="manager-eval-late">本月遲到次數</label><input id="manager-eval-late" type="number" name="score_late_count" min="0" step="1" value="${Number(evaluation?.score_late_count || 0)}"></div><div class="form-field"><label class="choice-chip"><input type="checkbox" name="bonus_granted" ${granted ? 'checked' : ''}>核發級距獎金</label></div></div></div></section>
        <aside class="stack"><section class="panel"><div class="panel-head"><div><div class="panel-title">${icon('calculator')}評核結果</div></div></div><div class="panel-body"><div class="manager-eval-total"><span>目前 KPI</span><strong id="manager-eval-total">${invalid ? '待修正' : total}</strong><small id="manager-eval-tier">${invalid ? '請修正超出上限的分數' : `${tier.grade} · ${tier.bonus}`}</small></div><div class="flex gap-8 flex-wrap mt-16"><button type="button" class="btn" data-action="save-manager-evaluation" data-status="draft">儲存草稿</button><button type="button" class="btn btn-primary" data-action="save-manager-evaluation" data-status="submitted">完成評核</button></div></div></section><section class="panel"><div class="panel-head"><div><div class="panel-title">${icon('database')}評分依據</div></div></div><div class="panel-body"><div class="check-list">${ANQIN_KPI_STANDARDS.map((category, index) => `<div class="check-item ${(evidence.evidence_by_kpi?.[index + 1] || []).length ? 'done' : 'pending'}"><span class="check-icon">${icon((evidence.evidence_by_kpi?.[index + 1] || []).length ? 'check' : 'minus', 12)}</span><span>${esc(category.name)}</span><span class="badge outline">${(evidence.evidence_by_kpi?.[index + 1] || []).length} 件</span></div>`).join('')}</div><button type="button" class="btn btn-small mt-16" data-action="navigate" data-route="evidence">開啟證據中心</button></div></section></aside>
      </form>
    </div>`;
  }

  function refreshManagerEvaluationTotal() {
    const form = $('#manager-evaluation-form');
    if (!form) return;
    const values = ANQIN_KPI_STANDARDS.map((category, index) => Number(form.elements[`score_k${index + 1}`]?.value));
    const invalid = values.some((score, index) => !Number.isFinite(score) || score < 0 || score > ANQIN_KPI_STANDARDS[index].points);
    const penalty = Number(integrationRuntime.managerEvaluationEvidence?.summary?.makeup_count || 0) * 2;
    const total = Math.max(0, values.reduce((sum, score) => sum + (Number.isFinite(score) ? score : 0), 0) - penalty);
    const tier = evaluationTier(total);
    const totalNode = $('#manager-eval-total');
    const tierNode = $('#manager-eval-tier');
    if (totalNode) totalNode.textContent = invalid ? '待修正' : String(total);
    if (tierNode) tierNode.textContent = invalid ? '請修正超出上限的分數' : `${tier.grade} · ${tier.bonus}`;
  }

  async function saveManagerEvaluation(status) {
    const form = $('#manager-evaluation-form');
    const session = legacySession();
    if (!form || !session || !['manager', 'admin'].includes(session.role)) return;
    if (!form.reportValidity()) return;
    const data = new FormData(form);
    const comment = String(data.get('manager_comment') || '').trim();
    if (status === 'submitted' && comment.length < 8) {
      toast('完成評核前，請寫至少 8 字的具體主管評語', 'danger');
      $('#manager-eval-comment')?.focus();
      return;
    }
    const payload = {
      nickname: backendNickname(integrationRuntime.managerEvaluationTeacher),
      year_month: integrationRuntime.managerEvaluationMonth,
      evaluator: session.nickname,
      manager_comment: comment,
      interview_notes: String(data.get('interview_notes') || '').trim(),
      score_late_count: Math.max(0, Math.floor(Number(data.get('score_late_count') || 0))),
      bonus_granted: Boolean(data.get('bonus_granted')),
      status,
    };
    for (let index = 0; index < ANQIN_KPI_STANDARDS.length; index += 1) {
      const score = Number(data.get(`score_k${index + 1}`));
      const max = ANQIN_KPI_STANDARDS[index].points;
      if (!Number.isFinite(score) || score < 0 || score > max) {
        toast(`${ANQIN_KPI_STANDARDS[index].name}需介於 0–${max} 分`, 'danger');
        return;
      }
      payload[`score_k${index + 1}`] = score;
    }
    const result = await API.saveEval(payload);
    if (!result?.ok) {
      toast(`評核未儲存：${result?.error || '請稍後重試'}`, 'danger');
      return;
    }
    await loadManagerEvaluation(integrationRuntime.managerEvaluationTeacher, integrationRuntime.managerEvaluationMonth);
    toast(status === 'submitted' ? '月度評核已完成，老師可查看結果' : '評核草稿已儲存', 'success');
  }

  function renderScoringStandards() {
    const totalPoints = ANQIN_KPI_STANDARDS.reduce((sum, category) => sum + category.points, 0);
    const architectureRows = ANQIN_KPI_STANDARDS.map(category =>
      '<tr><td><div class="kpi-table-category">' + icon(category.icon, 16) + '<strong>' + esc(category.name) + '</strong></div></td><td><strong>' + category.points + '</strong></td><td>' + esc(category.position) + '</td></tr>'
    ).join('');
    const categoryCards = ANQIN_KPI_STANDARDS.map((category, categoryIndex) =>
      '<article class="kpi-standard-card">' +
        '<div class="kpi-standard-head"><span class="kpi-standard-icon">' + icon(category.icon, 19) + '</span><div><span class="kpi-standard-number">' + (categoryIndex + 1) + '</span><h3>' + esc(category.name) + '</h3><p>' + esc(category.position) + '</p></div><strong class="kpi-standard-points">' + category.points + ' 分</strong></div>' +
        '<div class="kpi-standard-items">' + category.items.map(item => '<div class="kpi-standard-item"><span>' + esc(item[0]) + '</span><strong>' + item[1] + ' 分</strong></div>').join('') + '</div>' +
        '<div class="kpi-check-method">' + icon('search-check', 15) + '<span><strong>查核方式</strong>' + esc(category.check) + '</span></div>' +
      '</article>'
    ).join('');
    const bonusRows = ANQIN_BONUS_TIERS.map(tier =>
      '<tr><td><strong>' + esc(tier.range) + '</strong></td><td>' + statusBadge(tier.grade, tier.tone) + '</td><td>' + esc(tier.bonus) + '</td></tr>'
    ).join('');
    const process = [
      ['1', '教師自評', '對照當月工作與佐證先做自我檢視。'],
      ['2', '主管評分', '依紀錄、觀課、巡班與實際成果綜合判斷。'],
      ['3', '個別成長面談', '10–15 分鐘看見優點，並確認下一步調整方向。'],
      ['4', '核發當月獎金', '依最終 KPI 總分對應級距核發。'],
    ];
    const processRows = process.map(item =>
      '<div><span>' + item[0] + '</span><div><strong>' + esc(item[1]) + '</strong><small>' + esc(item[2]) + '</small></div></div>'
    ).join('');
    const evidenceMap = [
      ['課業指導', '課業輔導、學生成果與訂正追蹤'],
      ['專案課程', '備課教案、學科外課程、作品與觀課'],
      ['班級經營', '班級經營紀錄、學生追蹤與巡班觀察'],
      ['親師溝通', '親師聯繫、回饋內容與後續承諾'],
      ['個人態度', '出勤、每日紀錄、交辦事項與備課落實狀況'],
      ['環境整潔', '每日班務逐項照片與主管稽核'],
    ].map(item => '<div><strong>' + esc(item[0]) + '</strong><span>' + esc(item[1]) + '</span></div>').join('');
    return '<div class="page kpi-standards-page">' +
      pageHead('安親部 KPI 評分標準', '115/9 修訂版 · 老師與主管共用的正式查閱頁', '') +
      '<div class="notice-band info">' + icon('scale', 20) + '<div><div class="notice-title">資料完整度不是績效分數</div><div class="notice-copy">系統紀錄只是評分佐證；最終 KPI 由主管依實際成果、觀課、巡班、溝通與工作表現綜合評核。</div></div></div>' +
      '<section class="kpi-overview" aria-label="制度摘要">' +
        '<div><span>KPI 總分</span><strong>' + totalPoints + '</strong><small>每月評核</small></div>' +
        '<div><span>評分類別</span><strong>' + ANQIN_KPI_STANDARDS.length + '</strong><small>六大類別</small></div>' +
        '<div><span>月獎金門檻</span><strong>82</strong><small>82 分起</small></div>' +
        '<div><span>OKR</span><strong>獨立</strong><small>不納入 KPI 100 分</small></div>' +
      '</section>' +
      '<section class="panel kpi-system-panel"><div class="panel-head"><div><div class="panel-title">' + icon('split') + '制度架構</div><div class="panel-subtitle">KPI 與 OKR 分開計算，不重複計分</div></div></div><div class="panel-body"><div class="kpi-dual-track"><div><span class="badge blue">KPI 月考核</span><strong>穩定日常工作品質</strong><p>每月一次，總分 100 分，作為月績效獎金依據。</p></div><div><span class="badge purple">OKR 學期成長</span><strong>推動專業成長與突破</strong><p>以學期為週期獨立評核，採獨立獎金制，不納入 KPI 的 100 分。</p></div></div></div></section>' +
      '<section class="panel mt-16"><div class="panel-head"><div><div class="panel-title">' + icon('table-properties') + '評分架構</div><div class="panel-subtitle">六大類別合計 ' + totalPoints + ' 分</div></div></div><div class="panel-body flush"><div class="table-wrap"><table class="data-table kpi-architecture-table"><thead><tr><th>KPI 項目</th><th>配分</th><th>定位說明</th></tr></thead><tbody>' + architectureRows + '<tr class="kpi-total-row"><td><strong>合計</strong></td><td><strong>' + totalPoints + '</strong></td><td>每月 KPI 總分</td></tr></tbody></table></div></div></section>' +
      '<section class="kpi-detail-section"><div class="kpi-section-heading"><span class="kpi-section-kicker">逐項查閱</span><h2>KPI 各項評分標準</h2><p>每一類都列出評分內容、配分與查核方式。</p></div><div class="kpi-standard-grid">' + categoryCards + '</div></section>' +
      '<div class="content-grid kpi-bottom-grid"><section class="panel"><div class="panel-head"><div><div class="panel-title">' + icon('badge-dollar-sign') + '月績效獎金級距</div><div class="panel-subtitle">KPI 82 分起開始有獎金</div></div></div><div class="panel-body flush"><div class="table-wrap"><table class="data-table"><thead><tr><th>KPI 分數</th><th>評等</th><th>績效獎金</th></tr></thead><tbody>' + bonusRows + '</tbody></table></div></div></section><section class="panel"><div class="panel-head"><div><div class="panel-title">' + icon('list-ordered') + '每月評核流程</div><div class="panel-subtitle">完成評分後才進入獎金核發</div></div></div><div class="panel-body"><div class="kpi-process">' + processRows + '</div></div></section></div>' +
      '<section class="panel mt-16"><div class="panel-head"><div><div class="panel-title">' + icon('database') + '系統資料如何對應評分</div><div class="panel-subtitle">系統幫忙彙整證據，不會自動代替主管下分</div></div></div><div class="panel-body"><div class="kpi-evidence-map">' + evidenceMap + '</div></div></section>' +
      '<section class="kpi-rule-band"><div>' + icon('clock-3', 19) + '<div><strong>出勤紀律</strong><p>當月遲到累計達 3 次（含）以上，自第 3 次起每次額外扣 5 分，或直接降一個獎金等級，系統取較重者。</p></div></div><div>' + icon('shield-alert', 19) + '<div><strong>例外與扣發</strong><p>如有重大教學事故、嚴重違反工作規範、家長投訴經查屬實，或教學品質未達要求，本期 KPI 獎金得延期或取消。</p></div></div></section>' +
      '<p class="kpi-effective-note">KPI 自 115 年 7 月施行；OKR 自 115 年 9 月起生效。未盡事宜由教室管理團隊依實際情形補充公告。</p>' +
    '</div>';
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
    const hint = field.min ? `至少 ${field.min} 字` : '';
    return `<div class="${wrapperClass}"><label class="form-label" for="${fieldId}">${esc(field.label)} <span class="required">*</span></label>${control}${hint ? `<div class="field-hint">${esc(hint)}</div>` : ''}</div>`;
  }

  function renderActivitySpecificFields(type, details = {}) {
    if (activityNeedsPrepSource(type)) return '';
    const config = ACTIVITY_TYPES[type] || ACTIVITY_TYPES.tutoring;
    const schema = activityDetailSchema(type);
    if (!schema.length) return '';
    const values = { ...activityDetailDefaults(type), ...details };
    const sectionTitle = type === 'project' ? '專案／選修課程資料' : `${config.label}內容`;
    return `<section class="activity-specific-block">
      <div class="activity-specific-head"><span class="activity-icon ${config.tone}">${icon(config.icon, 18)}</span><div><strong>${esc(sectionTitle)}</strong></div></div>
      <div class="form-grid">${schema.map(field => renderActivityDetailControl(field, values[field.key] || '', type)).join('')}</div>
    </section>`;
  }

  function renderActivityTrackIndicator(type) {
    const meta = activityTrackMeta(activityTrack(type));
    const requirementCopy = type === 'tutoring'
      ? '學科內紀錄'
      : type === 'classroom'
        ? '有特殊班級事件時記錄'
        : activityTrack(type) === 'enrichment'
          ? '學科外紀錄'
          : '只保留歷史資料，不提供新增';
    return `<div class="activity-track-indicator ${activityTrack(type)}">${icon(meta.icon, 17)}<div><strong>${esc(meta.label)}</strong><small>${esc(requirementCopy)}</small></div></div>`;
  }

  function activityTypeOptionLabel(type, config) {
    if (type === 'tutoring') return config.label;
    if (type === 'classroom') return `${config.label}（有事件再記）`;
    return config.label;
  }

  function selectableActivityTypes(track, selectedType = '') {
    return Object.entries(ACTIVITY_TYPES).filter(([key, config]) => key !== 'lessonprep' && config.track === track && (config.selectable !== false || key === selectedType));
  }

  function renderActivityTypeOptions(selectedType, formTrack = activityTrack(selectedType)) {
    return selectableActivityTypes(formTrack, selectedType).map(([key, config]) => `<option value="${key}" ${selectedType === key ? 'selected' : ''}>${esc(activityTypeOptionLabel(key, config))}</option>`).join('');
  }

  function renderPlanLinkStatus(planId, type) {
    const config = ACTIVITY_TYPES[type] || ACTIVITY_TYPES.tutoring;
    const plan = planById(planId);
    if (!plan) {
      const optionalTitle = type === 'lessonprep' ? '教案內容與教材尚未完成' : '此類工作可選擇關聯教學設計';
    const optionalCopy = type === 'lessonprep' ? '可先儲存備課檔案；完成課程流程、檢核方式與至少一份正式教材後，即可供授課紀錄選用。' : '若本次是延續既有內容，可在此關聯。';
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
    const guideCopy = type === 'lessonprep' ? '課程流程、檢核與正式教材集中在這裡完成' : '教案內容與教材';
    return `<div id="activity-plan-wrap" class="form-field span-2"><input id="activity-plan" type="hidden" name="planId" value="${esc(planId)}"><div class="plan-source-guide">${icon('notebook-tabs', 19)}<div>${type === 'lessonprep' ? `<small>${guideCopy}</small>` : `<strong>${guideCopy}</strong>`}</div><button type="button" id="edit-selected-plan-button" class="btn btn-small ${plan ? '' : 'btn-primary'}" data-action="${plan ? 'edit-selected-activity-plan' : 'create-activity-plan'}" ${plan ? `data-plan-id="${esc(plan.id)}"` : ''}>${icon(plan ? 'file-pen-line' : 'file-plus-2', 14)}${plan ? '編輯教案內容' : '填寫教案內容'}</button></div><div id="activity-plan-status">${renderPlanLinkStatus(planId, type)}</div></div>`;
  }

  function renderPrepSourceStatus(sourceId, type) {
    const source = prepSourceById(sourceId);
    if (!source) {
      return `<div id="activity-prep-source-status" class="prep-source-empty">${icon('folder-search-2', 21)}<div><strong>尚未選擇備課檔案</strong><small>請選擇這堂課使用的課程名稱。</small></div></div>`;
    }
    const issues = prepSourceReadinessIssues(source, type, activityDraft?.date || state.daily.date);
    const updatedDate = String(source.updatedAt || '').slice(0, 10) || source.date;
    const attachmentCount = (source.prepEvidence || []).length;
    return `<div id="activity-prep-source-status" class="prep-source-card ${issues.length ? 'is-blocked' : 'is-ready'}">
      <div class="prep-source-card-head"><span>${icon(issues.length ? 'circle-alert' : 'badge-check', 19)}</span><div><strong>${esc(source.title)}</strong><small>${formatDate(source.date)} 建立 · ${formatDate(updatedDate)} 更新</small></div>${statusBadge(issues.length ? '尚不可使用' : '已選擇', issues.length ? 'red' : 'green')}</div>
      <div class="prep-source-facts"><span><strong>課程類型</strong>${esc(source.details?.targetCourse || '尚未分類')}</span><span><strong>附件</strong>${attachmentCount ? `${attachmentCount} 份` : '無附件'}</span></div>
      ${source.prep?.summary ? `<div class="prep-source-summary"><strong>上課內容／提醒</strong><p>${esc(source.prep.summary)}</p></div>` : ''}
      ${issues.length ? `<div class="prep-source-issues">${icon('triangle-alert', 16)}<span>${esc(issues.join('、'))}</span></div>` : ''}
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
    return `<section id="activity-preparation-section" class="activity-form-section prep-section linked-prep-section"><div class="activity-section-title"><span>${icon('package-check', 18)}</span><div><strong id="activity-prep-title">本堂使用的備課檔案</strong></div></div><div class="form-field"><label class="form-label" for="activity-prep-source">選擇課程 <span class="required">*</span></label><select id="activity-prep-source" name="prepSourceId" data-change="activity-prep-source" required><option value="">請選擇課程</option>${candidates.map(source => { const issues = prepSourceReadinessIssues(source, type, activityDraft?.date || state.daily.date); const created = formatShortDate(source.date); return `<option value="${source.id}" ${selectedId === source.id ? 'selected' : ''} ${issues.length && selectedId !== source.id ? 'disabled' : ''}>${esc(source.title)} · ${created} 建立${issues.length ? ` · ${issues[0]}` : ''}</option>`; }).join('')}</select></div>${renderPrepSourceStatus(selectedId, type)}</section>`;
  }

  function activityPrepFeedbackExamples(type) {
    return {
      tutoring: {
        strengths: '例：先圈關鍵數字再口述題意，能幫助學生正確判斷除法算式。',
        resonance: '例：學生用積木分組驗證答案時最投入，也願意主動解釋列式原因。',
        changes: '例：下次增加比較題，確認學生不是只靠關鍵字判斷運算。',
      },
      project: {
        strengths: '例：共同範例能讓學生分辨三種成本，角色卡也讓小組分工更清楚。',
        resonance: '例：學生替自己的餐點定價時最投入，會主動比較成本並說明選擇。',
        changes: '例：下次先共同完成一份標準範例，再讓各組獨立定價。',
      },
      robotics: {
        strengths: '例：先看感測數值再修改轉向條件，學生能理解程式與車體反應的關係。',
        resonance: '例：限時循線挑戰最有反應，學生會主動比較不同參數的測試結果。',
        changes: '例：下次把接線檢核移到測試前，並限制每次只調整一個參數。',
      },
      portfolio: {
        strengths: '例：把第一版與改造版並排比較，學生較能說出修改依據與學習變化。',
        resonance: '例：學生挑選最能代表進步的作品時，願意主動說明版本差異。',
        changes: '例：下次先提供反思句型，避免只寫「變好了」而沒有具體證據。',
      },
      sel: {
        strengths: '例：用情境卡演練「我訊息」，學生能把責備句改成感受與需要。',
        resonance: '例：交換角色練習時最有反應，學生能發現同一句話帶來不同感受。',
        changes: '例：下次縮短分享時間並增加兩人演練，避免少數學生等待過久。',
      },
    }[type] || {
      strengths: '寫出有效的教學設計、教材位置與學生反應。',
      resonance: '寫出學生最投入、主動回應或理解明顯改變的環節。',
      changes: '寫出下次要調整的講法、流程或教材；若不用改，也要寫明原因。',
    };
  }

  function renderActivityPrepFeedbackFields(type, feedback = {}) {
    if (!activityNeedsPrepSource(type)) return '<div id="activity-prep-feedback-fields" hidden></div>';
    const examples = activityPrepFeedbackExamples(type);
    return `<div id="activity-prep-feedback-fields" class="prep-feedback-block span-2"><div class="prep-feedback-head">${icon('message-square-heart', 19)}<div><strong>課後備課回饋</strong></div></div><div class="form-grid"><div class="form-field span-2"><label class="form-label" for="activity-prep-strengths">這份教案／教材哪裡有效 <span class="required">*</span></label><textarea id="activity-prep-strengths" name="prepStrengths" minlength="8" placeholder="${esc(examples.strengths || '寫出有效的教學設計、教材位置與學生反應。')}" required>${esc(feedback.strengths || '')}</textarea></div><div class="form-field span-2"><label class="form-label" for="activity-student-resonance">孩子對哪個教案環節最有反應 <span class="required">*</span></label><textarea id="activity-student-resonance" name="studentResonance" minlength="8" placeholder="${esc(examples.resonance || '寫出學生最投入、主動回應或理解明顯改變的環節。')}" required>${esc(feedback.resonance || '')}</textarea></div><div class="form-field span-2"><label class="form-label" for="activity-prep-changes">這份教案／教材要更新什麼 <span class="required">*</span></label><textarea id="activity-prep-changes" name="prepChanges" minlength="8" placeholder="${esc(examples.changes || '寫出下次要調整的講法、流程或教材；若不用改，也要寫明原因。')}" required>${esc(feedback.changes || '')}</textarea></div></div></div>`;
  }

  function renderActivityResultSection(value) {
    if (activityNeedsPrepSource(value.type)) {
      return `<section id="activity-result-section" class="activity-form-section result-section feedback-only-section">${renderActivityPrepFeedbackFields(value.type, value.prepFeedback || {})}</section>`;
    }
    const guide = activityGuide(value.type);
    const copy = activityFormCopy(value.type);
    return `<section id="activity-result-section" class="activity-form-section result-section"><div class="activity-section-title"><span>${icon('scan-search', 18)}</span><div><strong id="activity-result-title">${esc(copy.resultTitle)}</strong></div></div><div class="form-grid">
      <div class="form-field span-2"><label class="form-label" id="activity-objective-label" for="activity-objective">${esc(guide.objective[0])} <span class="required">*</span></label><textarea id="activity-objective" name="objective" placeholder="${esc(guide.objective[1])}" required>${esc(value.objective || '')}</textarea></div>
      <div class="form-field span-2"><label class="form-label" id="activity-action-label" for="activity-action">${esc(guide.action[0])} <span class="required">*</span></label><textarea id="activity-action" name="action" placeholder="${esc(guide.action[1])}" required>${esc(value.action || '')}</textarea></div>
      <div class="form-field span-2"><label class="form-label" id="activity-result-label" for="activity-result">${esc(guide.result[0])} <span class="required">*</span></label><textarea id="activity-result" name="result" placeholder="${esc(guide.result[1])}" required>${esc(value.result || '')}</textarea></div>
      <div class="form-field span-2"><label class="form-label" id="activity-issue-label" for="activity-issue">${esc(guide.issue[0])}</label><textarea id="activity-issue" name="issue" placeholder="${esc(guide.issue[1])}">${esc(value.issue || '')}</textarea></div>
      <div class="form-field span-2"><label class="form-label" id="activity-next-label" for="activity-next">${esc(guide.next[0])} <span class="required">*</span></label><textarea id="activity-next" name="nextAction" placeholder="${esc(guide.next[1])}" required>${esc(value.nextAction || '')}</textarea></div>
      <div class="form-field"><label class="form-label" id="activity-owner-label" for="activity-owner">${esc(copy.ownerLabel)} <span class="required">*</span></label><input id="activity-owner" name="owner" value="${esc(value.owner || state.context.teacher)}" required></div>
      <div class="form-field"><label class="form-label" id="activity-due-label" for="activity-due">${esc(copy.dueLabel)} <span class="required">*</span></label><input id="activity-due" type="date" name="dueDate" value="${esc(value.dueDate || '')}" min="${state.daily.date}" required></div>
    </div></section>`;
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
    const singleCourseName = activityTrack(type) === 'enrichment';
    const classFieldCopy = {
      project: { label: '專案選修課程名稱', placeholder: '例：布拉克餐車計畫' },
      robotics: { label: '機器人／STEAM 課程名稱', placeholder: '例：循線機器人挑戰' },
      portfolio: { label: '學習歷程主題', placeholder: '例：橋梁作品成長紀錄' },
      sel: { label: 'SEL 活動名稱', placeholder: '例：衝突時怎麼說' },
    }[type] || { label: '班級／對象', placeholder: '例：四年級 A 班' };
    const titlePlaceholder = {
      project: '例：菜單成本｜第一版定價',
      robotics: '例：循線機器人｜感測器與轉向',
      portfolio: '例：橋梁作品｜第一次測試與改造',
      sel: '例：衝突處理｜我訊息練習',
      classroom: '例：分組流程｜改善收拾與交接',
    }[type] || '例：數學｜異分母分數加減';
    return isCrossDay ? {
      classLabel: '', classPlaceholder: '', hideClass: true,
      titleLabel: '課程名稱', titlePlaceholder: '例：餐車計畫｜菜單成本教學', hideStudents: true,
      prepTitle: '備課附件', prepSubtitle: '至少加入一份教案或教材', prepBadge: '必填',
      prepSummaryLabel: '備課補充', prepSummaryPlaceholder: '例：第一次接觸成本概念的班級，需先完成共同範例。',
      adjustmentLabel: '使用提醒', adjustmentPlaceholder: '例：混齡班可分為基礎版與進階版學習單。',
      fileTitle: '加入參考資料', fileCopy: '正式授課教材請在上方「教案內容與教材」管理',
      resultTitle: '備課內容', resultSubtitle: '集中整理教案與教材', resultBadge: '備課檔案',
      ownerLabel: '備課老師', dueLabel: '更新日期',
    } : {
      classLabel: classFieldCopy.label, classPlaceholder: classFieldCopy.placeholder, hideClass: singleCourseName,
      titleLabel: singleCourseName ? classFieldCopy.label : '紀錄標題', titlePlaceholder: singleCourseName ? classFieldCopy.placeholder : titlePlaceholder, hideStudents: type !== 'classroom',
      prepTitle: '本堂使用的備課檔案', prepSubtitle: '選擇這堂課使用的課程名稱', prepBadge: '授課前選取',
      prepSummaryLabel: '', prepSummaryPlaceholder: '',
      adjustmentLabel: '', adjustmentPlaceholder: '',
      fileTitle: '', fileCopy: '',
      resultTitle: '課後紀錄與下次調整', resultSubtitle: '寫下實際引導、學生表現、遇到的問題與下次做法；照片或作品請儲存後加入', resultBadge: '課後必填',
      ownerLabel: '負責人', dueLabel: '追蹤日期',
    };
  }

  function renderSimplePrepFiles(items = []) {
    if (!items.length) return '<div class="prep-file-empty">尚無附件；請至少上傳一份可直接使用的教案或教材。</div>';
    return `<div class="prep-file-list">${items.map(item => { const cloudUrl = materialCloudUrl(item); return `<div class="prep-file-row editable" data-prep-id="${esc(item.id)}">${icon('paperclip', 18)}<div class="prep-file-main">${cloudUrl ? `<a class="file-name-link" href="${esc(cloudUrl)}" target="_blank" rel="noopener noreferrer"><strong>${esc(item.fileName)}</strong>${icon('external-link', 13)}</a>` : `<strong>${esc(item.fileName)}</strong>`}<small>${esc(item.size || '')} · ${formatDate(String(item.addedAt || '').slice(0, 10))}</small></div><span class="badge ${cloudUrl ? 'green' : 'red'}">${cloudUrl ? '已歸檔' : '未上傳'}</span><button type="button" class="icon-button" data-action="remove-prep-file" data-id="${esc(item.id)}" aria-label="移除 ${esc(item.fileName)}" title="移除">${icon('x', 15)}</button></div>`; }).join('')}</div>`;
  }

  function renderCoursePrepForm(activity) {
    const value = activity || {
      id: '', type: 'lessonprep', title: '', details: activityDetailDefaults('lessonprep'), planId: '', prep: { summary: '', adjustment: '' }, prepEvidence: [],
    };
    const details = { ...activityDetailDefaults('lessonprep'), ...(value.details || {}) };
    return `<form id="course-prep-form" data-form="course-prep">
      <input type="hidden" name="id" value="${esc(value.id)}">
      <input type="hidden" name="type" value="lessonprep">
      <input id="activity-plan" type="hidden" name="planId" value="${esc(value.planId || '')}">
      <section class="activity-form-section course-prep-file-section">
        <div class="activity-section-title"><span>${icon('folder-open', 18)}</span><div><strong>課程資料</strong><small>只記錄這份備課用於哪門課</small></div></div>
        <div class="form-grid">
          <div class="form-field"><label class="form-label" for="course-prep-type">課程類型 <span class="required">*</span></label><select id="course-prep-type" name="targetCourse" required><option value="">請選擇課程</option>${ACTIVITY_DETAIL_SCHEMAS.lessonprep[0].options.map(option => `<option value="${esc(option)}" ${details.targetCourse === option ? 'selected' : ''}>${esc(option)}</option>`).join('')}</select></div>
          <div class="form-field"><div class="form-label">建立日期</div><div class="course-prep-date">${icon('calendar-days', 16)}${formatDate(value.date || state.daily.date)}</div></div>
          <div class="form-field span-2"><label class="form-label" for="course-prep-title">課程名稱 <span class="required">*</span></label><input id="course-prep-title" name="title" value="${esc(value.title || '')}" placeholder="例：9/1 數學小挑戰" required></div>
          <div class="form-field span-2"><label class="form-label" for="course-prep-note">上課內容或使用提醒（選填）</label><textarea id="course-prep-note" name="prepSummary" placeholder="需要補充時再填寫；沒有可留白。">${esc(value.prep?.summary || '')}</textarea></div>
          <div class="form-field span-2"><div class="form-label">教案或教材附件 <span class="required">*</span></div><label class="file-drop" for="activity-prep-files">${icon('upload-cloud', 21)}<span><strong>加入附件</strong><small>至少一份，可一次選多份；文件保留原檔，單檔上限 25 MB</small></span></label><input class="sr-only" id="activity-prep-files" type="file" multiple data-change="prep-files" accept=".pdf,.ppt,.pptx,.doc,.docx,.xls,.xlsx,.key,image/*,video/*"><div id="prep-file-list">${renderSimplePrepFiles(value.prepEvidence || [])}</div></div>
        </div>
      </section>
    </form>`;
  }

  function renderActivityForm(activity) {
    const value = activity || {
      id: '', type: 'tutoring', title: '', className: '', students: [], details: {}, prepSourceId: '', planId: '', objective: '', action: '', result: '', issue: '', nextAction: '', owner: state.context.teacher, dueDate: addDays(state.daily.date, 1), prepFeedback: { strengths: '', resonance: '', changes: '' }, prep: { summary: '', adjustment: '' }, prepEvidence: [],
    };
    const copy = activityFormCopy(value.type);
    const formTrack = value.formTrack || activityTrack(value.type);
    const canonicalTitle = copy.hideClass ? (value.className || value.title || '') : (value.title || '');
    return `<form id="activity-form" data-form="activity" data-activity-track="${esc(formTrack)}">
      <input type="hidden" name="id" value="${esc(value.id)}">
      <input type="hidden" name="type" value="${esc(value.type)}">
      <div id="activity-track-indicator">${renderActivityTrackIndicator(value.type)}</div>
      <div class="form-grid">
        ${copy.hideClass ? '<input type="hidden" name="className" value="">' : `<div class="form-field"><label class="form-label" id="activity-class-label" for="activity-class">${esc(copy.classLabel)} <span class="required">*</span></label><input id="activity-class" name="className" value="${esc(value.className)}" placeholder="${esc(copy.classPlaceholder)}" required></div>`}
        <div class="form-field span-2"><label class="form-label" id="activity-title-label" for="activity-title">${esc(copy.titleLabel)} <span class="required">*</span></label><input id="activity-title" name="title" value="${esc(canonicalTitle)}" placeholder="${esc(copy.titlePlaceholder)}" required></div>
        <div id="activity-students-field" class="form-field span-2" ${copy.hideStudents ? 'hidden' : ''}><div class="form-label">關聯學生（本班 ${assignedStudents(value.teacher || state.context.teacher).length} 人）</div><div class="chip-list">${renderStudentChoices(value.teacher || state.context.teacher, value.students || [])}</div></div>
      </div>
      ${renderActivityPreparationSection(value)}
      <div id="activity-specific-fields">${renderActivitySpecificFields(value.type, value.details || {})}</div>
      ${renderActivityResultSection(value)}
    </form>`;
  }

  function renderStudentCaseForm(item) {
    const value = item || { id: '', student: '', category: 'learning', urgency: 'medium', observation: '', intervention: '', outcome: '', nextAction: '', dueDate: addDays(state.daily.date, 1), status: 'open', parentContacted: false };
    return `<form id="student-case-form" data-form="student-case" data-draft-form><input type="hidden" name="id" value="${esc(value.id)}"><div class="form-grid">
      <div class="form-field"><label class="form-label" for="case-student">學生 <span class="required">*</span></label><select id="case-student" name="student" required><option value="">請選擇</option>${renderStudentOptions(item?.teacher || state.context.teacher, value.student)}</select></div>
      <div class="form-field"><label class="form-label" for="case-category">類型 <span class="required">*</span></label><select id="case-category" name="category" required><option value="learning" ${value.category === 'learning' ? 'selected' : ''}>學習</option><option value="behavior" ${value.category === 'behavior' ? 'selected' : ''}>行為／情緒</option><option value="peer" ${value.category === 'peer' ? 'selected' : ''}>同儕互動</option><option value="health" ${value.category === 'health' ? 'selected' : ''}>健康</option></select></div>
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
    const agreementAction = [value.decision, value.nextAction].filter(Boolean).join('\n');
    return `<form id="contact-form" data-form="contact" data-draft-form><input type="hidden" name="id" value="${esc(value.id)}"><div class="form-grid">
      <div class="form-field"><label class="form-label" for="contact-student">學生 <span class="required">*</span></label><select id="contact-student" name="student" required><option value="">請選擇</option>${renderStudentOptions(item?.teacher || state.context.teacher, value.student)}</select></div>
      <div class="form-field"><label class="form-label" for="contact-channel">管道</label><select id="contact-channel" name="channel"><option ${value.channel === 'LINE' ? 'selected' : ''}>LINE</option><option ${value.channel === '電話' ? 'selected' : ''}>電話</option><option ${value.channel === '面談' ? 'selected' : ''}>面談</option><option ${value.channel === '聯絡簿' ? 'selected' : ''}>聯絡簿</option></select></div>
      <div class="form-field span-2"><label class="form-label" for="contact-topic">溝通主題 <span class="required">*</span></label><input id="contact-topic" name="topic" value="${esc(value.topic)}" placeholder="例：分數學習狀況" required></div>
      <div class="form-field span-2"><label class="form-label" for="contact-summary">必要摘要 <span class="required">*</span></label><textarea id="contact-summary" name="summary" placeholder="只記錄與學生支持有關的客觀內容。" required>${esc(value.summary)}</textarea></div>
      <div class="form-field span-2"><label class="form-label" for="contact-decision">共識與後續行動 <span class="required">*</span></label><textarea id="contact-decision" name="decision" placeholder="例：家長今晚先讓孩子口述步驟；老師明日再確認是否能獨立完成。" required>${esc(agreementAction)}</textarea></div>
      <div class="form-field"><label class="form-label" for="contact-date">下次追蹤日</label><input id="contact-date" type="date" name="dueDate" value="${esc(value.dueDate)}"></div>
      <div class="form-field"><label class="form-label" for="contact-status">狀態</label><select id="contact-status" name="status"><option value="open" ${value.status === 'open' ? 'selected' : ''}>待追蹤</option><option value="closed" ${value.status === 'closed' ? 'selected' : ''}>已結案</option></select></div>
    </div></form>`;
  }

  function defaultEvidenceType(activity) {
    return {
      tutoring: 'before_after', project: 'artifact', robotics: 'assessment', portfolio: 'artifact',
      sel: 'assessment', classroom: 'assessment', lessonprep: 'plan_asset',
    }[activity.type] || 'assessment';
  }

  function evidenceQuality(data) {
    return evidenceReady(data) ? 100 : 0;
  }

  function evidenceAttachments(data) {
    if (!data) return [];
    normalizeEvidenceRecord(data);
    return data.attachments || [];
  }

  function attachmentAvailable(item) {
    return Boolean(item && (item.dataUrl || materialCloudUrl(item) || item.cloudFileId));
  }

  function attachmentRecorded(item) {
    if (!item) return false;
    return attachmentAvailable(item) || (item.recorded !== false && Boolean(String(item.fileName || item.name || '').trim()));
  }

  function evidenceReady(data) {
    return evidenceAttachments(data).some(attachmentRecorded);
  }

  function evidencePrimaryAttachment(data) {
    const attachments = evidenceAttachments(data);
    return attachments.find(item => item.id === data.primaryAttachmentId) || attachments[0] || null;
  }

  function attachmentPreviewUrl(attachment, size = 420) {
    if (!attachment) return '';
    if (attachment.dataUrl) return attachment.dataUrl;
    if (attachment.cloudFileId) return `https://drive.google.com/thumbnail?id=${encodeURIComponent(attachment.cloudFileId)}&sz=w${size}`;
    return '';
  }

  function syncEvidencePrimaryFields(data) {
    const primary = evidencePrimaryAttachment(data);
    data.primaryAttachmentId = primary?.id || '';
    data.fileName = primary?.fileName || '';
    data.mimeType = primary?.mimeType || '';
    data.dataUrl = primary?.dataUrl || '';
    data.cloudUrl = primary?.cloudUrl || '';
    data.cloudFileId = primary?.cloudFileId || '';
    data.placeholder = Boolean(primary && !attachmentAvailable(primary));
    return data;
  }

  function renderEvidenceAttachmentList(data, editable = true) {
    const attachments = evidenceAttachments(data);
    if (!attachments.length) return '<div class="evidence-attachment-empty">尚未加入成果照片或檔案。</div>';
    return `<div class="evidence-attachment-grid">${attachments.map((attachment, index) => {
      const primary = attachment.id === data.primaryAttachmentId;
      const previewUrl = attachmentPreviewUrl(attachment, 240);
      const preview = previewUrl
        ? `<img src="${esc(previewUrl)}" alt="${esc(attachment.fileName)}">`
        : `<span class="evidence-attachment-file">${icon(attachment.mimeType === 'application/pdf' ? 'file-text' : 'file-check-2', 24)}</span>`;
      const cloudUrl = materialCloudUrl(attachment);
      const fileName = cloudUrl
        ? `<a class="file-name-link" href="${esc(cloudUrl)}" target="_blank" rel="noopener noreferrer"><strong>${esc(attachment.fileName)}</strong>${icon('external-link', 13)}</a>`
        : `<strong>${esc(attachment.fileName)}</strong>`;
      return `<article class="evidence-attachment-item ${primary ? 'is-primary' : ''}" data-attachment-id="${esc(attachment.id)}">
        <button type="button" class="evidence-attachment-preview" data-action="set-evidence-primary" data-attachment-id="${esc(attachment.id)}" ${editable ? '' : 'disabled'} aria-label="${primary ? '目前標註主圖' : `設為標註主圖：${esc(attachment.fileName)}`}">${preview}<span class="evidence-attachment-index">${index + 1}</span></button>
        <div class="evidence-attachment-main"><div class="evidence-attachment-head">${fileName}<span class="badge ${primary ? 'blue' : 'outline'}">${primary ? '標註主圖' : esc(attachment.size || '已加入')}</span></div>
        ${attachment.note ? `<small>舊版補充說明：${esc(attachment.note)}</small>` : ''}</div>
        ${editable ? `<button type="button" class="icon-button evidence-attachment-remove" data-action="remove-evidence-attachment" data-attachment-id="${esc(attachment.id)}" aria-label="移除 ${esc(attachment.fileName)}" title="移除">${icon('x', 15)}</button>` : ''}
      </article>`;
    }).join('')}</div>`;
  }

  function renderEvidenceCanvas(data) {
    const primary = evidencePrimaryAttachment(data);
    if (!primary) return '<div><div class="empty-icon">' + icon('image-plus', 24) + '</div><div class="empty-title">尚未選擇檔案</div><div class="empty-copy">加入照片後即可預覽；重點位置標記為選用功能。</div></div>';
    const previewUrl = attachmentPreviewUrl(primary);
    if (previewUrl) return `<img src="${esc(previewUrl)}" alt="證據預覽">${renderPins(data.pins)}`;
    return `<div><div class="empty-icon">${icon(primary.mimeType === 'application/pdf' ? 'file-text' : 'file-check-2', 24)}</div><div class="empty-title">${esc(primary.fileName)}</div><div class="empty-copy">檔案已加入；主管可直接開啟原檔查看內容。</div></div>`;
  }

  function renderEvidenceForm(activity, evidence) {
    const isCrossDay = activity.type === 'lessonprep';
    const tracksStudents = activity.type === 'classroom' && activity.id !== 'operations';
    const linkedResult = activityFeedbackSummary(activity, '請先回到工作紀錄完成課後備課回饋');
    const value = clone(evidence || {
      id: '', fileName: '', mimeType: '', dataUrl: '', attachments: [], primaryAttachmentId: '', type: defaultEvidenceType(activity), stage: isCrossDay ? 'during' : 'after', title: '', claim: linkedResult, observation: '', students: tracksStudents ? clone(activity.students || []) : [], privacy: false, pins: [], placeholder: false,
    });
    normalizeEvidenceRecord(value);
    value.claim = linkedResult || value.claim || '';
    if (!tracksStudents) value.students = [];
    evidenceDraft = clone(value);
    evidenceDraft.activityId = activity.id;
    evidenceDraft.pins = clone(value.pins || []);
    syncEvidencePrimaryFields(evidenceDraft);
    const attachmentCount = evidenceDraft.attachments.length;
    return `<form id="evidence-form" data-form="evidence">
      <input type="hidden" name="id" value="${esc(value.id)}">
      <input type="hidden" name="activityId" value="${esc(activity.id)}">
      <input type="hidden" name="observation" value="${esc(value.observation || '')}">
      <div class="notice-band info">${icon('link', 19)}<div><div class="notice-title">${isCrossDay ? '關聯備課檔案' : '關聯工作'}：${esc(activity.title)}</div><div class="notice-copy">${activityNeedsPrepSource(activity.type) ? '課後備課回饋' : isCrossDay ? '本次備課目標' : '目標'}：${esc(linkedResult || activity.objective || '尚未填寫')}</div></div></div>
      <div class="notice-band info mt-12">${icon('eye', 19)}<div><div class="notice-title">上傳清楚、可辨識的成果即可</div><div class="notice-copy">不需另外描述主管要看哪裡；主管將依內容的完整性、清楚度與可判讀性進行判斷與評分。</div></div></div>
      <div class="detail-split">
        <div>
          <div class="evidence-upload-zone ${attachmentCount ? 'has-file' : ''}" id="evidence-upload-zone">
            <span class="evidence-upload-icon">${icon(attachmentCount ? 'images' : 'camera', 24)}</span>
            <div class="evidence-upload-copy"><strong id="evidence-upload-title">${attachmentCount ? `已加入 ${attachmentCount} 份成果` : (isCrossDay ? '上傳今天完成的版本' : '成果照片／檔案')} <span class="required">*</span></strong><small>${isCrossDay ? `可一次選擇多份今日實際完成的教案、教材或版本檔案，最多 ${MAX_EVIDENCE_FILES} 份。` : `可一次選取多張照片，系統會自動壓縮並上傳；最多 ${MAX_EVIDENCE_FILES} 張。`}</small><span id="evidence-file-name">${attachmentCount ? esc(evidenceDraft.attachments.map(item => item.fileName).join('、')) : '尚未選擇檔案 · 單檔上限 25 MB'}</span></div>
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
          <div class="form-field"><label class="form-label" for="evidence-type">證據類型 <span class="required">*</span></label><select id="evidence-type" name="type" data-input="evidence-quality" required><option value="">請選擇</option>${Object.entries(EVIDENCE_TYPES).map(([key, label]) => `<option value="${key}" ${value.type === key ? 'selected' : ''}>${esc(label)}</option>`).join('')}</select></div>
          <div class="form-field"><div class="form-label">紀錄階段 <span class="required">*</span></div><div class="segmented"><label><input type="radio" name="stage" value="before" ${value.stage === 'before' ? 'checked' : ''} required>${isCrossDay ? '接續依據' : '課前'}</label><label><input type="radio" name="stage" value="during" ${value.stage === 'during' ? 'checked' : ''} required>${isCrossDay ? '本日製作' : '進行中'}</label><label><input type="radio" name="stage" value="after" ${value.stage === 'after' ? 'checked' : ''} required>${isCrossDay ? '本日完成' : '成果'}</label></div></div>
        </div>
      </div>
      <div class="section-divider"></div>
      <div class="form-grid">
        <div class="form-field span-2"><label class="form-label" for="evidence-title">${isCrossDay ? '本日產出標題' : '證據標題'} <span class="required">*</span></label><input id="evidence-title" name="title" value="${esc(value.title)}" placeholder="${isCrossDay ? '例：餐車課程教案與學習單 v1.2' : '例：三組菜單成本表與定價初稿'}" minlength="4" data-input="evidence-quality" required></div>
        <div class="form-field span-2"><div class="form-label">${activityNeedsPrepSource(activity.type) ? '對應的課後備課回饋' : '對應的工作結果'}</div><div class="evidence-linked-result">${esc(value.claim || linkedResult)}</div><input id="evidence-claim" type="hidden" name="claim" value="${esc(value.claim || linkedResult)}"></div>
        ${tracksStudents ? `<div class="form-field span-2"><div class="form-label">關聯學生（本班 ${assignedStudents(activity.teacher || state.context.teacher).length} 人）</div><div class="chip-list">${renderStudentChoices(activity.teacher || state.context.teacher, value.students || [])}</div></div>` : ''}
        <div class="form-field span-2"><label class="choice-chip" for="evidence-privacy"><input id="evidence-privacy" type="checkbox" name="privacy" data-change="evidence-privacy" ${value.privacy ? 'checked' : ''} required>${icon('shield-check', 15)}已確認檔案不含無關姓名、聯絡資訊或不必要的正面影像 <span class="required">*</span></label></div>
      </div>
    </form>`;
  }

  function renderPins(pins) {
    return (pins || []).map((pin, index) => `<span class="evidence-pin" style="left:${Number(pin.x)}%;top:${Number(pin.y)}%;" title="${esc(pin.note)}">${index + 1}</span>`).join('');
  }

  function renderPinList(pins) {
    if (!pins || !pins.length) return '<div class="text-tiny muted">選用：需要時可點照片的關鍵位置新增標記。</div>';
    return pins.map((pin, index) => `<div class="pin-row"><span class="pin-number">${index + 1}</span><span>${esc(pin.note)}</span><button type="button" class="icon-button" data-action="remove-evidence-pin" data-pin-index="${index}" aria-label="刪除標記" title="刪除標記">${icon('x', 14)}</button></div>`).join('');
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
    const results = source.activities.map(item => [item, activityFeedbackSummary(item)]).filter(([, value]) => value).map(([item, value]) => `${item.title}：${value}`);
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
      const trackCovered = tracks.academic.covered || tracks.enrichment.covered;
      const academicReady = !tracks.academic.covered || tracks.academic.items.every(weeklyActivityCoreReady);
      const enrichmentReady = !tracks.enrichment.covered || tracks.enrichment.items.every(weeklyActivityCoreReady);
      const evidenceRequired = activities.filter(activity => (ACTIVITY_TYPES[activity.type] || ACTIVITY_TYPES.tutoring).evidence);
      const evidenceReadyCount = evidenceRequired.filter(activity => (activity.evidence || []).some(evidenceReady)).length;
      const operation = operationRecords().find(item => item.date === date);
      const ownDuty = operation?.dutyOwner === state.context.teacher;
      const operationReady = ownDuty ? operationsComplete(operation, false) : null;
      const missing = [];
      if (!trackCovered) missing.push('學科內或學科外');
      if (tracks.academic.covered && !academicReady) missing.push('學科內內容');
      if (tracks.enrichment.covered && !enrichmentReady) missing.push('學科外內容');
      if (evidenceReadyCount < evidenceRequired.length) missing.push('成果證據');
      if (ownDuty && !operationReady) missing.push('班務');
      return {
        date, academicReady, academicCovered: tracks.academic.covered, enrichmentReady, enrichmentCovered: tracks.enrichment.covered, evidenceReady: evidenceReadyCount, evidenceRequired: evidenceRequired.length,
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
      ${renderWeeklyCoverageCell('學科內', row.academicCovered ? (row.academicReady ? '完整' : '待補') : '未填', row.academicCovered ? (row.academicReady ? 'done' : 'pending') : 'neutral')}
      ${renderWeeklyCoverageCell('特色課程', row.enrichmentReady ? (row.enrichmentCovered ? '完整' : '無課程') : '待補', row.enrichmentReady ? (row.enrichmentCovered ? 'done' : 'neutral') : 'pending')}
      ${renderWeeklyCoverageCell('成果證據', evidenceLabel, evidenceTone)}
      ${renderWeeklyCoverageCell('班務', row.operationLabel, row.operationTone)}
      <span class="weekly-coverage-result"><strong>${row.complete ? '完整' : '待補'}</strong><small>${row.complete ? '沒有缺漏' : row.missing.join('、')}</small></span>
      ${action ? icon('chevron-right', 16) : ''}
    </${tag}>`;
  }

  function renderWeekly() {
    const source = weeklySourceData();
    const summary = buildWeeklySummary(source);
    const acceptedOrReady = source.evidence.filter(item => item.evidence.status === 'accepted' || evidenceReady(item.evidence)).length;
    const coverageRows = weeklyCoverageRows(source);
    const completeCoverageDays = coverageRows.filter(row => row.complete).length;
    return `<div class="page">
      ${pageHead('本週工作整理', `${formatDate(source.start)}–${formatDate(state.daily.date)}`, `<button type="button" class="btn" data-action="print-weekly">${icon('printer', 16)}<span>列印摘要</span></button>`)}
      <div class="status-strip">
        <div class="status-cell"><div class="status-label">工作紀錄</div><div class="status-value">${source.activities.length}</div></div>
        <div class="status-cell"><div class="status-label">完整證據</div><div class="status-value">${acceptedOrReady}/${source.evidence.length}</div></div>
        <div class="status-cell"><div class="status-label">學生追蹤</div><div class="status-value">${source.openCases.length}</div></div>
        <div class="status-cell"><div class="status-label">聯繫／待辦</div><div class="status-value">${source.contacts.length}/${source.actions.length}</div></div>
      </div>
      <div class="content-grid wide-aside">
        <section class="panel">
          <div class="panel-head"><div><div class="panel-title">${icon('sparkles')}本週摘要</div></div><span class="badge ${state.weekly.status === 'submitted' ? 'green' : 'yellow'}">${state.weekly.status === 'submitted' ? '已送出' : '草稿'}</span></div>
          <div class="panel-body"><form id="weekly-form" data-form="weekly"><div class="summary-list"><div class="summary-line"><span class="summary-index">1</span><div><div class="summary-title">本週成果</div><div class="summary-copy">${esc(summary.keyChange)}</div></div></div><div class="summary-line"><span class="summary-index">2</span><div><div class="summary-title">持續追蹤</div><div class="summary-copy">${esc(summary.priorityRisks)}</div></div></div><div class="summary-line"><span class="summary-index">3</span><div><div class="summary-title">最近待辦</div><div class="summary-copy">${esc(summary.nextWeek)}</div></div></div></div><div class="form-field mt-16"><label class="form-label" for="weekly-decision">需要主管決定／提供資源（選填）</label><textarea id="weekly-decision" name="decisionNeeded" placeholder="填寫需要主管協助的事項。">${esc(state.weekly.decisionNeeded)}</textarea></div><div class="flex gap-8 mt-16"><button type="button" class="btn btn-primary" data-action="submit-weekly">${icon('send', 16)}確認送出週整理</button></div></form></div>
        </section>
        <aside class="stack">
          <section class="panel weekly-coverage-panel"><div class="panel-head"><div><div class="panel-title">${icon('calendar-check-2')}最近工作日</div></div>${coverageRows.length ? `<span class="badge ${completeCoverageDays === coverageRows.length ? 'green' : 'yellow'}">${completeCoverageDays}/${coverageRows.length} 日完整</span>` : ''}</div><div class="panel-body">${coverageRows.length ? `<div class="weekly-coverage-list">${coverageRows.map(renderWeeklyCoverageRow).join('')}</div>` : `<div class="weekly-coverage-empty">${icon('calendar-plus', 21)}<div><strong>尚無紀錄</strong></div></div>`}</div></section>
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
      { key: 'materials', label: '至少一份已上傳的正式教材附件', done: (plan.materials || []).some(material => materialCloudUrl(material)) },
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

  function renderLessonPlans() {
    const allPreps = state.activities
      .filter(activity => activity.teacher === state.context.teacher && activity.type === 'lessonprep')
      .sort((a, b) => String(b.updatedAt || b.date).localeCompare(String(a.updatedAt || a.date)));
    return `<div class="page">
      ${pageHead('備課檔案', '記錄課程名稱，並至少上傳一份教案或教材', `<button type="button" class="btn btn-primary" data-action="open-activity" data-type="lessonprep">${icon('folder-plus', 17)}<span>新增備課檔案</span></button>`)}
      <section class="panel">
        <div class="panel-head"><div><div class="panel-title">${icon('notebook-tabs')}我的備課檔案</div><div class="panel-subtitle">${allPreps.length} 門課程</div></div></div>
        <div class="panel-body flush"><div class="table-wrap"><table class="data-table plan-table"><thead><tr><th>課程名稱</th><th>課程類型</th><th>建立／更新</th><th>附件</th><th>使用次數</th><th></th></tr></thead><tbody>${allPreps.length ? allPreps.map(renderPrepRecordRow).join('') : '<tr><td colspan="6" class="muted">尚未建立備課檔案</td></tr>'}</tbody></table></div></div>
      </section>
    </div>`;
  }

  function renderPrepRecordRow(activity) {
    const updatedDate = String(activity.updatedAt || '').slice(0, 10) || activity.date;
    const attachments = activity.prepEvidence || [];
    const usageCount = state.activities.filter(item => item.prepSourceId === activity.id).length;
    return `<tr><td><div class="table-primary">${esc(activity.title)}</div>${activity.prep?.summary ? `<div class="table-secondary">${esc(truncate(activity.prep.summary, 48))}</div>` : ''}</td><td><div class="table-primary">${esc(activity.details?.targetCourse || '尚未分類')}</div></td><td><div class="table-primary">${formatShortDate(activity.date)} 建立</div><div class="table-secondary">${formatShortDate(updatedDate)} 更新</div></td><td>${attachments.length ? `${attachments.length} 份` : '<span class="muted">無附件</span>'}</td><td>${usageCount}</td><td class="text-right"><button type="button" class="btn btn-small" data-action="edit-activity" data-activity-id="${activity.id}">${icon('arrow-right', 14)}開啟</button></td></tr>`;
  }

  function renderRecordTimelineEntry(entry) {
    const action = entry.route ? 'navigate' : 'open-record';
    const target = entry.route ? `data-route="${esc(entry.route)}"` : `data-submission-id="${esc(entry.submissionId)}"`;
    const tone = entry.status === '待補充' ? 'red' : entry.status === '已採認' ? 'green' : 'yellow';
    return `<div class="timeline-item"><div class="timeline-date">${formatDate(entry.date)}</div><span class="timeline-dot"></span><button type="button" class="timeline-content record-entry-button" data-action="${action}" ${target}><span class="record-entry-head"><span class="text-strong">${esc(entry.title)}</span><span class="badge ${tone}">${esc(entry.status)}</span></span><span class="text-small muted">${esc(entry.copy)}</span><span class="record-entry-open">查看完整內容 ${icon('chevron-right', 16)}</span></button></div>`;
  }

  async function loadLegacyArchiveFiles(notify = false) {
    const session = legacySession();
    if (!session || !window.API?.listArchivedKpiFiles) {
      integrationRuntime.legacyArchiveStatus = 'restricted';
      integrationRuntime.legacyArchiveMessage = session ? '舊版檔案服務尚未載入' : '登入後可查看舊版檔案';
      if (state.ui.route === 'records') renderApp();
      return { ok: false };
    }
    integrationRuntime.legacyArchiveStatus = 'loading';
    integrationRuntime.legacyArchiveMessage = '正在讀取舊版檔案';
    if (state.ui.route === 'records') renderApp();
    const result = await API.listArchivedKpiFiles({ viewer: session.nickname, limit: 300 });
    if (!result?.ok) {
      integrationRuntime.legacyArchiveStatus = 'error';
      integrationRuntime.legacyArchiveMessage = result?.error || '舊版檔案讀取失敗';
    } else {
      integrationRuntime.legacyArchiveStatus = 'saved';
      integrationRuntime.legacyArchiveFiles = Array.isArray(result.files) ? result.files : [];
      const months = [...new Set(integrationRuntime.legacyArchiveFiles.map(file => file.month).filter(Boolean))].sort().reverse();
      if (!months.includes(integrationRuntime.legacyArchiveMonth)) integrationRuntime.legacyArchiveMonth = months[0] || '';
      integrationRuntime.legacyArchiveMessage = integrationRuntime.legacyArchiveFiles.length ? `已讀取 ${integrationRuntime.legacyArchiveFiles.length} 份 PDF` : '目前沒有可查看的舊版 PDF';
    }
    if (state.ui.route === 'records') renderApp();
    if (notify) toast(integrationRuntime.legacyArchiveMessage, result?.ok ? 'success' : 'danger');
    return result;
  }

  function renderLegacyArchiveFiles() {
    const status = integrationRuntime.legacyArchiveStatus;
    const allFiles = integrationRuntime.legacyArchiveFiles || [];
    const months = [...new Set(allFiles.map(file => file.month).filter(Boolean))].sort().reverse();
    const selectedMonth = integrationRuntime.legacyArchiveMonth || months[0] || '';
    const files = selectedMonth ? allFiles.filter(file => file.month === selectedMonth) : allFiles;
    const monthSelect = months.length ? `<select class="archive-month-select" aria-label="舊版檔案月份" data-change="legacy-archive-month">${months.map(month => `<option value="${esc(month)}" ${month === selectedMonth ? 'selected' : ''}>${esc(month.replace('-', ' 年 '))} 月</option>`).join('')}</select>` : '';
    let body = '';
    if (status === 'loading') {
      body = `<div class="empty-state"><div><div class="empty-icon">${icon('loader-circle', 22)}</div><div class="empty-title">正在讀取檔案</div></div></div>`;
    } else if (status === 'error' || status === 'restricted') {
      body = `<div class="notice-band danger">${icon('file-warning', 19)}<div><div class="notice-title">無法讀取舊版檔案</div><div class="notice-copy">${esc(integrationRuntime.legacyArchiveMessage)}</div></div></div>`;
    } else if (!files.length) {
      body = `<div class="empty-state"><div><div class="empty-icon">${icon('file-search', 22)}</div><div class="empty-title">目前沒有舊版 PDF</div></div></div>`;
    } else {
      body = `<div class="legacy-file-list">${files.map(file => `<a class="legacy-file-row" href="${esc(file.url)}" target="_blank" rel="noopener noreferrer"><span class="legacy-file-icon">${icon('file-text', 19)}</span><span class="legacy-file-main"><strong>${esc(file.kind === 'daily' ? '全體 KPI 日報' : file.nickname ? `${file.nickname} KPI 日報` : file.fileName)}</strong><small>${file.date ? formatDate(file.date) : esc(file.fileName)}</small></span><span class="badge outline">PDF</span>${icon('external-link', 16)}</a>`).join('')}</div>`;
    }
    return `<section class="panel mt-16 legacy-archive-panel"><div class="panel-head"><div><div class="panel-title">${icon('archive')}舊版日報檔案</div><div class="panel-subtitle">直接開啟既有 PDF，不會併入新版紀錄</div></div><div class="panel-head-actions">${monthSelect}<button type="button" class="icon-button" data-action="refresh-legacy-archives" aria-label="重新讀取舊版檔案" title="重新讀取">${icon('refresh-cw', 15)}</button></div></div><div class="panel-body">${body}</div></section>`;
  }

  async function loadManagerReportFolders(notify = false) {
    const session = legacySession();
    if (!session || !['admin', 'manager'].includes(session.role) || !window.API?.listTeacherReportFolders) {
      integrationRuntime.reportFolderStatus = 'restricted';
      integrationRuntime.reportFolderMessage = '請使用主管正式帳號登入';
      if (state.ui.route === 'cloud-reports') renderApp();
      return { ok: false };
    }
    integrationRuntime.reportFolderStatus = 'loading';
    integrationRuntime.reportFolderMessage = '正在讀取老師資料夾';
    if (state.ui.route === 'cloud-reports') renderApp();
    const result = await API.listTeacherReportFolders({ scope: 'anqin' });
    if (!result?.ok) {
      integrationRuntime.reportFolderStatus = 'error';
      integrationRuntime.reportFolderMessage = result?.error || '雲端資料夾讀取失敗';
    } else {
      integrationRuntime.reportFolderStatus = 'saved';
      integrationRuntime.reportFolders = Array.isArray(result.folders) ? result.folders : [];
      integrationRuntime.reportFolderMessage = integrationRuntime.reportFolders.length
        ? `已讀取 ${integrationRuntime.reportFolders.length} 位老師的資料夾`
        : '目前沒有可查看的老師資料夾';
    }
    if (state.ui.route === 'cloud-reports') renderApp();
    if (notify) toast(integrationRuntime.reportFolderMessage, result?.ok ? 'success' : 'danger');
    return result;
  }

  function renderManagerCloudReports() {
    const status = integrationRuntime.reportFolderStatus;
    const folders = integrationRuntime.reportFolders || [];
    let content = '';
    if (status === 'idle' || status === 'loading') {
      content = `<div class="empty-state"><div><div class="empty-icon">${icon('loader-circle', 23)}</div><div class="empty-title">正在讀取雲端日報</div><div class="empty-copy">只會顯示目前帳號有權限查看的老師。</div></div></div>`;
    } else if (status === 'error' || status === 'restricted') {
      content = `<div class="notice-band danger">${icon('cloud-alert', 19)}<div><div class="notice-title">無法讀取雲端日報</div><div class="notice-copy">${esc(integrationRuntime.reportFolderMessage)}</div></div></div>`;
    } else if (!folders.length) {
      content = `<div class="empty-state"><div><div class="empty-icon">${icon('folder-search', 23)}</div><div class="empty-title">目前沒有可查看的資料夾</div></div></div>`;
    } else {
      const departments = [...new Set(folders.map(item => item.department))];
      content = departments.map(department => `<section class="panel mt-16"><div class="panel-head"><div><div class="panel-title">${icon('school')}${esc(department)}</div><div class="panel-subtitle">${folders.filter(item => item.department === department).length} 位老師</div></div></div><div class="panel-body"><div class="legacy-file-list">${folders.filter(item => item.department === department).map(folder => `<a class="legacy-file-row" href="${esc(folder.url)}" target="_blank" rel="noopener noreferrer"><span class="legacy-file-icon">${icon('folder-open', 20)}</span><span class="legacy-file-main"><strong>${esc(folder.nickname)}${folder.status === 'deleted' ? ' · 離職保留' : folder.status === 'suspended' ? ' · 帳號停用' : ''}</strong><small>${folder.reportCount ? `${folder.reportCount} 份日報 · 最近 ${formatDate(folder.latestDate)}` : '資料夾已建立，尚無日報'}</small></span><span class="badge ${folder.reportCount ? 'green' : 'outline'}">${folder.reportCount || 0} 份</span>${icon('external-link', 16)}</a>`).join('')}</div></div></section>`).join('');
    }
    return `<div class="page">${pageHead('雲端日報', '依教室與老師整理的正式日報資料夾', `<button type="button" class="btn" data-action="refresh-report-folders">${icon('refresh-cw', 16)}重新整理</button>`)}<div class="notice-band info">${icon('shield-check', 19)}<div><div class="notice-title">已依主管權限篩選</div><div class="notice-copy">東橋與北區主管只會看到自己的管理範圍；小魚與管理員依全域權限查看。開啟 Drive 時請使用系統綁定的 Google 帳號。</div></div></div>${content}</div>`;
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
        ...activities.flatMap(activity => [activity.title, activity.className, activity.objective, activity.action, activity.result, activity.issue, activity.nextAction, activity.prepFeedback?.strengths, activity.prepFeedback?.resonance, activity.prepFeedback?.changes, ...(activity.students || [])]),
        ...cases.flatMap(entry => [entry.student, entry.observation, entry.intervention, entry.outcome, entry.nextAction]),
        ...contacts.flatMap(entry => [entry.student, entry.topic, entry.summary, entry.decision, entry.nextAction]),
      ].filter(Boolean).join(' ');
      const needsResubmit = item.status === 'draft' && Boolean(item.previousStatus);
      return { date: item.date, statusKey: item.status, status: needsResubmit ? '待重新送出' : item.status === 'accepted' ? '已採認' : item.status === 'clarify' ? '待補充' : item.status === 'draft' ? '草稿' : '待審查', title: needsResubmit ? '已修改，請重新送出' : item.status === 'draft' ? '未送出工作紀錄' : '每日工作紀錄', copy: item.feedback || item.keyResult || item.followup || '內容已保留，可開啟查看', searchText, submissionId: item.id };
    };
    const todaySearchText = [
      ...todayActivities().flatMap(activity => [activity.title, activity.className, activity.objective, activity.action, activity.result, activity.issue, activity.nextAction, activity.prepFeedback?.strengths, activity.prepFeedback?.resonance, activity.prepFeedback?.changes, ...(activity.students || [])]),
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
    const syncing = integrationRuntime.cloudStatus === 'loading';
    const actions = `${legacySession()?.role === 'teacher' ? `<button type="button" class="btn" data-action="sync-teacher-records" ${syncing ? 'disabled' : ''}>${icon('cloud-download', 16)}<span>${syncing ? '更新中' : '更新雲端紀錄'}</span></button>` : ''}<button type="button" class="btn" data-action="export-records">${icon('folder-down', 16)}<span>匯出月歸檔</span></button>`;
    return `<div class="page">${pageHead('我的紀錄', '點選任一日期，查看完整內容與對話紀錄', actions)}${filtersMarkup}<section class="panel mt-16"><div class="panel-body"><div class="timeline">${entries.length ? entries.map(renderRecordTimelineEntry).join('') : empty}</div></div></section>${renderLegacyArchiveFiles()}</div>`;
  }

  function taskPriorityMeta(task) {
    if (task.priority === 'high') return { label: '高', tone: 'red' };
    if (task.priority === 'medium') return { label: '中', tone: 'yellow' };
    return { label: '一般', tone: 'blue' };
  }

  function taskDetailText(task) {
    const detail = String(task.detail || '').trim();
    return detail && detail !== String(task.source || '').trim() ? detail : '';
  }

  function renderTaskRow(task) {
    const priority = taskPriorityMeta(task);
    const done = task.status === 'done';
    const detail = taskDetailText(task);
    return `<article class="task-list-row ${done ? 'is-done' : ''}">
      <label class="task-complete-control" title="${done ? '恢復進行中' : '標記完成'}"><input type="checkbox" data-change="toggle-task" data-task-id="${esc(task.id)}" ${done ? 'checked' : ''} aria-label="${esc(task.title)}"><span>${icon('check', 14)}</span></label>
      <button type="button" class="task-open-button" data-action="open-task-detail" data-task-id="${esc(task.id)}" aria-label="查看追蹤事項：${esc(task.title)}">
        <span class="task-row-main"><span class="task-row-title">${esc(task.title)}</span><span class="task-row-meta"><span class="badge outline">${esc(task.source || '追蹤事項')}</span><span>${formatDate(task.dueDate)}</span>${detail ? '<span>含詳細說明</span>' : ''}</span></span>
        <span class="badge ${priority.tone}">${priority.label}</span>${icon('chevron-right', 17)}
      </button>
    </article>`;
  }

  function renderTaskDetail(task) {
    const priority = taskPriorityMeta(task);
    const detail = taskDetailText(task);
    return `<div class="task-detail-view">
      <div class="task-detail-badges"><span class="badge ${task.status === 'done' ? 'green' : 'yellow'}">${task.status === 'done' ? '已完成' : '進行中'}</span><span class="badge ${priority.tone}">${priority.label}優先</span></div>
      <section class="task-detail-section"><div class="task-detail-label">事項內容</div><div class="task-detail-copy">${nl2br(task.title)}</div></section>
      ${detail ? `<section class="task-detail-section"><div class="task-detail-label">主管說明</div><div class="task-detail-copy">${nl2br(detail)}</div></section>` : ''}
      <div class="metadata-list task-detail-metadata"><div class="metadata-row"><div class="metadata-label">來源</div><div class="metadata-value">${esc(task.source || '追蹤事項')}</div></div><div class="metadata-row"><div class="metadata-label">期限</div><div class="metadata-value">${formatDate(task.dueDate)}</div></div>${task.createdBy ? `<div class="metadata-row"><div class="metadata-label">建立者</div><div class="metadata-value">${esc(task.createdBy)}</div></div>` : ''}</div>
    </div>`;
  }

  function openTaskDetail(taskId) {
    const task = state.tasks.find(item => item.id === taskId && item.owner === state.context.teacher);
    if (!task) {
      toast('找不到這筆追蹤事項，請重新讀取', 'danger');
      return;
    }
    openDialog({
      title: '追蹤事項',
      body: renderTaskDetail(task),
      footer: `<button type="button" class="btn" data-action="close-dialog">返回列表</button><button type="button" class="btn btn-primary" data-action="toggle-task-detail" data-task-id="${esc(task.id)}">${icon(task.status === 'done' ? 'rotate-ccw' : 'check', 15)}${task.status === 'done' ? '恢復進行中' : '標記完成'}</button>`,
    });
  }

  function renderTasks() {
    const allTasks = state.tasks.filter(task => task.owner === state.context.teacher);
    const filters = getFilters('tasks', { status: 'open' });
    const tasks = allTasks.filter(task => filters.status === 'done' ? task.status === 'done' : task.status !== 'done');
    const open = allTasks.filter(task => task.status !== 'done');
    return `<div class="page">${pageHead('追蹤事項', `${open.length} 項待完成`, `<button type="button" class="btn btn-primary" data-action="open-task">${icon('plus', 16)}<span>新增事項</span></button>`)}<div class="content-grid"><section class="panel"><div class="panel-head"><div><div class="panel-title">${icon('list-checks')}我的事項</div><div class="panel-subtitle">點選事項查看完整內容</div></div><div class="segmented"><button type="button" data-action="set-view-filter" data-filter-group="tasks" data-filter-key="status" data-filter-value="open" class="${filters.status === 'open' ? 'active' : ''}">進行中</button><button type="button" data-action="set-view-filter" data-filter-group="tasks" data-filter-key="status" data-filter-value="done" class="${filters.status === 'done' ? 'active' : ''}">已完成</button></div></div><div class="panel-body flush">${tasks.length ? `<div class="task-list">${tasks.map(renderTaskRow).join('')}</div>` : '<div class="task-list-empty">此狀態目前沒有事項</div>'}</div></section><aside class="stack"><section class="panel"><div class="panel-head"><div><div class="panel-title">${icon('pie-chart')}事項來源</div></div></div><div class="panel-body"><div class="summary-list">${['學生追蹤', '工作紀錄', '親師溝通', '主管交辦'].map((source, index) => `<div class="summary-line"><span class="summary-index">${index + 1}</span><div><div class="summary-title">${source}</div><div class="summary-copy">${allTasks.filter(task => task.source === source && task.status !== 'done').length} 項進行中</div></div></div>`).join('')}</div></div></section></aside></div></div>`;
  }

  function expectedBackendDepartment(department) {
    return normalizeDepartmentScope(department);
  }

  function integrationAccountRows() {
    const session = legacySession();
    const roster = state.people.filter(person => ['teacher', 'manager'].includes(person.role) && ['東橋教室', '北區教室'].includes(normalizeDepartmentScope(person.department)));
    const visibleRoster = state.ui.role === 'manager' && session?.role !== 'admin'
      && !GLOBAL_MANAGER_NICKNAMES.includes(session?.nickname)
      ? roster.filter(person => normalizeDepartmentScope(person.department) === normalizeDepartmentScope(state.context.department))
      : roster;
    const users = new Map((integrationRuntime.users || []).map(user => [user.nickname, user]));
    return visibleRoster.map(person => {
      const nickname = backendNickname(person.nickname);
      const user = users.get(nickname);
      const expectedDepartment = expectedBackendDepartment(person.department);
      const expectedRole = person.role === 'manager' ? 'manager' : 'teacher';
      const accountReady = Boolean(user && user.email && user.status === 'active' && user.role === expectedRole && normalizeDepartmentScope(user.department) === normalizeDepartmentScope(person.department));
      return { person, nickname, user, accountReady, expectedDepartment, expectedRole };
    });
  }

  function integrationStatusBadge(status, labels) {
    const item = labels[status] || labels.unknown;
    return statusBadge(item[0], item[1]);
  }

  function renderIntegrationSettings() {
    const session = legacySession();
    const formalSession = Boolean(session && session.status !== 'suspended' && ['admin', 'manager', 'teacher'].includes(session.role));
    const formalTeacherSession = Boolean(session?.role === 'teacher' && session?.status !== 'suspended');
    const notification = browserNotificationStatus();
    const rows = integrationAccountRows();
    const pageTitle = state.ui.role === 'manager' ? '系統設定' : '帳號與通知';
    const readiness = integrationRuntime.readiness;
    const readinessKnown = integrationRuntime.readinessStatus === 'ok';
    const readinessChecks = [
      ['LINE 通知服務', Boolean(readiness?.services?.line)],
      ['APP 推播服務', Boolean(readiness?.services?.oneSignalApp && readiness?.services?.oneSignalKey)],
      ['教材原檔上傳', Boolean(readiness?.services?.materialUpload)],
      ['備課教案雲端建檔', Boolean(readiness?.services?.coursePrepArchive)],
      ['追蹤事項雲端同步', Boolean(readiness?.services?.taskCloudSync)],
      ['每日 21:30 PDF 統整', Boolean(readiness?.triggers?.dailyKpiPdf)],
      ['早上 07:30 事項提醒', Boolean(readiness?.triggers?.dailyTaskMorning ?? readiness?.triggers?.dailyTaskReminder)],
      ['晚上 20:00 明日預告', Boolean(readiness?.triggers?.dailyTaskEvening ?? readiness?.triggers?.dailyTaskReminder)],
    ];
    const managerNickname = backendNickname(state.context.manager);
    const visibleManagerRows = rows.filter(row => row.person.role === 'manager');
    const boundManagerCount = visibleManagerRows.filter(row => row.user?.line_user_id).length;
    const apiBadge = integrationStatusBadge(integrationRuntime.apiStatus, {
      unknown: ['尚未檢查', 'outline'], checking: ['檢查中', 'yellow'], ok: ['連線正常', 'green'], error: ['連線失敗', 'red'],
    });
    const accountSummary = integrationRuntime.userLoadStatus === 'ok'
      ? `${rows.filter(row => row.accountReady).length}/${rows.length} 帳號設定正確`
      : integrationRuntime.userLoadStatus === 'restricted' ? '登入後可檢查' : '尚未檢查';
    const lineSummary = integrationRuntime.userLoadStatus === 'ok'
      ? `${boundManagerCount}/${visibleManagerRows.length} 位主管已綁定`
      : '尚未檢查';
    const loginAction = session
      ? `<span class="badge green">${esc(session.nickname)} · ${sessionRoleLabel(session.role)}</span>`
      : `<button type="button" class="btn btn-primary" data-action="open-formal-login">${icon('log-in', 15)}登入／綁定帳號</button>`;
    return `<div class="page">
      ${pageHead(pageTitle, '帳號、雲端、通知與歸檔', `<button type="button" class="btn" data-action="check-integrations" ${integrationRuntime.checking ? 'disabled' : ''}>${icon('refresh-cw', 16)}<span>${integrationRuntime.checking ? '檢查中' : '重新檢查'}</span></button>`)}
      <div class="status-strip integration-status-strip">
        <div class="status-cell"><div class="status-label">後端 API</div><div class="status-value status-value-badge">${apiBadge}</div><div class="status-note">${esc(integrationRuntime.apiMessage)}</div></div>
        <div class="status-cell"><div class="status-label">正式身分</div><div class="status-value status-value-badge">${session ? statusBadge('已登入', 'green') : statusBadge('未登入', 'yellow')}</div><div class="status-note">${esc(formalIdentityMessage())}</div></div>
        <div class="status-cell"><div class="status-label">人員帳號</div><div class="status-value status-value-badge">${integrationRuntime.userLoadStatus === 'ok' ? statusBadge('已核對', rows.every(row => row.accountReady) ? 'green' : 'yellow') : statusBadge('待核對', 'outline')}</div><div class="status-note">${esc(accountSummary)}</div></div>
        <div class="status-cell"><div class="status-label">主管 LINE</div><div class="status-value status-value-badge">${integrationRuntime.userLoadStatus === 'ok' ? statusBadge(boundManagerCount === visibleManagerRows.length ? '已完成' : '未完成', boundManagerCount === visibleManagerRows.length ? 'green' : 'red') : statusBadge('待核對', 'outline')}</div><div class="status-note">${esc(lineSummary)}</div></div>
      </div>

      <div class="content-grid wide-aside integration-settings-grid">
        <div class="stack">
          <section class="panel">
            <div class="panel-head"><div><div class="panel-title">${icon('cloud')}正式送出</div></div>${statusBadge(state.integration.cloudSyncEnabled ? '已啟用' : '審查模式', state.integration.cloudSyncEnabled ? 'green' : 'yellow')}</div>
            <div class="panel-body">
              <div class="integration-toggle-list">
                <label class="integration-toggle-row"><span><strong>雲端送出</strong><small>${formalTeacherSession ? '正式老師帳號固定送至雲端，避免只留在目前裝置。' : formalSession ? '正式管理帳號已啟用雲端讀取與審核。' : '登入老師帳號後，正式資料會固定送至雲端。'}</small></span><input type="checkbox" data-change="cloud-sync-enabled" ${state.integration.cloudSyncEnabled ? 'checked' : ''} ${formalSession ? 'disabled' : ''}></label>
                <label class="integration-toggle-row is-required"><span><strong>PDF 歸檔與主管通知</strong><small>正式提交後固定建立 PDF，並以 APP／LINE 通知主管與管理員。</small></span><input type="checkbox" checked disabled></label>
              </div>
              ${state.ui.role === 'teacher' && state.integration.cloudSyncEnabled && !cloudIdentityReady() ? `<div class="notice-band danger mt-16">${icon('shield-alert', 19)}<div><div class="notice-title">尚未取得老師正式身分</div><div class="notice-copy">${esc(formalIdentityMessage())}。正式送出前請登入該老師帳號。</div></div></div>` : ''}
            </div>
          </section>

          ${state.ui.role === 'manager' ? `<section class="panel"><div class="panel-head"><div><div class="panel-title">${icon('list-checks')}正式上線檢查</div><div class="panel-subtitle">${esc(integrationRuntime.readinessMessage || '按重新檢查取得目前設定')}</div></div><div class="panel-head-actions">${statusBadge(readinessKnown && readinessChecks.every(([, ready]) => ready) ? '全部完成' : readinessKnown ? '仍有待設定' : '待檢查', readinessKnown && readinessChecks.every(([, ready]) => ready) ? 'green' : readinessKnown ? 'red' : 'outline')}${session?.role === 'admin' ? `<button type="button" class="btn btn-small" data-action="setup-system-automation">${icon('calendar-clock', 14)}補齊排程</button>` : ''}</div></div><div class="panel-body"><div class="check-list">${readinessChecks.map(([label, ready]) => `<div class="check-item ${readinessKnown && ready ? 'done' : 'pending'}"><span class="check-icon">${icon(readinessKnown && ready ? 'check' : 'minus', 12)}</span><span>${esc(label)}</span><span class="badge ${readinessKnown ? (ready ? 'green' : 'red') : 'outline'}">${readinessKnown ? (ready ? '已完成' : '待設定') : '待檢查'}</span></div>`).join('')}</div></div></section>` : ''}

          <section class="panel">
            <div class="panel-head"><div><div class="panel-title">${icon('users-round')}帳號與新人綁定</div><div class="panel-subtitle">${integrationRuntime.checkedAt ? `上次檢查 ${formatTime(integrationRuntime.checkedAt)}` : '檢查後顯示綁定狀態'}</div></div>${sessionCanManageAccounts(session) ? `<button type="button" class="btn btn-small" data-action="open-account-admin">${icon('user-cog', 15)}人員管理</button>` : ''}</div>
            <div class="panel-body flush">
              ${integrationRuntime.userLoadStatus === 'ok' ? `<div class="table-wrap"><table class="data-table integration-account-table"><thead><tr><th>人員</th><th>後端帳號</th><th>Google 帳號</th><th>APP</th><th>LINE</th><th>設定</th></tr></thead><tbody>${rows.map(row => {
                const user = row.user;
                const roleReady = user?.role === row.expectedRole;
                const departmentReady = user && normalizeDepartmentScope(user.department) === normalizeDepartmentScope(row.person.department);
                const statusReady = user?.status === 'active';
                const accountIssues = [!user ? '未建帳' : '', user && !user.email ? '未綁 Google' : '', user && !statusReady ? '已停用' : '', user && !roleReady ? '角色錯誤' : '', user && !departmentReady ? '部門錯誤' : ''].filter(Boolean);
                return `<tr><td><div class="table-primary">${esc(row.person.nickname)}</div><div class="table-secondary">${esc(row.person.department)}</div></td><td><div class="table-primary">${esc(row.nickname)}</div><div class="table-secondary">${esc(user?.department || row.expectedDepartment)}</div></td><td>${user?.email ? statusBadge('已綁定', 'green') : statusBadge('未綁定', 'yellow')}</td><td>${user?.push_subscription_id ? statusBadge('已訂閱', 'green') : statusBadge('未訂閱', 'yellow')}</td><td>${user?.line_user_id ? statusBadge('已綁定', 'green') : statusBadge('未綁定', 'yellow')}</td><td>${accountIssues.length ? statusBadge(accountIssues.join('、'), 'red') : statusBadge('正確', 'green')}</td></tr>`;
              }).join('')}</tbody></table></div>` : `<div class="integration-empty-state">${icon('user-round-search', 24)}<div><strong>${sessionCanInspectAccounts(session) ? '尚未讀取人員設定' : '請先登入主管或管理員帳號'}</strong><span>${sessionCanInspectAccounts(session) ? '按「重新檢查」核對 Google 與 LINE 綁定。' : '登入後即可核對主管與老師的綁定狀態。'}</span></div>${loginAction}</div>`}
            </div>
          </section>
        </div>

        <aside class="stack">
          <section class="panel"><div class="panel-head"><div><div class="panel-title">${icon('bell-ring')}這台裝置</div></div>${statusBadge(notification.label, notification.tone)}</div><div class="panel-body"><div class="check-list compact-check-list"><div class="check-item ${session ? 'done' : 'pending'}"><span class="check-icon">${icon(session ? 'check' : 'minus', 12)}</span><span>Google 帳號：${session ? esc(session.nickname) : '尚未登入'}</span></div><div class="check-item ${notification.tone === 'green' ? 'done' : 'pending'}"><span class="check-icon">${icon(notification.tone === 'green' ? 'check' : 'minus', 12)}</span><span>APP 通知：${esc(notification.label)}</span></div></div><div class="flex gap-8 flex-wrap mt-16">${session ? `${notification.tone === 'green' ? '' : `<button type="button" class="btn" data-action="enable-push">${icon('bell-plus', 15)}開啟 APP 通知</button>`}<button type="button" class="btn" data-action="test-all-notifications">${icon('send', 15)}測試 APP／LINE</button>` : `<button type="button" class="btn btn-primary" data-action="open-formal-login">${icon('log-in', 15)}登入／綁定</button>`}</div></div></section>

          <section class="panel"><div class="panel-head"><div><div class="panel-title">${icon('message-circle-more')}LINE 綁定</div></div></div><div class="panel-body"><p class="text-small">登入後取得 10 分鐘有效的專屬指令，再貼到 KPI 的 LINE 官方帳號。</p><div class="binding-command" data-line-binding-preview>尚未取得指令</div><button type="button" class="btn btn-small mt-12" data-action="copy-line-binding" ${session ? '' : 'disabled'}>${icon('key-round', 14)}取得並複製指令</button></div></section>

          <section class="panel"><div class="panel-head"><div><div class="panel-title">${icon('folder-tree')}資料歸檔</div></div></div><div class="panel-body"><div class="archive-path-list"><div><strong>成果照片</strong><span>KPI證據／部門／老師／年月</span></div><div><strong>教案教材</strong><span>KPI教材／部門／老師／年月</span></div><div><strong>日報 PDF</strong><span>KPI日報PDF／年月／老師_日期</span></div><div><strong>每月彙整</strong><span>KPI月歸檔／部門／老師／月份</span></div></div></div></section>

          <section class="panel"><div class="panel-head"><div><div class="panel-title">${icon('user-plus')}新人啟用順序</div></div></div><div class="panel-body"><ol class="integration-step-list"><li>管理員新增暱稱、Google Email、角色與部門</li><li>新人使用相同 Google Email 登入</li><li>到本頁取得 LINE 專屬綁定指令</li><li>在手機開啟 APP 通知</li></ol></div></section>
        </aside>
      </div>
    </div>`;
  }

  async function checkIntegrations() {
    if (integrationRuntime.checking) return;
    integrationRuntime.checking = true;
    integrationRuntime.apiStatus = 'checking';
    integrationRuntime.apiMessage = '正在連線';
    renderApp();
    const ping = window.API?.ping ? await API.ping() : { ok: false, error: 'API 尚未載入' };
    integrationRuntime.apiStatus = ping?.ok ? 'ok' : 'error';
    integrationRuntime.apiMessage = ping?.ok ? 'Google 雲端服務可連線' : (ping?.error || '無法連線');
    integrationRuntime.users = [];
    integrationRuntime.readiness = null;
    integrationRuntime.readinessStatus = 'restricted';
    const session = legacySession();
    if (ping?.ok && sessionCanInspectAccounts(session)) {
      const [result, readinessResult] = await Promise.all([
        API.listUsers(),
        window.API?.getSystemReadiness ? API.getSystemReadiness(session.nickname) : Promise.resolve({ ok: false, error: '檢查服務尚未載入' }),
      ]);
      integrationRuntime.userLoadStatus = result?.ok ? 'ok' : 'error';
      integrationRuntime.users = result?.ok && Array.isArray(result.users) ? result.users : [];
      if (result?.ok) mergeCloudRoster(integrationRuntime.users);
      if (!result?.ok) integrationRuntime.apiMessage = `API 可連線；人員資料讀取失敗：${result?.error || '未知錯誤'}`;
      integrationRuntime.readinessStatus = readinessResult?.ok ? 'ok' : 'error';
      integrationRuntime.readiness = readinessResult?.ok ? readinessResult : null;
      integrationRuntime.readinessMessage = readinessResult?.ok ? '已完成後端設定檢查' : (readinessResult?.error || '設定檢查失敗');
    } else {
      integrationRuntime.userLoadStatus = 'restricted';
    }
    integrationRuntime.checkedAt = new Date().toISOString();
    integrationRuntime.checking = false;
    renderApp();
  }

  function preserveAttachmentMedia(localAttachment, remoteAttachment) {
    if (!localAttachment || !remoteAttachment || attachmentAvailable(remoteAttachment) || !attachmentAvailable(localAttachment)) return remoteAttachment;
    remoteAttachment.dataUrl = localAttachment.dataUrl || '';
    remoteAttachment.cloudUrl = localAttachment.cloudUrl || localAttachment.url || '';
    remoteAttachment.cloudFileId = localAttachment.cloudFileId || localAttachment.fileId || '';
    remoteAttachment.fingerprint = remoteAttachment.fingerprint || localAttachment.fingerprint || localAttachment.fileFingerprint || '';
    remoteAttachment.uploadStatus = localAttachment.uploadStatus || (remoteAttachment.cloudUrl || remoteAttachment.cloudFileId ? 'uploaded' : 'local');
    remoteAttachment.placeholder = false;
    return remoteAttachment;
  }

  function preserveActivityMedia(localActivity, remoteActivity) {
    if (!localActivity || !remoteActivity) return remoteActivity;
    (remoteActivity.evidence || []).forEach(remoteEvidence => {
      const localEvidence = (localActivity.evidence || []).find(item => item.id === remoteEvidence.id);
      if (!localEvidence) return;
      normalizeEvidenceRecord(localEvidence);
      normalizeEvidenceRecord(remoteEvidence);
      remoteEvidence.attachments.forEach(remoteAttachment => {
        const localAttachment = localEvidence.attachments.find(item => item.id === remoteAttachment.id)
          || localEvidence.attachments.find(item => item.fingerprint && item.fingerprint === remoteAttachment.fingerprint)
          || localEvidence.attachments.find(item => item.fileName === remoteAttachment.fileName && item.size === remoteAttachment.size);
        preserveAttachmentMedia(localAttachment, remoteAttachment);
      });
      normalizeEvidenceRecord(remoteEvidence);
    });
    return remoteActivity;
  }

  function hydrateCloudSnapshotAttachments(snapshot, cloudAttachments = []) {
    const hydrated = clone(snapshot);
    const available = (Array.isArray(cloudAttachments) ? cloudAttachments : [])
      .filter(item => materialCloudUrl(item) || item?.fileId || item?.cloudFileId);
    const used = new Set();
    const claim = (predicate) => {
      const index = available.findIndex((item, position) => !used.has(position) && predicate(item));
      if (index < 0) return null;
      used.add(index);
      return available[index];
    };
    const applyCloudFile = (target, cloudFile) => {
      if (!target || !cloudFile) return;
      target.cloudUrl = materialCloudUrl(cloudFile);
      target.cloudFileId = cloudFile.cloudFileId || cloudFile.fileId || '';
      target.mimeType = target.mimeType || cloudFile.mimeType || 'application/octet-stream';
      target.fileName = target.fileName || cloudFile.fileName || '成果檔案';
      target.uploadStatus = 'uploaded';
      target.uploadError = '';
      target.placeholder = false;
      target.recorded = true;
      target.dataUrl = '';
    };

    (hydrated?.submission?.activitySnapshots || []).forEach(activity => {
      (activity.evidence || []).forEach(evidence => {
        normalizeEvidenceRecord(evidence);
        evidence.attachments.forEach(attachment => {
          if (attachmentAvailable(attachment)) return;
          const expectedType = `v2-${activity.type}`;
          const cloudFile = claim(item => item.attachmentId && item.attachmentId === attachment.id)
            || claim(item => item.evidenceId && item.evidenceId === evidence.id && item.fileName === attachment.fileName)
            || claim(item => item.forType === expectedType && item.fileName === attachment.fileName)
            || claim(item => item.fileName === attachment.fileName)
            || claim(item => item.forType === expectedType);
          applyCloudFile(attachment, cloudFile);
        });
        normalizeEvidenceRecord(evidence);
      });
    });

    const operation = hydrated?.operation;
    Object.entries(operation?.evidenceByCheck || {}).forEach(([key, photo]) => {
      normalizeOperationPhotoRecord(photo);
      if (attachmentAvailable(photo)) return;
      const cloudFile = claim(item => item.forType === `env_${key}`)
        || claim(item => item.fileName && item.fileName === photo.fileName);
      applyCloudFile(photo, cloudFile);
      normalizeOperationPhotoRecord(photo);
    });
    return hydrated;
  }

  function importCloudSnapshot(snapshot, cloudAttachments = []) {
    if (!snapshot || snapshot.schema !== 'anqin-v2' || !snapshot.submission) return false;
    const hydratedSnapshot = hydrateCloudSnapshotAttachments(snapshot, cloudAttachments);
    const remoteSubmission = clone(hydratedSnapshot.submission);
    remoteSubmission.cloudSavedAt = hydratedSnapshot.savedAt || remoteSubmission.cloudSavedAt || remoteSubmission.submittedAt || '';
    remoteSubmission.activitySnapshots = Array.isArray(remoteSubmission.activitySnapshots) ? remoteSubmission.activitySnapshots : [];
    remoteSubmission.studentCaseSnapshots = Array.isArray(remoteSubmission.studentCaseSnapshots) ? remoteSubmission.studentCaseSnapshots : [];
    remoteSubmission.contactSnapshots = Array.isArray(remoteSubmission.contactSnapshots) ? remoteSubmission.contactSnapshots : [];
    remoteSubmission.activitySnapshots.forEach(activity => (activity.evidence || []).forEach(normalizeEvidenceRecord));
    const existingSubmission = state.submissions.find(item => item.id === remoteSubmission.id || (item.date === remoteSubmission.date && item.teacher === remoteSubmission.teacher));
    const remoteStamp = String(remoteSubmission.cloudSavedAt || remoteSubmission.submittedAt || '');
    const localStamp = String(existingSubmission?.cloudSavedAt || existingSubmission?.submittedAt || '');
    const remoteIsNewer = !existingSubmission || remoteStamp > localStamp;
    if (!remoteIsNewer) {
      remoteSubmission.activitySnapshots.forEach(remoteActivity => {
        const localActivity = state.activities.find(item => item.id === remoteActivity.id);
        if (localActivity) preserveActivityMedia(remoteActivity, localActivity);
        const localSnapshot = (existingSubmission?.activitySnapshots || []).find(item => item.id === remoteActivity.id);
        if (localSnapshot) preserveActivityMedia(remoteActivity, localSnapshot);
      });
      if (hydratedSnapshot.operation?.id) {
        const localOperation = operationRecordById(hydratedSnapshot.operation.id);
        Object.entries(hydratedSnapshot.operation.evidenceByCheck || {}).forEach(([key, remotePhoto]) => {
          preserveAttachmentMedia(remotePhoto, localOperation?.evidenceByCheck?.[key]);
          if (localOperation?.evidenceByCheck?.[key]) normalizeOperationPhotoRecord(localOperation.evidenceByCheck[key]);
        });
      }
      return false;
    }
    if (existingSubmission) Object.assign(existingSubmission, remoteSubmission);
    else state.submissions.unshift(remoteSubmission);

    const mergeCollection = (key, items) => {
      (items || []).forEach(item => {
        const existing = state[key].find(current => current.id === item.id);
        const incoming = clone(item);
        if (key === 'activities' && existing) preserveActivityMedia(existing, incoming);
        if (existing) Object.assign(existing, incoming);
        else state[key].push(clone(item));
      });
    };
    mergeCollection('activities', [...remoteSubmission.activitySnapshots, ...(hydratedSnapshot.prepSources || [])]);
    mergeCollection('studentCases', remoteSubmission.studentCaseSnapshots);
    mergeCollection('contacts', remoteSubmission.contactSnapshots);
    mergeCollection('lessonPlans', hydratedSnapshot.lessonPlans || []);
    reconcileLegacyPlans(state);
    if (hydratedSnapshot.operation?.id) {
      const incomingOperation = clone(hydratedSnapshot.operation);
      const current = operationRecordById(hydratedSnapshot.operation.id);
      if (current) {
        Object.entries(incomingOperation.evidenceByCheck || {}).forEach(([key, remotePhoto]) => {
          preserveAttachmentMedia(current.evidenceByCheck?.[key], remotePhoto);
          normalizeOperationPhotoRecord(remotePhoto);
        });
        Object.assign(current, incomingOperation);
      }
      else state.operationHistory.push(incomingOperation);
    }
    if (hydratedSnapshot.daily && state.ui.role === 'teacher' && remoteSubmission.teacher === state.context.teacher && remoteSubmission.date === state.daily.date) {
      state.daily.parentStatus = hydratedSnapshot.daily.parentStatus || '';
      state.daily.parentHandoffConfirmed = Boolean(hydratedSnapshot.daily.parentHandoffConfirmed);
      state.daily.parentHandoffNote = hydratedSnapshot.daily.parentHandoffNote || '';
      state.daily.noStudentFollowupConfirmed = Boolean(hydratedSnapshot.daily.noStudentFollowupConfirmed);
      state.daily.summary = { ...state.daily.summary, ...(hydratedSnapshot.daily.summary || {}) };
      state.daily.status = hydratedSnapshot.daily.status || state.daily.status;
      state.daily.submittedAt = hydratedSnapshot.daily.submittedAt || state.daily.submittedAt;
    }
    return true;
  }

  function importCloudCoursePrep(record) {
    if (!record?.prep?.id) return false;
    const remotePrep = clone(record.prep);
    const remotePlan = record.plan ? clone(record.plan) : null;
    remotePrep.teacher = displayNameForBackend(record.nickname || backendNickname(remotePrep.teacher));
    remotePrep.cloudUpdatedAt = record.updatedAt || remotePrep.updatedAt || '';
    remotePrep.cloudSyncStatus = 'saved';
    if (remotePlan) remotePlan.teacher = remotePrep.teacher;
    if (remotePlan) mergePlanMaterialsIntoPrep(remotePrep, remotePlan);
    const existingPrep = state.activities.find(item => item.id === remotePrep.id && item.type === 'lessonprep');
    const localStamp = Date.parse(existingPrep?.updatedAt || existingPrep?.cloudUpdatedAt || '') || 0;
    const remoteStamp = Date.parse(record.updatedAt || remotePrep.updatedAt || '') || 0;
    if (existingPrep?.cloudSyncStatus !== 'saved' && localStamp > remoteStamp) return false;
    if (existingPrep) Object.assign(existingPrep, remotePrep);
    else state.activities.push(remotePrep);
    if (remotePlan?.id) {
      const existingPlan = state.lessonPlans.find(item => item.id === remotePlan.id);
      if (existingPlan) Object.assign(existingPlan, remotePlan);
      else state.lessonPlans.push(remotePlan);
    }
    return true;
  }

  async function syncCoursePrepsFromCloud(session = legacySession()) {
    if (!session || !window.API?.listCoursePreps || !['teacher', 'manager', 'admin'].includes(session.role)) return { ok: false, imported: 0 };
    const result = await API.listCoursePreps({ viewer: session.nickname, nickname: session.role === 'teacher' ? session.nickname : '' });
    if (!result?.ok) return { ok: false, imported: 0, error: result?.error || '備課檔案讀取失敗' };
    let imported = 0;
    (result.records || []).filter(record => {
      const teacher = displayNameForBackend(record.nickname || record.prep?.teacher || '');
      return session.role === 'admin' || session.role === 'teacher' || managerScopeMatches(teacher, record.department);
    }).forEach(record => { if (importCloudCoursePrep(record)) imported += 1; });
    return { ok: true, imported };
  }

  async function refreshCoursePrepCloudData(notify = false) {
    const session = legacySession();
    integrationRuntime.prepSyncStatus = 'loading';
    integrationRuntime.prepSyncMessage = '正在讀取備課檔案';
    const result = await syncCoursePrepsFromCloud(session);
    integrationRuntime.prepSyncStatus = result.ok ? 'saved' : 'error';
    integrationRuntime.prepSyncMessage = result.ok ? `已更新 ${result.imported} 份備課檔案` : (result.error || '備課檔案讀取失敗');
    if (result.ok) {
      persist('備課檔案已更新');
      renderApp();
      if (notify) toast(`已更新 ${result.imported} 份備課檔案`, 'success');
    } else {
      renderApp();
      if (notify) toast(`備課檔案讀取失敗：${result.error || '請稍後重試'}`, 'danger');
    }
    return result;
  }

  async function saveCoursePrepToCloud(activity) {
    if (!state.integration.cloudSyncEnabled) return { ok: true, localOnly: true };
    const identity = await ensureCloudTeacherIdentity();
    if (!identity.ok) throw new Error(identity.error || '請先登入目前老師的正式帳號');
    if (!window.API?.saveCoursePrep) throw new Error('備課雲端服務尚未載入');
    activity.cloudSyncStatus = 'saving';
    persist();
    const plan = activity.planId ? planById(activity.planId) : null;
    const result = await API.saveCoursePrep({
      nickname: cloudTeacherNickname(activity.teacher || state.context.teacher),
      prep: removeInlineMedia(activity),
      plan: plan ? removeInlineMedia(plan) : null,
    });
    if (!result?.ok) {
      activity.cloudSyncStatus = 'error';
      persist();
      throw new Error(result?.error || '備課檔案雲端儲存失敗');
    }
    activity.cloudSyncStatus = 'saved';
    activity.cloudUpdatedAt = result.updated_at || new Date().toISOString();
    persist('備課檔案已同步雲端');
    return result;
  }

  async function syncCloudFeedback(session = legacySession()) {
    if (!session || !window.API?.listFeedback) return 0;
    const result = await API.listFeedback({ nickname: session.nickname });
    if (!result?.ok) return 0;
    const rowsByLog = new Map();
    (result.feedback || []).forEach(row => {
      const rows = rowsByLog.get(row.log_id) || [];
      rows.push(row);
      rowsByLog.set(row.log_id, rows);
    });
    let updated = 0;
    state.submissions.forEach(submission => {
      const rows = (rowsByLog.get(cloudLogId(submission.teacher, submission.date)) || []).slice().sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
      if (!rows.length) return;
      const key = feedbackThreadKey('submission', submission.id);
      const local = feedbackThreadMessages(key);
      const cloudMessages = rows.map(row => ({
        id: `cloud_${row.feedback_id}`,
        author: displayNameForBackend(row.from_nickname),
        role: row.from_nickname === backendNickname(submission.teacher) ? 'teacher' : 'manager',
        text: String(row.content || '').trim(),
        createdAt: row.created_at || new Date().toISOString(),
      })).filter(message => message.text);
      const merged = [...local, ...cloudMessages].filter((message, index, all) => all.findIndex(other => other.id === message.id || (other.author === message.author && other.text === message.text && other.createdAt === message.createdAt)) === index);
      state.feedbackThreads[key] = merged;
      const latestManagerRow = rows.filter(row => row.from_nickname !== backendNickname(submission.teacher)).at(-1);
      if (latestManagerRow) {
        submission.feedback = latestManagerRow.content || '';
        submission.status = latestManagerRow.tag === '需改進' ? 'clarify' : 'accepted';
      }
      updated += 1;
    });
    rowsByLog.forEach((rows, logId) => {
      if (!String(logId).startsWith('V2-')) return;
      const key = String(logId).slice(3);
      const context = cloudFeedbackContext(key);
      if (!context) return;
      const local = feedbackThreadMessages(key);
      const cloudMessages = rows.slice().sort((a, b) => String(a.created_at).localeCompare(String(b.created_at))).map(row => ({
        id: `cloud_${row.feedback_id}`,
        author: displayNameForBackend(row.from_nickname),
        role: row.from_nickname === backendNickname(context.teacher) ? 'teacher' : 'manager',
        text: String(row.content || '').trim(),
        createdAt: row.created_at || new Date().toISOString(),
      })).filter(message => message.text);
      state.feedbackThreads[key] = [...local, ...cloudMessages].filter((message, index, all) => all.findIndex(other => other.id === message.id || (other.author === message.author && other.text === message.text && other.createdAt === message.createdAt)) === index);
      const latestDecision = rows.filter(row => row.from_nickname !== backendNickname(context.teacher) && ['已知悉', '需改進'].includes(row.tag)).sort((a, b) => String(a.created_at).localeCompare(String(b.created_at))).at(-1);
      if (latestDecision) {
        const [kind, id, secondaryId] = key.split(':');
        const needsChanges = latestDecision.tag === '需改進';
        const teacherOwnsThread = legacySession()?.role === 'teacher' && sameReviewIdentity(legacySession()?.nickname, context.teacher);
        if (kind === 'plan') {
          const plan = state.lessonPlans.find(item => item.id === id);
          if (plan) {
            plan.status = needsChanges ? 'changes' : 'approved'; plan.managerFeedback = latestDecision.content || '';
            if (teacherOwnsThread && needsChanges) upsertDerivedTask(`plan:${id}`, `修正教案「${plan.title}」：${latestDecision.content || ''}`, '主管交辦', plan.teacher, addDays(state.daily.date, 2), 'high');
            if (teacherOwnsThread && !needsChanges) { const task = state.tasks.find(item => item.ref === `plan:${id}`); if (task) { task.status = 'done'; scheduleTaskCloudSync(task); } }
          }
        }
        if (kind === 'evidence') {
          const activity = state.activities.find(item => item.id === id);
          const evidence = activity?.evidence?.find(item => item.id === secondaryId);
          if (evidence) {
            evidence.status = needsChanges ? 'clarify' : 'accepted'; evidence.managerFeedback = latestDecision.content || '';
            if (teacherOwnsThread && needsChanges) upsertDerivedTask(`evidence:${secondaryId}`, `補充證據「${evidence.title}」：${latestDecision.content || ''}`, '主管交辦', activity.teacher, addDays(state.daily.date, 1), 'high');
            if (teacherOwnsThread && !needsChanges) { const task = state.tasks.find(item => item.ref === `evidence:${secondaryId}`); if (task) { task.status = 'done'; scheduleTaskCloudSync(task); } }
          }
        }
        if (kind === 'operation') {
          const operation = operationRecordById(id);
          if (operation) {
            operation.reviewStatus = needsChanges ? 'clarify' : 'accepted'; operation.managerFeedback = latestDecision.content || '';
            if (teacherOwnsThread && needsChanges) upsertDerivedTask(`operations:${id}`, `補充 ${formatShortDate(operation.date)} 班務證據：${latestDecision.content || ''}`, '主管交辦', operation.dutyOwner, addDays(state.daily.date, 1), 'high');
            if (teacherOwnsThread && !needsChanges) { const task = state.tasks.find(item => item.ref === `operations:${id}`); if (task) { task.status = 'done'; scheduleTaskCloudSync(task); } }
          }
        }
      }
      updated += 1;
    });
    return updated;
  }

  async function syncTeacherCloudData(notify = true) {
    const identity = await ensureCloudTeacherIdentity();
    const session = legacySession();
    if (!identity.ok || !session || session.role !== 'teacher' || !sameReviewIdentity(session.nickname, state.context.teacher)) {
      if (notify) toast(identity.error || '請先登入目前老師的正式帳號', 'danger');
      return;
    }
    integrationRuntime.cloudStatus = 'loading';
    integrationRuntime.cloudErrorContext = '';
    integrationRuntime.cloudMessage = '正在讀取過去紀錄';
    renderApp();
    const result = await API.listLogs({ viewer: session.nickname, nickname: session.nickname, from: addDays(state.daily.date, -366), to: state.daily.date, limit: 500 });
    if (!result?.ok) {
      integrationRuntime.cloudStatus = 'error';
      integrationRuntime.cloudErrorContext = 'read';
      integrationRuntime.cloudMessage = result?.error || '紀錄讀取失敗';
      renderApp();
      if (notify) toast(`讀取失敗：${integrationRuntime.cloudMessage}`, 'danger');
      return;
    }
    if (window.API?.listStudents) {
      const studentsResult = await API.listStudents({ teacher: session.nickname });
      if (studentsResult?.ok) mergeCloudStudents(studentsResult.students || []);
    }
    let imported = 0;
    (result.logs || []).forEach(log => {
      if (importCloudSnapshot(log?.kpi6_data?.v2_snapshot, log?.attachments || [])) imported += 1;
    });
    const prepSync = await syncCoursePrepsFromCloud(session);
    const taskSync = await syncTasksFromCloud(session);
    const threads = await syncCloudFeedback(session);
    integrationRuntime.cloudStatus = 'saved';
    integrationRuntime.cloudErrorContext = '';
    integrationRuntime.prepSyncStatus = prepSync.ok ? 'saved' : 'error';
    integrationRuntime.prepSyncMessage = prepSync.ok ? `已更新 ${prepSync.imported || 0} 份備課檔案` : (prepSync.error || '備課檔案讀取失敗');
    integrationRuntime.taskSyncStatus = taskSync.ok ? 'saved' : 'error';
    integrationRuntime.taskSyncMessage = taskSync.ok ? `已更新 ${taskSync.imported || 0} 項追蹤事項` : (taskSync.error || '追蹤事項讀取失敗');
    integrationRuntime.cloudMessage = `已更新 ${imported} 筆紀錄、${prepSync.imported || 0} 份備課、${taskSync.imported || 0} 項追蹤與 ${threads} 組對話`;
    state.integration.lastCloudSaveAt = new Date().toISOString();
    persist('雲端紀錄已更新');
    renderApp();
    if (notify) toast(integrationRuntime.cloudMessage, 'success');
  }

  async function syncManagerCloudData(notify = true) {
    const session = legacySession();
    if (!session || !['manager', 'admin'].includes(session.role)) {
      if (notify) toast('請先登入主管或管理員帳號', 'danger');
      return;
    }
    if (!window.API?.listLogs) {
      if (notify) toast('雲端服務尚未載入，請重新整理', 'danger');
      return;
    }
    integrationRuntime.managerSyncStatus = 'loading';
    integrationRuntime.managerSyncMessage = '正在讀取老師送出資料';
    renderApp();
    const [result, usersResult, studentsResult] = await Promise.all([
      API.listLogs({ viewer: session.nickname, from: addDays(state.daily.date, -62), to: state.daily.date, limit: 500 }),
      window.API?.listUsers ? API.listUsers(session.nickname) : Promise.resolve({ ok: false }),
      window.API?.listStudents ? API.listStudents({ department: managerScopeDepartment() ? expectedBackendDepartment(managerScopeDepartment()) : '' }) : Promise.resolve({ ok: false }),
    ]);
    if (usersResult?.ok) mergeCloudRoster(usersResult.users || []);
    if (studentsResult?.ok) mergeCloudStudents(studentsResult.students || []);
    if (!result?.ok) {
      integrationRuntime.managerSyncStatus = 'error';
      integrationRuntime.managerSyncMessage = result?.error || '主管資料讀取失敗';
      renderApp();
      if (notify) toast(`更新失敗：${integrationRuntime.managerSyncMessage}`, 'danger');
      return;
    }
    let imported = 0;
    (result.logs || []).forEach(log => {
      const snapshot = log?.kpi6_data?.v2_snapshot;
      if (snapshot?.submission && !managerScopeMatches(snapshot.submission.teacher, snapshot.submission.department || log.department)) return;
      if (importCloudSnapshot(snapshot, log?.attachments || [])) imported += 1;
    });
    const prepSync = await syncCoursePrepsFromCloud(session);
    const threads = await syncCloudFeedback(session);
    integrationRuntime.managerSyncStatus = 'saved';
    integrationRuntime.managerSyncAt = new Date().toISOString();
    integrationRuntime.prepSyncStatus = prepSync.ok ? 'saved' : 'error';
    integrationRuntime.prepSyncMessage = prepSync.ok ? `已更新 ${prepSync.imported || 0} 份備課檔案` : (prepSync.error || '備課檔案讀取失敗');
    integrationRuntime.managerSyncMessage = `更新 ${imported} 筆 V2 日報、${prepSync.imported || 0} 份備課與 ${threads} 組對話`;
    persist('主管資料已更新');
    renderApp();
    if (notify) toast(integrationRuntime.managerSyncMessage, 'success');
  }

  function renderManagerDashboard() {
    const syncing = integrationRuntime.managerSyncStatus === 'loading';
    const pending = pendingReviews();
    const urgentCases = state.studentCases.filter(item => managerScopeMatches(item.teacher) && item.status !== 'closed' && item.urgency !== 'low');
    const prepFiles = state.activities.filter(activity => activity.type === 'lessonprep' && managerScopeMatches(activity.teacher));
    const evidenceAttention = allEvidence().filter(item => item.evidence.status !== 'accepted');
    const pendingOperations = operationRecords().filter(item => item.confirmedAt && item.reviewStatus !== 'accepted');
    const teachers = teachingStaff();
    const teacherRows = teachers.map(person => {
      const name = person.nickname;
      const activities = state.activities.filter(item => item.teacher === name && item.date === state.daily.date && item.type !== 'lessonprep');
      const submission = state.submissions.find(item => item.teacher === name && item.date === state.daily.date);
      const submitted = Boolean(submission || (name === state.context.teacher && state.daily.submittedAt));
      const quality = activities.length ? Math.round(activities.filter(activityComplete).length / activities.length * 100) : null;
      const queue = pending.filter(item => item.teacher === name).length
        + evidenceAttention.filter(item => item.activity.teacher === name).length
        + pendingOperations.filter(item => item.dutyOwner === name).length;
      return {
        name, department: person.department, studentCount: (person.students || []).length, note: person.note || '', quality, queue,
        submit: submitted ? '已交' : activities.length ? '草稿' : '未開始',
        submitTone: submitted ? 'green' : activities.length ? 'yellow' : 'outline',
        cases: state.studentCases.filter(item => item.teacher === name && item.status !== 'closed').length,
        contacts: state.contacts.filter(item => item.teacher === name && item.status !== 'closed').length,
      };
    });
    const queueItems = [
      ...pending.map(submission => `<div class="risk-row"><span class="risk-level ${submission.status === 'clarify' ? 'high' : 'low'}"></span><div><div class="risk-title">日報${submission.status === 'clarify' ? '待補充' : '待審'}｜${esc(submission.teacher)}</div><div class="risk-meta">${formatDate(submission.date)} · ${esc(truncate(submission.followup || submission.keyResult || '等待主管判讀', 58))}</div></div><button type="button" class="btn btn-small" data-action="open-review" data-submission-id="${submission.id}">查看</button></div>`),
      ...urgentCases.map(item => `<div class="risk-row"><span class="risk-level"></span><div><div class="risk-title">${esc(item.student)}｜${esc(truncate(item.observation, 54))}</div><div class="risk-meta">${esc(item.teacher)} · ${formatDate(item.dueDate)} 追蹤</div></div><button type="button" class="btn btn-small" data-action="open-case-detail" data-case-id="${item.id}">查看</button></div>`),
      ...pendingOperations.map(operation => `<div class="risk-row"><span class="risk-level ${operation.reviewStatus === 'clarify' ? 'high' : 'low'}"></span><div><div class="risk-title">班務${operation.reviewStatus === 'clarify' ? '待補充' : '待稽核'}｜${formatShortDate(operation.date)} ${esc(operation.room)}</div><div class="risk-meta">${esc(operation.dutyOwner)} · ${operationProofCount(operation)}/4 已附照片 · ${operationExceptionCount(operation)} 項異常</div></div><button type="button" class="btn btn-small" data-action="review-operation" data-operation-id="${operation.id}">稽核</button></div>`),
    ].slice(0, 8);
    const dueTasks = openTasks().slice().sort((a, b) => String(a.dueDate || '').localeCompare(String(b.dueDate || ''))).slice(0, 4);
    const start = addDays(state.daily.date, -6);
    const weeklyActivities = state.activities.filter(item => managerScopeMatches(item.teacher) && item.type !== 'lessonprep' && item.date >= start && item.date <= state.daily.date);
    const structure = [
      { label: '學科內（含班級經營）', track: 'academic' },
      { label: '特色課程', track: 'enrichment' },
    ].map(item => ({ ...item, count: weeklyActivities.filter(activity => activityTrack(activity.type) === item.track).length })).filter(item => item.count);
    return `<div class="page">
      ${pageHead('管理總覽', `${managerScopeLabel()} · ${formatDate(state.daily.date)}${integrationRuntime.managerSyncAt ? ` · ${formatTime(integrationRuntime.managerSyncAt)} 更新` : ''}`, `<button type="button" class="btn" data-action="manager-refresh" ${syncing ? 'disabled' : ''}>${icon('refresh-cw', 16)}<span>${syncing ? '更新中' : '更新狀態'}</span></button>`)}
      ${integrationRuntime.managerSyncStatus === 'error' ? `<div class="notice-band danger">${icon('cloud-alert', 19)}<div><div class="notice-title">雲端資料更新失敗</div><div class="notice-copy">${esc(integrationRuntime.managerSyncMessage)}</div></div></div>` : ''}
      <div class="status-strip">
        <div class="status-cell"><div class="status-label">待審日報</div><div class="status-value">${pending.length}</div><div class="status-note">含 ${pending.filter(item => item.status === 'clarify').length} 件待老師補充</div></div>
        <div class="status-cell"><div class="status-label">優先學生事件</div><div class="status-value">${urgentCases.length}</div><div class="status-note">依到期日與追蹤層級排序</div></div>
        <div class="status-cell"><div class="status-label">備課檔案</div><div class="status-value">${prepFiles.length}</div><div class="status-note">只供查閱，不需核准</div></div>
        <div class="status-cell"><div class="status-label">成果證據／班務</div><div class="status-value">${evidenceAttention.length}/${pendingOperations.length}</div><div class="status-note">待判讀證據 / 待稽核班務</div></div>
      </div>
      <div class="content-grid wide-aside">
        <div class="stack">
          <section class="panel"><div class="panel-head"><div><div class="panel-title">${icon('triangle-alert')}今日需處理</div><div class="panel-subtitle">依日期與待處理狀態排序</div></div><button type="button" class="btn btn-small" data-action="navigate" data-route="reviews">全部審查</button></div><div class="panel-body">${queueItems.length ? `<div class="risk-list">${queueItems.join('')}</div>` : '<div class="text-small muted">目前沒有待處理內容。</div>'}</div></section>
          <section class="panel"><div class="panel-head"><div><div class="panel-title">${icon('users-round')}老師工作狀態</div><div class="panel-subtitle">今日送出、追蹤與待審狀態</div></div></div><div class="panel-body flush"><div class="table-wrap"><table class="data-table"><thead><tr><th>老師</th><th>日報</th><th>資料完整度</th><th>學生追蹤</th><th>家長承諾</th><th>待審</th></tr></thead><tbody>${teacherRows.map(row => `<tr><td><div class="teacher-status"><span class="status-avatar">${esc(row.name.slice(0, 2))}</span><div><div class="table-primary">${esc(row.name)}</div><div class="table-secondary">${esc(row.department)} · ${row.studentCount} 位學生${row.note ? ` · ${esc(row.note)}` : ''}</div></div></div></td><td><span class="badge ${row.submitTone}">${row.submit}</span></td><td>${row.quality == null ? '—' : `<div class="metric-row"><span class="metric-value">${row.quality}</span><div class="progress-track"><div class="progress-fill ${row.quality < 70 ? 'danger' : row.quality < 85 ? 'warn' : ''}" style="width:${row.quality}%"></div></div></div>`}</td><td>${row.cases}</td><td>${row.contacts}</td><td>${row.queue ? `<span class="badge red">${row.queue}</span>` : '—'}</td></tr>`).join('')}</tbody></table></div></div></section>
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
      if (!managerScopeMatches(item.teacher, item.department)) return false;
      const statusMatch = filters.status === 'all' || (filters.status === 'open' ? ['pending', 'clarify'].includes(item.status) : item.status === filters.status);
      const teacherMatch = filters.teacher === 'all' || item.teacher === filters.teacher;
      const dateMatch = !filters.date || item.date === filters.date;
      const queryMatch = !query || `${item.teacher} ${item.keyResult} ${item.followup} ${item.tomorrowPriority}`.toLowerCase().includes(query);
      return statusMatch && teacherMatch && dateMatch && queryMatch;
    }).sort((a, b) => String(b.submittedAt).localeCompare(String(a.submittedAt)));
    return `<div class="page">
      ${pageHead('日報審查', '先看風險、待辦與證據，再回到完整日報', '')}
      <div class="filter-bar"><div class="filter-field"><label for="review-status">狀態</label><select id="review-status" aria-label="日報審查狀態" data-change="view-filter" data-filter-group="reviews" data-filter-key="status"><option value="open" ${filters.status === 'open' ? 'selected' : ''}>待處理</option><option value="all" ${filters.status === 'all' ? 'selected' : ''}>全部</option><option value="pending" ${filters.status === 'pending' ? 'selected' : ''}>待審查</option><option value="clarify" ${filters.status === 'clarify' ? 'selected' : ''}>待老師補充</option><option value="accepted" ${filters.status === 'accepted' ? 'selected' : ''}>已採認</option></select></div><div class="filter-field"><label for="review-teacher">老師</label><select id="review-teacher" aria-label="日報審查老師" data-change="view-filter" data-filter-group="reviews" data-filter-key="teacher"><option value="all">全部老師</option>${teachingStaff().map(item => `<option value="${esc(item.nickname)}" ${filters.teacher === item.nickname ? 'selected' : ''}>${esc(item.nickname)}</option>`).join('')}</select></div><div class="filter-field"><label for="review-date">日期</label><input id="review-date" aria-label="日報審查日期" type="date" value="${esc(filters.date)}" data-change="view-filter" data-filter-group="reviews" data-filter-key="date"></div><div class="filter-field grow"><label for="review-query">搜尋</label><input id="review-query" value="${esc(filters.query)}" data-input="view-filter" data-filter-group="reviews" data-filter-key="query" placeholder="搜尋學生、課程或關鍵字"></div></div>
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
    const previewUrl = attachmentPreviewUrl(primary);
    const status = evidence.status === 'accepted' ? ['已採認', 'green'] : evidence.status === 'clarify' ? ['待補充', 'red'] : ['待審查', 'yellow'];
    return `<article class="evidence-card">
      <div class="evidence-thumb">${previewUrl ? `<img src="${esc(previewUrl)}" alt="${esc(evidence.title)}">${renderPins(evidence.pins)}` : icon(primary?.mimeType === 'application/pdf' ? 'file-text' : evidence.type === 'plan_asset' ? 'archive' : 'image', 44)}<span class="badge blue quality-pill">${icon('images', 12)}${attachments.length} 份</span></div>
      <div class="evidence-card-body"><div class="evidence-title">${esc(evidence.title)}</div><div class="evidence-caption">${esc(truncate(evidence.claim, 82))}</div><div class="evidence-meta"><span class="badge ${status[1]}">${status[0]}</span><button type="button" class="btn btn-small" data-action="inspect-evidence" data-activity-id="${activity.id}" data-evidence-id="${evidence.id}">判讀</button></div></div>
    </article>`;
  }

  function renderManagerEvidence() {
    const allItems = allEvidence();
    const prepItems = state.activities.filter(activity => managerScopeMatches(activity.teacher) && activity.type === 'lessonprep').flatMap(activity => (activity.prepEvidence || []).map(evidence => ({ activity, evidence })));
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
    const ready = allItems.filter(item => evidenceReady(item.evidence)).length;
    const accepted = allItems.filter(item => item.evidence.status === 'accepted').length;
    return `<div class="page">
      ${pageHead('證據中心', '依老師、課程與工作紀錄集中查看成果內容', '')}
      <div class="status-strip"><div class="status-cell"><div class="status-label">備課參考資料</div><div class="status-value">${prepItems.length}</div><div class="status-note">集中保留在備課檔案</div></div><div class="status-cell"><div class="status-label">已上傳成果</div><div class="status-value">${ready}/${allItems.length}</div><div class="status-note">內容品質由主管判斷</div></div><div class="status-cell"><div class="status-label">主管已採認</div><div class="status-value">${accepted}</div><div class="status-note">依內容完成評分</div></div><div class="status-cell"><div class="status-label">待補充</div><div class="status-value">${allItems.filter(item => item.evidence.status === 'clarify').length}</div><div class="status-note">已回到老師待辦</div></div></div>
      <div class="filter-bar"><div class="filter-field"><label for="evidence-type-filter">證據類型</label><select id="evidence-type-filter" aria-label="證據類型篩選" data-change="view-filter" data-filter-group="evidence" data-filter-key="type"><option value="all">全部</option>${Object.entries(EVIDENCE_TYPES).map(([key, label]) => `<option value="${key}" ${filters.type === key ? 'selected' : ''}>${esc(label)}</option>`).join('')}</select></div><div class="filter-field"><label for="evidence-status-filter">主管狀態</label><select id="evidence-status-filter" aria-label="證據主管狀態" data-change="view-filter" data-filter-group="evidence" data-filter-key="status"><option value="open" ${filters.status === 'open' ? 'selected' : ''}>待處理</option><option value="all" ${filters.status === 'all' ? 'selected' : ''}>全部</option><option value="pending" ${filters.status === 'pending' ? 'selected' : ''}>待審查</option><option value="clarify" ${filters.status === 'clarify' ? 'selected' : ''}>待補充</option><option value="accepted" ${filters.status === 'accepted' ? 'selected' : ''}>已採認</option></select></div><div class="filter-field"><label for="evidence-kpi-filter">KPI 支持項目</label><select id="evidence-kpi-filter" aria-label="證據 KPI 支持項目" data-change="view-filter" data-filter-group="evidence" data-filter-key="kpi"><option value="all">全部</option>${['課業指導', '專案課程', '班級經營', '親師溝通', '個人態度與表現', '班級環境整潔'].map(label => `<option value="${label}" ${filters.kpi === label ? 'selected' : ''}>${label}</option>`).join('')}</select></div><div class="filter-field grow"><label for="evidence-query">搜尋</label><input id="evidence-query" value="${esc(filters.query)}" data-input="view-filter" data-filter-group="evidence" data-filter-key="query" placeholder="搜尋老師、課程、學生或工作結果"></div></div>
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
      <div class="status-strip"><div class="status-cell"><div class="status-label">逐項完整</div><div class="status-value">${completeRecords.length}/${allRecords.length}</div><div class="status-note">四面向均有照片與檢核結果</div></div><div class="status-cell"><div class="status-label">待主管稽核</div><div class="status-value">${pending}</div><div class="status-note">老師已確認送出</div></div><div class="status-cell"><div class="status-label">待老師補充</div><div class="status-value">${clarify}</div><div class="status-note">已建立具體補件待辦</div></div><div class="status-cell"><div class="status-label">異常面向</div><div class="status-value">${exceptions}</div><div class="status-note">需檢查處理、接手與期限</div></div></div>
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
        const previewUrl = attachmentPreviewUrl(item);
        return `<article class="operation-review-card ${isException ? 'is-exception' : ''}"><div class="operation-review-card-head"><span class="operation-proof-index">${index + 1}</span><div><strong>${esc(config.label)}</strong><small>${isException ? '異常面向' : '正常面向'}</small></div>${statusBadge(isException ? '異常' : '正常', isException ? 'red' : 'green')}</div><div class="operation-review-media">${previewUrl ? `<img src="${esc(previewUrl)}" alt="${esc(config.label)}班務證據">` : `<span>${icon('image', 32)}</span><div><strong>${esc(item.fileName || '缺少照片')}</strong><small>${esc(item.size || '尚無可預覽原圖')}</small></div>`}</div>${isException ? `<div class="operation-review-copy danger"><span>異常狀況與處理安排</span><p>${esc(item.action || '尚未填寫')}</p></div>` : ''}</article>`;
      }).join('')}</div>
      ${renderFeedbackThread(threadKey)}
      <section class="panel"><div class="panel-head"><div><div class="panel-title">${icon('clipboard-check')}本次稽核結論</div><div class="panel-subtitle">退回時請指出面向、照片或缺少的交接資訊</div></div></div><div class="panel-body"><div class="form-field"><label class="form-label" for="operation-review-feedback">通過說明或補充要求</label><textarea id="operation-review-feedback" placeholder="例：教具櫃照片看不到右側缺件標示；請補拍近照並填入行政接手人與預計補齊日。"></textarea></div></div></section>
    </div>`;
  }

  function renderManagerStudents() {
    const filters = getFilters('students', { urgency: 'all', status: 'open', query: '' });
    const query = filters.query.trim().toLowerCase();
    const cases = state.studentCases.filter(item => {
      if (!managerScopeMatches(item.teacher)) return false;
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
    const filters = getFilters('planReview', { teacher: 'all', query: '' });
    const query = filters.query.trim().toLowerCase();
    const preps = state.activities.filter(activity => {
      if (activity.type !== 'lessonprep' || !managerScopeMatches(activity.teacher)) return false;
      const teacherMatch = filters.teacher === 'all' || activity.teacher === filters.teacher;
      const queryMatch = !query || `${activity.title} ${activity.details?.targetCourse || ''} ${activity.teacher}`.toLowerCase().includes(query);
      return teacherMatch && queryMatch;
    }).sort((a, b) => String(b.updatedAt || b.date).localeCompare(String(a.updatedAt || a.date)));
    return `<div class="page">
      ${pageHead('備課檔案', '依老師查看已建立的課程與教案教材', '')}
      <div class="notice-band info">${icon('eye', 19)}<div><div class="notice-title">此頁只做客觀查閱</div><div class="notice-copy">備課檔案不需主管核准；填寫與附件品質於月度 KPI 評核時綜合判斷。</div></div></div>
      <div class="filter-bar"><div class="filter-field"><label for="plan-review-teacher">老師</label><select id="plan-review-teacher" aria-label="備課檔案老師" data-change="view-filter" data-filter-group="planReview" data-filter-key="teacher"><option value="all">全部老師</option>${teachingStaff().map(item => `<option value="${esc(item.nickname)}" ${filters.teacher === item.nickname ? 'selected' : ''}>${esc(item.nickname)}</option>`).join('')}</select></div><div class="filter-field grow"><label for="plan-review-query">搜尋</label><input id="plan-review-query" value="${esc(filters.query)}" data-input="view-filter" data-filter-group="planReview" data-filter-key="query" placeholder="搜尋課程名稱或類型"></div></div>
      <section class="panel mt-16"><div class="panel-body flush"><div class="table-wrap"><table class="data-table"><thead><tr><th>課程名稱</th><th>老師</th><th>課程類型</th><th>建立／更新</th><th>附件</th><th>使用次數</th><th></th></tr></thead><tbody>${preps.map(activity => {
        const updatedDate = String(activity.updatedAt || '').slice(0, 10) || activity.date;
        const usageCount = state.activities.filter(item => item.prepSourceId === activity.id).length;
        return `<tr><td><div class="table-primary">${esc(activity.title)}</div>${activity.prep?.summary ? `<div class="table-secondary">${esc(truncate(activity.prep.summary, 48))}</div>` : ''}</td><td>${esc(activity.teacher)}</td><td>${esc(activity.details?.targetCourse || '尚未分類')}</td><td><div class="table-primary">${formatShortDate(activity.date)} 建立</div><div class="table-secondary">${formatShortDate(updatedDate)} 更新</div></td><td>${(activity.prepEvidence || []).length} 份</td><td>${usageCount}</td><td><button type="button" class="btn btn-small" data-action="open-evidence" data-activity-id="${activity.id}">查看</button></td></tr>`;
      }).join('') || '<tr><td colspan="7" class="muted">沒有符合條件的備課檔案</td></tr>'}</tbody></table></div></div></section>
    </div>`;
  }

  function renderTeamRosterTable(teachers) {
    const totalStudents = teachers.reduce((sum, person) => sum + (person.students || []).length, 0);
    const rows = teachers.map(person =>
      '<tr><td><span class="badge outline">' + esc(person.department) + '</span></td>' +
      '<td><div class="teacher-status"><span class="status-avatar">' + esc(person.initials || person.nickname.slice(0, 2)) + '</span><div><div class="table-primary">' + esc(person.nickname) + '</div><div class="table-secondary">' + (person.role === 'manager' ? '主管兼帶班' : '安親老師') + '</div></div></div></td>' +
      '<td><strong>' + (person.students || []).length + '</strong></td>' +
      '<td><div class="roster-student-list">' + (person.students || []).map(student => '<span>' + esc(student) + '</span>').join('') + '</div></td>' +
      '<td>' + (person.note ? '<span class="badge yellow">' + esc(person.note) + '</span>' : '<span class="muted">—</span>') + '</td></tr>'
    ).join('');
    return '<section class="panel team-roster-panel"><div class="panel-head"><div><div class="panel-title">' + icon('contact-round') + '班級與學生名單</div><div class="panel-subtitle">' + teachers.length + ' 位帶班人員 · ' + totalStudents + ' 位學生；名單會帶入老師的工作、學生追蹤與親師溝通選項</div></div></div><div class="panel-body flush"><div class="table-wrap"><table class="data-table roster-table"><thead><tr><th>教室</th><th>老師</th><th>學生人數</th><th>學生名單</th><th>備註</th></tr></thead><tbody>' + rows + '</tbody></table></div></div></section>';
  }

  function renderTeamStatus() {
    const teachers = teachingStaff();
    const visibleActivities = state.activities.filter(activity => managerScopeMatches(activity.teacher));
    const visibleCases = state.studentCases.filter(item => managerScopeMatches(item.teacher));
    const visibleContacts = state.contacts.filter(item => managerScopeMatches(item.teacher));
    const visiblePreps = visibleActivities.filter(activity => activity.type === 'lessonprep');
    const visibleSubmissions = state.submissions.filter(item => managerScopeMatches(item.teacher, item.department));
    const visibleTasks = state.tasks.filter(task => managerScopeMatches(task.owner || task.assignee, task.department));
    const tutoring = visibleActivities.filter(activity => activity.type === 'tutoring');
    const projects = visibleActivities.filter(activity => ['project', 'robotics', 'portfolio'].includes(activity.type));
    const classroomActivities = visibleActivities.filter(activity => ['sel', 'classroom'].includes(activity.type));
    const contacts = visibleContacts;
    const operations = operationRecords().filter(operation => operation.confirmedAt);
    const rate = (items, predicate) => items.length ? Math.round(items.filter(predicate).length / items.length * 100) : null;
    const activitySource = items => `${items.length} 筆工作 · ${items.reduce((sum, activity) => sum + (activity.evidence || []).filter(evidence => evidence.status === 'accepted').length, 0)} 份採認證據`;
    const classroomTotal = classroomActivities.length + visibleCases.length;
    const classroomComplete = classroomActivities.filter(activityComplete).length + visibleCases.filter(item => item.observation && item.intervention && item.outcome && item.nextAction && item.dueDate).length;
    const scoreRows = [
      { label: '課業指導', value: rate(tutoring, activityComplete), source: tutoring.length ? activitySource(tutoring) : '尚無資料' },
      { label: '專案課程', value: rate(projects, activityComplete), source: projects.length || visiblePreps.length ? `${projects.length} 筆工作 · ${visiblePreps.length} 份備課檔案` : '尚無資料' },
      { label: '班級經營', value: classroomTotal ? Math.round(classroomComplete / classroomTotal * 100) : null, source: classroomTotal ? `${classroomActivities.length} 筆活動 · ${visibleCases.length} 件學生追蹤` : '尚無資料' },
      { label: '親師溝通', value: rate(contacts, item => item.summary && item.decision), source: contacts.length ? `${contacts.length} 次聯繫 · ${contacts.filter(item => item.status !== 'closed').length} 項待追` : '尚無資料' },
      { label: '環境整潔', value: rate(operations, operation => operationsComplete(operation, false)), source: operations.length ? `${operations.length} 筆已送出班務` : '尚無資料' },
    ];
    const teamRows = teachers.map(person => {
      const activities = visibleActivities.filter(activity => activity.teacher === person.nickname && activity.type !== 'lessonprep');
      return {
        name: person.nickname,
        department: person.department,
        studentCount: (person.students || []).length,
        students: person.students || [],
        note: person.note || '',
        activities: activities.length,
        cases: visibleCases.filter(item => item.teacher === person.nickname && item.status !== 'closed').length,
        tasks: visibleTasks.filter(item => item.owner === person.nickname && item.status !== 'done').length,
        plans: visiblePreps.filter(activity => activity.teacher === person.nickname).length,
        quality: rate(activities, activityComplete),
      };
    });
    const pendingItems = [
      ...visibleSubmissions.filter(item => ['pending', 'clarify'].includes(item.status)).map(item => ({ title: `${item.teacher}｜${item.status === 'clarify' ? '日報待補充' : '日報待審查'}`, dueDate: item.date })),
      ...visibleCases.filter(item => item.status !== 'closed').map(item => ({ title: `${item.student}｜學生追蹤`, dueDate: item.dueDate })),
      ...visibleTasks.filter(item => item.status !== 'done').map(item => ({ title: item.title, dueDate: item.dueDate })),
    ].sort((a, b) => String(a.dueDate || '').localeCompare(String(b.dueDate || ''))).slice(0, 5);
    return `<div class="page">
      ${pageHead('團隊狀態', '完成率、資料品質與績效判斷分開呈現', `<span class="badge outline">${icon('calendar-range', 15)}<span>${state.daily.date.slice(0, 4)} 年 ${Number(state.daily.date.slice(5, 7))} 月</span></span>`)}
      <div class="notice-band info">${icon('scale', 19)}<div><div class="notice-title">資料完整度不是績效分數</div><div class="notice-copy">系統只整理是否已有工作紀錄與成果附件；最終 KPI 由主管依內容品質、成果、影響與持續性做專業評核。</div></div></div>
      ${renderTeamRosterTable(teachers)}
      <section class="panel"><div class="panel-head"><div><div class="panel-title">${icon('chart-no-axes-combined')}部門評核準備度</div><div class="panel-subtitle">來源筆數可追溯至原始事件與主管觀察</div></div></div><div class="panel-body"><div class="score-matrix">${scoreRows.map(item => `<div class="score-cell"><div class="score-label">${esc(item.label)}</div><div class="score-main">${item.value === null ? '—' : item.value}</div><div class="score-source">${esc(item.source)}</div></div>`).join('')}</div></div></section>
      <div class="content-grid mt-16"><section class="panel"><div class="panel-head"><div><div class="panel-title">${icon('gauge')}團隊工作量</div></div></div><div class="panel-body flush"><div class="table-wrap"><table class="data-table"><thead><tr><th>老師</th><th>工作事件</th><th>學生案件</th><th>待辦</th><th>備課檔案</th><th>資料品質</th></tr></thead><tbody>${teamRows.map(row => `<tr><td><div class="table-primary">${esc(row.name)}</div></td><td>${row.activities}</td><td>${row.cases}</td><td>${row.tasks}</td><td>${row.plans}</td><td>${row.quality === null ? '—' : `<div class="metric-row"><span class="metric-value">${row.quality}</span><div class="progress-track"><div class="progress-fill ${row.quality < 70 ? 'danger' : row.quality < 85 ? 'warn' : ''}" style="width:${row.quality}%"></div></div></div>`}</td></tr>`).join('')}</tbody></table></div></div></section><aside class="panel"><div class="panel-head"><div><div class="panel-title">${icon('clipboard-check')}待完成事項</div></div></div><div class="panel-body">${pendingItems.length ? `<div class="check-list">${pendingItems.map((item, index) => `<div class="check-item pending"><span class="check-icon">${index + 1}</span><span>${esc(item.title)}${item.dueDate ? ` · ${formatShortDate(item.dueDate)}` : ''}</span></div>`).join('')}</div>` : '<div class="text-small muted">目前沒有待完成事項。</div>'}</div></aside></div>
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
      <input type="hidden" name="version" value="${esc(planDraft.version)}">
      <div class="prep-source-facts plan-linked-facts"><span><strong>備課檔案</strong>${esc(planDraft.title)}</span><span><strong>課程類型</strong>${esc(sourceActivity.details?.targetCourse || planDraft.courseType)}</span><span><strong>建立日期</strong>${formatDate(sourceActivity.date || state.daily.date)}</span></div>
      <div class="form-grid mt-16">
        <div class="form-field"><label class="form-label" for="plan-duration">總時數（分鐘） <span class="required">*</span></label><input id="plan-duration" type="number" min="10" step="5" name="duration" value="${Number(planDraft.duration || 60)}" required></div>
        <div class="form-field span-2"><label class="form-label" for="plan-context">學習者背景與先備能力 <span class="required">*</span></label><textarea id="plan-context" name="learnerContext" required>${esc(planDraft.learnerContext)}</textarea></div>
        <div class="form-field span-2"><label class="form-label" for="plan-objectives">可觀察學習目標 <span class="required">*</span></label><textarea id="plan-objectives" name="objectives" placeholder="每項目標使用「學生能……」並可被檢核。" required>${esc(planDraft.objectives)}</textarea></div>
      </div>` : `<div class="form-grid mt-16">
        <div class="form-field span-2"><label class="form-label" for="plan-title">教學設計名稱 <span class="required">*</span></label><input id="plan-title" name="title" value="${esc(planDraft.title)}" required></div>
        <div class="form-field"><label class="form-label" for="plan-course">課程類型</label><select id="plan-course" name="courseType">${['安親輔導', '專案選修', '學習歷程', 'SEL 聊心室', '暑期營隊'].map(type => `<option ${planDraft.courseType === type ? 'selected' : ''}>${type}</option>`).join('')}</select></div>
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
    return materials.map(material => {
      const cloudUrl = materialCloudUrl(material);
      const fileName = `<span class="file-name">${esc(material.name)}</span>`;
      return `<div class="material-row"><span class="file-icon">${icon(iconByType[material.category] || 'paperclip', 17)}</span><div>${cloudUrl ? `<a class="file-name-link" href="${esc(cloudUrl)}" target="_blank" rel="noopener noreferrer">${fileName}${icon('external-link', 13)}</a>` : fileName}<div class="file-meta">${esc(material.size || '附件')}</div></div><span class="badge ${cloudUrl ? 'green' : 'red'}">${cloudUrl ? '已歸檔' : '未上傳'}</span>${editable ? `<button type="button" class="icon-button" data-action="remove-plan-material" data-material-id="${material.id}" aria-label="移除附件" title="移除附件">${icon('x', 15)}</button>` : '<span></span>'}</div>`;
    }).join('');
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
        <section class="panel"><div class="panel-head"><div><div class="panel-title">${icon('target')}課程設計</div><div class="panel-subtitle">${esc(plan.courseType)}</div></div></div><div class="panel-body">
          <h3 class="section-title">學習者背景</h3><div class="text-small">${nl2br(plan.learnerContext || '尚未填寫')}</div>
          <div class="section-divider"></div><h3 class="section-title">學習目標</h3><div class="text-small">${nl2br(plan.objectives || '尚未填寫')}</div>
          <div class="section-divider"></div><h3 class="section-title">檢核與標準</h3><div class="text-small">${nl2br(plan.assessment || '尚未填寫')}</div>
        </div></section>
        <section class="panel"><div class="panel-head"><div><div class="panel-title">${icon('list-checks')}歸檔條件</div></div></div><div class="panel-body"><div class="check-list">${criteria.map(item => `<div class="check-item ${item.done ? 'done' : 'pending'}"><span class="check-icon">${icon(item.done ? 'check' : 'minus', 12)}</span><span>${esc(item.label)}</span></div>`).join('')}</div></div></section>
      </div>
      <section class="panel"><div class="panel-head"><div><div class="panel-title">${icon('route')}教學流程</div></div></div><div class="panel-body flush"><div class="table-wrap"><table class="data-table"><thead><tr><th>階段</th><th>時間</th><th>老師行動</th><th>學生行動</th><th>檢核點</th></tr></thead><tbody>${(plan.flow || []).map(flow => `<tr><td><div class="table-primary">${esc(flow.stage)}</div></td><td>${flow.minutes} 分</td><td>${esc(flow.teacher)}</td><td>${esc(flow.student)}</td><td>${esc(flow.checkpoint)}</td></tr>`).join('') || '<tr><td colspan="5" class="muted">尚無流程</td></tr>'}</tbody></table></div></div></section>
      <section class="panel"><div class="panel-head"><div><div class="panel-title">${icon('files')}正式教材附件</div><div class="panel-subtitle">共 ${(plan.materials || []).length} 份</div></div></div><div class="panel-body"><div class="material-list">${renderMaterials(plan.materials, false)}</div></div></section>
      ${showThread ? renderFeedbackThread(threadKey) : ''}
      ${managerMode ? `<section class="panel"><div class="panel-head"><div><div class="panel-title">${icon('clipboard-check')}本次審查結論</div></div></div><div class="panel-body"><div class="review-checks">${['目標可被觀察與檢核', '流程時間合理且總和一致', '師生活動能支持目標', '評量標準具體', '教材內容與流程一致'].map(label => `<label class="review-check"><input type="checkbox" data-review-check data-change="plan-review-check"><span>${label}</span></label>`).join('')}</div><div class="form-field mt-16"><label class="form-label" for="plan-review-feedback">核准說明或修改要求</label><textarea id="plan-review-feedback" placeholder="指出需修改的段落、附件或判準。"></textarea></div></div></section>` : ''}
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
    const evidenceCount = (activity.evidence || []).reduce((count, item) => count + evidenceAttachments(item).filter(attachmentRecorded).length, 0);
    return `<button type="button" class="archived-activity-row" data-action="view-archived-activity" data-submission-id="${esc(submissionId)}" data-activity-id="${esc(activity.id)}"><span class="activity-icon ${config.tone}">${icon(config.icon, 19)}</span><span class="archived-activity-main"><strong>${esc(activity.title)}</strong><small>${esc(config.label)} · ${esc(activity.className || '未指定班級')}</small><span>${esc(truncate(activityFeedbackSummary(activity, '尚未填寫課後回饋'), 100))}</span></span><span class="archived-activity-meta"><span class="badge ${evidenceCount ? 'blue' : 'red'}">成果 ${evidenceCount} 份</span>${icon('chevron-right', 17)}</span></button>`;
  }

  function renderActivityFullDetail(activity) {
    const config = ACTIVITY_TYPES[activity.type] || ACTIVITY_TYPES.tutoring;
    const feedbackOnly = activityNeedsPrepSource(activity.type);
    const details = (feedbackOnly ? [] : activityDetailSchema(activity.type)).map(field => `<div class="metadata-row"><div class="metadata-label">${esc(field.label)}</div><div class="metadata-value">${field.control === 'date' ? formatDate(activity.details?.[field.key]) : nl2br(activity.details?.[field.key] || '未填寫')}</div></div>`).join('');
    const evidence = activity.evidence || [];
    const outcomeRows = feedbackOnly ? [
      ['這份教案／教材哪裡有效', activity.prepFeedback?.strengths],
      ['孩子對哪個教案環節最有反應', activity.prepFeedback?.resonance],
      ['這份教案／教材要更新什麼', activity.prepFeedback?.changes],
    ] : [
      ['本次目標', activity.objective], ['實際做法／引導', activity.action], ['可觀察結果', activity.result],
      ['遇到的問題', activity.issue || '本次未記錄問題'], ['下次調整／行動', activity.nextAction],
    ];
    const contextCopy = feedbackOnly ? '課後備課回饋' : (activity.students || []).length ? `${activity.students.length} 位關聯學生` : '全班紀錄';
    const detailSection = details ? `<section class="panel"><div class="panel-head"><div><div class="panel-title">${icon('list-tree')}依工作類型填寫</div></div></div><div class="panel-body"><div class="metadata-list">${details}</div></div></section>` : '';
    return `<div class="stack"><div class="notice-band info">${icon(config.icon, 19)}<div><div class="notice-title">${esc(config.label)} · ${esc(activity.className || '未指定班級')}</div><div class="notice-copy">${formatDate(activity.date)} · ${esc(activity.teacher || state.context.teacher)} · ${esc(contextCopy)}</div></div></div><section class="panel"><div class="panel-head"><div><div class="panel-title">${icon('clipboard-check')}${feedbackOnly ? '課後備課回饋' : '完整填寫內容'}</div></div></div><div class="panel-body"><div class="metadata-list">${outcomeRows.map(([label, value]) => `<div class="metadata-row"><div class="metadata-label">${label}</div><div class="metadata-value">${nl2br(value || '未填寫')}</div></div>`).join('')}</div></div></section>${detailSection}<section class="panel"><div class="panel-head"><div><div class="panel-title">${icon('images')}成果證據</div><div class="panel-subtitle">${evidence.length} 筆證據</div></div></div><div class="panel-body">${evidence.length ? evidence.map(item => { const attachments = evidenceAttachments(item); return `<article class="archived-evidence-block"><div><strong>${esc(item.title)}</strong><p>${esc(item.claim)}</p>${item.observation ? `<small>舊版補充說明：${esc(item.observation)}</small>` : ''}</div><div class="archived-evidence-thumbs">${attachments.map(attachment => { const previewUrl = attachmentPreviewUrl(attachment, 180); const cloudUrl = materialCloudUrl(attachment); const media = previewUrl ? `<img src="${esc(previewUrl)}" alt="${esc(attachment.fileName)}">` : `<span>${icon('file-check-2', 18)}</span>`; return cloudUrl ? `<a href="${esc(cloudUrl)}" target="_blank" rel="noopener noreferrer" aria-label="開啟 ${esc(attachment.fileName)}">${media}</a>` : media; }).join('')}</div></article>`; }).join('') : '<div class="text-small muted">此筆送出紀錄沒有成果證據。</div>'}</div></section></div>`;
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
      <div class="status-strip"><div class="status-cell"><div class="status-label">學科內／學科外</div><div class="status-value">${tracks.academic.count}/${tracks.enrichment.count}</div><div class="status-note">每日兩類至少擇一</div></div><div class="status-cell"><div class="status-label">備課檔案／成果</div><div class="status-value">${prepReady}/${prepRequired.length} · ${evidence}</div></div><div class="status-cell"><div class="status-label">學生追蹤</div><div class="status-value">${cases.length}</div></div><div class="status-cell"><div class="status-label">親師溝通</div><div class="status-value">${contacts.length}</div></div></div>
      <section class="panel"><div class="panel-head"><div><div class="panel-title">${icon('clipboard-list')}工作與證據</div><div class="panel-subtitle">點選任一筆查看送出當下的完整內容</div></div></div><div class="panel-body">${activities.length ? `<div class="archived-activity-list">${activities.map(item => renderArchivedActivityRow(item, submission.id)).join('')}</div>` : `<div class="notice-band danger">${icon('file-question', 19)}<div><div class="notice-title">沒有可追溯的工作事件</div><div class="notice-copy">摘要無法連回班級、教學方法、學生結果與原始證據。</div></div></div>`}</div></section>
      <div class="detail-split"><section class="panel"><div class="panel-head"><div><div class="panel-title">${icon('user-round-search')}學生追蹤</div></div></div><div class="panel-body">${cases.length ? `<div class="metadata-list">${cases.map(item => `<div class="metadata-row"><div class="metadata-label">${esc(item.student)}</div><div class="metadata-value">${esc(item.observation)}<br><span class="muted">下一步：${esc(item.nextAction)}</span></div></div>`).join('')}</div>` : '<div class="text-small muted">當日無學生追蹤紀錄。</div>'}</div></section><section class="panel"><div class="panel-head"><div><div class="panel-title">${icon('messages-square')}親師溝通</div></div></div><div class="panel-body">${contacts.length ? `<div class="metadata-list">${contacts.map(item => `<div class="metadata-row"><div class="metadata-label">${esc(item.student)}</div><div class="metadata-value">${esc(item.summary)}<br><span class="muted">共識與後續：${esc([item.decision, item.nextAction].filter(Boolean).join('；'))}</span></div></div>`).join('')}</div>` : submission.parentHandoffConfirmed ? `<div class="notice-band success">${icon('hand-heart', 18)}<div><div class="notice-title">無重要事項，已親自完成門口交接</div><div class="notice-copy">${esc(submission.parentHandoffNote || '老師已確認完成交接')}</div></div></div>` : '<div class="text-small muted">當日沒有親師溝通或門口交接確認。</div>'}</div></section></div>
      ${showThread ? renderFeedbackThread(threadKey) : ''}
      ${readOnly ? '' : `<section class="panel"><div class="panel-head"><div><div class="panel-title">${icon('clipboard-check')}本次審查結論</div></div></div><div class="panel-body"><div class="form-field"><label class="form-label" for="submission-feedback">核准說明或補充要求</label><textarea id="submission-feedback" placeholder="指出哪一筆紀錄、哪個欄位或哪份證據需要調整。"></textarea></div></div></section>`}
    </div>`;
  }

  function renderEvidenceDetail(activity, evidence) {
    const config = ACTIVITY_TYPES[activity.type] || ACTIVITY_TYPES.tutoring;
    const attachments = evidenceAttachments(evidence);
    const primary = evidencePrimaryAttachment(evidence);
    const primaryPreviewUrl = attachmentPreviewUrl(primary);
    const primaryCloudUrl = materialCloudUrl(primary);
    const noPreviewCopy = primaryCloudUrl
      ? '此裝置無法直接預覽，請從下方開啟雲端原檔。'
      : '附件紀錄已保留；雲端原檔待修復，不影響送出，主管將依目前可讀內容判斷。';
    const managerMode = state.ui.role === 'manager';
    const threadKey = feedbackThreadKey('evidence', activity.id, evidence.id);
    const showThread = managerMode || feedbackThreadMessages(threadKey).length > 0;
    const linkedResult = activityFeedbackSummary(activity);
    const checks = [
      ['已登記成果檔案', evidenceReady(evidence)],
      ['對應工作紀錄可追溯', Boolean(linkedResult || evidence.claim)],
      ['課程／班級可追溯', Boolean(activity.className)],
      ['隱私確認完成', Boolean(evidence.privacy)],
    ];
    return `<div class="stack"><div class="detail-split">
      <div><div class="annotation-canvas ${primaryPreviewUrl ? 'has-image' : ''}">${primaryPreviewUrl ? `<img src="${esc(primaryPreviewUrl)}" alt="${esc(evidence.title)}">${renderPins(evidence.pins)}` : `<div><div class="empty-icon">${icon(primary?.mimeType === 'application/pdf' ? 'file-text' : evidence.type === 'plan_asset' ? 'archive' : 'image', 28)}</div><div class="empty-title">${esc(primary?.fileName || evidence.fileName)}</div><div class="empty-copy">${esc(noPreviewCopy)}</div></div>`}</div><div class="pin-list">${(evidence.pins || []).length ? renderPinList(evidence.pins).replaceAll('data-action="remove-evidence-pin"', 'disabled') : ''}</div>${attachments.length ? `<div class="evidence-detail-files"><div class="text-small text-strong">全部成果（${attachments.length} 份）</div>${attachments.map((attachment, index) => { const previewUrl = attachmentPreviewUrl(attachment, 180); const cloudUrl = materialCloudUrl(attachment); const thumb = previewUrl ? `<img src="${esc(previewUrl)}" alt="${esc(attachment.fileName)}">` : icon(attachment.mimeType === 'application/pdf' ? 'file-text' : 'file-check-2', 20); const legacyNote = attachment.note || (index === 0 ? evidence.observation : ''); return `<article class="evidence-detail-file"><span class="evidence-detail-thumb">${cloudUrl ? `<a href="${esc(cloudUrl)}" target="_blank" rel="noopener noreferrer" aria-label="開啟 ${esc(attachment.fileName)}">${thumb}</a>` : thumb}</span><div><strong>${index + 1}. ${esc(attachment.fileName)}</strong>${legacyNote ? `<small>舊版補充說明：${esc(legacyNote)}</small>` : ''}</div>${cloudUrl ? `<a class="btn btn-small" href="${esc(cloudUrl)}" target="_blank" rel="noopener noreferrer">${icon('external-link', 14)}開啟原檔</a>` : attachment.id === evidence.primaryAttachmentId ? '<span class="badge blue">標註主圖</span>' : ''}</article>`; }).join('')}</div>` : ''}</div>
      <div class="stack">
        <div class="notice-band info">${icon('badge-check', 18)}<div><div class="notice-title">由主管直接判讀內容品質</div><div class="notice-copy">請依完整性、清楚度與可判讀性進行判斷與評分；系統不以老師撰寫的說明代替審查。</div></div></div>
        <div class="metadata-list"><div class="metadata-row"><div class="metadata-label">工作</div><div class="metadata-value">${esc(activity.title)}</div></div><div class="metadata-row"><div class="metadata-label">支持 KPI</div><div class="metadata-value">${esc(config.kpi)}</div></div><div class="metadata-row"><div class="metadata-label">類型</div><div class="metadata-value">${esc(EVIDENCE_TYPES[evidence.type] || evidence.type)}</div></div><div class="metadata-row"><div class="metadata-label">對應工作結果</div><div class="metadata-value">${esc(evidence.claim)}</div></div>${evidence.observation ? `<div class="metadata-row"><div class="metadata-label">舊版補充說明</div><div class="metadata-value">${esc(evidence.observation)}</div></div>` : ''}<div class="metadata-row"><div class="metadata-label">關聯學生</div><div class="metadata-value">${esc((evidence.students || []).join('、') || '全班／未指定')}</div></div></div>
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

  function openActivityTypePicker(track) {
    const options = selectableActivityTypes(track);
    const meta = activityTrackMeta(track);
    openDialog({
      title: `新增${meta.shortLabel}紀錄`,
      body: `<div class="activity-type-picker">${options.map(([type, config]) => `<button type="button" class="activity-type-choice" data-action="open-activity" data-track="${esc(track)}" data-type="${esc(type)}"><span class="activity-icon ${config.tone}">${icon(config.icon, 19)}</span><span><strong>${esc(config.label)}</strong><small>${type === 'classroom' ? '有特殊班級事件時使用' : '記錄本次課程與課後回饋'}</small></span>${icon('chevron-right', 17)}</button>`).join('')}</div>`,
      footer: '<button type="button" class="btn" data-action="close-dialog">取消</button>',
    });
  }

  function showActivityEditor(draft, draftContext = {}) {
    setDrawerDraftContext('activity', draftContext.key || drawerDraftKey('activity', draft.id, draft.type), draftContext.saved || null);
    activityDraft = clone(draft);
    activityDraft.details = clone(activityDraft.details || {});
    activityDraft.detailCache = activityDraft.detailCache || { [activityDraft.type]: clone(activityDraft.details) };
    activityDraft.commonCache = activityDraft.commonCache || (activityNeedsPrepSource(activityDraft.type) ? {} : { [activityDraft.type]: {
      objective: activityDraft.objective || '', action: activityDraft.action || '', result: activityDraft.result || '', issue: activityDraft.issue || '',
      nextAction: activityDraft.nextAction || '', owner: activityDraft.owner || state.context.teacher, dueDate: activityDraft.dueDate || '',
    } });
    activityDraft.prepSourceCache = activityDraft.prepSourceCache || { [activityDraft.type]: activityDraft.prepSourceId || '' };
    const isExisting = Boolean(activityDraft.id);
    const isCoursePrep = activityDraft.type === 'lessonprep';
    openDrawer({
      title: isCoursePrep ? `${isExisting ? '編輯' : '新增'}備課檔案` : isExisting ? '編輯工作紀錄' : '新增工作紀錄',
      subtitle: isCoursePrep ? '填寫課程類型與名稱，並至少上傳一份教案或教材' : activityNeedsPrepSource(activityDraft.type) ? '選擇備課檔案，再記錄實際教學與課後回饋' : '記錄實際做法、結果、問題與後續行動',
      body: `${draftRecoveryNotice(draftContext.saved?.savedAt, draftContext.saved?.mediaOmitted)}${isCoursePrep ? renderCoursePrepForm(activityDraft) : renderActivityForm(activityDraft)}`,
      footer: `${isExisting ? `<button type="button" class="btn btn-danger" style="margin-right:auto" data-action="delete-activity" data-activity-id="${activityDraft.id}">${icon('trash-2', 15)}${isCoursePrep ? '刪除備課檔案' : '刪除'}</button>` : ''}<button type="button" class="btn" data-action="close-drawer">稍後繼續</button><button type="submit" form="${isCoursePrep ? 'course-prep-form' : 'activity-form'}" class="btn btn-primary">${icon('save', 16)}${isCoursePrep ? '儲存備課檔案' : '儲存紀錄'}</button>`,
    });
    if (!isCoursePrep) refreshActivityFormCopy(activityDraft.type);
  }

  function openActivityEditor(activityId, requestedTrack = '', requestedType = '') {
    closeDialog();
    const activity = activityId ? state.activities.find(item => item.id === activityId) : null;
    const defaultType = requestedType && ACTIVITY_TYPES[requestedType] ? requestedType : requestedTrack === 'enrichment' ? 'project' : 'tutoring';
    const formTrack = activity ? activityTrack(activity.type) : requestedTrack || activityTrack(defaultType);
    const key = drawerDraftKey('activity', activityId || '', activity?.type || defaultType);
    const saved = getOpenDraft(key);
    const base = activity || {
      id: '', type: defaultType, title: '', className: '', students: [], details: {}, prepSourceId: defaultPrepSourceId(defaultType), planId: '', objective: '', action: '', result: '', issue: '', nextAction: '', owner: state.context.teacher, dueDate: addDays(state.daily.date, 1), prepFeedback: { strengths: '', resonance: '', changes: '' }, prep: { summary: '', adjustment: '' }, prepEvidence: [], evidence: [],
    };
    if (!activity && defaultType === 'lessonprep') base.details = activityDetailDefaults('lessonprep');
    const draft = clone(saved?.kind === 'activity' && saved.payload ? saved.payload : base);
    if (!activity && defaultType !== 'lessonprep' && activityTrack(draft.type) !== formTrack) {
      draft.type = defaultType;
      draft.details = {};
      draft.prepSourceId = defaultPrepSourceId(defaultType);
      draft.planId = '';
    }
    draft.formTrack = formTrack;
    showActivityEditor(draft, { key, saved: saved?.kind === 'activity' ? saved : null });
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
    const referenceList = referenceCount
      ? `<div class="prep-file-list">${references.map(item => { const cloudUrl = materialCloudUrl(item); return `<div class="prep-file-row read-only">${icon('file-check-2', 18)}<div class="prep-file-main">${cloudUrl ? `<a class="file-name-link" href="${esc(cloudUrl)}" target="_blank" rel="noopener noreferrer"><strong>${esc(item.fileName)}</strong>${icon('external-link', 13)}</a>` : `<strong>${esc(item.fileName)}</strong>`}<small>${esc(item.size || '')}${item.addedAt ? ` · ${formatDate(String(item.addedAt).slice(0, 10))}` : ''}</small>${item.note ? `<p>${esc(item.note)}</p>` : ''}</div>${statusBadge(cloudUrl ? '已歸檔' : '未上傳', cloudUrl ? 'green' : 'red')}</div>`; }).join('')}${legacyOutputs.map(item => `<div class="prep-file-row read-only">${icon('archive', 18)}<div class="prep-file-main"><strong>${esc(item.title || item.fileName || '舊版備課附件')}</strong><small>舊版資料保留</small>${item.claim ? `<p>${esc(item.claim)}</p>` : ''}</div></div>`).join('')}</div>`
      : '<div class="prep-file-empty">尚未上傳教案或教材；補上一份後即可供授課紀錄選用。</div>';
    const usageList = usageRecords.length
      ? `<div class="prep-version-uses">${usageRecords.map(item => { const feedback = item.prepFeedback || {}; return `<article><div class="prep-use-head"><div><strong>${esc(item.title)}</strong><small>${formatDate(item.date)} · ${esc(item.className || '未指定班級')}</small></div>${statusBadge(prepFeedbackComplete(item) ? '回饋完整' : '待補', prepFeedbackComplete(item) ? 'green' : 'red')}</div><div class="prep-feedback-review"><div><strong>有效處</strong><p>${esc(feedback.strengths || '尚未填寫')}</p></div><div><strong>孩子共鳴</strong><p>${esc(feedback.resonance || '尚未填寫')}</p></div><div><strong>下次調整</strong><p>${esc(feedback.changes || '尚未填寫')}</p></div></div></article>`; }).join('')}</div>`
      : '<div class="prep-file-empty">這份備課檔案尚未被授課紀錄選用。</div>';
    return `<div class="notice-band info">${icon('folder-open', 19)}<div><div class="notice-title">${esc(activity.title)}</div><div class="notice-copy">${esc(activity.details?.targetCourse || '尚未分類')} · ${formatDate(activity.date)} 建立 · ${formatDate(updatedDate)} 更新</div></div></div>
      <section class="panel"><div class="panel-head"><div><div class="panel-title">${icon('book-open')}課程資料</div></div></div><div class="panel-body"><div class="metadata-list"><div class="metadata-row"><div class="metadata-label">課程名稱</div><div class="metadata-value">${esc(activity.title)}</div></div><div class="metadata-row"><div class="metadata-label">課程類型</div><div class="metadata-value">${esc(activity.details?.targetCourse || '尚未分類')}</div></div><div class="metadata-row"><div class="metadata-label">上課內容／提醒</div><div class="metadata-value">${nl2br(activity.prep?.summary || '未填寫')}</div></div></div></div></section>
      <section class="panel"><div class="panel-head"><div><div class="panel-title">${icon('paperclip')}附件</div><div class="panel-subtitle">必填 · ${referenceCount} 份</div></div></div><div class="panel-body">${referenceList}</div></section>
      <section class="panel"><div class="panel-head"><div><div class="panel-title">${icon('history')}使用紀錄</div><div class="panel-subtitle">${usageRecords.length} 次</div></div></div><div class="panel-body">${usageList}</div></section>`;
  }

  function renderDailyCourseEvidenceOverview(activity, plan, planLink) {
    const evidence = activity.evidence || [];
    const hasEvidence = evidence.some(evidenceReady);
    const source = prepSourceById(activity.prepSourceId);
    const sourceReady = prepSourceUsable(source, activity.type, activity.date);
    const feedback = activity.prepFeedback || {};
    const updatedDate = source ? String(source.updatedAt || '').slice(0, 10) || source.date : '';
    return `<section class="evidence-stage"><div class="evidence-stage-head"><span class="evidence-stage-number">1</span><div><strong>使用的備課檔案</strong><small>${source ? `${esc(source.title)} · ${formatDate(source.date)} 建立 · ${formatDate(updatedDate)} 更新` : '尚未選擇備課檔案'}</small></div>${statusBadge(sourceReady ? '可追溯' : '待補連結', sourceReady ? 'green' : 'red')}</div>${source ? `<div class="plan-evidence-link"><div><strong>${esc(source.title)}</strong><small>${esc(source.details?.targetCourse || '尚未分類')} · ${(source.prepEvidence || []).length} 份附件</small></div><button type="button" class="btn btn-small" data-action="open-evidence" data-activity-id="${source.id}">${icon('arrow-right', 14)}查看備課檔案</button></div>${source.prep?.summary ? `<div class="prep-source-summary"><strong>上課內容／提醒</strong><p>${esc(source.prep.summary)}</p></div>` : ''}` : ''}</section>
      <section class="evidence-stage"><div class="evidence-stage-head"><span class="evidence-stage-number">2</span><div><strong>課後回饋</strong><small>主管可直接看到教案成效、孩子反應與更新方向</small></div>${statusBadge(prepFeedbackComplete(activity) ? '回饋完整' : '待補回饋', prepFeedbackComplete(activity) ? 'blue' : 'red')}</div><div class="prep-feedback-review"><div><strong>這份教案／教材哪裡有效</strong><p>${esc(feedback.strengths || '尚未填寫')}</p></div><div><strong>孩子對哪個教案環節最有反應</strong><p>${esc(feedback.resonance || '尚未填寫')}</p></div><div><strong>這份教案／教材要更新什麼</strong><p>${esc(feedback.changes || '尚未填寫')}</p></div></div></section>
      <section class="evidence-stage"><div class="evidence-stage-head"><span class="evidence-stage-number">3</span><div><strong>學生實際成果與變化證據</strong><small>用作品、訂正、測試數據或可觀察行為呈現本堂結果</small></div>${statusBadge(hasEvidence ? '已上傳' : '待補', hasEvidence ? 'blue' : 'red')}</div>${evidence.length ? `<div class="evidence-grid">${evidence.map(item => renderEvidenceCard({ activity, evidence: item })).join('')}</div>` : '<div class="prep-file-empty">尚未加入成果證據。</div>'}</section>`;
  }

  function renderActivityEvidenceOverview(activity) {
    const evidence = activity.evidence || [];
    const hasEvidence = evidence.some(evidenceReady);
    if (activity.type === 'lessonprep') return renderCoursePrepEvidenceOverview(activity, null, '');
    if (activityNeedsPrepSource(activity.type)) return renderDailyCourseEvidenceOverview(activity, null, '');
    return `<div class="notice-band info">${icon('target', 19)}<div><div class="notice-title">本次工作目的</div><div class="notice-copy">${esc(activity.objective)}</div></div></div><section class="evidence-stage"><div class="evidence-stage-head"><span class="evidence-stage-number">1</span><div><strong>實際執行與後續</strong><small>此類工作不需要備課檔案或教案附件</small></div>${statusBadge('直接記錄', 'green')}</div><div class="prep-feedback-review"><div><strong>實際做法</strong><p>${esc(activity.action || '尚未填寫')}</p></div><div><strong>完成情況</strong><p>${esc(activity.result || '尚未填寫')}</p></div><div><strong>下次行動</strong><p>${esc(activity.nextAction || '尚未填寫')}</p></div></div></section><section class="evidence-stage"><div class="evidence-stage-head"><span class="evidence-stage-number">2</span><div><strong>成果與變化證據</strong><small>主管將直接判讀內容並評分</small></div>${statusBadge(hasEvidence ? '已上傳' : '待補', hasEvidence ? 'blue' : 'red')}</div>${evidence.length ? `<div class="evidence-grid">${evidence.map(item => renderEvidenceCard({ activity, evidence: item })).join('')}</div>` : `<div class="prep-file-empty">尚未加入成果證據。</div>`}</section>`;
  }

  function openEvidenceList(activityId) {
    const activity = state.activities.find(item => item.id === activityId);
    if (!activity) return;
    if (!ensureManagerScope(activity.teacher)) return;
    const isCoursePrep = activity.type === 'lessonprep';
    const canEdit = state.ui.role === 'teacher' && activity.teacher === state.context.teacher;
    openDrawer({
      title: isCoursePrep ? '備課檔案內容' : '工作證據', subtitle: activity.title,
      body: renderActivityEvidenceOverview(activity),
      footer: !canEdit
        ? `<button type="button" class="btn" data-action="close-drawer">關閉</button>`
        : isCoursePrep
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
      title: evidence ? '編輯成果證據' : '新增成果證據', subtitle: activity.title, body: `${draftRecoveryNotice(saved?.savedAt, saved?.mediaOmitted)}${renderEvidenceForm(activity, formValue)}`, wide: true,
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
    persistCurrentDrawerDraft(true);
    const existingPlan = planId ? state.lessonPlans.find(item => item.id === planId) : null;
    const basePlan = existingPlan || (sourceDraft ? planSeedFromActivityDraft(sourceDraft) : null);
    const sourceId = basePlan?.sourceActivityId || sourceDraft?.id || returnActivityDraft?.id || returnActivityDraft?.title || 'new';
    const key = drawerDraftKey('plan', planId || '', sourceId);
    const saved = getOpenDraft(key);
    const plan = saved?.kind === 'plan' && saved.payload ? saved.payload : basePlan;
    setDrawerDraftContext('plan', key, saved?.kind === 'plan' ? saved : null);
    const returningToActivity = Boolean(returnActivityDraft);
    openDrawer({
      title: '教案內容與教材',
      subtitle: returningToActivity ? '內容會儲存在同一份備課檔案中' : '集中管理課程流程、檢核方式與正式教材', body: `${draftRecoveryNotice(saved?.savedAt, saved?.mediaOmitted)}${renderPlanForm(plan)}`, wide: true,
      footer: `${existingPlan ? `<button type="button" class="btn btn-danger" style="margin-right:auto" data-action="delete-plan" data-plan-id="${existingPlan.id}">${icon('trash-2', 15)}刪除</button>` : ''}<button type="button" class="btn" data-action="${returningToActivity ? 'return-to-activity' : 'close-drawer'}">${returningToActivity ? '返回備課檔案' : '取消'}</button><button type="submit" form="plan-form" class="btn btn-primary">${icon('save', 16)}儲存教案內容</button>`,
    });
  }

  function openPlanDetail(planId) {
    const plan = state.lessonPlans.find(item => item.id === planId);
    if (!plan) return;
    if (!ensureManagerScope(plan.teacher)) return;
    const readiness = planReadiness(plan);
    const sourceActivity = prepActivityForPlan(plan);
    const canEdit = state.ui.role === 'teacher' && plan.teacher === state.context.teacher;
    openDrawer({
      title: plan.title, subtitle: sourceActivity ? `${formatDate(sourceActivity.date)} 建立 · ${plan.teacher}` : `${plan.version} · ${plan.teacher}`, body: renderPlanDetail(plan, false), wide: true,
      footer: canEdit ? `<button type="button" class="btn" data-action="close-drawer">關閉</button><button type="button" class="btn" data-action="edit-plan" data-plan-id="${plan.id}">${icon('pencil', 16)}編輯</button><button type="button" class="btn btn-primary" data-action="submit-plan-review" data-plan-id="${plan.id}" ${readiness < 100 || plan.status === 'review' ? 'disabled' : ''}>${icon('send', 16)}${plan.status === 'review' ? '已送主管檢視' : '送主管檢視（選填）'}</button>` : `<button type="button" class="btn" data-action="close-drawer">關閉</button>`,
    });
  }

  function openPlanReview(planId) {
    const plan = state.lessonPlans.find(item => item.id === planId);
    if (!plan) return;
    if (!ensureManagerScope(plan.teacher)) return;
    openDrawer({
      title: '教案審查', subtitle: `${plan.teacher} · ${plan.title}`, body: renderPlanDetail(plan, true), wide: true,
      footer: `<button type="button" class="btn" data-action="close-drawer">稍後處理</button><button type="button" class="btn" data-action="request-plan-changes" data-plan-id="${plan.id}">${icon('undo-2', 16)}退回補件</button><button type="button" id="approve-plan-button" class="btn btn-primary" data-action="approve-plan" data-plan-id="${plan.id}" disabled>${icon('badge-check', 16)}核准教案</button>`,
    });
  }

  function openSubmissionReview(submissionId, readOnly = false) {
    const submission = state.submissions.find(item => item.id === submissionId);
    if (!submission) return;
    if (!ensureManagerScope(submission.teacher, submission.department)) return;
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
    if (!ensureManagerScope(activity.teacher)) return;
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
    if (!ensureManagerScope(submission.teacher, submission.department)) return;
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
    if (!ensureManagerScope(activity.teacher)) return;
    const managerMode = state.ui.role === 'manager';
    openDrawer({
      title: evidence.title, subtitle: `${activity.teacher} · ${activity.title}`, body: renderEvidenceDetail(activity, evidence), wide: true,
      footer: managerMode ? `<button type="button" class="btn" data-action="close-drawer">稍後處理</button><button type="button" class="btn" data-action="request-evidence-clarify" data-activity-id="${activity.id}" data-evidence-id="${evidence.id}">${icon('message-square-warning', 16)}要求補充</button><button type="button" class="btn btn-primary" data-action="accept-evidence" data-activity-id="${activity.id}" data-evidence-id="${evidence.id}">${icon('badge-check', 16)}採認證據</button>` : `<button type="button" class="btn" data-action="close-drawer">關閉</button><button type="button" class="btn btn-primary" data-action="edit-evidence" data-activity-id="${activity.id}" data-evidence-id="${evidence.id}">${icon('pencil', 16)}編輯證據</button>`,
    });
  }

  function openOperationReview(operationId) {
    const operation = operationRecordById(operationId);
    if (!operation || !operation.confirmedAt) return;
    if (!ensureManagerScope(operation.dutyOwner, operation.room)) return;
    openDrawer({
      title: '班務稽核', subtitle: `${operation.dutyOwner} · ${formatDate(operation.date)} · ${operation.room}`, body: renderOperationReview(operation), wide: true,
      footer: `<button type="button" class="btn" data-action="close-drawer">稍後處理</button><button type="button" class="btn" data-action="request-operation-clarify" data-operation-id="${operation.id}">${icon('message-square-warning', 16)}要求補充</button><button type="button" class="btn btn-primary" data-action="accept-operation" data-operation-id="${operation.id}">${icon('badge-check', 16)}通過稽核</button>`,
    });
  }

  function openCaseDetail(caseId) {
    const item = state.studentCases.find(entry => entry.id === caseId);
    if (!item) return;
    if (!ensureManagerScope(item.teacher)) return;
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
    const coursePreps = state.activities.filter(activity => activity.type === 'lessonprep' && activity.teacher === state.context.teacher);
    const materials = coursePreps.flatMap(activity => activity.prepEvidence || []);
    const archivedMaterials = materials.filter(material => materialCloudUrl(material)).length;
    const syncedCoursePreps = coursePreps.filter(activity => activity.cloudSyncStatus === 'saved' && activity.cloudUpdatedAt).length;
    const ownTasks = state.tasks.filter(task => task.owner === state.context.teacher);
    const syncedTasks = ownTasks.filter(task => task.cloudSyncStatus === 'saved' && task.cloudUpdatedAt).length;
    const openDraftCount = Object.keys(openDraftStore).length;
    const checks = [
      { label: '本機儲存讀寫', tone: storageWritable ? 'good' : 'bad', value: storageWritable ? '正常' : '失敗', copy: storageWritable ? '瀏覽器允許本系統讀寫資料。' : '請勿關閉頁面；可能是隱私模式、瀏覽器限制或空間不足。' },
      { label: '主要資料解析', tone: primaryReadable && !runtimeHealth.loadIssue ? 'good' : primaryReadable ? 'warn' : 'bad', value: primaryReadable ? '可讀取' : '無法讀取', copy: runtimeHealth.loadIssue || '目前資料結構可正常載入。' },
      { label: '最近一次儲存', tone: runtimeHealth.lastPersistOk ? 'good' : 'bad', value: runtimeHealth.lastPersistOk ? (formatTime(runtimeHealth.lastPersistAt) || '尚未寫入') : '失敗', copy: runtimeHealth.persistError || '沒有未處理的儲存錯誤。' },
      { label: '本機使用量', tone: usageTone, value: formatStorageUsage(usage), copy: usageTone === 'good' ? '容量仍在建議範圍內。' : usageTone === 'warn' ? '接近瀏覽器常見上限，建議減少不必要照片。' : '已接近容量上限，請先移除部分照片再繼續。' },
      { label: '成果附件', tone: attachmentCount > 0 ? 'good' : 'warn', value: `${attachmentCount} 份`, copy: '成果照片會先縮圖壓縮，正式送出時上傳至雲端。' },
      { label: '備課附件', tone: materials.length && archivedMaterials === materials.length ? 'good' : 'bad', value: materials.length ? `${archivedMaterials}/${materials.length} 已歸檔` : '缺少附件', copy: !materials.length ? '每份備課檔案至少要有一份教案或教材。' : archivedMaterials === materials.length ? '所有附件都可由主管開啟原始檔。' : '有附件只剩檔名，請回到備課檔案重新上傳。' },
      { label: '備課檔案雲端', tone: !state.integration.cloudSyncEnabled || !coursePreps.length || syncedCoursePreps === coursePreps.length ? 'good' : 'bad', value: state.integration.cloudSyncEnabled ? `${syncedCoursePreps}/${coursePreps.length} 已同步` : '審查模式', copy: !coursePreps.length ? '目前尚未建立備課檔案。' : syncedCoursePreps === coursePreps.length ? '備課內容可在其他裝置還原。' : '有備課檔案只留在目前裝置，請重新儲存完成同步。' },
      { label: '追蹤事項雲端', tone: !state.integration.cloudSyncEnabled || !ownTasks.length || syncedTasks === ownTasks.length ? 'good' : 'warn', value: state.integration.cloudSyncEnabled ? `${syncedTasks}/${ownTasks.length} 已同步` : '審查模式', copy: !ownTasks.length ? '目前沒有追蹤事項。' : syncedTasks === ownTasks.length ? '事項已納入跨裝置與排程提醒。' : '尚有事項等待同步，送出日報時會再次補送。' },
      { label: '未送出暫存', tone: 'good', value: `${openDraftCount} 份`, copy: openDraftCount ? '重新打開對應表單即可繼續填寫。' : '目前沒有待恢復的表單內容。' },
    ];
    if (state.integration.cloudSyncEnabled) {
      checks.push({ label: '正式雲端身分', tone: cloudIdentityReady() ? 'good' : 'bad', value: cloudIdentityReady() ? '相符' : '未完成', copy: formalIdentityMessage() });
    }
    return checks;
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
    const session = legacySession();
    const canOpenTestView = session?.role === 'admin'
      && !window.AUTH?.isImpersonating?.()
      && normalizeReviewNickname(session.nickname) === normalizeReviewNickname('柏翰');
    const visualTheme = currentVisualTheme();
    const storageNotice = state.integration.cloudSyncEnabled
      ? `<div class="notice-band success">${icon('cloud', 19)}<div><div class="notice-title">正式雲端送出已啟用</div><div class="notice-copy">送出時會核對登入身分，並將照片與日報存入雲端。</div></div></div>`
      : `<div class="notice-band info">${icon('database', 19)}<div><div class="notice-title">目前為審查模式</div><div class="notice-copy">資料保存在這台裝置，不會通知真人主管。</div></div></div>`;
    openDialog({
      title: '使用者與介面',
      body: `<div class="teacher-status"><span class="status-avatar">${esc(person.initials || person.nickname.slice(0, 2))}</span><div><div class="table-primary">${esc(person.nickname)}</div><div class="table-secondary">${esc(person.department)} · ${esc(sessionRoleLabel(session?.role || (state.ui.role === 'manager' ? 'manager' : 'teacher')))}</div></div></div><div class="section-divider"></div><section class="visual-mode-setting" aria-labelledby="visual-mode-title"><div class="visual-mode-heading"><div><strong id="visual-mode-title">介面風格</strong><small>只調整外觀，工作紀錄與上傳資料不會改變</small></div><span class="badge outline">可隨時切換</span></div><div class="theme-choice-group" role="group" aria-label="選擇介面風格"><button type="button" class="theme-choice ${visualTheme === 'playful' ? 'active' : ''}" data-action="set-visual-theme" data-theme="playful" aria-pressed="${visualTheme === 'playful'}"><span class="theme-choice-icon playful">${icon('sparkles', 18)}</span><span><strong>布拉克可愛版</strong><small>暖色背景、角色圖案與清楚的品牌色按鈕</small></span><span class="theme-choice-check">${visualTheme === 'playful' ? icon('check', 15) : ''}</span></button><button type="button" class="theme-choice ${visualTheme === 'calm' ? 'active' : ''}" data-action="set-visual-theme" data-theme="calm" aria-pressed="${visualTheme === 'calm'}"><span class="theme-choice-icon">${icon('align-justify', 18)}</span><span><strong>清爽版</strong><small>減少色彩與裝飾，適合偏好簡潔的老師</small></span><span class="theme-choice-check">${visualTheme === 'calm' ? icon('check', 15) : ''}</span></button></div></section><div class="section-divider"></div>${storageNotice}`,
      footer: `${session ? `<button type="button" class="btn" data-action="${window.AUTH?.isImpersonating?.() ? 'exit-impersonation' : 'logout'}">${icon(window.AUTH?.isImpersonating?.() ? 'undo-2' : 'log-out', 15)}${window.AUTH?.isImpersonating?.() ? '回到測試人員清單' : '登出／更換帳號'}</button>${canOpenTestView ? `<button type="button" class="btn btn-primary" data-action="open-test-view">${icon('scan-eye', 15)}測試老師視角</button>` : ''}` : `<button type="button" class="btn btn-danger" data-action="reset-demo">${icon('rotate-ccw', 15)}清空審查資料</button>`}<button type="button" class="btn" data-action="open-health">${icon('activity', 15)}健康檢查</button><button type="button" class="btn" data-action="close-dialog">關閉</button>`,
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

  function captureActivityCommonFields(type = activityDraft?.type) {
    if (!activityDraft || !type) return {};
    const fields = {
      objective: String($('#activity-objective')?.value || '').trim(),
      action: String($('#activity-action')?.value || '').trim(),
      result: String($('#activity-result')?.value || '').trim(),
      issue: String($('#activity-issue')?.value || '').trim(),
      nextAction: String($('#activity-next')?.value || '').trim(),
      owner: String($('#activity-owner')?.value || activityDraft.owner || state.context.teacher).trim(),
      dueDate: String($('#activity-due')?.value || activityDraft.dueDate || ''),
    };
    if (!activityNeedsPrepSource(type)) {
      activityDraft.commonCache = activityDraft.commonCache || {};
      activityDraft.commonCache[type] = fields;
      Object.assign(activityDraft, fields);
    }
    return fields;
  }

  function captureCoursePrepFormDraft() {
    const form = $('#course-prep-form');
    if (!form || !activityDraft) return activityDraft;
    const data = new FormData(form);
    Object.assign(activityDraft, {
      id: String(data.get('id') || activityDraft.id || ''),
      type: 'lessonprep',
      title: String(data.get('title') || '').trim(),
      className: '',
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
    const feedbackOnly = activityNeedsPrepSource(type);
    const title = String(data.get('title') || '').trim();
    const className = activityTrack(type) === 'enrichment' ? title : String(data.get('className') || '').trim();
    const details = feedbackOnly ? {} : clone(activityDraft.detailCache?.[type] || activityDraft.details || {});
    Object.assign(activityDraft, {
      id: String(data.get('id') || activityDraft.id || ''),
      type,
      title,
      className,
      students: type === 'classroom' ? data.getAll('students') : [],
      details,
      prepSourceId: String(data.get('prepSourceId') || activityDraft.prepSourceId || ''),
      planId: String(data.get('planId') || prepSourceById(data.get('prepSourceId'))?.planId || ''),
      objective: feedbackOnly ? '' : String(data.get('objective') || '').trim(),
      action: feedbackOnly ? '' : String(data.get('action') || '').trim(),
      result: feedbackOnly ? '' : String(data.get('result') || '').trim(),
      issue: feedbackOnly ? '' : String(data.get('issue') || '').trim(),
      nextAction: feedbackOnly ? '' : String(data.get('nextAction') || '').trim(),
      owner: feedbackOnly ? '' : String(data.get('owner') || state.context.teacher).trim(),
      dueDate: feedbackOnly ? '' : String(data.get('dueDate') || ''),
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

  async function saveCoursePrepForm(form) {
    if (!form.reportValidity()) return;
    const draft = captureCoursePrepFormDraft();
    if (!(draft?.prepEvidence || []).some(item => materialCloudUrl(item))) {
      toast('請至少上傳一份教案或教材，並等待顯示「已歸檔」後再儲存', 'danger');
      return;
    }
    const data = new FormData(form);
    const id = String(data.get('id') || uid('prep'));
    if (form.elements.id) form.elements.id.value = id;
    if (activityDraft) activityDraft.id = id;
    const existing = state.activities.find(item => item.id === id && item.type === 'lessonprep');
    const normalizedTitle = String(data.get('title') || '').trim().replace(/\s+/g, ' ').toLowerCase();
    const normalizedCourseType = String(data.get('targetCourse') || '').trim().replace(/\s+/g, ' ').toLowerCase();
    const duplicate = state.activities.find(item => item.type === 'lessonprep'
      && item.id !== id
      && backendNickname(item.teacher) === backendNickname(state.context.teacher)
      && String(item.title || '').trim().replace(/\s+/g, ' ').toLowerCase() === normalizedTitle
      && String(item.details?.targetCourse || '').trim().replace(/\s+/g, ' ').toLowerCase() === normalizedCourseType);
    if (duplicate) {
      toast('已有相同課程類型與名稱的備課檔案，請回到列表直接編輯原檔案', 'danger');
      return;
    }
    const planId = String(data.get('planId') || draft?.planId || '');
    const item = {
      id,
      date: existing?.date || state.daily.date,
      updatedAt: new Date().toISOString(),
      teacher: existing?.teacher || state.context.teacher,
      type: 'lessonprep',
      title: String(data.get('title') || '').trim(),
      className: '',
      students: [],
      details: { targetCourse: String(data.get('targetCourse') || '') },
      prepSourceId: '',
      planId,
      objective: '', action: '', result: '', issue: '', nextAction: '',
      owner: existing?.owner || state.context.teacher,
      dueDate: '',
      status: 'complete',
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
    persist();
    try {
      await saveCoursePrepToCloud(item);
    } catch (error) {
      if (!existing && /已有相同課程類型與名稱/.test(String(error.message || ''))) {
        state.activities = state.activities.filter(activity => activity.id !== id);
        if (form.elements.id) form.elements.id.value = '';
        if (activityDraft) activityDraft.id = '';
        persist();
        updateSaveIndicator('error', '已有同名檔案，未重複建立');
        toast(error.message, 'danger');
        return;
      }
      if (form.elements.id) form.elements.id.value = id;
      activityDraft = clone(item);
      updateSaveIndicator('error', '本機已保留，雲端尚未同步');
      toast(`備課檔案已保留在這台裝置；雲端同步失敗：${error.message || '請稍後重試'}`, 'danger');
      return;
    }
    clearCurrentDrawerDraft();
    closeDrawer();
    renderApp();
    toast('備課檔案已儲存，可於工作紀錄選用', 'success');
  }

  function saveActivityForm(form) {
    if (!form.reportValidity()) return;
    captureActivityDetailFields(activityDraft?.type);
    capturePrepEvidenceRows();
    capturePrepFeedbackFields();
    const data = new FormData(form);
    const id = data.get('id') || uid('act');
    const existing = state.activities.find(item => item.id === id);
    const type = String(data.get('type') || '');
    const formTrack = form.dataset.activityTrack || activityTrack(type);
    if (!ACTIVITY_TYPES[type] || activityTrack(type) !== formTrack || (ACTIVITY_TYPES[type].selectable === false && !existing)) {
      toast('工作類型與目前入口不一致，請重新開啟表單', 'danger');
      return;
    }
    const prepSourceId = activityNeedsPrepSource(type) ? String(data.get('prepSourceId') || activityDraft?.prepSourceId || '') : '';
    const prepSource = prepSourceById(prepSourceId);
    const prepEvidence = [];
    const feedbackOnly = activityNeedsPrepSource(type);
    const title = String(data.get('title') || '').trim();
    const className = activityTrack(type) === 'enrichment' ? title : String(data.get('className') || '').trim();
    const details = feedbackOnly ? {} : clone(activityDraft?.detailCache?.[type] || activityDraft?.details || {});
    const activity = {
      id,
      date: existing ? existing.date : state.daily.date,
      teacher: existing ? existing.teacher : state.context.teacher,
      type,
      title,
      className,
      students: type === 'classroom' ? data.getAll('students') : [],
      details,
      prepSourceId,
      planId: prepSource?.planId || '',
      objective: feedbackOnly ? '' : String(data.get('objective') || '').trim(),
      action: feedbackOnly ? '' : String(data.get('action') || '').trim(),
      result: feedbackOnly ? '' : String(data.get('result') || '').trim(),
      issue: feedbackOnly ? '' : String(data.get('issue') || '').trim(),
      nextAction: feedbackOnly ? '' : String(data.get('nextAction') || '').trim(),
      owner: feedbackOnly ? '' : String(data.get('owner') || state.context.teacher).trim(),
      dueDate: feedbackOnly ? '' : String(data.get('dueDate') || ''),
      status: 'complete',
      prep: { summary: '', adjustment: '' },
      prepFeedback: activityNeedsPrepSource(type) ? {
        strengths: String(data.get('prepStrengths') || '').trim(),
        resonance: String(data.get('studentResonance') || '').trim(),
        changes: String(data.get('prepChanges') || '').trim(),
      } : { strengths: '', resonance: '', changes: '' },
      prepEvidence,
      evidence: existing ? clone(existing.evidence || []) : [],
    };
    const feedbackSummary = activityFeedbackSummary(activity);
    if (feedbackSummary) activity.evidence.forEach(evidence => { evidence.claim = feedbackSummary; });
    const missingDetails = feedbackOnly ? [] : activityDetailSchema(activity.type).filter(field => String(activity.details[field.key] || '').length < field.min);
    if (missingDetails.length) {
      toast(`請完整填寫：${missingDetails.map(field => field.label).join('、')}`, 'danger');
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
    if (feedbackOnly) state.tasks = state.tasks.filter(task => task.ref !== `activity:${id}`);
    else upsertDerivedTask(`activity:${id}`, activity.nextAction, '工作紀錄', activity.owner, activity.dueDate, activity.issue ? 'high' : 'medium');
    markDailyNeedsResubmit(activity.date, activity.teacher);
    clearCurrentDrawerDraft();
    closeDrawer();
    persist();
    scheduleDailyCloudDraftSync();
    renderApp();
    toast(planPending ? '工作草稿已儲存；請先完成備課教案內容與教材' : '工作紀錄已儲存', planPending ? '' : 'success');
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
    markDailyNeedsResubmit(item.date, item.teacher);
    upsertDerivedTask(`case:${id}`, `${item.student}｜${item.nextAction}`, '學生追蹤', item.teacher, item.dueDate, item.urgency === 'high' ? 'high' : 'medium', item.status === 'closed');
    clearCurrentDrawerDraft();
    closeDrawer(); persist(); scheduleDailyCloudDraftSync(); renderApp(); toast('學生追蹤已儲存', 'success');
  }

  function saveContactForm(form) {
    if (!form.reportValidity()) return;
    const data = new FormData(form);
    const id = data.get('id') || uid('contact');
    const existing = state.contacts.find(item => item.id === id);
    const item = {
      id, date: existing ? existing.date : state.daily.date, teacher: existing ? existing.teacher : state.context.teacher,
      student: data.get('student'), channel: data.get('channel'), topic: String(data.get('topic') || '').trim(), summary: String(data.get('summary') || '').trim(),
      decision: String(data.get('decision') || '').trim(), nextAction: '', dueDate: data.get('dueDate'), status: data.get('status'),
    };
    if (existing) Object.assign(existing, item);
    else state.contacts.unshift(item);
    state.daily.parentStatus = 'recorded';
    markDailyNeedsResubmit(item.date, item.teacher);
    upsertDerivedTask(`contact:${id}`, `${item.student}｜${item.decision}`, '親師溝通', item.teacher, item.dueDate, 'medium', item.status === 'closed');
    clearCurrentDrawerDraft();
    closeDrawer(); persist(); scheduleDailyCloudDraftSync(); renderApp(); toast('親師溝通已儲存', 'success');
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
      return !item.fileName || !attachmentAvailable(item) || !['normal', 'exception'].includes(item.status);
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
    markDailyNeedsResubmit(state.operations.date, state.operations.dutyOwner);
    persist(); scheduleDailyCloudDraftSync(); renderApp(); toast('班務檢核已送主管稽核', 'success');
  }

  function saveDailySummaryForm(form, notify = true) {
    const data = new FormData(form);
    const summary = buildDailySummary();
    state.daily.summary.keyResult = summary.keyResult;
    state.daily.summary.followup = summary.followup;
    state.daily.summary.tomorrowPriority = summary.tomorrowPriority;
    state.daily.summary.teacherNote = String(data.get('teacherNote') || '').trim();
    markDailyNeedsResubmit();
    persist();
    if (notify) {
      scheduleDailyCloudDraftSync();
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
    const task = { id: uid('task'), title: data.get('title').trim(), source: data.get('source'), owner: state.context.teacher, dueDate: data.get('dueDate'), status: 'open', priority: data.get('priority') };
    state.tasks.unshift(task);
    scheduleTaskCloudSync(task);
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
    scheduleTaskCloudSync(task);
  }

  async function syncTaskToCloud(task) {
    if (!task || !state.integration.cloudSyncEnabled) return { ok: true, localOnly: true };
    if (!cloudIdentityReady() || task.owner !== state.context.teacher) return { ok: false, error: '事項身分不符' };
    if (!window.API?.saveSelfTask) return { ok: false, error: '事項雲端服務尚未載入' };
    task.cloudSyncStatus = 'saving';
    const cloudTask = { ...task, source: taskDetailText(task) || task.source };
    const result = await API.saveSelfTask({ nickname: cloudTeacherNickname(), task: removeInlineMedia(cloudTask) });
    task.cloudSyncStatus = result?.ok ? 'saved' : 'error';
    if (result?.ok) task.cloudUpdatedAt = result.updated_at || new Date().toISOString();
    return result;
  }

  async function flushTaskCloudSync() {
    window.clearTimeout(taskSyncTimer);
    taskSyncTimer = null;
    if (!state.integration.cloudSyncEnabled || !cloudIdentityReady()) return { ok: true, failed: 0 };
    const ids = Array.from(pendingTaskSyncIds);
    pendingTaskSyncIds.clear();
    let failed = 0;
    for (const id of ids) {
      const task = state.tasks.find(item => item.id === id && item.owner === state.context.teacher);
      if (!task) continue;
      const result = await syncTaskToCloud(task);
      if (!result?.ok) failed += 1;
    }
    persist();
    return { ok: failed === 0, failed };
  }

  function scheduleTaskCloudSync(task) {
    if (!task?.id || !state.integration.cloudSyncEnabled || !cloudIdentityReady()) return;
    pendingTaskSyncIds.add(task.id);
    window.clearTimeout(taskSyncTimer);
    taskSyncTimer = window.setTimeout(flushTaskCloudSync, 900);
  }

  async function syncAllTasksToCloud() {
    const ownTasks = state.tasks.filter(task => task.owner === state.context.teacher);
    ownTasks.forEach(task => pendingTaskSyncIds.add(task.id));
    return flushTaskCloudSync();
  }

  async function syncTasksFromCloud(session = legacySession()) {
    if (!session || session.role !== 'teacher' || !window.API?.listTasks) return { ok: false, imported: 0 };
    const result = await API.listTasks({ viewer: session.nickname });
    if (!result?.ok) return { ok: false, imported: 0, error: result?.error || '事項讀取失敗' };
    let imported = 0;
    (result.tasks || []).forEach(remote => {
      const id = String(remote.task_id || '');
      if (!id) return;
      const existing = state.tasks.find(task => task.id === id);
      const remoteDetail = String(remote.detail || '').trim();
      const knownSources = ['老師自建', '主管交辦', '學生追蹤', '工作紀錄', '親師溝通'];
      const createdBy = String(remote.created_by || '').trim();
      const assignee = String(remote.assignee || session.nickname || '').trim();
      const source = knownSources.includes(remoteDetail)
        ? remoteDetail
        : createdBy && createdBy !== assignee ? '主管交辦' : '老師自建';
      const item = {
        id, title: String(remote.title || ''), detail: knownSources.includes(remoteDetail) ? '' : remoteDetail, source, owner: state.context.teacher,
        dueDate: String(remote.due_date || '').slice(0, 10), status: remote.status === 'done' ? 'done' : 'open',
        priority: String(remote.due_date || '') < state.daily.date ? 'high' : 'medium', createdBy,
        cloudSyncStatus: 'saved', cloudUpdatedAt: remote.updated_at || '',
      };
      if (existing) Object.assign(existing, item);
      else { state.tasks.push(item); imported += 1; }
    });
    persist('追蹤事項已更新');
    return { ok: true, imported };
  }

  async function refreshTaskCloudData(notify = false) {
    const session = legacySession();
    integrationRuntime.taskSyncStatus = 'loading';
    integrationRuntime.taskSyncMessage = '正在讀取追蹤事項';
    renderApp();
    const result = await syncTasksFromCloud(session);
    integrationRuntime.taskSyncStatus = result.ok ? 'saved' : 'error';
    integrationRuntime.taskSyncMessage = result.ok
      ? `已更新 ${result.imported || 0} 項追蹤事項`
      : (result.error || '追蹤事項讀取失敗');
    renderApp();
    if (notify) {
      toast(result.ok ? integrationRuntime.taskSyncMessage : `追蹤事項讀取失敗：${integrationRuntime.taskSyncMessage}`, result.ok ? 'success' : 'danger');
    }
    return result;
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
    const activityId = String(data.get('activityId') || '');
    const linkedActivity = state.activities.find(item => item.id === activityId);
    evidenceDraft.students = linkedActivity?.type === 'classroom' ? data.getAll('students') : [];
    evidenceDraft.privacy = data.get('privacy') === 'on';
    $$('[data-evidence-attachment-note]', form).forEach(control => {
      const attachment = evidenceDraft.attachments?.find(item => item.id === control.dataset.attachmentId);
      if (attachment) attachment.note = String(control.value || '').trim();
    });
    return syncEvidencePrimaryFields(evidenceDraft);
  }

  function updateEvidenceQualityFromForm() {
    syncEvidenceDraftFromForm();
  }

  function saveEvidenceForm(form) {
    if (!form.reportValidity()) return;
    const draft = syncEvidenceDraftFromForm();
    const attachments = evidenceAttachments(draft);
    if (!draft || !attachments.length) {
      toast('請先選擇照片或檔案', 'danger');
      return;
    }
    const score = evidenceQuality(draft);
    const item = {
      id: draft.id || uid('ev'), fileName: draft.fileName, mimeType: draft.mimeType, dataUrl: draft.dataUrl || '', type: draft.type,
      stage: draft.stage, title: draft.title, claim: draft.claim, observation: draft.observation, students: draft.students,
      privacy: draft.privacy, pins: clone(draft.pins || []), quality: score, status: evidenceReady(draft) ? 'pending' : 'draft',
      createdAt: draft.createdAt || new Date().toISOString(), placeholder: !attachments.some(attachmentAvailable),
      attachments: clone(attachments), primaryAttachmentId: draft.primaryAttachmentId || attachments[0].id,
    };
    const activityId = form.elements.activityId.value;
    let linkedDailyDate = state.daily.date;
    let linkedDailyTeacher = state.context.teacher;
    if (activityId === 'operations') {
      state.operations.evidence = item;
      linkedDailyDate = state.operations.date;
      linkedDailyTeacher = state.operations.dutyOwner;
    } else {
      const activity = state.activities.find(entry => entry.id === activityId);
      if (!activity) return;
      linkedDailyDate = activity.date;
      linkedDailyTeacher = activity.teacher;
      activity.evidence = activity.evidence || [];
      const existing = activity.evidence.find(entry => entry.id === item.id);
      if (existing) Object.assign(existing, item);
      else activity.evidence.push(item);
      activity.status = activityComplete(activity) ? 'complete' : 'evidence-needed';
    }
    markDailyNeedsResubmit(linkedDailyDate, linkedDailyTeacher);
    state.ui.evidenceStandardsSeen = true;
    clearCurrentDrawerDraft();
    evidenceDraft = null;
    closeDrawer(); persist(); scheduleDailyCloudDraftSync(); renderApp();
    toast('成果證據已儲存，內容將由主管判讀與評分', 'success');
  }

  function capturePlanForm() {
    const form = $('#plan-form');
    if (!form || !planDraft) return planDraft;
    const data = new FormData(form);
    Object.assign(planDraft, {
      id: data.get('id') || planDraft.id,
      teacher: planDraft.teacher || state.context.teacher,
      title: String(data.get('title') || '').trim(), courseType: data.get('courseType'), className: planDraft.className || '',
      duration: Number(data.get('duration') || 0), version: String(data.get('version') || '').trim(), sourceActivityId: String(data.get('sourceActivityId') || planDraft.sourceActivityId || ''),
      learnerContext: String(data.get('learnerContext') || '').trim(), objectives: String(data.get('objectives') || '').trim(),
      assessment: String(data.get('assessment') || '').trim(), differentiation: planDraft.differentiation || '',
      safetyPrivacy: planDraft.safetyPrivacy || '', reflection: String(data.get('reflection') || '').trim(),
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
    scheduleCurrentDrawerDraft();
  }

  async function savePlanForm(form) {
    if (!form.reportValidity()) return;
    const value = capturePlanForm();
    const id = value.id || uid('plan');
    const existing = state.lessonPlans.find(item => item.id === id);
    value.id = id;
    value.status = existing ? existing.status : 'draft';
    if (existing) Object.assign(existing, clone(value));
    else state.lessonPlans.unshift(clone(value));
    let sourceActivity = null;
    if (value.sourceActivityId) {
      sourceActivity = state.activities.find(item => item.id === value.sourceActivityId);
      if (sourceActivity) {
        sourceActivity.planId = id;
        sourceActivity.updatedAt = new Date().toISOString();
        syncPlanIdentityFromPrep(value, sourceActivity);
        const savedPlan = state.lessonPlans.find(item => item.id === id);
        if (savedPlan) syncPlanIdentityFromPrep(savedPlan, sourceActivity);
      }
    }
    const activityToRestore = returnActivityDraft ? clone(returnActivityDraft) : null;
    persist();
    let cloudError = '';
    if (sourceActivity) {
      try {
        await saveCoursePrepToCloud(sourceActivity);
      } catch (error) {
        cloudError = error.message || '雲端同步失敗';
      }
    }
    clearCurrentDrawerDraft();
    if (activityToRestore) {
      activityToRestore.planId = id;
      returnActivityDraft = null;
      showActivityEditor(activityToRestore);
      toast(cloudError ? `教案已保留在這台裝置；${cloudError}` : '教案內容與教材已儲存並帶回同一份備課檔案', cloudError ? 'danger' : 'success');
      return;
    }
    closeDrawer(); renderApp(); toast(cloudError ? `教案已保留在這台裝置；${cloudError}` : '教案內容與教材已儲存', cloudError ? 'danger' : 'success');
  }

  function planMaterialCategory(fileName) {
    const ext = String(fileName).split('.').pop().toLowerCase();
    if (['ppt', 'pptx', 'key'].includes(ext)) return 'slides';
    if (['pdf', 'doc', 'docx'].includes(ext)) return 'worksheet';
    if (['xls', 'xlsx', 'csv'].includes(ext)) return 'assessment';
    return 'other';
  }

  function materialCloudUrl(material) {
    const value = String(material?.cloudUrl || material?.url || '').trim();
    return /^https:\/\/[^\s"'<>]+$/i.test(value) ? value : '';
  }

  function readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(reader.error || new Error('檔案讀取失敗'));
      reader.readAsDataURL(file);
    });
  }

  async function uploadPlanMaterial(file) {
    if (file.size > MAX_DOCUMENT_FILE_BYTES) throw new Error(`${file.name} 超過 25 MB 上限`);
    if (!state.integration.cloudSyncEnabled) throw new Error('請先到「帳號與通知」啟用雲端送出');
    const identity = await ensureCloudTeacherIdentity();
    if (!identity.ok) throw new Error(identity.error || '請先登入目前老師的正式帳號');
    if (!window.API?.uploadFile) throw new Error('教材雲端服務尚未載入');

    const dataUrl = await readFileAsDataUrl(file);
    const payload = dataUrlPayload(dataUrl);
    if (!payload) throw new Error(`${file.name} 無法讀取`);
    const category = planMaterialCategory(file.name);
    let result = await API.uploadFile({
      nickname: cloudTeacherNickname(),
      date: state.daily.date,
      fileName: file.name,
      mimeType: file.type || payload.mimeType || 'application/octet-stream',
      base64: payload.base64,
      category,
    });
    if (!result?.ok && String(result?.error || '').includes('Unknown action') && (file.type || payload.mimeType).startsWith('image/')) {
      result = await API.uploadPhoto({
        nickname: cloudTeacherNickname(), date: state.daily.date, kpi: 3,
        mimeType: file.type || payload.mimeType, base64: payload.base64, description: `正式教材：${file.name}`,
      });
    }
    if (!result?.ok) throw new Error(result?.error || `${file.name} 上傳失敗`);
    return {
      id: uid('mat'), category, name: result.fileName || file.name, size: formatFileSize(file.size), status: 'ready',
      mimeType: file.type || payload.mimeType || '', cloudUrl: result.url || '', cloudFileId: result.fileId || '', uploadedAt: new Date().toISOString(),
    };
  }

  function formatFileSize(bytes) {
    if (!bytes) return '0 KB';
    if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  }

  function createDailySubmissionRecord(existing = null) {
    const submittedAt = new Date().toISOString();
    return {
      id: existing ? existing.id : uid('sub'), date: state.daily.date, teacher: state.context.teacher, department: state.context.department,
      submittedAt, status: 'pending', activityIds: todayActivities().map(item => item.id),
      studentCaseIds: state.studentCases.filter(item => item.date === state.daily.date && item.teacher === state.context.teacher).map(item => item.id),
      contactIds: state.contacts.filter(item => item.date === state.daily.date && item.teacher === state.context.teacher).map(item => item.id),
      activitySnapshots: todayActivities().map(clone),
      studentCaseSnapshots: state.studentCases.filter(item => item.date === state.daily.date && item.teacher === state.context.teacher).map(clone),
      contactSnapshots: state.contacts.filter(item => item.date === state.daily.date && item.teacher === state.context.teacher).map(clone),
      keyResult: state.daily.summary.keyResult, followup: state.daily.summary.followup, tomorrowPriority: state.daily.summary.tomorrowPriority,
      teacherNote: state.daily.summary.teacherNote || '', parentStatus: state.daily.parentStatus || '',
      parentHandoffConfirmed: Boolean(state.daily.parentHandoffConfirmed), parentHandoffNote: state.daily.parentHandoffNote || '',
      feedback: existing?.feedback || '',
    };
  }

  function removeInlineMedia(value) {
    const snapshot = clone(value);
    const walk = item => {
      if (!item || typeof item !== 'object') return;
      if (Array.isArray(item)) {
        item.forEach(walk);
        return;
      }
      Object.keys(item).forEach(key => {
        if (key === 'dataUrl') item[key] = '';
        else walk(item[key]);
      });
    };
    walk(snapshot);
    return snapshot;
  }

  function buildCloudSnapshot(submission) {
    const prepIds = new Set((submission.activitySnapshots || []).map(item => item.prepSourceId).filter(Boolean));
    const prepSources = state.activities.filter(item => item.type === 'lessonprep' && item.teacher === submission.teacher && prepIds.has(item.id));
    const planIds = new Set(prepSources.map(item => item.planId).filter(Boolean));
    const operation = state.operations?.date === submission.date && state.operations?.dutyOwner === submission.teacher ? state.operations : null;
    return removeInlineMedia({
      schema: 'anqin-v2', version: 1, savedAt: new Date().toISOString(),
      submission,
      daily: {
        parentStatus: state.daily.parentStatus,
        parentHandoffConfirmed: Boolean(state.daily.parentHandoffConfirmed),
        parentHandoffNote: state.daily.parentHandoffNote || '',
        noStudentFollowupConfirmed: state.daily.noStudentFollowupConfirmed,
        summary: clone(state.daily.summary || {}),
        status: state.daily.status,
        submittedAt: state.daily.submittedAt,
      },
      prepSources,
      lessonPlans: state.lessonPlans.filter(plan => plan.teacher === submission.teacher && planIds.has(plan.id)),
      operation,
    });
  }

  function activityKpiNumber(activity) {
    if (activity.type === 'tutoring') return 1;
    if (['project', 'robotics', 'portfolio'].includes(activity.type)) return 2;
    if (['classroom', 'sel'].includes(activity.type)) return 3;
    return 5;
  }

  function dataUrlPayload(dataUrl) {
    const match = String(dataUrl || '').match(/^data:([^;,]+)(?:;[^,]*)?;base64,(.+)$/);
    return match ? { mimeType: match[1], base64: match[2] } : null;
  }

  async function uploadFormalEvidence() {
    const nickname = cloudTeacherNickname();
    const attachments = [];
    const upload = async ({ item, kpi, description, forType, activityId = '', evidenceId = '', attachmentId = '' }) => {
      const existingCloudUrl = materialCloudUrl(item);
      const isImage = String(item.mimeType || '').startsWith('image/');
      if (existingCloudUrl) {
        attachments.push({ type: isImage ? 'photo' : 'file', url: existingCloudUrl, fileId: item.cloudFileId || '', fileName: item.fileName || '成果附件', mimeType: item.mimeType || '', kpi, description, forType, activityId, evidenceId, attachmentId: attachmentId || item.id || '' });
        return;
      }
      const payload = dataUrlPayload(item.dataUrl);
      if (!payload) return;
      integrationRuntime.cloudMessage = `正在上傳 ${item.fileName || '照片'}`;
      updateSaveIndicator('saving', integrationRuntime.cloudMessage);
      const result = isImage
        ? await API.uploadPhoto({ nickname, date: state.daily.date, kpi, mimeType: payload.mimeType, base64: payload.base64, description })
        : await API.uploadFile({ nickname, date: state.daily.date, fileName: item.fileName, mimeType: item.mimeType || payload.mimeType, base64: payload.base64, category: 'evidence' });
      if (!result?.ok) throw new Error(result?.error || `${item.fileName || '照片'}上傳失敗`);
      item.cloudUrl = result.url;
      item.cloudFileId = result.fileId;
      item.dataUrl = '';
      item.placeholder = false;
      item.uploadStatus = 'uploaded';
      attachments.push({ type: isImage ? 'photo' : 'file', url: result.url, fileId: result.fileId, fileName: item.fileName || '成果附件', mimeType: item.mimeType || payload.mimeType || '', kpi, description, forType, activityId, evidenceId, attachmentId: attachmentId || item.id || '' });
    };
    for (const activity of todayActivities()) {
      for (const evidence of activity.evidence || []) {
        for (const item of evidenceAttachments(evidence)) {
          await upload({ item, kpi: activityKpiNumber(activity), description: item.note || evidence.observation || evidence.title, forType: `v2-${activity.type}`, activityId: activity.id, evidenceId: evidence.id, attachmentId: item.id });
        }
      }
    }
    if (state.operations?.date === state.daily.date && state.operations?.dutyOwner === state.context.teacher) {
      for (const [key, config] of Object.entries(OPERATION_CHECKS)) {
        const item = state.operations.evidenceByCheck?.[key];
        if (item) await upload({ item, kpi: 6, description: `${config.label}${item.action ? `：${item.action}` : ''}`, forType: `env_${key}`, attachmentId: item.id || `env_${key}` });
      }
    }
    return attachments;
  }

  function joinActivityText(activities, field, empty = '') {
    const rows = activities.map(activity => `${activity.title}：${String(activity[field] || '').trim()}`).filter(row => !row.endsWith('：'));
    return rows.join('；') || empty;
  }

  function joinActivityFeedback(activities, field, empty = '') {
    const rows = activities
      .map(activity => `${activity.title}：${String(activity.prepFeedback?.[field] || '').trim()}`)
      .filter(row => !row.endsWith('：'));
    return rows.join('；') || empty;
  }

  function buildLegacySubmissionPayload(submission, attachments) {
    const activities = submission.activitySnapshots || [];
    const tutoring = activities.filter(activity => activity.type === 'tutoring');
    const classroom = activities.filter(activity => activity.type === 'classroom');
    const enrichment = activities.filter(activity => activityTrack(activity.type) === 'enrichment');
    const contacts = submission.contactSnapshots || [];
    const cases = submission.studentCaseSnapshots || [];
    const operation = state.operations?.date === submission.date && state.operations?.dutyOwner === submission.teacher ? state.operations : null;
    const proof = operation?.evidenceByCheck || {};
    const contactSummary = contacts.map(item => `${item.student}（${item.channel}）：${[item.decision, item.nextAction].filter(Boolean).join('；') || item.summary}`).join('；');
    const caseSummary = cases.map(item => `${item.student}：${item.observation}；已處理 ${item.intervention}；目前 ${item.outcome}；下一步 ${item.nextAction}`).join('；');
    return {
      nickname: cloudTeacherNickname(submission.teacher),
      date: submission.date,
      submitted: true,
      kpi1_data: {
        prep_strengths: joinActivityFeedback(tutoring, 'strengths'),
        student_resonance: joinActivityFeedback(tutoring, 'resonance'),
        prep_changes: joinActivityFeedback(tutoring, 'changes'),
        review_method: joinActivityText(tutoring, 'objective'),
        error_points: joinActivityText(tutoring, 'issue'),
        help_method: joinActivityText(tutoring, 'action'),
        outcome: joinActivityText(tutoring, 'result'),
      },
      kpi2_data: {
        env_classroom: Boolean(proof.classroom?.fileName),
        env_tools: Boolean(proof.tools?.fileName),
        env_trash: Boolean(proof.trash?.fileName),
        env_toilet: Boolean(proof.toilet?.fileName),
        equipment_issue: operation?.action || '',
        class_status: joinActivityText(classroom, 'result'),
      },
      kpi3_data: {
        courses: enrichment.map(activity => ({
          type: ACTIVITY_TYPES[activity.type]?.label || activity.type,
          name: activity.title,
          class: activity.className || '',
          prep_strengths: activity.prepFeedback?.strengths || '',
          student_resonance: activity.prepFeedback?.resonance || '',
          prep_changes: activity.prepFeedback?.changes || '',
          progress: [activity.details?.stage, activity.objective].filter(Boolean).join('；'),
          learning: activity.result,
          next: activity.nextAction,
        })),
        project: null,
      },
      kpi4_data: {},
      kpi5_data: {
        parent_contacted: contacts.length > 0,
        parent_summary: contactSummary || submission.parentHandoffNote || '',
        parent_handoff_confirmed: Boolean(submission.parentHandoffConfirmed),
        parent_handoff_note: submission.parentHandoffNote || '',
        student_special: caseSummary,
        special_students: [...new Set(cases.map(item => item.student).filter(Boolean))],
      },
      kpi6_data: {
        today_done: submission.keyResult,
        tomorrow_todo: submission.tomorrowPriority,
        special_event: submission.followup,
        work_types: activities.map(activity => ACTIVITY_TYPES[activity.type]?.label || activity.type),
        admin_result: '',
        v2_snapshot: buildCloudSnapshot(submission),
      },
      attachments,
      reflection: submission.teacherNote || '',
      help_needed: false,
      help_content: '',
      checkin_at: '',
      checkout_at: '',
    };
  }

  async function syncDailyDraftToCloud() {
    if (!state.integration.cloudSyncEnabled || state.daily.submittedAt || !cloudIdentityReady() || !window.API?.saveLog) {
      return { ok: true, skipped: true };
    }
    const existing = state.submissions.find(item => item.date === state.daily.date && item.teacher === state.context.teacher);
    const submission = createDailySubmissionRecord(existing);
    submission.submittedAt = '';
    submission.status = 'draft';
    const payload = buildLegacySubmissionPayload(submission, []);
    payload.submitted = false;
    integrationRuntime.draftSyncStatus = 'saving';
    const result = await API.saveLog(payload);
    if (!result?.ok) {
      integrationRuntime.draftSyncStatus = 'error';
      integrationRuntime.cloudMessage = result?.error || '雲端草稿同步失敗';
      state.integration.dailyDraftSyncPending = true;
      persist('本機草稿已保留');
      updateSaveIndicator('error', '本機已儲存，雲端草稿待重試');
      return result;
    }
    integrationRuntime.draftSyncStatus = 'saved';
    integrationRuntime.draftSyncAt = new Date().toISOString();
    state.integration.lastCloudDraftAt = integrationRuntime.draftSyncAt;
    state.integration.dailyDraftSyncPending = false;
    persist('本機與雲端草稿已儲存');
    return result;
  }

  function scheduleDailyCloudDraftSync() {
    if (!state.integration.cloudSyncEnabled || state.daily.submittedAt || !cloudIdentityReady()) return;
    state.integration.dailyDraftSyncPending = true;
    persist('本機已儲存，等待雲端同步');
    window.clearTimeout(cloudDraftTimer);
    cloudDraftTimer = window.setTimeout(() => {
      syncDailyDraftToCloud().catch(error => {
        integrationRuntime.draftSyncStatus = 'error';
        integrationRuntime.cloudMessage = error?.message || '雲端草稿同步失敗';
        state.integration.dailyDraftSyncPending = true;
        persist('本機草稿已保留');
        updateSaveIndicator('error', '本機已儲存，雲端草稿待重試');
      });
    }, 900);
  }

  async function submitDaily() {
    if (dailySubmitInFlight) return;
    dailySubmitInFlight = true;
    try {
      return await submitDailyRequest();
    } finally {
      dailySubmitInFlight = false;
    }
  }

  async function submitDailyRequest() {
    window.clearTimeout(cloudDraftTimer);
    const form = $('#daily-summary-form');
    if (form) saveDailySummaryForm(form, false);
    if (dailyCompletion() < 100) {
      toast('尚有必要資料未完成', 'danger');
      renderApp();
      return;
    }
    const existing = state.submissions.find(item => item.date === state.daily.date && item.teacher === state.context.teacher);
    const submission = createDailySubmissionRecord(existing);
    if (state.integration.cloudSyncEnabled) {
      const identity = await ensureCloudTeacherIdentity();
      if (!identity.ok) {
        toast(`無法正式送出：${identity.error || '請重新登入目前老師的帳號'}`, 'danger');
        return;
      }
      if (!window.API?.saveLog || !window.API?.uploadPhoto || !window.API?.uploadFile) {
        toast('雲端服務尚未載入，請重新整理後再試', 'danger');
        return;
      }
      integrationRuntime.cloudStatus = 'submitting';
      integrationRuntime.cloudErrorContext = '';
      integrationRuntime.cloudMessage = '正在準備雲端資料';
      renderApp();
      try {
        const taskSync = await syncAllTasksToCloud();
        const attachments = await uploadFormalEvidence();
        submission.activitySnapshots = todayActivities().map(clone);
        const cloudPayload = buildLegacySubmissionPayload(submission, attachments);
        updateSaveIndicator('saving', '正在送出主管審查');
        const result = await API.saveLog(cloudPayload);
        if (!result?.ok) throw new Error(result?.error || '雲端送出失敗');
        let pdfResult = null;
        pdfResult = await API.sendSubmitPdf(cloudPayload.nickname, cloudPayload.date);
        const notificationComplete = !pdfResult?.notification || pdfResult.notification.allReached;
        const pendingNotifications = pdfResult?.notification?.pending || [];
        integrationRuntime.cloudStatus = 'saved';
        integrationRuntime.cloudErrorContext = '';
        integrationRuntime.cloudMessage = pdfResult?.ok
          ? (notificationComplete ? '雲端、主管通知與 PDF 已完成' : `雲端與 PDF 已完成；${pendingNotifications.join('、') || '主管'}通知待補`)
          : '雲端已完成；PDF 尚未完成';
        state.integration.lastCloudSaveAt = new Date().toISOString();
        state.integration.dailyDraftSyncPending = false;
        if (existing) Object.assign(existing, submission);
        else state.submissions.unshift(submission);
        state.daily.status = 'submitted';
        state.daily.submittedAt = submission.submittedAt;
        persist('已同步雲端');
        renderApp();
        if (pdfResult?.ok && notificationComplete && taskSync.ok) toast('已正式送出，主管通知、追蹤事項與 PDF 已完成', 'success');
        else if (pdfResult?.ok && !notificationComplete) {
          const taskWarning = taskSync.ok ? '' : `；另有 ${taskSync.failed} 項追蹤事項尚未同步`;
          toast(`已正式送出並建立 PDF；${pendingNotifications.join('、') || '主管'}通知尚未送達，請到「帳號與通知」檢查綁定${taskWarning}`, 'warning');
        }
        else if (pdfResult?.ok) toast(`已正式送出；${taskSync.failed} 項追蹤事項尚未同步`, 'danger');
        else toast(`已正式送出；PDF 未完成：${pdfResult?.error || '請稍後重試'}`, 'danger');
      } catch (error) {
        integrationRuntime.cloudStatus = 'error';
        integrationRuntime.cloudErrorContext = 'submit';
        integrationRuntime.cloudMessage = error.message || '雲端送出失敗';
        state.integration.dailyDraftSyncPending = true;
        persist('本機草稿已保留');
        renderApp();
        toast(`送出失敗：${integrationRuntime.cloudMessage}。本機草稿仍保留`, 'danger');
      }
      return;
    }
    if (existing) Object.assign(existing, submission);
    else state.submissions.unshift(submission);
    state.daily.status = 'submitted';
    state.daily.submittedAt = submission.submittedAt;
    persist(); renderApp(); toast('審查紀錄已送出；未通知真人主管', 'success');
  }

  async function submitWeekly() {
    if (weeklySubmitInFlight) return;
    weeklySubmitInFlight = true;
    try {
      return await submitWeeklyRequest();
    } finally {
      weeklySubmitInFlight = false;
    }
  }

  async function submitWeeklyRequest() {
    const form = $('#weekly-form');
    if (form) saveWeeklyForm(form, false);
    if (state.integration.cloudSyncEnabled) {
      const identity = await ensureCloudTeacherIdentity();
      if (!identity.ok) {
        toast(`無法正式送出：${identity.error || '請重新登入目前老師的帳號'}`, 'danger');
        return;
      }
      const result = await API.saveWeekly({
        nickname: cloudTeacherNickname(),
        week_of: isoWeekString(state.daily.date),
        teaching_reflection: state.weekly.keyChange,
        student_observation: state.weekly.priorityRisks,
        tool_needs: state.weekly.decisionNeeded,
        course_improvement: state.weekly.nextWeek,
      });
      if (!result?.ok) {
        toast(`週整理送出失敗：${result?.error || '請稍後重試'}；本機內容仍保留`, 'danger');
        return;
      }
    }
    state.weekly.status = 'submitted';
    state.weekly.weekLabel = isoWeekString(state.daily.date);
    persist(); renderApp(); toast(state.integration.cloudSyncEnabled ? '本週整理已同步雲端' : '本週整理已送出', 'success');
  }

  function navigate(route) {
    state.ui.route = route;
    if (route === 'guide') state.ui.guidePromptDismissed = true;
    closeDialog();
    closeDrawer();
    persist();
    renderApp();
    if (route === 'settings' && integrationRuntime.apiStatus === 'unknown') {
      window.setTimeout(checkIntegrations, 0);
    }
    if (route === 'settings') window.setTimeout(() => refreshPushStatus(true), 0);
    const session = legacySession();
    if (route === 'records' && session?.role === 'teacher' && integrationRuntime.cloudStatus === 'idle') {
      window.setTimeout(syncTeacherCloudData, 0);
    }
    if (route === 'records' && integrationRuntime.legacyArchiveStatus === 'idle') {
      window.setTimeout(loadLegacyArchiveFiles, 0);
    }
    if (route === 'cloud-reports' && integrationRuntime.reportFolderStatus === 'idle') {
      window.setTimeout(loadManagerReportFolders, 0);
    }
    if (route === 'plans' && session?.role === 'teacher' && integrationRuntime.prepSyncStatus === 'idle') {
      window.setTimeout(refreshCoursePrepCloudData, 0);
    }
    if (route === 'tasks' && session?.role === 'teacher' && integrationRuntime.taskSyncStatus === 'idle') {
      window.setTimeout(() => refreshTaskCloudData(true), 0);
    }
    if (route === 'evaluation') {
      window.setTimeout(() => loadTeacherEvaluation('latest'), 0);
    }
    if (route === 'evaluations' && ['manager', 'admin'].includes(session?.role)) {
      window.setTimeout(() => loadLatestManagerEvaluation(), 0);
    }
    if (route === 'dashboard' && ['manager', 'admin'].includes(session?.role) && integrationRuntime.managerSyncStatus === 'idle') {
      window.setTimeout(syncManagerCloudData, 0);
    }
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
    if (prep) {
      const expectedName = String(prep.teacher || state.context.teacher || '').trim();
      openDialog({
        title: '刪除備課檔案',
        body: `<div class="notice-band danger">${icon('triangle-alert', 19)}<div><div class="notice-title">刪除後無法復原</div><div class="notice-copy">「${esc(prep.title || '未命名課程')}」內的教案與教材附件會一併刪除。</div></div></div><div class="form-field"><label class="form-label" for="prep-delete-confirm-name">輸入「${esc(expectedName)}」確認刪除</label><input id="prep-delete-confirm-name" type="text" autocomplete="off" spellcheck="false" data-delete-confirm-name data-expected-name="${esc(expectedName)}" placeholder="請完整輸入自己的名稱"></div>`,
        footer: `<button type="button" class="btn" data-action="close-dialog">取消</button><button type="button" class="btn btn-danger" data-action="confirm-delete" data-kind="${kind}" data-id="${esc(id)}" data-parent-id="${esc(parentId)}" disabled>${icon('trash-2', 15)}永久刪除</button>`,
      });
      window.setTimeout(() => $('#prep-delete-confirm-name')?.focus(), 0);
      return;
    }
    const labels = { activity: prep ? '備課檔案' : '工作紀錄', student: '學生追蹤', contact: '親師溝通', evidence: '證據', plan: '教案' };
    openDialog({
      title: `刪除${labels[kind] || '資料'}`,
      body: `<div class="notice-band danger">${icon('triangle-alert', 19)}<div><div class="notice-title">刪除後無法復原</div><div class="notice-copy">${prep ? '同一份檔案內的教案內容與教材會一併刪除。' : '這筆尚未送出的資料會從目前紀錄中移除。'}</div></div></div>`,
      footer: `<button type="button" class="btn" data-action="close-dialog">取消</button><button type="button" class="btn btn-danger" data-action="confirm-delete" data-kind="${kind}" data-id="${esc(id)}" data-parent-id="${esc(parentId)}">${icon('trash-2', 15)}確認刪除</button>`,
    });
  }

  async function deleteDerivedTasks(ref) {
    const tasks = state.tasks.filter(task => task.ref === ref);
    if (state.integration.cloudSyncEnabled && cloudIdentityReady() && window.API?.deleteSelfTask) {
      for (const task of tasks) {
        const result = await API.deleteSelfTask(task.id, cloudTeacherNickname());
        if (!result?.ok) return { ok: false, error: result?.error || '追蹤事項刪除失敗' };
      }
    }
    state.tasks = state.tasks.filter(task => task.ref !== ref);
    return { ok: true };
  }

  async function confirmDelete(kind, id, parentId, confirmationName = '') {
    let dailyContentChanged = false;
    if (kind === 'activity') {
      const activity = state.activities.find(item => item.id === id);
      dailyContentChanged = Boolean(activity && activity.type !== 'lessonprep' && activity.date === state.daily.date && activity.teacher === state.context.teacher);
      const linkedPlanId = activity?.type === 'lessonprep' ? activity.planId : '';
      if (activity?.type === 'lessonprep' && String(confirmationName || '').trim() !== String(activity.teacher || state.context.teacher || '').trim()) {
        toast('姓名不一致，備課檔案未刪除', 'danger');
        return;
      }
      if (activity?.type === 'lessonprep' && state.integration.cloudSyncEnabled && cloudIdentityReady()) {
        const result = await API.deleteCoursePrep(id, cloudTeacherNickname(), confirmationName);
        if (!result?.ok) {
          toast(`備課檔案刪除失敗：${result?.error || '請稍後重試'}`, 'danger');
          return;
        }
      }
      const taskDelete = await deleteDerivedTasks(`activity:${id}`);
      if (!taskDelete.ok) {
        toast(`資料尚未刪除：${taskDelete.error}`, 'danger');
        return;
      }
      state.activities = state.activities.filter(item => item.id !== id);
      if (linkedPlanId) state.lessonPlans = state.lessonPlans.filter(item => item.id !== linkedPlanId);
    } else if (kind === 'student') {
      const item = state.studentCases.find(entry => entry.id === id);
      dailyContentChanged = Boolean(item && item.date === state.daily.date && item.teacher === state.context.teacher);
      const taskDelete = await deleteDerivedTasks(`case:${id}`);
      if (!taskDelete.ok) { toast(`資料尚未刪除：${taskDelete.error}`, 'danger'); return; }
      state.studentCases = state.studentCases.filter(item => item.id !== id);
    } else if (kind === 'contact') {
      const item = state.contacts.find(entry => entry.id === id);
      dailyContentChanged = Boolean(item && item.date === state.daily.date && item.teacher === state.context.teacher);
      const taskDelete = await deleteDerivedTasks(`contact:${id}`);
      if (!taskDelete.ok) { toast(`資料尚未刪除：${taskDelete.error}`, 'danger'); return; }
      state.contacts = state.contacts.filter(item => item.id !== id);
    } else if (kind === 'evidence') {
      if (parentId === 'operations') {
        dailyContentChanged = state.operations.date === state.daily.date && state.operations.dutyOwner === state.context.teacher;
        state.operations.evidence = null;
      }
      else {
        const activity = state.activities.find(item => item.id === parentId);
        dailyContentChanged = Boolean(activity && activity.type !== 'lessonprep' && activity.date === state.daily.date && activity.teacher === state.context.teacher);
        if (activity) activity.evidence = (activity.evidence || []).filter(item => item.id !== id);
      }
    } else if (kind === 'plan') {
      state.lessonPlans = state.lessonPlans.filter(item => item.id !== id);
      state.activities.forEach(activity => {
        if (activity.planId === id) activity.planId = '';
      });
    }
    if (dailyContentChanged) markDailyNeedsResubmit();
    clearCurrentDrawerDraft();
    closeDialog(); closeDrawer(); persist(); scheduleDailyCloudDraftSync(); renderApp(); toast('資料已刪除', 'success');
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

  function dataUrlByteLength(dataUrl) {
    const payload = dataUrlPayload(dataUrl);
    return payload ? Math.ceil(payload.base64.length * 0.75) : 0;
  }

  async function uploadCompressedPhoto(dataUrl, { kpi, description = '' } = {}) {
    if (!state.integration.cloudSyncEnabled) return null;
    const identity = await ensureCloudTeacherIdentity();
    if (!identity.ok) throw new Error(identity.error || '登入狀態已失效，請重新登入後再選擇照片');
    if (!window.API?.uploadPhoto) throw new Error('照片雲端服務尚未載入，請重新整理後再試');
    const payload = dataUrlPayload(dataUrl);
    if (!payload) throw new Error('照片無法讀取，請改選原始照片');
    const result = await API.uploadPhoto({
      nickname: cloudTeacherNickname(),
      date: state.daily.date,
      kpi,
      mimeType: payload.mimeType || 'image/jpeg',
      base64: payload.base64,
      description,
    });
    if (!result?.ok) throw new Error(result?.error || '照片上傳失敗');
    return {
      cloudUrl: result.url || '',
      cloudFileId: result.fileId || '',
      mimeType: payload.mimeType || 'image/jpeg',
      size: formatFileSize(dataUrlByteLength(dataUrl)),
    };
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
    if (fileName) fileName.textContent = attachments.length ? attachments.map(item => item.fileName).join('、') : '尚未選擇檔案 · 單檔上限 25 MB';
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
    const oversized = selected.filter(file => file.size > MAX_DOCUMENT_FILE_BYTES);
    const accepted = selected.filter(file => file.size <= MAX_DOCUMENT_FILE_BYTES);
    const fileName = $('#evidence-file-name');
    if (fileName) fileName.textContent = `正在壓縮並上傳 ${accepted.length} 份檔案…`;
    try {
      let added = 0;
      let replaced = 0;
      for (const file of accepted) {
        const fingerprint = await hashFile(file);
        const duplicateIndex = evidenceDraft.attachments.findIndex(item => item.fingerprint === fingerprint);
        const duplicate = duplicateIndex >= 0 ? evidenceDraft.attachments[duplicateIndex] : null;
        const duplicateComplete = duplicate && Boolean(materialCloudUrl(duplicate) || duplicate.cloudFileId || duplicate.dataUrl);
        if (duplicateComplete) continue;
        const isImage = String(file.type || '').startsWith('image/');
        let dataUrl = isImage ? await fileToPreview(file) : '';
        let cloudFile = null;
        if (isImage && !dataUrl) throw new Error(`${file.name} 無法轉成可上傳照片`);
        if (isImage && state.integration.cloudSyncEnabled) {
          const activity = state.activities.find(item => item.id === evidenceDraft.activityId);
          updateSaveIndicator('saving', `正在上傳 ${file.name}`);
          cloudFile = await uploadCompressedPhoto(dataUrl, {
            kpi: activity ? activityKpiNumber(activity) : 5,
            description: evidenceDraft.title || activity?.title || file.name,
          });
          if (cloudFile) dataUrl = '';
        } else if (!isImage && state.integration.cloudSyncEnabled) {
          updateSaveIndicator('saving', `正在上傳 ${file.name}`);
          cloudFile = await uploadPlanMaterial(file);
        } else if (!isImage && file.size <= 1024 * 1024) {
          dataUrl = await readFileAsDataUrl(file);
        }
        const attachment = {
          id: uid('attachment'),
          fileName: cloudFile?.name || file.name,
          mimeType: cloudFile?.mimeType || file.type || 'application/octet-stream',
          dataUrl,
          size: cloudFile?.size || formatFileSize(file.size),
          note: '',
          fingerprint,
          cloudUrl: cloudFile?.cloudUrl || '',
          cloudFileId: cloudFile?.cloudFileId || '',
          uploadStatus: cloudFile ? 'uploaded' : dataUrl ? 'local' : 'incomplete',
          uploadError: '',
          placeholder: !dataUrl && !cloudFile?.cloudUrl,
        };
        if (duplicateIndex >= 0) {
          const previousId = evidenceDraft.attachments[duplicateIndex].id;
          attachment.id = previousId;
          evidenceDraft.attachments.splice(duplicateIndex, 1, attachment);
          replaced += 1;
        } else {
          evidenceDraft.attachments.push(attachment);
        }
        if (!evidenceDraft.primaryAttachmentId) evidenceDraft.primaryAttachmentId = attachment.id;
        added += 1;
        refreshEvidenceAttachmentUI();
      }
      syncEvidencePrimaryFields(evidenceDraft);
      refreshEvidenceAttachmentUI();
      input.value = '';
      if (files.length > availableSlots) toast(`已加入前 ${availableSlots} 份；每筆上限 ${MAX_EVIDENCE_FILES} 份`, 'danger');
      else if (oversized.length) toast(`${oversized.length} 份超過 25 MB，其他 ${added} 份已上傳`, 'danger');
      else if (added < accepted.length) toast(`已加入 ${added} 份；重複檔案已略過`, 'success');
      else toast(`${added} 份成果已上傳${replaced ? `，其中 ${replaced} 份已修復` : ''}`, 'success');
    } catch (error) {
      input.value = '';
      refreshEvidenceAttachmentUI();
      toast(`部分檔案處理失敗：${error.message || '已加入的內容仍會保留'}`, 'danger');
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
    setText('#drawer-title', type === 'lessonprep' ? `${editing ? '編輯' : '新增'}備課檔案` : `${editing ? '編輯' : '新增'}工作紀錄`);
    const drawerSubtitle = $('.drawer-title p');
    if (drawerSubtitle) drawerSubtitle.textContent = type === 'lessonprep' ? '教案內容與教材集中在同一份備課檔案' : activityNeedsPrepSource(type) ? '選擇備課檔案，再記錄實際教學與課後回饋' : '記錄實際做法、結果、問題與後續行動';
  }

  function refreshCrossDayTimeline() {
    return;
  }

  function refreshActivityGuide(type) {
    const formTrack = $('#activity-form')?.dataset.activityTrack;
    if (formTrack && activityTrack(type) !== formTrack) return;
    const previousType = activityDraft?.type;
    if (previousType) captureActivityDetailFields(previousType);
    if (previousType) captureActivityCommonFields(previousType);
    capturePrepFeedbackFields();
    capturePrepEvidenceRows();
    const selectedPlan = $('#activity-plan');
    if (activityDraft && selectedPlan) activityDraft.planId = selectedPlan.value;
    const selectedPrepSource = $('#activity-prep-source');
    if (activityDraft && selectedPrepSource) {
      activityDraft.prepSourceCache = activityDraft.prepSourceCache || {};
      activityDraft.prepSourceCache[previousType] = selectedPrepSource.value;
    }
    if (activityDraft) {
      activityDraft.type = type;
      activityDraft.detailCache = activityDraft.detailCache || {};
      activityDraft.details = clone(activityDraft.detailCache[type] || {});
      activityDraft.prepSourceId = activityNeedsPrepSource(type) ? activityDraft.prepSourceCache?.[type] || defaultPrepSourceId(type) : '';
      if (!activityNeedsPrepSource(type)) {
        Object.assign(activityDraft, activityDraft.commonCache?.[type] || {
          objective: '', action: '', result: '', issue: '', nextAction: '', owner: state.context.teacher, dueDate: addDays(state.daily.date, 1),
        });
      }
    }
    const specificFields = $('#activity-specific-fields');
    if (specificFields) specificFields.innerHTML = renderActivitySpecificFields(type, activityDraft?.details || {});
    const trackIndicator = $('#activity-track-indicator');
    if (trackIndicator) trackIndicator.innerHTML = renderActivityTrackIndicator(type);
    const preparationSection = $('#activity-preparation-section');
    if (preparationSection) preparationSection.outerHTML = renderActivityPreparationSection(activityDraft || { type });
    const resultSection = $('#activity-result-section');
    if (resultSection) resultSection.outerHTML = renderActivityResultSection(activityDraft || { type });
    const guideNode = $('#activity-guide');
    if (guideNode) guideNode.innerHTML = renderActivityTypeExamples(type);
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

  async function handlePrepFiles(input) {
    if (!activityDraft) return;
    if ($('#course-prep-form')) captureCoursePrepFormDraft();
    else capturePrepEvidenceRows();
    const files = Array.from(input.files || []);
    if (!files.length) return;
    input.disabled = true;
    let uploaded = 0;
    let skipped = 0;
    try {
      for (const file of files) {
        const fileFingerprint = await hashFile(file);
        const duplicateIndex = (activityDraft.prepEvidence || []).findIndex(item => item.fileFingerprint === fileFingerprint);
        const duplicate = duplicateIndex >= 0 ? activityDraft.prepEvidence[duplicateIndex] : null;
        if (duplicate && (materialCloudUrl(duplicate) || duplicate.cloudFileId)) {
          skipped += 1;
          continue;
        }
        const cloudFile = await uploadPlanMaterial(file);
        activityDraft.prepEvidence = activityDraft.prepEvidence || [];
        const uploadedFile = {
          id: uid('prep'), fileName: cloudFile.name || file.name, size: cloudFile.size || formatFileSize(file.size),
          category: inferPrepCategory(file.name), note: '', addedAt: new Date().toISOString(),
          mimeType: cloudFile.mimeType || file.type || '', cloudUrl: cloudFile.cloudUrl || '', cloudFileId: cloudFile.cloudFileId || '', fileFingerprint,
        };
        if (duplicateIndex >= 0) {
          uploadedFile.id = activityDraft.prepEvidence[duplicateIndex].id;
          activityDraft.prepEvidence.splice(duplicateIndex, 1, uploadedFile);
        } else activityDraft.prepEvidence.push(uploadedFile);
        uploaded += 1;
        updateSaveIndicator('saving', `附件已上傳 ${uploaded}/${files.length}`);
      }
      updateSaveIndicator('saved', '附件已歸檔');
      toast(skipped ? `${uploaded} 份附件已上傳；${skipped} 份相同檔案已略過` : `${uploaded} 份附件已上傳`, skipped ? 'warning' : 'success');
    } catch (error) {
      updateSaveIndicator('error', '附件上傳未完成');
      toast(`附件上傳未完成：${error.message || '請稍後重試'}`, 'danger');
    }
    const node = $('#prep-file-list');
    if (node) node.innerHTML = $('#course-prep-form') ? renderSimplePrepFiles(activityDraft.prepEvidence || []) : renderPrepEvidenceList(activityDraft.prepEvidence || []);
    input.disabled = false;
    input.value = '';
    hydrateIcons();
  }

  async function hashFile(file) {
    const buffer = await file.arrayBuffer();
    if (window.crypto?.subtle) {
      try {
        const digest = await window.crypto.subtle.digest('SHA-256', buffer);
        return Array.from(new Uint8Array(digest)).map(value => value.toString(16).padStart(2, '0')).join('');
      } catch (error) {
        // Continue with the content-based fallback below.
      }
    }
    const bytes = new Uint8Array(buffer);
    let first = 2166136261;
    let second = 2246822519;
    bytes.forEach((value, index) => {
      first ^= value;
      first = Math.imul(first, 16777619);
      second ^= value + index;
      second = Math.imul(second, 3266489917);
    });
    return `content:${file.size}:${(first >>> 0).toString(16)}:${(second >>> 0).toString(16)}`;
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
    markDailyNeedsResubmit(state.operations.date, state.operations.dutyOwner);
    updateOperationProofSummary();
    schedulePersist();
    scheduleDailyCloudDraftSync();
  }

  function updateOperationProofSummary() {
    const count = operationProofCount(state.operations);
    const value = $('#operation-proof-count');
    const progress = $('#operation-proof-progress');
    const help = $('#operation-proof-help');
    if (value) value.textContent = `${count}/4 ${count ? '已上傳' : '待上傳'}`;
    if (progress) {
      progress.style.width = `${count / 4 * 100}%`;
      progress.classList.toggle('warn', count < 4);
    }
    if (help) help.textContent = state.operations.confirmedAt && operationsComplete()
      ? `已於 ${formatTime(state.operations.confirmedAt)} 完成檢核`
      : count === 4 ? '照片已上傳，可送出班務檢核' : '補齊照片與異常處理後即可送出';
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
    if (file.size > MAX_IMAGE_SOURCE_BYTES) {
      input.value = '';
      toast('單張原始照片上限為 25 MB', 'danger');
      return;
    }
    const preview = $(`#operation-preview-${key}`);
    if (preview) preview.classList.add('is-loading');
    try {
      const fingerprint = await hashFile(file);
      const dataUrl = await fileToPreview(file);
      if (!dataUrl) throw new Error('照片無法壓縮');
      updateSaveIndicator('saving', `正在上傳${OPERATION_CHECKS[key].label}照片`);
      const cloudFile = await uploadCompressedPhoto(dataUrl, { kpi: 6, description: OPERATION_CHECKS[key].label });
      state.operations.evidenceByCheck = state.operations.evidenceByCheck || {};
      const currentStatus = input.closest('.operation-proof-item')?.querySelector(`[name="status_${key}"]:checked`)?.value || 'normal';
      state.operations.evidenceByCheck[key] = {
        ...(state.operations.evidenceByCheck[key] || {}),
        status: currentStatus,
        fileName: file.name,
        mimeType: cloudFile?.mimeType || 'image/jpeg',
        size: cloudFile?.size || formatFileSize(file.size),
        dataUrl: cloudFile ? '' : dataUrl,
        cloudUrl: cloudFile?.cloudUrl || '',
        cloudFileId: cloudFile?.cloudFileId || '',
        uploadStatus: cloudFile ? 'uploaded' : 'local',
        placeholder: false,
        fingerprint,
        addedAt: new Date().toISOString(),
      };
      state.operations.confirmedAt = '';
      markDailyNeedsResubmit(state.operations.date, state.operations.dutyOwner);
      const current = state.operations.evidenceByCheck[key];
      if (preview) {
        preview.outerHTML = renderOperationPhoto(current, key, OPERATION_CHECKS[key].label);
      }
      const item = input.closest('.operation-proof-item');
      if (item) item.classList.add('has-proof');
      const badge = $(`#operation-proof-badge-${key}`);
      if (badge) {
        badge.className = 'badge green';
        badge.textContent = '已附照片';
      }
      updateOperationProofSummary();
      schedulePersist();
      scheduleDailyCloudDraftSync();
      hydrateIcons();
      toast(`${OPERATION_CHECKS[key].label}照片已上傳`, 'success');
    } catch (error) {
      input.value = '';
      updateSaveIndicator('error', '照片上傳未完成');
      toast(`照片上傳未完成：${error.message || '請重新選擇'}`, 'danger');
    } finally {
      if (preview) preview.classList.remove('is-loading');
    }
  }

  async function handleReviewDecision(kind, id, secondaryId) {
    if (kind === 'submission-accept' || kind === 'submission-clarify') {
      const submission = state.submissions.find(item => item.id === id);
      if (!submission) return;
      if (!ensureManagerScope(submission.teacher, submission.department)) return;
      const feedback = String($('#submission-feedback')?.value || '').trim();
      if (kind === 'submission-clarify' && !feedback) {
        toast('請先寫明需要補充的內容', 'danger');
        return;
      }
      const reviewMessage = feedback || '日報已審查通過';
      const cloudResult = await sendCloudSubmissionMessage(feedbackThreadKey('submission', id), reviewMessage, kind === 'submission-clarify' ? '需改進' : '已知悉');
      if (!cloudResult?.ok) {
        toast(`審查未送出：${cloudResult?.error || '雲端連線失敗'}`, 'danger');
        return;
      }
      const reviewer = displayNameForBackend(legacySession()?.nickname || backendNickname(state.context.manager));
      submission.feedback = reviewMessage;
      submission.status = kind === 'submission-accept' ? 'accepted' : 'clarify';
      submission.reviewedAt = new Date().toISOString();
      submission.reviewedBy = reviewer;
      appendFeedbackMessage(feedbackThreadKey('submission', id), reviewMessage, 'manager', reviewer);
      if (kind === 'submission-clarify') upsertDerivedTask(`review:${id}`, `補充 ${formatShortDate(submission.date)} 日報：${feedback}`, '主管交辦', submission.teacher, addDays(state.daily.date, 1), 'high');
    }
    if (kind === 'evidence-accept' || kind === 'evidence-clarify') {
      const activity = state.activities.find(item => item.id === id);
      const evidence = activity && (activity.evidence || []).find(item => item.id === secondaryId);
      if (!evidence) return;
      if (!ensureManagerScope(activity.teacher)) return;
      const feedback = String($('#evidence-feedback')?.value || '').trim();
      if (kind === 'evidence-clarify' && !feedback) {
        toast('請先寫明需要補充的判讀資訊', 'danger');
        return;
      }
      const reviewMessage = feedback || '證據已採認';
      const threadKey = feedbackThreadKey('evidence', id, secondaryId);
      const cloudResult = await sendCloudSubmissionMessage(threadKey, reviewMessage, kind === 'evidence-clarify' ? '需改進' : '已知悉');
      if (!cloudResult?.ok) { toast(`審查未送出：${cloudResult?.error || '雲端連線失敗'}`, 'danger'); return; }
      const reviewer = displayNameForBackend(legacySession()?.nickname || backendNickname(state.context.manager));
      evidence.status = kind === 'evidence-accept' ? 'accepted' : 'clarify';
      evidence.managerFeedback = reviewMessage;
      evidence.reviewedAt = new Date().toISOString();
      evidence.reviewedBy = reviewer;
      appendFeedbackMessage(threadKey, reviewMessage, 'manager', reviewer);
      if (kind === 'evidence-clarify') upsertDerivedTask(`evidence:${secondaryId}`, `補充證據「${evidence.title}」：${feedback}`, '主管交辦', activity.teacher, addDays(state.daily.date, 1), 'high');
    }
    if (kind === 'plan-approve' || kind === 'plan-changes') {
      const plan = state.lessonPlans.find(item => item.id === id);
      if (!plan) return;
      if (!ensureManagerScope(plan.teacher)) return;
      const feedback = String($('#plan-review-feedback')?.value || '').trim();
      if (kind === 'plan-changes' && !feedback) {
        toast('請先寫明教案需修改的內容', 'danger');
        return;
      }
      const reviewMessage = feedback || '教案已核准';
      const threadKey = feedbackThreadKey('plan', id);
      const cloudResult = await sendCloudSubmissionMessage(threadKey, reviewMessage, kind === 'plan-changes' ? '需改進' : '已知悉');
      if (!cloudResult?.ok) { toast(`審查未送出：${cloudResult?.error || '雲端連線失敗'}`, 'danger'); return; }
      const reviewer = displayNameForBackend(legacySession()?.nickname || backendNickname(state.context.manager));
      plan.managerFeedback = reviewMessage;
      plan.status = kind === 'plan-approve' ? 'approved' : 'changes';
      plan.reviewedAt = new Date().toISOString();
      plan.reviewedBy = reviewer;
      appendFeedbackMessage(threadKey, reviewMessage, 'manager', reviewer);
      if (kind === 'plan-changes') upsertDerivedTask(`plan:${id}`, `修正教案「${plan.title}」：${feedback}`, '主管交辦', plan.teacher, addDays(state.daily.date, 2), 'high');
    }
    if (kind === 'operation-accept' || kind === 'operation-clarify') {
      const operation = operationRecordById(id);
      if (!operation || !operation.confirmedAt) return;
      if (!ensureManagerScope(operation.dutyOwner, operation.room)) return;
      if (!operationsComplete(operation, false)) {
        toast('此筆班務仍缺逐項照片、結果判定或異常處理，無法完成稽核', 'danger');
        return;
      }
      const feedback = String($('#operation-review-feedback')?.value || '').trim();
      if (kind === 'operation-clarify' && !feedback) {
        toast('請先寫明需補充的面向與內容', 'danger');
        return;
      }
      const reviewMessage = feedback || '班務檢核已通過';
      const threadKey = feedbackThreadKey('operation', id);
      const cloudResult = await sendCloudSubmissionMessage(threadKey, reviewMessage, kind === 'operation-clarify' ? '需改進' : '已知悉');
      if (!cloudResult?.ok) { toast(`審查未送出：${cloudResult?.error || '雲端連線失敗'}`, 'danger'); return; }
      const reviewer = displayNameForBackend(legacySession()?.nickname || backendNickname(state.context.manager));
      operation.managerFeedback = reviewMessage;
      operation.reviewStatus = kind === 'operation-accept' ? 'accepted' : 'clarify';
      operation.reviewedAt = new Date().toISOString();
      operation.reviewedBy = reviewer;
      appendFeedbackMessage(threadKey, reviewMessage, 'manager', reviewer);
      if (kind === 'operation-clarify') {
        upsertDerivedTask(`operations:${id}`, `補充 ${formatShortDate(operation.date)} 班務證據：${feedback}`, '主管交辦', operation.dutyOwner, addDays(state.daily.date, 1), 'high');
      } else {
        const task = state.tasks.find(item => item.ref === `operations:${id}`);
        if (task) task.status = 'done';
      }
    }
    closeDrawer(); persist(); renderApp(); toast(kind.includes('accept') || kind.includes('approve') ? '審查已完成' : '已建立補充待辦', 'success');
  }

  const TEST_VIEW_WRITE_ACTIONS = new Set([
    'send-feedback-message', 'accept-operation', 'request-operation-clarify',
    'submit-daily', 'submit-weekly', 'submit-plan-review', 'approve-plan',
    'request-plan-changes', 'accept-submission', 'request-submission-clarify',
    'accept-evidence', 'request-evidence-clarify', 'enable-push',
    'setup-system-automation', 'test-all-notifications', 'save-manager-evaluation',
    'test-app-notification', 'copy-line-binding', 'confirm-delete',
    'retry-draft-sync', 'export-monthly-archive',
  ]);

  document.addEventListener('submit', async event => {
    const form = event.target.closest('form[data-form]');
    if (!form) return;
    event.preventDefault();
    const type = form.dataset.form;
    if (type === 'evaluation-history') {
      const month = String(new FormData(form).get('month') || '');
      if (month) await loadTeacherEvaluation(month);
      return;
    }
    if (type === 'manager-evaluation-selection') {
      const currentForm = $('#manager-evaluation-form');
      if (currentForm?.dataset.dirty === 'true' && !window.confirm('目前評核尚未儲存，確定要切換查看對象嗎？')) return;
      const data = new FormData(form);
      await loadManagerEvaluation(String(data.get('teacher') || ''), String(data.get('month') || ''));
      return;
    }
    if (TEST_VIEW_MODE) {
      toast('測試模式：表單流程正常，最後寫入已攔截，不會儲存、送出或上傳正式資料', 'warning');
      return;
    }
    if (type === 'activity') saveActivityForm(form);
    if (type === 'course-prep') {
      if (form.dataset.submitting === 'true') return;
      form.dataset.submitting = 'true';
      const submitButton = document.querySelector(`[type="submit"][form="${form.id}"]`);
      const originalLabel = submitButton?.innerHTML || '';
      if (submitButton) {
        submitButton.disabled = true;
        submitButton.textContent = '正在儲存…';
      }
      try { await saveCoursePrepForm(form); }
      finally {
        delete form.dataset.submitting;
        if (submitButton?.isConnected) {
          submitButton.disabled = false;
          submitButton.innerHTML = originalLabel;
          hydrateIcons();
        }
      }
      return;
    }
    if (type === 'student-case') saveStudentCaseForm(form);
    if (type === 'contact') saveContactForm(form);
    if (type === 'operations') saveOperationsForm(form);
    if (type === 'daily-summary') saveDailySummaryForm(form);
    if (type === 'weekly') saveWeeklyForm(form);
    if (type === 'evidence') saveEvidenceForm(form);
    if (type === 'plan') await savePlanForm(form);
    if (type === 'task') saveTaskForm(form);
  });

  document.addEventListener('click', async event => {
    const control = event.target.closest('[data-action]');
    if (!control || control.disabled) return;
    const action = control.dataset.action;
    if ((action === 'backdrop-close-drawer' || action === 'backdrop-close-dialog') && event.target !== control) return;
    if (TEST_VIEW_MODE && TEST_VIEW_WRITE_ACTIONS.has(action)) {
      toast('測試模式：已走到正式寫入步驟，本次不會儲存、送出、核准或通知', 'warning');
      return;
    }

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
        const cloudResult = await sendCloudSubmissionMessage(key, message);
        if (!cloudResult?.ok) {
          toast(`回覆未送出：${cloudResult?.error || '雲端連線失敗'}`, 'danger');
          return;
        }
        appendFeedbackMessage(key, message);
        const inline = thread?.dataset.feedbackInline === 'true';
        persist('對話已儲存');
        if (thread) thread.outerHTML = renderFeedbackThread(key, { inline });
        hydrateIcons();
        toast('回覆已送出', 'success');
      }
    }
    else if (action === 'open-activity') {
      const requestedTrack = control.dataset.track || '';
      const requestedType = control.dataset.type || '';
      if (requestedTrack && !requestedType) openActivityTypePicker(requestedTrack);
      else openActivityEditor(undefined, requestedTrack, requestedType);
    }
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
      if (control.dataset.status === 'handoff' && state.contacts.some(item => item.date === state.daily.date && item.teacher === state.context.teacher)) {
        toast('今天已有重要親師溝通紀錄，請保留「有重要事項」', 'danger');
      } else {
        state.daily.parentStatus = control.dataset.status;
        markDailyNeedsResubmit();
        persist(); scheduleDailyCloudDraftSync(); renderApp();
      }
    }
    else if (action === 'open-evidence') openEvidenceList(control.dataset.activityId);
    else if (action === 'new-evidence') openEvidenceEditor(control.dataset.activityId);
    else if (action === 'edit-evidence') openEvidenceEditor(control.dataset.activityId, control.dataset.evidenceId);
    else if (action === 'delete-evidence') openDeleteDialog('evidence', control.dataset.evidenceId, control.dataset.activityId);
    else if (action === 'inspect-evidence') openEvidenceInspection(control.dataset.activityId, control.dataset.evidenceId);
    else if (action === 'review-operation') openOperationReview(control.dataset.operationId);
    else if (action === 'accept-operation') await handleReviewDecision('operation-accept', control.dataset.operationId);
    else if (action === 'request-operation-clarify') await handleReviewDecision('operation-clarify', control.dataset.operationId);
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
    else if (action === 'remove-operation-photo') {
      const key = control.dataset.checkKey;
      if (!OPERATION_CHECKS[key] || state.operations.dutyOwner !== state.context.teacher) return;
      const current = state.operations.evidenceByCheck?.[key] || {};
      state.operations.evidenceByCheck[key] = {
        status: current.status || 'normal',
        action: current.action || '',
      };
      state.operations.confirmedAt = '';
      markDailyNeedsResubmit(state.operations.date, state.operations.dutyOwner);
      persist();
      scheduleDailyCloudDraftSync();
      renderApp();
      toast(`${OPERATION_CHECKS[key].label}照片已移除`, 'success');
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
    else if (action === 'submit-daily') await submitDaily();
    else if (action === 'submit-weekly') await submitWeekly();
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
      persistCurrentDrawerDraft(true);
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
      if (!plan || planReadiness(plan) < 100) toast('教案內容與教材尚未符合六項歸檔條件', 'danger');
      else {
        plan.status = 'review';
        const prep = prepActivityForPlan(plan);
        try {
          if (prep) await saveCoursePrepToCloud(prep);
          const messageResult = await sendCloudSubmissionMessage(feedbackThreadKey('plan', plan.id), '教案已送交主管檢視');
          if (!messageResult?.ok) throw new Error(messageResult?.error || '主管通知失敗');
        } catch (error) {
          plan.status = 'draft';
          persist();
          toast(`教案尚未送出：${error.message || '請稍後重試'}`, 'danger');
          return;
        }
        closeDrawer(); persist(); renderApp(); toast('已送主管檢視；授課紀錄仍可選用這份備課檔案', 'success');
      }
    }
    else if (action === 'review-plan') openPlanReview(control.dataset.planId);
    else if (action === 'approve-plan') await handleReviewDecision('plan-approve', control.dataset.planId);
    else if (action === 'request-plan-changes') await handleReviewDecision('plan-changes', control.dataset.planId);
    else if (action === 'open-review') openSubmissionReview(control.dataset.submissionId);
    else if (action === 'open-record') openSubmissionReview(control.dataset.submissionId, true);
    else if (action === 'view-archived-activity') openArchivedActivityDetail(control.dataset.submissionId, control.dataset.activityId);
    else if (action === 'accept-submission') await handleReviewDecision('submission-accept', control.dataset.submissionId);
    else if (action === 'request-submission-clarify') await handleReviewDecision('submission-clarify', control.dataset.submissionId);
    else if (action === 'accept-evidence') await handleReviewDecision('evidence-accept', control.dataset.activityId, control.dataset.evidenceId);
    else if (action === 'request-evidence-clarify') await handleReviewDecision('evidence-clarify', control.dataset.activityId, control.dataset.evidenceId);
    else if (action === 'open-case-detail') openCaseDetail(control.dataset.caseId);
    else if (action === 'open-task-detail') openTaskDetail(control.dataset.taskId);
    else if (action === 'toggle-task-detail') {
      const task = state.tasks.find(item => item.id === control.dataset.taskId && item.owner === state.context.teacher);
      if (task) {
        task.status = task.status === 'done' ? 'open' : 'done';
        scheduleTaskCloudSync(task);
        closeDialog();
        persist();
        renderApp();
        toast(task.status === 'done' ? '事項已完成' : '事項已恢復為進行中', 'success');
      }
    }
    else if (action === 'open-task') openTaskEditor();
    else if (action === 'open-profile') openProfileDialog();
    else if (action === 'logout') {
      persistCurrentDrawerDraft(true);
      if (window.AUTH?.logout) window.AUTH.logout();
      else window.location.href = '../../index.html?v=20260825-profile-fix-3';
    }
    else if (action === 'exit-impersonation') {
      persistCurrentDrawerDraft(true);
      const realRole = window.AUTH?.getRealRole?.();
      window.AUTH?.exitImpersonate?.();
      const root = window.AUTH?.relativeRoot?.() || '../../';
      window.location.href = realRole === 'admin' ? `${root}admin/dashboard.html?v=20260827-test-view-fast-1#test-view` : `${root}manager/dashboard.html`;
    }
    else if (action === 'open-test-view') {
      const root = window.AUTH?.relativeRoot?.() || '../../';
      window.location.href = `${root}admin/dashboard.html?v=20260827-test-view-fast-1#test-view`;
    }
    else if (action === 'open-health' || action === 'run-health-check') openHealthDialog();
    else if (action === 'check-integrations') await checkIntegrations();
    else if (action === 'open-formal-login') {
      window.location.href = loginReturnPath();
    }
    else if (action === 'open-account-admin') {
      window.location.href = sessionCanManageAccounts() ? '../../admin/users.html' : loginReturnPath('admin/users.html');
    }
    else if (action === 'enable-push') {
      if (!legacySession()) {
        window.location.href = loginReturnPath();
      } else if (typeof window.promptPush !== 'function') {
        toast('APP 通知服務尚未載入，請重新整理後再試', 'danger');
      } else {
        control.disabled = true;
        const pushStatus = await window.promptPush();
        control.disabled = false;
        integrationRuntime.pushStatus = pushStatus || null;
        integrationRuntime.pushStatusState = pushStatus?.ready ? 'ready' : 'error';
        if (control.dataset.source === 'login-reminder') closeDialog();
        if (pushStatus?.subscribed) {
          toast('APP 通知已開啟並綁定目前帳號', 'success');
        } else if (!pushStatus?.supported) {
          toast('這個瀏覽器不支援 APP 通知；手機請使用支援推播的主畫面 APP', 'danger');
        } else if (pushStatus?.nativePermission === 'denied') {
          toast('通知已被瀏覽器封鎖，請到網站設定改為允許', 'danger');
        } else {
          toast('APP 通知尚未完成，請允許系統通知後再試一次', 'warning');
        }
        if (state.ui.route === 'settings') renderApp();
      }
    }
    else if (action === 'setup-system-automation') {
      const session = legacySession();
      if (!session || session.role !== 'admin') {
        toast('只有管理員可以建立系統排程', 'danger');
      } else {
        control.disabled = true;
        const result = await API.setupSystemAutomation(session.nickname);
        control.disabled = false;
        if (!result?.ok) {
          toast(`排程未完成：${result?.error || '請稍後重試'}`, 'danger');
        } else {
          toast('PDF 與事項提醒排程已補齊', 'success');
          await checkIntegrations();
        }
      }
    }
    else if (action === 'test-all-notifications') {
      const session = legacySession();
      if (!session) {
        toast('請先登入正式帳號', 'danger');
      } else {
        control.disabled = true;
        const pushStatus = await refreshPushStatus(false);
        const result = await API.testMyNotifications(session.nickname);
        control.disabled = false;
        if (!result?.ok) {
          toast(`通知測試失敗：${result?.error || '請稍後重試'}`, 'danger');
        } else if (result.lineSent && result.appSent) {
          toast('APP 與 LINE 測試通知皆已送達服務', 'success');
        } else if (result.lineSent && !result.appSent) {
          const appReason = pushStatus?.nativePermission === 'denied'
            ? 'APP 已被瀏覽器封鎖'
            : pushStatus?.subscribed
              ? 'APP 服務暫時未送達，請稍後重試'
              : 'APP 尚未訂閱，請先按「開啟 APP 通知」';
          toast(`LINE 已送達；${appReason}`, 'warning');
        } else if (result.appSent && !result.lineSent) {
          toast(result.lineBound ? 'APP 已送達；LINE 暫時未送達' : 'APP 已送達；LINE 尚未綁定', 'warning');
        } else {
          const lineReason = result.lineBound ? 'LINE 暫時未送達' : 'LINE 尚未綁定';
          const appReason = pushStatus?.nativePermission === 'denied' ? 'APP 已被瀏覽器封鎖' : 'APP 尚未訂閱';
          toast(`${appReason}；${lineReason}`, 'danger');
        }
        if (state.ui.route === 'settings') renderApp();
      }
    }
    else if (action === 'refresh-legacy-archives') await loadLegacyArchiveFiles(true);
    else if (action === 'refresh-report-folders') await loadManagerReportFolders(true);
    else if (action === 'reload-manager-evaluation') {
      await loadManagerEvaluation(integrationRuntime.managerEvaluationTeacher, integrationRuntime.managerEvaluationMonth);
    }
    else if (action === 'save-manager-evaluation') {
      await saveManagerEvaluation(control.dataset.status === 'submitted' ? 'submitted' : 'draft');
    }
    else if (action === 'test-app-notification') {
      const session = legacySession();
      if (!session) {
        toast('請先登入正式帳號', 'danger');
      } else {
        control.disabled = true;
        const result = await API.debugPush(session.nickname);
        const delivered = result?.ok && (result.results || []).some(item => Number(item.code) >= 200 && Number(item.code) < 300 && !String(item.body || '').includes('"recipients":0'));
        control.disabled = false;
        toast(delivered ? 'APP 測試通知已送出' : '未送達：請先開啟通知，或請管理員檢查 OneSignal 設定', delivered ? 'success' : 'danger');
      }
    }
    else if (action === 'copy-line-binding') {
      const session = legacySession();
      if (!session) {
        toast('請先登入正式帳號', 'danger');
        return;
      }
      control.disabled = true;
      const binding = await API.getLineBindingCode();
      control.disabled = false;
      if (!binding?.ok || !binding.command) {
        toast(binding?.error || '暫時無法取得 LINE 綁定指令', 'danger');
        return;
      }
      const command = binding.command;
      const preview = document.querySelector('[data-line-binding-preview]');
      if (preview) preview.textContent = `${session.nickname} 專屬指令（10 分鐘有效）`;
      try {
        await navigator.clipboard.writeText(command);
        toast('專屬 LINE 綁定指令已複製，請在 10 分鐘內貼上', 'success');
      } catch (error) {
        const input = document.createElement('textarea');
        input.value = command;
        document.body.appendChild(input);
        input.select();
        document.execCommand('copy');
        input.remove();
        toast('專屬 LINE 綁定指令已複製，請在 10 分鐘內貼上', 'success');
      }
    }
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
    else if (action === 'confirm-delete') await confirmDelete(control.dataset.kind, control.dataset.id, control.dataset.parentId, $('[data-delete-confirm-name]')?.value || '');
    else if (action === 'print-weekly') window.print();
    else if (action === 'export-records') openMonthlyExportDialog();
    else if (action === 'sync-teacher-records') await syncTeacherCloudData();
    else if (action === 'retry-draft-sync') {
      const result = await syncDailyDraftToCloud();
      renderApp();
      toast(result?.ok ? '雲端草稿已同步' : `同步失敗：${result?.error || integrationRuntime.cloudMessage || '請稍後重試'}`, result?.ok ? 'success' : 'danger');
    }
    else if (action === 'retry-prep-sync') await refreshCoursePrepCloudData(true);
    else if (action === 'retry-task-sync') await refreshTaskCloudData(true);
    else if (action === 'export-monthly-archive') await exportMonthlyArchive();
    else if (action === 'export-students') exportStudentCases();
    else if (action === 'manager-refresh') {
      await syncManagerCloudData();
    }
  });

  document.addEventListener('change', async event => {
    const fileInput = event.target.closest('input[type="file"]');
    if (TEST_VIEW_MODE && fileInput) {
      fileInput.value = '';
      toast('測試模式：已確認附件入口可用，但不會上傳正式檔案', 'warning');
      return;
    }
    const control = event.target.closest('[data-change]');
    if (event.target.closest('#activity-form, #evidence-form, #plan-form, [data-draft-form]')) scheduleCurrentDrawerDraft();
    if (!control) return;
    const change = control.dataset.change;
    if (change === 'view-filter') {
      const filters = getFilters(control.dataset.filterGroup, {});
      filters[control.dataset.filterKey] = control.value;
      persist(); renderApp();
    }
    if (change === 'activity-type') refreshActivityGuide(control.value);
    if (change === 'archive-month') {
      const path = $('#archive-folder-path');
      if (path) path.textContent = archiveFolderPath(control.value);
    }
    if (change === 'legacy-archive-month') {
      integrationRuntime.legacyArchiveMonth = control.value;
      renderApp();
    }
    if (change === 'activity-plan') refreshActivityPlanStatus(control.value);
    if (change === 'activity-prep-source') refreshActivityPrepSource(control.value);
    if (change === 'cloud-sync-enabled') {
      state.integration.cloudSyncEnabled = control.checked;
      if (!control.checked) integrationRuntime.cloudStatus = 'idle';
      persist(control.checked ? '正式雲端送出已啟用' : '已切回審查模式');
      renderApp();
      toast(control.checked ? '正式送出已啟用；送出時會核對老師帳號' : '已切回審查模式，不會通知真人主管', 'success');
    }
    if (change === 'prep-files') await handlePrepFiles(control);
    if (change === 'operation-photo') await handleOperationPhoto(control);
    if (change === 'operation-status') toggleOperationStatus(control);
    if (change === 'confirm-no-student') {
      if (control.checked && state.studentCases.some(item => item.date === state.daily.date && item.teacher === state.context.teacher)) {
        control.checked = false;
        toast('今天已有學生追蹤紀錄', 'danger');
        return;
      }
      state.daily.noStudentFollowupConfirmed = control.checked;
      markDailyNeedsResubmit();
      schedulePersist();
      scheduleDailyCloudDraftSync();
    }
    if (change === 'parent-handoff-confirmed') {
      state.daily.parentHandoffConfirmed = control.checked;
      markDailyNeedsResubmit();
      schedulePersist();
      scheduleDailyCloudDraftSync();
    }
    if (change === 'toggle-task') {
      const task = state.tasks.find(item => item.id === control.dataset.taskId);
      if (task) {
        task.status = control.checked ? 'done' : 'open';
        scheduleTaskCloudSync(task);
      }
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
      const files = Array.from(control.files || []);
      if (!files.length) return;
      control.disabled = true;
      updateSaveIndicator('saving', `正在上傳 ${files.length} 份教材`);
      let uploaded = 0;
      try {
        for (const file of files) {
          const material = await uploadPlanMaterial(file);
          planDraft.materials.push(material);
          uploaded += 1;
          updateSaveIndicator('saving', `教材已上傳 ${uploaded}/${files.length}`);
        }
        refreshPlanEditor();
        updateSaveIndicator('saved', '教材已歸檔');
        toast(`${uploaded} 份教材已上傳並加入教案`, 'success');
      } catch (error) {
        refreshPlanEditor();
        updateSaveIndicator('error', '教材上傳未完成');
        toast(`教材上傳未完成：${error.message || '請稍後重試'}`, 'danger');
      } finally {
        control.value = '';
      }
    }
  });

  document.addEventListener('input', event => {
    if (event.target.matches('[data-delete-confirm-name]')) {
      const button = document.querySelector('[data-action="confirm-delete"]');
      if (button) button.disabled = String(event.target.value || '').trim() !== String(event.target.dataset.expectedName || '').trim();
    }
    const managerEvaluationForm = event.target.closest('#manager-evaluation-form');
    if (managerEvaluationForm) managerEvaluationForm.dataset.dirty = 'true';
    if (event.target.closest('#activity-form, #evidence-form, #plan-form, [data-draft-form]')) scheduleCurrentDrawerDraft();
    const dailyForm = event.target.closest('#daily-summary-form');
    if (dailyForm) {
      const data = new FormData(dailyForm);
      state.daily.summary.teacherNote = String(data.get('teacherNote') || '').trim();
      markDailyNeedsResubmit();
      schedulePersist();
      scheduleDailyCloudDraftSync();
    }
    if (event.target.matches('[data-input="parent-handoff-note"]')) {
      state.daily.parentHandoffNote = event.target.value;
      markDailyNeedsResubmit();
      schedulePersist();
      scheduleDailyCloudDraftSync();
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
      markDailyNeedsResubmit(state.operations.date, state.operations.dutyOwner);
      schedulePersist();
      scheduleDailyCloudDraftSync();
    }
    if (event.target.matches('[data-input="evidence-quality"]')) updateEvidenceQualityFromForm();
    if (event.target.matches('[data-input="manager-eval-score"]')) refreshManagerEvaluationTotal();
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

  window.addEventListener('kpi-push-status-change', event => {
    integrationRuntime.pushStatus = event.detail || null;
    integrationRuntime.pushStatusState = event.detail?.ready ? 'ready' : 'error';
    if (state.ui.route === 'settings') renderApp();
  });

  const initialSession = legacySession();
  const openedFromNotification = new URLSearchParams(window.location.search).get('notify') === '1';
  if (!initialSession && !IS_QA_HARNESS && !IS_PREVIEW_REVIEW_SESSION) {
    window.location.replace(loginReturnPath(openedFromNotification ? 'review/anqin-v2/index.html?notify=1' : 'review/anqin-v2/index.html'));
    return;
  }
  const allowedDepartments = ['東橋教室', '永康教室', '北區教室'];
  const allowedSession = initialSession?.role === 'admin'
    || (['manager', 'teacher'].includes(initialSession?.role) && allowedDepartments.includes(normalizeDepartmentScope(initialSession?.department)));
  if (initialSession && !allowedSession && !IS_QA_HARNESS) {
    window.AUTH?.routeByRole?.(initialSession.role, initialSession);
    return;
  }
  applyLegacySessionContext();
  if (IS_PREVIEW_REVIEW_SESSION) {
    const requestedPerson = state.people.find(person => normalizeReviewNickname(person.nickname) === normalizeReviewNickname(LOCAL_REVIEW_NICKNAME));
    if (requestedPerson) {
      state.ui.role = 'teacher';
      state.context.teacher = requestedPerson.nickname;
      state.context.department = requestedPerson.department;
    }
  }
  const rolledFromDate = rollWorkspaceToToday();
  if (rolledFromDate) persist(`已保留 ${formatShortDate(rolledFromDate)} 紀錄並開始今天`);
  if (openedFromNotification && initialSession?.role === 'teacher') state.ui.route = 'records';
  if (openedFromNotification && ['manager', 'admin'].includes(initialSession?.role)) state.ui.route = 'dashboard';
  renderApp();
  window.setTimeout(maybeShowPushPermissionReminder, 350);
  if (state.ui.route === 'settings') window.setTimeout(() => refreshPushStatus(true), 0);
  if (state.ui.route === 'records') window.setTimeout(loadLegacyArchiveFiles, 0);
  if (initialSession?.role === 'teacher') window.setTimeout(() => syncTeacherCloudData(openedFromNotification), 0);
  if (initialSession?.role === 'teacher' && state.ui.route === 'evaluation') {
    window.setTimeout(() => loadTeacherEvaluation('latest'), 0);
  }
  if (initialSession?.role === 'teacher' && state.integration.dailyDraftSyncPending) window.setTimeout(scheduleDailyCloudDraftSync, 1200);
  if (['manager', 'admin'].includes(initialSession?.role)) window.setTimeout(() => syncManagerCloudData(openedFromNotification), 0);
  if (['manager', 'admin'].includes(initialSession?.role) && state.ui.route === 'evaluations') {
    window.setTimeout(() => loadLatestManagerEvaluation(), 0);
  }
})();
