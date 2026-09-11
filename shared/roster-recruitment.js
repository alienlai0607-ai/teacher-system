(function (root) {
  'use strict';
  function dateKey(value) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? '' : new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Taipei' }).format(date);
  }
  function evaluate(item, now = new Date()) {
    if (Number(item.count) >= 4) return null;
    const since = dateKey(item.lowEnrollmentSince || '');
    const today = dateKey(now);
    const days = since && today ? Math.max(0, Math.round((Date.parse(today + 'T00:00:00Z') - Date.parse(since + 'T00:00:00Z')) / 86400000)) : null;
    const weeks = days === null ? 0 : Math.floor(days / 7);
    const level = Math.min(5, Math.max(1, weeks));
    const stages = {
      1: ['招生關注', ['更新官方社群的課程時段、適合年齡與正式名額。', '分享課堂作品或教學成果，附上一個清楚的預約入口。']],
      2: ['連續兩週不足 4 人 · 優先招生', ['本週發布一則課堂成果或短影片，清楚標示分校、星期、時段與預約方式。', '詢問已表達興趣的家長，確認卡在時段、年齡或課程內容，避免反覆群發。']],
      3: ['連續三週不足 4 人 · 加強招生', ['換一組作品、照片或主題，測試不同的課程介紹；比較詢問與預約數。', '邀請既有家長轉介合適朋友，安排可實際預約的體驗時段；體驗不列入正式人數。']],
      4: ['連續四週不足 4 人 · 主管共同檢討', ['行政與授課老師一起檢查時段、年齡對象與家長疑慮，找出詢問後未報名的原因。', '選定一項調整，例如時段或活動主題，由主管確認後執行，下一週查看正式報名變化。']],
      5: ['持續低人數 · 主管優先處理', ['主管每週與行政、授課老師確認曝光、詢問、體驗及正式報名的落差。', '依實際需求評估換時段、跨班邀約或合班可行性；先與家長確認再調整課程。']],
    };
    return { since, days, weeks, level, missing: Math.max(0, 4 - Number(item.count || 0)), title: stages[level][0], actions: stages[level][1] };
  }
  const api = { evaluate };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.RosterRecruitment = api;
})(typeof window === 'object' ? window : globalThis);
