const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const backendSource = [
  fs.readFileSync(path.join(root, 'apps-script/auth.gs'), 'utf8'),
  fs.readFileSync(path.join(root, 'apps-script/talentrecords.gs'), 'utf8'),
].join('\n');

function driveIterator(items) {
  let index = 0;
  return {
    hasNext: () => index < items.length,
    next: () => items[index++],
  };
}

function mockDriveFolder(id, name, parent = null, trashed = false) {
  return {
    getId: () => id,
    getName: () => name,
    getParents: () => driveIterator(parent ? [parent] : []),
    isTrashed: () => trashed,
  };
}

function mockDriveFile(id, name, mimeType, parent, trashed = false) {
  return {
    getId: () => id,
    getName: () => name,
    getMimeType: () => mimeType,
    getParents: () => driveIterator(parent ? [parent] : []),
    isTrashed: () => trashed,
  };
}

const evidenceRoot = mockDriveFolder('evidence-root-0001', 'KPI證據');
const evidenceDepartment = mockDriveFolder('evidence-dept-0001', '東橋教室', evidenceRoot);
const evidenceTeacher = mockDriveFolder('evidence-teacher-01', '酸酸', evidenceDepartment);
const evidenceTalent = mockDriveFolder('evidence-talent-001', '才藝', evidenceTeacher);
const evidenceMonth = mockDriveFolder('evidence-month-0001', '2026-10', evidenceTalent);
const oldEvidenceMonth = mockDriveFolder('evidence-month-0000', '2026-09', evidenceTalent);
const wrongTeacher = mockDriveFolder('evidence-teacher-02', '紅豆', evidenceDepartment);
const wrongTalent = mockDriveFolder('evidence-talent-002', '才藝', wrongTeacher);
const wrongMonth = mockDriveFolder('evidence-month-0002', '2026-10', wrongTalent);
const driveFiles = new Map([
  ['room-valid-0000001', mockDriveFile('room-valid-0000001', '雲端教室照片.jpg', 'image/jpeg', evidenceMonth)],
  ['room-pdf-000000001', mockDriveFile('room-pdf-000000001', '偽裝照片.jpg', 'application/pdf', evidenceMonth)],
  ['room-trash-0000001', mockDriveFile('room-trash-0000001', '已刪除照片.jpg', 'image/jpeg', evidenceMonth, true)],
  ['room-wrong-owner01', mockDriveFile('room-wrong-owner01', '別人照片.jpg', 'image/jpeg', wrongMonth)],
  ['room-wrong-month01', mockDriveFile('room-wrong-month01', '本人舊照片.jpg', 'image/jpeg', oldEvidenceMonth)],
]);
const context = vm.createContext({
  Array,
  Date,
  Error,
  JSON,
  Math,
  Number,
  Object,
  RegExp,
  String,
  console,
  decodeURIComponent,
  encodeURIComponent,
  Utilities: { getUuid: () => 'test-uuid' },
  DriveApp: {
    getFileById: id => {
      if (!driveFiles.has(id)) throw new Error('file not found');
      return driveFiles.get(id);
    },
  },
  getEvidenceRootFolder_: () => evidenceRoot,
  isGlobalManager_: () => false,
  normalizeDepartment_: value => String(value || ''),
});
vm.runInContext(backendSource, context);

const schedule = context.normalizeUserSchedule_([
  { weekday: 3, time: '19:00-20:30', siteType: 'self', site: 'A 教室' },
  { weekday: 3, time: '20:30-22:00', siteType: 'self', site: 'A 教室' },
]);
assert.equal(schedule.length, 2);
assert.notEqual(schedule[0].scheduleKey, schedule[1].scheduleKey, '同日不同班次必須有不同識別碼');
assert.throws(() => context.normalizeUserSchedule_([
  { weekday: 3, time: '19:00-20:30', siteType: 'self', site: 'A 教室' },
  { weekday: 3, time: '19:00-20:30', siteType: 'self', site: 'A 教室' },
]), /重複班次/);
assert.throws(() => context.validateUserWorkConfiguration_('teacher', 'pt', ['talent-pt'], []), /至少一筆固定排班/);
assert.doesNotThrow(() => context.validateUserWorkConfiguration_('teacher', 'pt', ['talent-pt'], schedule));
assert.deepEqual(Array.from(context.normalizeRestDays_(['週一', '週日', '週一'])), ['週一', '週日']);

const suansuanSchedules = context.normalizeUserSchedule_([
  { weekday: 6, label: '簡易', courseName: '簡易', courseType: '樂高簡易積木', time: '09:00–10:30', siteType: 'self', site: '東橋教室', effectiveFrom: '2026-10-10' },
  { weekday: 6, label: 'WeDo', courseName: 'WeDo', courseType: 'WeDo 機器人', time: '10:40–12:10', siteType: 'self', site: '東橋教室', effectiveFrom: '2026-10-10' },
]);
assert.equal(suansuanSchedules.length, 2, '酸酸的兩個週六班次必須同時保留');
assert.notEqual(suansuanSchedules[0].scheduleKey, suansuanSchedules[1].scheduleKey, '同日簡易與 WeDo 必須是不同班次');
assert.deepEqual(
  Array.from(suansuanSchedules, item => ({ courseName: item.courseName, courseType: item.courseType, effectiveFrom: item.effectiveFrom })),
  [
    { courseName: '簡易', courseType: '樂高簡易積木', effectiveFrom: '2026-10-10' },
    { courseName: 'WeDo', courseType: 'WeDo 機器人', effectiveFrom: '2026-10-10' },
  ],
  '班別與生效日不可在排班正規化時遺失',
);
assert.doesNotThrow(() => context.validateUserWorkConfiguration_('manager', 'pt', ['anqin-manager', 'talent-pt'], suansuanSchedules), '酸酸必須能同時保留安親主管與才藝 PT');
const suansuan = { nickname: '酸酸', role: 'manager', status: 'active', department: '東橋教室', employment_type: 'pt', work_assignments: ['anqin-manager', 'talent-pt'], schedule_json: suansuanSchedules };
assert.equal(context.talentEmployment_(suansuan), 'pt', '雙身分酸酸在才藝計薪必須視為 PT');
assert.equal(context.talentSchedulesForDate_(suansuan, '2026-10-03').length, 0, '生效日之前不可產生才藝缺件或可填班次');
assert.equal(context.talentSchedulesForDate_(suansuan, '2026-10-10').length, 2, '生效日當天應開放兩個週六班次');
const sameCampusTalent = { nickname: '東橋才藝老師', role: 'teacher', status: 'active', department: '東橋教室', employment_type: 'pt', work_assignments: ['talent-pt'] };
assert.equal(context.talentCanAccessUser_(suansuan, sameCampusTalent), false, '安親主管的 role 不得導致才藝 PT 讀取同教室其他老師資料');
assert.equal(context.talentCanAccessUser_(suansuan, suansuan), true, '酸酸仍可讀寫自己的才藝 PT 資料');
assert.equal(context.talentCanAccessHistoricalUser_(suansuan, { ...sameCampusTalent, status: 'deleted' }), false, '才藝 PT 不得讀取同教室離職人員歷史');
assert.equal(context.talentCanAccessPendingUser_(suansuan, { ...sameCampusTalent, status: 'pending' }), false, '才藝 PT 不得讀取同教室待開通人員');
const mergedSuansuanSchedule = context.mergeUserScheduleMetadata_(suansuanSchedules, suansuanSchedules.map(item => ({
  weekday: item.weekday, label: item.label, time: item.time, siteType: item.siteType, site: item.site,
})));
assert.deepEqual(
  Array.from(mergedSuansuanSchedule, item => ({ courseName: item.courseName, courseType: item.courseType, effectiveFrom: item.effectiveFrom })),
  [
    { courseName: '簡易', courseType: '樂高簡易積木', effectiveFrom: '2026-10-10' },
    { courseName: 'WeDo', courseType: 'WeDo 機器人', effectiveFrom: '2026-10-10' },
  ],
  '舊管理介面更新排班時不得洗掉課程名稱、類型與生效日',
);
const reorderedSuansuanSchedule = context.mergeUserScheduleMetadata_(suansuanSchedules, [suansuanSchedules[1], suansuanSchedules[0]].map(item => ({
  weekday: item.weekday, label: item.label, time: item.time, siteType: item.siteType, site: item.site,
})));
assert.deepEqual(
  Array.from(reorderedSuansuanSchedule, item => ({ label: item.label, courseType: item.courseType, effectiveFrom: item.effectiveFrom })),
  [
    { label: 'WeDo', courseType: 'WeDo 機器人', effectiveFrom: '2026-10-10' },
    { label: '簡易', courseType: '樂高簡易積木', effectiveFrom: '2026-10-10' },
  ],
  '排班重新排序時 metadata 必須跟著班次識別碼，不可依列號互換',
);
const staleIndexedMetadata = context.mergeUserScheduleMetadata_(suansuanSchedules, [
  {
    weekday: suansuanSchedules[1].weekday, label: suansuanSchedules[1].label, time: suansuanSchedules[1].time,
    siteType: suansuanSchedules[1].siteType, site: suansuanSchedules[1].site,
    courseName: suansuanSchedules[0].courseName, courseType: suansuanSchedules[0].courseType, effectiveFrom: suansuanSchedules[0].effectiveFrom,
  },
  {
    weekday: suansuanSchedules[0].weekday, label: suansuanSchedules[0].label, time: suansuanSchedules[0].time,
    siteType: suansuanSchedules[0].siteType, site: suansuanSchedules[0].site,
    courseName: suansuanSchedules[1].courseName, courseType: suansuanSchedules[1].courseType, effectiveFrom: suansuanSchedules[1].effectiveFrom,
  },
]);
assert.deepEqual(
  Array.from(staleIndexedMetadata, item => ({ label: item.label, courseName: item.courseName, courseType: item.courseType })),
  [
    { label: 'WeDo', courseName: 'WeDo', courseType: 'WeDo 機器人' },
    { label: '簡易', courseName: '簡易', courseType: '樂高簡易積木' },
  ],
  '舊快取若仍依列號送回錯誤 metadata，後端也必須依 scheduleKey 阻止黏錯班',
);
const deletedSuansuanSchedule = context.mergeUserScheduleMetadata_(suansuanSchedules, [{
  weekday: suansuanSchedules[1].weekday,
  label: suansuanSchedules[1].label,
  time: suansuanSchedules[1].time,
  siteType: suansuanSchedules[1].siteType,
  site: suansuanSchedules[1].site,
}]);
assert.deepEqual(
  Array.from(deletedSuansuanSchedule, item => ({ label: item.label, courseType: item.courseType })),
  [{ label: 'WeDo', courseType: 'WeDo 機器人' }],
  '刪除第一堂排班時不可把被刪班次的 metadata 黏到保留班次',
);
const addedSuansuanSchedule = context.mergeUserScheduleMetadata_(suansuanSchedules, [
  { weekday: 6, label: '新班', time: '08:00–08:30', siteType: 'self', site: '東橋教室' },
  { weekday: suansuanSchedules[0].weekday, label: suansuanSchedules[0].label, time: suansuanSchedules[0].time, siteType: suansuanSchedules[0].siteType, site: suansuanSchedules[0].site },
]);
assert.equal(addedSuansuanSchedule[0].courseType, undefined, '新增排班不可偷帶其他列的課程 metadata');
assert.equal(addedSuansuanSchedule[1].courseType, '樂高簡易積木', '新增排班後既有班次仍須保留自己的 metadata');

