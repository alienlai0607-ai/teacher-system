const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const path = require('node:path');
const source = fs.readFileSync(path.resolve(__dirname, '../apps-script/utils.gs'), 'utf8');
const calls = [];
const props = new Map([['SHEET_ID', 'qa-one']]);
let currentValue = 'initial';
const c = vm.createContext({
  PropertiesService: { getScriptProperties: () => ({ getProperty: key => props.get(key), setProperty: (key, value) => props.set(key, value) }) },
  SpreadsheetApp: { getActiveSpreadsheet: () => null, openById: id => { calls.push(id); return { getId: () => id, getSheetByName: () => ({ currentValue: () => currentValue }) }; } },
});
vm.runInContext(source, c);
assert.equal(c.getSS(), c.getSS());
assert.deepEqual(calls, ['qa-one']);
assert.equal(c.getSheet('Tasks').currentValue(), 'initial');
currentValue = 'changed by another execution';
assert.equal(c.getSheet('Tasks').currentValue(), currentValue, 'Do not cache business row values');
c.setSheetId('qa-two');
assert.equal(c.getSS().getId(), 'qa-two');
assert.deepEqual(calls, ['qa-one', 'qa-two']);
console.log('PASS spreadsheet handle reuse, fresh values and explicit database switch invalidation');
