# 光明寺教蔵 html 抓取紀錄

> 2026-11-02。來源 <https://komyojikyozo.web.fc2.com/>（日譯大藏經，含逐詞文法表）。
> 這一頁記「抓了什麼、怎麼抓、怎麼重抓」，數字都是實測。

## 1. 為什麼要繞路

- 光明寺在 `104.244.99.0/24`，本機（中國網路）**IP 級封鎖**：HTTP／HTTPS 都
  `connection reset`，換 DNS（阿里 DoH 解出 `104.244.99.42`）也不行。
- CORS 中繼幾乎都不可達：archive.org／r.jina.ai／jsdelivr 連不上，
  `api.allorigins.win`、`api.codetabs.com` 對 fc2 回 **522**（後端連不到來源），
  `api.cors.lol` 只成功一次就 429。
- 解法：**GitHub Actions**（海外 runner）代抓；作者後來說明可用 VPN，兩條路都通。
  Actions 跑完 2,053 MB 只花約 2.5 分鐘，是本機所做不到的速度。

## 2. 抓取定義

| 項目 | 內容 |
|---|---|
| 入口 | `menu.html`（Shift_JIS，517,076 bytes）→ 4,629 條章節連結，去重 4,627 章 |
| 正文 | 每章 `X.htm` 的 `X.files/sheet001.htm`（Excel 匯出，正文＋逐詞文法表＋ruby） |
| 不存在時 | fc2 會 302 到 `error.fc2.com/web/404.html`（跟隨後仍是 200），要當 404 處理 |
| 編碼 | Shift_JIS → UTF-8（`<meta charset>` 一併改寫），**U+FFFD 檢查為 0** |
| 儲存 | gzip -9；路徑 `data/html/<分冊>/<章名>.html.gz` |
| 紀錄 | `data/html/manifest.tsv`（rel／url／status／chars／raw／gz／sha256／anchors／title） |

每章都只有 `sheet001.htm` 一個 sheet（`sheet002.htm` 起一律 302 到 404），
所以 4,627 檔就是全部正文。

## 3. 結果（2026-11-02）

- 章節 **4,627**，失敗 **0**，缺檔 **0**。
- 原始 **2,053.2 MB** → gzip **68.9 MB**（3.4%）。
- 解壓後 UTF-8 亂碼字元 **0**（全量掃描）。
- `manifest.tsv` sha256：`094D9D2B0C3BB4D577F571009074B9E3A6A74976F38CDCF7A60AB99770D55E39`
- GitHub Actions：run `41414571151`、artifact `13126149373`（`komyoji-html`，73,879,935 bytes，保留 30 天）。

| 分冊 | 章數 | 原始 MB | gzip MB |
|---|---:|---:|---:|
| `an`（增支部） | 1,406 | 509.7 | 17.6 |
| `kn`（小部） | 698 | 322.8 | 10.7 |
| `snmv`（相應部・大篇） | 596 | 141.0 | 5.3 |
| `snkv`（相應部・有偈篇） | 333 | 93.3 | 3.3 |
| `snsav`（相應部・六處篇） | 306 | 114.7 | 3.9 |
| `snsgv`（相應部・因緣篇） | 271 | 80.3 | 2.9 |
| `snnv`（相應部・尼柯耶） | 247 | 79.1 | 2.7 |
| `mnmjp`（中部・後分） | 169 | 168.1 | 5.3 |
| `mnup`（中部・上分） | 128 | 123.8 | 3.8 |
| `mnmlp`（中部・中分） | 124 | 142.5 | 4.4 |
| `dnmv`（長部・大篇） | 123 | 106.6 | 3.4 |
| `dnpv`（長部・波梨篇） | 117 | 94.1 | 2.9 |
| `dnskv`（長部・戒蘊篇） | 109 | 77.2 | 2.7 |

## 3.1 整包 7z 有多大（2026-11-03 實測）

工作檔仍是 `data/html/` 的逐檔 gzip（好處是可以只解一章），7z 是備份／搬運用：

| 方式 | 大小 | 耗時 |
|---|---:|---:|
| 逐檔 gzip（現況 `data/html/`） | 68.9 MB | — |
| 7z 非 solid（`-mx=9 -md=64m`） | 43.85 MB | 147 s |
| 7z solid `-mx=5 -md=32m` | 29.44 MB | 19 s |
| 7z solid LZMA2 `-mx=9 -md=256m` | 24.05 MB | 52 s |
| **7z solid PPMd `mem=2g:o=32`** | **21.13 MB** | 31 s |