const pt = { employment_type: 'pt' };
const pay = (overrides = {}) => context.talentLessonPay_({
  lessonStatus: 'held',
  present: 2,
  makeup: 0,
  trial: 0,
  duration: 1.5,
  siteType: 'self',
  ...overrides,
}, pt);
assert.deepEqual({ rate: pay().rate, amount: pay().amount }, { rate: 500, amount: 750 });
assert.deepEqual({ rate: pay({ present: 5 }).rate, amount: pay({ present: 5 }).amount }, { rate: 600, amount: 900 });
assert.deepEqual({ rate: pay({ present: 8 }).rate, amount: pay({ present: 8 }).amount }, { rate: 800, amount: 1200 });
assert.equal(pay({ present: 1, makeup: 1, trial: 50 }).rate, 500, '補課計薪、體驗不計薪');
assert.deepEqual({ rate: pay({ present: 11 }).rate, amount: pay({ present: 11 }).amount, review: pay({ present: 11 }).requiresReview }, { rate: 0, amount: 0, review: true });
assert.deepEqual({ rate: pay({ present: 0, siteType: 'partner' }).rate, amount: pay({ present: 0, siteType: 'partner' }).amount }, { rate: 600, amount: 900 });
assert.deepEqual({ rate: pay({ present: 8, siteType: 'partner', lessonKind: 'coverage', duration: 2 }).rate, amount: pay({ present: 8, siteType: 'partner', lessonKind: 'coverage', duration: 2 }).amount }, { rate: 800, amount: 1600 }, '帶班須依實際時數與人數計薪，不套固定合作校堂費');
assert.deepEqual({
  rate: pay({ present: 11, lessonKind: 'coverage', adminPayOverrideApproved: true, adminPayOverrideRate: 800, adminPayOverrideAmount: 1200 }).rate,
  amount: pay({ present: 11, lessonKind: 'coverage', adminPayOverrideApproved: true, adminPayOverrideRate: 800, adminPayOverrideAmount: 1200 }).amount,
  review: pay({ present: 11, lessonKind: 'coverage', adminPayOverrideApproved: true, adminPayOverrideRate: 800, adminPayOverrideAmount: 1200 }).requiresReview,
}, { rate: 800, amount: 1200, review: false }, '主管核定的 11 人歷史帶班須強制列入 1,200 元');
assert.equal(pay({ lessonStatus: 'cancelled' }).amount, 0);

const coverageSchedule = context.talentCoverageSchedule_({ date: '2026-09-19', coverageStart: '10:40', coverageEnd: '12:10', coverageSiteType: 'self', coverageSite: '東橋教室' });
assert.deepEqual({ label: coverageSchedule.scheduleLabel, time: coverageSchedule.scheduleTime, duration: coverageSchedule.duration, site: coverageSchedule.site }, { label: '帶班', time: '10:40–12:10', duration: 1.5, site: '東橋教室' });
assert.throws(() => context.talentCoverageSchedule_({ date: '2026-09-19', coverageStart: '10:40', coverageEnd: '12:20', coverageSite: '東橋教室' }), /0.5 小時倍數/);

const adminActor = { nickname: '柏翰', role: 'admin', status: 'active', department: '總部' };
const deletedTeacher = { nickname: '離職老師', role: 'teacher', status: 'deleted', department: '才藝部門', employment_type: 'pt', work_assignments: ['talent-pt'] };
assert.equal(context.talentCanAccessUser_(adminActor, deletedTeacher), false, '已刪除員工不可再進入現職資料流');
assert.equal(context.talentCanAccessHistoricalUser_(adminActor, deletedTeacher), true, '管理員仍須能查核已刪除員工的歷史資料');

const driveAttachment = context.talentAttachments_([{ fileName: 'photo.jpg', url: 'https://drive.google.com/file/d/abc/view' }], true);
assert.equal(driveAttachment[0].url, 'https://drive.google.com/file/d/abc/view');
assert.throws(() => context.talentAttachments_([{ fileName: 'fake.jpg', url: 'https://example.com/fake.jpg' }], true), /尚未完整上傳/);
assert.equal(context.talentAppEvidence_([{ fileName: 'app.png', mimeType: 'image/png', url: 'https://drive.google.com/file/d/app/view' }], true).length, 1);
assert.throws(() => context.talentAppEvidence_([{ fileName: 'app.pdf', mimeType: 'application/pdf', url: 'https://drive.google.com/file/d/app/view' }], true), /只接受圖片/);
const validRoomEvidence = context.talentRoomEvidence_([{
  fileName: '前端顯示名稱.png',
  fileId: 'room-valid-0000001',
  mimeType: 'image/png',
  url: 'https://drive.google.com/file/d/room-valid-0000001/view',
}], true, suansuan, '2026-10-08');
assert.equal(validRoomEvidence.length, 1);
assert.deepEqual({
  fileId: validRoomEvidence[0].fileId,
  fileName: validRoomEvidence[0].fileName,
  mimeType: validRoomEvidence[0].mimeType,
  url: validRoomEvidence[0].url,
}, {
  fileId: 'room-valid-0000001',
  fileName: '雲端教室照片.jpg',
  mimeType: 'image/jpeg',
  url: 'https://drive.google.com/file/d/room-valid-0000001/view',
}, '整潔照片必須以 Drive 實檔資訊正規化，不可信任前端檔名或 MIME');
assert.throws(() => context.talentRoomEvidence_([{
  fileId: 'room-valid-0000001', mimeType: 'image/jpeg', fileName: 'fake.jpg', url: 'https://drive.google.com.evil/file/d/room-valid-0000001/view',
}], true, suansuan, '2026-10-08'), /尚未完整上傳|識別碼/, '偽 Drive 網址必須拒絕');
assert.throws(() => context.talentRoomEvidence_([{
  fileId: 'room-valid-0000001', mimeType: 'image/jpeg', fileName: 'mismatch.jpg', url: 'https://drive.google.com/file/d/room-other-0000001/view',
}], true, suansuan, '2026-10-08'), /識別碼/, 'Drive URL 與 fileId 不一致必須拒絕');
assert.throws(() => context.talentRoomEvidence_([{
  fileId: 'room-missing-00001', mimeType: 'image/jpeg', fileName: 'missing.jpg', url: 'https://drive.google.com/file/d/room-missing-00001/view',
}], true, suansuan, '2026-10-08'), /不存在|無法存取/, '不存在或無權的 Drive 檔案必須拒絕');
assert.throws(() => context.talentRoomEvidence_([{
  fileId: 'room-pdf-000000001', mimeType: 'image/jpeg', fileName: '偽裝照片.jpg', url: 'https://drive.google.com/file/d/room-pdf-000000001/view',
}], true, suansuan, '2026-10-08'), /整潔證據只接受圖片/, '必須用 Drive 真實 MIME 拒絕假裝成 JPG 的 PDF');
assert.throws(() => context.talentRoomEvidence_([{
  fileId: 'room-trash-0000001', mimeType: 'image/jpeg', fileName: 'trash.jpg', url: 'https://drive.google.com/file/d/room-trash-0000001/view',
}], true, suansuan, '2026-10-08'), /垃圾桶/, '已移到垃圾桶的照片必須拒絕');
assert.throws(() => context.talentRoomEvidence_([{
  fileId: 'room-wrong-owner01', mimeType: 'image/jpeg', fileName: 'other.jpg', url: 'https://drive.google.com/file/d/room-wrong-owner01/view',
}], true, suansuan, '2026-10-08'), /KPI 證據資料夾/, '其他老師資料夾的照片必須拒絕');
assert.throws(() => context.talentRoomEvidence_([{
  fileId: 'room-wrong-month01', mimeType: 'image/jpeg', fileName: 'old.jpg', url: 'https://drive.google.com/file/d/room-wrong-month01/view',
}], true, suansuan, '2026-10-08'), /KPI 證據資料夾/, '本人舊月份照片不得冒充當月教室整潔證據');

