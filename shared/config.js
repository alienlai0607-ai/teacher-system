// 全站設定
window.APP_CONFIG = {
  // 部署 Apps Script 後填入網址（doGet 的 Web App URL）
  API_URL: 'https://script.google.com/macros/s/AKfycbzp-TGx9hLBdSnxVATVHZbXAcjP2sPKVAbYCyjWkMv-8j27mnJMMDdNZDCb3DXi7C4hKQ/exec',

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

  // 內容類型
  POST_TYPES: ['教學日常', '招生宣傳', '活動側拍', '理念分享', '學生成果', '其他'],
  FEEDBACK_TAGS: ['優秀表現', '已知悉', '需改進', '求助回應'],
};
