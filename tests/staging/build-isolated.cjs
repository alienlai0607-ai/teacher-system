const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');

const root = path.resolve(__dirname, '../..');
const out = path.join(root, 'output/google-staging-20260914');
const digest = value => crypto.createHash('sha256').update(value).digest('hex');
const original = fs.readFileSync(path.join(root, 'apps-script/_all_in_one.gs'), 'utf8');
const setup = fs.readFileSync(path.join(root, 'apps-script/setup.gs'), 'utf8');
const names = vm.runInNewContext(fs.readFileSync(path.join(root, 'apps-script/Code.gs'), 'utf8') + '\nJSON.stringify(SHEET_NAMES);');
const schemaStart = setup.indexOf('  const schemas = ');
const schemaEnd = setup.indexOf('\n  };', schemaStart);
assert(schemaStart > 0 && schemaEnd > schemaStart);
const schemas = vm.runInNewContext('(' + setup.slice(schemaStart + '  const schemas = '.length, schemaEnd + 4) + ')', { SHEET_NAMES: JSON.parse(names) });
assert(schemas.Users && schemas.DailyLogs && schemas.Tasks);

let source = original;
const changes = [];
function replaceOnce(before, after) {
  assert.equal(source.split(before).length, 2, 'Expected one source configuration match: ' + before);
  source = source.replace(before, after);
  changes.push({ before, after });
}
replaceOnce("const SHEET_ID = '14JSTOpzxmjdaErdjsc-54mSsDe6bZ5Trchas-NHWTS8';", "const SHEET_ID = ''; // Isolated QA: no production fallback.");
for (const name of ['KPI日報PDF', 'KPI月歸檔', 'KPI教材', 'KPI證據']) {
  const needle = "'" + name + "'";
  const count = source.split(needle).length - 1;
  assert(count > 0, name);
  source = source.split(needle).join("'KPI-QA-20260914-" + name + "'");
  changes.push({ before: needle, after: 'KPI-QA-20260914-' + name, count });
}
// These guards exist only in the generated QA artifact, never in the release.
replaceOnce('function getSS() {', 'function getSS() {\n  qaStageGuard_();');
replaceOnce('function doGet(e) {', 'function doGet(e) {\n  qaStageGuard_();');
replaceOnce('function doPost(e) {', 'function doPost(e) {\n  qaStageGuard_();');
replaceOnce('function withRecordWriteLock_(callback, beforeAnyWrite) {', 'function qaOriginalRecordWriteLock_(callback, beforeAnyWrite) {');
replaceOnce('function jsonOut(obj) {', 'function jsonOut(obj) {\n  obj = Object.assign({}, obj, { qa_lock_timings: qaStageLockTimings_ });');
const fixtures = JSON.parse(fs.readFileSync(path.join(out, 'media-fixtures.json'), 'utf8'));
const addon = fs.readFileSync(path.join(__dirname, 'media-acceptance.gs'), 'utf8') + '\nconst QA_STAGE_MEDIA_FIXTURES_ = ' + JSON.stringify(fixtures) + ';\n' + fs.readFileSync(path.join(__dirname, 'cloud-acceptance.gs'), 'utf8');
const built = addon + '\nconst QA_STAGE_SCHEMAS_ = ' + JSON.stringify(schemas) + ';\n' + source;
new vm.Script(built);
assert(!built.includes("const SHEET_ID = '14JST"));
assert(!/getFoldersByName\('KPI(?:日報PDF|月歸檔|教材|證據)'\)/.test(built));
fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, 'candidate.gs'), built);
fs.copyFileSync(path.join(root, 'apps-script/appsscript.json'), path.join(out, 'appsscript.json'));
const manifest = { generated_at: new Date().toISOString(), production_source_sha256: digest(original), candidate_sha256: digest(built), changes,
  isolation: 'Separate script, empty spreadsheet, unique Drive root names, no LINE credentials or triggers',
  limitation: 'Google account-level quotas remain shared; load tests require operator supervision' };
fs.writeFileSync(path.join(out, 'manifest.json'), JSON.stringify(manifest, null, 2));
console.log(JSON.stringify(manifest, null, 2));
