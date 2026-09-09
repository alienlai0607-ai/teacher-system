const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const authSource = fs.readFileSync(path.join(root, 'shared/auth.js'), 'utf8');
const backendAuth = fs.readFileSync(path.join(root, 'apps-script/auth.gs'), 'utf8');
const anqinApp = fs.readFileSync(path.join(root, 'review/anqin-v2/app.js'), 'utf8');

assert.match(authSource, /24 \* 3600 \* 1000/, '前端仍應維持 24 小時登入期限');
assert.match(backendAuth, /API_SESSION_TTL_MS_ = 24 \* 60 \* 60 \* 1000/,
  '後端仍應維持 24 小時登入期限');
assert.match(anqinApp, /persistCurrentDrawerDraft\(true\)[\s\S]*persist\('未送出內容已保留'\)[\s\S]*location\.replace\(loginReturnPath\(\)\)/,
  '登入逾期必須先保留草稿，再導向登入頁');
assert.match(anqinApp, /redirecting: true[\s\S]*登入已逾時，正在重新登入/,
  '登入逾期不得只顯示無法送出的錯誤');
assert.match(anqinApp, /if \(!identity\.redirecting\) toast\(`無法正式送出/,
  '自動重登時不得疊加重複的錯誤提示');

const recoveryStart = anqinApp.indexOf('  let formalLoginRedirectScheduled = false;');
const recoveryEnd = anqinApp.indexOf('  function applyLegacySessionContext()', recoveryStart);
assert.ok(recoveryStart > 0 && recoveryEnd > recoveryStart, '應可載入登入恢復流程');

const events = [];
const recoveryContext = vm.createContext({
  IS_QA_HARNESS: false,
  IS_PREVIEW_REVIEW_SESSION: false,
  cloudDraftTimer: 7,
  state: { integration: { dailyDraftSyncPending: false } },
  window: {
    API: {},
    AUTH: {},
    clearTimeout: () => events.push('clear-timeout'),
    setTimeout: callback => { events.push('schedule-redirect'); callback(); },
    location: { replace: url => events.push(`redirect:${url}`) },
  },
  legacySession: () => null,
  cloudIdentityReady: () => false,
  persistCurrentDrawerDraft: force => events.push(`drawer-draft:${force}`),
  persist: message => events.push(`workspace-draft:${message}`),
  toast: (message, tone) => events.push(`toast:${tone}:${message}`),
  loginReturnPath: () => '../../index.html?return=review%2Fanqin-v2%2Findex.html',
  sessionRoleLabel: role => role,
  sameReviewIdentity: () => false,
  applyLegacySessionContext: () => {},
});
vm.runInContext(`${anqinApp.slice(recoveryStart, recoveryEnd)}\nglobalThis.runIdentityCheck = ensureCloudTeacherIdentity;`, recoveryContext);

(async () => {
  const result = await recoveryContext.runIdentityCheck();
  assert.deepEqual(JSON.parse(JSON.stringify(result)), {
    ok: false,
    code: 'AUTH_REQUIRED',
    redirecting: true,
    error: '登入已逾時，正在重新登入',
  });
  assert.equal(recoveryContext.state.integration.dailyDraftSyncPending, true);
  assert.deepEqual(events, [
    'clear-timeout',
    'drawer-draft:true',
    'workspace-draft:未送出內容已保留',
    'toast:warning:登入已逾時；未送出內容已保留，正在重新登入',
    'schedule-redirect',
    'redirect:../../index.html?return=review%2Fanqin-v2%2Findex.html',
  ]);
  console.log('session-continuity.test.cjs passed');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
