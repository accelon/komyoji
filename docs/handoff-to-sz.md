# 給 sz 工作區的交接提示（2026-11-02）

> 把下面整段貼給 `D:\2026\sz` 的 agent 就好。內容是 komyoji 這邊已經做完、
> sz 可以直接用的東西，以及需要 sz 自己決定／驗證的地方。

---

## 貼給 sz 的內容

```text
komyoji 工作區（D:\2026\komyoji）已完成三件事，東西都在，請接手：

【1】komyoji.adb 已建好，地址和你的 cs.adb 同一套
- 檔案：D:\accelon3\komyoji.adb（33 書、156,089 行、3.29 MiB）
- 容器：source / tags / tables / attributes / attributes.sorted / caches（沒有 tokens，和 cs.adb 一樣不建全文索引）
- 地址：塊.段 沿用 cs 的 CST chunk 與 pn（d1.28、m1.5、a6.7、s1.1…），書 id 也用 dn1／mn2／an10
- 目錄樹：00.xml 宣告 <隱><樹 s="*" t="區,書,塊">目錄</樹></隱>，
  實測 419 個節點（5 區 → 33 書 → 381 塊），沒有名字的節點 0
- 對位方式：src/align-cs.mjs 讀你的 D:\2026\sz\data\cs（唯讀），
  句子 160,914 句對上 138,288（85.9%），章內段號倒退 0 次；
  說明在 D:\2026\komyoji\docs\align-cs.md
- 你可以做的驗證：
  * 用你的 src/toc-check.ts 那套（loadTrees／loadTree／buildTree）開 komyoji.adb，
    確認 5／33／381 三層
  * 同時開 cs.adb 與 komyoji.adb，跳 d1.28、m1.5、a6.7、s45.1，看兩邊是否都到得了
- 注意：komyoji 的「句」是我們自己的行（一句日譯一行），句數和 cs 不同；
  跨庫請只用 塊.段，:句 只在同一個庫內有意義（你的 docs/addressing.md 也是這樣寫）

【2】逐詞文法（你先前要的 stoplist 素材）已在 D:\2026\sz\data\kmj-grammar
- sentences.tsv.gz（172,355 列）、tokens.tsv.gz（765,155 列）、chapters.tsv、README.md
- 欄位：sent_id / tok / start / ctx / form / form_clean / root / pos / stem /
  gender / number / case / person / voice / meaning / block / flags
- flags 是來源的人工錯誤標記：nf 1.6%、compound 4.9%、sandhi 2.4%、order 1.3%、dup 0.2%
- 133,033 個段號句子裡 104,444 句（78.5%）有詞表、96.5% 有日譯；
  沒詞表的多是重複段落（作者已指示：重複句多，少許錯誤影響不大，不必回頭補）

【3】你請求的三支檔已出（D:\2026\komyoji\out\grammar\）
- pos-distribution.tsv.gz：主檔，48,366 列／46,787 詞形，word 用 form_clean 原樣（小寫、保留變音符號）
- pos-distribution.case.tsv.gz：另存保留大小寫的版本（55,316 列／53,678 詞形）
- pos-map.tsv：67 種原標籤 → 8 個 canonical，附次數
- coverage.tsv：dn/mn/sn/an 都是 complete=yes，只有 kn 是 partial
  （kn 只涵蓋 bv cp dhp iti kp pv snp thag thig ud vv 11 本）
- 驗收：兩份 count 總和都 = 765,155；非 8 枚舉的 pos 0 個

需要你決定的兩點：
- 你的請求寫「word 用 form_clean 原樣」，又寫「保留大小寫」，但 form_clean 本來就是小寫，
  兩者不能同時成立。兩版都給了，請挑一版當主檔：
  na 在小寫版是 ind 10,229（過 10,000 門檻），大小寫版只有 8,930（會被擋掉）
- 「不定」（1,184 次）我對到 other，不是 ind（它不是不変）。如果你認為要算 ind，跟我說。

重跑方式（komyoji 這邊）：node src/export-pos.mjs（約 3 秒，會自己驗總和）。
```
