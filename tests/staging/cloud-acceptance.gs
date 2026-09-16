/** Editor-only QA functions. This file must never be bundled into production. */
function qaStageBootstrap() {
  if (SHEET_ID !== '') throw new Error('QA refuses a configured production database');
  const owner = String(Session.getActiveUser().getEmail() || '').toLowerCase();
  if (!owner) throw new Error('QA requires the signed-in project owner');
  const props = PropertiesService.getScriptProperties();
  if (props.getProperty('LINE_TOKEN') || ScriptApp.getProjectTriggers().length) throw new Error('QA requires a new project without notifications or triggers');
  let ss;
  if (props.getProperty('SHEET_ID')) { qaStageGuard_(); ss = getSS(); }
  else {
    ss = SpreadsheetApp.create('KPI-QA-20260914-Isolated-Acceptance');
    ss.setSpreadsheetTimeZone('Asia/Taipei');
    props.setProperties({ SHEET_ID: ss.getId(), QA_STAGE_SHEET: ss.getId(), QA_STAGE_SCRIPT: ScriptApp.getScriptId(), QA_STAGE_OWNER: owner });
  }
  Object.keys(QA_STAGE_SCHEMAS_).forEach(function (name) {
    const sheet = ss.getSheetByName(name) || ss.insertSheet(name);
    ensureHeaders(sheet, QA_STAGE_SCHEMAS_[name]);
  });
  const profiles = [{ nickname: 'QA管理員', role: 'admin', work_assignments: ['admin-marketing-manager', 'talent-manager'] }];
  for (let i = 1; i <= 16; i++) profiles.push({ nickname: 'QA老師' + i, role: 'teacher', work_assignments: ['anqin-teacher', 'talent-pt'] });
  profiles.push({ nickname: 'QA行政', role: 'admin_staff', work_assignments: ['admin-marketing'] });
  profiles.push({ nickname: 'QA才藝', role: 'teacher', work_assignments: ['talent-fulltime'] });
  profiles.forEach(function (profile, index) {
    if (findUserByNickname(profile.nickname)) return;
    appendRow(SHEET_NAMES.USERS, Object.assign({}, profile, { email: owner, status: 'active', department: index % 2 ? '北區教室' : '東橋教室',
      employment_type: profile.work_assignments.indexOf('talent-pt') >= 0 ? 'pt' : 'fulltime',
      work_assignments: JSON.stringify(profile.work_assignments), joined_at: nowIso() }));
  });
  seedKpiConfig();
  SpreadsheetApp.flush();
  console.log(JSON.stringify({ ok: true, synthetic_accounts: profiles.length, sheet_url: ss.getUrl(), script_id: ScriptApp.getScriptId(), notifications: false }));
}

function qaStageCloudSmoke() { return qaStageRun_(1); }
function qaStageLoad8() { return qaStageRun_(8); }
function qaStageLoad16() { return qaStageRun_(16); }

function qaStageDiagnoseReceipt() {
  qaStageGuard_();
  if (String(Session.getActiveUser().getEmail() || '').toLowerCase() !== PropertiesService.getScriptProperties().getProperty('QA_STAGE_OWNER')) throw new Error('QA owner required');
  const rows = mutationReceiptSheet_(false).getDataRange().getValues();
  const entry = rows.find(function (row) { return row[3] === 'QA-CLOUD-0d5a1adb-8069-4f72-8a0b-660b8db93dd3-0'; });
  if (!entry) throw new Error('Diagnostic receipt missing');
  const bytes = Utilities.base64Decode(entry[6]);
  const results = [null, 'application/gzip', 'application/x-gzip'].map(function (mime) {
    try {
      const blob = mime ? Utilities.newBlob(bytes, mime, 'receipt.gz') : Utilities.newBlob(bytes);
      const parsed = JSON.parse(Utilities.ungzip(blob).getDataAsString('UTF-8'));
      return { mime: mime, ok: true, result_ok: parsed.ok, result_keys: Object.keys(parsed) };
    } catch (error) { return { mime: mime, ok: false, error: String(error.message || error) }; }
  });
  console.log(JSON.stringify({ receipt_status: entry[5], encoded_length: String(entry[6]).length, gzip_magic: bytes.slice(0, 3), tests: results }));
}

function qaStageGuard_() {
  if (typeof qaStageVerified_ !== 'undefined' && qaStageVerified_) return;
  const p = PropertiesService.getScriptProperties();
  if (SHEET_ID !== '' || !p.getProperty('QA_STAGE_SHEET') || p.getProperty('SHEET_ID') !== p.getProperty('QA_STAGE_SHEET') || p.getProperty('QA_STAGE_SCRIPT') !== ScriptApp.getScriptId()) throw new Error('QA_ISOLATION_REQUIRED');
  if (SpreadsheetApp.getActiveSpreadsheet()) throw new Error('QA requires a standalone project');
  if (p.getProperty('LINE_TOKEN') || p.getProperty('PUSH_RELAY_SECRET') || ScriptApp.getProjectTriggers().length) throw new Error('QA_NOTIFICATIONS_MUST_BE_DISABLED');
  qaStageVerified_ = true;
}

