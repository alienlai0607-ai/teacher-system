const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
let checked = 0;
for (const workspace of ['anqin-v2', 'talent-v2', 'admin-marketing-v1']) {
  const vendor = workspace === 'admin-marketing-v1' ? 'talent-v2' : workspace;
  const icons = require(path.join(root, 'review', vendor, 'vendor/lucide.min.js'));
  const source = fs.readFileSync(path.join(root, 'review', workspace, 'app.js'), 'utf8');
  const names = new Set([...source.matchAll(/\bicon\(\s*['"]([a-z0-9-]+)['"]/g)].map(match => match[1]));
  for (const name of names) {
    const key = name.split('-').map(part => part[0].toUpperCase() + part.slice(1)).join('');
    assert.ok(icons[key], workspace + ': unavailable icon ' + name);
    checked++;
  }
}
console.log('PASS ' + checked + ' literal UI icons exist in their bundled library; dynamic icons also checked by browser console gate');
