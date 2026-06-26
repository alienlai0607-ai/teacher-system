// OneSignal Web Push 整合
// 載入 SDK → init → 登入老師(用暱稱當 external_id，後端用它推播)
(function () {
  var appId = (window.APP_CONFIG && window.APP_CONFIG.ONESIGNAL_APP_ID) || '';
  if (!appId) return;

  var s = document.createElement('script');
  s.src = 'https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.page.js';
  s.defer = true;
  document.head.appendChild(s);

  window.OneSignalDeferred = window.OneSignalDeferred || [];
  window.OneSignalDeferred.push(async function (OneSignal) {
    try {
      await OneSignal.init({ appId: appId, allowLocalhostAsSecureOrigin: true });
      var sess = (window.AUTH && AUTH.getSession && AUTH.getSession());
      if (sess && sess.nickname) {
        await OneSignal.login(sess.nickname);   // 綁定暱稱，後端可指定推播
      }
    } catch (e) { /* 忽略，不影響網站其他功能 */ }
  });

  // 提供手動「開啟通知」用（按鈕呼叫 window.promptPush()）
  window.promptPush = function () {
    window.OneSignalDeferred = window.OneSignalDeferred || [];
    window.OneSignalDeferred.push(async function (OneSignal) {
      try {
        await OneSignal.Notifications.requestPermission();
        var sess = (window.AUTH && AUTH.getSession && AUTH.getSession());
        if (sess && sess.nickname) await OneSignal.login(sess.nickname);
      } catch (e) {}
    });
  };
})();
