const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '../apps-script');
const target = path.join(root, '_all_in_one.gs');
const original = fs.readFileSync(target, 'utf8');
const modules = [
  'Code.gs', 'setup.gs', 'utils.gs', 'auth.gs', 'logs.gs', 'feedback.gs',
  'okr.gs', 'evaluation.gs', 'dashboard.gs', 'students.gs', 'tasks.gs',
  'archivefiles.gs', 'pdfreport.gs', 'courseprep.gs', 'talentrecords.gs',
  'adminmarketing.gs', 'externalapi.gs',
];
const header = `/**
 * 布拉克星球 KPI 系統 - 合併版（All-in-One v10）
 * 觸發詞：kpi系統
 * 此檔由 apps-script 各模組機械式合併，請勿單獨修改。
 * 合併日期：2026-10-05
 */

`;
const divider = name => `// ════════════════════════════════════════════════════════════\n//  ${name}\n// ════════════════════════════════════════════════════════════\n\n`;
const output = (header + modules.map(name => divider(name) + fs.readFileSync(path.join(root, name), 'utf8').trimEnd() + '\n\n').join('')).trimEnd() + '\n';
new vm.Script(output, { filename: '_all_in_one.gs' });
if (process.argv.includes('--check')) {
  if (original !== output) throw new Error('Apps Script bundle is out of date');
} else fs.writeFileSync(target, output);
console.log(`Apps Script bundle: ${modules.length} modules, syntax valid`);