var qaStageVerified_ = false;
var qaStageLockTimings_ = [];

function qaStageDecodeResponse_(response) {
  const body = response.getContentText();
  const headers = response.getHeaders();
  const contentTypeKey = Object.keys(headers).find(function (key) { return key.toLowerCase() === 'content-type'; });
  const diagnostic = { http_status: response.getResponseCode(), content_type: contentTypeKey ? String(headers[contentTypeKey]) : '', response_chars: body.length };
  let data;
  try {
    data = JSON.parse(body.replace(/^\uFEFF/, ''));
    if (!data || typeof data.ok !== 'boolean') throw new Error('Invalid response');
  } catch (error) {
    data = { ok: false, code: 'NON_JSON' };
    diagnostic.body_sha256 = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, body).map(function (byte) { return ('0' + ((byte + 256) % 256).toString(16)).slice(-2); }).join('');
    const title = body.match(/<title[^>]*>([^<]*)<\/title>/i);
    diagnostic.html_title = title ? title[1].slice(0, 160) : '';
  }
  if (diagnostic.http_status >= 400) data = { ok: false, code: 'HTTP_ERROR' };
  return { data: data, diagnostic: diagnostic };
}

function qaStageReadWithRecovery_(batch, label, action, payloads) {
  if (!/^(get|list)/.test(action)) throw new Error('QA recovery permits reads only');
  const data = batch(label, action, payloads);
  [700, 1400].forEach(function (delay, attempt) {
    const indexes = data.map(function (d, i) { return !d.ok && ['NON_JSON', 'HTTP_ERROR'].indexOf(d.code) >= 0 ? i : -1; }).filter(function (i) { return i >= 0; });
    if (!indexes.length) return;
    Utilities.sleep(delay);
    batch(label + '-read-retry-' + (attempt + 1), action, indexes.map(function (i) { return payloads[i]; }), indexes).forEach(function (d, j) { data[indexes[j]] = d; });
  });
  return data;
}

function withRecordWriteLock_(callback, beforeAnyWrite) {
  const started = Date.now();
  let acquired = null;
  try {
    return qaOriginalRecordWriteLock_(function () { acquired = Date.now(); return callback(); }, beforeAnyWrite);
  } finally {
    qaStageLockTimings_.push({ wait_ms: (acquired || Date.now()) - started, held_ms: acquired === null ? 0 : Date.now() - acquired, acquired: acquired !== null });
  }
}

