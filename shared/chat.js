/**
 * 日報回饋對話串（老師 ↔ 主管/老闆 雙向對話）
 * 用法：
 *   CHAT.mount(container, {
 *     logId, meNick, otherNick,   // 我的暱稱 / 對方暱稱（老師端=主管、主管端=老師）
 *     tags: ['已知悉','優秀表現','需改進','求助回應'],  // 主管端才傳，老師端省略
 *     onSent: fn                  // 送出後回呼（可選，用來更新未讀等）
 *   })
 * 同一個 log_id 的所有 feedback 就是一串對話，from_nickname === meNick 顯示在右側。
 */
(function () {
  var injected = false;
  function ensureStyle() {
    if (injected) return; injected = true;
    var css = `
    .chat-wrap { margin-top: 10px; }
    .chat-toggle { font-size: 13px; color: var(--primary); cursor: pointer; font-weight: 700; user-select: none; }
    .chat-toggle .dot { display:inline-block; min-width:18px; height:18px; line-height:18px; text-align:center;
      background: var(--danger); color:#fff; border-radius:999px; font-size:11px; padding:0 5px; margin-left:4px; }
    .chat-box { margin-top: 8px; }
    .chat-empty { color: var(--text-light); font-size: 13px; padding: 6px 2px; }
    .chat-msg { display: flex; margin: 6px 0; }
    .chat-msg.me { justify-content: flex-end; }
    .chat-bubble { max-width: 78%; padding: 8px 12px; border-radius: 14px; font-size: 14px; line-height: 1.5; word-break: break-word; }
    .chat-msg.them .chat-bubble { background: #FFF3DE; border-bottom-left-radius: 4px; }
    .chat-msg.me .chat-bubble { background: var(--primary); color: #fff; border-bottom-right-radius: 4px; }
    .chat-meta { font-size: 11px; opacity: 0.75; margin-bottom: 2px; }
    .chat-tag { display:inline-block; font-size:11px; font-weight:700; padding:1px 8px; border-radius:999px;
      background:#fff; color: var(--accent); margin-top:4px; }
    .chat-msg.me .chat-tag { background: rgba(255,255,255,.25); color:#fff; }
    .chat-input { display: flex; gap: 6px; margin-top: 8px; align-items: flex-start; flex-wrap: wrap; }
    .chat-input textarea { flex: 1; min-width: 0; min-height: 40px; resize: vertical; font-family: inherit; font-size:14px;
      padding: 8px 10px; border: 1px solid var(--border); border-radius: 10px; }
    .chat-input select { border: 1px solid var(--border); border-radius: 10px; padding: 8px; font-size: 13px; }
    @media (max-width: 500px) { .chat-input textarea, .chat-input select { width: 100%; flex-basis: 100%; } }
    `;
    var s = document.createElement('style'); s.textContent = css; document.head.appendChild(s);
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }
  function fmt(iso) {
    if (!iso) return '';
    var d = new Date(iso);
    if (isNaN(d)) return '';
    var mm = String(d.getMonth() + 1).padStart(2, '0'), dd = String(d.getDate()).padStart(2, '0');
    var hh = String(d.getHours()).padStart(2, '0'), mi = String(d.getMinutes()).padStart(2, '0');
    return mm + '/' + dd + ' ' + hh + ':' + mi;
  }

  var CHAT = {
    // 直接渲染一串（傳入已取得的 thread 陣列），回傳 HTML 字串——列表頁想一次撈完自己塞
    renderThread: function (thread, meNick) {
      ensureStyle();
      if (!thread || !thread.length) return '<div class="chat-empty">尚無對話</div>';
      return thread.map(function (m) {
        var mine = m.from_nickname === meNick;
        var showTag = m.tag && m.tag !== '回覆' && m.tag !== '已知悉';
        return '<div class="chat-msg ' + (mine ? 'me' : 'them') + '">' +
          '<div class="chat-bubble">' +
          '<div class="chat-meta">' + esc(m.from_nickname) + ' · ' + fmt(m.created_at) + '</div>' +
          esc(m.content) +
          (showTag ? '<div><span class="chat-tag">' + esc(m.tag) + '</span></div>' : '') +
          '</div></div>';
      }).join('');
    },

    // 完整互動元件：載入對話 + 輸入框 + 送出
    mount: function (container, opts) {
      ensureStyle();
      var el = (typeof container === 'string') ? document.getElementById(container) : container;
      if (!el) return;
      var meNick = opts.meNick, otherNick = opts.otherNick, logId = opts.logId;
      var tags = opts.tags || null;
      var uid = 'chat_' + Math.abs(hash(logId));

      el.classList.add('chat-wrap');
      el.innerHTML =
        '<div class="chat-toggle" id="' + uid + '_t">💬 對話<span id="' + uid + '_n"></span></div>' +
        '<div class="chat-box" id="' + uid + '_b" style="display:none;">' +
          '<div id="' + uid + '_list"><div class="chat-empty">載入中…</div></div>' +
          '<div class="chat-input">' +
            '<textarea id="' + uid + '_in" placeholder="輸入訊息…"></textarea>' +
            (tags ? '<select id="' + uid + '_tag">' + tags.map(function (t) { return '<option>' + esc(t) + '</option>'; }).join('') + '</select>' : '') +
            '<button class="btn btn-primary btn-sm" id="' + uid + '_send">送出</button>' +
          '</div>' +
        '</div>';

      var box = document.getElementById(uid + '_b');
      var toggle = document.getElementById(uid + '_t');
      var open = opts.open === true;
      box.style.display = open ? 'block' : 'none';
      toggle.onclick = function () { box.style.display = box.style.display === 'none' ? 'block' : 'none'; if (box.style.display === 'block') load(); };

      function load() {
        API.listFeedbackThread({ log_id: logId }).then(function (res) {
          var list = document.getElementById(uid + '_list');
          if (!res || !res.ok) { list.innerHTML = '<div class="chat-empty">載入失敗</div>'; return; }
          list.innerHTML = CHAT.renderThread(res.thread, meNick);
          list.scrollTop = list.scrollHeight;
          var badge = document.getElementById(uid + '_n');
          if (badge) badge.textContent = res.thread.length ? '（' + res.thread.length + '）' : '';
        });
      }

      document.getElementById(uid + '_send').onclick = function () {
        var ta = document.getElementById(uid + '_in');
        var content = ta.value.trim();
        if (!content) { UI.toast('請輸入訊息', 'warn'); return; }
        var tagSel = document.getElementById(uid + '_tag');
        var tag = tagSel ? tagSel.value : '';
        UI.loading(true);
        API.addFeedback({ log_id: logId, from_nickname: meNick, to_nickname: otherNick, content: content, tag: tag })
          .then(function (res) {
            UI.loading(false);
            if (!res || !res.ok) { UI.toast((res && res.error) || '送出失敗', 'danger'); return; }
            ta.value = '';
            load();
            if (opts.onSent) opts.onSent();
          });
      };

      if (open && !opts.thread) load();
      return { reload: load };
    }
  };

  function hash(s) { var h = 0; s = String(s); for (var i = 0; i < s.length; i++) { h = (h << 5) - h + s.charCodeAt(i); h |= 0; } return h; }
  window.CHAT = CHAT;
})();
