const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../review/anqin-v2/app.js'), 'utf8');
function fn(name) {
  const start = source.indexOf(`  async function ${name}(`);
  assert.ok(start >= 0, name);
  const next = /\n  (?:async )?function \w+\(/g;
  next.lastIndex = start + 20;
  const end = next.exec(source)?.index || source.lastIndexOf('})();');
  return source.slice(start, end);
}

(async () => {
  const calls = [];
  const context = vm.createContext({
    state: { integration: { cloudSyncEnabled: true }, context: { teacher: 'QA老師' }, daily: { date: '2026-10-05' } },
    ensureCloudTeacherIdentity: async () => ({ ok: true }),
    cloudTeacherNickname: () => 'QA',
    dataUrlPayload: value => ({ mimeType: 'image/jpeg', base64: String(value).split(',')[1] }),
    uploadCompressedPhoto: async () => assert.fail('多張照片不可退回單張請求'),
    window: { API: { uploadPhotos: true } },
    API: {
      uploadPhotos: async payload => {
        calls.push(payload);
        await new Promise(resolve => setTimeout(resolve, 120));
        return { ok: true, uploaded: payload.photos.length, failed: 0, results: payload.photos.map((photo, index) => ({ ok: true, clientId: photo.clientId, fileId: `batch-${index}`, url: `https://drive.google.com/file/d/batch-${index}/view` })) };
      },
    },
    Map,
  });
  vm.runInContext(fn('uploadCompressedPhotos'), context);
  const image = `data:image/jpeg;base64,${Buffer.alloc(460 * 1024, 7).toString('base64')}`;
  const items = Array.from({ length: 8 }, (_, index) => ({ clientId: `photo-${index}`, fileName: `photo-${index}.jpg`, dataUrl: image, kpi: (index % 6) + 1, description: '效能驗收' }));
  const started = Date.now();
  const results = await context.uploadCompressedPhotos(items, { date: '2026-10-05', teacher: 'QA老師' });
  const elapsed = Date.now() - started;
  assert.equal(calls.length, 1, '8 張照片必須合併為 1 次請求');
  assert.equal(calls[0].photos.length, 8);
  assert.equal(results.filter(item => item.ok).length, 8);
  assert.ok(elapsed < 600, `批次模擬不應退化為 8 次串行等待：${elapsed}ms`);
  console.log(`PASS 8 photos use 1 batch request in ${elapsed}ms simulated transport`);
})().catch(error => { console.error(error); process.exitCode = 1; });
