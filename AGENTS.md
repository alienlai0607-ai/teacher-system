# 布拉克星球 KPI 系統 — Agent 交接文件

> 2026-07-23 由 Claude Code 交接。使用者是柏翰（老闆，繁體中文溝通，回覆要精簡）。

## 系統架構

- **前端**：純靜態網頁，GitHub Pages 部署（repo: `alienlai0607-ai/teacher-system`，網域 `teacher.blockplanetcamp.com`）。push 到 `main` 即上線。
- **後端**：Google Apps Script Web App + Google Sheets 當資料庫。
- **目前 API URL**（在 `shared/config.js`）：
  `https://script.google.com/macros/s/AKfycbwtLLMZe5J-BHGdCgB-exYmdxBhtaY2hqNLKkz47Bp7b89zp7qzFzI3FUpjPdEdw2ijTg/exec`
- **角色**：admin（柏翰）/ manager（酸酸-永康、小魚-北區、柳丁-才藝）/ teacher / admin_staff（皮皮老師-美編行銷）。三部門：永康教室、北區教室、才藝部門。

## 目錄結構

- `teacher/` 老師端（today.html 填日報＋照片上傳、mylog.html 歷史＋對話、tasks.html 事項…）
- `manager/` 主管端（teachers.html 看部門老師日報＋回饋對話）
- `admin/` 老闆端
- `shared/` config.js（API URL）、api.js（API 包裝）、chat.js（雙向對話元件）、img/pdf-banner.png（PDF 橫幅）
- `apps-script/` 後端原始碼，**分模組檔（users.gs, logs.gs, feedback.gs, tasks.gs, pdfreport.gs…）+ `_all_in_one.gs` 合併鏡像**

## ⚠️ 部署流程（最重要）

### 後端（Apps Script）
1. 改 `apps-script/` 模組檔，**同步鏡像到 `_all_in_one.gs`**（兩邊必須一致）。
2. 使用者手動貼進 Apps Script 編輯器：編輯器裡**只留一個 .gs 檔** → 全選刪除 → 貼上 `_all_in_one.gs` 全文 → Cmd+S → 「部署 → 新增部署」。
3. **每次新增部署 URL 都會變** → 使用者貼回新 URL → 更新 `shared/config.js` → git push。
4. 一次性函式（如 `setupKpiReportTrigger`）要在編輯器選函式按 ▶️ 執行。
5. 測試：所有 action 都可用 GET curl 測（`curl -sL "$API?action=xxx&param=yyy"`）；POST 用 curl 會被 302，一律用 `curl -sL` + GET。

### 前端
- 改 JS 要 cache-bust（引用處加 `?v=日期`），使用者端常有舊快取。
- push main 即部署，等 1-2 分鐘。

## 已知地雷（都踩過，不要再踩）

1. **Google HTML→PDF 轉檔器**（`Utilities.newBlob(html,'text/html').getAs('application/pdf')`）：
   - 會砍掉**所有背景色**（div 和 table bgcolor 都沒用）→ 橫幅要用圖片（`shared/img/pdf-banner.png` 抓下來轉 base64 dataURI 內嵌）。
   - **不抓遠端圖片** → 圖一律轉 base64 dataURI（照片用 `lh3.googleusercontent.com/d/<ID>=w360`）。
   - `page-break-inside:avoid` 會把整張卡推到下一頁造成大空白 → 不要用。
2. **Sheets 日期欄**會回 Date 物件不是字串 → 比對前先 `Utilities.formatDate` 正規化。
3. **本機 PDF 預覽**：macOS Chrome headless 嵌不了 PingFang（中文全消失）→ 用 `Heiti TC` 或 `Arial Unicode MS`。
4. **saveLog 防清空保護**：非送出狀態 + 新內容分數 <20 + 既有 >=100 → 跳過儲存（防舊快取前端把資料洗掉）。

## 主要功能（都已上線驗證）

- 2026-10-08 行政美宣主管頁載入加速：正式資料已累積 113 筆，舊版首次開啟還同時讀取班級、異動與提醒三張表，冷啟動實測約 30 秒。新版改為先載入行政資料，班級人數點入時才獨立同步；行政首報獎金仍為首次正式報名且完成繳費每人 50 元，沒有 KPI 分數級距獎金。版本 `20261008-admin-load-1` 已部署為 Apps Script v79，API URL 已更新。本機 2,572 項介面檢查、50 種故障情境、32 項後端規則與班級權限驗收全數通過。

- **日報**：today.html 六桶 KPI（安親部門用 100 分制 ANQIN_KPI，見 config.js）、照片上傳（前端壓縮 1280px → base64 → Drive「KPI證據/部門/暱稱/年月」）。
- **雙向對話**：回饋串 chat.js，老師可回覆主管/老闆。
- **PDF 日報系統**（pdfreport.gs）：
  - 每晚 21:30 trigger 全員日報 PDF → LINE 傳老闆（柏翰＋小魚，`bossUsers_()` 硬編 nickname==='小魚'）。
  - 老師一送出 → 單人 PDF 即時 LINE 通知（`sendSubmitPdf`，用 Script Properties `SENTPDF_<log_id>` 去重）。
  - LINE 指令「kpi」「kpi昨天」「kpi YYYY-MM-DD」（限老闆）。
  - PDF 存 Drive「KPI日報PDF/YYYY-MM」，LINE 傳 Drive 連結（LINE API 不能附檔）。
- **小魚的通知規則**：LINE 收全部人，APP 推播只收北區（他的部門）——不要改壞。

## 設計規範

布拉克星球品牌：奶油底 `#FFF8E7`、深棕字 `#3D2817`（不用純黑白）、Logo 橘 `#E89B3C`；五居民色：布布黃 `#F4C842`、拉拉藍 `#5B9BD5`、克克紅 `#E63946`、球球綠 `#7CB342`、星星深 `#2C3E50`。新視覺產出遵循此色票。

