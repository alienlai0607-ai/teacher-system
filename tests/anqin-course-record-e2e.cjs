// Real Anqin UI + Chrome IndexedDB. All API calls use the localhost QA harness;
// no production account, backend, uploaded file or record is touched.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');
const origin = 'http://127.0.0.1:18778';
const artifacts = process.env.KPI_COURSE_RECORD_ARTIFACT_DIR || '/private/tmp/kpi-course-record-20260918';
const url = `${origin}/review/anqin-v2/qa-harness.html?nickname=${encodeURIComponent('江江老師')}&role=teacher&department=${encodeURIComponent('北區教室')}`;
const storageKey = 'bp_anqin_v2_review_live_trial_20260805_' + encodeURIComponent('teacher:江江老師');
const types = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };
const image = { name: '家長分享畫面.png', mimeType: 'image/png', buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFElEQVR42mP8z8Dwn4GBgYGJAQoAHgQCAcR3O98AAAAASUVORK5CYII=', 'base64') };
const nonImage = { name: '不是截圖.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\nnot an image\n%%EOF') };
const readState = page => page.evaluate(key => JSON.parse(localStorage.getItem(key) || 'null'), storageKey);
const clickTab = (page, key) => page.locator(`[role="tab"][data-action="today-tab"][data-tab="${key}"]`).click();
async function ready(page) {
  await page.waitForFunction(() => window.__ANQIN_BOOT_READY && document.querySelector('#app')?.children.length);
  const close = page.locator('#dialog-root [data-action="close-dialog"]');
  if (await close.count()) await close.last().click();
}
async function prepareOtherSections(page) {
  await clickTab(page, 'course-record');
  await page.evaluate(key => {
    const state = JSON.parse(localStorage.getItem(key));
    const date = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Taipei' });
    const teacher = state.context.teacher;
    const file = { id: 'QA-existing-evidence', fileName: '既有工作證據.png', mimeType: 'image/png', cloudFileId: 'QA-existing-evidence', cloudUrl: 'https://drive.google.com/file/d/QA-existing-evidence/view', uploadStatus: 'uploaded', recorded: true };
    state.daily = { ...state.daily, date, status: 'draft', submittedAt: '', parentStatus: 'handoff', parentHandoffConfirmed: true, courseRecord: { channels: [], attachments: [], note: '' } };
    state.ui.todayTab = 'course-record';
    state.ui.guidePromptDismissed = true;
    state.activities = [{ id: 'qa-classroom', date, teacher, type: 'classroom', title: '測試班級經營', objective: '學生可以依照收拾流程完成物品歸位', action: '示範收拾流程並帶領学生完成桌面整理', result: '全班完成桌面整理及物品歸位', details: {}, evidence: [{ id: 'qa-evidence', type: 'assessment', attachments: [file] }] }];
    state.operations = { ...state.operations, date, dutyOwner: teacher, confirmedAt: new Date().toISOString(), status: 'submitted', evidenceByCheck: Object.fromEntries(['classroom', 'tools', 'trash', 'toilet'].map(key => [key, { ...file, id: `qa-operation-${key}`, status: 'normal' }])) };
    state.submissions = [];
    sessionStorage.setItem('qa-course-initial-state', JSON.stringify(state));
  }, storageKey);
  await page.addInitScript(key => {
    const initial = sessionStorage.getItem('qa-course-initial-state');
    if (!initial) return;
    sessionStorage.removeItem('qa-course-initial-state');
    localStorage.setItem(key, initial);
    localStorage.setItem(`${key}_safe_backup`, initial);
  }, storageKey);
  await page.reload();
  await ready(page);
  assert.equal((await readState(page)).activities.length, 1, 'other-section fixture is restored after unload persistence');
}

