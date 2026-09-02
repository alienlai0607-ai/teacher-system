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

fs.mkdirSync(artifactDir, { recursive: true });
const imageA = path.join(artifactDir, 'qa-red.png');
const imageB = path.join(artifactDir, 'qa-blue.png');
const pdfFile = path.join(artifactDir, 'qa-material.pdf');
fs.writeFileSync(imageA, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFElEQVR42mP8z8Dwn4GBgYGJAQoAHgQCAcR3O98AAAAASUVORK5CYII=', 'base64'));
fs.writeFileSync(imageB, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFUlEQVR42mNkYPj/n4GBgYGBiQEKAB4EAgFKhhF4AAAAAElFTkSuQmCC', 'base64'));
fs.writeFileSync(pdfFile, '%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n');

const report = {
  startedAt: new Date().toISOString(),
  baseUrl,
  checks: [],
  failures: [],
  browserErrors: [],
  routeAudits: [],
};

function check(name, passed, detail = '') {
  report.checks.push({ name, passed: Boolean(passed), detail });
  if (!passed) report.failures.push({ name, detail });
}

async function createPage(browser, viewport, label) {
  const context = await browser.newContext({
    viewport,
    locale: 'zh-TW',
    timezoneId: 'Asia/Taipei',
    serviceWorkers: 'block',
  });
  const page = await context.newPage();
  page.on('pageerror', error => report.browserErrors.push({ label, type: 'pageerror', message: error.message }));
  page.on('console', message => {
    if (message.type() === 'error') report.browserErrors.push({ label, type: 'console', message: message.text() });
  });
  page.on('requestfailed', request => {
    const url = request.url();
    if (url.startsWith(baseUrl)) report.browserErrors.push({ label, type: 'requestfailed', message: `${url}: ${request.failure()?.errorText || ''}` });
  });
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
    await clickAction(page, 'open-work-item');
    await page.selectOption('#work-category', 'admin');
    await page.fill('#work-title', '端到端儲存驗收');
    await page.fill('#completed-today', '已完成資料核對並確認附件可以重新讀取');
    await page.selectOption('#work-status', 'completed');
    await page.setInputFiles('#work-evidence', [imageA, imageB]);
    await page.locator('#work-item-form button[type="submit"]').click();
    await page.waitForTimeout(250);
    check('行政可新增完成工作', (await page.locator('body').innerText()).includes('端到端儲存驗收'));

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
    await page.locator('#trial-form button[type="submit"]').click();
    await page.waitForTimeout(250);
    check('首次報名不需手填追蹤即可進入 50 元待審', (await page.locator('body').innerText()).includes('50 元待主管確認'));

    await page.reload({ waitUntil: 'domcontentloaded' });
    await waitForApp(page);
    await clickRoute(page, 'today');
    check('行政工作重新整理後仍存在', (await page.locator('body').innerText()).includes('端到端儲存驗收'));
    await clickRoute(page, 'trials');
    check('三筆試上重新整理後仍存在', await page.locator('.trial-row', { hasText: '測試學生' }).count() === 3);
    check('首報獎金重新整理後仍存在', (await page.locator('body').innerText()).includes('50 元待主管確認'));
    await pageHealth(page, label, 'reload');
    await page.screenshot({ path: path.join(artifactDir, 'admin-workflow.png'), fullPage: true });
  } finally {
    await context.close();
  }
}

async function talentWorkflow(browser) {
  const label = '才藝 PT 完整流程';
  const { context, page } = await createPage(browser, { width: 390, height: 844 }, label);
  try {
    await page.goto(`${baseUrl}/review/talent-v2/index.html?workspace=talent-pt&reviewUser=%E7%9A%AE%E7%9A%AE%E8%80%81%E5%B8%AB`, { waitUntil: 'domcontentloaded' });
    await waitForApp(page);
    await page.evaluate(() => localStorage.clear());
    await page.reload({ waitUntil: 'domcontentloaded' });
    await waitForApp(page);

    await clickRoute(page, 'prep');
    await clickAction(page, 'new-prep');
    await page.selectOption('#prep-form select[name="courseType"]', '樂高小創客');
    await page.fill('#prep-form input[name="courseName"]', '端到端才藝教材');
    await page.fill('#prep-form textarea[name="notes"]', '本堂使用齒輪與簡易馬達材料');
    await page.setInputFiles('#prep-form input[data-upload-category="prep"]', [pdfFile, imageA]);
    await clickAction(page, 'save-prep');
    await page.waitForTimeout(250);
    check('才藝備課可一次加入多份教材', (await page.locator('body').innerText()).includes('端到端才藝教材'));

    await clickRoute(page, 'today');
    const beforeCount = await page.locator('.record-row').count();
    await clickAction(page, 'new-log');
    await page.fill('#log-form input[name="courseName"]', '端到端才藝課程');
    await page.fill('#log-form input[name="expected"]', '5');
    await page.fill('#log-form input[name="present"]', '5');
    await page.fill('#log-form input[name="leave"]', '0');
    await page.fill('#log-form input[name="absent"]', '0');
    await page.fill('#log-form input[name="makeup"]', '0');
    await page.fill('#log-form input[name="trial"]', '0');
    await page.selectOption('#log-form select[name="prepId"]', { label: '端到端才藝教材 · 樂高小創客' });
    await page.fill('#log-form textarea[name="issue"]', '本堂齒輪安裝較慢，下次先依顏色分盒並示範卡榫方向。');
    await page.check('#log-form input[name="roomDone"]');
    await page.setInputFiles('#log-form input[data-upload-category="attendance"]', imageA);
    await page.setInputFiles('#log-form input[data-upload-category="learning"]', [imageA, imageB]);
    await page.setInputFiles('#log-form input[data-upload-category="room"]', imageB);
    check('才藝成果照片可一次多選', await page.locator('[data-file-items="learning"] .selected-file').count() === 2);
    await clickAction(page, 'submit-log');
    await page.waitForTimeout(400);
    const pageText = await page.locator('body').innerText();
    check('才藝 PT 可正式送出', pageText.includes('端到端才藝課程'));
    check('才藝送出不再顯示 completed 內部欄位', !/\bcompleted\b/i.test(pageText));
    check('才藝送出只新增一筆', await page.locator('.record-row').count() === beforeCount + 1);

    await page.reload({ waitUntil: 'domcontentloaded' });
    await waitForApp(page);
    await clickRoute(page, 'today');
    check('才藝紀錄重新整理後仍存在', (await page.locator('body').innerText()).includes('端到端才藝課程'));
    await pageHealth(page, label, 'reload');
    await page.screenshot({ path: path.join(artifactDir, 'talent-pt-workflow.png'), fullPage: true });

    const blackPanther = await context.newPage();
    blackPanther.on('pageerror', error => report.browserErrors.push({ label: '黑豹', type: 'pageerror', message: error.message }));
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
    await page.setInputFiles('#activity-prep-files', [pdfFile, imageA]);
    await page.locator('button[form="course-prep-form"]').click();
    await page.waitForTimeout(450);
    await clickRoute(page, 'plans');
    check('安親備課可儲存且至少一份教材', (await page.locator('body').innerText()).includes('端到端安親教材'));

    await clickRoute(page, 'today');
    const academicButton = page.locator('[data-action="open-activity"][data-track="academic"]').first();
    await academicButton.click();
    const tutoringChoice = page.locator('[data-action="open-activity"][data-type="tutoring"]');
    if (await tutoringChoice.count()) await tutoringChoice.first().click();
    await page.fill('#activity-title', '直式加減法');
    const prepSourceValue = await page.locator('#activity-prep-source option', { hasText: '端到端安親教材' }).getAttribute('value');
    await page.selectOption('#activity-prep-source', prepSourceValue);
    await page.fill('#activity-student-resonance', '孩子在用色筆標出進位位置時最有反應。');
    await page.fill('#activity-prep-changes', '下次先加入一題共同示範，再讓孩子獨立練習。');
    await page.locator('button[form="activity-form"]').click();
    await page.waitForTimeout(350);
    check('安親課業指導可只填課後備課回饋', (await page.locator('body').innerText()).includes('直式加減法'));

    const activityCard = page.locator('article', { hasText: '直式加減法' }).first();
    const newEvidence = activityCard.locator('[data-action="new-evidence"]');
    if (await newEvidence.count()) {
      await newEvidence.click();
    } else {
      await activityCard.locator('[data-action="view-activity"]').first().click();
      await clickAction(page, 'new-evidence');
    }
    await page.setInputFiles('#evidence-file', [imageA, imageB]);
    await page.waitForFunction(() => document.querySelectorAll('#evidence-attachment-list .evidence-attachment-item').length === 2, null, { timeout: 8000 }).catch(() => {});
    check('安親成果證據可一次上傳多張', await page.locator('#evidence-attachment-list .evidence-attachment-item').count() === 2);
    await page.fill('#evidence-title', '孩子課後練習成果');
    await page.locator('.drawer-body').evaluate((drawer, selector) => {
      const target = drawer.querySelector(selector);
      drawer.scrollTop = Math.max(0, (target?.offsetTop || drawer.scrollHeight) - drawer.clientHeight / 2);
    }, '#evidence-privacy');
    await page.waitForTimeout(120);
    await page.locator('label[for="evidence-privacy"]').click();
    await page.locator('button[form="evidence-form"]').click();
    await page.waitForTimeout(500);
    const savedActivityText = await page.locator('article', { hasText: '直式加減法' }).first().innerText();
    check('安親上傳成果後不再顯示缺成果證據', !savedActivityText.includes('缺成果證據') && !savedActivityText.includes('待補：成果證據'), savedActivityText);

    await clickRoute(page, 'today');
    await page.locator('[data-action="today-tab"][data-tab="students"]').click();
    await page.locator('input[data-change="confirm-no-student"]').check();
    await page.locator('[data-action="today-tab"][data-tab="parents"]').click();
    await page.locator('[data-action="set-parent-status"][data-status="handoff"]').click();
    await page.locator('input[data-change="parent-handoff-confirmed"]').check();
    await page.fill('#parent-handoff-note', '今日無重大事項，已在門口親自將孩子交給家長。');

    await page.locator('[data-action="today-tab"][data-tab="operations"]').click();
    for (const key of ['classroom', 'tools', 'trash', 'toilet']) {
      await page.setInputFiles(`#operation-photo-${key}`, key === 'classroom' || key === 'trash' ? imageA : imageB);
    }
    await page.locator('#operations-form button[type="submit"]').click();
    await page.waitForTimeout(600);
    check('安親班務四張照片可上傳並送出', (await page.locator('body').innerText()).includes('4/4'));

    await page.locator('[data-action="today-tab"][data-tab="submit"]').click();
    const submit = page.locator('[data-action="submit-daily"]');
    check('安親完成條件後送出按鈕可用', await submit.isEnabled());
    await submit.click();
    await page.waitForTimeout(900);
    check('安親送出後有明確成功提示', /已送出|送出完成|正式送出成功/.test(await page.locator('body').innerText()));

    await page.reload({ waitUntil: 'domcontentloaded' });
    await waitForApp(page);
    check('安親重新整理後紀錄仍存在', (await page.locator('body').innerText()).includes('直式加減法'));
    await clickRoute(page, 'records');
    check('安親老師可從我的紀錄查看過去紀錄', /我的紀錄|直式加減法/.test(await page.locator('body').innerText()));
    await pageHealth(page, label, 'reload');
    await page.screenshot({ path: path.join(artifactDir, 'anqin-workflow.png'), fullPage: true });
  } finally {
    await context.close();
  }
}

async function main() {
  const browser = await chromium.launch({ headless: true, executablePath: chromePath, args: ['--no-sandbox'] });
  try {
    const only = String(process.env.KPI_QA_ONLY || '').trim();
    const surfaces = [
      { key: 'anqin-teacher', label: '安親老師', url: '/review/anqin-v2/qa-harness.html?nickname=%E6%B1%9F%E6%B1%9F%E8%80%81%E5%B8%AB&role=teacher&department=%E5%8C%97%E5%8D%80%E6%95%99%E5%AE%A4' },
      { key: 'anqin-manager', label: '安親主管', url: '/review/anqin-v2/qa-harness.html?nickname=%E5%B0%8F%E9%AD%9A%E4%B8%BB%E7%AE%A1&role=manager&department=%E5%8C%97%E5%8D%80%E6%95%99%E5%AE%A4' },
      { key: 'talent-pt', label: '才藝 PT', url: '/review/talent-v2/index.html?workspace=talent-pt&reviewUser=%E7%B4%85%E8%B1%86%E8%80%81%E5%B8%AB' },
      { key: 'talent-fulltime', label: '才藝正職', url: '/review/talent-v2/index.html?workspace=talent-fulltime&reviewUser=RITA%E8%80%81%E5%B8%AB' },
      { key: 'talent-manager', label: '才藝主管', url: '/review/talent-v2/index.html?workspace=talent-manager&reviewUser=%E6%9F%B3%E4%B8%81%E4%B8%BB%E7%AE%A1' },
      { key: 'talent-payroll', label: '才藝薪資', url: '/review/talent-v2/index.html?workspace=talent-payroll&reviewUser=%E6%9F%8F%E7%BF%B0' },
      { key: 'admin-worker', label: '行政美宣', url: '/review/admin-marketing-v1/index.html?workspace=admin-marketing&reviewUser=%E7%9A%AE%E7%9A%AE%E8%80%81%E5%B8%AB' },
      { key: 'admin-manager', label: '行政主管', url: '/review/admin-marketing-v1/index.html?workspace=admin-marketing-manager&reviewUser=%E5%B0%8F%E9%AD%9A%E4%B8%BB%E7%AE%A1' },
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
    reportPath,
  }, null, 2));
  if (report.failures.length) process.exitCode = 1;
}

main().catch(error => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
