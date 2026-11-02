/**
 * 把 kmj（光明寺）的每個句子對到 cs（VRI／CST4）的 塊／段。
 *
 * 為什麼：komyoji.adb 要和 sz 的 cs.adb 用同一套地址（塊.段:句），才能跨庫跳轉。
 * cs 的 塊＝CST chunk（d1、m22、s5、a6…），段＝CST pn。
 *
 * 做法：
 *   1. 兩邊都只留字母數字、轉小寫；cs 每本書的正文連成一大串，記住每列起點。
 *   2. 一章＝一個經（sutta），用該章**最長的一句**當錨點，在候選書裡找定位，
 *      再從錨點往前（lastIndexOf）與往後（indexOf）逐句對，避免重複句亂跳。
 *   3. 位置回推是哪一列 → 段；句由呼叫端按 kmj 的順序另行編號。
 *
 * 用法：
 *   node src/align-cs.mjs [--grammar out/grammar] [--cs D:/2026/sz/data/cs] [--out out/align.tsv]
 *
 * 產出 out/align.tsv：sent_id  book  block  seg  cs_line  matched(1 錨點後/2 錨點前/0 沒對上)
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
const CSDIR = arg('cs', 'D:/2026/sz/data/cs');
const OUT = path.resolve(arg('out', 'out/align.tsv'));

/** 只留字母數字、小寫 */
const norm = (s) => s.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
/** 去掉段號前綴（43.／102-109.）、文末 (1-7.)、校勘方括號 […] */
const clean = (s) =>
  s
    .replace(/^\s*\d+(?:\s*[-–]\s*\d+)?\s*\.\s*/, '')
    .replace(/[（(]\s*\d+(?:\s*-\s*\d+)?\s*[)）]\s*$/, '')
    .replace(/\[[^\]]*\]/g, ' ')
    .trim();

const loadBook = (book) => {
  const file = path.join(CSDIR, book + '.xml');
  if (!fs.existsSync(file)) return null;
  const xml = fs.readFileSync(file, 'utf8');
  const lines = [];
  let block = null;
  let seg = null;
  let idx = 0;
  for (const raw of xml.split('\n')) {
    const bm = raw.match(/<塊 id="([^"]+)"[^>]*>/);
    if (bm) block = bm[1];
    const sm = raw.match(/<段 n="([^"]+)"\/>/);
    if (sm) seg = sm[1];
    const plain = raw.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim();
    if (!plain) continue;
    idx++;
    lines.push({ block, seg, line: idx, text: plain, n: norm(plain) });
  }
  const starts = [];
  let total = 0;
  for (const l of lines) {
    starts.push(total);
    total += l.n.length;
  }
  return { book, text: lines.map((l) => l.n).join(''), starts, lines };
};

const lineAt = (bk, off) => {
  let lo = 0;
  let hi = bk.starts.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (bk.starts[mid] <= off) lo = mid;
    else hi = mid - 1;
  }
  return lo;
};

/** 分冊 → 同一部類的所有 cs 書（章不一定照分冊落在同一冊，靠錨點決定） */
const NIKAYA = {
  dn: ['dn1', 'dn2', 'dn3'],
  mn: ['mn1', 'mn2', 'mn3'],
  sn: ['sn1', 'sn2', 'sn3', 'sn4', 'sn5'],
  an: ['an1', 'an2', 'an3', 'an4', 'an5', 'an6', 'an7', 'an8', 'an9', 'an10', 'an11'],
  kn: ['kp', 'dhp', 'ud', 'iti', 'snp', 'thag', 'thig', 'ja1', 'ja2', 'cp', 'bv', 'pv', 'vv', 'mil', 'cnd', 'ne', 'ps'],
};

const groupOf = (folder) => {
  if (folder.startsWith('dn')) return 'dn';
  if (folder.startsWith('mn')) return 'mn';
  if (folder.startsWith('sn')) return 'sn';
  if (folder.startsWith('an')) return 'an';
  return 'kn';
};

const isJunk = (pali) => !pali || !/\p{Script=Latin}{4,}/u.test(pali);

