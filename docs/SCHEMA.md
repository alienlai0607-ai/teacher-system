# Google Sheet Schema — KPI 系統

> 觸發詞：`kpi系統` ｜ 共 11 個分頁。Apps Script `setupSheet()` 會自動建立。

---

## 1️⃣ Users 使用者
| 欄位 | 型別 | 說明 |
|---|---|---|
| nickname | string | 暱稱（PK，初始由 admin 預建） |
| email | string | Google Gmail（首次登入綁定，admin 可空著） |
| role | enum | `admin` / `manager` / `teacher` |
| department | enum | `永康教室` / `北區教室` / `才藝部門` / `總部` |
| status | enum | `active` / `pending` / `suspended` |
| phone | string | 選填 |
| joined_at | datetime | 建立時間 |
| last_login | datetime | 最後登入時間 |
| notes | string | admin 備註 |

**初始資料：**
```
柏翰    | admin   | 總部     | active
酸酸    | manager | 永康教室 | active
小魚    | manager | 北區教室 | active
柳丁    | manager | 才藝部門 | active
松鼠    | teacher | 永康教室 | active
羊羊    | teacher | 永康教室 | active
紅豆    | teacher | 永康教室 | active
江江    | teacher | 北區教室 | active
小明    | teacher | 北區教室 | active
浩浩    | teacher | 才藝部門 | active
毛毛    | teacher | 才藝部門 | active
```

---

## 2️⃣ DailyLogs 每日工作日誌（核心）
| 欄位 | 型別 | 說明 |
|---|---|---|
| log_id | string | `LOG-YYYYMMDD-暱稱` |
| date | date | 日期 |
| nickname | string | FK→Users |
| department | string | 部門（冗餘存，方便查） |
| role | string | teacher / manager（決定欄位類別） |
| checkin_at | datetime | 到班時間 |
| checkout_at | datetime | 離班時間 |
| **— 老師欄位 / 主管欄位（依 role）—** | | |
| kpi1_data | json | 課業指導 / 團隊領導 |
| kpi2_data | json | 班級經營 / 教學品質監督 |
| kpi3_data | json | 專案課程 / 部門特色發展 |
| kpi4_data | json | 群組經營 / 招生續班+發文 |
| kpi5_data | json | 親師溝通 / 客訴處理 |
| kpi6_data | json | 個人態度（共用） |
| reflection | string | 今日心得（自由文字） |
| help_needed | boolean | 是否求助主管 |
| help_content | string | 求助內容 |
| attachments | json | 附件連結陣列 [{type, url, kpi}] |
| created_at | datetime | |
| updated_at | datetime | |
| locked | boolean | 24h 後鎖定（防事後造假） |

---

## 3️⃣ OKR_Goals 學期目標
| 欄位 | 說明 |
|---|---|
| okr_id | UUID |
| semester | `2026-上` / `2026-下` |
| nickname | FK |
| objective_no | 1 or 2 |
| objective_type | 五大類型 |
| objective_text | O 描述 |
| kr1_text / kr2_text / kr3_text | KR 描述 |
| kr1_progress / kr2_progress / kr3_progress | 0-100% |
| month_check (1-6) | 每月進度更新 |
| status | active / completed / cancelled |

---

## 4️⃣ TeacherEval 老師月度評核
| 欄位 | 說明 |
|---|---|
| eval_id | `EVAL-YYYY-MM-暱稱` |
| year_month | `2026-05` |
| nickname | 被評核老師 |
| evaluator | 主管暱稱 |
| self_score_k1-k6 | 老師自評 |
| self_summary | 老師自評說明 |
| score_k1-k6 | 主管評分 |
| score_okr | OKR 分數（0-30） |
| total_score | KPI+OKR |
| grade | 卓越/優良/達標/合格/待改善 |
| bonus | 獎金金額 |
| manager_comment | 主管評語 |
| interview_notes | 面談紀錄 |
| status | draft / submitted / confirmed |
| created_at / updated_at | |

---

## 5️⃣ ManagerEval 主管月度評核
| 欄位 | 說明 |
|---|---|
| eval_id | `MEVAL-YYYY-MM-暱稱` |
| year_month | |
| nickname | 被評核主管 |
| evaluator | `柏翰`（固定） |
| self_score_m1-m6 | 主管自評 |
| score_m1-m6 | 柏翰評分 |
| score_okr | |
| total_score | |
| grade / bonus | |
| dept_avg_score | 部門老師平均（自動帶入，連坐判斷） |
| bonus_okr / bonus_recruit / bonus_dept | 加碼項 |
| final_bonus | 最終獎金 |
| boss_comment | |
| interview_notes | |
| status | |

---

## 6️⃣ Feedback 即時主管回饋
| 欄位 | 說明 |
|---|---|
| feedback_id | UUID |
| log_id | FK→DailyLogs |
| from_nickname | 主管暱稱 |
| to_nickname | 老師暱稱 |
| content | 回饋內容 |
| tag | `優秀表現` / `已知悉` / `需改進` / `求助回應` |
| created_at | |
| read_at | 老師讀取時間 |

---

## 7️⃣ Evidence 證據附件索引
| 欄位 | 說明 |
|---|---|
| evidence_id | UUID |
| log_id | FK |
| nickname | |
| date | |
| kpi_category | 1-6 |
| type | photo / link / file |
| url | Google Drive / 外連 |
| description | |

---

## 8️⃣ Observation 觀課/巡班紀錄
| 欄位 | 說明 |
|---|---|
| obs_id | UUID |
| date | |
| observer | 主管暱稱 |
| observed | 老師暱稱 |
| type | `observe` 正式觀課 / `patrol` 巡班 |
| duration_min | |
| score | 0-5 |
| notes | |
| photos | json |

---

## 9️⃣ Posts 社群發文紀錄（主管 KPI④ 證據）
| 欄位 | 說明 |
|---|---|
| post_id | UUID |
| date | |
| nickname | 主管暱稱 |
| department | |
| platform | `FB` / `IG` |
| url | 貼文連結 |
| screenshot | 截圖 URL |
| content_type | 教學日常/招生/活動/理念/其他 |
| week_of | 屬於哪一週（用於每週 3 篇計算） |

---

## 🔟 KPI_Config 評分規則設定
| 欄位 | 說明 |
|---|---|
| version | 版本號 |
| role | teacher / manager |
| kpi_no | 1-6 |
| max_score | 滿分 |
| sub_items | json 子項目與配分 |
| grade_rules | json 評分原則 |
| effective_from | 生效日 |

---

## 1️⃣1️⃣ Logs_System 系統紀錄（debug/audit）
| 欄位 | 說明 |
|---|---|
| timestamp | |
| nickname | 操作者 |
| action | 動作類型 |
| target | 對象 |
| detail | json |
| ip | |

---

## 索引與效能
- DailyLogs 應建立 `nickname + date` 複合篩選
- 大量資料時可考慮每月歸檔到獨立分頁
