const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const backend = fs.readFileSync(path.join(root, 'apps-script/talentrecords.gs'), 'utf8');
const frontend = fs.readFileSync(path.join(root, 'review/talent-v2/app.js'), 'utf8');
const code = fs.readFileSync(path.join(root, 'apps-script/Code.gs'), 'utf8');
const auth = fs.readFileSync(path.join(root, 'apps-script/auth.gs'), 'utf8');
const api = fs.readFileSync(path.join(root, 'shared/api.js'), 'utf8');
const utils = fs.readFileSync(path.join(root, 'apps-script/utils.gs'), 'utf8');

const c = vm.createContext({
  Array, Boolean, Date, Error, JSON, Math, Number, Object, RegExp, Set, String,
  console,
  decodeURIComponent,
  encodeURIComponent,
  Utilities: { getUuid: () => 'approval-uuid' },
  isGlobalManager_: () => false,
  parseUserListField_: value => Array.isArray(value) ? value : [],
  normalizeDepartment_: value => String(value || ''),
  SHEET_NAMES: { TALENT_RECORDS: 'TalentRecords', USERS: 'Users' },
});
vm.runInContext(backend, c);

// 核准必須等到與老師寫入相同的 lock 內才 fresh read，並使既有 PDF 失效。
let lockActive = false;
let latestLesson = {
  id: 'lesson-race', teacher: '老師甲', date: '2026-09-18', status: 'submitted', lessonStatus: 'held',
  present: 9, newCount: 4, renewalCount: 3, trial: 5, teacherConcurrentNote: '老師同期更新',
  contentRevision: 'teacher-new-revision', reportRevision: 'teacher-new-revision',
  reportUrl: 'https://drive.google.com/file/d/stale/view', reportFileId: 'stale', reportGeneratedAt: 'before',
};
let approvalWrites = 0;
let queuedLessonId = '';
c.withRecordWriteLock_ = callback => {
  assert.equal(lockActive, false);
  lockActive = true;
  try { return callback(); } finally { lockActive = false; }
};
c.findObject = (_sheet, _key, id) => {
  assert.equal(lockActive, true, '課堂 fresh read 不得發生在 write lock 外');
  return id === 'lesson-race' ? { record_type: 'lesson', nickname: '老師甲', data: latestLesson } : null;
};
c.talentRecordObject_ = row => JSON.parse(JSON.stringify(row.data));
c.upsertTalentRecord_ = (_type, _nickname, lesson) => {
  assert.equal(lockActive, true, '核准更新不得離開同一 write lock');
  approvalWrites += 1;
  latestLesson = JSON.parse(JSON.stringify(lesson));
  return JSON.parse(JSON.stringify(latestLesson));
};
c.nowIso = () => '2026-10-08T12:00:00.000Z';
c.queueDeferredTeacherReport_ = job => { queuedLessonId = job.lessonId; return { queued: true, scheduled: true }; };
c.logSystem = () => {};

const approval = c.approveTalentBonus({
  __actor: { nickname: '柏翰', role: 'admin', status: 'active' },
  lesson_id: 'lesson-race', approved_new_count: 3, approved_renewal_count: 2, note: '已核對繳費',
});
assert.equal(approval.ok, true);
assert.equal(approvalWrites, 1);
assert.equal(approval.lesson.teacherConcurrentNote, '老師同期更新', '核准不可覆蓋老師同期更新的其他欄位');
assert.notEqual(approval.lesson.contentRevision, 'teacher-new-revision', '核准結果會改變 PDF 內容版本');
assert.equal(approval.lesson.reportUrl, '', '舊 PDF 連結不得在核准後繼續對外顯示');
assert.equal(approval.lesson.reportFileId, '');
assert.equal(approval.lesson.reportRevision, 'teacher-new-revision', '舊 report revision 必須維持不相等，讓修復器重建');
assert.equal(queuedLessonId, 'lesson-race', '核准後必須排入 PDF 背景重建');
assert.equal(approval.reportPending, true);

for (const invalid of [NaN, Infinity, -1, 1.5, 'abc', '', '   ', true, false, [], {}, null, undefined]) {
  const beforeWrites = approvalWrites;
  const result = c.approveTalentBonus({
    __actor: { nickname: '柏翰', role: 'admin', status: 'active' },
    lesson_id: 'lesson-race', approved_new_count: invalid, approved_renewal_count: 0, note: '測試',
  });
  assert.equal(result.ok, false, `非法核准數 ${String(invalid)} 必須拒絕`);
  assert.equal(approvalWrites, beforeWrites, '非法數字不得進入寫入');
}

