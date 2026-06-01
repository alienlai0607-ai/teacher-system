# 🪐 布拉克星球 KPI 系統

> 觸發詞：`kpi系統`
> 老師工作日誌 × KPI/OKR 評核 × 獎金自動計算

## 系統角色

| 角色 | 人員 | 功能 |
|---|---|---|
| **admin** | 柏翰 | 看全部、評核 3 位主管、人員管理、獎金核發 |
| **manager** | 酸酸（永康）、小魚（北區）、柳丁（才藝） | 評核部門老師、寫日誌、被柏翰評核 |
| **teacher** | 松鼠/羊羊/紅豆/江江/小明/浩浩/毛毛 | 寫每日日誌、看自己 KPI 預估 |

## 部署步驟

### 1️⃣ 建立 Google Sheet
1. 開新的 Google Sheet，命名為 `KPI系統資料庫`
2. 「擴充功能 → Apps Script」
3. 把 `apps-script/` 內所有 `.gs` 檔案內容貼到 Apps Script 編輯器（依序新增檔案）
4. 儲存後執行 `setupSheets()`，第一次會要求授權
5. 確認 Google Sheet 出現 11 個分頁，且 Users 已預填 11 位人員

### 2️⃣ 部署 Apps Script Web App
1. 在 Apps Script 編輯器：「部署 → 新增部署作業」
2. 類型：**Web 應用程式**
3. 執行身分：**我**
4. 存取權限：**任何人**（前端會自己驗證 Google 登入）
5. 部署後複製「Web App URL」