context.todayStr = () => '2026-10-08';
assert.match(
  context.talentLessonSaveVersionError_(null, null, 1),
  /版本已過期.*重新整理/,
  '2026-10-08 起全新紀錄不得降版繞過 v2 Drive 驗證',
);
assert.match(
  context.talentLessonSaveVersionError_({ status: 'submitted' }, { entryVersion: 1 }, 1),
  /舊版格式.*只能查看.*補傳 APP 截圖/,
  '既有 v1 正式紀錄不得透過 saveTalentLesson 改寫',
);
assert.match(
  context.talentLessonSaveVersionError_({ status: 'submitted' }, { entryVersion: 1 }, 2),
  /舊版格式.*只能查看/,
  '既有 v1 正式紀錄也不得偽裝成 v2 覆寫',
);
assert.match(
  context.talentLessonSaveVersionError_({ status: 'submitted' }, { entryVersion: 2 }, 1),
  /版本已過期.*不可降級.*重新整理/,
  '既有 v2 正式紀錄不得降為 v1 繞過新版人數與 Drive 驗證',
);
assert.equal(context.talentLessonSaveVersionError_({ status: 'submitted' }, { entryVersion: 2 }, 2), '', '既有 v2 仍可依原規則更新');
context.todayStr = () => '2026-10-07';
assert.equal(context.talentLessonSaveVersionError_(null, null, 1), '', '限制不得回溯改變新制生效前的行為');
const mergedAppEvidence = context.mergeTalentAppEvidence_(
  [{ fileName: 'old.png', fileId: 'old', mimeType: 'image/png', url: 'https://drive.google.com/file/d/old/view' }],
  [
    { fileName: 'new.png', fileId: 'new', mimeType: 'image/png', url: 'https://drive.google.com/file/d/new/view' },
    { fileName: 'old-copy.png', fileId: 'old', mimeType: 'image/png', url: 'https://drive.google.com/file/d/old/view' },
  ],
);
assert.deepEqual(Array.from(mergedAppEvidence, file => file.fileId), ['new', 'old'], '補傳 APP 截圖需保留舊檔並略過重複檔案');
const legacyLesson = { courseType: '樂高小創客', courseName: '齒輪課', siteType: 'self', site: '布拉克自營教室', prepId: 'prep-1', issue: '齒輪容易鬆脫，下次先示範固定方式。', parentStatus: 'complete' };
assert.doesNotThrow(() => context.validateTalentLessonRequiredFields_(legacyLesson), '舊版資料必須繼續通過舊版檢核');
assert.throws(() => context.validateTalentLessonRequiredFields_({ ...legacyLesson, issue: '  ' }), /課程問題及下次優化/, '舊版必填規則不可在新版上線時被破壞');

const roomPhoto = { fileName: '教室整潔.jpg', fileId: 'room-valid-0000001', mimeType: 'image/jpeg', url: 'https://drive.google.com/file/d/room-valid-0000001/view' };
const simpleLesson = { entryVersion: 2, date: '2026-10-08', courseName: '', courseType: '', present: 8, newCount: 2, renewalCount: 4, trial: 3, roomFiles: [roomPhoto] };
context.normalizeTalentSimpleLesson_(simpleLesson, suansuan, suansuanSchedules[1], false);
assert.deepEqual({
  version: simpleLesson.entryVersion,
  courseName: simpleLesson.courseName,
  courseType: simpleLesson.courseType,
  expected: simpleLesson.expected,
  present: simpleLesson.present,
  renewal: simpleLesson.renewalCount,
  leave: simpleLesson.leave,
  absent: simpleLesson.absent,
  makeup: simpleLesson.makeup,
  trial: simpleLesson.trial,
  newCount: simpleLesson.newCount,
  roomDone: simpleLesson.roomDone,
  appStatus: simpleLesson.appStatus,
}, {
  version: 2,
  courseName: 'WeDo',
  courseType: 'WeDo 機器人',
  expected: 8,
  present: 8,
  renewal: 4,
  leave: 0,
  absent: 0,
  makeup: 0,
  trial: 3,
  newCount: 2,
  roomDone: true,
  appStatus: 'not_required',
}, '新版保留正式、新生、續報、體驗與教室整潔證據，課名由固定班次帶入');
assert.equal(simpleLesson.prepId, '', '新版不得再依賴備課檔案');
assert.equal(simpleLesson.issue, '', '新版不得再要求課後問題文字');
assert.equal(simpleLesson.parentStatus, 'not_required', '新版不得再要求親師溝通狀態');
assert.equal(simpleLesson.roomFiles.length, 1);
const validSimpleCounts = { entryVersion: 2, date: '2026-10-08', courseName: '簡易', present: 4, newCount: 1, renewalCount: 2, trial: 7, roomFiles: [roomPhoto] };
assert.throws(() => context.normalizeTalentSimpleLesson_({ ...validSimpleCounts, roomFiles: [] }, suansuan, suansuanSchedules[0], false), /教室整潔|必填附件/, '新版教室整潔照片必填');
assert.throws(() => context.normalizeTalentSimpleLesson_({ ...validSimpleCounts, newCount: 3, renewalCount: 2 }, suansuan, suansuanSchedules[0], false), /兩者合計不可超過正式學員到課總數/, '新生與續報合計不得大於正式上課人數');
const exactSimpleCounts = { ...validSimpleCounts, newCount: 1, renewalCount: 3 };
assert.doesNotThrow(() => context.normalizeTalentSimpleLesson_(exactSimpleCounts, suansuan, suansuanSchedules[0], false), '新生與續報合計等於正式總數時應允許送出');
assert.throws(() => context.normalizeTalentSimpleLesson_({ ...validSimpleCounts, present: 4.5 }, suansuan, suansuanSchedules[0], false), /正式上課人數/, '正式上課人數必須是非負整數');
assert.throws(() => context.normalizeTalentSimpleLesson_({ ...validSimpleCounts, trial: -1 }, suansuan, suansuanSchedules[0], false), /體驗人數/, '體驗人數不得為負數');
assert.throws(() => context.normalizeTalentSimpleLesson_({ ...validSimpleCounts, trial: 1.5 }, suansuan, suansuanSchedules[0], false), /體驗人數/, '體驗人數不得以小數靜默截斷');
for (const missingField of ['present', 'newCount', 'renewalCount', 'trial']) {
  const missing = { ...validSimpleCounts };
  delete missing[missingField];
  assert.throws(() => context.normalizeTalentSimpleLesson_(missing, suansuan, suansuanSchedules[0], false), /請填寫/, `${missingField} 缺少時後端必須拒絕`);
}
const trialIndependent = { ...validSimpleCounts, trial: 20 };
context.normalizeTalentSimpleLesson_(trialIndependent, suansuan, suansuanSchedules[0], false);
assert.equal(trialIndependent.trial, 20, '體驗人數獨立於正式上課人數，不可套用正式人數上限');
const aliasLesson = { entryVersion: 2, date: '2026-10-08', studentCount: 6, new_count: 1, renewal_count: 2, trialCount: 3, roomFiles: [roomPhoto] };
context.normalizeTalentSimpleLesson_(aliasLesson, suansuan, suansuanSchedules[0], false);
assert.deepEqual({ present: aliasLesson.present, newCount: aliasLesson.newCount, renewal: aliasLesson.renewalCount, trial: aliasLesson.trial }, { present: 6, newCount: 1, renewal: 2, trial: 3 }, '後端需接受明確的人數別名，並統一存為正式欄位');
const partnerLesson = { entryVersion: 2, date: '2026-10-08', courseName: '合作校課程', present: 7, newCount: 2, renewalCount: 3, trial: 5, siteType: 'partner', roomFiles: [roomPhoto] };
context.normalizeTalentSimpleLesson_(partnerLesson, suansuan, null, false);
assert.deepEqual({ newCount: partnerLesson.newCount, renewal: partnerLesson.renewalCount, trial: partnerLesson.trial }, { newCount: 0, renewal: 0, trial: 5 }, '合作校獎金計數歸 0，但體驗人數必須保留');
const coverageLesson = { entryVersion: 2, date: '2026-10-08', courseName: '臨時帶班', present: 11, newCount: 2, renewalCount: 3, trial: 4, siteType: 'self', duration: 1.5, roomFiles: [roomPhoto] };
context.normalizeTalentSimpleLesson_(coverageLesson, suansuan, null, true);
assert.deepEqual({ newCount: coverageLesson.newCount, renewal: coverageLesson.renewalCount, trial: coverageLesson.trial }, { newCount: 0, renewal: 0, trial: 4 }, '臨時帶班獎金計數歸 0，但體驗人數必須保留');

const forgedServerFields = {
  adminBackfillApproved: true,
  adminBackfillApprovedBy: '偽造管理員',
  bonusApproval: 'approved',
  approvedRenewalCount: 99,
  bonusApprovedBy: '偽造管理員',
};
const freshBonusState = { ...forgedServerFields, newCount: 0, renewalCount: 4 };
context.preserveTalentAdminBackfillState_(freshBonusState, null);
context.applyTalentBonusState_(freshBonusState, null);
assert.equal(freshBonusState.adminBackfillApproved, undefined, '老師新建紀錄不得偽造管理員歷史補登核定');
assert.deepEqual({ approval: freshBonusState.bonusApproval, approved: freshBonusState.approvedRenewalCount, by: freshBonusState.bonusApprovedBy }, { approval: 'pending', approved: 0, by: '' }, '老師新建紀錄不得自行核准續報獎金');
const approvedServerLesson = { newCount: 0, renewalCount: 4, bonusApproval: 'approved', approvedNewCount: 0, approvedRenewalCount: 4, bonusApprovedBy: '柏翰', bonusApprovedAt: '2026-10-08T10:00:00Z', bonusApprovalNote: '已核對' };
const forgedUpdate = { newCount: 0, renewalCount: 4, bonusApproval: 'pending', approvedRenewalCount: 0 };
context.applyTalentBonusState_(forgedUpdate, approvedServerLesson);
assert.deepEqual({ approval: forgedUpdate.bonusApproval, approved: forgedUpdate.approvedRenewalCount, by: forgedUpdate.bonusApprovedBy }, { approval: 'approved', approved: 4, by: '柏翰' }, '老師更新時不得覆蓋伺服器既有的獎金核准狀態');
const changedRenewal = { newCount: 0, renewalCount: 3, bonusApproval: 'approved', approvedRenewalCount: 3 };
context.applyTalentBonusState_(changedRenewal, approvedServerLesson);
assert.deepEqual({ approval: changedRenewal.bonusApproval, approved: changedRenewal.approvedRenewalCount }, { approval: 'pending', approved: 0 }, '申報續報人數變更後必須重新待核准');