function qaStageRun_(clients) {
  qaStageGuard_();
  const props = PropertiesService.getScriptProperties();
  if (String(Session.getActiveUser().getEmail() || '').toLowerCase() !== props.getProperty('QA_STAGE_OWNER')) throw new Error('QA owner required');
  // Pin the verified QA deployment; an editor invocation may resolve a /dev URL.
  const endpoint = 'https://script.google.com/macros/s/AKfycbzHFsvw0PPPvT6_35b91dR-qLuWnlJTMuEe9H8veBgTr2AGNynAqb_vyUHLAgVDf6M6/exec';
  const runId = 'QA-CLOUD-' + Utilities.getUuid();
  const started = Date.now();
  const results = [{ label: 'endpoint-resolution', service_url: ScriptApp.getService().getUrl(), verified_endpoint: endpoint }];
  const users = Array.from({ length: clients }, function (_, i) { return findUserByNickname('QA老師' + (i + 1)); });
  function require(condition, message) { if (!condition) throw new Error(message); }
  function batch(label, action, payloads, userIndexes) {
    const start = Date.now();
    const requests = payloads.map(function (payload, i) {
      const user = users[userIndexes ? userIndexes[i] : i % users.length];
      return { url: endpoint, method: 'post', contentType: 'text/plain', followRedirects: true, muteHttpExceptions: true,
        payload: JSON.stringify(Object.assign({}, payload, { action: action, session_token: issueSessionToken_(user) })) };
    });
    const responses = UrlFetchApp.fetchAll(requests);
    const decoded = responses.map(qaStageDecodeResponse_);
    const data = decoded.map(function (d) { return d.data; });
    const result = { label: label, action: action, requests: payloads.length, user_indexes: userIndexes || payloads.map(function (_, i) { return i; }), ms: Date.now() - start, ok: data.every(function (d) { return d.ok; }), codes: data.map(function (d) { return d.code || (d.ok ? 'OK' : 'ERROR'); }), responses: decoded.map(function (d) { return d.diagnostic; }), lock_timings: data.map(function (d) { return d.qa_lock_timings || []; }) };
    results.push(result);
    console.log(JSON.stringify({ run_id: runId, stage: result }));
    return data;
  }
  function writeBatch(label, action, payloads) {
    const data = batch(label, action, payloads);
    // Mirrors the bounded client policy; this is not a browser latency test.
    [1500, 3500].forEach(function (delay, attempt) {
      const indexes = data.map(function (d, i) { return !d.ok && !d.uncertain && d.code === 'WRITE_BUSY' && d.retry_safe === true ? i : -1; }).filter(function (i) { return i >= 0; });
      if (!indexes.length) return;
      Utilities.sleep(delay + Math.floor(Math.random() * 500));
      batch(label + '-safe-retry-' + (attempt + 1), action, indexes.map(function (i) { return payloads[i]; }), indexes).forEach(function (d, j) { data[indexes[j]] = d; });
    });
    return data;
  }
  let failure = '';
  try {
    require(users.every(Boolean), 'QA accounts missing');
    const healthResponse = UrlFetchApp.fetch(endpoint + '?action=ping', { muteHttpExceptions: true });
    results.push({ label: 'candidate-health', http_status: healthResponse.getResponseCode(), content_type: healthResponse.getHeaders()['Content-Type'] || '' });
    const health = JSON.parse(healthResponse.getContentText());
    require(health.release === KPI_RELEASE_VERSION_, 'Candidate version mismatch');
    const drafts = users.map(function (user, i) { return { nickname: user.nickname, request_id: runId + '-' + i,
      task: { id: runId + '-' + i, title: '驗收 ' + i + '：今日成果\n保留空白 & <原文>', dueDate: todayStr(), status: 'open' } }; });
    const written = writeBatch('simultaneous-create', 'saveSelfTask', drafts);
    require(written.every(function (d) { return d.ok; }), 'Concurrent write did not fully succeed');
    const repeated = writeBatch('same-id-replay', 'saveSelfTask', drafts);
    require(repeated.every(function (d, i) { return d.ok && d.updated_at === written[i].updated_at; }), 'Replay changed saved result');
    const receipts = qaStageReadWithRecovery_(batch, 'receipt-readback', 'getMutationReceipt', drafts.map(function (p) { return { mutation_action: 'saveSelfTask', mutation_id: p.request_id }; }));
    require(receipts.every(function (d, i) { return d.state === 'done' && d.result.ok && d.result.updated_at === written[i].updated_at; }), 'Receipt readback mismatch');
    SpreadsheetApp.flush();
    const rows = sheetToObjects(SHEET_NAMES.TASKS).filter(function (row) { return String(row.task_id).indexOf(runId) === 0; });
    require(rows.length === clients && rows.every(function (row) { const index = Number(String(row.task_id).slice(runId.length + 1)); return row.title === drafts[index].task.title; }), 'Stored rows duplicated or text changed');
    const updates = drafts.map(function (p, i) { return { nickname: p.nickname, request_id: p.request_id + '-done', task: Object.assign({}, p.task, { status: 'done', cloudUpdatedAt: written[i].updated_at }) }; });
    const completed = writeBatch('simultaneous-complete', 'saveSelfTask', updates);
    require(completed.every(function (d) { return d.ok; }), 'Completion failed');
    SpreadsheetApp.flush();
    require(sheetToObjects(SHEET_NAMES.TASKS).filter(function (row) { return String(row.task_id).indexOf(runId) === 0 && row.status === 'done'; }).length === clients, 'Completed state not persisted');
    const finalReceipts = qaStageReadWithRecovery_(batch, 'completion-receipt-readback', 'getMutationReceipt', updates.map(function (p) { return { mutation_action: 'saveSelfTask', mutation_id: p.request_id }; }));
    require(finalReceipts.every(function (d, i) { return d.state === 'done' && d.result.ok && d.result.updated_at === completed[i].updated_at; }), 'Completion receipt could not be confirmed through HTTP; inspect database independently');
  } catch (error) { failure = String(error.message || error); }
  const firstAttemptFailures = results.filter(function (stage) { return stage.codes && !/-retry-/.test(stage.label); }).reduce(function (count, stage) { return count + stage.codes.filter(function (code) { return code !== 'OK'; }).length; }, 0);
  const report = { ok: !failure, first_attempt_failures: firstAttemptFailures, recovered: !failure && firstAttemptFailures > 0, run_id: runId, clients: clients, started_at: new Date(started).toISOString(), elapsed_ms: Date.now() - started, stages: results, error: failure,
    scope: 'Real Google task writes/receipts/readback. Not browser, photo, PDF, OAuth, mobile or soak acceptance.' };
  const sheet = getSS().getSheetByName('QAResults') || getSS().insertSheet('QAResults');
  sheet.appendRow([report.started_at, runId, JSON.stringify(report)]);
  console.log(JSON.stringify(report));
  return report;
}

