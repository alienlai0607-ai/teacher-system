(function () {
  'use strict';
  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[char]));
  const key = value => String(value || '').trim().replace(/\s+/g, '').replace(/(?:老師|主管)$/, '').toLowerCase();
  const icon = name => `<i data-lucide="${name}" width="18" height="18" aria-hidden="true"></i>`;
  let owner = '', preview = false, status = 'idle', message = '', classes = [], campus = '北區';
  let pending = null, busy = false, fetchedAt = 0, requestNumber = 0;
  const storageKey = 'bp_admin_marketing_v1_shared';
  const own = items => (items || []).filter(item => item.active !== false && key(item.teacher) === key(owner));

  function previewSnapshot() {
    const shared = JSON.parse(localStorage.getItem(storageKey) || '{}');
    return { ok: true, scope: 'own', classes: own(shared.classRoster?.classes), history: [], syncedAt: new Date().toISOString() };
  }

  function accept(result) {
    if (!result?.ok || result.scope !== 'own' || !Array.isArray(result.classes)) throw new Error(result?.error || '班級資料尚未開通，請聯絡主管');
    if (result.classes.some(item => key(item.teacher) !== key(owner))) throw new Error('班級帳號對應異常，請聯絡主管');
    classes = own(result.classes).map(window.RosterTime.item);
    if (!classes.some(item => item.campus === campus)) campus = classes[0]?.campus || '北區';
    status = 'ready'; fetchedAt = Date.now();
  }

  async function load() {
    if (busy || status === 'loading') return;
    const generation = ++requestNumber;
    status = 'loading'; paint();
    try {
      const result = preview ? previewSnapshot() : await window.API.getClassRosterData({ scope: 'own' });
      if (generation !== requestNumber) return;
      accept(result); message = '';
    } catch (error) {
      status = 'error'; message = error.message || '班級讀取失敗，請重新讀取';
      classes = [];
    }
    paint();
  }

  function paint() {
    const root = document.getElementById('teacher-class-roster');
    if (!root) return;
    const campuses = ['北區', '東橋'].filter(value => classes.some(item => item.campus === value));
    const sorted = classes.filter(item => item.campus === campus).sort((a, b) =>
      '一二三四五六日'.indexOf(a.weekday) - '一二三四五六日'.indexOf(b.weekday) || a.start.localeCompare(b.start));
    root.innerHTML = `<div class="panel-head"><div><h2>我的班級人數</h2><p>正式學生 · 體驗不計入</p></div><button type="button" class="btn btn-small" data-own-roster="refresh" ${busy || status === 'loading' ? 'disabled' : ''}>${icon('refresh-cw')}更新</button></div>
      ${message ? `<p class="own-roster-message ${status === 'error' ? 'is-error' : ''}" role="status">${esc(message)}</p>` : ''}
      ${status === 'loading' ? '<p class="own-roster-empty" role="status">正在讀取班級人數…</p>' : ''}
      ${status === 'ready' ? `${campuses.length > 1 ? `<div class="own-roster-campuses" role="group" aria-label="我的分校">${campuses.map(value => `<button type="button" data-own-roster="campus" data-campus="${value}" aria-pressed="${campus === value}">${value}</button>`).join('')}</div>` : ''}
      ${sorted.length ? sorted.map(item => `<article class="own-roster-row" data-own-class="${esc(item.id)}"><div><strong>${esc(item.course)}</strong><small>${esc(item.campus)} · ${esc(item.code)} · 週${esc(item.weekday)} ${esc(item.start)}–${esc(item.end)}</small></div><div class="own-roster-counter"><button type="button" data-own-roster="adjust" data-id="${esc(item.id)}" data-delta="-1" aria-label="${esc(item.code)} 減少正式學生" title="減少正式學生" ${busy || item.count <= 0 ? 'disabled' : ''}>${icon('minus')}</button><strong>${item.count}<small>人</small></strong><button type="button" data-own-roster="adjust" data-id="${esc(item.id)}" data-delta="1" aria-label="${esc(item.code)} 增加正式學生" title="增加正式學生" ${busy ? 'disabled' : ''}>${icon('plus')}</button></div></article>`).join('') : '<p class="own-roster-empty">尚未有對應的班級，請由行政或主管確認授課老師名稱。</p>'}` : ''}
      ${pending ? renderConfirmation() : ''}`;
    window.lucide?.createIcons({ root });
  }

  function renderConfirmation() {
    const item = classes.find(value => value.id === pending.classId);
    if (!item) return '';
    const reasons = pending.delta > 0 ? ['新生正式報名', '體驗轉正式', '正式人數更正'] : ['退班或轉班', '正式人數更正'];
    return `<form class="own-roster-confirm" id="own-roster-confirm"><strong>${esc(item.code)} ${esc(item.course)}：${item.count} → ${item.count + pending.delta} 人</strong>
      <label>異動原因<select name="reason" required>${reasons.map(reason => `<option${reason === pending.reason ? ' selected' : ''}>${reason}</option>`).join('')}</select></label>
      ${pending.delta > 0 ? `<label class="own-roster-check"><input type="checkbox" name="formal" required ${pending.formal ? 'checked' : ''}>已正式報名，非體驗學生</label>` : ''}
      <div class="own-roster-confirm-actions"><button type="button" class="btn" data-own-roster="cancel" ${busy ? 'disabled' : ''}>取消</button><button class="btn btn-primary" type="submit" ${busy ? 'disabled' : ''}>${busy ? '儲存中…' : '確認調整'}</button></div></form>`;
  }

  function previewSave(payload) {
    const shared = JSON.parse(localStorage.getItem(storageKey) || '{}');
    const roster = shared.classRoster;
    const item = own(roster?.classes).find(value => value.id === payload.classId);
    if (!item) throw new Error('班級歸屬已變更，請重新讀取');
    if (item.version !== payload.version) return { ok: false, code: 'RECORD_CONFLICT', error: '班級人數已有更新，請核對後再次確認', classRoster: previewSnapshot() };
    const before = item.count;
    item.count += payload.delta; item.version += 1; item.updatedAt = new Date().toISOString(); item.updatedBy = owner;
    roster.history = [{ id: payload.requestId, requestId: payload.requestId, action: 'adjust', classId: item.id, code: item.code, campus: item.campus, course: item.course, beforeCount: before, afterCount: item.count, reason: payload.reason, actor: owner, at: item.updatedAt }, ...(roster.history || [])];
    localStorage.setItem(storageKey, JSON.stringify(shared));
    return { ok: true, classRoster: previewSnapshot() };
  }

  async function save(form) {
    if (busy || !pending || !form.reportValidity()) return;
    const data = new FormData(form);
    pending.reason = String(data.get('reason')); pending.formal = data.has('formal');
    const operation = { ...pending, studentType: 'formal' };
    busy = true; message = ''; paint();
    try {
      const result = preview ? previewSave(operation) : await window.API.saveClassRosterMutation('adjust', {
        classId: operation.classId, version: operation.version, delta: operation.delta, reason: operation.reason, studentType: 'formal',
      }, { scope: 'own', request_id: operation.requestId });
      if (!result?.ok) {
        if (result?.classRoster?.scope === 'own') accept({ ok: true, ...result.classRoster });
        if (result?.code === 'RECORD_CONFLICT') {
          const current = classes.find(item => item.id === pending.classId);
          if (current) pending = { ...pending, version: current.version, requestId: crypto.randomUUID() };
          else pending = null;
        }
        throw new Error(result?.error || '尚未確認儲存，請稍後重試');
      }
      accept({ ok: true, ...result.classRoster });
      pending = null; message = '正式人數已儲存，行政與主管可查看相同人數。';
    } catch (error) {
      message = error.message || '儲存失敗，請重試';
    } finally { busy = false; paint(); }
  }

  document.addEventListener('click', event => {
    const button = event.target.closest('[data-own-roster]');
    if (!button || busy) return;
    const action = button.dataset.ownRoster;
    if (action === 'refresh') { pending = null; load(); }
    if (action === 'campus') { campus = button.dataset.campus; pending = null; paint(); }
    if (action === 'cancel') { pending = null; paint(); }
    if (action === 'adjust' && status === 'ready') {
      const item = classes.find(value => value.id === button.dataset.id);
      const delta = Number(button.dataset.delta);
      if (!item || ![-1, 1].includes(delta) || item.count + delta < 0) return;
      pending = { classId: item.id, version: item.version, delta, requestId: crypto.randomUUID() };
      message = ''; paint();
      document.getElementById('own-roster-confirm')?.scrollIntoView({ block: 'nearest' });
    }
  });
  document.addEventListener('submit', event => {
    if (event.target.id !== 'own-roster-confirm') return;
    event.preventDefault(); save(event.target);
  });
  const refreshVisible = () => {
    if (document.visibilityState === 'visible' && document.getElementById('teacher-class-roster') && !pending && Date.now() - fetchedAt > 30000) load();
  };
  window.addEventListener('focus', refreshVisible);
  document.addEventListener('visibilitychange', refreshVisible);
  window.addEventListener('storage', event => { if (preview && event.key === storageKey) refreshVisible(); });
  window.TeacherClassRoster = {
    mount(options) {
      if (owner !== options.nickname) { owner = options.nickname; classes = []; status = 'idle'; pending = null; ++requestNumber; }
      preview = options.preview === true;
      if (!document.getElementById('teacher-class-roster')) return;
      paint();
      if (status === 'idle' || !pending && status === 'ready' && Date.now() - fetchedAt > 30000) load();
    },
  };
})();