const storedV2Lesson = {
  id: 'lesson-v2-no-downgrade', teacher: 'QA老師', entryVersion: 2, lessonStatus: 'held', lessonKind: 'scheduled',
  date: '2026-10-08', status: 'submitted', contentRevision: 'revision-v2', updatedAt: '2026-10-08T10:00:00.000Z',
};
const storedV2Row = { record_type: 'lesson', nickname: 'QA老師', status: 'submitted', updated_at: storedV2Lesson.updatedAt, data: storedV2Lesson };
let downgradeWrites = 0;
context.todayStr = () => '2026-10-08';
context.SHEET_NAMES = { TALENT_RECORDS: 'TalentRecords' };
context.findUserByNickname = nickname => nickname === 'QA老師' ? {
  nickname: 'QA老師', role: 'teacher', status: 'active', department: '才藝部門',
  employment_type: 'fulltime', work_assignments: ['talent-fulltime'],
} : null;
context.userHasTalentWork_ = () => true;
context.findObject = () => storedV2Row;
context.talentRecordObject_ = row => JSON.parse(JSON.stringify(row.data));
context.upsertTalentRecord_ = () => { downgradeWrites += 1; throw new Error('降版 payload 不得寫入'); };
const downgradeAttempt = context.saveTalentLesson({
  __actor: { nickname: 'QA老師', role: 'teacher', status: 'active' },
  nickname: 'QA老師',
  lesson: {
    id: storedV2Lesson.id, entryVersion: 1, date: storedV2Lesson.date, lessonStatus: 'held',
    contentRevision: storedV2Lesson.contentRevision, updatedAt: storedV2Lesson.updatedAt,
    courseType: '舊版課程', courseName: '刻意降版', siteType: 'self', site: '布拉克自營教室',
    prepId: 'prep-1', issue: '測試', parentStatus: 'complete', expected: 2, present: 2,
    leave: 0, absent: 0, makeup: 0, trial: 0, newCount: 2, renewalCount: 2,
  },
});
assert.equal(downgradeAttempt.ok, false, '既有 v2 紀錄的 v1 更新必須在任何寫入前失敗');
assert.match(downgradeAttempt.error, /版本已過期.*不可降級/);
assert.equal(downgradeWrites, 0, '降版 payload 不得呼叫資料寫入');
assert.equal(storedV2Row.data.entryVersion, 2, '被拒絕的降版不得改變原紀錄');

let storedLesson = {
  id: 'lesson-app-qa', teacher: 'QA老師', entryVersion: 1, lessonStatus: 'held', siteType: 'self', status: 'submitted',
  appStatus: 'published', appFiles: [{ fileName: 'old.png', fileId: 'old', mimeType: 'image/png', url: 'https://drive.google.com/file/d/old/view' }],
};
let appEvidenceSaves = 0;
let appEvidencePdfCalls = 0;
context.SHEET_NAMES = { TALENT_RECORDS: 'TalentRecords' };
context.LockService = { getScriptLock: () => ({ tryLock: () => true, releaseLock: () => {} }) };
context.findObject = () => ({ record_type: 'lesson', nickname: 'QA老師', data: storedLesson });
context.talentRecordObject_ = row => JSON.parse(JSON.stringify(row.data));
context.upsertTalentRecord_ = (_type, _nickname, lesson) => {
  appEvidenceSaves += 1;
  storedLesson = JSON.parse(JSON.stringify(lesson));
  return JSON.parse(JSON.stringify(storedLesson));
};
context.nowIso = () => '2026-09-10T12:00:00.000Z';
context.logSystem = () => {};
context.generateTalentLessonPdf_ = () => { appEvidencePdfCalls += 1; return {}; };
const appEvidenceParams = {
  __actor: { nickname: 'QA老師', role: 'teacher', status: 'active' },
  nickname: 'QA老師', lesson_id: 'lesson-app-qa', status: 'published', request_id: 'req-app-1', defer_report: true,
  app_files: [{ fileName: 'new.png', fileId: 'new', mimeType: 'image/png', url: 'https://drive.google.com/file/d/new/view' }],
};
const savedAppEvidence = context.updateTalentAppStatus(appEvidenceParams);
assert.equal(savedAppEvidence.ok, true);
assert.equal(savedAppEvidence.lesson.entryVersion, 1, '舊版歷史紀錄仍可透過獨立 APP API 補傳，且不改寫格式版本');
assert.equal(savedAppEvidence.reportStatus, 'pending', 'APP 截圖寫入成功後應立即回覆，由背景接續日報');
assert.deepEqual(Array.from(savedAppEvidence.lesson.appFiles, file => file.fileId), ['new', 'old']);
assert.equal(savedAppEvidence.lesson.lastRequestId, 'req-app-1');
assert.equal(appEvidencePdfCalls, 0, 'APP 截圖寫入不得同步等待 PDF');
const duplicateAppEvidence = context.updateTalentAppStatus(appEvidenceParams);
assert.equal(duplicateAppEvidence.duplicate, true, '相同請求重送時需直接回傳既有結果');
assert.equal(appEvidenceSaves, 1, '相同 APP 截圖請求不得再次寫入');

const backfillRows = [];
const talentRecordHeaders = [
  'record_id', 'record_type', 'nickname', 'department', 'record_date',
  'year_month', 'status', 'data_json', 'created_by', 'updated_by',
  'created_at', 'updated_at', 'submitted_at', 'report_attempted_at',
];
let atomicBackfillWrites = 0;
const mockTalentSheet = {
  getLastRow: () => backfillRows.length + 1,
  getRange: (_row, _column, rowCount, columnCount) => ({
    setValues: values => {
      assert.equal(values.length, rowCount);
      assert.equal(values[0].length, columnCount);
      atomicBackfillWrites += 1;
      values.forEach(valuesRow => {
        const stored = {};
        talentRecordHeaders.forEach((header, index) => { stored[header] = valuesRow[index]; });
        stored.data = JSON.parse(stored.data_json);
        backfillRows.push(stored);
      });
    },
  }),
};
context.Session = { getActiveUser: () => ({ getEmail: () => 'admin@example.com' }) };
context.findUserByEmail = email => email === 'admin@example.com' ? { nickname: '柏翰', role: 'admin', status: 'active' } : null;
context.migrateTalentUserProfiles_ = () => ({ ok: true });
context.findTalentUser_ = nickname => nickname === '酸酸' ? suansuan : null;
context.ensureTalentRecordsSheet_ = () => mockTalentSheet;
context.getHeaders = () => talentRecordHeaders;
context.sheetValueForWrite_ = value => value === undefined || value === null ? '' : value;
context.sheetToObjects = name => name === context.SHEET_NAMES.TALENT_RECORDS ? backfillRows : [];
context.nowIso = () => '2026-10-08T12:00:00.000Z';
context.logSystem = () => {};
context.Logger = { log: () => {} };
const firstSuansuanBackfill = context.backfillSuansuanTalentPtSeptember2026FromEditor();
assert.deepEqual({ created: firstSuansuanBackfill.created, duplicates: firstSuansuanBackfill.duplicates, wage: firstSuansuanBackfill.september_wage_total, pendingRenewals: firstSuansuanBackfill.pending_renewal_approval }, { created: 5, duplicates: 0, wage: 5250, pendingRenewals: 8 }, '酸酸五筆歷史課堂的鐘點與待核准續報必須正確');
assert.equal(backfillRows.length, 5);
assert.equal(atomicBackfillWrites, 1, '五筆回填必須以單一批次原子寫入，不可逐筆追加');
assert.deepEqual(
  backfillRows.map(row => ({ id: row.data.id, date: row.data.date, course: row.data.courseName, present: row.data.present, renewal: row.data.renewalCount, pay: row.data.pay })),
  [
    { id: 'talent-admin-backfill-suansuan-20260905-simple', date: '2026-09-05', course: '簡易', present: 6, renewal: 0, pay: 900 },
    { id: 'talent-admin-backfill-suansuan-20260912-simple', date: '2026-09-12', course: '簡易', present: 8, renewal: 0, pay: 1200 },
    { id: 'talent-admin-backfill-suansuan-20260919-simple', date: '2026-09-19', course: '簡易', present: 4, renewal: 0, pay: 750 },
    { id: 'talent-admin-backfill-suansuan-20260905-wedo', date: '2026-09-05', course: 'WeDo', present: 10, renewal: 4, pay: 1200 },
    { id: 'talent-admin-backfill-suansuan-20260912-wedo', date: '2026-09-12', course: 'WeDo', present: 10, renewal: 4, pay: 1200 },
  ],
  '回填日期、班別、人數、續報與鐘點不得有誤',
);
backfillRows.forEach(row => {
  assert.equal(row.data.entryVersion, 2);
  assert.equal(row.data.adminBackfillApproved, true);
  assert.equal(row.data.backfilled, true);
  assert.equal(row.data.adminPayOverrideApproved, true, '歷史回填鐘點須由管理員核定，保證列入薪資');
  assert.equal(row.data.adminPayOverrideAmount, row.data.pay);
  assert.equal(row.data.payRequiresReview, false);
  assert.deepEqual(row.data.roomFiles, [], '歷史回填不得偽造整潔照片');
  assert.equal(row.data.bonusApproval, row.data.renewalCount > 0 ? 'pending' : 'not_required');
});
const secondSuansuanBackfill = context.backfillSuansuanTalentPtSeptember2026FromEditor();
assert.deepEqual({ created: secondSuansuanBackfill.created, duplicates: secondSuansuanBackfill.duplicates, rows: backfillRows.length }, { created: 0, duplicates: 5, rows: 5 }, '回填函式重跑必須防重，不能再加鐘點');
assert.equal(atomicBackfillWrites, 1, '全數為正確重複資料時不可再次寫入');

