const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const block = (text, from, to) => text.slice(text.indexOf(from), text.indexOf(to, text.indexOf(from)));
const anqin = { nickname: 'Anqin QA', role: 'teacher', department: '北區教室', status: 'active' };
const talent = { nickname: 'Talent QA', role: 'teacher', department: '才藝部門', status: 'active' };
const admin = { nickname: 'Admin QA', role: 'admin_staff', department: '北區教室', status: 'active' };
const users = [anqin, talent, admin];
let day = '2026-09-05';
const sent = [];
const tasks = users.map(user => ({ status: 'open', assignee: user.nickname, due_date: '2026-09-04', title: 'QA' }));
const context = vm.createContext({
  Date, console,
  isAnqinUser: user => user?.role === 'teacher' && user.department === '北區教室',
  todayStr: () => day,
  SHEET_NAMES: { USERS: 'users', TASKS: 'tasks', LOGS: 'logs', TEACHER_EVAL: 'eval' },
  sheetToObjects: name => name === 'users' ? users : name === 'tasks' ? tasks : [],
  taskDateStr_: value => value,
  notifyUser_: user => sent.push(user.nickname),
  Utilities: { formatDate: date => date.toISOString().slice(0, 10) },
  Session: { getScriptTimeZone: () => 'UTC' },
  pdfBannerImg_: () => '', pdfEsc_: value => value,
  normalizeDepartment_: value => value, sameDepartment_: (a,b) => a === b,
  yearMonth: () => '2026-09',
  findUserByNickname: () => ({ nickname: 'Manager QA', role: 'manager', department: '北區教室' }),
  isGlobalManager_: () => false,
});
vm.runInContext(block(read('apps-script/Code.gs'), 'function isKpiWeekend_', '/** 舊資料'), context);
vm.runInContext(block(read('apps-script/tasks.gs'), 'function addDaysStr_', '// 觸發器用'), context);
vm.runInContext(block(read('apps-script/pdfreport.gs'), 'function sendDailyKpiReportAuto()', '/** 一次性'), context);
vm.runInContext(block(read('apps-script/pdfreport.gs'), 'function buildDailyKpiHtml_', '/** 生成全體'), context);
vm.runInContext(read('apps-script/dashboard.gs'), context);

for (const weekend of ['2026-09-05', '2026-09-06']) {
  day = weekend;
  assert.equal(context.isDailyKpiRequired_(anqin, day), false);
  assert.equal(context.isDailyKpiRequired_(talent, day), true);
  assert.equal(context.isDailyKpiRequired_(admin, day), true);
  sent.length = 0;
  context.sendTaskReminders_('morning');
  assert.deepEqual(sent, [talent.nickname, admin.nickname], 'weekend routine reminder excludes Anqin only');
  sent.length = 0;
  tasks.forEach(task => task.due_date = context.addDaysStr_(day, 1));
  context.sendTaskReminders_('evening');
  assert.deepEqual(sent, [talent.nickname, admin.nickname], 'Sunday preview also quiet for Anqin');
  assert.equal(context.sendDailyKpiReportAuto().sent, 0, 'scheduled weekend aggregate performs no send or PDF work');
  const report = context.buildDailyKpiHtml_(day);
  assert.equal(report.summary.missingNames.includes(anqin.nickname), false);
  assert.equal(report.summary.missingNames.includes(talent.nickname), true);
  const dashboard = context.getDashboard({ viewer: 'Manager QA' });
  assert.equal(dashboard.status.find(item => item.nickname === anqin.nickname).required, false);
  assert.equal(dashboard.status.find(item => item.nickname === anqin.nickname).submitted, false, 'exempt is not falsely submitted');
  assert.equal(dashboard.required_count, 1, 'admin remains required');
  tasks.forEach(task => task.due_date = '2026-09-04');
}
day = '2026-09-04';
sent.length = 0;
tasks.forEach(task => task.due_date = '2026-09-05');
context.sendTaskReminders_('evening');
assert.deepEqual(sent, [talent.nickname, admin.nickname], 'Friday does not send Anqin Saturday reminder');
day = '2026-09-07';
sent.length = 0;
context.sendTaskReminders_('morning');
assert.deepEqual(sent, users.map(user => user.nickname), 'Monday overdue tasks return without data deletion');
assert.equal(context.isDailyKpiRequired_(anqin, day), true);
const frontend = vm.createContext({ Date, state: { daily: { date: day } } });
vm.runInContext(block(read('review/anqin-v2/app.js'), '  function dailyKpiOptional(', '  function dailyCompletion('), frontend);
for (const date of ['2026-09-04', '2026-09-05', '2026-09-06', '2026-09-07', '2026-10-03']) {
  assert.equal(frontend.dailyKpiOptional(date), !context.isDailyKpiRequired_(anqin, date), 'frontend/backend policy agrees');
}
frontend.state.context = { teacher: 'QA' };
frontend.state.contacts = [];
frontend.todayActivities = () => [];
assert.equal(frontend.hasDailyRecords(), false, 'empty weekend must not produce a submission');
frontend.state.contacts.push({ teacher: 'Other QA', date: day });
assert.equal(frontend.hasDailyRecords(), false, 'another teacher record is not a reason to submit');
frontend.state.contacts.push({ teacher: 'QA', date: '2026-09-04' });
assert.equal(frontend.hasDailyRecords(), false, 'historical contact must not produce a current submission');
frontend.state.contacts.push({ teacher: 'QA', date: day });
assert.equal(frontend.hasDailyRecords(), true, 'voluntary current contact can be submitted');
const app = read('review/anqin-v2/app.js');
assert.match(block(app, '  async function submitDailyRequest()', '    window.clearTimeout(cloudDraftTimer)'), /dailyKpiOptional\(\) && !hasDailyRecords\(\)/);
const wrapper = block(read('apps-script/tasks.gs'), 'function verifyProductionDeliveryFromEditor()', 'function runProductionIntegrityCheck(');
let integrityRuns = 0;
const editor = vm.createContext({
  Session: { getActiveUser() { throw new Error('Missing https://www.googleapis.com/auth/userinfo.email'); } },
  runProductionIntegrityCheck() { integrityRuns++; return { ok: true }; },
  console: { log() {} },
});
vm.runInContext(wrapper, editor);
assert.equal(editor.verifyProductionDeliveryFromEditor().code, 'EDITOR_EMAIL_SCOPE_REQUIRED');
assert.equal(integrityRuns, 0, 'missing editor scope must not write any test data');
editor.Session.getActiveUser = () => ({ getEmail: () => 'qa@example.invalid' });
assert.equal(editor.verifyProductionDeliveryFromEditor().ok, true);
assert.equal(integrityRuns, 1);
console.log('PASS weekend exemption, no scheduled weekend report, reminder boundaries, manager status, and frontend/backend policy parity');
