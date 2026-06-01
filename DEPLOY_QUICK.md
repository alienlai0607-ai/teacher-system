# 🚀 KPI 系統 - 快速部署指南

> 預計時間：30 分鐘（首次）｜難度：跟著做就會

---

## 🎯 你要完成的 4 件事

```
1️⃣ 建 Google Sheet + 貼後端程式碼（10 分鐘）
2️⃣ 部署 Apps Script 為 Web App（5 分鐘）
3️⃣ 設定 Google OAuth Client ID（10 分鐘）
4️⃣ 填前端 config + 推 GitHub Pages（5 分鐘）
```

---

## 1️⃣ 建 Google Sheet 後端（10 分鐘）

### Step 1.1 開新 Sheet
1. 開 [sheets.new](https://sheets.new) 建立一份新 Sheet
2. 重新命名為 **`KPI系統資料庫`**
3. **記下這份 Sheet 的網址**，之後 admin 也會用到

### Step 1.2 開 Apps Script
1. 上方選單點「**擴充功能 → Apps Script**」
2. 會打開新分頁，看到預設的 `Code.gs` 編輯器
3. 把預設那幾行 `function myFunction()` 全部刪掉（Ctrl+A 全選 → Delete）

### Step 1.3 貼後端程式碼
1. ✨ **合併版已自動複製到你的剪貼簿**（剛剛幫你做好了）
2. 在剛清空的 Code.gs 直接按 **Cmd+V** 貼上
3. 按 **Cmd+S** 存檔（會跳「請輸入專案名稱」→ 填 `KPI系統`）

> 💡 如果剪貼簿被你後來覆蓋了，用這指令重新複製：
> ```bash
> cat "/Users/laibaihan/Desktop/claude project gogo/teacherlog/apps-script/_all_in_one.gs" | pbcopy
> ```

### Step 1.4 初始化 Sheet
1. 編輯器上方有個下拉選單，點開選 **`setupSheets`**
2. 點右邊「**▶ 執行**」按鈕
3. 第一次會跳授權視窗：
   - 點「**檢閱權限**」
   - 選你的 Google 帳號
   - 出現「Google 尚未驗證這個應用程式」→ 點「**進階 → 前往 KPI系統（不安全）**」
   - 接受權限
4. 等個 10 秒，下方執行記錄顯示「**已順利完成執行作業**」
5. 切回 Google Sheet → **應該看到 11 個分頁**（Users / DailyLogs / OKR_Goals ... 等等）
6. 打開 `Users` 分頁，確認看到 11 位預填人員（柏翰 / 酸酸 / 小魚 / 柳丁 / 松鼠...）

✅ **後端完成！**

---

## 2️⃣ 部署 Web App（5 分鐘）

### Step 2.1 部署
1. 回到 Apps Script 編輯器
2. 右上角點「**部署 → 新增部署作業**」
3. 點齒輪 ⚙️ → 選「**網頁應用程式**」
4. 設定：
   - **說明**：`KPI v1`
   - **執行身分**：選「**我（你的 Gmail）**」
   - **誰可以存取**：選「**任何人**」
5. 點「**部署**」
6. 又會跳授權 → 接受

### Step 2.2 複製 Web App URL
部署成功後會顯示一個網址：
```
https://script.google.com/macros/s/AKfy.....xxxxx/exec
```
**把這個網址複製起來**（等下要貼到前端）

> ⚠️ 注意：**不要關掉這個視窗**，這網址只會出現一次，沒抄到要重新部署

✅ **Web App URL 拿到！**

---

## 3️⃣ Google OAuth Client ID（10 分鐘）

### Step 3.1 開 Google Cloud Console
1. 打開 [Google Cloud Console - 憑證](https://console.cloud.google.com/apis/credentials)
2. 第一次用會要建立專案：點上方「**選取專案 → 新增專案**」
   - 專案名稱：`布拉克星球`
   - 點建立 → 等 30 秒 → 切換到該專案

### Step 3.2 設定 OAuth 同意畫面
1. 左側選單「**OAuth 同意畫面**」
2. 使用者類型：選「**外部**」→ 建立
3. 填：
   - 應用程式名稱：`布拉克星球 KPI 系統`
   - 使用者支援電子郵件：你的 Gmail
   - 開發人員聯絡資訊：你的 Gmail
4. 一路按「儲存並繼續」直到完成
5. 「測試使用者」步驟可以加你跟團隊成員的 Gmail（或先空著）

### Step 3.3 建立 OAuth Client ID
1. 回到「**憑證**」分頁
2. 點上方「**+ 建立憑證 → OAuth 用戶端 ID**」
3. 應用程式類型：**網頁應用程式**
4. 名稱：`KPI 前端`
5. **授權的 JavaScript 來源**加入：
   ```
   https://teacher.blockplanetcamp.com
   http://localhost:5500
   http://127.0.0.1:5500
   ```
6. 「授權的重新導向 URI」不用填
7. 點「**建立**」

### Step 3.4 複製 Client ID
跳出一個視窗顯示「Client ID」，類似：
```
1234567890-abcdefghijk.apps.googleusercontent.com
```
**複製這個 Client ID**

✅ **Client ID 拿到！**

---

## 4️⃣ 設定前端 + 推 GitHub Pages（5 分鐘）

### Step 4.1 填 config.js
打開 `teacherlog/shared/config.js`，把兩個 `REPLACE_ME` 換掉：

```js
API_URL: '貼上 Step 2.2 的 Web App URL',
GOOGLE_CLIENT_ID: '貼上 Step 3.4 的 Client ID',
```

> 💡 用這指令快速打開：
> ```bash
> open -a "Visual Studio Code" "/Users/laibaihan/Desktop/claude project gogo/teacherlog/shared/config.js"
> ```

### Step 4.2 推到 GitHub
（沿用你 camp2026 的部署模式）
```bash
cd "/Users/laibaihan/Desktop/claude project gogo/teacherlog"
git init
git add .
git commit -m "init KPI 系統"
git branch -M main
git remote add origin git@github.com:alienlai0607-ai/teacherlog.git
git push -u origin main
```

> 💡 還沒建 Repo？先到 [github.com/new](https://github.com/new) 建一個 `teacherlog`（Private 或 Public 都可以）

### Step 4.3 啟用 Pages + 綁網域
1. GitHub Repo → **Settings → Pages**
2. Source: **Deploy from a branch** → branch `main` / `(root)`
3. Custom domain: `teacher.blockplanetcamp.com`
4. 勾選「**Enforce HTTPS**」（要等 SSL 生效，可能 10 分鐘）

### Step 4.4 設定 DNS
進你的網域 DNS 管理（你 camp2026 在哪設的就在同個地方）：
```
類型: CNAME
名稱: teacher
值: alienlai0607-ai.github.io
```

✅ **全部完成！**

---

## 🧪 部署後第一次測試（5 分鐘）

1. 打開 `https://teacher.blockplanetcamp.com`
2. 看到登入頁 → 用**你（柏翰）的 Gmail** 登入
3. 出現「請選擇您的身份」→ 點「**柏翰**」
4. 跳到 admin/dashboard → 看到三部門卡片 ✅
5. 點上方選單「人員管理」→ 看到 11 位預填人員 ✅
6. 點「評核主管」→ 可選柳丁/小魚/酸酸 ✅

如果都正常，叫主管們也用自己 Gmail 登入認領暱稱。

---

## ❓ 常見問題

### Q1: setupSheets 跑不起來，說「未授權」
重新跑一次，第一次會跳授權視窗，要按「進階 → 前往（不安全）」。
這是因為 Apps Script 還沒過 Google 驗證，但你是擁有者，安全沒問題。

### Q2: 前端登入頁顯示空白
打開瀏覽器 Console（F12），看錯誤訊息。最常見：
- `API_URL` 沒換掉 `REPLACE_ME`
- `GOOGLE_CLIENT_ID` 沒換掉 `REPLACE_ME`
- Google OAuth 沒加 `teacher.blockplanetcamp.com` 到授權來源

### Q3: 登入後跳「此 Email 尚未綁定暱稱」但沒有可選的暱稱
代表 Users 分頁沒預填成功。回 Apps Script 編輯器重跑 `setupSheets()`。

### Q4: 主管登入卻沒看到部門老師
檢查 Users 分頁的 `department` 欄位是否正確（永康教室 / 北區教室 / 才藝部門，不能有空白）。

### Q5: 想清除全部資料重來
直接到 Google Sheet 把所有分頁刪掉，再執行 `setupSheets()` 一次。

---

## 📞 開發者後門

如果出狀況需要進 Apps Script 看記錄：
- 編輯器左側「**執行作業**」可以看每次呼叫的紀錄
- `Logs_System` 分頁有所有重要操作紀錄

修改規則時：
- 修改獎金金額 → 改 `Code.gs` 的 `BONUS_TEACHER` / `BONUS_MANAGER`
- 修改 KPI 評分項目 → 改 `setup.gs` 的 `TEACHER_KPI` / `MANAGER_KPI`，重跑 `setupSheets()` 前先刪 `KPI_Config` 分頁
- 新增/移除人員 → 直接在 admin/users.html 操作

---

## 🎉 部署完成 Checklist

- [ ] Google Sheet 11 個分頁建立
- [ ] Users 分頁有 11 位預填人員
- [ ] Apps Script Web App 部署
- [ ] OAuth Client ID 建立
- [ ] config.js 兩個值都填了
- [ ] GitHub Pages 啟用
- [ ] DNS CNAME 設定
- [ ] SSL 啟用（藍色鎖頭）
- [ ] 你能登入並看到 admin/dashboard
- [ ] 主管們也都能登入

完成！🪐