const canonicalBackfillRows = JSON.parse(JSON.stringify(backfillRows));
[
  ['pay', 999, /鐘點/],
  ['duration', 2, /時數/],
  ['employment', 'fulltime', /聘用身分/],
  ['site', '錯誤教室', /地點/],
  ['courseName', '錯誤課程', /課程名稱/],
  ['courseType', '錯誤類型', /課程類型/],
  ['scheduleKey', 'wrong-schedule', /排班識別碼/],
  ['scheduleTime', '11:00–12:30', /時間/],
].forEach(([field, wrongValue, expectedError]) => {
  backfillRows.splice(0, backfillRows.length, JSON.parse(JSON.stringify(canonicalBackfillRows[3])));
  backfillRows[0].data[field] = wrongValue;
  backfillRows[0].data_json = JSON.stringify(backfillRows[0].data);
  const beforeRows = JSON.stringify(backfillRows);
  const beforeWrites = atomicBackfillWrites;
  assert.throws(
    () => context.backfillSuansuanTalentPtSeptember2026FromEditor(),
    expectedError,
    `重複資料的 ${field} 不符時必須明確回報衝突`,
  );
  assert.equal(atomicBackfillWrites, beforeWrites, `後段 ${field} 衝突前雖已規劃其他新紀錄，仍不得寫入部分資料`);
  assert.equal(JSON.stringify(backfillRows), beforeRows, `後段 ${field} 衝突不可改動既有資料`);
});
backfillRows.splice(0, backfillRows.length, ...JSON.parse(JSON.stringify(canonicalBackfillRows)));

