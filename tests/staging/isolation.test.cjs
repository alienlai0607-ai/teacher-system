const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../..');
const source = fs.readFileSync(path.join(root, 'output/google-staging-20260914/candidate.gs'), 'utf8');

function context(values = {}, options = {}) {
  const writes = [];
  const c = vm.createContext({
    PropertiesService: { getScriptProperties: () => ({ getProperty: key => values[key] || '' }) },
    ScriptApp: { getScriptId: () => 'qa-script', getProjectTriggers: () => options.triggers || [] },
    SpreadsheetApp: { getActiveSpreadsheet: () => options.bound || null, openById: id => { writes.push(id); return { getId: () => id }; } },
  });
  vm.runInContext(source, c);
  return { c, writes };
}
const valid = { SHEET_ID: 'qa-sheet', QA_STAGE_SHEET: 'qa-sheet', QA_STAGE_SCRIPT: 'qa-script' };
for (const value of [{}, { ...valid, SHEET_ID: 'production-sheet' }, { ...valid, QA_STAGE_SCRIPT: 'production-script' }, { ...valid, LINE_TOKEN: 'not-a-real-token' }]) {
  const { c, writes } = context(value);
  assert.throws(() => c.getSS(), /QA_/);
  assert.equal(writes.length, 0);
}
for (const options of [{ bound: {} }, { triggers: [{}] }]) assert.throws(() => context(valid, options).c.getSS(), /QA/);
const good = context(valid);
assert.equal(good.c.getSS().getId(), 'qa-sheet');
assert.deepEqual(good.writes, ['qa-sheet']);
for (const entry of ['doGet', 'doPost']) assert.throws(() => context().c[entry]({}), /QA_ISOLATION_REQUIRED/);
const production = fs.readFileSync(path.join(root, 'apps-script/_all_in_one.gs'), 'utf8');
assert(!production.includes('qaStageGuard_'));
assert(!production.includes('function qaStageBootstrap'));
assert.equal((source.match(/const SHEET_ID = '';/g) || []).length, 1);
console.log('PASS: staging fails closed for uninitialized, wrong-sheet, wrong-project, notification and bound-project contexts; production source has no QA entry points.');
