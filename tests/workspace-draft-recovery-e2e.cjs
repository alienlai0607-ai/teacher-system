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
  let page = await context.newPage();
  const today = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Taipei' }).format(new Date());
  const weekday = new Date(`${today}T12:00:00+08:00`).getDay();
  const schedule = [{ weekday, label: 'QA 班', courseName: 'Simple lesson retry', courseType: '樂高小創客', time: '19:00–20:30', siteType: 'self', site: '北區教室' }];
  const user = { nickname: '皮皮老師', role: 'admin_staff', subtype: 'marketing', department: '北區教室', employment: 'pt', employment_type: 'pt', work_assignments: [role], schedule, schedule_json: schedule, session_token: 'isolated-test-token', t: Date.now() };
  const store = { preps: [], lessons: [], records: [], draft: null };
  const uploads = [];
  const receipts = new Map();
  const receiptSignatures = new Map();
  const saveIds = [];
  const lessonPayloads = [];
  let recordWrites = 0;
  let lessonWrites = 0;
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
      const fileId = p.base64 === firstPayload ? 'fixture-file-one-0001' : 'fixture-file-two-0002';
      result = { ok: true, fileId, fileName: p.fileName || 'photo.png', url: `https://drive.google.com/file/d/${fileId}/view` };
    } else if (p.action === 'getSessionIdentity') result = { ok: true, user };
    else if (p.action === 'getTalentWorkspaceData') result = { ok: true, ...store, lessons: holdSaveConfirmation ? [] : store.lessons, users: [user] };
    else if (p.action === 'getAdminMarketingWorkspaceData') result = { ok: true, ...store, records: holdSaveConfirmation ? [] : store.records, users: [user] };
    else if (p.action === 'getClassRosterData') result = { ok: true, classes: [], reminders: [], events: [] };
    else if (p.action === 'saveTalentDraft') {
      store.draft = p.draft || null;
      result = { ok: true, draft: store.draft };
    } else if (p.action === 'saveTalentLesson') {
      saveIds.push(p.request_id);
      lessonPayloads.push(JSON.parse(JSON.stringify(p.lesson)));
      const signature = JSON.stringify(p.lesson);
      if (receipts.has(p.request_id) && receiptSignatures.get(p.request_id) !== signature) {
        result = { ok: false, code: 'REQUEST_ID_CONFLICT', error: 'request_id was reused with a different lesson payload' };
      } else if (receipts.has(p.request_id)) result = receipts.get(p.request_id);
      else {
        lessonWrites++;
        const lesson = { ...p.lesson, lastRequestId: p.request_id, updatedAt: new Date().toISOString() };
        store.lessons = [lesson];
        store.draft = null;
        result = { ok: true, lesson, reportPending: true, reportQueued: true };
        receiptSignatures.set(p.request_id, signature);
        receipts.set(p.request_id, result);
      }
      if (loseSaveResponse) { loseSaveResponse = false; return route.abort('failed'); }
    } else if (p.action === 'saveAdminMarketingRecord') {
      saveIds.push(p.request_id);
      const signature = JSON.stringify(p.record);
      if (receipts.has(p.request_id) && receiptSignatures.get(p.request_id) !== signature) {
        result = { ok: false, code: 'REQUEST_ID_CONFLICT', error: 'request_id was reused with a different record payload' };
      } else if (receipts.has(p.request_id)) result = receipts.get(p.request_id);
      else {
        recordWrites++;
        store.records = [{ ...p.record, updatedAt: new Date().toISOString() }];
        result = { ok: true, record: store.records[0] };
        receiptSignatures.set(p.request_id, signature);
        receipts.set(p.request_id, result);
      }
      if (loseSaveResponse) { loseSaveResponse = false; return route.abort('failed'); }
    } else if (p.action === 'getMutationReceipt') {
      if (holdSaveConfirmation) return route.abort('failed');
      result = receipts.has(p.mutation_id) ? { ok: true, state: 'done', result: receipts.get(p.mutation_id) } : { ok: true, state: 'not_found' };
    } else if (p.action === 'getAttachmentPreviews') result = { ok: true, previews: [] };
    else if (p.action === 'reportClientMetrics') result = { ok: true };
    else result = { ok: false, code: 'QA_UNIMPLEMENTED_ACTION', error: p.action };
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify(result) });
  });
  const reopen = async area => {
    await page.waitForFunction(() => !document.querySelector('form[data-submitting="true"], [data-uploading="true"]'));
    await page.waitForTimeout(120);
    await page.close();
    page = await context.newPage();
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(`${origin}/review/${area}/index.html?workspace=${role}`);
    await page.locator('[data-action="restore-local-draft"]').first().waitFor();
    await page.locator('[data-action="restore-local-draft"]').first().click();
  };
  const click = async action => page.locator(`[data-action="${action}"]`).filter({ visible: true }).first().click();
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
      await reopen(area);
      assert.equal(await page.locator('#work-title').inputValue(), 'Two-file retry');
      assert.equal(await page.locator('[data-file-preview="work-evidence"] .selected-file').count(), 2);
      assert.equal(await page.locator('#work-item-form').evaluate(el => el.inert), false);
      fail = false;
      holdSaveConfirmation = true;
      loseSaveResponse = true;
      await page.locator('#work-item-form button[type="submit"]').click();
      await page.getByText('尚未取得儲存確認', { exact: false }).waitFor();
      assert.equal(recordWrites, 1, 'cloud write completed despite missing response');
      assert.equal(await page.locator('[data-file-preview="work-evidence"] .selected-file').count(), 2);
      holdSaveConfirmation = false;
      await reopen(area);
      await page.locator('#work-item-form button[type="submit"]').click();
      await page.locator('#work-item-form').waitFor({ state: 'detached' });
      assert.equal(recordWrites, 1, 'manual UI retry must retain original operation ID');
      assert.equal(new Set(saveIds).size, 1);
      assert.equal(store.records.length, 1);
      assert.equal(store.records[0].items[0].evidence.length, 2);
    } else {
      await click('new-log');
      await page.fill('#log-form input[name="courseName"]', 'Simple lesson retry');
      await page.fill('#log-form input[name="present"]', '6');
      await page.fill('#log-form input[name="newCount"]', '1');
      await page.fill('#log-form input[name="renewalCount"]', '2');
      await page.fill('#log-form input[name="trial"]', '3');
      await page.setInputFiles('[data-upload-category="room"]', [photo('one.png'), photo('two.png')]);
      const roomRetry = () => page.locator('[data-file-items="room"] [data-action="retry-upload"][data-category="room"]');
      await roomRetry().waitFor();
      assert.equal(store.lessons.length, 0);
      assert.equal(await page.locator('[data-file-items="room"] .selected-file').count(), 1);
      await reopen(area);
      assert.equal(await page.locator('#log-form input[name="courseName"]').inputValue(), 'Simple lesson retry');
      assert.equal(await page.locator('#log-form input[name="present"]').inputValue(), '6');
      assert.equal(await page.locator('#log-form input[name="newCount"]').inputValue(), '1');
      assert.equal(await page.locator('#log-form input[name="renewalCount"]').inputValue(), '2');
      assert.equal(await page.locator('#log-form input[name="trial"]').inputValue(), '3');
      assert.equal(await page.locator('#log-form').evaluate(el => el.inert), false);
      assert.equal(await page.locator('[data-file-items="room"] .selected-file').count(), 1);
      await page.locator('[data-file-items="room"]').getByText('two.png', { exact: false }).waitFor();
      fail = false;
      await roomRetry().click();
      await roomRetry().waitFor({ state: 'detached' });
      assert.equal(await page.locator('[data-file-items="room"] .selected-file').count(), 2);
      holdSaveConfirmation = true;
      loseSaveResponse = true;
      await click('submit-log');
      await page.getByText('尚未取得儲存確認', { exact: false }).waitFor();
      assert.equal(lessonWrites, 1, 'cloud lesson write completed despite missing response');
      assert.equal(await page.locator('[data-file-items="room"] .selected-file').count(), 2);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 2), false);
      await page.screenshot({ path: `/private/tmp/kpi-upload-${role}-${width}-retry.png`, fullPage: true });
      await reopen(area);
      assert.equal(await page.locator('#log-form input[name="courseName"]').inputValue(), 'Simple lesson retry');
      assert.equal(await page.locator('[data-file-items="room"] .selected-file').count(), 2);
      holdSaveConfirmation = false;
      await click('submit-log');
      await page.locator('#log-form').waitFor({ state: 'detached' });
      assert.equal(lessonWrites, 1, 'manual UI retry must retain original operation ID');
      assert.equal(saveIds.length, 2, 'manual UI retry must send the saved lesson operation again');
      assert.equal(new Set(saveIds).size, 1);
      assert.deepEqual(lessonPayloads[1], lessonPayloads[0], 'manual UI retry must retain the original lesson payload');
      assert.equal(store.lessons.length, 1);
      assert.equal(store.lessons[0].courseName, 'Simple lesson retry');
      assert.equal(store.lessons[0].present, 6);
      assert.equal(store.lessons[0].newCount, 1);
      assert.equal(store.lessons[0].renewalCount, 2);
      assert.equal(store.lessons[0].trial, 3);
      assert.equal(store.lessons[0].roomFiles.length, 2);
    }
    assert.equal(uploads.filter(p => p.base64 === firstPayload).length, 1, 'confirmed file must not upload twice');
    assert.equal(uploads.filter(p => p.base64 !== firstPayload).length, 4, 'three bounded failed attempts plus one explicit retry');
    await page.reload();
    if (role === 'admin-marketing') await page.locator('.record-card', { hasText: 'Two-file retry' }).waitFor();
    else await page.locator('.record-row', { hasText: 'Simple lesson retry' }).waitFor();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 2), false);
    assert.deepEqual(errors, []);
    await page.screenshot({ path: `/private/tmp/kpi-upload-${role}-${width}.png`, fullPage: true });
    console.log(`PASS ${role} ${width}px: close/reopen after failed upload and unknown save, original bytes and operation retained, complete recovery`);
  } catch (error) {
    console.error(role, page.url(), (await page.locator('body').innerText()).slice(-6000), errors);
    throw error;
  } finally { await context.close(); }
}

(async () => {
  const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
  try { for (const width of [390, 320]) { await scenario(browser, 'admin-marketing', width); await scenario(browser, 'talent-pt', width); } }
  finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
