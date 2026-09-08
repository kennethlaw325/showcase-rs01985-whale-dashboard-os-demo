# Dot.ai AI Builder 學員作品展示

- **原作者**：RS01985（GitHub）
- **原 repo**：`RS01985/whale-dashboard-os-demo`（原 repo 為 private，故只列名不設連結）
- **本展示副本已將個人／機構資料換成虛構示範資料，功能與原作相同；歷史 commit 未帶入。**
- **部署日期**：2026-09-06

---

# Whale Dashboard OS — Demo

RS01985 喺 AI Builder 課程 template
[`kennethlaw325/dotai-personal-os`](https://github.com/kennethlaw325/dotai-personal-os)
上面擴充出嚟嘅營運儀表板。

架構同原 template 一樣：Obsidian vault（markdown）→ `scripts/sync-vault.mjs` →
`public/data/*.json` → React app。冇 server、冇 database、build 出嚟係純靜態網站。

> ⚠️ **呢個 repo 用嘅係範例資料（`sample-vault/`），唔係真實營運資料。**
> 版面、功能、互動同真機一模一樣，只係入面啲客戶名、金額、任務都係示範用。

---

## 點跑

需要 Node 18+。

```bash
npm ci
npm run sync:vault:sample   # 由 sample-vault/ 生成 public/data/*.json（第一次必跑）
npm run dev                 # 開 http://localhost:5173
```

想改示範內容，直接改 `sample-vault/` 入面嘅 markdown，再跑一次 `sync:vault:sample`。

---

## Demo 睇乜好

| 版面 | 睇點 |
| :-- | :-- |
| **Home** | Hero 有一條座頭鯨慢慢游過（54 秒一程，純 CSS 動畫 + 一張圖；開咗系統「減少動態效果」會自動停低唔郁）。 |
| **CEO Ops** | 十一段營運快照。留意「06 · 收入缺口」——**目標未拍板時佢照寫「未拍板」，唔會作個數出嚟**；pipeline 亦明標「轉換率為假設值，可改」。 |
| **6 PM 脈搏** | 六個部門狀態燈，燈下面有圖例講清楚紫／綠／灰點計出嚟。**特別寫明「綠燈唔等於有成果」**，因為淨係改過 `board.md` 都會亮綠。 |
| **Tasks／選題板** | 每張卡有「只記錄／夠料可啟動／已承諾」三態 badge。**靠文字推斷出嚟嘅一律帶 `?`**，同有真實欄位嘅分得開。 |
| **Action Desk** | 兩道確認：先出預覽 → 撳確認先寫入本機 pending 檔。拒絕時可以留低一句原因，收埋做「本週拒因」。 |
| **Skills & Prompts** | 能力庫；抽屜入面可以直接改 skill 檔嘅 frontmatter（驗證日期／風險註記）。 |
| **AI Office** | CEO → 2 Co-AI → 6 PM 分工圖，同每個部門最後更新時間。 |

### 三個貫穿全站嘅設計原則

1. **推斷要標明係推斷** — 靠文字規則猜出嚟嘅狀態一律帶 `?`，唔會扮成實數。
2. **冇數就講冇數** — 讀唔到來源、未拍板嘅數字，寧願喺畫面寫「未拍板／未接線」，都唔補個假數。
3. **未接線要標出嚟** — 未真正駁通資料源嘅卡，角落有「未接線」badge，hover 講明爭乜。

---

## 呢個 demo repo 同私人正本嘅兩處差異

為咗唔喺公開 repo 留低私人資訊，呢兩處喺 demo 版特登改咗（唔影響任何功能）：

1. `src/views/RssDailyView.tsx` — RSS 版底部個外連改咗做 `example.com`，正本指向自己嘅 RSS 閱讀器。
2. `src/lib/readiness.ts` — owner 偵測嘅 regex 移走咗一個寫死嘅人名。

## 同原 template 嘅主要分別

- 新增版面：CEO Ops、6 PM 脈搏、Action Desk、Finance Ops、選題板、RSS Daily、AI Office
- 三態 readiness badge、未接線 badge、拒因回收、skill frontmatter 編輯
- 全站深海配色，並做咗一次 WCAG AA 對比度審查（逐版用瀏覽器實測，最差組合 4.33:1）
- 寫入類功能（存筆記、改 skill、建 pending 草稿）只喺 `npm run dev` 存在；
  `vite build` 出嚟嘅正式站冇呢啲端點

## 驗證

```bash
npm test              # 34 個測試
npm run typecheck
npm run build
npm run security:audit
```
