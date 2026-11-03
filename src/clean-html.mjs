/**
 * 把網站的 Excel 匯出頁去標籤，只留「表格文字與結構」。
 *
 *   node src/clean-html.mjs [--dir data/html] [--out out/html-clean]
 *
 * 每一列 <tr> 變成一行 TSV（cell 之間是 Tab），空白列跳過；
 * ruby 的 <rt> 若有序音會保留成「漢字(かな)」。目的是留一份小很多的
 * 工作底稿；真正的原始 html 在 data/html（逐檔 gz）與 github release 的 7z 裡。
 */

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const argv = process.argv.slice(2);
const arg = (n, d) => {
  const i = argv.indexOf('--' + n);
  return i < 0 ? d : argv[i + 1];
};
const DIR = path.resolve(arg('dir', 'data/html'));
const OUT = path.resolve(arg('out', 'out/html-clean'));

const ENT = { nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", ndash: '–', mdash: '—', hellip: '…' };
const decodeEnt = (s) =>
  s.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (m, g) => {
    if (g[0] === '#') {
      const cp = g[1] === 'x' || g[1] === 'X' ? parseInt(g.slice(2), 16) : parseInt(g.slice(1), 10);
      return Number.isFinite(cp) ? String.fromCodePoint(cp) : m;
    }
    return Object.prototype.hasOwnProperty.call(ENT, g) ? ENT[g] : m;
  });

/** 保留 <ruby>漢<rt>かな</rt></ruby> → 漢(かな)，其餘去標籤 */
const cellText = (html) => {
  let s = html.replace(/<ruby[^>]*>([\s\S]*?)<\/ruby>/gi, (m, inner) => {
    const rt = (inner.match(/<rt[^>]*>([\s\S]*?)<\/rt>/i) || [])[1] || '';
    const base = inner.replace(/<rt[^>]*>[\s\S]*?<\/rt>/gi, '').replace(/<[^>]+>/g, '');
    const r = decodeEnt(rt).replace(/\s+/g, '');
    return r ? `${decodeEnt(base)}(${r})` : decodeEnt(base);
  });
  s = s.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ');
  s = s.replace(/<[^>]+>/g, '');
  s = decodeEnt(s).replace(/[\u3000\u00a0]/g, ' ').replace(/\s+/g, ' ').trim();
  return s;
};

let files = 0;
let rowsTotal = 0;
let rawBytes = 0;
let outBytes = 0;
fs.mkdirSync(OUT, { recursive: true });

for (const folder of fs.readdirSync(DIR, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name)) {
  const dst = path.join(OUT, folder);
  fs.mkdirSync(dst, { recursive: true });
  for (const f of fs.readdirSync(path.join(DIR, folder)).filter((x) => x.endsWith('.html.gz'))) {
    const src = path.join(DIR, folder, f);
    rawBytes += fs.statSync(src).size;
    const html = zlib.gunzipSync(fs.readFileSync(src)).toString('utf8');
    const lines = [];
    for (const m of html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
      const cells = [];
      for (const c of m[1].matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)) {
        const span = Number((c[0].match(/colspan\s*=\s*["']?(\d+)/i) || [])[1] || 1);
        const t = cellText(c[1]);
        if (!t) continue;
        cells.push(t);
        for (let k = 1; k < span; k++) cells.push('');
      }
      if (cells.length) {
        lines.push(cells.join('\t'));
        rowsTotal++;
      }
    }
    const buf = Buffer.from(lines.join('\n') + '\n', 'utf8');
    const gz = zlib.gzipSync(buf, { level: 9 });
    fs.writeFileSync(path.join(dst, f.replace(/\.html\.gz$/, '.txt.gz')), gz);
    outBytes += gz.length;
    files++;
  }
}

console.log(`章 ${files}，列 ${rowsTotal}`);
console.log(`來源 gz ${(rawBytes / 1048576).toFixed(1)} MB → 去標籤 ${(outBytes / 1048576).toFixed(1)} MB → ${OUT}`);
