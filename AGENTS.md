# 布拉克星球 KPI 系統 — Agent 交接文件

> 2026-07-23 由 Claude Code 交接。使用者是柏翰（老闆，繁體中文溝通，回覆要精簡）。

## 系統架構

- **前端**：純靜態網頁，GitHub Pages 部署（repo: `alienlai0607-ai/teacher-system`，網域 `teacher.blockplanetcamp.com`）。push 到 `main` 即上線。
- **後端**：Google Apps Script Web App + Google Sheets 當資料庫。
- **目前 API URL**（在 `shared/config.js`）：
  `https://script.google.com/macros/s/AKfycbyantQSORV8ulYF_LhHvhxOeRxvlwvUV40oFGRY_Hk9O6JxI5EaRXyFg_Vvi6C8K170UQ/exec`
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

- 小明反映無法上傳照片：後端實測正常，已修前端兩個洞（Android 空 MIME 靜默失敗、HEIC 解碼失敗）於 commit f2d8148，**待小明實際重測確認**。若仍失敗請他截圖錯誤訊息。
- 21:30 自動日報 trigger：已指導使用者在編輯器執行 `setupKpiReportTrigger`，未獨立確認是否真的跑過。
- 舊 Apps Script 部署建議使用者封存（避免舊前端快取打到舊後端），未確認完成。
- 羊羊 7/6 日報只有照片沒文字（當時舊版前後端造成），補繳現在要扣 2 點，使用者決定是否要求補。
