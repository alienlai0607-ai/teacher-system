// PWA 載入器：注入 manifest / 主題色 / Apple 圖示，並註冊 service worker
(function () {
  var p = location.pathname;
  var root = (p.indexOf('/teacher/') >= 0 || p.indexOf('/manager/') >= 0 || p.indexOf('/admin/') >= 0) ? '../' : '';
  function add(tag, attrs) {
    var el = document.createElement(tag);
    for (var k in attrs) el.setAttribute(k, attrs[k]);
    document.head.appendChild(el);
  }
  add('link', { rel: 'manifest', href: root + 'manifest.json' });
  add('meta', { name: 'theme-color', content: '#F5941E' });
  add('meta', { name: 'apple-mobile-web-app-capable', content: 'yes' });
  add('meta', { name: 'mobile-web-app-capable', content: 'yes' });
  add('meta', { name: 'apple-mobile-web-app-title', content: 'KPI 系統' });
  add('meta', { name: 'apple-mobile-web-app-status-bar-style', content: 'default' });
  add('link', { rel: 'apple-touch-icon', href: root + 'shared/icons/icon-192.png?v=2' });
  // 註：service worker 由 OneSignal SDK（push.js）負責註冊 OneSignalSDKWorker.js，
  // 這裡不再另外註冊 sw.js，避免兩個 SW 搶同一個 scope 衝突。
})();
