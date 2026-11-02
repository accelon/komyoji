# komyoji — 光明寺日譯（`komyoji.adb`）建置工作區

這個資料夾放**光明寺日譯**的來源、轉換與打包腳本。通用的 adb 工具在
[`adb-converter`](../adb-converter)；光明寺網頁 → offtext 的上游在
[`D:\2023\kmj`](file:///D:/2023/kmj)（<https://github.com/accelon/kmj>）。

> **現況（2026-11-02）**：網站 4,627 章 html 已抓回並壓縮（`data/html/`，2,053 MB → 68.9 MB）；
> 逐詞文法已抽出（765,155 個詞）；定位已對齊 sz 的 `cs.adb`（`塊.段`）；
> **第一版 `komyoji.adb` 已產出**（33 書、156,115 行、3.29 MiB，正文是日譯）。
> 剩下的決定：註文怎麼處理、巴利原文與文法要不要進 adb。

- 成品：`D:\accelon3\komyoji.adb`（不進 git）
- 母工作區：`D:\2026\adb-converter`（共用工具、紀律、版本紀錄）
- 版控：<https://github.com/accelon/komyoji>（`origin`，分支 `main`）

## 來源

- `data/html/<分冊>/<章名>.html.gz`（2026-11-02 抓回，Shift_JIS → UTF-8、gzip）：
  光明寺網站的 Excel 匯出頁，每章含巴利正文、逐詞文法表（語／語根／品詞／語基／
  性／數／格／意味）、`訳文` 與 `ruby` 注音。
  - 4,627 章、原始 2,053 MB → gzip 68.9 MB（3.4%）；`data/html/manifest.tsv` 記 url／sha256／大小。
  - 抓取與重抓：`src/crawl.mjs`；網路限制、分冊統計見 [`docs/crawl-log.md`](docs/crawl-log.md)。
- `D:\2023\kmj\off`：已轉好的 offtext（`*.kmj.off`，22 書）。
- 上游 `D:\2023\kmj`：光明寺 html → offtext 的工具（`node tidy`／`node gen`）。
- 參考數字（母區 `docs/adb/off-to-accelon.md` §11）：
  - 22 書、119,201 正文行。
  - 7,556 個 `<註>`，**沒有 `<釋>`**：來源沒有註文檔，只有註號。
- 授權與出處依光明寺網站與上游 repo 的說明；引用時要標清楚。

## 目錄

| 路徑 | 說明 |
|---|---|
| `AGENTS.md` | 這一區的規則；§0 要求先讀母區的紀律文件 |
| `src/` | 抓取（`crawl.mjs`）、驗證（`verify-html.mjs`）、文法抽取（`extract-grammar.mjs`）、cs 對位（`align-cs.mjs`）、產生 XML（`make-xml.mjs`）、打包（`pack.ts`） |
| `data/` | 原始資料或小型對照表（唯讀；大檔不進版控） |
| `data/html/` | 抓回來的網站原檔（`*.html.gz` 不進版控，只留 `manifest.tsv`） |
| `docs/` | 這一庫的 steps、來源說明、限制 |
| `out/` | 中間產物與測試輸出（不進版控） |

## 指令

```powershell
cd D:\2026\komyoji
node src/crawl.mjs --out data/html            # 抓網站（需 VPN；或 GitHub Actions）
node src/extract-grammar.mjs --out out/grammar # 抽逐詞文法 → sentences/tokens.tsv.gz
node src/export-pos.mjs                        # 給 sz 的 pos-distribution／pos-map／coverage
node src/align-cs.mjs --out out/align.tsv      # 對 cs 的 塊.段（讀 D:\2026\sz\data\cs）
node src/make-xml.mjs --out out/komyoji-xml    # 產生書 XML
bun run src/pack.ts                            # 打包 → D:\accelon3\komyoji.adb
```

## 開工前先讀

1. `D:\2026\adb-converter\AGENTS.md`（母區規則）
2. `D:\2026\adb-converter\docs\adb\adb-knowhow.md`（共用 know-how）
3. `D:\2026\adb-converter\docs\adb\adb-version-log.md`（版本紀錄）
4. `D:\2026\adb-converter\docs\adb\off-to-accelon.md`（offtext → accelon 的既有經驗，§10／§11）

## 下一步

- [x] 抓回網站 html 並壓縮（`data/html/`，4,627 章；見 `docs/crawl-log.md`）
- [x] 抽出逐詞文法（765,155 個詞 → `out/grammar/`，副本給 sz：`D:\2026\sz\data\kmj-grammar`；
      見 `docs/grammar-extract.md`）
- [x] 決定頁 id 規則：跟 sz 的 `cs.adb` 一樣用 `塊.段`（`src/align-cs.mjs`，見 `docs/align-cs.md`）
- [x] 建第一版文字 → `out/komyoji-xml/` → 打包 → `D:\accelon3\komyoji.adb`
- [ ] 決定 7,556 個只有註號、沒有註文的 `<註>` 怎麼處理（保留編號／不顯示／另行補）
- [ ] 決定巴利原文與逐詞文法要不要進 adb（容器形式）
- [ ] 在母區 `deploy/adb-notes.json` 與 `docs/adb/adb-version-log.md` 記帳
- [ ] 要發布才跑 `publish-adb.ts`（大檔加 `--allow-large`）；官網 exe release 仍由母區
