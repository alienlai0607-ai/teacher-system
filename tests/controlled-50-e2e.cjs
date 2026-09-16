const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const sharp = require('sharp');
const { chromium } = require('playwright');
const makeService = require('./support/storage-service-harness.cjs');
const root = path.resolve(__dirname, '..');
const origin = 'https://kpi-controlled.test';
const output = process.env.KPI_MATRIX_OUTPUT || '/private/tmp/kpi-controlled-50';
const methods = ['normal', 'separate-selection', 'double-submit', 'upload-response-lost', 'upload-503', 'partial-upload', 'save-response-lost', 'save-and-receipt-lost', 'read-503-reload', 'write-lock'];
const flows = ['admin-work', 'talent-prep', 'pt-prep', 'pt-app', 'anqin-log-contract'];
const sizes = [[96, 72], [640, 480], [1200, 900], [1920, 1080], [3024, 4032]];
const widths = [320, 375, 390, 768, 1440];
const exclusions = ['Real Google infrastructure and latency', 'Actual Google/LINE employee login', 'Safari and Android/LINE WebView engines', 'PDF conversion and rendered PDF photo verification', 'Concurrent-user capacity and long-duration soak testing', 'HEIC/HEIF, videos and office-document boundary cases'];
const descriptions = [
  '今日完成積木橋測試，下次增加承重比較。', '家長回覆：先觀察兩天。\n下次：確認孩子適應情形。',
  '繁體中文、English, 12345 / punctuation: \' " & < >', '空白 與  多個   空白，保留原始紀錄。',
  '<img src=x onerror="window.qaInjected=true">不是 HTML，是老師記錄的原文。',
  '學生輪流完成作品，先等待、再說明，最後拍照確認。'.repeat(12),
  '課程改為 19:00–20:30；週六補充材料。', '材料：紅色／藍色\n結果：完成兩種方案\n優化：減少等待。',
  '照片有直向、橫向與透明背景，檔名不代表內容相同。', '同一件事只儲存一次；網路恢復後核對最新結果。',
];
const sha = value => crypto.createHash('sha256').update(value).digest('hex');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
fs.mkdirSync(output, { recursive: true });
const sourceFiles = ['shared/api.js', 'review/anqin-v2/app.js', 'review/admin-marketing-v1/app.js', 'review/talent-v2/app.js',
  ...fs.readdirSync(path.join(root, 'apps-script')).filter(name => name.endsWith('.gs')).map(name => 'apps-script/' + name)];
const sourceDigests = Object.fromEntries(sourceFiles.map(name => [name, sha(fs.readFileSync(path.join(root, name)))]));

async function photosFor(spec) {
  const photos = [];
  for (let n = 0; n < spec.count; n++) {
    const [width, height] = sizes[(spec.id + n) % sizes.length];
    const raw = Buffer.alloc(width * height * 3);
    let seed = spec.id * 131071 + n * 7919;
    for (let p = 0; p < raw.length; p += 3) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      const x = (p / 3) % width, y = Math.floor(p / 3 / width);
      raw[p] = (Math.floor(x / 17) + spec.id * 29 + (seed & 15)) & 255;
      raw[p + 1] = (Math.floor(y / 13) + n * 83 + ((seed >>> 8) & 15)) & 255;
      raw[p + 2] = (Math.floor((x + y) / 31) + spec.id * 7 + ((seed >>> 16) & 15)) & 255;
    }
    const format = ['jpeg', 'png', 'webp'][(spec.id + n) % 3];
    const buffer = await sharp(raw, { raw: { width, height, channels: 3 } }).toFormat(format, { quality: 87 }).toBuffer();
    const name = `${spec.id}-${n}-${n % 2 ? '照片 with space' : '成果證據'}-${spec.method}.${format}`;
    photos.push({ name, mimeType: 'image/' + format, buffer, width, height, sha256: sha(buffer) });
  }
  return photos;
}

