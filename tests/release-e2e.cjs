#!/usr/bin/env node

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const baseUrl = process.env.KPI_QA_BASE_URL || 'http://127.0.0.1:8777';
const chromePath = process.env.KPI_QA_CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const artifactDir = process.env.KPI_QA_ARTIFACT_DIR || '/private/tmp/kpi-release-qa';
const today = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Taipei' }).format(new Date());
const tomorrow = (() => {
  const value = new Date(`${today}T12:00:00+08:00`);
  value.setDate(value.getDate() + 1);
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Taipei' }).format(value);
})();
const talentPtTestDate = (() => {
  const [year, month] = today.split('-').map(Number);
  for (let day = 1; day <= 7; day += 1) {
    const value = new Date(Date.UTC(year, month - 1, day, 4));
    if (value.getUTCDay() === 4) return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }
  throw new Error('無法建立才藝 PT 驗收日期');
})();

fs.mkdirSync(artifactDir, { recursive: true });
const imageA = path.join(artifactDir, 'qa-red.png');
const imageB = path.join(artifactDir, 'qa-blue.png');
const largeImage = path.join(artifactDir, 'qa-large.bmp');
const pdfFile = path.join(artifactDir, 'qa-material.pdf');
const largePdfFile = path.join(artifactDir, 'qa-material-16mb.pdf');
fs.writeFileSync(imageA, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFElEQVR42mP8z8Dwn4GBgYGJAQoAHgQCAcR3O98AAAAASUVORK5CYII=', 'base64'));
fs.writeFileSync(imageB, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFUlEQVR42mNkYPj/n4GBgYGBiQEKAB4EAgFKhhF4AAAAAElFTkSuQmCC', 'base64'));
fs.writeFileSync(pdfFile, '%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n');

function writeBmp(filePath, width = 1800, height = 1800) {
  const rowSize = (width * 3 + 3) & ~3;
  const pixelBytes = rowSize * height;
  const bitmap = Buffer.alloc(54 + pixelBytes);
  bitmap.write('BM', 0, 2, 'ascii');
  bitmap.writeUInt32LE(bitmap.length, 2);
  bitmap.writeUInt32LE(54, 10);
  bitmap.writeUInt32LE(40, 14);
  bitmap.writeInt32LE(width, 18);
  bitmap.writeInt32LE(height, 22);
  bitmap.writeUInt16LE(1, 26);
  bitmap.writeUInt16LE(24, 28);
  bitmap.writeUInt32LE(pixelBytes, 34);
  for (let y = 0; y < height; y += 1) {
    const row = 54 + y * rowSize;
    for (let x = 0; x < width; x += 1) {
      const offset = row + x * 3;
      bitmap[offset] = (x * 3 + y) & 255;
      bitmap[offset + 1] = (x + y * 2) & 255;
      bitmap[offset + 2] = (x * 2 + y * 3) & 255;
    }
  }
  fs.writeFileSync(filePath, bitmap);
}

writeBmp(largeImage);
fs.writeFileSync(largePdfFile, Buffer.concat([
  Buffer.from('%PDF-1.4\n% 16 MB upload acceptance fixture\n'),
  Buffer.alloc(16 * 1024 * 1024, 0x20),
  Buffer.from('\n%%EOF\n'),
]));

const report = {
  startedAt: new Date().toISOString(),
  baseUrl,
  checks: [],
  failures: [],
  browserErrors: [],
  externalWarnings: [],
  routeAudits: [],
};

function check(name, passed, detail = '') {
  report.checks.push({ name, passed: Boolean(passed), detail });
  if (!passed) report.failures.push({ name, detail });
}

function trackPage(page, label) {
  page.on('pageerror', error => report.browserErrors.push({ label, type: 'pageerror', message: error.message }));
  page.on('console', message => {
    if (message.type() !== 'error') return;
    const location = message.location();
    const source = location?.url ? ` (${location.url}${location.lineNumber != null ? `:${location.lineNumber + 1}` : ''})` : '';
    if (String(location?.url || '').startsWith('https://cdn.onesignal.com/') && message.text().includes('Failed to load resource')) {
      report.externalWarnings.push({ label, type: 'external-push', message: `${message.text()}${source}` });
      return;
    }
    report.browserErrors.push({ label, type: 'console', message: `${message.text()}${source}` });
  });
  page.on('response', response => {
    const url = response.url();
    if (url.startsWith(baseUrl) && response.status() >= 400) {
      report.browserErrors.push({ label, type: 'response', message: `${response.status()} ${url}` });
    }
  });
  page.on('requestfailed', request => {
    const url = request.url();
    if (url.startsWith(baseUrl)) report.browserErrors.push({ label, type: 'requestfailed', message: `${url}: ${request.failure()?.errorText || ''}` });
  });
  return page;
}

async function createPage(browser, viewport, label) {
  const context = await browser.newContext({
    viewport,
    locale: 'zh-TW',
    timezoneId: 'Asia/Taipei',
    serviceWorkers: 'block',
  });
  const page = trackPage(await context.newPage(), label);
  return { context, page };
}

async function waitForApp(page) {
  await page.waitForSelector('#app', { state: 'attached', timeout: 15000 });
  await page.waitForFunction(() => document.querySelector('#app')?.children.length > 0, null, { timeout: 15000 });
  await page.waitForTimeout(250);
}

async function clickAction(page, action, options = {}) {
  const locator = page.locator(`[data-action="${action}"]`).filter({ visible: true }).first();
  await locator.waitFor({ state: 'visible', timeout: options.timeout || 8000 });
  await locator.click({ force: Boolean(options.force) });
}

async function closeDrawer(page) {
  const button = page.locator('button[data-action="close-drawer"]').filter({ visible: true }).first();
  await button.waitFor({ state: 'visible', timeout: 8000 });
  await button.click();
}

async function clickRoute(page, route) {
  const clicked = await page.evaluate(value => {
    const candidates = Array.from(document.querySelectorAll(`[data-route="${CSS.escape(value)}"]`));
    const node = candidates.find(item => item.offsetParent !== null) || candidates[0];
    if (!node) return false;
    node.click();
    return true;
  }, route);
  if (!clicked) throw new Error(`route button missing: ${route}`);
  await page.waitForTimeout(120);
}

async function pageHealth(page, label, route = '') {
  const health = await page.evaluate(() => {
    const ids = Array.from(document.querySelectorAll('[id]')).map(node => node.id).filter(Boolean);
    const duplicateIds = [...new Set(ids.filter((id, index) => ids.indexOf(id) !== index))];
    const bodyText = document.body.innerText || '';
    const localBrokenImages = Array.from(document.images)
      .filter(image => image.src && image.src.startsWith(location.origin) && image.complete && image.naturalWidth === 0)
      .map(image => image.src);
    const unnamedButtons = Array.from(document.querySelectorAll('button'))
      .filter(button => button.offsetParent !== null)
      .filter(button => !String(button.textContent || '').trim() && !button.getAttribute('aria-label') && !button.getAttribute('title'))
      .length;
    return {
      title: document.title,
      appTextLength: (document.querySelector('#app')?.innerText || '').trim().length,
      horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 2,
      duplicateIds,
      localBrokenImages,
      unnamedButtons,
      internalText: /\b(?:undefined|null|\[object Object\])\b/.test(bodyText),
      bootFailure: /系統尚未完成開啟|資料載入失敗|Application error/i.test(bodyText),
    };
  });
  report.routeAudits.push({ label, route, ...health });
  check(`${label}${route ? ` / ${route}` : ''} 有內容`, health.appTextLength > 20, JSON.stringify(health));
  check(`${label}${route ? ` / ${route}` : ''} 無水平溢位`, !health.horizontalOverflow, JSON.stringify(health));
  check(`${label}${route ? ` / ${route}` : ''} 無重複 DOM id`, health.duplicateIds.length === 0, health.duplicateIds.join(', '));
  check(`${label}${route ? ` / ${route}` : ''} 本機圖片可讀`, health.localBrokenImages.length === 0, health.localBrokenImages.join(', '));
  check(`${label}${route ? ` / ${route}` : ''} 無未命名按鈕`, health.unnamedButtons === 0, String(health.unnamedButtons));
  check(`${label}${route ? ` / ${route}` : ''} 無內部值外露`, !health.internalText, JSON.stringify(health));
  check(`${label}${route ? ` / ${route}` : ''} 無啟動失敗`, !health.bootFailure, JSON.stringify(health));
}

async function auditRoutes(browser, testCase, viewport) {
  const label = `${testCase.label} ${viewport.width}px`;
  const { context, page } = await createPage(browser, viewport, label);
  try {
    await page.goto(`${baseUrl}${testCase.url}`, { waitUntil: 'domcontentloaded', timeout: 20000 });
    await waitForApp(page);
    await pageHealth(page, label, 'initial');
    const routes = await page.evaluate(() => [...new Set(Array.from(document.querySelectorAll('[data-route]')).map(node => node.dataset.route).filter(Boolean))]);
    for (const route of routes) {
      try {
        await clickRoute(page, route);
        await pageHealth(page, label, route);
      } catch (error) {
        check(`${label} / ${route} 可開啟`, false, error.message);
      }
    }
    await page.screenshot({ path: path.join(artifactDir, `${testCase.key}-${viewport.width}.png`), fullPage: true });
  } finally {
    await context.close();
  }
}

async function adminWorkflow(browser) {
  const label = '行政完整流程';
  const { context, page } = await createPage(browser, { width: 390, height: 844 }, label);
  try {
    await page.goto(`${baseUrl}/review/admin-marketing-v1/index.html?workspace=admin-marketing&reviewUser=%E7%9A%AE%E7%9A%AE%E8%80%81%E5%B8%AB`, { waitUntil: 'domcontentloaded' });
    await waitForApp(page);
    await page.evaluate(() => localStorage.clear());
    await page.reload({ waitUntil: 'domcontentloaded' });
    await waitForApp(page);

    await clickRoute(page, 'today');
    check('行政尚未確認訊息時不會被工作紀錄誤判完成', (await page.locator('[data-action="open-daily-check"]').innerText()).includes('尚未確認'));
    await clickAction(page, 'open-daily-check');
    await page.locator('#daily-check-form label:has(input[name="status"][value="needs_supervisor"])').click();
    await page.fill('#daily-check-note', '等待主管確認測試訊息');
    await page.check('#daily-check-form input[name="reported"]');
    await page.locator('#daily-check-form label:has(input[name="status"][value="clear"])').click();
    check('行政訊息切回已處理會清除隱藏的主管事項', await page.evaluate(() => {
      const form = document.querySelector('#daily-check-form');
      const block = document.querySelector('[data-daily-issue]');
      return Boolean(block?.hidden && form?.elements.note?.value === '' && !form?.elements.note?.required && !form?.elements.reported?.checked);
    }));
    await page.locator('#daily-check-form button[type="submit"]').click();
    await page.waitForTimeout(200);
    check('行政每日訊息確認可獨立儲存', (await page.locator('[data-action="open-daily-check"]').innerText()).includes('已確認'));

    await clickAction(page, 'open-environment');
    await page.locator('#environment-form label:has(input[name="environmentStatus"][value="issue"])').click();
    await page.check('#environment-form input[name="issue-counter_zone"]');
    await page.fill('#environment-issue', '櫃檯測試資料待整理');
    await page.fill('#environment-due', tomorrow);
    await page.locator('#environment-form label:has(input[name="environmentStatus"][value="clear"])').click();
    check('行政環境切回正常會清除隱藏的問題資料', await page.evaluate(() => {
      const form = document.querySelector('#environment-form');
      const block = document.querySelector('[data-environment-issue]');
      const issueChecks = Array.from(form?.querySelectorAll('input[name^="issue-"]') || []);
      return Boolean(block?.hidden && issueChecks.every(input => !input.checked) && form?.elements.issue?.value === '' && !form?.elements.issue?.required && form?.elements.improvementDue?.value === '' && !form?.elements.improvementDue?.required);
    }));
    await page.locator('#environment-form button[type="submit"]').click();
    await page.waitForTimeout(200);
    check('行政環境正常狀態可一鍵儲存', (await page.locator('[data-action="open-environment"]').innerText()).includes('正常'));

    await clickAction(page, 'open-work-item');
    await page.selectOption('#work-category', 'admin');
    await page.fill('#work-title', '端到端儲存驗收');
    await page.fill('#completed-today', '已完成資料核對並確認附件可以重新讀取');
    await page.fill('#remaining', '這段切換後不應保存');
    await page.fill('#due-date', tomorrow);
    await page.selectOption('#work-status', 'completed');
    check('行政工作切為完成會清除隱藏的下一步與期限', await page.evaluate(() => {
      const form = document.querySelector('#work-item-form');
      const blocks = Array.from(document.querySelectorAll('[data-work-next]'));
      return blocks.every(node => node.hidden) && form?.elements.remaining?.value === '' && !form?.elements.remaining?.required && form?.elements.dueDate?.value === '' && !form?.elements.dueDate?.required;
    }));
    await page.setInputFiles('#work-evidence', [imageA, largeImage, largePdfFile]);
    check('行政附件可一次複選照片與 16 MB 文件', await page.locator('[data-file-preview="work-evidence"] .selected-file').count() === 3);
    await page.locator('[data-file-preview="work-evidence"] [data-action="remove-selected-file"]').nth(1).click();
    check('行政新選附件可在儲存前逐檔移除', await page.locator('[data-file-preview="work-evidence"] .selected-file').count() === 2);
    await page.setInputFiles('#work-evidence', imageB);
    check('行政分次選檔會累加而非覆蓋', await page.locator('[data-file-preview="work-evidence"] .selected-file').count() === 3);
    await page.locator('#work-item-form button[type="submit"]').click();
    await page.waitForTimeout(250);
    check('行政可新增完成工作', (await page.locator('body').innerText()).includes('端到端儲存驗收'));

    await page.locator('.record-card', { hasText: '端到端儲存驗收' }).first().locator('[data-action="open-work-item"]').click();
    check('行政編輯時可讀回三份既有附件', await page.locator('[data-existing-file]').count() === 3);
    await page.locator('[data-existing-file] [data-action="remove-existing-file"]').first().click();
    check('行政既有附件按叉後立即從表單移除', await page.locator('[data-existing-file]').count() === 2);
    await page.locator('#work-item-form button[type="submit"]').click();
    await page.waitForTimeout(200);

    await clickAction(page, 'open-work-item');
    await page.selectOption('#work-category', 'project');
    await page.fill('#work-title', '未完成工作驗收');
    await page.fill('#completed-today', '已完成需求盤點');
    await page.selectOption('#work-status', 'in_progress');
    await page.fill('#remaining', '明日完成版面確認');
    await page.fill('#due-date', tomorrow);
    await page.locator('#work-item-form button[type="submit"]').click();
    await page.waitForTimeout(200);
    check('行政未完成工作可留下下一步與期限', (await page.locator('body').innerText()).includes('明日完成版面確認'));

    await clickRoute(page, 'trials');
    const createTrial = async (course, date = today) => {
      await clickAction(page, 'open-trial');
      await page.fill('#trial-message-import', `學生：測試學生\n日期：${date}\n時間：19:00-20:30\n課程：${course}\n老師：RITA老師\n電話：0912-345-678`);
      await clickAction(page, 'parse-trial-message');
      check(`試上訊息可辨識 ${course}`, (await page.inputValue('#trial-student')) === '測試學生' && (await page.inputValue('#trial-course')) === course);
      await page.locator('#trial-form button[type="submit"]').click();
      await page.waitForTimeout(220);
    };
    await createTrial('樂高小創客');
    await createTrial('FLL challenge戰隊培訓班');
    check('同一學生同日可登記兩個不同課程', await page.locator('.trial-row', { hasText: '測試學生' }).count() === 2);

    await createTrial('樂高簡易積木', tomorrow);
    check('行政可提前登記未來試上', (await page.locator('body').innerText()).includes('樂高簡易積木'));

    await clickAction(page, 'open-trial');
    await page.fill('#trial-student', '測試學生');
    await page.fill('#trial-course', '樂高小創客');
    await page.fill('#trial-teacher', 'RITA老師');
    await page.fill('#trial-contact', '0912345678');
    await page.fill('#trial-date', today);
    await page.locator('#trial-form button[type="submit"]').click();
    await page.waitForTimeout(150);
    check('完全相同試上會被阻擋且不重複新增', await page.locator('.trial-row', { hasText: '測試學生' }).count() === 3);
    await page.locator('#dialog-root button[data-action="close-dialog"]').last().click();
    await page.waitForSelector('#dialog-root .dialog', { state: 'detached' });

    const firstTrialEdit = page.locator('.trial-row', { hasText: '樂高小創客' }).locator('[data-action="open-trial"]');
    await firstTrialEdit.click();
    await page.selectOption('#trial-status', 'converted');
    await page.fill('#enrollment-date', today);
    await page.fill('#payment-date', today);
    await page.fill('#enrollment-course', '樂高小創客一期');
    await page.selectOption('#first-enrollment', 'yes');
    await page.setInputFiles('#payment-evidence', imageA);
    await page.selectOption('#trial-status', 'considering');
    check('試上取消轉一期狀態會清除隱藏的報名與附件資料', await page.evaluate(() => {
      const form = document.querySelector('#trial-form');
      const section = document.querySelector('[data-conversion-fields]');
      return Boolean(section?.hidden
        && form?.elements.enrollmentDate?.value === ''
        && form?.elements.paymentDate?.value === ''
        && form?.elements.enrollmentCourse?.value === ''
        && form?.elements.firstEnrollment?.value === ''
        && document.querySelectorAll('[data-file-preview="payment-evidence"] .selected-file').length === 0);
    }));
    await page.fill('#trial-next', tomorrow);
    await page.selectOption('#trial-status', 'not_enrolled');
    check('試上結案後會清除隱藏的提醒日期', await page.evaluate(() => {
      const form = document.querySelector('#trial-form');
      const block = document.querySelector('[data-trial-next]');
      return Boolean(block?.hidden && form?.elements.nextFollowupDate?.disabled && form?.elements.nextFollowupDate?.value === '');
    }));
    await page.selectOption('#trial-status', 'converted');
    await page.fill('#enrollment-date', today);
    await page.fill('#payment-date', today);
    await page.fill('#enrollment-course', '樂高小創客一期');
    await page.selectOption('#first-enrollment', 'yes');
    await page.setInputFiles('#payment-evidence', imageA);
    await page.locator('#trial-form button[type="submit"]').click();
    await page.waitForTimeout(250);
    check('首次報名不需手填追蹤即可進入 50 元待審', (await page.locator('body').innerText()).includes('50 元待主管確認'));

    await page.reload({ waitUntil: 'domcontentloaded' });
    await waitForApp(page);
    await clickRoute(page, 'today');
    check('行政工作重新整理後仍存在', (await page.locator('body').innerText()).includes('端到端儲存驗收'));
    await page.locator('.record-card', { hasText: '端到端儲存驗收' }).first().locator('[data-action="open-work-item"]').click();
    check('行政刪除既有附件後重新整理仍維持兩份', await page.locator('[data-existing-file]').count() === 2);
    await page.locator('#dialog-root button[data-action="close-dialog"]').last().click();
    await page.waitForSelector('#dialog-root .dialog', { state: 'detached' });
    await clickRoute(page, 'trials');
    check('三筆試上重新整理後仍存在', await page.locator('.trial-row', { hasText: '測試學生' }).count() === 3);
    check('首報獎金重新整理後仍存在', (await page.locator('body').innerText()).includes('50 元待主管確認'));
    await pageHealth(page, label, 'reload');
    await page.screenshot({ path: path.join(artifactDir, 'admin-workflow.png'), fullPage: true });

    const manager = trackPage(await context.newPage(), '行政主管完整流程');
    await manager.goto(`${baseUrl}/review/admin-marketing-v1/index.html?workspace=admin-marketing-manager&reviewUser=%E5%B0%8F%E9%AD%9A%E4%B8%BB%E7%AE%A1`, { waitUntil: 'domcontentloaded' });
    await waitForApp(manager);

    await clickRoute(manager, 'reviews');
    const reviewCard = manager.locator('.record-card', { hasText: '項工作' }).first();
    check('行政主管可看到老師新增的工作紀錄', await reviewCard.count() === 1);
    await reviewCard.locator('[data-action="review-record"]').click();
    check('行政主管可開啟工作內容與附件', (await manager.locator('#review-form').innerText()).includes('端到端儲存驗收'));
    await manager.fill('#review-note', '附件與完成結果已確認，主管回覆可正常保存。');
    await manager.locator('#review-form button[type="submit"]').click();
    await manager.waitForTimeout(250);
    check('行政主管回覆可儲存', (await manager.locator('body').innerText()).includes('主管回覆已儲存'));

    await clickRoute(manager, 'trials');
    const bonusRow = manager.locator('.trial-row', { hasText: '樂高小創客' }).first();
    await bonusRow.locator('[data-action="review-trial-bonus"]').click();
    await manager.locator('#trial-bonus-form button[type="submit"]').click();
    await manager.waitForTimeout(250);
    check('行政主管可核准首報 50 元獎金', (await manager.locator('body').innerText()).includes('首報獎金 50 元已核准'));

    await clickRoute(manager, 'assignments');
    await clickAction(manager, 'open-assignment');
    await manager.fill('#assignment-title', '主管端到端交辦');
    await manager.fill('#assignment-detail', '確認行政能收到主管建立的工作與期限。');
    await manager.fill('#assignment-due', tomorrow);
    await manager.locator('#assignment-form button[type="submit"]').click();
    await manager.waitForTimeout(250);
    check('行政主管可建立有期限的交辦', (await manager.locator('body').innerText()).includes('主管端到端交辦'));

    await clickRoute(manager, 'evaluation');
    const adminScoreInputs = manager.locator('#score-form input[type="number"]');
    for (let index = 0; index < await adminScoreInputs.count(); index += 1) {
      const input = adminScoreInputs.nth(index);
      await input.fill(await input.getAttribute('max') || '0');
    }
    await manager.fill('#score-comment', '本月紀錄與附件完整，下一月持續維持明確期限。');
    await manager.check('#score-form input[name="published"]');
    await manager.locator('#score-form button[type="submit"]').click();
    await manager.waitForTimeout(300);
    check('行政主管評核可儲存並公布', /評核已公布給皮皮|已公布/.test(await manager.locator('body').innerText()));

    await manager.reload({ waitUntil: 'domcontentloaded' });
    await waitForApp(manager);
    await clickRoute(manager, 'evaluation');
    check('行政主管評核重新整理後仍存在', (await manager.inputValue('#score-comment')).includes('本月紀錄與附件完整'));
    await pageHealth(manager, '行政主管完整流程', 'reload');
    await manager.screenshot({ path: path.join(artifactDir, 'admin-manager-workflow.png'), fullPage: true });

    await page.reload({ waitUntil: 'domcontentloaded' });
    await waitForApp(page);
    await clickRoute(page, 'performance');
    const workerPerformance = await page.locator('body').innerText();
    check('行政端可看到主管已公布評核與評語', workerPerformance.includes('本月紀錄與附件完整'));
    await clickRoute(page, 'trials');
    check('行政端可看到首報獎金已核准', (await page.locator('body').innerText()).includes('首報獎金 50 元已核准'));
    await manager.close();
  } finally {
    await context.close();
  }
}

async function talentWorkflow(browser) {
  const label = '才藝 PT 完整流程';
  const { context, page } = await createPage(browser, { width: 390, height: 844 }, label);
  try {
    await page.clock.install({ time: new Date(`${talentPtTestDate}T12:00:00+08:00`) });
    await page.goto(`${baseUrl}/review/talent-v2/index.html?workspace=talent-pt&reviewUser=%E7%9A%AE%E7%9A%AE%E8%80%81%E5%B8%AB`, { waitUntil: 'domcontentloaded' });
    await waitForApp(page);
    await page.evaluate(() => localStorage.clear());
    await page.reload({ waitUntil: 'domcontentloaded' });
    await waitForApp(page);
    check('非黑豹才藝老師不顯示特殊鐘點頁', await page.locator('[data-route="pay"]').count() === 0);

    await clickRoute(page, 'prep');
    await clickAction(page, 'new-prep');
    await page.selectOption('#prep-form select[name="courseType"]', '樂高小創客');
    await page.fill('#prep-form input[name="courseName"]', '端到端才藝教材');
    await page.fill('#prep-form textarea[name="notes"]', '本堂使用齒輪與簡易馬達材料');
    await page.setInputFiles('#prep-form input[data-upload-category="prep"]', [largePdfFile, largeImage]);
    await page.waitForFunction(() => document.querySelectorAll('[data-file-items="prep"] .selected-file').length === 2, null, { timeout: 12000 });
    check('才藝備課可上傳 16 MB 文件並自動壓縮大型圖片', await page.locator('[data-file-items="prep"] .selected-file').count() === 2);
    await clickAction(page, 'save-prep');
    await page.waitForTimeout(250);
    check('才藝備課可一次加入多份教材', (await page.locator('body').innerText()).includes('端到端才藝教材'));

    await clickRoute(page, 'today');
    const beforeCount = await page.locator('.record-row').count();
    await clickAction(page, 'new-log');
    await page.selectOption('#log-form select[name="prepId"]', { label: '端到端才藝教材 · 樂高小創客' });
    check('才藝選擇備課後自動帶入課程資料', (
      await page.inputValue('#log-form input[name="courseType"]') === '樂高小創客'
      && await page.inputValue('#log-form input[name="courseName"]') === '端到端才藝教材'
    ));
    await page.fill('#log-form input[name="present"]', '5');
    await page.fill('#log-form input[name="leave"]', '0');
    await page.fill('#log-form input[name="absent"]', '0');
    await page.fill('#log-form input[name="makeup"]', '0');
    await page.fill('#log-form input[name="trial"]', '0');
    check('才藝應到人數由點名自動計算', await page.inputValue('#log-form input[name="expected"]') === '5');
    check('才藝課後教室復原只看照片，不再要求重複勾選', await page.locator('#log-form input[name="roomDone"]').count() === 0);
    await page.fill('#log-form textarea[name="issue"]', '本堂齒輪安裝較慢，下次先依顏色分盒並示範卡榫方向。');
    await page.selectOption('#log-form select[name="parentStatus"]', 'followup');
    await page.fill('#log-form textarea[name="parentFollowup"]', '這段切換後不應保存');
    await page.selectOption('#log-form select[name="parentStatus"]', 'complete');
    check('才藝親師狀態切回完成會清除隱藏追蹤文字', await page.evaluate(() => {
      const form = document.querySelector('#log-form');
      const field = form?.querySelector('.followup-field');
      return Boolean(field?.hidden && form?.elements.parentFollowup?.value === '' && !form?.elements.parentFollowup?.required);
    }));
    await page.setInputFiles('#log-form input[data-upload-category="attendance"]', imageA);
    await page.setInputFiles('#log-form input[data-upload-category="learning"]', [imageA, largeImage]);
    await page.waitForFunction(() => {
      const input = document.querySelector('#log-form input[data-upload-category="learning"]');
      return input && !input.disabled && document.querySelectorAll('[data-file-items="learning"] .selected-file').length === 2;
    }, null, { timeout: 30000 });
    check('才藝成果照片可一次多選', await page.locator('[data-file-items="learning"] .selected-file').count() === 2);
    await page.locator('[data-file-items="learning"] [data-action="remove-upload"]').first().click();
    check('才藝成果照片選錯可逐張移除', await page.locator('[data-file-items="learning"] .selected-file').count() === 1);
    await page.setInputFiles('#log-form input[data-upload-category="learning"]', imageA);
    await page.waitForFunction(() => document.querySelectorAll('[data-file-items="learning"] .selected-file').length === 2, null, { timeout: 12000 });
    check('才藝移除後可重新加入且其餘照片不被覆蓋', await page.locator('[data-file-items="learning"] .selected-file').count() === 2);
    await page.setInputFiles('#log-form input[data-upload-category="room"]', imageB);
    const renewalInput = page.locator('#log-form input[name="renewalCount"]');
    if (await renewalInput.count()) await renewalInput.fill('1');
    await clickAction(page, 'submit-log');
    await page.waitForTimeout(400);
    const pageText = await page.locator('body').innerText();
    check('才藝 PT 可正式送出', pageText.includes('端到端才藝教材'));
    check('才藝送出不再顯示 completed 內部欄位', !/\bcompleted\b/i.test(pageText));
    check('才藝送出只新增一筆', await page.locator('.record-row').count() === beforeCount + 1);

    await page.reload({ waitUntil: 'domcontentloaded' });
    await waitForApp(page);
    await clickRoute(page, 'today');
    check('才藝紀錄重新整理後仍存在', (await page.locator('body').innerText()).includes('端到端才藝教材'));
    await pageHealth(page, label, 'reload');
    await page.screenshot({ path: path.join(artifactDir, 'talent-pt-workflow.png'), fullPage: true });

    await page.evaluate(() => {
      const key = 'bp_talent_kpi_v14_shared';
      const shared = JSON.parse(localStorage.getItem(key) || 'null');
      if (!shared) return;
      const rita = (shared.pendingUsers || []).find(item => item.nickname === 'RITA老師');
      if (rita && !(shared.users || []).some(item => item.nickname === rita.nickname)) {
        rita.status = 'active';
        shared.users = [...(shared.users || []), rita];
        shared.pendingUsers = (shared.pendingUsers || []).filter(item => item.nickname !== rita.nickname);
        localStorage.setItem(key, JSON.stringify(shared));
      }
    });

    const fulltime = trackPage(await context.newPage(), '才藝正職完整流程');
    await fulltime.goto(`${baseUrl}/review/talent-v2/index.html?workspace=talent-fulltime&reviewUser=RITA%E8%80%81%E5%B8%AB`, { waitUntil: 'domcontentloaded' });
    await waitForApp(fulltime);
    await clickRoute(fulltime, 'prep');
    await clickAction(fulltime, 'new-prep');
    await fulltime.selectOption('#prep-form select[name="courseType"]', '科學實驗');
    await fulltime.fill('#prep-form input[name="courseName"]', '端到端正職教材');
    await fulltime.setInputFiles('#prep-form input[data-upload-category="prep"]', [imageA, imageB]);
    await fulltime.waitForFunction(() => document.querySelectorAll('[data-file-items="prep"] .selected-file').length === 2, null, { timeout: 12000 });
    check('才藝正職備課可一次加入多份教材', await fulltime.locator('[data-file-items="prep"] .selected-file').count() === 2);
    await clickAction(fulltime, 'save-prep');
    await fulltime.waitForTimeout(250);
    check('才藝正職備課可儲存', (await fulltime.locator('body').innerText()).includes('端到端正職教材'));

    await clickRoute(fulltime, 'today');
    const fulltimeBeforeCount = await fulltime.locator('.record-row').count();
    await clickAction(fulltime, 'new-log');
    await fulltime.selectOption('#log-form select[name="prepId"]', { label: '端到端正職教材 · 科學實驗' });
    await fulltime.selectOption('#log-form select[name="siteType"]', 'self');
    await fulltime.fill('#log-form input[name="site"]', '北區教室');
    await fulltime.fill('#log-form input[name="present"]', '4');
    await fulltime.fill('#log-form input[name="leave"]', '0');
    await fulltime.fill('#log-form input[name="absent"]', '0');
    await fulltime.fill('#log-form input[name="makeup"]', '0');
    await fulltime.fill('#log-form input[name="trial"]', '0');
    await fulltime.fill('#log-form textarea[name="issue"]', '本堂材料分發較慢，下次課前依組別完成分裝。');
    await fulltime.selectOption('#log-form select[name="parentStatus"]', 'complete');
    await fulltime.setInputFiles('#log-form input[data-upload-category="attendance"]', imageA);
    await fulltime.setInputFiles('#log-form input[data-upload-category="learning"]', [imageA, imageB]);
    await fulltime.setInputFiles('#log-form input[data-upload-category="room"]', imageB);
    await fulltime.setInputFiles('#log-form input[data-upload-category="app"]', [imageA, imageB]);
    await fulltime.waitForFunction(() => (
      document.querySelectorAll('[data-file-items="learning"] .selected-file').length === 2
      && document.querySelectorAll('[data-file-items="app"] .selected-file').length === 2
    ), null, { timeout: 12000 });
    check('才藝正職成果與家長 APP 照片皆可複選', (
      await fulltime.locator('[data-file-items="learning"] .selected-file').count() === 2
      && await fulltime.locator('[data-file-items="app"] .selected-file').count() === 2
    ));
    await clickAction(fulltime, 'submit-log');
    await fulltime.waitForTimeout(400);
    check('才藝正職可正式送出且只新增一筆', (
      (await fulltime.locator('body').innerText()).includes('端到端正職教材')
      && await fulltime.locator('.record-row').count() === fulltimeBeforeCount + 1
    ));

    await fulltime.reload({ waitUntil: 'domcontentloaded' });
    await waitForApp(fulltime);
    await clickRoute(fulltime, 'today');
    check('才藝正職紀錄重新整理後仍存在', (await fulltime.locator('body').innerText()).includes('端到端正職教材'));
    await pageHealth(fulltime, '才藝正職完整流程', 'reload');
    await fulltime.screenshot({ path: path.join(artifactDir, 'talent-fulltime-workflow.png'), fullPage: true });
    await fulltime.close();

    const manager = trackPage(await context.newPage(), '才藝主管完整流程');
    await manager.goto(`${baseUrl}/review/talent-v2/index.html?workspace=talent-manager&reviewUser=%E6%9F%B3%E4%B8%81%E4%B8%BB%E7%AE%A1`, { waitUntil: 'domcontentloaded' });
    await waitForApp(manager);

    await clickRoute(manager, 'prep-review');
    const prepTeacher = manager.locator('[data-action="select-prep-review-teacher"]', { hasText: '皮皮老師' }).first();
    check('才藝主管可依老師選擇備課檔案', await prepTeacher.count() === 1);
    await prepTeacher.click();
    const prepRow = manager.locator('[data-action="view-prep-review"]', { hasText: '端到端才藝教材' }).first();
    check('才藝主管可看到老師的課程與兩份教材', await prepRow.count() === 1 && (await prepRow.innerText()).includes('2 份附件'));
    await prepRow.click();
    const prepDetailText = await manager.locator('.drawer').innerText();
    check('才藝主管可開啟大型文件與圖片教材', prepDetailText.includes('qa-material-16mb.pdf') && prepDetailText.includes('qa-large.jpg'));
    check('才藝備課查閱不要求主管核准或退回', !/核准|退回/.test(prepDetailText));
    await closeDrawer(manager);

    await clickRoute(manager, 'log-review');
    const talentLog = manager.locator('.record-row', { hasText: '端到端才藝教材' }).first();
    check('才藝主管可看到老師已送出的工作紀錄', await talentLog.count() === 1);
    await talentLog.locator('[data-action="view-log"]').click();
    const logDetailText = await manager.locator('.drawer').innerText();
    check('才藝主管可查看課程問題與成果附件', logDetailText.includes('本堂齒輪安裝較慢') && logDetailText.includes('學習證據'));
    await closeDrawer(manager);

    await clickRoute(manager, 'scoring');
    const fulltimeScore = manager.locator('.score-person', { hasText: 'RITA老師' }).first();
    await fulltimeScore.locator('[data-action="edit-score"]').click();
    const talentScoreInputs = manager.locator('#score-form input[type="number"]');
    for (let index = 0; index < await talentScoreInputs.count(); index += 1) {
      const input = talentScoreInputs.nth(index);
      await input.fill(await input.getAttribute('max') || '0');
    }
    await manager.fill('#score-form textarea[name="reason"]', '教學紀錄、成果附件與課程優化皆可清楚查閱。');
    const publishScore = manager.locator('#score-form input[name="published"]');
    if (await publishScore.isEnabled()) await publishScore.check();
    await manager.locator('button[form="score-form"]').click();
    await manager.waitForTimeout(300);
    check('才藝主管可儲存並公布正職 KPI', (await manager.locator('body').innerText()).includes('月度 KPI 評分已儲存'));

    await manager.reload({ waitUntil: 'domcontentloaded' });
    await waitForApp(manager);
    await clickRoute(manager, 'scoring');
    check('才藝主管評分重新整理後仍存在', (await manager.locator('.score-person', { hasText: 'RITA老師' }).innerText()).includes('已公布'));
    await pageHealth(manager, '才藝主管完整流程', 'reload');
    await manager.screenshot({ path: path.join(artifactDir, 'talent-manager-workflow.png'), fullPage: true });

    const payroll = trackPage(await context.newPage(), '才藝薪資核准流程');
    await payroll.goto(`${baseUrl}/review/talent-v2/index.html?workspace=talent-payroll&reviewUser=%E6%9F%8F%E7%BF%B0`, { waitUntil: 'domcontentloaded' });
    await waitForApp(payroll);
    await clickRoute(payroll, 'bonus-approval');
    const bonusButton = payroll.locator('[data-action="open-bonus-approval"]').first();
    check('才藝薪資端可開啟新生／續報核准', await bonusButton.count() === 1);
    await bonusButton.click();
    await payroll.locator('button[form="bonus-approval-form"]').click();
    await payroll.waitForTimeout(250);
    check('才藝薪資端可完成獎金核准', (await payroll.locator('body').innerText()).includes('新生與續報人數已核准'));
    await pageHealth(payroll, '才藝薪資核准流程', 'bonus-approval');
    await payroll.close();
    await manager.close();

    const blackPanther = await context.newPage();
    trackPage(blackPanther, '黑豹');
    await blackPanther.goto(`${baseUrl}/review/talent-v2/index.html?workspace=talent-pt&reviewUser=%E9%BB%91%E8%B1%B9%E8%80%81%E5%B8%AB`, { waitUntil: 'domcontentloaded' });
    await waitForApp(blackPanther);
    await clickRoute(blackPanther, 'pay');
    check('黑豹可看合作校固定 900 元規則', (await blackPanther.locator('body').innerText()).includes('每堂固定 900'));
    check('黑豹不要求家長 APP 證據', !(await blackPanther.locator('body').innerText()).includes('家長 APP 發布證據尚未完成'));
    await blackPanther.close();
  } finally {
    await context.close();
  }
}

async function anqinWorkflow(browser) {
  const label = '安親完整流程';
  const { context, page } = await createPage(browser, { width: 390, height: 844 }, label);
  try {
    await page.goto(`${baseUrl}/review/anqin-v2/qa-harness.html?nickname=%E6%B1%9F%E6%B1%9F%E8%80%81%E5%B8%AB&role=teacher&department=%E5%8C%97%E5%8D%80%E6%95%99%E5%AE%A4&reset=1`, { waitUntil: 'domcontentloaded' });
    await waitForApp(page);
    await page.waitForTimeout(1200);
    const initialDialogClose = page.locator('#dialog-root button[data-action="close-dialog"]');
    if (await initialDialogClose.count()) {
      await initialDialogClose.last().click();
      await page.waitForSelector('#dialog-root .dialog', { state: 'detached' });
    }

    await clickAction(page, 'open-activity');
    await page.selectOption('#course-prep-type', '安親課業指導');
    await page.fill('#course-prep-title', '端到端安親教材');
    await page.fill('#course-prep-note', '直式加減法練習單');
    await page.setInputFiles('#activity-prep-files', [largePdfFile, largeImage]);
    await page.waitForFunction(() => {
      const input = document.querySelector('#activity-prep-files');
      return input && !input.disabled && document.querySelectorAll('#prep-file-list .prep-file-row, #prep-file-list .simple-prep-file').length >= 2;
    }, null, { timeout: 30000 });
    check('安親備課可上傳 16 MB 文件並自動壓縮大型圖片', (await page.locator('#prep-file-list').innerText()).includes('qa-material-16mb.pdf'));
    await page.locator('button[form="course-prep-form"]').click();
    await page.waitForTimeout(450);
    await clickRoute(page, 'plans');
    check('安親備課可儲存且至少一份教材', (await page.locator('body').innerText()).includes('端到端安親教材'));
    const prepLibraryItem = page.locator('.prep-library-item', { hasText: '端到端安親教材' }).first();
    check('老師備課檔案以單一緊湊項目呈現', await prepLibraryItem.count() === 1 && (await prepLibraryItem.boundingBox())?.height < 180);
    check('老師備課摘要集中顯示類型、附件、使用次數與更新日', /安親課業指導[\s\S]*2 份附件[\s\S]*尚未使用[\s\S]*更新/.test(await prepLibraryItem.innerText()));
    await page.screenshot({ path: path.join(artifactDir, 'anqin-prep-library-mobile.png'), fullPage: true });
    await prepLibraryItem.click();
    check('老師可隨時開啟備課檔案查看與下載', (await page.locator('.drawer-panel').innerText()).includes('qa-material-16mb.pdf') && await page.locator('[data-action="edit-activity"]').count() === 1);
    await closeDrawer(page);

    await clickRoute(page, 'today');
    const academicButton = page.locator('[data-action="open-activity"][data-track="academic"]').first();
    await academicButton.click();
    const tutoringChoice = page.locator('[data-action="open-activity"][data-type="tutoring"]');
    if (await tutoringChoice.count()) await tutoringChoice.first().click();
    const prepSourceValue = await page.locator('#activity-prep-source option', { hasText: '端到端安親教材' }).getAttribute('value');
    await page.selectOption('#activity-prep-source', prepSourceValue);
    check('安親選擇備課後自動帶入課程名稱', await page.inputValue('#activity-title') === '端到端安親教材');
    await page.fill('#activity-student-resonance', '孩子在用色筆標出進位位置時最有反應。');
    await page.fill('#activity-prep-changes', '下次先加入一題共同示範，再讓孩子獨立練習。');
    await page.locator('button[form="activity-form"]').click();
    await page.waitForTimeout(350);
    check('安親課業指導可只填課後備課回饋', (await page.locator('body').innerText()).includes('端到端安親教材'));

    const activityCard = page.locator('article', { hasText: '端到端安親教材' }).first();
    const newEvidence = activityCard.locator('[data-action="new-evidence"]');
    if (await newEvidence.count()) {
      await newEvidence.click();
    } else {
      await activityCard.locator('[data-action="view-activity"]').first().click();
      await clickAction(page, 'new-evidence');
    }
    await page.setInputFiles('#evidence-file', [imageA, largeImage]);
    await page.waitForFunction(() => document.querySelectorAll('#evidence-attachment-list .evidence-attachment-item').length === 2, null, { timeout: 30000 }).catch(() => {});
    check('安親成果證據可一次上傳多張', await page.locator('#evidence-attachment-list .evidence-attachment-item').count() === 2);
    await page.locator('#evidence-attachment-list [data-action="remove-evidence-attachment"]').first().click();
    check('安親成果照片選錯可逐張移除', await page.locator('#evidence-attachment-list .evidence-attachment-item').count() === 1);
    await page.setInputFiles('#evidence-file', imageA);
    await page.waitForFunction(() => document.querySelectorAll('#evidence-attachment-list .evidence-attachment-item').length === 2, null, { timeout: 12000 });
    check('安親成果照片移除後可重新加入且其餘照片保留', await page.locator('#evidence-attachment-list .evidence-attachment-item').count() === 2);
    await page.locator('.drawer-body').evaluate((drawer, selector) => {
      const target = drawer.querySelector(selector);
      drawer.scrollTop = Math.max(0, (target?.offsetTop || drawer.scrollHeight) - drawer.clientHeight / 2);
    }, '#evidence-privacy');
    await page.waitForTimeout(120);
    await page.locator('label[for="evidence-privacy"]').click();
    await page.locator('button[form="evidence-form"]').click();
    await page.waitForTimeout(500);
    const savedActivityText = await page.locator('article', { hasText: '端到端安親教材' }).first().innerText();
    check('安親上傳成果後不再顯示缺成果證據', !savedActivityText.includes('缺成果證據') && !savedActivityText.includes('待補：成果證據'), savedActivityText);

    await clickRoute(page, 'today');
    check('安親今日流程已移除學生追蹤入口', await page.locator('[data-action="today-tab"][data-tab="students"], [data-action="open-student-case"]').count() === 0);
    await page.locator('[data-action="today-tab"][data-tab="parents"]').click();
    await page.locator('[data-action="set-parent-status"][data-status="handoff"]').click();
    await page.locator('input[data-change="parent-handoff-confirmed"]').check();
    await page.fill('#parent-handoff-note', '這段切換後不應保存');
    await page.locator('[data-action="set-parent-status"][data-status="recorded"]').click();
    await page.locator('[data-action="set-parent-status"][data-status="handoff"]').click();
    check('安親親師模式切換會清除隱藏的交接確認與備註', !(await page.locator('input[data-change="parent-handoff-confirmed"]').isChecked()) && await page.inputValue('#parent-handoff-note') === '');
    await page.locator('input[data-change="parent-handoff-confirmed"]').check();
    check('安親無重要事項只需確認門口交接', !(await page.locator('#parent-handoff-note').getAttribute('required')));
    await page.locator('[data-action="set-parent-status"][data-status="recorded"]').click();
    await clickAction(page, 'open-contact');
    await page.selectOption('#contact-student', { index: 1 });
    await page.selectOption('#contact-channel', '門口面談');
    await page.fill('#contact-summary', '今天計算時漏看進位，老師示範圈出數字後已能自行檢查。');
    await page.fill('#contact-decision', '家長了解並同意今晚練習一題，明天再由老師觀察。');
    await page.locator('#toast-root').evaluate(root => root.replaceChildren());
    await page.locator('.drawer-body').evaluate(drawer => { drawer.scrollTop = 0; });
    await page.waitForTimeout(250);
    await page.screenshot({ path: path.join(artifactDir, 'anqin-parent-contact-390.png') });
    check('安親親師溝通只保留兩段必要內容', await page.locator('#contact-form textarea').count() === 2
      && await page.locator('#contact-status, #contact-date, [name="nextAction"]').count() === 0);
    await page.locator('button[form="contact-form"]').click();
    await page.waitForTimeout(350);
    const parentSectionText = await page.locator('.panel', { hasText: '親師溝通' }).first().innerText();
    check('安親親師溝通儲存後可立即讀回兩段內容', parentSectionText.includes('漏看進位') && parentSectionText.includes('今晚練習一題'));
    check('親師溝通不會自動增加追蹤待辦', await page.evaluate(() => Object.keys(window.__KPI_QA_CLOUD__?.store?.tasks || {}).every(id => !/^v2_contact_/.test(id))));

    await page.locator('[data-action="today-tab"][data-tab="operations"]').click();
    await page.locator('label:has(input[name="status_classroom"][value="exception"])').click({ force: true });
    await page.fill('#operation-action-classroom', '測試異常內容，切回正常後必須清除。');
    await page.locator('label:has(input[name="status_classroom"][value="normal"])').click({ force: true });
    check('安親班務切回正常會清除隱藏的異常內容', await page.evaluate(() => {
      const input = document.querySelector('#operation-action-classroom');
      return Boolean(input?.closest('.operation-action-field')?.hidden && input.value === '' && !input.required);
    }));
    for (const key of ['classroom', 'tools', 'trash', 'toilet']) {
      await page.setInputFiles(`#operation-photo-${key}`, key === 'classroom' || key === 'trash' ? imageA : imageB);
    }
    await page.locator('#operations-form button[type="submit"]').click();
    await page.waitForTimeout(600);
    check('安親班務四張照片可上傳並送出', (await page.locator('body').innerText()).includes('4/4'));

    await clickRoute(page, 'tasks');
    await clickAction(page, 'open-task');
    await page.fill('#task-title', '確認明日教材已備妥');
    await page.fill('#task-due', tomorrow);
    await page.locator('button[form="task-form"]').click();
    await page.waitForFunction(() => Object.keys(window.__KPI_QA_CLOUD__?.store?.tasks || {}).length > 0, null, { timeout: 12000 });
    await page.evaluate(() => {
      const original = window.API.saveSelfTask;
      let shouldFail = true;
      window.API.saveSelfTask = async (...args) => {
        if (shouldFail) {
          shouldFail = false;
          return { ok: false, error: '驗收模擬雲端中斷' };
        }
        return original(...args);
      };
    });
    const taskToggle = page.locator('.task-complete-control input[data-change="toggle-task"]').first();
    await taskToggle.click({ force: true });
    await page.waitForTimeout(450);
    check('安親待辦事項雲端失敗時會回復未完成，不會假裝成功', await page.locator('.task-complete-control input[data-change="toggle-task"]').first().isChecked() === false && (await page.locator('body').innerText()).includes('事項未更新'));
    await page.locator('.task-complete-control input[data-change="toggle-task"]').first().click({ force: true });
    await page.waitForTimeout(450);
    check('安親待辦事項重試成功後才真正完成', (await page.locator('body').innerText()).includes('0 項待完成'));
    await clickRoute(page, 'today');

    await page.locator('[data-action="today-tab"][data-tab="submit"]').click();
    const submit = page.locator('[data-action="submit-daily"]');
    check('安親完成條件後送出按鈕可用', await submit.isEnabled());
    await submit.click();
    await page.waitForTimeout(900);
    check('安親送出後有明確成功提示', /已送出|送出完成|正式送出成功/.test(await page.locator('body').innerText()));
    const submittedParentData = await page.evaluate(() => {
      const log = Object.values(window.__KPI_QA_CLOUD__?.store?.logs || {})[0] || {};
      return { kpi5: log.kpi5_data || {}, snapshot: log.kpi6_data?.v2_snapshot || {} };
    });
    check('安親親師溝通兩段內容已寫入雲端日報', String(submittedParentData.kpi5.parent_summary || '').includes('漏看進位')
      && String(submittedParentData.kpi5.parent_summary || '').includes('今晚練習一題'));
    check('安親新日報沒有寫入退役學生追蹤欄位', submittedParentData.kpi5.student_special === ''
      && Array.isArray(submittedParentData.kpi5.special_students) && submittedParentData.kpi5.special_students.length === 0);
    check('安親雲端快照保存親師內容且不產生學生追蹤', submittedParentData.snapshot.submission?.contactSnapshots?.length === 1
      && submittedParentData.snapshot.submission?.studentCaseSnapshots?.length === 0);

    await page.reload({ waitUntil: 'domcontentloaded' });
    await waitForApp(page);
    check('安親重新整理後紀錄仍存在', (await page.locator('body').innerText()).includes('端到端安親教材'));
    await clickRoute(page, 'records');
    check('安親老師可從我的紀錄查看過去紀錄', /我的紀錄|端到端安親教材/.test(await page.locator('body').innerText()));
    await pageHealth(page, label, 'reload');
    await page.screenshot({ path: path.join(artifactDir, 'anqin-workflow.png'), fullPage: true });

    await page.goto(`${baseUrl}/review/anqin-v2/qa-harness.html?nickname=%E5%B0%8F%E9%AD%9A%E4%B8%BB%E7%AE%A1&role=manager&department=%E5%8C%97%E5%8D%80%E6%95%99%E5%AE%A4`, { waitUntil: 'domcontentloaded' });
    await waitForApp(page);
    await page.waitForTimeout(1800);

    await clickRoute(page, 'reviews');
    await page.waitForFunction(() => document.querySelectorAll('[data-action="open-review"]').length > 0, null, { timeout: 12000 });
    const reviewButton = page.locator('[data-action="open-review"]').first();
    check('安親主管可看到老師正式送出的日報', await reviewButton.count() === 1);
    await reviewButton.click();
    await clickAction(page, 'accept-submission');
    await page.waitForTimeout(450);
    check('安親主管可完成日報審查', (await page.locator('body').innerText()).includes('審查已完成'));

    await clickRoute(page, 'evidence');
    await page.waitForFunction(() => document.querySelectorAll('[data-action="inspect-evidence"]').length > 0, null, { timeout: 12000 });
    await page.waitForFunction(() => {
      const images = Array.from(document.querySelectorAll('.evidence-card img'));
      return images.length > 0 && images.every(image => image.complete && image.naturalWidth > 0);
    }, null, { timeout: 12000 });
    check('安親雲端成果照片跨主管帳號讀回後不是空白', await page.locator('.evidence-card img').count() > 0);
    await page.locator('[data-action="inspect-evidence"]').first().click();
    const evidenceDrawerText = await page.locator('.drawer-panel').innerText();
    check('安親主管可查看同筆多張成果照片', evidenceDrawerText.includes('qa-red.png') && evidenceDrawerText.includes('qa-large.bmp'));
    await clickAction(page, 'accept-evidence');
    await page.waitForTimeout(450);
    check('安親主管可採認成果證據', (await page.locator('body').innerText()).includes('審查已完成'));

    await clickRoute(page, 'operations-review');
    const operationReview = page.locator('[data-action="review-operation"]:not([disabled])').first();
    await operationReview.waitFor({ state: 'visible', timeout: 12000 });
    await operationReview.click();
    await clickAction(page, 'accept-operation');
    await page.waitForTimeout(450);
    check('安親主管可通過四項班務照片稽核', (await page.locator('body').innerText()).includes('審查已完成'));

    await clickRoute(page, 'evaluations');
    await page.waitForSelector('form[data-form="manager-evaluation-selection"]', { timeout: 12000 });
    await page.selectOption('form[data-form="manager-evaluation-selection"] select[name="teacher"]', { label: '江江老師 · 北區教室' });
    await page.locator('form[data-form="manager-evaluation-selection"] button[type="submit"]').click();
    await page.waitForSelector('#manager-evaluation-form', { timeout: 12000 });
    const managerScoreInputs = page.locator('#manager-evaluation-form input[data-input="manager-eval-score"]');
    for (let index = 0; index < await managerScoreInputs.count(); index += 1) {
      const input = managerScoreInputs.nth(index);
      await input.fill(await input.getAttribute('max') || '0');
    }
    await page.fill('#manager-eval-comment', '本月工作紀錄、照片與後續調整皆可清楚查閱。');
    await page.locator('[data-action="save-manager-evaluation"][data-status="submitted"]').click();
    await page.waitForTimeout(650);
    check('安親主管可完成月度評核', (await page.locator('body').innerText()).includes('月度評核已完成'));

    await clickRoute(page, 'cloud-reports');
    await page.waitForTimeout(900);
    check('小魚可在雲端日報看到北區老師資料夾', (await page.locator('body').innerText()).includes('江江'));
    await pageHealth(page, '安親主管完整流程', 'cloud-reports');
    await page.screenshot({ path: path.join(artifactDir, 'anqin-manager-workflow.png'), fullPage: true });

    await page.goto(`${baseUrl}/review/anqin-v2/qa-harness.html?nickname=%E6%B1%9F%E6%B1%9F%E8%80%81%E5%B8%AB&role=teacher&department=%E5%8C%97%E5%8D%80%E6%95%99%E5%AE%A4`, { waitUntil: 'domcontentloaded' });
    await waitForApp(page);
    await clickRoute(page, 'evaluation');
    await page.waitForTimeout(700);
    check('安親老師可直接看到主管最新已完成評核', (await page.locator('body').innerText()).includes('本月工作紀錄、照片與後續調整'));
  } finally {
    await context.close();
  }
}

async function main() {
  const browser = await chromium.launch({ headless: true, executablePath: chromePath, args: ['--no-sandbox'] });
  try {
    const only = String(process.env.KPI_QA_ONLY || '').trim();
    const anqinSurface = (key, nickname, role, department) => ({
      key,
      label: `${nickname}／${role === 'manager' ? '安親主管' : '安親老師'}`,
      url: `/review/anqin-v2/qa-harness.html?nickname=${encodeURIComponent(nickname)}&role=${role}&department=${encodeURIComponent(department)}`,
    });
    const talentSurface = (key, nickname, workspace) => ({
      key,
      label: `${nickname}／${workspace}`,
      url: `/review/talent-v2/index.html?workspace=${workspace}&reviewUser=${encodeURIComponent(nickname)}`,
    });
    const adminSurface = (key, nickname, workspace) => ({
      key,
      label: `${nickname}／${workspace === 'admin-marketing' ? '行政美宣' : '行政主管'}`,
      url: `/review/admin-marketing-v1/index.html?workspace=${workspace}&reviewUser=${encodeURIComponent(nickname)}`,
    });
    const surfaces = [
      anqinSurface('anqin-songshu', '松鼠老師', 'teacher', '東橋教室'),
      anqinSurface('anqin-hongdou', '紅豆老師', 'teacher', '東橋教室'),
      anqinSurface('anqin-yangyang', '羊羊老師', 'teacher', '東橋教室'),
      anqinSurface('anqin-jiangjiang', '江江老師', 'teacher', '北區教室'),
      anqinSurface('anqin-xiaoming', '小明老師', 'teacher', '北區教室'),
      anqinSurface('anqin-suansuan', '酸酸主管', 'manager', '東橋教室'),
      anqinSurface('anqin-xiaoyu', '小魚主管', 'manager', '北區教室'),
      talentSurface('talent-haohao', '浩浩老師', 'talent-fulltime'),
      talentSurface('talent-rita', 'RITA老師', 'talent-fulltime'),
      talentSurface('talent-maomao', '毛毛老師', 'talent-fulltime'),
      talentSurface('talent-pipi', '皮皮老師', 'talent-pt'),
      talentSurface('talent-hongdou', '紅豆老師', 'talent-pt'),
      talentSurface('talent-xiaoming', '小明老師', 'talent-pt'),
      talentSurface('talent-heibao', '黑豹老師', 'talent-pt'),
      talentSurface('talent-liuding', '柳丁主管', 'talent-manager'),
      talentSurface('talent-bohan', '柏翰', 'talent-payroll'),
      talentSurface('talent-xiaoyu', '小魚主管', 'talent-payroll'),
      adminSurface('admin-pipi', '皮皮老師', 'admin-marketing'),
      adminSurface('admin-xiaoyu', '小魚主管', 'admin-marketing-manager'),
      adminSurface('admin-bohan', '柏翰', 'admin-marketing-manager'),
    ];
    if (!only || only === 'routes') {
      for (const surface of surfaces) await auditRoutes(browser, surface, { width: 390, height: 844 });
      for (const surface of surfaces) await auditRoutes(browser, surface, { width: 1440, height: 900 });
    }
    for (const [name, workflow] of [
      ['行政完整流程可執行', adminWorkflow],
      ['才藝 PT 完整流程可執行', talentWorkflow],
      ['安親完整流程可執行', anqinWorkflow],
    ]) {
      const workflowKey = name.startsWith('行政') ? 'admin' : name.startsWith('才藝') ? 'talent' : 'anqin';
      if (only && only !== workflowKey) continue;
      try {
        await workflow(browser);
      } catch (error) {
        check(name, false, error.stack || error.message);
      }
    }
  } finally {
    await browser.close();
  }

  report.finishedAt = new Date().toISOString();
  check('瀏覽器執行期間無 JavaScript／本機資源錯誤', report.browserErrors.length === 0, JSON.stringify(report.browserErrors));
  const reportPath = path.join(artifactDir, 'report.json');
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({
    passed: report.failures.length === 0,
    checks: report.checks.length,
    failures: report.failures,
    browserErrors: report.browserErrors,
    externalWarnings: report.externalWarnings,
    reportPath,
  }, null, 2));
  if (report.failures.length) process.exitCode = 1;
}

main().catch(error => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