### 3️⃣ 設定 Google OAuth Client ID
1. 前往 [Google Cloud Console](https://console.cloud.google.com/apis/credentials)
2. 建立 OAuth 2.0 Client ID（網頁應用程式）
3. 授權的 JavaScript 來源加入：
   - `https://teacher.blockplanetcamp.com`
   - `http://localhost:5500`（本機測試）
4. 複製 Client ID

### 4️⃣ 設定前端
編輯 `shared/config.js`：
```js
API_URL: '貼上 Step 2 的 Web App URL',
GOOGLE_CLIENT_ID: '貼上 Step 3 的 Client ID',
```

### 5️⃣ 推上 GitHub Pages
1. 把整個 `teacherlog/` 推到 GitHub Repo
2. 設定 Pages（從 main branch 部署）
3. 自訂網域：`teacher.blockplanetcamp.com`
4. DNS 加 CNAME 指向 `alienlai0607-ai.github.io`

### 6️⃣ 觸發器（自動鎖定 24h 前日誌）
Apps Script 編輯器：「觸發器 → 新增觸發器」
- 函式：`dailyLockOldLogs`
- 時間：每天凌晨 3 點

---

## 檔案結構

```
teacherlog/
├── index.html                # 登入頁（Google OAuth + 暱稱認領）
├── README.md
├── shared/                   # 全站共用
│   ├── config.js             # API_URL、Client ID、KPI 定義
│   ├── auth.js               # Session 管理、Google JWT 解碼
│   ├── api.js                # Apps Script API 包裝
│   ├── ui.js                 # toast、modal、header
│   └── style.css             # 全站樣式（手機優先）
│
├── teacher/                  # 老師端
│   ├── today.html            # 今日日誌（6 KPI 分頁式）
│   ├── mylog.html            # 我的 KPI 預估
│   └── okr.html              # 我的 OKR
│
├── manager/                  # 主管端
│   ├── dashboard.html        # 部門儀表板
│   ├── teachers.html         # 老師深度查閱 + 即時回饋
│   ├── eval.html             # 月度評核老師（自動帶證據）
│   ├── observe.html          # 觀課/巡班紀錄
│   ├── feedback.html         # 我給的回饋
│   ├── mylog.html            # → 轉址至 teacher/today.html
│   ├── myeval.html           # → 轉址至 teacher/mylog.html
│   └── myokr.html            # → 轉址至 teacher/okr.html
│
├── admin/                    # 柏翰專用
│   ├── dashboard.html        # 三部門總覽
│   ├── eval-manager.html     # 評核主管（含加碼/連坐）
│   ├── users.html            # 人員管理
│   ├── kpi-config.html       # KPI 規則檢視
│   ├── bonus.html            # 獎金核發總表
│   └── reports.html          # 跨部門報表 + CSV 匯出
│
├── apps-script/              # 後端
│   ├── Code.gs               # 路由 + 常數 + 獎金級距
│   ├── setup.gs              # 首次初始化（11 個分頁 + 預填使用者 + KPI 規則）
│   ├── utils.gs              # Sheet 讀寫工具
│   ├── auth.gs               # 認證 + whoami + 認領暱稱
│   ├── logs.gs               # 日誌 CRUD + 主管發文 + 自動鎖定
│   ├── feedback.gs           # 回饋 + 觀課 + 發文
│   ├── okr.gs                # OKR 管理
│   ├── evaluation.gs         # 證據彙整 + 自動建議分數 + 評核儲存
│   └── dashboard.gs          # 儀表板 + 個人 KPI 預估
│
└── docs/
    └── SCHEMA.md             # Google Sheet 11 分頁詳細欄位
```

---

## 核心流程

### 老師日常使用
1. 早上到班開手機 → `today.html` → 「到班打卡」
2. 隨手記錄今日狀況（6 大 KPI 分頁式，5-10 分鐘）
3. 拍照上傳作品/環境 → 自動歸到對應 KPI
4. 下班「離班打卡」
5. 隨時可看 `mylog.html` 預估本月分數

### 主管日常使用
1. 早上看 `dashboard.html` → 知道誰沒交、誰求助
2. 點老師日誌 → 即時回饋（按一下標籤、寫 1 句話）
3. 觀課完成填 `observe.html`
4. 每天自己也要寫日誌（主管 KPI 用）
5. 每週至少 3 篇 FB+IG 發文（系統會提醒）

### 月底評核流程
1. 25 號開始：老師到 `mylog.html` 完成自評
2. 月底前：主管到 `eval.html` 評核老師（系統自動帶證據）
3. 主管自己也要到 `mylog.html` 自評
4. 月初前：柏翰到 `eval-manager.html` 評核 3 位主管
5. 全部完成 → `bonus.html` 看總金額 → 發獎金

---

## 測試清單

### 🧪 部署後第一次測試
- [ ] 開 `teacher.blockplanetcamp.com` 顯示登入頁
- [ ] 用柏翰的 Gmail 登入 → 顯示「請選擇暱稱」
- [ ] 點「柏翰」→ 綁定成功 → 跳到 admin/dashboard
- [ ] admin/users 看到 11 位預填人員
- [ ] 用另一個 Gmail 登入 → 認領「松鼠」→ 跳到 teacher/today

### 🧪 老師日誌測試
- [ ] 6 個 KPI 分頁都能填寫
- [ ] 評分按鈕、勾選、文字都能輸入
- [ ] 自動儲存提示出現
- [ ] 加附件連結成功
- [ ] 「複製昨日」可正常運作
- [ ] mylog.html 看到本月分數+雷達圖

### 🧪 主管測試
- [ ] dashboard 顯示部門老師清單
- [ ] 看得到「今日已交/未交/求助」狀態
- [ ] teachers.html 可即時回饋
- [ ] eval.html 選老師+月份可帶出證據與建議分數
- [ ] 評分後可儲存 → bonus.html 看到金額

### 🧪 主管發文測試
- [ ] today.html KPI4 新增 FB/IG 發文紀錄
- [ ] dashboard 顯示本週發文進度條
- [ ] 達標 3 篇後變綠色

### 🧪 admin 測試（柏翰）
- [ ] 看到三部門卡片+本月平均
- [ ] eval-manager.html 可評核主管
- [ ] 部門平均 <55 顯示「連坐減半」警告
- [ ] bonus.html 顯示老師+主管總獎金
- [ ] reports.html CSV 匯出

---

## 已知待辦（v2 可加）

- [ ] LINE Notify 整合（每晚提醒沒交日誌的人）
- [ ] PWA + 離線暫存（service worker）
- [ ] 圖表視覺化（Chart.js 雷達圖、趨勢線）
- [ ] PDF 評核報告匯出
- [ ] 學期 OKR 評分時的 KR 達成度自動計算
- [ ] 通知中心（主管被求助、老師收到回饋）

---

## 維護注意

- **修改 KPI 規則**：直接編輯 Google Sheet 的 `KPI_Config` 分頁，或修改 `apps-script/setup.gs` 後重跑 `seedKpiConfig()`
- **修改獎金金額**：修改 `apps-script/Code.gs` 的 `BONUS_TEACHER` / `BONUS_MANAGER` 常數
- **新增部門**：修改 `apps-script/Code.gs` 的 `DEPARTMENTS` + `shared/config.js`
- **新增老師**：admin 介面 → `users.html` → 新增人員

---

## 安全注意

- Apps Script 部署使用「執行身分：我」+「存取權限：任何人」
- 所有資料寫入 Google Sheet，僅柏翰擁有編輯權
- 前端使用 Google OAuth，不儲存密碼
- 暱稱認領是一次性的（一個 Gmail 綁一個暱稱）
- Admin 可在 users.html 解除綁定，重新認領

---

Made with ❤️ for 布拉克星球教師團隊
