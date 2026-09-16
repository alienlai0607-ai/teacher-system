const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.resolve(__dirname, '../review/anqin-v2/app.js'), 'utf8');
const block = (start, end) => source.slice(source.indexOf(start), source.indexOf(end, source.indexOf(start)));
function persistPhoto(cloudUrl, failWithPhoto = false, failAll = false) {
  const indicators = [];
  let noticeRefreshes = 0;
  const state = { ui: {}, photo: { dataUrl: 'data:image/jpeg;base64,' + 'a'.repeat(900000), cloudUrl } };
  const runtimeHealth = {};
  const context = vm.createContext({
    state, runtimeHealth, MAX_PERSISTED_MEDIA_CHARS: 850000,
    STORAGE_KEY: 'main', BACKUP_KEY: 'backup', lastStorageToastAt: 0,
    localStorage: { setItem(key, value) { if (failAll || (failWithPhoto && value.includes('data:image'))) { const e = new Error('full'); e.name = 'QuotaExceededError'; throw e; } }, removeItem() {} },
    materialCloudUrl: item => item.cloudUrl || '',
    updateSaveIndicator: (status, text) => indicators.push({status, text}), toast() {},
    refreshSystemStatusNotice() { noticeRefreshes++; },
  });
  vm.runInContext(block('  function embeddedMediaCharacters(', '  function rewriteRecoveredStartupState(')
    + block('  function writeSafeBackup(', '  function schedulePersist('), context);
  context.persist();
  return {runtimeHealth, indicators, noticeRefreshes};
}
const pending = persistPhoto('');
assert.doesNotMatch(pending.indicators.at(-1).text, /照片由雲端保存/, '未上傳照片不得宣稱由雲端保存');
assert.match(pending.runtimeHealth.mediaPersistWarning, /請勿關閉/);
assert.match(pending.indicators.at(-1).text, /尚未上傳/);
assert.equal(pending.noticeRefreshes, 1, '照片儲存警告需立即更新手機上的安全提醒');
const uploaded = persistPhoto('https://drive.google.com/file/d/synthetic/view');
assert.equal(uploaded.runtimeHealth.mediaPersistWarning, '');
assert.equal(uploaded.indicators.at(-1).status, 'saved');
const failed = persistPhoto('', false, true);
assert.match(failed.runtimeHealth.persistError, /請勿關閉/);
assert.doesNotMatch(failed.runtimeHealth.persistError, /文字已安全備份|照片改由雲端保存|重新整理後重試/);
console.log('PASS: storage warnings never claim unuploaded photos are saved in the cloud.');