async function makeContext(browser, width, date) {
  const context = await browser.newContext({ viewport: { width, height: 844 }, timezoneId: 'Asia/Taipei', locale: 'zh-TW', serviceWorkers: 'block' });
  const errors = [];
  const remote = [];
  context.on('page', page => page.on('pageerror', error => errors.push(error.message)));
  await context.addInitScript(date => {
    const OriginalDate = Date;
    const fixed = OriginalDate.parse(`${date}T04:00:00Z`);
    window.Date = class extends OriginalDate { constructor(...args) { super(...(args.length ? args : [fixed])); } static now() { return fixed; } };
  }, date);
  await context.route('**/*', route => {
    const requestUrl = new URL(route.request().url());
    if (requestUrl.origin !== origin) {
      remote.push(requestUrl.href);
      return route.fulfill({ contentType: 'application/javascript', body: '' });
    }
    const file = path.resolve(root, '.' + decodeURIComponent(requestUrl.pathname));
    if (!file.startsWith(root + path.sep) || !fs.existsSync(file)) return route.fulfill({ status: 404, body: '' });
    return route.fulfill({ contentType: types[path.extname(file)] || 'application/octet-stream', body: fs.readFileSync(file) });
  });
  return { context, errors, remote };
}
async function requiredScenario(browser, width) {
  const { context, errors, remote } = await makeContext(browser, width, '2026-09-18');
  let page = await context.newPage();
  try {
    await page.goto(`${url}&reset=1`);
    await ready(page);
    await prepareOtherSections(page);
    const boxes = await page.locator('[role="tab"][data-action="today-tab"]').evaluateAll(tabs => tabs.map(tab => ({ key: tab.dataset.tab, x: tab.getBoundingClientRect().x, y: tab.getBoundingClientRect().y, width: tab.getBoundingClientRect().width })));
    assert.equal(boxes.length, 5);
    assert.equal(boxes[4].key, 'course-record', 'course record is the fifth required step');
    assert.ok(Math.max(...boxes.map(box => box.width)) - Math.min(...boxes.map(box => box.width)) <= 1, `${width}px: five equal-width tabs`);
    assert.ok(Math.max(...boxes.map(box => box.y)) - Math.min(...boxes.map(box => box.y)) <= 1, `${width}px: tabs stay on one row`);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true);
    await clickTab(page, 'submit');
    assert.equal(await page.locator('[data-action="submit-daily"]').isDisabled(), true, 'missing course share blocks the otherwise complete daily record');
    await clickTab(page, 'course-record');
    await page.locator('form[data-form="course-record"] input[name="channels"][value="group"]').check();
    await page.locator('form[data-form="course-record"] textarea[name="note"]').fill('已將今天的活動照片分享到家長群組');
    await page.reload(); await ready(page); await clickTab(page, 'course-record');
    assert.equal(await page.locator('input[name="channels"][value="group"]').isChecked(), true, 'channel is autosaved');
    assert.equal(await page.locator('textarea[name="note"]').inputValue(), '已將今天的活動照片分享到家長群組');
    await clickTab(page, 'submit');
    assert.equal(await page.locator('[data-action="submit-daily"]').isDisabled(), true, 'a channel check alone cannot replace screenshot evidence');
    await clickTab(page, 'course-record');
    const uploadsBefore = await page.evaluate(() => window.__KPI_QA_CLOUD__.calls.filter(call => /uploadPhoto|uploadFile/.test(call.action)).length);
    await page.setInputFiles('#course-record-files', nonImage);
    await page.waitForFunction(() => !document.querySelector('#course-record-files')?.disabled);
    assert.equal((await readState(page)).daily.courseRecord.attachments.length, 0, 'a PDF does not satisfy screenshot proof');
    assert.equal(await page.evaluate(() => window.__KPI_QA_CLOUD__.calls.filter(call => /uploadPhoto|uploadFile/.test(call.action)).length), uploadsBefore);
    await page.setInputFiles('#course-record-files', image);
    await page.waitForFunction(key => JSON.parse(localStorage.getItem(key) || '{}').daily?.courseRecord?.attachments?.some(item => item.cloudFileId), storageKey);
    assert.equal(await page.locator('[data-tab="course-record"]').evaluate(element => element.classList.contains('complete')), true);
    await page.locator('[data-action="remove-course-record-attachment"]').first().click();
    await page.waitForFunction(key => JSON.parse(localStorage.getItem(key) || '{}').daily?.courseRecord?.attachments?.length === 0, storageKey);
    await clickTab(page, 'submit');
    assert.equal(await page.locator('[data-action="submit-daily"]').isDisabled(), true, 'deleting the last screenshot restores the blocker');
    await clickTab(page, 'course-record');
    await page.evaluate(() => {
      const fail = async payload => { window.__failedCourseUpload = payload; return { ok: false, error: '隔離測試上傳中斷' }; };
      window.API.uploadPhoto = fail; window.API.uploadFile = fail;
    });
    await page.setInputFiles('#course-record-files', image);
    await page.waitForFunction(key => {
      const record = JSON.parse(localStorage.getItem(key) || '{}').daily?.courseRecord;
      return window.__failedCourseUpload && !document.querySelector('#course-record-files')?.disabled && record?.attachments?.some(item => item.localMediaKey && item.localMediaSaved);
    }, storageKey);
    const failedBase64 = await page.evaluate(() => window.__failedCourseUpload.base64);
    await page.screenshot({ path: path.join(artifacts, `${width}-retained.png`), fullPage: true });
    await page.close();
    page = await context.newPage();
    await page.addInitScript(key => {
      // Exercise the IndexedDB recovery path used after the inline-media quota is reached.
      for (const target of [key, `${key}_safe_backup`]) {
        const stored = JSON.parse(localStorage.getItem(target) || '{}');
        for (const attachment of stored.daily?.courseRecord?.attachments || []) attachment.dataUrl = '';
        stored.ui.todayTab = 'submit';
        localStorage.setItem(target, JSON.stringify(stored));
      }
    }, storageKey);
    await page.goto(url); await ready(page);
    await page.waitForFunction(() => document.querySelector('[data-action="submit-daily"]')?.disabled === false);
    assert.equal(await page.locator('[role="tab"][data-tab="submit"]').getAttribute('aria-selected'), 'true', 'IndexedDB recovery unlocks the existing submit screen without switching tabs');
    await clickTab(page, 'course-record');
    assert.equal(await page.locator('input[name="channels"][value="group"]').isChecked(), true);
    assert.equal((await readState(page)).daily.courseRecord.attachments.length, 1, 'retained screenshot survives closing the tab');
    await page.locator('input[name="channels"][value="group"]').uncheck();
    await page.locator('input[name="channels"][value="parent_app"]').check();
    await clickTab(page, 'submit');
    assert.equal(await page.locator('[data-action="submit-daily"]').isEnabled(), true, 'either share channel works with a recoverable image');
    await page.locator('[data-action="submit-daily"]').click();
    await page.waitForFunction(() => Object.values(window.__KPI_QA_CLOUD__.store.logs).some(log => log.submitted_at));
    const saved = await page.evaluate(() => {
      const log = Object.values(window.__KPI_QA_CLOUD__.store.logs).find(log => log.submitted_at);
      const courseRecord = log.kpi6_data.v2_snapshot.submission.courseRecord;
      return { courseRecord, attachment: window.__KPI_QA_CLOUD__.store.files[courseRecord.attachments[0].cloudFileId] };
    });
    assert.deepEqual(saved.courseRecord.channels, ['parent_app']);
    assert.equal(saved.courseRecord.attachments.length, 1);
    assert.equal(saved.attachment.base64, failedBase64, 'the retry uploads the exact retained screenshot bytes');
    await ready(page); await clickTab(page, 'course-record');
    await page.locator('textarea[name="note"]').fill('送出後追加說明');
    await page.waitForFunction(key => JSON.parse(localStorage.getItem(key) || '{}').daily?.status === 'draft', storageKey);
    assert.equal((await readState(page)).daily.courseRecord.note, '送出後追加說明');
    await page.locator('[data-action="remove-course-record-attachment"]').first().click();
    await page.reload(); await ready(page); await clickTab(page, 'submit');
    assert.equal(await page.locator('[data-action="submit-daily"]').isDisabled(), true, 'reloading must not resurrect a removed screenshot from the earlier submitted snapshot');
    assert.deepEqual(errors, []);
    assert.equal(remote.filter(target => target.includes('script.google.com')).length, 0);
    console.log(`PASS ${width}px course record: five equal tabs, required channel+image, autosave, reject nonimage, delete, close/reopen exact-byte retry, submitted snapshot and resubmit status`);
  } catch (error) {
    if (!page.isClosed()) { console.error((await page.locator('body').innerText()).slice(-5000)); await page.screenshot({ path: path.join(artifacts, `${width}-failure.png`), fullPage: true }); }
    throw error;
  } finally { await context.close(); }
}
async function optionalScenario(browser, date) {
  const { context, errors } = await makeContext(browser, 390, date);
  try {
    const page = await context.newPage(); await page.goto(`${url}&reset=1`); await ready(page); await prepareOtherSections(page);
    await clickTab(page, 'submit');
    assert.equal(await page.locator('[data-action="submit-daily"]').isEnabled(), true, `${date}: blank new course record must not block a legacy day or weekend`);
    assert.deepEqual(errors, []);
    console.log(`PASS ${date}: earlier days and weekends remain compatible`);
  } finally { await context.close(); }
}
(async () => {
  fs.mkdirSync(artifacts, { recursive: true });
  const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
  try {
    for (const width of [320, 390]) await requiredScenario(browser, width);
    for (const date of ['2026-09-17', '2026-09-19']) await optionalScenario(browser, date);
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
