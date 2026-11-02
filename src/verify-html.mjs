/**
 * 驗證 data/html 的抓取結果
 *   node src/verify-html.mjs [--dir data/html]
 *
 * 檢查：manifest 與檔案對得上、每檔可解壓、UTF-8 無亂碼（U+FFFD）、
 *       頁錨點數量、分冊統計、失敗章節。
 */

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const argv = process.argv.slice(2);
const i = argv.indexOf('--dir');
const DIR = path.resolve(i >= 0 ? argv[i + 1] : 'data/html');

const man = path.join(DIR, 'manifest.tsv');
if (!fs.existsSync(man)) {
  console.error('找不到 ' + man);
  process.exit(2);
}
const rows = fs
  .readFileSync(man, 'utf8')
  .split('\n')
  .filter(Boolean)
  .slice(1)
  .map((l) => {
    const [rel, url, status, chars, raw, gz, sha, anchors, ...title] = l.split('\t');
    return { rel, url, status, chars: +chars, raw: +raw, gz: +gz, sha, anchors: +anchors, title: title.join('\t') };
  });

let missing = 0;
let badStatus = 0;
let fffd = 0;
let rawTotal = 0;
let gzTotal = 0;
let anchorTotal = 0;
const byFolder = new Map();
const biggest = [];

for (const r of rows) {
  if (!/^(ok|cached)$/.test(r.status)) badStatus++;
  const file = path.join(DIR, r.rel.replace(/\.html\.gz$/, '.html.gz'));
  if (!fs.existsSync(path.join(DIR, r.rel))) {
    missing++;
    continue;
  }
  const buf = zlib.gunzipSync(fs.readFileSync(path.join(DIR, r.rel)));
  const text = buf.toString('utf8');
  fffd += (text.match(/\uFFFD/g) || []).length;
  rawTotal += buf.length;
  gzTotal += fs.statSync(path.join(DIR, r.rel)).size;
  anchorTotal += r.anchors;
  const folder = r.rel.split('/')[0];
  const f = byFolder.get(folder) || { n: 0, raw: 0, gz: 0, anchors: 0 };
  f.n++;
  f.raw += buf.length;
  f.gz += fs.statSync(path.join(DIR, r.rel)).size;
  f.anchors += r.anchors;
  byFolder.set(folder, f);
  biggest.push({ rel: r.rel, mb: buf.length / 1048576 });
}

biggest.sort((a, b) => b.mb - a.mb);

console.log(`manifest 章節: ${rows.length}`);
console.log(`缺檔: ${missing}    狀態異常: ${badStatus}    無法解碼字元 U+FFFD: ${fffd}`);
console.log(`原始 ${(rawTotal / 1048576).toFixed(1)} MB → gzip ${(gzTotal / 1048576).toFixed(1)} MB（${(100 * gzTotal / rawTotal).toFixed(1)}%）`);
console.log(`頁錨點合計: ${anchorTotal}`);
console.log('\n分冊:');
for (const [name, f] of [...byFolder].sort((a, b) => b[1].n - a[1].n)) {
  console.log(`  ${name.padEnd(8)} ${String(f.n).padStart(4)} 章  raw ${(f.raw / 1048576).toFixed(1).padStart(6)} MB  gz ${(f.gz / 1048576).toFixed(1).padStart(5)} MB  錨點 ${f.anchors}`);
}
console.log('\n最大的 5 檔:');
for (const b of biggest.slice(0, 5)) console.log(`  ${b.rel} ${b.mb.toFixed(2)} MB`);

if (missing || badStatus || fffd) {
  console.log('\n有問題，請看上面數字');
  process.exit(1);
}
console.log('\nOK');
