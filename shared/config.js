// 全站設定
window.APP_CONFIG = {
  // 部署 Apps Script 後填入網址（doGet 的 Web App URL）
  API_URL: 'https://script.google.com/macros/s/AKfycbyNaJHvIiuHU9GEj6OO3o1KRb3PWhICBXA8C_K5A1jAxvv65_z4EY_D0QGoPerkcyOhaA/exec',

  // Google OAuth Client ID（在 Google Cloud Console 建立）
  GOOGLE_CLIENT_ID: '110974418283-75a7ifti599cauhptkcd0jsqshfrupbf.apps.googleusercontent.com',

  // OneSignal Web Push App ID（PWA 推播）
  ONESIGNAL_APP_ID: 'b597673d-9c75-440e-8e8b-1b5b49c4dad4',

  // 系統設定
  APP_NAME: '布拉克星球 KPI 系統',
  DEPARTMENTS: ['永康教室', '北區教室', '才藝部門'],

  // KPI 類別
  TEACHER_KPI: [
    { no: 1, name: '學校課業指導', max: 15, icon: '📚' },
    { no: 2, name: '班級經營', max: 15, icon: '🏫' },
    { no: 3, name: '專案課程', max: 10, icon: '🎯' },
    { no: 4, name: '群組經營', max: 10, icon: '💬' },
    { no: 5, name: '親師溝通', max: 15, icon: '🤝' },
    { no: 6, name: '個人態度', max: 5, icon: '⭐' },
  ],

  MANAGER_KPI: [
    { no: 1, name: '團隊領導與培訓', max: 15, icon: '👥' },
    { no: 2, name: '教學品質監督', max: 15, icon: '🔍' },
    { no: 3, name: '部門特色發展', max: 10, icon: '🚀' },
    { no: 4, name: '招生與發文', max: 10, icon: '📣' },
    { no: 5, name: '親師與客訴', max: 15, icon: '☎️' },
    { no: 6, name: '個人態度', max: 5, icon: '⭐' },
  ],

  // 安親部門老師專用 KPI（115/9 修訂版：KPI 總分 100，OKR 獨立另計、不納入 100）
  // 適用對象：role==='teacher' 且 department ∈ ANQIN_DEPARTMENTS（才藝部門老師與所有主管維持舊制）
  ANQIN_DEPARTMENTS: ['永康教室', '北區教室'],
  ANQIN_KPI: [
    { no: 1, name: '課業指導',       max: 20, icon: '📚' },
    { no: 2, name: '專案課程',       max: 20, icon: '🎯' },
    { no: 3, name: '班級經營',       max: 20, icon: '🏫' },
    { no: 4, name: '親師溝通',       max: 20, icon: '🤝' },
    { no: 5, name: '個人態度與表現', max: 12, icon: '⭐' },
    { no: 6, name: '班級環境整潔',   max: 8,  icon: '🧹' },
  ],

  // 內容類型
  POST_TYPES: ['教學日常', '招生宣傳', '活動側拍', '理念分享', '學生成果', '其他'],
  FEEDBACK_TAGS: ['優秀表現', '已知悉', '需改進', '求助回應'],
};

// ===== 計分模型判定（前端共用）=====
// 安親老師：teacher 且部門屬安親 → 100 分制；其餘 → 舊 70+30 制
window.isAnqinUser = function (user) {
  return !!user && user.role === 'teacher'
    && (APP_CONFIG.ANQIN_DEPARTMENTS || []).indexOf(user.department) >= 0;
};
// 依使用者回傳該套用的 KPI 定義（安親 100 分 or 老師 70 分）
window.getTeacherKpiDef = function (user) {
  return window.isAnqinUser(user) ? APP_CONFIG.ANQIN_KPI : APP_CONFIG.TEACHER_KPI;
};
// 安親 100 分制獎金級距（看 KPI 總分，滿分 100）
window.ANQIN_BONUS_TIERS = [
  { min: 95, max: 100, grade: '卓越',     bonus: 3000 },
  { min: 88, max: 94,  grade: '優良',     bonus: 2000 },
  { min: 82, max: 87,  grade: '達標',     bonus: 1000 },
  { min: 75, max: 81,  grade: '基本合格', bonus: 0 },
  { min: 0,  max: 74,  grade: '待改善',   bonus: 0 },
];