const archiveSource = fs.readFileSync(path.join(root, 'apps-script/archivefiles.gs'), 'utf8');
const setupSource = fs.readFileSync(path.join(root, 'apps-script/setup.gs'), 'utf8');
const taskSource = fs.readFileSync(path.join(root, 'apps-script/tasks.gs'), 'utf8');
const codeSource = fs.readFileSync(path.join(root, 'apps-script/Code.gs'), 'utf8');
const adminUsersSource = fs.readFileSync(path.join(root, 'admin/users.html'), 'utf8');
const adminDashboardSource = fs.readFileSync(path.join(root, 'admin/dashboard.html'), 'utf8');
const apiSource = fs.readFileSync(path.join(root, 'shared/api.js'), 'utf8');
const workspaceSource = fs.readFileSync(path.join(root, 'shared/workspaces.js'), 'utf8');
const talentUiSource = fs.readFileSync(path.join(root, 'review/talent-v2/app.js'), 'utf8');
assert.doesNotMatch(talentUiSource, /maybeShowPushReminder|talent_push_reminder_seen_/, '不可在開始操作前以延遲通知彈窗攔截點擊');
assert.match(talentUiSource, /data-action="enable-push">開啟 APP 通知/, '保留老師主動開啟通知的設定入口');
const talentStyleSource = fs.readFileSync(path.join(root, 'review/talent-v2/styles.css'), 'utf8');
const talentIndexSource = fs.readFileSync(path.join(root, 'review/talent-v2/index.html'), 'utf8');
const anqinUiSource = fs.readFileSync(path.join(root, 'review/anqin-v2/app.js'), 'utf8');
const adminScheduleHelperSource = adminUsersSource.slice(
  adminUsersSource.indexOf('function scheduleContentKey('),
  adminUsersSource.indexOf('function talentConfigSummary('),
);
const adminScheduleContext = vm.createContext({ Number, Set, String });
vm.runInContext(adminScheduleHelperSource, adminScheduleContext);
const originalAdminSchedules = JSON.parse(JSON.stringify(suansuanSchedules));
const usedAdminScheduleKeys = new Set();
const matchedWedoAfterReorder = adminScheduleContext.matchOriginalSchedule(
  originalAdminSchedules,
  { weekday: 6, time: '10:40–12:10', siteType: 'self', site: '東橋教室' },
  originalAdminSchedules[1].scheduleKey,
  usedAdminScheduleKeys,
);
const matchedSimpleAfterReorder = adminScheduleContext.matchOriginalSchedule(
  originalAdminSchedules,
  { weekday: 6, time: '09:00–10:30', siteType: 'self', site: '東橋教室' },
  originalAdminSchedules[0].scheduleKey,
  usedAdminScheduleKeys,
);
assert.equal(matchedWedoAfterReorder.courseType, 'WeDo 機器人', '管理頁重新排序後 WeDo metadata 必須留在 WeDo');
assert.equal(matchedSimpleAfterReorder.courseType, '樂高簡易積木', '管理頁重新排序後簡易班 metadata 必須留在簡易班');
assert.equal(
  adminScheduleContext.matchOriginalSchedule(
    originalAdminSchedules,
    { weekday: 6, time: '08:00–08:30', siteType: 'self', site: '東橋教室' },
    '',
    new Set(),
  ),
  null,
  '新增班次不得依畫面列號挪用既有 metadata',
);
assert.doesNotMatch(adminUsersSource, /originalSchedule\[index\]/, '管理頁不可再依排班列號黏貼 metadata');
assert.match(adminUsersSource, /suppliedScheduleKey[\s\S]*scheduleContentKey/, '管理頁必須先依 scheduleKey、再依班次內容安全比對');
const logCompleteSource = talentUiSource.slice(talentUiSource.indexOf('function logComplete('), talentUiSource.indexOf('function putLocalLesson('));
const logCompleteContext = vm.createContext({ Boolean, String, Array, Number, Object });
vm.runInContext(logCompleteSource, logCompleteContext);
const completeLog = {
  lessonStatus: 'held', prepId: 'prep-1', attendanceFiles: [{}], learningFiles: [{}], roomFiles: [{}], parentStatus: 'complete',
};
assert.equal(logCompleteContext.logComplete(completeLog), true, '親師溝通已完成時，本堂紀錄應判定完整');
assert.equal(logCompleteContext.logComplete({ ...completeLog, parentStatus: 'followup' }), true, '親師溝通待追蹤時，本堂紀錄仍應判定完整');
assert.equal(logCompleteContext.logComplete({ ...completeLog, parentStatus: 'pending' }), false, '尚未選擇親師狀態不得被誤判為完整');
assert.equal(logCompleteContext.logComplete({ ...completeLog, parentStatus: '' }), false, '空白親師狀態不得被誤判為完整');
const completeSimpleLog = { entryVersion: 2, lessonStatus: 'held', courseName: '簡易', present: 6, newCount: 1, renewalCount: 0, trial: 2, roomFiles: [{}] };
assert.equal(logCompleteContext.logComplete(completeSimpleLog), true, '新版四種人數與整潔照片完整時，不可被舊備課欄位阻擋');
assert.equal(logCompleteContext.logComplete({ ...completeSimpleLog, roomFiles: [] }), false, '新版缺少教室整潔照片不得誤判完整');
const missingTrialLog = { ...completeSimpleLog };
delete missingTrialLog.trial;
assert.equal(logCompleteContext.logComplete(missingTrialLog), false, '新版缺少任一人數欄位不得誤判完整');
assert.equal(logCompleteContext.logComplete({ lessonStatus: 'held', lessonKind: 'coverage', adminBackfillApproved: true }), true, '管理員核定的歷史帶班不得被誤判為缺件');
assert.match(archiveSource, /function listTeacherReportFolders\(/);
assert.match(archiveSource, /item\.removeViewer\(/, '應移除已失效的舊查看權限');
assert.match(archiveSource, /item\.removeEditor\(/, '主管只能查看，不保留舊編輯權限');
assert.match(archiveSource, /function revokeKpiDriveUserAccess_\(/, '刪除員工時必須立即收回雲端檔案權限');
assert.match(archiveSource, /\['active', 'pending', 'suspended', 'deleted'\]/, '才藝雲端日報需包含待開通人員並保留離職人員歷史索引');
const folderListSource = archiveSource.slice(archiveSource.indexOf('function listTeacherReportFolders('), archiveSource.indexOf('/**', archiveSource.indexOf('function listTeacherReportFolders(')));
assert.doesNotMatch(folderListSource, /getOrCreateChildFolder_/, '開啟雲端清單不得建立空白資料夾或拖慢頁面');
assert.match(archiveSource, /function talentIndexedReportFolder_\(/, '才藝雲端日報應使用已保存的資料夾索引');
assert.match(folderListSource, /CacheService\.getScriptCache\(\)/, '雲端日報清單需使用短期快取避免重複掃描 Drive');
assert.match(folderListSource, /params\.refresh/, '主管需要能在背景強制更新快取');
assert.doesNotMatch(folderListSource, /secureKpiReportPath_/, '雲端清單讀取不得同步重掃整批 Drive 權限');
assert.match(archiveSource, /function ensureTeacherReportFolderViewer_\(/, '才藝主管開啟既有日報時需補齊該資料夾的查看權限');
assert.match(folderListSource, /params\.view_as/, '柏翰測試柳丁介面時需套用才藝主管的資料範圍');
assert.match(folderListSource, /actor\.nickname === viewer\.nickname/, '測試視角不可把待開通帳號誤加為正式 Drive 查看者');

const folderUsers = [
  { nickname: '柏翰', role: 'admin', status: 'active', email: 'admin@example.com', work_assignments: ['talent-payroll'] },
  { nickname: '柳丁', role: 'manager', status: 'pending', email: 'manager@example.com', work_assignments: ['talent-manager'] },
  { nickname: '浩浩', role: 'teacher', status: 'active', email: 'hao@example.com', work_assignments: ['talent-fulltime'], department: '才藝部門' },
  { nickname: '黑豹', role: 'teacher', status: 'pending', email: 'panther@example.com', work_assignments: ['talent-pt'], department: '才藝部門' },
];
const folderRows = folderUsers.filter(user => user.nickname === '浩浩').map((user, index) => ({
  record_type: 'lesson', status: 'submitted', nickname: user.nickname, record_date: `2026-09-0${index + 1}`,
  reportFolderUrl: `https://drive.google.com/drive/folders/folder-${index + 1}`,
}));
const folderCache = new Map();
const addedFolderViewers = [];
const archiveContext = vm.createContext({
  Array, Boolean, Date, JSON, Math, Number, Object, RegExp, String,
  SHEET_NAMES: { USERS: 'Users', TALENT_RECORDS: 'TalentRecords' },
  CacheService: { getScriptCache: () => ({ get: key => folderCache.get(key) || null, put: (key, value) => folderCache.set(key, value) }) },
  DriveApp: { getFolderById: id => ({ addViewer: email => addedFolderViewers.push({ id, email }) }) },
  findUserByNickname: nickname => folderUsers.find(user => user.nickname === nickname) || null,
  sheetToObjects: name => name === 'Users' ? folderUsers : folderRows,
  talentAssignments_: user => Array.isArray(user?.work_assignments) ? user.work_assignments : [],
  talentRecordObject_: row => ({ reportUrl: 'https://drive.google.com/file/report', reportFolderUrl: row.reportFolderUrl }),
  normalizeTalentNickname_: value => String(value || '').trim().toLowerCase(),
  normalizeDepartment_: value => String(value || ''),
  sameDepartment_: (left, right) => left === right,
  isGlobalManager_: () => false,
});
vm.runInContext(archiveSource, archiveContext);
const simulatedFolders = archiveContext.listTeacherReportFolders({ __actor: folderUsers[0], viewer: '柏翰', view_as: '柳丁', scope: 'talent' });
assert.equal(simulatedFolders.ok, true);
assert.equal(simulatedFolders.folders.length, 2, '柏翰測試柳丁時應看到才藝老師，不是管理員的全工作區資料夾');
assert.equal(simulatedFolders.folders.find(folder => folder.nickname === '黑豹')?.status, 'pending', '柳丁的雲端日報名單需顯示尚未開通的黑豹');
assert.equal(simulatedFolders.folders.find(folder => folder.nickname === '黑豹')?.reportCount, 0, '待開通且尚無日報的老師仍需列在主管名單');
assert.equal(addedFolderViewers.length, 0, '測試待開通柳丁時不可提前授權其 Google 帳號');
folderUsers[1].status = 'active';
const managerFolders = archiveContext.listTeacherReportFolders({ __actor: folderUsers[1], viewer: '柳丁', scope: 'talent' });
assert.equal(managerFolders.ok, true);
assert.equal(addedFolderViewers.length, 1, '柳丁正式登入後只補齊已有日報資料夾的查看權限');
assert.match(setupSource, /'deleted_at', 'deleted_by'/, '使用者資料表需保存刪除稽核欄位');
assert.match(setupSource, /mergedAssignments\.indexOf\(assignment\) < 0/, '既有安親身分必須合併才藝工作身分，不能覆蓋或漏加');
assert.match(setupSource, /function migrateTalentUserProfiles\(\)/, '才藝帳號遷移需可獨立執行，避免完整初始化逾時');
assert.match(setupSource, /function prepareTalentSeptemberLaunch\(\)/, '正式上線前需有一次性人員狀態與生效日校正');
assert.match(setupSource, /TALENT_PT_STRICT_START.*2026-09-01/s, '才藝制度必須自 2026/09/01 起才判定缺件');
assert.match(codeSource, /nickname: '柳丁'.*status: 'pending'/, '尚未交付的柳丁帳號不可提前啟用');
assert.match(codeSource, /nickname: '浩浩'.*status: 'pending'/, '尚未交付的浩浩帳號不可提前啟用');
assert.match(codeSource, /nickname: '毛毛'.*status: 'pending'/, '尚未交付的毛毛帳號不可提前啟用');
assert.match(setupSource, /nickname: '黑豹'.*schedule_json: \[1, 4\].*19:00–20:30/s, '黑豹固定班表需為週一、週四 19:00–20:30');
assert.match(codeSource, /nickname: '酸酸'[\s\S]*role: 'manager'[\s\S]*employment_type: 'pt'[\s\S]*work_assignments: \['anqin-manager', 'talent-pt'\][\s\S]*courseName: '簡易'[\s\S]*courseName: 'WeDo'/, '酸酸初始帳號必須同時保留安親主管與才藝 PT');
assert.match(setupSource, /nickname: '酸酸'[\s\S]*employment_type: 'pt'[\s\S]*work_assignments: \['anqin-manager', 'talent-pt'\][\s\S]*effectiveFrom: '2026-10-10'/, '既有酸酸帳號遷移後也必須開通才藝 PT 並保留生效日');
assert.match(workspaceSource, /'酸酸': \['anqin-manager', 'talent-pt'\]/, '工作區路由也必須讓酸酸看到才藝 PT');
assert.match(workspaceSource, /normalizeNickname\(user\.nickname\) === '酸酸'[\s\S]*explicit\.includes\('talent-pt'\)/, '酸酸既有登入快照也必須立即補上才藝 PT 入口，不能清除本機草稿');
assert.doesNotMatch(setupSource, /findUserByNickname\(profile\.nickname\)/, '才藝帳號遷移不得逐人重讀整張使用者表');
assert.match(setupSource, /createTextFinder\('永康教室'\)/, '舊部門名稱遷移不得掃描並重寫整欄大量資料');
assert.match(taskSource, /function systemMaintenanceUser_\(params\)/, '排程設定需支援 Apps Script 編輯器直接執行');
assert.match(taskSource, /Session\.getEffectiveUser\(\)\.getEmail\(\)/, '手動維運必須核對目前 Google 管理員');
assert.match(codeSource, /'deleteUser': \(\) => deleteUser\(params\)/, 'API 路由必須提供刪除員工操作');
assert.match(codeSource, /'deleteTalentPrep': \(\) => deleteTalentPrep\(params\)/, 'API 路由必須提供才藝備課刪除操作');
assert.match(backendSource, /function deleteUser\(params\)/);
assert.match(backendSource, /confirmation !== nickname/, '刪除前必須再次輸入完整暱稱');
assert.match(backendSource, /operatorName !== '柏翰'/, '只有柏翰管理員可以執行刪除');
assert.match(backendSource, /user\.role === 'admin'/, '管理員帳號不可被刪除');
assert.match(backendSource, /status: 'deleted'/);
assert.match(backendSource, /push_subscription_id: ''/, '刪除時必須清除 APP 綁定');
assert.match(backendSource, /target\.status !== 'active'.*不能新增或修改才藝資料/s, '刪除後不得再寫入才藝資料');
assert.match(apiSource, /deleteUser: \(nickname, confirmNickname\)/);
assert.match(apiSource, /deleteTalentPrep: \(prepId, confirmationName\)/, '才藝前端 API 需傳送刪除姓名確認');
assert.match(apiSource, /READ_ONLY_TEST_VIEW/, '切換老師視角時 API 必須全面禁止寫入');
assert.match(apiSource, /IMPERSONATION_READ_ACTIONS/, '測試視角只能呼叫明確允許的讀取 API');
assert.match(apiSource, /view_as: window\.AUTH\?\.isImpersonating/, '測試視角讀取雲端日報時需告知後端目前模擬的主管');
assert.match(workspaceSource, /const session = window\.KPI_REVIEW_USER \|\| window\.AUTH\?\.getSession/, '跨職務切換需使用畫面已解析的目前角色，不能被舊登入快照攔住');
assert.match(workspaceSource, /if \(isReviewPreview\) \{[\s\S]*destination\.searchParams\.set\('reviewUser', requestedUser\)/, '審查版跨工作台切換必須保留目前測試身分');
assert.match(adminUsersSource, /顯示已刪除人員/);
assert.match(adminUsersSource, /刪除員工/);
assert.match(adminUsersSource, /歷史日報、薪資與評分會保留/);
assert.match(adminUsersSource, /weekdayLabels\[Number\(item\.weekday\)\][\s\S]*suppliedScheduleKey[\s\S]*matchOriginalSchedule[\s\S]*effectiveFrom: previous\.effectiveFrom/, '管理員編輯酸酸排班時需使用識別碼／內容匹配保留班名及生效日');
assert.match(talentUiSource, /route: 'cloud-reports', label: '雲端日報'/);
assert.match(talentUiSource, /refresh: forceRefresh/, '首次開啟雲端日報應優先使用後端快取，只有手動重新整理才強制更新');
const navSource = talentUiSource.slice(talentUiSource.indexOf('  const NAV = {'), talentUiSource.indexOf('  function authSession()'));
assert.doesNotMatch(navSource, /route: 'prep'|route: 'prep-review'|route: 'weekly'/, '新版正職、PT 與主管導覽不得再出現備課檔案或家長 APP');
assert.match(navSource, /fulltime:[\s\S]*route: 'today'[\s\S]*route: 'class-roster'[\s\S]*route: 'records'/, '才藝正職仍需保留填寫、班級與歷史紀錄');
assert.match(navSource, /pt:[\s\S]*route: 'today'[\s\S]*route: 'class-roster'[\s\S]*route: 'pay'[\s\S]*route: 'records'/, '才藝 PT 仍需保留填寫、班級、鐘點與歷史紀錄');
const navItemsSource = talentUiSource.slice(talentUiSource.indexOf('  function navItems()'), talentUiSource.indexOf('  function routeTitle()', talentUiSource.indexOf('  function navItems()')));
assert.match(navItemsSource, /return NAV\[modeRole\(\)\] \|\| \[\]/, '所有已授權才藝 PT 都必須取得完整 PT 導覽');
assert.doesNotMatch(navItemsSource, /route !== 'pay'|黑豹老師/, '不得依老師姓名隱藏 PT 的鐘點與續報頁');
const renderPaySource = talentUiSource.slice(talentUiSource.indexOf('  function renderPay()'), talentUiSource.indexOf('  function renderPayRow(', talentUiSource.indexOf('  function renderPay()')));
assert.match(renderPaySource, /pageHead\('鐘點與續報',[\s\S]*monthControl\(\)\)/, 'PT 鐘點頁必須能切換月份，才能查看九月歷史回填');
const renderPerformanceSource = talentUiSource.slice(talentUiSource.indexOf('  function renderPerformance()'), talentUiSource.indexOf('  function renderScoreRow(', talentUiSource.indexOf('  function renderPerformance()')));
assert.match(renderPerformanceSource, /displayedKpiBonus = bonusForfeited \? 0[\s\S]*displayedEnrollmentBonus = bonusForfeited \? 0/, '整月獎金取消後，摘要拆分金額也必須歸零');
assert.match(renderPerformanceSource, /<small>KPI \$\{bonusForfeited \|\| published \? formatMoney\(displayedKpiBonus\) : '待公布'\} ＋ 新生／續報 \$\{formatMoney\(displayedEnrollmentBonus\)\}<\/small>/, '摘要畫面必須使用取消後的 KPI 與新生續報金額');
assert.match(backendSource, /prep\.status = 'ready'/, '備課檔案儲存後應立即成為可用資料');
assert.match(backendSource, /talentAttachments_\(prep\.materials, true\)/, '備課檔案必須至少有一份已上傳的教案或教材');
assert.match(backendSource, /function deleteTalentPrep\(/, '才藝備課必須提供正式刪除流程');
assert.match(backendSource, /normalizeTalentNickname_\(params\.confirmation_name\)/, '才藝備課刪除需由後端核對本人姓名');
assert.match(backendSource, /已有 ' \+ usageCount \+ ' 筆課堂紀錄使用這份檔案/, '已被課堂紀錄使用的才藝備課不可刪除');
assert.match(backendSource, /已有相同課程類型與名稱的備課檔案/, '才藝後端需阻擋重複建檔');
assert.match(backendSource, /talentAttachments_\(selectedPrep\.materials, true\)/, '送出本堂紀錄時必須再驗證備課附件');
assert.doesNotMatch(backendSource, /prepRow\.status !== 'approved'/, '本堂紀錄不可再受備課核准狀態阻擋');
assert.match(backendSource, /備課檔案儲存後即可使用，不需要主管審核/, '舊審查 API 必須明確停用');
assert.match(talentUiSource, /pending_users/, '主管人員頁需顯示待開通的黑豹');
assert.match(backendSource, /function talentCanAccessPendingUser_\(/, '待開通才藝人員只能由授權主管查看');
assert.match(talentUiSource, /function visibleTalentStaff\(\)/, '主管總覽與排班需同時顯示已啟用及待開通才藝人員');
assert.match(talentUiSource, /未啟用前不列入計薪與漏填/, '待開通人員需顯示但不可誤列入薪資或漏填');
assert.match(talentUiSource, /function settlementStaff\(/, '離職人員只應在有歷史資料的月份出現在月結');
assert.match(talentUiSource, /person\.status === 'deleted'.*deleted_at/s, 'PT 月結排課應在刪除日期截止');
assert.match(backendSource, /talentCanAccessHistoricalUser_\(actor, user\)/, '主管仍可補建離職人員缺失的歷史 PDF');
assert.match(talentUiSource, /離職保留/);
assert.match(anqinUiSource, /route: 'cloud-reports', label: '雲端日報'/);
assert.match(talentUiSource, /type="file"[^>]*multiple/);
assert.match(talentUiSource, /const COURSE_TYPES = \['幼兒積木', '樂高簡易積木', '樂高小創客', 'WeDo 機器人', 'SPIKE 機器人', '科學實驗', 'FLL challenge戰隊培訓班', '其他才藝課程'\]/, '才藝課程類型需使用目前正式分類');
assert.doesNotMatch(talentUiSource.match(/const COURSE_TYPES = \[[^;]+;/)?.[0] || '', /程式設計|競賽培訓/, '新建檔選單不可再提供已刪除的舊分類');
assert.match(backendSource, /if \(!prep\.materials\.length\) return \{ ok: false, error: '請至少上傳一份教案或教材資料' \}/, '才藝後端也必須拒絕零附件備課，避免舊頁繞過畫面驗證');
assert.match(talentUiSource, /const MAX_TALENT_FILE_BYTES = 25 \* 1024 \* 1024/, '才藝附件需統一支援 25 MB 上限');
assert.match(talentUiSource, /if \(file\.size > MAX_TALENT_FILE_BYTES\)[\s\S]*fileContentFingerprint\(file\)/, '超大檔案需在讀取內容與建立指紋前拒絕，避免手機記憶體耗盡');
assert.match(talentUiSource, /const uploadedFile = await uploadTalentFile\(file, category\)[\s\S]*catch \(error\)[\s\S]*failed\.push/, '混合多檔上傳時單檔失敗不得拖垮整批');
assert.match(talentUiSource, /const logForm = input\.closest\('#log-form'\)[\s\S]*const selectedLessonDate =[\s\S]*category === 'room'[\s\S]*talentUploadDates\.set\(file, roomUploadDate\)/, '跨月帶班的整潔照片必須依表單課程日期存入正確年月資料夾');
assert.match(talentUiSource, /if \(isImage\) source = await compressImage\(file\);[\s\S]*if \(PREVIEW_MODE\)/, '審查模式也必須實際走圖片壓縮，避免測試與正式行為不同');
assert.match(talentUiSource, /function attachmentIcon\([\s\S]*startsWith\('video\/'\)/, '老師與主管需能辨識影片附件');
assert.match(talentUiSource, /data-action="remove-upload"/, '教室整潔照片需可逐檔移除');
assert.match(talentUiSource, /function fileContentFingerprint\(/, '整潔照片需以實際內容建立指紋');
assert.match(talentUiSource, /相同檔案已略過/, '重複整潔照片需略過並清楚告知老師');
assert.match(backendSource, /fingerprint: String\(item\.fingerprint/, '附件內容指紋需保存到雲端供下次編輯繼續防重');
assert.match(talentUiSource, /route: 'records', label: '我的紀錄'/, '才藝老師查看過去內容的入口需直接命名為我的紀錄');
assert.match(talentUiSource, /const teacherPriority = \['today', 'class-roster', 'records'/, '才藝手機底部需直接顯示我的紀錄，不得藏到更多');
assert.match(talentUiSource, /aria-label="編輯今日紀錄"/, '才藝老師需能從我的紀錄直接編輯當日內容');
const logEditorSource = talentUiSource.slice(talentUiSource.indexOf('function openLogEditor('), talentUiSource.indexOf('function field('));
assert.match(logEditorSource, /numberField\('正式學員到課總數', 'present'[\s\S]*numberField\('其中：新生', 'newCount'[\s\S]*numberField\('其中：續報', 'renewalCount'[\s\S]*numberField\('體驗學生人數', 'trial'/, '新版表單需以正式總數、內含分類及體驗另計呈現四種必填人數');
assert.match(logEditorSource, /data-other-formal-count[\s\S]*data-count-summary[\s\S]*data-formal-count-summary[\s\S]*data-trial-count-summary/, '人數表單需顯示其他正式學員與正式／體驗即時摘要');
assert.match(logEditorSource, /uploadField\('課後教室整潔照片', 'room'/, '新版表單必須要求教室整潔照片');
assert.doesNotMatch(logEditorSource, /name="prepId"|textareaField\('課程問題|uploadField\('點名|uploadField\('學習|uploadField\('家長 APP|parentStatus/, '新版表單不得再顯示備課、點名、學習、問題、親師或 APP 欄位');
assert.match(backendSource, /function validateTalentLessonRequiredFields_\(lesson\)/, '才藝後端必填規則需可獨立驗證');
assert.match(backendSource, /courseType: '課程類型'[\s\S]*issue: '課程問題及下次優化'[\s\S]*parentStatus: '親師溝通狀態'/, '舊版資料的必填與中文錯誤訊息仍需保留');
const talentPdfSource = backendSource.slice(backendSource.indexOf('function generateTalentLessonPdf_('), backendSource.indexOf('function regenerateTalentLessonReport('));
assert.match(talentPdfSource, /talentLessonEntryVersion_\(lesson\) >= TALENT_SIMPLE_ENTRY_VERSION_[\s\S]*正式到課總數[\s\S]*其中新生[\s\S]*其中續報[\s\S]*體驗另計[\s\S]*教室整潔[\s\S]*\} else \{[\s\S]*課程問題及下次優化/, '日報必須依版本清楚輸出正式總數、其中新生／續報、體驗另計與整潔照片');
assert.match(talentUiSource, /const draft = existing \|\| state\.draftLog \|\| \{ id: uid\('log'\) \}/, '新增課堂編輯器一開啟就必須取得非空白紀錄編號');
assert.match(talentUiSource, /\.\.\.values,[\s\S]*id: editingId \|\| existingLog\?\.id \|\| uid\('log'\)/, '表單內的空白隱藏欄位不可覆蓋系統產生的課堂編號');
assert.match(talentUiSource, /state\.logs = \(Array\.isArray\(state\.logs\)[\s\S]*id: uid\('log'\)/, '舊本機課堂缺少編號時需自動修復');
assert.match(talentUiSource, /class="record-actions"[\s\S]*data-action="edit-log"[\s\S]*data-action="view-log"/, '編輯與查看按鈕需放入獨立動作列，避免疊在同一座標');
assert.match(talentStyleSource, /\.record-actions \{ display: flex;[\s\S]*gap: 6px;/, '編輯與查看按鈕需保留可點擊間距');
assert.match(talentIndexSource, /app\.js\?v=(?:2026100[89]-talent-(?:simple|pt)-\d+|20261008-release-\d+)/, '才藝頁需更新程式快取版本，避免登入後仍讀到舊介面');
const saveTalentLessonSource = backendSource.slice(backendSource.indexOf('function saveTalentLesson('), backendSource.indexOf('function saveTalentPrep('));
assert.equal((saveTalentLessonSource.match(/talentLessonSaveVersionError_\(/g) || []).length, 2, '才藝儲存需在取鎖前與取鎖後各阻擋一次舊版降版繞過');
assert.doesNotMatch(saveTalentLessonSource, /generateTalentLessonPdf_/, '才藝正式儲存不得同步等待 PDF');
assert.match(saveTalentLessonSource, /queueDeferredTeacherReport_\(\{ type: 'talent'/, '才藝日報需放入背景佇列');
const submitLogSource = talentUiSource.slice(talentUiSource.indexOf('async function submitLog('), talentUiSource.indexOf('function openPrepEditor('));
assert.match(submitLogSource, /newCount \+ renewalCount > present[\s\S]*兩者合計不可超過正式學員到課總數/, '前端送出前必須阻擋新生與續報合計超過正式總數');
assert.match(submitLogSource, /entryVersion: 2[\s\S]*expected: present, present, leave: 0, absent: 0, makeup: 0, trial,[\s\S]*newCount: siteType === 'self' && !isCoverage \? newCount : 0,[\s\S]*renewalCount:/, '新版送出必須標記版本、保留體驗，且只在獎金適用場域保留新生與續報');
assert.doesNotMatch(submitLogSource, /pendingFiles\.attendance\.length|pendingFiles\.learning\.length|pendingFiles\.app\.length/, '新版送出不得再等待點名、學習或 APP 附件');
assert.match(talentUiSource, /function talentSubmissionError\(/, '才藝送出錯誤不得直接顯示內部欄位名稱');
assert.match(talentUiSource, /name="lessonStatus" value="coverage"/, '才藝 PT 表單需提供帶班選項');
assert.match(talentUiSource, /name="coverageStart"[\s\S]*name="coverageEnd"/, '帶班需讓老師選擇開始與結束時間');
assert.match(talentUiSource, /帶班可選實際授課日期/, '帶班日期需開放選擇實際授課日');
assert.match(backendSource, /function talentCoverageSchedule_\(/, '後端需獨立驗證帶班時間與地點');
assert.match(backendSource, /!initialExisting && lesson\.lessonStatus === 'held' && !isCoverage/, '只有帶班可跨日新增，固定課程限制不得被放寬');
assert.match(backendSource, /function backfillHongdouCoverage20260919FromEditor\(/, '需提供一次性補入紅豆 9\/19 帶班鐘點的管理員函式');
assert.match(backendSource, /adminPayOverrideAmount: 1200/, '紅豆 9\/19 帶班須核定 1,200 元');
const talentPaySource = talentUiSource.slice(talentUiSource.indexOf('function renderPay()'), talentUiSource.indexOf('function renderPayRow('));
assert.match(talentPaySource, /normalizeName\(currentUser\.nickname\) === normalizeName\('黑豹老師'\)[\s\S]*黑豹／善化/, '黑豹合作校鐘點卡只能由黑豹本人條件顯示');
assert.doesNotMatch(talentPaySource, /<div class="partner"><strong>黑豹／善化<\/strong><span>每堂固定 900，無續報獎金<\/span><\/div><\/section>/, '黑豹特殊規則不得無條件顯示給其他 PT');
assert.match(talentUiSource, /PREVIEW_MODE && state\.ui\.route === 'cloud-reports'[\s\S]*loadCloudFolders/, '審查模式重新整理雲端日報頁時不得無限停在載入中');
assert.match(talentUiSource, /window\.setTimeout\(\(\) => URL\.revokeObjectURL\(url\), 1000\)/, 'CSV 下載需延後釋放 Blob，避免 Safari 或內嵌瀏覽器下載空檔');
assert.match(talentUiSource, /statusBadge\('bonus-approved'\).*statusBadge\('bonus-pending'\)/, '獎金核准狀態不可誤用舊版備課狀態文案');
assert.match(backendSource, /approvedNew \+ approvedRenewal > Number\(lesson\.present \|\| 0\)[\s\S]*合計不可超過正式學員到課總數/, '獎金核准端也必須阻擋新生與續報合計超過正式總數');
assert.match(talentUiSource, /'正式到課總數', '其中新生', '其中續報', '體驗另計'/, '才藝匯出欄位需清楚標示正式總數、內含分類與體驗另計');
assert.match(talentUiSource, /'bonus-approved': \['已核准'.*'bonus-pending': \['待核准'/, '獎金狀態需明確顯示已核准或待核准');
assert.match(backendSource, /function updateTalentAppStatus\(/, '舊版課堂的 APP 證據 API 仍需保留，避免歷史資料無法補件');
assert.match(backendSource, /function talentLessonSaveVersionError_[\s\S]*talentLessonEntryVersion_\(existingLesson\) < TALENT_SIMPLE_ENTRY_VERSION_[\s\S]*此歷史紀錄為舊版格式，只能查看/, '後端必須阻擋舊制正式紀錄透過 saveTalentLesson 改寫');
assert.match(backendSource, /talentLessonEntryVersion_\(existingLesson\) >= TALENT_SIMPLE_ENTRY_VERSION_[\s\S]*Number\(requestedVersion \|\| 0\) < TALENT_SIMPLE_ENTRY_VERSION_[\s\S]*既有新版紀錄不可降級/, '後端必須阻擋既有 v2 正式紀錄降為 v1 繞過新版檢核');
assert.match(backendSource, /function preserveTalentAdminBackfillState_\([\s\S]*function applyTalentBonusState_\(/, '管理員補登與獎金核准欄位必須由伺服器保護');
assert.match(backendSource, /function talentRubricVersionForMonth_[\s\S]*TALENT_RUBRIC_V2_START_MONTH_[\s\S]*const rubricVersion = talentRubricVersionForMonth_\(month\)/, '後端評分版本必須只由月份決定，不能信任 payload');
assert.match(talentUiSource, /function talentRubricVersionForMonth\([\s\S]*function kpiDimensionsFor\([\s\S]*record\?\.month/, '前端評分版本也必須只由月份決定');
assert.match(talentUiSource, /月底前若未將全部課堂照片上傳至家長 APP[\s\S]*當月獎金全部取消；事後補繳也不補發/, '表單需顯示醒目的 APP 照片獎金政策');
assert.match(talentUiSource, /APP 照片未完成，當月獎金取消，補繳不補發/, '老師與主管月結需使用一致的取消標示');
assert.match(talentUiSource, /Number\(item\.entryVersion \|\| 1\) >= 2[\s\S]*aria-label="編輯今日紀錄"/, '舊制正式紀錄不得顯示新版編輯按鈕');
assert.match(talentUiSource, /補傳 APP 截圖[\s\S]*data-app-evidence-id/, '舊制缺少 APP 截圖時仍需能從紀錄詳情補傳');
assert.match(talentUiSource, /function selectedPerformanceMonth\(\)/, '才藝老師 KPI 應使用獨立評核月份');
assert.match(talentUiSource, /scoreMonthsFor\(currentUser\.nickname, true\)\[0\]/, '才藝老師進入 KPI 時必須直接開啟最近一次已公布評核');
assert.match(talentUiSource, /if \(state\.ui\.route === 'performance'\) state\.ui\.performanceMonth = scoreMonthsFor\(currentUser\.nickname, true\)\[0\] \|\| currentMonth\(\);/, '重新進入才藝 KPI 仍須回到最近一次評核');
assert.match(talentUiSource, /id="performance-history-form"/, '才藝歷史評核需有確認查看按鈕');
assert.match(talentUiSource, /id="scoring-selection-form"/, '才藝主管切換評核月份需有確認查看按鈕');
assert.match(talentUiSource, /目前評核尚未儲存，確定要切換月份嗎/, '才藝主管切換月份前需保護尚未儲存的評核');
assert.doesNotMatch(navSource, /route: 'weekly'/, '新版不得再顯示家長 APP 工作頁');
assert.match(backendSource, /lesson\.siteType === 'partner'[\s\S]*lesson\.appStatus = 'not_required'/, '合作校課程後端必須強制免發布');
assert.match(backendSource, /mergeTalentAppEvidence_\(lesson\.appFiles, params\.app_files\)/, '後端必須驗證 APP 圖片並合併既有雲端檔案');
assert.match(backendSource, /lesson\.lastRequestId = requestId/, 'APP 截圖寫入需保存請求編號，逾時後才能確認實際結果');
assert.match(backendSource, /if \(requestId && lesson\.lastRequestId === requestId\)/, '同一筆 APP 截圖請求不得重複處理');
assert.match(backendSource, /if \(params\.defer_report === true\)[\s\S]*reportStatus: 'pending'/, 'APP 截圖寫入不得等待 PDF 完成才回覆老師');
assert.match(apiSource, /updateTalentAppStatus[\s\S]*defer_report: true/, '共用 API 需要求 APP 截圖先完成儲存，再背景更新日報');
assert.match(backendSource, /家長 APP 發布完成截圖/, '正式 PDF 需收錄 APP 發布證據');
assert.match(adminDashboardSource, /快速測試老師畫面/);
assert.match(adminDashboardSource, /KPI_WORKSPACES\.hrefFor\(workspaceId\)/, '測試入口需導向老師真正使用的新版工作區');
const talentTestWriteActions = talentUiSource.slice(talentUiSource.indexOf('const TEST_VIEW_WRITE_ACTIONS'), talentUiSource.indexOf("document.addEventListener('click'"));
assert.match(talentUiSource, /柏翰互動測試/, '測試視角需清楚標示為可互動沙盒');
assert.match(talentTestWriteActions, /'submit-log'/, '正式送出仍須在測試視角攔截');
assert.doesNotMatch(talentTestWriteActions, /'finish-prep-review'|'review-prep'/, '測試視角也不應保留已停用的主管備課審查');
assert.doesNotMatch(talentTestWriteActions, /'new-log'|'edit-log'|'edit-score'|'open-bonus-approval'/, '測試視角必須能開啟新增與編輯介面');
assert.match(talentUiSource, /表單流程正常，最後送出已攔截/, '按到最後一步時需明確說明未寫入正式資料');

console.log('PASS talent rules, simple entry v2, Acid dual role and schedules, attachments, legacy compatibility, historical payroll, and cloud-report access');
