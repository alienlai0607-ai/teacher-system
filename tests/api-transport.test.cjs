const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.resolve(__dirname, '../shared/api.js'), 'utf8');

function response(text, status = 200) {
  return { status, text: async () => text };
}

function createApi(fetchImpl, options = {}) {
  const window = {
    APP_CONFIG: { API_URL: 'https://example.invalid/exec' },
    AUTH: { getSession: () => null, isImpersonating: () => false },
    setTimeout: (callback, delay) => { const deadline = options.deadlineMs && delay >= 25000; const timer = setTimeout(callback, deadline ? options.deadlineMs : delay < 2000 ? 0 : delay); if (delay >= 2000 && !deadline) timer.unref(); return timer; },
    clearTimeout,
  };
  const context = vm.createContext({
    window,
    fetch: fetchImpl,
    URL,
    JSON,
    Promise,
    Set,
    AbortController,
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

  let hungSignal;
  const hungApi = createApi((_url, init) => { hungSignal = init.signal; return new Promise(() => {}); }, { deadlineMs: 5 });
  const hungResult = await hungApi.saveLog({ nickname: 'QA' });
  assert.equal(hungResult.code, 'REQUEST_TIMEOUT');
  assert.equal(hungSignal.aborted, true, '永不回應的連線必須被中止');
  assert.equal(hungResult.uncertain, true, '逾時不能當成確定未写入');

  let savedId = ''; let mutations = 0; let confirmations = 0;
  const recoveryApi = createApi(async (_url, init) => {
    const payload = JSON.parse(init.body);
    if (payload.action === 'saveLog') { mutations++; savedId = payload.request_id; throw new Error('response lost after commit'); }
    if (payload.action === 'getLog') { confirmations++; return response(JSON.stringify({ ok: true, log: { log_id: 'LOG-20260906-QA', record_revision: 'rev-1', last_request_id: savedId } })); }
    throw new Error('unexpected API');
  });
  const recovered = await recoveryApi.saveLog({ nickname: 'QA', date: '2026-09-06' });
  assert.equal(recovered.ok, true);
  assert.equal(recovered.recovered, true);
  assert.equal(mutations, 1);
  assert.equal(confirmations, 1);

  let adminMutationId = ''; let adminReceiptReads = 0;
  const adminRecoveryApi = createApi(async (_url, init) => {
    const payload = JSON.parse(init.body);
    if (payload.action === 'saveAdminMarketingRecord') {
      adminMutationId = payload.request_id;
      throw new Error('response lost after admin commit');
    }
    if (payload.action === 'getAdminMarketingWorkspaceData') {
      adminReceiptReads += 1;
      return response(JSON.stringify({
        ok: true,
        records: adminReceiptReads < 3 ? [] : [{ id: 'daily-qa', lastRequestId: adminMutationId, recordRevision: 'rev-admin' }],
      }));
    }
    throw new Error('unexpected API');
  });
  const recoveredAdmin = await adminRecoveryApi.saveAdminMarketingRecord('QA', 'daily', { id: 'daily-qa' });
  assert.equal(recoveredAdmin.ok, true, '行政寫入失去原回覆時應輪詢到雲端回執');
  assert.equal(recoveredAdmin.recovered, true);
  assert.equal(adminReceiptReads, 3, '回執尚未出現時應有限重查，不可立即誤報失敗');

  let talentMutationId = ''; let talentReceiptReads = 0;
  const talentRecoveryApi = createApi(async (_url, init) => {
    const payload = JSON.parse(init.body);
    if (payload.action === 'updateTalentAppStatus') {
      assert.equal(payload.defer_report, true, 'APP 截圖寫入不得等待 PDF 產生才回覆');
      talentMutationId = payload.request_id;
      throw new Error('response lost after APP evidence commit');
    }
    if (payload.action === 'getTalentWorkspaceData') {
      talentReceiptReads += 1;
      return response(JSON.stringify({
        ok: true,
        lessons: talentReceiptReads < 2 ? [] : [{ id: 'lesson-qa', lastRequestId: talentMutationId, appStatus: 'published', appFiles: [{ fileId: 'photo-1' }] }],
      }));
    }
    throw new Error('unexpected API');
  });
  const recoveredTalentEvidence = await talentRecoveryApi.updateTalentAppStatus('QA', 'lesson-qa', 'published', [{ fileId: 'photo-1' }]);
  assert.equal(recoveredTalentEvidence.ok, true, 'APP 截圖寫入失去原回覆時應查回雲端結果');
  assert.equal(recoveredTalentEvidence.recovered, true);
  assert.equal(recoveredTalentEvidence.reportStatus, 'pending');
  assert.equal(talentReceiptReads, 2, 'APP 截圖回執尚未出現時應有限重查');

  let release; let duplicateCalls = 0;
  const clickApi = createApi(() => { duplicateCalls++; return new Promise(resolve => { release = () => resolve(response('{"ok":true}')); }); });
  const click1 = clickApi.saveLog({ nickname: 'QA' });
  const click2 = clickApi.saveLog({ nickname: 'QA' });
  assert.equal(duplicateCalls, 1, '連續點擊只送一筆');
  release();
  await Promise.all([click1, click2]);

  let pageCalls = 0;
  const pagesApi = createApi(async (_url, init) => {
    const payload = JSON.parse(init.body); pageCalls++;
    return response(JSON.stringify({ ok: true, logs: [{ log_id: payload.cursor ? 'older' : 'newer' }], next_cursor: payload.cursor ? null : 'next' }));
  });
  const history = await pagesApi.listLogs({ limit: 500 });
  assert.equal(history.logs.length, 2);
  assert.equal(history.complete, true);
  assert.equal(pageCalls, 2);

  console.log('api-transport.test.cjs passed');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
