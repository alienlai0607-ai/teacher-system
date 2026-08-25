// OneSignal Web Push 整合
// 載入 SDK → init → 將 subscription ID 經登入驗證後登記到後端
(function () {
  var appId = (window.APP_CONFIG && window.APP_CONFIG.ONESIGNAL_APP_ID) || '';
  if (!appId) return;

  var oneSignalClient = null;
  var latestStatus = null;
  var initializationPromise = null;
  var subscriptionListenerAttached = false;

  function nativePermission() {
    return 'Notification' in window ? Notification.permission : 'unsupported';
  }

  function readStatus(OneSignal) {
    var subscription = OneSignal && OneSignal.User && OneSignal.User.PushSubscription;
    var notifications = OneSignal && OneSignal.Notifications;
    var supported = Boolean(notifications && notifications.isPushSupported && notifications.isPushSupported());
    var permission = Boolean(notifications && notifications.permission);
    var subscriptionId = subscription && subscription.id ? String(subscription.id) : '';
    var optedIn = Boolean(subscription && subscription.optedIn);
    return {
      ready: true,
      supported: supported,
      permission: permission,
      nativePermission: nativePermission(),
      optedIn: optedIn,
      subscriptionId: subscriptionId,
      subscribed: Boolean(supported && permission && optedIn && subscriptionId),
    };
  }

  function publishStatus(status) {
    latestStatus = status;
    try {
      window.dispatchEvent(new CustomEvent('kpi-push-status-change', { detail: status }));
    } catch (e) {}
    return status;
  }

  async function syncSubscription(status) {
    if (!status || !status.subscribed || !status.subscriptionId || !window.API?.registerPushSubscription) return status;
    var sess = window.AUTH?.getSession?.();
    if (!sess || !sess.session_token) return status;
    var result = await window.API.registerPushSubscription(status.subscriptionId);
    if (!result?.ok) return { ...status, subscribed: false, error: result?.error || 'APP 訂閱登記失敗' };
    return status;
  }

  function unavailableStatus(error) {
    return {
      ready: false,
      supported: 'Notification' in window,
      permission: nativePermission() === 'granted',
      nativePermission: nativePermission(),
      optedIn: false,
      subscriptionId: '',
      subscribed: false,
      error: error || '',
    };
  }

  function waitForSubscription(OneSignal) {
    return new Promise(function (resolve) {
      var attempts = 0;
      function check() {
        var status = readStatus(OneSignal);
        if (status.subscribed || attempts >= 32) {
          resolve(status);
          return;
        }
        attempts += 1;
        window.setTimeout(check, 250);
      }
      check();
    });
  }

  function attachSubscriptionListener(OneSignal) {
    var subscription = OneSignal && OneSignal.User && OneSignal.User.PushSubscription;
    if (subscriptionListenerAttached || !subscription || typeof subscription.addEventListener !== 'function') return;
    subscriptionListenerAttached = true;
    subscription.addEventListener('change', async function () {
      publishStatus(await syncSubscription(readStatus(OneSignal)));
    });
  }

  var s = document.createElement('script');
  s.src = 'https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.page.js';
  s.defer = true;
  document.head.appendChild(s);

  window.OneSignalDeferred = window.OneSignalDeferred || [];
  window.OneSignalDeferred.push(async function (OneSignal) {
    oneSignalClient = OneSignal;
    initializationPromise = (async function () {
      try {
        await OneSignal.init({ appId: appId, allowLocalhostAsSecureOrigin: true });
        attachSubscriptionListener(OneSignal);
        publishStatus(await syncSubscription(readStatus(OneSignal)));
        return true;
      } catch (e) {
        publishStatus(unavailableStatus(e && e.message ? e.message : String(e || '')));
        return false;
      }
    })();
    await initializationPromise;
  });

  window.getPushStatus = function () {
    if (oneSignalClient && initializationPromise) {
      return initializationPromise.then(function () {
        return latestStatus?.error ? latestStatus : publishStatus(readStatus(oneSignalClient));
      });
    }
    if (latestStatus && latestStatus.error) return Promise.resolve(latestStatus);
    return new Promise(function (resolve) {
      var settled = false;
      var timer = window.setTimeout(function () {
        if (settled) return;
        settled = true;
        resolve(publishStatus(unavailableStatus('APP 通知服務載入逾時')));
      }, 8000);
      window.OneSignalDeferred = window.OneSignalDeferred || [];
      window.OneSignalDeferred.push(async function (OneSignal) {
        if (settled) return;
        if (initializationPromise) await initializationPromise;
        settled = true;
        window.clearTimeout(timer);
        oneSignalClient = OneSignal;
        resolve(publishStatus(readStatus(OneSignal)));
      });
    });
  };

  // 手動開啟時同時取得瀏覽器權限、恢復訂閱並綁定目前登入者。
  window.promptPush = function () {
    return new Promise(function (resolve) {
      window.OneSignalDeferred = window.OneSignalDeferred || [];
      window.OneSignalDeferred.push(async function (OneSignal) {
        try {
          oneSignalClient = OneSignal;
          if (initializationPromise && !(await initializationPromise)) {
            resolve(latestStatus || unavailableStatus('APP 通知服務初始化失敗'));
            return;
          }
          if (!OneSignal.Notifications.isPushSupported()) {
            resolve(publishStatus(readStatus(OneSignal)));
            return;
          }
          if (!OneSignal.Notifications.permission) await OneSignal.Notifications.requestPermission();
          if (OneSignal.Notifications.permission) {
            await OneSignal.User.PushSubscription.optIn();
          }
          resolve(publishStatus(await syncSubscription(await waitForSubscription(OneSignal))));
        } catch (e) {
          resolve(publishStatus(unavailableStatus(e && e.message ? e.message : String(e || ''))));
        }
      });
    });
  };
})();
