const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = fs.readFileSync(path.resolve(__dirname, '../apps-script/adminmarketing.gs'), 'utf8');
const teacher = { nickname: 'RITA老師', role: 'teacher', status: 'active', work_assignments: ['talent-fulltime'] };
const pt = { nickname: '紅豆', role: 'teacher', status: 'active', work_assignments: ['talent-pt'] };
const admin = { nickname: '行政', role: 'admin_staff', status: 'active', work_assignments: ['admin-marketing'] };
const users = [teacher, pt, admin];
const classes = [
  { class_id: 'a', teacher: 'Rita', code: '北01', campus: '北區', student_count: 3, active: true, version: 1, _row: 2 },
  { class_id: 'b', teacher: '紅豆老師', code: '東01', campus: '東橋', student_count: 2, active: true, version: 1, _row: 3 },
];
const history = [], reminders = [{ reminder_id: 'private-note', class_id: 'a', title: '行政內部備註' }];
const tables = { users, classes, history, reminders };
const context = vm.createContext({ console, Date, JSON, String, Number, Object, Array, Math, Error, RegExp,
  Utilities: { getUuid: () => 'test-event' },
  PropertiesService: { getScriptProperties: () => ({ getProperty: () => 'confirmed' }) },
});
vm.runInContext(source, context);
Object.assign(context, {
  SHEET_NAMES: { USERS: 'users', CLASS_ROSTER: 'classes', CLASS_ROSTER_HISTORY: 'history', CLASS_ROSTER_REMINDERS: 'reminders' },
  parseUserListField_: value => value || [], talentAssignments_: user => user.work_assignments || [],
  sheetToObjects: name => tables[name], ensureClassRosterSheets_: () => {}, withRecordWriteLock_: fn => fn(),
  nowIso: () => '2026-09-12T12:00:00+08:00',
  findObject: (table, field, value) => tables[table].find(item => item[field] === value),
  updateRow: (table, row, fields) => Object.assign(tables[table].find(item => item._row === row), fields),
  appendRow: (table, fields) => tables[table].push({ ...fields, _row: tables[table].length + 2 }),
});
const read = actor => context.getClassRosterData({ __actor: actor, viewer: '行政' });
let result = read(teacher);
assert.equal(result.scope, 'own');
assert.deepEqual(Array.from(result.classes, c => c.id), ['a']);
assert.equal(result.baseline, undefined);
assert.equal(result.stats, undefined);
assert.equal(result.reminders.length, 0);
assert.equal(JSON.stringify(result).includes('紅豆'), false);
assert.equal(read(pt).classes[0].id, 'b');
assert.equal(read(admin).classes.length, 2);
assert.equal(context.getClassRosterData({ viewer: '行政' }).ok, false, 'viewer 不能代替登入身份');
assert.equal(read({ ...teacher, status: 'suspended' }).ok, false);
assert.equal(read({ ...teacher, work_assignments: ['anqin-teacher'] }).ok, false);
function adjust(actor, id, requestId, overrides = {}) {
  return context.saveClassRosterMutation({ __actor: actor, operation: 'adjust', request_id: requestId,
    payload: { classId: id, version: 1, delta: 1, reason: '體驗轉正式', studentType: 'formal', ...overrides } });
}
assert.equal(adjust(teacher, 'b', 'attack').ok, false);
assert.equal(classes[1].student_count, 2);
assert.equal(adjust(teacher, 'a', 'trial', { studentType: 'trial' }).ok, false);
assert.equal(adjust(teacher, 'a', 'missing-kind', { studentType: undefined }).ok, false);
assert.equal(context.saveClassRosterMutation({ __actor: teacher, operation: 'save_class', request_id: 'create', payload: {} }).ok, false);
result = adjust(teacher, 'a', 'valid');
assert.equal(result.ok, true);
assert.equal(classes[0].student_count, 4);
assert.equal(result.classRoster.classes.length, 1);
assert.equal(result.classRoster.classes[0].lowEnrollmentSince, '');
assert.equal(read(admin).classes[0].count, 4, '老師修改必須在行政讀回相同數量');
assert.equal(adjust(teacher, 'a', 'valid').duplicate, true);
assert.equal(classes[0].student_count, 4);
result = adjust(teacher, 'a', 'stale');
assert.equal(result.code, 'RECORD_CONFLICT');
assert.equal(result.classRoster.classes.length, 1, '衝突回傳也不得洩露其他老師');
assert.equal(adjust(pt, 'b', 'valid').ok, false, '其他帳號不能使用他人的操作收據');
users.push({ ...teacher, nickname: 'Rita' });
assert.equal(read(teacher).classes.length, 0, '同名不同帳號須拒絕自動對應');
assert.equal(adjust(teacher, 'a', 'ambiguous', { version: 2 }).ok, false);
users.pop();
classes[0].teacher = '紅豆';
assert.equal(read(teacher).classes.length, 0, '主管換老師後舊授課老師立即失去權限');
assert.equal(adjust(teacher, 'a', 'reassigned', { version: 2 }).ok, false);
assert.equal(read(pt).classes.length, 2);
const lowItem = { id: 'low', count: 3, createdAt: '2026-08-01T00:00:00+08:00' };
const events = [
  { classId: 'low', action: 'adjust', beforeCount: 3, afterCount: 4, at: '2026-08-20T00:00:00+08:00' },
  { classId: 'low', action: 'adjust', beforeCount: 4, afterCount: 3, at: '2026-09-01T00:00:00+08:00' },
  { classId: 'low', action: 'class_updated', beforeCount: 3, afterCount: 3, at: '2026-09-10T00:00:00+08:00' },
];
assert.equal(context.classRosterLowSince_(lowItem, events), '2026-09-01T00:00:00+08:00');
assert.equal(context.classRosterLowSince_({ ...lowItem, count: 4 }, events), '');
const policy = require('../shared/roster-recruitment.js');
for (const [days, level] of [[0,1], [13,1], [14,2], [20,2], [21,3], [28,4], [35,5], [70,5]]) {
  const now = new Date(Date.parse('2026-08-01T00:00:00+08:00') + days * 86400000);
  const warning = policy.evaluate({ count: 3, lowEnrollmentSince: '2026-08-01T00:00:00+08:00' }, now);
  assert.equal(warning.level, level); assert.equal(warning.days, days); assert.equal(warning.actions.length, 2);
}
assert.equal(policy.evaluate({ count: 4 }), null);
assert.equal(policy.evaluate({ count: 3, lowEnrollmentSince: '' }).days, null, '缺少日期不得捏造已持續兩週');
console.log('PASS teacher/PT ownership, privacy, shared writes, stale versions, duplicate requests and weekly recruitment escalation');
