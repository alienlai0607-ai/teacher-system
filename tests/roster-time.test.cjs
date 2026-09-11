const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const time = require('../shared/roster-time.js');
const context = vm.createContext({ Utilities: { formatDate(date, zone, format) {
  assert.equal(zone, 'Asia/Taipei');
  assert.equal(format, 'HH:mm');
  return new Date(date.getTime() + 8 * 3600000).toISOString().slice(11, 16);
} } });
vm.runInContext(fs.readFileSync(require.resolve('../apps-script/adminmarketing.gs'), 'utf8'), context);
const fixtures = [
  ['19:00', '19:00'], ['9:30', '09:30'], ['19:00:00', '19:00'],
  ['Sat Dec 30 1899 19:00:00 GMT+0800 (台北標準時間)', '19:00'],
  ['Sat Dec 30 1899 20:30:00 GMT+0800 (台北標準時間)', '20:30'],
  ['', ''], [null, ''], ['25:00', ''], ['19:60', ''], ['not a time', ''],
];
for (const [input, expected] of fixtures) {
  assert.equal(time.normalize(input), expected);
  assert.equal(context.classRosterTimeCell_(input), expected);
}
const result = context.classRosterClassObject_({ start_time: new Date('1899-12-30T11:00:00Z'), end_time: new Date('1899-12-30T12:30:00Z') });
assert.equal(result.start, '19:00');
assert.equal(result.end, '20:30');
assert.equal(context.classRosterTimeCell_(new Date('invalid')), '');
console.log('PASS spreadsheet Date cells and legacy time responses normalize to HH:mm');