// rubric 完全由月份決定；9 月首次評分即使 payload 宣稱 v2 仍必須用 legacy v1。
const fulltime = { nickname: '浩浩', role: 'teacher', status: 'active', department: '才藝部門', employment_type: 'fulltime', work_assignments: ['talent-fulltime'] };
let scoreRow = null;
c.findTalentUser_ = nickname => nickname === '浩浩' ? fulltime : null;
c.findObject = (_sheet, _key, id) => scoreRow && scoreRow.record_id === id ? scoreRow : null;
c.upsertTalentRecord_ = (type, nickname, record) => {
  scoreRow = { record_id: record.id, record_type: type, nickname, updated_by: '柳丁', updated_at: c.nowIso(), data: JSON.parse(JSON.stringify(record)) };
  return JSON.parse(JSON.stringify(record));
};
c.talentRecordObject_ = row => JSON.parse(JSON.stringify(row.data));
c.withRecordWriteLock_ = callback => callback();
const actor = { nickname: '柏翰', role: 'admin', status: 'active' };
const scores = { prep: 25, evidence: 25, communication: 20, attendance: 15, room: 10, improvement: 5 };
const september = c.saveTalentScore({ __actor: actor, nickname: '浩浩', month: '2026-09', score: { rubricVersion: 2, scores, reason: '九月首次評分', published: false } });
assert.equal(september.ok, true);
assert.equal(september.score.rubricVersion, 1, '2026-09 首次評分必須使用 legacy v1');
scoreRow = null;
const october = c.saveTalentScore({ __actor: actor, nickname: '浩浩', month: '2026-10', score: { rubricVersion: 1, scores, reason: '十月評分', published: false } });
assert.equal(october.score.rubricVersion, 2, '2026-10 起必須使用 v2，不能信任 payload v1');
assert.equal(c.saveTalentScore({ __actor: actor, nickname: '浩浩', month: '2026-13', score: { scores, reason: '非法月份' } }).ok, false, '後端不得接受不存在的月份');

// 月份結束後才可永久取消；PT 可建立 penalty-only，重送不可改寫原因。
const pt = { nickname: '酸酸', role: 'manager', status: 'active', department: '東橋教室', employment_type: 'pt', work_assignments: ['anqin-manager', 'talent-pt'] };
const archivedPt = { nickname: '離職老師', role: 'teacher', status: 'deleted', department: '才藝部門', employment_type: 'pt', work_assignments: ['talent-pt'] };
c.findTalentUser_ = nickname => nickname === '酸酸' ? pt : nickname === '浩浩' ? fulltime : nickname === '離職老師' ? archivedPt : null;
c.todayStr = () => '2026-10-08';
scoreRow = null;
assert.equal(c.forfeitTalentMonthlyBonus({ __actor: actor, nickname: '酸酸', month: '2026-09', reason: '缺照片', confirmed: false }).ok, false, '未明確確認不可執行');
assert.equal(c.forfeitTalentMonthlyBonus({ __actor: actor, nickname: '酸酸', month: '2026-10', reason: '尚未月底', confirmed: true }).ok, false, '當月不可提前永久取消');
assert.equal(c.forfeitTalentMonthlyBonus({ __actor: actor, nickname: '酸酸', month: '2025-13', reason: '非法月份', confirmed: true }).ok, false, '不可用不存在的過去月份繞過月底限制');
const forfeited = c.forfeitTalentMonthlyBonus({ __actor: actor, nickname: '酸酸', month: '2026-09', reason: '9/12 與 9/19 未完成 APP 照片', confirmed: true });
assert.equal(forfeited.ok, true);
assert.equal(forfeited.score.status, 'penalty_only');
assert.equal(forfeited.score.published, false, 'PT penalty-only 不得被誤標成 KPI 已公布');
assert.equal(forfeited.score.appPhotoBonusForfeited, true);
const immutable = c.forfeitTalentMonthlyBonus({ __actor: actor, nickname: '酸酸', month: '2026-09', reason: '企圖換原因', confirmed: true });
assert.equal(immutable.duplicate, true);
assert.equal(immutable.score.appPhotoBonusForfeitedReason, '9/12 與 9/19 未完成 APP 照片', '已取消後不得改寫或清除');
assert.equal(c.forfeitTalentMonthlyBonus({ __actor: { nickname: '老師', role: 'teacher', status: 'active' }, nickname: '酸酸', month: '2026-09', reason: '越權', confirmed: true }).ok, false, '老師不可取消自己或他人的整月獎金');
scoreRow = null;
const archivedForfeited = c.forfeitTalentMonthlyBonus({ __actor: actor, nickname: '離職老師', month: '2026-09', reason: '離職前缺照片', confirmed: true });
assert.equal(archivedForfeited.ok, true, '主管月結仍需能處理該月有資料的歷史才藝人員');

