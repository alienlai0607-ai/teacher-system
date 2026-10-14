const assert = require('node:assert/strict');
const { harness } = require('./system-logic-audit.test.cjs');

const SOURCE_ID = 'LOG-20261014-羊羊';
const TARGET_ID = 'LOG-20261013-羊羊';
const SOURCE_DATE = '2026-10-14';
const TARGET_DATE = '2026-10-13';
const SOURCE_REVISION = '2a9348b6-e75e-4b88-ae17-8389672711c2';
const MARKER = 'repair-yangyang-anqin-date-20261013-v1';
const DEFERRED_KEY = 'DEFERRED_TEACHER_REPORT_JOB_V1_kpi_' + Buffer.from(SOURCE_DATE + '|羊羊').toString('base64url');
const plain = value => JSON.parse(JSON.stringify(value));

function sourceRow(overrides = {}) {
  return {
    log_id: SOURCE_ID,
    date: SOURCE_DATE,
    nickname: '羊羊',
    department: '北區教室',
    role: 'teacher',
    kpi1_data: { lessonDate: SOURCE_DATE, savedAt: '2026-10-14T09:01:02+08:00', teacherText: SOURCE_DATE },
    kpi2_data: { cleanup: { date: SOURCE_DATE } },
    kpi3_data: { courses: [{ date: SOURCE_DATE, title: '原課程' }] },
    kpi4_data: {},
    kpi5_data: { contacts: [{ date: SOURCE_DATE, createdAt: '2026-10-14T09:02:03+08:00' }] },
    kpi6_data: {
      today_done: '羊羊 13 號完成內容',
      tomorrow_todo: SOURCE_DATE,
      v2_snapshot: {
        schema: 'anqin-v2',
        savedAt: '2026-10-14T09:03:04+08:00',
        submission: {
          id: 'submission-original', teacher: '羊羊', date: SOURCE_DATE,
          activitySnapshots: [{ id: 'activity-original', date: SOURCE_DATE, dueDate: TARGET_DATE, exactText: SOURCE_DATE }],
          studentCaseSnapshots: [{ id: 'case-original', date: SOURCE_DATE, dueDate: TARGET_DATE }],
          contactSnapshots: [{ id: 'contact-original', date: SOURCE_DATE, followupDate: TARGET_DATE }],
        },
        daily: { date: SOURCE_DATE, teacherNote: SOURCE_DATE },
        prepSources: [{ id: 'prep-original', date: SOURCE_DATE, updatedAt: '2026-10-14T08:45:00+08:00' }],
        operation: { id: 'op_2026-10-14_羊羊', date: SOURCE_DATE, dutyOwner: '羊羊', evidenceByCheck: {} },
      },
    },
    reflection: '原始心得',
    attachments: [{ url: 'https://drive.google.com/file/d/original/view' }],
    created_at: '2026-10-14T08:00:00',
    updated_at: '2026-10-14T09:10:11',
    submitted_at: '2026-10-14T09:12:13',
    locked: false,
    is_makeup: true,
    record_revision: SOURCE_REVISION,
    last_request_id: 'original-request',
    delivery_state: 'pending',
    delivery_error: '舊排程中',
    evidence_state: 'pending',
    delivery_attempted_at: '2026-10-14T09:13:14',
    ...overrides,
  };
}

