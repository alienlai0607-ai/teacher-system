# AICEO 唯讀資料介面

此介面讓 AICEO 隨時讀取 KPI 系統資料，不改寫任何 Sheet，也不共用柏翰的登入工作階段。

## 安全邊界

- 只有 `externalData` 路由接受 AICEO 金鑰；既有新增、修改、刪除、上傳與通知路由仍使用原工作階段與角色權限。
- 只接受 HTTPS `POST` JSON。金鑰不可放在網址、Git、前端或試算表。
- Apps Script 只保存金鑰的 SHA-256；重新產生金鑰會讓舊金鑰立即失效。
- `users` 不提供 LINE user id 與推播 subscription id。
- 附件必須先在允許的 KPI 資料表中被引用，並以 512 KiB 以下的 base64 區塊讀取，不能拿金鑰讀任意 Drive 檔案。
- `summary` 不含學生姓名、照片與老師原文，可供 AICEO 日常營運判讀；原始資料只應在受控後端按需讀取，不直接塞入模型 prompt。

## 部署與交付

1. 將最新 `apps-script/_all_in_one.gs` 貼進 Apps Script，儲存並「新增部署」。
2. 在 Apps Script 編輯器手動執行 `setupExternalDataAccess()`。
3. 立即複製彈出視窗中的 `api_key`；它只顯示這一次，也不會寫進執行日誌。
4. 將新 Web App URL 與金鑰存入 AICEO 專案的 `.env`：

```dotenv
KPI_READ_ENABLED=true
KPI_API_URL=https://script.google.com/macros/s/新的部署ID/exec
KPI_API_KEY=bp_kpi_...
```

5. AICEO 重啟後，由營運治理者登入並讀取 `/api/v1/integrations/kpi/summary` 驗證。

需要立即撤銷時，在 Apps Script 執行 `revokeExternalDataAccess()`。需要輪替時重新執行 `setupExternalDataAccess()`，再更新 AICEO `.env`。

## 請求格式

所有請求都送到同一個 Apps Script Web App URL，`Content-Type` 使用 `text/plain;charset=utf-8` 或 `application/json`。

資料目錄：

```json
{"action":"externalData","operation":"manifest","api_key":"bp_kpi_..."}
```

營運彙總（含各才藝班最近一堂的人數快照）：

```json
{"action":"externalData","operation":"summary","api_key":"bp_kpi_..."}
```

分頁讀取原始資料：

```json
{
  "action":"externalData",
  "operation":"read",
  "api_key":"bp_kpi_...",
  "dataset":"talent_records",
  "cursor":"0",
  "limit":100
}
```

回應的 `page.next_cursor` 為空字串時已讀完；單頁上限 200 筆。

讀取附件區塊：

```json
{
  "action":"externalData",
  "operation":"attachment",
  "api_key":"bp_kpi_...",
  "file_id":"Drive 檔案 ID",
  "offset":0,
  "length":524288
}
```

每段 `chunk_base64` 要各自解碼後依 offset 串接；`has_more=false` 才算完成。

## 可讀資料集

`users`、`daily_logs`、`weekly_reports`、`okr_goals`、`teacher_evaluations`、`manager_evaluations`、`feedback`、`evidence`、`observations`、`posts`、`kpi_config`、`students`、`tasks`、`course_preps`、`talent_records`、`admin_marketing_records`。

`summary.talent` 的人數依每個固定班次／課程「最近一堂老師回報」計算，不可當成收費或正式學籍主檔；回應會保留這項資料依據說明。

## 本機驗證

- AICEO 金鑰雜湊、POST 限制、彙總計算、模組／`_all_in_one.gs` 同步測試通過。
- Apps Script 合併檔語法檢查通過。
- KPI 全角色桌機／手機與安親、才藝、行政完整流程：1,004 項瀏覽器檢查全數通過，無 JavaScript 錯誤。
- 正式 Apps Script 與真實 Sheet 尚未測試；需完成新部署與金鑰設定後再做只讀連線驗收。