const main = () => {
  const books = new Map();
  for (const list of Object.values(NIKAYA)) for (const b of list) if (!books.has(b)) books.set(b, loadBook(b));
  const avail = [...books].filter(([, v]) => v).map(([k]) => k);
  for (const [b, v] of books) if (!v) console.warn(`缺 cs 書 ${b}`);

  const st = zlib.gunzipSync(fs.readFileSync(path.join(GRAMMAR, 'sentences.tsv.gz'))).toString('utf8').split('\n').filter(Boolean);
  const rows = st.slice(1).map((l) => l.split('\t'));

  const byChapter = new Map();
  for (const c of rows) {
    const key = `${c[1]}/${c[2]}`;
    if (!byChapter.has(key)) byChapter.set(key, []);
    byChapter.get(key).push(c);
  }

  const cursor = new Map(avail.map((b) => [b, 0]));
  const out = ['sent_id\tbook\tblock\tseg\tcs_line\tmatched'];
  let total = 0;
  let matched = 0;
  let segCount = 0;
  const missing = [];
  const perBook = new Map();

  for (const [key, list] of [...byChapter].sort()) {
    const folder = key.split('/')[0];
    const cands = NIKAYA[groupOf(folder)].map((b) => books.get(b)).filter(Boolean);
    const items = list.map((c) => ({ c, t: isJunk(c[6]) ? '' : norm(clean(c[6])) }));

    // 整章正規化文字接成一串，用 200 字長探針定位（重複句很多，短 key 會亂跳）
    let C = '';
    const offs = [];
    for (const it of items) {
      offs.push(C.length);
      C += it.t;
    }
    let seeded = null;
    if (C.length >= 200) {
      const probes = [0.5, 0.25, 0.75, 0.1, 0.9].map((f) =>
        Math.max(0, Math.min(C.length - 200, Math.floor(C.length * f) - 100))
      );
      for (const p of probes) {
        const probe = C.slice(p, p + 200);
        let best = null;
        for (const bk of cands) {
          const at = bk.text.indexOf(probe);
          if (at >= 0) {
            const dist = Math.abs(at - (cursor.get(bk.book) || 0));
            if (!best || dist < best.dist) best = { bk, at, dist };
          }
        }
        if (best) {
          seeded = { bk: best.bk, startPos: best.at - p };
          break;
        }
      }
    }

    let cur = seeded ? Math.max(0, seeded.startPos) : -1;
    for (const it of items) {
      const c = it.c;
      if (!it.t || it.t.length < 8) {
        out.push([c[0], '', '', '', '', 0].join('\t'));
        continue;
      }
      total++;
      const k40 = it.t.slice(0, 40);
      let found = null;
      for (const bk of seeded ? [seeded.bk] : cands) {
        const from = seeded
          ? Math.max(0, cur - 200)
          : Math.max(0, (cursor.get(bk.book) || 0) - 300);
        const at = bk.text.indexOf(k40, from);
        if (at >= 0) {
          found = { bk, at };
          break;
        }
      }
      if (!found) {
        out.push([c[0], '', '', '', '', 0].join('\t'));
        missing.push([c[0], key, c[4], it.c[6].slice(0, 60)]);
        continue;
      }
      matched++;
      cur = found.at + it.t.length;
      cursor.set(found.bk.book, Math.max(cursor.get(found.bk.book) || 0, found.at));
      const li = lineAt(found.bk, found.at);
      const line = found.bk.lines[li];
      out.push([c[0], found.bk.book, line.block || '', line.seg || '', line.line, 1].join('\t'));
      if (line.seg) segCount++;
      const s = perBook.get(found.bk.book) || { hit: 0, seg: new Set() };
      s.hit++;
      if (line.seg) s.seg.add(line.block + '.' + line.seg);
      perBook.set(found.bk.book, s);
    }
  }

  fs.writeFileSync(OUT, out.join('\n') + '\n');
  console.log(`句子 ${total}，對上 ${matched}（${(100 * matched / Math.max(1, total)).toFixed(1)}%），有段號 ${segCount}`);
  console.log('書\t句\t段數');
  for (const [b, s] of [...perBook].sort()) console.log(`${b}\t${s.hit}\t${s.seg.size}`);
  if (missing.length) {
    console.log(`\n沒對上 ${missing.length} 句，例：`);
    for (const m of missing.slice(0, 8)) console.log(`  ${m[0]} [${m[2]}] ${m[3]}`);
    fs.writeFileSync(OUT + '.missing.tsv', missing.map((m) => m.join('\t')).join('\n') + '\n');
  }
};

main();
