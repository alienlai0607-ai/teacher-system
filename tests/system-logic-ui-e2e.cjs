const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const { harness } = require('./system-logic-audit.test.cjs');
const root = path.resolve(__dirname, '..');
const base = process.env.KPI_QA_BASE_URL || 'http://127.0.0.1:8791';
const output = '/private/tmp/kpi-system-logic-ui';
fs.mkdirSync(output, { recursive: true });

async function main() {
  const service = harness();
  const { c, request } = service;
  c.appendRow('Users', { nickname: '江江', role: 'teacher', department: '北區教室', status: 'active', email: 'qa-jiang@example.invalid', work_assignments: [] });
  const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  let releaseSave;
  const saveGate = new Promise(resolve => { releaseSave = resolve; });
  await page.exposeFunction('auditTaskRequest', async payload => {
    if (payload.action === 'saveSelfTask') await saveGate;
    return request('江江', payload.action, { ...payload, nickname: '江江' });
  });
  // Exercise the real signed router and task/Sheet logic from real UI actions.
  // Only unrelated APIs remain in the existing isolated QA fixture.
  await page.route('**/qa-harness.js*', route => route.fulfill({ contentType: 'application/javascript', body: fs.readFileSync(path.join(root, 'review/anqin-v2/qa-harness.js'), 'utf8') + `
    (() => {
      const fixtureFetch = window.fetch;
      window.fetch = async (input, init) => {
        const body = init?.body ? JSON.parse(init.body) : {};
        if (['saveSelfTask', 'listTasks', 'deleteSelfTask'].includes(body.action)) {
          return new Response(JSON.stringify(await window.auditTaskRequest(body)), { headers: { 'Content-Type': 'application/json' } });
        }
        return fixtureFetch(input, init);
      };
    })();` }));
  const clickRoute = async route => {
    const button = page.locator(`[data-route="${route}"]`).filter({ visible: true }).first();
    if (!await button.count()) await page.locator('[data-action="open-more-nav"]').filter({ visible: true }).first().click();
    await page.locator(`[data-route="${route}"]`).filter({ visible: true }).first().click();
  };
  try {
    await page.goto(base + '/review/anqin-v2/qa-harness.html?nickname=' + encodeURIComponent('江江老師') + '&role=teacher&department=' + encodeURIComponent('北區教室') + '&reset=1');
    await page.locator('#app [data-route="today"]').filter({ visible: true }).first().waitFor();
    const close = page.locator('#dialog-root [data-action="close-dialog"]');
    if (await close.count()) await close.last().click();
    await clickRoute('tasks');
    await page.locator('[data-action="open-task"]').first().click();
    await page.fill('#task-title', 'QA cross-device task');
    await page.locator('button[form="task-form"]').click();
    await page.getByText('事項已暫存，正在同步雲端…', { exact: true }).waitFor();
    assert.equal(await page.getByText('事項已新增並儲存雲端', { exact: true }).count(), 0);
    releaseSave();
    await page.getByText('事項已新增並儲存雲端', { exact: true }).waitFor();
    await assertEventually(() => c.sheetToObjects('Tasks').some(t => t.title === 'QA cross-device task'));
    const initial = c.sheetToObjects('Tasks').find(t => t.title === 'QA cross-device task');
    const checkbox = () => page.locator(`[data-change="toggle-task"][data-task-id="${initial.task_id}"]`);
    await checkbox().click();
    await assertEventually(() => c.findObject('Tasks', 'task_id', initial.task_id).status === 'done');
    await page.locator('[data-filter-group="tasks"][data-filter-value="done"]').click();
    await checkbox().waitFor();
    assert.equal(await checkbox().isChecked(), true);

    const done = c.findObject('Tasks', 'task_id', initial.task_id);
    const remote = request('江江', 'saveSelfTask', { task: { id: initial.task_id, title: 'QA latest title', dueDate: done.due_date, status: 'done', source: done.detail, cloudUpdatedAt: done.updated_at } });
    assert.equal(remote.ok, true);
    await checkbox().click();
    await page.getByText('事項未更新：事項已在其他裝置更新', { exact: false }).waitFor();
    assert.equal(await checkbox().isChecked(), true, 'conflict displays cloud completion rather than stale open status');
    assert.equal(c.findObject('Tasks', 'task_id', initial.task_id).status, 'done');
    assert.equal(await page.locator('#toast-root .toast').count(), 1, 'status messages must not pile up over mobile controls');
    await page.locator(`[data-action="open-task-detail"][data-task-id="${initial.task_id}"]`).click();
    assert.match(await page.locator('#dialog-root').innerText(), /上次未同步內容：QA cross-device task/);
    await page.screenshot({ path: path.join(output, 'task-conflict-mobile.png'), fullPage: true, animations: 'disabled' });
    await page.getByRole('button', { name: '返回列表', exact: true }).click();

    await checkbox().click();
    await assertEventually(() => c.findObject('Tasks', 'task_id', initial.task_id).status === 'open');
    await page.locator('[data-filter-group="tasks"][data-filter-value="open"]').click();
    await checkbox().waitFor();
    assert.equal(request('江江', 'deleteSelfTask', { task_id: initial.task_id }).ok, true);
    await checkbox().click();
    await checkbox().waitFor({ state: 'detached' });
    assert.equal(c.findObject('Tasks', 'task_id', initial.task_id).status, 'deleted');
    await page.reload();
    await clickRoute('tasks');
    assert.equal(await checkbox().count(), 0, 'deleted task stays absent after reload with old local state');
    assert.deepEqual(errors, []);
    console.log('PASS mobile UI -> signed backend -> typed Sheets: create, complete, stale-device conflict, preserved draft, explicit reopen, remote delete, reload');
  } catch (error) {
    console.error('Visible dialog at failure:', await page.locator('#dialog-root').innerText().catch(() => 'unavailable'));
    await page.screenshot({ path: path.join(output, 'failure.png'), fullPage: true, animations: 'disabled' }).catch(() => {});
    throw error;
  } finally { await browser.close(); }
}

async function assertEventually(check) {
  for (let attempt = 0; attempt < 60; attempt++) {
    if (check()) return;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert.ok(check(), 'backend state did not settle');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
