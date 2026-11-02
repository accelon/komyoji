# komyoji 建置步驟（草稿 2026-11-02）

> 這一頁記「光明寺日譯」（`komyoji.adb`）的來源、頁 id 規則與建置流程。
> 目前只有工作區骨架，來源數字可從上游重跑；頁 id 與註文處理尚未定案。

## 1. 來源

- **網站原檔（2026-11-02 已抓回）**：`data/html/<分冊>/<章名>.html.gz`
  - 4,627 章、原始 2,053 MB → gzip 68.9 MB；`data/html/manifest.tsv` 是抓取紀錄。
  - 每章一個 Excel 匯出頁 `X.files/sheet001.htm`：正文（巴利）＋逐詞文法表＋`訳文`＋`ruby`。
  - 重抓方式、網路限制、分冊統計見 [`crawl-log.md`](crawl-log.md)。
- offtext：`D:\2023\kmj\off`（`*.kmj.off`，22 書）。
- 上游：`D:\2023\kmj`（<https://github.com/accelon/kmj>）：
  - `node tidy`：光明寺 html → 純文字，行首欄位（㊣巴利原文／㊔名詞／㊒動詞／
    ㉆日譯／㊟注文）。
  - `node gen`／`gen-jp`：產生 offtext。
- 參考：母區 `docs/adb/off-to-accelon.md` §10／§11。
- 已知：7,556 個 `<註>` 沒有 `<釋>`（來源沒有 `-notes.off`）。

## 2. 頁 id 規則（已定案 2026-11-02）

- **和 `D:\2026\sz` 的 `cs.adb` 同一套**：`塊.段`／`塊.段:句`。
  - `塊`＝CST chunk（`d1`、`m22`、`s5`、`a6`），`段`＝CST pn，`書` 沿用 cs 的 id（`dn1`…）。
  - 對位方法、命中率（85.9%）、驗證見 [`align-cs.md`](align-cs.md)。
- 網站沒有頁錨點（`#dn01c05p02` 對不到內容），所以不用網站的頁，用 cs 的段。
- 章內段號零倒退；沒對上的多是 kmj 自己加的小結與歸敬偈。

## 3. 註文

- 7,556 個 `<註>` 只有註號、沒有註文；不可以假造 `<釋>`。
- 可能做法（待作者決定）：
  1. 保留 `<註>` 編號，閱讀器顯示註號但不彈出註文；
  2. 不輸出 `<註>`（失去註號位置）；
  3. 之後從光明寺網頁補註文，再重跑。
- 決定後寫在這裡，並在轉檔腳本落實。

## 4. 建置流程（暫定）

```text
① 取源（原始檔放 data/，唯讀；大檔與 zip 不進版控）
② 轉文字（一行一個 adb 行；超過 4,000 字要切）
③ 補資料（缺字、術語、頁碼、註文；外部檔，不改原始檔）
④ 連結（<聯>、<嵌>、j；patch 最後跑）
⑤ 打包（母區 ts/src/adbauthor.ts 的 authorAdb）
⑥ 驗證＋記帳（母區 adb-version-log.md、deploy/adb-notes.json）
```

## 5. 待辦

- [x] 把網站 html 抓回並壓縮（`src/crawl.mjs` → `data/html/*.gz`，4,627 章）
- [x] 抽出逐詞文法（`src/extract-grammar.mjs` → 765,155 個詞；見 `grammar-extract.md`）
- [x] 頁 id 規則（對齊 cs 的 塊.段；`src/align-cs.mjs`，見 `align-cs.md`）
- [x] 第一版 `komyoji.adb`（33 書、156,115 行、3.29 MiB）→ `D:\accelon3\komyoji.adb`
- [ ] 註文處理
- [ ] 巴利原文／逐詞文法要不要進 adb（容器形式待定）
- [ ] 母區記帳
