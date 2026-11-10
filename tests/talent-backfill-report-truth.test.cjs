const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// 直接執行正式報表產生函式，截取送往 PDF 轉換的 HTML；不接觸正式 Drive。
let reportHtml = '';
let createdFiles = 0;
const folder = {
  getFilesByName: () => ({ hasNext: () => false }),
  getUrl: () => 'https://drive.google.com/drive/folders/test-folder',
  createFile: () => { createdFiles += 1; return { getId: () => 'test-report' }; },
};
const context = vm.createContext({
  console, Date, Math, Number, String, Array, Object, JSON, RegExp,
  getKpiPdfRootFolder_: () => folder,
  getOrCreateChildFolder_: () => folder,
  normalizeDepartment_: value => value,
  secureKpiReportPath_: () => {},
  secureKpiDriveItem_: () => {},
  Utilities: {
    newBlob: (html, type, name) => {
      assert.equal(type, 'text/html');
      assert.equal(name, 'talent.html');
      reportHtml = html;
      return { getAs: mime => {
        assert.equal(mime, 'application/pdf');
        return { setName: fileName => ({ fileName }) };
      } };
    },
  },
});
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'apps-script/talentrecords.gs'), 'utf8'), context);

const user = { nickname: '測試老師', department: '測試教室' };
const base = {
  id: 'talent-report-synthetic-test', date: '2026-06-06', entryVersion: 2,
  employment: 'pt', lessonStatus: 'held', lessonKind: 'scheduled', courseName: '測試課程', courseType: '積木測試',
  scheduleTime: '13:00–14:30', duration: 1.5, siteType: 'self', site: '測試教室',
  expected: 5, present: 5, makeup: 0, newCount: null, renewalCount: null, trial: null,
  roomFiles: [], roomDone: false, pay: 900, payTier: '5–7 人',
  bonusApproval: 'pending', adminBackfillApproved: true,
  adminBackfillUnknownFields: ['newCount', 'renewalCount', 'trial'],
  adminBackfillMissingEvidence: ['roomFiles'],
  adminBackfillNote: '分類人數及整潔照片未提供；<管理員>確認測試鐘點 900 元。',
};
function generate(changes = {}) {
  const lesson = { ...base, ...changes };
  const before = JSON.stringify(lesson);
  const result = context.generateTalentLessonPdf_(lesson, user);
  assert.equal(result.fileId, 'test-report');
  assert.equal(JSON.stringify(lesson), before, '產生報表不可改動原始資料');
  return reportHtml;
}

let html = generate();
assert.match(html, /正式到課總數<br><strong>5<\/strong>/);
for (const label of ['其中新生', '其中續報', '體驗另計', '教室整潔']) {
  assert.ok(html.includes(label + '<br><strong>未提供</strong>'), label + ' 應明確顯示未提供');
  assert.ok(!html.includes(label + '<br><strong>0</strong>'), label + ' 不可將未知誤報為 0');
}
assert.match(html, /新生 未提供；續報 未提供；狀態：待補資料，未核定獎金/);
assert.match(html, /本堂 NT\$900/);
assert.match(html, /&lt;管理員&gt;確認測試鐘點 900 元/);
assert.doesNotMatch(html, /當時無整潔照|<管理員>/, '不得添加未經確認的沒拍照斷言，且註記必須轉義');

html = generate({ adminBackfillUnknownFields: [] });
assert.match(html, /其中新生<br><strong>未提供<\/strong>/, '即使缺旗標，null 也不能誤報 0');
html = generate({ newCount: 0, renewalCount: 0, trial: 0 });
assert.match(html, /其中新生<br><strong>未提供<\/strong>/, '即使舊佔位為 0，未知旗標仍應優先');
html = generate({ adminBackfillUnknownFields: [], newCount: 0, renewalCount: 0, trial: 0 });
for (const label of ['其中新生', '其中續報', '體驗另計']) {
  assert.ok(html.includes(label + '<br><strong>0</strong>'), '已知零人仍必須正確顯示 0');
}

html = generate({ adminBackfillNote: '' });
assert.match(html, /此筆為管理員核定的歷史課程補登；僅顯示已提供的資料/);
assert.doesNotMatch(html, /當時無整潔照/);
html = generate({ bonusApproval: 'approved' });
assert.match(html, /待補資料，未核定獎金/, '未知人數不得被報表寫成已核准');

html = generate({
  adminBackfillApproved: false, adminBackfillUnknownFields: [], adminBackfillMissingEvidence: [],
  newCount: 2, renewalCount: 3, trial: 1, bonusApproval: 'approved',
  roomFiles: [{ fileName: '整潔照片.jpg', url: 'https://example.com/evidence.jpg' }],
});
assert.match(html, /其中新生<br><strong>2<\/strong>/);
assert.match(html, /其中續報<br><strong>3<\/strong>/);
assert.match(html, /體驗另計<br><strong>1<\/strong>/);
assert.match(html, /教室整潔<br><strong>已拍照<\/strong>/);
assert.match(html, /新生 2 人；續報 3 人；狀態：已核准/);
assert.match(html, /href="https:\/\/example.com\/evidence.jpg"/);

html = generate({ adminBackfillApproved: false, adminBackfillMissingEvidence: [] });
assert.match(html, /教室整潔<br><strong>未附照<\/strong>/, '一般紀錄未附照的原判定不變');
html = generate({ adminBackfillApproved: false, adminBackfillMissingEvidence: ['roomFiles'] });
assert.match(html, /教室整潔<br><strong>未提供<\/strong>/, '明確缺少照片資料的旗標應顯示未提供');
html = generate({ entryVersion: 1, parentStatus: 'complete', appStatus: 'published', appFiles: [], leave: 0, absent: 0 });
assert.match(html, /體驗<br><strong>未提供<\/strong>/, '舊版輸出也不可把明確未知人數寫成零');
assert.match(html, /課程問題及下次優化/, '舊制報表內容仍保留');
assert.equal(createdFiles, 10);
console.log('PASS talent backfill report truth: unknown counts, neutral photo status, exact note, known zeros, payroll and legacy preservation');
