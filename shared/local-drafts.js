(function () {
  'use strict';
  // Structured cloning keeps the original File bytes out of localStorage.
  function create(scope) {
    let opening = null;
    let queue = Promise.resolve();
    const pendingWrites = new Map();
    function database() {
      if (opening) return opening;
      opening = new Promise((resolve, reject) => {
        if (!window.indexedDB) return reject(new Error('瀏覽器未提供附件暫存空間'));
        const request = indexedDB.open(`kpi-local-drafts-v1-${encodeURIComponent(scope)}`, 1);
        let expired = false;
        const timer = setTimeout(() => { expired = true; reject(new Error('本機暫存開啟逾時')); }, 5000);
        request.onupgradeneeded = () => { if (!request.result.objectStoreNames.contains('drafts')) request.result.createObjectStore('drafts'); };
        request.onerror = request.onblocked = () => { expired = true; clearTimeout(timer); reject(request.error || new Error('本機暫存無法開啟')); };
        request.onsuccess = () => {
          clearTimeout(timer);
          if (expired) { request.result.close(); return; }
          request.result.onversionchange = () => { request.result.close(); opening = null; };
          resolve(request.result);
        };
      }).catch(error => { opening = null; throw error; });
      return opening;
    }
    async function transact(mode, operation) {
      const db = await database();
      return new Promise((resolve, reject) => {
        const transaction = db.transaction('drafts', mode);
        let value;
        const timer = setTimeout(() => { try { transaction.abort(); } catch (error) {} reject(new Error('本機暫存逾時')); }, 5000);
        transaction.oncomplete = () => { clearTimeout(timer); resolve(value); };
        transaction.onerror = transaction.onabort = () => { clearTimeout(timer); reject(transaction.error || new Error('本機暫存未完成')); };
        try { const request = operation(transaction.objectStore('drafts')); request.onsuccess = () => { value = request.result; }; }
        catch (error) { clearTimeout(timer); try { transaction.abort(); } catch (ignored) {} reject(error); }
      });
    }
    function enqueue(operation) {
      const result = queue.catch(() => {}).then(operation);
      queue = result;
      return result;
    }
    return {
      get(key) { pendingWrites.delete(key); return enqueue(() => transact('readonly', store => store.get(key))); },
      put(key, value) {
        const snapshot = structuredClone(value);
        return new Promise((resolve, reject) => {
          const pending = pendingWrites.get(key);
          if (pending) { pending.snapshot = snapshot; pending.waiters.push({ resolve, reject }); return; }
          const batch = { snapshot, waiters: [{ resolve, reject }] };
          pendingWrites.set(key, batch);
          enqueue(() => {
            if (pendingWrites.get(key) === batch) pendingWrites.delete(key);
            return transact('readwrite', store => store.put(batch.snapshot, key));
          }).then(result => batch.waiters.forEach(waiter => waiter.resolve(result)), error => batch.waiters.forEach(waiter => waiter.reject(error)));
        });
      },
      remove(key) { pendingWrites.delete(key); return enqueue(() => transact('readwrite', store => store.delete(key))); },
    };
  }
  function capture(root) {
    const copy = root.cloneNode(true);
    copy.querySelectorAll('form').forEach(form => { form.inert = false; delete form.dataset.submitting; });
    copy.querySelectorAll('[data-uploading]').forEach(input => { input.disabled = false; delete input.dataset.uploading; });
    copy.querySelectorAll('[data-recovery-html]').forEach(button => {
      button.innerHTML = button.dataset.recoveryHtml;
      button.disabled = false;
      button.removeAttribute('aria-busy');
      delete button.dataset.recoveryHtml;
    });
    const fields = Array.from(root.querySelectorAll('input,select,textarea')).map(input => ({
      value: input.type === 'file' ? '' : input.value, checked: input.checked,
      files: input.type === 'file' ? Array.from(input.files || []) : undefined,
    }));
    return { html: copy.innerHTML, fields };
  }
  function restore(root, snapshot) {
    root.innerHTML = snapshot.html;
    Array.from(root.querySelectorAll('input,select,textarea')).forEach((input, index) => {
      const saved = snapshot.fields[index];
      if (!saved) return;
      if (input.type === 'file') {
        if (saved.files?.length) {
          try { const transfer = new DataTransfer(); saved.files.forEach(file => transfer.items.add(file)); input.files = transfer.files; } catch (error) { /* Callers also restore their file-selection maps. */ }
        }
      } else input.value = saved.value;
      if (typeof saved.checked === 'boolean') input.checked = saved.checked;
    });
  }
  window.KPI_LOCAL_DRAFTS = { create, capture, restore };
})();
