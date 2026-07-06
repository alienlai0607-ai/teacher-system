// 日誌「人話」渲染元件：把 kpi1~6_data 轉成主管/老師都看得懂的中文區塊
// 用法：LOGVIEW.renderLog(log) → html 字串（需搭配 .kpi-block / .kpi-block-title 樣式，或內建 fallback 樣式）
window.LOGVIEW = (function () {

  const COURSE_LABELS = { name: '課程名稱', class: '上課班級', progress: '教學進度', learning: '孩子學習狀況', next: '下次課程準備' };

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  }
  function has(v) {
    return v != null && v !== '' && v !== 'undefined' && !(Array.isArray(v) && v.length === 0);
  }
  function row(label, v) {
    if (!has(v)) return '';
    const val = Array.isArray(v) ? v.map(esc).join('、') : esc(v);
    return `<div class="lv-row"><span class="lv-label">${label}</span><span class="lv-val">${val}</span></div>`;
  }
  function block(title, inner) {
    if (!inner) return '';
    return `<div class="kpi-block lv-block"><div class="kpi-block-title">${title}</div>${inner}</div>`;
  }
  function thumb(url, fileId) {
    const id = fileId || ((url || '').match(/\/d\/([^/]+)/) || [])[1];
    return id ? `https://drive.google.com/thumbnail?id=${id}&sz=w200` : url;
  }
  function photoWall(list) {
    if (!list || !list.length) return '';
    // 依 url 去重
    const seen = {};
    const uniq = list.filter(p => p.url && !seen[p.url] && (seen[p.url] = true));
    return `<div class="lv-photos">` + uniq.map(p => {
      const id = p.fileId || ((p.url || '').match(/\/d\/([^/]+)/) || [])[1] || '';
      return `<a href="${esc(p.url)}" target="_blank"><img src="${esc(thumb(p.url, p.fileId))}" data-fbid="${esc(id)}" onerror="LOGVIEW.thumbFallback(this)" loading="lazy" alt="照片"></a>`;
    }).join('') + `</div>`;
  }

  // Drive 縮圖失敗 → lh3 備援 → 相機圖示
  function thumbFallback(img) {
    const id = img.getAttribute('data-fbid');
    if (!img.dataset.f && id) {
      img.dataset.f = '1';
      img.src = 'https://lh3.googleusercontent.com/d/' + id + '=w200';
      return;
    }
    const holder = document.createElement('div');
    holder.style.cssText = 'width:64px;height:64px;display:flex;align-items:center;justify-content:center;font-size:20px;background:#faf6ef;border:1px solid #eadbc2;border-radius:8px;';
    holder.textContent = '📷';
    img.replaceWith(holder);
  }

  function renderLog(l) {
    const k1 = l.kpi1_data || {}, k2 = l.kpi2_data || {}, k3 = l.kpi3_data || {},
          k5 = l.kpi5_data || {}, k6 = l.kpi6_data || {};
    const photos = (Array.isArray(l.attachments) ? l.attachments : []).filter(a => a && a.type === 'photo');
    const envPhotos = photos.filter(p => String(p.forType || '').indexOf('env_') === 0);
    const otherPhotos = photos.filter(p => String(p.forType || '').indexOf('env_') !== 0);
    let html = '';

    // 工作類型
    if (has(k6.work_types)) {
      html += `<div class="lv-tags">${(k6.work_types || []).map(t => `<span class="lv-tag">${esc(t)}</span>`).join('')}</div>`;
    }

    // 環境整潔（勾了的顯示 ✓）
    const envMap = [['env_classroom', '教室環境'], ['env_tools', '教具歸位'], ['env_trash', '垃圾清理'], ['env_toilet', '廁所清理']];
    const envDone = envMap.filter(([k]) => k2[k] === true).map(([, n]) => n);
    let envInner = '';
    if (envDone.length) envInner += `<div class="lv-row"><span class="lv-val">✅ ${envDone.join('、')}</span></div>`;
    envInner += row('設備異常', k2.equipment_issue);
    envInner += photoWall(envPhotos);
    html += block('🧹 環境整潔', envInner);

    // 工作日誌
    html += block('📝 工作日誌',
      row('今日執行', k6.today_done) + row('班級狀況', k2.class_status) +
      row('特殊事件', k6.special_event) + row('明日待辦', k6.tomorrow_todo));

    // 安親輔導
    html += block('📖 安親輔導',
      row('複習方式', k1.review_method) + row('孩子易錯處', k1.error_points) +
      row('協助理解方法', k1.help_method) + row('反應與成效', k1.outcome));

    // 課程紀錄（每堂一張小卡）
    const courses = Array.isArray(k3.courses) ? k3.courses : [];
    courses.forEach(c => {
      const inner = row('課程名稱', c.name) + row('上課班級', c.class) +
        row('教學進度', c.progress) + row('孩子學習狀況', c.learning) + row('下次課程準備', c.next);
      if (inner) html += block(`📚 ${esc(c.type || '課程紀錄')}`, inner);
    });

    // 專案
    if (k3.project) {
      const p = k3.project;
      html += block('🎯 專案紀錄',
        row('今日進度', p.progress) + row('完成項目', p.done) +
        row('遇到問題', p.problem) + row('下階段規劃', p.plan));
    }

    // 親師溝通
    let pcInner = '';
    if (k5.parent_contacted === true) pcInner += row('家長聯繫', '有');
    else if (k5.parent_contacted === false) pcInner += row('家長聯繫', '今日無');
    pcInner += row('溝通摘要', k5.parent_summary);
    pcInner += row('相關學生', k5.special_students);
    pcInner += row('學生特殊狀況', k5.student_special);
    html += block('🤝 親師溝通', pcInner);

    // 行政
    html += block('🗂 行政工作', row('內容/成果', k6.admin_result));

    // 課程/專案照片
    if (otherPhotos.length) html += block(`📷 課程照片（${otherPhotos.length}）`, photoWall(otherPhotos));

    ensureStyle();
    return html || '<div class="muted text-sm">（本日無內容）</div>';
  }

  let styleInjected = false;
  function ensureStyle() {
    if (styleInjected) return;
    styleInjected = true;
    const s = document.createElement('style');
    s.textContent = STYLE;
    document.head.appendChild(s);
  }

  const STYLE = `
  .lv-row { display:flex; gap:8px; font-size:13px; line-height:1.7; padding:2px 0; }
  .lv-label { color:#a08050; flex:none; min-width:84px; font-weight:600; }
  .lv-val { color:#3d3428; white-space:pre-wrap; word-break:break-word; }
  .lv-tags { display:flex; flex-wrap:wrap; gap:6px; margin-bottom:8px; }
  .lv-tag { background:#FFF3E0; border:1px solid #F5941E; color:#B5710E; border-radius:999px; padding:2px 12px; font-size:12px; font-weight:700; }
  .lv-photos { display:flex; flex-wrap:wrap; gap:6px; margin-top:6px; }
  .lv-photos img { width:64px; height:64px; object-fit:cover; border-radius:8px; border:1px solid #eadbc2; display:block; }
  .lv-block .kpi-block-title { margin-bottom:4px; }
  `;

  return { renderLog, esc, photoWall, thumb, thumbFallback };
})();
