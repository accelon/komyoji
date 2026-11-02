/**
 * 用 cs 的地址（區／書／塊／段）產生 komyoji 的 Accelon XML 文字層。
 *
 * 來源：
 *   out/grammar/sentences.tsv.gz   每句巴利＋日譯
 *   out/align.tsv                  每句對到的 cs 書／塊／段（src/align-cs.mjs）
 *   D:\2023\kmj\off\*.kmj.off      書名／塊名（^bk#id、^ck#id）
 *
 * 用法：
 *   node src/make-xml.mjs [--book dn1] [--out out/komyoji-xml]
 *
 * 每一行＝一句日譯；`<段 n>` 用 cs 的 pn，句＝該段內第幾行（1 起算）。
 */

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const argv = process.argv.slice(2);
const arg = (n, d) => {
  const i = argv.indexOf('--' + n);
  return i < 0 ? d : argv[i + 1];
};
const GRAMMAR = path.resolve(arg('grammar', 'out/grammar'));
const ALIGN = path.resolve(arg('align', 'out/align.tsv'));
const OUTDIR = path.resolve(arg('out', 'out/komyoji-xml'));
const ONLY = arg('book', '');
const OFFDIR = arg('off', 'D:/2023/kmj/off');

const AREA = {
  dn: ['dn1', 'dn2', 'dn3'],
  mn: ['mn1', 'mn2', 'mn3'],
  sn: ['sn1', 'sn2', 'sn3', 'sn4', 'sn5'],
  an: ['an1', 'an2', 'an3', 'an4', 'an5', 'an6', 'an7', 'an8', 'an9', 'an10', 'an11'],
};

/** 從 off 取書名與塊名 */
const readTitles = () => {
  const bookTitle = new Map();
  const blockTitle = new Map();
  if (!fs.existsSync(OFFDIR)) return { bookTitle, blockTitle };
  for (const f of fs.readdirSync(OFFDIR).filter((x) => x.endsWith('.kmj.off'))) {
    const t = fs.readFileSync(path.join(OFFDIR, f), 'utf8');
    for (const m of t.matchAll(/\^bk#([a-z]+\d+)([^\^\n]{0,20})/g)) bookTitle.set(m[1], m[2].trim());
    for (const m of t.matchAll(/\^ck#([a-z]+\d+)([^\^\n]{0,30})/g)) {
      if (!blockTitle.has(m[1])) blockTitle.set(m[1], m[2].trim());
    }
  }
  return { bookTitle, blockTitle };
};

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const main = () => {
  const { bookTitle, blockTitle } = readTitles();

  const st = zlib.gunzipSync(fs.readFileSync(path.join(GRAMMAR, 'sentences.tsv.gz'))).toString('utf8').split('\n').filter(Boolean);
  const sent = new Map();
  for (const l of st.slice(1)) {
    const c = l.split('\t');
    sent.set(c[0], { kind: c[4], ja: c[7], pali: c[6] });
  }

  const al = fs.readFileSync(ALIGN, 'utf8').split('\n').filter(Boolean).slice(1).map((l) => l.split('\t'));

  // (book, block, seg) → 句子（照 cs 行號排序）
  const groups = new Map();
  let skipped = 0;
  for (const c of al) {
    const [sid, book, block, seg, csLine, m] = c;
    if (m !== '1' || !book || !seg) continue;
    const s = sent.get(sid);
    if (!s || !s.ja || !s.ja.trim()) {
      skipped++;
      continue;
    }
    const key = `${book}|${block}|${seg}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push({ sid, line: Number(csLine), ja: s.ja.replace(/\s+/g, ' ').trim() });
  }
  console.log(`有日譯且對上的句子 ${[...groups.values()].reduce((a, b) => a + b.length, 0)}；沒日譯而略過 ${skipped}`);

  // 依書分檔
  const byBook = new Map();
  for (const [key, arr] of groups) {
    const [book, block, seg] = key.split('|');
    if (!byBook.has(book)) byBook.set(book, []);
    byBook.get(book).push({ block, seg, arr: arr.sort((a, b) => a.line - b.line) });
  }

  fs.mkdirSync(OUTDIR, { recursive: true });

  // 檔頭宣告：沒有 <樹> 就沒有目錄樹（accelon26 左欄會是空的）
  const head = [
    '<檔 n="komyoji"><集>光明寺日譯</集></檔>',
    '<隱><樹 s="*" t="區,書,塊">目錄</樹></隱>',
  ].join('\n');
  fs.writeFileSync(path.join(OUTDIR, '00.xml'), head + '\n');

  let files = 0;
  let lines = 0;
  let lastArea = '';
  for (const [book, segs] of [...byBook].sort((a, b) => canonOrder(a[0], b[0]))) {
    if (ONLY && book !== ONLY) continue;
    const area = Object.keys(AREA).find((a) => AREA[a].includes(book)) || 'kn';
    const out = [];
    // 每個部類只宣告一次 <區>，否則目錄樹會出現 33 個重複的「長部／長部／長部」
    if (area !== lastArea) {
      out.push(`<區 id="${area}" t="書.">${esc(areaLabel(area))}</區>`);
      lastArea = area;
    }
    out.push(`<書 id="${book}" t="塊.">${esc(bookTitle.get(book) || book)}</書>`);
    let curBlock = '';
    // 段要照 canon 順序：塊依它第一次出現的 cs 行號排，段依號碼排
    const byBlock = new Map();
    for (const s of segs) {
      const minLine = s.arr[0]?.line ?? 0;
      if (!byBlock.has(s.block)) byBlock.set(s.block, { min: minLine, items: [] });
      const b = byBlock.get(s.block);
      b.min = Math.min(b.min, minLine);
      b.items.push(s);
    }
    for (const [block, b] of [...byBlock].sort((x, y) => x[1].min - y[1].min)) {
      if (block !== curBlock) {
        out.push(`<塊 id="${block}">${esc(blockTitle.get(block) || block)}</塊>`);
        curBlock = block;
      }
      for (const s of b.items.sort((x, y) => segNum(x.seg) - segNum(y.seg))) {
        out.push(`<段 n="${s.seg}"/>`);
        for (const r of s.arr) {
          out.push(r.ja);
          lines++;
        }
      }
    }
    const file = path.join(OUTDIR, book + '.xml');
    fs.writeFileSync(file, out.join('\n') + '\n');
    files++;
  }
  console.log(`寫出 ${files} 檔、${lines} 行 → ${OUTDIR}`);
};

const segNum = (s) => Number(String(s).split('.')[1] ?? s) || 0;
const areaLabel = (a) => ({ dn: '【長部】', mn: '【中部】', sn: '【相應部】', an: '【增支部】', kn: '【小部】' }[a] || a);

/** 書的 canon 順序（和 pack.ts 一致；<區> 只宣告在每部類的第一本） */
const CANON_RANK = ['dn', 'mn', 'sn', 'an', 'kn', 'kp', 'dhp', 'ud', 'iti', 'snp', 'thag', 'thig', 'ja', 'cp', 'bv', 'pv', 'vv', 'mil', 'cnd', 'ne', 'ps'];
const canonOrder = (a, b) => {
  const ak = a.replace(/\d+$/, '');
  const bk = b.replace(/\d+$/, '');
  const ai = CANON_RANK.indexOf(ak);
  const bi = CANON_RANK.indexOf(bk);
  if (ai !== bi) return (ai < 0 ? 99 : ai) - (bi < 0 ? 99 : bi);
  return (Number(a.match(/\d+$/)?.[0] ?? 0) || 0) - (Number(b.match(/\d+$/)?.[0] ?? 0) || 0);
};

main();
