const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const source = fs.readFileSync(path.join(__dirname, '../shared/local-drafts.js'), 'utf8');

function harness({ stalled = false } = {}) {
  const databases = new Map();
  const writes = [];
  const deadlines = [];
  const indexedDB = { open(name) {
    const request = {};
    if (stalled) return request;
    queueMicrotask(() => {
      if (!databases.has(name)) databases.set(name, new Map());
      const rows = databases.get(name);
      request.result = { close() {}, objectStoreNames: { contains: () => true }, transaction() {
        const transaction = { abort() { queueMicrotask(() => transaction.onabort?.()); }, objectStore() {
          function operation(action, key, value) {
            const result = {};
            queueMicrotask(() => {
              if (action === 'put') { rows.set(key, structuredClone(value)); writes.push(key); }
              if (action === 'delete') rows.delete(key);
              result.result = action === 'get' ? structuredClone(rows.get(key)) : undefined;
              result.onsuccess?.();
              transaction.oncomplete?.();
            });
            return result;
          }
          return { get: key => operation('get', key), put: (value, key) => operation('put', key, value), delete: key => operation('delete', key) };
        } };
        return transaction;
      } };
      request.onsuccess();
    });
    return request;
  } };
  const window = { indexedDB };
  vm.runInNewContext(source, { window, indexedDB, structuredClone, encodeURIComponent, setTimeout: (fn, ms) => {
    deadlines.push(ms); return setTimeout(fn, stalled ? 1 : ms);
  }, clearTimeout });
  return { api: window.KPI_LOCAL_DRAFTS, databases, writes, deadlines };
}

test('local drafts preserve binary bytes and isolate account namespaces', async () => {
  const { api } = harness();
  const original = new Uint8Array([0, 255, 1, 250, 13, 10]);
  const a = api.create('teacher:A:email-a:department');
  await a.put('draft', { bytes: new Blob([original]), name: '原檔.pdf' });
  const restored = await api.create('teacher:A:email-a:department').get('draft');
  assert.deepEqual(new Uint8Array(await restored.bytes.arrayBuffer()), original);
  assert.equal(restored.name, '原檔.pdf');
  assert.equal(await api.create('teacher:A:email-b:department').get('draft'), undefined);
});

test('newer pending snapshots coalesce while get and remove retain call order', async () => {
  const { api, writes } = harness();
  const vault = api.create('order');
  const saves = Array.from({ length: 30 }, (_, n) => vault.put('draft', { n }));
  await Promise.all(saves);
  assert.equal(writes.length, 1, 'typing bursts must not queue thirty bounded waits');
  assert.equal((await vault.get('draft')).n, 29);
  const first = vault.put('draft', { n: 1 });
  const readFirst = vault.get('draft');
  const remove = vault.remove('draft');
  const last = vault.put('draft', { n: 2 });
  assert.equal((await readFirst).n, 1);
  await Promise.all([first, remove, last]);
  assert.equal((await vault.get('draft')).n, 2);
});

test('unresponsive IndexedDB open has a five-second bound instead of hanging saves', async () => {
  const { api, deadlines } = harness({ stalled: true });
  await assert.rejects(api.create('blocked').get('draft'), /逾時/);
  assert.deepEqual(deadlines, [5000]);
});
