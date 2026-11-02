# AGENTS.md — `komyoji` 工作區

> 這個資料夾是 **光明寺日譯**（`komyoji.adb`）的建置工作區。`D:\2026\komyoji`。
> 本檔只寫「這一庫的差異」；**共用紀律在母工作區**，先讀完再動手。

## 0. 先讀（紀律來源，必讀）

| 順序 | 文件 | 為什麼 |
|---|---|---|
| 1 | `D:\2026\adb-converter\AGENTS.md` | 母工作區規則：成品放 `D:\accelon3`、viewer 位置、發佈權限、不要 commit 等 |
| 2 | `D:\2026\adb-converter\docs\adb\adb-knowhow.md` | **共用 know-how**：容器、VA、漢字位置、缺字／字型、`glossary`／`<术>`、`<聯 j>`、建置六步 |
| 3 | `D:\2026\adb-converter\docs\adb\adb-version-log.md` | 版本紀錄（canonical）：每次建置要加一列 |
| 4 | 依需要：`han-position.md`、`terms.md`、`glossary.md`、`missing-char.md` | 座標、術語、詞彙、缺字 |

> 這四份是**母工作區的檔案**，不要複製過來；直接讀。母工作區是規則與工具的家，
> 本工作區是資料與建置的家。

## 1. 這個工作區做什麼

- 產出：`komyoji.adb`（`dbname=komyoji`、`dbcname=光明寺日譯`）
- 來源：**光明寺日譯**（komyoji html → offtext）
  - 已轉好的 offtext：`D:\2023\kmj\off`（`*.kmj.off`）
  - 上游：`D:\2023\kmj`（<https://github.com/accelon/kmj>，`node tidy`／`gen` 產生 off）
  - 參考數字（`D:\2026\adb-converter\docs\adb\off-to-accelon.md` §11）：
    22 書、119,201 正文行、7,556 個 `<註>`（**沒有 `<釋>`**，來源沒有註文檔）。
- 成品位置：`D:\accelon3\komyoji.adb`（**不是** `dist/`、也不是 `build/`）
- 文件：本庫的 `docs/` 或 `README.md`；母區 `docs/adb/` 只放索引／說明，細節以本區為準

### 1.1 現況（2026-11-02）

- 工作區剛建立，尚未開始轉檔；頁 id 規則、分層與註文處理尚未定案。
- **網站原檔已抓回**：`data/html/<分冊>/<章名>.html.gz`，4,627 章、2,053 MB → 68.9 MB；
  每章含巴利正文＋逐詞文法表＋`訳文`＋`ruby`。抓取紀錄 `data/html/manifest.tsv`
  （有版控），說明見 `docs/crawl-log.md`。**`.gz` 不進版控**。
- 重抓：`node src/crawl.mjs --out data/html`（本機需 VPN；或 push 改 `src/crawl.mjs`
  讓 GitHub Actions 代抓——fc2 對中國 IP 是 IP 級封鎖，見 `docs/crawl-log.md`）。
- 頁 id 規則**在本區討論後才定**，不要預設沿用 `NpMc`；網站沒有頁錨點可用。
- 版控：<https://github.com/accelon/komyoji>（`origin`，分支 `main`；2026-11-02 由作者指定）。
- 下一個動作：把頁 id 規則與註文（7,556 個只有註號、沒有註文）寫進 `docs/steps.md`，
  再依 §3 建置。

## 2. 共用程式（不要重寫一份）

| 用途 | 用哪一個 |
|---|---|
| 漢字判定／計數 | `D:\2026\adb-converter\ts\src\accelon26\han.ts`（TS）<br>`D:\2026\adb-converter\ts\tools\han.py`（Python） |
| 頁 id → VA → 頁純漢字 | `D:\2026\adb-converter\ts\src\accelon26\page-text.ts` |
| 打包容器 | `D:\2026\adb-converter\ts\src\adbauthor.ts`（`authorAdb`） |
| 術語 `<术>`／glossary | `D:\2026\adb-converter\ts\src\terms\terms.ts`（canonical 詞表 `data/terms.tsv`） |
| 詞彙閱讀端 | 母區 `ts/src/accelon26/glossary.ts`（不用改） |

Python 端的路徑寫法：

```python
import sys
sys.path.insert(0, r'D:\2026\adb-converter\ts\tools')
from han import HAN, han_chars, han_count
```

**禁止**在這一區再寫一份 `[\u3400-\u9fff…]` 或 `\p{Script=Han}` 的規則；
發現共用 helper 有問題，回母工作區修，不要就地分叉。

## 3. 建置

```text
① 取源（原始檔放 raw/ 或 data/，唯讀）
② 轉文字（一行一個 adb 行；超過 4,000 字要切）
③ 補資料（缺字、術語、頁碼、註文；外部檔，不改原始檔）
④ 連結（<聯>、<嵌>、j；patch 要最後跑，重轉文字後要再 patch）
⑤ 打包（pack.ts → authorAdb）
⑥ 驗證＋記帳
```

- 建置腳本放 `src/`，中間產物放 `out/`（不進版控），成品 copy 到 `D:\accelon3`。
- 建置要能**從零重跑**：來源、指令、版本寫在 `README.md` 或 `docs/steps.md`。
- 頁 id 格式一旦定好就不要改；VA 若變，記錄「哪一頁之後、差幾個」。

## 4. 版本、發布、記帳

1. 建置完成 → 在**母工作區** `deploy/adb-notes.json` 寫這個 sha 的說明（由本區提供文字）。
2. 在**母工作區** `docs/adb/adb-version-log.md` 加一列：
   日期／`komyoji`／sha 前 12／大小／buildTime／工作區／說明。
3. 發布由**本工作區**執行（`publish-adb.ts`，大檔加 `--allow-large`）；
   官網 release（exe）仍由母工作區。
4. 發布後確認兩站 sha 與 manifest 一致。

> 工作區日後可能停用；沒有版本紀錄，後人只能猜。**這一列不是可選項。**

## 5. 文件

- 本區 `README.md`：來源、指令、成品、限制（給下一個接手的人）。
- 母區 `docs/adb/`：對外說明頁（about）與索引；細節放本區。
- 新增或改名時，順手更新母區 `docs/README.md` 的索引。

## 6. 不要做的事

- 不要改母工作區的閱讀器程式（`ts/src/accelon26/*`）；共用 helper 的 bug 回母區修。
- 不要自寫漢字範圍、頁座標、VA 規則、缺字公式。
- 不要同時由兩個工作區重建同一個 adb。
- 不要把 `.adb`、`.zip` 等產物 commit 進 git；成品在 `D:\accelon3`。
- 不要在未經作者指示時發布官網 exe／改 `deploy/adb-status.json`。

## 7. 交接（工作區停用前）

- [ ] 最後一次建置指令可以從零重跑（來源、版本、參數）
- [ ] `adb-version-log.md` 有最後一列（sha／大小／buildTime／說明）
- [ ] `deploy/adb-notes.json` 的說明是最新的
- [ ] `README.md` 寫清楚「這個工作區已停用，維護看母區哪一份文件」
