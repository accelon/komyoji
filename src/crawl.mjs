/**
 * 光明寺教蔵（https://komyojikyozo.web.fc2.com/）日譯大藏經 html 抓取器
 *
 * 用途：把 menu.html 列出的每一章 html 抓回來，Shift_JIS → UTF-8，
 *       以 gzip 壓縮存檔（內容是 Excel 匯出的 sheet001.htm，含逐詞文法表）。
 *
 * 用法（Node 20+，無外部相依）：
 *   node src/crawl.mjs --out data/html [--concurrency 4] [--limit 20] [--force]
 *
 * 產出：
 *   <out>/<folder>/<name>.html.gz    每章一個檔（UTF-8，gzip -9）
 *   <out>/manifest.tsv               每檔一列：rel / url / status / chars / raw / gz / sha256 / anchors / title
 *   <out>/pages.tsv                  每章 → 頁錨點（dn01c05p02 這種）對照
 *   <out>/menu.html                  menu.html（UTF-8，gzip）
 *
 * 每章先抓 <name>.files/sheet001.htm（Excel 匯出的正文與逐詞文法表），
 * 404 才退回外框 <name>.htm。/ 續跑會跳過已存在的 .gz；manifest 保留上次的實際網址。
 */

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import { setTimeout as sleep } from 'node:timers/promises';

const BASE = process.env.KOMYOJI_BASE || 'https://komyojikyozo.web.fc2.com/';

const argv = process.argv.slice(2);
const arg = (name, dflt) => {
  const i = argv.indexOf('--' + name);
  if (i < 0) return dflt;
  const v = argv[i + 1];
  return v && !v.startsWith('--') ? v : true;
};
const OUT = path.resolve(String(arg('out', 'data/html')));
const CONC = Number(arg('concurrency', 4));
const LIMIT = Number(arg('limit', 0));
const FORCE = Boolean(arg('force', false));
const UA = 'komyoji-crawler/1.0 (+https://github.com/accelon/komyoji)';

const decoder = (() => {
  for (const label of ['windows-31j', 'shift_jis']) {
    try {
      new TextDecoder(label);
      return new TextDecoder(label);
    } catch {}
  }
  return null;
})();

if (!decoder) {
  console.error('此 Node 沒有 shift_jis 解碼器（需要 full-icu）');
  process.exit(2);
}

const decodeSjis = (buf) => {
  const s = decoder.decode(buf);
  const bad = (s.match(/\uFFFD/g) || []).length;
  return { text: s, bad };
};

