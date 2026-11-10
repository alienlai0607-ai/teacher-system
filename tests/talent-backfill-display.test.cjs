const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../review/talent-v2/app.js'), 'utf8');
function functionBlock(name) {
  const start = source.indexOf(`  function ${name}(`);
  assert.notEqual(start, -1, name);
  const end = source.indexOf('\n  }', start + 1);
  assert.notEqual(end, -1, `end of ${name}`);
  return source.slice(start, end + 4);
}

const backfill = {
  id: 'synthetic-backfill', teacher: '測試老師', employment: 'pt', entryVersion: 2,
  date: '2026-10-05', courseName: '測試課程', site: '測試教室', siteType: 'self',
  lessonStatus: 'held', status: 'submitted', duration: 1.5, scheduleTime: '14:00–15:30',
  present: 11, newCount: null, renewalCount: null, trial: null,
  adminBackfillUnknownFields: ['newCount', 'renewalCount', 'trial'],
  adminBackfillApproved: true, adminBackfillNote: '歷史補登，其他人數未提供',
  adminPayOverrideApproved: true, adminPayOverrideAmount: 1200,
  adminPayOverrideRate: 800, adminPayOverrideTier: '最高級距核定', pay: 1200,
};

function contextFor(logs = [backfill]) {
  let drawer;
  let csv;
  const row = {
    person: { nickname: '測試老師', employment: 'pt', schedule: [] }, logs,
    heldLogs: logs, cancelledLogs: [], hours: 10, wage: 5000, renewal: 0,
    newCount: 0, reportedNewCount: 0, reportedRenewal: 0, renewalBonus: 0,
    total: 5000, compliance: { eligible: true, missing: [], appMissing: [] },
    pendingBonusLogs: [], kpi: 0, newBonus: 0,
  };
  const context = vm.createContext({
    formatMoney: value => `NT$${Number(value || 0).toLocaleString('en-US')}`,
    normalizeName: value => String(value || ''), esc: value => String(value || ''),
    formatDate: value => value, icon: () => '', statusBadge: value => value,
    isTeacher: () => false, ownLogs: () => logs, settlementRows: () => [row],
    currentUser: { nickname: '測試老師' }, state: { ui: { month: '2026-10' } },
    todayIso: () => '2026-11-10', openDrawer: value => { drawer = value; },
    downloadCsv: value => { csv = value; }, toast: () => {},
  });
  const names = ['talentCountUnknown', 'talentCountLabel', 'talentReportedTotalLabel',
    'lessonPayLabel', 'pendingLessonSummary', 'pendingLessonNotice', 'payBreakdown',
    'renderLogRow', 'renderPayRow', 'openPtStatement', 'exportOwn', 'exportSettlement', 'exportPtDetail'];
  vm.runInContext(names.map(functionBlock).join('\n'), context);
  return { context, drawer: () => drawer, csv: () => csv };
}

test('未知人數顯示未提供，確定零與舊資料維持零', () => {
  const { context: c } = contextFor();
  for (const key of ['newCount', 'renewalCount', 'trial']) {
    assert.equal(c.talentCountLabel(backfill, key), '未提供');
    assert.equal(c.talentCountLabel({ ...backfill, [key]: 0 }, key), '未提供');
    assert.equal(c.talentCountLabel({ [key]: null }, key), '未提供');
    assert.equal(c.talentCountLabel({ [key]: 0 }, key), '0');
    assert.equal(c.talentCountLabel({}, key), '0');
  }
});

test('11 人已核定最高級距顯示1200，未核定不顯示零元', () => {
  const { context: c } = contextFor();
  assert.equal(c.lessonPayLabel(backfill), 'NT$1,200');
  assert.equal(c.lessonPayLabel({ ...backfill, adminPayOverrideApproved: false, pay: 0, payRequiresReview: true }), '待主管核定');
  assert.equal(c.lessonPayLabel({ ...backfill, adminPayOverrideApproved: false, lessonStatus: 'cancelled', payRequiresReview: true }), 'NT$0');
});

test('卡片與鐘點明細不把未提供人數變成零', () => {
  const { context: c } = contextFor();
  for (const render of [c.renderLogRow, c.renderPayRow]) {
    const html = render(backfill);
    assert.match(html, /新生 未提供、續報 未提供/);
    assert.match(html, /體驗另計 未提供/);
    assert.match(html, /NT\$1,200/);
    assert.doesNotMatch(html, /待主管核定/);
  }
});

test('月結提示未知欄位不列獎金，已核定鐘點不誤報待核定', () => {
  const { context: c } = contextFor();
  const logs = Array.from({ length: 3 }, () => ({ ...backfill }));
  assert.match(c.pendingLessonSummary(logs), /3 堂新生／續報／體驗人數尚未提供/);
  assert.match(c.pendingLessonSummary(logs), /不列入獎金/);
  assert.doesNotMatch(c.pendingLessonSummary(logs), /鐘點待主管/);
  assert.equal(c.talentReportedTotalLabel(logs, 'renewalCount', 0), '0（另有 3 堂未提供）');
});

test('列印月結包含逐堂未提供與待確認提醒', () => {
  const harness = contextFor();
  harness.context.openPtStatement('測試老師');
  const body = harness.drawer().body;
  assert.match(body, /<td>未提供<\/td><td>未提供<\/td><td>未提供<\/td>/);
  assert.match(body, /本月仍有待確認資料/);
  assert.match(body, /NT\$5,000/);
});

test('個人與PT逐堂CSV保留未提供，不寫成0', () => {
  const harness = contextFor();
  harness.context.exportOwn();
  assert.deepEqual(Array.from(harness.csv()[1].slice(7, 10)), ['未提供', '未提供', '未提供']);
  assert.equal(harness.csv()[1][10], 1200);
  harness.context.exportPtDetail();
  assert.deepEqual(Array.from(harness.csv()[1].slice(6, 9)), ['未提供', '未提供', '未提供']);
  assert.equal(harness.csv()[1][13], 1200);
});

test('月結CSV額外列明待確認資料且表頭欄數相同', () => {
  const harness = contextFor();
  harness.context.exportSettlement();
  const rows = harness.csv();
  assert.equal(rows[0].length, rows[1].length);
  assert.equal(rows[0].at(-1), '待確認資料');
  assert.match(rows[1].at(-1), /未提供/);
  assert.match(rows[1][10], /另有 1 堂未提供/);
});
