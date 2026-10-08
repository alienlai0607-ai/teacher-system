const assert = require('node:assert/strict');
const { harness } = require('./system-logic-audit.test.cjs');

// Model the Sheets input boundary separately from the ordinary row-store double:
// leading '=' is a formula; leading apostrophe writes literal text. Capture the
// raw input and formula source as well as values, so untouched formulas matter.
function formulaAwareSheet(sheet) {
  const formulas = new Map();
  const writes = [];
  const originalRange = sheet.getRange;
  const originalAppend = sheet.appendRow;
  function input(value, row, column) {
    const key = row + ':' + column;
    formulas.delete(key);
    if (typeof value === 'string' && value.startsWith("'")) return value.slice(1);
    if (typeof value === 'string' && /^\s*=/.test(value)) {
      formulas.set(key, value);
      return 42;
    }
    return value;
  }
  sheet.getRange = (row, column, height = 1, width = 1) => {
    const range = originalRange(row, column, height, width);
    const setValues = range.setValues;
    range.setValues = values => {
      writes.push({ row, column, values: structuredClone(values) });
      return setValues.call(range, values.map((line, i) => line.map((value, j) => input(value, row + i, column + j))));
    };
    return range;
  };
  sheet.appendRow = values => {
    const row = sheet.getLastRow() + 1;
    writes.push({ row, column: 1, values: structuredClone([values]) });
    return originalAppend(values.map((value, i) => input(value, row, i + 1)));
  };
  return { formulas, writes };
}

{
  const { c, sheet } = harness();
  const target = sheet('LiteralText', ['id', 'note', 'custom_formula', 'flag', 'count', 'created_at', 'json']);
  const { formulas, writes } = formulaAwareSheet(target);
  const date = new Date('2026-09-16T00:00:00.000Z');
  const original = '=HYPERLINK("https://example.invalid", "教學原文")';
  c.appendRow('LiteralText', { id: 'literal', note: original, flag: false, count: 0, created_at: date, json: { text: '=1+1' } });
  assert.equal(c.findObject('LiteralText', 'id', 'literal').note, original);
  assert.equal(formulas.size, 0, 'User text must not become formula source');
  assert.equal(writes[0].values[0][1], "'" + original);
  target.getRange(2, 3, 1, 1).setValues([['=6*7']]); // Existing intentional sheet formula.
  const before = writes.length;
  c.updateRow('LiteralText', 2, { note: '  =1+1\n第二行', count: 7 });
  const row = c.findObject('LiteralText', 'id', 'literal');
  assert.equal(row.note, '  =1+1\n第二行');
  assert.equal(row.flag, false);
  assert.equal(row.count, 7);
  assert.equal(row.created_at.getTime(), date.getTime());
  assert.deepEqual(JSON.parse(row.json), { text: '=1+1' });
  assert.equal(formulas.get('2:3'), '=6*7', 'Unspecified formulas must retain their source');
  assert.equal(formulas.size, 1);
  assert.deepEqual(writes.slice(before).map(write => write.column), [2, 5], 'Only changed cells should be written');
  c.updateRow('LiteralText', 2, { flag: true });
  assert.equal(c.findObject('LiteralText', 'id', 'literal').note, '  =1+1\n第二行', 'Later updates must not reinterpret stored text');
  assert.equal(formulas.size, 1);
  c.updateRow('LiteralText', 2, { note: null });
  assert.equal(c.findObject('LiteralText', 'id', 'literal').note, '');
}

{
  const { c, request } = harness();
  const target = c.getSheet('Tasks');
  c.ensureHeaders(target, ['custom_formula']);
  const { formulas } = formulaAwareSheet(target);
  const task = { id: '=task-identifier', title: '=1+1', source: '=A1', status: 'open' };
  const created = request('north', 'saveSelfTask', { request_id: 'safe-create', task });
  assert.equal(created.ok, true);
  let row = c.findObject('Tasks', 'task_id', task.id);
  assert.equal(row.title, task.title);
  assert.equal(row.detail, task.source);
  assert.equal(formulas.size, 0);
  target.getRange(2, 12, 1, 1).setValues([['=6*7']]);
  const completed = request('north', 'saveSelfTask', { request_id: 'safe-complete', task: { ...task, status: 'done', cloudUpdatedAt: created.updated_at } });
  assert.equal(completed.ok, true);
  row = c.findObject('Tasks', 'task_id', task.id);
  assert.equal(row.title, task.title);
  assert.equal(row.detail, task.source);
  assert.equal(row.status, 'done');
  assert.equal(formulas.get('2:12'), '=6*7');
  assert.equal(formulas.size, 1);
  assert.equal(c.sheetToObjects('Tasks').length, 1, 'Formula-looking IDs must be found on later updates');
  assert.equal(request('north', 'deleteSelfTask', { request_id: 'safe-delete', task_id: task.id }).ok, true);
  assert.equal(c.findObject('Tasks', 'task_id', task.id).status, 'deleted');
  assert.equal(formulas.get('2:12'), '=6*7');
}
console.log('PASS: plain text stays literal across create/update/delete; typed data and unrelated real formulas remain unchanged.');

// Exercise the editor-only staging check and both success/failure cleanup paths.
for (const corruptReadback of [false, true]) {
  const { c } = harness();
  const fs = require('node:fs');
  const path = require('node:path');
  const vm = require('node:vm');
  const ss = c.getSS();
  const originalInsert = ss.insertSheet;
  const originalLookup = ss.getSheetByName;
  const removed = new Set();
  let created = 0;
  ss.getSheetByName = name => removed.has(name) ? undefined : originalLookup(name);
  ss.deleteSheet = sheet => removed.add(sheet.getName());
  ss.insertSheet = name => {
    const sheet = originalInsert(name);
    const { formulas } = formulaAwareSheet(sheet);
    const originalRange = sheet.getRange;
    const id = ++created;
    sheet.getSheetId = () => id;
    sheet.getRange = (row, column, height = 1, width = 1) => {
      const range = originalRange(row, column, height, width);
      range.getFormula = () => formulas.get(row + ':' + column) || '';
      range.setFormula = formula => range.setValues([[formula]]);
      if (corruptReadback && row === 2 && column === 1 && width === 7) {
        const getValues = range.getValues;
        range.getValues = () => { const values = getValues(); values[0][1] = 42; return values; };
      }
      return range;
    };
    return sheet;
  };
  c.Session.getActiveUser = () => ({ getEmail: () => 'owner@example.invalid' });
  c.PropertiesService.getScriptProperties().setProperty('QA_STAGE_OWNER', 'owner@example.invalid');
  vm.runInContext(fs.readFileSync(path.join(__dirname, 'staging/cloud-acceptance.gs'), 'utf8'), c);
  c.qaStageGuard_ = () => {};
  const result = c.qaStageLiteralText();
  assert.equal(result.ok, !corruptReadback);
  assert.equal(result.cleanup_complete, true, 'Test sheet is removed even when an assertion fails');
  assert.equal(ss.getSheetByName(result.run_id), undefined);
  assert.equal(result.release, '20261008-release-1');
  if (corruptReadback) assert.match(result.error, /Created text became a formula/);
  else assert.equal(result.checks.length, 3);
  const countBefore = created;
  c.Session.getActiveUser = () => ({ getEmail: () => 'someone-else@example.invalid' });
  assert.throws(() => c.qaStageLiteralText(), /QA owner required/);
  assert.equal(created, countBefore, 'Owner rejection must precede sheet creation');
}
console.log('PASS: staging text check detects changed content, always cleans its own sheet, and rejects other editor identities.');