## 未完成／待觀察

- 2026-10-08 `20261008-release-5` 已正式部署為 Apps Script v84，API 改為 `AKfycbwtLLMZe5J-BHGdCgB-exYmdxBhtaY2hqNLKkz47Bp7b89zp7qzFzI3FUpjPdEdw2ijTg`。才藝／才藝 PT 人數介面明確分為「正式學員到課總數」、其中的「新生／續報」及另計的「體驗學生」；即時顯示其他正式學員，且前端、送出後端與主管獎金核定皆拒絕「新生＋續報超過正式人數」。後端另拒絕既有 v2 課堂被舊頁面降版、繞過新版人數與附件驗證。列表、明細、薪資說明、CSV 與 PDF 同步釐清名稱，既有欄位與資料無須搬移。完整 release gate 2,189／2,189 項瀏覽器檢查、50／50 故障情境、320／390／1440px、上傳與草稿復原全部通過，0 失敗；v84 增補的降版整合測試亦通過。
- 2026-10-08 `20261008-release-3` 已正式部署為 Apps Script v82，API 改為 `AKfycbwokrIgJZMKZWO5XyvsBlW0OK3UcvyS100W5Xn-orT4jk_nRju-uHC6U7An06MkrS3bZQ`，`ping` 已回 HTTP 200 與正確 release。安親主管月度總覽移除重複的「日報明細／班務稽核」導覽，改由月曆當日區塊直接進入日報回饋與教室整潔稽核；所有安親月份改為缺交每次扣 2 分、遲到 0～2 次不扣、3 次含以上固定扣 5 分，2026-09 的缺交與遲到次數由主管手填、不採系統紀錄，另保留 0～5 分九月加分。正式站驗收另修正 Sheets 月份 Date 物件造成的 ISO 月份、慢速「最近評核」覆蓋主管手動選擇，以及評分證據冷啟動卡住整頁：現改為先顯示可填寫評分表、證據背景補齊，直開評核不再同時跑月總覽全量同步；後端每次證據彙整由約 40～50 次 Sheets 操作降為 6 次批次讀取。才藝／才藝 PT 新制只填正式、新生、續報、體驗四項人數與教室整潔照片；酸酸已獲才藝 PT 權限並可切換月份查看鐘點，已執行 `backfillSuansuanTalentPtSeptember2026FromEditor()`，新增 5 筆、0 重複，9 月鐘點合計 5,250 元、8 位續報待主管審核，2026/09/10 加班未處理。月底照片經主管查證不完整時可永久取消當月獎金（PT 鐘點費不受影響）。最終 release gate 2,185 項瀏覽器檢查、50/50 故障情境及上傳／暫存復原全部通過，0 失敗。
- 2026-10-07 才藝 PT 新增「帶班」：老師可選實際授課日期、開始／結束時間與地點；時數限 0.5 小時倍數、0.5～4 小時，按實際時數與計薪人數計算。帶班不抵固定班次、不要求家長 APP、不列新生／續報獎金；固定課程仍只能當日送出。版本 `20261007-talent-coverage-1` 已部署為 Apps Script v78（穩定網址不變）。紅豆 2026/09/19 代酸酸上東橋 WEDO（10:40–12:10、11 人）已由柏翰核定最高既有級距 800 元／小時並補入 1,200 元；防重驗證 `duplicate:true`，9 月鐘點合計 7,650 元。2026/09/10 加班 1 小時依柏翰指示完全未處理。本機瀏覽器 2,572 項檢查、50 種故障情境與後端規則測試全數通過。
- 2026-10-07 安親「新增備課檔案」建立日期可選今天或上一個工作日：週一回推週五；既有備課日期維持唯讀，後端拒絕更早或未來日期。版本 `20261007-prep-date-1` 已部署為 Apps Script v75（穩定網址不變），本機 2,570 項介面檢查及 50 種故障情境全數通過。已於 2026-10-07 19:09:09 執行全員登入失效；此操作只輪替伺服器 Session 簽章，不清除裝置內 KPI 草稿、待上傳照片或附件。
- 2026-10-05「下一個工作日交付」與第一版背景照片上傳已上線：Apps Script v70，前端 main `e14ab3f`。週五可於週一完成，不列補繳、不扣分；照片與證據責任不順延。
- 2026-10-05 老師照片送出加速版 `20261005-photo-batch-1` 已正式上線：Apps Script v74，最多 12 張共用一次登入、資料夾與權限檢查；送出只等待尚未完成的照片批次。8 張真實雲端照片驗收為 1 次請求、8/8 成功、38.259 秒、清理完成；正式資料寫入、讀回、私密預覽與清理驗收 5/5 通過，本機驗收 2568 項及 50 種故障情境全通過。v74 新增管理員專用 `invalidateAllAppSessionsFromEditor`，並已於 2026-10-05 21:22:27 執行一次，全員既有 KPI 登入均已失效、須重新登入。
- 小明反映無法上傳照片：後端實測正常，已修前端兩個洞（Android 空 MIME 靜默失敗、HEIC 解碼失敗）於 commit f2d8148，**待小明實際重測確認**。若仍失敗請他截圖錯誤訊息。
- 21:30 自動日報 trigger：已指導使用者在編輯器執行 `setupKpiReportTrigger`，未獨立確認是否真的跑過。
- 舊 Apps Script 部署建議使用者封存（避免舊前端快取打到舊後端），未確認完成。
- 羊羊 7/6 日報只有照片沒文字（當時舊版前後端造成），補繳現在要扣 2 點，使用者決定是否要求補。