function setup(options = {}) {
  const fixture = harness();
  const { c, sheet } = fixture;
  c.Session.getActiveUser = () => ({ getEmail: () => 'boss@example.invalid' });
  c.appendRow('Users', { nickname: '羊羊', role: 'teacher', department: '北區教室', status: 'active', email: 'yangyang@example.invalid' });
  sheet('DailyLogs', [
    'log_id', 'date', 'nickname', 'department', 'role',
    'kpi1_data', 'kpi2_data', 'kpi3_data', 'kpi4_data', 'kpi5_data', 'kpi6_data',
    'reflection', 'attachments', 'created_at', 'updated_at', 'submitted_at', 'locked', 'is_makeup',
    'record_revision', 'last_request_id', 'delivery_state', 'delivery_error', 'evidence_state', 'delivery_attempted_at',
  ]);
  sheet('Evidence', ['evidence_id', 'log_id', 'nickname', 'date', 'kpi_category', 'type', 'url', 'description', 'source_type', 'created_at']);
  sheet('Feedback', ['feedback_id', 'log_id', 'from_nickname', 'to_nickname', 'content', 'tag', 'created_at', 'read_at']);
  if (options.source !== false) c.appendRow('DailyLogs', sourceRow(options.sourceOverrides));
  if (options.target) c.appendRow('DailyLogs', sourceRow({
    log_id: TARGET_ID,
    date: TARGET_DATE,
    record_revision: 'target-revision',
    last_request_id: options.targetMarker || 'another-writer',
  }));
  return fixture;
}

let passed = 0;
function test(name, fn) {
  fn();
  passed += 1;
  console.log('PASS ' + name);
}

test('目標已存在時硬擋，不改來源或關聯資料', () => {
  const { c } = setup({ target: true });
  c.appendRow('Evidence', { evidence_id: 'source-e', log_id: SOURCE_ID, nickname: '羊羊', date: SOURCE_DATE, url: 'source' });
  const before = plain(c.sheetToObjects('DailyLogs'));
  const result = c.repairYangyangAnqinDate20261013FromEditor();
  assert.equal(result.code, 'REPAIR_TARGET_EXISTS');
  assert.deepEqual(plain(c.sheetToObjects('DailyLogs')), before);
  assert.equal(c.sheetToObjects('Evidence')[0].log_id, SOURCE_ID);
});

test('來源 revision 不一致時停止，不使用模糊日期搬移', () => {
  const { c } = setup({ sourceOverrides: { record_revision: 'newer-revision' } });
  const result = c.repairYangyangAnqinDate20261013FromEditor();
  assert.equal(result.code, 'REPAIR_SOURCE_REVISION_CHANGED');
  assert.ok(c.findObject('DailyLogs', 'log_id', SOURCE_ID));
  assert.equal(c.findObject('DailyLogs', 'log_id', TARGET_ID), null);
});

