const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'review/anqin-v2/app.js'), 'utf8');
const styles = fs.readFileSync(path.join(root, 'review/anqin-v2/styles.css'), 'utf8');
const helperSource = source.slice(source.indexOf('  function normalizeManagerMonth('), source.indexOf('  function renderManagerDayPreview('));

assert.ok(helperSource.length > 1000, '月度總覽 helper 必須存在');

const state = { submissions: [] };
const integrationRuntime = { managerLogIndex: [] };
const context = vm.createContext({
  Date,
  state,
  integrationRuntime,
  todayIso: () => '2026-10-08',
  addDays(dateString, amount) {
    const date = new Date(`${dateString}T12:00:00Z`);
    date.setUTCDate(date.getUTCDate() + amount);
    return date.toISOString().slice(0, 10);
  },
  dailyKpiOptional(date) {
    const day = new Date(`${date}T12:00:00Z`).getUTCDay();
    return day === 0 || day === 6;
  },
  previousKpiWorkday(date) {
    let value = context.addDays(date, -1);
    while (context.dailyKpiOptional(value)) value = context.addDays(value, -1);
    return value;
  },
  sameReviewIdentity: (left, right) => String(left).replace(/(?:老師|主管)$/, '') === String(right).replace(/(?:老師|主管)$/, ''),
});
vm.runInContext(helperSource, context);

const weeks = context.managerMonthWeeks('2026-10');
const workdays = Array.from(weeks).flat().filter(Boolean);
assert.equal(workdays.length, 22, '2026/10 應有 22 個週一至週五工作日');
assert.equal(workdays[0], '2026-10-01');
assert.equal(workdays.at(-1), '2026-10-30');
assert.equal(workdays.some(date => context.dailyKpiOptional(date)), false, '月曆不得混入週末');
assert.ok(Array.from(weeks).every(week => Array.from(week).length === 5), '主管月曆固定顯示週一至週五');

assert.equal(context.managerDayState('紅豆老師', '2026-10-02', '2026-10-08').key, 'missing', '過寬限期才算缺交');
assert.equal(context.managerDayState('紅豆老師', '2026-10-07', '2026-10-08').key, 'grace', '上一工作日仍在期限內');
assert.equal(context.managerDayState('紅豆老師', '2026-10-08', '2026-10-08').key, 'today', '今天未交顯示待交而非缺交');
assert.equal(context.managerDayState('紅豆老師', '2026-10-09', '2026-10-08').key, 'future', '未來日期不可算缺交');
assert.equal(context.managerDayState('紅豆老師', '2026-10-09', '2026-10-12').key, 'grace', '週一應讓上週五仍在隔一工作日寬限期');

state.submissions.push({ id: 'submitted', teacher: '紅豆老師', date: '2026-10-01', status: 'pending', submittedAt: '2026-10-01T10:00:00Z' });
state.submissions.push({ id: 'draft', teacher: '紅豆老師', date: '2026-10-05', status: 'draft', submittedAt: '' });
integrationRuntime.managerLogIndex.push({ teacher: '紅豆', date: '2026-10-06', submittedAt: '2026-10-07T01:00:00Z', isMakeup: true });
integrationRuntime.managerLogIndex.push({ teacher: '紅豆', date: '2026-10-02', submittedAt: '2026-10-02T10:00:00Z', isMakeup: false, hasV2Snapshot: false });

assert.equal(context.managerDayState('紅豆老師', '2026-10-01', '2026-10-08').key, 'complete', 'V2 正式送出應算完成');
assert.equal(context.managerDayState('紅豆老師', '2026-10-05', '2026-10-08').key, 'missing', '只有草稿不可算完成');
assert.equal(context.managerDayState('紅豆老師', '2026-10-06', '2026-10-08').key, 'makeup', '補繳完成應維持已交並顯示副狀態');
assert.equal(context.managerDayState('紅豆老師', '2026-10-02', '2026-10-08').key, 'complete', '舊版無 V2 快照但有 submitted_at 不得誤判缺交');

const model = context.managerMonthModel('紅豆老師', '2026-10');
assert.equal(model.required, 6, '截至 10/8 應計入六個工作日');
assert.equal(model.completed, 3);
assert.equal(model.missing, 1);
assert.equal(model.pending, 2);
assert.equal(model.makeup, 1);

assert.match(source, /安親主管｜月度總覽/, '主管首頁需清楚標示月度總覽');
assert.match(source, /data-action="manager-month-date"/, '月曆日期需可直接點選');
assert.match(source, /查看當日並給回饋/, '當日詳情需直接連到主管回饋流程');
assert.match(source, /data-action="manager-month-evaluate"/, '當日區塊需直接連到同老師同月份評分');
assert.match(source, /await loadManagerEvaluation\(person\.nickname, month\)/, '本月評分不得載入錯誤老師或月份');
assert.match(source, /\['已知悉', '需改進'\]\.includes\(row\.tag\)/, '一般對話不可誤改日報審查狀態');
assert.match(styles, /\.manager-month-layout[\s\S]*grid-template-columns:\s*250px minmax\(0, 1fr\)/, '電腦版需有老師欄與月曆主區');
assert.match(styles, /@media \(max-width: 820px\)[\s\S]*\.manager-teacher-list[\s\S]*overflow-x:\s*auto/, '手機老師切換需可橫向滑動且不撐寬頁面');
assert.match(styles, /\.manager-calendar-week[\s\S]*repeat\(5, minmax\(0, 1fr\)\)/, '手機與電腦月曆固定五個工作日欄位');

console.log('PASS Anqin manager month status, legacy submissions, grace day, feedback, scoring, and responsive UI contracts');
