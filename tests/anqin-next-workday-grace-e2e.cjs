// Real Anqin UI in an isolated local QA harness; no production data is touched.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '..');
const origin = 'http://127.0.0.1:18779';
const teacher = '江江老師';
const friday = '2026-10-02';
const monday = '2026-10-05';
const storageKey = 'bp_anqin_v2_review_live_trial_20260805_' + encodeURIComponent(`teacher:${teacher}`);
const url = `${origin}/review/anqin-v2/qa-harness.html?nickname=${encodeURIComponent(teacher)}&role=teacher&department=${encodeURIComponent('北區教室')}&reset=1`;
const types = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };

async function main() {
  const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--no-sandbox'] });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, timezoneId: 'Asia/Taipei', locale: 'zh-TW', serviceWorkers: 'block' });
  const errors = [];
  context.on('page', page => page.on('pageerror', error => errors.push(error.message)));
  await context.addInitScript(date => {
    const OriginalDate = Date;
    const fixed = OriginalDate.parse(`${date}T04:00:00Z`);
    window.Date = class extends OriginalDate {
      constructor(...args) { super(...(args.length ? args : [fixed])); }
      static now() { return fixed; }
    };
  }, monday);
  await context.route('**/*', route => {
    const requestUrl = new URL(route.request().url());
    if (requestUrl.origin !== origin) return route.fulfill({ contentType: 'application/javascript', body: '' });
    const file = path.resolve(root, '.' + decodeURIComponent(requestUrl.pathname));
    if (!file.startsWith(root + path.sep) || !fs.existsSync(file)) return route.fulfill({ status: 404, body: '' });
    return route.fulfill({ contentType: types[path.extname(file)] || 'application/octet-stream', body: fs.readFileSync(file) });
  });

  const page = await context.newPage();
  await page.goto(url);
  await page.waitForFunction(() => window.__ANQIN_BOOT_READY && document.querySelector('#app')?.children.length);
  const seeded = await page.evaluate(key => JSON.parse(localStorage.getItem(key)), storageKey);
  seeded.daily = {
    ...seeded.daily, date: friday, status: 'draft', submittedAt: '',
    summary: { ...seeded.daily.summary, teacherNote: '週五尚未完成，週一繼續' },
    courseRecord: { channels: [], attachments: [], note: '' },
  };
  seeded.operations = {
    ...seeded.operations, id: `op_${friday}_${teacher}`, date: friday, dutyOwner: teacher,
    status: 'draft', confirmedAt: '', evidenceByCheck: {},
  };
  seeded.submissions = [];
  seeded.activities = seeded.activities.filter(item => item.type === 'lessonprep');
  seeded.contacts = [];
  seeded.ui.route = 'today';
  seeded.ui.todayTab = 'activities';
  await page.evaluate(({ key, value }) => sessionStorage.setItem('qa-next-workday-state', JSON.stringify({ key, value })), { key: storageKey, value: seeded });
  await page.addInitScript(() => {
    const raw = sessionStorage.getItem('qa-next-workday-state');
    if (!raw) return;
    sessionStorage.removeItem('qa-next-workday-state');
    const { key, value } = JSON.parse(raw);
    localStorage.setItem(key, JSON.stringify(value));
    localStorage.setItem(`${key}_safe_backup`, JSON.stringify(value));
  });
  await page.reload();
  await page.waitForFunction(() => window.__ANQIN_BOOT_READY && document.body.innerText.includes('補寫上個工作日 KPI'));
  assert.equal(await page.evaluate(key => JSON.parse(localStorage.getItem(key)).daily.date, storageKey), friday);
  assert.match(await page.locator('body').innerText(), /週五可於週一完成，不列補繳、不扣補繳分/);
  assert.match(await page.locator('body').innerText(), /若當日未拍到必要照片，仍由老師自行負責/);

  await page.locator(`[data-action="switch-daily-date"][data-date="${monday}"]`).first().click();
  await page.waitForFunction(({ key, date }) => JSON.parse(localStorage.getItem(key)).daily.date === date, { key: storageKey, date: monday });
  assert.match(await page.locator('body').innerText(), /上個工作日的 KPI 尚未完成/);
  await page.locator('[data-action="today-tab"][data-tab="submit"]').click();
  await page.locator('#summary-teacher-note').fill('週一已先填的內容');

  await page.locator(`[data-action="switch-daily-date"][data-date="${friday}"]`).first().click();
  await page.waitForFunction(({ key, date }) => JSON.parse(localStorage.getItem(key)).daily.date === date, { key: storageKey, date: friday });
  const restored = await page.evaluate(key => JSON.parse(localStorage.getItem(key)), storageKey);
  assert.equal(restored.daily.summary.teacherNote, '週五尚未完成，週一繼續');

  await page.locator(`[data-action="switch-daily-date"][data-date="${monday}"]`).first().click();
  await page.waitForFunction(({ key, date }) => JSON.parse(localStorage.getItem(key)).daily.date === date, { key: storageKey, date: monday });
  const mondayRestored = await page.evaluate(key => JSON.parse(localStorage.getItem(key)), storageKey);
  assert.equal(mondayRestored.daily.summary.teacherNote, '週一已先填的內容');
  assert.equal(errors.length, 0, errors.join('\n'));

  await browser.close();
  console.log('PASS Friday-to-Monday KPI grace, two-way date switching, both drafts restored, and photo responsibility notice');
}

main().catch(error => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
