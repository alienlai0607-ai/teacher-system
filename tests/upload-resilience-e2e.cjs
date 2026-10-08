const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');
const origin = 'https://kpi-upload.test';
const types = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml' };
const photo = name => ({ name, mimeType: 'image/png', buffer: Buffer.from(name === 'one.png'
  ? 'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFElEQVR42mP8z8Dwn4GBgYGJAQoAHgQCAcR3O98AAAAASUVORK5CYII='
  : 'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFUlEQVR42mNkYPj/n4GBgYGBiQEKAB4EAgFKhhF4AAAAAElFTkSuQmCC', 'base64') });

async function scenario(browser, role, width) {
  const context = await browser.newContext({ viewport: { width, height: 844 }, timezoneId: 'Asia/Taipei', serviceWorkers: 'block' });
  const page = await context.newPage();
  const user = { nickname: '皮皮老師', role: 'admin_staff', subtype: 'marketing', department: '北區教室', work_assignments: [role], session_token: 'isolated-test-token', t: Date.now() };
  const store = { preps: [], lessons: [], records: [] };
  const uploads = [];
  const receipts = new Map();
  const saveIds = [];
  let recordWrites = 0;
  let holdSaveConfirmation = false;
  let loseSaveResponse = false;
  let fail = true;
  let firstPayload = '';
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await context.addInitScript(user => localStorage.setItem('kpi_session', JSON.stringify(user)), user);
  // Serve unchanged production UI on a non-preview hostname. Only remote storage is a fault-injected fixture.
  await context.route('**/*', async route => {
    const req = route.request();
    const url = new URL(req.url());
    if (url.origin === origin) {
      const file = path.resolve(root, '.' + decodeURIComponent(url.pathname));
      if (!file.startsWith(root + path.sep) || !fs.existsSync(file)) return route.fulfill({ status: 404, body: '' });
      return route.fulfill({ contentType: types[path.extname(file)] || 'application/octet-stream', body: fs.readFileSync(file) });
    }
    if (!req.postData()) return route.fulfill({ contentType: 'application/javascript', body: '' });
    const p = JSON.parse(req.postData());
    let result;
    if (p.action === 'uploadPhoto' || p.action === 'uploadFile') {
      uploads.push(p);
      if (!firstPayload) firstPayload = p.base64;
      if (p.base64 !== firstPayload && fail) return route.fulfill({ status: 404, contentType: 'text/html', body: '<title>Google response unavailable</title>' });
      result = { ok: true, fileId: p.base64 === firstPayload ? 'file-one' : 'file-two', fileName: p.fileName || 'photo.png', url: 'https://drive.google.com/file/d/fixture/view' };
    } else if (p.action === 'getSessionIdentity') result = { ok: true, user };
    else if (p.action === 'getTalentWorkspaceData') result = { ok: true, ...store, users: [user] };
    else if (p.action === 'getAdminMarketingWorkspaceData') result = { ok: true, ...store, records: holdSaveConfirmation ? [] : store.records, users: [user] };
    else if (p.action === 'getClassRosterData') result = { ok: true, classes: [], reminders: [], events: [] };
    else if (p.action === 'saveTalentPrep') {
      store.preps = [{ ...p.prep, status: 'ready' }];
      result = { ok: true, prep: store.preps[0] };
    } else if (p.action === 'saveTalentLesson') {
      const saved = { ...p.lesson, status: 'submitted', updatedAt: new Date().toISOString() };
      const index = store.lessons.findIndex(item => item.id === saved.id);
      if (index >= 0) store.lessons[index] = saved; else store.lessons.unshift(saved);
      result = { ok: true, lesson: saved, reportStatus: 'ready' };
    } else if (p.action === 'saveAdminMarketingRecord') {
      saveIds.push(p.request_id);
      if (receipts.has(p.request_id)) result = receipts.get(p.request_id);
      else {
        recordWrites++;
        store.records = [{ ...p.record, updatedAt: new Date().toISOString() }];
        result = { ok: true, record: store.records[0] };
        receipts.set(p.request_id, result);
      }
      if (loseSaveResponse) { loseSaveResponse = false; return route.abort('failed'); }
    } else if (p.action === 'getMutationReceipt') {
      if (holdSaveConfirmation) return route.abort('failed');
      result = receipts.has(p.mutation_id) ? { ok: true, state: 'done', result: receipts.get(p.mutation_id) } : { ok: true, state: 'not_found' };
    } else if (p.action === 'updateTalentAppStatus') {
      const item = store.lessons.find(item => item.id === p.lesson_id);
      Object.assign(item, { appStatus: 'published', appFiles: p.app_files });
      result = { ok: true, lesson: item };
    } else if (p.action === 'getAttachmentPreviews') result = { ok: true, previews: [] };
    else if (p.action === 'reportClientMetrics') result = { ok: true };
    else result = { ok: false, code: 'QA_UNIMPLEMENTED_ACTION', error: p.action };
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify(result) });
  });
  const click = async action => page.locator(`[data-action="${action}"]`).filter({ visible: true }).first().click();
  const nav = async name => {
    if (!await page.locator(`[data-route="${name}"]`).filter({ visible: true }).count()) await click('more-nav');
    await page.locator(`[data-route="${name}"]`).filter({ visible: true }).first().click();
  };
  try {
    const area = role === 'admin-marketing' ? 'admin-marketing-v1' : 'talent-v2';
    await page.goto(`${origin}/review/${area}/index.html?workspace=${role}`);
    await page.waitForFunction(() => document.querySelector('#app')?.children.length > 0 && !document.body.innerText.includes('正在讀取正式資料'));
    // Reproduce the interval before a slower user starts entering a record.
    await page.waitForTimeout(650);
    assert.equal(await page.locator('#dialog-root > *').count(), 0, 'startup must not interrupt the next action with a notification modal');
    if (role === 'admin-marketing') {
      await click('open-work-item');
      await page.selectOption('#work-category', 'admin');
      await page.fill('#work-title', 'Two-file retry');
      await page.fill('#completed-today', 'Both files required');
      await page.selectOption('#work-status', 'completed');
      await page.setInputFiles('#work-evidence', [photo('one.png'), photo('two.png')]);
      await page.locator('#work-item-form button[type="submit"]').click();
      await page.getByText('表單與選檔仍保留', { exact: false }).waitFor();
      assert.equal(store.records.length, 0);
      assert.equal(await page.locator('[data-file-preview="work-evidence"] .selected-file').count(), 2);
      await page.screenshot({ path: `/private/tmp/kpi-upload-${role}-${width}-retry.png`, fullPage: true });
      fail = false;
      holdSaveConfirmation = true;
      loseSaveResponse = true;
      await page.locator('#work-item-form button[type="submit"]').click();
      await page.getByText('尚未取得儲存確認', { exact: false }).waitFor();
      assert.equal(recordWrites, 1, 'cloud write completed despite missing response');
      assert.equal(await page.locator('[data-file-preview="work-evidence"] .selected-file').count(), 2);
      holdSaveConfirmation = false;
      await page.locator('#work-item-form button[type="submit"]').click();
      await page.locator('#work-item-form').waitFor({ state: 'detached' });
      assert.equal(recordWrites, 1, 'manual UI retry must retain original operation ID');
      assert.equal(new Set(saveIds).size, 1);
      assert.equal(store.records.length, 1);
      assert.equal(store.records[0].items[0].evidence.length, 2);
    } else {
      await click('new-log');
      await page.fill('#log-form input[name="courseName"]', 'Two-file retry');
      await page.fill('#log-form input[name="present"]', '8');
      await page.fill('#log-form input[name="renewalCount"]', '2');
      await page.setInputFiles('[data-upload-category="room"]', [photo('one.png'), photo('two.png')]);
      await page.locator('[data-action="retry-upload"]').waitFor();
      await click('submit-log');
      assert.equal(store.lessons.length, 0);
      fail = false;
      await click('retry-upload');
      await page.waitForFunction(() => !document.querySelector('[data-action="retry-upload"]'));
      await click('submit-log');
      await page.locator('#log-form').waitFor({ state: 'detached' });
      assert.equal(store.lessons[0].roomFiles.length, 2);
      assert.equal(store.lessons[0].present, 8);
      assert.equal(store.lessons[0].renewalCount, 2);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 2), false);
      await page.screenshot({ path: `/private/tmp/kpi-upload-${role}-${width}-retry.png`, fullPage: true });
    }
    assert.equal(uploads.filter(p => p.base64 === firstPayload).length, 1, 'confirmed file must not upload twice');
    assert.equal(uploads.filter(p => p.base64 !== firstPayload).length, 4, 'three bounded failed attempts plus one explicit retry');
    await page.reload();
    if (role === 'admin-marketing') await page.locator('.record-card', { hasText: 'Two-file retry' }).waitFor();
    else {
      await page.locator('.record-row', { hasText: 'Two-file retry' }).first().waitFor();
      assert.equal(store.lessons[0].roomFiles.length, 2);
    }
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 2), false);
    assert.deepEqual(errors, []);
    await page.screenshot({ path: `/private/tmp/kpi-upload-${role}-${width}.png`, fullPage: true });
    console.log(`PASS ${role} ${width}px: real UI, multi-select, partial failure, retained files, explicit retry, no duplicate upload, complete save and reload`);
  } catch (error) {
    console.error(role, page.url(), (await page.locator('body').innerText()).slice(-6000), errors);
    throw error;
  } finally { await context.close(); }
}

(async () => {
  const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
  try { for (const width of [390, 320, 1440]) { await scenario(browser, 'admin-marketing', width); await scenario(browser, 'talent-pt', width); } }
  finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
