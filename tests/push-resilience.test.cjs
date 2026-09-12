const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../shared/push.js'), 'utf8');

function harness() {
  const timers = new Map();
  let id = 0;
  let script;
  const c = vm.createContext({
    URLSearchParams, Notification: { permission: 'default' }, CustomEvent: class {},
    document: { createElement: () => ({}), head: { appendChild: node => { script = node; } } },
    window: {
      location: { search: '' }, APP_CONFIG: { ONESIGNAL_APP_ID: 'isolated-test' }, Notification: {},
      dispatchEvent() {}, setTimeout: (fn, ms) => { timers.set(++id, { fn, ms }); return id; },
      clearTimeout: id => timers.delete(id),
    },
  });
  vm.runInContext(source, c);
  return { c, script, fire(ms) { for (const [id, timer] of [...timers]) if (timer.ms === ms) { timers.delete(id); timer.fn(); } } };
}

(async () => {
  const missing = harness();
  const waiting = missing.c.window.promptPush();
  missing.fire(30000);
  assert.match((await waiting).error, /逾時/);
  let lateCalls = 0;
  await missing.c.window.OneSignalDeferred[1]({ Notifications: { isPushSupported: () => { lateCalls++; } } });
  assert.equal(lateCalls, 0, 'late SDK callback must not request permissions after timeout');

  const failed = harness();
  failed.script.onerror();
  assert.match((await failed.c.window.promptPush()).error, /載入失敗/);

  const hanging = harness();
  const init = hanging.c.window.OneSignalDeferred[0]({ init: () => new Promise(() => {}) });
  const status = hanging.c.window.getPushStatus();
  hanging.fire(8000);
  await init;
  assert.match((await status).error, /初始化逾時/);
  assert.match((await hanging.c.window.promptPush()).error, /初始化逾時/);

  const normal = harness();
  const sdk = {
    init: async () => {},
    Notifications: { isPushSupported: () => true, permission: true },
    User: { PushSubscription: { id: 'isolated-subscription', optedIn: true, addEventListener() {}, optIn: async () => {} } },
  };
  await normal.c.window.OneSignalDeferred[0](sdk);
  const subscribed = normal.c.window.promptPush();
  await normal.c.window.OneSignalDeferred[1](sdk);
  assert.equal((await subscribed).subscribed, true);
  console.log('PASS optional notification: missing SDK, load failure, hung initialization, late callback cancellation, successful subscription');
})().catch(error => { console.error(error); process.exitCode = 1; });
