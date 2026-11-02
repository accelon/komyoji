/**
 * 匯出 sz 要的「詞形 → 品詞分佈」（stoplist 用）。
 *
 * 依 `D:\2026\sz\out\komyoji-request.md`（2026-11-02）：
 *   out/grammar/pos-distribution.tsv.gz   word / pos / count（pos 只有 8 個枚舉）
 *   out/grammar/pos-map.tsv               label / canonical / count（67 種原標籤對照）
 *   out/grammar/coverage.tsv              folder / tokens / books / complete
 *
 * 用法：node src/export-pos.mjs [--grammar out/grammar] [--align out/align.tsv]
 *
 * 注意 `word` 的定義：用 tokens 的 `form` 去掉標點與空白，**保留大小寫與變音符號**。
 * （`form_clean` 在 tokens 裡是「去標點＋小寫＋去變音符號」的比對鍵，拿來做詞形統計會失真。）
 */

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const argv = process.argv.slice(2);
const arg = (n, d) => {
  const i = argv.indexOf('--' + n);
  return i < 0 ? d : argv[i + 1];
};
const G = path.resolve(arg('grammar', 'out/grammar'));
const ALIGN = path.resolve(arg('align', 'out/align.tsv'));

/** 原標籤 → 8 個 canonical。規則寫在這裡，輸出時仍逐列列出實際出現的標籤。 */
const CANON = new Set(['n', 'v', 'adj', 'ptcp', 'pron', 'ind', 'num', 'other']);
const special = {
  名形: 'adj',
  形名: 'adj',
  '名→形': 'adj',
  '形／名': 'adj',
};
const mapPos = (raw) => {
  const s = String(raw || '').trim().replace(/[？?]+$/, '');
  if (!s || s === '‐') return 'other';
  if (special[s]) return special[s];
  if (/分/.test(s)) return 'ptcp'; // 過分／現分／未分／名過分…
  if (s.startsWith('名')) return 'n';
  if (s.startsWith('形')) return 'adj';
  if (s.startsWith('動')) return 'v';
  if (s.startsWith('代')) return 'pron';
  if (s.startsWith('不変')) return 'ind';
  if (s.startsWith('数')) return 'num';
  return 'other';
};

/** 詞形：去掉標點/空白，保留大小寫與變音符號 */
const wordOf = (form) => String(form || '').replace(/[^\p{L}\p{N}\u0300-\u036f]/gu, '');

const readGz = (f) => zlib.gunzipSync(fs.readFileSync(f)).toString('utf8').split('\n').filter(Boolean);

const main = () => {
  // sent_id → 書（給 coverage 用；沒有對到 cs 的也留空）
  const sentBook = new Map();
  if (fs.existsSync(ALIGN)) {
    for (const l of fs.readFileSync(ALIGN, 'utf8').split('\n').slice(1).filter(Boolean)) {
      const c = l.split('\t');
      sentBook.set(c[0], c[1] || '');
    }
  }

  const tk = readGz(path.join(G, 'tokens.tsv.gz'));
  const H = tk[0].split('\t');
  const iForm = H.indexOf('form');
  const iPos = H.indexOf('pos');
  const iSent = H.indexOf('sent_id');

  const dist = new Map(); // word|pos → count
  const labelCount = new Map(); // 原標籤 → count
  const folderTok = new Map(); // folder → tokens
  const folderBook = new Map(); // folder → Set(book)
  let total = 0;

  for (const l of tk.slice(1)) {
    const c = l.split('\t');
    const word = wordOf(c[iForm]);
    if (!word) continue;
    const pos = mapPos(c[iPos]);
    const k = word + '\t' + pos;
    dist.set(k, (dist.get(k) || 0) + 1);
    labelCount.set(c[iPos], (labelCount.get(c[iPos] || '') || 0) + 1);
    total++;

    const sid = c[iSent];
    // 分冊資料夾（dnskv、mnup、snmv…）→ 部類（dn／mn／sn／an／kn）
    const folderRaw = sid.split('/')[0];
    const folder = folderRaw.startsWith('dn')
      ? 'dn'
      : folderRaw.startsWith('mn')
        ? 'mn'
        : folderRaw.startsWith('sn')
          ? 'sn'
          : folderRaw === 'an'
            ? 'an'
            : 'kn';
    folderTok.set(folder, (folderTok.get(folder) || 0) + 1);
    const book = sentBook.get(sid);
    if (book) {
      if (!folderBook.has(folder)) folderBook.set(folder, new Set());
      folderBook.get(folder).add(book);
    }
  }

  // ① pos-distribution
  const rows = [...dist].map(([k, n]) => {
    const [w, p] = k.split('\t');
    return { w, p, n };
  });
  rows.sort((a, b) => b.n - a.n);
  const out = ['word\tpos\tcount'];
  for (const r of rows) out.push(`${r.w}\t${r.p}\t${r.n}`);
  fs.writeFileSync(path.join(G, 'pos-distribution.tsv.gz'), zlib.gzipSync(out.join('\n') + '\n', { level: 9 }));

  // ② pos-map
  const pm = ['label\tcanonical\tcount'];
  [...labelCount]
    .sort((a, b) => b[1] - a[1])
    .forEach(([label, n]) => pm.push(`${label || '(空)'}\t${mapPos(label)}\t${n}`));
  fs.writeFileSync(path.join(G, 'pos-map.tsv'), pm.join('\n') + '\n');

  // ③ coverage
  const AREA_BOOKS = {
    an: ['an1', 'an2', 'an3', 'an4', 'an5', 'an6', 'an7', 'an8', 'an9', 'an10', 'an11'],
    dn: ['dn1', 'dn2', 'dn3'],
    mn: ['mn1', 'mn2', 'mn3'],
    sn: ['sn1', 'sn2', 'sn3', 'sn4', 'sn5'],
  };
  const order = ['dn', 'mn', 'sn', 'an', 'kn'];
  const cov = ['folder\ttokens\tbooks\tcomplete'];
  for (const f of order) {
    const books = [...(folderBook.get(f) || [])].sort();
    const area = AREA_BOOKS[f];
    const complete = area ? area.every((b) => books.includes(b)) : false;
    const list = area ? (complete ? `${area[0]}..${area[area.length - 1]}` : books.join(',')) : books.join(',');
    cov.push(`${f}\t${folderTok.get(f) || 0}\t${list || '—'}\t${complete ? 'yes' : 'partial'}`);
  }
  fs.writeFileSync(path.join(G, 'coverage.tsv'), cov.join('\n') + '\n');

  // 驗收
  const sumDist = rows.reduce((a, b) => a + b.n, 0);
  const sumMap = [...labelCount.values()].reduce((a, b) => a + b, 0);
  const badPos = rows.filter((r) => !CANON.has(r.p));
  const badMap = [...labelCount.keys()].filter((k) => !CANON.has(mapPos(k)));
  console.log(`詞列 ${tk.length - 1}；有效詞形 ${total}`);
  console.log(`pos-distribution 列 ${rows.length}，count 總和 ${sumDist}`);
  console.log(`pos-map 標籤 ${labelCount.size} 種，count 總和 ${sumMap}`);
  console.log(`非 8 枚舉的 pos：${badPos.length}；非枚舉的 canonical：${badMap.length}`);
  console.log(`coverage：${cov.length - 1} 個分冊`);
  if (sumDist !== total || sumMap !== total || badPos.length || badMap.length) {
    console.error('驗收失敗');
    process.exit(1);
  }
  console.log('驗收通過');
};

main();