test('整筆搬移並只同步 business record date、Evidence、Feedback 與 operation id', () => {
  const { c, locked } = setup();
  const originalRawKpi = {};
  ['kpi1_data', 'kpi2_data', 'kpi3_data', 'kpi4_data', 'kpi5_data'].forEach(field => {
    originalRawKpi[field] = c.findObject('DailyLogs', 'log_id', SOURCE_ID)[field];
  });
  c.appendRow('DailyLogs', sourceRow({
    log_id: 'LOG-OTHER', date: '2026-10-12', nickname: 'north', record_revision: 'other-revision',
    reflection: '其他老師資料不可改動', last_request_id: 'other-request',
  }));
  const otherDailyBefore = plain(c.findObject('DailyLogs', 'log_id', 'LOG-OTHER'));
  c.appendRow('Evidence', { evidence_id: 'move-e-1', log_id: SOURCE_ID, nickname: '羊羊', date: SOURCE_DATE, url: 'move-1', created_at: '2026-10-14T09:20:00' });
  c.appendRow('Evidence', { evidence_id: 'move-e-2', log_id: SOURCE_ID, nickname: '羊羊', date: SOURCE_DATE, url: 'move-2', created_at: '2026-10-14T09:21:00' });
  c.appendRow('Evidence', { evidence_id: 'other-e', log_id: 'LOG-OTHER', nickname: 'north', date: SOURCE_DATE, url: 'keep', created_at: 'keep-e-time' });
  c.appendRow('Feedback', { feedback_id: 'move-f-1', log_id: SOURCE_ID, from_nickname: 'boss', to_nickname: '羊羊', content: '保留回饋', created_at: '2026-10-14T09:22:00' });
  c.appendRow('Feedback', { feedback_id: 'other-f', log_id: 'LOG-OTHER', from_nickname: 'boss', to_nickname: 'north', content: '其他資料', created_at: 'keep-f-time' });
  const props = c.PropertiesService.getScriptProperties();
  props.setProperty(DEFERRED_KEY, JSON.stringify({ type: 'kpi', nickname: '羊羊', date: SOURCE_DATE }));
  let pdfCall;
  c.notifyUser_ = () => { throw new Error('修復不可發通知'); };
  c.generatePersonKpiPdf_ = (nickname, date) => {
    assert.equal(locked(), false, 'PDF 必須在寫入鎖外重建');
    pdfCall = { nickname, date };
    return { url: 'https://drive.google.com/file/d/rebuilt/view' };
  };

  const result = c.repairYangyangAnqinDate20261013FromEditor();
  assert.equal(result.ok, true, result.error);
  assert.equal(result.repaired, true);
  assert.deepEqual(pdfCall, { nickname: '羊羊', date: TARGET_DATE });
  assert.equal(result.pdf.ok, true);
  assert.equal(c.findObject('DailyLogs', 'log_id', SOURCE_ID), null);
  const moved = c.findObject('DailyLogs', 'log_id', TARGET_ID);
  assert.ok(moved);
  assert.equal(moved.date, TARGET_DATE);
  assert.equal(moved.is_makeup, false);
  assert.equal(moved.last_request_id, MARKER);
  assert.notEqual(moved.record_revision, SOURCE_REVISION);
  assert.equal(moved.delivery_state, 'complete');
  assert.equal(moved.evidence_state, 'ready');
  assert.equal(moved.created_at, '2026-10-14T08:00:00');
  assert.equal(moved.updated_at, '2026-10-14T09:10:11');
  assert.equal(moved.submitted_at, '2026-10-14T09:12:13');
  assert.equal(moved.delivery_attempted_at, '2026-10-14T09:13:14');

  const kpi1 = JSON.parse(moved.kpi1_data);
  const kpi6 = JSON.parse(moved.kpi6_data);
  Object.entries(originalRawKpi).forEach(([field, raw]) => {
    assert.equal(moved[field], raw, `${field} 原始儲存值不可被重寫或重排`);
  });
  assert.equal(kpi1.lessonDate, SOURCE_DATE, '非 schema business record date 不可被猜測改寫');
  assert.equal(kpi1.teacherText, SOURCE_DATE, '老師任意文字即使恰為 10/14 也必須保留');
  assert.equal(kpi1.savedAt, '2026-10-14T09:01:02+08:00', '時間戳不可被日期修復改寫');
  assert.equal(kpi6.v2_snapshot.submission.date, TARGET_DATE);
  assert.equal(kpi6.v2_snapshot.submission.activitySnapshots[0].date, TARGET_DATE);
  assert.equal(kpi6.v2_snapshot.submission.activitySnapshots[0].dueDate, TARGET_DATE, '追蹤期限本來就是 10/13 的下一日，不可再改');
  assert.equal(kpi6.v2_snapshot.submission.activitySnapshots[0].exactText, SOURCE_DATE, '任意內容欄不得因值剛好等於來源日被改寫');
  assert.equal(kpi6.v2_snapshot.submission.studentCaseSnapshots[0].date, TARGET_DATE);
  assert.equal(kpi6.v2_snapshot.submission.studentCaseSnapshots[0].dueDate, TARGET_DATE);
  assert.equal(kpi6.v2_snapshot.submission.contactSnapshots[0].date, TARGET_DATE);
  assert.equal(kpi6.v2_snapshot.submission.contactSnapshots[0].followupDate, TARGET_DATE);
  assert.equal(kpi6.v2_snapshot.daily.date, TARGET_DATE);
  assert.equal(kpi6.v2_snapshot.daily.teacherNote, SOURCE_DATE, '老師備註不可被日期修復改字');
  assert.equal(kpi6.v2_snapshot.prepSources[0].date, SOURCE_DATE, '備課建立日不是 KPI business record date，必須保留');
  assert.equal(kpi6.tomorrow_todo, SOURCE_DATE, '任意 KPI 文字欄不得被日期修復改字');
  assert.equal(kpi6.v2_snapshot.savedAt, '2026-10-14T09:03:04+08:00');
  assert.equal(kpi6.v2_snapshot.operation.date, TARGET_DATE);
  assert.equal(kpi6.v2_snapshot.operation.id, 'op_2026-10-13_羊羊');

  const evidence = c.sheetToObjects('Evidence');
  assert.deepEqual(evidence.filter(row => row.evidence_id.startsWith('move-')).map(row => [row.log_id, row.date]), [
    [TARGET_ID, TARGET_DATE], [TARGET_ID, TARGET_DATE],
  ]);
  assert.deepEqual(plain(evidence.find(row => row.evidence_id === 'other-e')), {
    evidence_id: 'other-e', log_id: 'LOG-OTHER', nickname: 'north', date: SOURCE_DATE,
    kpi_category: '', type: '', url: 'keep', description: '', source_type: '', created_at: 'keep-e-time',
  });
  const feedback = c.sheetToObjects('Feedback');
  assert.equal(feedback.find(row => row.feedback_id === 'move-f-1').log_id, TARGET_ID);
  assert.equal(feedback.find(row => row.feedback_id === 'move-f-1').created_at, '2026-10-14T09:22:00');
  assert.equal(feedback.find(row => row.feedback_id === 'other-f').log_id, 'LOG-OTHER');
  assert.equal(feedback.find(row => row.feedback_id === 'other-f').created_at, 'keep-f-time');
  assert.deepEqual(plain(c.findObject('DailyLogs', 'log_id', 'LOG-OTHER')), otherDailyBefore);
  assert.equal(props.getProperty(DEFERRED_KEY), undefined);
  const audit = c.sheetToObjects('Logs_System').at(-1);
  assert.equal(audit.action, 'repair_yangyang_anqin_date');
  assert.equal(audit.target, TARGET_ID);
  assert.equal(JSON.parse(audit.detail).notification_sent, false);
  assert.equal(result.source_pdf_review.automatically_deleted, false);
  assert.equal(result.source_pdf_review.required, true);
  assert.match(result.source_pdf_review.note, /不自動刪除/);

  const beforeReplay = plain(moved);
  const replay = c.repairYangyangAnqinDate20261013FromEditor();
  assert.equal(replay.ok, true);
  assert.equal(replay.duplicate, true);
  assert.equal(replay.repaired, false);
  const afterReplay = plain(c.findObject('DailyLogs', 'log_id', TARGET_ID));
  assert.deepEqual(afterReplay, beforeReplay, '冪等重跑不可改寫目標資料');
});