- 原始 2,053.8 MB（4,627 章＋menu），21.13 MB 等於 **1.0%**，比逐檔 gzip 小 3.3 倍。
- PPMd 在這種重複度高的表格文字上比 LZMA2 好 12%，而且更快。
- 已放上 GitHub release：
  <https://github.com/accelon/komyoji/releases/download/html-2026-11-02/komyoji-html.7z>
  （sha256 `1F6F00F2…EA0ED9`，22,158,296 bytes）
- solid 版解壓要整包（不能只抽一章）；要隨機讀取就用 `-ms=off`（43.85 MB）。
- 指令：`7z a -t7z -m0=PPMd:mem=2g:o=32 -mx=9 -ms=on out\komyoji-html.7z out\html-raw\*`
  （先把 `data/html/*.html.gz` 解到 `out/html-raw/` 再壓；直接壓 `.gz` 沒有效果。）
- 解出來的 `out/html-raw/` 有 2 GB，用完就刪——平常的轉檔只讀 `data/html/`（69 MB）。

## 3.2 去標籤的文字底稿（`out/html-clean/`）

`node src/clean-html.mjs` 把每章的表格列轉成 TSV（cell 之間 Tab、ruby 保留成「漢字(かな)」，
其餘 HTML 標籤全去掉）：4,627 章、1,705,479 列、**19.6 MB**（gzip）。
比原始 html 小 3.5 倍，要肉眼查某章原始表格時看這份，不必解 7z。

## 3.3 現在不再碰 2 GB

轉檔鏈只走：`data/html/`（69 MB 逐檔 gz）→ `out/grammar/units.ndjson.gz`（17 MB 中間格式，見
`grammar-extract.md` §8）→ `out/komyoji-xml/` → `komyoji.adb`。
解壓後的 2 GB 只有在重壓 7z 時才短暫存在，用完即刪。

## 4. 內容長相（抽樣）

`dnskv/dn01c05`（《過去に関する考察》）解壓後 970,782 字、1,018 列 `<tr>`、4,445 個 `<ruby>`：

```text
語      語根   品詞  語基  性  数  格  意味
Pubba   形     代的   ‐   持  先、前、昔の
anta    名     a     男   依（属）  終極、目的、極限
kappikā kṛp    形     a   男  複  主  適した、認容、浄法の／劫の／分別、妄想の
訳文 【過去に関する考察】
```

- 正文（巴利語）與「語／語根／品詞／語基／性／数／格／意味」逐詞表交錯，另有 `訳文`（日譯）與 `メモ`（注）。
- 巴利的變音符號以 HTML 實體存（`&#257;`＝ā），保持原樣，不解碼成字元。
- 全站**沒有** `<a name>` 頁錨點、也沒有 page-break：menu 上 `#dn01c05p02` 這種 fragment
  對不到實際內容。**頁 id 不能靠網站的錨點，要另外定**（見 `docs/steps.md` §2）。

## 5. 重抓

```powershell
# 本機（需要 VPN；fc2 對中國 IP 封鎖）
node src/crawl.mjs --out data/html --concurrency 4          # 續跑會跳過已存在的檔
node src/verify-html.mjs --dir data/html

# GitHub Actions（不用 VPN）：workflow 只接受手動觸發
$tok = 'ghp_...'   # 需要 repo + workflow
curl.exe -sS -X POST -H "Authorization: token $tok" `
  -H "Accept: application/vnd.github+json" `
  https://api.github.com/repos/accelon/komyoji/actions/workflows/crawl.yml/dispatches `
  -d '{\"ref\":\"main\"}'
# 跑完在 Actions → crawl-komyoji 下載 artifact komyoji-html（內含 data/html 的內容）
```

- 抓取器只依賴 Node 內建模組（`fetch`、`zlib`、`TextDecoder('shift_jis')`）。
- 續跑時 `manifest.tsv` 會沿用上一次的實際網址；`--force` 才會重抓。
- 不存在的 sheet 會被 fc2 302 到 `error.fc2.com/web/404.html`（跟隨後是 200），
  抓取器已把它當 404，不會把錯誤頁存成正文。
- 抓回來的 `.gz` **不進版控**（`.gitignore` 的 `data/html/*`，只留 `manifest.tsv`）。