async function scenario(browser, spec) {
  const started = Date.now();
  const service = makeService();
  const { c, files, today } = service;
  const photos = await photosFor(spec);
  const nickname = `QA${String(spec.id).padStart(2, '0')}`;
  const assignment = spec.flow === 'admin-work' ? 'admin-marketing' : spec.flow === 'talent-prep' ? 'talent-fulltime' : 'talent-pt';
  const user = { nickname, role: spec.flow === 'admin-work' ? 'admin_staff' : 'teacher', status: 'active', department: spec.campus, email: nickname + '@example.invalid', work_assignments: spec.flow.startsWith('anqin') ? [] : [assignment] };
  c.appendRow('Users', user);
  const session = { ...user, session_token: c.issueSessionToken_(user), t: Date.now() };
  if (spec.flow === 'pt-app') c.upsertTalentRecord_('lesson', nickname, { id: 'lesson-' + spec.id, teacher: nickname, date: today, courseName: spec.title, issue: spec.text, courseType: '樂高小創客', siteType: 'self', appStatus: 'pending', appFiles: [], status: 'submitted' }, nickname);
  const context = await browser.newContext({ viewport: { width: spec.width, height: 844 }, timezoneId: 'Asia/Taipei', serviceWorkers: 'block', reducedMotion: 'reduce' });
  const page = await context.newPage();
  page.setDefaultTimeout(16000);
  const errors = [], requests = [], faultEvents = [];
  let uploadCount = 0, saveCount = 0, writeSucceeded = 0, blockedReceipt = false, faultEnabled = true;
  const uploadedHashes = new Map();
  const target = spec.flow === 'admin-work' ? 'saveAdminMarketingRecord' : spec.flow === 'pt-app' ? 'updateTalentAppStatus' : spec.flow.startsWith('anqin') ? 'saveLog' : 'saveTalentPrep';
  let businessExecutions = 0;
  const originalMutation = c[target];
  c[target] = function (...args) { businessExecutions++; return originalMutation.apply(this, args); };
  const isUpload = action => ['uploadPhoto', 'uploadFile'].includes(action);
  await context.addInitScript(value => localStorage.setItem('kpi_session', JSON.stringify(value)), session);
  page.on('pageerror', error => errors.push(error.message));
  await context.route('**/*', async route => {
    const req = route.request(), url = new URL(req.url());
    if (url.origin === origin) {
      if (url.pathname === '/contract.html') return route.fulfill({ contentType: 'text/html', body: '<html><body><main>Isolated daily-log API contract</main><script src="/shared/config.js"></script><script src="/shared/auth.js"></script><script src="/shared/api.js"></script></body></html>' });
      const file = path.resolve(root, '.' + decodeURIComponent(url.pathname));
      if (!file.startsWith(root + path.sep) || !fs.existsSync(file)) return route.fulfill({ status: 404, body: '' });
      const types = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml' };
      return route.fulfill({ contentType: types[path.extname(file)] || 'application/octet-stream', body: fs.readFileSync(file) });
    }
    if (!req.postData()) return route.fulfill({ contentType: 'application/javascript', body: '' });
    const p = JSON.parse(req.postData());
    const event = { action: p.action, request_id: p.request_id, at: Date.now(), result: '' };
    requests.push(event);
    if (blockedReceipt && /^(getMutationReceipt|getAdminMarketingWorkspaceData|getTalentWorkspaceData|getLog)$/.test(p.action)) {
      faultEvents.push('confirmation unavailable'); event.result = 'injected-abort'; return route.abort('failed');
    }
    if (isUpload(p.action)) {
      uploadCount++;
      if (faultEnabled && spec.method === 'upload-503' && uploadCount === 1) {
        faultEvents.push('503 before upload'); event.result = 'injected-503'; return route.fulfill({ status: 503, body: '<html>Unavailable</html>' });
      }
      if (faultEnabled && spec.method === 'partial-upload' && uploadCount >= 2 && uploadCount <= 4) {
        faultEvents.push('partial upload unavailable'); event.result = 'injected-404'; return route.fulfill({ status: 404, body: '<html>Response unavailable</html>' });
      }
    }
    if (faultEnabled && spec.method === 'read-503-reload' && (/^get.*WorkspaceData$/.test(p.action) || p.action === 'getLog') && !faultEvents.length) {
      faultEvents.push('503 before read'); event.result = 'injected-503'; return route.fulfill({ status: 503, body: '<html>Read unavailable</html>' });
    }
    const isTarget = p.action === target;
    if (isTarget) saveCount++;
    if (isTarget && spec.method === 'write-lock' && saveCount === 1) service.denyLock(true);
    let result;
    try { result = service.dispatch(p); } finally { service.denyLock(false); }
    event.result = result.ok ? 'ok' : result.code || result.error;
    if (!result.ok) event.error = result.error;
    if (isUpload(p.action) && result.ok) {
      const expected = sha(Buffer.from(p.base64, 'base64'));
      assert.equal(sha(files.get(result.fileId).getBlob().getBytes()), expected, 'stored bytes differ from accepted upload');
      if (uploadedHashes.has(expected)) assert.equal(uploadedHashes.get(expected), result.fileId, 'retry created duplicate file');
      uploadedHashes.set(expected, result.fileId);
      if (faultEnabled && spec.method === 'upload-response-lost' && uploadCount === 1) {
        faultEvents.push('upload committed, response dropped'); event.result = 'committed-response-lost'; return route.abort('failed');
      }
    }
    if (isTarget && result.ok) {
      writeSucceeded++;
      if (faultEnabled && ['save-response-lost', 'save-and-receipt-lost'].includes(spec.method) && saveCount === 1) {
        blockedReceipt = spec.method === 'save-and-receipt-lost';
        faultEvents.push('write committed, response dropped'); event.result = 'committed-response-lost'; return route.abort('failed');
      }
    }
    if (isTarget && !result.ok && spec.method === 'write-lock' && saveCount === 1) faultEvents.push('write lock rejected');
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify(result) });
  });
  const click = action => page.locator(`[data-action="${action}"]`).filter({ visible: true }).first().click();
  const nav = async name => {
    if (!await page.locator(`[data-route="${name}"]`).filter({ visible: true }).count()) await click('more-nav');
    await page.locator(`[data-route="${name}"]`).filter({ visible: true }).first().click();
  };
  const waitFor = async predicate => {
    for (let i = 0; i < 180; i++) { if (predicate()) return; await sleep(100); }
    assert.ok(predicate(), 'backend did not reach expected state');
  };
  const inputFiles = photos.map(({ name, mimeType, buffer }) => ({ name, mimeType, buffer }));
  const read = () => spec.flow === 'admin-work' ? service.request(nickname, 'getAdminMarketingWorkspaceData').records
    : spec.flow.startsWith('anqin') ? [service.request(nickname, 'getLog', { nickname, date: today }).log].filter(Boolean)
    : service.request(nickname, 'getTalentWorkspaceData')[spec.flow === 'pt-app' ? 'lessons' : 'preps'];
  const attachments = record => spec.flow === 'admin-work' ? record.items[0].evidence : spec.flow === 'pt-app' ? record.appFiles : spec.flow.startsWith('anqin') ? record.attachments : record.materials;
  let result;
  try {
    if (spec.flow.startsWith('anqin')) {
      await page.goto(origin + '/contract.html');
      const uploaded = [];
      for (const photo of photos) {
        const params = { nickname, date: today, kpi: 1, mimeType: photo.mimeType, base64: photo.buffer.toString('base64') };
        let response = await page.evaluate(p => API.uploadPhoto(p), params);
        if (!response.ok) { faultEnabled = false; response = await page.evaluate(p => API.uploadPhoto(p), params); }
        assert.equal(response.ok, true, JSON.stringify(response));
        uploaded.push({ fileId: response.fileId, url: response.url, name: photo.name, mimeType: photo.mimeType, kpi: 1 });
      }
      const params = { nickname, date: today, reflection: spec.text, attachments: uploaded, submitted: true };
      let saved = spec.method === 'double-submit'
        ? await page.evaluate(async p => { const both = await Promise.all([API.saveLog(p), API.saveLog(p)]); if (!both.every(result => result.ok)) throw new Error('double submit failed'); return both[0]; }, params)
        : await page.evaluate(p => API.saveLog(p), params);
      if (!saved.ok) { blockedReceipt = false; faultEnabled = false; saved = await page.evaluate(p => API.saveLog(p), params); }
      assert.equal(saved.ok, true, JSON.stringify(saved));
    } else {
      const area = spec.flow === 'admin-work' ? 'admin-marketing-v1' : 'talent-v2';
      await page.goto(`${origin}/review/${area}/index.html?workspace=${assignment}`);
      await page.waitForFunction(() => document.querySelector('#app')?.children.length > 0 && !document.body.innerText.includes('正在讀取正式資料'));
      await page.waitForTimeout((spec.id % 3) * 350);
      assert.equal(await page.locator('#dialog-root > *').count(), 0, 'delayed startup UI must not block record entry');
      let selector;
      if (spec.flow === 'admin-work') {
        await click('open-work-item');
        await page.selectOption('#work-category', 'admin');
        await page.fill('#work-title', spec.title);
        await page.fill('#completed-today', spec.text);
        await page.selectOption('#work-status', 'completed');
        selector = '#work-evidence';
      } else if (spec.flow === 'pt-app') {
        await nav('weekly'); selector = `[data-app-evidence-id="lesson-${spec.id}"]`;
      } else {
        await nav('prep'); await click('new-prep');
        await page.selectOption('#prep-form select[name="courseType"]', '樂高小創客');
        await page.fill('#prep-form input[name="courseName"]', spec.title);
        const notes = page.locator('#prep-form textarea');
        if (await notes.count()) await notes.first().fill(spec.text);
        selector = '[data-upload-category="prep"]';
      }
      const submit = async () => {
        const button = spec.flow === 'admin-work' ? page.locator('#work-item-form button[type="submit"]')
          : page.locator(`[data-action="${spec.flow === 'pt-app' ? 'retry-app-evidence' : 'save-prep'}"]`).filter({ visible: true }).first();
        if (spec.method === 'double-submit') await button.evaluate(element => { element.click(); element.click(); });
        else await button.click();
      };
      const separated = spec.method === 'separate-selection' && spec.flow !== 'pt-app';
      if (separated) {
        for (const file of inputFiles) {
          await page.setInputFiles(selector, file);
          if (spec.flow !== 'admin-work') await waitFor(() => files.size >= inputFiles.indexOf(file) + 1);
          await sleep(120);
        }
      } else if (spec.method === 'separate-selection' && spec.flow === 'pt-app') {
        for (let n = 0; n < inputFiles.length; n++) {
          await page.setInputFiles(selector, inputFiles[n]);
          await waitFor(() => attachments(read()[0])?.length === n + 1);
        }
      } else await page.setInputFiles(selector, inputFiles);
      if (spec.flow === 'admin-work') await submit();
      else if (spec.flow !== 'pt-app') {
        await waitFor(() => files.size === photos.length || faultEvents.filter(value => value === 'partial upload unavailable').length === 3);
        await page.waitForFunction(() => !document.querySelector('[data-uploading="true"]'));
        if (spec.method !== 'partial-upload') await submit();
      }
      if (spec.method === 'partial-upload') {
        const retry = spec.flow === 'admin-work' ? null : spec.flow === 'pt-app' ? 'retry-app-evidence' : 'retry-upload';
        if (retry) await page.locator(`[data-action="${retry}"]`).waitFor();
        else await page.getByText('表單與選檔仍保留', { exact: false }).waitFor();
        assert.equal(spec.flow === 'pt-app' ? read()[0].appStatus : read().length, spec.flow === 'pt-app' ? 'pending' : 0, 'partial upload must not save a completed record');
        faultEnabled = false;
        if (retry) await click(retry); else await submit();
        if (spec.flow.endsWith('prep')) {
          await page.locator('[data-action="retry-upload"]').waitFor({ state: 'detached' }); await submit();
        }
      }
      if (spec.method === 'save-and-receipt-lost') {
        await page.getByText('尚未取得儲存確認', { exact: false }).first().waitFor();
        blockedReceipt = false; faultEnabled = false;
        await submit();
      }
      await waitFor(() => read().length === 1 && attachments(read()[0])?.length === photos.length);
      if (spec.flow === 'admin-work') await page.locator('#work-item-form').waitFor({ state: 'detached' });
      else if (spec.flow.endsWith('prep')) await page.locator('#prep-form').waitFor({ state: 'detached' });
      if (spec.method === 'double-submit') {
        if (spec.flow === 'pt-app') {
          // Re-select the same evidence after confirmation. Content identity must deduplicate it.
          await page.setInputFiles(selector, inputFiles);
          await page.getByText('相同截圖已存在，不需重複上傳', { exact: false }).waitFor();
          assert.equal(saveCount, 1, 'duplicate screenshot should not issue another save');
        }
        const receipt = c.sheetToObjects('ApiReceipts').find(row => row.action === target);
        assert.ok(receipt, 'missing durable receipt');
        const confirmed = service.request(nickname, 'getMutationReceipt', { mutation_action: target, mutation_id: receipt.request_id });
        assert.equal(confirmed.state, 'done');
      }
    }
    blockedReceipt = false;
    await page.reload();
    if (spec.flow.startsWith('anqin')) {
      const result = await page.evaluate(p => API.getLog(p), { nickname, date: today });
      assert.equal(result.ok, true, JSON.stringify(result));
      assert.equal(result.log.reflection, spec.text);
    } else {
      await page.waitForFunction(() => document.querySelector('#app')?.children.length > 0 && !document.body.innerText.includes('正在讀取正式資料'));
      if (spec.flow.endsWith('prep')) await nav('prep');
      if (spec.flow === 'pt-app') await nav('weekly');
      await page.getByText(spec.title, { exact: false }).first().waitFor();
    }
    const records = read();
    assert.equal(records.length, 1, 'duplicate record');
    const record = records[0], evidence = attachments(record);
    assert.equal(evidence.length, photos.length, 'missing attachment');
    assert.equal(files.size, photos.length, 'orphaned or duplicate upload');
    const text = spec.flow === 'admin-work' ? record.items[0].completedToday : spec.flow.startsWith('anqin') ? record.reflection : spec.flow.endsWith('prep') ? record.notes : record.issue;
    if (text !== null) assert.equal(text, spec.text, 'saved text changed or truncated');
    const ids = evidence.map(item => item.fileId || item.file_id);
    if (spec.method === 'write-lock') {
      assert.equal(saveCount, 2, 'One automatic retry after confirmed zero-write rejection');
      assert.equal(new Set(requests.filter(item => item.action === target).map(item => item.request_id)).size, 1, 'Safe retry keeps the operation ID');
    }
    assert.equal(new Set(ids).size, photos.length);
    for (const id of ids) {
      assert.ok(files.has(id), 'attachment refers to missing original');
      const file = files.get(id);
      const metadata = await sharp(file.getBlob().getBytes()).metadata();
      assert.ok(metadata.width > 0 && metadata.height > 0, 'stored image is undecodable');
      assert.equal(file.getSharingAccess(), 'PRIVATE');
      assert.equal(file.getAccess(user.email), 'VIEW');
      assert.equal(file.getAccess('east@example.invalid'), 'NONE', 'unrelated employee can see photo');
    }
    const denied = service.request('east', 'getAttachmentPreviews', { file_ids: ids });
    assert.equal(denied.previews.length, 0);
    const bossPreview = service.request('boss', 'getAttachmentPreviews', { file_ids: ids });
    assert.equal(bossPreview.previews.length + bossPreview.errors.length, photos.length);
    assert.equal(await page.evaluate(() => window.qaInjected === true), false, 'text executed as HTML');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 2), false, 'horizontal overflow');
    assert.deepEqual(errors, []);
    if (!['normal', 'separate-selection', 'double-submit'].includes(spec.method)) assert.ok(faultEvents.length, 'planned fault was not injected');
    if (spec.method === 'save-and-receipt-lost') assert.equal(new Set(requests.filter(item => item.action === target).map(item => item.request_id)).size, 1, 'manual retry changed operation ID');
    if (!(spec.flow === 'pt-app' && spec.method === 'separate-selection')) assert.equal(businessExecutions, 1, 'write callback executed more than once');
    const expectedFailures = new Set(['injected-abort', 'injected-503', 'injected-404', 'committed-response-lost', 'WRITE_BUSY', 'QA_PDF_CONVERSION_UNAVAILABLE']);
    assert.deepEqual(requests.filter(item => item.result !== 'ok' && !expectedFailures.has(item.result)), [], 'unexpected backend response');
    await page.screenshot({ path: path.join(output, `${String(spec.id).padStart(2, '0')}-result.png`), fullPage: true, animations: 'disabled' });
    result = { ...spec, status: 'passed', milliseconds: Date.now() - started, photos: photos.map(({ buffer, ...info }) => ({ ...info, bytes: buffer.length })), storedFiles: ids.map(id => ({ id, sha256: sha(files.get(id).getBlob().getBytes()) })), recordCount: records.length, requests, faultEvents, writeResponses: writeSucceeded, businessExecutions };
  } catch (error) {
    result = { ...spec, status: 'failed', error: error.message, stack: error.stack, milliseconds: Date.now() - started, requests, faultEvents, browserErrors: errors, visibleText: (await page.locator('body').innerText().catch(() => '')).slice(-5000) };
    await page.screenshot({ path: path.join(output, `${String(spec.id).padStart(2, '0')}-failure.png`), fullPage: true }).catch(() => {});
  } finally { await context.close(); }
  fs.writeFileSync(path.join(output, `${String(spec.id).padStart(2, '0')}.json`), JSON.stringify(result, null, 2));
  console.log(`${result.status.toUpperCase()} ${spec.id}/50 ${spec.flow} ${spec.method} ${spec.width}px ${spec.campus}${result.error ? ': ' + result.error : ''}`);
  return result;
}