test('來源不存在時，只有帶精確 repair marker 的目標可冪等', () => {
  const invalid = setup({ source: false, target: true });
  assert.equal(invalid.c.repairYangyangAnqinDate20261013FromEditor().code, 'REPAIR_SOURCE_NOT_FOUND');
  const valid = setup({ source: false, target: true, targetMarker: MARKER });
  valid.c.generatePersonKpiPdf_ = () => ({ url: 'https://drive.google.com/file/d/replay/view' });
  const result = valid.c.repairYangyangAnqinDate20261013FromEditor();
  assert.equal(result.ok, true);
  assert.equal(result.duplicate, true);
  assert.equal(valid.c.findObject('DailyLogs', 'log_id', TARGET_ID).record_revision, 'target-revision');
});

test('PDF 重建失敗只回報，不回滾已正確搬移的資料', () => {
  const { c } = setup();
  c.generatePersonKpiPdf_ = () => { throw new Error('模擬 PDF 服務中斷'); };
  const result = c.repairYangyangAnqinDate20261013FromEditor();
  assert.equal(result.ok, true);
  assert.equal(result.repaired, true);
  assert.equal(result.pdf.ok, false);
  assert.match(result.pdf.error, /PDF 服務中斷/);
  assert.equal(c.findObject('DailyLogs', 'log_id', SOURCE_ID), null);
  assert.ok(c.findObject('DailyLogs', 'log_id', TARGET_ID));
});

