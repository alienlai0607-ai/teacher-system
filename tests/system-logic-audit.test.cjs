const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '..');
const source = name => fs.readFileSync(path.join(root, 'apps-script', name + '.gs'), 'utf8');

// Keep Sheet Date cells typed. JSON-only service doubles hid a production write bug.
function harness() {
  const sheets = new Map();
  const props = new Map([['API_SESSION_SECRET', 'isolated-audit-secret']]);
  let held = false;
  let denyLock = false;
  function sheet(name, headers = []) {
    const rows = headers.length ? [headers.slice()] : [];
    const item = {
      getName: () => name,
      getLastRow: () => rows.length,
      getLastColumn: () => rows[0]?.length || 0,
      getRange: (r, c, h = 1, w = 1) => ({
        getValue: () => structuredClone(rows[r - 1]?.[c - 1] ?? ''),
        setValue: value => { (rows[r - 1] ||= [])[c - 1] = structuredClone(value); },
        getValues: () => Array.from({ length: h }, (_, i) => Array.from({ length: w }, (_, j) => structuredClone(rows[r - 1 + i]?.[c - 1 + j] ?? ''))),
        setValues(values) { values.forEach((row, i) => row.forEach((value, j) => { (rows[r - 1 + i] ||= [])[c - 1 + j] = structuredClone(value); })); },
      }),
      appendRow: row => rows.push(structuredClone(row)),
      deleteRow: row => rows.splice(row - 1, 1),
    };
    sheets.set(name, item);
    return item;
  }
  const ss = { getSheetByName: name => sheets.get(name), insertSheet: name => sheet(name) };
  const formatDate = (date, zone, format) => {
    const iso = new Date(date.getTime() + 8 * 3600000).toISOString();
    if (format === 'HH:mm') return iso.slice(11, 16);
    if (format === 'yyyy-MM-dd') return iso.slice(0, 10);
    if (format === 'yyyy-MM') return iso.slice(0, 7);
    if (format === "yyyy-'W'ww") return iso.slice(0, 4) + '-W37';
    return iso.slice(0, 19);
  };
  const c = vm.createContext({
    console: { error() {}, log() {} }, Logger: { log() {} }, Date,
    SpreadsheetApp: { getActiveSpreadsheet: () => ss, flush() {} },
    Session: { getScriptTimeZone: () => 'Asia/Taipei' },
    ContentService: { MimeType: { JSON: 'json' }, createTextOutput: text => ({ setMimeType: () => JSON.parse(text) }) },
    LockService: { getScriptLock: () => ({ tryLock: () => { if (held || denyLock) return false; held = true; return true; }, releaseLock: () => { held = false; } }) },
    PropertiesService: { getScriptProperties: () => ({ getProperty: k => props.get(k), setProperty: (k, v) => props.set(k, v), deleteProperty: k => props.delete(k) }) },
    Utilities: {
      getUuid: crypto.randomUUID, formatDate, Charset: { UTF_8: 'utf8' },
      base64EncodeWebSafe: v => Buffer.from(v).toString('base64url'),
      base64DecodeWebSafe: v => Buffer.from(v, 'base64url'),
      newBlob: bytes => ({ getDataAsString: () => Buffer.from(bytes).toString('utf8') }),
      computeHmacSha256Signature: (value, key) => crypto.createHmac('sha256', key).update(value).digest(),
    },
  });
  for (const name of ['Code', 'utils', 'auth', 'logs', 'tasks', 'feedback', 'students', 'adminmarketing', 'talentrecords', 'courseprep']) vm.runInContext(source(name), c);
  c.ensureHeaders = (s, headers) => {
    const old = c.getHeaders(s);
    const next = old.concat(headers.filter(h => !old.includes(h)));
    s.getRange(1, 1, 1, next.length).setValues([next]);
  };
  c.notifyUser_ = () => true;
  c.todayStr = () => '2026-09-12';
  sheet('Users', ['nickname', 'role', 'department', 'status', 'email', 'work_assignments']);
  sheet('DailyLogs', ['log_id', 'nickname', 'date', 'reflection', 'attachments', 'created_at', 'updated_at']);
  sheet('Evidence', ['url', 'nickname']);
  sheet('Feedback', ['feedback_id', 'log_id', 'from_nickname', 'to_nickname', 'content', 'tag', 'created_at', 'read_at']);
  sheet('Tasks', ['task_id', 'title', 'detail', 'assignee', 'department', 'due_date', 'status', 'created_by', 'created_at', 'updated_at', 'done_at']);
  sheet('Students', ['student_id', 'name', 'teacher', 'department', 'status', 'notes', 'created_at', 'updated_at']);
  sheet('Logs_System', ['timestamp', 'nickname', 'action', 'target', 'detail']);
  c.ensureAdminMarketingRecordsSheet_();
  const users = [
    ['boss', 'admin', '總部'], ['小魚', 'manager', '北區教室', ['admin-marketing-manager']], ['northBoss', 'manager', '北區教室'],
    ['eastBoss', 'manager', '東橋教室'], ['north', 'teacher', '北區教室'], ['east', 'teacher', '東橋教室'],
    ['north2', 'teacher', '北區教室'], ['staff', 'admin_staff', '北區教室', ['admin-marketing']],
    ['assignedManager', 'teacher', '北區教室', ['admin-marketing-manager']],
  ];
  users.forEach(([nickname, role, department, work_assignments = []]) => c.appendRow('Users', { nickname, role, department, status: 'active', email: nickname + '@example.invalid', work_assignments }));
  function request(nickname, action, params = {}) {
    const user = c.findUserByNickname(nickname);
    return c.handleRequest({ postData: { contents: JSON.stringify({ ...params, action, session_token: c.issueSessionToken_(user) }) } }, 'POST');
  }
  return { c, sheet, request, denyLock: value => { denyLock = value; }, locked: () => held };
}

