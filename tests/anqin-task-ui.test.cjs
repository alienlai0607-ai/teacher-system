const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'review/anqin-v2/app.js'), 'utf8');
const styles = fs.readFileSync(path.join(root, 'review/anqin-v2/styles.css'), 'utf8');
const evaluationBackend = fs.readFileSync(path.join(root, 'apps-script/evaluation.gs'), 'utf8');

const taskRenderer = source.slice(source.indexOf('function taskPriorityMeta('), source.indexOf('function expectedBackendDepartment('));
assert.match(taskRenderer, /function openTaskDetail\(/, '追蹤事項必須能開啟完整內容對話框');
assert.match(taskRenderer, /data-action="open-task-detail"/, '每一筆事項都要有明確的查看入口');
assert.match(taskRenderer, /data-action="close-dialog">返回列表/, '對話框必須能直接返回列表');
assert.match(taskRenderer, /task-detail-copy/, '長文字必須在詳情內完整換行顯示');
assert.doesNotMatch(taskRenderer, /<table class="data-table"/, '追蹤事項不得再使用手機需橫向捲動的表格');

const cloudTaskSync = source.slice(source.indexOf('async function syncTasksFromCloud('), source.indexOf('async function refreshTaskCloudData('));
assert.match(cloudTaskSync, /detail: knownSources\.includes\(remoteDetail\) \? '' : remoteDetail/, '主管說明不得再誤塞進來源標籤');
assert.match(cloudTaskSync, /source = knownSources\.includes\(remoteDetail\)/, '雲端事項需要正確辨識來源');
assert.match(source, /source: taskDetailText\(task\) \|\| task\.source/, '更新完成狀態時不得覆蓋主管原始說明');
assert.match(source, /count: \(\) => state\.tasks\.filter\(task => task\.owner === state\.context\.teacher && task\.status !== 'done'\)\.length/, '老師選單的待辦數量只能計算自己的未完成事項');

assert.match(source, /class="evaluation-score-list"/, '老師查看主管評核時分數不可使用寬表格');
assert.match(source, /class="manager-eval-score-input"/, '主管輸入分數需要靠近評核項目');
assert.match(styles, /\.task-open-button[\s\S]*overflow-wrap: anywhere/, '追蹤事項摘要需要可換行');
assert.match(styles, /\.evaluation-score-row[\s\S]*grid-template-columns: minmax\(0, 1fr\) auto/, '各項分數必須在目前畫面直接可見');
assert.match(source, /loadTeacherEvaluation\('latest'\)/, '老師進入主管評核時必須直接載入最近一次已公布結果');
assert.match(source, /data-form="evaluation-history"/, '老師查看歷史評核必須有獨立確認表單');
assert.match(source, /data-form="manager-evaluation-selection"/, '主管切換老師或月份必須先按確認');
assert.doesNotMatch(source, /data-change="evaluation-month"/, '老師選擇月份時不得尚未確認就立即載入');
assert.doesNotMatch(source, /data-change="manager-evaluation-(?:teacher|month)"/, '主管選擇老師或月份時不得尚未確認就立即載入');
assert.match(source, /目前評核尚未儲存，確定要切換查看對象嗎/, '主管切換前需保護尚未儲存的評核');
assert.match(evaluationBackend, /requestedMonth === 'latest'/, '後端需支援查詢最近一次評核');
assert.match(evaluationBackend, /filter\(item => !workerViewer \|\| item\.status === 'submitted'\)/, '老師只能將已完成評核列入最近一次與歷史清單');
assert.match(evaluationBackend, /selected_month/, '後端需回傳實際開啟的評核月份');

const getEvalSource = evaluationBackend.slice(evaluationBackend.indexOf('function getEval('), evaluationBackend.indexOf('function listEvals('));
const submittedJune = { eval_id: 'EVAL-2026-06-紅豆', nickname: '紅豆', year_month: '2026-06', status: 'submitted' };
const draftJuly = { eval_id: 'EVAL-2026-07-紅豆', nickname: '紅豆', year_month: '2026-07', status: 'draft' };
const submittedMay = { eval_id: 'EVAL-2026-05-紅豆', nickname: '紅豆', year_month: '2026-05', status: 'submitted' };
const evalRows = [submittedJune, draftJuly, submittedMay];
const evalContext = vm.createContext({
  SHEET_NAMES: { TEACHER_EVAL: 'TeacherEval', MANAGER_EVAL: 'ManagerEval' },
  findUserByNickname: nickname => nickname === '紅豆'
    ? { nickname: '紅豆', role: 'teacher', status: 'active', department: '東橋教室' }
    : nickname === '小魚'
      ? { nickname: '小魚', role: 'manager', status: 'active', department: '東橋教室' }
      : null,
  sameDepartment_: (a, b) => a === b,
  isGlobalManager_: () => false,
  sheetToObjects: () => evalRows,
  findObject: (_sheet, _key, value) => evalRows.find(item => item.eval_id === value) || null,
});
vm.runInContext(getEvalSource, evalContext);
const teacherLatest = evalContext.getEval({ nickname: '紅豆', viewer: '紅豆', year_month: 'latest' });
assert.equal(teacherLatest.eval.year_month, '2026-06', '老師最近一次不得誤開尚未公布的七月草稿');
assert.deepEqual(Array.from(teacherLatest.months), ['2026-06', '2026-05']);
const managerLatest = evalContext.getEval({ nickname: '紅豆', viewer: '小魚', year_month: 'latest' });
assert.equal(managerLatest.eval.year_month, '2026-07', '主管可直接回到最近處理的評核草稿');

const dailyTrackRules = source.slice(source.indexOf('function activityTrackMeta('), source.indexOf('function activityDetailSchema('));
assert.match(dailyTrackRules, /學科外｜特色課程（如有則填）/, '特色課程入口必須明確標示當日選填');
assert.match(dailyTrackRules, /return tracks\.academic\.covered;/, '日結只要求每日課業輔導存在');
assert.doesNotMatch(source, /blockers\.push\('新增特色課程紀錄'\)/, '沒有特色課程不得阻擋日結');
assert.match(source, /!tracks\.enrichment\.covered \|\| tracks\.enrichment\.items\.every\(weeklyActivityCoreReady\)/, '週整理須將沒有特色課程視為正常');
assert.match(source, /tracks\.enrichment\.covered && !enrichmentReady/, '若已新增特色課程但內容不完整仍須列為缺件');
assert.match(source, /學科內必填；學科外有課才填/, '主管審查頁必須使用相同規則說明');
assert.match(source, /id="activity-track-indicator">\$\{renderActivityTrackIndicator\(value\.type\)\}/, '特色課程表單內要再次顯示有課才填、填了要完整的規則');
assert.match(styles, /\.daily-track-row\.is-optional:not\(\.is-covered\)/, '選填的特色課程不得以紅色缺件樣式呈現');

console.log('PASS anqin task dialog, visible evaluation scores, and optional enrichment rules');
