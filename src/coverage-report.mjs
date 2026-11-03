/**
 * 光明寺逐詞文法對 cs 的覆蓋率（四部尼柯耶逐書／逐段）。
 *
 *   node src/coverage-report.mjs [--cs D:/2026/sz/data/cs] [--align out/align.tsv]
 *
 * 用途：判斷「這一段是人工標注、還是只能計算推定」。閱讀器要標示來源時就查這張表。
 */

import fs from 'node:fs';
import path from 'node:path';

const argv = process.argv.slice(2);
const arg = (n, d) => {
  const i = argv.indexOf('--' + n);
  return i < 0 ? d : argv[i + 1];
};
const CSDIR = arg('cs', 'D:/2026/sz/data/cs');
const ALIGN = path.resolve(arg('align', 'out/align.tsv'));

const BOOKS = {
  dn: ['dn1', 'dn2', 'dn3'],
  mn: ['mn1', 'mn2', 'mn3'],
  sn: ['sn1', 'sn2', 'sn3', 'sn4', 'sn5'],
  an: ['an1', 'an2', 'an3', 'an4', 'an5', 'an6', 'an7', 'an8', 'an9', 'an10', 'an11'],
};

const csSegs = new Map();
for (const list of Object.values(BOOKS)) {
  for (const b of list) {
    const f = path.join(CSDIR, b + '.xml');
    if (!fs.existsSync(f)) continue;
    const set = new Set();
    let block = null;
    let seg = null;
    for (const raw of fs.readFileSync(f, 'utf8').split('\n')) {
      const bm = raw.match(/<塊 id="([^"]+)"[^>]*>/);
      if (bm) block = bm[1];
      const sm = raw.match(/<段 n="([^"]+)"\/>/);
      if (sm) seg = sm[1];
      if (seg && block && raw.replace(/<[^>]+>/g, '').trim()) set.add(block + '.' + seg);
    }
    csSegs.set(b, set);
  }
}

const kmj = new Map();
for (const l of fs.readFileSync(ALIGN, 'utf8').split('\n').slice(1).filter(Boolean)) {
  const c = l.split('\t');
  if (c[5] !== '1' || !c[3]) continue;
  if (!kmj.has(c[1])) kmj.set(c[1], new Set());
  kmj.get(c[1]).add(c[2] + '.' + c[3]);
}

let tot = 0;
let cov = 0;
console.log('book\t段\t有人工\t覆蓋率');
for (const [b, set] of csSegs) {
  const k = kmj.get(b) || new Set();
  let c = 0;
  for (const s of set) if (k.has(s)) c++;
  tot += set.size;
  cov += c;
  console.log(`${b}\t${set.size}\t${c}\t${((100 * c) / set.size).toFixed(1)}%`);
}
console.log(`合計\t${tot}\t${cov}\t${((100 * cov) / tot).toFixed(1)}%`);
