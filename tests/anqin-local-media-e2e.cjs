// Actual Chrome IndexedDB and actual Anqin UI; only the existing localhost QA
// backend is used. No IndexedDB implementation or app source is substituted.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '..');
const artifactDir = path.join(root, 'output/incident-20260916/anqin-local-media-browser');
const origin = 'http://127.0.0.1:18777';
const appUrl = `${origin}/review/anqin-v2/qa-harness.html?nickname=${encodeURIComponent('江江老師')}&role=teacher&department=${encodeURIComponent('北區教室')}`;
const contentTypes = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const photo = { name: 'photo-reopen.png', mimeType: 'image/png', buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFElEQVR42mP8z8Dwn4GBgYGJAQoAHgQCAcR3O98AAAAASUVORK5CYII=', 'base64') };
const pdf = { name: 'document-reopen.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\n%' + 'exact original document bytes '.repeat(42000) + '\n%%EOF\n') };
const report = { startedAt: new Date().toISOString(), appSha256: hash(fs.readFileSync(path.join(root, 'review/anqin-v2/app.js'))), storage: 'Actual Chrome IndexedDB', backend: 'Existing localhost qa-harness.js; network requests to all remote origins blocked', scenarios: [] };

async function readDatabase(page) {
  return page.evaluate(async () => {
    const databases = (await indexedDB.databases()).filter(item => item.name.endsWith('_attachments_v1'));
    if (!databases.length) return [];
    const rows = [];
    for (const info of databases) {
      const database = await new Promise((resolve, reject) => {
        const request = indexedDB.open(info.name);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      const records = await new Promise((resolve, reject) => {
        const request = database.transaction('attachments').objectStore('attachments').getAll();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      rows.push(...records.map(record => ({ database: info.name, ...record })));
      database.close();
    }
    return rows;
  });
}

async function waitForApp(page) {
  await page.waitForFunction(() => window.__ANQIN_BOOT_READY && document.querySelector('#app')?.children.length);
  await page.waitForTimeout(1200);
  const closeDialog = page.locator('#dialog-root button[data-action="close-dialog"]');
  if (await closeDialog.count()) await closeDialog.last().click();
}

async function runScenario(browser, file, label) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'zh-TW', timezoneId: 'Asia/Taipei', serviceWorkers: 'block' });
  const errors = [];
  const remoteRequests = [];
  const uploads = [];
  const title = `關頁恢復 ${label}`;
  let page;
  context.on('page', newPage => newPage.on('pageerror', error => errors.push(error.message)));
  await context.exposeBinding('__captureRecoveryUpload', (_source, payload) => { uploads.push(payload); });
  await context.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.origin !== origin) {
      remoteRequests.push(url.href);
      return route.fulfill({ status: 200, contentType: 'application/javascript', body: '' });
    }
    const localPath = path.resolve(root, '.' + decodeURIComponent(url.pathname));
    if (!localPath.startsWith(root + path.sep) || !fs.existsSync(localPath)) return route.fulfill({ status: 404, body: '' });
    return route.fulfill({ contentType: contentTypes[path.extname(localPath)] || 'application/octet-stream', body: fs.readFileSync(localPath) });
  });
  try {
    page = await context.newPage();
    await page.goto(`${appUrl}&reset=1`);
    await waitForApp(page);
    await page.evaluate(() => {
      window.API.uploadFile = async payload => {
        await window.__captureRecoveryUpload({ phase: 'pending-before-close', ...payload });
        return new Promise(() => {});
      };
    });
    await page.locator('[data-action="open-activity"]').filter({ visible: true }).first().click();
    await page.selectOption('#course-prep-type', '安親課業指導');
    await page.fill('#course-prep-title', title);
    await page.fill('#course-prep-note', '上傳未回應時關頁，重開後須保留原文與附件');
    await page.setInputFiles('#activity-prep-files', file);
    await page.waitForFunction(() => document.querySelector('#activity-prep-files')?.disabled);
    const deadline = Date.now() + 10000;
    while (!uploads.length && Date.now() < deadline) await page.waitForTimeout(40);
    assert.equal(uploads.length, 1, 'upload was actually pending before close');
    const storedBefore = await readDatabase(page);
    assert.equal(storedBefore.length, 1, 'one committed real IndexedDB record');
    assert.ok(storedBefore[0].dataUrl, 'original upload bytes durable before network response');
    const durableBase64 = storedBefore[0].dataUrl.split(',')[1];
    assert.equal(durableBase64, uploads[0].base64);
    if (file.mimeType === 'application/pdf') assert.equal(durableBase64, file.buffer.toString('base64'), 'PDF original bytes unmodified');
    const localStorageBefore = await page.evaluate(() => Object.fromEntries(Object.entries(localStorage).filter(([key]) => key.startsWith('bp_anqin_'))));
    const draftJSON = Object.entries(localStorageBefore).find(([key]) => key.endsWith('_open_drafts'))?.[1] || '';
    assert.ok(draftJSON.includes(storedBefore[0].key), 'draft metadata committed before pending upload');
    assert.ok(draftJSON.includes(title), 'latest text is saved with attachment metadata');
    assert.ok(!draftJSON.includes(durableBase64), 'binary bytes are outside localStorage draft');
    await page.screenshot({ path: path.join(artifactDir, `${label}-upload-pending.png`), fullPage: true, animations: 'disabled' });
    await page.close();

    page = await context.newPage();
    await page.goto(appUrl);
    await waitForApp(page);
    await page.evaluate(() => {
      const originalUpload = window.API.uploadFile.bind(window.API);
      window.API.uploadFile = async payload => {
        await window.__captureRecoveryUpload({ phase: 'retry-after-reopen', ...payload });
        return originalUpload(payload);
      };
    });
    await page.locator('[data-action="open-activity"]').filter({ visible: true }).first().click();
    assert.equal(await page.inputValue('#course-prep-title'), title, 'new page restores unsaved form title');
    assert.equal(await page.inputValue('#course-prep-note'), '上傳未回應時關頁，重開後須保留原文與附件');
    assert.ok((await page.locator('#prep-file-list').innerText()).includes(file.name), 'new page restores attachment in actual UI');
    await page.screenshot({ path: path.join(artifactDir, `${label}-reopened.png`), fullPage: true, animations: 'disabled' });
    await page.locator('button[form="course-prep-form"]').click();
    await page.locator('#course-prep-form').waitFor({ state: 'detached', timeout: 15000 });
    const saved = await page.evaluate(title => Object.values(window.__KPI_QA_CLOUD__.store.coursePreps).find(row => row.prep?.title === title), title);
    assert.ok(saved, 'actual save UI completed through QA backend');
    assert.equal(uploads.length, 2, 'exactly one retry from restored bytes');
    assert.equal(uploads[1].base64, uploads[0].base64, 'retry sends precisely the same retained bytes');
    assert.equal(uploads[1].fileName, uploads[0].fileName);
    assert.equal(uploads[1].mimeType, uploads[0].mimeType);
    assert.equal(saved.prep.prepEvidence.length, 1);
    assert.ok(saved.prep.prepEvidence[0].cloudFileId);
    assert.ok(saved.prep.prepEvidence[0].cloudUrl);
    const storedAfter = await readDatabase(page);
    assert.equal(storedAfter[0].key, storedBefore[0].key, 'original durable key remains recoverable');
    assert.equal(storedAfter[0].dataUrl, '', 'confirmed upload releases large local bytes');
    assert.ok(storedAfter[0].cloudUrl, 'old draft reference can resolve confirmed cloud metadata');
    await page.reload();
    await waitForApp(page);
    await page.locator('[data-route="plans"]').filter({ visible: true }).first().click();
    assert.ok((await page.locator('body').innerText()).includes(title), 'saved prep survives another reload');
    assert.deepEqual(errors, [], 'no browser runtime errors');
    assert.equal(remoteRequests.filter(url => url.includes('script.google.com')).length, 0, 'no real backend request escaped QA harness');
    await page.screenshot({ path: path.join(artifactDir, `${label}-saved.png`), fullPage: true, animations: 'disabled' });
    const result = { label, pass: true, fileName: file.name, originalBytes: file.buffer.length, retainedBytes: Buffer.from(durableBase64, 'base64').length, retainedSha256: hash(Buffer.from(durableBase64, 'base64')), uploadCalls: uploads.length, database: storedBefore[0].database, draftLocalStorageBytes: draftJSON.length, realBackendRequests: 0, browserErrors: errors };
    report.scenarios.push(result);
    console.log(`PASS ${label}: real IndexedDB commit -> pending upload -> close page -> new page -> restored text/attachment -> exact-byte retry -> confirmed save -> reload`);
  } catch (error) {
    if (page && !page.isClosed()) {
      await page.screenshot({ path: path.join(artifactDir, `${label}-failure.png`), fullPage: true, animations: 'disabled' });
      console.error((await page.locator('body').innerText()).slice(-7000));
    }
    throw error;
  } finally { await context.close(); }
}

(async () => {
  fs.mkdirSync(artifactDir, { recursive: true });
  const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
  try {
    await runScenario(browser, pdf, 'pdf');
    await runScenario(browser, photo, 'photo');
  } finally {
    await browser.close();
    report.finishedAt = new Date().toISOString();
    fs.writeFileSync(path.join(artifactDir, 'report.json'), JSON.stringify(report, null, 2) + '\n');
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
