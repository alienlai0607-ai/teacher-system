const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const teacher = { nickname: 'QA-owner', email: 'owner@example.invalid', role: 'teacher', status: 'active', department: 'A' };
const admin = { nickname: 'QA-admin', email: ' OWNER@example.invalid ', role: 'admin', status: 'active' };
const manager = { nickname: 'QA-manager', email: 'manager@example.invalid', role: 'manager', status: 'active', department: 'A' };
let users = [admin, teacher, manager];
const context = vm.createContext({
  SHEET_NAMES: { USERS: 'Users' }, sheetToObjects: () => users,
  normalizeDepartment_: value => value,
  sameDepartment_: (a, b) => a === b,
  talentAssignments_: () => [], isGlobalManager_: () => false,
  DriveApp: { Access: { PRIVATE: 'PRIVATE' }, Permission: { VIEW: 'VIEW', EDIT: 'EDIT', OWNER: 'OWNER' } },
});
vm.runInContext(fs.readFileSync(`${__dirname}/../apps-script/archivefiles.gs`, 'utf8'), context);
const viewers = context.kpiDriveViewerUsers_(teacher, 'anqin', []);
assert.equal(viewers.length, 2);
assert.equal(viewers[0].nickname, teacher.nickname);
assert.equal(users[0], admin, 'Do not reorder the data source');
let permission = 'VIEW';
let sharing = 'PRIVATE';
const file = { isTrashed: () => false, getSize: () => 123,
  getSharingAccess: () => sharing,
  getOwner: () => ({ getEmail: () => teacher.email }),
  getAccess: () => permission,
};
assert.doesNotThrow(() => context.assertKpiFileReadable_(file, teacher, 'anqin'));
permission = 'NONE';
assert.throws(() => context.assertKpiFileReadable_(file, teacher, 'anqin'), error => error.code === 'FILE_ACCESS_PENDING');
permission = 'VIEW'; sharing = 'ANYONE';
assert.throws(() => context.assertKpiFileReadable_(file, teacher, 'anqin'), error => error.code === 'FILE_ACCESS_PENDING');
sharing = 'PRIVATE';
users = [admin, { ...teacher, status: 'suspended' }, manager];
assert.throws(() => context.assertKpiFileReadable_(file, teacher, 'anqin'), error => error.code === 'FILE_ACCESS_PENDING');
users = [admin, { ...teacher, email: '' }, manager];
assert.throws(() => context.assertKpiFileReadable_(file, teacher, 'anqin'), error => error.code === 'FILE_ACCESS_PENDING');
users = [teacher, { ...admin, email: 'separate@example.invalid' }, manager];
assert.equal(context.kpiDriveViewerUsers_(teacher, 'anqin', []).length, 3);
assert.equal(context.kpiDriveViewerUsers_(null, 'root', []).length, 1);
console.log('PASS: shared-email owner identity retained; distinct viewers unchanged; suspended, email-less, public, and inaccessible files still fail closed.');
