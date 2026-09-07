const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '../apps-script');
const target = path.join(root, '_all_in_one.gs');
const original = fs.readFileSync(target, 'utf8');
const pattern = /\/\/ [═]+\n\/\/  ([\w]+\.gs)\n\/\/ [═]+\n/g;
const sections = [...original.matchAll(pattern)];
if (!sections.length) throw new Error('Bundle section markers missing');
const header = original.slice(0, sections[0].index).replace(/合併日期：\d{4}-\d{2}-\d{2}/, '合併日期：2026-09-06');
const output = (header + sections.map(section => section[0] + '\n' + fs.readFileSync(path.join(root, section[1]), 'utf8').trimEnd() + '\n\n').join('')).trimEnd() + '\n';
new vm.Script(output, { filename: '_all_in_one.gs' });
if (process.argv.includes('--check')) {
  if (original !== output) throw new Error('Apps Script bundle is out of date');
} else fs.writeFileSync(target, output);
console.log(`Apps Script bundle: ${sections.length} modules, syntax valid`);
