const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.resolve(__dirname, '../shared/api.js'), 'utf8');

function response(text, status = 200) {
  return { status, text: async () => text };
}

function createApi(fetchImpl) {
  const window = {
    APP_CONFIG: { API_URL: 'https://example.invalid/exec' },
    AUTH: { getSession: () => null, isImpersonating: () => false },
    setTimeout: callback => { callback(); return 1; },
  };
  const context = vm.createContext({
    window,
    fetch: fetchImpl,
    URL,
    JSON,
    Promise,
    Set,
    console: { warn: () => {}, error: () => {} },
  });
  vm.runInContext(source, context);
  return window.API;
}

(async () => {
  let readCalls = 0;
  const readApi = createApi(async () => {
    readCalls += 1;
    return readCalls === 1
      ? response('<!DOCTYPE html><title>temporary Google response</title>')
      : response('{"ok":true,"time":"now"}');
  });
  const readResult = await readApi.ping();
  assert.equal(readResult.ok, true, '讀取遇到暫時性 HTML 回應後應自動恢復');
  assert.equal(readCalls, 2, '讀取僅需重試到成功為止');

  let writeCalls = 0;
  const writeApi = createApi(async () => {
    writeCalls += 1;
    return response('<!DOCTYPE html><title>uncertain write response</title>');
  });
  const writeResult = await writeApi.saveLog({ nickname: 'QA' });
  assert.equal(writeResult.ok, false);
  assert.equal(writeResult.code, 'NON_JSON_RESPONSE');
  assert.equal(writeCalls, 1, '寫入不得自動重送，以免建立重複資料');
  assert.match(writeResult.error, /先到紀錄確認/);

  let failedReadCalls = 0;
  const failedReadApi = createApi(async () => {
    failedReadCalls += 1;
    throw new Error('offline');
  });
  const failedReadResult = await failedReadApi.listUsers('QA');
  assert.equal(failedReadResult.ok, false);
  assert.equal(failedReadCalls, 3, '讀取失敗應有兩次有限重試');
  assert.match(failedReadResult.error, /已自動重試/);

  console.log('api-transport.test.cjs passed');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