(async () => {
  const specs = flows.flatMap((flow, group) => methods.map((method, index) => {
    const id = group * 10 + index + 1;
    return { id, flow, method, width: widths[(index + group) % widths.length], campus: id % 2 ? '北區教室' : '東橋教室', count: index === 5 ? 2 : index === 1 ? 3 : [1, 2, 3, 4][id % 4], title: `QA-${String(id).padStart(2, '0')} ${flow} ${method}`, text: `第 ${id} 組驗收紀錄\n${descriptions[index]}` };
  }));
  fs.writeFileSync(path.join(output, 'matrix.json'), JSON.stringify({ seed: 'fixed-20260913-v1', sourceDigests, exclusions, cases: specs, scope: '40 real UI + 10 browser shared-API log contracts; real Apps Script router and modules; isolated typed Sheets and Drive services; NOT production Google acceptance' }, null, 2));
  const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
  const results = [];
  try {
    for (const spec of specs) {
      if (process.env.KPI_MATRIX_IDS && !process.env.KPI_MATRIX_IDS.split(',').map(Number).includes(spec.id)) continue;
      results.push(await scenario(browser, spec));
      fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify({ completed: results.length, passed: results.filter(item => item.status === 'passed').length, failed: results.filter(item => item.status === 'failed').length, production: false, exclusions, sourceDigests, cases: results }, null, 2));
    }
  } finally { await browser.close(); }
  const hashes = results.flatMap(item => (item.photos || []).map(photo => photo.sha256));
  assert.equal(new Set(hashes).size, hashes.length, 'test images must have different binary contents');
  for (const [name, digest] of Object.entries(sourceDigests)) assert.equal(sha(fs.readFileSync(path.join(root, name))), digest, 'production source changed during the run: ' + name);
  const scopeNames = { 'admin-work': '行政工作表單', 'talent-prep': '才藝備課表單', 'pt-prep': '才藝 PT 備課表單', 'pt-app': '才藝 PT APP 截圖', 'anqin-log-contract': '安親日誌 API 契約' };
  const lines = [
    '# 50 組控制變因驗收紀錄', '',
    `執行時間：${new Date().toISOString()}`, '',
    `完成 ${results.length} 組；通過 ${results.filter(item => item.status === 'passed').length} 組；失敗 ${results.filter(item => item.status === 'failed').length} 組。`,
    `通過案例共使用 ${hashes.length} 張合成圖片，原始內容 SHA-256 全部不同。`, '',
    '## 範圍', '',
    '40 組操作真正前端表單，10 組在瀏覽器呼叫真正安親日誌 API。後端使用原始路由、驗證、權限、收據及記錄邏輯；Google Sheets、Drive、PDF 轉換為隔離服務。沒有寫入正式系統。',
    '每組核對文字、附件數量、原檔存在、檔案內容雜湊、影像可解碼、重新載入後讀回、重複資料、照片權限與橫向溢出。',
    'PNG、JPEG、WebP；96×72 至 3024×4032 像素；1 至 4 張照片；320、375、390、768、1440 像素視窗。', '',
    '## 不得視為已通過的項目', '',
    'Google 正式連線穩定度、正式員工登入、實體手機 Safari／Android／LINE 瀏覽器、PDF 實際轉換及圖片呈現、多人容量與長時間測試、HEIC／影片／Office 文件邊界。',
    'PDF 轉換服務在此環境明確回報 QA_PDF_CONVERSION_UNAVAILABLE，用來確認原始資料仍保留；不能算作 PDF 驗收成功。',
    '這是預先設計的功能與故障情境，不是隨機抽樣，不能由通過率推算正式系統的出錯率。測試耗時包含合成圖片建立與模擬等待，不代表正式儲存速度。', '',
    '## 逐組結果', '', '| 組別 | 流程 | 方法 | 分校 | 視窗寬 | 圖片數 | 結果 |', '| --- | --- | --- | --- | --- | --- | --- |',
    ...results.map(item => `| ${item.id} | ${scopeNames[item.flow]} | ${item.method} | ${item.campus} | ${item.width} | ${item.count} | ${item.status === 'passed' ? '通過' : '失敗：' + item.error.replace(/\n/g, ' ')} |`), '',
    '每組 JSON 保存請求結果與故障事件；同編號 PNG 保存畫面。matrix.json 保存測試條件與程式版本雜湊。',
  ];
  fs.writeFileSync(path.join(output, 'summary.md'), lines.join('\n') + '\n');
  if (results.some(item => item.status === 'failed')) process.exitCode = 1;
})().catch(error => { console.error(error); process.exitCode = 1; });