/** Real Sheets text/formula boundary test; synthetic temporary sheet only. */
function qaStageLiteralText() {
  qaStageGuard_();
  const props = PropertiesService.getScriptProperties();
  if (String(Session.getActiveUser().getEmail() || '').toLowerCase() !== props.getProperty('QA_STAGE_OWNER')) throw new Error('QA owner required');
  const ss = getSS();
  const runId = 'QA-LITERAL-' + Utilities.getUuid();
  if (ss.getSheetByName(runId)) throw new Error('QA refuses to overwrite an existing sheet');
  const started = Date.now();
  const sheet = ss.insertSheet(runId);
  const sheetId = sheet.getSheetId();
  const checks = [];
  let failure = '';
  let cleaned = false;
  function require(condition, message) { if (!condition) throw new Error(message); }
  function read() { SpreadsheetApp.flush(); return sheet.getRange(2, 1, 1, 7).getValues()[0]; }
  try {
    ensureHeaders(sheet, ['id', 'note', 'formula', 'flag', 'count', 'created_at', 'json']);
    const date = new Date('2026-09-16T00:00:00.000Z');
    const literal = '=1+1';
    const json = { original: '=A1', note: '教學原文\n保留空白 & <文字>' };
    appendRow(runId, { id: runId, note: literal, flag: false, count: 0, created_at: date, json: json });
    let values = read();
    require(values[1] === literal && sheet.getRange(2, 2).getFormula() === '', 'Created text became a formula or changed');
    require(values[3] === false && values[4] === 0 && values[5] instanceof Date && values[5].getTime() === date.getTime() && values[6] === JSON.stringify(json), 'Typed data or JSON changed');
    checks.push({ id: 'create_literal_and_typed_values', ok: true });

    // This is an intentional test-only formula, not application input.
    sheet.getRange(2, 3).setFormula('=6*7');
    SpreadsheetApp.flush();
    require(sheet.getRange(2, 3).getValue() === 42, 'Test formula was not evaluated');
    const variants = ['=SUM(1,2)', '  =1+1\n第二行', '\t=1+1'];
    variants.forEach(function (text) {
      updateRow(runId, 2, { note: text, count: 7 });
      values = read();
      require(values[1] === text && sheet.getRange(2, 2).getFormula() === '', 'Updated text became a formula or changed');
      require(values[2] === 42 && sheet.getRange(2, 3).getFormula() === '=6*7', 'Unspecified formula lost its source');
      require(values[3] === false && values[4] === 7 && values[5] instanceof Date && values[5].getTime() === date.getTime() && values[6] === JSON.stringify(json), 'Unspecified typed data changed');
    });
    checks.push({ id: 'update_literal_preserve_formula_and_types', ok: true, variants: variants.length });
    updateRow(runId, 2, { flag: true });
    values = read();
    require(values[1] === variants[variants.length - 1] && values[3] === true && sheet.getRange(2, 2).getFormula() === '' && sheet.getRange(2, 3).getFormula() === '=6*7', 'Unrelated edit reinterpreted existing text');
    checks.push({ id: 'unrelated_update_preserves_literal', ok: true });
  } catch (error) {
    failure = String(error.message || error);
  } finally {
    try {
      qaStageGuard_();
      const target = ss.getSheetByName(runId);
      require(/^QA-LITERAL-[a-f0-9-]{36}$/.test(runId) && target && target.getSheetId() === sheetId, 'QA refuses cleanup of an unrelated sheet');
      ss.deleteSheet(target);
      SpreadsheetApp.flush();
      cleaned = !ss.getSheetByName(runId);
      require(cleaned, 'QA text sheet remains after cleanup');
    } catch (error) {
      failure = [failure, String(error.message || error)].filter(Boolean).join('; ');
    }
  }
  const report = { ok: !failure && cleaned, run_id: runId, release: KPI_RELEASE_VERSION_, started_at: new Date(started).toISOString(), elapsed_ms: Date.now() - started, checks: checks, cleanup_complete: cleaned, error: failure,
    scope: 'Real isolated Google Sheets application text helpers; no Tasks schema change, production data, notifications, or HTTP latency claim.' };
  const results = ss.getSheetByName('QAResults') || ss.insertSheet('QAResults');
  results.appendRow([report.started_at, runId, JSON.stringify(report)]);
  console.log(JSON.stringify(report));
  return report;
}