test('正式舊資料的羊羊老師班務編號可安全搬移並保留稱謂', () => {
  const legacy = sourceRow();
  legacy.kpi6_data.v2_snapshot.operation.id = 'op_2026-10-14_羊羊老師';
  legacy.kpi6_data.v2_snapshot.operation.dutyOwner = '羊羊老師';
  const { c } = setup({ sourceOverrides: { kpi6_data: legacy.kpi6_data } });
  c.generatePersonKpiPdf_ = () => ({ url: 'https://drive.google.com/file/d/legacy-owner/view' });
  const result = c.repairYangyangAnqinDate20261013FromEditor();
  assert.equal(result.ok, true, result.error);
  const moved = c.findObject('DailyLogs', 'log_id', TARGET_ID);
  const kpi6 = JSON.parse(moved.kpi6_data);
  assert.equal(kpi6.v2_snapshot.operation.id, 'op_2026-10-13_羊羊老師');
  assert.equal(kpi6.v2_snapshot.operation.dutyOwner, '羊羊老師');
});

test('其他老師的班務編號仍會硬擋且不寫入', () => {
  const invalid = sourceRow();
  invalid.kpi6_data.v2_snapshot.operation.id = 'op_2026-10-14_其他老師';
  const { c } = setup({ sourceOverrides: { kpi6_data: invalid.kpi6_data } });
  const result = c.repairYangyangAnqinDate20261013FromEditor();
  assert.equal(result.code, 'REPAIR_OPERATION_ID_MISMATCH');
  assert.ok(c.findObject('DailyLogs', 'log_id', SOURCE_ID));
  assert.equal(c.findObject('DailyLogs', 'log_id', TARGET_ID), null);
});

test('snapshot 內日紀錄日期不符時硬擋，避免把其他日期內容混入 10/13', () => {
  const source = sourceRow();
  source.kpi6_data.v2_snapshot.submission.activitySnapshots[0].date = '2026-10-12';
  const { c } = setup({ sourceOverrides: { kpi6_data: source.kpi6_data } });
  const result = c.repairYangyangAnqinDate20261013FromEditor();
  assert.equal(result.code, 'REPAIR_SNAPSHOT_DATE_MISMATCH');
  assert.ok(c.findObject('DailyLogs', 'log_id', SOURCE_ID));
  assert.equal(c.findObject('DailyLogs', 'log_id', TARGET_ID), null);
});

test('kpi1～kpi5 即使是舊格式非 JSON 也不解析、不阻擋且原值不動', () => {
  const { c } = setup({ sourceOverrides: {
    kpi1_data: '{舊格式未封閉',
    kpi2_data: '歷史純文字',
    kpi3_data: '[歷史格式',
    kpi4_data: '2026-10-14',
    kpi5_data: '=不應改寫',
  } });
  c.generatePersonKpiPdf_ = () => ({ url: 'https://drive.google.com/file/d/raw-preserved/view' });
  const before = c.findObject('DailyLogs', 'log_id', SOURCE_ID);
  const result = c.repairYangyangAnqinDate20261013FromEditor();
  assert.equal(result.ok, true, result.error);
  const moved = c.findObject('DailyLogs', 'log_id', TARGET_ID);
  ['kpi1_data', 'kpi2_data', 'kpi3_data', 'kpi4_data', 'kpi5_data'].forEach(field => {
    assert.equal(moved[field], before[field], `${field} 必須保持原始儲存值`);
  });
});

console.log(JSON.stringify({ passed, failed: 0, scope: '羊羊 2026/10/13 一次性安親 KPI 日期修復' }, null, 2));
