const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'review/anqin-v2/app.js'), 'utf8');
const styles = fs.readFileSync(path.join(root, 'review/anqin-v2/styles.css'), 'utf8');

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