let passed = 0;
const failures = [];
function test(name, fn) {
  try { fn(harness()); passed++; console.log('PASS ' + name); }
  catch (error) { failures.push(name); console.error('FAIL ' + name + ': ' + error.message); }
}

function runTests() {
test('live acceptance refuses non-admin editor identities before any API write', ({ c }) => {
  let calls = 0;
  c.Session.getActiveUser = () => ({ getEmail: () => 'north@example.invalid' });
  c.UrlFetchApp = { fetch: () => { calls++; throw new Error('unexpected network'); } };
  assert.throws(() => c.verifyReleaseLogicFromEditor(), /正式管理員/);
  assert.equal(calls, 0);
});

test('live acceptance refuses a stale deployment without creating test records', ({ c }) => {
  c.Session.getActiveUser = () => ({ getEmail: () => 'boss@example.invalid' });
  const requests = [];
  c.UrlFetchApp = { fetch: (url, options) => {
    requests.push({ url, options });
    return { getContentText: () => JSON.stringify({ ok: true, release: 'old' }) };
  } };
  const result = c.verifyReleaseLogicFromEditor();
  assert.equal(result.ok, false);
  assert.equal(result.checks[0].id, 'live_version');
  assert.equal(requests.length, 1);
  assert.equal(requests[0].options, undefined);
  assert.equal(c.sheetToObjects('Tasks').length, 0);
  assert.equal(c.sheetToObjects('DailyLogs').length, 0);
});

test('signed daily-log requests authorize the actual record, not a supplied nickname', ({ c, request }) => {
  c.appendRow('DailyLogs', { log_id: 'east-log', nickname: 'east', reflection: 'private' });
  assert.equal(request('north', 'getLog', { log_id: 'east-log', nickname: 'north' }).ok, false);
  assert.equal(request('northBoss', 'getLog', { log_id: 'east-log', nickname: 'north' }).ok, false);
  assert.equal(request('east', 'getLog', { log_id: 'east-log' }).log.reflection, 'private');
  assert.equal(request('小魚', 'getLog', { log_id: 'east-log' }).ok, true);
});

test('teacher can reply to the correct supervisor through the signed router', ({ c, request }) => {
  c.appendRow('DailyLogs', { log_id: 'north-log', nickname: 'north' });
  const reply = request('north', 'addFeedback', { log_id: 'north-log', to_nickname: 'northBoss', content: '已調整' });
  assert.equal(reply.ok, true, reply.error);
  assert.equal(request('northBoss', 'listFeedbackThread', { log_id: 'north-log' }).thread[0].from_nickname, 'north');
  assert.equal(request('north', 'addFeedback', { log_id: 'north-log', to_nickname: 'eastBoss', content: 'wrong' }).ok, false);
});

test('a participant cannot use one message to read another employee conversation', ({ c, request }) => {
  c.appendRow('DailyLogs', { log_id: 'north-log', nickname: 'north' });
  c.appendRow('Feedback', { feedback_id: 'private', log_id: 'north-log', from_nickname: 'northBoss', to_nickname: 'north', content: 'private' });
  assert.equal(request('north2', 'addFeedback', { log_id: 'north-log', to_nickname: 'northBoss', content: 'injection' }).ok, false);
  assert.equal(request('eastBoss', 'listFeedbackThread', { log_id: 'north-log' }).ok, false);
  c.appendRow('Feedback', { feedback_id: 'legacy-mixed', log_id: 'V2-plan:one', from_nickname: 'northBoss', to_nickname: 'north2', content: 'other' });
  c.appendRow('Feedback', { feedback_id: 'own', log_id: 'V2-plan:one', from_nickname: 'northBoss', to_nickname: 'north', content: 'own' });
  const visible = request('north', 'listFeedbackThread', { log_id: 'V2-plan:one' });
  assert.equal(visible.ok, true);
  assert.deepEqual(visible.thread.map(m => m.content), ['own']);
});

test('typed dates survive append, update and readback; structured fields remain JSON', ({ c, sheet }) => {
  const date = new Date('2026-09-12T01:02:03.000Z');
  sheet('Typed', ['id', 'created_at', 'payload']);
  c.appendRow('Typed', { id: 'a', created_at: date, payload: { files: [1, 2] } });
  let row = c.findObject('Typed', 'id', 'a');
  assert.ok(row.created_at instanceof Date, 'Date must not become a quoted ISO cell');
  c.updateRow('Typed', row._row, { ...row, payload: { files: [3] } });
  row = c.findObject('Typed', 'id', 'a');
  assert.equal(row.created_at.getTime(), date.getTime());
  assert.deepEqual(JSON.parse(row.payload), { files: [3] });
});

test('global manager sees both branches; ordinary manager and teachers remain scoped', ({ c, request }) => {
  for (const person of ['north', 'east']) c.appendRow('Tasks', { task_id: person, assignee: person, created_by: 'boss', department: c.findUserByNickname(person).department, status: 'open' });
  assert.equal(request('小魚', 'listTasks').tasks.length, 2);
  assert.deepEqual(request('northBoss', 'listTasks').tasks.map(t => t.assignee), ['north']);
  assert.deepEqual(request('east', 'listTasks', { viewer: 'boss' }).tasks.map(t => t.assignee), ['east']);
});

test('bonus review route reaches business validation and rejects non-reviewers', ({ request }) => {
  for (const name of ['boss', '小魚', 'assignedManager']) {
    const result = request(name, 'reviewAdminMarketingTrialBonus', { record_id: 'missing', result: 'approved' });
    assert.equal(result.error, '找不到試上追蹤紀錄');
  }
  assert.equal(request('staff', 'reviewAdminMarketingTrialBonus', {}).ok, false);
});

test('calendar validation rejects impossible dates but accepts leap days and future trial dates', ({ c }) => {
  for (const value of ['2026-02-30', '2026-13-01', '2026-00-01', '2026-04-31']) assert.throws(() => c.adminMarketingDate_(value, true), /日期/);
  assert.equal(c.adminMarketingDate_('2028-02-29', true), '2028-02-29');
  assert.equal(c.adminMarketingDate_('2026-12-31', true), '2026-12-31');
});

test('student names are trimmed before duplicate checks; blanks and invalid teachers rejected', ({ request }) => {
  assert.equal(request('boss', 'addStudent', { name: '  ', teacher: 'north' }).ok, false);
  assert.equal(request('boss', 'addStudent', { name: 'QA student', teacher: 'north' }).ok, true);
  assert.equal(request('boss', 'addStudent', { name: ' QA student ', teacher: 'north' }).ok, false);
  const id = request('boss', 'listStudents', { teacher: 'north' }).students[0].student_id;
  assert.equal(request('boss', 'updateStudent', { student_id: id, name: ' ' }).ok, false);
  assert.equal(request('boss', 'updateStudent', { student_id: id, teacher: '' }).ok, false);
  assert.equal(request('boss', 'updateStudent', { student_id: id, status: 'invalid' }).ok, false);
});

test('student edits cannot create duplicates or detach a branch from the teacher', ({ request }) => {
  request('boss', 'addStudent', { name: 'A', teacher: 'north' });
  request('boss', 'addStudent', { name: 'B', teacher: 'north' });
  const id = request('boss', 'listStudents', { teacher: 'north' }).students.find(s => s.name === 'B').student_id;
  assert.equal(request('boss', 'updateStudent', { student_id: id, name: ' A ' }).ok, false);
  assert.equal(request('northBoss', 'updateStudent', { student_id: id, teacher: 'east' }).ok, false);
  const result = request('boss', 'updateStudent', { student_id: id, department: '東橋教室', notes: 'unchanged teacher' });
  assert.equal(result.ok, true);
  assert.equal(request('boss', 'listStudents', { teacher: 'north' }).students.find(s => s.student_id === id).department, '北區教室');
});

test('student and bonus writes honor the shared lock instead of racing', ({ request, denyLock }) => {
  denyLock(true);
  assert.equal(request('boss', 'addStudent', { name: 'A', teacher: 'north' }).code, 'WRITE_BUSY');
  assert.equal(request('boss', 'reviewAdminMarketingTrialBonus', { record_id: 'missing', result: 'approved' }).code, 'WRITE_BUSY');
});

test('every registered authenticated route has an authorization branch', ({ c }) => {
  const routes = [...source('Code').matchAll(/^\s+'([^']+)': \(\) =>/gm)].map(m => m[1]);
  const absent = [];
  for (const action of routes.filter(a => !['ping', 'whoami'].includes(a))) {
    try { c.authorizeApiAction_(action, { nickname: 'north', teacher: 'north', assignees: ['north'], to_nickname: 'north' }, c.findUserByNickname('boss')); }
    catch (error) { if (error.message === '此功能尚未設定安全權限') absent.push(action); }
  }
  assert.deepEqual(absent, []);
});

test('stale task writes cannot reopen a completed task; same-content retry is harmless', ({ c, request }) => {
  const task = { id: 'self-one', title: 'QA work', dueDate: '2026-09-12', status: 'open' };
  const first = request('north', 'saveSelfTask', { task });
  assert.equal(first.ok, true, first.error);
  const done = request('north', 'saveSelfTask', { task: { ...task, status: 'done', cloudUpdatedAt: first.updated_at } });
  assert.equal(done.ok, true, done.error);
  assert.notEqual(done.updated_at, first.updated_at, 'same-second changes must have different revisions');
  const stale = request('north', 'saveSelfTask', { task: { ...task, cloudUpdatedAt: first.updated_at } });
  assert.equal(stale.code, 'RECORD_CONFLICT');
  assert.equal(stale.current_task.status, 'done');
  const retry = request('north', 'saveSelfTask', { task: { ...task, status: 'done', cloudUpdatedAt: first.updated_at } });
  assert.equal(retry.ok, true, retry.error);
  assert.equal(retry.updated_at, done.updated_at, 'identical retry must not create another update');
  assert.equal(c.findObject('Tasks', 'task_id', task.id).status, 'done');
});

test('resyncing a manager assignment does not undo completion or allow teacher deletion', ({ c, request }) => {
  const assignment = { task_id: 'assignment', title: 'QA', assignees: ['north'], notify: false };
  assert.equal(request('boss', 'addTask', assignment).ok, true);
  assert.equal(request('north', 'updateTaskStatus', { task_id: 'assignment', status: 'done' }).ok, true);
  assert.equal(request('boss', 'addTask', assignment).ok, true);
  assert.equal(c.findObject('Tasks', 'task_id', 'assignment').status, 'done');
  assert.equal(request('north', 'deleteSelfTask', { task_id: 'assignment' }).ok, false);
  assert.equal(request('north', 'updateTaskStatus', { task_id: 'assignment', status: 'nonsense' }).ok, false);
});

test('late task sync cannot resurrect a deleted task on another device', ({ c, request }) => {
  const task = { id: 'deleted-self', title: 'QA', dueDate: '2026-09-12', status: 'open' };
  assert.equal(request('north', 'saveSelfTask', { task }).ok, true);
  assert.equal(request('north', 'deleteSelfTask', { task_id: task.id }).ok, true);
  assert.equal(request('north', 'saveSelfTask', { task }).code, 'RECORD_DELETED');
  assert.equal(request('north', 'listTasks').tasks.length, 0);
  assert.ok(request('north', 'listTasks').deletedIds.includes(task.id));
  assert.equal(c.findObject('Tasks', 'task_id', task.id).status, 'deleted');
});

test('task lock contention returns failure without creating data', ({ c, request, denyLock }) => {
  denyLock(true);
  assert.equal(request('north', 'saveSelfTask', { task: { id: 'busy', title: 'QA' } }).code, 'WRITE_BUSY');
  assert.equal(c.sheetToObjects('Tasks').length, 0);
});

test('private photo access cannot be granted by putting another file ID in your own log', ({ c, request }) => {
  let shared = false;
  const id = 'private-other-photo-12345';
  const blob = { getBytes: () => [1, 2, 3], getContentType: () => 'image/png' };
  c.DriveApp = { Permission: { VIEW: 'view', EDIT: 'edit', OWNER: 'owner' }, getFileById: () => ({
    getOwner: () => ({ getEmail: () => 'boss@example.invalid' }),
    getAccess: () => shared ? 'view' : 'none', getViewers: () => [], getEditors: () => [],
    getMimeType: () => 'image/png', getThumbnail: () => blob, getName: () => 'photo.png',
  }) };
  c.Utilities.base64Encode = value => Buffer.from(value).toString('base64');
  c.appendRow('DailyLogs', { log_id: 'own', nickname: 'north', attachments: [{ note: id }] });
  const denied = request('north', 'getAttachmentPreviews', { file_ids: [id] });
  assert.equal(denied.previews.length, 0);
  assert.equal(denied.errors[0].error, '無權查看此照片');
  shared = true;
  assert.equal(request('north', 'getAttachmentPreviews', { file_ids: [id] }).previews.length, 1);
});

test('daily logs reject impossible and future work dates before writing', ({ c, request }) => {
  for (const date of ['2026-02-30', '2026-13-01', '2026-09-13']) assert.equal(request('north', 'saveLog', { nickname: 'north', date, reflection: 'QA' }).ok, false);
  assert.equal(c.sheetToObjects('DailyLogs').length, 0);
});

test('daily locking handles actual Sheet Date cells', ({ c }) => {
  c.ensureHeaders(c.getSheet('DailyLogs'), ['locked']);
  c.appendRow('DailyLogs', { log_id: 'old', nickname: 'north', date: new Date('2020-01-01T00:00:00+08:00'), locked: false });
  c.appendRow('DailyLogs', { log_id: 'recent', nickname: 'north', date: new Date(), locked: false });
  c.dailyLockOldLogs();
  assert.equal(c.findObject('DailyLogs', 'log_id', 'old').locked, true);
  assert.equal(c.findObject('DailyLogs', 'log_id', 'recent').locked, false);
});

test('task notification failure does not turn a durable save into a failed submission', ({ c, request, locked }) => {
  c.notifyUser_ = () => { assert.equal(locked(), false, 'network notification must run outside the Sheet write lock'); throw new Error('offline'); };
  const result = request('boss', 'addTask', { title: 'Notification QA', assignees: ['north'] });
  assert.equal(result.ok, true);
  assert.match(result.warning, /事項已儲存/);
  assert.equal(c.sheetToObjects('Tasks').length, 1);
});

test('retired tracking tasks and inactive accounts receive no scheduled reminder', ({ c }) => {
  c.todayStr = () => '2026-09-14';
  const inactive = c.findUserByNickname('north');
  c.updateRow('Users', inactive._row, { status: 'inactive' });
  for (const [id, assignee, status] of [['v2_contact_old', 'north2', 'open'], ['current', 'north2', 'open'], ['removed', 'north2', 'deleted'], ['departed', 'north', 'open']]) {
    c.appendRow('Tasks', { task_id: id, title: id, assignee, status, due_date: '2026-09-12' });
  }
  const sent = [];
  c.notifyUser_ = (user, title, body) => sent.push({ user: user.nickname, body });
  c.sendTaskReminders_('morning');
  assert.equal(sent.length, 1);
  assert.equal(sent[0].user, 'north2');
  assert.match(sent[0].body, /current/);
  assert.doesNotMatch(sent[0].body, /v2_contact_old|departed|removed/);
});

test('notification sender refuses an inactive user even when another caller forgets to filter', ({ c }) => {
  const start = source('tasks').indexOf('function notifyUser_(');
  vm.runInContext(source('tasks').slice(start, source('tasks').indexOf('/**', start)), c);
  let sends = 0;
  c.pushLine_ = c.pushOneSignal_ = () => sends++;
  c.notifyUser_({ nickname: 'old', status: 'inactive', line_user_id: 'synthetic' }, 'QA', 'QA');
  assert.equal(sends, 0);
});

test('manager daily autosave and post retry do not multiply the same evidence', ({ c, sheet, request, denyLock }) => {
  sheet('Posts', ['post_id', 'date', 'nickname', 'department', 'platform', 'url', 'screenshot', 'content_type', 'week_of', 'created_at']);
  const post = { platform: 'FB', url: 'https://example.invalid/post/1', content_type: '課程' };
  const daily = { nickname: 'northBoss', date: '2026-09-12', reflection: 'QA post repeat', posts: [post, post] };
  const first = request('northBoss', 'saveLog', daily);
  assert.equal(first.ok, true, first.error);
  assert.equal(request('northBoss', 'saveLog', { ...daily, base_revision: first.revision }).ok, true);
  const row = c.sheetToObjects('Posts')[0];
  const retry = request('northBoss', 'addPost', { nickname: 'northBoss', date: daily.date, ...post, content_type: '更新的分類' });
  assert.equal(retry.ok, true, retry.error);
  assert.equal(retry.post_id, row.post_id);
  assert.equal(c.sheetToObjects('Posts').length, 1);
  assert.equal(c.sheetToObjects('Posts')[0].content_type, '更新的分類');
  assert.equal(c.getWeekPostCount({ nickname: 'northBoss', date: daily.date }).count, 1);
  assert.equal(request('northBoss', 'addPost', { nickname: 'northBoss', platform: 'FB' }).ok, false);
  denyLock(true);
  assert.equal(request('northBoss', 'addPost', { nickname: 'northBoss', ...post }).code, 'WRITE_BUSY');
});

test('course-prep sorting uses actual timestamps including legacy typed and quoted dates', ({ c, request }) => {
  const sheetName = c.ensureCoursePrepSheet_().getName();
  for (const [id, updated] of [['thursday', new Date('2026-09-10T08:00:00Z')], ['friday', new Date('2026-09-11T08:00:00Z')], ['saturday', '"2026-09-12T08:00:00.000Z"']]) {
    c.appendRow(sheetName, { prep_id: id, nickname: 'north', department: '北區教室', updated_at: updated, data_json: { prep: { id } }, status: 'active' });
  }
  const result = request('north', 'listCoursePreps', { viewer: 'north' });
  assert.equal(result.ok, true, result.error);
  assert.deepEqual(result.records.map(row => row.prepId), ['saturday', 'friday', 'thursday']);
});

console.log(JSON.stringify({ passed, failed: failures.length, failures, scope: 'signed HTTP router + real module logic + typed in-memory Sheets; not production user acceptance' }, null, 2));
if (failures.length) process.exitCode = 1;
}

module.exports = { harness };
if (require.main === module) runTests();