// 正職後續評分必須保留既有不可逆旗標。
scoreRow = { record_id: 'talent-score-浩浩-2026-09', record_type: 'score', nickname: '浩浩', updated_by: '柳丁', updated_at: c.nowIso(), data: {
  id: 'talent-score-浩浩-2026-09', teacher: '浩浩', date: '2026-09-01', month: '2026-09', rubricVersion: 1,
  scores: {}, total: 0, reason: '', published: false, status: 'penalty_only', history: [],
  appPhotoBonusForfeited: true, appPhotoBonusForfeitedBy: '柳丁', appPhotoBonusForfeitedAt: c.nowIso(), appPhotoBonusForfeitedReason: '缺照片',
} };
const scoredAfterPenalty = c.saveTalentScore({ __actor: actor, nickname: '浩浩', month: '2026-09', score: { rubricVersion: 2, scores, reason: '完成評分', published: true } });
assert.equal(scoredAfterPenalty.score.appPhotoBonusForfeited, true);
assert.equal(scoredAfterPenalty.score.appPhotoBonusForfeitedReason, '缺照片');
assert.equal(scoredAfterPenalty.score.rubricVersion, 1);

// 核心金額：正職全部獎金歸 0；PT 續抱歸 0，但鐘點費保留。
const moneyStart = frontend.indexOf('function talentMonthlyMoneyAfterPhotoPolicy(');
const moneyEnd = frontend.indexOf('\n\n  function renderPerformance(', moneyStart);
assert.ok(moneyStart >= 0 && moneyEnd > moneyStart);
const moneyContext = vm.createContext({ Number });
vm.runInContext(frontend.slice(moneyStart, moneyEnd), moneyContext);
assert.deepEqual(
  { ...moneyContext.talentMonthlyMoneyAfterPhotoPolicy(0, 2500, 400, 600, true) },
  { wage: 0, kpi: 0, newBonus: 0, renewalBonus: 0, total: 0 },
  '正職被查證後 KPI、新生、續抱獎金都必須為 0',
);
assert.deepEqual(
  { ...moneyContext.talentMonthlyMoneyAfterPhotoPolicy(5250, 0, 0, 1600, true) },
  { wage: 5250, kpi: 0, newBonus: 0, renewalBonus: 0, total: 5250 },
  'PT 被查證後仍保留鐘點費，只取消續抱獎金',
);
assert.deepEqual(
  { ...moneyContext.talentMonthlyMoneyAfterPhotoPolicy(5250, 0, 0, 1600, false) },
  { wage: 5250, kpi: 0, newBonus: 0, renewalBonus: 1600, total: 6850 },
  '未取消時原有金額不得受影響',
);

assert.match(backend, /if \(published \|\| scores\[index\]\.appPhotoBonusForfeited === true\)[\s\S]*if \(published\) publishedMonths/, '本人可讀 penalty-only，但不可誤當 KPI 已公布');
assert.match(frontend, /state\.ui\.month >= currentMonth\(\)[\s\S]*月底後可查證/, '前端當月不得提供永久取消按鈕');
assert.match(frontend, /APP 照片未完成，當月獎金取消，補繳不補發/);
assert.match(frontend, /name="confirmed" required[\s\S]*確認永久取消/, '前端需二次確認不可逆操作');
assert.match(code, /'forfeitTalentMonthlyBonus': \(\) => forfeitTalentMonthlyBonus\(params\)/);
assert.match(auth, /'saveTalentScore', 'forfeitTalentMonthlyBonus'/);
assert.match(api, /forfeitTalentMonthlyBonus: \(nickname, month, reason, confirmed\)/);
assert.match(utils, /'approveTalentBonus', 'forfeitTalentMonthlyBonus'/);

console.log('PASS talent approval lock/PDF revision, strict counts, month-forced rubric, and irreversible post-month APP bonus forfeiture');
