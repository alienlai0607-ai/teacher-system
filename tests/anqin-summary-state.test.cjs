const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.resolve(__dirname, '../review/anqin-v2/app.js'), 'utf8');
const block = (start, end) => source.slice(source.indexOf(start), source.indexOf(end, source.indexOf(start)));
function scenario(status, oldNote, nextNote, notify = false) {
  const at = '2026-09-15T13:15:58.000Z';
  const state = {
    context: { teacher: 'QA' }, integration: {},
    daily: { date: '2026-09-15', status: 'submitted', submittedAt: at, summary: { teacherNote: oldNote, tomorrowPriority: '先前的待辦快照' } },
    submissions: [{ teacher: 'QA', date: '2026-09-15', status, submittedAt: at }],
  };
  const context = vm.createContext({
    state, FormData: class { get() { return nextNote; } },
    buildDailySummary: () => ({ keyResult: '工作成果', followup: '孩子狀況', tomorrowPriority: '即時待辦已變動' }),
    persist() {}, scheduleDailyCloudDraftSync() {}, renderApp() {}, toast() {},
  });
  vm.runInContext(block('  function markDailyNeedsResubmit(', '  function todaySectionStatus(')
    + block('  function saveDailySummaryForm(', '  function saveWeeklyForm('), context);
  context.saveDailySummaryForm({}, notify);
  return state;
}

for (const status of ['pending', 'accepted', 'clarify']) {
  for (const notify of [false, true]) {
    const unchanged = scenario(status, '已保存的補充', '  已保存的補充  ', notify);
    assert.equal(unchanged.daily.status, 'submitted', '無修改按送出／儲存不應撤回日報');
    assert.ok(unchanged.daily.submittedAt);
    assert.equal(unchanged.submissions[0].status, status, '即時待辦摘要變動不得撤回既有送出／審核狀態');
    assert.equal(unchanged.submissions[0].previousStatus, undefined);
    const edited = scenario(status, '已保存的補充', '真正修改的補充', notify);
    assert.equal(edited.daily.status, 'draft');
    assert.equal(edited.daily.submittedAt, '');
    assert.equal(edited.submissions[0].previousStatus, status);
    assert.ok(edited.submissions[0].previousSubmittedAt);
    assert.equal(edited.daily.summary.teacherNote, '真正修改的補充');
  }
}
console.log('PASS: unchanged submit/save preserves status; real note changes retain prior submission evidence.');