const fetchRetry = async (url, tries = 4) => {
  let lastErr;
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': UA, Accept: '*/*' },
        redirect: 'follow',
        signal: AbortSignal.timeout(90_000),
      });
      if (res.status === 404) return { status: 404, buf: Buffer.alloc(0) };
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const buf = Buffer.from(await res.arrayBuffer());
      return { status: res.status, buf };
    } catch (e) {
      lastErr = e;
      await sleep(1000 * Math.pow(2, i)); // 1s,2s,4s,8s
    }
  }
  throw lastErr;
};

const fixMeta = (html) =>
  html
    .replace(/charset\s*=\s*["']?shift[_-]jis["']?/gi, 'charset=utf-8')
    .replace(/charset\s*=\s*["']?x-sjis["']?/gi, 'charset=utf-8');

const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');
const gz = (buf) => zlib.gzipSync(buf, { level: 9 });

const writeGz = (file, text) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const buf = Buffer.from(text, 'utf8');
  fs.writeFileSync(file + '.tmp', gz(buf));
  fs.renameSync(file + '.tmp', file);
  return buf.length;
};

const unescape = (s) =>
  s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)));

const main = async () => {
  fs.mkdirSync(OUT, { recursive: true });

  // ① menu
  const menuFile = path.join(OUT, 'menu.html');
  let menu;
  if (fs.existsSync(menuFile) && !FORCE) {
    menu = zlib.gunzipSync(fs.readFileSync(menuFile)).toString('utf8');
    console.log('menu.html 由快取讀取');
  } else {
    const { buf } = await fetchRetry(BASE + 'menu.html');
    const { text, bad } = decodeSjis(buf);
    console.log(`menu.html ${buf.length} bytes，解碼失敗字元=${bad}`);
    const utf8 = fixMeta(text);
    fs.writeFileSync(menuFile + '.tmp', gz(Buffer.from(utf8, 'utf8')));
    fs.renameSync(menuFile + '.tmp', menuFile);
    menu = utf8;
  }

  const links = [];
  menu.replace(/<A href=([a-z]+\/[a-z]+\d+\/[\da-z]+\.htm)[^>]*>([^<]+)/gi, (m, href, title) => {
    links.push({ href, title: unescape(title.trim()) });
  });
  const seen = new Set();
  const chapters = links.filter((l) => {
    const k = l.href.toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  console.log(`menu 章節連結 ${links.length}，去重後 ${chapters.length}`);
  if (!chapters.length) throw new Error('menu 解析不到章節連結');

  const list = LIMIT > 0 ? chapters.slice(0, LIMIT) : chapters;

  // 續跑：沿用上一次的 manifest（記錄實際抓的網址、頁錨點）
  const prev = new Map();
  const prevFile = path.join(OUT, 'manifest.tsv');
  if (fs.existsSync(prevFile)) {
    for (const line of fs.readFileSync(prevFile, 'utf8').split('\n').slice(1)) {
      const c = line.split('\t');
      if (c.length >= 9) prev.set(c[0], { url: c[1], anchors: Number(c[7]) || 0, title: c[8] });
    }
  }

  const manifest = [];
  const pages = [];
  let done = 0;
  let failed = 0;
  let totalRaw = 0;
  let totalGz = 0;

  const writeManifest = () => {
    const lines = ['rel\turl\tstatus\tchars\traw\tgz\tsha256\tanchors\ttitle'];
    for (const r of manifest) {
      lines.push(
        [r.rel, r.url, r.status, r.chars, r.raw, r.gz, r.sha256, r.anchors, r.title.replace(/\t/g, ' ')].join('\t')
      );
    }
    fs.writeFileSync(path.join(OUT, 'manifest.tsv'), lines.join('\n') + '\n');
    const plines = ['chapter\tanchors'];
    for (const p of pages) plines.push([p.chapter, p.anchors.join(',')].join('\t'));
    fs.writeFileSync(path.join(OUT, 'pages.tsv'), plines.join('\n') + '\n');
  };

  const worker = async (i) => {
    const { href, title } = list[i];
    // dnskv/dn01/dn01c05.htm
    const m = href.match(/^([a-z]+)\/([a-z]+\d+)\/([\da-z]+)\.htm$/i);
    const folder = m ? m[1] : href.split('/')[0];
    const name = m ? m[3] : path.basename(href, '.htm');
    const relBase = path.posix.join(folder, name);
    const file = path.join(OUT, folder, name + '.html.gz');
    const row = { rel: relBase + '.html.gz', url: BASE + href, status: 'ok', chars: 0, raw: 0, gz: 0, sha256: '', anchors: 0, title };

    try {
      if (!FORCE && fs.existsSync(file)) {
        const raw = zlib.gunzipSync(fs.readFileSync(file)).toString('utf8');
        const old = prev.get(row.rel);
        row.chars = raw.length;
        row.raw = Buffer.byteLength(raw, 'utf8');
        row.gz = fs.statSync(file).size;
        row.sha256 = sha256(Buffer.from(raw, 'utf8'));
        const a = [...raw.matchAll(/<a\s+name=["']?([a-z]+\d+c\d+p\d+)["']?/gi)].map((x) => x[1]);
        row.anchors = a.length;
        if (old?.url) row.url = old.url;
        if (old?.title) row.title = old.title;
        if (a.length) pages.push({ chapter: name, anchors: a });
        row.status = 'cached';
        manifest.push(row);
        totalRaw += row.raw;
        totalGz += row.gz;
        return;
      }

      // Excel 匯出的網頁：外框 X.htm，正文在 X.files/sheet001.htm。
      // 先抓 sheet；沒有才退回外框本身。
      let html = '';
      let used = '';
      const sheetUrl = BASE + href.replace(/\.htm$/i, '') + '.files/sheet001.htm';
      const sheet = await fetchRetry(sheetUrl);
      if (sheet.status === 200 && sheet.buf.length) {
        const { text, bad } = decodeSjis(sheet.buf);
        html = fixMeta(text);
        used = sheetUrl;
        if (bad) console.warn(`  ! ${href} 有 ${bad} 個無法解碼字元`);
      } else {
        const { status, buf } = await fetchRetry(BASE + href);
        if (status === 404 || !buf.length) throw new Error('404 ' + href);
        const { text, bad } = decodeSjis(buf);
        html = fixMeta(text);
        used = BASE + href;
        if (bad) console.warn(`  ! ${href} 有 ${bad} 個無法解碼字元`);
      }
      row.url = used;
      const chars = writeGz(file, html);
      row.chars = html.length;
      row.raw = chars;
      row.gz = fs.statSync(file).size;
      row.sha256 = sha256(Buffer.from(html, 'utf8'));
      const a = [...html.matchAll(/<a\s+name=["']?([a-z]+\d+c\d+p\d+)["']?/gi)].map((x) => x[1]);
      row.anchors = a.length;
      if (a.length) pages.push({ chapter: name, anchors: a });
      totalRaw += row.raw;
      totalGz += row.gz;
      manifest.push(row);
    } catch (e) {
      failed++;
      row.status = 'ERR:' + String(e.message || e).slice(0, 60);
      manifest.push(row);
      console.warn(`  x ${href}: ${row.status}`);
    } finally {
      done++;
      if (done % 50 === 0 || done === list.length) {
        writeManifest();
        console.log(`[${done}/${list.length}] raw=${(totalRaw / 1048576).toFixed(1)}MB gz=${(totalGz / 1048576).toFixed(1)}MB fail=${failed}`);
      }
    }
  };

  // 固定併發
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(CONC, list.length) }, async () => {
      while (true) {
        const i = next++;
        if (i >= list.length) break;
        await worker(i);
        await sleep(120);
      }
    })
  );

  writeManifest();
  console.log(`完成：${list.length} 章，失敗 ${failed}，raw=${(totalRaw / 1048576).toFixed(1)}MB gz=${(totalGz / 1048576).toFixed(1)}MB`);
  if (failed) console.log('有失敗的章節，manifest.tsv 的 status 有記錄；重跑會補（已存在的會跳過）');
};

main().catch((e) => {
  console.error('FATAL', e);
  process.exit(1);
});
