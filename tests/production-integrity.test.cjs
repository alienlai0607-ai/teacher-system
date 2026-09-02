const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const tasks = fs.readFileSync(path.join(root, 'apps-script/tasks.gs'), 'utf8');
const router = fs.readFileSync(path.join(root, 'apps-script/Code.gs'), 'utf8');
const auth = fs.readFileSync(path.join(root, 'apps-script/auth.gs'), 'utf8');
const api = fs.readFileSync(path.join(root, 'shared/api.js'), 'utf8');
const app = fs.readFileSync(path.join(root, 'review/anqin-v2/app.js'), 'utf8');

assert.match(router, /'runProductionIntegrityCheck': \(\) => runProductionIntegrityCheck\(params\)/);
assert.match(auth, /adminOnly[\s\S]*'runProductionIntegrityCheck'/);
assert.match(api, /runProductionIntegrityCheck: \(\) => call\('runProductionIntegrityCheck'\)/);
assert.match(app, /data-action="run-cloud-delivery-check"/);
assert.match(app, /一般連線成功不等於資料能交付/);
assert.match(api, /const API_URL = window\.APP_CONFIG\.API_URL/);
assert.doesNotMatch(api, /const URL = window\.APP_CONFIG\.API_URL/, 'API 網址不得遮蔽瀏覽器原生 URL 建構式');

const source = tasks.slice(
  tasks.indexOf('function runProductionIntegrityCheck('),
  tasks.indexOf('/** 管理員一鍵補齊每日 PDF', tasks.indexOf('function runProductionIntegrityCheck(')),
);

let systemLog = null;
const files = new Map();
let fileSequence = 0;

function makeBlob(value, mimeType, name) {
  const bytes = Buffer.isBuffer(value) ? value : Buffer.from(String(value));
  return {
    getBytes: () => Array.from(bytes),
    getDataAsString: () => bytes.toString('utf8'),
    getContentType: () => mimeType,
    name,
  };
}

function makeFile(blob) {
  const id = `qa-file-${++fileSequence}`;
  let trashed = false;
  const file = {
    getId: () => id,
    getName: () => blob.name,
    getBlob: () => blob,
    getSize: () => blob.getBytes().length,
    setTrashed: value => { trashed = Boolean(value); },
    isTrashed: () => trashed,
  };
  files.set(id, file);
  return file;
}

const folder = { createFile: blob => makeFile(blob) };
const context = vm.createContext({
  Date,
  JSON,
  Array,
  Number,
  String,
  Boolean,
  Buffer,
  SHEET_NAMES: { SYSTEM_LOG: 'Logs_System' },
  Utilities: {
    formatDate: () => '20260902-120000',
    getUuid: () => '12345678-aaaa-bbbb-cccc-123456789012',
    base64Decode: value => Buffer.from(value, 'base64'),
    newBlob: (value, mimeType, name) => makeBlob(value, mimeType, name),
  },
  LockService: {
    getScriptLock: () => ({ tryLock: () => true, releaseLock: () => {} }),
  },
  SpreadsheetApp: { flush: () => {} },
  DriveApp: { getFileById: id => files.get(id) },
  findUserByNickname: nickname => ({ nickname, role: 'admin', status: 'active' }),
  appendRow: (_sheet, row) => { systemLog = { ...row, _row: 2 }; return 2; },
  findObject: (_sheet, key, value) => systemLog && String(systemLog[key]) === String(value) ? systemLog : null,
  findRow: (_sheet, key, value) => systemLog && String(systemLog[key]) === String(value) ? 2 : -1,
  deleteRow: () => { systemLog = null; },
  parseJsonField: value => typeof value === 'string' ? JSON.parse(value) : value,
  getEvidenceRootFolder_: () => folder,
  getMaterialRootFolder_: () => folder,
  getOrCreateChildFolder_: parent => parent,
  secureKpiDriveItem_: () => {},
  getAttachmentPreviews: params => ({
    ok: true,
    previews: [{ fileId: params.file_ids[0], dataUrl: 'data:image/png;base64,AAAA' }],
    errors: [],
  }),
  pdfPhotoUri_: () => 'data:image/png;base64,AAAA',
  nowIso: () => '2026-09-02T12:00:00',
  systemMaintenanceUser_: () => null,
});

vm.runInContext(source, context);
const result = context.runProductionIntegrityCheck({
  __actor: { nickname: '柏翰', role: 'admin', status: 'active' },
});

assert.equal(result.ok, true);
assert.equal(result.summary.total, 4);
assert.equal(result.summary.passed, 4);
assert.equal(result.summary.failed, 0);
assert.equal(systemLog, null, '試算表 QA 資料必須清理');
assert.equal(Array.from(files.values()).every(file => file.isTrashed()), true, 'Drive QA 檔案必須全部移到垃圾桶');
assert.match(source, /const pdfPhoto = pdfPhotoUri_\(fileId\)/, '正式健康檢查必須實際驗證照片能嵌入 PDF');
assert.match(source, /pdf_embed: 'passed'/, '健康檢查結果需回報 PDF 圖片已通過');

console.log('production-integrity.test.cjs passed');
