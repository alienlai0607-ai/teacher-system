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

console.log('PASS anqin task dialog, cloud detail mapping, and visible evaluation scores');
