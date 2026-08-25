# Google Sheet Schema

Apps Script `setupSheets()` 會建立或補齊 15 個資料表。它不刪除既有欄位與資料，並把舊部門名稱「永康教室」轉為「東橋教室」。

## 1. Users

`nickname, email, role, department, status, phone, joined_at, last_login, notes, subtype, line_user_id, push_subscription_id`

- `nickname`：系統主識別名稱。
- `email`：由管理員預先綁定的 Google Email，不提供自助認領。
- `role`：`admin`、`manager`、`teacher`、`admin_staff`。
- `department`：`東橋教室`、`北區教室`、`才藝部門`、`總部`。
- `status`：`active`、`pending`、`suspended`。
- `subtype`：行政子類型 `general` 或 `marketing`。
- 通知識別碼只由已登入帳號的綁定流程寫入。

## 2. DailyLogs

`log_id, date, nickname, department, role, checkin_at, checkout_at, kpi1_data...kpi6_data, reflection, help_needed, help_content, attachments, created_at, updated_at, locked, is_makeup, submitted_at`

- `log_id`：`LOG-YYYYMMDD-暱稱`，同一老師同一天固定一筆。
- 安親 V2 的完整結構化快照存於 `kpi6_data.v2_snapshot`，舊欄位同時保留主管報表需要的摘要。
- `attachments`：照片與檔案陣列，包含 `type, url, fileId, fileName, kpi, description, forType`。
- 草稿沒有 `submitted_at`；正式送出後才納入主管待審與 PDF 通知。

## 3. OKR_Goals

`okr_id, semester, nickname, objective_no, objective_type, objective_text, kr1_text...kr3_text, kr1_progress...kr3_progress, month1...month6, status, created_at, updated_at`

## 4. TeacherEval

`eval_id, year_month, nickname, evaluator, self_k1...self_k6, self_summary, score_k1...score_k6, score_okr, total_score, grade, bonus, score_late_count, late_penalty, makeup_count, makeup_penalty, bonus_granted, manager_comment, interview_notes, status, created_at, updated_at`

- 安親老師使用 100 分制；後端限制各構面上限並重新計算總分、等第與獎金。
- 教師只能查看自己；同教室主管可評核，酸酸不跨北區，小魚可跨教室。

## 5. ManagerEval

`eval_id, year_month, nickname, evaluator, self_m1...self_m6, self_summary, score_m1...score_m6, score_okr, total_score, grade, bonus, bonus_granted, makeup_count, makeup_penalty, dept_avg_score, bonus_okr, bonus_recruit, bonus_dept, final_bonus, boss_comment, interview_notes, status, created_at, updated_at`

## 6. Feedback

`feedback_id, log_id, from_nickname, to_nickname, content, tag, created_at, read_at`

同一 `log_id` 形成主管與老師的對話串。老師可回覆同教室主管、全域主管或管理員，無關人員不可讀取。

## 7. Evidence

`evidence_id, log_id, nickname, date, kpi_category, type, url, description, source_type, created_at`

提供舊版與管理報表的附件索引；`source_type` 用來區分新版直接 KPI 編號與歷史日報編號，安親 V2 主要附件也保存在 `DailyLogs.attachments`。

## 8. Observation

`obs_id, date, observer, observed, type, duration_min, score, notes, photos, created_at`

## 9. Posts

`post_id, date, nickname, department, platform, url, screenshot, content_type, week_of, created_at`

## 10. KPI_Config

`config_id, version, role, kpi_no, max_score, sub_items, grade_rules, effective_from`

系統內「更多／評分標準」應與此設定及安親 V2 顯示同步更新。

## 11. Logs_System

`timestamp, nickname, action, target, detail, ip`

保存登入、寫入、通知、匯出與維運操作摘要，不存 Google ID token 或工作階段密鑰。

## 12. WeeklyReports

`week_id, week_of, nickname, department, role, teaching_reflection, student_observation, tool_needs, course_improvement, created_at, updated_at`

週整理應從每日結構化紀錄彙整，不再要求重寫每天發生的內容。

## 13. Students

`student_id, name, teacher, department, status, notes, created_at, updated_at`

老師只能取得自己名冊；同教室主管管理教室名冊；小魚與管理員可跨教室。轉交班級時更新 `teacher`，不刪歷史日誌。

## 14. Tasks

`task_id, title, detail, assignee, department, due_date, status, created_by, created_at, updated_at, done_at`

主管可建立與管理權限範圍內的追蹤事項；老師可更新自己的事項狀態。

## 15. CoursePrep

`prep_id, nickname, department, title, course_type, created_date, status, data_json, created_at, updated_at`

- 備課教案建檔與當日工作類型分離，可先建立、未來授課再選用。
- `data_json` 保存教案流程、目標、教材與版本內容；不要求預計授課日、送審日、鎖定日或適用班級。
- 只有本人或管理員可改寫、刪除；主管從教案審查讀取並提出意見。

## Drive 輸出

- 個人與全體 PDF：`KPI日報PDF / YYYY-MM`。
- 月歸檔 CSV：`KPI月歸檔 / 教室 / 老師 / YYYY-MM`。
- 舊 PDF 只作歷史查閱，不寫回 `DailyLogs`。

## 相容與索引

- 主要查詢鍵：`DailyLogs.nickname + date`、`TeacherEval.nickname + year_month`、`CoursePrep.nickname + created_date`。
- 舊「永康教室」讀取時等同「東橋教室」，更新部署後由 `setupSheets()` 寫回正式名稱。
- 新欄位只追加到表頭右側；不要用刪表重建方式升級正式資料庫。
